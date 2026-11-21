const BASE = '/api';

async function request(path, { method = 'GET', body = null } = {}) {
  const options = { method, headers: {} };
  if (body !== null) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`${BASE}${path}`, options);
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    /* non-JSON response */
  }
  if (!response.ok || payload?.ok === false) {
    const message = payload?.error?.message || `Request failed (${response.status}).`;
    const error = new Error(message);
    error.status = response.status;
    error.details = payload?.error?.details;
    error.code = payload?.error?.code;
    throw error;
  }
  return payload?.data;
}

function query(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const api = {
  meta: () => request('/meta'),
  compareOptions: () => request('/compare/options'),
  comparisons: (limit = 30) => request(`/comparisons?limit=${limit}`),
  comparison: (id) => request(`/comparisons/${encodeURIComponent(id)}`),
  createComparison: (body) => request('/comparisons', { method: 'POST', body }),
  retryComparison: (id) =>
    request(`/comparisons/${encodeURIComponent(id)}/retry`, { method: 'POST', body: {} }),
  dashboard: () => request('/dashboard'),
  cases: (params) => request(`/cases${query(params)}`),
  createCase: (body) => request('/cases', { method: 'POST', body }),
  case: (id) => request(`/cases/${encodeURIComponent(id)}`),
  updateCase: (id, body) => request(`/cases/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  confirmRequirements: (id, body) =>
    request(`/cases/${encodeURIComponent(id)}/requirements`, { method: 'POST', body }),
  checkInventory: (id) =>
    request(`/cases/${encodeURIComponent(id)}/inventory-check`, { method: 'POST', body: {} }),
  startSearch: (id) =>
    request(`/cases/${encodeURIComponent(id)}/search`, { method: 'POST', body: {} }),
  cancelRun: (caseId, runId) =>
    request(`/cases/${encodeURIComponent(caseId)}/runs/${encodeURIComponent(runId)}/cancel`, {
      method: 'POST',
      body: {},
    }),
  decideListing: (caseId, listingId, body) =>
    request(
      `/cases/${encodeURIComponent(caseId)}/listings/${encodeURIComponent(listingId)}/decision`,
      { method: 'POST', body }
    ),
  createShortlist: (caseId, body) =>
    request(`/cases/${encodeURIComponent(caseId)}/shortlist`, { method: 'POST', body }),
  updateShortlist: (caseId, shortlistId, body) =>
    request(`/cases/${encodeURIComponent(caseId)}/shortlists/${encodeURIComponent(shortlistId)}`, {
      method: 'PATCH',
      body,
    }),
  shareShortlist: (caseId, shortlistId) =>
    request(`/cases/${encodeURIComponent(caseId)}/shortlists/${encodeURIComponent(shortlistId)}/share`, {
      method: 'POST',
      body: {},
    }),
  iterate: (caseId, body) =>
    request(`/cases/${encodeURIComponent(caseId)}/iterate`, { method: 'POST', body }),
  closeCase: (caseId, body) =>
    request(`/cases/${encodeURIComponent(caseId)}/close`, { method: 'POST', body }),
  inventory: () => request('/inventory'),
  addInventory: (body) => request('/inventory', { method: 'POST', body }),
  updateInventory: (id, body) =>
    request(`/inventory/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  sources: () => request('/sources'),
  addSource: (body) => request('/sources', { method: 'POST', body }),
  updateSource: (id, body) =>
    request(`/sources/${encodeURIComponent(id)}`, { method: 'PATCH', body }),
  importSources: (csv) => request('/sources/import', { method: 'POST', body: { csv } }),
  portfolio: () => request('/portfolio'),
  outputs: () => request('/outputs'),
  systems: () => request('/systems'),
  portal: (token) => request(`/portal/${encodeURIComponent(token)}`),
  portalFeedback: (token, body) =>
    request(`/portal/${encodeURIComponent(token)}/feedback`, { method: 'POST', body }),
  resetDemo: () => request('/demo/reset', { method: 'POST', body: {} }),
};

export function openRunStream(runId, handlers = {}) {
  const source = new EventSource(`${BASE}/runs/events?runId=${encodeURIComponent(runId)}`);
  source.onmessage = (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }
    if (payload.type === 'step') handlers.onStep?.(payload);
    else if (payload.type === 'status') handlers.onStatus?.(payload);
    else if (payload.type === 'done') {
      handlers.onDone?.(payload);
      source.close();
    } else if (payload.type === 'error') handlers.onError?.(payload);
  };
  source.onerror = () => handlers.onConnectionError?.();
  return source;
}

export function portalUrl(token) {
  return `${window.location.origin}/portal/${token}`;
}


export function openComparisonStream(comparisonId, handlers = {}) {
  const source = new EventSource(`${BASE}/comparisons/${encodeURIComponent(comparisonId)}/events`);
  source.onmessage = (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }
    if (payload.type === 'step') handlers.onStep?.(payload);
    else if (payload.type === 'status') handlers.onStatus?.(payload);
    else if (payload.type === 'done') {
      handlers.onDone?.(payload);
      source.close();
    } else if (payload.type === 'error') handlers.onError?.(payload);
  };
  source.onerror = () => handlers.onConnectionError?.();
  return source;
}
