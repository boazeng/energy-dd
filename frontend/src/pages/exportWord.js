/* ═══ ייצוא התכנית העסקית לוורד ═══════════════════════════════════════════════
   הקובץ נבנה מה-DOM של המסמך המוצג ולא מהנתונים, ולכן הוא תמיד זהה למה שרואים
   בלשונית ולמה שיוצא ב"ייצוא PDF" — אין כאן מסלול רינדור שני שעלול להיפרד.

   הפורמט הוא HTML עטוף בכותרות Word (‎.doc). זה הפורמט היחיד שאפשר לייצר בדפדפן
   בלי ספרייה נוספת, והוא נפתח בוורד כמסמך ערוך לכל דבר. מנוע ה-CSS של וורד עצר
   בסביבות 1999, ולכן נדרשות חמש התאמות כדי שהעיצוב ישרוד את המעבר:
     1. משתני CSS — וורד אינו תומך ב-var(), ולכן הם מוחלפים בערכים המחושבים.
     2. rgb()/rgba() — אינם נתמכים; הצבעים מומרים ל-hex, ושקיפות ממוזגת על לבן.
     3. break-before/after — וורד מכיר רק את page-break-* הישן, ורק על תגיות
        שהוא מזהה; לכן תגיות HTML5 מומרות ל-div.
     4. grid/flex ו-:nth-child — אינם נתמכים; המכלים מומרים לטבלאות
        וההצללה לסירוגין נצרבת כסגנון על השורות עצמן.
     5. תרשימים — recharts מייצר SVG שוורד אינו מרנדר; הם מומרים ל-PNG.
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── תרשימים: SVG → PNG ──────────────────────────────────────────────────────

// פי 2 מרזולוציית המסך — בהדפסה ב-A4 תרשים ברזולוציית מסך נראה מרוט
const CHART_SCALE = 2

async function svgToPng(svg) {
  const w = svg.width?.baseVal?.value || svg.clientWidth
  const h = svg.height?.baseVal?.value || svg.clientHeight
  const clone = svg.cloneNode(true)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', w)
  clone.setAttribute('height', h)
  // ה-SVG המסודר יוצא מהקשר הדף, ולכן הפונט חייב להיכתב עליו במפורש —
  // אחרת הטקסט בתרשים ייפול לברירת המחדל של המנוע (serif)
  clone.style.fontFamily = getComputedStyle(svg).fontFamily
  clone.style.direction = 'ltr'

  const xml = new XMLSerializer().serializeToString(clone)
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`
  const img = new Image()
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = () => reject(new Error('טעינת התרשים נכשלה'))
    img.src = url
  })

  const canvas = document.createElement('canvas')
  canvas.width = w * CHART_SCALE
  canvas.height = h * CHART_SCALE
  const ctx = canvas.getContext('2d')
  // רקע לבן מפורש: PNG שקוף מתקבל בוורד כרקע אפור
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return { data: canvas.toDataURL('image/png'), w, h }
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

// var(--x) / var(--x, fallback) → הערך המחושב בפועל על שורש המסמך
function resolveVars(css) {
  const root = getComputedStyle(document.documentElement)
  let out = css
  for (let i = 0; i < 5 && out.includes('var('); i += 1) {
    out = out.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*?))?\s*\)/g, (_, name, fallback) => {
      const v = root.getPropertyValue(name).trim()
      return v || (fallback ?? '').trim() || 'inherit'
    })
  }
  return out
}

// rgb()/rgba() → hex. וורד מתעלם מהצורה הפונקציונלית, ואיתה מרקע הכותרות של
// הטבלאות ומשורות הסיכום. שקיפות ממוזגת על לבן — רקע המסמך בכל מקרה לבן.
function colorsToHex(css) {
  return css.replace(/\brgba?\(([^()]+)\)/g, (whole, args) => {
    const parts = args.split(/[,/]/).map((s) => s.trim()).filter(Boolean)
    if (parts.length < 3) return whole
    const chan = (v) => (v.endsWith('%') ? parseFloat(v) * 2.55 : parseFloat(v))
    const rgb = parts.slice(0, 3).map(chan)
    if (rgb.some(Number.isNaN)) return whole
    const alpha = parts.length > 3 ? parseFloat(parts[3]) : 1
    const a = Number.isNaN(alpha) ? 1 : alpha
    const hex = (c) => Math.max(0, Math.min(255, Math.round(255 - (255 - c) * a)))
      .toString(16).padStart(2, '0')
    return `#${rgb.map(hex).join('')}`
  })
}

// אוספים מגיליונות הסגנון של האתר רק את הכללים של המסמך. כך העיצוב בוורד ממשיך
// להיגזר מ-business-plan.css ולא מעותק שיסטה ממנו עם הזמן.
function collectCss() {
  const relevant = (sel) => sel.includes('bp-') || sel.includes('recharts')
  const screen = []
  const print = []

  for (const sheet of document.styleSheets) {
    let rules
    try {
      rules = sheet.cssRules
    } catch {
      continue // גיליון ממקור אחר — אין גישה, ואין בו סגנונות של המסמך
    }
    for (const rule of rules) {
      if (rule.type === CSSRule.STYLE_RULE) {
        if (relevant(rule.selectorText)) screen.push(rule.cssText)
      } else if (rule.type === CSSRule.MEDIA_RULE && rule.conditionText?.includes('print')) {
        // כללי ההדפסה הם העיצוב הנכון למסמך מודפס — נכנסים אחרונים כדי לגבור
        for (const inner of rule.cssRules) {
          if (inner.type === CSSRule.STYLE_RULE && relevant(inner.selectorText)) {
            print.push(inner.cssText)
          }
        }
      }
    }
  }
  return colorsToHex(resolveVars([...screen, ...print].join('\n')))
}

// התאמות שקיימות רק בייצוא: מה שוורד אינו יודע לקרוא מ-business-plan.css
const WORD_CSS = `
@page WordSection1 { size: 210mm 297mm; margin: 18mm 20mm; mso-page-orientation: portrait; }
div.WordSection1 { page: WordSection1; }
/* וורד עוטף כל טקסט חופשי בפסקת MsoNormal, ולסגנון Normal שלו יש רווח־אחרי של
   8pt. בלי איפוסו כל תא טבלה וכל שורת תוכן־עניינים מקבלים ריווח כפול. */
