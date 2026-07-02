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

const MONTHS_SHORT = ['ינ׳','פב׳','מר׳','אפ׳','מי׳','יו׳','יל׳','אג׳','ספ׳','אוק׳','נו׳','דצ׳']

// מחשב משקל הכנסה לפי מספר המטענים בנקודת האמצע של כל תקופה
function periodWeights(prev, chargersAdded, n) {
  const chPerPeriod = chargersAdded / n
  const ws = Array.from({ length: n }, (_, k) => prev + (k + 0.5) * chPerPeriod)
  const wSum = ws.reduce((s, w) => s + w, 0)
  return { ws, wSum, chPerPeriod }
}

function expandCombined(combined, viewMode) {
  if (viewMode === 'annual') return combined.map((r) => ({ ...r, period: String(r.year) }))
  const n = viewMode === 'quarterly' ? 4 : 12
  const out = []
  for (const row of combined) {
    // מחשב משקלות פר-בניין מחוץ ללולאת התקופות
    const bldgMeta = {}
    for (const [name, bd] of Object.entries(row.buildings || {})) {
      const prev = (bd.total_chargers || 0) - (bd.chargers_added || 0)
      bldgMeta[name] = { prev, ...periodWeights(prev, bd.chargers_added || 0, n) }
    }

    for (let i = 0; i < n; i++) {
      const label = viewMode === 'quarterly'
        ? `Q${i + 1} ${row.year}`
        : `${MONTHS_SHORT[i]} '${String(row.year).slice(2)}`
      const buildings = {}
      for (const [name, bd] of Object.entries(row.buildings || {})) {
        const { ws, wSum, chPerPeriod, prev } = bldgMeta[name]
        const inc = wSum > 0 ? (bd.annual_income || 0) * ws[i] / wSum : (bd.annual_income || 0) / n
        const cpx = (bd.capex || 0) / n
        const opx = (bd.annual_opex || 0) / n
        const mnt = (bd.maintenance_opex || 0) / n
        buildings[name] = {
          ...bd,
          annual_income: inc, capex: cpx, annual_opex: opx, maintenance_opex: mnt,
          profit: inc - cpx - opx - mnt,
          chargers_added: chPerPeriod, total_chargers: prev + (i + 1) * chPerPeriod,
        }
      }
      const totalIncome = Object.values(buildings).reduce((s, b) => s + b.annual_income, 0)
      const totalCapex  = Object.values(buildings).reduce((s, b) => s + b.capex, 0)
      const totalOpex   = Object.values(buildings).reduce((s, b) => s + b.annual_opex, 0)
      const totalMaint  = Object.values(buildings).reduce((s, b) => s + (b.maintenance_opex || 0), 0)
      out.push({
        ...row, period: label, buildings,
        total_income: totalIncome, total_capex: totalCapex, total_opex: totalOpex,
        total_profit: totalIncome - totalCapex - totalOpex - totalMaint,
      })
    }
  }
  return out
}

