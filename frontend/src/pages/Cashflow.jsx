import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'
import TactIcon from '../components/TactIcon.jsx'
import { api } from '../api/client.js'

// ----- עזרי תזרים (מותאם מ-Flow-and-Projects) -----
const ils = (n) =>
  '₪' + Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 0 })

const fmtK = (v) => {
  const a = Math.abs(v), s = v < 0 ? '-' : ''
  if (a >= 1e6) return s + '₪' + (a / 1e6).toFixed(1) + 'M'
  if (a >= 1e3) return s + '₪' + (a / 1e3).toFixed(0) + 'K'
  return s + '₪' + a
}

function addMonths(ym, n) {
  let [y, m] = ym.split('-').map(Number)
  m += n
  while (m > 12) { m -= 12; y++ }
  while (m < 1) { m += 12; y-- }
  return `${y}-${String(m).padStart(2, '0')}`
}

const fmtYM = (ym) => { const [y, m] = ym.split('-'); return `${m}/${y}` }

const CATEGORIES = [
  'דמי ניהול', 'חשמל טעינה', 'התקנות', 'שכר', 'הנהלה וכלליות',
  'מימון', 'החזר הלוואה', 'ספקים', 'מסים', 'שיווק', 'שונות',
]

function appliesInMonth(item, ym) {
  const start = item.start_month
  if (!start || ym < start) return null
  if (item.end_month && ym > item.end_month) return null
  const [y, m] = ym.split('-').map(Number)
  const [sy, sm] = start.split('-').map(Number)
  const diff = (y - sy) * 12 + (m - sm)
  let ok = false
  if (item.recurrence === 'monthly') ok = true
  else if (item.recurrence === 'quarterly') ok = diff >= 0 && diff % 3 === 0
  else if (item.recurrence === 'annual') ok = diff >= 0 && diff % 12 === 0
  else if (item.recurrence === 'one-time') ok = ym === start
  return ok ? Number(item.amount || 0) : null
}

function projectMonth(items, ym) {
  let income = 0, expense = 0
  const breakdown = []
  for (const it of items) {
    const amt = appliesInMonth(it, ym)
    if (amt === null) continue
    if (it.type === 'income') income += amt
    else expense += amt
    breakdown.push({ ...it, _amt: amt })
  }
  breakdown.sort((a, b) => (a.day_of_month || 1) - (b.day_of_month || 1))
  return { income, expense, net: income - expense, breakdown }
}

// ----- לוח סילוקין (שפיצר — תשלום חודשי קבוע) -----
function buildAmort(amount, annualPct, years) {
  const n = Math.max(1, Math.round((years || 0) * 12))
  const r = (annualPct || 0) / 100 / 12
  const M = r === 0 ? amount / n : (amount * r) / (1 - Math.pow(1 + r, -n))
  const rows = []
  let bal = amount
  for (let i = 1; i <= n; i++) {
    const interest = bal * r
    let principal = M - interest
    if (i === n) principal = bal // התשלום האחרון מאפס יתרה
    const payment = principal + interest
    bal = Math.max(0, bal - principal)
    rows.push({ i, payment, interest, principal, balance: bal })
  }
  const totalPaid = rows.reduce((s, x) => s + x.payment, 0)
  return { n, monthly: M, rows, totalPaid, totalInterest: totalPaid - amount }
}

const RECUR_OPTS = [
  { v: 'monthly', l: 'חודשי' }, { v: 'quarterly', l: 'רבעוני' },
  { v: 'annual', l: 'שנתי' }, { v: 'one-time', l: 'חד פעמי' },
]

