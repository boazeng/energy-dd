import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  ReferenceLine, Tooltip, XAxis, YAxis,
} from 'recharts'
import TactIcon from '../components/TactIcon.jsx'
import { api } from '../api/client.js'

// רוחב הגרפים בפיקסלים. קבוע בכוונה — ResponsiveContainer לא מודד נכון בהדפסה.
// חייב להיות ≤ רוחב אזור התוכן של המסמך בשני המצבים:
//   מסך:   --bp-w (600px, content-box) ב-business-plan.css
//   הדפסה: A4 בניכוי שוליים = 210mm − 40mm = 170mm ≈ 642px
// ערך גדול מזה גולש, וב-RTL הגלישה נחתכת בקצה השמאלי.
const DOC_W = 600
const CHART_H = 260

// ירוק=חיובי, חלודה=שלילי — תואם ל-fin-pos/fin-neg בשאר האתר. הסימן מקודד גם
// ע"י כיוון העמודה מקו האפס וגם בתווית ערך, ולכן הצבע אינו נושא המידע היחיד.
const POS = '#2F8F5B'
const NEG = '#D64A2E'
const INK = '#1F3A5F'
const GRID = '#E7E2D6'
const AXIS = '#706A60'

const nf = new Intl.NumberFormat('he-IL')

// אותו מפתח שבו לשונית תזרים בניינים שומרת את פריטי התקורה
const OVERHEAD_KEY = 'energy-overhead'

function readOverheadItems() {
  try {
    const raw = JSON.parse(localStorage.getItem(OVERHEAD_KEY) || '[]')
    return Array.isArray(raw) ? raw.filter((x) => x && (x.annual_amount || 0) > 0) : []
  } catch {
    return []
  }
}

function readOverheadTotal() {
  return readOverheadItems().reduce((s, x) => s + (x.annual_amount || 0), 0)
}

function ils(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  const abs = nf.format(Math.round(Math.abs(v)))
  return v < 0 ? `(₪${abs})` : `₪${abs}`
}

// שלילי בסוגריים ולא במינוס: בהקשר RTL הדפדפן מעביר את סימן המינוס לצד השני
// של המספר ("400K-"), מה שנקרא כערך חיובי. סוגריים חד-משמעיים וגם תואמים
// לקונבנציית הדוחות הכספיים במסמך.
function fmtK(v) {
  if (!v) return '0'
  const a = Math.abs(v)
  const mag = a >= 1e6 ? `${(a / 1e6).toFixed(1)}M`
    : a >= 1e3 ? `${Math.round(a / 1e3)}K`
    : String(Math.round(a))
  return v < 0 ? `(${mag})` : mag
}

// מספרים לטבלה צפופה — ללא סימן ₪ (מצוין בכותרת), שלילי בסוגריים
function num(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  const abs = nf.format(Math.round(Math.abs(v)))
  return v < 0 ? `(${abs})` : abs
}

function Money({ v, plain }) {
  if (v === null || v === undefined) return <span className="bp-muted">—</span>
  const cls = plain ? '' : v < 0 ? 'bp-neg' : v > 0 ? 'bp-pos' : ''
  return <span className={cls}>{ils(v)}</span>
}

// ─── רינדור גוף הפרק: פסקאות ותבליטים ────────────────────────────────────────

function Body({ text }) {
  if (!text?.trim()) return null
  const blocks = []
  let list = null
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('- ')) {
      if (!list) { list = []; blocks.push({ type: 'ul', items: list }) }
      list.push(line.slice(2))
    } else if (!line) {
      list = null
    } else {
      list = null
      blocks.push({ type: 'p', text: line })
    }
  }
  return (
    <>
      {blocks.map((b, i) =>
        b.type === 'ul'
          ? <ul key={i} className="bp-ul">{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>
          : <p key={i} className="bp-p">{b.text}</p>
      )}
    </>
  )
}

// ─── כותרת ממוספרת לטבלה / תרשים ─────────────────────────────────────────────

function Caption({ kind, n, children }) {
  return (
    <div className="bp-caption">
      {kind === 'table' ? 'טבלה' : 'תרשים'} מס' {n}: {children}
    </div>
  )
}

// כמה טבלאות ותרשימים כל בלוק מייצר בפועל — הבסיס למספור. חייב להיות פונקציה
// טהורה של הנתונים ולא מונה שמתקדם תוך כדי רינדור: React מרנדר קומפוננטה יותר
// מפעם אחת (StrictMode), ומונה כזה היה מכפיל את המספרים.
function blockCounts(key, d) {
  const hasForecast = d.forecast.length > 0
  const fin = d.today.financials || {}
  const hasFin = (which) => (fin.years?.length && fin[which]?.length) ? 1 : 0
  switch (key) {
    case '': return [0, 0]
    case 'summary_financials': return [hasForecast ? 1 : 0, 0]
    case 'cumulative_cashflow': return hasForecast ? [1, 1] : [0, 0]
    case 'forecast_table': return [hasForecast ? 1 : 0, 0]
    case 'profit_chart': return [0, hasForecast ? 1 : 0]
    case 'buildings_table': return [d.overview.buildings.length ? 1 : 0, 0]
    case 'agreements_table': return [d.agreements.length ? 1 : 0, 0]
    case 'site_economics': return [d.sites.length ? 1 : 0, 0]
    case 'historical_pnl': return [hasFin('pnl'), 0]
    case 'historical_balance': return [hasFin('balance'), 0]
    case 'supplier_credits': return [d.today.supplier_credits.length ? 1 : 0, 0]
    case 'dscr_table': return [d.forecast.some((r) => r.loan_repayment > 0) ? 1 : 0, 0]
    default: return [1, 0]
  }
}

