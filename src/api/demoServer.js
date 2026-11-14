/* ============================================================
   DEMO API SERVER (core)
   Simulates the production backend inside the browser so the UI can be
   exercised end-to-end. It mirrors what the real API must do:
   authenticate every request, enforce RBAC + data scope, validate input,
   write audit logs and emit notifications. The UI never touches demoDb
   directly — it only talks to NL.api, exactly as it would in production.
   ============================================================ */
(function(){
  const db = NL.demoDb;
  const routes = [];
  let ready = false;

  class HttpError extends Error {
    constructor(status, message, details){ super(message); this.name = 'HttpError'; this.status = status; this.details = details; }
  }

  function init(){
    if (ready) return;
    db.load();
    if (db.meta().seedVersion !== NL.config.DEMO.SEED_VERSION || !db.all('users').length){
      db.reset();
      NL.seed.run(db, helpers);
      db.setSeedVersion(NL.config.DEMO.SEED_VERSION);
      db.flush();
    }
    if (NL.seed.upgrade(db)) db.flush();
    ready = true;
  }

  function route(method, pattern, perm, handler, opts){
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:[a-zA-Z]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }) + '$');
    routes.push(Object.assign({ method, re, keys, perm, handler, pattern }, opts || {}));
  }

  /* ---------- helpers ---------- */
  const nowISO = () => new Date().toISOString();
  const settings = () => db.getSettings();
  const usersMap = () => { const m = new Map(); db.all('users').forEach(u => m.set(u.id, u)); return m; };
  const userName = (id) => { const u = id && db.get('users', id); return u ? u.fullName : ''; };
  function publicUser(u){
    if (!u) return null;
    const { passwordHash, salt, failedLogins, resetRequested, ...rest } = u; // never expose credentials
    return Object.assign(rest, { roleName: NL.rbac.roleName(u.role), teamName: u.teamId ? (db.get('teams', u.teamId) || {}).name : '' });
  }
  function roleOf(u){ return db.get('roles', u.role) || db.get('roles', 'unassigned'); }

  function audit(ctx, action, module, recordId, oldValue, newValue){
    const u = ctx && ctx.user;
    db.insert('audit', { userId: u ? u.id : null, userName: u ? u.fullName : 'System', role: u ? u.role : 'system', action, module, recordId: recordId || '-',
      oldValue: oldValue == null ? '' : typeof oldValue === 'string' ? oldValue : JSON.stringify(oldValue),
      newValue: newValue == null ? '' : typeof newValue === 'string' ? newValue : JSON.stringify(newValue),
      ip: '127.0.0.1 (demo)', at: nowISO() });
  }
  function notify(userId, type, title, body, link){
    if (!userId) return;
    const n = settings().notifications || {};
    if (type.startsWith('application') && n.applicationAlerts === false) return;
    if (type.startsWith('payment') && n.paymentAlerts === false) return;
    if (type.startsWith('document') && n.documentAlerts === false) return;
    db.insert('notifications', { userId, type, title, body, link: link || '', read: false, at: nowISO() });
  }
  function activity(leadId, studentId, type, text, userId){ db.insert('activities', { leadId: leadId || null, studentId: studentId || null, type, text, userId: userId || null, at: nowISO() }); }

  function diff(before, patch, fields){
    const oldV = {}, newV = {};
    (fields || Object.keys(patch)).forEach(k => {
      if (!(k in patch)) return;
      const a = before[k] == null ? '' : before[k], b = patch[k] == null ? '' : patch[k];
      if (JSON.stringify(a) !== JSON.stringify(b)){ oldV[k] = a; newV[k] = b; }
    });
    return Object.keys(newV).length ? { oldV, newV } : null;
  }

  function scoreLead(l, s){
    s = s || settings();
    const negative = s.negativeStages.includes(l.stage);
    const idx = s.leadStages.indexOf(l.stage);
    const checks = {
      validMobile: NL.validate.isMobile(l.mobile), validEmail: !!l.email && NL.validate.isEmail(l.email),
      interested: !negative && idx >= s.leadStages.indexOf('Interested'), courseSelected: !!(l.courseId || l.preferredCourse), universitySelected: !!l.universityId,
      followupScheduled: !!l.nextFollowupAt, applicationStarted: !negative && idx >= s.leadStages.indexOf('Application Started')
    };
    let score = 0;
    s.scoring.rules.forEach(r => { if (r.enabled && checks[r.key]) score += Number(r.points) || 0; });
    if (negative) score = Math.round(score * 0.3);
    return Math.max(0, Math.min(100, score));
  }
  function scoreBand(score, s){ const b = (s || settings()).scoring.bands.find(x => score >= x.min && score <= x.max); return b ? b.label : 'Cold'; }

  /* ---------- data scope (row-level security) ---------- */
  function teamMemberIds(teamId){ return new Set(db.all('users').filter(u => u.teamId === teamId).map(u => u.id)); }
  function ownerVisible(ctx, counsellorId, teamId){
    if (ctx.scope === 'all') return true;
    if (counsellorId === ctx.user.id) return true;
    if (ctx.scope === 'team' && ctx.user.teamId){
      if (!ctx._team) ctx._team = teamMemberIds(ctx.user.teamId);
      return ctx._team.has(counsellorId) || (!counsellorId && teamId === ctx.user.teamId);
    }
    return false;
  }
  const leadVisible = (ctx, l) => !!l && ownerVisible(ctx, l.counsellorId, l.teamId);
  function studentVisible(ctx, s){
    if (!s) return false;
    if (ctx.scope === 'all') return true;
    if (ownerVisible(ctx, s.counsellorId)) return true;
    const l = s.leadId && db.get('leads', s.leadId);
    return leadVisible(ctx, l);
  }
  const appVisible = (ctx, a) => !!a && (ownerVisible(ctx, a.counsellorId) || studentVisible(ctx, db.get('students', a.studentId)));
  function visibleStudentIds(ctx){ return ctx.scope === 'all' ? null : new Set(db.all('students').filter(s => studentVisible(ctx, s)).map(s => s.id)); }
  function mustSeeLead(ctx, id){ const l = db.get('leads', id); if (!l) throw new HttpError(404, 'Lead not found'); if (!leadVisible(ctx, l)) throw new HttpError(403, 'You do not have access to this lead'); return l; }
  function mustSeeStudent(ctx, id){ const s = db.get('students', id); if (!s) throw new HttpError(404, 'Student not found'); if (!studentVisible(ctx, s)) throw new HttpError(403, 'You do not have access to this student'); return s; }

  /* ---------- generic list: search, filter, date range, sort, paginate ---------- */
  function list(rows, q, opt){
    opt = opt || {};
    let out = rows;
    if (q.q){
      const s = String(q.q).toLowerCase().trim();
      out = out.filter(r => (opt.search || ['name']).some(f => String(r[f] == null ? '' : r[f]).toLowerCase().includes(s)));
    }
    (opt.filters || []).forEach(k => {
      const v = q[k];
      if (v === undefined || v === '' || v === null) return;
      if (v === '__none') out = out.filter(r => !r[k]);
      else out = out.filter(r => String(r[k]) === String(v));
    });
    const df = q.dateField || opt.dateField || 'createdAt';
    if (q.dateFrom) out = out.filter(r => r[df] && String(r[df]) >= q.dateFrom);
    if (q.dateTo) out = out.filter(r => r[df] && String(r[df]) < q.dateTo);
    const sk = q.sort || opt.sort || 'createdAt';
    const dir = (q.dir || opt.dir || 'desc') === 'asc' ? 1 : -1;
    out = out.slice().sort((a, b) => {
      const av = a[sk], bv = b[sk];
      if (av == null || av === '') return 1; if (bv == null || bv === '') return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir;
    });
    const total = out.length;
    const pageSize = q.pageSize === 'all' ? total || 1 : Math.min(500, Math.max(1, Number(q.pageSize) || NL.config.DEFAULT_PAGE_SIZE));
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(pages, Math.max(1, Number(q.page) || 1));
    return { items: out.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize, pages };
  }

  function requireFields(body, rules, labels){
    const errors = NL.validate.check(body, rules, labels);
    if (Object.keys(errors).length) throw new HttpError(422, 'Please correct the highlighted fields', { errors });
  }
  const pickFields = (body, fields) => { const o = {}; fields.forEach(f => { if (body[f] !== undefined) o[f] = typeof body[f] === 'string' ? body[f].trim() : body[f]; }); return o; };

  /* ---------- sessions ---------- */
  function sessionFor(token){
    if (!token) return null;
    const s = db.get('sessions', token);
    if (!s || s.revoked) return null;
    const timeout = (settings().security.sessionTimeoutMinutes || 30) * 60000;
    if (Date.now() - new Date(s.lastActivityAt).getTime() > timeout){ s.revoked = true; db.update('sessions', s.id, { revoked: true, logoutReason: 'timeout' }); return 'expired'; }
    return s;
  }

  /* ---------- request entry point ---------- */
  function findRoute(method, rawPath){
    const path = rawPath.split('?')[0].replace(/\/+$/, '') || '/';
    const match = routes.map(r => ({ r, m: r.method === method && path.match(r.re) })).find(x => x.m);
    if (!match) throw new HttpError(404, `No API route for ${method} ${path}`);
    const { r, m } = match;
    const params = {}; r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    return { r, params };
  }
  function authorize(ctx, r, u, role){
    Object.assign(ctx, { user: u, role, scope: role.scope, perms: new Set(role.permissions) });
    if (r.perm){
      const need = Array.isArray(r.perm) ? r.perm : [r.perm];
      if (!need.some(p => ctx.perms.has(p))) throw new HttpError(403, 'You do not have permission to perform this action');
    }
  }
  async function execute(ctx, r){
    ctx.can = (p) => ctx.perms && ctx.perms.has(p);
    ctx.need = (p) => { if (!ctx.can(p)) throw new HttpError(403, 'You do not have permission to perform this action'); };
    let result;
    try { result = await r.handler(ctx); } finally { db.flush(); }
    return result === undefined ? { ok: true } : JSON.parse(JSON.stringify(result));
  }

  /* Browser demo: authenticates the demo session token itself. */
  async function handle(req){
    init();
    const { r, params } = findRoute(req.method, req.path);
    const ctx = { params, query: req.query || {}, body: req.body || {}, token: req.token, meta: req.meta || {} };
    if (r.perm !== 'public'){
      const s = sessionFor(req.token);
      if (s === 'expired'){ db.flush(); throw new HttpError(401, 'Your session expired due to inactivity. Please sign in again.', { code: 'AUTH_SESSION_EXPIRED' }); }
      if (!s) throw new HttpError(401, 'Please sign in to continue', { code: 'AUTH_REQUIRED' });
      const u = db.get('users', s.userId);
      if (!u || (u.accountStatus || (u.status === 'Active' ? 'ACTIVE' : 'DISABLED')) !== 'ACTIVE') throw new HttpError(401, 'Your session has ended. Please sign in again.', { code: 'AUTH_REQUIRED' });
      ctx.session = s;
      // Mutating requests must carry the CSRF token issued at login (mirrors the production check)
      if (req.method !== 'GET' && req.csrf !== s.csrf) throw new HttpError(403, 'Security token mismatch — please refresh the page', { code: 'CSRF_INVALID' });
      const now = Date.now();
      if (now - new Date(s.lastActivityAt).getTime() > 30000){ s.lastActivityAt = new Date(now).toISOString(); u.lastActivityAt = s.lastActivityAt; db.update('sessions', s.id, {}); db.update('users', u.id, {}); }
      if (u.mustChangePassword && !r.allowPasswordChange && !(req.method === 'GET' && ['/bootstrap', '/settings'].includes(req.path))) throw new HttpError(403, 'Please change your password to continue.', { code: 'AUTH_PASSWORD_CHANGE_REQUIRED' });
      authorize(ctx, r, u, roleOf(u));
    }
    return execute(ctx, r);
  }

  /* Server engine: the identity was verified by the auth layer (session cookie,
     CSRF, account status); `identity.role` carries the organization's permission matrix. */
  async function dispatch(req, identity){
    const { r, params } = findRoute(req.method, req.path);
    if (r.perm === 'public' || /^\/(auth|users|roles)(\/|$)/.test(req.path) && !r.engineAllowed) throw new HttpError(404, `No API route for ${req.method} ${req.path}`);
    const ctx = { params, query: req.query || {}, body: req.body || {}, meta: {} };
    authorize(ctx, r, identity.user, identity.role);
    return execute(ctx, r);
  }

  const helpers = { scoreLead, scoreBand };

  NL.demoServer = { handle, dispatch, route, init, HttpError,
    h: { db, nowISO, settings, usersMap, userName, publicUser, roleOf, audit, notify, activity, diff, scoreLead, scoreBand, teamMemberIds, ownerVisible,
      leadVisible, studentVisible, appVisible, visibleStudentIds, mustSeeLead, mustSeeStudent, list, requireFields, pickFields, HttpError } };
})();
