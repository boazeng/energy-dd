import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import TactIcon from '../components/TactIcon.jsx'
import { api } from '../api/client.js'

// ─── עזרים ───────────────────────────────────────────────────────────────────

const ils = (n) => '₪' + Number(n || 0).toLocaleString('he-IL', { maximumFractionDigits: 0 })
const fmtK = (v) => {
  const a = Math.abs(v), s = v < 0 ? '-' : ''
  if (a >= 1_000_000) return s + '₪' + (a / 1_000_000).toFixed(1) + 'M'
  if (a >= 1_000) return s + '₪' + (a / 1_000).toFixed(0) + 'K'
  return s + '₪' + a.toFixed(0)
}

const COLORS = ['#6c8ebf', '#82ca9d', '#ffc658', '#ff7c7c', '#a29bfe', '#fd79a8', '#00cec9', '#fdcb6e']

// שדות ספציפיים לבניין בודד (כולל תעריפים לפי הסכם דייר)
const BUILDING_SPECIFIC_FIELDS = [
  { key: 'current_chargers',             label: 'מטענים נוכחיים',     unit: '',         step: 1,   type: 'int',   note: 'מסונכרן מפרויקטים' },
  { key: 'potential_spots',              label: 'חניות פוטנציאליות',  unit: '',         step: 1,   type: 'int' },
  { key: 'chargers_no_rcd',              label: 'מטענים ללא פחת',     unit: '',         step: 1,   type: 'int',   note: 'מסונכרן מהאקסל' },
  { key: 'charger_install_income',       label: 'הכנסה מהתקנת מטען', unit: '₪/מטען',  step: 100, type: 'float', note: 'לפי הסכם דייר' },
  { key: 'mgmt_fee_per_charger',         label: 'עמלת ניהול למטען',  unit: '₪/חודש',  step: 0.1, type: 'float', note: 'לפי הסכם דייר' },
  { key: 'electricity_rate_agorot',      label: 'עמלת חשמל',         unit: "אג'/kWh", step: 0.1, type: 'float', note: 'לפי הסכם דייר' },
  { key: 'subscription_fee_per_charger', label: 'דמי מנוי למטען',    unit: '₪/חודש',  step: 0.1, type: 'float', note: 'לפי הסכם דייר' },
]

// שדות גלובליים — CAPEX (מנוהלים בפאנל העליון)
const CAPEX_FIELDS = [
  { key: 'cost_charger_unit',        label: 'עלות מטען',                 unit: '₪',      step: 100, type: 'float' },
  { key: 'cost_infra_per_charger',   label: "תשתית חשמל+תקשורת (50מ')", unit: '₪',      step: 100, type: 'float' },
  { key: 'cost_install_per_charger', label: 'התקנה כולל בודק',           unit: '₪',      step: 100, type: 'float' },
  { key: 'cost_elec_panel',          label: 'ארון חשמל',                 unit: '₪/ארון', step: 100, type: 'float' },
  { key: 'cost_comm_panel',          label: 'ארון תקשורת',               unit: '₪/ארון', step: 100, type: 'float' },
  { key: 'chargers_per_panel',       label: 'מטענים לארון',              unit: '',        step: 1,   type: 'int' },
]

// שדות גלובליים — OPEX (עלויות זהות לכל הבניינים)
const GLOBAL_OPEX_FIELDS = [
  { key: 'cost_rcd_per_charger',       label: 'עלות פחת חסר',    unit: '₪/שנה', step: 10, type: 'float' },
  { key: 'cost_internet_per_charger',  label: 'עלות אינטרנט',    unit: '₪/שנה', step: 10, type: 'float' },
  { key: 'cost_inspector_per_charger', label: 'עלות אישור בודק', unit: '₪/שנה', step: 10, type: 'float' },
]

function monthlyIncome(bm) {
  return (
    (bm.mgmt_fee_per_charger || 0) +
    ((bm.electricity_rate_agorot || 0) / 100) * (bm.avg_kwh_per_charger_monthly || 0) +
    (bm.subscription_fee_per_charger || 0)
  )
}

function annualOpex(bm) {
  return (
    (bm.current_chargers || 0) * ((bm.cost_internet_per_charger || 0) + (bm.cost_inspector_per_charger || 0)) +
    (bm.chargers_no_rcd || 0) * (bm.cost_rcd_per_charger || 0)
  )
}

function capexPerCharger(bm) {
  const direct = (bm.cost_charger_unit || 0) + (bm.cost_infra_per_charger || 0) + (bm.cost_install_per_charger || 0)
  const panelPer = ((bm.cost_elec_panel || 0) + (bm.cost_comm_panel || 0)) / Math.max(1, bm.chargers_per_panel || 10)
  return direct + panelPer
}

// ─── Hook: debounced save ─────────────────────────────────────────────────────

function useDebounce(fn, delay = 600) {
  const timer = useRef(null)
  return useCallback((...args) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => fn(...args), delay)
  }, [fn, delay])
}

// ─── טבלת תחזית לבניין בודד ──────────────────────────────────────────────────

