import TactIcon from '../components/TactIcon.jsx'

const nf = new Intl.NumberFormat('he-IL')

// תא כספי: ריק=—, שלילי=סוגריים+אדום, חיובי=ירוק (בשורות "signed")
function Cell({ v, signed, expense }) {
  if (v === null || v === undefined || v === '')
    return <span className="muted">—</span>
  const neg = v < 0
  const abs = nf.format(Math.abs(v))
  const disp = expense || neg ? `(₪${abs})` : `₪${abs}`
  const cls = signed ? (neg ? 'fin-neg' : 'fin-pos') : ''
  return <span className={cls}>{disp}</span>
}

function FinTable({ title, icon, rows, years }) {
  return (
    <div className="fin-block">
      <h3 className="fin-block-title">
        <TactIcon name={icon} size={17} /> {title}
      </h3>
      <div className="fin-table-wrap">
        <table className="fin-table">
          <thead>
            <tr>
              <th className="fin-rowlabel">סעיף</th>
              {years.map((y) => (
                <th key={y.key}>
                  {y.label}
                  <span className="fin-basis">{y.basis}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={r.total ? 'fin-total' : ''}>
                <td className="fin-rowlabel">
                  {r.flag && <span className="fin-flag-dot" title="לתשומת לב" />}
                  {r.label}
                </td>
                {years.map((y) => (
                  <td key={y.key}>
                    <Cell v={r.values[y.key]} signed={r.signed} expense={r.expense} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const SEV = {
  high: { cls: 'fin-sev-high', label: 'גבוה' },
  med: { cls: 'fin-sev-med', label: 'בינוני' },
  low: { cls: 'fin-sev-low', label: 'נמוך' },
}

export default function Financials({ data, loading }) {
  if (loading) return <p className="muted">טוען…</p>

  const years = data?.years || []
  const pnl = data?.pnl || []
  const balance = data?.balance || []
  const flags = data?.flags || []
  const highlights = data?.highlights || []
  const c = data?.company || {}

  if (years.length === 0)
    return (
      <section>
        <div className="ta-empty">
          <TactIcon name="reports" size={28} />
          <p>אין עדיין נתונים כספיים. יש להעלות את קובץ הניתוח לשרת.</p>
        </div>
      </section>
    )

  // KPI: רווח נקי + סה"כ הכנסות לכל שנה
  const netRow = pnl.find((r) => r.signed)
  const incomeRow = pnl.find((r) => r.total && !r.signed)

  return (
    <section>
      <div className="ta-head">
        <h1 className="home-title">ניתוח כספי</h1>
        <span className="tact-badge tact-badge-on">{years.length} שנים</span>
      </div>
      <p className="home-sub">
        {c.name} (ח.פ. {c.reg}) · {c.business}. ניתוח לפי שנים מתוך הדוחות המבוקרים
        ומאזני הבוחן.
      </p>

      {/* KPI — רווח נקי לפי שנה */}
      <div className="kpi-grid">
        {years.map((y) => {
          const net = netRow?.values[y.key]
          const inc = incomeRow?.values[y.key]
          return (
            <div className="tact-kpi" key={y.key}>
              <div className="tact-kpi-label">
                רווח נקי · {y.label}
              </div>
              <div className={`tact-kpi-val ${net < 0 ? 'fin-neg' : 'fin-pos'}`}>
                {net === null || net === undefined
                  ? '—'
                  : `${net < 0 ? '−' : ''}₪${nf.format(Math.abs(net))}`}
              </div>
              <div className="tact-delta">הכנסות ₪{nf.format(inc)}</div>
            </div>
          )
        })}
      </div>

      {/* תובנות */}
      {highlights.length > 0 && (
        <div className="fin-highlights">
          {highlights.map((h, i) => (
            <div className="fin-highlight" key={i}>
              <TactIcon name="trending" size={16} />
              <div>
                <strong>{h.title}</strong>
                <p>{h.text}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <FinTable title="רווח והפסד" icon="reports" rows={pnl} years={years} />
      <FinTable title="מאזן" icon="database" rows={balance} years={years} />

      {/* דגלים אדומים */}
      <h2 className="block-title">ממצאי בדיקת נאותות</h2>
      <div className="fin-flags">
        {flags.map((f, i) => {
          const s = SEV[f.severity] || SEV.low
          return (
            <div className={`fin-flag-card ${s.cls}`} key={i}>
              <div className="fin-flag-head">
                <strong>{f.title}</strong>
                <span className="fin-sev-badge">{s.label}</span>
              </div>
              <p>{f.text}</p>
            </div>
          )
        })}
      </div>

      {data?.source_files?.length > 0 && (
        <p className="ta-source muted">
          מקורות: {data.source_files.join(' · ')}
          {c.auditor ? ` · רו"ח מבקר: ${c.auditor}` : ''}
        </p>
      )}
    </section>
  )
}
