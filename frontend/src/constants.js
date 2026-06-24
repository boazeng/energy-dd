// תוויות בעברית לקטגוריות הבדיקה ולסטטוסים — משותף בין העמודים.

export const CATEGORIES = [
  { key: 'tenant_agreement', label: 'הסכמי דיירים', icon: 'document', tone: 'tone-steel' },
  { key: 'financial', label: 'דוחות כספיים ומאזני בוחן', icon: 'reports', tone: 'tone-green' },
  { key: 'owners', label: 'בעלי החברה', icon: 'users', tone: 'tone-blue' },
  { key: 'supplier_ledger', label: 'כרטסות ספקים', icon: 'invoices', tone: 'tone-steel' },
]

export const CATEGORY_LABEL = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.label]),
)

export const STATUSES = [
  { key: 'open', label: 'פתוח', badge: 'tact-badge-soon' },
  { key: 'in_progress', label: 'בתהליך', badge: 'tact-badge-on' },
  { key: 'done', label: 'הושלם', badge: 'tact-badge-pos' },
  { key: 'blocked', label: 'תקוע', badge: 'tact-badge-new' },
]

export const STATUS_LABEL = Object.fromEntries(
  STATUSES.map((s) => [s.key, s.label]),
)
export const STATUS_BADGE = Object.fromEntries(
  STATUSES.map((s) => [s.key, s.badge]),
)
