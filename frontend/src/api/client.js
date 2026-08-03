// קליינט דק ל-backend. בפיתוח /api מנותב דרך proxy של Vite.

async function request(path, options) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  // session פג / לא מחובר — הפניה למסך ההתחברות של Google
  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('לא מחובר')
  }
  if (!res.ok) {
    // ה-backend מחזיר {detail: "..."} בעברית — עדיף על קוד HTTP יבש
    const detail = await res.json().then((b) => b?.detail).catch(() => null)
    throw new Error(detail || `שגיאת רשת (${res.status})`)
  }
  return res.status === 204 ? null : res.json()
}

export const api = {
  listTasks: () => request('/api/tasks'),
  createTask: (data) =>
    request('/api/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id, data) =>
    request(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTask: (id) =>
    request(`/api/tasks/${id}`, { method: 'DELETE' }),

  getProjects: () => request('/api/projects'),
  getFinancials: () => request('/api/financials'),

  getCashflow: () => request('/api/cashflow'),
  createCashflowItem: (data) =>
    request('/api/cashflow', { method: 'POST', body: JSON.stringify(data) }),
  updateCashflowItem: (id, data) =>
    request(`/api/cashflow/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCashflowItem: (id) =>
    request(`/api/cashflow/${id}`, { method: 'DELETE' }),
  updateCashflowSettings: (data) =>
    request('/api/cashflow/settings', { method: 'PUT', body: JSON.stringify(data) }),
  updateCashflowLoan: (data) =>
    request('/api/cashflow/loan', { method: 'PUT', body: JSON.stringify(data) }),

  listAgreements: () => request('/api/tenant-agreements'),
  createAgreement: (data) =>
    request('/api/tenant-agreements', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateAgreement: (id, data) =>
    request(`/api/tenant-agreements/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  listSupplierBalances: () => request('/api/supplier-balances'),
  createSupplierBalance: (data) =>
    request('/api/supplier-balances', { method: 'POST', body: JSON.stringify(data) }),
  deleteSupplierBalance: (id) =>
    request(`/api/supplier-balances/${id}`, { method: 'DELETE' }),

  listSupplierLedger: () => request('/api/supplier-ledger'),
  createSupplierLedgerRow: (data) =>
    request('/api/supplier-ledger', { method: 'POST', body: JSON.stringify(data) }),
  updateSupplierLedgerRow: (id, data) =>
    request(`/api/supplier-ledger/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteSupplierLedgerRow: (id) =>
    request(`/api/supplier-ledger/${id}`, { method: 'DELETE' }),

  // שאלות לבירור
  listQuestions: () => request('/api/questions'),
  createQuestion: (data) =>
    request('/api/questions', { method: 'POST', body: JSON.stringify(data) }),
  updateQuestion: (id, data) =>
    request(`/api/questions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteQuestion: (id) =>
    request(`/api/questions/${id}`, { method: 'DELETE' }),

  // בדיקת הכנסות
  getRevenueFiles: () => request('/api/revenue-check/files'),
  getRevenueData: () => request('/api/revenue-check/data'),
  getRevenueChargerCompare: (month) => request(`/api/revenue-check/compare/chargers?month=${month}`),
  getRevenueMonthlyFees: (month) => request(`/api/revenue-check/compare/monthly-fees?month=${month}`),
  getRevenueElectricityCompare: (month) => request(`/api/revenue-check/compare/electricity?month=${month}`),
  getRevenueKwhAvg: () => request('/api/revenue-check/compare/kwh-avg'),

  // תזרים פר-בניין
  listBuildingModels: () => request('/api/building-models'),
  createBuildingModel: (data) =>
    request('/api/building-models', { method: 'POST', body: JSON.stringify(data) }),
  updateBuildingModel: (id, data) =>
    request(`/api/building-models/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteBuildingModel: (id) =>
    request(`/api/building-models/${id}`, { method: 'DELETE' }),
  getBuildingForecast: (id, forceYears) =>
    request(`/api/building-models/${id}/forecast${forceYears ? `?force_years=${forceYears}` : ''}`),
  getCombinedForecast: (forceYears) =>
    request(`/api/building-models/forecast/combined${forceYears ? `?force_years=${forceYears}` : ''}`),

  // תכנית עסקית — תוכן ערוך + snapshot נתונים חי
  getBusinessPlan: () => request('/api/business-plan'),
  // years=undefined + byContract=true → כל אתר לפי תקופת ההסכם שלו
  getBusinessPlanData: (years, overhead, byContract) => {
    const q = new URLSearchParams()
    if (byContract) q.set('by_contract', 'true')
    else if (years) q.set('years', years)
    if (overhead) q.set('overhead', overhead)
    const s = q.toString()
    return request(`/api/business-plan/data${s ? `?${s}` : ''}`)
  },
  updateBusinessPlanSettings: (data) =>
    request('/api/business-plan/settings', { method: 'PUT', body: JSON.stringify(data) }),

  // תכנית עסקית לבנק — רק הבלוקים שנערכו; גוף ריק מחזיר לנוסח שבקובץ
  getBankPlanTexts: () => request('/api/bank-plan/texts'),
  saveBankPlanText: (key, body) =>
    request(`/api/bank-plan/texts/${encodeURIComponent(key)}`, {
      method: 'PUT', body: JSON.stringify({ body }),
    }),
  // אימות והרשאות (shared-auth) — לא תחת /api/
  getAuthMe: () => request('/auth/me'),
  listUsers: () => request('/auth/users'),
  saveUser: (data) =>
    request('/auth/users', { method: 'POST', body: JSON.stringify(data) }),
  deleteUser: (email) =>
    request('/auth/users/delete', { method: 'POST', body: JSON.stringify({ email }) }),

  updateBusinessPlanSection: (id, data) =>
    request(`/api/business-plan/sections/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  createBusinessPlanSection: (data) =>
    request('/api/business-plan/sections', { method: 'POST', body: JSON.stringify(data) }),
  deleteBusinessPlanSection: (id) =>
    request(`/api/business-plan/sections/${id}`, { method: 'DELETE' }),
}