p.MsoNormal, li.MsoNormal, div.MsoNormal { margin: 0; }
body {
  direction: rtl;
  font-family: 'Segoe UI', Arial, sans-serif;
  font-size: 10.5pt;
  line-height: 1.6;
  color: #2A2A28;
}
.bp-doc { width: auto; border: 0; padding: 0; box-shadow: none; }
table { mso-table-lspace: 0; mso-table-rspace: 0; }
.bp-table { direction: rtl; }
/* וורד מתעלם מ-padding-inline / border-block הלוגיים */
.bp-ul { margin-right: 22px; padding-right: 0; }
.bp-toc-l2 { margin-right: 26px; padding-right: 0 !important; }
.bp-toc-num { display: inline-block; width: 34px; }
.bp-cover-facts {
  display: block; text-align: center;
  border-top: 1px solid #E7E2D6; border-bottom: 1px solid #E7E2D6;
}
/* טבלאות ההמרה של grid — מסגרת השלד עצמו שקופה */
.bp-grid-shim { width: 100%; border-collapse: separate; border-spacing: 0; }
.bp-grid-shim > tbody > tr > td { border: 0; padding: 0 5px 10px; vertical-align: top; }
.bp-chart-img { display: block; margin: 0 auto; }

/* וורד אינו מייצר עמוד חדש מ-page-break-* שמגיע מגיליון סגנונות — רק מסגנון
   שכתוב ישירות על האלמנט. השבירות עצמן מוזרקות ל-DOM (ראה pageBreak); כאן רק
   הכללים שמונעים שבירה, שאותם וורד כן מכבד מגיליון. */
