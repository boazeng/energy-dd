import { useState } from 'react'
import { api } from '../api/client.js'

const INCOME_TYPES_EXCLUDE = ['חשמל', 'electricity', 'electric']

function isExcluded(label) {
  if (!label) return false
  const l = String(label).toLowerCase()
  return INCOME_TYPES_EXCLUDE.some((k) => l.includes(k))
}

function ExcelTable({ rows }) {
  if (!rows || rows.length === 0) return <p className="empty-state">אין נתונים בגיליון זה</p>
  const header = rows[0]
  const body = rows.slice(1)
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="tact-table" style={{ fontSize: 13 }}>
        <thead>
          <tr>
            {header.map((cell, i) => (
              <th key={i} style={{ background: isExcluded(cell) ? '#fff3cd' : undefined }}>
                {cell ?? ''}
                {isExcluded(cell) && <span style={{ fontSize: 10, color: '#856404', marginInlineStart: 4 }}>לא הכנסה</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} style={{ direction: 'rtl' }}>
                  {cell ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FileCard({ file }) {
  const [activeSheet, setActiveSheet] = useState(0)

  if (file.error) {
    return (
      <div className="card" style={{ borderColor: '#dc3545' }}>
        <h3 style={{ color: '#dc3545' }}>{file.name}</h3>
        <p style={{ color: '#dc3545' }}>שגיאה: {file.error}</p>
      </div>
    )
  }

  const sheet = file.sheets[activeSheet]

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{file.name}</h3>
        {file.web_url && (
          <a href={file.web_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#6c8ebf' }}>
            פתח ב-SharePoint
          </a>
        )}
      </div>

      {file.sheets.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {file.sheets.map((s, i) => (
            <button
              key={i}
              className={activeSheet === i ? 'active' : ''}
              style={{ fontSize: 12, padding: '3px 10px' }}
              onClick={() => setActiveSheet(i)}
            >
              {s.sheet}
            </button>
          ))}
        </div>
      )}

      {sheet && (
        <>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
            גיליון: <strong>{sheet.sheet}</strong> · {sheet.rows.length} שורות
            {sheet.rows.length > 0 && ` · ${sheet.rows[0].length} עמודות`}
          </div>
          <ExcelTable rows={sheet.rows} />
        </>
      )}
    </div>
  )
}

export default function RevenueCheck({ loading: parentLoading }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await api.getRevenueData()
      setData(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div dir="rtl">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>בדיקת הכנסות</h2>
        <button
          onClick={load}
          disabled={loading}
          style={{ padding: '6px 18px', fontSize: 14 }}
        >
          {loading ? 'טוען...' : 'טעינת קבצים מ-SharePoint'}
        </button>
      </div>

      {error && (
        <div className="app-error" style={{ marginBottom: 16 }}>
          שגיאה: {error}
        </div>
      )}

      {!data && !loading && (
        <div className="empty-state" style={{ padding: 40, textAlign: 'center', color: '#888' }}>
          לחץ על "טעינת קבצים מ-SharePoint" לטעינת האקסלים מתיקיית בדיקת הכנסות
        </div>
      )}

      {data && data.message && (
        <div className="empty-state" style={{ padding: 40, textAlign: 'center', color: '#888' }}>
          {data.message}
        </div>
      )}

      {data && data.files && data.files.length > 0 && (
        <>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
            נטענו <strong>{data.files.length}</strong> קבצים ·
            <span style={{ marginInlineStart: 6, color: '#856404' }}>
              עמודות מסומנות בצהוב = חשמל (לא הכנסה)
            </span>
          </div>
          {data.files.map((f, i) => (
            <FileCard key={i} file={f} />
          ))}
        </>
      )}
    </div>
  )
}
