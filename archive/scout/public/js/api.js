export class ApiError extends Error {
  constructor(message, { status = 0, code = 'UNKNOWN', details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  const options = {
    method,
    signal,
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(path, options);
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ApiError('Could not reach Scout. Check that the server is running and try again.', {
      code: 'NETWORK',
    });
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON error page (proxy, outage).
  }

  if (!response.ok || payload?.ok === false) {
    throw new ApiError(
      payload?.error?.message || `Request failed (${response.status}).`,
      {
        status: response.status,
        code: payload?.error?.code || 'HTTP_ERROR',
        details: payload?.error?.details || null,
      }
    );
  }

  return payload?.data ?? payload;
}

export const api = {
  meta: () => request('/api/meta'),
  health: () => request('/api/health'),
  properties: () => request('/api/properties'),
  sources: () => request('/api/sources'),
  createSource: (payload) => request('/api/sources', { method: 'POST', body: payload }),
  updateSource: (id, payload) =>
    request(`/api/sources/${encodeURIComponent(id)}`, { method: 'PATCH', body: payload }),
  runs: (limit = 50) => request(`/api/runs?limit=${encodeURIComponent(limit)}`),
  createRun: (payload) => request('/api/runs', { method: 'POST', body: payload }),
  run: (id) => request(`/api/runs/${encodeURIComponent(id)}`),
  results: (id) => request(`/api/runs/${encodeURIComponent(id)}/results`),
  cancelRun: (id) => request(`/api/runs/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: {} }),
  resetDemo: () => request('/api/demo/reset', { method: 'POST', body: {} }),
  exportCsvUrl: (id) => `/api/runs/${encodeURIComponent(id)}/export.csv`,
  exportJsonUrl: (id) => `/api/runs/${encodeURIComponent(id)}/export.json`,
};
