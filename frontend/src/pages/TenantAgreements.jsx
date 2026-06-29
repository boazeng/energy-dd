import { Fragment, useState } from 'react'
import TactIcon from '../components/TactIcon.jsx'

const COLUMNS = [
  { key: 'building',      label: 'בניין' },
  { key: 'term',          label: 'תקופה' },
  { key: 'payment',       label: 'עלות מנוי' },
  { key: 'pricing_model', label: 'עלות חשמל' },
  { key: 'charger_cost',  label: 'רכישה והתקנת מטען' },
  { key: 'notes',         label: 'הערות / אי-התאמות' },
]

function ExpandedRow({ a }) {
  return (
    <div className="ta-detail">
      {a.summary && <p className="ta-summary">{a.summary}</p>}
      <div className="ta-detail-grid">
        {a.address    && <Field label="כתובת"       value={a.address} />}
        {a.termination && <Field label="סיום / חידוש" value={a.termination} />}
        {a.tenant_name && <Field label="נציג / חותם"  value={a.tenant_name} />}
      </div>
      {a.flags && (
        <div className="ta-flags">
          <strong>נקודות לתשומת לב:</strong> {a.flags}
        </div>
      )}
      {a.details?.length > 0 && (
        <div className="ta-sections">
          {a.details.map((s, i) => (
            <div className="ta-section" key={i}>
              <h4>{s.title}</h4>
              <p>{s.content}</p>
            </div>
          ))}
        </div>
      )}
      {(a.source_url || a.source_file) && (
        <p className="ta-source">
          {a.source_url ? (
            <a
              href={a.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="ta-source-link"
            >
              <TactIcon name="link" size={15} />
              פתח את החוזה ב-SharePoint
              {a.source_file ? ` — ${a.source_file}` : ''}
            </a>
          ) : (
            <span className="muted">מקור: {a.source_file}</span>
          )}
        </p>
      )}
    </div>
  )
}

function Field({ label, value }) {
  return (
    <div className="ta-field">
      <span className="ta-field-label">{label}</span>
      <span>{value}</span>
    </div>
  )
}

function initialOpen() {
  const v = new URLSearchParams(window.location.search).get('open')
  return v ? Number(v) : null
}

export default function TenantAgreements({ agreements, loading }) {
  const [open, setOpen] = useState(initialOpen)

  return (
    <section>
      <div className="ta-head">
        <h1 className="home-title">הסכמי דיירים</h1>
        <span className="tact-badge tact-badge-on">
          {loading ? '—' : `${agreements.length} הסכמים`}
        </span>
      </div>
      <p className="home-sub">
        סיכום ההסכמים המרכזיים. לחיצה על שורה פותחת את מלוא הפרטים.
      </p>

      {loading ? (
        <p className="muted">טוען…</p>
      ) : agreements.length === 0 ? (
        <div className="ta-empty">
          <TactIcon name="document" size={28} />
          <p>אין עדיין הסכמים. לאחר הוספת הסכמים הם יופיעו כאן.</p>
        </div>
      ) : (
        <table className="ta-table">
          <thead>
            <tr>
              <th className="ta-expander" />
              {COLUMNS.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agreements.map((a) => {
              const isOpen = open === a.id
              return (
                <Fragment key={a.id}>
                  <tr
                    className={`ta-row ${isOpen ? 'open' : ''}`}
                    onClick={() => setOpen(isOpen ? null : a.id)}
                  >
                    <td className="ta-expander">
                      <span className={`ta-chevron ${isOpen ? 'open' : ''}`}>▸</span>
                    </td>
                    {COLUMNS.map((c) => {
                      const val = a[c.key] || '—'
                      const isNote = c.key === 'notes' && val && val !== '—'
                      return (
                        <td key={c.key} className={isNote ? 'ta-cell-warn' : ''}>
                          {val}
                        </td>
                      )
                    })}
                  </tr>
                  {isOpen && (
                    <tr className="ta-detail-row">
                      <td colSpan={COLUMNS.length + 1}>
                        <ExpandedRow a={a} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}
