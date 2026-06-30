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
  const [editId, setEditId] = useState(null)
  const [editDraft, setEditDraft] = useState({})

  const shown = filter === 'all' ? tasks : tasks.filter((t) => t.category === filter)

  async function addTask(e) {
    e.preventDefault()
    if (!draft.title.trim()) return
    await api.createTask(draft)
    setDraft({ category: draft.category, title: '' })
    setAdding(false)
    onChange()
  }

  async function changeStatus(task, status) {
    await api.updateTask(task.id, { status })
    onChange()
  }

  function startEdit(task) {
    setEditId(task.id)
    setEditDraft({ title: task.title, category: task.category })
  }

  function cancelEdit() {
    setEditId(null)
    setEditDraft({})
  }

  async function saveEdit(task) {
    if (!editDraft.title?.trim()) return
    await api.updateTask(task.id, editDraft)
    setEditId(null)
    setEditDraft({})
    onChange()
  }

  async function deleteTask(id) {
    if (!window.confirm('למחוק את המטלה?')) return
    await api.deleteTask(id)
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

      {adding && (
        <form className="add-form" onSubmit={addTask}>
          <select
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          >
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
          <input
            autoFocus
            placeholder="תיאור המטלה…"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          <button className="tact-btn tact-btn-primary" type="submit">הוסף</button>
          <button className="tact-btn" type="button" onClick={() => setAdding(false)}>ביטול</button>
        </form>
      )}

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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((t) =>
              editId === t.id ? (
                <tr key={t.id} className="edit-row">
                  <td>
                    <select
                      value={editDraft.category}
                      onChange={(e) => setEditDraft({ ...editDraft, category: e.target.value })}
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.key} value={c.key}>{c.label}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      autoFocus
                      value={editDraft.title}
                      onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit(t)
                        if (e.key === 'Escape') cancelEdit()
                      }}
                      style={{ width: '100%' }}
                    />
                  </td>
                  <td colSpan={2}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="tact-btn tact-btn-primary" onClick={() => saveEdit(t)}>שמור</button>
                      <button className="tact-btn" onClick={cancelEdit}>ביטול</button>
                    </div>
                  </td>
                  <td></td>
                </tr>
              ) : (
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
                        <option key={s.key} value={s.key}>{s.label}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="cf-del"
                        title="ערוך מטלה"
                        onClick={() => startEdit(t)}
                        style={{ opacity: 0.7 }}
                      >
                        ✎
                      </button>
                      <button
                        className="cf-del"
                        title="מחק מטלה"
                        onClick={() => deleteTask(t.id)}
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      )}
    </section>
  )
}
