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
// להיגזר מגיליון המקור ולא מעותק שיסטה ממנו עם הזמן.
function collectCss(prefix) {
  // התחיליות זרות זו לזו ("bkp-" אינו מכיל "bp-"), ולכן כל מסמך אוסף רק את
  // הכללים שלו ואין דליפה בין השניים.
  const relevant = (sel) => sel.includes(prefix) || sel.includes('recharts')
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

// גופן וגודל ברירת המחדל של המסמך בוורד. הכותרות אינן מושפעות — הן נשארות
// בגופן של העיצוב באתר, שאותו וורד פותר ל-Segoe UI (‎Heebo אינו מותקן).
const BODY_FONT = "David, 'Segoe UI', serif"
const BODY_SIZE = '14pt'
const HEADING_FONT = "'Segoe UI', Arial, sans-serif"
// מרווח השורות במלל הרץ. הטבלאות והכיתובים שומרים על הצפיפות שלהם.
// באחוזים ולא כמספר חסר יחידה — את הצורה חסרת היחידה וורד פשוט מתעלם ממנה.
const PROSE_LEADING = '115%'
// מסגרת העמוד — הכחול של TACT, שהוא גם הכחול של המסגרת בתכנית הייחוס
const FRAME_COLOR = '#1F3A5F'

// התאמות שקיימות רק בייצוא: מה שוורד אינו יודע לקרוא מגיליון המקור.
// פונקציה של התחילית, כדי לשרת את שני המסמכים (bp- ו-bkp-).
const wordCss = (p) => `
/* מסגרת העמוד. בוורד היא נגזרת מ-border ומ-padding שבתוך @page עצמו, לא
   מאלמנט בגוף המסמך — padding הוא המרחק בין המסגרת לשולי הטקסט. */
@page WordSection1 {
  size: 210mm 297mm;
  margin: 18mm 20mm;
  mso-page-orientation: portrait;
  border: double ${FRAME_COLOR} 4.5pt;
  mso-border-alt: double ${FRAME_COLOR} 4.5pt;
  padding: 24pt;
  mso-page-border-surround-header: no;
  mso-page-border-surround-footer: no;
}
div.WordSection1 { page: WordSection1; }
/* וורד עוטף כל טקסט חופשי בפסקת MsoNormal, ולסגנון Normal שלו יש רווח־אחרי של
   8pt. בלי איפוסו כל תא טבלה וכל שורת תוכן־עניינים מקבלים ריווח כפול. */
p.MsoNormal, li.MsoNormal, div.MsoNormal { margin: 0; }
body {
  direction: rtl;
  font-family: ${BODY_FONT};
  font-size: ${BODY_SIZE};
  line-height: 1.6;
  color: #2A2A28;
}
/* ‎.${p}doc קובע 10.5pt בכללי ההדפסה, ולכן הגדרת ה-body לבדה לא הייתה מגיעה
   לפסקאות */
.${p}doc {
  width: auto; border: 0; padding: 0; box-shadow: none;
  font-family: ${BODY_FONT};
  font-size: ${BODY_SIZE};
}
/* הכותרות נשארות בגופן ובגדלים של העיצוב. אלמנטים בעלי גודל מפורש משלהם —
   טבלאות, כיתובים והערות — שומרים על גודלם ומקבלים רק את הגופן החדש. */
.${p}h1, .${p}h2, .${p}cover-title, .${p}cover-company,
.${p}cover-purpose, .${p}cover-to { font-family: ${HEADING_FONT}; }
.${p}p, .${p}ul li { line-height: ${PROSE_LEADING}; }
/* גודל הגופן בטבלאות נקבע לכל טבלה בנפרד וניצרב על התאים (ראה fitTableSizes),
   כי כלל בגיליון אינו יכול להבחין בין טבלה צרה לרחבה. */
.${p}table th, .${p}table td { line-height: ${PROSE_LEADING}; }
table { mso-table-lspace: 0; mso-table-rspace: 0; }
.${p}table { direction: rtl; }
/* וורד מתעלם מ-padding-inline / border-block הלוגיים */
.${p}ul { margin-right: 22px; padding-right: 0; }
.${p}toc-l2 { margin-right: 26px; padding-right: 0 !important; }
.${p}toc-num { display: inline-block; width: 34px; }
.${p}cover-facts {
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
.${p}h1, .${p}h2, .${p}caption { page-break-after: avoid; }
.${p}figure, .${p}kpi, .bp-grid-shim, .${p}table tr { page-break-inside: avoid; }
/* גובה השער נועד לדחוף את מה שאחריו לעמוד הבא; בוורד השבירה מפורשת */
.${p}cover { height: auto !important; min-height: 0 !important; padding-top: 60px; }
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

// ─── גודל הגופן בטבלאות ──────────────────────────────────────────────────────

// רוחב אזור התוכן: A4 בניכוי שוליים, 170mm, ב-96dpi
const CONTENT_PX = Math.round(170 / 25.4 * 96)
const BODY_PT = parseFloat(BODY_SIZE)
// מתחת לזה הטבלה כבר אינה קריאה, ועדיף שתיחתך ותיראה כבעיה
const MIN_TABLE_PT = 8

/**
 * צורב גודל גופן על תאי כל טבלה: {@link BODY_SIZE} כברירת מחדל, ופחות מזה רק
 * בטבלה שברוחב זה הייתה חורגת מהעמוד. הרוחב הטבעי נמדד בדפדפן על שיבוט מוסתר,
 * כי הוא תלוי בתוכן בפועל — מספר העמודות לבדו אינו מנבא אותו (עמודת שנה צרה,
 * ‎"(4,271,651)"‎ עם white-space: nowrap רחבה פי כמה).
 * הגודל ניצרב על התאים ולא על הטבלה: וורד אינו מוריש font-size לתוך טבלה.
 */
function fitTableSizes(doc, p) {
  const host = document.createElement('div')
  host.className = `${p}doc`
  host.dir = 'rtl'
  host.style.cssText = 'position:absolute;left:-20000px;top:0;width:auto;visibility:hidden'
  const style = document.createElement('style')
  // ‎min-content ולא auto: המידה הקובעת היא הרוחב המינימלי שבו הטבלה עדיין
  // תקינה. ב-auto טבלה עם טקסט ארוך נמדדת כרחבה פי כמה ממה שהיא צריכה,
  // ומוקטנת שלא לצורך.
  // ‎white-space: normal מבטל את ה-nowrap שבעיצוב, כי וורד ממילא מתעלם ממנו
  // וגולש. הרצפה נשארת המספר הארוך ביותר — אותו אי אפשר לשבור.
  style.textContent = '.bp-word-probe { width: min-content !important; }'
    + '.bp-word-probe th, .bp-word-probe td'
    + ' { font-size: inherit !important; white-space: normal !important; }'
  document.body.append(style, host)

  try {
    for (const table of doc.querySelectorAll(`.${p}table`)) {
      const probe = table.cloneNode(true)
      probe.classList.add('bp-word-probe')
      probe.style.fontFamily = BODY_FONT
      probe.style.fontSize = BODY_SIZE
      host.replaceChildren(probe)

      const natural = probe.scrollWidth
      const pt = natural > CONTENT_PX
        ? Math.max(MIN_TABLE_PT, Math.floor(BODY_PT * CONTENT_PX / natural * 10) / 10)
        : BODY_PT
      for (const cell of table.querySelectorAll('th, td')) {
        cell.style.fontSize = `${pt}pt`
      }
    }
  } finally {
    host.remove()
    style.remove()
  }
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
function tocToTable(list, p) {
  const table = document.createElement('table')
  table.style.cssText = 'width:100%;border-collapse:collapse;margin:18px 0 0'
  const tbody = document.createElement('tbody')
  for (const item of list.children) {
    const l2 = item.classList.contains(`${p}toc-l2`)
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
      td(item.querySelector(`.${p}toc-num`)?.textContent,
        `width:62px;color:#1F3A5F;${l2 ? 'padding-right:26px;' : ''}`),
      td(item.querySelector(`.${p}toc-title`)?.textContent, ''),
    )
    tbody.appendChild(tr)
  }
  table.appendChild(tbody)
  list.replaceWith(table)
}

