/* NL.api — the only transport the UI uses.
   demo:       requests are dispatched to NL.demoServer (in-browser)
   production: requests go to `${API_BASE_URL}${path}`. Authentication is the
               HttpOnly session cookie set by the server (never readable by
               scripts); mutating requests carry the in-memory CSRF token.
   Responses use the envelope { success, data } / { success: false, error: { code, message, details } };
   callers receive `data`, or an ApiError with status, code, message and details. */
(function(){
  class ApiError extends Error {
    constructor(status, message, details, code){ super(message); this.status = status; this.details = details || {}; this.code = code || (details && details.code) || ''; }
  }
  const listeners = { unauthorized: [] };
  const FRIENDLY = "We couldn't complete your request. Please try again.";
  // Public auth endpoints answer 401/403 as part of their normal flow; those must not trigger a global sign-out.
  const PUBLIC = /^\/auth\/(login|signup|verify-email|resend-verification|forgot|forgot-password|reset-password)/;

  function qs(query){
    if (!query) return '';
    const p = Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
    return p.length ? '?' + p.join('&') : '';
  }

  async function viaDemo(method, path, query, body){
    await new Promise(r => setTimeout(r, NL.config.DEMO_LATENCY_MS * (method === 'GET' ? 1 : 1.5)));
    try {
      return await NL.demoServer.handle({ method, path, query: Object.assign({}, query), body: body ? JSON.parse(JSON.stringify(body)) : {}, token: NL.context.AUTH_TOKEN, csrf: NL.context.CSRF_TOKEN });
    } catch (e){
      if (e instanceof NL.demoServer.HttpError) throw new ApiError(e.status, e.message, e.details, e.code);
      console.error('[demo api]', e);
      throw new ApiError(500, FRIENDLY);
    }
  }

  async function viaHttp(method, path, query, body){
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), NL.config.API_TIMEOUT_MS);
    try {
      const headers = { 'Accept': 'application/json' };
      if (body) headers['Content-Type'] = 'application/json';
      if (NL.context.CSRF_TOKEN && method !== 'GET') headers['X-CSRF-Token'] = NL.context.CSRF_TOKEN;
      const res = await fetch(NL.config.API_BASE_URL + path + qs(query), { method, headers, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin', cache: 'no-store', signal: ctl.signal });
      const data = res.status === 204 ? null : await res.json().catch(() => null);
      if (!res.ok || (data && data.success === false)){
        const err = (data && data.error) || {};
        throw new ApiError(res.status, err.message || (res.status >= 500 ? FRIENDLY : 'Request failed.'), err.details, err.code);
      }
      return data && typeof data === 'object' && 'success' in data ? data.data : data;
    } catch (e){
      if (e instanceof ApiError) throw e;
      throw new ApiError(0, e.name === 'AbortError' ? 'The server took too long to respond. Please try again.' : FRIENDLY, {}, 'NETWORK_ERROR');
    } finally { clearTimeout(timer); }
  }

  async function request(method, path, opts){
    opts = opts || {};
    const fn = NL.config.APP_MODE === 'production' ? viaHttp : viaDemo;
    try {
      return await fn(method, path, opts.query, opts.body);
    } catch (e){
      if (e.status === 401 && !PUBLIC.test(path)) listeners.unauthorized.forEach(f => f(e));
      if (e.status === 403 && e.code === 'AUTH_PASSWORD_CHANGE_REQUIRED') listeners.unauthorized.forEach(f => f(e));
      throw e;
    }
  }

  NL.api = {
    ApiError,
    get: (path, query) => request('GET', path, { query }),
    post: (path, body) => request('POST', path, { body }),
    patch: (path, body) => request('PATCH', path, { body }),
    del: (path) => request('DELETE', path, {}),
    onUnauthorized: (fn) => listeners.unauthorized.push(fn)
  };
})();