.bp-h1, .bp-h2, .bp-caption { page-break-after: avoid; }
.bp-figure, .bp-kpi, .bp-grid-shim, .bp-table tr { page-break-inside: avoid; }
/* גובה השער נועד לדחוף את מה שאחריו לעמוד הבא; בוורד השבירה מפורשת */
.bp-cover { height: auto !important; min-height: 0 !important; padding-top: 60px; }
`

// ‎.bp-table tbody tr:nth-child(even) td — וורד אינו מכיר :nth-child, ולכן
// ההצללה לסירוגין נצרבת על השורות. הערך הוא ‎rgba(231,226,214,.22)‎ על לבן.
const ZEBRA_BG = '#FAF9F6'

// ─── המרות DOM ───────────────────────────────────────────────────────────────

// grid → טבלה. וורד מרנדר grid כרצף בלוקים, ובלי זה כל כרטיס מדד יופיע בשורה
// נפרדת ורצועת "מקורות ושימושים" תאבד את שני הטורים.
function gridToTable(el, cols) {
  const items = Array.from(el.children)
  if (!items.length) return
  const table = document.createElement('table')
  table.className = 'bp-grid-shim'
  const tbody = document.createElement('tbody')
  for (let i = 0; i < items.length; i += cols) {
    const tr = document.createElement('tr')
    for (let j = 0; j < cols; j += 1) {
      const td = document.createElement('td')
      td.style.width = `${(100 / cols).toFixed(2)}%`
      if (items[i + j]) td.appendChild(items[i + j])
      tr.appendChild(td)
    }
    tbody.appendChild(tr)
  }
  table.appendChild(tbody)
  el.replaceWith(table)
}

// מספר העמודות נקבע ב-JSX דרך style.gridTemplateColumns — קוראים אותו משם
function columnsOf(el, fallback) {
  const m = /repeat\(\s*(\d+)/.exec(el.style.gridTemplateColumns || '')
  return m ? parseInt(m[1], 10) : fallback
}

// וורד מפרש HTML 4: section/article/figure/footer אינם מוכרים לו, הוא מתייחס
// אליהם כאל תגיות ריקות ומתעלם מהסגנון שעליהן — ואיתו נופלות שבירות העמודים.
// אותו טיפול לרשימת התוכן: ‎list-style: none אינו נתמך, ו-ol היה מוסיף מספור
// אוטומטי משלו לצד המספרים שהמסמך כבר מכיל.
const LEGACY = 'section, article, figure, figcaption, header, footer, nav, aside, main'

function toDiv(el) {
  const div = document.createElement('div')
  for (const { name, value } of el.attributes) div.setAttribute(name, value)
  while (el.firstChild) div.appendChild(el.firstChild)
  el.replaceWith(div)
  return div
}

// שבירת עמוד. זו הצורה היחידה שוורד מכבד בעקביות — סגנון על האלמנט עצמו,
// ולא כלל בגיליון.
function pageBreak() {
  const br = document.createElement('br')
  br.setAttribute('clear', 'all')
  br.setAttribute('style', 'mso-special-character:line-break;page-break-before:always')
  return br
}

// תוכן העניינים בנוי מ-flex עם gap, ומספר הפרק מקבל את רוחבו מ-min-width על
// span — וורד מתעלם משניהם, והתוצאה היא "1.1רקע כללי" צמוד. טבלה היא המבנה
// היחיד שבו וורד שומר על טור מספרים מיושר.
function tocToTable(list) {
  const table = document.createElement('table')
  table.style.cssText = 'width:100%;border-collapse:collapse;margin:18px 0 0'
  const tbody = document.createElement('tbody')
  for (const item of list.children) {
    const l2 = item.classList.contains('bp-toc-l2')
    // ‎.bp-toc-l1 { margin-top: 9px } — על tr הוא לא יעבוד, ולכן על התאים
    const lead = !l2 && item !== list.firstElementChild ? 'padding-top:9px;' : ''
    // הטקסט נעטף בפסקה מפורשת עם margin אפס. בלעדיה וורד מייצר פסקת MsoNormal
    // משלו, ועם רווח־האחרי שלה 31 השורות נדחקות לעמוד שני.
    const cell = (extra) => 'border:0;padding:1px 0;vertical-align:top;'
      + `${lead}${l2 ? 'font-size:9.5pt;color:#706A60;' : 'font-weight:600;'}${extra}`
    const td = (text, extra) => {
      const cellEl = document.createElement('td')
      cellEl.setAttribute('style', cell(extra))
      const p = document.createElement('p')
      p.setAttribute('style', 'margin:0;line-height:1.3')
      p.textContent = text ?? ''
      cellEl.appendChild(p)
      return cellEl
    }
    const tr = document.createElement('tr')
    tr.append(
      td(item.querySelector('.bp-toc-num')?.textContent,
        `width:62px;color:#1F3A5F;${l2 ? 'padding-right:26px;' : ''}`),
      td(item.querySelector('.bp-toc-title')?.textContent, ''),
    )
    tbody.appendChild(tr)
  }
  table.appendChild(tbody)
  list.replaceWith(table)
}