function transformForWord(doc, cfg) {
  const p = cfg.prefix
  // מה שאינו חלק מהמסמך המודפס
  doc.querySelectorAll(['.no-print', `.${p}hidden-list`, ...cfg.remove].join(', '))
    .forEach((n) => n.remove())

  // לפני כל המרה אחרת — נמדד על מבנה הטבלה כפי שהוא באתר
  fitTableSizes(doc, p)

  doc.querySelectorAll(LEGACY).forEach(toDiv)
  doc.querySelectorAll(`.${p}toc-list`).forEach((el) => tocToTable(el, p))

  // שער → תוכן עניינים → פרק לכל עמוד
  const toc = doc.querySelector(`.${p}toc`)
  if (toc) toc.before(pageBreak())
  doc.querySelectorAll(`.${p}level-1`).forEach((s) => s.before(pageBreak()))

  // הרווח בין מספר הפרק לכותרת — min-width על span אינו קיים בוורד.
  // רווחים קשיחים, כי רווח רגיל בקצה תגית נבלע בקיפול הרווחים של HTML.
  doc.querySelectorAll(cfg.secNum).forEach((n) => {
    n.after(document.createTextNode('  '))
  })

  // הפס המסמן את השער — div ריק שוורד מקפל לגובה אפס. טבלה ממורכזת עם תא
  // יחיד היא הדרך היחידה שוורד מרנדר בעקביות.
  const accent = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-accent').trim() || '#D64A2E'
  doc.querySelectorAll(`.${p}cover-rule`).forEach((el) => {
    const table = document.createElement('table')
    table.setAttribute('align', 'center')
    table.style.cssText = 'border-collapse:collapse;margin:0 auto 34px'
    table.innerHTML = '<tbody><tr><td style="width:72px;height:4px;font-size:1px;'
      + `line-height:4px;padding:0;border:0;background:${accent}">&nbsp;</td></tr></tbody>`
    el.replaceWith(table)
  })

  // מסגרת ורקע על div מרונדרים בוורד בצורה לא עקבית; תא טבלה תמיד נכון
  doc.querySelectorAll(`.${p}kpi`).forEach((el) => {
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

  doc.querySelectorAll(`.${p}kpis`).forEach((el) => gridToTable(el, columnsOf(el, 3)))
  doc.querySelectorAll(`.${p}su`).forEach((el) => gridToTable(el, 2))

  // רצועת העובדות בשער — flex עם gap; בוורד מחברים למשפט אחד
  doc.querySelectorAll(`.${p}cover-facts`).forEach((el) => {
    const parts = Array.from(el.children).map((c) => c.textContent.trim()).filter(Boolean)
    el.textContent = parts.join('  ·  ')
  })

  // גלילה אופקית אינה קיימת בנייר
  doc.querySelectorAll(`.${p}scroll`).forEach((el) => { el.style.overflow = 'visible' })

  // הצללה לסירוגין. שורות סיכום וכותרות-קבוצה שומרות על הרקע שלהן.
  doc.querySelectorAll(cfg.zebra).forEach((tbody) => {
    Array.from(tbody.rows).forEach((tr, i) => {
      if (i % 2 === 0 || tr.classList.contains(`${p}total`) || tr.classList.contains(`${p}group`)) return
      Array.from(tr.cells).forEach((td) => { td.style.background = ZEBRA_BG })
    })
  })

  // שורות תמונה שמסודרות ב-flex — וורד מרנדר flex כרצף בלוקים, והתמונות היו
  // נערמות זו מתחת לזו במקום זו לצד זו.
  for (const sel of cfg.flexRows) {
    doc.querySelectorAll(sel).forEach((el) => gridToTable(el, el.children.length || 1))
  }
}

// ─── הרכבת הקובץ ─────────────────────────────────────────────────────────────

/**
 * מטמיע את תמונות המסמך בקובץ עצמו. באתר הן מוגשות בנתיב יחסי (‎/bank-plan/…),
 * ובקובץ שיורד למחשב הנתיב הזה כבר לא מוביל לשום מקום — וורד היה מציג ריבועים
 * ריקים. אותו פתרון שבו כבר משתמשים התרשימים.
 */
async function inlineImages(doc) {
  const imgs = Array.from(doc.querySelectorAll('img'))
    .filter((img) => img.src && !img.src.startsWith('data:'))
  await Promise.all(imgs.map(async (img) => {
    try {
      const blob = await (await fetch(img.src)).blob()
      img.src = await new Promise((resolve, reject) => {
        const fr = new FileReader()
        fr.onload = () => resolve(fr.result)
        fr.onerror = () => reject(new Error(img.src))
        fr.readAsDataURL(blob)
      })
    } catch {
      // תמונה שלא נטענה נשארת כקישור; עדיף מקובץ שנכשל כולו
    }
  }))
}

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
/**
 * הגדרות המסמך המיוצא. ברירת המחדל היא לשונית "תכנית עסקית".
 * @typedef {object} ExportTarget
 * @property {string} root      סלקטור שורש המסמך ב-DOM
 * @property {string} prefix    תחילית מחלקות ה-CSS, כולל המקף
 * @property {string} secNum    סלקטור מספרי הסעיפים שבכותרות
 * @property {string[]} remove  אלמנטים שיורדים בייצוא
 * @property {string[]} flexRows מכלי flex שיומרו לטבלה בת שורה אחת
 * @property {string} zebra     סלקטור ה-tbody שבהם נצרבת ההצללה לסירוגין
 */
const BUSINESS_PLAN = {
  root: '.bp-doc',
  prefix: 'bp-',
  secNum: '.bp-h1 .bp-num, .bp-h2 .bp-num',
  remove: [],
  flexRows: [],
  zebra: '.bp-table tbody',
}

// לשונית "תכנית עסקית לבנק". השינויים מול המסמך האחר: שורש אחר, מחלקה נפרדת
// למספר הסעיף, מסגרת עמוד שמצוירת כאלמנט (בוורד היא מגיעה מ-@page), שתי שורות
// תמונות ב-flex, וטבלה נוספת בסגנון Word שגם בה יש הצללה לסירוגין.
export const BANK_PLAN = {
  root: '.bkp-sheet',
  prefix: 'bkp-',
  secNum: '.bkp-secnum',
  remove: ['.bkp-frame'],
  flexRows: ['.bkp-cover-pics', '.bkp-products'],
  zebra: '.bkp-table tbody, .bkp-table-accent tbody',
}

/**
 * מייצא את המסמך המוצג כקובץ Word.
 * @param {string} filename שם הקובץ, כולל סיומת
 * @param {ExportTarget} [target] המסמך לייצוא; ברירת המחדל היא התכנית העסקית
 */
export async function exportBusinessPlanWord(filename = 'תכנית עסקית.doc', target = BUSINESS_PLAN) {
  const cfg = { ...BUSINESS_PLAN, ...target }
  const source = document.querySelector(cfg.root)
  if (!source) throw new Error('המסמך אינו מוצג')

  // ההמרה ל-PNG חייבת לקרוא מה-SVG החי: לשיבוט אין פריסה מחושבת
  const charts = await Promise.all(
    Array.from(source.querySelectorAll('.recharts-wrapper svg')).map(svgToPng),
  )

  // מידות התמונות נמדדות מהמסמך החי ונצרבות כתכונות width/height. הגודל מגיע
  // בעיצוב מכללי-צאצא (‎.bkp-products .bkp-prod-a), ואלה מפסיקים להתאים ברגע
  // שמכל ה-flex מוחלף בטבלה — בלי הצריבה התמונות היו יוצאות בגודלן המקורי.
  const sizes = Array.from(source.querySelectorAll('img'))
    .map((img) => img.getBoundingClientRect())

  const doc = source.cloneNode(true)
  doc.querySelectorAll('img').forEach((img, i) => {
    const r = sizes[i]
    if (!r?.width) return
    img.setAttribute('width', Math.round(r.width))
    img.setAttribute('height', Math.round(r.height))
  })

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
  transformForWord(doc, cfg)
  await inlineImages(doc)

  const title = document.title || 'תכנית עסקית'
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" `
    + `xmlns:w="urn:schemas-microsoft-com:office:word" `
    + `xmlns="http://www.w3.org/TR/REC-html40" lang="he" dir="rtl">`
    + `<head><meta charset="utf-8"><title>${title}</title>`
    + `<!--[if gte mso 9]><xml><w:WordDocument>`
    + `<w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/>`
    + `</w:WordDocument></xml><![endif]-->`
    + `<style>${collectCss(cfg.prefix)}\n${wordCss(cfg.prefix)}</style></head>`
    // שורש המסמך הוא article — שורש השיבוט עצמו, ולכן אינו נתפס ע"י ההמרה ל-div
    + `<body dir="rtl"><div class="WordSection1">`
    + `<div class="${cfg.prefix}doc" dir="rtl">${doc.innerHTML}</div>`
    + `</div></body></html>`

  download(html, filename)
}