function expandYears(years, viewMode) {
  if (viewMode === 'annual') return years.map((y) => ({ ...y, period: String(y.year) }))
  const n = viewMode === 'quarterly' ? 4 : 12
  const out = []
  for (const y of years) {
    const prev = (y.total_chargers || 0) - (y.chargers_added || 0)
    const { ws, wSum, chPerPeriod } = periodWeights(prev, y.chargers_added || 0, n)
    for (let i = 0; i < n; i++) {
      const label = viewMode === 'quarterly'
        ? `Q${i + 1} ${y.year}`
        : `${MONTHS_SHORT[i]} '${String(y.year).slice(2)}`
      const inc = wSum > 0 ? (y.annual_income || 0) * ws[i] / wSum : (y.annual_income || 0) / n
      const cpx = (y.capex || 0) / n
      const opx = (y.annual_opex || 0) / n
      const mnt = (y.maintenance_opex || 0) / n
      out.push({
        ...y, period: label,
        annual_income: inc, capex: cpx, annual_opex: opx, maintenance_opex: mnt,
        profit: inc - cpx - opx - mnt,
        chargers_added: chPerPeriod, total_chargers: prev + (i + 1) * chPerPeriod,
      })
    }
  }
  return out
}

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
  const cur = bm.current_chargers || 0
  const noRcd = Math.min(bm.chargers_no_rcd || 0, cur)
  return (
    cur * ((bm.cost_internet_per_charger || 0) + (bm.cost_inspector_per_charger || 0)) +
    noRcd * (bm.cost_rcd_per_charger || 0)
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

function ForecastTable({ years, viewMode = 'annual' }) {
  if (!years?.length) return <p className="dim-text" style={{ padding: '1rem' }}>אין נתונים</p>
  const periods = expandYears(years, viewMode)
  let cum = 0
  const rows = periods.map((p) => { cum += p.profit; return { ...p, cumulative: cum } })
  const isAnnual = viewMode === 'annual'
  return (
    <div className="table-wrap" style={{ overflowX: 'auto' }}>
      <table className="tact-table" style={{ minWidth: isAnnual ? 780 : 640 }}>
        <thead>
          <tr>
            <th>{isAnnual ? 'שנה' : 'תקופה'}</th>
            <th>מטענים חדשים</th>
            {isAnnual && <th>סה"כ מטענים</th>}
            <th>הכנסה</th>
            <th>עלות התקנת מטענים</th>
            <th>עלות התאמה</th>
            <th>עלות תחזוקה</th>
            <th>רווח</th>
            <th>רווח מצטבר</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, idx) => (
            <tr key={idx}>
              <td><strong>{p.period}</strong></td>
              <td>{p.chargers_added > 0 ? `+${Number(p.chargers_added) % 1 === 0 ? p.chargers_added : Number(p.chargers_added).toFixed(1)}` : '—'}</td>
              {isAnnual && <td>{p.total_chargers}</td>}
              <td style={{ color: 'var(--tact-green)' }}>{ils(p.annual_income)}</td>
              <td style={{ color: p.capex > 0 ? 'var(--tact-red,#e74c3c)' : 'inherit' }}>
                {p.capex > 0 ? ils(-p.capex) : '—'}
              </td>
              <td style={{ color: 'var(--tact-orange,#e67e22)' }}>
                {p.annual_opex > 0 ? ils(-p.annual_opex) : '—'}
              </td>
              <td style={{ color: 'var(--tact-orange,#e67e22)' }}>
                {p.maintenance_opex > 0 ? ils(-p.maintenance_opex) : '—'}
              </td>
              <td style={{ fontWeight: 600, color: p.profit >= 0 ? 'var(--tact-green)' : 'var(--tact-red,#e74c3c)' }}>
                {ils(p.profit)}
              </td>
              <td style={{ fontWeight: 700, color: p.cumulative >= 0 ? 'var(--tact-green)' : 'var(--tact-red,#e74c3c)' }}>
                {ils(p.cumulative)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── גרף לבניין בודד ─────────────────────────────────────────────────────────

function ForecastChart({ years, viewMode = 'annual' }) {
  if (!years?.length) return null
  const periods = expandYears(years, viewMode)
  const data = periods.map((p) => ({
    name: p.period,
    'הכנסה': p.annual_income,
    'עלות התקנת מטענים': p.capex,
    'עלות התאמה': p.annual_opex,
    'עלות תחזוקה': p.maintenance_opex,
    'רווח': p.profit,
  }))
  const monthly = viewMode === 'monthly'
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: monthly ? 44 : 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.1)" />
        <XAxis dataKey="name" tick={{ fill: 'var(--tact-text-dim,#888)', fontSize: monthly ? 9 : 12 }}
          interval={monthly ? 2 : 0} angle={monthly ? -45 : 0} textAnchor={monthly ? 'end' : 'middle'} />
        <YAxis tickFormatter={fmtK} tick={{ fill: 'var(--tact-text-dim,#888)', fontSize: 11 }} width={72} />
        <Tooltip formatter={(v) => ils(v)} labelStyle={{ color: '#222' }} />
        <Legend />
        <Bar dataKey="הכנסה"  fill="#82ca9d" radius={[3,3,0,0]} />
        <Bar dataKey="עלות התקנת מטענים" fill="#ff7c7c" radius={[3,3,0,0]} />
        <Bar dataKey="עלות התאמה"  fill="#ffc658" radius={[3,3,0,0]} />
        <Bar dataKey="עלות תחזוקה" fill="#a29bfe" radius={[3,3,0,0]} />
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

  function handleContract(key, raw) {
    const value = parseInt(raw, 10) || null
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

      {/* ─── פרטי הסכם ─── */}
      <div className="settings-section-title" style={{ marginTop: 16 }}>תקופת הסכם</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <label className="setting-row">
          <span className="setting-label">שנת תחילת הסכם</span>
          <span className="setting-input-wrap">
            <input
              type="number" step={1} min={2000} max={2100}
              value={local.contract_start_year || ''}
              placeholder="—"
              onChange={(e) => handleContract('contract_start_year', e.target.value)}
              className="tact-input setting-input"
            />
          </span>
        </label>
        <label className="setting-row">
          <span className="setting-label">משך ההסכם</span>
          <span className="setting-input-wrap">
            <input
              type="number" step={1} min={1} max={50}
              value={local.contract_duration_years || ''}
              placeholder="—"
              onChange={(e) => handleContract('contract_duration_years', e.target.value)}
              className="tact-input setting-input"
            />
            <span className="setting-unit">שנים</span>
          </span>
        </label>
        {local.contract_start_year > 0 && local.contract_duration_years > 0 && (
          <div style={{ fontSize: 12, color: 'var(--tact-text-dim,#aaa)', padding: '4px 0' }}>
            תום חוזה:{' '}
            <strong style={{ color: 'var(--tact-green)' }}>
              {local.contract_start_year + local.contract_duration_years}
            </strong>
            {' · '}שנות תחזית:{' '}
            <strong style={{ color: 'var(--tact-accent,#6c8ebf)' }}>
              {Math.max(1, local.contract_start_year + local.contract_duration_years - (local.start_year || bm.start_year))}
            </strong>
          </div>
        )}
        {!(local.contract_start_year > 0 && local.contract_duration_years > 0) && (
          <div className="dim-text" style={{ fontSize: 11, padding: '2px 0' }}>
            לא הוגדר — משתמשים ב-{local.forecast_years || bm.forecast_years} שנות תחזית ברירת מחדל
          </div>
        )}
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

function BuildingRow({ bm, selected, excluded, onSelect, onDelete }) {
  const missingAgreement = bm.notes?.includes('חסר הסכם')
  return (
    <div
      className={`building-row ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(bm.id)}
      style={excluded ? { opacity: 0.45 } : undefined}
    >
      <div className="building-row-name">
        {bm.building_name}
        {missingAgreement && (
          <span style={{
            display: 'inline-block', marginInlineStart: 6,
            fontSize: 9, fontWeight: 700, padding: '1px 5px',
            borderRadius: 4, background: 'rgba(226,72,61,.18)',
            color: '#e2483d', verticalAlign: 'middle',
          }}>
            חסר הסכם
          </span>
        )}
      </div>
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

function CombinedChart({ combined, buildings, viewMode = 'annual' }) {
  if (!combined?.length) return <p className="dim-text" style={{ padding: '1rem' }}>אין נתונים</p>
  const periods = expandCombined(combined, viewMode)
  const names = buildings.map((b) => b.building_name)
  const data = periods.map((row) => {
    const entry = { name: row.period }
    for (const name of names) { entry[name] = row.buildings[name]?.annual_income || 0 }
    return entry
  })
  const monthly = viewMode === 'monthly'
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: monthly ? 44 : 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.1)" />
        <XAxis dataKey="name" tick={{ fill: 'var(--tact-text-dim,#888)', fontSize: monthly ? 9 : 12 }}
          interval={monthly ? 2 : 0} angle={monthly ? -45 : 0} textAnchor={monthly ? 'end' : 'middle'} />
        <YAxis tickFormatter={fmtK} tick={{ fill: 'var(--tact-text-dim,#888)', fontSize: 11 }} width={72} />
        <Tooltip formatter={(v) => ils(v)} labelStyle={{ color: '#222' }} />
        <Legend />
        {names.map((name, i) => (
          <Bar key={name} dataKey={name} stackId="income" fill={COLORS[i % COLORS.length]}
            radius={i === names.length - 1 ? [3,3,0,0] : [0,0,0,0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── גרף רווח מצטבר ──────────────────────────────────────────────────────────

function CumulativeChart({ combined, viewMode = 'annual' }) {
  if (!combined?.length) return null
  const periods = expandCombined(combined, viewMode)
  let cum = 0
  const data = periods.map((row) => {
    cum += row.total_profit
    return { name: row.period, 'רווח': row.total_profit, 'מצטבר': cum }
  })
  const monthly = viewMode === 'monthly'
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: monthly ? 44 : 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.1)" />
        <XAxis dataKey="name" tick={{ fill: 'var(--tact-text-dim,#888)', fontSize: monthly ? 9 : 12 }}
          interval={monthly ? 2 : 0} angle={monthly ? -45 : 0} textAnchor={monthly ? 'end' : 'middle'} />
        <YAxis tickFormatter={fmtK} tick={{ fill: 'var(--tact-text-dim,#888)', fontSize: 11 }} width={80} />
        <Tooltip formatter={(v) => ils(v)} labelStyle={{ color: '#222' }} />
        <Legend />
        <Bar dataKey="רווח" fill="#6c8ebf" radius={[3,3,0,0]} />
        <Line type="monotone" dataKey="מצטבר" stroke="#82ca9d" strokeWidth={2.5} dot={{ fill: '#82ca9d', r: 4 }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ─── טבלת ריכוז: בניינים כשורות, שנים כעמודות + סיכום רווח לבניין ────────────

function CombinedTable({ combined, buildings, overheadExpenses = [], excludedIds = new Set(), viewMode = 'annual' }) {
  if (!combined?.length) return null
  const years = combined.map((r) => r.year)
  const periods = expandCombined(combined, viewMode)
  const n = viewMode === 'quarterly' ? 4 : viewMode === 'monthly' ? 12 : 1

  const includedBuildings = buildings.filter((b) => !excludedIds.has(b.id))

  function buildingTotalProfit(name) {
    return combined.reduce((s, r) => s + (r.buildings[name]?.profit || 0), 0)
  }

  const sortedBuildings = [...includedBuildings].sort(
    (a, b) => buildingTotalProfit(b.building_name) - buildingTotalProfit(a.building_name)
  )

  const periodTotals = periods.map((row) => ({
    period: row.period,
    inc: includedBuildings.reduce((s, b) => s + (row.buildings[b.building_name]?.annual_income || 0), 0),
    exp: includedBuildings.reduce((s, b) => s + (row.buildings[b.building_name]?.capex || 0) + (row.buildings[b.building_name]?.annual_opex || 0) + (row.buildings[b.building_name]?.maintenance_opex || 0), 0),
  }))

  const totalProfit   = combined.reduce((s, r) => s + includedBuildings.reduce((ss, b) => ss + (r.buildings[b.building_name]?.profit || 0), 0), 0)
  const overheadPerYear = overheadExpenses.reduce((s, x) => s + (x.annual_amount || 0), 0)
  const overheadPerPeriod = overheadPerYear / n
  const totalOverhead = overheadPerYear * years.length

  const maintenanceByPeriod = periods.map((p) =>
    includedBuildings.reduce((s, b) => s + (p.buildings[b.building_name]?.maintenance_opex || 0), 0)
  )
  const totalMaintenanceAll = combined.reduce((s, r) =>
    s + includedBuildings.reduce((ss, b) => ss + (r.buildings[b.building_name]?.maintenance_opex || 0), 0), 0)

  const ft = { fontSize: 12, fontWeight: 700 }
  const cell = { verticalAlign: 'top', paddingTop: 6, paddingBottom: 6 }
  const monthly = viewMode === 'monthly'

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="tact-table" style={{ width: '100%', tableLayout: 'fixed', minWidth: monthly ? 1400 : viewMode === 'quarterly' ? 860 : 'auto' }}>
        <colgroup>
          <col style={{ width: monthly ? 130 : 160 }} />
          {periods.map((p) => <col key={p.period} style={{ width: monthly ? 66 : viewMode === 'quarterly' ? 88 : 'auto' }} />)}
          <col style={{ width: 110 }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{ textAlign: 'right' }}>בניין</th>
            {periods.map((p) => <th key={p.period} style={{ textAlign: 'center', fontSize: monthly ? 10 : 12, whiteSpace: 'nowrap' }}>{p.period}</th>)}
            <th style={{ textAlign: 'left', background: 'rgba(130,202,157,.12)' }}>רווח נקי</th>
          </tr>
        </thead>
        <tbody>
          {sortedBuildings.map((b) => {
            const profit = buildingTotalProfit(b.building_name)
            return (
              <tr key={b.id}>
                <td style={{ fontWeight: 500, textAlign: 'right', fontSize: 12 }}>{b.building_name}</td>
                {periods.map((p) => {
                  const bd  = p.buildings[b.building_name]
                  const inc = bd?.annual_income || 0
                  const exp = (bd?.capex || 0) + (bd?.annual_opex || 0) + (bd?.maintenance_opex || 0)
                  return (
                    <td key={p.period} style={{ ...cell, textAlign: 'left' }}>
                      <div style={{ fontSize: 11, color: inc > 0 ? 'var(--tact-green)' : 'var(--tact-text-dim,#888)' }}>
                        {inc > 0 ? ils(inc) : '—'}
                      </div>
                      {exp > 0 && (
                        <div style={{ fontSize: 10, color: 'var(--tact-red,#e74c3c)', opacity: .85 }}>
                          {ils(-exp)}
                        </div>
                      )}
                    </td>
                  )
                })}
                <td style={{ textAlign: 'left', fontWeight: 700, fontSize: 12, background: 'rgba(130,202,157,.08)',
                  color: profit >= 0 ? 'var(--tact-green)' : 'var(--tact-red,#e74c3c)' }}>
                  {ils(profit)}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '2px solid rgba(255,255,255,.2)', background: 'rgba(108,142,191,.08)' }}>
            <td style={{ textAlign: 'right', ...ft }}>סה"כ בניינים</td>
            {periodTotals.map((r) => (
              <td key={r.period} style={{ ...cell, textAlign: 'left' }}>
                <div style={{ fontSize: 11, color: 'var(--tact-green)', fontWeight: 600 }}>{ils(r.inc)}</div>
                <div style={{ fontSize: 10, color: 'var(--tact-red,#e74c3c)', opacity: .85 }}>{ils(-r.exp)}</div>
              </td>
            ))}
            <td style={{ textAlign: 'left', background: 'rgba(130,202,157,.15)', ...ft,
              color: totalProfit >= 0 ? 'var(--tact-green)' : 'var(--tact-red,#e74c3c)' }}>
              {ils(totalProfit)}
            </td>
          </tr>

          {totalMaintenanceAll > 0 && (
            <tr style={{ background: 'rgba(162,155,254,.07)' }}>
              <td style={{ textAlign: 'right', ...ft }}>עלות תחזוקה</td>
              {maintenanceByPeriod.map((m, idx) => (
                <td key={idx} style={{ textAlign: 'left', fontSize: 11, color: 'var(--tact-red,#e74c3c)', fontWeight: 600 }}>
                  {ils(-m)}
                </td>
              ))}
              <td style={{ textAlign: 'left', ...ft, color: 'var(--tact-red,#e74c3c)', background: 'rgba(162,155,254,.15)' }}>
                {ils(-totalMaintenanceAll)}
              </td>
            </tr>
          )}

          {overheadExpenses.map((item) => {
            const itemPerPeriod = (item.annual_amount || 0) / n
            const itemTotal = (item.annual_amount || 0) * years.length
            if (itemTotal === 0) return null
            return (
              <tr key={item.id} style={{ background: 'rgba(253,121,168,.06)' }}>
                <td style={{ textAlign: 'right', ...ft }}>{item.name || 'תקורה'}</td>
                {periods.map((p) => (
                  <td key={p.period} style={{ textAlign: 'left', fontSize: 11, color: 'var(--tact-red,#e74c3c)', fontWeight: 600 }}>
                    {ils(-itemPerPeriod)}
                  </td>
                ))}
                <td style={{ textAlign: 'left', ...ft, color: 'var(--tact-red,#e74c3c)', background: 'rgba(253,121,168,.1)' }}>
                  {ils(-itemTotal)}
                </td>
              </tr>
            )
          })}

          <tr style={{ background: 'rgba(130,202,157,.10)' }}>
            <td style={{ textAlign: 'right', ...ft }}>רווח נקי</td>
            {periods.map((p) => <td key={p.period} />)}
            <td style={{ textAlign: 'left', background: 'rgba(130,202,157,.2)', fontWeight: 800, fontSize: 13,
              color: (totalProfit - totalOverhead) >= 0 ? 'var(--tact-green)' : 'var(--tact-red,#e74c3c)' }}>
              {ils(totalProfit - totalOverhead)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ─── קומפוננט ראשי ───────────────────────────────────────────────────────────

export default function BuildingCashflow({ loading: appLoading, horizonMode = 'contract', onHorizonChange, excludedIds = new Set(), onExcludedChange, agreementVersion = 0 }) {
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
    cost_maintenance_per_charger: 500,
  })
  const [overheadExpenses, setOverheadExpenses] = useState(() => {
    try { return JSON.parse(localStorage.getItem('energy-overhead') || '[]') } catch { return [] }
  })
  const [showInclusion, setShowInclusion] = useState(false)
  const [viewMode, setViewMode] = useState(
    () => { const v = localStorage.getItem('energy-bcf-view-mode'); return ['annual','quarterly','monthly'].includes(v) ? v : 'annual' }
  )

  const growthTimer = useRef(null)
  const kwhTimer = useRef(null)
  const capexTimers = useRef({})
  const ratesTimers = useRef({})

  function saveOverhead(expenses) {
    setOverheadExpenses(expenses)
    localStorage.setItem('energy-overhead', JSON.stringify(expenses))
  }

  function toggleExclude(id) {
    const next = new Set(excludedIds)
    if (next.has(id)) next.delete(id); else next.add(id)
    onExcludedChange?.(next)
  }

  function setAllIncluded(includeAll) {
    const next = includeAll ? new Set() : new Set(buildings.map((b) => b.id))
    onExcludedChange?.(next)
  }

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
    const fy = horizonMode === '5yr' ? 5 : horizonMode === '10yr' ? 10 : undefined
    setLoading(true)
    try {
      const [bms, comb] = await Promise.all([
        api.listBuildingModels(),
        api.getCombinedForecast(fy),
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
          avg_kwh_per_charger_monthly:    b0.avg_kwh_per_charger_monthly    ?? 100,
          cost_rcd_per_charger:           b0.cost_rcd_per_charger           ?? 300,
          cost_internet_per_charger:      b0.cost_internet_per_charger      ?? 400,
          cost_inspector_per_charger:     b0.cost_inspector_per_charger     ?? 250,
          cost_maintenance_per_charger:   b0.cost_maintenance_per_charger   ?? 500,
        })
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [horizonMode, agreementVersion])

  useEffect(() => {
    if (selectedId == null) { setForecast(null); return }
    const fy = horizonMode === '5yr' ? 5 : horizonMode === '10yr' ? 10 : undefined
    api.getBuildingForecast(selectedId, fy).then(setForecast).catch(() => setForecast(null))
  }, [selectedId, horizonMode])

  async function handleRefresh() {
    const fy = horizonMode === '5yr' ? 5 : horizonMode === '10yr' ? 10 : undefined
    const [bms, comb] = await Promise.all([
      api.listBuildingModels(),
      api.getCombinedForecast(fy),
    ])
    setBuildings(bms)
    setCombined(comb)
    if (selectedId != null) {
      const fc = await api.getBuildingForecast(selectedId, fy)
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

  // סיכומים — רק מהבניינים הכלולים בתזרים (לפי excludedIds)
  const includedForKpi = buildings.filter((b) => !excludedIds.has(b.id))
  const sumIncl = (field) =>
    combined.reduce((s, r) =>
      s + includedForKpi.reduce((bs, b) => bs + (r.buildings[b.building_name]?.[field] || 0), 0), 0)
  const totalIncome5yr       = sumIncl('annual_income')
  const totalCapex5yr        = sumIncl('capex')
  const totalOpex5yr         = sumIncl('annual_opex')
  const totalMaintenanceOpex = sumIncl('maintenance_opex')
  const totalProfit5yr       = totalIncome5yr - totalCapex5yr - totalOpex5yr - totalMaintenanceOpex

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
        <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* toggle אופק תחזית */}
          <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,.06)', borderRadius: 7, padding: 3 }}>
            {[['5yr','5 שנים'],['contract','לפי הסכם'],['10yr','10 שנים']].map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => onHorizonChange(mode)}
                style={{
                  padding: '4px 12px', fontSize: 12, fontWeight: 600, borderRadius: 5,
                  border: 'none', cursor: 'pointer',
                  background: horizonMode === mode ? 'var(--tact-accent,#6c8ebf)' : 'transparent',
                  color: horizonMode === mode ? '#fff' : 'var(--tact-text-dim,#888)',
                  transition: 'all .15s',
                }}
              >{label}</button>
            ))}
          </div>
          <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,.12)' }} />
          {/* toggle תקופת תצוגה */}
          {[['annual','שנתי'],['quarterly','רבעוני'],['monthly','חודשי']].map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => { setViewMode(mode); localStorage.setItem('energy-bcf-view-mode', mode) }}
              style={{
                padding: '5px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6,
                border: '1.5px solid', cursor: 'pointer',
                borderColor: viewMode === mode ? 'var(--tact-accent,#6c8ebf)' : 'rgba(255,255,255,.18)',
                background: viewMode === mode ? 'rgba(108,142,191,.2)' : 'transparent',
                color: viewMode === mode ? 'var(--tact-accent,#6c8ebf)' : 'var(--tact-text-dim,#888)',
                transition: 'all .15s',
              }}
            >{label}</button>
          ))}
        </div>
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

            {/* ארבע עמודות */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1fr 1.1fr' }}>

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
              <div style={{ padding: '16px 20px', background: 'rgba(130,202,157,.04)', ...colDivider }}>
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

              {/* עמודה 4 — הוצאות תקורה נוספות */}
              <div style={{ padding: '16px 20px', background: 'rgba(253,121,168,.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ ...sLabel, marginBottom: 0 }}>הוצאות תקורה נוספות</span>
                  <button
                    className="tact-btn tact-btn-secondary"
                    style={{ fontSize: 11, padding: '2px 8px' }}
                    onClick={() => saveOverhead([...overheadExpenses, { id: Date.now(), name: '', annual_amount: 0 }])}
                  >+ הוסף</button>
                </div>

                {/* בלוק עלות תחזוקה שנתית */}
                <div style={{
                  padding: '8px 10px', marginBottom: 12,
                  background: 'rgba(162,155,254,.1)',
                  border: '1px solid rgba(162,155,254,.25)',
                  borderRadius: 7,
                }}>
                  <label style={fRow}>
                    <span style={{ ...fDim }}>תחזוקה שנתית:</span>
                    {numInp(globalRates.cost_maintenance_per_charger ?? 500, 50, 72, (e) => applyGlobalRateField('cost_maintenance_per_charger', e.target.value))}
                    {unit('₪/מטען')}
                  </label>
                </div>

                {overheadExpenses.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--tact-text-dim,#aaa)' }}>אין הוצאות תקורה</div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {overheadExpenses.map((item) => (
                    <div key={item.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        className="tact-input"
                        style={{ flex: 1, minWidth: 0, fontSize: 12, padding: '3px 6px' }}
                        placeholder="שם ההוצאה"
                        value={item.name}
                        onChange={(e) => saveOverhead(overheadExpenses.map((x) => x.id === item.id ? { ...x, name: e.target.value } : x))}
                      />
                      <input
                        type="number"
                        className="tact-input"
                        style={{ width: 80, fontSize: 12, padding: '3px 6px', textAlign: 'center' }}
                        min={0}
                        step={100}
                        value={item.annual_amount}
                        onChange={(e) => saveOverhead(overheadExpenses.map((x) => x.id === item.id ? { ...x, annual_amount: parseFloat(e.target.value) || 0 } : x))}
                      />
                      <span style={{ fontSize: 11, color: 'var(--tact-text-dim,#888)', whiteSpace: 'nowrap' }}>₪/שנה</span>
                      <button
                        onClick={() => saveOverhead(overheadExpenses.filter((x) => x.id !== item.id))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tact-red,#e74c3c)', fontSize: 16, lineHeight: 1, padding: '0 2px' }}
                      >×</button>
                    </div>
                  ))}
                </div>
                {overheadExpenses.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--tact-text-dim,#aaa)' }}>
                    סה"כ: <strong style={{ color: 'var(--tact-red,#e74c3c)' }}>
                      {ils(-overheadExpenses.reduce((s, x) => s + (x.annual_amount || 0), 0))}/שנה
                    </strong>
                  </div>
                )}
              </div>

            </div>
          </div>
        )
      })()}

      {/* ─── כלולים בתזרים (בחירת פרויקטים) — מעל הרשימה והטבלה ─── */}
      {!loading && !appLoading && buildings.length > 0 && (
        <div className="inclusion-panel" style={{ marginBottom: 20 }}>
          <button
            className="tact-btn tact-btn-secondary"
            style={{ fontSize: 13 }}
            onClick={() => setShowInclusion((v) => !v)}
          >
            <span style={{ marginInlineEnd: 6 }}>{showInclusion ? '▾' : '▸'}</span>
            כלולים בתזרים ({includedForKpi.length}/{buildings.length})
          </button>

          {showInclusion && (
            <div style={{ marginTop: 12, maxWidth: 540 }}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <button className="tact-btn" style={{ fontSize: 12 }}
                  onClick={() => setAllIncluded(true)}>בחר הכל</button>
                <button className="tact-btn tact-btn-secondary" style={{ fontSize: 12 }}
                  onClick={() => setAllIncluded(false)}>נקה הכל</button>
              </div>
              <table className="tact-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'right' }}>פרויקט</th>
                    <th style={{ textAlign: 'center', width: 140 }}>כלול בתזרים</th>
                  </tr>
                </thead>
                <tbody>
                  {buildings.map((b) => {
                    const included = !excludedIds.has(b.id)
                    return (
                      <tr key={b.id}>
                        <td style={{ textAlign: 'right', fontSize: 13 }}>{b.building_name}</td>
                        <td style={{ textAlign: 'center' }}>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={included}
                              onChange={() => toggleExclude(b.id)}
                              style={{ width: 16, height: 16, cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: 12, fontWeight: 600,
                              color: included ? 'var(--tact-green)' : 'var(--tact-text-dim,#888)' }}>
                              {included ? 'כלול' : 'לא כלול'}
                            </span>
                          </label>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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
                excluded={excludedIds.has(bm.id)}
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
                {buildings.length === 0 ? (
                  <div className="empty-state">
                    <p>אין בניינים עדיין. לחץ "הוסף בניין" כדי להתחיל.</p>
                  </div>
                ) : (
                  <CombinedTable
                    combined={combined}
                    buildings={buildings}
                    overheadExpenses={overheadExpenses}
                    excludedIds={excludedIds}
                    viewMode={viewMode}
                  />
                )}
              </div>
            )}

            {/* תצוגת בניין בודד */}
            {selected && (
              <div className="building-detail">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                    {selected.building_name}
                    {selected.notes?.includes('חסר הסכם') && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px',
                        borderRadius: 5, background: 'rgba(226,72,61,.15)',
                        color: '#e2483d', border: '1px solid rgba(226,72,61,.3)',
                      }}>
                        חסר הסכם
                      </span>
                    )}
                  </h3>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--tact-text-dim,#aaa)' }}>
                    <input
                      type="checkbox"
                      checked={!excludedIds.has(selected.id)}
                      onChange={() => toggleExclude(selected.id)}
                      style={{ cursor: 'pointer', width: 15, height: 15 }}
                    />
                    כלול בתזרים כל הבניינים
                  </label>
                </div>

                <div className="building-layout">
                  <div className="building-settings-panel">
                    <BuildingSettings bm={selected} globals={globalRates} onChange={handleRefresh} />
                  </div>
                  <div className="building-chart-panel">
                    <h4 style={{ marginTop: 0 }}>פירוט שנתי</h4>
                    {forecast ? <ForecastTable years={forecast.years} viewMode={viewMode} /> : <div className="dim-text">טוען...</div>}
                  </div>
                </div>

                <div style={{ marginTop: 24, marginBottom: 20 }}>
                  <h4 style={{ marginTop: 0, marginBottom: 12 }}>תחזית גרפית</h4>
                  {forecast ? <ForecastChart years={forecast.years} viewMode={viewMode} /> : <div className="dim-text">טוען...</div>}
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
