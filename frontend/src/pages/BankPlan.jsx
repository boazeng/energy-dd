/* ═══ תכנית עסקית ════════════════════════════════════════════════════════════
   שכפול נאמן של הקובץ "אנרגיה אורבנית - רכישת חברת מוביליטי.docx": אותו מלל,
   אותן תמונות, אותו גופן (David 14pt), אותה פריסה ואותו מספור טבלאות.

   זהו המסמך היחיד באתר — הלשונית הישנה שניהלה מסמך ערוך מקביל הוסרה, כדי שלא
   יהיו שתי גרסאות לאותה תכנית.

   ההבדל היחיד מהקובץ: כל מספר נשלף חי מ-GET /api/business-plan/data — אותו
   מקור אמת שממנו ניזונות שאר לשוניות האתר. שינוי שיעור הגידול, סכום ההלוואה,
   עלות הרכישה או מספר המטענים משתקף כאן מיד, בטבלאות ובמלל כאחד.

   המלל נשמר כאן ולא ב-DB בכוונה — הוא חייב להישאר זהה לקובץ שאושר; רק בלוקים
   שנערכו בפועל נשמרים ב-/api/bank-plan/texts.
   ═════════════════════════════════════════════════════════════════════════ */
import { Fragment, useEffect, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  ReferenceLine, Tooltip, XAxis, YAxis,
} from 'recharts'
import TactIcon from '../components/TactIcon.jsx'
import { api } from '../api/client.js'
import { BANK_PLAN, exportBusinessPlanWord } from './exportWord.js'

// גודל התרשימים בקובץ המקורי: wp:extent = 600×260px
const DOC_W = 600
const CHART_H = 260

const POS = '#2F8F5B'
const NEG = '#D64A2E'
const INK = '#1F3A5F'
const GRID = '#E7E2D6'
const AXIS = '#706A60'

const nf = new Intl.NumberFormat('he-IL')

// אותו מפתח שבו לשונית תזרים בניינים שומרת את פריטי התקורה
const OVERHEAD_KEY = 'energy-overhead'

function readOverheadTotal() {
  try {
    const raw = JSON.parse(localStorage.getItem(OVERHEAD_KEY) || '[]')
    return Array.isArray(raw) ? raw.reduce((s, x) => s + (x?.annual_amount || 0), 0) : 0
  } catch {
    return 0
  }
}

/* ─── עיצוב מספרים — זהה לזה שבלשונית "תכנית עסקית" ───────────────────────── */

function ils(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  const abs = nf.format(Math.round(Math.abs(v)))
  return v < 0 ? `(₪${abs})` : `₪${abs}`
}

function num(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  const abs = nf.format(Math.round(Math.abs(v)))
  return v < 0 ? `(${abs})` : abs
}

// שלילי בסוגריים ולא במינוס: ב-RTL הדפדפן מעביר את סימן המינוס לצד השני
// של המספר ("400K-"), מה שנקרא כערך חיובי.
function fmtK(v) {
  if (!v) return '0'
  const a = Math.abs(v)
  const mag = a >= 1e6 ? `${(a / 1e6).toFixed(1)}M`
    : a >= 1e3 ? `${Math.round(a / 1e3)}K`
    : String(Math.round(a))
  return v < 0 ? `(${mag})` : mag
}

function ratio(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  const s = Math.abs(v).toFixed(2)
  return v < 0 ? `(${s})` : s
}

// אותו יחס בתוך משפט: המילה "מינוס" אינה נודדת ב-RTL כמו הסימן
function ratioProse(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  const s = Math.abs(v).toFixed(2)
  return v < 0 ? `מינוס ${s}` : s
}

// ירוק לחיובי, אדום לשלילי. אפס נשאר בצבע הגוף — הוא אינו רווח ואינו הפסד.
function signCls(v) {
  if (v === null || v === undefined || Number.isNaN(v) || v === 0) return ''
  return v > 0 ? 'bkp-pos' : 'bkp-neg'
}

function Money({ v, plain }) {
  if (v === null || v === undefined) return <span className="bkp-muted">—</span>
  const cls = plain ? '' : v < 0 ? 'bkp-neg' : v > 0 ? 'bkp-pos' : ''
  return <span className={cls}>{ils(v)}</span>
}

/* ─── אבני בניין ─────────────────────────────────────────────────────────── */

function H1({ n, children }) {
  return <h2 className="bkp-h1"><span className="bkp-secnum">{n}</span>{children}</h2>
}

function H2({ n, plain, children }) {
  return (
    <h3 className={`bkp-h2${plain ? ' bkp-h2-plain' : ''}`}>
      <span className="bkp-secnum">{n}</span>{children}
    </h3>
  )
}

function Caption({ kind, n, children }) {
  return (
    <div className="bkp-caption">
      {kind === 'table' ? 'טבלה' : 'תרשים'} מס&apos; {n}: {children}
    </div>
  )
}

function Kpis({ items }) {
  return (
    <div className="bkp-kpis">
      {items.map((it, i) => (
        <div className="bkp-kpi" key={i}>
          <div className="bkp-kpi-val">{it.value}</div>
          <div className="bkp-kpi-lbl">{it.label}</div>
          {it.note && <div className="bkp-kpi-note">{it.note}</div>}
        </div>
      ))}
    </div>
  )
}

/* ─── טבלה 1 — תמצית התחזית הכספית ────────────────────────────────────────
   הטבלה היחידה בקובץ שעליה הוחל ב-Word סגנון "Grid Table 4 Accent 1". */
function SummaryCompact({ d }) {
  const f = d.forecast
  if (!f.length) return null
  const T = d.totals
  // הדגשה על שתי שורות התזרים בלבד — כך זה בקובץ שאושר. תוויות השורה נשארות
  // במשקל רגיל, גם הן כמו בקובץ.
  const rows = [
    ['הכנסות', f.map((r) => r.income), T.income],
    ['הוצאות תפעול, תחזוקה ותקורה', f.map((r) => -(r.opex + r.maintenance + r.overhead)),
      -(T.opex + T.maintenance + (T.overhead || 0))],
    ['השקעה בעמדות חדשות', f.map((r) => -r.capex), -T.capex],
    ...(T.one_time ? [['עלויות חד-פעמיות', f.map((r) => -r.one_time), -T.one_time]] : []),
    ['תזרים לפני החזר החוב', f.map((r) => r.profit_before_loan), T.profit_before_loan, true],
    ['החזר ההלוואה', f.map((r) => -r.loan_repayment), -T.loan_repayment],
    ['תזרים נטו', f.map((r) => r.net_profit), T.net_profit, true],
  ]
  return (
    <figure className="bkp-figure">
      <Caption kind="table" n={1}>תמצית התחזית הכספית (בש&quot;ח)</Caption>
      <table className="bkp-table-accent">
        <thead>
          <tr>
            <th className="bkp-rowlabel" />
            {f.map((r) => <th key={r.year}>{r.year}</th>)}
            <th>סה&quot;כ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, vals, total, strong], i) => (
            <tr key={i} className={strong ? 'bkp-total-row' : ''}>
              <td className="bkp-rowlabel">{label}</td>
              {vals.map((v, j) => <td key={j} className={signCls(v)}>{num(v)}</td>)}
              <td className={signCls(total)}>{num(total)}</td>
            </tr>
          ))}
          <tr>
            <td className="bkp-rowlabel">יתרת מזומנים מצטברת</td>
            {f.map((r) => (
              <td key={r.year} className={signCls(r.cumulative)}>{num(r.cumulative)}</td>
            ))}
            <td />
          </tr>
          {/* ספירת עמדות אינה סכום ולכן אינה נצבעת */}
          <tr>
            <td className="bkp-rowlabel">עמדות פעילות בסוף השנה</td>
            {f.map((r) => <td key={r.year}>{nf.format(r.total_chargers)}</td>)}
            <td />
          </tr>
        </tbody>
      </table>
      <p className="bkp-note">
        הסכומים מנוטרלי מע&quot;מ. הפירוט המלא, לרבות הנחות העבודה שמהן נגזרת התחזית,
        מופיע בפרק תחזית הגידול.
      </p>
    </figure>
  )
}

