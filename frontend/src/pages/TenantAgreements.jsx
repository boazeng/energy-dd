import { Fragment, useRef, useState } from 'react'
import TactIcon from '../components/TactIcon.jsx'
import { api } from '../api/client.js'

// עמודות קריאה-בלבד
const READ_COLS = [
  { key: 'building', label: 'בניין' },
  { key: 'term',     label: 'תקופה' },
]

// עמודות הניתנות לעריכה ידנית
const EDIT_COLS = [
  { key: 'payment',       label: 'עלות מנוי',            placeholder: 'למשל ₪40/חודש' },
  { key: 'pricing_model', label: 'עלות חשמל',            placeholder: 'למשל חח"י + 30 אג׳' },
  { key: 'charger_cost',  label: 'רכישה והתקנת מטען',    placeholder: 'למשל ₪2,000' },
  { key: 'notes',         label: 'הערות עדכון',          placeholder: 'פירוט השינוי…' },
]

const ALL_COLS = [...READ_COLS, ...EDIT_COLS]
const EDITABLE_KEYS = new Set(EDIT_COLS.map((c) => c.key))

function ExpandedRow({ a }) {
  return (
    <div className="ta-detail">
      {a.summary && <p className="ta-summary">{a.summary}</p>}
      <div className="ta-detail-grid">
        {a.address     && <Field label="כתובת"        value={a.address} />}
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

// תא עריכה inline
function EditableCell({ value, placeholder, onSave, onClick }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef(null)

  function startEdit(e) {
    e.stopPropagation()
    setDraft(value)
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  async function commit() {
    setEditing(false)
    if (draft !== value) await onSave(draft)
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit() }
    if (e.key === 'Escape') { setEditing(false); setDraft(value) }
    e.stopPropagation()
  }

  if (editing) {
    return (
      <td className="ta-edit-cell" onClick={(e) => e.stopPropagation()}>
        <textarea
          ref={inputRef}
          className="ta-edit-input"
          value={draft}
          placeholder={placeholder}
          rows={2}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
      </td>
    )
  }

  const hasValue = value && value !== '—'
  return (
    <td
      className={`ta-editable-cell ${hasValue ? '' : 'ta-cell-empty'}`}
      onClick={startEdit}
      title="לחץ לעריכה"
    >
      <span className="ta-cell-text">{value || '—'}</span>
      <span className="ta-edit-icon">✎</span>
    </td>
  )
}

function initialOpen() {
  const v = new URLSearchParams(window.location.search).get('open')
  return v ? Number(v) : null
}

export default function TenantAgreements({ agreements, loading, onChange }) {
  const [open, setOpen] = useState(initialOpen)

  async function save(id, field, value) {
    await api.updateAgreement(id, { [field]: value })
    if (onChange) onChange()
  }

  return (
    <section>
      <div className="ta-head">
        <h1 className="home-title">הסכמי דיירים</h1>
        <span className="tact-badge tact-badge-on">
          {loading ? '—' : `${agreements.length} הסכמים`}
        </span>
      </div>
      <p className="home-sub">
        לחיצה על שורה פותחת פרטים מורחבים. לחיצה על תא <strong>עריכה</strong> (✎) מאפשרת עדכון ידני.
      </p>

      {loading ? (
        <p className="muted">טוען…</p>
      ) : agreements.length === 0 ? (
        <div className="ta-empty">
          <TactIcon name="document" size={28} />
          <p>אין עדיין הסכמים.</p>
        </div>
      ) : (
        <table className="ta-table">
          <thead>
            <tr>
              <th className="ta-expander" />
              {ALL_COLS.map((c) => (
                <th key={c.key}>
                  {c.label}
                  {EDITABLE_KEYS.has(c.key) && (
                    <span className="ta-editable-badge"> ✎</span>
                  )}
                </th>
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

                    {/* עמודות קריאה בלבד */}
                    {READ_COLS.map((c) => (
                      <td key={c.key}>{a[c.key] || '—'}</td>
                    ))}

                    {/* עמודות עריכה */}
                    {EDIT_COLS.map((c) => (
                      <EditableCell
                        key={c.key}
                        value={a[c.key] || ''}
                        placeholder={c.placeholder}
                        onSave={(val) => save(a.id, c.key, val)}
                      />
                    ))}
                  </tr>

                  {isOpen && (
                    <tr className="ta-detail-row">
                      <td colSpan={ALL_COLS.length + 1}>
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
