/* Application state: session context, cached master data, UI preferences and
   a tiny pub/sub bus. API mode keeps no credentials in browser storage at all —
   the session is an HttpOnly cookie and the CSRF token lives in memory. The
   in-browser demo (no server that could set a cookie) keeps its opaque demo
   token in sessionStorage, or localStorage with "Remember me". */
(function(){
  const bus = {};
  const TOKEN_KEY = NL.config.STORAGE_PREFIX + 'session';
  const DEMO = NL.config.APP_MODE === 'demo';
  let masters = null, mastersAt = 0;
  const MASTER_TTL = 5 * 60000;
  const FALLBACK_SETTINGS = { security: { sessionTimeoutMinutes: 30, passwordMinLength: 12 }, notifications: {}, general: { currency: 'INR' }, leadStages: [], negativeStages: [] };

  function on(evt, fn){ (bus[evt] = bus[evt] || []).push(fn); return () => { bus[evt] = bus[evt].filter(f => f !== fn); }; }
  function emit(evt, data){ (bus[evt] || []).slice().forEach(f => { try { f(data); } catch (e){ console.error(e); } }); }

  function safeGet(storage, k){ try { return storage.getItem(k); } catch (e){ return null; } }
  function safeSet(storage, k, v){ try { storage.setItem(k, v); } catch (e){ /* storage unavailable — session lasts for this tab only */ } }
  function safeDel(storage, k){ try { storage.removeItem(k); } catch (e){} }

  function setSession(p, remember){
    const c = NL.context;
    c.AUTH_TOKEN = DEMO ? p.token || c.AUTH_TOKEN : null;
    c.CSRF_TOKEN = p.csrf || c.CSRF_TOKEN; c.CURRENT_USER = p.user; c.CURRENT_ROLE = p.role; c.PERMISSIONS = p.permissions || []; c.SESSION = p.session || null;
    store.settingsCache = p.settings || store.settingsCache;
    if (DEMO && remember !== undefined){
      const val = JSON.stringify({ token: p.token, csrf: p.csrf });
      safeDel(localStorage, TOKEN_KEY); safeDel(sessionStorage, TOKEN_KEY);
      safeSet(remember ? localStorage : sessionStorage, TOKEN_KEY, val);
    }
    emit('session', p);
  }
  /* Demo: restores the demo token. API mode: the cookie is sent automatically, so
     there is nothing to restore — the caller simply asks /auth/me. */
  function restoreToken(){
    if (!DEMO) return true;
    const raw = safeGet(sessionStorage, TOKEN_KEY) || safeGet(localStorage, TOKEN_KEY);
    if (!raw) return false;
    try { const t = JSON.parse(raw); NL.context.AUTH_TOKEN = t.token; NL.context.CSRF_TOKEN = t.csrf; return true; } catch (e){ return false; }
  }
  function clearSession(){
    Object.assign(NL.context, { AUTH_TOKEN: null, CSRF_TOKEN: null, CURRENT_USER: null, CURRENT_ROLE: null, PERMISSIONS: [], SESSION: null });
    safeDel(localStorage, TOKEN_KEY); safeDel(sessionStorage, TOKEN_KEY);
    masters = null; emit('session', null);
  }

  async function loadMasters(force){
    if (masters && !force && Date.now() - mastersAt < MASTER_TTL) return masters;
    const m = await NL.services.bootstrapService.load();
    const idx = (list) => { const x = new Map(); list.forEach(r => x.set(r.id, r)); return x; };
    masters = Object.assign(m, { _u: idx(m.universities), _c: idx(m.courses), _cp: idx(m.campuses), _users: idx(m.users), _t: idx(m.teams), _cpn: idx(m.campaigns) });
    mastersAt = Date.now(); store.settingsCache = m.settings;
    emit('masters', masters);
    return masters;
  }
  const M = () => masters || { universities: [], courses: [], campuses: [], users: [], teams: [], campaigns: [], roles: [], _u: new Map(), _c: new Map(), _cp: new Map(), _users: new Map(), _t: new Map(), _cpn: new Map() };

  function prefKey(k){ const u = NL.context.CURRENT_USER; return NL.config.STORAGE_PREFIX + 'pref:' + (u ? u.id : 'anon') + ':' + k; }
  function getPref(k, def){ const v = safeGet(localStorage, prefKey(k)); if (v == null) return def; try { return JSON.parse(v); } catch (e){ return def; } }
  function setPref(k, v){ safeSet(localStorage, prefKey(k), JSON.stringify(v)); }

  const opt = (list, labelFn) => list.map(r => ({ value: r.id, label: labelFn ? labelFn(r) : r.name }));

  const store = {
    on, emit, setSession, restoreToken, clearSession, loadMasters, getPref, setPref, settingsCache: null,
    user: () => NL.context.CURRENT_USER, role: () => NL.context.CURRENT_ROLE, session: () => NL.context.SESSION,
    can: (p) => (NL.context.PERMISSIONS || []).includes(p),
    canAny: (...ps) => ps.some(p => (NL.context.PERMISSIONS || []).includes(p)),
    scope: () => (NL.context.CURRENT_ROLE || {}).scope || 'own',
    settings: () => store.settingsCache || (NL.seed && NL.seed.DEFAULT_SETTINGS) || FALLBACK_SETTINGS,
    currency: () => ((store.settingsCache || {}).general || {}).currency || 'INR',
    masters: M,
    invalidateMasters(){ mastersAt = 0; },
    uni: (id) => M()._u.get(id), course: (id) => M()._c.get(id), campus: (id) => M()._cp.get(id), userById: (id) => M()._users.get(id), team: (id) => M()._t.get(id), campaign: (id) => M()._cpn.get(id),
    userName: (id) => { const u = id && M()._users.get(id); return u ? u.fullName : ''; },
    options: {
      universities: (all) => opt(M().universities.filter(u => all || u.status === 'Active')),
      campuses: (uniId, all) => opt(M().campuses.filter(c => (!uniId || c.universityId === uniId) && (all || c.status === 'Active')), c => uniId ? c.name : `${c.name} — ${(M()._u.get(c.universityId) || {}).code || ''}`),
      courses: (uniId, campusId, all) => opt(M().courses.filter(c => (!uniId || c.universityId === uniId) && (!campusId || c.campusId === campusId) && (all || c.status === 'Active')),
        c => `${c.name} — ${(M()._u.get(c.universityId) || {}).code || ''} ${((M()._cp.get(c.campusId) || {}).name || '')} (${c.mode})`),
      courseNames: () => Array.from(new Set(M().courses.map(c => c.name))).sort().map(n => ({ value: n, label: n })),
      counsellors: (teamId) => opt(M().users.filter(u => u.status === 'Active' && NL.rbac.WORKING_ROLES.includes(u.role) && (!teamId || u.teamId === teamId)), u => `${u.fullName} · ${NL.rbac.roleName(u.role)}`),
      assignable: () => {
        const me = NL.context.CURRENT_USER; const sc = store.scope();
        return opt(M().users.filter(u => u.status === 'Active' && NL.rbac.WORKING_ROLES.includes(u.role) && (sc === 'all' || (sc === 'team' && u.teamId === me.teamId) || u.id === me.id)), u => `${u.fullName} · ${NL.rbac.roleName(u.role)}`);
      },
      users: () => opt(M().users, u => u.fullName),
      teams: () => opt(M().teams),
      campaigns: () => opt(M().campaigns),
      teamLeaders: () => opt(M().users.filter(u => u.role === 'team_leader' && u.status === 'Active'), u => u.fullName),
      list: (arr) => (arr || []).map(v => ({ value: v, label: v }))
    }
  };
  NL.store = store;
})();
