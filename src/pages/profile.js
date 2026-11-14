/* Signed-in user's self-service: #/profile (Personal · Security · Sessions ·
   Notifications · Access) and #/change-password. Everything is validated
   again on the server; this page only offers early feedback. */
(function(){
  const { html, raw, toHtml, $, $$ } = NL.util;
  const S = NL.services.authService, st = NL.store, ui = NL.ui, w = NL.w, F = NL.fmt;
  const AV = NL.authValidation, RB = NL.rbac;
  const AP = () => NL.authPages;

  const EVENT_LABEL = { AUTH_LOGIN_SUCCESS: 'Signed in', AUTH_LOGIN_FAILED: 'Failed sign-in attempt', AUTH_LOGOUT: 'Signed out', AUTH_PASSWORD_CHANGED: 'Password changed',
    AUTH_PASSWORD_RESET: 'Password reset', AUTH_PASSWORD_RESET_REQUESTED: 'Password reset requested', AUTH_EMAIL_VERIFIED: 'Email verified', AUTH_EMAIL_CHANGED: 'Email changed',
    AUTH_EMAIL_CHANGE_REQUESTED: 'Email change requested', AUTH_ACCOUNT_LOCKED: 'Account locked', AUTH_ACCOUNT_UNLOCKED: 'Account unlocked', AUTH_ACCOUNT_SUSPENDED: 'Account suspended',
    AUTH_ACCOUNT_ACTIVATED: 'Account activated', AUTH_ACCOUNT_DISABLED: 'Account disabled', AUTH_ROLE_CHANGED: 'Role changed', AUTH_SESSION_REVOKED: 'Session signed out',
    AUTH_PROFILE_UPDATED: 'Profile updated', AUTH_SIGNUP: 'Account created', AUTH_EMAIL_VERIFICATION_SENT: 'Verification email sent', AUTH_INVITATION_ACCEPTED: 'Invitation accepted',
    AUTH_SESSION_REFRESHED: 'Session renewed', AUTH_USER_CREATED: 'Account created by an administrator', AUTH_USER_UPDATED: 'Account updated by an administrator', AUTH_INVITATION_SENT: 'Invitation sent' };
  const TABS = [['personal', 'Personal information'], ['security', 'Security'], ['sessions', 'Sessions'], ['notifications', 'Notifications'], ['access', 'Access']];
  const statusBadge = (s) => ui.badge(RB.STATUS_LABEL[s] || s, s === 'ACTIVE' ? 'green' : s === 'PENDING_VERIFICATION' ? 'amber' : 'red');

  function profile(el, params, query){
    let tab = TABS.some(t => t[0] === query.tab) ? query.tab : 'personal';
    const me = () => NL.auth.user;
    function head(){
      const u = me(); const role = NL.auth.role || {};
      return html`<div class="detail-head"><div class="dh-main">${ui.avatar(u.fullName, 'lg')}<div><h1>${u.fullName}</h1>
        <div class="dh-meta">${ui.badge(role.name, RB.roleColor(role.id).replace('b-', ''))}${statusBadge(u.accountStatus || 'ACTIVE')}${u.emailVerified ? ui.badge('Email verified', 'green') : ui.badge('Email not verified', 'amber')}</div>
        <div class="dh-sub"><span>${u.email}</span>${u.username && u.username !== u.email ? html`<span>${u.username}</span>` : ''}${u.jobTitle ? html`<span>${u.jobTitle}</span>` : ''}${u.teamName ? html`<span>${u.teamName}</span>` : ''}</div></div></div>
        <div class="dh-actions"><a class="btn-ghost btn-link" href="#/change-password">🔑 Change password</a></div></div>
        ${role.id === 'unassigned' ? html`<div class="notice" role="status"><b>Your account is awaiting access.</b> An administrator will assign your role. Until then you can manage your profile and security settings here.</div>` : ''}
        <div class="tabs-bar" role="tablist" aria-label="Profile sections">${TABS.map(([k, l]) => html`<button class="tab-btn ${k === tab ? 'active' : ''}" role="tab" id="ptab-${k}" aria-selected="${k === tab}" aria-controls="ppanel" data-ptab="${k}">${l}</button>`)}</div>
        <section id="ppanel" role="tabpanel" aria-labelledby="ptab-${tab}" tabindex="-1"></section>`;
    }
    function draw(){ el.innerHTML = toHtml(head()); panel(); }
    function panel(){
      const p = $('#ppanel', el);
      ({ personal, security, sessions, notifications, access }[tab])(p);
    }

    /* ----- Personal information ----- */
    function personal(p){
      const u = me(); const role = NL.auth.role || {};
      const countries = AV.COUNTRIES.slice().sort((a, b) => a.name.localeCompare(b.name)).map(c => ({ value: c.code, label: c.name }));
      const zones = AV.timezoneOptions(u.timezone).map(z => ({ value: z, label: z.replace(/_/g, ' ') }));
      const f = AP().field;
      p.innerHTML = toHtml(html`<div class="grid-2">
        <div class="card"><div class="card-head"><h3>Personal information</h3></div><form id="profForm" class="auth-grid profile-form" novalidate>
          <div class="form-alert" id="authAlert" role="alert" tabindex="-1" hidden></div>
          ${f({ name: 'firstName', label: 'First name', required: true, autocomplete: 'given-name', value: u.firstName, half: true, maxlength: 60 })}
          ${f({ name: 'lastName', label: 'Last name', required: true, autocomplete: 'family-name', value: u.lastName, half: true, maxlength: 60 })}
          <div class="field af"><label for="pf_email">Email</label><div class="inline-row"><input id="pf_email" value="${u.email}" readonly aria-describedby="pf_email_help"><button type="button" class="btn-ghost btn-sm" id="changeEmailBtn">Change</button></div>
            <div class="field-help" id="pf_email_help">${u.emailVerified ? 'Verified' : 'Not verified yet'}. Changing it requires confirmation from the new address.</div></div>
          ${f({ name: 'phone', label: 'Phone', type: 'tel', required: true, autocomplete: 'tel', inputmode: 'tel', value: u.phone || u.mobile, maxlength: 24 })}
          ${f({ name: 'organization', label: 'Organization / University', required: true, autocomplete: 'organization', value: u.organization, maxlength: 120 })}
          ${f({ name: 'jobTitle', label: 'Job title', autocomplete: 'organization-title', value: u.jobTitle, maxlength: 100 })}
          ${f({ name: 'country', label: 'Country', type: 'select', required: true, options: countries, value: u.country, half: true })}
          ${f({ name: 'timezone', label: 'Timezone', type: 'select', required: true, options: zones, value: u.timezone, half: true })}
          <div class="full"><button class="btn-primary" id="profSave" type="submit">Save changes</button></div></form></div>
        ${w.card('Workspace details', html`${w.detailGrid([['User ID', html`<span class="mono">${u.id}</span>`], ['Username', u.username || '—'], ['Employee ID', u.employeeId || '—'], ['Department', u.department || '—'],
          ['Team', u.teamName || '—'], ['Role', role.name], ['Data scope', { all: 'All records', team: 'Own team', own: 'Own records' }[role.scope] || '—'], ['Member since', F.date(u.createdAt)]])}<p class="muted small">Workspace details are managed by your administrator.</p>`)}</div>`);
      const form = $('#profForm', p); const btn = $('#profSave', p);
      form.addEventListener('submit', async (e) => {
        e.preventDefault(); if (btn.disabled) return;
        const v = {}; $$('input[name],select[name]', form).forEach(i => (v[i.name] = i.value.trim()));
        const errs = {};
        if (!AV.isName(v.firstName)) errs.firstName = 'Enter a valid first name.'; if (!AV.isName(v.lastName)) errs.lastName = 'Enter a valid last name.';
        if (!AV.isPhone(v.phone)) errs.phone = 'Enter a valid phone number with country code.'; if (!v.organization || !AV.isSafeText(v.organization, 120)) errs.organization = 'Enter 2–120 characters without < or >.';
        if (v.jobTitle && !AV.isSafeText(v.jobTitle, 100)) errs.jobTitle = 'Up to 100 characters without < or >.';
        if (!AV.COUNTRY_CODES.has(v.country)) errs.country = 'Select a country.'; if (!AV.isTimezone(v.timezone)) errs.timezone = 'Select a timezone.';
        const first = AP().setErrors(form, errs); if (first){ first.focus(); return; }
        AP().busy(btn, true, 'Saving…');
        try { NL.auth.setSession(await S.updateProfile(v)); ui.toast('Profile updated'); draw(); }
        catch (err){ AP().busy(btn, false); const f2 = AP().setErrors(form, (err.details && err.details.errors) || {}); const a = $('#authAlert', p); a.hidden = false; a.textContent = AP().friendly(err); if (f2) f2.focus(); }
      });
      $('#changeEmailBtn', p).addEventListener('click', changeEmail);
    }
    async function changeEmail(){
      await ui.formModal({ title: 'Change email address', size: 'sm', cols: 1,
        intro: "We'll send a confirmation link to the new address. Your email changes once you open it, and you'll be asked to sign in again.",
        fields: [{ name: 'newEmail', label: 'New email', type: 'email', required: true, autocomplete: 'email' }, { name: 'currentPassword', label: 'Current password', type: 'password', required: true, autocomplete: 'current-password' }],
        submitLabel: 'Send confirmation link',
        onSubmit: async (v) => { const r = await S.changeEmail(v.newEmail, v.currentPassword); ui.toast(r.message, 'info'); if (r.demoEmail) ui.confirm({ title: 'Demo mailbox', message: `Confirmation email to ${r.demoEmail.to}`, detail: 'Open the link to confirm (in-browser demo only).', confirmText: 'Open link' }).then(ok => { if (ok) location.href = r.demoEmail.link; }); } });
    }

    /* ----- Security ----- */
    function security(p){
      const u = me();
      p.innerHTML = toHtml(html`<div class="grid-2">
        ${w.card('Password', html`${w.detailGrid([['Last changed', u.passwordChangedAt ? F.dateTime(u.passwordChangedAt) : '—'], ['Policy', 'At least 12 characters; common and personal passwords are rejected']])}
          <a class="btn-primary btn-link" href="#/change-password">Change password</a>`)}
        ${w.card('Email verification', html`<p>${u.emailVerified ? html`${ui.badge('Verified', 'green')} <b>${u.email}</b> was verified on ${F.date(u.emailVerifiedAt)}.` : html`${ui.badge('Not verified', 'amber')} <b>${u.email}</b> is not verified yet.`}</p>
          <p class="muted small">Your email is used to sign in and for password resets and security alerts.</p>`)}</div>
        <div class="card"><div class="card-head"><h3>Recent security activity</h3></div><div id="secList" class="card-body"></div></div>`);
      ui.load($('#secList', p), () => S.securityActivity(), (rows) => {
        $('#secList', p).innerHTML = toHtml(rows.length ? html`<div class="table-wrap flat"><table class="table compact"><caption class="sr-only">Recent security activity</caption><thead><tr><th scope="col">Event</th><th scope="col">When</th><th scope="col">Device</th><th scope="col">IP address</th></tr></thead>
          <tbody>${rows.map(r => html`<tr><td>${EVENT_LABEL[r.eventType] || r.eventType}${r.actorName ? html` <span class="muted small">by ${r.actorName}</span>` : ''}</td><td>${F.dateTime(r.at)}</td><td>${r.device || '—'}</td><td class="mono">${r.ip || '—'}</td></tr>`)}</tbody></table></div>`
          : ui.empty({ icon: '🛡️', title: 'No security activity yet' }));
        $('#secList', p).insertAdjacentHTML('beforeend', toHtml(html`<p class="muted small">Don't recognise something? Change your password and sign out of other sessions.</p>`));
      }, { what: 'security activity', rows: 4 });
    }

    /* ----- Sessions ----- */
    function sessions(p){
      p.innerHTML = toHtml(html`<div class="card"><div class="card-head"><h3>Active sessions</h3><span class="spacer"></span><button class="btn-danger btn-sm" id="revokeOthers">Sign out all other sessions</button></div><div id="sessList" class="card-body"></div></div>`);
      const loadList = () => ui.load($('#sessList', p), () => S.sessions(), (rows) => {
        $('#sessList', p).innerHTML = toHtml(html`<ul class="session-list">${rows.map(s => html`<li class="session-item ${s.current ? 'current' : ''}">
          <span class="sess-ico" aria-hidden="true">${/iOS|Android/.test(s.device) ? '📱' : '💻'}</span>
          <div class="sess-main"><b>${s.device || 'Unknown device'}</b> ${s.current ? ui.badge('This device', 'green') : ''}${s.remember ? html` <span class="badge b-blue">Remembered</span>` : ''}
            <div class="muted small">Signed in ${F.dateTime(s.createdAt)} · last active ${F.relative(s.lastSeenAt)}${s.ip ? html` · <span class="mono">${s.ip}</span>` : ''}</div>
            <div class="muted tiny">Expires ${F.dateTime(s.expiresAt)} if inactive</div></div>
          <button class="${s.current ? 'btn-ghost' : 'btn-danger'} btn-sm" data-revoke="${s.id}" data-current="${s.current ? '1' : ''}" aria-label="${s.current ? 'Sign out this device' : 'Sign out ' + (s.device || 'session')}">${s.current ? 'Sign out' : 'Revoke'}</button></li>`)}</ul>`);
        $('#revokeOthers', p).disabled = rows.filter(r => !r.current).length === 0;
      }, { what: 'sessions', rows: 3 });
      p.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-revoke]');
        if (b){
          if (b.dataset.current){ NL.shell.logout(); return; }
          if (!(await ui.confirm({ title: 'Sign out session', message: 'Sign out this session? That device will need to sign in again.', danger: true, confirmText: 'Sign out session' }))) return;
          try { await S.revokeSession(b.dataset.revoke); ui.toast('Session signed out'); loadList(); } catch (err){ ui.toast(AP().friendly(err), 'error'); }
        }
        if (e.target.closest('#revokeOthers')){
          if (!(await ui.confirm({ title: 'Sign out other sessions', message: 'Sign out of every other device and browser?', detail: 'This device stays signed in.', danger: true, confirmText: 'Sign out others' }))) return;
          try { const r = await S.revokeOtherSessions(); ui.toast(`${r.revoked} other session${r.revoked === 1 ? '' : 's'} signed out`); loadList(); } catch (err){ ui.toast(AP().friendly(err), 'error'); }
        }
      });
      loadList();
    }

    /* ----- Notifications ----- */
    function notifications(p){
      const u = me();
      p.innerHTML = toHtml(html`<div class="card"><div class="card-head"><h3>Security notifications</h3></div><form id="notifForm" class="card-body">
        <label class="check"><input type="checkbox" name="notifyNewLogin" ${u.notifyNewLogin !== false ? raw('checked') : ''}> Email me when my account signs in from a new device or browser</label>
        <label class="check"><input type="checkbox" name="notifySecurity" ${u.notifySecurity !== false ? raw('checked') : ''}> Email me when an administrator changes my account status</label>
        <p class="muted small">Password changes, email changes and role changes are always notified for your protection. Follow-up, payment and document alerts are configured by your administrator in Settings.</p>
        <button class="btn-primary" id="notifSave" type="submit">Save preferences</button></form></div>`);
      const form = $('#notifForm', p); const btn = $('#notifSave', p);
      form.addEventListener('submit', async (e) => {
        e.preventDefault(); AP().busy(btn, true, 'Saving…');
        try { NL.auth.setSession(await S.updateProfile({ notifyNewLogin: form.notifyNewLogin.checked, notifySecurity: form.notifySecurity.checked })); ui.toast('Notification preferences saved'); }
        catch (err){ ui.toast(AP().friendly(err), 'error'); }
        finally { AP().busy(btn, false); }
      });
    }

    /* ----- Access ----- */
    function access(p){
      const perms = NL.auth.permissions; const role = NL.auth.role || {};
      p.innerHTML = toHtml(w.card(`Your permissions (${perms.length})`, perms.length ? html`<p class="muted small">Role: <b>${role.name}</b> · data scope: ${{ all: 'all records', team: 'your team', own: 'your own records' }[role.scope] || '—'}</p>
        <div class="chip-list">${RB.PERMISSION_GROUPS.flatMap(([, ps]) => ps).filter(([k]) => perms.includes(k)).map(([, l]) => html`<span class="chip static">${l}</span>`)}</div>`
        : html`<div class="notice">Your account has no role yet. An administrator needs to assign one in Users → Assign role.</div>`));
    }

    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ptab]'); if (!b) return;
      tab = b.dataset.ptab; $$('[data-ptab]', el).forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-selected', String(x === b)); });
      const pn = $('#ppanel', el); pn.setAttribute('aria-labelledby', 'ptab-' + tab); pn.innerHTML = ''; panel();
      try { history.replaceState(null, '', '#/profile?tab=' + tab); } catch (err){}
    });
    el.addEventListener('keydown', (e) => {
      const b = e.target.closest('[data-ptab]'); if (!b || !['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
      const all = $$('[data-ptab]', el); const i = all.indexOf(b); const n = all[(i + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length]; n.focus(); n.click();
    });
    // Refresh the user from the server so the page never shows stale data.
    ui.load(el, () => NL.auth.refreshUser(), () => draw(), { what: 'your profile', rows: 4 });
  }

  /* ================= CHANGE PASSWORD ================= */
  function changePassword(el){
    const forced = NL.auth.mustChangePassword;
    const u = NL.auth.user; const f = AP();
    el.innerHTML = toHtml(html`${w.pageHead({ title: forced ? 'Set a new password' : 'Change password', sub: forced ? 'Your account uses a temporary password. Choose a new one to continue.' : 'Use a password you don’t use anywhere else.' })}
      <div class="card narrow-card"><form id="cpForm" class="card-body" novalidate>
        <div class="form-alert" id="authAlert" role="alert" tabindex="-1" hidden></div>
        <input type="text" name="username" value="${u.email}" autocomplete="username" hidden>
        ${f.passwordField({ name: 'currentPassword', label: forced ? 'Temporary password' : 'Current password', autocomplete: 'current-password' })}
        ${f.passwordField({ name: 'newPassword', label: 'New password', autocomplete: 'new-password', meter: true })}
        ${f.passwordField({ name: 'confirmPassword', label: 'Confirm new password', autocomplete: 'new-password' })}
        <label class="check"><input type="checkbox" id="cpOthers" checked> Sign out of all other devices</label>
        <div class="row-gap"><button class="btn-primary" id="cpSubmit" type="submit">Update password</button>${forced ? html`<button type="button" class="btn-ghost" id="cpLogout">Sign out</button>` : html`<a class="btn-ghost btn-link" href="#/profile?tab=security">Cancel</a>`}</div>
      </form></div>`);
    const form = $('#cpForm', el); const btn = $('#cpSubmit', el);
    f.wirePasswordToggles(form);
    const policy = () => ({ minLength: (st.settings().security || {}).passwordMinLength, requireUpper: (st.settings().security || {}).requireUpper, requireNumber: (st.settings().security || {}).requireNumber, requireSpecial: (st.settings().security || {}).requireSpecial });
    const ctx = () => ({ email: u.email, firstName: u.firstName, lastName: u.lastName, username: u.username });
    f.wireMeter(form, 'newPassword', ctx, policy);
    const lo = $('#cpLogout', el); if (lo) lo.onclick = () => NL.shell.logout();
    setTimeout(() => { const i = $('#af_currentPassword', el); if (i) i.focus(); }, 30);
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); if (btn.disabled) return;
      const cur = $('#af_currentPassword', el).value, next = $('#af_newPassword', el).value, conf = $('#af_confirmPassword', el).value;
      const errs = {};
      if (!cur) errs.currentPassword = 'Enter your current password.';
      const r = NL.passwordPolicy.evaluate(next, ctx(), policy());
      if (!next) errs.newPassword = 'Enter a new password.'; else if (!r.ok) errs.newPassword = r.errors.join(' '); else if (next === cur) errs.newPassword = 'Choose a password different from your current one.';
      if (!conf) errs.confirmPassword = 'Confirm your new password.'; else if (next && conf !== next) errs.confirmPassword = 'Passwords do not match.';
      const first = f.setErrors(form, errs); if (first){ first.focus(); return; }
      f.busy(btn, true, 'Updating…');
      try {
        const res = await S.changePassword(cur, next, conf, $('#cpOthers', el).checked);
        NL.auth.setSession(res);
        ui.toast(res.message || 'Your password has been changed.');
        location.hash = forced ? '#/dashboard' : '#/profile?tab=security';
      } catch (err){
        f.busy(btn, false);
        const errors = Object.assign({}, (err.details && err.details.errors) || {});
        if (errors.current && !errors.currentPassword) errors.currentPassword = errors.current;
        const f2 = f.setErrors(form, errors); const a = $('#authAlert', el); a.hidden = false; a.textContent = f.friendly(err); if (f2) f2.focus(); else a.focus();
      }
    });
  }

  NL.pages.profile = { title: 'My Profile', perm: null, crumbs: ['My Profile'], render: profile };
  NL.pages['change-password'] = { title: 'Change password', perm: null, crumbs: [['My Profile', '#/profile'], 'Change password'], render: changePassword };
})();
