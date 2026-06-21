const BASE = '/api';

async function request(url, opts = {}) {
  const res = await fetch(BASE + url, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    const err = new Error(typeof data === 'object' ? data.error || text : text);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  health: () => request('/health'),

  listComponents: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request('/components' + (q ? '?' + q : ''));
  },
  getComponent: (id) => request(`/components/${id}`),
  createComponent: (body) => request('/components', { method: 'POST', body }),
  createComponentVersion: (id, body) => request(`/components/${id}/versions`, { method: 'POST', body }),
  activateVersion: (id, vid) => request(`/components/${id}/versions/${vid}/activate`, { method: 'POST' }),
  deleteComponent: (id) => request(`/components/${id}`, { method: 'DELETE' }),

  matchComponents: (intent_description, top_k = 3) =>
    request('/match', { method: 'POST', body: { intent_description, top_k } }),

  listArticles: (status) => {
    const q = status ? '?status=' + status : '';
    return request('/articles' + q);
  },
  getArticle: (id) => request(`/articles/${id}`),
  createArticle: (body) => request('/articles', { method: 'POST', body }),
  updateArticle: (id, body) => request(`/articles/${id}`, { method: 'PUT', body }),
  deleteArticle: (id) => request(`/articles/${id}`, { method: 'DELETE' }),
  renderArticle: (id) => request(`/articles/${id}/render`),

  submitFeedback: (body) => request('/feedback', { method: 'POST', body }),
  listFeedback: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request('/feedback' + (q ? '?' + q : ''));
  },
  runCron: () => request('/cron/run'),
};

export default api;
