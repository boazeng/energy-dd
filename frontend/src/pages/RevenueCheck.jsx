import { useState } from 'react'
import { api } from '../api/client.js'

const MONTH_OPTIONS = [
  { value: '2026-05', label: 'מאי 2026' },
  { value: '2026-04', label: 'אפריל 2026' },
  { value: '2026-03', label: 'מרץ 2026' },
  { value: '2026-02', label: 'פברואר 2026' },
  { value: '2026-01', label: 'ינואר 2026' },
]

const STATUS_COLOR = {
  'תואם':             '#28a745',
  'חוסר':            '#dc3545',
  'עודף':            '#fd7e14',
  'לא נמצא במערכת':  '#6c757d',
  'לא ב-וויבו':      '#6c757d',
  'סטייה':           '#dc3545',
  'לא נמצא':         '#6c757d',
}

function StatusBadge({ status }) {
  const color = STATUS_COLOR[status] || '#6c757d'
  return (
    <span style={{
      background: color + '22', color, border: `1px solid ${color}55`,
      borderRadius: 4, padding: '1px 7px', fontSize: 12, whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  )
}

// ─── השוואה 1: כמות מטענים ────────────────────────────────────────────────────
function ChargerCompare({ month }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true); setError('')
    try { setData(await api.getRevenueChargerCompare(month)) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const mismatches = data?.rows?.filter(r => r.status !== 'תואם' && r.status !== 'לא ב-וויבו') ?? []

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>השוואה 1 — כמות מטענים לפי אתר</h3>
        <button onClick={load} disabled={loading} style={{ fontSize: 13, padding: '4px 14px' }}>
          {loading ? 'טוען...' : 'טען'}
        </button>
        {data && (
          <span style={{ fontSize: 12, color: '#888' }}>
            {data.rows?.length} אתרים ·{' '}
            <span style={{ color: mismatches.length ? '#dc3545' : '#28a745' }}>
              {mismatches.length} חוסרים/עודפים
            </span>
          </span>
        )}
      </div>

      {error && <div className="app-error" style={{ marginBottom: 10 }}>{error}</div>}

      {data && (
        <div style={{ overflowX: 'auto' }}>
          <table className="tact-table" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th>אתר (וויבו)</th>
                <th>בניין במערכת</th>
                <th style={{ textAlign: 'center' }}>נהגים וויבו</th>
                <th style={{ textAlign: 'center' }}>מטענים מערכת</th>
                <th style={{ textAlign: 'center' }}>הפרש</th>
                <th>סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={i} style={{ background: r.status === 'תואם' ? undefined : '#fff8f0' }}>
                  <td dir="rtl">{r.excel_site}</td>
                  <td dir="rtl" style={{ fontSize: 11, color: '#666' }}>
                    {r.matched_buildings?.join(', ') || '—'}
                  </td>
                  <td style={{ textAlign: 'center' }}>{r.excel_drivers_may ?? '—'}</td>
                  <td style={{ textAlign: 'center' }}>{r.system_chargers ?? '—'}</td>
                  <td style={{
                    textAlign: 'center',
                    fontWeight: r.diff !== 0 ? 700 : undefined,
                    color: r.diff > 0 ? '#fd7e14' : r.diff < 0 ? '#dc3545' : undefined,
                  }}>
                    {r.diff != null ? (r.diff > 0 ? `+${r.diff}` : r.diff) : '—'}
                  </td>
                  <td><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── השוואה 2: עלות חודשית לפי לקוח ─────────────────────────────────────────
function MonthlyFeeCompare({ month }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState('summary')
  const [siteFilter, setSiteFilter] = useState('all')

  async function load() {
    setLoading(true); setError('')
    try { setData(await api.getRevenueMonthlyFees(month)) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const sites = data ? ['all', ...data.site_summary.map(s => s.site)] : ['all']
  const detailRows = data?.rows?.filter(r => siteFilter === 'all' || r.site === siteFilter) ?? []
  const deviations = data?.rows?.filter(r => r.status === 'סטייה').length ?? 0

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>השוואה 2 — עלות חודשית לפי לקוח מול הסכם</h3>
        <button onClick={load} disabled={loading} style={{ fontSize: 13, padding: '4px 14px' }}>
          {loading ? 'טוען...' : 'טען'}
        </button>
        {data && (
          <span style={{ fontSize: 12, color: '#888' }}>
            {data.rows?.length} לקוחות ·{' '}
            <span style={{ color: deviations ? '#dc3545' : '#28a745' }}>{deviations} סטיות</span>
            {' · '}
            <span style={{ fontSize: 11, color: '#856404' }}>סכומי האקסל כוללים מע"מ 18%</span>
          </span>
        )}
      </div>

      {error && <div className="app-error" style={{ marginBottom: 10 }}>{error}</div>}

      {data && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <button className={view === 'summary' ? 'active' : ''} style={{ fontSize: 12, padding: '3px 12px' }} onClick={() => setView('summary')}>סיכום לפי אתר</button>
            <button className={view === 'detail' ? 'active' : ''} style={{ fontSize: 12, padding: '3px 12px' }} onClick={() => setView('detail')}>פירוט לפי לקוח</button>
          </div>

          {view === 'summary' && (
            <div style={{ overflowX: 'auto' }}>
              <table className="tact-table" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>אתר</th><th>בניין</th>
                    <th style={{ textAlign: 'center' }}>לקוחות</th>
                    <th style={{ textAlign: 'center' }}>דמי ניהול מוסכמים</th>
                    <th style={{ textAlign: 'center' }}>תואמים</th>
                    <th style={{ textAlign: 'center' }}>סטיות</th>
                    <th style={{ textAlign: 'center' }}>לא שולם</th>
                  </tr>
                </thead>
                <tbody>
                  {data.site_summary.map((s, i) => (
                    <tr key={i} style={{ background: s.deviation ? '#fff8f0' : undefined }}>
                      <td dir="rtl">
                        <button
                          style={{ background: 'none', border: 'none', color: '#6c8ebf', cursor: 'pointer', fontSize: 13, padding: 0 }}
                          onClick={() => { setSiteFilter(s.site); setView('detail') }}
                        >{s.site}</button>
                      </td>
                      <td dir="rtl" style={{ fontSize: 11, color: '#666' }}>{s.building || '—'}</td>
                      <td style={{ textAlign: 'center' }}>{s.count}</td>
                      <td style={{ textAlign: 'center' }}>
                        {s.expected_fee != null ? `₪${s.expected_fee}` : <span style={{ color: '#888' }}>לא הוגדר</span>}
                      </td>
                      <td style={{ textAlign: 'center', color: '#28a745', fontWeight: 600 }}>{s.match}</td>
                      <td style={{ textAlign: 'center', color: s.deviation ? '#dc3545' : undefined, fontWeight: s.deviation ? 700 : undefined }}>{s.deviation}</td>
                      <td style={{ textAlign: 'center', color: s.unpaid ? '#fd7e14' : undefined }}>{s.unpaid || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {view === 'detail' && (
            <>
              <div style={{ marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ fontSize: 12 }}>סינון אתר:</label>
                <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)} style={{ fontSize: 12 }}>
                  {sites.map(s => <option key={s} value={s}>{s === 'all' ? 'כל האתרים' : s}</option>)}
                </select>
                <span style={{ fontSize: 11, color: '#888' }}>{detailRows.length} שורות</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="tact-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>לקוח</th><th>אתר</th>
                      <th style={{ textAlign: 'center' }}>עלות וויבו (כולל מע"מ)</th>
                      <th style={{ textAlign: 'center' }}>עלות וויבו (ללא מע"מ)</th>
                      <th style={{ textAlign: 'center' }}>דמי ניהול מוסכמים</th>
                      <th style={{ textAlign: 'center' }}>הפרש</th>
                      <th>סטטוס הסכם</th><th>תשלום</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailRows.map((r, i) => (
                      <tr key={i} style={{ background: r.status === 'סטייה' ? '#fff5f5' : undefined }}>
                        <td dir="rtl">{r.driver}</td>
                        <td dir="rtl" style={{ fontSize: 11 }}>{r.site}</td>
                        <td style={{ textAlign: 'center' }}>₪{r.monthly_fee_incl_vat?.toFixed(2)}</td>
                        <td style={{ textAlign: 'center' }}>₪{r.monthly_fee_excl_vat?.toFixed(2)}</td>
                        <td style={{ textAlign: 'center', color: '#666' }}>{r.expected_fee != null ? `₪${r.expected_fee}` : '—'}</td>
                        <td style={{ textAlign: 'center', color: r.diff > 1 ? '#fd7e14' : r.diff < -1 ? '#dc3545' : undefined, fontWeight: Math.abs(r.diff || 0) > 1 ? 700 : undefined }}>
                          {r.diff != null ? (r.diff > 0 ? `+${r.diff}` : r.diff) : '—'}
                        </td>
                        <td><StatusBadge status={r.status} /></td>
                        <td>
                          <span style={{ fontSize: 11, color: r.pay_status === 'Paid' ? '#28a745' : '#dc3545' }}>
                            {r.pay_status === 'Paid' ? 'שולם' : r.pay_status || '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

// ─── השוואה 3: תעריף חשמל לפי בניין ─────────────────────────────────────────
function ElectricityCompare({ month }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(null)

  async function load() {
    setLoading(true); setError('')
    try { setData(await api.getRevenueElectricityCompare(month)) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const deviations = data?.rows?.filter(r => r.status === 'סטייה').length ?? 0

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>השוואה 3 — תעריף חשמל (אגורות/קוו"ש) מול הסכם</h3>
        <button onClick={load} disabled={loading} style={{ fontSize: 13, padding: '4px 14px' }}>
          {loading ? 'טוען...' : 'טען'}
        </button>
        {data && (
          <span style={{ fontSize: 12, color: '#888' }}>
            {data.rows?.length} בניינים ·{' '}
            <span style={{ color: deviations ? '#dc3545' : '#28a745' }}>{deviations} סטיות</span>
            {' · '}
            <span style={{ fontSize: 11, color: '#856404' }}>נוסחה: פרימיה÷1.18÷קוו"ש×100</span>
          </span>
        )}
      </div>

      {error && <div className="app-error" style={{ marginBottom: 10 }}>{error}</div>}

      {data && (
        <div style={{ overflowX: 'auto' }}>
          <table className="tact-table" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th>בניין (קובץ)</th>
                <th style={{ textAlign: 'center' }}>קוו"ש</th>
                <th style={{ textAlign: 'center' }}>פרימיה (כולל מע"מ)</th>
                <th style={{ textAlign: 'center' }}>תעריף בפועל (אג')</th>
                <th style={{ textAlign: 'center' }}>תעריף מוסכם (אג')</th>
                <th style={{ textAlign: 'center' }}>הפרש</th>
                <th>סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={i} style={{ background: r.status === 'סטייה' ? '#fff5f5' : r.status === 'תואם' ? undefined : '#f9f9f9' }}>
                  <td dir="rtl">{r.building_excel}</td>
                  <td style={{ textAlign: 'center' }}>{r.kwh?.toFixed(1)}</td>
                  <td style={{ textAlign: 'center' }}>₪{r.premium_incl_vat?.toFixed(2)}</td>
                  <td style={{ textAlign: 'center', fontWeight: 600 }}>{r.actual_rate_agorot}</td>
                  <td style={{ textAlign: 'center', color: '#666' }}>{r.expected_rate_agorot ?? '—'}</td>
                  <td style={{ textAlign: 'center', color: r.diff > 1 ? '#fd7e14' : r.diff < -1 ? '#dc3545' : undefined, fontWeight: Math.abs(r.diff || 0) > 1 ? 700 : undefined }}>
                    {r.diff != null ? (r.diff > 0 ? `+${r.diff}` : r.diff) : '—'}
                  </td>
                  <td><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── השוואה 4: צריכת קוו"ש ממוצעת לבניין ולמטען ──────────────────────────────
function KwhAvgTable() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(null)

  async function load() {
    setLoading(true); setError('')
    try { setData(await api.getRevenueKwhAvg()) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  function toggle(name) {
    setExpanded(prev => prev === name ? null : name)
  }

  const MONTHS_LABELS = {
    '2026-01': 'ינואר', '2026-02': 'פברואר', '2026-03': 'מרץ',
    '2026-04': 'אפריל', '2026-05': 'מאי',
  }

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>צריכה ממוצעת חודשית — קוו"ש לבניין ולמטען</h3>
        <button onClick={load} disabled={loading} style={{ fontSize: 13, padding: '4px 14px' }}>
          {loading ? 'טוען...' : 'טען'}
        </button>
        {data && (
          <span style={{ fontSize: 12, color: '#888' }}>
            {data.buildings?.length} בניינים · ינואר–מאי 2026
          </span>
        )}
      </div>

      {error && <div className="app-error" style={{ marginBottom: 10 }}>{error}</div>}

      {data && (
        <div style={{ overflowX: 'auto' }}>
          <table className="tact-table" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ width: 28 }} />
                <th>בניין</th>
                <th style={{ textAlign: 'center' }}>מטענים</th>
                <th
                  style={{ textAlign: 'center', cursor: 'default', color: '#6c8ebf' }}
                  title="לחץ על הנתון לפירוט חודשי"
                >
                  ממוצע קוו"ש/חודש ▾
                </th>
                <th style={{ textAlign: 'center', color: '#6c8ebf' }}>ממוצע קוו"ש/מטען</th>
              </tr>
            </thead>
            <tbody>
              {data.buildings.map((b, i) => (
                <>
                  <tr
                    key={b.building_excel}
                    style={{ background: expanded === b.building_excel ? '#f0f4ff' : undefined, cursor: 'pointer' }}
                    onClick={() => toggle(b.building_excel)}
                  >
                    <td style={{ textAlign: 'center', color: '#6c8ebf', fontSize: 11 }}>
                      {expanded === b.building_excel ? '▲' : '▼'}
                    </td>
                    <td dir="rtl">{b.building_excel}</td>
                    <td style={{ textAlign: 'center' }}>{b.current_chargers ?? '—'}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600, color: '#2a5298' }}>
                      {b.avg_monthly_kwh != null ? b.avg_monthly_kwh.toLocaleString() : '—'}
                    </td>
                    <td style={{ textAlign: 'center', color: '#555' }}>
                      {b.avg_kwh_per_charger != null ? b.avg_kwh_per_charger.toLocaleString() : '—'}
                    </td>
                  </tr>
                  {expanded === b.building_excel && (
                    <tr key={b.building_excel + '_detail'}>
                      <td colSpan={5} style={{ padding: '0 0 0 32px', background: '#f7f9ff' }}>
                        <table style={{ fontSize: 12, width: '100%', borderCollapse: 'collapse', margin: '6px 0' }}>
                          <thead>
                            <tr style={{ background: '#e8edf8' }}>
                              <th style={{ padding: '4px 10px', textAlign: 'right' }}>חודש</th>
                              <th style={{ padding: '4px 10px', textAlign: 'center' }}>קוו"ש</th>
                              <th style={{ padding: '4px 10px', textAlign: 'center' }}>קוו"ש למטען</th>
                            </tr>
                          </thead>
                          <tbody>
                            {b.months.map(m => (
                              <tr key={m.month} style={{ borderBottom: '1px solid #dde3f0' }}>
                                <td style={{ padding: '3px 10px', textAlign: 'right' }}>
                                  {MONTHS_LABELS[m.month] || m.month}
                                </td>
                                <td style={{ padding: '3px 10px', textAlign: 'center' }}>
                                  {m.kwh ? m.kwh.toLocaleString() : '—'}
                                </td>
                                <td style={{ padding: '3px 10px', textAlign: 'center', color: '#555' }}>
                                  {m.kwh_per_charger != null ? m.kwh_per_charger.toLocaleString() : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── ראשי ─────────────────────────────────────────────────────────────────────
export default function RevenueCheck() {
  const [month, setMonth] = useState('2026-05')

  return (
    <div dir="rtl">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>בדיקת הכנסות</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 13 }}>חודש:</label>
          <select value={month} onChange={e => setMonth(e.target.value)} style={{ fontSize: 13 }}>
            {MONTH_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <span style={{ fontSize: 12, color: '#888' }}>מקור: פלט וויבו מפורט לקוח · SharePoint</span>
      </div>

      <ChargerCompare month={month} />
      <MonthlyFeeCompare month={month} />
      <ElectricityCompare month={month} />
      <KwhAvgTable />
    </div>
  )
}