function transformForWord(doc) {
  // מה שאינו חלק מהמסמך המודפס
  doc.querySelectorAll('.no-print, .bp-hidden-list').forEach((n) => n.remove())

  doc.querySelectorAll(LEGACY).forEach(toDiv)
  doc.querySelectorAll('.bp-toc-list').forEach(tocToTable)

  // שער → תוכן עניינים → פרק לכל עמוד
  const toc = doc.querySelector('.bp-toc')
  if (toc) toc.before(pageBreak())
  doc.querySelectorAll('.bp-level-1').forEach((s) => s.before(pageBreak()))

  // הרווח בין מספר הפרק לכותרת — min-width על span אינו קיים בוורד.
  // רווחים קשיחים, כי רווח רגיל בקצה תגית נבלע בקיפול הרווחים של HTML.
  doc.querySelectorAll('.bp-h1 .bp-num, .bp-h2 .bp-num').forEach((n) => {
    n.after(document.createTextNode('  '))
  })

  // הפס המסמן את השער — div ריק שוורד מקפל לגובה אפס. טבלה ממורכזת עם תא
  // יחיד היא הדרך היחידה שוורד מרנדר בעקביות.
  const accent = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-accent').trim() || '#D64A2E'
  doc.querySelectorAll('.bp-cover-rule').forEach((el) => {
    const table = document.createElement('table')
    table.setAttribute('align', 'center')
    table.style.cssText = 'border-collapse:collapse;margin:0 auto 34px'
    table.innerHTML = '<tbody><tr><td style="width:72px;height:4px;font-size:1px;'
      + `line-height:4px;padding:0;border:0;background:${accent}">&nbsp;</td></tr></tbody>`
    el.replaceWith(table)
  })

  // מסגרת ורקע על div מרונדרים בוורד בצורה לא עקבית; תא טבלה תמיד נכון
  doc.querySelectorAll('.bp-kpi').forEach((el) => {
    const table = document.createElement('table')
    table.style.cssText = 'width:100%;border-collapse:collapse'
    const td = document.createElement('td')
    td.className = el.className
    while (el.firstChild) td.appendChild(el.firstChild)
    const tr = document.createElement('tr')
    const tbody = document.createElement('tbody')
    tr.appendChild(td)
    tbody.appendChild(tr)
    table.appendChild(tbody)
    el.replaceWith(table)
  })

  doc.querySelectorAll('.bp-kpis').forEach((el) => gridToTable(el, columnsOf(el, 3)))
  doc.querySelectorAll('.bp-su').forEach((el) => gridToTable(el, 2))

  // רצועת העובדות בשער — flex עם gap; בוורד מחברים למשפט אחד
  doc.querySelectorAll('.bp-cover-facts').forEach((el) => {
    const parts = Array.from(el.children).map((c) => c.textContent.trim()).filter(Boolean)
    el.textContent = parts.join('  ·  ')
  })

  // גלילה אופקית אינה קיימת בנייר
  doc.querySelectorAll('.bp-scroll').forEach((el) => { el.style.overflow = 'visible' })

  // הצללה לסירוגין. שורות סיכום וכותרות-קבוצה שומרות על הרקע שלהן.
  doc.querySelectorAll('.bp-table tbody').forEach((tbody) => {
    Array.from(tbody.rows).forEach((tr, i) => {
      if (i % 2 === 0 || tr.classList.contains('bp-total') || tr.classList.contains('bp-group')) return
      Array.from(tr.cells).forEach((td) => { td.style.background = ZEBRA_BG })
    })
  })
}

// ─── הרכבת הקובץ ─────────────────────────────────────────────────────────────

function download(html, filename) {
  // BOM — בלעדיו וורד מנחש קידוד ומקבל עברית משובשת
  const blob = new Blob([`﻿${html}`], { type: 'application/msword;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // שחרור מושהה — Safari מבטל הורדה שה-URL שלה נגרע מיד
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/**
 * מייצא את המסמך המוצג כקובץ Word.
 * @param {string} filename שם הקובץ, כולל סיומת
 */
export async function exportBusinessPlanWord(filename = 'תכנית עסקית.doc') {
  const source = document.querySelector('.bp-doc')
  if (!source) throw new Error('המסמך אינו מוצג')

  // ההמרה ל-PNG חייבת לקרוא מה-SVG החי: לשיבוט אין פריסה מחושבת
  const charts = await Promise.all(
    Array.from(source.querySelectorAll('.recharts-wrapper svg')).map(svgToPng),
  )

  const doc = source.cloneNode(true)
  doc.querySelectorAll('.recharts-wrapper').forEach((wrapper, i) => {
    const png = charts[i]
    if (!png) { wrapper.remove(); return }
    const img = document.createElement('img')
    img.className = 'bp-chart-img'
    img.src = png.data
    img.width = png.w
    img.height = png.h
    wrapper.replaceWith(img)
  })
  transformForWord(doc)

  const title = document.title || 'תכנית עסקית'
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" `
    + `xmlns:w="urn:schemas-microsoft-com:office:word" `
    + `xmlns="http://www.w3.org/TR/REC-html40" lang="he" dir="rtl">`
    + `<head><meta charset="utf-8"><title>${title}</title>`
    + `<!--[if gte mso 9]><xml><w:WordDocument>`
    + `<w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/>`
    + `</w:WordDocument></xml><![endif]-->`
    + `<style>${collectCss()}\n${WORD_CSS}</style></head>`
    // ‎.bp-doc הוא article — שורש השיבוט עצמו, ולכן אינו נתפס ע"י ההמרה ל-div
    + `<body dir="rtl"><div class="WordSection1">`
    + `<div class="bp-doc" dir="rtl">${doc.innerHTML}</div>`
    + `</div></body></html>`

  download(html, filename)
}
