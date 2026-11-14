/* ============================================================
   App shell: login, permission-aware navigation, hash router, header
   (global search, notifications, presence, user menu), session timeout
   and follow-up reminders. Boots last, after all modules are loaded.
   ============================================================ */
(function(){
  const { html, raw, toHtml, $, $$, escape } = NL.util;
  const S = NL.services, st = NL.store, ui = NL.ui;
  NL.pages = NL.pages || {};

  const NAV = [
    { items: [ { r: 'dashboard', i: '📊', l: 'Dashboard', p: 'dashboard.view' }, { r: 'workspace', i: '🧭', l: 'My Workspace', p: 'leads.view', when: () => st.scope() !== 'all' } ] },
    { s: 'Admissions', items: [ { r: 'leads', i: '🎯', l: 'Leads', p: 'leads.view' },{ r: 'applications', i: '📝', l: 'Applications', p: 'applications.view' },
      { r: 'courses', i: '📚', l: 'Courses', p: 'courses.view' }, { r: 'universities', i: '🏫', l: 'Universities', p: 'universities.view' }, { r: 'campuses', i: '🏢', l: 'Campuses', p: 'campuses.view' },
      { r: 'documents', i: '📄', l: 'Documents', p: 'documents.view' } ] },
    { s: 'Counselling', items: [ { r: 'calls', i: '📞', l: 'Call Activity', p: 'calls.view' }, { r: 'followups', i: '📅', l: 'Follow-ups', p: 'followups.view', badge: 'followups' }, { r: 'notes', i: '🗒️', l: 'Counselling Notes', p: 'notes.view' } ] },
    { s: 'Operations', items: [ { r: 'teams', i: '👥', l: 'Teams', p: 'teams.view' }, { r: 'users', i: '👤', l: 'Users', p: 'users.view' }, { r: 'campaigns', i: '📢', l: 'Campaigns', p: 'campaigns.view' }, { r: 'import', i: '📥', l: 'Lead Import', p: 'leads.import' } ] },
    { s: 'Reports', items: [ { r: 'reports/counsellors', i: '📊', l: 'Counsellor Performance', p: 'reports.view' },
      { r: 'reports/campaigns', i: '📣', l: 'Campaign Reports', p: 'reports.view', also: 'campaigns.view' }, { r: 'reports/outcomes', i: '📋', l: 'Follow-up Outcomes', p: 'reports.view', also: 'followups.view' } ] },
    { s: 'Administration', items: [ { r: 'settings', i: '⚙️', l: 'Settings', p: 'settings.view' }, { r: 'roles', i: '🔐', l: 'Roles & Permissions', p: 'users.assign_role', alt: 'roles.manage' }, { r: 'audit', i: '🧾', l: 'Audit Logs', p: 'audit.view' } ] }
  ];
  const navVisible = (it) => (st.can(it.p) || (it.alt && st.can(it.alt))) && (!it.also || st.can(it.also)) && (!it.when || it.when());
  const allNav = () => NAV.flatMap(g => g.items.map(it => Object.assign({ section: g.s }, it)));

  /* ---------- Routing ---------- */
  function parseHash(){
    const h = location.hash.replace(/^#\/?/, ''); const [path, qs] = h.split('?');
    const query = {}; (qs || '').split('&').filter(Boolean).forEach(kv => { const [k, v] = kv.split('='); query[decodeURIComponent(k)] = decodeURIComponent((v || '').replace(/\+/g, ' ')); });
    return { path: path || '', query };
  }
  function resolve(path){
    const parts = path.split('/').filter(Boolean);
    if (!parts.length || (parts[0] === 'dashboard' && !st.can('dashboard.view'))) return { page: st.can('dashboard.view') ? 'dashboard' : 'profile', params: {} };
    // Admission, revenue and application reports were removed; old links land on Counsellor Performance.
    if (parts[0] === 'reports') return { page: 'reports', params: { kind: ['counsellors', 'campaigns', 'outcomes'].includes(parts[1]) ? parts[1] : 'counsellors' } };
    if (parts.length === 2 && ['leads', 'students', 'applications'].includes(parts[0])) return { page: parts[0].replace(/s$/, '') + 'Detail', params: { id: parts[1] } };
    if (parts[0] === 'payments') return { page: 'dashboard', params: {} }; // Payments page removed from the app
    return { page: parts[0], params: {} };
  }
  let cleanup = null, currentPath = null;
  function render(){
    if (!st.user()) return;
    const { path, query } = parseHash(); const { page, params } = resolve(path);
    const mod = NL.pages[page]; const view = $('#view');
    closeMobileNav(); ui.closeMenu();
    if (cleanup){ try { cleanup(); } catch (e){ console.error(e); } cleanup = null; }
    const navPath = path.split('?')[0] || 'dashboard';
    $$('.nav-item').forEach(a => a.classList.toggle('active', navPath === a.dataset.route || (navPath.startsWith(a.dataset.route + '/') && !a.dataset.route.includes('/'))));
    $$('.bn-item').forEach(a => a.classList.toggle('active', navPath.split('/')[0] === a.dataset.route));
    const container = document.createElement('div'); container.className = 'page';
    view.innerHTML = ''; view.appendChild(container);
    if (!mod){ container.innerHTML = toHtml(ui.empty({ icon: '🧭', title: 'Page not found', text: 'The link may be outdated.', actions: [{ label: 'Go to Dashboard', action: 'home' }] })); container.querySelector('[data-action=home]').onclick = () => (location.hash = '#/dashboard'); setCrumbs(['Not found']); return; }
    const perm = typeof mod.perm === 'function' ? mod.perm(params) : mod.perm;
    if (perm && ![].concat(perm).some(p => st.can(p))){
      container.innerHTML = toHtml(ui.empty({ icon: '🔒', title: 'Access restricted', text: `Your role (${st.role().name}) does not include access to this module. Ask an administrator if you need it.`, actions: [{ label: 'Go to Dashboard', action: 'home' }] }));
      container.querySelector('[data-action=home]').onclick = () => (location.hash = '#/dashboard'); setCrumbs(['Access restricted']); return;
    }
    setCrumbs(typeof mod.crumbs === 'function' ? mod.crumbs(params) : mod.crumbs || [mod.title]);
    document.title = `${typeof mod.title === 'function' ? mod.title(params) : mod.title} · New Leaf Admission CRM`;
    if (currentPath !== path) window.scrollTo(0, 0); currentPath = path;
    try { cleanup = mod.render(container, params, query) || null; } catch (e){ console.error(e); container.innerHTML = toHtml(ui.errorView(e, 'this page')); }
  }
  function setCrumbs(list){ $('#crumbs').innerHTML = toHtml(html`<a href="#/dashboard">Home</a>${list.map((c, i) => html`<span class="sep">/</span>${Array.isArray(c) ? html`<a href="${c[1]}">${c[0]}</a>` : html`<span class="${i === list.length - 1 ? 'cur' : ''}">${c}</span>`}`)}`); }
  NL.router = { go: (h) => { location.hash = h; }, refresh: () => route(), parseHash };

  /* ---------- Shell ---------- */
  function shellHtml(){
    const u = st.user(); const role = st.role();
    return html`<div class="app-shell">
      <nav class="sidebar" id="sidebar" aria-label="Main navigation">
        <div class="sidebar-brand"><div class="brand-mark">NL</div><div><div class="sidebar-brand-name">New Leaf</div><div class="sidebar-brand-sub">University Admission CRM</div></div></div>
        <div class="nav">${NAV.map(g => { const items = g.items.filter(navVisible); return items.length ? html`${g.s ? html`<div class="nav-section">${g.s}</div>` : ''}${items.map(it => html`<a class="nav-item" href="#/${it.r}" data-route="${it.r}"><span class="nav-ico">${it.i}</span><span class="nav-label">${it.l}</span>${it.badge ? html`<span class="nav-badge" id="navBadge-${it.badge}" hidden></span>` : ''}</a>`)}` : ''; })}</div>
        <div class="sidebar-foot"><div class="small">${NL.config.BRAND}</div><div class="tiny">${NL.config.APP_MODE === 'demo' ? 'Demo mode · data stays in this browser' : NL.config.ENVIRONMENT === 'production' ? 'Secure session' : NL.config.ENVIRONMENT + ' environment'}</div></div>
      </nav>
      <div class="nav-scrim" id="navScrim"></div>
      <div class="main-col">
        <header class="topbar">
          <button class="icon-btn hamburger" id="navToggle" aria-label="Open menu">☰</button>
          <nav class="crumbs" id="crumbs" aria-label="Breadcrumb"></nav>
          <div class="gsearch" id="gsearch"><span class="fb-ico">🔍</span><input type="search" id="gsearchInput" placeholder="Search students, mobile, IDs, courses…  ( / )" autocomplete="off" aria-label="Global search"><div class="gsearch-pop" id="gsearchPop" hidden></div></div>
          <div class="top-right">
            <button class="icon-btn bell" id="bellBtn" aria-label="Notifications">🔔<span class="bell-count" id="bellCount" hidden></span></button>
            <div class="header-status" title="Your status">
              <span class="hs-dot" id="hsDot"></span>
              <select id="hsSelect" aria-label="Your status">${['Available', 'On Call', 'On Break', 'Offline'].map(p => html`<option ${u.presence === p ? raw('selected') : ''}>${p}</option>`)}</select>
            </div>
            <button class="user-chip" id="userChip" aria-label="User menu">${ui.avatar(u.fullName)}<span class="uc-text"><b>${u.fullName}</b><small>${role.name}${u.department ? ' · ' + u.department : ''}</small></span><span class="caret">▾</span></button>
          </div>
        </header>
        ${NL.config.APP_MODE === 'demo' ? html`<div class="demo-banner">Demo mode — sample data stored in this browser only. Run the server (<code>npm start</code>) for real accounts and authentication.</div>` : NL.config.DEMO_ACCOUNTS_ENABLED ? html`<div class="demo-banner">Development server with demo accounts enabled — never use this configuration in production.</div>` : ''}
        <main id="view" class="view-host" tabindex="-1"></main>
      </div>
      <nav class="bottom-nav" aria-label="Quick navigation">
        ${[['dashboard', '📊', 'Home', 'dashboard.view'], ['leads', '🎯', 'Leads', 'leads.view'], ['followups', '📅', 'Follow-ups', 'followups.view'], ['applications', '📝', 'Apps', 'applications.view']].filter(x => st.can(x[3])).map(([r, i, l]) => html`<a class="bn-item" href="#/${r}" data-route="${r}"><span>${i}</span><small>${l}</small></a>`)}
        <button class="bn-item" id="bnMenu"><span>☰</span><small>Menu</small></button>
      </nav>
    </div>`;
  }
  function syncPresence(p){ const sel = $('#hsSelect'); if (sel && sel.value !== p) sel.value = p; const d = $('#hsDot'); if (!d) return; d.className = 'hs-dot ' + (p === 'Available' ? 'on' : p === 'On Call' ? 'call' : p === 'On Break' ? 'break' : 'off'); }
  function openMobileNav(){ $('#sidebar').classList.add('open'); $('#navScrim').classList.add('open'); }
  function closeMobileNav(){ const sb = $('#sidebar'); if (sb){ sb.classList.remove('open'); $('#navScrim').classList.remove('open'); } }

  function mountShell(){
    document.body.innerHTML = toHtml(shellHtml());
    applyScene(st.getPref('scene', 'clean'));
    syncPresence(st.user().presence);
    $('#navToggle').onclick = openMobileNav; $('#bnMenu').onclick = openMobileNav; $('#navScrim').onclick = closeMobileNav;
    $('#hsSelect').onchange = async (e) => { try { const u = await S.authService.setPresence(e.target.value); NL.context.CURRENT_USER.presence = u.presence; syncPresence(u.presence); ui.toast('Status: ' + u.presence); st.emit('data-changed', 'presence'); } catch (err){ ui.toast(err.message, 'error'); } };
    $('#userChip').onclick = (e) => { e.stopPropagation(); ui.menu($('#userChip'), [
      { header: `${st.user().fullName} · ${st.user().username}` },
      { label: 'My profile', icon: '👤', onClick: () => (location.hash = '#/profile') },
      { label: 'Change password', icon: '🔑', onClick: changePassword },
      { label: 'Security & sessions', icon: '🛡️', onClick: () => (location.hash = '#/profile?tab=sessions') },
      { label: 'Background', icon: '🖼️', onClick: chooseBackground },
      '-', { label: 'Log out', icon: '⎋', danger: true, onClick: () => logout() }]); };
    $('#bellBtn').onclick = (e) => { e.stopPropagation(); openNotifications(); };
    setupSearch();
    shellMounted = true;
    render();
    if (NL.assistant) NL.assistant.mount();
    pollNotifications(); clearInterval(mountShell.poll); mountShell.poll = setInterval(pollNotifications, 30000);
  }

  /* ---------- Global search (debounced, categorised) ---------- */
  function setupSearch(){
    const inp = $('#gsearchInput'), pop = $('#gsearchPop'); let seq = 0; let first = null;
    const run = NL.util.debounce(async () => {
      const q = inp.value.trim(); if (q.length < 2){ pop.hidden = true; return; }
      const my = ++seq; pop.hidden = false; pop.innerHTML = toHtml(html`<div class="gs-loading"><span class="spinner"></span> Searching…</div>`);
      try {
        const res = await S.searchService.search(q); if (my !== seq) return;
        first = res.groups[0] && res.groups[0].items[0];
        pop.innerHTML = toHtml(res.groups.length ? res.groups.map(g => html`<div class="gs-group"><div class="gs-head">${g.label}</div>${g.items.map(it => html`<a class="gs-item" href="${it.link}"><b>${it.title}</b><small>${it.sub}</small></a>`)}</div>`) : html`<div class="gs-empty">No matches for “${q}”</div>`);
      } catch (e){ if (my === seq) pop.innerHTML = toHtml(html`<div class="gs-empty">Search failed — ${e.message}</div>`); }
    }, 250);
    inp.addEventListener('input', run);
    inp.addEventListener('focus', () => { if (inp.value.trim().length >= 2) pop.hidden = false; });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && first){ location.hash = first.link; pop.hidden = true; inp.blur(); } if (e.key === 'Escape'){ pop.hidden = true; inp.blur(); } });
    pop.addEventListener('click', (e) => { if (e.target.closest('a')){ pop.hidden = true; inp.value = ''; } });
    document.addEventListener('click', (e) => { if (!e.target.closest('#gsearch')) pop.hidden = true; });
    document.addEventListener('keydown', (e) => { if (e.key === '/' && !e.target.closest('input,textarea,select') && !ui.stackSize()){ e.preventDefault(); inp.focus(); } });
  }

  /* ---------- Notifications + follow-up reminders ---------- */
  let lastNotif = { items: [], unread: 0 }; const reminderQueue = []; let reminderOpen = false;
  async function pollNotifications(){
    if (!st.user()) return;
    try {
      const res = await S.notificationService.list({ limit: 30 }); lastNotif = res;
      const c = $('#bellCount'); if (c){ c.hidden = !res.unread; c.textContent = res.unread > 99 ? '99+' : res.unread; }
      if (st.settings().notifications.reminderPopup !== false) (res.due || []).forEach(f => reminderQueue.push(f));
      showNextReminder();
      if (st.can('followups.view')){
        const fu = await S.followupService.list({ status: 'Pending', bucket: 'overdue', pageSize: 1 });
        const b = $('#navBadge-followups'); if (b){ b.hidden = !fu.total; b.textContent = fu.total; b.title = `${fu.total} overdue follow-ups`; }
      }
    } catch (e){ /* polling errors are silent; the next poll retries */ }
  }
  NL.app = { pollNotifications };
  function showNextReminder(){
    if (reminderOpen || !reminderQueue.length) return;
    const f = reminderQueue.shift(); reminderOpen = true;
    const m = ui.modal({ title: '⏰ Follow-up due', size: 'sm',
      body: html`<div class="reminder"><div class="rem-name">${f.leadName}</div><div class="mono muted">${f.leadMobile}</div><div class="muted small">${f.reason} · due ${NL.fmt.dateTime(f.dueAt)} · ${ui.badge(f.leadStage)}</div>${f.notes ? html`<p>${f.notes}</p>` : ''}</div>`,
      footer: html`<button class="btn-ghost btn-sm" data-r="snooze">Snooze 15 min</button><button class="btn-ghost btn-sm" data-r="done">Mark complete</button><span class="spacer"></span><button class="btn-primary" data-r="open">Open Lead</button>`,
      onClose: () => { reminderOpen = false; setTimeout(showNextReminder, 400); } });
    m.el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-r]'); if (!b) return;
      if (b.dataset.r === 'snooze'){ m.close(); await NL.actions.snoozeFollowup(f, 15); }
      if (b.dataset.r === 'done'){ m.close(); await NL.actions.completeFollowup(Object.assign({}, f)); }
      if (b.dataset.r === 'open'){ m.close(); location.hash = '#/leads/' + f.leadId; }
    });
  }
  const NOTIF_ICON = { lead_assigned: '🎯', lead_reassigned: '🔁', followup_due: '⏰', followup_overdue: '⚠️', application_submitted: '📝', document_rejected: '📄', payment_received: '💰', admission_confirmed: '🎓', task_assigned: '📌' };
  function openNotifications(){
    const btn = $('#bellBtn'); const r = btn.getBoundingClientRect();
    ui.closeMenu();
    const pop = NL.util.el('div', { class: 'menu-pop notif-pop' });
    pop.innerHTML = toHtml(html`<div class="np-head"><b>Notifications</b><span class="spacer"></span><button class="link-btn" data-n="all">Mark all read</button></div>
      <div class="np-list">${lastNotif.items.length ? lastNotif.items.slice(0, 12).map(n => html`<a class="np-item ${n.read ? '' : 'unread'}" href="${n.link || '#/notifications'}" data-id="${n.id}"><span class="np-ico">${NOTIF_ICON[n.type] || '🔔'}</span><span><b>${n.title}</b><small>${n.body}</small><em>${NL.fmt.relative(n.at)}</em></span></a>`) : html`<div class="gs-empty">You're all caught up.</div>`}</div>
      <a class="np-foot" href="#/notifications">View all notifications →</a>`);
    document.body.appendChild(pop);
    pop.style.top = r.bottom + 6 + 'px'; pop.style.left = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, r.right - pop.offsetWidth)) + 'px';
    const close = () => { pop.remove(); document.removeEventListener('click', outside, true); };
    const outside = (e) => { if (!pop.contains(e.target)) close(); };
    setTimeout(() => document.addEventListener('click', outside, true), 0);
    pop.addEventListener('click', async (e) => {
      const all = e.target.closest('[data-n=all]'); const item = e.target.closest('.np-item');
      if (all){ e.preventDefault(); await S.notificationService.markRead(); close(); pollNotifications(); }
      if (item){ S.notificationService.markRead([item.dataset.id]).then(pollNotifications); close(); }
    });
  }

  /* ---------- Background scenes (retained LeafPulse personalisation) ---------- */
  const SCENES = {
    clean: { label: 'Clean', css: 'none' },
    sage: { label: 'Sage', css: 'linear-gradient(180deg,#e6ede3 0%,#d3dfcf 100%)' },
    ocean: { label: 'Ocean', css: 'linear-gradient(180deg,#e6f1f8 0%,#d2e4f1 100%)' },
    twilight: { label: 'Twilight', css: 'linear-gradient(180deg,#e9e7f4 0%,#dcd8ee 100%)' },
    sand: { label: 'Sand', css: 'linear-gradient(180deg,#f6efe4 0%,#efe3d0 100%)' },
    slate: { label: 'Slate', css: 'linear-gradient(180deg,#e8ebef 0%,#d9dee5 100%)' }
  };
  function applyScene(k){ const s = SCENES[k] || SCENES.clean; document.body.style.backgroundImage = s.css === 'none' ? '' : s.css; document.body.style.backgroundAttachment = 'fixed'; }
  function chooseBackground(){
    const m = ui.modal({ title: 'Background (just for you)', size: 'sm', body: html`<div class="scene-grid">${Object.entries(SCENES).map(([k, s]) => html`<button class="scene-thumb ${st.getPref('scene', 'clean') === k ? 'active' : ''}" data-k="${k}" style="background:${s.css === 'none' ? 'var(--bg)' : raw(s.css)}"><span>${s.label}</span></button>`)}</div>` });
    m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (!b) return; st.setPref('scene', b.dataset.k); applyScene(b.dataset.k); m.close(); });
  }

  /* ---------- Route guards ----------
     Public auth pages render without the shell. Everything else requires a
     signed-in user (→ #/login?returnUrl=… otherwise), and a user who must
     replace a temporary password can only reach #/change-password.
     These guards only decide what to show; the server authorises every request. */
  const AV = NL.authValidation;
  const PUBLIC = new Set(NL.authPages.ROUTES);
  let shellMounted = false;
  function currentTarget(){ return '/' + location.hash.replace(/^#\/?/, ''); }
  function navigate(hash){ if (location.hash === hash) route(); else location.hash = hash; }
  function route(){
    const { path, query } = parseHash(); const first = path.split('/')[0];
    if (PUBLIC.has(first)){
      if (NL.auth.isAuthenticated && !NL.authPages.ALLOWED_WHEN_SIGNED_IN.includes(first)){ location.replace('#' + (AV.safeReturnUrl(query.returnUrl || '') || '/dashboard')); return; }
      unmountShell(); NL.authPages.render(first, query); return;
    }
    if (!NL.auth.isAuthenticated){
      const back = path ? AV.safeReturnUrl(currentTarget()) : null;
      location.replace('#/login' + (back && back !== '/dashboard' ? '?returnUrl=' + encodeURIComponent(back) : ''));
      return;
    }
    if (NL.auth.mustChangePassword && first !== 'change-password'){ location.replace('#/change-password'); return; }
    if (!shellMounted) mountShell(); else render();
  }
  function unmountShell(){
    if (!shellMounted) return;
    shellMounted = false; clearInterval(mountShell.poll);
    if (cleanup){ try { cleanup(); } catch (e){} cleanup = null; }
    ui.closeMenu(); currentPath = null;
  }
  window.addEventListener('hashchange', route);

  async function logout(reason){
    await NL.auth.logout({ skipServer: !!reason });
    unmountShell();
    NL.authPages.setLoginMessage(reason || 'You have been signed out securely.', reason ? 'warn' : 'ok');
    navigate('#/login');
  }
  /* The in-app Change Password page replaced the old modal; kept for callers. */
  function changePassword(){ navigate('#/change-password'); }

  /* ---------- Session keep-alive + idle timeout (the server enforces both too) ---------- */
  let lastActivity = Date.now(), warned = false, lastRefresh = Date.now();
  ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(ev => document.addEventListener(ev, () => { lastActivity = Date.now(); warned = false; }, { passive: true }));
  setInterval(() => {
    if (!NL.auth.isAuthenticated) return;
    const s = NL.auth.session || {};
    const minutes = s.idleTimeoutMinutes || (st.settings().security || {}).sessionTimeoutMinutes || 30;
    const limit = minutes * 60000; const idle = Date.now() - lastActivity;
    if (idle > limit) logout(`You were signed out after ${minutes >= 120 ? Math.round(minutes / 60) + ' hours' : minutes + ' minutes'} of inactivity.`);
    else if (idle > limit - 60000 && !warned){ warned = true; ui.toast('You will be signed out in 1 minute due to inactivity', 'warn'); }
    else if (idle < 60000 && Date.now() - lastRefresh > 5 * 60000){ lastRefresh = Date.now(); NL.auth.refreshSession().catch(() => {}); }
  }, 15000);

  NL.api.onUnauthorized((err) => {
    if (!NL.auth.isAuthenticated) return;
    if (err.code === 'AUTH_PASSWORD_CHANGE_REQUIRED'){ NL.context.CURRENT_USER.mustChangePassword = true; navigate('#/change-password'); return; }
    logout(err.code === 'AUTH_SESSION_EXPIRED' ? 'Your session has expired. Please sign in again.' : 'Your session has ended. Please sign in again.');
  });
  st.on('data-changed', () => { st.invalidateMasters(); setTimeout(pollNotifications, 300); });

  /* Called after a successful sign-in: loads master data; the router mounts the shell. */
  async function start(){
    try { await st.loadMasters(true); }
    catch (e){ if (e.status !== 403) throw e; }
    shellMounted = false;
  }
  NL.app = Object.assign(NL.app || {}, { start, navigate, route });
  NL.shell = { changePassword, logout, syncPresence };

  /* ---------- Boot ---------- */
  (async function boot(){
    // Clean URLs from emails/bookmarks (/reset-password?token=…) → hash routes, served by the Node server.
    if (NL.config.APP_MODE === 'production'){
      const m = location.pathname.match(/^\/([a-z-]+)\/?$/);
      if (m && m[1] !== 'index.html'){ try { history.replaceState(null, '', '/#/' + m[1] + location.search); } catch (e){} }
    }
    document.body.innerHTML = toHtml(html`<div class="boot" role="status"><div class="brand-mark lg">NL</div><div class="loading-text"><span class="spinner"></span>Loading New Leaf Admission CRM…</div></div>`);
    if (await NL.auth.init()){ try { await start(); } catch (e){ await NL.auth.logout({ skipServer: true }); NL.authPages.setLoginMessage("We couldn't load your workspace. Please sign in again.", 'warn'); } }
    route();
  })();
})();
