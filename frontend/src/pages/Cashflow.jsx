import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'
import { api } from '../api/client.js'

const ils = (n) =>
  '₪' + Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 0 })

const fmtK = (v) => {
  const a = Math.abs(v), s = v < 0 ? '-' : ''
  if (a >= 1e6) return s + '₪' + (a / 1e6).toFixed(1) + 'M'
  if (a >= 1e3) return s + '₪' + (a / 1e3).toFixed(0) + 'K'
  return s + '₪' + a
}

function buildAmort(amount, annualPct, years) {
  const n = Math.max(1, Math.round((years || 0) * 12))
  const r = (annualPct || 0) / 100 / 12
  const M = r === 0 ? amount / n : (amount * r) / (1 - Math.pow(1 + r, -n))
  const rows = []
  let bal = amount
  for (let i = 1; i <= n; i++) {
    const interest = bal * r
    let principal = M - interest
    if (i === n) principal = bal
    const payment = principal + interest
    bal = Math.max(0, bal - principal)
    rows.push({ i, payment, interest, principal, balance: bal })
  }
  const totalPaid = rows.reduce((s, x) => s + x.payment, 0)
  return { n, monthly: M, rows, totalPaid, totalInterest: totalPaid - amount }
}

// ============================ תת-לשונית: הלוואה ============================
function LoanTab({ loan, onChange }) {
  const [openYear, setOpenYear] = useState(null)
  const amount = Number(loan.amount || 0)
  const years = Number(loan.years || 0)
  const rate = Number(loan.prime || 0) + Number(loan.margin || 0)
  const am = useMemo(() => buildAmort(amount, rate, years), [amount, rate, years])

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
        <label>
          <span>חודש התחלת ההלוואה</span>
          <input type="month" value={loan.start_month || ''}
            onChange={(e) => onChange({ start_month: e.target.value })} />
        </label>
        <div className="cf-rate-chip">
          ריבית שנתית כוללת
          <strong>{rate.toFixed(2)}%</strong>
        </div>
      </div>

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
        חישוב לוח שפיצר (תשלום חודשי קבוע). התשלום השנתי משולב כהוצאה בתחזית התזרים
        {loan.start_month ? ` החל מ-${loan.start_month}` : ''}.
      </p>
    </div>
  )
}

