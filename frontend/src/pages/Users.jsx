import { useEffect, useState } from 'react'
import TactIcon from '../components/TactIcon.jsx'
import { api } from '../api/client.js'

const ROLE_LABEL = { admin: 'מנהל', approver: 'מאשר', user: 'משתמש' }
const ROLE_BADGE = { admin: 'tact-badge-new', approver: 'tact-badge-on', user: 'tact-badge-soon' }

function shortDate(ts) {
  if (!ts) return '—'
  const m = String(ts).match(/(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(ts)
}

export default function Users({ me }) {
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState(['admin', 'approver', 'user'])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ email: '', name: '', role: 'user' })
  const [editEmail, setEditEmail] = useState(null)
  const [editDraft, setEditDraft] = useState({})

  async function load() {
    try {
      const data = await api.listUsers()
      setUsers(data.users)
      setRoles(data.roles)
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function run(fn) {
    try {
      await fn()
      setError('')
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  async function addUser(e) {
    e.preventDefault()
    const email = draft.email.trim().toLowerCase()
    if (!email.includes('@')) {
      setError('אימייל לא תקין')
      return
    }
    await run(async () => {
      await api.saveUser({ ...draft, email, active: true })
      setDraft({ email: '', name: '', role: 'user' })
      setAdding(false)
    })
  }

  function startEdit(u) {
    setEditEmail(u.email)
    setEditDraft({ name: u.name, role: u.role, active: !!u.active })
  }

  function cancelEdit() {
    setEditEmail(null)
    setEditDraft({})
  }

  async function saveEdit(u) {
    await run(async () => {
      await api.saveUser({ email: u.email, ...editDraft })
      cancelEdit()
    })
  }

  async function deleteUser(email) {
    if (!window.confirm(`להסיר את הגישה של ${email}?`)) return
    await run(() => api.deleteUser(email))
  }

  return (
    <section>
      <div className="tasks-head">
        <h1 className="home-title">ניהול משתמשים</h1>
        <button
          className="tact-btn tact-btn-primary"
          onClick={() => setAdding((v) => !v)}
        >
          <TactIcon name="plus" size={16} /> הוסף גישה
        </button>
      </div>

      <p className="muted" style={{ marginTop: -6, marginBottom: 14, fontSize: '.86rem' }}>
        ההתחברות היא דרך חשבון Google — רק אימייל שמופיע כאן ומסומן פעיל יכול להיכנס.
        <strong> כל מי שמורשה רואה ועורך את כל הנתונים במערכת</strong> (הסכמים, דיירים, פיננסים, תזרים);
        התפקיד קובע רק מי יכול לנהל את הרשימה הזו — <em>מנהל</em> בלבד.
      </p>

      {error && <div className="app-error" style={{ marginBottom: 12 }}>{error}</div>}

      {adding && (
        <form className="add-form" onSubmit={addUser}>
          <input
            autoFocus
            type="email"
            placeholder="כתובת Gmail…"
            value={draft.email}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            style={{ direction: 'ltr', textAlign: 'left' }}
          />
          <input
            placeholder="שם (אופציונלי)"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <select
            value={draft.role}
            onChange={(e) => setDraft({ ...draft, role: e.target.value })}
          >
            {roles.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>
            ))}
          </select>
          <button className="tact-btn tact-btn-primary" type="submit">הוסף</button>
          <button className="tact-btn" type="button" onClick={() => setAdding(false)}>ביטול</button>
        </form>
      )}

      {loading ? (
        <p className="muted">טוען…</p>
      ) : users.length === 0 ? (
        <p className="muted">אין משתמשים ברשימה.</p>
      ) : (
        <table className="tasks-table">
          <thead>
            <tr>
              <th>אימייל</th>
              <th>שם</th>
              <th>תפקיד</th>
              <th>סטטוס</th>
              <th>התחברות אחרונה</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) =>
              editEmail === u.email ? (
                <tr key={u.email} className="edit-row">
                  <td style={{ direction: 'ltr', textAlign: 'left' }}>{u.email}</td>
                  <td>
                    <input
                      autoFocus
                      value={editDraft.name}
                      onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit(u)
                        if (e.key === 'Escape') cancelEdit()
                      }}
                      style={{ width: '100%' }}
                    />
                  </td>
                  <td>
                    <select
                      value={editDraft.role}
                      onChange={(e) => setEditDraft({ ...editDraft, role: e.target.value })}
                    >
                      {roles.map((r) => (
                        <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={editDraft.active ? '1' : '0'}
                      onChange={(e) => setEditDraft({ ...editDraft, active: e.target.value === '1' })}
                    >
                      <option value="1">פעיל</option>
                      <option value="0">מושבת</option>
                    </select>
                  </td>
                  <td colSpan={2}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="tact-btn tact-btn-primary" onClick={() => saveEdit(u)}>שמור</button>
                      <button className="tact-btn" onClick={cancelEdit}>ביטול</button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={u.email}>
                  <td style={{ direction: 'ltr', textAlign: 'left', fontWeight: 600 }}>
                    {u.email}
                    {u.email === me?.email && <span className="muted" style={{ fontWeight: 400 }}> (את)</span>}
                  </td>
                  <td className="muted">{u.name || '—'}</td>
                  <td>
                    <span className={`tact-badge ${ROLE_BADGE[u.role] || ''}`}>
                      {ROLE_LABEL[u.role] || u.role}
                    </span>
                  </td>
                  <td>
                    {u.active
                      ? <span className="tact-badge tact-badge-pos">פעיל</span>
                      : <span className="tact-badge tact-badge-soon">מושבת</span>}
                  </td>
                  <td className="muted">{shortDate(u.last_login_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="cf-del"
                        title="ערוך משתמש"
                        onClick={() => startEdit(u)}
                        style={{ opacity: 0.7 }}
                      >
                        ✎
                      </button>
                      <button
                        className="cf-del"
                        title="הסר גישה"
                        onClick={() => deleteUser(u.email)}
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
