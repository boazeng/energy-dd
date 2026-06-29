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

// הכנסות (גידול שנתי מוגדר גלובלית בראש העמוד)
const INCOME_FIELDS = [
  { key: 'current_chargers',             label: 'מטענים נוכחיים',      unit: '',          step: 1,   type: 'int' },
  { key: 'potential_spots',              label: 'חניות פוטנציאליות',   unit: '',          step: 1,   type: 'int' },
  { key: 'mgmt_fee_per_charger',         label: 'עמלת ניהול למטען',    unit: '₪/חודש',   step: 0.1, type: 'float' },
  { key: 'avg_kwh_per_charger_monthly',  label: 'צריכה ממוצעת למטען',  unit: 'kWh/חודש', step: 1,   type: 'float' },
  { key: 'electricity_rate_agorot',      label: 'עמלת חשמל',           unit: "אג'/kWh",  step: 0.1, type: 'float' },
  { key: 'subscription_fee_per_charger', label: 'דמי מנוי למטען',      unit: '₪/חודש',   step: 0.1, type: 'float' },
  { key: 'charger_install_income',       label: 'הכנסה מהתקנת מטען',   unit: '₪/מטען',   step: 100, type: 'float', note: 'לפי הסכם דייר' },
  { key: 'start_year',                   label: 'שנת התחלה',            unit: '',          step: 1,   type: 'int' },
  { key: 'forecast_years',               label: 'שנות תחזית',           unit: '',          step: 1,   type: 'int' },
]

// CAPEX — עלויות מטען חדש (ניתן לשינוי)
const CAPEX_FIELDS = [
  { key: 'cost_charger_unit',        label: 'עלות מטען',                    unit: '₪',     step: 100, type: 'float' },
  { key: 'cost_infra_per_charger',   label: 'תשתית חשמל+תקשורת (50מ\')',   unit: '₪',     step: 100, type: 'float' },
  { key: 'cost_install_per_charger', label: 'התקנה כולל בודק',              unit: '₪',     step: 100, type: 'float' },
  { key: 'cost_elec_panel',          label: 'ארון חשמל',                    unit: '₪/ארון', step: 100, type: 'float' },
  { key: 'cost_comm_panel',          label: 'ארון תקשורת',                  unit: '₪/ארון', step: 100, type: 'float' },
  { key: 'chargers_per_panel',       label: 'מטענים לארון',                 unit: '',       step: 1,   type: 'int',   note: 'ברירת מחדל 10' },
]