// ============================ עמוד התזרים ============================
export default function Cashflow({ loading: parentLoading }) {
  const [settings, setSettings] = useState({ opening_balance: 0, balance_date: '' })
  const [loan, setLoan] = useState({ amount: 3000000, years: 5, prime: 6, margin: 2, start_month: '' })
  const [combinedForecast, setCombinedForecast] = useState([])
  const [loading, setLoading] = useState(true)
  const [subTab, setSubTab] = useState('forecast')
  const [visibleBars, setVisibleBars] = useState({ הכנסות: true, הוצאות: true, רווח: true })
  const timers = useRef({})

  useEffect(() => {
    Promise.all([
      api.getCashflow(),
      api.getCombinedForecast(),
    ]).then(([cf, forecast]) => {
      setSettings(cf.settings || { opening_balance: 0, balance_date: '' })
      if (cf.loan) setLoan(cf.loan)
      setCombinedForecast(forecast || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

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

  const yearlyRows = useMemo(() => {
    let bal = Number(settings.opening_balance || 0)
    return combinedForecast.map((yf) => {
      const expense = yf.total_capex + yf.total_opex + yf.loan_repayment
      const net = yf.total_income - expense
      bal += net
      return {
        year: yf.year,
        income: yf.total_income,
        capex: yf.total_capex,
        opex: yf.total_opex,
        loan_repayment: yf.loan_repayment,
        expense,
        net,
        balance: bal,
      }
    })
  }, [combinedForecast, settings.opening_balance])

  const chartData = yearlyRows.map((r) => ({
    year: String(r.year),
    הכנסות: r.income,
    הוצאות: r.expense,
    רווח: r.net,
  }))

  const totalIncome = yearlyRows.reduce((s, r) => s + r.income, 0)
  const totalExpense = yearlyRows.reduce((s, r) => s + r.expense, 0)
  const totalNet = yearlyRows.reduce((s, r) => s + r.net, 0)
  const endBalance = yearlyRows.length
    ? yearlyRows[yearlyRows.length - 1].balance
    : Number(settings.opening_balance || 0)

  if (loading || parentLoading) return <p className="muted">טוען…</p>

  return (
    <section>
      <div className="ta-head">
        <h1 className="home-title">תזרים מזומנים</h1>
        <span className="tact-badge tact-badge-on">{combinedForecast.length} שנים</span>
      </div>
      <p className="home-sub">
        תחזית תזרים שנתית מצרפית לכל הבניינים — נתונים מתזרים בניינים.
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
      </div>

      <div className="kpi-grid">
        <div className="tact-kpi">
          <div className="tact-kpi-label">סה"כ הכנסות</div>
          <div className="tact-kpi-val fin-pos">{ils(totalIncome)}</div>
        </div>
        <div className="tact-kpi">
          <div className="tact-kpi-label">סה"כ הוצאות</div>
          <div className="tact-kpi-val fin-neg">{ils(totalExpense)}</div>
        </div>
        <div className="tact-kpi">
          <div className={`tact-kpi-val ${totalNet < 0 ? 'fin-neg' : 'fin-pos'}`}>
            <div className="tact-kpi-label">רווח נקי מצרפי</div>
            {ils(totalNet)}
          </div>
        </div>
        <div className="tact-kpi">
          <div className="tact-kpi-label">יתרה בסוף תקופה</div>
          <div className={`tact-kpi-val ${endBalance < 0 ? 'fin-neg' : ''}`}>{ils(endBalance)}</div>
        </div>
      </div>

      <div className="cf-chart">
        <div className="cf-gran">
          {[
            { k: 'הכנסות', color: '#2e7d4f' },
            { k: 'הוצאות', color: '#d64a2e' },
            { k: 'רווח',   color: '#1f3a5f' },
          ].map(({ k, color }) => (
            <button
              key={k}
              className={`filter-pill ${visibleBars[k] ? 'active' : ''}`}
              style={visibleBars[k] ? { borderColor: color, background: color + '18' } : {}}
              onClick={() => setVisibleBars((p) => ({ ...p, [k]: !p[k] }))}
            >
              {k}
            </button>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 12, left: 12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e6e9ef" />
            <XAxis dataKey="year" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 12 }} width={70} />
            <Tooltip formatter={(v) => ils(v)} labelStyle={{ direction: 'rtl' }} />
            <Legend />
            {visibleBars['הכנסות'] && <Bar dataKey="הכנסות" fill="#2e7d4f" radius={[3, 3, 0, 0]} />}
            {visibleBars['הוצאות'] && <Bar dataKey="הוצאות" fill="#d64a2e" radius={[3, 3, 0, 0]} />}
            {visibleBars['רווח']   && <Bar dataKey="רווח"   fill="#1f3a5f" radius={[3, 3, 0, 0]} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="cf-subtabs">
        <button className={`cf-subtab ${subTab === 'forecast' ? 'active' : ''}`}
          onClick={() => setSubTab('forecast')}>תחזית שנתית</button>
        <button className={`cf-subtab ${subTab === 'loan' ? 'active' : ''}`}
          onClick={() => setSubTab('loan')}>הלוואת רכישה</button>
      </div>

      {subTab === 'loan' && <LoanTab loan={loan} onChange={patchLoan} />}

      {subTab === 'forecast' && (
        <>
          <h2 className="block-title">תחזית שנתית מצרפית</h2>
          <div className="fin-table-wrap">
            <table className="fin-table cf-fc">
              <thead>
                <tr>
                  <th className="fin-rowlabel">שנה</th>
                  <th>הכנסות</th>
                  <th>CAPEX</th>
                  <th>OPEX</th>
                  <th>החזר הלוואה</th>
                  <th>נטו</th>
                  <th>יתרה מצטברת</th>
                </tr>
              </thead>
              <tbody>
                {yearlyRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 24 }}>
                      אין נתוני תחזית. הגדר בניינים בלשונית "תזרים בניינים".
                    </td>
                  </tr>
                ) : yearlyRows.map((r) => (
                  <tr key={r.year}>
                    <td className="fin-rowlabel">{r.year}</td>
                    <td className="fin-pos">{ils(r.income)}</td>
                    <td className="fin-neg">{ils(r.capex)}</td>
                    <td className="fin-neg">{ils(r.opex)}</td>
                    <td className="fin-neg">{ils(r.loan_repayment)}</td>
                    <td className={r.net < 0 ? 'fin-neg' : 'fin-pos'}>{ils(r.net)}</td>
                    <td className={r.balance < 0 ? 'fin-neg' : ''}><strong>{ils(r.balance)}</strong></td>
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
