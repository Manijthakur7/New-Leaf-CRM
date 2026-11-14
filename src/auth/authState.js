/* NL.auth — the single source of truth for authentication state in the UI.
     NL.auth.user / isAuthenticated / isLoading / roles / permissions / session
     NL.auth.hasRole('ADMIN' | 'admin', …)  NL.auth.hasPermission('leads.edit')
     NL.auth.init() · login() · refreshUser() · refreshSession() · logout()
     NL.auth.onChange(fn)
   It wraps NL.store (which holds the session context for the rest of the app),
   so no component keeps its own copy of the user. UI checks only decide what
   to show; the server enforces every permission. */
(function(){
  const st = NL.store;
  const svc = () => NL.services.authService;
  let loading = true;
  const listeners = [];
  const notify = () => listeners.slice().forEach(fn => { try { fn(NL.auth); } catch (e){ console.error(e); } });
  st.on('session', notify);

  function apply(payload, remember){ st.setSession(payload, remember); return payload; }

  NL.auth = {
    get user(){ return NL.context.CURRENT_USER; },
    get isAuthenticated(){ return !!NL.context.CURRENT_USER; },
    get isLoading(){ return loading; },
    get role(){ return NL.context.CURRENT_ROLE; },
    get roles(){ const r = NL.context.CURRENT_ROLE; return r ? [r.id, r.code].filter(Boolean) : []; },
    get permissions(){ return (NL.context.PERMISSIONS || []).slice(); },
    get session(){ return NL.context.SESSION; },
    get mustChangePassword(){ const u = NL.context.CURRENT_USER; return !!(u && u.mustChangePassword); },
    hasRole(...ids){ const mine = NL.auth.roles; return ids.some(id => mine.includes(id) || mine.includes(NL.rbac.canonicalRole(id))); },
    hasPermission: (p) => st.can(p),
    hasAnyPermission: (...ps) => st.canAny(...ps),

    /* Restores an existing session (cookie in API mode, demo token in demo mode). */
    async init(){
      loading = true;
      try {
        if (!st.restoreToken()) return false;
        apply(await svc().me());
        return true;
      } catch (e){ st.clearSession(); return false; }
      finally { loading = false; notify(); }
    },
    async login(identifier, password, remember, captchaToken){
      return apply(await svc().login(identifier, password, remember, captchaToken), !!remember);
    },
    async refreshUser(){ return apply(await svc().me()); },
    /* Keeps the server session alive while the user is active and lets the server rotate the session token. */
    async refreshSession(){ return apply(await svc().refresh()); },
    setSession: apply,
    /* Ends the session on the server (unless it already ended) and clears local state. */
    async logout(opts){
      opts = opts || {};
      if (!opts.skipServer && NL.auth.isAuthenticated){ try { await svc().logout(); } catch (e){ /* session may already be gone */ } }
      st.clearSession();
    },
    onChange(fn){ listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i > -1) listeners.splice(i, 1); }; }
  };
})();
