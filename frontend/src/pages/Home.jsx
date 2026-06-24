import TactIcon from '../components/TactIcon.jsx'
import { CATEGORIES, STATUSES } from '../constants.js'

export default function Home({ tasks, loading }) {
  const total = tasks.length
  const by = (s) => tasks.filter((t) => t.status === s).length
  const done = by('done')
  const progress = total ? Math.round((done / total) * 100) : 0

  return (
    <section>
      <div className="home-hero">
        <h1 className="home-title">בדיקת נאותות — חברת אנרגיה</h1>
        <p className="home-sub">
          ריכוז כל נתוני הבדיקה במקום אחד: הסכמי דיירים, דוחות כספיים, בעלים
          וכרטסות ספקים.
        </p>
      </div>

      {/* כרטיסי KPI — ספירת מטלות לפי סטטוס */}
      <div className="kpi-grid">
        <div className="tact-kpi">
          <div className="tact-kpi-label">סך מטלות</div>
          <div className="tact-kpi-val">{loading ? '—' : total}</div>
        </div>
        {STATUSES.map((s) => (
          <div className="tact-kpi" key={s.key}>
            <div className="tact-kpi-label">{s.label}</div>
            <div className="tact-kpi-val">{loading ? '—' : by(s.key)}</div>
          </div>
        ))}
        <div className="tact-kpi">
          <div className="tact-kpi-label">התקדמות</div>
          <div className="tact-kpi-val">{loading ? '—' : `${progress}%`}</div>
          <div className="tact-delta tact-delta-up">{done} הושלמו</div>
        </div>
      </div>

      {/* כרטיסי קטגוריות הבדיקה */}
      <h2 className="block-title">תחומי הבדיקה</h2>
      <div className="cards-grid">
        {CATEGORIES.map((c) => {
          const count = tasks.filter((t) => t.category === c.key).length
          const cdone = tasks.filter(
            (t) => t.category === c.key && t.status === 'done',
          ).length
          return (
            <div className={`tact-card ${c.tone}`} key={c.key}>
              <div className="tact-card-cap">
                <div className="tact-card-ico">
                  <TactIcon name={c.icon} size={18} />
                </div>
                <span className="tact-badge tact-badge-on">
                  {cdone}/{count}
                </span>
              </div>
              <div className="tact-card-body">
                <strong>{c.label}</strong>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
