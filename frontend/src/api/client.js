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
  if (!res.ok) throw new Error(`שגיאת רשת (${res.status})`)
  return res.status === 204 ? null : res.json()
}

export const api = {
  listTasks: () => request('/api/tasks'),
  createTask: (data) =>
    request('/api/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id, data) =>
    request(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  getProjects: () => request('/api/projects'),
  getFinancials: () => request('/api/financials'),

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
}