// ============================ תת-לשונית: הלוואה ============================
function LoanTab({ loan, onChange }) {
  const [openYear, setOpenYear] = useState(null)
  const amount = Number(loan.amount || 0)
  const years = Number(loan.years || 0)
  const rate = Number(loan.prime || 0) + Number(loan.margin || 0)
  const am = useMemo(() => buildAmort(amount, rate, years), [amount, rate, years])

  // צבירה לפי שנה
  const byYear = useMemo(() => {
    const out = []
    for (let y = 1; y <= years; y++) {
      const slice = am.rows.slice((y - 1) * 12, y * 12)
      if (!slice.length) break
      out.push({
        year: y,
        payment: slice.reduce((s, r) => s + r.payment, 0),
        interest: slice.reduce((s, r) => s + r.interest, 0),
        principal: slice.reduce((s, r) => s + r.principal, 0),
        endBalance: slice[slice.length - 1].balance,
        months: slice,
      })
    }
    return out
  }, [am, years])

  return (
    <div>
      {/* פקדים */}
      <div className="cf-open">
        <label>
          <span>גובה רכישה / הלוואה ₪</span>
          <input type="number" value={amount}
            onChange={(e) => onChange({ amount: parseFloat(e.target.value) || 0 })} />
        </label>
        <label>
          <span>שנות החזר</span>
          <input type="number" min="1" max="30" value={years}
            onChange={(e) => onChange({ years: parseInt(e.target.value) || 1 })} />
        </label>
        <label>
          <span>ריבית פריים %</span>
          <input type="number" step="0.1" value={loan.prime ?? 0}
            onChange={(e) => onChange({ prime: parseFloat(e.target.value) || 0 })} />
        </label>
        <label>
          <span>מרווח מעל פריים %</span>
          <input type="number" step="0.1" value={loan.margin ?? 0}
            onChange={(e) => onChange({ margin: parseFloat(e.target.value) || 0 })} />
        </label>
        <div className="cf-rate-chip">
          ריבית שנתית כוללת
          <strong>{rate.toFixed(2)}%</strong>
        </div>
      </div>

      {/* סיכום */}
      <div className="kpi-grid">
        <div className="tact-kpi">
          <div className="tact-kpi-label">תשלום חודשי</div>
          <div className="tact-kpi-val">{ils(am.monthly)}</div>
        </div>
        <div className="tact-kpi">
          <div className="tact-kpi-label">סה"כ החזר ({am.n} ת׳)</div>
          <div className="tact-kpi-val">{ils(am.totalPaid)}</div>
        </div>
        <div className="tact-kpi">
          <div className="tact-kpi-label">סה"כ ריבית</div>
          <div className="tact-kpi-val fin-neg">{ils(am.totalInterest)}</div>
        </div>
        <div className="tact-kpi">
          <div className="tact-kpi-label">קרן (גובה הלוואה)</div>
          <div className="tact-kpi-val">{ils(amount)}</div>
        </div>
      </div>

      {/* לוח סילוקין לפי שנה (לחיצה פותחת חודשים) */}
      <h2 className="block-title">לוח סילוקין — {years} שנים</h2>
      <div className="fin-table-wrap">
        <table className="fin-table cf-fc">
          <thead>
            <tr>
              <th className="ta-expander" />
              <th className="fin-rowlabel">שנה</th>
              <th>סה"כ תשלום</th><th>קרן</th><th>ריבית</th><th>יתרת קרן</th>
            </tr>
          </thead>
          <tbody>
            {byYear.map((y) => {
              const isOpen = openYear === y.year
              return (
                <Fragment key={y.year}>
                  <tr className={`cf-fc-row ${isOpen ? 'open' : ''}`}
                    onClick={() => setOpenYear(isOpen ? null : y.year)}>
                    <td className="ta-expander">
                      <span className={`ta-chevron ${isOpen ? 'open' : ''}`}>▸</span>
                    </td>
                    <td className="fin-rowlabel">שנה {y.year}</td>
                    <td>{ils(y.payment)}</td>
                    <td>{ils(y.principal)}</td>
                    <td className="fin-neg">{ils(y.interest)}</td>
                    <td><strong>{ils(y.endBalance)}</strong></td>
                  </tr>
                  {isOpen && (
                    <tr className="ta-detail-row">
                      <td colSpan={6}>
                        <div className="ta-detail">
                          <table className="pr-ch-table">
                            <thead>
                              <tr><th>חודש</th><th>תשלום</th><th>קרן</th><th>ריבית</th><th>יתרת קרן</th></tr>
                            </thead>
                            <tbody>
                              {y.months.map((r) => (
                                <tr key={r.i}>
                                  <td>{r.i}</td>
                                  <td>{ils(r.payment)}</td>
                                  <td>{ils(r.principal)}</td>
                                  <td className="fin-neg">{ils(r.interest)}</td>
                                  <td>{ils(r.balance)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="ta-source muted">
        חישוב לוח שפיצר (תשלום חודשי קבוע). התשלום החודשי ₪{Math.round(am.monthly).toLocaleString('he-IL')} —
        ניתן בהמשך לשלב אותו אוטומטית כהוצאה בתחזית התזרים.
      </p>
    </div>
  )
}

// ============================ עמוד התזרים ============================
export default function Cashflow({ loading: parentLoading }) {
  const [items, setItems] = useState([])
  const [settings, setSettings] = useState({ opening_balance: 0, balance_date: '' })
  const [loan, setLoan] = useState({ amount: 3000000, years: 5, prime: 6, margin: 2, start_month: '' })
  const [loading, setLoading] = useState(true)
  const [horizon, setHorizon] = useState(12)
  const [openMonth, setOpenMonth] = useState(null)
  const [subTab, setSubTab] = useState('forecast')
  const timers = useRef({})

  useEffect(() => {
    api.getCashflow().then((d) => {
      setItems(d.items || [])
      setSettings(d.settings || { opening_balance: 0, balance_date: '' })
      if (d.loan) setLoan(d.loan)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  function patchItem(id, patch) {
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
    clearTimeout(timers.current['i' + id])
    timers.current['i' + id] = setTimeout(() => {
      api.updateCashflowItem(id, patch).catch(() => {})
    }, 600)
  }

  async function addItem() {
    const now = new Date()
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const created = await api.createCashflowItem({
      name: '', type: 'expense', category: '', amount: 0,
      recurrence: 'monthly', day_of_month: 1, start_month: ym, end_month: '', note: '',
    })
    setItems((prev) => [...prev, created])
  }

  async function removeItem(id) {
    await api.deleteCashflowItem(id)
    setItems((prev) => prev.filter((r) => r.id !== id))
  }

  function patchSettings(patch) {
    const next = { ...settings, ...patch }
    setSettings(next)
    clearTimeout(timers.current.settings)
    timers.current.settings = setTimeout(() => {
      api.updateCashflowSettings(next).catch(() => {})
    }, 600)
  }

  function patchLoan(patch) {
    setLoan((prev) => ({ ...prev, ...patch }))
    clearTimeout(timers.current.loan)
    timers.current.loan = setTimeout(() => {
      api.updateCashflowLoan(patch).catch(() => {})
    }, 600)
  }

  const startYM = settings.balance_date
    ? settings.balance_date.slice(0, 7)
    : (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}` })()

  const months = useMemo(
    () => Array.from({ length: horizon }, (_, i) => addMonths(startYM, i)),
    [startYM, horizon],
  )

  const monthly = useMemo(() => {
    let bal = Number(settings.opening_balance || 0)
    return months.map((ym) => {
      const mm = projectMonth(items, ym)
      bal += mm.net
      return { ym, ...mm, balance: bal }
    })
  }, [items, months, settings.opening_balance])

  const chartData = monthly.map((d) => ({
    month: fmtYM(d.ym), הכנסות: d.income, הוצאות: d.expense, יתרה: d.balance,
  }))

  const totals = monthly.reduce(
    (a, d) => ({ income: a.income + d.income, expense: a.expense + d.expense }),
    { income: 0, expense: 0 },
  )
  const avgIncome = monthly.length ? totals.income / monthly.length : 0
  const avgExpense = monthly.length ? totals.expense / monthly.length : 0
  const endBalance = monthly.length ? monthly[monthly.length - 1].balance : settings.opening_balance
  const lowest = monthly.reduce((m, d) => Math.min(m, d.balance), Number(settings.opening_balance || 0))

  if (loading || parentLoading) return <p className="muted">טוען…</p>

  return (
    <section>
      <div className="ta-head">
        <h1 className="home-title">תזרים מזומנים</h1>
        <span className="tact-badge tact-badge-on">{items.length} פריטים</span>
      </div>
      <p className="home-sub">
        תחזית תזרים מתגלגלת מיתרת הפתיחה. בונים אותה מתחומים שונים (לשוניות למטה). כל שינוי נשמר אוטומטית.
      </p>

      <div className="cf-open">
        <label>
          <span>יתרת פתיחה ₪</span>
          <input type="number" value={settings.opening_balance ?? 0}
            onChange={(e) => patchSettings({ opening_balance: parseFloat(e.target.value) || 0 })} />
        </label>
        <label>
          <span>נכון לתאריך</span>
          <input type="date" value={settings.balance_date || ''}
            onChange={(e) => patchSettings({ balance_date: e.target.value })} />
        </label>
        <label>
          <span>אופק תחזית</span>
          <select value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
            <option value={6}>6 חודשים</option>
            <option value={12}>12 חודשים</option>
            <option value={24}>24 חודשים</option>
            <option value={60}>60 חודשים</option>
          </select>
        </label>
      </div>

      <div className="kpi-grid">
        <div className="tact-kpi">
          <div className="tact-kpi-label">הכנסה חודשית ממוצעת</div>
          <div className="tact-kpi-val fin-pos">{ils(avgIncome)}</div>
        </div>
        <div className="tact-kpi">
          <div className="tact-kpi-label">הוצאה חודשית ממוצעת</div>
          <div className="tact-kpi-val fin-neg">{ils(avgExpense)}</div>
        </div>
        <div className="tact-kpi">
          <div className="tact-kpi-label">תזרים חודשי נטו</div>
          <div className={`tact-kpi-val ${avgIncome - avgExpense < 0 ? 'fin-neg' : 'fin-pos'}`}>
            {ils(avgIncome - avgExpense)}
          </div>
        </div>
        <div className="tact-kpi">
          <div className="tact-kpi-label">יתרה צפויה בעוד {horizon} ח׳</div>
          <div className={`tact-kpi-val ${endBalance < 0 ? 'fin-neg' : ''}`}>{ils(endBalance)}</div>
        </div>
        <div className="tact-kpi">
          <div className="tact-kpi-label">יתרה מינימלית בתקופה</div>
          <div className={`tact-kpi-val ${lowest < 0 ? 'fin-neg' : ''}`}>{ils(lowest)}</div>
        </div>
      </div>

      <div className="cf-chart">
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 12, left: 12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e6e9ef" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 12 }} width={70} />
            <Tooltip formatter={(v) => ils(v)} labelStyle={{ direction: 'rtl' }} />
            <Legend />
            <Bar dataKey="הכנסות" fill="#2e7d4f" radius={[3, 3, 0, 0]} />
            <Bar dataKey="הוצאות" fill="#d64a2e" radius={[3, 3, 0, 0]} />
            <Line dataKey="יתרה" stroke="#1f3a5f" strokeWidth={2.5} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ----- תת-לשוניות (תחומים) ----- */}
      <div className="cf-subtabs">
        <button className={`cf-subtab ${subTab === 'forecast' ? 'active' : ''}`}
          onClick={() => setSubTab('forecast')}>תחזית ופריטים</button>
        <button className={`cf-subtab ${subTab === 'loan' ? 'active' : ''}`}
          onClick={() => setSubTab('loan')}>הלוואת רכישה</button>
      </div>

      {subTab === 'loan' && <LoanTab loan={loan} onChange={patchLoan} />}

      {subTab === 'forecast' && (
        <>
          <h2 className="block-title">תחזית חודשית</h2>
          <div className="fin-table-wrap">
            <table className="fin-table cf-fc">
              <thead>
                <tr>
                  <th className="ta-expander" />
                  <th className="fin-rowlabel">חודש</th>
                  <th>הכנסות</th><th>הוצאות</th><th>נטו</th><th>יתרה מצטברת</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((d) => {
                  const isOpen = openMonth === d.ym
                  return (
                    <Fragment key={d.ym}>
                      <tr className={`cf-fc-row ${isOpen ? 'open' : ''}`}
                        onClick={() => setOpenMonth(isOpen ? null : d.ym)}>
                        <td className="ta-expander">
                          <span className={`ta-chevron ${isOpen ? 'open' : ''}`}>▸</span>
                        </td>
                        <td className="fin-rowlabel">{fmtYM(d.ym)}</td>
                        <td className="fin-pos">{ils(d.income)}</td>
                        <td className="fin-neg">{ils(d.expense)}</td>
                        <td className={d.net < 0 ? 'fin-neg' : 'fin-pos'}>{ils(d.net)}</td>
                        <td className={d.balance < 0 ? 'fin-neg' : ''}><strong>{ils(d.balance)}</strong></td>
                      </tr>
                      {isOpen && (
                        <tr className="ta-detail-row">
                          <td colSpan={6}>
                            <div className="ta-detail">
                              {d.breakdown.length === 0 ? (
                                <p className="muted">אין תנועות בחודש זה.</p>
                              ) : (
                                <table className="pr-ch-table">
                                  <thead>
                                    <tr><th>יום</th><th>פירוט</th><th>קטגוריה</th><th>סוג</th><th>סכום</th></tr>
                                  </thead>
                                  <tbody>
                                    {d.breakdown.map((b) => (
                                      <tr key={b.id}>
                                        <td>{b.day_of_month || 1}</td>
                                        <td>{b.name || '—'}</td>
                                        <td>{b.category || '—'}</td>
                                        <td>{b.type === 'income' ? 'הכנסה' : 'הוצאה'}</td>
                                        <td className={b.type === 'income' ? 'fin-pos' : 'fin-neg'}>{ils(b._amt)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="cf-items-head">
            <h2 className="block-title" style={{ margin: 0 }}>פריטי תזרים</h2>
            <button className="tact-btn" onClick={addItem}>
              <TactIcon name="plus" size={15} /> פריט חדש
            </button>
          </div>
          <datalist id="cf-cats">
            {CATEGORIES.map((c) => <option key={c} value={c} />)}
          </datalist>
          <div className="fin-table-wrap">
            <table className="fin-table cf-items">
              <thead>
                <tr>
                  <th className="fin-rowlabel">פרטים</th>
                  <th>סוג</th><th>קטגוריה</th><th>סכום ₪</th><th>תדירות</th>
                  <th>יום</th><th>מחודש</th><th>עד חודש</th><th />
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={9} className="muted" style={{ textAlign: 'center', padding: 24 }}>
                    אין עדיין פריטים. הוסף פריט כדי לבנות את התחזית.
                  </td></tr>
                ) : items.map((it) => (
                  <tr key={it.id}>
                    <td className="fin-rowlabel">
                      <input className="cf-in cf-in-lg" value={it.name || ''}
                        onChange={(e) => patchItem(it.id, { name: e.target.value })} placeholder="פרטים" />
                    </td>
                    <td>
                      <select className="cf-in" value={it.type}
                        onChange={(e) => patchItem(it.id, { type: e.target.value })}>
                        <option value="income">הכנסה</option>
                        <option value="expense">הוצאה</option>
                      </select>
                    </td>
                    <td>
                      <input className="cf-in" list="cf-cats" value={it.category || ''}
                        onChange={(e) => patchItem(it.id, { category: e.target.value })} placeholder="קטגוריה" />
                    </td>
                    <td>
                      <input className="cf-in cf-in-num" type="number" value={it.amount ?? 0}
                        onChange={(e) => patchItem(it.id, { amount: parseFloat(e.target.value) || 0 })} />
                    </td>
                    <td>
                      <select className="cf-in" value={it.recurrence}
                        onChange={(e) => patchItem(it.id, { recurrence: e.target.value })}>
                        {RECUR_OPTS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                      </select>
                    </td>
                    <td>
                      <input className="cf-in cf-in-xs" type="number" min="1" max="31" value={it.day_of_month || 1}
                        onChange={(e) => patchItem(it.id, { day_of_month: parseInt(e.target.value) || 1 })} />
                    </td>
                    <td>
                      <input className="cf-in cf-in-mo" type="month" value={it.start_month || ''}
                        onChange={(e) => patchItem(it.id, { start_month: e.target.value })} />
                    </td>
                    <td>
                      <input className="cf-in cf-in-mo" type="month" value={it.end_month || ''}
                        onChange={(e) => patchItem(it.id, { end_month: e.target.value })} />
                    </td>
                    <td>
                      <button className="cf-del" title="מחק" onClick={() => removeItem(it.id)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
