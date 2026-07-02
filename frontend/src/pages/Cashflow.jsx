import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bar, ComposedChart, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, XAxis, YAxis,
} from 'recharts'
import { api } from '../api/client.js'

// ─── עזרים ───────────────────────────────────────────────────────────────────

const ils = (n) => '₪' + Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 0 })

const fmtK = (v) => {
  const a = Math.abs(v), s = v < 0 ? '-' : ''
  if (a >= 1e6) return s + '₪' + (a / 1e6).toFixed(1) + 'M'
  if (a >= 1e3) return s + '₪' + (a / 1e3).toFixed(0) + 'K'
  return s + '₪' + a
}

const MONTHS_SHORT = ['ינ׳','פב׳','מר׳','אפ׳','מי׳','יו׳','יל׳','אג׳','ספ׳','אוק׳','נו׳','דצ׳']

function periodWeights(prev, chargersAdded, n) {
  const chPerPeriod = chargersAdded / n
  const ws = Array.from({ length: n }, (_, k) => prev + (k + 0.5) * chPerPeriod)
  const wSum = ws.reduce((s, w) => s + w, 0)
  return { ws, wSum, chPerPeriod }
}

function expandCombined(combined, viewMode, excludedNames = new Set()) {
  const filterBldgs = (bldgs) => {
    if (!excludedNames.size) return bldgs || {}
    return Object.fromEntries(Object.entries(bldgs || {}).filter(([n]) => !excludedNames.has(n)))
  }
  const recompTotals = (bldgs) => ({
    total_income: Object.values(bldgs).reduce((s, b) => s + (b.annual_income || 0), 0),
    total_capex:  Object.values(bldgs).reduce((s, b) => s + (b.capex || 0), 0),
    total_opex:   Object.values(bldgs).reduce((s, b) => s + (b.annual_opex || 0), 0),
  })
  if (viewMode === 'annual') {
    return combined.map((r) => {
      const buildings = filterBldgs(r.buildings)
      return { ...r, ...recompTotals(buildings), buildings, period: String(r.year) }
    })
  }
  const n = viewMode === 'quarterly' ? 4 : 12
  const out = []
  for (const row of combined) {
    const bldgMeta = {}
    const filteredBldgs = filterBldgs(row.buildings)
    for (const [name, bd] of Object.entries(filteredBldgs)) {
      const prev = (bd.total_chargers || 0) - (bd.chargers_added || 0)
      bldgMeta[name] = { prev, ...periodWeights(prev, bd.chargers_added || 0, n) }
    }
    for (let i = 0; i < n; i++) {
      const label = viewMode === 'quarterly'
        ? `Q${i + 1} ${row.year}`
        : `${MONTHS_SHORT[i]} '${String(row.year).slice(2)}`
      const buildings = {}
      for (const [name, bd] of Object.entries(filteredBldgs)) {
        const { ws, wSum, chPerPeriod, prev } = bldgMeta[name]
        const inc = wSum > 0 ? (bd.annual_income || 0) * ws[i] / wSum : (bd.annual_income || 0) / n
        const cpx = (bd.capex || 0) / n
        const opx = (bd.annual_opex || 0) / n
        buildings[name] = {
          ...bd,
          annual_income: inc, capex: cpx, annual_opex: opx, profit: inc - cpx - opx,
          chargers_added: chPerPeriod, total_chargers: prev + (i + 1) * chPerPeriod,
        }
      }
      const totalIncome = Object.values(buildings).reduce((s, b) => s + b.annual_income, 0)
      const totalCapex  = Object.values(buildings).reduce((s, b) => s + b.capex, 0)
      const totalOpex   = Object.values(buildings).reduce((s, b) => s + b.annual_opex, 0)
      const loanPer     = (row.loan_repayment || 0) / n
      out.push({
        ...row, period: label, buildings,
        total_income: totalIncome, total_capex: totalCapex, total_opex: totalOpex,
        loan_repayment: loanPer, total_profit: totalIncome - totalCapex - totalOpex - loanPer,
      })
    }
  }
  return out
}

// ─── לוח שפיצר ───────────────────────────────────────────────────────────────

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

