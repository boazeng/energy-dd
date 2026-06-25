import { useEffect, useState } from 'react'
import TactLogo from './components/TactLogo.jsx'
import TactIcon from './components/TactIcon.jsx'
import Home from './pages/Home.jsx'
import Tasks from './pages/Tasks.jsx'
import TenantAgreements from './pages/TenantAgreements.jsx'
import Projects from './pages/Projects.jsx'
import Financials from './pages/Financials.jsx'
import Cashflow from './pages/Cashflow.jsx'
import { api } from './api/client.js'

const TABS = [
  { key: 'home', label: 'בית', icon: 'dashboard' },
  { key: 'projects', label: 'סטטוס פרויקטים', icon: 'bolt' },
  { key: 'financials', label: 'ניתוח כספי', icon: 'reports' },
  { key: 'cashflow', label: 'תזרים', icon: 'trending' },
  { key: 'tasks', label: 'רשימת מטלות', icon: 'workflow' },
  { key: 'agreements', label: 'הסכמי דיירים', icon: 'document' },
]

const VALID_TABS = TABS.map((t) => t.key)

function initialTab() {
  const t = new URLSearchParams(window.location.search).get('tab')
  return VALID_TABS.includes(t) ? t : 'home'
}

export default function App() {
  const [tab, setTab] = useState(initialTab)
  const [tasks, setTasks] = useState([])
  const [agreements, setAgreements] = useState([])
  const [projects, setProjects] = useState(null)
  const [financials, setFinancials] = useState(null)
  const [supplierBalances, setSupplierBalances] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function refresh() {
    try {
      const [t, a, p, f, sb] = await Promise.all([
        api.listTasks(),
        api.listAgreements(),
        api.getProjects(),
        api.getFinancials(),
        api.listSupplierBalances(),
      ])
      setTasks(t)
      setAgreements(a)
      setProjects(p)
      setFinancials(f)
      setSupplierBalances(sb)
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function refreshSuppliers() {
    const sb = await api.listSupplierBalances()
    setSupplierBalances(sb)
  }

  useEffect(() => {
    refresh()
  }, [])

  return (
    <div className="tact-aurora">
      <header className="tact-bar">
        <TactLogo word="בדיקת נאותות" />
        <nav className="tact-nav">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={tab === t.key ? 'active' : ''}
              onClick={() => setTab(t.key)}
            >
              <TactIcon name={t.icon} size={16} />
              <span style={{ marginInlineStart: 6 }}>{t.label}</span>
            </button>
          ))}
        </nav>
        <span className="tact-bar-spacer" />
      </header>

      <main className="container app-main">
        {error && <div className="app-error">שגיאה בטעינת הנתונים: {error}</div>}
        {tab === 'home' && <Home tasks={tasks} loading={loading} />}
        {tab === 'projects' && <Projects data={projects} loading={loading} />}
        {tab === 'financials' && (
          <Financials
            data={financials}
            loading={loading}
            supplierBalances={supplierBalances}
            onSupplierChange={refreshSuppliers}
          />
        )}
        {tab === 'cashflow' && <Cashflow loading={loading} />}
        {tab === 'tasks' && (
          <Tasks tasks={tasks} loading={loading} onChange={refresh} />
        )}
        {tab === 'agreements' && (
          <TenantAgreements agreements={agreements} loading={loading} />
        )}
      </main>

      <footer className="tact-footer">
        <TactLogo tone="dark" word={false} size={0.8} />
        <span>מערכת בדיקת נאותות · פנימי</span>
      </footer>
    </div>
  )
}
