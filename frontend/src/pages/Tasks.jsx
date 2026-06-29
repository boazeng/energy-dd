import { useState } from 'react'
import TactIcon from '../components/TactIcon.jsx'
import { api } from '../api/client.js'
import {
  CATEGORIES,
  CATEGORY_LABEL,
  STATUSES,
  STATUS_BADGE,
} from '../constants.js'

const PAGE_LABELS = {
  home: 'בית',
  projects: 'סטטוס פרויקטים',
  financials: 'ניתוח כספי',
  cashflow: 'תזרים',
  'building-cashflow': 'תזרים בניינים',
  tasks: 'רשימת מטלות',
  agreements: 'הסכמי דיירים',
}

const Q_STATUS_LABEL = { open: 'פתוחה', answered: 'נענתה' }
const Q_STATUS_BADGE = { open: 'tact-badge-soon', answered: 'tact-badge-pos' }

export default function Tasks({ tasks, questions, loading, onChange, onQuestionsChange }) {
  const [filter, setFilter] = useState('all')
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ category: 'tenant_agreement', title: '' })
  const [expandedImg, setExpandedImg] = useState(null)
  const [editAnswer, setEditAnswer] = useState({}) // { [id]: string }

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

  async function changeQStatus(q, status) {
    await api.updateQuestion(q.id, { status })
    onQuestionsChange()
  }

  async function saveAnswer(q) {
    const answer = editAnswer[q.id] ?? q.answer
    await api.updateQuestion(q.id, { answer, status: answer.trim() ? 'answered' : q.status })
    setEditAnswer((prev) => { const n = { ...prev }; delete n[q.id]; return n })
    onQuestionsChange()
  }

  async function deleteQuestion(id) {
    if (!window.confirm('למחוק את השאלה?')) return
    await api.deleteQuestion(id)
    onQuestionsChange()
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

      {/* ---- שאלות לבירור ---- */}
      <div className="q-section">
        <div className="q-section-head">
          <h2 className="block-title">שאלות לבירור</h2>
          <span className="muted q-count">
            {questions.filter((q) => q.status === 'open').length} פתוחות
            {' · '}
            {questions.length} סה"כ
          </span>
        </div>

        {loading ? (
          <p className="muted">טוען…</p>
        ) : questions.length === 0 ? (
          <p className="muted">
            אין שאלות עדיין — לחץ על כפתור <strong>? שאלה</strong> בפינה התחתונה כדי להוסיף.
          </p>
        ) : (
          <div className="q-table-wrap">
            <table className="tasks-table q-table">
              <thead>
                <tr>
                  <th>עמוד</th>
                  <th>שאלה</th>
                  <th>צילום</th>
                  <th>סטטוס</th>
                  <th>תשובה / הערה</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {questions.map((q) => (
                  <tr key={q.id} className={q.status === 'answered' ? 'q-row-answered' : ''}>
                    <td className="muted q-cell-page">
                      {(PAGE_LABELS[q.page] ?? q.page) || '—'}
                    </td>
                    <td className="q-cell-text">{q.question_text}</td>
                    <td className="q-cell-thumb">
                      {q.screenshot_data ? (
                        <img
                          src={q.screenshot_data}
                          alt="צילום מסך"
                          className="q-thumb"
                          onClick={() => setExpandedImg(q.screenshot_data)}
                          title="לחץ להגדלה"
                        />
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <span className={`tact-badge ${Q_STATUS_BADGE[q.status]}`}>
                        {Q_STATUS_LABEL[q.status]}
                      </span>
                    </td>
                    <td className="q-cell-answer">
                      <div className="q-answer-row">
                        <input
                          className="q-answer-input"
                          placeholder="הזן תשובה…"
                          value={editAnswer[q.id] ?? q.answer}
                          onChange={(e) =>
                            setEditAnswer((prev) => ({ ...prev, [q.id]: e.target.value }))
                          }
                          onBlur={() => {
                            if (editAnswer[q.id] !== undefined) saveAnswer(q)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveAnswer(q)
                          }}
                        />
                        {editAnswer[q.id] !== undefined && (
                          <button
                            className="tact-btn tact-btn-primary q-save-btn"
                            onClick={() => saveAnswer(q)}
                          >
                            שמור
                          </button>
                        )}
                      </div>
                    </td>
                    <td>
                      <button
                        className="cf-del"
                        title="מחק שאלה"
                        onClick={() => deleteQuestion(q.id)}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* תמונה מוגדלת */}
      {expandedImg && (
        <div className="q-lightbox" onClick={() => setExpandedImg(null)}>
          <img src={expandedImg} alt="צילום מסך מוגדל" />
          <button className="q-lightbox-close" onClick={() => setExpandedImg(null)}>✕</button>
        </div>
      )}
    </section>
  )
}
