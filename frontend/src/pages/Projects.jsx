import { Fragment, useMemo, useState } from 'react'
import TactIcon from '../components/TactIcon.jsx'

// ----- עזרי פורמט -----
const nf = new Intl.NumberFormat('he-IL')
const num = (v) => (v === null || v === undefined || v === '' ? '—' : nf.format(v))
const money = (v) =>
  v === null || v === undefined || v === '' ? '—' : `₪${nf.format(Math.round(v))}`
const txt = (v) => (v === null || v === undefined || v === '' ? '—' : String(v))
const pct = (v) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`)

// שם בסיס לפרויקט (ללא מספרים/סימנים) — לקישור מטענים לבניין
const baseName = (s) =>
  (s || '')
    .replace(/[0-9]/g, '')
    .replace(/[+/\-,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// ----- KPI -----
function Kpi({ label, value, delta }) {
  return (
    <div className="tact-kpi">
      <div className="tact-kpi-label">{label}</div>
      <div className="tact-kpi-val">{value}</div>
      {delta && <div className="tact-delta tact-delta-up">{delta}</div>}
    </div>
  )
}

// ----- פאנל: מטענים לפי עיר -----
function CityBars({ byCity }) {
  const entries = Object.entries(byCity || {}).sort((a, b) => b[1] - a[1])
  const max = Math.max(1, ...entries.map(([, n]) => n))
  return (
    <div className="pr-panel">
      <h3 className="pr-panel-title">
        <TactIcon name="bolt" size={16} /> מטענים לפי עיר
      </h3>
      <div className="pr-bars">
        {entries.map(([city, n]) => (
          <div className="pr-bar-row" key={city}>
            <span className="pr-bar-label">{city}</span>
            <div className="pr-bar-track">
              <div className="pr-bar-fill" style={{ width: `${(n / max) * 100}%` }} />
            </div>
            <span className="pr-bar-val">{num(n)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ----- פאנל: התפלגות דיירים + הכנסות -----
function SidePanels({ chargers, summary }) {
  const owners = chargers.filter((c) => c.tenant_status === 'בעלים').length
  const renters = chargers.filter((c) => c.tenant_status === 'שוכר').length
  const tot = owners + renters || 1
  return (
    <>
      <div className="pr-panel">
        <h3 className="pr-panel-title">
          <TactIcon name="users" size={16} /> סטטוס דיירים
        </h3>
        <div className="pr-split">
          <div className="pr-split-bar">
            <div
              className="pr-split-owners"
              style={{ width: `${(owners / tot) * 100}%` }}
            />
            <div
              className="pr-split-renters"
              style={{ width: `${(renters / tot) * 100}%` }}
            />
          </div>
          <div className="pr-split-legend">
            <span>
              <i className="pr-dot pr-dot-owners" /> בעלים — {num(owners)}
            </span>
            <span>
              <i className="pr-dot pr-dot-renters" /> שוכרים — {num(renters)}
            </span>
          </div>
        </div>
      </div>

      <div className="pr-panel">
        <h3 className="pr-panel-title">
          <TactIcon name="trending" size={16} /> הכנסה חודשית
        </h3>
        <table className="pr-rev">
          <tbody>
            <tr>
              <td>דמי ניהול + עמלת חשמל</td>
              <td>{money(summary.rev_ongoing_total)}</td>
            </tr>
            <tr>
              <td>תוספת 10% מיוחדות</td>
              <td>{money(summary.rev_special_10)}</td>
            </tr>
            <tr>
              <td>תוכנת ניהול</td>
              <td>{money(summary.rev_software)}</td>
            </tr>
            <tr className="pr-rev-total">
              <td>סה"כ חודשי</td>
              <td>{money(summary.rev_grand_total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  )
}

// ----- שורת בניין (נפתחת) -----
const FIELDS = [
  ['conn_size', 'גודל חיבור חשמל'],
  ['power_avail', 'חשמל זמין'],
  ['residents', 'דיירים'],
  ['park_base', 'חניות מרתף'],
  ['park_surface', 'חניות עיליות'],
  ['park_total', 'סה"כ חניות'],
  ['commit_years', 'התחייבות (שנים)'],
  ['years_left', 'שנים שנותרו'],
  ['cost_infra', 'עלות תשתיות ללקוח'],
  ['cost_charger', 'עלות מטען ללקוח'],
  ['monthly_fee', 'מנוי חודשי'],
  ['mgmt_fee_agora', 'עמלת ניהול (אג׳/קוט״ש)'],
  ['monthly_fee_plugin', 'מנוי חודשי — פלאג אין'],
  ['mgmt_fee_plugin', 'עמלת ניהול — פלאג אין'],
  ['min_kwh_plugin', 'מינ׳ קוט״ש — פלאג אין'],
]

const CH_COLS = [
  ['customer', 'שם לקוח'],
  ['park_no', 'חניה'],
  ['tenant_status', 'דייר'],
  ['vehicle_type', 'רכב'],
  ['install_date', 'תאריך התקנה'],
  ['has_rcd', 'פחת'],
  ['warranty_status', 'אחריות'],
  ['comm_type', 'תקשורת'],
  ['notes', 'הערות'],
]

function BuildingDetail({ b, chargers }) {
  return (
    <div className="ta-detail">
      <div className="ta-detail-grid">
        {FIELDS.map(([k, label]) => (
          <div className="ta-field" key={k}>
            <span className="ta-field-label">{label}</span>
            <span>{txt(b[k])}</span>
          </div>
        ))}
      </div>
      {b.followup_notes && (
        <div className="ta-flags">
          <strong>פרויקט המשך:</strong> {b.followup_notes}
        </div>
      )}

      <h4 className="pr-ch-title">
        מטענים בפרויקט ({chargers.length})
      </h4>
      {chargers.length === 0 ? (
        <p className="muted">לא נמצאו מטענים תואמים בלשונית המטענים.</p>
      ) : (
        <div className="pr-ch-wrap">
          <table className="pr-ch-table">
            <thead>
              <tr>
                {CH_COLS.map(([k, l]) => (
                  <th key={k}>{l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chargers.map((c, i) => (
                <tr key={i}>
                  {CH_COLS.map(([k]) => (
                    <td key={k}>{txt(c[k])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function Projects({ data, loading }) {
  const buildings = data?.buildings || []
  const chargers = data?.chargers || []
  const summary = data?.summary || {}
  const [open, setOpen] = useState(null)
  const [city, setCity] = useState('all')

  // אינדקס מטענים לפי שם-בסיס של פרויקט
  const chargersByBase = useMemo(() => {
    const m = {}
    for (const c of chargers) {
      const k = baseName(c.project)
      ;(m[k] ||= []).push(c)
    }
    return m
  }, [chargers])

  const cities = useMemo(
    () => ['all', ...Array.from(new Set(buildings.map((b) => b.city).filter(Boolean)))],
    [buildings],
  )
  const shown = city === 'all' ? buildings : buildings.filter((b) => b.city === city)

  const installed = chargers.filter((c) => c.install_date).length

  if (loading) return <p className="muted">טוען…</p>

  if (buildings.length === 0)
    return (
      <section>
        <div className="ta-empty">
          <TactIcon name="dashboard" size={28} />
          <p>אין עדיין נתוני פרויקטים. יש להעלות את קובץ הנתונים לשרת.</p>
        </div>
      </section>
    )

  return (
    <section>
      <div className="ta-head">
        <h1 className="home-title">סטטוס פרויקטים</h1>
        <span className="tact-badge tact-badge-on">{buildings.length} פרויקטים</span>
      </div>
      <p className="home-sub">
        תמונה כללית מתוך נתוני החברה, ולחיצה על כל פרויקט פותחת את מלוא הפרטים והמטענים.
      </p>

      {/* ----- KPI ----- */}
      <div className="kpi-grid">
        <Kpi label="פרויקטים" value={num(buildings.length)} />
        <Kpi label="בניינים חתומים" value={num(summary.total_buildings_signed)} />
        <Kpi
          label="מטענים מותקנים"
          value={num(summary.total_chargers_signed ?? installed)}
        />
        <Kpi label="דיירים" value={num(summary.total_residents)} />
        <Kpi label='סה"כ חניות' value={num(summary.parking_total)} />
        <Kpi label="מימוש פוטנציאל" value={pct(summary.realization_pct)} />
        <Kpi
          label="הכנסה חודשית"
          value={money(summary.rev_grand_total)}
          delta="כולל תוספות"
        />
        <Kpi label="עלות תשתיות" value={money(summary.infra_cost_total)} />
      </div>

      {/* ----- פאנלים ----- */}
      <div className="pr-panels">
        <CityBars byCity={summary.chargers_by_city} />
        <SidePanels chargers={chargers} summary={summary} />
      </div>

      {/* ----- טבלת פרויקטים ----- */}
      <h2 className="block-title">פירוט פרויקטים</h2>
      <div className="filter-row">
        {cities.map((c) => (
          <button
            key={c}
            className={`filter-pill ${city === c ? 'active' : ''}`}
            onClick={() => setCity(c)}
          >
            {c === 'all' ? 'כל הערים' : c}
          </button>
        ))}
      </div>

      <table className="ta-table">
        <thead>
          <tr>
            <th className="ta-expander" />
            <th>מס"ד</th>
            <th>פרויקט</th>
            <th>עיר</th>
            <th>בניינים</th>
            <th>מטענים</th>
            <th>דיירים</th>
            <th>תאריך חתימה</th>
            <th>הסכם</th>
            <th>הכנסה חודשית</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((b) => {
            const isOpen = open === b.idx
            const bch = chargersByBase[baseName(b.project)] || []
            const rev = (b.rev_mgmt_monthly || 0) + (b.rev_elec_fee || 0)
            return (
              <Fragment key={b.idx}>
                <tr
                  className={`ta-row ${isOpen ? 'open' : ''}`}
                  onClick={() => setOpen(isOpen ? null : b.idx)}
                >
                  <td className="ta-expander">
                    <span className={`ta-chevron ${isOpen ? 'open' : ''}`}>▸</span>
                  </td>
                  <td>{b.idx}</td>
                  <td>
                    <strong>{txt(b.project)}</strong>
                  </td>
                  <td>{txt(b.city)}</td>
                  <td>{num(b.buildings)}</td>
                  <td>{num(b.chargers_installed)}</td>
                  <td>{num(b.residents)}</td>
                  <td>{txt(b.sign_date)}</td>
                  <td style={{ textAlign: 'center', fontWeight: 700, color: b.has_agreement ? '#22a06b' : '#e2483d' }}>
                    {b.has_agreement === undefined ? '—' : b.has_agreement ? '✓' : '✗'}
                  </td>
                  <td>{rev ? money(rev) : '—'}</td>
                </tr>
                {isOpen && (
                  <tr className="ta-detail-row">
                    <td colSpan={10}>
                      <BuildingDetail b={b} chargers={bch} />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
        {shown.length > 0 && (() => {
          const totBuildings = shown.reduce((s, b) => s + (b.buildings || 0), 0)
          const totChargers  = shown.reduce((s, b) => s + (b.chargers_installed || 0), 0)
          const totResidents = shown.reduce((s, b) => s + (b.residents || 0), 0)
          const totRev       = shown.reduce((s, b) => s + (b.rev_mgmt_monthly || 0) + (b.rev_elec_fee || 0), 0)
          return (
            <tfoot>
              <tr style={{ fontWeight: 700, borderTop: '2px solid #c0c8d8' }}>
                <td />
                <td />
                <td>סה"כ ({shown.length} פרויקטים)</td>
                <td />
                <td>{num(totBuildings)}</td>
                <td>{num(totChargers)}</td>
                <td>{num(totResidents)}</td>
                <td />
                <td />
                <td>{money(totRev)}</td>
              </tr>
            </tfoot>
          )
        })()}
      </table>

      {data?.source_file && (
        <p className="ta-source muted">מקור הנתונים: {data.source_file}</p>
      )}
    </section>
  )
}