function LoanTab({ loan, onChange }) {
  const [openYear, setOpenYear] = useState(null)
  const amount = Number(loan.amount || 0)
  const years  = Number(loan.years  || 0)
  const rate   = Number(loan.prime  || 0) + Number(loan.margin || 0)
  const am = useMemo(() => buildAmort(amount, rate, years), [amount, rate, years])

  const byYear = useMemo(() => {
    const out = []
    for (let y = 1; y <= years; y++) {
      const slice = am.rows.slice((y - 1) * 12, y * 12)
      if (!slice.length) break
      out.push({
        year: y,
        payment:    slice.reduce((s, r) => s + r.payment, 0),
        interest:   slice.reduce((s, r) => s + r.interest, 0),
        principal:  slice.reduce((s, r) => s + r.principal, 0),
        endBalance: slice[slice.length - 1].balance,
        months: slice,
      })
    }
    return out
  }, [am, years])

  return (
    <div>
      <div className="cf-open">
        <label><span>גובה הלוואה ₪</span>
          <input type="number" value={amount}
            onChange={(e) => onChange({ amount: parseFloat(e.target.value) || 0 })} /></label>
        <label><span>שנות החזר</span>
          <input type="number" min="1" max="30" value={years}
            onChange={(e) => onChange({ years: parseInt(e.target.value) || 1 })} /></label>
        <label><span>ריבית פריים %</span>
          <input type="number" step="0.1" value={loan.prime ?? 0}
            onChange={(e) => onChange({ prime: parseFloat(e.target.value) || 0 })} /></label>
        <label><span>מרווח מעל פריים %</span>
          <input type="number" step="0.1" value={loan.margin ?? 0}
            onChange={(e) => onChange({ margin: parseFloat(e.target.value) || 0 })} /></label>
        <label><span>חודש התחלה</span>
          <input type="month" value={loan.start_month || ''}
            onChange={(e) => onChange({ start_month: e.target.value })} /></label>
        <div className="cf-rate-chip">ריבית כוללת <strong>{rate.toFixed(2)}%</strong></div>
      </div>

      <div className="kpi-grid">
        <div className="tact-kpi"><div className="tact-kpi-label">תשלום חודשי</div>
          <div className="tact-kpi-val">{ils(am.monthly)}</div></div>
        <div className="tact-kpi"><div className="tact-kpi-label">סה"כ החזר ({am.n} ת׳)</div>
          <div className="tact-kpi-val">{ils(am.totalPaid)}</div></div>
        <div className="tact-kpi"><div className="tact-kpi-label">סה"כ ריבית</div>
          <div className="tact-kpi-val fin-neg">{ils(am.totalInterest)}</div></div>
        <div className="tact-kpi"><div className="tact-kpi-label">קרן</div>
          <div className="tact-kpi-val">{ils(amount)}</div></div>
      </div>

      <h2 className="block-title">לוח סילוקין — {years} שנים</h2>
      <div className="fin-table-wrap">
        <table className="fin-table cf-fc">
          <thead><tr>
            <th className="ta-expander" /><th className="fin-rowlabel">שנה</th>
            <th>סה"כ תשלום</th><th>קרן</th><th>ריבית</th><th>יתרת קרן</th>
          </tr></thead>
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
                    <tr className="ta-detail-row"><td colSpan={6}><div className="ta-detail">
                      <table className="pr-ch-table">
                        <thead><tr><th>חודש</th><th>תשלום</th><th>קרן</th><th>ריבית</th><th>יתרת קרן</th></tr></thead>
                        <tbody>
                          {y.months.map((r) => (
                            <tr key={r.i}>
                              <td>{r.i}</td><td>{ils(r.payment)}</td><td>{ils(r.principal)}</td>
                              <td className="fin-neg">{ils(r.interest)}</td><td>{ils(r.balance)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div></td></tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── פאנל תקורות ─────────────────────────────────────────────────────────────

function OverheadPanel({ items, onChange, adaptationCosts, onAdaptationChange }) {
  function addItem() { onChange([...items, { id: Date.now(), name: '', annual: 0 }]) }
  function removeItem(id) { onChange(items.filter((i) => i.id !== id)) }
  function patchItem(id, patch) { onChange(items.map((i) => i.id === id ? { ...i, ...patch } : i)) }
  const total = items.reduce((s, i) => s + (Number(i.annual) || 0), 0)

  function addAdaptation() { onAdaptationChange([...adaptationCosts, { id: Date.now(), name: '', amount: 0 }]) }
  function removeAdaptation(id) { onAdaptationChange(adaptationCosts.filter((i) => i.id !== id)) }
  function patchAdaptation(id, patch) { onAdaptationChange(adaptationCosts.map((i) => i.id === id ? { ...i, ...patch } : i)) }
  const totalAdaptation = adaptationCosts.reduce((s, i) => s + (Number(i.amount) || 0), 0)

  return (
    <div>
      {/* ── תקורות שנתיות ── */}
      <div className="cf-items-head">
        <h2 className="block-title" style={{ margin: 0 }}>תקורות שנתיות</h2>
        <button className="tact-btn" onClick={addItem}>+ תקורה</button>
      </div>
      <div className="fin-table-wrap">
        <table className="fin-table cf-items">
          <thead><tr><th className="fin-rowlabel">שם</th><th>סכום שנתי ₪</th><th /></tr></thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={3} className="muted" style={{ textAlign: 'center', padding: 16 }}>
                אין תקורות — לחץ "+ תקורה" להוספה.
              </td></tr>
            ) : items.map((it) => (
              <tr key={it.id}>
                <td className="fin-rowlabel">
                  <input className="cf-in cf-in-lg" value={it.name} placeholder="שם התקורה"
                    onChange={(e) => patchItem(it.id, { name: e.target.value })} />
                </td>
                <td>
                  <input className="cf-in cf-in-num" type="number" value={it.annual}
                    onChange={(e) => patchItem(it.id, { annual: parseFloat(e.target.value) || 0 })} />
                </td>
                <td><button className="cf-del" onClick={() => removeItem(it.id)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {items.length > 0 && (
        <p className="muted" style={{ fontSize: '0.82rem', marginTop: 4 }}>
          סה"כ תקורות שנתיות: <strong>{ils(total)}</strong>
        </p>
      )}

      {/* ── עלויות התאמה חד פעמיות 2026 ── */}
      <div className="cf-items-head" style={{ marginTop: 28 }}>
        <h2 className="block-title" style={{ margin: 0 }}>עלויות התאמה — חד פעמי 2026</h2>
        <button className="tact-btn" onClick={addAdaptation}>+ עלות</button>
      </div>
      <p className="muted" style={{ fontSize: '0.8rem', marginBottom: 8, marginTop: 4 }}>
        הוצאות חד פעמיות שיחולו על שנת 2026 בלבד.
      </p>
      <div className="fin-table-wrap">
        <table className="fin-table cf-items">
          <thead><tr><th className="fin-rowlabel">שם</th><th>סכום ₪</th><th /></tr></thead>
          <tbody>
            {adaptationCosts.length === 0 ? (
              <tr><td colSpan={3} className="muted" style={{ textAlign: 'center', padding: 16 }}>
                אין עלויות התאמה — לחץ "+ עלות" להוספה.
              </td></tr>
            ) : adaptationCosts.map((it) => (
              <tr key={it.id}>
                <td className="fin-rowlabel">
                  <input className="cf-in cf-in-lg" value={it.name} placeholder="שם העלות"
                    onChange={(e) => patchAdaptation(it.id, { name: e.target.value })} />
                </td>
                <td>
                  <input className="cf-in cf-in-num" type="number" value={it.amount}
                    onChange={(e) => patchAdaptation(it.id, { amount: parseFloat(e.target.value) || 0 })} />
                </td>
                <td><button className="cf-del" onClick={() => removeAdaptation(it.id)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {adaptationCosts.length > 0 && (
        <p className="muted" style={{ fontSize: '0.82rem', marginTop: 4 }}>
          סה"כ עלויות התאמה: <strong>{ils(totalAdaptation)}</strong>
        </p>
      )}
    </div>
  )
}

// ─── עמוד תזרים ──────────────────────────────────────────────────────────────

const VIEW_OPTS  = [{ v: 'annual', l: 'שנתי' }, { v: 'quarterly', l: 'רבעוני' }, { v: 'monthly', l: 'חודשי' }]
const BAR_DEFS   = [{ k: 'הכנסות', color: '#2e7d4f' }, { k: 'הוצאות', color: '#d64a2e' }, { k: 'רווח', color: '#1f3a5f' }]

export default function Cashflow({ loading: parentLoading, horizonMode = 'contract', excludedIds = new Set(), agreementVersion = 0 }) {
  const [loan, setLoan]                   = useState({ amount: 3000000, years: 5, prime: 6, margin: 2, start_month: '' })
  const [combinedForecast, setCombined]   = useState([])
  const [buildings, setBuildings]         = useState([])
  const [loading, setLoading]             = useState(true)
  const [subTab, setSubTab]               = useState('forecast')
  const [viewMode, setViewMode]           = useState(
    () => { const v = localStorage.getItem('energy-cf-view-mode'); return ['annual','quarterly','monthly'].includes(v) ? v : 'annual' }
  )
  const [npvMode, setNpvMode]             = useState(
    () => { const v = localStorage.getItem('energy-cf-npv-mode'); return ['with_financing','without_financing'].includes(v) ? v : 'with_financing' }
  )
  const [discountRate, setDiscountRate]   = useState(() => {
    try { return parseFloat(localStorage.getItem('energy-cf-discount-rate') || '0') || 0 } catch { return 0 }
  })
  const [visibleBars, setVisibleBars]     = useState({ הכנסות: true, הוצאות: true, רווח: true })
  const [includeLoan, setIncludeLoan]     = useState(
    () => localStorage.getItem('energy-cf-include-loan') !== 'false'
  )
  const [overheadItems, setOverheadItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem('energy-cf-overhead') || '[]') } catch { return [] }
  })
  const [adaptationCosts, setAdaptationCosts] = useState(() => {
    try { return JSON.parse(localStorage.getItem('energy-cf-adaptation-2026') || '[]') } catch { return [] }
  })
  const timers = useRef({})

  useEffect(() => {
    const fy = horizonMode === '5yr' ? 5 : horizonMode === '10yr' ? 10 : undefined
    Promise.all([api.getCashflow(), api.getCombinedForecast(fy), api.listBuildingModels()])
      .then(([cf, forecast, bms]) => {
        if (cf.loan) setLoan(cf.loan)
        setCombined(forecast || [])
        setBuildings(bms || [])
        setLoading(false)
      }).catch(() => setLoading(false))
  }, [horizonMode, agreementVersion])

  function patchLoan(patch) {
    setLoan((prev) => ({ ...prev, ...patch }))
    clearTimeout(timers.current.loan)
    timers.current.loan = setTimeout(() => api.updateCashflowLoan(patch).catch(() => {}), 600)
  }

  function patchOverhead(next) {
    setOverheadItems(next)
    localStorage.setItem('energy-cf-overhead', JSON.stringify(next))
  }

  function patchAdaptation(next) {
    setAdaptationCosts(next)
    localStorage.setItem('energy-cf-adaptation-2026', JSON.stringify(next))
  }

  function saveDiscountRate(v) {
    setDiscountRate(v)
    localStorage.setItem('energy-cf-discount-rate', String(v))
  }

  const periodsPerYear = viewMode === 'annual' ? 1 : viewMode === 'quarterly' ? 4 : 12
  const totalAnnualOverhead = overheadItems.reduce((s, o) => s + (Number(o.annual) || 0), 0)
  const totalAdaptation2026 = adaptationCosts.reduce((s, c) => s + (Number(c.amount) || 0), 0)

  // ריבית וקרן לכל שנת לוח — לפיצול מימון/קרן בטבלה
  const amortCalYear = useMemo(() => {
    if (!loan.amount || !loan.years) return {}
    const rate = Number(loan.prime || 0) + Number(loan.margin || 0)
    const am   = buildAmort(Number(loan.amount), rate, Number(loan.years))
    const startYear = loan.start_month ? parseInt(loan.start_month.slice(0, 4), 10) : 2026
    const out = {}
    for (let y = 1; y <= Number(loan.years); y++) {
      const slice = am.rows.slice((y - 1) * 12, y * 12)
      if (!slice.length) break
      out[startYear + y - 1] = {
        interest:  slice.reduce((s, r) => s + r.interest, 0),
        principal: slice.reduce((s, r) => s + r.principal, 0),
      }
    }
    return out
  }, [loan])

  // בניינים שהוסרו מהתזרים — מ-excludedIds שמגיע מ-App.jsx (מעודכן בזמן-אמת)
  const excludedNames = useMemo(() => {
    if (!excludedIds.size) return new Set()
    return new Set(buildings.filter((b) => excludedIds.has(b.id)).map((b) => b.building_name))
  }, [buildings, excludedIds])

  const periods = useMemo(() => {
    const expanded = expandCombined(combinedForecast, viewMode, excludedNames)
    const r = (discountRate || 0) / 100
    let bal   = 0
    let pvBal = 0
    return expanded.map((p, idx) => {
      const n             = periodsPerYear
      const overheadPer   = totalAnnualOverhead / n
      const adaptationPer = p.year === 2026 ? totalAdaptation2026 / n : 0
      const loan          = p.loan_repayment || 0
      const netOperating  = p.total_income - p.total_capex - p.total_opex - overheadPer - adaptationPer
      const net           = netOperating - loan
      bal += net
      const t        = idx / n
      const pvFactor = r > 0 ? 1 / Math.pow(1 + r, t) : 1
      const pvNetOp  = netOperating * pvFactor
      const pvNet    = net * pvFactor           // ערך נוכחי כולל מימון
      pvBal += pvNetOp
      const chargers = Object.values(p.buildings || {}).reduce((s, b) => s + (b.total_chargers || 0), 0)
      const amYear   = amortCalYear[p.year] || { interest: 0, principal: 0 }
      const loanInterest  = amYear.interest  / n
      const loanPrincipal = amYear.principal / n
      const netMinusInterest   = netOperating - loanInterest
      const pvNetMinusInterest = netMinusInterest * pvFactor
      return {
        period: p.period,
        income: p.total_income,
        capex:  p.total_capex,
        opex:   p.total_opex,
        loan, overhead: overheadPer, adaptation: adaptationPer,
        loanInterest, loanPrincipal,
        netOperating, netMinusInterest, net, balance: bal,
        pvNetOp, pvNetMinusInterest, pvNet, pvBalance: pvBal,
        chargers,
      }
    })
  }, [combinedForecast, viewMode, discountRate, totalAnnualOverhead, totalAdaptation2026, periodsPerYear, excludedNames, amortCalYear])

  const chartData          = periods.map((r) => ({
    period: r.period,
    הכנסות: r.income,
    הוצאות: r.capex + r.opex + r.overhead + r.adaptation + (includeLoan ? r.loan : 0),
    רווח:   includeLoan ? r.net : r.netOperating,
  }))
  const totalIncome        = periods.reduce((s, r) => s + r.income, 0)
  const totalCapex         = periods.reduce((s, r) => s + r.capex, 0)
  const totalOpex          = periods.reduce((s, r) => s + r.opex, 0)
  const totalOverhead      = periods.reduce((s, r) => s + r.overhead, 0)
  const totalAdaptation    = periods.reduce((s, r) => s + r.adaptation, 0)
  const totalLoan          = periods.reduce((s, r) => s + r.loan, 0)
  const totalLoanInterest  = periods.reduce((s, r) => s + r.loanInterest, 0)
  const totalLoanPrincipal = periods.reduce((s, r) => s + r.loanPrincipal, 0)
  const totalNetOperating     = periods.reduce((s, r) => s + r.netOperating, 0)
  const totalNetMinusInterest = periods.reduce((s, r) => s + r.netMinusInterest, 0)
  const totalNet              = periods.reduce((s, r) => s + r.net, 0)
  const npv                   = periods.reduce((s, r) => s + r.pvNetOp, 0)
  const npvWithFinancing      = periods.reduce((s, r) => s + r.pvNetMinusInterest, 0)
  const endBalance            = periods.length ? periods[periods.length - 1].balance : 0

  const activeNpv    = npvMode === 'with_financing' ? npvWithFinancing : npv
  const activePvKey  = npvMode === 'with_financing' ? 'pvNetMinusInterest' : 'pvNetOp'
  const npvLabel     = npvMode === 'with_financing' ? 'ערך נוכחי כולל מימון (NPV)' : 'ערך נוכחי ללא מימון (NPV)'

  if (loading || parentLoading) return <p className="muted">טוען…</p>

  return (
    <section>
      <div className="ta-head">
        <h1 className="home-title">תזרים מזומנים</h1>
        <span className="tact-badge tact-badge-on">{combinedForecast.length} שנים</span>
        {excludedNames.size > 0 && (
          <span className="tact-badge" style={{ background: 'rgba(253,121,168,.15)', color: '#fd79a8', border: '1px solid rgba(253,121,168,.3)' }}>
            {excludedNames.size} בניינים מוסרים
          </span>
        )}
      </div>
      <p className="home-sub">תחזית תזרים מצרפית לכל הבניינים — נתונים מתזרים בניינים.</p>

      <div className="cf-chart">
        <div className="cf-gran">
          {VIEW_OPTS.map((o) => (
            <button key={o.v} className={`filter-pill ${viewMode === o.v ? 'active' : ''}`}
              onClick={() => { setViewMode(o.v); localStorage.setItem('energy-cf-view-mode', o.v) }}>{o.l}</button>
          ))}
          <span style={{ margin: '0 8px', color: '#ccc' }}>|</span>
          {BAR_DEFS.map(({ k, color }) => (
            <button key={k}
              className={`filter-pill ${visibleBars[k] ? 'active' : ''}`}
              style={visibleBars[k] ? { borderColor: color, background: color + '18' } : {}}
              onClick={() => setVisibleBars((p) => ({ ...p, [k]: !p[k] }))}>
              {k}
            </button>
          ))}
          {totalLoan > 0 && (
            <>
              <span style={{ margin: '0 8px', color: '#ccc' }}>|</span>
              <button
                className={`filter-pill ${includeLoan ? 'active' : ''}`}
                onClick={() => setIncludeLoan((v) => { localStorage.setItem('energy-cf-include-loan', String(!v)); return !v })}>
                {includeLoan ? 'כולל החזר הלוואה' : 'ללא החזר הלוואה'}
              </button>
            </>
          )}
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={chartData} margin={{ top: 10, right: 12, left: 12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e6e9ef" />
            <XAxis dataKey="period" tick={{ fontSize: 11 }} />
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
        <button className={`cf-subtab ${subTab === 'forecast'  ? 'active' : ''}`}
          onClick={() => setSubTab('forecast')}>תחזית</button>
        <button className={`cf-subtab ${subTab === 'overhead'  ? 'active' : ''}`}
          onClick={() => setSubTab('overhead')}>
          תקורות {(overheadItems.length + adaptationCosts.length) > 0 && `(${overheadItems.length + adaptationCosts.length})`}
        </button>
        <button className={`cf-subtab ${subTab === 'loan'      ? 'active' : ''}`}
          onClick={() => setSubTab('loan')}>הלוואת רכישה</button>
      </div>

      {subTab === 'loan'     && <LoanTab loan={loan} onChange={patchLoan} />}
      {subTab === 'overhead' && (
        <OverheadPanel
          items={overheadItems}
          onChange={patchOverhead}
          adaptationCosts={adaptationCosts}
          onAdaptationChange={patchAdaptation}
        />
      )}

      {subTab === 'forecast' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '16px 0 4px', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--tact-text-dim,#666)', whiteSpace: 'nowrap' }}>
              <span>ריבית היוון %</span>
              <input type="number" min="0" max="50" step="0.5" value={discountRate}
                onChange={(e) => saveDiscountRate(parseFloat(e.target.value) || 0)}
                style={{ width: 72, padding: '4px 8px', borderRadius: 6, border: '1px solid #d0d7e6', fontSize: 13 }} />
            </label>
            <span style={{ color: '#d0d7e6' }}>|</span>
          </div>
          <div style={{ display: 'flex', gap: 8, margin: '0 0 4px', flexWrap: 'wrap' }}>
            {[['with_financing','חישוב ערך נוכחי כולל מימון'],['without_financing','חישוב ערך נוכחי ללא מימון']].map(([mode, label]) => (
              <button key={mode}
                onClick={() => setNpvMode((p) => { const next = p === mode ? null : mode; localStorage.setItem('energy-cf-npv-mode', next || ''); return next })}
                style={{
                  padding: '6px 14px', fontSize: 13, fontWeight: 600, borderRadius: 8,
                  border: `1px solid ${npvMode === mode ? '#6c8ebf' : '#d0d7e6'}`,
                  background: npvMode === mode ? 'rgba(108,142,191,.15)' : 'transparent',
                  color: npvMode === mode ? '#4a6fa5' : 'var(--tact-text-dim,#666)',
                  cursor: 'pointer', transition: 'all .15s',
                }}
              >{label}</button>
            ))}
          </div>
          <h2 className="block-title">תזרים מרכז</h2>
          {periods.length === 0 ? (
            <p className="muted" style={{ padding: '1.5rem 0' }}>
              אין נתוני תחזית. הגדר בניינים בלשונית "תזרים בניינים".
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="fin-table" style={{ width: '100%', tableLayout: 'fixed', minWidth: periods.length > 12 ? periods.length * 72 + 180 : 'auto' }}>
                <colgroup>
                  <col style={{ width: 190 }} />
                  {periods.map((_, i) => <col key={i} />)}
                  <col style={{ width: 110 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'right' }} />
                    {periods.map((r) => (
                      <th key={r.period} style={{ textAlign: 'center', fontSize: viewMode === 'monthly' ? 10 : 12, whiteSpace: 'nowrap' }}>
                        {r.period}
                      </th>
                    ))}
                    <th style={{ background: 'rgba(0,0,0,.04)' }}>סה"כ</th>
                  </tr>
                </thead>
                <tbody>

                  {/* ── תפעול ── */}
                  <tr style={{ background: 'rgba(108,142,191,.07)' }}>
                    <td colSpan={periods.length + 2} style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, color: 'var(--tact-text-dim,#888)', letterSpacing: '.04em' }}>
                      הכנסות והוצאות תפעוליות
                    </td>
                  </tr>

                  <tr>
                    <td className="fin-rowlabel">מטענים פעילים</td>
                    {periods.map((r, i) => (
                      <td key={i} style={{ textAlign: 'center', fontSize: 12 }}>
                        {Number.isInteger(r.chargers) ? r.chargers : r.chargers.toFixed(1)}
                      </td>
                    ))}
                    <td style={{ background: 'rgba(0,0,0,.04)', fontWeight: 600, textAlign: 'center' }}>
                      {Math.round(periods[periods.length - 1].chargers)}
                    </td>
                  </tr>

                  <tr>
                    <td className="fin-rowlabel">הכנסות</td>
                    {periods.map((r, i) => <td key={i} className="fin-pos">{ils(r.income)}</td>)}
                    <td className="fin-pos" style={{ background: 'rgba(0,0,0,.04)', fontWeight: 700 }}>{ils(totalIncome)}</td>
                  </tr>

                  <tr>
                    <td className="fin-rowlabel">עלות התקנת מטענים</td>
                    {periods.map((r, i) => (
                      <td key={i} className={r.capex > 0 ? 'fin-neg' : ''} style={{ color: r.capex > 0 ? undefined : '#bbb' }}>
                        {r.capex > 0 ? ils(r.capex) : '—'}
                      </td>
                    ))}
                    <td className="fin-neg" style={{ background: 'rgba(0,0,0,.04)', fontWeight: 700 }}>{ils(totalCapex)}</td>
                  </tr>

                  <tr>
                    <td className="fin-rowlabel">עלויות התאמת מטענים קיימים</td>
                    {periods.map((r, i) => (
                      <td key={i} className={r.opex > 0 ? 'fin-neg' : ''} style={{ color: r.opex > 0 ? undefined : '#bbb' }}>
                        {r.opex > 0 ? ils(r.opex) : '—'}
                      </td>
                    ))}
                    <td className="fin-neg" style={{ background: 'rgba(0,0,0,.04)', fontWeight: 700 }}>{ils(totalOpex)}</td>
                  </tr>

                  {totalOverhead > 0 && (
                    <tr>
                      <td className="fin-rowlabel">תקורות</td>
                      {periods.map((r, i) => (
                        <td key={i} className={r.overhead > 0 ? 'fin-neg' : ''} style={{ color: r.overhead > 0 ? undefined : '#bbb' }}>
                          {r.overhead > 0 ? ils(r.overhead) : '—'}
                        </td>
                      ))}
                      <td className="fin-neg" style={{ background: 'rgba(0,0,0,.04)', fontWeight: 700 }}>{ils(totalOverhead)}</td>
                    </tr>
                  )}

                  {totalAdaptation > 0 && (
                    <tr>
                      <td className="fin-rowlabel">עלויות התאמה (2026)</td>
                      {periods.map((r, i) => (
                        <td key={i} className={r.adaptation > 0 ? 'fin-neg' : ''} style={{ color: r.adaptation > 0 ? undefined : '#bbb' }}>
                          {r.adaptation > 0 ? ils(r.adaptation) : '—'}
                        </td>
                      ))}
                      <td className="fin-neg" style={{ background: 'rgba(0,0,0,.04)', fontWeight: 700 }}>{ils(totalAdaptation)}</td>
                    </tr>
                  )}

                  {/* עלות מימון (ריבית בלבד) — מוצגת לפני סה"כ רווח כשבמצב כולל מימון */}
                  {npvMode === 'with_financing' && totalLoanInterest > 0 && (
                    <tr>
                      <td className="fin-rowlabel">עלות מימון (ריבית)</td>
                      {periods.map((r, i) => (
                        <td key={i} className={r.loanInterest > 0 ? 'fin-neg' : ''} style={{ color: r.loanInterest > 0 ? undefined : '#bbb' }}>
                          {r.loanInterest > 0 ? ils(r.loanInterest) : '—'}
                        </td>
                      ))}
                      <td className="fin-neg" style={{ background: 'rgba(0,0,0,.04)', fontWeight: 700 }}>{ils(totalLoanInterest)}</td>
                    </tr>
                  )}

                  {/* סה"כ רווח:
                      כולל מימון → הכנסות − capex − opex − overhead − adaptation − ריבית
                      ללא מימון  → הכנסות − capex − opex − overhead − adaptation */}
                  {(() => {
                    const withFin = npvMode === 'with_financing' && totalLoanInterest > 0
                    const rowVal  = (r) => withFin ? r.netMinusInterest : r.netOperating
                    const total   = withFin ? totalNetMinusInterest : totalNetOperating
                    return (
                      <tr style={{ borderTop: '2px solid #c0c8d8', fontWeight: 700 }}>
                        <td className="fin-rowlabel">סה"כ רווח</td>
                        {periods.map((r, i) => (
                          <td key={i} className={rowVal(r) < 0 ? 'fin-neg' : 'fin-pos'}>{ils(rowVal(r))}</td>
                        ))}
                        <td className={total < 0 ? 'fin-neg' : 'fin-pos'} style={{ background: 'rgba(0,0,0,.04)', fontWeight: 800 }}>
                          {ils(total)}
                        </td>
                      </tr>
                    )
                  })()}

                  {/* ── היוון ── */}
                  {discountRate > 0 && (
                    <>
                      <tr style={{ background: 'rgba(108,142,191,.07)' }}>
                        <td colSpan={periods.length + 2} style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, color: 'var(--tact-text-dim,#888)', letterSpacing: '.04em' }}>
                          היוון — שיעור {discountRate}%{npvMode ? ` · ${npvMode === 'with_financing' ? 'כולל מימון' : 'ללא מימון'}` : ''}
                        </td>
                      </tr>
                      <tr style={{ fontWeight: 700, background: 'rgba(255,193,7,.13)' }}>
                        <td className="fin-rowlabel" style={{ color: '#7a5c00' }}>{npvLabel}</td>
                        {periods.map((r, i) => {
                          const val = r[activePvKey]
                          return <td key={i} style={{ color: val < 0 ? '#c0392b' : '#1a6b3a', fontWeight: 700 }}>{ils(val)}</td>
                        })}
                        <td style={{ background: 'rgba(255,193,7,.25)', fontWeight: 800, color: activeNpv < 0 ? '#c0392b' : '#1a6b3a' }}>
                          {ils(activeNpv)}
                        </td>
                      </tr>
                    </>
                  )}

                  {/* ── החזר הלוואה אחרי NPV ──
                      כולל מימון → קרן בלבד (הריבית כבר נוכתה למעלה)
                      ללא מימון  → קרן וריבית (כל ההחזר) */}
                  {totalLoan > 0 && (
                    <tr>
                      <td className="fin-rowlabel">
                        {npvMode === 'with_financing'
                          ? 'החזר הלוואה (קרן בלבד)'
                          : 'החזר הלוואה (קרן וריבית)'}
                      </td>
                      {periods.map((r, i) => {
                        const val = npvMode === 'with_financing' ? r.loanPrincipal : r.loan
                        return (
                          <td key={i} className={val > 0 ? 'fin-neg' : ''} style={{ color: val > 0 ? undefined : '#bbb' }}>
                            {val > 0 ? ils(val) : '—'}
                          </td>
                        )
                      })}
                      <td className="fin-neg" style={{ background: 'rgba(0,0,0,.04)', fontWeight: 700 }}>
                        {ils(npvMode === 'with_financing' ? totalLoanPrincipal : totalLoan)}
                      </td>
                    </tr>
                  )}

                  <tr style={{ fontWeight: 700 }}>
                    <td className="fin-rowlabel">יתרה מצטברת</td>
                    {periods.map((r, i) => (
                      <td key={i} className={r.balance < 0 ? 'fin-neg' : ''}><strong>{ils(r.balance)}</strong></td>
                    ))}
                    <td className={endBalance < 0 ? 'fin-neg' : ''} style={{ background: 'rgba(0,0,0,.04)' }}>
                      <strong>{ils(endBalance)}</strong>
                    </td>
                  </tr>

                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}