/* ─── טבלה 2 — פריסת האתרים ──────────────────────────────────────────────── */
function BuildingsTable({ d }) {
  const rows = d.overview.buildings
  return (
    <figure className="bkp-figure">
      <Caption kind="table" n={3}>פריסת האתרים של החברה הנרכשת</Caption>
      <table className="bkp-table">
        <thead>
          <tr>
            <th className="bkp-rowlabel">אתר</th>
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
              <td className="bkp-rowlabel">
                {b.name}
                {b.members.length > 1 && <span className="bkp-sub"> ({b.members.length} בניינים)</span>}
              </td>
              <td>{b.city || '—'}</td>
              <td className="bkp-num">{nf.format(b.current_chargers)}</td>
              <td className="bkp-num">{nf.format(b.potential_spots)}</td>
              <td className="bkp-num">
                {b.potential_spots ? `${Math.round(b.current_chargers / b.potential_spots * 100)}%` : '—'}
              </td>
              <td className="bkp-num">
                {b.contract_start_year && b.contract_duration_years
                  ? `${b.contract_start_year}–${b.contract_start_year + b.contract_duration_years}`
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bkp-total">
            <td className="bkp-rowlabel" colSpan={2}>סה&quot;כ</td>
            <td className="bkp-num">{nf.format(d.overview.current_chargers)}</td>
            <td className="bkp-num">{nf.format(d.overview.potential_spots)}</td>
            <td className="bkp-num">{d.overview.penetration_pct}%</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </figure>
  )
}

/* ─── טבלה 3 — פרופיל ההתקשרויות ─────────────────────────────────────────── */
function AgreementsProfile({ d }) {
  const withTerm = d.overview.buildings.filter((b) => b.contract_start_year && b.contract_duration_years)
  const thisYear = new Date().getFullYear()
  return (
    <figure className="bkp-figure">
      <Caption kind="table" n={4}>פרופיל ההתקשרויות</Caption>
      <div className="bkp-kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {[
          [nf.format(d.overview.agreements_count), 'הסכמים חתומים'],
          [nf.format(d.overview.buildings_count), 'אתרים פעילים'],
          [nf.format(d.overview.cities.length), 'ערים'],
          [`${d.overview.avg_contract_years} שנים`, 'תקופת הסכם ממוצעת'],
        ].map(([v, l]) => (
          <div className="bkp-kpi" key={l}>
            <div className="bkp-kpi-val">{v}</div>
            <div className="bkp-kpi-lbl">{l}</div>
          </div>
        ))}
      </div>
      {withTerm.length > 0 && (
        <table className="bkp-table" style={{ marginTop: '18pt' }}>
          <thead>
            <tr>
              <th className="bkp-rowlabel">אתר</th>
              <th>תחילת ההסכם</th>
              <th>משך</th>
              <th>שנים שנותרו</th>
            </tr>
          </thead>
          <tbody>
            {withTerm.map((b) => {
              const left = b.contract_start_year + b.contract_duration_years - thisYear
              return (
                <tr key={b.name}>
                  <td className="bkp-rowlabel">{b.name}</td>
                  <td className="bkp-num">{b.contract_start_year}</td>
                  <td className="bkp-num">{b.contract_duration_years} שנים</td>
                  <td className="bkp-num">{left > 0 ? left : <span className="bkp-neg">הסתיים</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </figure>
  )
}

/* ─── טבלה 4 — מכלול ההסכמים החתומים ─────────────────────────────────────── */
function AgreementsTable({ d }) {
  return (
    <figure className="bkp-figure">
      <Caption kind="table" n={5}>מכלול ההסכמים החתומים</Caption>
      <table className="bkp-table">
        <thead>
          <tr>
            <th className="bkp-rowlabel">אתר</th>
            <th>דמי ניהול</th>
            <th>מנגנון תמחור</th>
            <th>עלות עמדה לדייר</th>
          </tr>
        </thead>
        <tbody>
          {d.agreements.map((a, i) => (
            <tr key={i}>
              <td className="bkp-rowlabel">
                {a.building || '—'}
                {a.linked_buildings.length > 1 && (
                  <span className="bkp-sub"> ({a.linked_buildings.length} אתרים)</span>
                )}
              </td>
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

/* ─── טבלה 5 — תנאים כלכליים ופוטנציאל לפי אתר ───────────────────────────── */
function SiteEconomicsTable({ d }) {
  const rows = d.sites
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0)
  return (
    <figure className="bkp-figure">
      <Caption kind="table" n={6}>תנאים כלכליים ופוטנציאל לפי אתר</Caption>
      <table className="bkp-table bkp-table-tight">
        <thead>
          <tr>
            <th className="bkp-rowlabel">אתר</th>
            <th>דמי<br />ניהול</th>
            <th>אג&apos;/<br />קוט&quot;ש</th>
            <th>קוט&quot;ש<br />לחודש</th>
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
              <td className="bkp-rowlabel">{r.name}</td>
              <td className="bkp-num">{num(r.mgmt_fee)}</td>
              <td className="bkp-num">{r.elec_rate_agorot || '—'}</td>
              <td className="bkp-num">{num(r.avg_kwh)}</td>
              <td className="bkp-num bkp-strong">{num(r.monthly_income_per_charger)}</td>
              <td className="bkp-num">{nf.format(r.current_chargers)}</td>
              <td className="bkp-num">{num(r.current_annual_income)}</td>
              <td className="bkp-num">{nf.format(r.potential_spots)}</td>
              <td className="bkp-num">{num(r.potential_annual_income)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bkp-total">
            <td className="bkp-rowlabel" colSpan={5}>סה&quot;כ</td>
            <td className="bkp-num">{nf.format(sum('current_chargers'))}</td>
            <td className="bkp-num">{num(sum('current_annual_income'))}</td>
            <td className="bkp-num">{nf.format(sum('potential_spots'))}</td>
            <td className="bkp-num">{num(sum('potential_annual_income'))}</td>
          </tr>
        </tfoot>
      </table>
      <p className="bkp-note">
        הסכומים בש&quot;ח ואינם כוללים מע&quot;מ. &quot;פוטנציאל שנתי מלא&quot; מבטא את ההכנסה
        אילו כל החניות שבהסכם היו מאוישות — אינו יעד התחזית, אלא תקרת ההשבחה החוזית.
      </p>
    </figure>
  )
}

/* ─── טבלה 6 — תמונת מצב נוכחית ──────────────────────────────────────────── */
function TodayKpis({ d }) {
  const o = d.overview
  const t = d.today
  return (
    <figure className="bkp-figure">
      <Caption kind="table" n={7}>תמונת מצב נוכחית</Caption>
      <Kpis items={[
        { label: 'מטענים מותקנים', value: nf.format(o.current_chargers), note: `ב-${o.buildings_count} אתרים` },
        { label: 'חניות פוטנציאליות', value: nf.format(o.potential_spots), note: `מומשו ${o.penetration_pct}%` },
        { label: 'הכנסה שנתית נוכחית', value: ils(t.run_rate_annual_income), note: 'ללא הנחת גידול' },
        { label: 'הכנסה חודשית למטען', value: ils(t.monthly_income_per_charger), note: 'ממוצע בפועל' },
        { label: 'עלות תפעול שנתית', value: ils(t.run_rate_annual_opex), note: 'מטענים קיימים' },
        { label: 'יתרת מזומנים', value: ils(t.opening_balance), note: t.opening_balance_date || '—' },
      ]} />
    </figure>
  )
}

/* ─── טבלה 7 — הנחות העבודה ──────────────────────────────────────────────── */
function AssumptionsTable({ d }) {
  const groups = []
  for (const a of d.assumptions) {
    const g = a.group || 'כללי'
    if (!groups.length || groups[groups.length - 1].name !== g) groups.push({ name: g, rows: [] })
    groups[groups.length - 1].rows.push(a)
  }
  return (
    <figure className="bkp-figure">
      <Caption kind="table" n={8}>הנחות העבודה</Caption>
      <table className="bkp-table">
        <thead>
          <tr><th className="bkp-rowlabel">פרמטר</th><th>ערך</th><th>הערה</th></tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g.name}>
              <tr className="bkp-group"><td className="bkp-rowlabel" colSpan={3}>{g.name}</td></tr>
              {g.rows.map((a, i) => (
                <tr key={i}>
                  <td className="bkp-rowlabel">{a.label}</td>
                  <td className="bkp-num bkp-strong">{a.value}</td>
                  <td className="bkp-sub">{a.note}</td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

/* ─── טבלה 8 — תמצית נתונים פיננסיים ─────────────────────────────────────── */
function SummaryFinancials({ d }) {
  const f = d.forecast
  if (!f.length) return null
  const rows = [
    ['מספר מטענים פעילים (סוף שנה)', f.map((r) => nf.format(r.total_chargers)), true],
    ['מטענים שנוספו במהלך השנה', f.map((r) => nf.format(r.chargers_added)), true],
    ['הכנסות', f.map((r) => ils(r.income))],
    ['הוצאות תפעול, תחזוקה ותקורה', f.map((r) => ils(-(r.opex + r.maintenance + r.overhead)))],
    ['השקעה בתשתית (CAPEX)', f.map((r) => ils(-r.capex))],
    ...(d.totals.one_time ? [['עלויות חד-פעמיות', f.map((r) => ils(-r.one_time))]] : []),
    ['תזרים לפני החזר הלוואה', f.map((r) => ils(r.profit_before_loan)), false, true],
    ['החזר הלוואה', f.map((r) => ils(-r.loan_repayment))],
    ['תזרים נטו', f.map((r) => ils(r.net_profit)), false, true],
  ]
  return (
    <figure className="bkp-figure">
      <Caption kind="table" n={9}>תמצית נתונים פיננסיים</Caption>
      <table className="bkp-table">
        <thead>
          <tr><th className="bkp-rowlabel">סעיף</th>{f.map((r) => <th key={r.year}>{r.year}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(([label, vals, plain, total], i) => (
            <tr key={i} className={total ? 'bkp-total' : ''}>
              <td className="bkp-rowlabel">{label}</td>
              {vals.map((v, j) => <td key={j} className={plain ? '' : 'bkp-num'}>{v}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

/* ─── טבלה 9 + תרשים 1 — תזרים מזומנים מצטבר ─────────────────────────────── */
function CumulativeCashflow({ d }) {
  const data = d.forecast.map((r) => ({ year: String(r.year), 'יתרה מצטברת': r.cumulative }))
  if (!data.length) return null
  return (
    <>
      <figure className="bkp-figure">
        <Caption kind="table" n={10}>יתרת מזומנים מצטברת</Caption>
        <table className="bkp-table">
          <thead>
            <tr><th className="bkp-rowlabel">סעיף</th>{d.forecast.map((r) => <th key={r.year}>{r.year}</th>)}</tr>
          </thead>
          <tbody>
            <tr>
              <td className="bkp-rowlabel">תזרים נטו בשנה</td>
              {d.forecast.map((r) => <td key={r.year} className="bkp-num"><Money v={r.net_profit} /></td>)}
            </tr>
            <tr className="bkp-total">
              <td className="bkp-rowlabel">יתרה מצטברת לסוף השנה</td>
              {d.forecast.map((r) => <td key={r.year} className="bkp-num"><Money v={r.cumulative} /></td>)}
            </tr>
          </tbody>
        </table>
        <p className="bkp-note">
          היתרה המצטברת פותחת ביתרת המזומנים בפועל
          {d.today.opening_balance_date ? ` נכון ל-${d.today.opening_balance_date}` : ''} ({ils(d.today.opening_balance)}).
        </p>
      </figure>

      <figure className="bkp-figure">
        <Caption kind="chart" n={2}>התפתחות יתרת המזומנים המצטברת</Caption>
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

/* ─── טבלה 10 — תחזית שנתית מפורטת ───────────────────────────────────────── */
function ForecastTable({ d }) {
  const f = d.forecast
  if (!f.length) return null
  const T = d.totals
  return (
    <figure className="bkp-figure">
      <Caption kind="table" n={11}>תחזית שנתית מפורטת (בש&quot;ח)</Caption>
      <table className="bkp-table bkp-table-tight">
        <thead>
          <tr>
            <th className="bkp-rowlabel">שנה</th>
            <th>מטענים<br />שנוספו</th>
            <th>סה&quot;כ<br />מטענים</th>
            <th>הכנסות</th>
            <th>השקעה<br />וחד-פעמי</th>
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
              <td className="bkp-rowlabel">{r.year}</td>
              <td className="bkp-num">{r.chargers_added || '—'}</td>
              <td className="bkp-num">{nf.format(r.total_chargers)}</td>
              <td className="bkp-num">{num(r.income)}</td>
              <td className="bkp-num">{num(-(r.capex + r.one_time))}</td>
              <td className="bkp-num">{num(-(r.opex + r.maintenance + r.overhead))}</td>
              <td className="bkp-num">{num(r.profit_before_loan)}</td>
              <td className="bkp-num">{r.loan_repayment ? num(-r.loan_repayment) : '—'}</td>
              <td className="bkp-num">{num(r.net_profit)}</td>
              <td className="bkp-num">{num(r.cumulative)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bkp-total">
            <td className="bkp-rowlabel">סה&quot;כ</td>
            <td className="bkp-num">{nf.format(T.chargers_added)}</td>
            <td className="bkp-num">{nf.format(T.chargers_end)}</td>
            <td className="bkp-num">{num(T.income)}</td>
            <td className="bkp-num">{num(-(T.capex + (T.one_time || 0)))}</td>
            <td className="bkp-num">{num(-(T.opex + T.maintenance + (T.overhead || 0)))}</td>
            <td className="bkp-num">{num(T.profit_before_loan)}</td>
            <td className="bkp-num">{num(-T.loan_repayment)}</td>
            <td className="bkp-num">{num(T.net_profit)}</td>
            <td className="bkp-num">{num(T.final_cumulative)}</td>
          </tr>
        </tfoot>
      </table>
    </figure>
  )
}

/* ─── תרשים 2 — תזרים נטו על פני השנים ───────────────────────────────────── */
function ProfitChart({ d }) {
  const data = d.forecast.map((r) => ({ year: String(r.year), profit: r.net_profit }))
  if (!data.length) return null
  return (
    <figure className="bkp-figure">
      <Caption kind="chart" n={1}>תזרים נטו על פני השנים</Caption>
      <BarChart width={DOC_W} height={CHART_H} data={data} margin={{ top: 24, right: 8, left: 30, bottom: 4 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="year" tick={{ fill: AXIS, fontSize: 12 }} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis orientation="right" tickFormatter={fmtK} tick={{ fill: AXIS, fontSize: 11 }} width={70}
          axisLine={false} tickLine={false} />
        <ReferenceLine y={0} stroke={AXIS} />
        <Tooltip formatter={(v) => ils(v)} />
        <Bar dataKey="profit" radius={[4, 4, 0, 0]} isAnimationActive={false} maxBarSize={64}
          label={{ position: 'top', formatter: (v) => fmtK(v), fill: AXIS, fontSize: 11 }}>
          {data.map((p, i) => <Cell key={i} fill={p.profit < 0 ? NEG : POS} />)}
        </Bar>
      </BarChart>
    </figure>
  )
}

/* ─── טבלה 11 — יחסי כיסוי חוב ───────────────────────────────────────────── */
function DscrTable({ d }) {
  const rows = d.forecast.filter((r) => r.loan_repayment > 0)
  const L = d.loan
  return (
    <figure className="bkp-figure">
      <Caption kind="table" n={12}>יחסי כיסוי חוב</Caption>
      <div className="bkp-kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {[
          [ils(L.amount), 'סכום ההלוואה', `${L.years} שנים`],
          [`${L.annual_rate}%`, 'ריבית שנתית', `פריים ${L.prime}% + ${L.margin}%`],
          [ils(L.monthly_payment), 'החזר חודשי', 'לוח שפיצר'],
          [ils(L.total_interest), 'סה"כ ריבית', 'לאורך חיי ההלוואה'],
        ].map(([v, l, n]) => (
          <div className="bkp-kpi" key={l}>
            <div className="bkp-kpi-val">{v}</div>
            <div className="bkp-kpi-lbl">{l}</div>
            <div className="bkp-kpi-note">{n}</div>
          </div>
        ))}
      </div>
      {rows.length > 0 && (
        <table className="bkp-table" style={{ marginTop: '18pt' }}>
          <thead>
            <tr>
              <th className="bkp-rowlabel">שנה</th>
              <th>תזרים פנוי לשירות החוב</th>
              <th>החזר שנתי</th>
              <th>יחס כיסוי (DSCR)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.year}>
                <td className="bkp-rowlabel">{r.year}</td>
                <td className="bkp-num"><Money v={r.profit_before_loan} /></td>
                <td className="bkp-num">{ils(r.loan_repayment)}</td>
                <td className="bkp-num bkp-strong">{ratio(r.dscr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  )
}

/* ─── טבלה 12 — רגישות התוצאות לקצב החדירה ───────────────────────────────── */
function SensitivityTable({ d }) {
  return (
    <figure className="bkp-figure">
      <Caption kind="table" n={2}>רגישות התוצאות לקצב החדירה</Caption>
      <table className="bkp-table">
        <thead>
          <tr>
            <th className="bkp-rowlabel">תרחיש</th>
            <th>שיעור חדירה שנתי</th>
            <th>תזרים מצטבר לתקופה</th>
            <th>שפל תזרימי</th>
            <th>יתרה בתום התקופה</th>
          </tr>
        </thead>
        <tbody>
          {d.sensitivity.map((s, i) => (
            <tr key={i} className={s.label === 'תרחיש הבסיס' ? 'bkp-total' : ''}>
              <td className="bkp-rowlabel">{s.label}</td>
              <td className="bkp-num">{s.growth_rate_pct}%</td>
              <td className="bkp-num"><Money v={s.total_profit} /></td>
              <td className="bkp-num"><Money v={s.min_cumulative} /></td>
              <td className="bkp-num"><Money v={s.final_cumulative} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

/* ─── מלל המסמך ───────────────────────────────────────────────────────────
   נוסח ברירת המחדל של כל בלוק מלל, כפי שהוא בקובץ שאושר. הנוסח חי בקוד ולא
   ב-DB כדי שהמסמך יישאר זהה לקובץ גם לפני שנערך משהו; ב-DB נשמרים רק בלוקים
   שנערכו בפועל, ומחיקת עריכה מחזירה לכאן.

   תחביר: שורה ריקה מפרידה בין פסקאות, שורה שמתחילה ב-"- " היא תבליט,
   ו-==טקסט== מסמן הדגשה בצהוב.

   פסקאות שמכילות נתונים חיים אינן כאן ואינן ניתנות לעריכה — הן נשארות ב-JSX
   כדי שהמספרים שבתוכן ימשיכו להישלף מהאתר.
   ═══════════════════════════════════════════════════════════════════════ */
const TEXTS = {
  '1': `פרק זה מרכז את עיקרי הבקשה לאשראי ואת הנתונים הנדרשים לבחינתה. הפירוט המלא — תיאור הפעילות הנרכשת, מרשם ההסכמים, הנחות העבודה והתחזית המפורטת — מובא בפרקים שלאחר מכן.

להלן עיקרי הבקשה:`,

  '1.1': `חברת אנרגיה ירוקה מקבוצה אורבנית בע"מ (להלן : "החברה") עוסקת בהקמה, הפעלה וניהול של תשתיות טעינה לרכבים חשמליים בחניוני בנייני מגורים מרכזים מסחריים ובנייני משרדים. החברה מספקת פתרון מקצה לקצה — תכנון והנדסה, הקמת התשתית, מערכת ניהול חשמל, התקנת עמדות הטעינה, ולאחר מכן תפעול, ניטור, גבייה ותחזוקה שוטפים.

הפעילות מבוססת על התקשרויות חוזיות ארוכות טווח מול ועדי בתים, חברות ניהול ויזמים, לצד הסכמי שימוש מול משתמשי הקצה. מבנה זה יוצר בסיס הכנסות חוזר ויציב, המתרחב בהדרגה ככל שמצטרפים דיירים נוספים באותם בניינים — ללא צורך בהתקשרות חדשה ובהשקעת תשתית נוספת.`,

  '1.2a': `האשראי המבוקש נדרש למימון רכישת פעילותה של חברת שאר מוביליטי בע"מ (להלן: "החברה הנרכשת" וההטמעתו בפעילות חברת אנרגיה אורבנית.`,

  '1.2b': `מדובר ברכישת פעילות מניבה ולא בהשקעה בהקמה- האתרים הנרכשים כבר פועלים, מייצרים הכנסה חוזרת חודשית, ומגובים בהסכמים ארוכי טווח שתקופתם ידועה מראש. שווי הפעילות נגזר משני רכיבים — ההכנסה החוזרת מהמטענים המותקנים כיום, והפוטנציאל החוזי שטרם מומש באותם אתרים.

מקורות ההחזר:

- התזרים השוטף מהפעילות הנרכשת — דמי ניהול, המרווח על צריכת החשמל ודמי מנוי;
- הגידול בהכנסה החוזרת ככל שדיירים נוספים באותם בניינים מצטרפים, ללא צורך בהתקשרות חדשה ובהשקעה בתשתית משותפת נוספת.

מאפיין מרכזי של העסקה הוא שההכנסה מגיעה מרגע ההשלמה ואינה מותנית בתקופת הרצה — ולפיכך שירות החוב נשען על תזרים קיים ולא על תחזית בלבד.`,

  '1.3': `להלן תמצית התחזית לתקופת ההלוואה. הנתונים נגזרים מהתנאים החוזיים של האתרים הנרכשים ומהנחות העבודה המפורטות בפרק תחזית הגידול (הנתונים הכספיים אינם כוללים את הפעילות הכוללת אשך חברת האנרגיה אלא רק את הבניינים הרלוונטיים לחברה הנרכשת):`,

  // 1.4 (רווחיות לאורך התקופה) הוא תרשים ללא פסקה מלווה.
  '1.5': `להלן בחינת השפעתו של קצב חדירה איטי או מהיר מהמתוכנן על תוצאות התקופה. מבנה ההוצאות הגמיש והיכולת לדחות השקעות תשתית מאפשרים לחברה להתאים את קצב ההתרחבות לתזרים בפועל:`,

  '1.6': `- הפעילות הנרכשת מייצרת הכנסה חוזרת כבר במועד ההשלמה, ואינה תלויה בתקופת הרצה;
- ההכנסה מעוגנת בהסכמים ארוכי טווח מול ועדי בתים, ומפוזרת בין אתרים וערים רבים;
- מקור ההשבחה אינו הרחבה לאתרים חדשים אלא מימוש הפוטנציאל החוזי הקיים באותם אתרים;
- הפעילות נקלטת לתוך חברה פעילה ואינה מוסיפה עלויות תקורה — מלוא ההכנסה מצטרפת לתזרים;
- קיים פוטנציאל רב לניצול בתחומי החברה , מטענים נוספים בניינים לקראת חתימת הסכם ומרכזים מסחריים עם מטעני DC מהירים.
- ==קצב ההשקעה נתון לשליטת החברה וניתן להתאמה לתזרים בפועל, כפי שמדגים ניתוח הרגישות.==`,

  'signoff': `בברכה

צביקה אנגלנדר`,

  '2': `הפרק מתאר את הפעילות הנרכשת: תחום העיסוק, מבנה ההכנסות, מרשם ההסכמים והכלכלה של כל אתר. כל הנתונים המספריים בפרק נשלפים ממערכת הנתונים של החברה ומשקפים את מצבה במועד הכנת התכנית.`,

  '2.1': `החברה והחברה הנרכשת נותנות מענה לחסם המרכזי בהתקנת עמדות טעינה בבניינים קיימים: תשתית החשמל הקיימת אינה מאפשרת חיבור בו-זמני של מספר רב של מטענים. הפתרון מבוסס על ניהול עומסים חכם, המאפשר להוסיף עמדות טעינה רבות על החיבור הקיים ללא הגדלתו.

לצד הפתרון ההנדסי, החברות מספקות:

- סליקה וניהול משתמשים דיגיטליים;
- ניטור מרחוק וטיפול יזום בתקלות;
- הקמת אתר מהירה ואחריות על הציוד;
- מענה במרחב הפרטי, המסחרי והציבורי.`,

  '2.2': `- עמדות טעינה לרכבים חשמליים בחניונים משותפים בבנייני מגורים;
- עמדות טעינה בחניות פרטיות;
- עמדות טעינה במרכזים מסחריים ובמבני משרדים;
- מערכת ניהול ואפליקציה למשתמש — תזמון טעינה, מעקב צריכה ותשלום.`,

  '2.3': `- ועדי בתים וחברות ניהול ואחזקה;
- יזמי נדל"ן בתחום המגורים וההתחדשות העירונית;
- יזמים בתחום המשרדים והמסחר;
- דיירים ומשתמשי קצה פרטיים.`,

  '2.4': `להלן פירוט האתרים הפעילים והפוטנציאל בכל אחד מהם. "חניות פוטנציאליות" מבטא את מספר העמדות שניתן להקים באתר לאורך תקופת ההסכם:`,

  '2.5': `ההתקשרות בכל אתר מבוססת על הסכם מסגרת מול ועד הבית או חברת הניהול, ולצדו הסכמי שימוש פרטניים מול הדיירים. מבנה זה מפזר את הסיכון בין משתמשים רבים, מקנה ודאות חוזית לתקופה ארוכה, ומאפשר הרחבה הדרגתית של מספר העמדות באתר ללא התקשרות מחודשת.`,

  '2.6': `מכלול ההסכמים הקיימים הוא הנכס המרכזי בעסקה. להלן כל ההסכמים החתומים, תנאיהם והאתרים המקושרים לכל אחד מהם:`,

  '2.7': `לכל אתר תנאים כלכליים משלו הנגזרים מההסכם החתום בו. הטבלה מציגה את ההכנסה החודשית לעמדה בכל אתר, את ההכנסה השנתית מהעמדות המותקנות היום, ואת ההכנסה השנתית אילו כל החניות שבהסכם היו מאוישות — הפער ביניהן הוא פוטנציאל ההשבחה שנרכש:`,

  '3': `שוק הרכב החשמלי בישראל נמצא במגמת צמיחה מתמשכת, המתבטאת הן בנתח הרכבים החשמליים מכלל המסירות והן במלאי הרכבים החשמליים בכבישים.

נתח הרכבים החשמליים מכלל הרכבים החדשים עלה מכ-10% בשנת 2022 לכ-18% בשנת 2023, וכ-25% בשנת 2024. בשנת 2025 עמד הנתח על כ-20% — אחד מכל חמישה רכבים חדשים שנמכרו בישראל. התנודתיות בין השנים נובעת בעיקר משינויי מיסוי ומהטבות מס, ולא משינוי במגמה.

במקביל גדל מלאי הרכבים החשמליים: בסוף שנת 2024 נספרו בישראל מעל 110,000 רכבים חשמליים, לעומת כ-62,000 מספר שנים קודם לכן. התרחבות זו מלווה בצמיחת תשתיות הטעינה הציבוריות — בתל אביב, לדוגמה, פועלות 523 עמדות טעינה, מהן 474 רגילות (AC) ו-49 מהירות (DC).

עיקר הביקוש לפתרונות טעינה ביתיים מגיע מבנייני מגורים קיימים, שבהם תשתית החשמל לא תוכננה לטעינת רכבים. זהו שוק יעד רחב שטרם מומש, ובו יתרון החברה — הוספת עמדות על תשתית קיימת ללא הגדלת חיבור — רלוונטי במיוחד.

גורמים המשפיעים על קצב הצמיחה:

- מדיניות מיסוי ותמריצים רגולטוריים, המשפיעים על קצב המסירות;
- העדפות צרכנים ותפיסת הטעינה הביתית כשיקול מרכזי ברכישה;
- עומסים על רשת החשמל הארצית, המחזקים את הצורך בפתרונות ניהול עומסים.`,

  '4.1': `- פתרון לחסם מבני בשוק — הוספת עמדות טעינה רבות על תשתית חשמל קיימת ללא הגדלת חיבור;
- מודל הכנסות משולב — הכנסה חד-פעמית מהתקנה לצד הכנסה חוזרת חודשית מדמי הניהול ומהמרווח על צריכת החשמל;
- סינרגיה מלאה עם הפעילות הקיימת — קליטת האתרים הנרכשים אינה מצריכה תוספת מערך ניהול, תפעול או גבייה, ולכן אינה מוסיפה עלויות תקורה;
- הסכמים ארוכי טווח המקנים ודאות תזרימית לתקופה ידועה מראש;
- פיזור סיכון בין אתרים רבים ובין משתמשי קצה רבים בכל אתר;
- שליטה בשרשרת הערך — תכנון, הקמה, תפעול, גבייה ותחזוקה.`,

  '4.2': `- הפעילות בשלב התרחבות, ונדרשת הוכחת סקייל תפעולי לאורך זמן;
- תלות בקצב אימוץ הרכב החשמלי — מושפע מרגולציה, מיסוי ומחירי רכבים;
- השקעה ראשונית משמעותית בכל אתר, המקדימה את ההכנסות ממנו;
- מורכבות תפעולית בניהול מספר רב של אתרים בפריסה ארצית.`,

  '4.3': `- מימוש הפוטנציאל באתרים הקיימים — מרבית החניות בהסכמים החתומים טרם אוישו;
- שוק רחב של בנייני מגורים קיימים ללא פתרון טעינה;
- הרחבת סל המוצרים — אגירת אנרגיה, ייצור סולארי, ניהול עומסים מתקדם וציי רכב;
- שיתופי פעולה עם חברות ניהול ויזמים כמנוע צמיחה בעלות רכישת לקוח נמוכה.`,

  '4.4': `- כניסת שחקנים נוספים לשוק, לרבות חברות אנרגיה גדולות;
- שינויים ברגולציה, בתעריפי החשמל או בהטבות המס;
- רגישות למחירי ציוד ולשרשראות אספקה גלובליות;
- עומסים על רשת החשמל הארצית והשפעתם על לוחות זמנים של פרויקטים.`,

  '5': `ההכנסה מכל עמדת טעינה מורכבת משני רכיבים חוזרים ומרכיב חד-פעמי:

- דמי ניהול חודשיים לעמדה — ==מכונים== בחלק מההסכמים דמי מנוי; אותו רכיב הכנסה;
- מרווח על צריכת החשמל — תוספת באגורות לכל קילוואט-שעה שנצרך;
- הכנסה חד-פעמית מהתקנת העמדה, לפי המוגדר בהסכם מול הדייר.

ועד הבית אינו נושא בעלויות ההקמה או התפעול — דבר המפחית חסמי כניסה ומקצר את משך קבלת ההחלטה. ההכנסה החוזרת גדלה עם כל דייר נוסף המצטרף באותו בניין, בעוד ההשקעה בתשתית המשותפת כבר בוצעה — ולכן הרווחיות השולית עולה עם קצב האכלוס.

הגבייה מתבצעת דיגיטלית, והתחזוקה והניטור מנוהלים מרחוק.`,

  '6': `להלן תמונת המצב התפעולית של הפעילות הנרכשת נכון למועד הכנת התכנית. "הכנסה שנתית נוכחית" מחושבת מהעמדות המותקנות בפועל, ללא הנחת גידול כלשהי — כלומר זהו בסיס ההכנסה שהרוכשת מקבלת מיום ההשלמה.`,

  '7.1': `התחזית נגזרת מפרמטרים המוגדרים פרטנית לכל אתר במערכת. הטבלה שלהלן מציגה את הערכים המשוקללים בפועל — ולכן היא מתעדכנת אוטומטית עם כל שינוי בהנחות:`,

  '7.2': `להלן תמצית הנתונים הפיננסיים לתקופת התחזית, הנגזרת מהנחות העבודה שלעיל:`,

  '7.3': `התזרים המוצג להלן כולל את קבלת ההלוואה המבוקשת ואת החזריה:`,

  '7.4': `קצב הגידול נגזר משיעור חדירה שנתי מתוך החניות הפוטנציאליות בכל אתר, ומוגבל לפוטנציאל שנותר בו. השנה הראשונה משקפת את המצב הקיים ואינה כוללת השקעה בעמדות חדשות. כל הסכומים מנוטרלי מע"מ:`,

  // ניתוח הרגישות עבר לסעיף 1.5; מה שנשאר כאן הוא יחסי כיסוי החוב, שעלו ל-7.5.
  '7.5': `יחס כיסוי החוב (DSCR) מחושב כתזרים הפנוי לשירות החוב — הכנסות בניכוי הוצאות תפעול, תחזוקה והשקעה — חלקי ההחזר השנתי. יחס העולה על 1 מעיד על יכולת החזר מהפעילות השוטפת:`,

  '8': `העסקה היא רכישת פעילות מניבה בשוק בצמיחה, המאופיין בביקוש מבני ברור לפתרונות טעינה בבנייני מגורים. הפעילות הנרכשת מגובה בהסכמים ארוכי טווח, מפוזרת על פני אתרים וערים רבים, ומייצרת הכנסה חוזרת כבר במועד ההשלמה.

מקור ההשבחה המרכזי אינו תלוי בהרחבה לאתרים חדשים אלא במימוש הפוטנציאל החוזי הקיים: בכל אתר נחתם הסכם המאפשר להתקין עמדות במספר גדול בהרבה ממה שהותקן בפועל. הוספת עמדה באתר פעיל אינה דורשת התקשרות חדשה, ורוב ההשקעה בתשתית המשותפת כבר בוצעה — ולכן הרווחיות השולית עולה עם קצב האכלוס.

יתרונות התומכים ביכולת ההחזר:

- הכנסה חוזרת חוזית, ולא מכירה חד-פעמית שיש לחזור ולייצר בכל שנה;
- מיזוג לתוך פעילות קיימת ללא תוספת תקורה — הפעילות הנרכשת מנוהלת על ידי המערך הקיים של החברה, ולכן ההכנסה מצטרפת לתזרים כמעט במלואה;
- פיזור סיכון בין אתרים רבים ובין משתמשי קצה רבים בכל אתר;
- שליטה בקצב ההשקעה — ניתן להאט את קצב ההתקנות ולהתאימו לתזרים בפועל, כפי שמדגים ניתוח הרגישות.

בעלי החברה מביעים מחויבות מלאה לעסקה, לרבות נכונות להעמדת בטוחות סבירות בהתאם לדרישות הבנק ולשיתוף פעולה מלא בניהול מסגרת האשראי ובהבטחת החזרה.`,

  '8.1': `בגיבוש תכנית זו הסתמכנו על דיוק, שלמות ועדכניות המידע שהתקבל מהחברה, לרבות הנתונים הפיננסיים, התחזיות והאומדנים. לא נערכה בחינה עצמאית בלתי תלויה של מידע זה, למעט מבחני סבירות כלליים.

הערכה כלכלית אינה מדע מדויק. התכנית משקפת מצב נתון בנקודת זמן מסוימת, על בסיס נתונים ידועים, הנחות יסוד שנקבעו ותחזיות שנאמדו. שינויים במשתנים העיקריים או במידע עשויים לשנות את בסיס ההנחות ואת המסקנות הנגזרות מהן. אם הערכות ההנהלה לא תתממשנה, התוצאות בפועל עשויות להיות שונות באופן מהותי מן המוצג כאן.`,
}

// ==טקסט== → הדגשה בצהוב, כמו הסימונים שנשארו בקובץ המקורי
function withMarks(line, keyPrefix) {
  return line.split(/(==[^=]+==)/g).filter(Boolean).map((part, i) => (
    part.startsWith('==') && part.endsWith('==')
      ? <span key={`${keyPrefix}-${i}`} className="bkp-hl">{part.slice(2, -2)}</span>
      : <Fragment key={`${keyPrefix}-${i}`}>{part}</Fragment>
  ))
}

/** מרנדר בלוק מלל: שורה ריקה מפרידה פסקאות, "- " פותח תבליט. */
function renderProse(text) {
  const blocks = []
  let list = null
  for (const raw of (text || '').split('\n')) {
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
  return blocks.map((b, i) => (
    b.type === 'ul'
      ? <ul key={i} className="bkp-ul">{b.items.map((it, j) => <li key={j}>{withMarks(it, `${i}-${j}`)}</li>)}</ul>
      : <p key={i} className="bkp-p">{withMarks(b.text, String(i))}</p>
  ))
}

/**
 * בלוק מלל של המסמך. במצב תצוגה מרנדר את הנוסח הפעיל (ערוך אם נערך, אחרת
 * הנוסח שבקובץ); במצב עריכה מציג תיבת טקסט עם שמירה והחזרה למקור.
 */
function Prose({ id, edit, overrides, onSave, className }) {
  const original = TEXTS[id] ?? ''
  const active = overrides[id] ?? original
  const edited = overrides[id] !== undefined
  const [draft, setDraft] = useState(active)
  const [busy, setBusy] = useState(false)

  // כשהעריכה נשמרת או מוחזרת במקום אחר — התיבה מתיישרת לנוסח הפעיל
  useEffect(() => { setDraft(active) }, [active])

  if (!edit) return <div className={className}>{renderProse(active)}</div>

  const dirty = draft !== active
  const run = async (value) => {
    setBusy(true)
    try { await onSave(id, value) } finally { setBusy(false) }
  }

  return (
    <div className="bkp-edit">
      <div className="bkp-edit-head">
        <span className="bkp-edit-id">{id}</span>
        {edited && <span className="bkp-edit-flag">נערך</span>}
        <span className="bkp-edit-hint">שורה ריקה = פסקה · &quot;- &quot; = תבליט · ==טקסט== = הדגשה</span>
      </div>
      <textarea
        className="bkp-edit-body"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        // הפסקאות הן שורות ארוכות שנשברות בתצוגה; ספירת שורות בלבד הייתה
        // נותנת תיבה של שלוש שורות עם גלילה על פסקה שלמה.
        rows={Math.min(26, Math.max(4, draft.split('\n').length + Math.ceil(draft.length / 85)))}
      />
      <div className="bkp-edit-actions">
        <button className="tact-btn tact-btn-primary" disabled={!dirty || busy}
          onClick={() => run(draft)}>{busy ? 'שומר…' : 'שמור'}</button>
        {edited && (
          <button className="tact-btn" disabled={busy} onClick={() => run('')}>החזר למקור</button>
        )}
        {dirty && <span className="bkp-sub">יש שינוי שלא נשמר</span>}
      </div>
    </div>
  )
}

/* ─── תוכן העניינים ───────────────────────────────────────────────────────
   בקובץ המקורי שלוש שורות כאן לא תאמו את הכותרות בגוף המסמך (1.4, 2.6, 2.7),
   מפני שהכותרות נערכו ב-Word אחרי שתוכן העניינים כבר נוצר. כאן הן מיושרות
   לכותרות בפועל. */
const TOC = [
  ['1.', 'תמצית הבקשה', 1],
  ['1.1', 'רקע כללי ותיאור החברה', 2],
  ['1.2', 'בקשת האשראי', 2],
  ['1.3', 'תמצית התחזית הכספית', 2],
  ['1.4', 'רווחיות לאורך התקופה', 2],
  ['1.5', 'ניתוח רגישות', 2],
  ['1.6', 'יתרונות הרכישה', 2],
  ['2.', 'החברה הנרכשת — פעילות ונכסים', 1],
  ['2.1', 'תחום הפעילות והערך המוסף', 2],
  ['2.2', 'המוצרים והשירותים', 2],
  ['2.3', 'לקוחות החברה', 2],
  ['2.4', 'פריסת האתרים', 2],
  ['2.5', 'מבנה ההתקשרויות', 2],
  ['2.6', 'מכלול ההסכמים החתומים', 2],
  ['2.7', 'תקציב בכל אתר', 2],
  ['3.', 'סקירת השוק', 1],
  ['4.', 'ניתוח SWOT', 1],
  ['4.1', 'חוזקות', 2],
  ['4.2', 'חולשות', 2],
  ['4.3', 'הזדמנויות', 2],
  ['4.4', 'איומים', 2],
  ['5.', 'המודל העסקי', 1],
  ['6.', 'מצב היום', 1],
  ['7.', 'תחזית גידול', 1],
  ['7.1', 'הנחות העבודה', 2],
  ['7.2', 'תמצית נתונים פיננסיים', 2],
  ['7.3', 'תזרים מזומנים מצטבר', 2],
  ['7.4', 'תחזית שנתית', 2],
  ['7.5', 'יכולת החזר ויחסי כיסוי חוב', 2],
  ['8.', 'סיכום ומסקנות', 1],
  ['8.1', 'הבהרות', 2],
]

/* ─── הדף ────────────────────────────────────────────────────────────────── */

export default function BankPlan({ agreementVersion, horizonMode = '5' }) {
  const [d, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  // רק הבלוקים שנערכו; כל השאר מגיע מ-TEXTS
  const [overrides, setOverrides] = useState({})
  const [settings, setSettings] = useState(null)
  const [edit, setEdit] = useState(false)

  async function saveText(id, body) {
    try {
      await api.saveBankPlanText(id, body)
      setOverrides((prev) => {
        const next = { ...prev }
        if (body.trim()) next[id] = body.trim()
        else delete next[id]
        return next
      })
      setError('')
    } catch (e) {
      setError(`שמירת הטקסט נכשלה: ${e.message}`)
    }
  }

  // ייצוא Word — נגזר מה-DOM המוצג, ולכן זהה למה שיוצא ב"ייצוא PDF"
  async function exportWord() {
    setExporting(true)
    try {
      await exportBusinessPlanWord('תכנית עסקית לבנק — אנרגיה ירוקה מקבוצה אורבנית.doc', BANK_PLAN)
    } catch (e) {
      setError(`ייצוא ל-Word נכשל: ${e.message}`)
    } finally {
      setExporting(false)
    }
  }

  async function load() {
    setLoading(true)
    try {
      const byContract = horizonMode === 'contract'
      const years = byContract ? undefined : parseInt(horizonMode)
      const [data, texts, plan] = await Promise.all([
        api.getBusinessPlanData(years, readOverheadTotal(), byContract),
        // עריכות המלל ופרטי העסקה אינם קריטיים להצגת המסמך — כשל בהם לא יפיל את הדף
        api.getBankPlanTexts().catch(() => ({})),
        api.getBusinessPlan().catch(() => null),
      ])
      setData(data)
      setOverrides(texts || {})
      setSettings(plan?.settings || null)
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [horizonMode, agreementVersion])

  if (loading && !d) return <p className="muted">טוען…</p>
  if (error) return <div className="app-error">שגיאה בטעינת התכנית: {error}</div>
  if (!d) return null

  const o = d.overview
  const L = d.loan
  const dscr = d.forecast.map((r) => r.dscr).filter((x) => x !== null && x !== undefined)
  const firstPositive = d.forecast.find((r) => r.cumulative >= 0)
  const lastYear = d.start_year + d.horizon_years - 1

  // קיצור לבלוק מלל — חוסך העברת אותם שלושה props בשלושים מקומות
  const P = ({ id, className }) => (
    <Prose id={id} className={className} edit={edit} overrides={overrides} onSave={saveText} />
  )

  return (
    <div className="bkp-page">
      <div className="bkp-toolbar no-print">
        <span className="bkp-meta">
          המסמך זהה לקובץ שאושר · המספרים נשלפים חיים מהאתר · עודכן{' '}
          {new Date(d.generated_at).toLocaleString('he-IL')}
        </span>
        <span className="bkp-toolbar-spacer" />
        <button className={`tact-btn ${edit ? 'tact-btn-primary' : ''}`} onClick={() => setEdit(!edit)}>
          <TactIcon name="document" size={15} />
          <span style={{ marginInlineStart: 6 }}>{edit ? 'סיים עריכה' : 'ערוך טקסטים'}</span>
        </button>
        <button className="tact-btn" onClick={exportWord} disabled={exporting}>
          <TactIcon name="document" size={15} />
          <span style={{ marginInlineStart: 6 }}>{exporting ? 'מייצא…' : 'הורדה כקובץ Word'}</span>
        </button>
        <button className="tact-btn tact-btn-primary" onClick={() => window.print()}>
          <TactIcon name="reports" size={15} />
          <span style={{ marginInlineStart: 6 }}>ייצוא PDF</span>
        </button>
      </div>

      {edit && settings && <PlanSettingsEditor settings={settings} onSaved={load} />}

      <article className="bkp-sheet" dir="rtl">
        <div className="bkp-frame" aria-hidden="true" />

        {/* ═══ שער ═══ */}
        <section className="bkp-cover">
          <div className="bkp-cover-rule" />
          <div className="bkp-cover-title">תכנית עסקית</div>
          <div className="bkp-cover-gap" />
          <div className="bkp-cover-company">אנרגיה ירוקה מקבוצה אורבנית בע&quot;מ</div>
          <div className="bkp-cover-gap" />
          <div className="bkp-cover-purpose">מימון רכישת פעילות ש.א.ר מוביליטי בע&quot;מ</div>
          <div className="bkp-cover-gap" />
          <div className="bkp-cover-to">מוגש לבנק הפועלים</div>
          <div className="bkp-cover-facts">
            {nf.format(o.buildings_count)} אתרים&nbsp; ·&nbsp; {nf.format(o.current_chargers)} מטענים
            מותקנים&nbsp; ·&nbsp; אשראי מבוקש {ils(d.acquisition.credit_requested)}&nbsp; ·&nbsp;
            תחזית {d.horizon_years} שנים&nbsp; ·&nbsp; {d.start_year}–{lastYear}
          </div>
          <div className="bkp-cover-foot">אוגוסט 2026</div>
          <div className="bkp-cover-pics">
            <img className="bkp-pic-a" src="/bank-plan/cover-a.png" alt="" />
            <img className="bkp-pic-b" src="/bank-plan/cover-b.jpg" alt="" />
          </div>
        </section>

        {/* ═══ תוכן עניינים ═══ */}
        <section className="bkp-toc">
          <h2 className="bkp-h1">תוכן עניינים</h2>
          <ol className="bkp-toc-list">
            {TOC.map(([n, title, lvl]) => (
              <li key={n} className={`bkp-toc-l${lvl}`}>
                <span className="bkp-toc-num">{n}</span>
                <span className="bkp-toc-title">{title}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* ═══ 1 תמצית הבקשה ═══ */}
        <section className="bkp-section bkp-level-1">
          <H1 n="1">תמצית הבקשה</H1>
          <P id="1" />
          {/* שלוש הפסקאות הבאות נושאות נתונים חיים ולכן אינן ניתנות לעריכה */}
          <p className="bkp-p">
            החברה מבקשת אשראי בסך <strong>{ils(L.amount)}</strong> לתקופה של {L.years} שנים.
            האשראי מיועד למימון רכישת פעילותה של חברת ש.א.ר מוביליטי בע&quot;מ, הטמעת הפעילות
            שלה בתוך חברת אנרגיה ירוקה מקבוצה אורבנית והרחבת הפעילות לתחומים נוספים כגון
            מטעני DC מהירים.
          </p>
          <p className="bkp-p">
            הפעילות הנרכשת כוללת {nf.format(o.buildings_count)} אתרים ב-{nf.format(o.cities.length)} ערים,
            ובהם <span className="bkp-hl-aqua">{nf.format(o.current_chargers)}</span> עמדות טעינה מותקנות
            ופועלות מתוך {nf.format(o.potential_spots)} חניות שההסכמים החתומים מתירים — כלומר{' '}
            {o.penetration_pct}% מהפוטנציאל החוזי מומש עד כה. ההכנסה השנתית מהעמדות הקיימות,
            ללא הנחת גידול כלשהי, עומדת על {ils(d.today.run_rate_annual_income)}.
          </p>
          <p className="bkp-p">
            <span className="bkp-hl">
              לאורך תקופת ההלוואה נע יחס כיסוי החוב בטווח של{' '}
              {dscr.length ? `${ratioProse(Math.min(...dscr))} עד ${ratioProse(Math.max(...dscr))}` : '—'},
              {firstPositive
                ? ` והתזרים המצטבר צפוי לעבור ליתרה חיובית בשנת ${firstPositive.year}.`
                : ' והתזרים המצטבר אינו עובר ליתרה חיובית בתוך אופק התחזית הנוכחי.'}
            </span>
          </p>

          <H2 n="1.1">רקע כללי ותיאור החברה</H2>
          <P id="1.1" />

          <H2 n="1.2">בקשת האשראי</H2>
          <P id="1.2a" />
          {/* בקובץ נכתב "כ-20 בניינים" ביד, בעוד סעיף 1 שולף חי ומדבר על 23
              אתרים — שני מספרים לאותו תיק. כאן שניהם מאותו מקור. */}
          <p className="bkp-p">
            החברה הנרכשת עוסקת בפעילות זהה של החברה וכוללת {nf.format(o.buildings_count)} בניינים פעילים.
          </p>
          <P id="1.2b" />

          <H2 n="1.3">תמצית התחזית הכספית</H2>
          <P id="1.3" />
          <SummaryCompact d={d} />

          {/* הרווחיות והרגישות הועברו לכאן מפרק התחזית — הבנק מבקש לראות את
              התוצאה ואת עמידותה לשינוי בקצב כבר בתמצית, לפני הפירוט. */}
          <H2 n="1.4">רווחיות לאורך התקופה</H2>
          <ProfitChart d={d} />

          <H2 n="1.5">ניתוח רגישות</H2>
          <P id="1.5" />
          <SensitivityTable d={d} />

          <H2 n="1.6">יתרונות הרכישה</H2>
          <P id="1.6" />

          <P id="signoff" className="bkp-signoff" />
        </section>

        {/* ═══ 2 החברה הנרכשת ═══ */}
        <section className="bkp-section bkp-level-1">
          <H1 n="2">החברה הנרכשת — פעילות ונכסים</H1>
          <P id="2" />

          <H2 n="2.1">תחום הפעילות והערך המוסף</H2>
          <P id="2.1" />
          <img className="bkp-diagram" src="/bank-plan/diagram.png"
            alt="תרשים ארכיטקטורה: אפליקציה, בסיס נתונים ו-Priority ERP מול עמדות הטעינה והמשתמשים" />

          <H2 n="2.2">המוצרים והשירותים</H2>
          <P id="2.2" />
          <div className="bkp-products">
            <img className="bkp-prod-a" src="/bank-plan/product-a.jpg" alt="" />
            <img className="bkp-prod-b" src="/bank-plan/product-b.png" alt="" />
          </div>

          {/* בקובץ המקורי כותרת זו אינה מודגשת, בשונה משאר כותרות המשנה */}
          <H2 n="2.3" plain>לקוחות החברה</H2>
          <P id="2.3" />

          <H2 n="2.4">פריסת האתרים</H2>
          <P id="2.4" />
          <BuildingsTable d={d} />

          <H2 n="2.5">מבנה ההתקשרויות</H2>
          <P id="2.5" />
          <AgreementsProfile d={d} />

          <H2 n="2.6">מכלול ההסכמים החתומים</H2>
          <P id="2.6" />
          <AgreementsTable d={d} />

          <H2 n="2.7">תקציב בכל אתר</H2>
          <P id="2.7" />
          <SiteEconomicsTable d={d} />
        </section>

        {/* ═══ 3 סקירת השוק ═══ */}
        <section className="bkp-section bkp-level-1">
          <H1 n="3">סקירת השוק</H1>
          <P id="3" />
        </section>

        {/* ═══ 4 ניתוח SWOT ═══ */}
        <section className="bkp-section bkp-level-1">
          <H1 n="4">ניתוח SWOT</H1>
          <H2 n="4.1">חוזקות</H2>
          <P id="4.1" />
          <H2 n="4.2">חולשות</H2>
          <P id="4.2" />
          <H2 n="4.3">הזדמנויות</H2>
          <P id="4.3" />
          <H2 n="4.4">איומים</H2>
          <P id="4.4" />
        </section>

        {/* ═══ 5 המודל העסקי ═══ */}
        <section className="bkp-section bkp-level-1">
          <H1 n="5">המודל העסקי</H1>
          <P id="5" />
        </section>

        {/* ═══ 6 מצב היום ═══ */}
        <section className="bkp-section bkp-level-1">
          <H1 n="6">מצב היום</H1>
          <P id="6" />
          <TodayKpis d={d} />
        </section>

        {/* ═══ 7 תחזית גידול ═══ */}
        <section className="bkp-section bkp-level-1">
          <H1 n="7">תחזית גידול</H1>

          <H2 n="7.1">הנחות העבודה</H2>
          <P id="7.1" />
          <AssumptionsTable d={d} />

          <H2 n="7.2">תמצית נתונים פיננסיים</H2>
          <P id="7.2" />
          <SummaryFinancials d={d} />

          <H2 n="7.3">תזרים מזומנים מצטבר</H2>
          <P id="7.3" />
          <CumulativeCashflow d={d} />

          <H2 n="7.4">תחזית שנתית</H2>
          <P id="7.4" />
          <ForecastTable d={d} />

          <H2 n="7.5">יכולת החזר ויחסי כיסוי חוב</H2>
          <P id="7.5" />
          <DscrTable d={d} />
        </section>

        {/* ═══ 8 סיכום ומסקנות ═══ */}
        <section className="bkp-section bkp-level-1">
          <H1 n="8">סיכום ומסקנות</H1>
          <P id="8" />

          <H2 n="8.1">הבהרות</H2>
          <P id="8.1" />
        </section>

        <footer className="bkp-doc-foot">
          <p className="bkp-sub">
            הנתונים הכמותיים בתכנית זו נגזרים ישירות ממערכת הנתונים של החברה נכון
            ל-{new Date(d.generated_at).toLocaleDateString('he-IL')}. כל הסכומים אינם כוללים מע&quot;מ.
          </p>
        </footer>
      </article>
    </div>
  )
}

/* ─── עריכת נתוני העסקה ───────────────────────────────────────────────────────
   רק שני הפרמטרים שהמסמך אכן צורך מהגדרות התכנית: עלות הרכישה והשימושים
   החד-פעמיים. שאר המספרים נערכים במקום שבו הם נולדים — האשראי בלשונית תזרים,
   ושיעור הגידול פר-אתר בלשונית תזרים בניינים — ולכן אינם מופיעים כאן. */

function PlanSettingsEditor({ settings, onSaved }) {
  const [cost, setCost] = useState(settings.acquisition_cost ?? 0)
  const [costs, setCosts] = useState(settings.one_time_costs || [])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    setSaving(true)
    try {
      await api.updateBusinessPlanSettings({
        acquisition_cost: parseFloat(cost) || 0,
        // note אינו נערך כאן אבל חייב לשרוד שמירה — הוא ההסבר שמוצג בטבלת
        // הנחות העבודה, ובנייה מחדש של האובייקט הייתה מוחקת אותו.
        one_time_costs: costs
          .filter((c) => (c.name || '').trim() || Number(c.amount) > 0)
          .map((c) => ({
            name: (c.name || '').trim(),
            amount: Number(c.amount) || 0,
            ...(c.note ? { note: c.note } : {}),
          })),
      })
      setErr('')
      onSaved()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bkp-settings no-print">
      <h3 className="bkp-settings-title">נתוני העסקה</h3>
      <label className="bkp-settings-field" style={{ marginBottom: 13 }}>
        <span>עלות הרכישה (₪)</span>
        <input type="number" min="0" step="1000" value={cost ?? ''}
          onChange={(e) => setCost(e.target.value)} />
      </label>

      <h4 className="bkp-settings-sub">עלויות חד-פעמיות</h4>
      <p className="bkp-settings-note" style={{ marginBottom: 8 }}>
        שימושים מעבר לעלות הרכישה, הנזקפים כולם בשנה הראשונה של התחזית ומשפיעים
        על התזרים, על יחס כיסוי החוב ועל ניתוח הרגישות.
      </p>
      <div className="bkp-costs">
        {costs.map((c, i) => (
          <div className="bkp-cost-row" key={i}>
            <input
              placeholder="שם ההוצאה"
              value={c.name ?? ''}
              onChange={(e) => setCosts(costs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
            />
            <input
              type="number" min="0" step="1000" placeholder="₪"
              value={c.amount ?? ''}
              onChange={(e) => setCosts(costs.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
            />
            <button className="cf-del" title="מחק" onClick={() => setCosts(costs.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button className="tact-btn" onClick={() => setCosts([...costs, { name: '', amount: 0 }])}>
          + הוסף עלות חד-פעמית
        </button>
      </div>

      <p className="bkp-settings-note" style={{ margin: '12px 0 11px' }}>
        האשראי המבוקש נלקח מסכום ההלוואה שבלשונית תזרים, כדי שלא יהיו שני מקורות
        לאותו מספר. שיעור הגידול השנתי נקבע פר-אתר בלשונית תזרים בניינים.
      </p>
      {err && <p className="bkp-neg" style={{ marginBottom: 9 }}>שמירת הנתונים נכשלה: {err}</p>}
      <button className="tact-btn tact-btn-primary" onClick={save} disabled={saving}>
        {saving ? 'שומר…' : 'שמור נתונים'}
      </button>
    </div>
  )
}