// ─── בלוקי נתונים חיים ───────────────────────────────────────────────────────

function SummaryFinancials({ d, t, c }) {
  const f = d.forecast
  if (!f.length) return null
  const rows = [
    ['מספר מטענים פעילים (סוף שנה)', f.map((r) => nf.format(r.total_chargers)), true],
    ['מטענים שנוספו במהלך השנה', f.map((r) => nf.format(r.chargers_added)), true],
    ['הכנסות', f.map((r) => ils(r.income))],
    ['הוצאות תפעול, תחזוקה ותקורה', f.map((r) => ils(-(r.opex + r.maintenance + r.overhead)))],
    ['השקעה בתשתית (CAPEX)', f.map((r) => ils(-r.capex))],
    ['תזרים לפני החזר הלוואה', f.map((r) => ils(r.profit_before_loan)), false, true],
    ['החזר הלוואה', f.map((r) => ils(-r.loan_repayment))],
    ['תזרים נטו', f.map((r) => ils(r.net_profit)), false, true],
  ]
  return (
    <figure className="bp-figure">
      <Caption kind="table" n={t}>תמצית נתונים פיננסיים</Caption>
      <table className="bp-table">
        <thead>
          <tr><th className="bp-rowlabel">סעיף</th>{f.map((r) => <th key={r.year}>{r.year}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(([label, vals, plain, total], i) => (
            <tr key={i} className={total ? 'bp-total' : ''}>
              <td className="bp-rowlabel">{label}</td>
              {vals.map((v, j) => <td key={j} className={plain ? '' : 'bp-num'}>{v}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

function CumulativeCashflow({ d, t, c }) {
  const data = d.forecast.map((r) => ({ year: String(r.year), 'יתרה מצטברת': r.cumulative }))
  if (!data.length) return null
  return (
    <>
      <figure className="bp-figure">
        <Caption kind="table" n={t}>יתרת מזומנים מצטברת</Caption>
        <table className="bp-table">
          <thead>
            <tr><th className="bp-rowlabel">סעיף</th>{d.forecast.map((r) => <th key={r.year}>{r.year}</th>)}</tr>
          </thead>
          <tbody>
            <tr><td className="bp-rowlabel">תזרים נטו בשנה</td>
              {d.forecast.map((r) => <td key={r.year} className="bp-num"><Money v={r.net_profit} /></td>)}</tr>
            <tr className="bp-total"><td className="bp-rowlabel">יתרה מצטברת לסוף השנה</td>
              {d.forecast.map((r) => <td key={r.year} className="bp-num"><Money v={r.cumulative} /></td>)}</tr>
          </tbody>
        </table>
        <p className="bp-note">
          היתרה המצטברת פותחת ביתרת המזומנים בפועל
          {d.today.opening_balance_date ? ` נכון ל-${d.today.opening_balance_date}` : ''} ({ils(d.today.opening_balance)}).
        </p>
      </figure>

      <figure className="bp-figure">
        <Caption kind="chart" n={c}>התפתחות יתרת המזומנים המצטברת</Caption>
        {/* ציר ה-Y מימין — כיוון הקריאה של המסמך; left פנוי כדי שתווית השנה
            הראשונה לא תיחתך בקצה */}
        <LineChart width={DOC_W} height={CHART_H} data={data} margin={{ top: 12, right: 8, left: 30, bottom: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="year" tick={{ fill: AXIS, fontSize: 12 }} axisLine={{ stroke: GRID }} tickLine={false} />
          <YAxis orientation="right" tickFormatter={fmtK} tick={{ fill: AXIS, fontSize: 11 }} width={70}
            axisLine={false} tickLine={false} />
          <ReferenceLine y={0} stroke={AXIS} />
          <Tooltip formatter={(v) => ils(v)} />
          <Line type="monotone" dataKey="יתרה מצטברת" stroke={INK} strokeWidth={2}
            dot={{ fill: INK, r: 4 }} isAnimationActive={false} />
        </LineChart>
      </figure>
    </>
  )
}

// מקורות ושימושים — הטבלה שהבנק בוחן ראשונה. הפער בין עלות הרכישה לאשראי
// המבוקש מוצג במפורש כהון עצמי, ולא נבלע.
function AcquisitionTerms({ d, t }) {
  const a = d.acquisition
  const uses = [['רכישת הפעילות', a.cost]]
  const sources = [['אשראי בנקאי מבוקש', a.credit_requested]]
  if (a.equity_required > 0) sources.push(['הון עצמי', a.equity_required])
  if (a.surplus_working_capital > 0) uses.push(['הון חוזר לפעילות', a.surplus_working_capital])
  const totalUses = uses.reduce((s, [, v]) => s + v, 0)
  const totalSources = sources.reduce((s, [, v]) => s + v, 0)

  return (
    <figure className="bp-figure">
      <Caption kind="table" n={t}>מקורות ושימושים</Caption>
      <div className="bp-su">
        <table className="bp-table">
          <thead><tr><th className="bp-rowlabel">שימושים</th><th>סכום</th></tr></thead>
          <tbody>
            {uses.map(([l, v]) => (
              <tr key={l}><td className="bp-rowlabel">{l}</td><td className="bp-num">{ils(v)}</td></tr>
            ))}
          </tbody>
          <tfoot><tr className="bp-total"><td className="bp-rowlabel">סה&quot;כ</td>
            <td className="bp-num">{ils(totalUses)}</td></tr></tfoot>
        </table>
        <table className="bp-table">
          <thead><tr><th className="bp-rowlabel">מקורות</th><th>סכום</th></tr></thead>
          <tbody>
            {sources.map(([l, v]) => (
              <tr key={l}><td className="bp-rowlabel">{l}</td><td className="bp-num">{ils(v)}</td></tr>
            ))}
          </tbody>
          <tfoot><tr className="bp-total"><td className="bp-rowlabel">סה&quot;כ</td>
            <td className="bp-num">{ils(totalSources)}</td></tr></tfoot>
        </table>
      </div>

      {/* אין מדד "עלות למטען מותקן": התמורה בעסקה היא הזכות החוזית להתקין
          בכל החניות שבהסכם, ולא העמדות שכבר מותקנות. */}
      <Kpis style={{ marginTop: 14 }} items={[
        { label: 'עלות לאתר', value: ils(a.cost_per_building), note: `${nf.format(a.buildings)} אתרים` },
        { label: 'עלות לחניה בפוטנציאל', value: ils(a.cost_per_potential_spot), note: `${nf.format(a.potential_spots)} חניות בהסכמים` },
        {
          label: 'מכפיל על ההכנסה השנתית',
          value: a.multiple_on_run_rate === null ? '—' : `×${a.multiple_on_run_rate}`,
          note: 'לפי ההכנסה מהעמדות הקיימות',
        },
      ]} />
    </figure>
  )
}

function BuildingsTable({ d, t, c }) {
  const rows = d.overview.buildings
  if (!rows.length) return <p className="bp-empty">אין נתוני אתרים.</p>
  return (
    <figure className="bp-figure">
      <Caption kind="table" n={t}>פריסת האתרים</Caption>
      <table className="bp-table">
        <thead>
          <tr>
            <th className="bp-rowlabel">אתר</th>
            <th>עיר</th>
            <th>מטענים מותקנים</th>
            <th>חניות פוטנציאליות</th>
            <th>שיעור מימוש</th>
            <th>תקופת ההסכם</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.name}>
              <td className="bp-rowlabel">
                {b.name}
                {b.members.length > 1 && <span className="bp-sub"> ({b.members.length} בניינים)</span>}
              </td>
              <td>{b.city || '—'}</td>
              <td className="bp-num">{nf.format(b.current_chargers)}</td>
              <td className="bp-num">{nf.format(b.potential_spots)}</td>
              <td className="bp-num">
                {b.potential_spots ? `${Math.round(b.current_chargers / b.potential_spots * 100)}%` : '—'}
              </td>
              <td className="bp-num">
                {b.contract_start_year && b.contract_duration_years
                  ? `${b.contract_start_year}–${b.contract_start_year + b.contract_duration_years}`
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bp-total">
            <td className="bp-rowlabel" colSpan={2}>סה&quot;כ</td>
            <td className="bp-num">{nf.format(d.overview.current_chargers)}</td>
            <td className="bp-num">{nf.format(d.overview.potential_spots)}</td>
            <td className="bp-num">{d.overview.penetration_pct}%</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </figure>
  )
}

function AgreementsProfile({ d, t, c }) {
  const withTerm = d.overview.buildings.filter((b) => b.contract_start_year && b.contract_duration_years)
  const thisYear = new Date().getFullYear()
  return (
    <figure className="bp-figure">
      <Caption kind="table" n={t}>פרופיל ההתקשרויות</Caption>
      <Kpis items={[
        { label: 'הסכמים חתומים', value: nf.format(d.overview.agreements_count) },
        { label: 'אתרים פעילים', value: nf.format(d.overview.buildings_count) },
        { label: 'ערים', value: nf.format(d.overview.cities.length) },
        { label: 'תקופת הסכם ממוצעת', value: `${d.overview.avg_contract_years} שנים` },
      ]} />
      {withTerm.length > 0 && (
        <table className="bp-table" style={{ marginTop: 14 }}>
          <thead>
            <tr>
              <th className="bp-rowlabel">אתר</th><th>תחילת ההסכם</th>
              <th>משך</th><th>שנים שנותרו</th>
            </tr>
          </thead>
          <tbody>
            {withTerm.map((b) => {
              const left = b.contract_start_year + b.contract_duration_years - thisYear
              return (
                <tr key={b.name}>
                  <td className="bp-rowlabel">{b.name}</td>
                  <td className="bp-num">{b.contract_start_year}</td>
                  <td className="bp-num">{b.contract_duration_years} שנים</td>
                  <td className="bp-num">{left > 0 ? left : <span className="bp-neg">הסתיים</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </figure>
  )
}

// מרשם ההסכמים — התוכן מוצג כפי שנותח מהחוזים, בלי עיבוד
function AgreementsTable({ d, t }) {
  const rows = d.agreements
  if (!rows.length) return <p className="bp-empty">אין הסכמים במערכת.</p>
  return (
    <figure className="bp-figure">
      <Caption kind="table" n={t}>מרשם ההסכמים החתומים</Caption>
      <table className="bp-table bp-table-tight">
        <thead>
          <tr>
            <th className="bp-rowlabel">אתר</th>
            <th>עמדות</th>
            <th>תקופה</th>
            <th>דמי ניהול</th>
            <th>מנגנון תמחור</th>
            <th>עלות עמדה לדייר</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a, i) => (
            <tr key={i}>
              <td className="bp-rowlabel">
                {a.building || '—'}
                {a.linked_buildings.length > 1 && (
                  <span className="bp-sub"> ({a.linked_buildings.length} אתרים)</span>
                )}
              </td>
              <td>{a.units || '—'}</td>
              <td>{a.term || '—'}</td>
              <td>{a.payment || '—'}</td>
              <td>{a.pricing_model || '—'}</td>
              <td>{a.charger_cost || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

// הכלכלה פר-אתר: ההכנסה היום מול ההכנסה אילו כל החניות שבהסכם היו מאוישות.
// הפער בין שתי העמודות האחרונות הוא פוטנציאל ההשבחה שנרכש.
function SiteEconomicsTable({ d, t }) {
  const rows = d.sites
  if (!rows.length) return <p className="bp-empty">אין נתוני אתרים.</p>
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0)
  return (
    <figure className="bp-figure">
      <Caption kind="table" n={t}>תנאים כלכליים ופוטנציאל לפי אתר</Caption>
      <table className="bp-table bp-table-tight">
        <thead>
          <tr>
            <th className="bp-rowlabel">אתר</th>
            <th>דמי<br />ניהול</th>
            <th>אג'/<br />קוט&quot;ש</th>
            <th>קוט&quot;ש<br />לחודש</th>
            <th>דמי<br />מנוי</th>
            <th>הכנסה חודשית<br />לעמדה</th>
            <th>עמדות<br />היום</th>
            <th>הכנסה<br />שנתית היום</th>
            <th>חניות<br />בהסכם</th>
            <th>פוטנציאל<br />שנתי מלא</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td className="bp-rowlabel">{r.name}</td>
              <td className="bp-num">{num(r.mgmt_fee)}</td>
              <td className="bp-num">{r.elec_rate_agorot || '—'}</td>
              <td className="bp-num">{num(r.avg_kwh)}</td>
              <td className="bp-num">{r.subscription ? num(r.subscription) : '—'}</td>
              <td className="bp-num bp-strong">{num(r.monthly_income_per_charger)}</td>
              <td className="bp-num">{nf.format(r.current_chargers)}</td>
              <td className="bp-num">{num(r.current_annual_income)}</td>
              <td className="bp-num">{nf.format(r.potential_spots)}</td>
              <td className="bp-num bp-pos">{num(r.potential_annual_income)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bp-total">
            <td className="bp-rowlabel" colSpan={6}>סה&quot;כ</td>
            <td className="bp-num">{nf.format(sum('current_chargers'))}</td>
            <td className="bp-num">{num(sum('current_annual_income'))}</td>
            <td className="bp-num">{nf.format(sum('potential_spots'))}</td>
            <td className="bp-num bp-pos">{num(sum('potential_annual_income'))}</td>
          </tr>
        </tfoot>
      </table>
      <p className="bp-note">
        הסכומים בש&quot;ח ואינם כוללים מע&quot;מ. &quot;פוטנציאל שנתי מלא&quot; מבטא את ההכנסה
        אילו כל החניות שבהסכם היו מאוישות — אינו יעד התחזית, אלא תקרת ההשבחה החוזית.
      </p>
    </figure>
  )
}

// שורות מדדים: בוחרים מספר עמודות שמתחלק במספר הפריטים, כדי שלא תיווצר שורה
// אחרונה חלקית עם חור.
function Kpis({ items, style }) {
  const n = items.length
  const cols = n % 4 === 0 ? 4 : n % 3 === 0 ? 3 : n < 4 ? n : 4
  return (
    <div className="bp-kpis" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, ...style }}>
      {items.map((it, i) => (
        <div className="bp-kpi" key={i}>
          <div className="bp-kpi-val">{it.value}</div>
          <div className="bp-kpi-lbl">{it.label}</div>
          {it.note && <div className="bp-kpi-note">{it.note}</div>}
        </div>
      ))}
    </div>
  )
}

function TodayKpis({ d, t, c }) {
  const o = d.overview
  const now = d.today
  return (
    <figure className="bp-figure">
      <Caption kind="table" n={t}>תמונת מצב נוכחית</Caption>
      <Kpis items={[
        { label: 'מטענים מותקנים', value: nf.format(o.current_chargers), note: `ב-${o.buildings_count} אתרים` },
        { label: 'חניות פוטנציאליות', value: nf.format(o.potential_spots), note: `מומשו ${o.penetration_pct}%` },
        { label: 'הכנסה שנתית נוכחית', value: ils(now.run_rate_annual_income), note: 'ללא הנחת גידול' },
        { label: 'הכנסה חודשית למטען', value: ils(now.monthly_income_per_charger), note: 'ממוצע בפועל' },
        { label: 'עלות תפעול שנתית', value: ils(now.run_rate_annual_opex), note: 'מטענים קיימים' },
        { label: 'יתרת מזומנים', value: ils(now.opening_balance), note: now.opening_balance_date || '—' },
      ]} />
    </figure>
  )
}

// דוחות היסטוריים מגיעים כ-JSON חופשי (years / pnl / balance) — רינדור גנרי
// שאינו תלוי בשמות שורות ספציפיים.
function FinancialsTable({ d, t, which, title }) {
  const fin = d.today.financials || {}
  const years = fin.years || []
  const rows = fin[which] || []
  if (!years.length || !rows.length) {
    return <p className="bp-empty">אין נתונים כספיים היסטוריים זמינים ({title}).</p>
  }
  return (
    <figure className="bp-figure">
      <Caption kind="table" n={t}>{title}</Caption>
      <table className="bp-table">
        <thead>
          <tr>
            <th className="bp-rowlabel">סעיף</th>
            {years.map((y) => (
              <th key={y.key}>{y.label}{y.basis && <span className="bp-sub"> {y.basis}</span>}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={r.total ? 'bp-total' : ''}>
              <td className="bp-rowlabel">{r.label}</td>
              {years.map((y) => {
                const v = r.values?.[y.key]
                if (v === null || v === undefined || v === '') return <td key={y.key} className="bp-num bp-muted">—</td>
                return <td key={y.key} className="bp-num"><Money v={r.expense ? -Math.abs(v) : v} plain={!r.signed && !r.expense} /></td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

function SupplierCredits({ d, t, c }) {
  const rows = d.today.supplier_credits
  if (!rows.length) return <p className="bp-empty">אין יתרות זכות לספקים.</p>
  return (
    <figure className="bp-figure">
      <Caption kind="table" n={t}>יתרות זכות לספקים</Caption>
      <table className="bp-table">
        <thead><tr><th className="bp-rowlabel">ספק</th><th>יתרה</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}><td className="bp-rowlabel">{r.name}</td><td className="bp-num">{ils(r.balance)}</td></tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bp-total"><td className="bp-rowlabel">סה&quot;כ</td>
            <td className="bp-num">{ils(d.today.supplier_credit_total)}</td></tr>
        </tfoot>
      </table>
    </figure>
  )
}

// כל פרמטר הבסיס מלשונית תזרים בניינים, מקובץ לפי עמודות פאנל ההגדרות שם.
function AssumptionsTable({ d, t, c }) {
  const items = readOverheadItems()
  const groups = []
  for (const a of d.assumptions) {
    const g = a.group || 'כללי'
    if (!groups.length || groups[groups.length - 1].name !== g) groups.push({ name: g, rows: [] })
    groups[groups.length - 1].rows.push(a)
  }
  return (
    <figure className="bp-figure">
      <Caption kind="table" n={t}>הנחות העבודה</Caption>
      <table className="bp-table">
        <thead><tr><th className="bp-rowlabel">פרמטר</th><th>ערך</th><th>הערה</th></tr></thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g.name}>
              <tr className="bp-group"><td className="bp-rowlabel" colSpan={3}>{g.name}</td></tr>
              {g.rows.map((a, i) => (
                <tr key={i}>
                  <td className="bp-rowlabel">{a.label}</td>
                  <td className="bp-num bp-strong">{a.value}</td>
                  <td className="bp-sub">{a.note}</td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>

      {items.length > 0 && (
        <>
          <div className="bp-caption" style={{ marginTop: 16 }}>פירוט הוצאות התקורה השנתיות</div>
          <table className="bp-table">
            <thead><tr><th className="bp-rowlabel">סעיף</th><th>עלות שנתית</th></tr></thead>
            <tbody>
              {items.map((x, i) => (
                <tr key={i}>
                  <td className="bp-rowlabel">{x.name || '—'}</td>
                  <td className="bp-num">{ils(x.annual_amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bp-total"><td className="bp-rowlabel">סה&quot;כ</td>
                <td className="bp-num">{ils(readOverheadTotal())}</td></tr>
            </tfoot>
          </table>
        </>
      )}
    </figure>
  )
}

function ForecastTable({ d, t, c }) {
  const f = d.forecast
  if (!f.length) return null
  const T = d.totals
  return (
    <figure className="bp-figure">
      <Caption kind="table" n={t}>תחזית שנתית מפורטת (בש&quot;ח)</Caption>
      <table className="bp-table bp-table-tight">
        <thead>
          <tr>
            <th className="bp-rowlabel">שנה</th>
            <th>מטענים<br />שנוספו</th>
            <th>סה&quot;כ<br />מטענים</th>
            <th>הכנסות</th>
            <th>השקעה<br />(CAPEX)</th>
            <th>תפעול, תחזוקה<br />ותקורה</th>
            <th>תזרים לפני<br />החזר</th>
            <th>החזר<br />הלוואה</th>
            <th>תזרים<br />נטו</th>
            <th>יתרה<br />מצטברת</th>
          </tr>
        </thead>
        <tbody>
          {f.map((r) => (
            <tr key={r.year}>
              <td className="bp-rowlabel">{r.year}</td>
              <td className="bp-num">{r.chargers_added || '—'}</td>
              <td className="bp-num">{nf.format(r.total_chargers)}</td>
              <td className="bp-num">{num(r.income)}</td>
              <td className="bp-num">{r.capex ? num(-r.capex) : '—'}</td>
              <td className="bp-num">{num(-(r.opex + r.maintenance + r.overhead))}</td>
              <td className={`bp-num ${r.profit_before_loan < 0 ? 'bp-neg' : 'bp-pos'}`}>{num(r.profit_before_loan)}</td>
              <td className="bp-num">{r.loan_repayment ? num(-r.loan_repayment) : '—'}</td>
              <td className={`bp-num ${r.net_profit < 0 ? 'bp-neg' : 'bp-pos'}`}>{num(r.net_profit)}</td>
              <td className={`bp-num ${r.cumulative < 0 ? 'bp-neg' : 'bp-pos'}`}>{num(r.cumulative)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bp-total">
            <td className="bp-rowlabel">סה&quot;כ</td>
            <td className="bp-num">{nf.format(T.chargers_added)}</td>
            <td className="bp-num">{nf.format(T.chargers_end)}</td>
            <td className="bp-num">{num(T.income)}</td>
            <td className="bp-num">{num(-T.capex)}</td>
            <td className="bp-num">{num(-(T.opex + T.maintenance + (T.overhead || 0)))}</td>
            <td className={`bp-num ${T.profit_before_loan < 0 ? 'bp-neg' : 'bp-pos'}`}>{num(T.profit_before_loan)}</td>
            <td className="bp-num">{num(-T.loan_repayment)}</td>
            <td className={`bp-num ${T.net_profit < 0 ? 'bp-neg' : 'bp-pos'}`}>{num(T.net_profit)}</td>
            <td className={`bp-num ${T.final_cumulative < 0 ? 'bp-neg' : 'bp-pos'}`}>{num(T.final_cumulative)}</td>
          </tr>
        </tfoot>
      </table>
      {d.by_contract && (
        <p className="bp-note">
          האופק נגזר מתקופת ההסכם בכל אתר בנפרד. אתר שתקופת הסכמו מסתיימת יוצא מהתחזית
          מאותה שנה ואילך — ולכן מספר העמדות הפעילות בשנים המאוחרות נמוך יותר. אין מדובר
          בנטישת לקוחות אלא בתום התקופה החוזית, שניתנת לחידוש.
        </p>
      )}
    </figure>
  )
}

function ProfitChart({ d, t, c }) {
  const data = d.forecast.map((r) => ({ year: String(r.year), profit: r.net_profit }))
  if (!data.length) return null
  return (
    <figure className="bp-figure">
      <Caption kind="chart" n={c}>תזרים נטו על פני השנים</Caption>
      <BarChart width={DOC_W} height={CHART_H} data={data} margin={{ top: 24, right: 8, left: 30, bottom: 4 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="year" tick={{ fill: AXIS, fontSize: 12 }} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis orientation="right" tickFormatter={fmtK} tick={{ fill: AXIS, fontSize: 11 }} width={70} axisLine={false} tickLine={false} />
        <ReferenceLine y={0} stroke={AXIS} />
        <Tooltip formatter={(v) => ils(v)} />
        {/* תווית ערך על כל עמודה — הסימן אינו נשען על הצבע בלבד */}
        <Bar dataKey="profit" radius={[4, 4, 0, 0]} isAnimationActive={false} maxBarSize={64}
          label={{ position: 'top', formatter: (v) => fmtK(v), fill: AXIS, fontSize: 11 }}>
          {data.map((p, i) => <Cell key={i} fill={p.profit < 0 ? NEG : POS} />)}
        </Bar>
      </BarChart>
    </figure>
  )
}

function DscrTable({ d, t, c }) {
  const rows = d.forecast.filter((r) => r.loan_repayment > 0)
  if (!rows.length) return <p className="bp-empty">אין החזרי הלוואה בתקופת התחזית.</p>
  const L = d.loan
  return (
    <figure className="bp-figure">
      <Caption kind="table" n={t}>יחסי כיסוי חוב</Caption>
      <Kpis style={{ marginBottom: 14 }} items={[
        { label: 'סכום ההלוואה', value: ils(L.amount), note: `${L.years} שנים` },
        { label: 'ריבית שנתית', value: `${L.annual_rate}%`, note: `פריים ${L.prime}% + ${L.margin}%` },
        { label: 'החזר חודשי', value: ils(L.monthly_payment), note: 'לוח שפיצר' },
        { label: 'סה"כ ריבית', value: ils(L.total_interest), note: 'לאורך חיי ההלוואה' },
      ]} />
      <table className="bp-table">
        <thead>
          <tr>
            <th className="bp-rowlabel">שנה</th><th>תזרים פנוי לשירות החוב</th>
            <th>החזר שנתי</th><th>יחס כיסוי (DSCR)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.year}>
              <td className="bp-rowlabel">{r.year}</td>
              <td className="bp-num"><Money v={r.profit_before_loan} /></td>
              <td className="bp-num">{ils(r.loan_repayment)}</td>
              <td className={`bp-num bp-strong ${r.dscr >= 1 ? 'bp-pos' : 'bp-neg'}`}>
                {r.dscr === null ? '—' : r.dscr.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

function SensitivityTable({ d, t, c }) {
  return (
    <figure className="bp-figure">
      <Caption kind="table" n={t}>רגישות התוצאות לקצב החדירה</Caption>
      <table className="bp-table">
        <thead>
          <tr>
            <th className="bp-rowlabel">תרחיש</th><th>שיעור חדירה שנתי</th>
            <th>תזרים מצטבר לתקופה</th><th>שפל תזרימי</th><th>יתרה בתום התקופה</th>
          </tr>
        </thead>
        <tbody>
          {d.sensitivity.map((s, i) => (
            <tr key={i} className={s.label === 'תרחיש הבסיס' ? 'bp-total' : ''}>
              <td className="bp-rowlabel">{s.label}</td>
              <td className="bp-num">{s.growth_rate_pct}%</td>
              <td className="bp-num"><Money v={s.total_profit} /></td>
              <td className="bp-num"><Money v={s.min_cumulative} /></td>
              <td className="bp-num"><Money v={s.final_cumulative} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

const BLOCKS = {
  acquisition_terms: AcquisitionTerms,
  agreements_table: AgreementsTable,
  site_economics: SiteEconomicsTable,
  summary_financials: SummaryFinancials,
  cumulative_cashflow: CumulativeCashflow,
  buildings_table: BuildingsTable,
  agreements_profile: AgreementsProfile,
  today_kpis: TodayKpis,
  historical_pnl: (p) => <FinancialsTable {...p} which="pnl" title="דוח רווח והפסד" />,
  historical_balance: (p) => <FinancialsTable {...p} which="balance" title="מאזן" />,
  supplier_credits: SupplierCredits,
  assumptions_table: AssumptionsTable,
  forecast_table: ForecastTable,
  profit_chart: ProfitChart,
  dscr_table: DscrTable,
  sensitivity_table: SensitivityTable,
}

// ─── עריכת פרק ───────────────────────────────────────────────────────────────

function SectionEditor({ section, onSaved }) {
  const [title, setTitle] = useState(section.title)
  const [body, setBody] = useState(section.body)
  const [saving, setSaving] = useState(false)
  const dirty = title !== section.title || body !== section.body

  async function save() {
    setSaving(true)
    try {
      await api.updateBusinessPlanSection(section.id, { title, body })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bp-editor no-print">
      <input className="bp-editor-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea
        className="bp-editor-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={Math.max(4, body.split('\n').length + 1)}
        placeholder="טקסט הפרק. שורה שמתחילה ב-&quot;- &quot; תוצג כתבליט."
      />
      <div className="bp-editor-actions">
        <button className="tact-btn tact-btn-primary" disabled={!dirty || saving} onClick={save}>
          {saving ? 'שומר…' : 'שמור'}
        </button>
        <button
          className="tact-btn"
          disabled={saving}
          onClick={async () => {
            setSaving(true)
            try {
              await api.updateBusinessPlanSection(section.id, { visible: !section.visible })
              onSaved()
            } finally { setSaving(false) }
          }}
        >
          {section.visible ? 'הסתר מהמסמך' : 'החזר למסמך'}
        </button>
        {dirty && <span className="bp-sub">יש שינויים שלא נשמרו</span>}
      </div>
    </div>
  )
}

// ─── שער ותוכן עניינים ───────────────────────────────────────────────────────

function Cover({ s, d }) {
  const dateLabel = s.doc_date
    ? new Date(s.doc_date).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
  return (
    <section className="bp-cover">
      <div className="bp-cover-rule" />
      <h1 className="bp-cover-title">{s.doc_title}</h1>
      <div className="bp-cover-company">{s.company_name}</div>
      {s.target_company && (
        <div className="bp-cover-purpose">מימון רכישת פעילות {s.target_company}</div>
      )}
      <div className="bp-cover-to">מוגש ל{s.submitted_to}</div>
      {d && (
        <div className="bp-cover-facts">
          <span>{nf.format(d.overview.buildings_count)} אתרים</span>
          <span>{nf.format(d.overview.current_chargers)} מטענים מותקנים</span>
          <span>אשראי מבוקש {ils(d.acquisition.credit_requested)}</span>
          <span>תחזית {d.horizon_years} שנים · {d.start_year}–{d.start_year + d.horizon_years - 1}</span>
        </div>
      )}
      <div className="bp-cover-foot">
        {s.prepared_by && <div>הוכן על ידי {s.prepared_by}</div>}
        <div>{dateLabel}</div>
        {(s.contact_name || s.contact_phone || s.contact_email) && (
          <div className="bp-cover-contact">
            {[s.contact_name, s.contact_phone, s.contact_email].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
    </section>
  )
}

function Toc({ numbered }) {
  return (
    <section className="bp-toc">
      <h2 className="bp-h1">תוכן עניינים</h2>
      <ol className="bp-toc-list">
        {numbered.map((s) => (
          <li key={s.id} className={`bp-toc-l${s.level}`}>
            <span className="bp-toc-num">{s.num}</span>
            <span className="bp-toc-title">{s.title}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

// ─── הדף ─────────────────────────────────────────────────────────────────────

// אופק התחזית מגיע מ-App.jsx — אותו מצב שמשמש את לשוניות תזרים ותזרים בניינים,
// כדי שהמסמך והאתר לעולם לא יראו טווח שונה.
export default function BusinessPlan({ agreementVersion, horizonMode = 'contract', onHorizonChange }) {
  const [plan, setPlan] = useState(null)
  const [data, setData] = useState(null)
  const [edit, setEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    try {
      const byContract = horizonMode === 'contract'
      const years = byContract ? undefined : parseInt(horizonMode)
      // התקורות נשמרות ב-localStorage של לשונית תזרים בניינים ולא ב-DB, ולכן
      // הבקאנד אינו רואה אותן. בלי להעביר אותן התחזית כאן הייתה מציגה רווח
      // גבוה יותר מאותה לשונית.
      const [p, d] = await Promise.all([
        api.getBusinessPlan(),
        api.getBusinessPlanData(years, readOverheadTotal(), byContract),
      ])
      setPlan(p)
      setData(d)
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // נטען מחדש כשמשתנה אופק התחזית או כשנערך הסכם דייר במקום אחר באתר
  useEffect(() => { load() }, [horizonMode, agreementVersion])

  // מספור פרקים (1, 1.1, …) ומספור רץ לטבלאות ולתרשימים. מחושב מראש ופעם אחת
  // מתוך הנתונים, ולא תוך כדי רינדור.
  const numbered = useMemo(() => {
    if (!plan || !data) return []
    let l1 = 0
    let l2 = 0
    let nextTable = 1
    let nextChart = 1
    return plan.sections.filter((s) => s.visible).map((s) => {
      let num
      if (s.level === 1) { l1 += 1; l2 = 0; num = String(l1) }
      else { l2 += 1; num = `${l1}.${l2}` }
      const [tables, charts] = blockCounts(s.data_block, data)
      const out = { ...s, num, t: nextTable, c: nextChart }
      nextTable += tables
      nextChart += charts
      return out
    })
  }, [plan, data])

  if (loading && !plan) return <p className="muted">טוען…</p>
  if (error) return <div className="app-error">שגיאה בטעינת התכנית: {error}</div>
  if (!plan || !data) return null

  return (
    <div className="bp-page">
      <div className="bp-toolbar no-print">
        <div className="bp-toolbar-group">
          <label className="bp-sub">אופק תחזית</label>
          <select
            value={horizonMode}
            onChange={(e) => onHorizonChange?.(e.target.value)}
            title="אותו אופק המשמש את לשוניות תזרים ותזרים בניינים"
          >
            <option value="contract">לפי תקופת ההסכם</option>
            {[5, 6, 7, 8, 9, 10].map((y) => <option key={y} value={String(y)}>{y} שנים</option>)}
          </select>
        </div>
        <button className={`tact-btn ${edit ? 'tact-btn-primary' : ''}`} onClick={() => setEdit(!edit)}>
          <TactIcon name="document" size={15} />
          <span style={{ marginInlineStart: 6 }}>{edit ? 'סיים עריכה' : 'ערוך טקסטים'}</span>
        </button>
        <span className="bp-toolbar-spacer" />
        <span className="bp-sub">
          הנתונים מתעדכנים אוטומטית מהאתר · עודכן {new Date(data.generated_at).toLocaleString('he-IL')}
        </span>
        <button className="tact-btn tact-btn-primary" onClick={() => window.print()}>
          <TactIcon name="reports" size={15} />
          <span style={{ marginInlineStart: 6 }}>ייצוא PDF</span>
        </button>
      </div>

      {edit && <PlanSettingsEditor settings={plan.settings} onSaved={load} />}

      <article className="bp-doc" dir="rtl">
        <Cover s={plan.settings} d={data} />
        <Toc numbered={numbered} />

        {numbered.map((s) => {
          const Block = BLOCKS[s.data_block]
          return (
            <section key={s.id} className={`bp-section bp-level-${s.level}`}>
              {s.level === 1
                ? <h2 className="bp-h1"><span className="bp-num">{s.num}</span>{s.title}</h2>
                : <h3 className="bp-h2"><span className="bp-num">{s.num}</span>{s.title}</h3>}
              <Body text={s.body} />
              {edit && <SectionEditor section={s} onSaved={load} />}
              {Block && <Block d={data} t={s.t} c={s.c} />}
            </section>
          )
        })}

        {/* פרקים מוסתרים — נגישים לעריכה בלבד, אינם חלק מהמסמך ואינם מודפסים */}
        {edit && plan.sections.some((s) => !s.visible) && (
          <section className="bp-hidden-list no-print">
            <h3 className="bp-h2">פרקים שהוסרו מהמסמך</h3>
            <p className="bp-sub">אינם מופיעים במסמך ואינם מודפסים. אפשר להחזירם.</p>
            {plan.sections.filter((s) => !s.visible).map((s) => (
              <div key={s.id} style={{ marginTop: 14 }}>
                <strong>{s.title}</strong>
                <SectionEditor section={s} onSaved={load} />
              </div>
            ))}
          </section>
        )}

        <footer className="bp-doc-foot">
          <p className="bp-sub">
            הנתונים הכמותיים בתכנית זו נגזרים ישירות ממערכת הנתונים של החברה נכון
            ל-{new Date(data.generated_at).toLocaleDateString('he-IL')}. כל הסכומים אינם כוללים מע&quot;מ.
          </p>
        </footer>
      </article>
    </div>
  )
}

// ─── עריכת פרטי המסמך ────────────────────────────────────────────────────────

const SETTINGS_FIELDS = [
  ['company_name', 'שם המגיש (מבקש האשראי)'],
  ['target_company', 'חברת המטרה (הנרכשת)'],
  ['doc_title', 'כותרת המסמך'],
  ['submitted_to', 'מוגש ל'],
  ['acquisition_cost', 'עלות הרכישה (₪)', 'number'],
  ['prepared_by', 'הוכן על ידי'],
  ['doc_date', 'תאריך המסמך (YYYY-MM-DD)'],
  ['contact_name', 'איש קשר'],
  ['contact_phone', 'טלפון'],
  ['contact_email', 'דוא"ל'],
]

function PlanSettingsEditor({ settings, onSaved }) {
  const [form, setForm] = useState(settings)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const { horizon_years, ...rest } = form
      rest.acquisition_cost = parseFloat(rest.acquisition_cost) || 0
      await api.updateBusinessPlanSettings(rest)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bp-settings no-print">
      <h3 className="bp-settings-title">פרטי המסמך</h3>
      <div className="bp-settings-grid">
        {SETTINGS_FIELDS.map(([key, label, type]) => (
          <label key={key} className="bp-settings-field">
            <span>{label}</span>
            <input
              type={type || 'text'}
              value={form[key] ?? ''}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <p className="bp-sub" style={{ marginBottom: 11 }}>
        האשראי המבוקש נלקח מסכום ההלוואה שבלשונית תזרים, כדי שלא יהיו שני מקורות
        לאותו מספר. ההפרש בינו לבין עלות הרכישה מוצג במסמך כהון עצמי.
      </p>
      <button className="tact-btn tact-btn-primary" onClick={save} disabled={saving}>
        {saving ? 'שומר…' : 'שמור פרטים'}
      </button>
    </div>
  )
}
