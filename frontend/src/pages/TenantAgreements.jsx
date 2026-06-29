import { Fragment, useEffect, useState } from 'react'
import TactIcon from '../components/TactIcon.jsx'
import { api } from '../api/client.js'

const COLUMNS = [
  { key: 'building',      label: 'בניין' },
  { key: 'term',          label: 'תקופה' },
  { key: 'payment',       label: 'עלות מנוי' },
  { key: 'pricing_model', label: 'עלות חשמל' },
  { key: 'charger_cost',  label: 'רכישה והתקנת מטען' },
  { key: 'notes',         label: 'הערות / אי-התאמות' },
  { key: '_file',         label: 'קובץ ההסכם',  type: 'file' },
  { key: 'review_notes',  label: 'הערות סקירה', type: 'editable' },
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
  const [localAgreements, setLocalAgreements] = useState(agreements)
  const [editing, setEditing] = useState(null) // { id, value }
  const [saving, setSaving] = useState(null)   // agreement id being saved

  useEffect(() => {
    setLocalAgreements(agreements)
  }, [agreements])

  function startEdit(id, current, e) {
    e.stopPropagation()
    setEditing({ id, value: current || '' })
  }

  async function saveEdit(id) {
    if (!editing || editing.id !== id) return
    const value = editing.value
    setEditing(null)
    try {
      setSaving(id)
      await api.updateAgreement(id, { review_notes: value })
      setLocalAgreements((prev) =>
        prev.map((a) => (a.id === id ? { ...a, review_notes: value } : a))
      )
    } catch (e) {
      console.error('שגיאה בשמירה', e)
    } finally {
      setSaving(null)
    }
  }

  function renderCell(a, c) {
    if (c.type === 'file') {
      return (
        <td key={c.key} onClick={(e) => e.stopPropagation()}>
          {a.source_url ? (
            <a
              href={a.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="ta-file-link"
              title={a.source_file || 'פתח חוזה'}
            >
              <TactIcon name="link" size={14} />
              <span>{a.source_file || 'פתח'}</span>
            </a>
          ) : a.source_file ? (
            <span className="muted">{a.source_file}</span>
          ) : (
            '—'
          )}
        </td>
      )
    }

    if (c.type === 'editable') {
      const isEditing = editing?.id === a.id
      const isSaving = saving === a.id
      return (
        <td
          key={c.key}
          className={`ta-cell-editable${isEditing ? ' editing' : ''}`}
          onClick={(e) => !isEditing && startEdit(a.id, a.review_notes, e)}
          title={isEditing ? '' : 'לחץ לעריכה'}
        >
          {isEditing ? (
            <textarea
              className="ta-review-input"
              autoFocus
              value={editing.value}
              onChange={(e) => setEditing((prev) => ({ ...prev, value: e.target.value }))}
              onBlur={() => saveEdit(a.id)}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Escape') setEditing(null)
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  saveEdit(a.id)
                }
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : isSaving ? (
            <span className="muted">שומר…</span>
          ) : a.review_notes ? (
            a.review_notes
          ) : (
            <span className="ta-edit-hint">לחץ לעריכה</span>
          )}
        </td>
      )
    }

    const val = a[c.key] || '—'
    const isNote = c.key === 'notes' && val && val !== '—'
    return (
      <td key={c.key} className={isNote ? 'ta-cell-warn' : ''}>
        {val}
      </td>
    )
  }

  return (
    <section>
      <div className="ta-head">
        <h1 className="home-title">הסכמי דיירים</h1>
        <span className="tact-badge tact-badge-on">
          {loading ? '—' : `${localAgreements.length} הסכמים`}
        </span>
      </div>
      <p className="home-sub">
        סיכום ההסכמים המרכזיים. לחיצה על שורה פותחת את מלוא הפרטים.
      </p>

      {loading ? (
        <p className="muted">טוען…</p>
      ) : localAgreements.length === 0 ? (
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
            {localAgreements.map((a) => {
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
                    {COLUMNS.map((c) => renderCell(a, c))}
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
