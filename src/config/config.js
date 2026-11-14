/* ============================================================
   New Leaf University Admission CRM — runtime configuration
   ------------------------------------------------------------
   The Node server (npm start) serves /runtime-config.js, which sets
   window.NL_RUNTIME. When it is present the app runs in API mode:
     APP_MODE = "production" → every service call goes to the real REST API,
                               authenticated with an HttpOnly session cookie.
   When index.html is opened straight from disk there is no runtime config:
     APP_MODE = "demo"       → all API calls are served in-browser by
                               src/api/demoServer.js (localStorage-backed).
   No secrets ever live in frontend code.
   ============================================================ */
window.NL = window.NL || {};
NL.pages = NL.pages || {};   // page modules register themselves here; the router in app.js resolves them

(function(){
  const rt = window.NL_RUNTIME || null;
  const api = !!(rt && rt.mode === 'api');
  NL.config = Object.freeze({
    APP_MODE: api ? 'production' : 'demo',  // 'demo' | 'production' (API mode)
    ENVIRONMENT: api ? rt.environment : 'demo',
    API_BASE_URL: api ? rt.apiBaseUrl || '/api' : '/api',
    API_TIMEOUT_MS: 20000,
    DEMO_LATENCY_MS: 140,                   // simulated network latency so loading states are visible
    /* Demo account shortcuts are shown only in the in-browser demo, or when the
       server runs with DEMO_MODE=true (development). Never in production. */
    DEMO_ACCOUNTS_ENABLED: api ? !!rt.demoEnabled : true,
    SIGNUP_ENABLED: api ? rt.signupEnabled !== false : true,
    ASSISTANT_ENABLED: api ? !!rt.assistantEnabled : false,   // AI assistant: server-side only (needs ANTHROPIC_API_KEY on the server)
    LEGAL: Object.freeze(api && rt.legal ? rt.legal : { termsUrl: '', privacyUrl: '' }),
    CAPTCHA: Object.freeze(api && rt.captcha ? rt.captcha : { provider: 'none', siteKey: '', onSignup: false }),
    PRODUCT_NAME: 'New Leaf University Admission CRM',
    BRAND: 'New Leaf Global',
    SUBTITLE: 'University Admissions & Student Lifecycle Management',
    TAGLINE: 'One Platform. Every Lead. Every Application. Every Admission.',
    STORAGE_PREFIX: 'nlcrm:',               // demo DB + UI prefs namespace
    DEFAULT_PAGE_SIZE: 25,
    UPLOAD: {
      MAX_BYTES: 5 * 1024 * 1024,
      ACCEPT: ['application/pdf', 'image/jpeg', 'image/png'],
      EXTENSIONS: ['pdf', 'jpg', 'jpeg', 'png']
    },
    DEMO: { SEED_VERSION: 7 }
  });
})();

/* Session context — populated by the auth state after sign-in.
   API mode: the session lives in an HttpOnly cookie the page cannot read;
   only the CSRF token is held here, in memory. Demo mode: the demo token is
   kept in sessionStorage/localStorage because there is no server to set a cookie. */
NL.context = {
  AUTH_TOKEN: null,
  CSRF_TOKEN: null,
  CURRENT_USER: null,
  CURRENT_ROLE: null,
  PERMISSIONS: [],
  SESSION: null
};
