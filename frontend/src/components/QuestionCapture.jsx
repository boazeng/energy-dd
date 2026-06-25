import { useCallback, useEffect, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import { api } from '../api/client.js'

const PAGE_LABELS = {
  home: 'בית',
  projects: 'סטטוס פרויקטים',
  financials: 'ניתוח כספי',
  cashflow: 'תזרים',
  'building-cashflow': 'תזרים בניינים',
  tasks: 'רשימת מטלות',
  agreements: 'הסכמי דיירים',
}

export default function QuestionCapture({ currentPage, onAdded }) {
  const [mode, setMode] = useState('idle') // idle | selecting | capturing | modal
  const [sel, setSel] = useState(null)     // { x, y, w, h } viewport coords
  const [screenshot, setScreenshot] = useState('')
  const [question, setQuestion] = useState('')
  const [saving, setSaving] = useState(false)
  const startRef = useRef(null)

  // ESC to cancel
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        setMode('idle')
        setSel(null)
        setScreenshot('')
        setQuestion('')
        startRef.current = null
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onMouseDown = useCallback((e) => {
    e.preventDefault()
    startRef.current = { x: e.clientX, y: e.clientY }
    setSel({ x: e.clientX, y: e.clientY, w: 0, h: 0 })
  }, [])

  const onMouseMove = useCallback((e) => {
    if (!startRef.current) return
    const sx = startRef.current.x
    const sy = startRef.current.y
    setSel({
      x: Math.min(e.clientX, sx),
      y: Math.min(e.clientY, sy),
      w: Math.abs(e.clientX - sx),
      h: Math.abs(e.clientY - sy),
    })
  }, [])

  const onMouseUp = useCallback(async (e) => {
    if (!startRef.current) return
    const rect = {
      x: Math.min(e.clientX, startRef.current.x),
      y: Math.min(e.clientY, startRef.current.y),
      w: Math.abs(e.clientX - startRef.current.x),
      h: Math.abs(e.clientY - startRef.current.y),
    }
    startRef.current = null
    setSel(null)

    if (rect.w < 10 || rect.h < 10) {
      // בחירה קטנה מדי — פתח מודאל בלי צילום
      setScreenshot('')
      setMode('modal')
      return
    }

    setMode('capturing')
    // המתן פריים אחד כדי שה-overlay ייעלם מהלכידה
    setTimeout(async () => {
      try {
        const canvas = await html2canvas(document.documentElement, {
          x: rect.x + window.scrollX,
          y: rect.y + window.scrollY,
          width: rect.w,
          height: rect.h,
          windowWidth: document.documentElement.scrollWidth,
          windowHeight: document.documentElement.scrollHeight,
          useCORS: true,
          logging: false,
        })
        setScreenshot(canvas.toDataURL('image/png'))
      } catch {
        setScreenshot('')
      }
      setMode('modal')
    }, 80)
  }, [])

  async function save() {
    if (!question.trim()) return
    setSaving(true)
    try {
      await api.createQuestion({
        page: currentPage,
        question_text: question.trim(),
        screenshot_data: screenshot,
      })
      onAdded()
      setMode('idle')
      setScreenshot('')
      setQuestion('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {/* כפתור צף — נראה בכל עמוד */}
      {mode === 'idle' && (
        <button
          className="q-float-btn"
          title="הוסף שאלה לבירור"
          onClick={() => setMode('selecting')}
        >
          <span className="q-float-icon">?</span>
          <span className="q-float-label">שאלה</span>
        </button>
      )}

      {/* Overlay בחירת אזור */}
      {mode === 'selecting' && (
        <div
          className="q-overlay"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
        >
          {(!sel || sel.w === 0) && (
            <div className="q-overlay-hint">
              גרור לבחירת אזור הצילום · ESC לביטול
            </div>
          )}
          {sel && sel.w > 0 && (
            <div
              className="q-sel-rect"
              style={{
                left: sel.x,
                top: sel.y,
                width: sel.w,
                height: sel.h,
              }}
            />
          )}
        </div>
      )}

      {/* מצב לכידה */}
      {mode === 'capturing' && (
        <div className="q-overlay q-overlay-capturing">
          <div className="q-overlay-hint">לוכד…</div>
        </div>
      )}

      {/* מודאל הזנת שאלה */}
      {mode === 'modal' && (
        <div className="q-modal-backdrop" onClick={() => setMode('idle')}>
          <div
            className="q-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="q-modal-head">
              <strong>שאלה לבירור</strong>
              <span className="q-modal-page">{PAGE_LABELS[currentPage] ?? currentPage}</span>
              <button className="q-modal-close" onClick={() => setMode('idle')}>✕</button>
            </div>

            {screenshot && (
              <div className="q-screenshot-wrap">
                <img src={screenshot} alt="צילום מסך" className="q-screenshot" />
              </div>
            )}

            <textarea
              autoFocus
              className="q-textarea"
              placeholder="מה השאלה לבירור?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save()
              }}
              rows={4}
            />

            <div className="q-modal-footer">
              <span className="q-hint-key">Ctrl+Enter לשמירה</span>
              <button
                className="tact-btn"
                onClick={() => setMode('idle')}
              >
                ביטול
              </button>
              <button
                className="tact-btn tact-btn-primary"
                onClick={save}
                disabled={!question.trim() || saving}
              >
                {saving ? 'שומר…' : 'שמור שאלה'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
