/* Administration — Settings, Roles & Permissions, Audit Logs (activity + security events), Notifications. */
(function(){
  const { html, raw, toHtml, $, $$ } = NL.util;
  const S = NL.services, st = NL.store, ui = NL.ui, A = NL.actions, C = NL.cols, F = NL.fmt, w = NL.w;

  /* ================= SETTINGS ================= */
  const SECTIONS = [['general', 'General'], ['admission', 'Admission'], ['leads', 'Lead Management'], ['notifications', 'Notifications'], ['security', 'Security'], ['performance', 'Performance'], ['users', 'Users & Roles'], ['integration', 'Integrations & API']];
  function settings(el, p, query){
    let section = query.section || 'general'; let data = null; const canEdit = st.can('settings.manage');
    el.innerHTML = toHtml(html`${w.pageHead({ title: 'Settings', sub: canEdit ? 'Configure the CRM for your organisation' : 'Read-only — you need the “Change settings” permission to edit' })}
      <div class="settings-layout"><nav class="settings-nav">${SECTIONS.map(([k, l]) => html`<button class="${k === section ? 'active' : ''}" data-sec="${k}">${l}</button>`)}</nav><div class="settings-body" id="setBody"></div></div>`);
    const body = $('#setBody', el);
    const load = () => ui.load(body, () => S.settingsService.get(), (d) => { data = d; draw(); }, { what: 'settings' });
    const save = async (sec, value, msg) => { try { data = await S.settingsService.update(sec, value); st.settingsCache = data; ui.toast(msg || 'Settings saved'); A.changed('settings'); draw(); return true; } catch (e){ A.fail(e); return false; } };
    const listEditor = (key, label, help) => html`<div class="set-block"><div class="set-head"><b>${label}</b>${help ? html`<div class="muted small">${help}</div>` : ''}</div>
      <textarea class="list-edit" data-list="${key}" rows="${Math.min(14, data[key].length + 2)}" ${canEdit ? '' : raw('readonly')}>${data[key].join('\n')}</textarea>${canEdit ? html`<button class="btn-primary btn-sm" data-save-list="${key}">Save ${label.toLowerCase()}</button>` : ''}</div>`;
    const readList = (label, list, help) => html`<div class="set-block"><div class="set-head"><b>${label}</b><div class="muted small">${help}</div></div><div class="chip-list">${list.map((s, i) => html`<span class="chip static">${i + 1}. ${s}</span>`)}</div></div>`;
    const dis = canEdit ? '' : raw('disabled');
    function draw(){
      $$('.settings-nav button', el).forEach(b => b.classList.toggle('active', b.dataset.sec === section));
      const d = data; let out;
      if (section === 'general') out = html`<form class="form-grid" data-form="general">
          <div class="field"><label>Company name</label><input name="companyName" value="${d.general.companyName}" ${dis}></div><div class="field"><label>Product name</label><input name="productName" value="${d.general.productName}" ${dis}></div>
          <div class="field"><label>Logo text / URL</label><input name="logoText" value="${d.general.logoText}" ${dis}></div>
          <div class="field"><label>Timezone</label><select name="timezone" ${dis}>${['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'UTC'].map(z => html`<option ${z === d.general.timezone ? raw('selected') : ''}>${z}</option>`)}</select></div>
          <div class="field"><label>Currency</label><select name="currency" ${dis}>${['INR', 'USD', 'AED', 'GBP', 'EUR'].map(z => html`<option ${z === d.general.currency ? raw('selected') : ''}>${z}</option>`)}</select></div>
          ${canEdit ? html`<div class="full"><button class="btn-primary" data-save-form="general">Save general settings</button></div>` : ''}</form>`;
      else if (section === 'admission') out = html`${readList('Lead stages', d.leadStages, 'Core workflow stages drive the funnel, scoring and automation, so they are fixed.')}${readList('Negative / exit stages', d.negativeStages, 'Leads in these stages leave the active pipeline.')}
        ${readList('Application stages', d.applicationStages, 'Application workflow stages (fixed).')}
        ${listEditor('documentTypes', 'Document types', 'One per line.')}
        <div class="set-block"><div class="set-head"><b>Required documents</b><div class="muted small">Checklist created automatically for every new application.</div></div>
          <div class="check-grid">${d.documentTypes.map(t => html`<label class="check"><input type="checkbox" data-reqdoc="${t}" ${d.requiredDocuments.includes(t) ? raw('checked') : ''} ${dis}> ${t}</label>`)}</div>${canEdit ? html`<button class="btn-primary btn-sm" data-save-req>Save checklist</button>` : ''}</div>
        ${listEditor('qualifications', 'Qualifications')}${listEditor('learningModes', 'Learning modes')}${listEditor('paymentTypes', 'Payment types')}${listEditor('paymentModes', 'Payment modes')}`;
      else if (section === 'leads') out = html`${listEditor('leadSources', 'Lead sources', 'One per line.')}${listEditor('followupReasons', 'Follow-up reasons')}
        <div class="set-block"><div class="set-head"><b>Lead scoring rules</b><div class="muted small">Points add up to a score out of 100 (leads in exit stages keep 30%). Saving recalculates every lead.</div></div>
          <table class="table compact"><thead><tr><th>Rule</th><th class="r">Points</th><th>Enabled</th></tr></thead><tbody>${d.scoring.rules.map((r, i) => html`<tr><td>${r.label}</td><td class="r"><input type="number" min="0" max="100" class="num-in" data-rule="${i}" value="${r.points}" ${dis}></td><td><input type="checkbox" data-rule-on="${i}" ${r.enabled ? raw('checked') : ''} ${dis}></td></tr>`)}</tbody></table>
          <div class="muted small">Bands: ${d.scoring.bands.map(b => html`<span class="chip static">${b.min}–${b.max} ${b.label}</span>`)}</div>
          ${canEdit ? html`<button class="btn-primary btn-sm" data-save-scoring>Save scoring</button>` : ''}</div>
        <div class="set-block"><div class="set-head"><b>Assignment rules</b><div class="muted small">Used by automatic distribution on lead creation, bulk assignment and import.</div></div>
          <div class="field"><label>Default method for new leads</label><select data-asg="defaultMethod" ${dis}>${NL.actions.ASSIGN_METHODS.map(m => html`<option value="${m.value}" ${m.value === d.assignment.defaultMethod ? raw('selected') : ''}>${m.label}</option>`)}</select></div>
          <h4>University-specific counsellors</h4>${mapTable('universityMap', st.masters().universities.map(u => ({ key: u.id, label: u.name })), d.assignment.universityMap)}
          <h4>Course-specific counsellors</h4>${mapTable('courseMap', st.options.courseNames().map(c => ({ key: c.value, label: c.label })), d.assignment.courseMap)}
          <h4>Campaign → team</h4><table class="table compact"><tbody>${st.masters().campaigns.map(c => html`<tr><td>${c.name}</td><td><select data-cmap="${c.id}" ${dis}><option value="">— Default round robin —</option>${st.options.teams().map(t => html`<option value="${t.value}" ${d.assignment.campaignMap[c.id] === t.value ? raw('selected') : ''}>${t.label}</option>`)}</select></td></tr>`)}</tbody></table>
          ${canEdit ? html`<button class="btn-primary btn-sm" data-save-asg>Save assignment rules</button>` : ''}</div>`;
      else if (section === 'notifications') out = html`<form class="form-grid" data-form="notifications">
          <div class="field"><label>Follow-up reminder (minutes before due)</label><input type="number" name="followupReminderMinutes" min="0" max="240" value="${d.notifications.followupReminderMinutes}" ${dis}></div>
          <label class="check full"><input type="checkbox" name="reminderPopup" ${d.notifications.reminderPopup ? raw('checked') : ''} ${dis}> Show a pop-up reminder when a follow-up is due</label>
          <label class="check full"><input type="checkbox" name="applicationAlerts" ${d.notifications.applicationAlerts ? raw('checked') : ''} ${dis}> Application submitted / admission confirmed alerts</label>
          <label class="check full"><input type="checkbox" name="paymentAlerts" ${d.notifications.paymentAlerts ? raw('checked') : ''} ${dis}> Payment received alerts</label>
          <label class="check full"><input type="checkbox" name="documentAlerts" ${d.notifications.documentAlerts ? raw('checked') : ''} ${dis}> Document rejected alerts</label>
          ${canEdit ? html`<div class="full"><button class="btn-primary" data-save-form="notifications">Save notification settings</button></div>` : ''}</form>`;
      else if (section === 'security') out = html`<form class="form-grid" data-form="security">
          <div class="field"><label>Session timeout (minutes of inactivity)</label><input type="number" name="sessionTimeoutMinutes" min="5" max="480" value="${d.security.sessionTimeoutMinutes}" ${dis}></div>
          <div class="field"><label>Max failed logins before lock</label><input type="number" name="maxLoginAttempts" min="3" max="20" value="${d.security.maxLoginAttempts}" ${dis}></div>
          <div class="field"><label>Minimum password length</label><input type="number" name="passwordMinLength" min="12" max="64" value="${d.security.passwordMinLength}" ${dis}></div><div></div>
          <label class="check"><input type="checkbox" name="requireUpper" ${d.security.requireUpper ? raw('checked') : ''} ${dis}> Also require upper- and lowercase letters</label>
          <label class="check"><input type="checkbox" name="requireNumber" ${d.security.requireNumber ? raw('checked') : ''} ${dis}> Also require a number</label>
          <label class="check"><input type="checkbox" name="requireSpecial" ${d.security.requireSpecial ? raw('checked') : ''} ${dis}> Also require a special character</label>
          ${canEdit ? html`<div class="full"><button class="btn-primary" data-save-form="security">Save security settings</button></div>` : ''}</form>
          <div class="notice">Always enforced by the server: passwords of at least 12 characters, rejection of common and personal passwords, Argon2id hashing, password-reuse prevention, HttpOnly secure session cookies, CSRF tokens, sign-in rate limiting with temporary lockout, and server-side permission checks on every request. The options above can only make these rules stricter. “Remember me” sessions use their own 7-day idle limit.</div>`;
      else if (section === 'performance') out = html`<form class="form-grid" data-form="performance">
          <div class="field"><label>Counsellor ranking rule</label><select name="rankBy" ${dis}>${[['none', 'No ranking (alphabetical)'], ['admissions', 'Admissions'], ['achievementPct', 'Achievement % of target'], ['conversion', 'Conversion rate'], ['revenue', 'Revenue'], ['applications', 'Applications'], ['connected', 'Connected calls']].map(([v, l]) => html`<option value="${v}" ${d.performance.rankBy === v ? raw('selected') : ''}>${l}</option>`)}</select><div class="field-help">Rankings are only shown when a rule is configured.</div></div>
          <div class="field"><label>Default monthly admission target</label><input type="number" name="monthlyAdmissionTarget" min="0" value="${d.performance.monthlyAdmissionTarget}" ${dis}></div>
          <div class="field"><label>Default daily call target</label><input type="number" name="dailyCallTarget" min="0" value="${d.performance.dailyCallTarget}" ${dis}></div>
          ${canEdit ? html`<div class="full"><button class="btn-primary" data-save-form="performance">Save performance settings</button></div>` : ''}</form><div class="muted small">Individual targets are set per user in Users → Edit user.</div>`;
      else if (section === 'users') out = html`<p>Users are created first and roles are assigned separately.</p><div class="row-gap"><a class="btn-ghost btn-link" href="#/users">👤 Manage users</a><a class="btn-ghost btn-link" href="#/roles">🔐 Roles &amp; permissions</a></div>`;
      else out = html`<div class="set-block">${w.detailGrid([['APP_MODE', html`<code>${NL.config.APP_MODE}</code>`], ['API_BASE_URL', html`<code>${NL.config.API_BASE_URL}</code>`], ['ENVIRONMENT', html`<code>${NL.config.ENVIRONMENT}</code>`], ['Telephony provider', S.telephonyService.provider], ['WhatsApp', 'wa.me deep links (connect a Business API provider in whatsappService)']])}
        <p class="muted small">Change <code>APP_MODE</code> to <code>"production"</code> in <code>src/config/config.js</code> to send every service call to the REST API described in <code>README.md</code>.</p>
        ${NL.config.APP_MODE === 'demo' && st.can('settings.manage') ? html`<button class="btn-danger btn-sm" data-reset-demo>Reset demo data</button>` : ''}</div>`;
      body.innerHTML = toHtml(out);
    }
    function mapTable(key, rows, map){
      const opts = st.options.counsellors();
      return html`<table class="table compact"><tbody>${rows.map(r => html`<tr><td>${r.label}</td><td><div class="check-grid tight">${opts.map(o => html`<label class="check small"><input type="checkbox" data-map="${key}" data-k="${r.key}" value="${o.value}" ${(map[r.key] || []).includes(o.value) ? raw('checked') : ''} ${dis}> ${o.label.split(' · ')[0]}</label>`)}</div></td></tr>`)}</tbody></table>`;
    }
    el.addEventListener('click', async (e) => {
      const sb = e.target.closest('[data-sec]'); if (sb){ section = sb.dataset.sec; draw(); return; }
      const f = e.target.closest('[data-save-form]');
      if (f){ e.preventDefault(); const form = f.closest('form'); const sec = f.dataset.saveForm; const v = Object.assign({}, data[sec]);
        $$('input,select', form).forEach(i => { v[i.name] = i.type === 'checkbox' ? i.checked : i.type === 'number' ? Number(i.value) : i.value.trim(); });
        if (sec === 'general' && !v.companyName) return ui.toast('Company name is required', 'warn');
        return save(sec, v); }
      const l = e.target.closest('[data-save-list]'); if (l){ const k = l.dataset.saveList; const vals = $(`[data-list="${k}"]`, el).value.split('\n').map(x => x.trim()).filter(Boolean);
        if (!vals.length) return ui.toast('The list cannot be empty', 'warn'); if (new Set(vals).size !== vals.length) return ui.toast('Remove duplicate entries', 'warn');
        return save(k, vals); }
      if (e.target.closest('[data-save-req]')) return save('requiredDocuments', $$('[data-reqdoc]', el).filter(c => c.checked).map(c => c.dataset.reqdoc));
      if (e.target.closest('[data-save-scoring]')){ const rules = data.scoring.rules.map((r, i) => Object.assign({}, r, { points: Number($(`[data-rule="${i}"]`, el).value), enabled: $(`[data-rule-on="${i}"]`, el).checked }));
        if (rules.some(r => !(r.points >= 0 && r.points <= 100))) return ui.toast('Points must be between 0 and 100', 'warn');
        return save('scoring', Object.assign({}, data.scoring, { rules }), 'Scoring saved — all lead scores recalculated'); }
      if (e.target.closest('[data-save-asg]')){ const a = Object.assign({}, data.assignment, { defaultMethod: $('[data-asg=defaultMethod]', el).value, universityMap: {}, courseMap: {}, campaignMap: {} });
        $$('[data-map]', el).forEach(c => { if (c.checked) (a[c.dataset.map][c.dataset.k] = a[c.dataset.map][c.dataset.k] || []).push(c.value); });
        $$('[data-cmap]', el).forEach(s => { if (s.value) a.campaignMap[s.dataset.cmap] = s.value; });
        return save('assignment', a, 'Assignment rules saved'); }
      if (e.target.closest('[data-reset-demo]')){ if (await ui.confirm({ title: 'Reset demo data', message: 'Delete all demo changes and restore the sample dataset? You will be signed out.', danger: true, confirmText: 'Reset' })){ NL.demoDb.reset(); location.hash = ''; location.reload(); } }
    });
    load();
  }

  /* ================= ROLES & PERMISSIONS ================= */
  function roles(el){
    const canEdit = st.can('roles.manage'); let data = null; const dirty = new Set();
    el.innerHTML = toHtml(html`${w.pageHead({ title: 'Roles & Permissions', sub: canEdit ? 'Tick a box to grant a permission. The backend enforces the same matrix on every API call.' : 'Read-only view — only a Super Admin can change permissions.' })}<div id="rpBody"></div>`);
    const body = $('#rpBody', el);
    const load = () => ui.load(body, () => S.roleService.list(), (d) => { data = d; draw(); }, { what: 'roles' });
    function draw(){
      const rs = data.filter(r => r.id !== 'unassigned').concat(data.filter(r => r.id === 'unassigned'));
      body.innerHTML = toHtml(html`
        <div class="role-cards">${rs.map(r => html`<div class="role-card"><div class="row-between">${ui.badge(r.name, NL.rbac.roleColor(r.id).replace('b-', ''))}<span class="muted small">${r.userCount} user${r.userCount === 1 ? '' : 's'}</span></div>
          <div class="small">${(NL.rbac.ROLES.find(x => x.id === r.id) || {}).description || ''}</div>
          <div class="field"><label>Data scope</label><select data-scope="${r.id}" ${canEdit && r.id !== 'super_admin' ? '' : raw('disabled')}>${[['all', 'All records'], ['team', 'Own team'], ['own', 'Own records']].map(([v, l]) => html`<option value="${v}" ${r.scope === v ? raw('selected') : ''}>${l}</option>`)}</select></div></div>`)}</div>
        ${canEdit ? html`<div class="sticky-save" id="rpSave" hidden><span id="rpDirty"></span><button class="btn-ghost btn-sm" data-rp="discard">Discard</button><button class="btn-primary btn-sm" data-rp="save">Save changes</button></div>` : ''}
        <div class="table-wrap perm-matrix"><table class="table compact"><thead><tr><th>Permission</th>${rs.map(r => html`<th class="c">${r.name}</th>`)}</tr></thead>
        <tbody>${NL.rbac.PERMISSION_GROUPS.map(([g, perms]) => html`<tr class="grp"><td colspan="${rs.length + 1}">${g}</td></tr>${perms.map(([p, label]) => html`<tr><td>${label}<div class="muted tiny mono">${p}</div></td>
          ${rs.map(r => html`<td class="c"><input type="checkbox" data-role="${r.id}" data-perm="${p}" ${r.permissions.includes(p) ? raw('checked') : ''} ${canEdit && r.id !== 'super_admin' ? '' : raw('disabled')} aria-label="${r.name}: ${label}"></td>`)}</tr>`)}`)}</tbody></table></div>`);
    }
    const mark = (id) => { dirty.add(id); const b = $('#rpSave', el); if (b){ b.hidden = false; $('#rpDirty', el).textContent = `${dirty.size} role${dirty.size === 1 ? '' : 's'} changed`; } };
    el.addEventListener('change', (e) => {
      const c = e.target.closest('[data-perm]'); if (c){ const r = data.find(x => x.id === c.dataset.role); r.permissions = c.checked ? r.permissions.concat([c.dataset.perm]) : r.permissions.filter(p => p !== c.dataset.perm); mark(r.id); }
      const s = e.target.closest('[data-scope]'); if (s){ data.find(x => x.id === s.dataset.scope).scope = s.value; mark(s.dataset.scope); }
    });
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-rp]'); if (!b) return;
      if (b.dataset.rp === 'discard'){ dirty.clear(); load(); return; }
      const ok = await ui.confirm({ title: 'Save permission changes', message: `Update permissions for ${dirty.size} role${dirty.size === 1 ? '' : 's'}?`, detail: 'Users receive the new permissions on their next sign-in. Every change is audited.', confirmText: 'Save' });
      if (!ok) return;
      try { for (const id of dirty){ const r = data.find(x => x.id === id); await S.roleService.update(id, { permissions: r.permissions, scope: r.scope }); } dirty.clear(); ui.toast('Permissions updated'); A.changed('roles'); load(); } catch (err){ A.fail(err); }
    });
    load();
  }

  /* ================= AUDIT LOGS ================= */
  const SEC_EVENTS = ['AUTH_LOGIN_SUCCESS', 'AUTH_LOGIN_FAILED', 'AUTH_LOGOUT', 'AUTH_SIGNUP', 'AUTH_EMAIL_VERIFIED', 'AUTH_EMAIL_CHANGED', 'AUTH_PASSWORD_CHANGED', 'AUTH_PASSWORD_RESET_REQUESTED', 'AUTH_PASSWORD_RESET',
    'AUTH_ACCOUNT_LOCKED', 'AUTH_ACCOUNT_UNLOCKED', 'AUTH_ACCOUNT_SUSPENDED', 'AUTH_ACCOUNT_ACTIVATED', 'AUTH_ACCOUNT_DISABLED', 'AUTH_ROLE_CHANGED', 'AUTH_ROLE_PERMISSIONS_CHANGED', 'AUTH_SESSION_REVOKED',
    'AUTH_USER_CREATED', 'AUTH_USER_UPDATED', 'AUTH_INVITATION_SENT', 'AUTH_INVITATION_ACCEPTED', 'AUTH_PROFILE_UPDATED', 'AUTH_SUPER_ADMIN_BOOTSTRAPPED'];
  const metaText = (m) => Object.entries(m || {}).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ');
  function audit(el, p, query){
    const tab = query.tab === 'security' ? 'security' : 'activity';
    el.innerHTML = toHtml(html`<div class="tabs-bar" role="tablist" aria-label="Audit logs"><a class="tab-btn ${tab === 'activity' ? 'active' : ''}" role="tab" aria-selected="${tab === 'activity'}" href="#/audit">Activity log</a>
      <a class="tab-btn ${tab === 'security' ? 'active' : ''}" role="tab" aria-selected="${tab === 'security'}" href="#/audit?tab=security">Security events</a></div><div id="auditHost"></div>`);
    const host = $('#auditHost', el);
    if (tab === 'security'){
      const secPage = NL.listPage({ el: host, id: 'secaudit', module: 'secaudit', title: 'Security events', sub: 'Sign-ins, password and email changes, lockouts, role and status changes, session revocations. Append-only and tamper-evident.',
        exportName: 'security_events', what: 'security events', refreshOn: [], initial: query, searchPlaceholder: 'Search event, user, IP, details…',
        filters: [{ type: 'daterange', label: 'Date', field: 'at' }, { key: 'eventType', label: 'Event', options: SEC_EVENTS.map(e => ({ value: e, label: e.replace(/^AUTH_/, '').replace(/_/g, ' ').toLowerCase() })) },
          { key: 'userId', label: 'User', options: () => st.options.users() }],
        columns: [C.datetime('at', 'Timestamp'), { key: 'eventType', label: 'Event', always: true, render: (a) => ui.badge(a.eventType.replace(/^AUTH_/, '').replace(/_/g, ' ').toLowerCase(), /FAILED|LOCKED|SUSPENDED|DISABLED|REVOKED/.test(a.eventType) ? 'red' : /SUCCESS|VERIFIED|ACTIVATED|UNLOCKED|ACCEPTED/.test(a.eventType) ? 'green' : 'blue'), export: (a) => a.eventType },
          C.text('userName', 'User', { cls: 'name' }), { key: 'actorName', label: 'Performed by', render: (a) => a.actorName || (a.actorId ? a.actorId : html`<span class="muted">—</span>`), export: (a) => a.actorName || '' },
          C.mono('ip', 'IP'), { key: 'metadata', label: 'Details', cls: 'remarks tiny', render: (a) => metaText(a.metadata) || '—', export: (a) => JSON.stringify(a.metadata || {}) }, C.text('userAgent', 'User agent', { hidden: true })],
        fetch: (q) => S.securityAuditService.list(q), sort: 'at', dir: 'desc',
        empty: () => ({ icon: '🛡️', title: 'No security events match', actions: [{ label: 'Clear Filters', action: 'clearFilters' }] }) });
      return secPage.cleanup;
    }
    el = host;
    const page = NL.listPage({ el, id: 'audit', module: 'audit', title: 'Audit Logs', sub: 'Every important change — who, what, when, old and new values', exportName: 'audit_log', what: 'audit logs', refreshOn: [], initial: query,
      searchPlaceholder: 'Search action, user, record ID, values…',
      filters: [{ type: 'daterange', label: 'Date', field: 'at' }, { key: 'module', label: 'Module', options: ['Auth', 'Leads', 'Lead Import', 'Students', 'Applications', 'Documents', 'Payments', 'Calls', 'Follow-ups', 'Notes', 'Users', 'Roles', 'Teams', 'University', 'Campus', 'Course', 'Campaign', 'Settings', 'System'] },
        { key: 'userId', label: 'User', options: () => st.options.users() }, { key: 'role', label: 'Role', options: NL.rbac.ROLES.map(r => ({ value: r.id, label: r.name })) }],
      columns: [C.datetime('at', 'Timestamp'), C.text('userName', 'User', { cls: 'name' }), { key: 'role', label: 'Role', render: (a) => NL.rbac.roleName(a.role), export: (a) => NL.rbac.roleName(a.role) }, C.text('action', 'Action', { always: true }),
        C.badge('module', 'Module', { render: (a) => ui.badge(a.module, 'blue') }), C.mono('recordId', 'Record ID'), { key: 'oldValue', label: 'Old Value', cls: 'remarks mono tiny', render: (a) => a.oldValue || '—' },
        { key: 'newValue', label: 'New Value', cls: 'remarks mono tiny', render: (a) => a.newValue || '—' }, C.mono('ip', 'IP', { hidden: true })],
      fetch: (q) => S.auditService.list(q), sort: 'at', dir: 'desc',
      empty: () => ({ icon: '🧾', title: 'No audit entries match', actions: [{ label: 'Clear Filters', action: 'clearFilters' }] })
    });
    return page.cleanup;
  }

  /* ================= NOTIFICATIONS ================= */
  function notifications(el){
    const draw = () => ui.load(el, () => S.notificationService.list({ limit: 200 }), (d) => {
      el.innerHTML = toHtml(html`${w.pageHead({ title: 'Notifications', sub: `${d.unread} unread of ${d.total}`, actions: [d.unread ? { label: 'Mark all read', icon: '✓', action: 'all' } : null] })}
        <div class="card"><div class="np-list big">${d.items.length ? d.items.map(n => html`<a class="np-item ${n.read ? '' : 'unread'}" href="${n.link || '#/notifications'}" data-id="${n.id}"><span class="np-ico">🔔</span><span><b>${n.title}</b><small>${n.body}</small><em>${F.dateTime(n.at)}</em></span></a>`) : ui.empty({ icon: '🔔', title: "You're all caught up", text: 'New assignments, due follow-ups, payments and admissions will appear here.' })}</div></div>`);
    }, { what: 'notifications' });
    el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-action=all]')){ await S.notificationService.markRead(); NL.app.pollNotifications(); draw(); }
      const it = e.target.closest('.np-item'); if (it) S.notificationService.markRead([it.dataset.id]).then(NL.app.pollNotifications);
    });
    draw();
  }

  NL.pages.settings = { title: 'Settings', perm: 'settings.view', crumbs: ['Administration', 'Settings'], render: settings };
  NL.pages.roles = { title: 'Roles & Permissions', perm: ['roles.manage', 'users.assign_role'], crumbs: ['Administration', 'Roles & Permissions'], render: roles };
  NL.pages.audit = { title: 'Audit Logs', perm: 'audit.view', crumbs: ['Administration', 'Audit Logs'], render: audit };
  NL.pages.notifications = { title: 'Notifications', perm: null, crumbs: ['Notifications'], render: notifications };
})();
