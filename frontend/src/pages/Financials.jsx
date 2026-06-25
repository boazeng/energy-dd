import { useState } from 'react'
import TactIcon from '../components/TactIcon.jsx'
import { api } from '../api/client.js'

const nf = new Intl.NumberFormat('he-IL')

// תא כספי: ריק=—, שלילי=סוגריים+אדום, חיובי=ירוק (בשורות "signed")
function Cell({ v, signed, expense }) {
  if (v === null || v === undefined || v === '')
    return <span className="muted">—</span>
  const neg = v < 0
  const abs = nf.format(Math.abs(v))
  const disp = expense || neg ? `(₪${abs})` : `₪${abs}`
  const cls = signed ? (neg ? 'fin-neg' : 'fin-pos') : ''
  return <span className={cls}>{disp}</span>
}

function FinTable({ title, icon, rows, years }) {
  return (
    <div className="fin-block">
      <h3 className="fin-block-title">
        <TactIcon name={icon} size={17} /> {title}
      </h3>
      <div className="fin-table-wrap">
        <table className="fin-table">
          <thead>
            <tr>
              <th className="fin-rowlabel">סעיף</th>
              {years.map((y) => (
                <th key={y.key}>
                  {y.label}
                  <span className="fin-basis">{y.basis}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={r.total ? 'fin-total' : ''}>
                <td className="fin-rowlabel">
                  {r.flag && <span className="fin-flag-dot" title="לתשומת לב" />}
                  {r.label}
                </td>
                {years.map((y) => (
                  <td key={y.key}>
                    <Cell v={r.values[y.key]} signed={r.signed} expense={r.expense} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const SEV = {
  high: { cls: 'fin-sev-high', label: 'גבוה' },
  med: { cls: 'fin-sev-med', label: 'בינוני' },
  low: { cls: 'fin-sev-low', label: 'נמוך' },
}

function SupplierCredits({ rows, onChange }) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)

  const total = rows.reduce((s, r) => s + r.balance, 0)

  async function handleAdd(e) {
    e.preventDefault()
    if (!name.trim() || !amount) return
    setSaving(true)
    try {
      await api.createSupplierBalance({ supplier_name: name.trim(), balance: parseFloat(amount) })
      setName('')
      setAmount('')
      onChange()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    await api.deleteSupplierBalance(id)
    onChange()
  }

  return (
    <div className="sup-section">
      <h2 className="block-title">
        <TactIcon name="document" size={18} style={{ marginInlineEnd: 6 }} />
        ספקים ביתרת זכות — 2026
      </h2>
      <p className="home-sub" style={{ marginBottom: 20 }}>
        ספקים שהחברה חייבת להם כסף לפי מאזן הבוחן. יש לוודא ולהתחשב בסכומים אלו בבדיקת הנאותות.
      </p>

      {/* טופס הוספה */}
      <form className="add-form" onSubmit={handleAdd}>
        <input
          placeholder="שם ספק"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ flex: 2 }}
        />
        <input
          type="number"
          placeholder="יתרה (₪)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min="0.01"
          step="0.01"
          style={{ flex: 1, minWidth: 130, textAlign: 'left' }}
        />
        <button className="tact-btn tact-btn-primary" type="submit" disabled={saving}>
          + הוסף ספק
        </button>
      </form>

      {rows.length === 0 ? (
        <div className="ta-empty">
          <TactIcon name="document" size={24} />
          <p>לא הוזנו ספקים עדיין. הוסף ספק מהטופס למעלה.</p>
        </div>
      ) : (
        <div className="fin-table-wrap">
          <table className="fin-table sup-table">
            <thead>
              <tr>
                <th className="fin-rowlabel">שם ספק</th>
                <th>יתרת זכות</th>
                <th style={{ width: 50 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="fin-rowlabel">{r.supplier_name}</td>
                  <td className="fin-neg">₪{nf.format(r.balance)}</td>
                  <td>
                    <button
                      className="cf-del"
                      title="מחק"
                      onClick={() => handleDelete(r.id)}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="fin-total sup-total-row">
                <td className="fin-rowlabel">סה״כ חובות לספקים</td>
                <td className="fin-neg">₪{nf.format(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

function CompletionCell({ row, onChange }) {
  const [val, setVal] = useState(row.completion || '')
  const [busy, setBusy] = useState(false)
  const [taskDone, setTaskDone] = useState(false)

  async function save(v) {
    if (v === (row.completion || '')) return
    setBusy(true)
    try {
      await api.updateSupplierLedgerRow(row.id, { completion: v })
      onChange()
    } finally {
      setBusy(false)
    }
  }

  async function createTask() {
    const text = val.trim()
    if (!text) return
    setBusy(true)
    try {
      await api.createTask({
        category: 'supplier_ledger',
        title: `${row.supplier_name}: ${text}`,
      })
      setTaskDone(true)
      setTimeout(() => setTaskDone(false), 2500)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
      <textarea
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={(e) => save(e.target.value)}
        placeholder="הזן שאלה / השלמה…"
        rows={2}
        style={{ flex: 1, fontSize: '0.82em', resize: 'vertical', minWidth: 140 }}
        disabled={busy}
      />
      <button
        className="tact-btn"
        title="שכפל כמטלה ברשימת המטלות"
        onClick={createTask}
        disabled={busy || !val.trim()}
        style={{ fontSize: '0.78em', whiteSpace: 'nowrap', padding: '3px 7px' }}
      >
        {taskDone ? '✓' : '→ מטלה'}
      </button>
    </div>
  )
}

function SupplierLedgerTable({ rows, onChange }) {
  const [name, setName] = useState('')
  const [acc, setAcc] = useState('')
  const [debit, setDebit] = useState('')
  const [credit, setCredit] = useState('')
  const [saving, setSaving] = useState(false)

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0)
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0)
  const totalBalance = rows.reduce((s, r) => s + r.balance, 0)

  async function handleAdd(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      const d = parseFloat(debit) || 0
      const c = parseFloat(credit) || 0
      await api.createSupplierLedgerRow({
        supplier_name: name.trim(),
        account_number: acc.trim(),
        debit: d,
        credit: c,
        balance: c - d,
      })
      setName(''); setAcc(''); setDebit(''); setCredit('')
      onChange()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    await api.deleteSupplierLedgerRow(id)
    onChange()
  }

  return (
    <div className="sup-section">
      <h2 className="block-title">
        <TactIcon name="reports" size={18} style={{ marginInlineEnd: 6 }} />
        כרטסת ספקים — 1-5/2026
      </h2>
      <p className="home-sub" style={{ marginBottom: 20 }}>
        סיכום תנועות חובה וזכות לכל ספק. עמודת "השלמות" — רשום שאלה ולחץ "→ מטלה" כדי להוסיף לרשימת המטלות.
      </p>

      <form className="add-form" onSubmit={handleAdd}>
        <input placeholder="שם ספק" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 2 }} />
        <input placeholder="חשבון" value={acc} onChange={(e) => setAcc(e.target.value)} style={{ flex: 0.6, minWidth: 70 }} />
        <input type="number" placeholder="חובה ₪" value={debit} onChange={(e) => setDebit(e.target.value)} min="0" step="0.01" style={{ flex: 1, minWidth: 110, textAlign: 'left' }} />
        <input type="number" placeholder="זכות ₪" value={credit} onChange={(e) => setCredit(e.target.value)} min="0" step="0.01" style={{ flex: 1, minWidth: 110, textAlign: 'left' }} />
        <button className="tact-btn tact-btn-primary" type="submit" disabled={saving}>+ הוסף</button>
      </form>

      {rows.length === 0 ? (
        <div className="ta-empty">
          <TactIcon name="reports" size={24} />
          <p>אין נתוני כרטסת. הוסף ספק מהטופס למעלה.</p>
        </div>
      ) : (
        <div className="fin-table-wrap">
          <table className="fin-table sup-table">
            <thead>
              <tr>
                <th className="fin-rowlabel">שם ספק</th>
                <th style={{ width: 70 }}>חשבון</th>
                <th>סה&quot;כ חובה</th>
                <th>סה&quot;כ זכות</th>
                <th>יתרה</th>
                <th style={{ minWidth: 200 }}>השלמות מול החברה</th>
                <th style={{ width: 50 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="fin-rowlabel">{r.supplier_name}</td>
                  <td className="muted" style={{ fontSize: '0.85em' }}>{r.account_number}</td>
                  <td>{r.debit > 0 ? `₪${nf.format(r.debit)}` : <span className="muted">—</span>}</td>
                  <td>{r.credit > 0 ? `₪${nf.format(r.credit)}` : <span className="muted">—</span>}</td>
                  <td className={r.balance < 0 ? 'fin-neg' : r.balance > 0 ? 'fin-pos' : ''}>
                    {r.balance < 0
                      ? `(₪${nf.format(Math.abs(r.balance))})`
                      : r.balance > 0
                        ? `₪${nf.format(r.balance)}`
                        : '—'}
                  </td>
                  <td><CompletionCell row={r} onChange={onChange} /></td>
                  <td>
                    <button className="cf-del" title="מחק" onClick={() => handleDelete(r.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="fin-total sup-total-row">
                <td className="fin-rowlabel" colSpan={2}>סה&quot;כ</td>
                <td>₪{nf.format(totalDebit)}</td>
                <td>₪{nf.format(totalCredit)}</td>
                <td className={totalBalance < 0 ? 'fin-neg' : totalBalance > 0 ? 'fin-pos' : ''}>
                  {totalBalance < 0
                    ? `(₪${nf.format(Math.abs(totalBalance))})`
                    : totalBalance > 0
                      ? `₪${nf.format(totalBalance)}`
                      : '—'}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

export default function Financials({ data, loading, supplierBalances = [], supplierLedger = [], onSupplierChange }) {
  if (loading) return <p className="muted">טוען…</p>

  const years = data?.years || []
  const pnl = data?.pnl || []
  const balance = data?.balance || []
  const flags = data?.flags || []
  const highlights = data?.highlights || []
  const c = data?.company || {}

  if (years.length === 0)
    return (
      <section>
        <div className="ta-empty">
          <TactIcon name="reports" size={28} />
          <p>אין עדיין נתונים כספיים. יש להעלות את קובץ הניתוח לשרת.</p>
        </div>
        <SupplierCredits rows={supplierBalances} onChange={onSupplierChange} />
        <SupplierLedgerTable rows={supplierLedger} onChange={onSupplierChange} />
      </section>
    )

  // KPI: רווח נקי + סה"כ הכנסות לכל שנה
  const netRow = pnl.find((r) => r.signed)
  const incomeRow = pnl.find((r) => r.total && !r.signed)

  return (
    <section>
      <div className="ta-head">
        <h1 className="home-title">ניתוח כספי</h1>
        <span className="tact-badge tact-badge-on">{years.length} שנים</span>
      </div>
      <p className="home-sub">
        {c.name} (ח.פ. {c.reg}) · {c.business}. ניתוח לפי שנים מתוך הדוחות המבוקרים
        ומאזני הבוחן.
      </p>

      {/* KPI — רווח נקי לפי שנה */}
      <div className="kpi-grid">
        {years.map((y) => {
          const net = netRow?.values[y.key]
          const inc = incomeRow?.values[y.key]
          return (
            <div className="tact-kpi" key={y.key}>
              <div className="tact-kpi-label">
                רווח נקי · {y.label}
              </div>
              <div className={`tact-kpi-val ${net < 0 ? 'fin-neg' : 'fin-pos'}`}>
                {net === null || net === undefined
                  ? '—'
                  : `${net < 0 ? '−' : ''}₪${nf.format(Math.abs(net))}`}
              </div>
              <div className="tact-delta">הכנסות ₪{nf.format(inc)}</div>
            </div>
          )
        })}
      </div>

      {/* תובנות */}
      {highlights.length > 0 && (
        <div className="fin-highlights">
          {highlights.map((h, i) => (
            <div className="fin-highlight" key={i}>
              <TactIcon name="trending" size={16} />
              <div>
                <strong>{h.title}</strong>
                <p>{h.text}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <FinTable title="רווח והפסד" icon="reports" rows={pnl} years={years} />
      <FinTable title="מאזן" icon="database" rows={balance} years={years} />

      {/* דגלים אדומים */}
      <h2 className="block-title">ממצאי בדיקת נאותות</h2>
      <div className="fin-flags">
        {flags.map((f, i) => {
          const s = SEV[f.severity] || SEV.low
          return (
            <div className={`fin-flag-card ${s.cls}`} key={i}>
              <div className="fin-flag-head">
                <strong>{f.title}</strong>
                <span className="fin-sev-badge">{s.label}</span>
              </div>
              <p>{f.text}</p>
            </div>
          )
        })}
      </div>

      {data?.source_files?.length > 0 && (
        <p className="ta-source muted">
          מקורות: {data.source_files.join(' · ')}
          {c.auditor ? ` · רו"ח מבקר: ${c.auditor}` : ''}
        </p>
      )}

      <SupplierCredits rows={supplierBalances} onChange={onSupplierChange} />
      <SupplierLedgerTable rows={supplierLedger} onChange={onSupplierChange} />
    </section>
  )
}