// הוצאות תפעוליות שנתיות
const OPEX_FIELDS = [
  { key: 'chargers_no_rcd',             label: 'מטענים ללא פחת',      unit: '',       step: 1,  type: 'int',   note: 'מסונכרן מהאקסל' },
  { key: 'cost_rcd_per_charger',        label: 'עלות פחת חסר',        unit: '₪/שנה', step: 10, type: 'float', note: 'למטען ללא פחת' },
  { key: 'cost_internet_per_charger',   label: 'עלות אינטרנט',        unit: '₪/שנה', step: 10, type: 'float', note: 'לכל מטען' },
  { key: 'cost_inspector_per_charger',  label: 'עלות אישור בודק',     unit: '₪/שנה', step: 10, type: 'float', note: 'לכל מטען' },
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

function BuildingSettings({ bm, onChange }) {
  const [local, setLocal] = useState({ ...bm, extra_costs: bm.extra_costs || [] })

  useEffect(() => { setLocal({ ...bm, extra_costs: bm.extra_costs || [] }) }, [bm.id])

  const save = useDebounce(async (patch) => {
    try { await api.updateBuildingModel(bm.id, patch) } catch { /* ignore */ }
    onChange()
  })

  function handle(key, raw) {
    const def = [...INCOME_FIELDS, ...CAPEX_FIELDS, ...OPEX_FIELDS].find((f) => f.key === key)
    const value = def?.type === 'int' ? parseInt(raw, 10) || 0 : parseFloat(raw) || 0
    const next = { ...local, [key]: value }
    setLocal(next)
    save({ [key]: value })
  }

  function saveExtraCosts(costs) {
    const next = { ...local, extra_costs: costs }
    setLocal(next)
    save({ extra_costs: costs })
  }

  function addExtraCost() {
    saveExtraCosts([...local.extra_costs, { name: '', cost_per_charger: 0 }])
  }

  function removeExtraCost(i) {
    saveExtraCosts(local.extra_costs.filter((_, idx) => idx !== i))
  }

  function updateExtraCost(i, field, val) {
    const updated = local.extra_costs.map((c, idx) =>
      idx === i ? { ...c, [field]: field === 'cost_per_charger' ? (parseFloat(val) || 0) : val } : c
    )
    saveExtraCosts(updated)
  }

  const incomePerCharger = monthlyIncome(local)
  const opexCurrent = annualOpex(local)
  const capexEach = capexPerCharger(local)
  const extraTotal = (local.extra_costs || []).reduce((s, c) => s + (c.cost_per_charger || 0), 0)

  return (
    <div className="building-settings">
      <div className="settings-section-title">הכנסות</div>
      <div className="settings-grid">
        {INCOME_FIELDS.map((f) => (
          <FieldRow key={f.key} fieldDef={f} value={local[f.key]} onChange={handle} />
        ))}
      </div>

      <div className="settings-section-title" style={{ marginTop: 16 }}>הוצאות חד-פעמיות (OPEX שנה ראשונה — מטענים קיימים)</div>
      <div className="settings-grid">
        {OPEX_FIELDS.map((f) => (
          <FieldRow key={f.key} fieldDef={f} value={local[f.key]} onChange={handle} />
        ))}
      </div>

      <div className="settings-section-title" style={{ marginTop: 16 }}>
        עלויות נוספות פר מטען
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
      {extraTotal > 0 && (
        <div className="dim-text" style={{ fontSize: 12, marginTop: 4 }}>
          סה"כ עלויות נוספות: <strong style={{ color: 'var(--tact-orange,#e67e22)' }}>{ils(extraTotal)}</strong>/מטען · {ils(extraTotal * (local.current_chargers || 0))} לכלל {local.current_chargers || 0} מטענים
        </div>
      )}

      <div className="income-summary">
        <div>
          <span>הכנסה חודשית למטען: </span>
          <strong style={{ color: 'var(--tact-green)' }}>{ils(incomePerCharger)}</strong>
          <span className="dim-text" style={{ fontSize: 11 }}>
            {' '}(ניהול {ils(local.mgmt_fee_per_charger)} + חשמל {ils((local.electricity_rate_agorot / 100) * local.avg_kwh_per_charger_monthly)} + מנוי {ils(local.subscription_fee_per_charger)})
          </span>
        </div>
        <div style={{ marginTop: 4 }}>
          <span>OPEX (שנה ראשונה): </span>
          <strong style={{ color: 'var(--tact-orange,#e67e22)' }}>{ils(opexCurrent)}</strong>
          <div className="dim-text" style={{ fontSize: 11, marginTop: 2 }}>
            חד-פעמי בשנת {local.start_year || 2026} בלבד — מ-{(local.start_year || 2026) + 1} ואילך עלות OPEX = 0
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── כרטיסיית בניין ──────────────────────────────────────────────────────────

function BuildingCard({ bm, selected, onSelect, onDelete }) {
  return (
    <div
      className={`building-card ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(bm.id)}
    >
      <div className="building-card-name">{bm.building_name}</div>
      <div className="building-card-meta">
        {bm.current_chargers} מטענים · {bm.potential_spots} פוטנציאל
      </div>
      <div className="building-card-meta dim-text">
        גידול: {bm.annual_growth_rate}% · {bm.forecast_years} שנים
      </div>
      <button
        className="building-card-delete"
        title="מחק בניין"
        onClick={(e) => { e.stopPropagation(); onDelete(bm.id) }}
      >
        <TactIcon name="trash" size={14} />
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

  // חישוב סיכום לכל בניין על פני כל השנים
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

  const totalIncome  = combined.reduce((s, r) => s + r.total_income,  0)
  const totalCapex   = combined.reduce((s, r) => s + r.total_capex,   0)
  const totalOpex    = combined.reduce((s, r) => s + r.total_opex,    0)
  const totalProfit  = combined.reduce((s, r) => s + r.total_profit,  0)
  const totalLoan    = combined.reduce((s, r) => s + r.loan_repayment, 0)
  const hasLoan      = combined.some((r) => r.loan_repayment > 0)

  const sep = { borderRight: '2px solid rgba(255,255,255,.18)' }

  return (
    <div className="table-wrap" style={{ overflowX: 'auto' }}>
      <table className="tact-table combined-pivot-table">
        <thead>
          <tr>
            <th style={{ minWidth: 150, textAlign: 'right' }}>בניין</th>
            {years.map((y) => (
              <th key={y} style={{ minWidth: 100, textAlign: 'left' }}>{y}</th>
            ))}
            {/* עמודות סיכום לבניין */}
            <th style={{ minWidth: 110, textAlign: 'left', ...sep }}>סה"כ הכנסות</th>
            <th style={{ minWidth: 90,  textAlign: 'left' }}>CAPEX</th>
            <th style={{ minWidth: 90,  textAlign: 'left' }}>OPEX</th>
            <th style={{ minWidth: 110, textAlign: 'left', background: 'rgba(130,202,157,.12)', ...sep }}>
              רווח נקי לבניין
            </th>
          </tr>
        </thead>
        <tbody>
          {buildings.map((b) => {
            const s = buildingSummary(b.building_name)
            return (
              <tr key={b.id}>
                <td style={{ fontWeight: 500, textAlign: 'right' }}>{b.building_name}</td>
                {combined.map((row) => {
                  const b_data = row.buildings[b.building_name]
                  const inc    = b_data?.annual_income || 0
                  const exp    = (b_data?.capex || 0) + (b_data?.annual_opex || 0)
                  const added  = b_data?.chargers_added || 0
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
                {/* סיכום לבניין */}
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
          {/* שורת סה"כ */}
          <tr style={{ fontWeight: 700, borderTop: '2px solid rgba(255,255,255,.2)', background: 'rgba(108,142,191,.1)' }}>
            <td style={{ textAlign: 'right' }}>סה"כ כל הבניינים</td>
            {combined.map((row) => (
              <td key={row.year} style={{ textAlign: 'left', fontSize: 12, lineHeight: 1.4, verticalAlign: 'top', paddingTop: 8, paddingBottom: 8 }}>
                <div style={{ color: 'var(--tact-green)' }}>{ils(row.total_income)}</div>
                {(row.total_capex + row.total_opex) > 0 && (
                  <div style={{ color: 'var(--tact-red,#e74c3c)', fontSize: 11, opacity: .85 }}>
                    {ils(-(row.total_capex + row.total_opex))}
                  </div>
                )}
              </td>
            ))}
            <td style={{ textAlign: 'left', color: 'var(--tact-green)', ...sep }}>{ils(totalIncome)}</td>
            <td style={{ textAlign: 'left', color: 'var(--tact-red,#e74c3c)', fontSize: 13 }}>{ils(-totalCapex)}</td>
            <td style={{ textAlign: 'left', color: 'var(--tact-orange,#e67e22)', fontSize: 13 }}>{ils(-totalOpex)}</td>
            <td style={{ textAlign: 'left', fontWeight: 800, background: 'rgba(130,202,157,.15)',
              color: totalProfit >= 0 ? 'var(--tact-green)' : 'var(--tact-red,#e74c3c)', ...sep }}>
              {ils(totalProfit)}
            </td>
          </tr>
          {/* החזר הלוואה */}
          {hasLoan && (
            <tr style={{ fontSize: 12, color: 'var(--tact-text-dim,#888)' }}>
              <td style={{ textAlign: 'right' }}>החזר הלוואה (כולל)</td>
              {combined.map((row) => (
                <td key={row.year} style={{ textAlign: 'left', color: row.loan_repayment > 0 ? 'var(--tact-red,#e74c3c)' : 'inherit' }}>
                  {row.loan_repayment > 0 ? ils(-row.loan_repayment) : '—'}
                </td>
              ))}
              <td colSpan={3} />
              <td style={{ textAlign: 'left', color: 'var(--tact-red,#e74c3c)', ...sep }}>{ils(-totalLoan)}</td>
            </tr>
          )}
          {/* תזרים מצטבר */}
          {(() => {
            let cum = 0
            return (
              <tr style={{ fontWeight: 800, background: 'rgba(130,202,157,.1)' }}>
                <td style={{ textAlign: 'right' }}>תזרים מצטבר</td>
                {combined.map((row) => {
                  cum += row.total_profit
                  const c = cum
                  return (
                    <td key={row.year} style={{ textAlign: 'left', color: c >= 0 ? 'var(--tact-green)' : 'var(--tact-red,#e74c3c)' }}>
                      {ils(c)}
                    </td>
                  )
                })}
                <td colSpan={3} />
                <td style={{ textAlign: 'left', color: cum >= 0 ? 'var(--tact-green)' : 'var(--tact-red,#e74c3c)', ...sep }}>
                  {ils(cum)}
                </td>
              </tr>
            )
          })()}
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
  const growthTimer = useRef(null)
  const kwhTimer = useRef(null)
  const capexTimers = useRef({})

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
    clearTimeout(kwhTimer.current)
    kwhTimer.current = setTimeout(async () => {
      await Promise.all(
        buildings.map((b) => api.updateBuildingModel(b.id, { avg_kwh_per_charger_monthly: kwh }))
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,.06)', borderRadius: 8, padding: '6px 14px', border: '1px solid rgba(255,255,255,.12)' }}>
          <label style={{ fontSize: 13, color: 'var(--tact-text-dim,#aaa)', whiteSpace: 'nowrap' }}>גידול שנתי לכל הבניינים:</label>
          <input
            type="number"
            className="tact-input"
            style={{ width: 70, textAlign: 'center', fontWeight: 600 }}
            value={globalGrowth}
            step={1}
            min={0}
            max={100}
            onChange={(e) => applyGlobalGrowth(parseFloat(e.target.value) || 0)}
          />
          <span style={{ fontSize: 13 }}>%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,.06)', borderRadius: 8, padding: '6px 14px', border: '1px solid rgba(255,255,255,.12)' }}>
          <label style={{ fontSize: 13, color: 'var(--tact-text-dim,#aaa)', whiteSpace: 'nowrap' }}>צריכה ממוצעת למטען:</label>
          <input
            type="number"
            className="tact-input"
            style={{ width: 80, textAlign: 'center', fontWeight: 600 }}
            value={globalAvgKwh}
            step={1}
            min={0}
            onChange={(e) => applyGlobalAvgKwh(parseFloat(e.target.value) || 0)}
          />
          <span style={{ fontSize: 13 }}>kWh/חודש</span>
        </div>
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

      {/* ─── פאנל CAPEX גלובלי ─── */}
      {!loading && !appLoading && (() => {
        const panelCpx = globalCapex.cost_charger_unit + globalCapex.cost_infra_per_charger +
          globalCapex.cost_install_per_charger +
          (globalCapex.cost_elec_panel + globalCapex.cost_comm_panel) / Math.max(1, globalCapex.chargers_per_panel)
        const CAPEX_FIELDS_GLOBAL = [
          { key: 'cost_charger_unit',        label: 'עלות מטען',       unit: '₪', step: 100 },
          { key: 'cost_infra_per_charger',   label: 'תשתית',           unit: '₪', step: 100 },
          { key: 'cost_install_per_charger', label: 'התקנה',           unit: '₪', step: 100 },
          { key: 'cost_elec_panel',          label: 'ארון חשמל',       unit: '₪', step: 100 },
          { key: 'cost_comm_panel',          label: 'ארון תקשורת',     unit: '₪', step: 100 },
          { key: 'chargers_per_panel',       label: 'מטענים לארון',    unit: '',  step: 1   },
        ]
        return (
          <div style={{
            background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)',
            borderRadius: 10, padding: '12px 18px', marginBottom: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--tact-text-dim,#aaa)', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                עלויות התקנת מטען — גלובלי לכל הבניינים
              </span>
              {CAPEX_FIELDS_GLOBAL.map(({ key, label, unit, step }) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
                  <span style={{ color: 'var(--tact-text-dim,#aaa)', whiteSpace: 'nowrap' }}>{label}:</span>
                  <input
                    type="number"
                    className="tact-input"
                    style={{ width: key === 'chargers_per_panel' ? 52 : 80, textAlign: 'center', fontWeight: 600, padding: '4px 6px', fontSize: 13 }}
                    value={globalCapex[key]}
                    step={step}
                    min={0}
                    onChange={(e) => applyGlobalCapexField(key, e.target.value)}
                  />
                  {unit && <span style={{ fontSize: 12, color: 'var(--tact-text-dim,#888)' }}>{unit}</span>}
                </label>
              ))}
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--tact-orange,#e67e22)', whiteSpace: 'nowrap', marginInlineStart: 'auto' }}>
                סה"כ למטען: {ils(panelCpx)}
              </span>
            </div>
          </div>
        )
      })()}

      {loading || appLoading ? (
        <div className="dim-text" style={{ padding: '2rem' }}>טוען...</div>
      ) : (
        <>
          {/* ─── רשימת בניינים ─── */}
          <div className="building-cards-row">
            <div
              className={`building-card ${selectedId == null ? 'selected' : ''}`}
              onClick={() => setSelectedId(null)}
            >
              <div className="building-card-name">כל הבניינים</div>
              <div className="building-card-meta">{buildings.length} בניינים</div>
            </div>
            {buildings.map((bm) => (
              <BuildingCard
                key={bm.id}
                bm={bm}
                selected={selectedId === bm.id}
                onSelect={setSelectedId}
                onDelete={handleDelete}
              />
            ))}
          </div>

          {/* ─── תצוגה כוללת ─── */}
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

          {/* ─── תצוגת בניין בודד ─── */}
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
                  <BuildingSettings bm={selected} onChange={handleRefresh} />
                </div>
                <div className="building-chart-panel">
                  <h4 style={{ marginTop: 0 }}>תחזית גרפית</h4>
                  {forecast ? <ForecastChart years={forecast.years} /> : <div className="dim-text">טוען...</div>}
                </div>
              </div>

              <h4>פירוט שנתי</h4>
              {forecast ? <ForecastTable years={forecast.years} /> : <div className="dim-text">טוען...</div>}
            </div>
          )}
        </>
      )}

      <style>{`
        .building-cashflow-page { padding: 1rem 0; }

        .building-cards-row {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 24px;
        }

        .building-card {
          position: relative;
          background: var(--tact-surface, rgba(255,255,255,.06));
          border: 1.5px solid rgba(255,255,255,.12);
          border-radius: 10px;
          padding: 12px 16px;
          cursor: pointer;
          min-width: 160px;
          transition: border-color .15s, background .15s;
        }
        .building-card:hover { border-color: rgba(255,255,255,.3); }
        .building-card.selected { border-color: var(--tact-accent,#6c8ebf); background: rgba(108,142,191,.15); }

        .building-card-name { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
        .building-card-meta { font-size: 12px; color: var(--tact-text-dim,#888); line-height: 1.5; }

        .building-card-delete {
          position: absolute; top: 8px; left: 8px;
          background: none; border: none; cursor: pointer;
          color: var(--tact-text-dim,#888); padding: 2px;
          opacity: 0; transition: opacity .15s;
        }
        .building-card:hover .building-card-delete { opacity: 1; }
        .building-card-delete:hover { color: var(--tact-red,#e74c3c); }

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