function ForecastTable({ years }) {
  if (!years?.length) return <p className="dim-text" style={{ padding: '1rem' }}>אין נתונים</p>
  let cum = 0
  const rows = years.map((y) => { cum += y.profit; return { ...y, cumulative: cum } })
  return (
    <div className="table-wrap" style={{ overflowX: 'auto' }}>
      <table className="tact-table" style={{ minWidth: 780 }}>
        <thead>
          <tr>
            <th>שנה</th>
            <th>מטענים חדשים</th>
            <th>סה"כ מטענים</th>
            <th>הכנסה שנתית</th>
            <th>CAPEX</th>
            <th>OPEX</th>
            <th>רווח שנתי</th>
            <th>רווח מצטבר</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((y) => (
            <tr key={y.year}>
              <td><strong>{y.year}</strong></td>
              <td>{y.chargers_added > 0 ? `+${y.chargers_added}` : '—'}</td>
              <td>{y.total_chargers}</td>
              <td style={{ color: 'var(--tact-green)' }}>{ils(y.annual_income)}</td>
              <td style={{ color: y.capex > 0 ? 'var(--tact-red,#e74c3c)' : 'inherit' }}>
                {y.capex > 0 ? ils(-y.capex) : '—'}
              </td>
              <td style={{ color: 'var(--tact-orange,#e67e22)' }}>
                {y.annual_opex > 0 ? ils(-y.annual_opex) : '—'}
              </td>
              <td style={{ fontWeight: 600, color: y.profit >= 0 ? 'var(--tact-green)' : 'var(--tact-red,#e74c3c)' }}>
                {ils(y.profit)}
              </td>
              <td style={{ fontWeight: 700, color: y.cumulative >= 0 ? 'var(--tact-green)' : 'var(--tact-red,#e74c3c)' }}>
                {ils(y.cumulative)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── גרף לבניין בודד ─────────────────────────────────────────────────────────

function ForecastChart({ years }) {
  if (!years?.length) return null
  const data = years.map((y) => ({
    name: String(y.year),
    הכנסה: y.annual_income,
    CAPEX: y.capex,
    OPEX: y.annual_opex,
    רווח: y.profit,
  }))
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.1)" />
        <XAxis dataKey="name" tick={{ fill: 'var(--tact-text-dim,#888)', fontSize: 12 }} />
        <YAxis tickFormatter={fmtK} tick={{ fill: 'var(--tact-text-dim,#888)', fontSize: 11 }} width={72} />
        <Tooltip formatter={(v) => ils(v)} labelStyle={{ color: '#222' }} />
        <Legend />
        <Bar dataKey="הכנסה"  fill="#82ca9d" radius={[3,3,0,0]} />
        <Bar dataKey="CAPEX"  fill="#ff7c7c" radius={[3,3,0,0]} />
        <Bar dataKey="OPEX"   fill="#ffc658" radius={[3,3,0,0]} />
        <Bar dataKey="רווח"   fill="#6c8ebf" radius={[3,3,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── פאנל עריכת הגדרות בניין ─────────────────────────────────────────────────

function FieldRow({ fieldDef, value, onChange }) {
  const { key, label, unit, step, note } = fieldDef
  return (
    <label className="setting-row">
      <span className="setting-label">
        {label}
        {note && <span className="setting-note"> ({note})</span>}
      </span>
      <span className="setting-input-wrap">
        <input
          type="number"
          step={step}
          min={0}
          value={value ?? 0}
          onChange={(e) => onChange(key, e.target.value)}
          className="tact-input setting-input"
        />
        {unit && <span className="setting-unit">{unit}</span>}
      </span>
    </label>
  )
}

function BuildingSettings({ bm, globals, onChange }) {
  const [local, setLocal] = useState({ ...bm, extra_costs: bm.extra_costs || [] })

  useEffect(() => { setLocal({ ...bm, extra_costs: bm.extra_costs || [] }) }, [bm.id])

  const save = useDebounce(async (patch) => {
    try { await api.updateBuildingModel(bm.id, patch) } catch { /* ignore */ }
    onChange()
  })

  function handle(key, raw) {
    const def = BUILDING_SPECIFIC_FIELDS.find((f) => f.key === key)
    const value = def?.type === 'int' ? parseInt(raw, 10) || 0 : parseFloat(raw) || 0
    setLocal((prev) => ({ ...prev, [key]: value }))
    save({ [key]: value })
  }

  function saveExtraCosts(costs) {
    setLocal((prev) => ({ ...prev, extra_costs: costs }))
    save({ extra_costs: costs })
  }

  function addExtraCost() {
    saveExtraCosts([...local.extra_costs, { name: '', cost_per_charger: 0 }])
  }

  function removeExtraCost(i) {
    saveExtraCosts(local.extra_costs.filter((_, idx) => idx !== i))
  }

  function updateExtraCost(i, field, val) {
    saveExtraCosts(
      local.extra_costs.map((c, idx) =>
        idx === i ? { ...c, [field]: field === 'cost_per_charger' ? (parseFloat(val) || 0) : val } : c
      )
    )
  }

  const extraTotal = (local.extra_costs || []).reduce((s, c) => s + (c.cost_per_charger || 0), 0)

  // חישוב הכנסה חודשית למטען לפי ערכי הבניין + kWh גלובלי
  const incomePerCharger =
    (local.mgmt_fee_per_charger || 0) +
    ((local.electricity_rate_agorot || 0) / 100) * (globals.avg_kwh_per_charger_monthly || 0) +
    (local.subscription_fee_per_charger || 0)

  return (
    <div className="building-settings">
      <div className="settings-section-title">נתוני הבניין</div>
      <div className="settings-grid">
        {BUILDING_SPECIFIC_FIELDS.map((f) => (
          <FieldRow key={f.key} fieldDef={f} value={local[f.key]} onChange={handle} />
        ))}
      </div>

      <div className="settings-section-title" style={{ marginTop: 16 }}>
        עלויות נוספות פר מטען (ספציפי לבניין)
        <button
          className="tact-btn tact-btn-secondary"
          style={{ fontSize: 11, padding: '2px 10px', marginInlineStart: 10 }}
          onClick={addExtraCost}
        >+ הוסף</button>
      </div>
      {(local.extra_costs || []).length === 0 && (
        <div className="dim-text" style={{ fontSize: 12, padding: '4px 0' }}>אין עלויות נוספות</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {(local.extra_costs || []).map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              className="tact-input"
              style={{ flex: 1, minWidth: 0 }}
              placeholder="שם העלות"
              value={item.name}
              onChange={(e) => updateExtraCost(i, 'name', e.target.value)}
            />
            <input
              type="number"
              className="tact-input setting-input"
              style={{ width: 90 }}
              min={0}
              step={10}
              value={item.cost_per_charger}
              onChange={(e) => updateExtraCost(i, 'cost_per_charger', e.target.value)}
            />
            <span style={{ fontSize: 12, color: 'var(--tact-text-dim,#aaa)', whiteSpace: 'nowrap' }}>₪/מטען</span>
            <button
              onClick={() => removeExtraCost(i)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tact-red,#e74c3c)', fontSize: 16, lineHeight: 1, padding: '0 4px' }}
              title="הסר"
            >×</button>
          </div>
        ))}
      </div>

      <div className="income-summary" style={{ marginTop: 14 }}>
        <div style={{ fontSize: 12, color: 'var(--tact-text-dim,#aaa)', marginBottom: 4 }}>
          הכנסה חודשית למטען:
          <strong style={{ color: 'var(--tact-green)', marginInlineStart: 6 }}>{ils(incomePerCharger)}</strong>
          <span className="dim-text" style={{ fontSize: 11, marginInlineStart: 6 }}>
            (ניהול {ils(local.mgmt_fee_per_charger || 0)} + חשמל {ils(((local.electricity_rate_agorot || 0) / 100) * (globals.avg_kwh_per_charger_monthly || 0))} + מנוי {ils(local.subscription_fee_per_charger || 0)})
          </span>
        </div>
        {extraTotal > 0 && (
          <div className="dim-text" style={{ fontSize: 12 }}>
            עלויות נוספות: <strong style={{ color: 'var(--tact-orange,#e67e22)' }}>{ils(extraTotal)}</strong>/מטען
            {' '}· {ils(extraTotal * (local.current_chargers || 0))} לכלל {local.current_chargers || 0} מטענים
          </div>
        )}
      </div>
    </div>
  )
}

// ─── שורת בניין ──────────────────────────────────────────────────────────────

function BuildingRow({ bm, selected, onSelect, onDelete }) {
  return (
    <div
      className={`building-row ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(bm.id)}
    >
      <div className="building-row-name">{bm.building_name}</div>
      <div className="building-row-meta">
        {bm.current_chargers} מטענים · {bm.potential_spots} פוטנציאל
      </div>
      <button
        className="building-row-delete"
        title="מחק בניין"
        onClick={(e) => { e.stopPropagation(); onDelete(bm.id) }}
      >
        <TactIcon name="trash" size={12} />
      </button>
    </div>
  )
}

// ─── גרף הכנסות stacked ──────────────────────────────────────────────────────

function CombinedChart({ combined, buildings }) {
  if (!combined?.length) return <p className="dim-text" style={{ padding: '1rem' }}>אין נתונים</p>
  const names = buildings.map((b) => b.building_name)

  const data = combined.map((row) => {
    const entry = { name: String(row.year) }
    for (const name of names) {
      entry[name] = row.buildings[name]?.annual_income || 0
    }
    return entry
  })

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.1)" />
        <XAxis dataKey="name" tick={{ fill: 'var(--tact-text-dim,#888)', fontSize: 12 }} />
        <YAxis tickFormatter={fmtK} tick={{ fill: 'var(--tact-text-dim,#888)', fontSize: 11 }} width={72} />
        <Tooltip formatter={(v) => ils(v)} labelStyle={{ color: '#222' }} />
        <Legend />
        {names.map((name, i) => (
          <Bar
            key={name}
            dataKey={name}
            stackId="income"
            fill={COLORS[i % COLORS.length]}
            radius={i === names.length - 1 ? [3,3,0,0] : [0,0,0,0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── גרף רווח מצטבר ──────────────────────────────────────────────────────────

function CumulativeChart({ combined }) {
  if (!combined?.length) return null

  let cum = 0
  const data = combined.map((row) => {
    cum += row.total_profit
    return {
      name: String(row.year),
      'רווח שנתי': row.total_profit,
      'החזר הלוואה': row.loan_repayment > 0 ? -row.loan_repayment : null,
      'מצטבר': cum,
    }
  })

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.1)" />
        <XAxis dataKey="name" tick={{ fill: 'var(--tact-text-dim,#888)', fontSize: 12 }} />
        <YAxis tickFormatter={fmtK} tick={{ fill: 'var(--tact-text-dim,#888)', fontSize: 11 }} width={80} />
        <Tooltip formatter={(v) => ils(v)} labelStyle={{ color: '#222' }} />
        <Legend />
        <Bar dataKey="רווח שנתי" fill="#6c8ebf" radius={[3,3,0,0]} />
        <Bar dataKey="החזר הלוואה" fill="#e74c3c" radius={[3,3,0,0]} />
        <Line
          type="monotone"
          dataKey="מצטבר"
          stroke="#82ca9d"
          strokeWidth={2.5}
          dot={{ fill: '#82ca9d', r: 4 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ─── טבלת ריכוז: בניינים כשורות, שנים כעמודות + סיכום רווח לבניין ────────────

function CombinedTable({ combined, buildings }) {
  if (!combined?.length) return null
  const years = combined.map((r) => r.year)

  function buildingSummary(name) {
    return combined.reduce(
      (acc, r) => {
        const b = r.buildings[name]
        if (!b) return acc
        return {
          income: acc.income + (b.annual_income || 0),
          capex:  acc.capex  + (b.capex        || 0),
          opex:   acc.opex   + (b.annual_opex  || 0),
          profit: acc.profit + (b.profit        || 0),
        }
      },
      { income: 0, capex: 0, opex: 0, profit: 0 },
    )
  }

  // מיון מהגדול לקטן לפי רווח
  const summaries = Object.fromEntries(buildings.map((b) => [b.building_name, buildingSummary(b.building_name)]))
  const sortedBuildings = [...buildings].sort(
    (a, b) => summaries[b.building_name].profit - summaries[a.building_name].profit
  )

  const totalIncome  = combined.reduce((s, r) => s + r.total_income,  0)
  const totalCapex   = combined.reduce((s, r) => s + r.total_capex,   0)
  const totalOpex    = combined.reduce((s, r) => s + r.total_opex,    0)
  const totalProfit  = combined.reduce((s, r) => s + r.total_profit,  0)
  const totalLoan    = combined.reduce((s, r) => s + r.loan_repayment, 0)
  const hasLoan      = combined.some((r) => r.loan_repayment > 0)
  const profitBefore = totalProfit + totalLoan  // לפני ניכוי הלוואה

  const sep      = { borderRight: '2px solid rgba(255,255,255,.18)' }
  const footerTd = { fontSize: 13, fontWeight: 700 }

  return (
    <div className="table-wrap" style={{ overflowX: 'auto' }}>
      <table className="tact-table combined-pivot-table">
        <thead>
          <tr>
            <th style={{ minWidth: 150, textAlign: 'right' }}>בניין</th>
            {years.map((y) => (
              <th key={y} style={{ minWidth: 100, textAlign: 'left' }}>{y}</th>
            ))}
            <th style={{ minWidth: 110, textAlign: 'left', ...sep }}>סה"כ הכנסות</th>
            <th style={{ minWidth: 90,  textAlign: 'left' }}>CAPEX</th>
            <th style={{ minWidth: 90,  textAlign: 'left' }}>OPEX</th>
            <th style={{ minWidth: 120, textAlign: 'left', background: 'rgba(130,202,157,.12)', ...sep }}>
              רווח נקי לבניין
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedBuildings.map((b) => {
            const s = summaries[b.building_name]
            return (
              <tr key={b.id}>
                <td style={{ fontWeight: 500, textAlign: 'right' }}>{b.building_name}</td>
                {combined.map((row) => {
                  const bd    = row.buildings[b.building_name]
                  const inc   = bd?.annual_income || 0
                  const exp   = (bd?.capex || 0) + (bd?.annual_opex || 0)
                  const added = bd?.chargers_added || 0
                  return (
                    <td key={row.year} style={{ textAlign: 'left', fontSize: 12, lineHeight: 1.4, verticalAlign: 'top', paddingTop: 8, paddingBottom: 8 }}>
                      <div style={{ color: inc > 0 ? 'var(--tact-green)' : 'var(--tact-text-dim,#888)', fontWeight: 500 }}>
                        {inc > 0 ? ils(inc) : '—'}
                        {added > 0 && (
                          <span style={{ fontSize: 10, color: 'var(--tact-accent,#6c8ebf)', marginInlineStart: 3 }}>+{added}</span>
                        )}
                      </div>
                      {exp > 0 && (
                        <div style={{ color: 'var(--tact-red,#e74c3c)', fontSize: 11, opacity: .85 }}>
                          {ils(-exp)}
                        </div>
                      )}
                    </td>
                  )
                })}
                <td style={{ textAlign: 'left', color: 'var(--tact-green)', fontWeight: 600, ...sep }}>
                  {ils(s.income)}
                </td>
                <td style={{ textAlign: 'left', color: s.capex > 0 ? 'var(--tact-red,#e74c3c)' : 'inherit', fontSize: 13 }}>
                  {s.capex > 0 ? ils(-s.capex) : '—'}
                </td>
                <td style={{ textAlign: 'left', color: s.opex > 0 ? 'var(--tact-orange,#e67e22)' : 'inherit', fontSize: 13 }}>
                  {s.opex > 0 ? ils(-s.opex) : '—'}
                </td>
                <td style={{
                  textAlign: 'left', fontWeight: 700,
                  background: 'rgba(130,202,157,.08)',
                  color: s.profit >= 0 ? 'var(--tact-green)' : 'var(--tact-red,#e74c3c)',
                  ...sep,
                }}>
                  {ils(s.profit)}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          {/* שורה 1: רווח לפני הלוואה */}
          <tr style={{ borderTop: '2px solid rgba(255,255,255,.2)', background: 'rgba(108,142,191,.08)' }}>
            <td style={{ textAlign: 'right', ...footerTd }}>רווח צפוי לפני תשלום הלוואה</td>
            {combined.map((row) => {
              const v = row.total_profit + row.loan_repayment
              return (
                <td key={row.year} style={{ textAlign: 'left', ...footerTd, color: v >= 0 ? 'var(--tact-green)' : 'var(--tact-red,#e74c3c)' }}>
                  {ils(v)}
                </td>
              )
            })}
            <td style={{ textAlign: 'left', color: 'var(--tact-green)', ...footerTd, ...sep }}>{ils(totalIncome)}</td>
            <td style={{ textAlign: 'left', color: 'var(--tact-red,#e74c3c)', ...footerTd }}>{ils(-totalCapex)}</td>
            <td style={{ textAlign: 'left', color: 'var(--tact-orange,#e67e22)', ...footerTd }}>{ils(-totalOpex)}</td>
            <td style={{ textAlign: 'left', background: 'rgba(130,202,157,.15)', ...footerTd,
              color: profitBefore >= 0 ? 'var(--tact-green)' : 'var(--tact-red,#e74c3c)', ...sep }}>
              {ils(profitBefore)}
            </td>
          </tr>

          {/* שורה 2: החזר הלוואה (אותו גופן) */}
          <tr style={{ background: 'rgba(231,76,60,.06)' }}>
            <td style={{ textAlign: 'right', ...footerTd }}>החזר הלוואה</td>
            {combined.map((row) => (
              <td key={row.year} style={{ textAlign: 'left', ...footerTd, color: row.loan_repayment > 0 ? 'var(--tact-red,#e74c3c)' : 'var(--tact-text-dim,#aaa)' }}>
                {row.loan_repayment > 0 ? ils(-row.loan_repayment) : '—'}
              </td>
            ))}
            <td colSpan={3} style={sep} />
            <td style={{ textAlign: 'left', background: 'rgba(231,76,60,.1)', ...footerTd,
              color: totalLoan > 0 ? 'var(--tact-red,#e74c3c)' : 'var(--tact-text-dim,#aaa)', ...sep }}>
              {totalLoan > 0 ? ils(-totalLoan) : '—'}
            </td>
          </tr>

          {/* שורה 3: רווח לאחר הלוואה */}
          <tr style={{ background: 'rgba(130,202,157,.10)' }}>
            <td style={{ textAlign: 'right', ...footerTd }}>רווח צפוי לאחר החזר הלוואה</td>
            {combined.map((row) => (
              <td key={row.year} style={{ textAlign: 'left', ...footerTd, color: row.total_profit >= 0 ? 'var(--tact-green)' : 'var(--tact-red,#e74c3c)' }}>
                {ils(row.total_profit)}
              </td>
            ))}
            <td colSpan={3} style={sep} />
            <td style={{ textAlign: 'left', background: 'rgba(130,202,157,.2)', fontWeight: 800, fontSize: 14,
              color: totalProfit >= 0 ? 'var(--tact-green)' : 'var(--tact-red,#e74c3c)', ...sep }}>
              {ils(totalProfit)}
            </td>
          </tr>

        </tfoot>
      </table>
    </div>
  )
}

// ─── קומפוננט ראשי ───────────────────────────────────────────────────────────

export default function BuildingCashflow({ loading: appLoading }) {
  const [buildings, setBuildings] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [forecast, setForecast] = useState(null)
  const [combined, setCombined] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [globalGrowth, setGlobalGrowth] = useState(10)
  const [globalAvgKwh, setGlobalAvgKwh] = useState(100)
  const [globalCapex, setGlobalCapex] = useState({
    cost_charger_unit: 800,
    cost_infra_per_charger: 1200,
    cost_install_per_charger: 1300,
    cost_elec_panel: 6000,
    cost_comm_panel: 1000,
    chargers_per_panel: 10,
  })
  const [globalRates, setGlobalRates] = useState({
    avg_kwh_per_charger_monthly: 100,
    cost_rcd_per_charger: 300,
    cost_internet_per_charger: 400,
    cost_inspector_per_charger: 250,
  })
  const growthTimer = useRef(null)
  const kwhTimer = useRef(null)
  const capexTimers = useRef({})
  const ratesTimers = useRef({})

  async function applyGlobalGrowth(rate) {
    setGlobalGrowth(rate)
    clearTimeout(growthTimer.current)
    growthTimer.current = setTimeout(async () => {
      await Promise.all(
        buildings.map((b) => api.updateBuildingModel(b.id, { annual_growth_rate: rate }))
      )
      await load()
    }, 600)
  }

  async function applyGlobalAvgKwh(kwh) {
    setGlobalAvgKwh(kwh)
    setGlobalRates((prev) => ({ ...prev, avg_kwh_per_charger_monthly: kwh }))
    clearTimeout(kwhTimer.current)
    kwhTimer.current = setTimeout(async () => {
      await Promise.all(
        buildings.map((b) => api.updateBuildingModel(b.id, { avg_kwh_per_charger_monthly: kwh }))
      )
      await load()
    }, 600)
  }

  async function applyGlobalRateField(field, raw) {
    const isInt = ['start_year', 'forecast_years'].includes(field)
    const value = isInt ? parseInt(raw, 10) || 0 : parseFloat(raw) || 0
    setGlobalRates((prev) => ({ ...prev, [field]: value }))
    if (field === 'avg_kwh_per_charger_monthly') setGlobalAvgKwh(value)
    clearTimeout(ratesTimers.current[field])
    ratesTimers.current[field] = setTimeout(async () => {
      await Promise.all(
        buildings.map((b) => api.updateBuildingModel(b.id, { [field]: value }))
      )
      await load()
    }, 600)
  }

  async function applyGlobalCapexField(field, raw) {
    const value = field === 'chargers_per_panel' ? parseInt(raw, 10) || 0 : parseFloat(raw) || 0
    setGlobalCapex((prev) => ({ ...prev, [field]: value }))
    clearTimeout(capexTimers.current[field])
    capexTimers.current[field] = setTimeout(async () => {
      await Promise.all(
        buildings.map((b) => api.updateBuildingModel(b.id, { [field]: value }))
      )
      await load()
    }, 600)
  }

  async function load() {
    setLoading(true)
    try {
      const [bms, comb] = await Promise.all([
        api.listBuildingModels(),
        api.getCombinedForecast(),
      ])
      setBuildings(bms)
      setCombined(comb)
      if (bms.length > 0) {
        const b0 = bms[0]
        setGlobalGrowth(b0.annual_growth_rate ?? 10)
        setGlobalAvgKwh(b0.avg_kwh_per_charger_monthly ?? 100)
        setGlobalCapex({
          cost_charger_unit:        b0.cost_charger_unit        ?? 800,
          cost_infra_per_charger:   b0.cost_infra_per_charger   ?? 1200,
          cost_install_per_charger: b0.cost_install_per_charger ?? 1300,
          cost_elec_panel:          b0.cost_elec_panel          ?? 6000,
          cost_comm_panel:          b0.cost_comm_panel          ?? 1000,
          chargers_per_panel:       b0.chargers_per_panel       ?? 10,
        })
        setGlobalRates({
          avg_kwh_per_charger_monthly:  b0.avg_kwh_per_charger_monthly  ?? 100,
          cost_rcd_per_charger:         b0.cost_rcd_per_charger         ?? 300,
          cost_internet_per_charger:    b0.cost_internet_per_charger    ?? 400,
          cost_inspector_per_charger:   b0.cost_inspector_per_charger   ?? 250,
        })
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (selectedId == null) { setForecast(null); return }
    api.getBuildingForecast(selectedId).then(setForecast).catch(() => setForecast(null))
  }, [selectedId])

  async function handleRefresh() {
    const [bms, comb] = await Promise.all([
      api.listBuildingModels(),
      api.getCombinedForecast(),
    ])
    setBuildings(bms)
    setCombined(comb)
    if (selectedId != null) {
      const fc = await api.getBuildingForecast(selectedId)
      setForecast(fc)
    }
  }

  async function handleAdd() {
    const name = newName.trim()
    if (!name) return
    const bm = await api.createBuildingModel({ building_name: name, start_year: new Date().getFullYear() })
    setNewName('')
    setAdding(false)
    await load()
    setSelectedId(bm.id)
  }

  async function handleDelete(id) {
    if (!window.confirm('למחוק בניין זה?')) return
    await api.deleteBuildingModel(id)
    if (selectedId === id) setSelectedId(null)
    await load()
  }

  const selected = buildings.find((b) => b.id === selectedId)

  const totalIncome5yr  = combined.reduce((s, r) => s + r.total_income, 0)
  const totalCapex5yr   = combined.reduce((s, r) => s + r.total_capex, 0)
  const totalOpex5yr    = combined.reduce((s, r) => s + r.total_opex, 0)
  const totalProfit5yr  = combined.reduce((s, r) => s + r.total_profit, 0)

  return (
    <div className="building-cashflow-page">
      {/* ─── כותרת ─── */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>תזרים פר-בניין</h2>
        <button
          className="tact-btn tact-btn-secondary"
          style={{ fontSize: 13 }}
          onClick={() => setAdding((v) => !v)}
        >
          <TactIcon name="plus" size={14} />
          <span style={{ marginInlineStart: 4 }}>הוסף בניין</span>
        </button>
        {adding && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              className="tact-input"
              style={{ width: 200 }}
              placeholder="שם הבניין"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              autoFocus
            />
            <button className="tact-btn" onClick={handleAdd}>הוסף</button>
            <button className="tact-btn tact-btn-secondary" onClick={() => setAdding(false)}>ביטול</button>
          </div>
        )}
      </div>

      {/* ─── פאנל הגדרות גלובלי ─── */}
      {!loading && !appLoading && (() => {
        const panelCpx = globalCapex.cost_charger_unit + globalCapex.cost_infra_per_charger +
          globalCapex.cost_install_per_charger +
          (globalCapex.cost_elec_panel + globalCapex.cost_comm_panel) / Math.max(1, globalCapex.chargers_per_panel)

        const CAPEX_FIELDS_GLOBAL = [
          { key: 'cost_charger_unit',        label: 'עלות מטען',    unit: '₪', step: 100 },
          { key: 'cost_infra_per_charger',   label: 'תשתית',        unit: '₪', step: 100 },
          { key: 'cost_install_per_charger', label: 'התקנה',        unit: '₪', step: 100 },
          { key: 'cost_elec_panel',          label: 'ארון חשמל',    unit: '₪', step: 100 },
          { key: 'cost_comm_panel',          label: 'ארון תקשורת',  unit: '₪', step: 100 },
          { key: 'chargers_per_panel',       label: 'מטענים לארון', unit: '',  step: 1   },
        ]

        const sLabel = {
          fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
          color: 'var(--tact-text-dim,#888)', marginBottom: 12, display: 'block',
        }
        const fRow = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }
        const fDim = { color: 'var(--tact-text-dim,#aaa)', whiteSpace: 'nowrap' }
        const numInp = (val, step, width, onChange) => (
          <input
            type="number"
            className="tact-input"
            style={{ width, textAlign: 'center', fontWeight: 600, padding: '3px 6px', fontSize: 13 }}
            value={val}
            step={step}
            min={0}
            onChange={onChange}
          />
        )
        const unit = (u) => u && <span style={{ fontSize: 12, color: 'var(--tact-text-dim,#888)' }}>{u}</span>
        const colDivider = { borderInlineEnd: '1px solid rgba(255,255,255,.08)' }

        return (
          <div style={{
            background: 'rgba(255,255,255,.04)',
            border: '1px solid rgba(255,255,255,.12)',
            borderRadius: 12, marginBottom: 20, overflow: 'hidden',
          }}>
            {/* כותרת הפאנל */}
            <div style={{
              padding: '7px 18px',
              borderBottom: '1px solid rgba(255,255,255,.08)',
              background: 'rgba(255,255,255,.03)',
              fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
              color: 'var(--tact-text-dim,#777)',
            }}>
              הגדרות גלובליות — חלות על כל הבניינים
            </div>

            {/* שלושה עמודות */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>

              {/* עמודה 1 — הנחות יסוד */}
              <div style={{ padding: '16px 20px', background: 'rgba(108,142,191,.05)', ...colDivider }}>
                <span style={sLabel}>הנחות יסוד</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label style={fRow}>
                    <span style={{ ...fDim, minWidth: 100 }}>גידול שנתי:</span>
                    {numInp(globalGrowth, 1, 62, (e) => applyGlobalGrowth(parseFloat(e.target.value) || 0))}
                    {unit('%')}
                  </label>
                  <label style={fRow}>
                    <span style={{ ...fDim, minWidth: 100 }}>צריכה ממוצעת:</span>
                    {numInp(globalAvgKwh, 1, 72, (e) => applyGlobalAvgKwh(parseFloat(e.target.value) || 0))}
                    {unit('kWh/חודש')}
                  </label>
                </div>
              </div>

              {/* עמודה 2 — עלות התקנת מטען */}
              <div style={{ padding: '16px 20px', background: 'rgba(255,198,88,.04)', ...colDivider }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ ...sLabel, marginBottom: 0 }}>עלות התקנת מטען</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--tact-orange,#e67e22)', whiteSpace: 'nowrap' }}>
                    סה"כ: {ils(panelCpx)}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {CAPEX_FIELDS_GLOBAL.map(({ key, label, unit: u, step }) => (
                    <label key={key} style={fRow}>
                      <span style={{ ...fDim, minWidth: 90 }}>{label}:</span>
                      {numInp(
                        globalCapex[key], step,
                        key === 'chargers_per_panel' ? 50 : 76,
                        (e) => applyGlobalCapexField(key, e.target.value),
                      )}
                      {unit(u)}
                    </label>
                  ))}
                </div>
              </div>

              {/* עמודה 3 — עלויות התאמה למטענים קיימים */}
              <div style={{ padding: '16px 20px', background: 'rgba(130,202,157,.04)' }}>
                <span style={sLabel}>עלויות התאמה למטענים קיימים</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {GLOBAL_OPEX_FIELDS.map((f) => (
                    <label key={f.key} style={fRow}>
                      <span style={{ ...fDim, minWidth: 110 }}>{f.label}:</span>
                      {numInp(
                        globalRates[f.key] ?? 0, f.step, 72,
                        (e) => applyGlobalRateField(f.key, e.target.value),
                      )}
                      {unit(f.unit)}
                    </label>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )
      })()}

      {loading || appLoading ? (
        <div className="dim-text" style={{ padding: '2rem' }}>טוען...</div>
      ) : (
        <div className="building-master-detail">

          {/* ─── רשימת בניינים — שמאל ─── */}
          <div className="building-list-panel">
            <div
              className={`building-row ${selectedId == null ? 'selected' : ''}`}
              onClick={() => setSelectedId(null)}
            >
              <div className="building-row-name">כל הבניינים</div>
              <div className="building-row-meta">{buildings.length} בניינים</div>
            </div>
            {buildings.map((bm) => (
              <BuildingRow
                key={bm.id}
                bm={bm}
                selected={selectedId === bm.id}
                onSelect={setSelectedId}
                onDelete={handleDelete}
              />
            ))}
          </div>

          {/* ─── תוכן ימין ─── */}
          <div className="building-content-area">

            {/* תצוגה כוללת */}
            {selectedId == null && (
              <div className="building-detail">
                <div className="kpi-row" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
                  <div className="tact-kpi">
                    <div className="tact-kpi-label">סה"כ הכנסות (תחזית)</div>
                    <div className="tact-kpi-value" style={{ color: 'var(--tact-green)' }}>{ils(totalIncome5yr)}</div>
                  </div>
                  <div className="tact-kpi">
                    <div className="tact-kpi-label">סה"כ CAPEX</div>
                    <div className="tact-kpi-value" style={{ color: 'var(--tact-red,#e74c3c)' }}>{ils(totalCapex5yr)}</div>
                  </div>
                  <div className="tact-kpi">
                    <div className="tact-kpi-label">סה"כ OPEX</div>
                    <div className="tact-kpi-value" style={{ color: 'var(--tact-orange,#e67e22)' }}>{ils(totalOpex5yr)}</div>
                  </div>
                  <div className="tact-kpi">
                    <div className="tact-kpi-label">סה"כ רווח (תחזית)</div>
                    <div className="tact-kpi-value" style={{ color: totalProfit5yr >= 0 ? 'var(--tact-green)' : 'var(--tact-red,#e74c3c)' }}>
                      {ils(totalProfit5yr)}
                    </div>
                  </div>
                </div>

                {buildings.length === 0 ? (
                  <div className="empty-state">
                    <p>אין בניינים עדיין. לחץ "הוסף בניין" כדי להתחיל.</p>
                  </div>
                ) : (
                  <>
                    <h3>הכנסות לפי בניין ושנה</h3>
                    <CombinedChart combined={combined} buildings={buildings} />
                    <h3 style={{ marginTop: 24 }}>רווח שנתי ומצטבר</h3>
                    <CumulativeChart combined={combined} />
                    <h3 style={{ marginTop: 24 }}>טבלת תחזית כוללת</h3>
                    <CombinedTable combined={combined} buildings={buildings} />
                  </>
                )}
              </div>
            )}

            {/* תצוגת בניין בודד */}
            {selected && (
              <div className="building-detail">
                <h3 style={{ marginTop: 0 }}>{selected.building_name}</h3>

                {forecast && (
                  <div className="kpi-row" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
                    <div className="tact-kpi">
                      <div className="tact-kpi-label">סה"כ הכנסות ({selected.forecast_years} שנים)</div>
                      <div className="tact-kpi-value" style={{ color: 'var(--tact-green)' }}>{ils(forecast.total_income)}</div>
                    </div>
                    <div className="tact-kpi">
                      <div className="tact-kpi-label">סה"כ CAPEX</div>
                      <div className="tact-kpi-value" style={{ color: 'var(--tact-red,#e74c3c)' }}>{ils(forecast.total_capex)}</div>
                    </div>
                    <div className="tact-kpi">
                      <div className="tact-kpi-label">סה"כ OPEX</div>
                      <div className="tact-kpi-value" style={{ color: 'var(--tact-orange,#e67e22)' }}>{ils(forecast.total_opex)}</div>
                    </div>
                    <div className="tact-kpi">
                      <div className="tact-kpi-label">סה"כ רווח</div>
                      <div className="tact-kpi-value" style={{ color: forecast.total_profit >= 0 ? 'var(--tact-green)' : 'var(--tact-red,#e74c3c)' }}>
                        {ils(forecast.total_profit)}
                      </div>
                    </div>
                  </div>
                )}

                <div className="building-layout">
                  <div className="building-settings-panel">
                    <BuildingSettings bm={selected} globals={globalRates} onChange={handleRefresh} />
                  </div>
                  <div className="building-chart-panel">
                    <h4 style={{ marginTop: 0 }}>פירוט שנתי</h4>
                    {forecast ? <ForecastTable years={forecast.years} /> : <div className="dim-text">טוען...</div>}
                  </div>
                </div>

                <div style={{ marginTop: 24, marginBottom: 20 }}>
                  <h4 style={{ marginTop: 0, marginBottom: 12 }}>תחזית גרפית</h4>
                  {forecast ? <ForecastChart years={forecast.years} /> : <div className="dim-text">טוען...</div>}
                </div>
              </div>
            )}
          </div>


        </div>
      )}

      <style>{`
        .building-cashflow-page { padding: 1rem 0; }

        /* ─── פריסה ראשית: תוכן שמאל + רשימה ימין ─── */
        .building-master-detail {
          display: flex;
          gap: 20px;
          align-items: flex-start;
        }
        .building-content-area { flex: 1; min-width: 0; }
        .building-list-panel {
          width: 220px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
          position: sticky;
          top: 12px;
        }

        /* ─── שורת בניין ─── */
        .building-row {
          position: relative;
          background: var(--tact-surface, rgba(255,255,255,.06));
          border: 1.5px solid rgba(255,255,255,.12);
          border-radius: 8px;
          padding: 9px 12px;
          cursor: pointer;
          transition: border-color .15s, background .15s;
        }
        .building-row:hover { border-color: rgba(255,255,255,.3); }
        .building-row.selected { border-color: var(--tact-accent,#6c8ebf); background: rgba(108,142,191,.15); }
        .building-row-name { font-weight: 600; font-size: 13px; margin-bottom: 2px; }
        .building-row-meta { font-size: 11px; color: var(--tact-text-dim,#888); line-height: 1.4; }
        .building-row-delete {
          position: absolute; top: 6px; left: 6px;
          background: none; border: none; cursor: pointer;
          color: var(--tact-text-dim,#888); padding: 2px;
          opacity: 0; transition: opacity .15s;
        }
        .building-row:hover .building-row-delete { opacity: 1; }
        .building-row-delete:hover { color: var(--tact-red,#e74c3c); }

        .building-detail {
          background: var(--tact-surface, rgba(255,255,255,.04));
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 12px;
          padding: 20px;
        }

        .building-layout {
          display: grid;
          grid-template-columns: 360px 1fr;
          gap: 24px;
          margin-bottom: 24px;
        }
        @media (max-width: 860px) { .building-layout { grid-template-columns: 1fr; } }
        @media (max-width: 700px) { .building-master-detail { flex-direction: column; } .building-list-panel { width: 100%; position: static; } }

        .settings-section-title {
          font-size: 12px;
          font-weight: 600;
          color: var(--tact-text-dim,#aaa);
          text-transform: uppercase;
          letter-spacing: .05em;
          margin-bottom: 8px;
        }

        .settings-grid { display: flex; flex-direction: column; gap: 7px; }

        .setting-row {
          display: flex; align-items: center;
          justify-content: space-between; gap: 8px;
        }
        .setting-label { font-size: 13px; color: var(--tact-text-dim,#aaa); flex: 1; }
        .setting-note  { font-size: 11px; opacity: .7; }
        .setting-input-wrap { display: flex; align-items: center; gap: 4px; }
        .setting-input { width: 90px; text-align: left; font-size: 13px; padding: 4px 8px; }
        .setting-unit  { font-size: 11px; color: var(--tact-text-dim,#888); white-space: nowrap; }

        .capex-summary {
          margin-top: 8px; padding: 8px 12px;
          background: rgba(255,198,88,.08); border-radius: 8px; font-size: 13px;
        }

        .income-summary {
          margin-top: 14px; padding: 10px 12px;
          background: rgba(130,202,157,.1); border-radius: 8px; font-size: 13px;
        }

        .dim-text { color: var(--tact-text-dim,#888); font-size: 13px; }

        .empty-state { text-align: center; padding: 3rem; color: var(--tact-text-dim,#888); }
      `}</style>
    </div>
  )
}
