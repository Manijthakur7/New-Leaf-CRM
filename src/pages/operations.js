/* Operations — Teams (incl. live floor + team dashboard), Users, Campaigns. */
(function(){
  const { html, raw, toHtml, $, $$ } = NL.util;
  const S = NL.services, st = NL.store, ui = NL.ui, A = NL.actions, C = NL.cols, F = NL.fmt, w = NL.w;
  const DEPARTMENTS = ['Admissions', 'Tele-calling', 'Finance', 'Document Verification', 'Operations', 'Management', 'Marketing', 'IT'];

  /* ================= TEAMS ================= */
  function teams(el, p, query){
    let tab = query.team ? 'dashboard' : query.tab || 'teams'; let cleanup = null;
    const tabs = [{ key: 'teams', label: 'Teams' }, st.can('reports.view') && st.scope() !== 'own' ? { key: 'dashboard', label: 'Team dashboard' } : null, { key: 'floor', label: 'Live floor / agent status' }].filter(Boolean);
    el.innerHTML = toHtml(html`${w.pageHead({ title: 'Teams', sub: 'Counselling teams, team leaders and live agent status', actions: [st.can('teams.manage') && { label: 'Create Team', icon: '＋', primary: true, action: 'add' }] })}${w.tabs(tabs, tab)}<div id="teamTab"></div>`);
    const host = $('#teamTab', el);
    function show(){
      if (cleanup){ cleanup(); cleanup = null; }
      host.innerHTML = '';
      if (tab === 'dashboard') NL.dashboards.renderTeamDashboard(host, query, true);
      else if (tab === 'floor') cleanup = floor(host);
      else cleanup = teamList(host);
    }
    el.addEventListener('click', (e) => {
      const t = e.target.closest('.tabs-bar [data-tab]'); if (t){ tab = t.dataset.tab; $$('.tab-btn', el).forEach(b => b.classList.toggle('active', b === t)); show(); }
      if (e.target.closest('.page-head [data-action=add]')) teamForm();
    });
    show();
    return () => cleanup && cleanup();
  }
  async function teamForm(t){
    await st.loadMasters();
    const res = await ui.formModal({ title: t ? `Edit team · ${t.name}` : 'Create team', cols: 1, size: 'md',
      fields: [{ name: 'name', label: 'Team name', required: true }, { name: 'description', label: 'Description', type: 'textarea' },
        { name: 'teamLeaderId', label: 'Team leader', type: 'select', options: () => st.options.teamLeaders(), help: 'Only users with the Team Leader role are listed. Assign the role from Users first.' },
        { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], placeholder: false, default: 'Active' }],
      values: t || {}, onSubmit: (v) => t ? S.teamService.update(t.id, v) : S.teamService.create(v) });
    if (res){ ui.toast(t ? 'Team updated' : 'Team created'); await st.loadMasters(true); A.changed('teams'); }
  }
  function teamList(host){
    const page = NL.listPage({ el: host, id: 'teams', title: '', module: null, what: 'teams', refreshOn: ['teams', 'users'], exportName: 'teams',
      filters: [{ key: 'status', label: 'Status', options: ['Active', 'Inactive'] }],
      columns: [C.mono('id', 'Team ID'), C.text('name', 'Team', { cls: 'name', always: true }), C.text('teamLeaderName', 'Team Leader'), C.num('memberCount', 'Active Members'), C.text('description', 'Description', { cls: 'remarks' }), C.badge('status', 'Status'), C.date('createdAt', 'Created')],
      fetch: (q) => S.teamService.list(q),
      onRowClick: (t) => { location.hash = '#/teams?team=' + t.id; },
      rowActions: (t) => [{ label: 'Team dashboard', icon: '📊', onClick: () => (location.hash = '#/teams?team=' + t.id) }, st.can('users.view') && { label: 'View members', icon: '👥', onClick: () => (location.hash = '#/users?teamId=' + t.id) },
        st.can('leads.view') && { label: 'View team leads', icon: '🎯', onClick: () => (location.hash = '#/leads?teamId=' + t.id) }, st.can('teams.manage') && { label: 'Edit team', icon: '✏️', onClick: () => teamForm(t) }].filter(Boolean),
      empty: () => ({ icon: '👥', title: 'No teams yet', text: 'Create a team and assign a Team Leader.' })
    });
    const head = host.querySelector('.page-head'); if (head) head.remove();
    return page.cleanup;
  }
  function floor(host){
    const draw = () => ui.load(host, () => S.reportService.dashboard(F.range('today')), (d) => {
      const f = d.floor; const me = st.user().id;
      host.innerHTML = toHtml(html`<div class="wb-titlebar">🟢 Live Floor — All Agents</div>
        <div class="wb-kpi-row"><div class="wb-kpi c-gray"><div class="n">${f.total}</div><div class="l">TOTAL AGENTS</div></div><div class="wb-kpi c-blue"><div class="n">${f.loggedIn}</div><div class="l">LOGGED IN</div></div>
          <div class="wb-kpi c-green"><div class="n">${f.available}</div><div class="l">AVAILABLE</div></div><div class="wb-kpi c-teal"><div class="n">${f.onCall}</div><div class="l">ON CALL</div></div><div class="wb-kpi c-amber"><div class="n">${f.onBreak}</div><div class="l">ON BREAK</div></div><div class="wb-kpi c-dark"><div class="n">${f.offline}</div><div class="l">OFFLINE</div></div></div>
        <div class="agent-grid">${f.people.map(a => html`<div class="agent-card ${a.id === me ? 'me' : ''}"><div class="ac-top">${ui.avatar(a.name)}<div><div class="name">${a.name}${a.id === me ? html` <span class="muted tiny">(you)</span>` : ''}</div><div class="muted tiny">${NL.rbac.roleName(a.role)}</div></div></div>
          <div class="status-line">${w.presenceDot(a.presence)}${a.presence} <span class="status-since">· ${a.presence === 'Offline' ? '' : F.relative(a.since).replace(' ago', '')}</span></div>
          <div class="muted tiny">${a.loginAt ? 'Logged in ' + F.time(a.loginAt) : 'Not logged in today'}</div>
          ${a.id === me ? html`<div class="status-btns">${['Available', 'On Call', 'On Break', 'Offline'].map(s => html`<button class="${s === a.presence ? 'active' : ''}" data-presence="${s}">${s}</button>`)}</div>` : ''}</div>`)}</div>
        <div class="wb-note">Agents set their own status from the header. Status history and login sessions feed Counsellor Performance reports.</div>`);
    }, { cards: 6, what: 'agent status' });
    host.addEventListener('click', async (e) => { const b = e.target.closest('[data-presence]'); if (!b) return; try { await S.authService.setPresence(b.dataset.presence); NL.context.CURRENT_USER.presence = b.dataset.presence; NL.shell.syncPresence(b.dataset.presence); A.changed('presence'); draw(); } catch (err){ A.fail(err); } });
    draw(); const t = setInterval(() => { if (host.isConnected) draw(); }, 60000);
    return () => clearInterval(t);
  }

  /* ================= USERS (create/invite → assign role → manage lifecycle) =================
     Visibility of actions follows the caller's permissions; the server enforces
     every rule again (hierarchy, escalation, allowed status transitions, tenant). */
  const RB = NL.rbac;
  const STATUS_CLS = { ACTIVE: 'green', PENDING_VERIFICATION: 'amber', SUSPENDED: 'red', DISABLED: 'gray', LOCKED: 'red' };
  const statusBadge = (s) => ui.badge(RB.STATUS_LABEL[s] || s, STATUS_CLS[s] || 'gray');
  /* Easy to read out or type, e.g. "Cedar-4827-Lotus" (16 chars, passes the password policy). */
  function easyPassword(){
    const W = ['Cedar', 'Maple', 'River', 'Lotus', 'Amber', 'Coral', 'Tiger', 'Falcon', 'Orchid', 'Summit', 'Harbor', 'Meadow', 'Saffron', 'Monsoon', 'Banyan', 'Jasmine'];
    const a = new Uint32Array(3); crypto.getRandomValues(a);
    return `${W[a[0] % W.length]}-${String(1000 + a[1] % 9000)}-${W[(a[2] >>> 4) % W.length]}`;
  }
  function genPassword(){
    const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789-_!@#%';
    const a = new Uint32Array(18); crypto.getRandomValues(a);
    return Array.from(a, x => c[x % c.length]).join('');
  }
  function showDemoMail(res){
    if (!res || !res.demoEmail) return;
    ui.confirm({ title: 'Demo mailbox', message: `Email to ${res.demoEmail.to}: “${res.demoEmail.subject}”`, detail: 'The in-browser demo has no mail server. Open the link as the recipient would.', confirmText: 'Open link' })
      .then(ok => { if (ok) window.open(res.demoEmail.link, '_blank', 'noopener'); });
  }
  /* Create: only what is needed to sign in. Job title, employee ID, department and targets are under Edit. */
  function newUserFields(){
    const canRole = st.can('users.assign_role');
    return [{ name: 'firstName', label: 'First name', required: true, autocomplete: 'off' }, { name: 'lastName', label: 'Last name', required: true },
      { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'mobile', label: 'Phone', type: 'tel', required: true },
      canRole ? { name: 'role', label: 'Role', type: 'select', required: true, options: grantableRoles().filter(r => r.id !== 'unassigned').map(r => ({ value: r.id, label: r.name })), default: 'counsellor', placeholder: false } : null,
      { name: 'teamId', label: 'Team', type: 'select', options: () => st.options.teams(), placeholder: '— No team —' },
      { name: 'username', label: 'Username (optional)', placeholder: 'Leave blank to sign in with email', rules: [(v) => !v || /^[A-Za-z0-9._-]{3,30}$/.test(v) ? '' : '3–30 letters, numbers, dot, dash or underscore'] },
      { name: 'password', label: 'Password', required: true, default: easyPassword(), autocomplete: 'off', help: 'Share this with the user. Edit it if you like (12+ characters).' },
      { name: 'mustChangePassword', label: 'Ask them to choose their own password at first sign-in', type: 'checkbox', full: true }].filter(Boolean);
  }
  function userFields(edit){
    return [{ name: 'firstName', label: 'First name', required: true, autocomplete: 'off' }, { name: 'lastName', label: 'Last name', required: true },
      { name: 'email', label: 'Work email', type: 'email', required: true, help: edit ? 'Changing it sends a verification link to the new address.' : '' },
      { name: 'username', label: 'Username', placeholder: 'optional, e.g. MANIJ001', readonly: !!(edit && edit.username && edit.username !== edit.email), rules: [(v) => !v || /^[A-Za-z0-9._-]{3,30}$/.test(v) ? '' : '3–30 letters, numbers, dot, dash or underscore'] },
      { name: 'mobile', label: 'Phone', type: 'tel', required: true }, { name: 'jobTitle', label: 'Job title' },
      { name: 'employeeId', label: 'Employee ID' }, { name: 'department', label: 'Department', type: 'select', options: DEPARTMENTS, placeholder: '— None —' },
      { name: 'teamId', label: 'Team', type: 'select', options: () => st.options.teams(), placeholder: '— No team —' },
      edit ? { section: 'Targets' } : null,
      edit ? { name: 'tMonthlyAdmissions', label: 'Monthly admissions target', type: 'number', min: 0 } : null, edit ? { name: 'tDailyCalls', label: 'Daily calls target', type: 'number', min: 0 } : null,
      edit ? { name: 'tMonthlyApplications', label: 'Monthly applications target', type: 'number', min: 0 } : null].filter(Boolean);
  }
  async function createUser(){
    await st.loadMasters();
    const canRole = st.can('users.assign_role');
    let sent = null;
    const res = await ui.formModal({ title: 'Create user', size: 'lg', fields: newUserFields(),
      intro: html`The user is <b>active immediately</b> and can sign in with the email (or username) and password below.`,
      validate: (v) => { const r = NL.passwordPolicy.evaluate(v.password, { email: v.email, firstName: v.firstName, lastName: v.lastName, username: v.username }, {}); return r.ok ? {} : { password: r.errors.join(' ') }; },
      submitLabel: 'Create user', onSubmit: (v) => { sent = v; return S.userService.create(Object.assign({}, v, { onboarding: 'password', markEmailVerified: true, mustChangePassword: !!v.mustChangePassword })); } });
    if (!res) return;
    await st.loadMasters(true); A.changed('users');
    // Sign-in details to hand over (shown once; the password is never stored in readable form).
    const login = location.origin + location.pathname;
    const details = [`Link: ${login}`, `Username: ${res.username || res.email}`, `Password: ${sent.password}`].join('\n');
    const copy = await ui.confirm({ title: `${res.fullName} can sign in now`, message: `Role: ${RB.roleName(res.role)}. Share these details with them:`,
      detail: details + (sent.mustChangePassword ? '\nThey will be asked to choose a new password at first sign-in.' : ''), confirmText: 'Copy details', cancelText: 'Close' });
    const text = 'New Leaf CRM sign-in\n' + details;
    if (copy){ try { await navigator.clipboard.writeText(text); ui.toast('Sign-in details copied'); } catch (e){ ui.toast('Copy failed — note the details down', 'warn'); } }
    if (res.role === 'unassigned' && canRole){
      const next = await ui.confirm({ title: 'Assign a role', message: `${res.fullName} has no role yet. Assign one now?`, confirmText: 'Assign role' });
      if (next) assignRole(res);
    }
  }
  async function editUser(u){
    await st.loadMasters();
    const t = u.targets || {};
    const res = await ui.formModal({ title: `Edit user · ${u.fullName}`, size: 'lg', fields: userFields(u),
      values: Object.assign({}, u, { tMonthlyAdmissions: t.monthlyAdmissions, tDailyCalls: t.dailyCalls, tMonthlyApplications: t.monthlyApplications }),
      onSubmit: async (v) => {
        const { tMonthlyAdmissions, tDailyCalls, tMonthlyApplications, ...rest } = v;
        if (rest.email && rest.email.toLowerCase() !== u.email.toLowerCase()){
          const ok = await ui.confirm({ title: 'Change sign-in email', message: `Change ${u.fullName}'s email to ${rest.email}?`, detail: 'The new address must be verified again. The old address is notified.', confirmText: 'Change email' });
          if (!ok) return false;
        }
        if (!rest.username || rest.username === u.username) delete rest.username;
        return S.userService.update(u.id, Object.assign(rest, { targets: { monthlyAdmissions: Number(tMonthlyAdmissions) || 0, dailyCalls: Number(tDailyCalls) || 0, monthlyApplications: Number(tMonthlyApplications) || 0 } }));
      } });
    if (res){ ui.toast('User updated'); await st.loadMasters(true); A.changed('users'); }
  }
  /* Roles the signed-in admin may hand out: Super Admin only by a Super Admin, otherwise roles whose permissions they also hold. */
  function grantableRoles(current){
    const mine = new Set(NL.auth.permissions); const isSuper = NL.auth.hasRole('super_admin');
    return RB.ROLES.filter(r => r.id !== 'agent' || current === 'agent').filter(r => isSuper || (r.id !== 'super_admin' && r.permissions.every(p => mine.has(p))));
  }
  async function assignRole(u){
    const isSuper = NL.auth.hasRole('super_admin');
    const roles = grantableRoles(u.role);
    const res = await ui.formModal({ title: `${u.role === 'unassigned' ? 'Assign role' : 'Change role'} · ${u.fullName}`, cols: 1, size: 'md',
      intro: html`Current role: ${ui.badge(RB.roleName(u.role), RB.roleColor(u.role).replace('b-', ''))}${isSuper ? '' : html`<div class="muted small">Only roles whose permissions you also hold are listed.</div>`}`,
      fields: [{ name: 'role', label: 'Role', type: 'select', required: true, options: roles.map(r => ({ value: r.id, label: r.name })), default: u.role === 'unassigned' ? '' : u.role }],
      onMount: (m, form) => { const d = NL.util.el('div', { class: 'role-desc muted small' }); form.appendChild(d); const sel = form.querySelector('[name=role]'); const upd = () => { const r = RB.ROLES.find(x => x.id === sel.value); d.textContent = r ? `${r.description} Data scope: ${r.scope === 'all' ? 'all records' : r.scope === 'team' ? 'own team' : 'own records'}.` : ''; }; sel.onchange = upd; upd(); },
      submitLabel: 'Save role',
      onSubmit: async (v) => {
        if (v.role === u.role) return true;
        const ok = await ui.confirm({ title: 'Confirm role change', message: `Change ${u.fullName}'s role from “${RB.roleName(u.role)}” to “${RB.roleName(v.role)}”?`, detail: 'The change takes effect immediately, is audited, and the user is notified by email.', confirmText: 'Change role', danger: v.role === 'super_admin' || v.role === 'admin' });
        if (!ok) return false;
        return S.userService.assignRole(u.id, v.role);
      } });
    if (res){ ui.toast('Role saved'); await st.loadMasters(true); A.changed('users'); }
  }
  async function setTempPassword(u){
    const res = await ui.formModal({ title: `Set temporary password · ${u.fullName}`, cols: 1, size: 'sm',
      fields: [{ name: 'password', label: 'Temporary password', required: true, default: genPassword(), autocomplete: 'new-password', help: 'Signs them out everywhere and unlocks a locked account. They must change it at next sign-in. Prefer “Send password reset link” when they can receive email.' }],
      validate: (v) => { const r = NL.passwordPolicy.evaluate(v.password, { email: u.email, firstName: u.firstName, lastName: u.lastName, username: u.username }, {}); return r.ok ? {} : { password: r.errors.join(' ') }; },
      submitLabel: 'Set password', onSubmit: (v) => S.userService.resetPassword(u.id, v.password) });
    if (res){ ui.toast('Temporary password set — share it securely'); A.changed('users'); }
  }
  async function run(label, fn, confirmOpts){
    if (confirmOpts){ const ok = await ui.confirm(confirmOpts); if (!ok) return; }
    try { const r = await fn(); ui.toast(label); showDemoMail(r); A.changed('users'); } catch (e){ A.fail(e); }
  }
  const STATUS_ACTIONS = {
    suspend: { to: 'SUSPENDED', label: 'Suspend', icon: '⏸️', done: 'User suspended', detail: 'They are signed out everywhere and cannot sign in until re-activated.' },
    disable: { to: 'DISABLED', label: 'Deactivate', icon: '⛔', done: 'User deactivated', detail: 'Use for people who have left. They are signed out everywhere. Their records stay assigned until reassigned.' },
    lock: { to: 'LOCKED', label: 'Lock', icon: '🔒', done: 'User locked', detail: 'They are signed out and must reset their password (or be unlocked) to get back in.' },
    activate: { to: 'ACTIVE', label: 'Activate', icon: '▶️', done: 'User activated', detail: '' }
  };
  function statusAction(u, key){
    const a = STATUS_ACTIONS[key];
    return { label: a.label, icon: a.icon, danger: key !== 'activate', onClick: async () => {
      const r = await ui.confirm({ title: `${a.label} user`, message: `${a.label} ${u.fullName}?`, detail: a.detail, danger: key !== 'activate', confirmText: a.label, reason: key !== 'activate', reasonLabel: 'Reason (recorded in the audit log)' });
      if (!r) return;
      try { await S.userService.setStatus(u.id, key, r.reason); ui.toast(a.done); A.changed('users'); } catch (e){ A.fail(e); }
    } };
  }
  async function userDetails(u){
    const m = ui.modal({ title: `${u.fullName}`, size: 'lg', body: ui.skeleton(4) });
    try {
      const d = await S.userService.detail(u.id); const x = d.user;
      const lbl = (e) => String(e.eventType || '').replace(/^AUTH_/, '').replace(/_/g, ' ').toLowerCase();
      m.body.innerHTML = toHtml(html`<div class="dh-meta">${ui.badge(x.roleName, RB.roleColor(x.role).replace('b-', ''))}${statusBadge(x.accountStatus)}${x.emailVerified ? ui.badge('Email verified', 'green') : ui.badge('Email not verified', 'amber')}${x.lockedUntil ? ui.badge('Temporarily locked', 'red') : ''}</div>
        ${w.detailGrid([['User ID', html`<span class="mono">${x.id}</span>`], ['Email', x.email], ['Username', x.username || '—'], ['Phone', x.phone || '—'], ['Organization', x.organization || '—'], ['Job title', x.jobTitle || '—'],
          ['Country', x.country || '—'], ['Timezone', x.timezone || '—'], ['Team', x.teamName || '—'], ['Created', F.dateTime(x.createdAt)], ['Last sign-in', x.lastLoginAt ? F.dateTime(x.lastLoginAt) : 'Never'],
          ['Password changed', x.passwordChangedAt ? F.dateTime(x.passwordChangedAt) : (x.passwordSet ? '—' : 'Not set yet (invitation pending)')], ['Status reason', x.statusReason || '—']])}
        ${d.sessions ? html`<h4>Active sessions (${d.sessions.length})</h4>${d.sessions.length ? html`<ul class="session-list compact">${d.sessions.map(s => html`<li class="session-item"><div class="sess-main"><b>${s.device}</b><div class="muted small">since ${F.dateTime(s.createdAt)} · last active ${F.relative(s.lastSeenAt)}${s.ip ? html` · <span class="mono">${s.ip}</span>` : ''}</div></div></li>`)}</ul>` : html`<p class="muted small">No active sessions.</p>`}` : ''}
        ${d.activity ? html`<h4>Recent security activity</h4>${d.activity.length ? html`<div class="table-wrap flat"><table class="table compact"><thead><tr><th>Event</th><th>When</th><th>IP</th></tr></thead><tbody>${d.activity.slice(0, 15).map(e => html`<tr><td>${lbl(e)}${e.actorName && e.actorId !== x.id ? html` <span class="muted small">by ${e.actorName}</span>` : ''}</td><td>${F.dateTime(e.at)}</td><td class="mono">${e.ip || '—'}</td></tr>`)}</tbody></table></div>` : html`<p class="muted small">No security events yet.</p>`}` : ''}`);
    } catch (e){ m.body.innerHTML = toHtml(ui.errorView(e, 'user details')); }
  }
  function users(el, p, query){
    const me = st.user(); const can = st.can;
    const canTouch = (u) => (u.role !== 'super_admin' || me.role === 'super_admin') && (me.role === 'super_admin' || RB.roleRank(u.role) <= RB.roleRank(me.role));
    const page = NL.listPage({ el, id: 'users', module: 'users', title: 'Users', sub: 'Create or invite users, assign roles and manage account access', exportName: 'users', what: 'users', refreshOn: ['users', 'teams'], initial: query,
      actions: [{ label: 'Create user', icon: '＋', primary: true, action: 'add', perm: 'users.create', onClick: createUser }],
      segments: [{ key: 'all', label: 'All users', query: {} }, { key: 'unassigned', label: 'Awaiting role', query: { role: 'unassigned' } },
        { key: 'pending', label: 'Pending verification', query: { accountStatus: 'PENDING_VERIFICATION' } }, { key: 'active', label: 'Active', query: { accountStatus: 'ACTIVE' } },
        { key: 'suspended', label: 'Suspended', query: { accountStatus: 'SUSPENDED' } }, { key: 'disabled', label: 'Deactivated', query: { accountStatus: 'DISABLED' } }, { key: 'locked', label: 'Locked', query: { accountStatus: 'LOCKED' } }],
      searchPlaceholder: 'Search name, email, username, employee ID…',
      filters: [{ key: 'role', label: 'Role', options: RB.ROLES.map(r => ({ value: r.id, label: r.name })) }, { key: 'teamId', label: 'Team', options: () => st.options.teams() }, { key: 'department', label: 'Department', options: DEPARTMENTS }],
      columns: [C.mono('employeeId', 'Employee ID', { hidden: true }), { key: 'fullName', label: 'Name', always: true, cls: 'name', render: (u) => html`<div class="uni-cell">${ui.avatar(u.fullName, 'sm')}<div>${u.fullName}${u.id === me.id ? html` <span class="muted tiny">(you)</span>` : ''}<div class="muted tiny">${u.jobTitle || u.username}</div></div></div>`, export: (u) => u.fullName },
        C.mono('username', 'Username', { hidden: true }), { key: 'email', label: 'Email', render: (u) => html`${u.email} ${u.emailVerified ? html`<span class="verified" title="Email verified" aria-label="Email verified">✓</span>` : html`<span class="unverified" title="Email not verified">unverified</span>`}`, export: (u) => u.email },
        C.mono('mobile', 'Phone'), C.text('department', 'Department', { hidden: true }),
        { key: 'role', label: 'Role', render: (u) => ui.badge(u.roleName, RB.roleColor(u.role).replace('b-', '')), export: (u) => u.roleName }, C.text('teamName', 'Team'),
        { key: 'accountStatus', label: 'Status', render: (u) => html`${statusBadge(u.accountStatus)}${u.lockedUntil ? html` <span class="badge b-red" title="Temporarily locked after failed sign-ins">locked</span>` : ''}`, export: (u) => RB.STATUS_LABEL[u.accountStatus] },
        { key: 'presence', label: 'Presence', hidden: true, render: (u) => html`${w.presenceDot(u.presence)}${u.presence || 'Offline'}` }, C.num('activeLeads', 'Active Leads', { hidden: true }),
        C.datetime('lastLoginAt', 'Last sign-in'), C.datetime('createdAt', 'Created', { hidden: true })],
      fetch: (q) => S.userService.list(q),
      rowClass: (u) => u.role === 'unassigned' && u.accountStatus === 'ACTIVE' ? 'row-warn' : '',
      rowActions: (u) => {
        const touch = canTouch(u); const self = u.id === me.id; const st0 = u.accountStatus;
        const status = (k) => can('users.delete') && touch && !self && RB.canTransition(st0, STATUS_ACTIONS[k].to) && statusAction(u, k);
        return [can('users.view') && { label: 'View details & activity', icon: '🔎', onClick: () => userDetails(u) },
          can('users.edit') && touch && { label: 'Edit user', icon: '✏️', onClick: () => editUser(u) },
          can('users.assign_role') && touch && !self && { label: u.role === 'unassigned' ? 'Assign role' : 'Change role', icon: '🔐', onClick: () => assignRole(u) },
          '-',
          can('users.edit') && touch && !['SUSPENDED', 'DISABLED'].includes(st0) && { label: u.passwordSet ? 'Send password reset link' : 'Resend invitation', icon: '✉️', onClick: () => run(u.passwordSet ? 'Password reset link sent' : 'Invitation sent', () => S.userService.sendPasswordReset(u.id)) },
          can('users.edit') && touch && { label: 'Set temporary password', icon: '🔑', onClick: () => setTempPassword(u) },
          can('users.edit') && touch && !u.emailVerified && u.passwordSet && { label: 'Mark email as verified', icon: '✅', onClick: () => run('Email marked as verified', () => S.userService.verifyEmail(u.id), { title: 'Mark email verified', message: `Confirm that ${u.email} belongs to ${u.fullName}?`, detail: 'Only do this if you have confirmed it another way. This is audited.', confirmText: 'Mark verified' }) },
          can('users.edit') && touch && (st0 === 'LOCKED' || u.lockedUntil) && { label: 'Unlock account', icon: '🔓', onClick: () => run('Account unlocked', () => S.userService.unlock(u.id)) },
          can('users.edit') && touch && !self && { label: 'Sign out all sessions', icon: '⎋', onClick: () => run('Sessions revoked', () => S.userService.revokeSessions(u.id), { title: 'Sign out everywhere', message: `Sign ${u.fullName} out of every device?`, danger: true, confirmText: 'Sign out' }) },
          '-', status('activate'), status('suspend'), status('lock'), status('disable'),
          can('audit.view') && { label: 'Security events', icon: '🧾', onClick: () => (location.hash = '#/audit?tab=security&userId=' + encodeURIComponent(u.id)) },
          !touch && { label: 'Higher role — protected', icon: '🔒', disabled: true }].filter(Boolean).filter((x, i, arr) => x !== '-' || (i > 0 && arr[i - 1] !== '-' && i < arr.length - 1));
      },
      empty: () => ({ icon: '👤', title: 'No users found', actions: [{ label: 'Clear Filters', action: 'clearFilters' }] })
    });
    return page.cleanup;
  }

  /* ================= CAMPAIGNS ================= */
  function campaignFields(){
    const s = st.settings();
    return [{ name: 'name', label: 'Campaign name', required: true, full: true }, { name: 'universityId', label: 'University', type: 'select', options: () => st.options.universities(true), placeholder: '— All universities —' },
      { name: 'course', label: 'Course', type: 'select', options: () => st.options.courseNames(), placeholder: '— All courses —' }, { name: 'source', label: 'Lead source', type: 'select', required: true, options: s.leadSources },
      { name: 'budget', label: 'Budget (₹)', type: 'number', min: 0, rules: ['amount'] }, { name: 'startDate', label: 'Start date', type: 'date', required: true, default: F.ymd(new Date()) },
      { name: 'endDate', label: 'End date', type: 'date' }, { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Paused', 'Completed'], placeholder: false, default: 'Active' }];
  }
  async function campaignForm(c){
    await st.loadMasters();
    const res = await ui.formModal({ title: c ? `Edit campaign · ${c.name}` : 'Create campaign', fields: campaignFields(), values: c || {}, validate: (v) => v.endDate && v.endDate < v.startDate ? { endDate: 'End date is before start date' } : {},
      onSubmit: (v) => c ? S.campaignService.update(c.id, v) : S.campaignService.create(v) });
    if (res){ ui.toast(c ? 'Campaign updated' : 'Campaign created'); await st.loadMasters(true); A.changed('campaigns'); }
  }
  function campaigns(el, p, query){
    const s = st.settings();
    const page = NL.listPage({ el, id: 'campaigns', module: 'campaigns', title: 'Campaigns', sub: 'Marketing campaigns with lead-to-admission performance', exportName: 'campaigns', what: 'campaigns', refreshOn: ['campaigns', 'leads'], initial: query,
      actions: [{ label: 'Create Campaign', icon: '＋', primary: true, action: 'add', perm: 'campaigns.manage', onClick: () => campaignForm() }],
      filters: [{ key: 'universityId', label: 'University', options: () => st.options.universities(true) }, { key: 'source', label: 'Source', options: s.leadSources }, { key: 'status', label: 'Status', options: ['Active', 'Paused', 'Completed'] }],
      columns: [C.mono('id', 'Campaign ID'), C.text('name', 'Campaign Name', { cls: 'name', always: true }), C.text('universityName', 'University'), C.text('course', 'Course'), C.text('source', 'Source'),
        C.date('startDate', 'Start Date'), C.date('endDate', 'End Date'), C.money('budget', 'Budget'), C.num('leads', 'Leads'), C.num('contacted', 'Contacted'), C.num('qualified', 'Qualified'),
        C.num('applications', 'Applications'), C.num('admissions', 'Admissions'), C.money('revenue', 'Revenue'), { key: 'conversionRate', label: 'Conversion', cls: 'r num', render: (c) => F.pct(c.conversionRate), export: (c) => c.conversionRate.toFixed(2) },
        { key: 'roi', label: 'ROI', cls: 'r num', hidden: true, render: (c) => html`<span class="${c.roi < 0 ? 'neg' : 'pos'}">${F.pct(c.roi, 0)}</span>`, export: (c) => c.roi.toFixed(1) }, C.badge('status', 'Status')],
      fetch: (q) => S.campaignService.list(q),
      rowActions: (c) => [st.can('leads.view') && { label: 'View leads', icon: '🎯', onClick: () => (location.hash = '#/leads?campaignId=' + c.id) },
        st.can('campaigns.manage') && { label: 'Edit', icon: '✏️', onClick: () => campaignForm(c) },
        st.can('campaigns.manage') && c.status !== 'Completed' && { label: c.status === 'Active' ? 'Pause' : 'Activate', icon: c.status === 'Active' ? '⏸️' : '▶️', onClick: async () => { try { await S.campaignService.update(c.id, { status: c.status === 'Active' ? 'Paused' : 'Active' }); ui.toast('Campaign updated'); A.changed('campaigns'); } catch (e){ A.fail(e); } } }].filter(Boolean),
      empty: () => ({ icon: '📢', title: 'No campaigns found', actions: [{ label: 'Clear Filters', action: 'clearFilters' }] })
    });
    return page.cleanup;
  }

  NL.pages.teams = { title: 'Teams', perm: 'teams.view', crumbs: ['Operations', 'Teams'], render: teams };
  NL.pages.users = { title: 'Users', perm: 'users.view', crumbs: ['Operations', 'Users'], render: users };
  NL.pages.campaigns = { title: 'Campaigns', perm: 'campaigns.view', crumbs: ['Operations', 'Campaigns'], render: campaigns };
  NL.userAdmin = { assignRole, createUser };
})();
