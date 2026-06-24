import { useState } from 'react'
import TactIcon from '../components/TactIcon.jsx'
import { api } from '../api/client.js'
import {
  CATEGORIES,
  CATEGORY_LABEL,
  STATUSES,
  STATUS_BADGE,
} from '../constants.js'

export default function Tasks({ tasks, loading, onChange }) {
  const [filter, setFilter] = useState('all')
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ category: 'tenant_agreement', title: '' })

  const shown =
    filter === 'all' ? tasks : tasks.filter((t) => t.category === filter)

  async function changeStatus(task, status) {
    await api.updateTask(task.id, { status })
    onChange()
  }

  async function addTask(e) {
    e.preventDefault()
    if (!draft.title.trim()) return
    await api.createTask(draft)
    setDraft({ category: draft.category, title: '' })
    setAdding(false)
    onChange()
  }

  return (
    <section>
      <div className="tasks-head">
        <h1 className="home-title">רשימת מטלות</h1>
        <button
          className="tact-btn tact-btn-primary"
          onClick={() => setAdding((v) => !v)}
        >
          <TactIcon name="plus" size={16} /> מטלה חדשה
        </button>
      </div>

      {/* סינון לפי קטגוריה */}
      <div className="filter-row">
        <button
          className={`filter-pill ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          הכל
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            className={`filter-pill ${filter === c.key ? 'active' : ''}`}
            onClick={() => setFilter(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* טופס הוספה */}
      {adding && (
        <form className="add-form" onSubmit={addTask}>
          <select
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          >
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            autoFocus
            placeholder="תיאור המטלה…"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          <button className="tact-btn tact-btn-primary" type="submit">
            הוסף
          </button>
        </form>
      )}

      {/* טבלת מטלות */}
      {loading ? (
        <p className="muted">טוען…</p>
      ) : shown.length === 0 ? (
        <p className="muted">אין מטלות בקטגוריה זו.</p>
      ) : (
        <table className="tasks-table">
          <thead>
            <tr>
              <th>קטגוריה</th>
              <th>מטלה</th>
              <th>סטטוס</th>
              <th>שינוי סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((t) => (
              <tr key={t.id}>
                <td className="muted">{CATEGORY_LABEL[t.category]}</td>
                <td>{t.title}</td>
                <td>
                  <span className={`tact-badge ${STATUS_BADGE[t.status]}`}>
                    {STATUSES.find((s) => s.key === t.status)?.label}
                  </span>
                </td>
                <td>
                  <select
                    value={t.status}
                    onChange={(e) => changeStatus(t, e.target.value)}
                  >
                    {STATUSES.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
