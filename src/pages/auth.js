/* Public authentication pages (rendered outside the app shell):
     #/login  #/signup  #/check-email  #/verify-email?token=  #/resend-verification
     #/forgot-password  #/reset-password?token=
   Accessibility: every input has a visible label; errors are tied to inputs
   with aria-describedby + aria-invalid; the form alert is a live region and
   focus moves to the first problem. Submit buttons are disabled while a request
   runs (no double submits). Tokens from email links are moved from the URL
   into memory straight away so they don't linger in history. */
(function(){
  const { html, raw, toHtml, $, $$ } = NL.util;
  const S = NL.services.authService, ui = NL.ui, cfg = NL.config;
  const PP = NL.passwordPolicy, AV = NL.authValidation;
  const flash = {}; // in-memory hand-off between pages (never persisted)
  let mounted = null;

  /* ---------- building blocks ---------- */
  const POINTS = {
    login: ['🎯 Lead capture, scoring &amp; smart distribution', '📞 Counselling, calls &amp; follow-ups in one workspace', '📝 Applications, documents &amp; fee tracking', '📈 Funnel, counsellor &amp; campaign analytics'],
    signup: ['🔐 Your administrator approves access and assigns your role', '🎓 One record for every student, from first enquiry to enrolment', '🤝 Counsellors, finance and verification teams in one place', '🛡️ Encrypted sessions, audited access and role-based permissions']
  };
  function layout(variant, card){
    return html`<div class="login-page auth-page">
      <section class="login-brand" aria-label="${cfg.BRAND}">
        <div class="lb-top"><div class="brand-mark lg" aria-hidden="true">NL</div><div><div class="lb-brand">${cfg.BRAND}</div><div class="lb-sub">${cfg.SUBTITLE}</div></div></div>
        <h1>New Leaf University<br>Admission CRM</h1>
        <p class="lb-tag">${cfg.TAGLINE}</p>
        <ul class="lb-points">${(POINTS[variant] || POINTS.login).map(p => html`<li>${raw(p)}</li>`)}</ul>
        <p class="lb-secure"><span aria-hidden="true">🔒</span> Secure sign-in · Sessions are encrypted and every access is audited.</p>
      </section>
      <main class="login-panel" id="authMain">
        <div class="auth-stack ${variant === 'signup' ? 'wide' : ''}">${card}
          <p class="auth-legal">© ${new Date().getFullYear()} ${cfg.BRAND}. ${legalLinks()}</p>
        </div>
      </main>
    </div>`;
  }
  function legalLinks(){
    const t = cfg.LEGAL || {};
    return html`${t.termsUrl ? html`<a href="${t.termsUrl}" target="_blank" rel="noopener noreferrer">Terms</a> · ` : ''}${t.privacyUrl ? html`<a href="${t.privacyUrl}" target="_blank" rel="noopener noreferrer">Privacy</a>` : ''}`;
  }
  const brandMini = html`<div class="auth-mini-brand" aria-hidden="true"><span class="brand-mark">NL</span><span><b>${cfg.BRAND}</b><small>University Admission CRM</small></span></div>`;

  function field(o){
    const id = 'af_' + o.name; const req = o.required ? html`<span class="req" aria-hidden="true">*</span>` : html`<span class="opt">(optional)</span>`;
    const describedBy = [o.help ? id + '_help' : '', id + '_err'].filter(Boolean).join(' ');
    let input;
    if (o.type === 'select') input = html`<select id="${id}" name="${o.name}" ${o.required ? raw('required aria-required="true"') : ''} aria-describedby="${describedBy}" autocomplete="${o.autocomplete || 'off'}">
      <option value="">${o.placeholder || 'Select…'}</option>${(o.options || []).map(x => html`<option value="${x.value}" ${String(x.value) === String(o.value || '') ? raw('selected') : ''}>${x.label}</option>`)}</select>`;
    else input = html`<input id="${id}" name="${o.name}" type="${o.type || 'text'}" value="${o.value || ''}" autocomplete="${o.autocomplete || 'off'}" ${o.inputmode ? raw(`inputmode="${o.inputmode}"`) : ''}
      ${o.maxlength ? raw(`maxlength="${o.maxlength}"`) : ''} ${o.placeholder ? raw(`placeholder="${NL.util.escape(o.placeholder)}"`) : ''} ${o.required ? raw('required aria-required="true"') : ''}
      ${o.spellcheck === false ? raw('spellcheck="false" autocapitalize="off"') : ''} aria-describedby="${describedBy}">`;
    return html`<div class="field af ${o.half ? 'half' : ''}" data-field="${o.name}">
      <label for="${id}">${o.label} ${req}</label>${input}
      ${o.help ? html`<div class="field-help" id="${id}_help">${o.help}</div>` : ''}<div class="field-err" id="${id}_err"></div></div>`;
  }
  function passwordField(o){
    const id = 'af_' + o.name;
    return html`<div class="field af" data-field="${o.name}">
      <div class="label-row"><label for="${id}">${o.label} <span class="req" aria-hidden="true">*</span></label>${o.extra || ''}</div>
      <div class="pw-wrap"><input id="${id}" name="${o.name}" type="password" autocomplete="${o.autocomplete}" required aria-required="true" maxlength="128" spellcheck="false" autocapitalize="off"
        aria-describedby="${o.meter ? id + '_strength ' + id + '_reqs ' : ''}${id}_err">
        <button type="button" class="pw-toggle" data-pw-toggle="${id}" aria-controls="${id}" aria-pressed="false" aria-label="Show password">Show</button></div>
      ${o.meter ? html`<div class="pw-meter" data-meter="${id}" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
        <div class="pw-strength" id="${id}_strength" aria-live="polite"></div>
        <ul class="pw-reqs" id="${id}_reqs" aria-label="Password requirements"></ul>` : ''}
      <div class="field-err" id="${id}_err"></div></div>`;
  }
  function checkbox(name, labelHtml){
    const id = 'af_' + name;
    return html`<div class="field af check-field" data-field="${name}"><label class="check" for="${id}"><input type="checkbox" id="${id}" name="${name}" aria-describedby="${id}_err" required aria-required="true"> <span>${labelHtml}</span></label><div class="field-err" id="${id}_err"></div></div>`;
  }
  const alertBox = html`<div class="form-alert" id="authAlert" role="alert" tabindex="-1" hidden></div>`;

  /* ---------- behaviour helpers ---------- */
  function wirePasswordToggles(root){
    $$('[data-pw-toggle]', root).forEach(b => b.addEventListener('click', () => {
      const inp = document.getElementById(b.dataset.pwToggle); const show = inp.type === 'password';
      inp.type = show ? 'text' : 'password'; b.textContent = show ? 'Hide' : 'Show';
      b.setAttribute('aria-pressed', String(show)); b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    }));
  }
  const SCORE_CLASS = ['weak', 'weak', 'fair', 'good', 'strong'];
  /* Live strength meter + requirement checklist. ctx() returns the personal info to exclude. */
  function wireMeter(root, name, ctx, policy){
    const inp = $(`#af_${name}`, root); const meter = $(`[data-meter="af_${name}"]`, root); if (!inp || !meter) return;
    const label = $(`#af_${name}_strength`, root), list = $(`#af_${name}_reqs`, root);
    const upd = () => {
      const r = PP.evaluate(inp.value, ctx ? ctx() : {}, policy ? policy() : {});
      meter.className = 'pw-meter' + (inp.value ? ' s-' + SCORE_CLASS[r.score] : '');
      $$('span', meter).forEach((s, i) => s.classList.toggle('on', !!inp.value && i < Math.max(1, r.score)));
      label.textContent = inp.value ? `Password strength: ${r.label}` : '';
      list.innerHTML = toHtml(r.requirements.filter(q => q.required || q.id !== 'personal').map(q => html`<li class="${q.met ? 'met' : ''} ${q.required ? '' : 'rec'}"><span aria-hidden="true">${q.met ? '✓' : q.required ? '•' : '○'}</span> ${q.label}${q.required ? '' : html` <em>(recommended)</em>`}<span class="sr-only">${q.met ? ' — done' : q.required ? ' — required' : ''}</span></li>`));
      return r;
    };
    inp.addEventListener('input', upd); upd();
    return upd;
  }
  function setErrors(form, errors){
    $$('.af', form).forEach(f => { f.classList.remove('has-err'); const e = $('.field-err', f); if (e) e.textContent = ''; $$('input,select', f).forEach(i => i.removeAttribute('aria-invalid')); });
    let first = null;
    Object.entries(errors || {}).forEach(([k, msg]) => {
      const f = form.querySelector(`.af[data-field="${k}"]`); if (!f) return;
      f.classList.add('has-err'); $('.field-err', f).textContent = msg;
      const i = $('input,select', f); if (i){ i.setAttribute('aria-invalid', 'true'); if (!first) first = i; }
    });
    return first;
  }
  function showAlert(msg, kind, extraHtml){
    const a = $('#authAlert'); if (!a) return;
    a.className = 'form-alert' + (kind ? ' ' + kind : ''); a.hidden = !msg;
    a.innerHTML = toHtml(html`${msg || ''}${extraHtml || ''}`);
    if (msg){ a.focus({ preventScroll: false }); }
  }
  function busy(btn, on, text){
    if (on){ btn.dataset.label = btn.textContent; btn.disabled = true; btn.classList.add('loading'); btn.setAttribute('aria-busy', 'true'); btn.textContent = text || 'Please wait…'; }
    else { btn.disabled = false; btn.classList.remove('loading'); btn.removeAttribute('aria-busy'); if (btn.dataset.label) btn.textContent = btn.dataset.label; }
  }
  function friendly(err){
    if (!err) return "We couldn't complete your request. Please try again.";
    if (err.status === 429) return err.message || 'Too many attempts. Please wait a few minutes and try again.';
    if (err.status === 0 || err.status >= 500) return "We couldn't complete your request. Please try again.";
    return err.message;
  }
  function mount(title, variant, card, focusSel){
    if (mounted && mounted.cleanup) try { mounted.cleanup(); } catch (e){}
    ui.closeMenu();
    document.body.style.backgroundImage = '';
    document.body.innerHTML = toHtml(layout(variant, card));
    document.title = `${title} · ${cfg.BRAND}`;
    wirePasswordToggles(document.body);
    const f = focusSel && $(focusSel); if (f) setTimeout(() => f.focus(), 30);
    mounted = { cleanup: null };
    return mounted;
  }
  /* Pulls a token out of the URL (#/route?token=…) and removes it from history. */
  function takeToken(query, route){
    const t = query.token || '';
    if (t){ try { history.replaceState(null, '', location.pathname + location.search + '#/' + route); } catch (e){} flash[route + ':token'] = t; }
    return t || flash[route + ':token'] || '';
  }
  function demoMailbox(demoEmail){
    if (!demoEmail || cfg.APP_MODE !== 'demo') return '';
    return html`<div class="demo-mail" role="note"><div class="small"><b>Demo mailbox</b> — the in-browser demo has no mail server, so here is the email that would be sent to <b>${demoEmail.to}</b>:</div>
      <div class="dm-subject">${demoEmail.subject}</div><a class="btn-ghost btn-link btn-sm" href="${demoEmail.link}">Open the link from the email →</a></div>`;
  }

  /* ---------- CAPTCHA (only when the server asks for it) ---------- */
  const CAPTCHA_SRC = { turnstile: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', hcaptcha: 'https://js.hcaptcha.com/1/api.js?render=explicit', recaptcha: 'https://www.google.com/recaptcha/api.js?render=explicit' };
  const CAPTCHA_GLOBAL = { turnstile: 'turnstile', hcaptcha: 'hcaptcha', recaptcha: 'grecaptcha' };
  function loadScript(src){ return new Promise((res, rej) => { if ($(`script[src="${src}"]`)) return res(); const s = document.createElement('script'); s.src = src; s.async = true; s.onload = res; s.onerror = () => rej(new Error('captcha')); document.head.appendChild(s); }); }
  function captchaBox(form){
    let token = '', widget = null, provider = null;
    const host = $('.captcha-host', form);
    return {
      get token(){ return token; },
      async show(info){
        provider = (info && info.provider) || cfg.CAPTCHA.provider; const siteKey = (info && info.siteKey) || cfg.CAPTCHA.siteKey;
        if (!provider || provider === 'none' || !siteKey || !host) return;
        host.hidden = false; if (widget !== null) return this.reset();
        try {
          await loadScript(CAPTCHA_SRC[provider]);
          const g = () => window[CAPTCHA_GLOBAL[provider]];
          for (let i = 0; i < 50 && !(g() && g().render); i++) await new Promise(r => setTimeout(r, 100));
          widget = g().render($('.captcha-slot', host), { sitekey: siteKey, callback: (t) => { token = t; }, 'expired-callback': () => { token = ''; } });
        } catch (e){ host.querySelector('.captcha-slot').textContent = 'The security check could not load. Check your connection and refresh the page.'; }
      },
      reset(){ token = ''; try { const g = window[CAPTCHA_GLOBAL[provider]]; if (g && widget !== null) g.reset(widget); } catch (e){} }
    };
  }
  const captchaHtml = html`<div class="captcha-host" hidden><div class="small muted">Please complete the security check.</div><div class="captcha-slot"></div></div>`;

  /* ---------- redirect after sign-in ---------- */
  function afterLogin(query){
    if (NL.auth.mustChangePassword) return (location.hash = '#/change-password');
    const target = AV.safeReturnUrl(query.returnUrl || flash.returnUrl || '');
    delete flash.returnUrl;
    location.hash = '#' + (target || '/dashboard');
  }

  /* =========================== LOGIN =========================== */
  function login(query){
    const demoOn = cfg.DEMO_ACCOUNTS_ENABLED && NL.seed && NL.seed.DEMO_ACCOUNTS;
    if (query.returnUrl) flash.returnUrl = query.returnUrl;
    const card = html`<form class="login-card" id="loginForm" novalidate aria-labelledby="authTitle">
      ${brandMini}
      <h2 id="authTitle" tabindex="-1">Sign in</h2><p class="muted auth-sub">Use your username or work email.</p>
      ${alertBox}
      ${field({ name: 'identifier', label: 'Email or username', autocomplete: 'username', required: true, inputmode: 'email', spellcheck: false, maxlength: 254, value: flash.identifier || '' })}
      ${passwordField({ name: 'password', label: 'Password', autocomplete: 'current-password', extra: html`<a class="small" href="#/forgot-password" id="forgotLink">Forgot password?</a>` })}
      <label class="check remember" for="af_remember"><input type="checkbox" id="af_remember" name="remember"> <span>Remember me <span class="muted small">(stay signed in on this device for up to 30 days)</span></span></label>
      ${captchaHtml}
      <button class="btn-primary btn-block" id="loginSubmit" type="submit">Sign in</button>
      ${cfg.SIGNUP_ENABLED ? html`<div class="auth-divider"><span>Don't have an account?</span></div><a class="btn-ghost btn-link btn-block auth-alt" href="#/signup">Create account</a>` : ''}
      ${demoOn ? html`<div class="demo-accounts" aria-label="Demo accounts"><div class="small"><b>Demo accounts</b> — password <code>${NL.seed.DEMO_PASSWORD}</code> (${cfg.APP_MODE === 'demo' ? 'in-browser demo data only' : 'development server only'})</div>
        <div class="chips">${NL.seed.DEMO_ACCOUNTS.map(([u, r]) => html`<button type="button" class="chip" data-u="${u}">${r}</button>`)}</div>
        ${cfg.APP_MODE === 'demo' ? html`<button type="button" class="link-btn small" id="resetDemo">Reset demo data</button>` : ''}</div>` : ''}
    </form>`;
    mount('Sign in', 'login', card, flash.identifier ? '#af_password' : '#af_identifier');
    const form = $('#loginForm'), btn = $('#loginSubmit'); const cap = captchaBox(form);
    if (flash.loginMessage){ showAlert(flash.loginMessage.text, flash.loginMessage.kind); delete flash.loginMessage; }
    delete flash.identifier;
    $$('.chip[data-u]', form).forEach(c => (c.onclick = () => { $('#af_identifier').value = c.dataset.u; $('#af_password').value = NL.seed.DEMO_PASSWORD; $('#af_password').focus(); }));
    const rd = $('#resetDemo'); if (rd) rd.onclick = async () => { if (await ui.confirm({ title: 'Reset demo data', message: 'Delete all demo changes and restore the original sample dataset?', danger: true, confirmText: 'Reset' })){ NL.demoDb.reset(); location.reload(); } };
    $('#forgotLink').addEventListener('click', () => { const v = $('#af_identifier').value.trim(); if (AV.isEmail(v)) flash.forgotEmail = v; });
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); if (btn.disabled) return;
      showAlert('');
      const identifier = $('#af_identifier').value.trim(), password = $('#af_password').value;
      const errs = {}; if (!identifier) errs.identifier = 'Enter your email or username.'; if (!password) errs.password = 'Enter your password.';
      const first = setErrors(form, errs); if (first){ showAlert('Enter your email or username and password.'); first.focus(); return; }
      busy(btn, true, 'Signing in…');
      try {
        await NL.auth.login(identifier, password, $('#af_remember').checked, cap.token || undefined);
        NL.app.start().then(() => { afterLogin(query); const u = NL.auth.user; if (u) ui.toast(`Welcome, ${u.firstName || u.fullName.split(' ')[0]} — signed in as ${NL.auth.role.name}`); });
      } catch (err){
        busy(btn, false); $('#af_password').value = ''; cap.reset();
        if (err.code === 'AUTH_CAPTCHA_REQUIRED'){ await cap.show(err.details && err.details.captcha); showAlert(err.message, 'warn'); return; }
        if (err.code === 'AUTH_EMAIL_NOT_VERIFIED'){
          const email = (err.details && err.details.email) || (AV.isEmail(identifier) ? identifier : '');
          showAlert(err.message, 'warn', html` <button type="button" class="link-btn" id="resendInline">Resend verification email</button>`);
          const rb = $('#resendInline'); if (rb) rb.onclick = () => { flash.resendEmail = email; location.hash = '#/resend-verification'; };
          return;
        }
        showAlert(friendly(err), err.status === 429 ? 'warn' : '');
        if (err.status !== 429) $('#af_password').focus();
      }
    });
  }

  /* =========================== SIGN UP =========================== */
  function guessCountry(){ try { const m = /-([A-Z]{2})$/.exec(navigator.language || ''); return m && AV.COUNTRY_CODES.has(m[1]) ? m[1] : 'IN'; } catch (e){ return 'IN'; } }
  function signup(){
    if (!cfg.SIGNUP_ENABLED){
      mount('Create account', 'signup', html`<div class="login-card">${brandMini}<h2 id="authTitle" tabindex="-1">Sign-up is not available</h2>
        <p class="muted">New accounts are created by an administrator. Ask your administrator for an invitation.</p><a class="btn-primary btn-link btn-block" href="#/login">Back to sign in</a></div>`, '#authTitle');
      return;
    }
    const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e){ return 'UTC'; } })();
    const country = guessCountry(); const dial = (AV.countryByCode(country) || {}).dial || '';
    const v = flash.signupValues || {};
    const countries = AV.COUNTRIES.slice().sort((a, b) => a.name.localeCompare(b.name)).map(c => ({ value: c.code, label: c.name }));
    const zones = AV.timezoneOptions(tz, v.timezone).map(z => ({ value: z, label: z.replace(/_/g, ' ') }));
    const t = cfg.LEGAL || {};
    const legal = (url, label) => url ? html`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>` : html`<b>${label}</b>`;
    const card = html`<form class="login-card signup-card" id="signupForm" novalidate aria-labelledby="authTitle">
      ${brandMini}
      <h2 id="authTitle" tabindex="-1">Create your account</h2>
      <p class="muted auth-sub">For admissions teams and partner universities. After you verify your email, an administrator assigns your access.</p>
      ${alertBox}
      <div class="auth-grid">
        ${field({ name: 'firstName', label: 'First name', autocomplete: 'given-name', required: true, maxlength: 60, half: true, value: v.firstName })}
        ${field({ name: 'lastName', label: 'Last name', autocomplete: 'family-name', required: true, maxlength: 60, half: true, value: v.lastName })}
        ${field({ name: 'email', label: 'Work email', type: 'email', autocomplete: 'email', required: true, maxlength: 254, spellcheck: false, placeholder: 'name@university.edu', value: v.email })}
        ${field({ name: 'phone', label: 'Phone number', type: 'tel', autocomplete: 'tel', inputmode: 'tel', required: true, maxlength: 24, placeholder: dial ? `+${dial} …` : '+…', help: 'Include your country code.', value: v.phone })}
        ${field({ name: 'organization', label: 'Organization / University', autocomplete: 'organization', required: true, maxlength: 120, value: v.organization })}
        ${field({ name: 'jobTitle', label: 'Job title', autocomplete: 'organization-title', maxlength: 100, value: v.jobTitle })}
        ${field({ name: 'country', label: 'Country', type: 'select', autocomplete: 'country', required: true, options: countries, value: v.country || country, half: true })}
        ${field({ name: 'timezone', label: 'Timezone', type: 'select', required: true, options: zones, value: v.timezone || tz, half: true })}
        ${passwordField({ name: 'password', label: 'Password', autocomplete: 'new-password', meter: true })}
        ${passwordField({ name: 'confirmPassword', label: 'Confirm password', autocomplete: 'new-password' })}
      </div>
      ${checkbox('acceptTerms', html`I agree to the ${legal(t.termsUrl, 'Terms & Conditions')}`)}
      ${checkbox('acceptPrivacy', html`I agree to the ${legal(t.privacyUrl, 'Privacy Policy')}`)}
      ${captchaHtml}
      <button class="btn-primary btn-block" id="signupSubmit" type="submit">Create account</button>
      <p class="auth-switch">Already have an account? <a href="#/login">Sign in</a></p>
    </form>`;
    mount('Create account', 'signup', card, '#af_firstName');
    delete flash.signupValues;
    const form = $('#signupForm'), btn = $('#signupSubmit'); const cap = captchaBox(form);
    if (cfg.CAPTCHA.onSignup) cap.show();
    const val = (n) => { const el = form.querySelector(`[name="${n}"]`); return el.type === 'checkbox' ? el.checked : el.value; };
    const policy = () => ({ minLength: (NL.store.settings().security || {}).passwordMinLength });
    wireMeter(form, 'password', () => ({ email: val('email'), firstName: val('firstName'), lastName: val('lastName') }), policy);
    $('#af_country').addEventListener('change', () => { const c = AV.countryByCode(val('country')); $('#af_phone').placeholder = c ? `+${c.dial} …` : '+…'; });

    function validate(){
      const body = { firstName: val('firstName'), lastName: val('lastName'), email: val('email'), phone: val('phone'), organization: val('organization'), jobTitle: val('jobTitle'),
        country: val('country'), timezone: val('timezone'), acceptTerms: val('acceptTerms'), acceptPrivacy: val('acceptPrivacy') };
      const { errors } = AV.validateSignup(body);
      const pw = val('password'), cpw = val('confirmPassword');
      if (!pw) errors.password = 'Password is required.';
      else { const r = PP.evaluate(pw, { email: body.email, firstName: body.firstName, lastName: body.lastName }, policy()); if (!r.ok) errors.password = r.errors.join(' '); }
      if (!cpw) errors.confirmPassword = 'Confirm your password.'; else if (pw && cpw !== pw) errors.confirmPassword = 'Passwords do not match.';
      return { body: Object.assign(body, { password: pw, confirmPassword: cpw }), errors };
    }
    // Validate a field when the user leaves it (only once they have typed something).
    form.addEventListener('focusout', (e) => {
      const f = e.target.closest('.af'); if (!f || !e.target.value) return;
      const { errors } = validate(); const k = f.dataset.field;
      const errEl = $('.field-err', f); f.classList.toggle('has-err', !!errors[k]); errEl.textContent = errors[k] || '';
      if (errors[k]) e.target.setAttribute('aria-invalid', 'true'); else e.target.removeAttribute('aria-invalid');
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); if (btn.disabled) return;
      showAlert('');
      const { body, errors } = validate();
      const first = setErrors(form, errors);
      if (first){ showAlert(`Please fix ${Object.keys(errors).length === 1 ? 'the highlighted field' : 'the ' + Object.keys(errors).length + ' highlighted fields'}.`); first.focus(); return; }
      busy(btn, true, 'Creating account…');
      try {
        const res = await S.signup(Object.assign(body, { captchaToken: cap.token || undefined }));
        flash.checkEmail = { email: res.email || body.email, demoEmail: res.demoEmail };
        location.hash = '#/check-email';
      } catch (err){
        busy(btn, false); cap.reset();
        if (err.code === 'AUTH_CAPTCHA_REQUIRED'){ await cap.show(err.details && err.details.captcha); showAlert(err.message, 'warn'); return; }
        const f2 = setErrors(form, (err.details && err.details.errors) || {});
        showAlert(friendly(err)); if (f2) f2.focus();
        $('#af_password').value = ''; $('#af_confirmPassword').value = ''; $('#af_password').dispatchEvent(new Event('input'));
      }
    });
  }

  /* =========================== CHECK EMAIL =========================== */
  function checkEmail(){
    const info = flash.checkEmail || {};
    const card = html`<div class="login-card auth-result" aria-labelledby="authTitle">
      ${brandMini}<div class="result-ico info" aria-hidden="true">✉️</div>
      <h2 id="authTitle" tabindex="-1">Verify your email</h2>
      <p>Please verify your email address. ${info.email ? html`We sent a verification link to <b>${info.email}</b>.` : 'We sent a verification link to your inbox.'}</p>
      <p class="muted small">If this address already has an account, we sent sign-in help instead. The link expires in 24 hours. Check your spam folder if you don't see it.</p>
      ${alertBox}
      ${demoMailbox(info.demoEmail)}
      ${info.email ? html`<button class="btn-ghost btn-block" id="resendBtn" type="button">Resend verification email</button>` : html`<a class="btn-ghost btn-link btn-block" href="#/resend-verification">Resend verification email</a>`}
      <a class="btn-primary btn-link btn-block" href="#/login">Continue to sign in</a>
    </div>`;
    mount('Verify your email', 'signup', card, '#authTitle');
    const rb = $('#resendBtn');
    if (rb) rb.addEventListener('click', async () => {
      busy(rb, true, 'Sending…');
      try { const r = await S.resendVerification(info.email); showAlert(r.message, 'ok'); if (r.demoEmail){ info.demoEmail = r.demoEmail; } cooldown(rb, 60); }
      catch (err){ busy(rb, false); showAlert(friendly(err)); }
    });
  }
  function cooldown(btn, s){
    btn.classList.remove('loading'); btn.disabled = true;
    const label = btn.dataset.label || btn.textContent; let n = s;
    const t = setInterval(() => { n--; btn.textContent = `${label} (${n}s)`; if (n <= 0 || !btn.isConnected){ clearInterval(t); btn.disabled = false; btn.textContent = label; } }, 1000);
    btn.textContent = `${label} (${n}s)`;
  }

  /* =========================== VERIFY EMAIL =========================== */
  async function verifyEmail(query){
    const token = takeToken(query, 'verify-email');
    mount('Verifying email', 'signup', html`<div class="login-card auth-result" aria-live="polite" aria-busy="true">${brandMini}<div class="loading-text"><span class="spinner"></span> Verifying your email…</div></div>`);
    let res, err;
    try { if (!token) throw Object.assign(new Error('This link is invalid or has expired. Request a new one.'), { code: 'AUTH_TOKEN_INVALID' }); res = await S.verifyEmail(token); }
    catch (e){ err = e; }
    delete flash['verify-email:token'];
    if (res){
      if (NL.auth.isAuthenticated && res.type === 'email_change') await NL.auth.logout({ skipServer: true });
      mount('Email verified', 'signup', html`<div class="login-card auth-result" aria-labelledby="authTitle">${brandMini}<div class="result-ico ok" aria-hidden="true">✓</div>
        <h2 id="authTitle" tabindex="-1">${res.type === 'email_change' ? 'Email address updated' : 'Email verified'}</h2><p>${res.message}</p>
        ${res.type === 'email_change' ? '' : html`<p class="muted small">You can sign in now. If you're new, an administrator will assign your access.</p>`}
        <a class="btn-primary btn-link btn-block" href="${NL.auth.isAuthenticated ? '#/profile' : '#/login'}">${NL.auth.isAuthenticated ? 'Go to my profile' : 'Continue to Sign In'}</a></div>`, '#authTitle');
    } else {
      mount('Verification failed', 'signup', html`<div class="login-card auth-result" aria-labelledby="authTitle">${brandMini}<div class="result-ico bad" aria-hidden="true">!</div>
        <h2 id="authTitle" tabindex="-1">This link can't be used</h2><p>${err.code === 'AUTH_TOKEN_INVALID' ? 'This verification link is invalid, has expired or was already used.' : friendly(err)}</p>
        <a class="btn-primary btn-link btn-block" href="#/resend-verification">Send a new verification link</a><a class="btn-ghost btn-link btn-block" href="#/login">Back to sign in</a></div>`, '#authTitle');
    }
  }

  /* =========================== RESEND VERIFICATION =========================== */
  function simpleEmailForm(o){
    const card = html`<form class="login-card" id="emailForm" novalidate aria-labelledby="authTitle">
      ${brandMini}<h2 id="authTitle" tabindex="-1">${o.title}</h2><p class="muted auth-sub">${o.sub}</p>
      ${alertBox}
      ${field({ name: 'email', label: 'Email', type: 'email', autocomplete: 'email', required: true, spellcheck: false, maxlength: 254, value: o.value || '' })}
      ${captchaHtml}
      <button class="btn-primary btn-block" id="emailSubmit" type="submit">${o.submit}</button>
      <p class="auth-switch"><a href="#/login">← Back to sign in</a></p></form>`;
    mount(o.title, 'login', card, '#af_email');
    const form = $('#emailForm'), btn = $('#emailSubmit'); const cap = captchaBox(form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); if (btn.disabled) return; showAlert('');
      const email = $('#af_email').value.trim();
      const first = setErrors(form, AV.isEmail(email) ? {} : { email: 'Enter a valid email address.' }); if (first){ first.focus(); return; }
      busy(btn, true, 'Sending…');
      try {
        const r = await o.send(email, cap.token || undefined);
        busy(btn, false); cap.reset();
        showAlert(r.message, 'ok', demoMailbox(r.demoEmail)); cooldown(btn, 60);
      } catch (err){
        busy(btn, false); cap.reset();
        if (err.code === 'AUTH_CAPTCHA_REQUIRED'){ await cap.show(err.details && err.details.captcha); showAlert(err.message, 'warn'); return; }
        setErrors(form, (err.details && err.details.errors) || {}); showAlert(friendly(err));
      }
    });
  }
  function resendVerification(){
    const v = flash.resendEmail; delete flash.resendEmail;
    simpleEmailForm({ title: 'Resend verification email', sub: "Enter the email you signed up with and we'll send a new verification link.", submit: 'Send verification link', value: v, send: (email) => S.resendVerification(email) });
  }
  function forgotPassword(){
    const v = flash.forgotEmail; delete flash.forgotEmail;
    simpleEmailForm({ title: 'Forgot your password?', sub: "Enter the email address for your account. If it matches an account, we'll send a link to reset your password.", submit: 'Send Reset Link', value: v,
      send: (email, captchaToken) => S.forgotPassword(email, captchaToken) });
  }

  /* =========================== RESET PASSWORD =========================== */
  async function resetPassword(query){
    const token = takeToken(query, 'reset-password');
    mount('Reset password', 'login', html`<div class="login-card auth-result" aria-busy="true">${brandMini}<div class="loading-text"><span class="spinner"></span> Checking your link…</div></div>`);
    let info;
    try { if (!token) throw Object.assign(new Error('invalid'), { code: 'AUTH_TOKEN_INVALID' }); info = await S.validateResetToken(token); }
    catch (err){
      mount('Link expired', 'login', html`<div class="login-card auth-result" aria-labelledby="authTitle">${brandMini}<div class="result-ico bad" aria-hidden="true">!</div>
        <h2 id="authTitle" tabindex="-1">This link can't be used</h2><p>${err.code === 'AUTH_TOKEN_INVALID' ? 'This password link is invalid, has expired or was already used. Links expire after a short time for your security.' : friendly(err)}</p>
        <a class="btn-primary btn-link btn-block" href="#/forgot-password">Request a new link</a><a class="btn-ghost btn-link btn-block" href="#/login">Back to sign in</a></div>`, '#authTitle');
      return;
    }
    const invite = info.type === 'invitation';
    const card = html`<form class="login-card" id="resetForm" novalidate aria-labelledby="authTitle">
      ${brandMini}<h2 id="authTitle" tabindex="-1">${invite ? 'Set your password' : 'Choose a new password'}</h2>
      <p class="muted auth-sub">${invite ? html`Welcome${info.firstName ? ', ' + info.firstName : ''}! Set a password for <b>${info.email}</b> to activate your account.` : html`For <b>${info.email}</b>. After the change you'll be signed out everywhere and asked to sign in again.`}</p>
      ${alertBox}
      <input type="text" name="username" value="${info.email}" autocomplete="username" hidden>
      ${passwordField({ name: 'password', label: 'New password', autocomplete: 'new-password', meter: true })}
      ${passwordField({ name: 'confirmPassword', label: 'Confirm new password', autocomplete: 'new-password' })}
      <button class="btn-primary btn-block" id="resetSubmit" type="submit">${invite ? 'Set password' : 'Reset password'}</button>
      <p class="auth-switch"><a href="#/login">← Back to sign in</a></p></form>`;
    mount(invite ? 'Set your password' : 'Reset password', 'login', card, '#af_password');
    const form = $('#resetForm'), btn = $('#resetSubmit');
    const policy = () => ({ minLength: (NL.store.settings().security || {}).passwordMinLength });
    const ctx = () => ({ email: info.email, firstName: info.firstName });
    wireMeter(form, 'password', ctx, policy);
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); if (btn.disabled) return; showAlert('');
      const pw = $('#af_password').value, cpw = $('#af_confirmPassword').value; const errs = {};
      const r = PP.evaluate(pw, ctx(), policy()); if (!pw) errs.password = 'Enter a new password.'; else if (!r.ok) errs.password = r.errors.join(' ');
      if (!cpw) errs.confirmPassword = 'Confirm your new password.'; else if (pw !== cpw) errs.confirmPassword = 'Passwords do not match.';
      const first = setErrors(form, errs); if (first){ first.focus(); return; }
      busy(btn, true, 'Saving…');
      try {
        const res = await S.resetPassword(token, pw, cpw);
        delete flash['reset-password:token'];
        if (NL.auth.isAuthenticated) await NL.auth.logout({ skipServer: true });
        mount('Password updated', 'login', html`<div class="login-card auth-result" aria-labelledby="authTitle">${brandMini}<div class="result-ico ok" aria-hidden="true">✓</div>
          <h2 id="authTitle" tabindex="-1">${invite ? 'Password set' : 'Password reset'}</h2><p>${res.message}</p>
          <a class="btn-primary btn-link btn-block" href="#/login">Continue to Sign In</a></div>`, '#authTitle');
        flash.identifier = info.email;
      } catch (err){
        busy(btn, false);
        const f = setErrors(form, (err.details && err.details.errors) || {}); showAlert(friendly(err)); if (f) f.focus();
      }
    });
  }

  const PAGES = { login, signup, 'check-email': checkEmail, 'verify-email': verifyEmail, 'resend-verification': resendVerification, 'forgot-password': forgotPassword, 'reset-password': resetPassword };
  NL.authPages = {
    ROUTES: Object.keys(PAGES),
    /* Routes a signed-in user may still open (the others bounce to the dashboard). */
    ALLOWED_WHEN_SIGNED_IN: ['verify-email', 'reset-password'],
    render(name, query){ (PAGES[name] || login)(query || {}); },
    setLoginMessage(text, kind){ flash.loginMessage = text ? { text, kind: kind || 'warn' } : null; },
    setReturnUrl(url){ flash.returnUrl = url; },
    // shared with the in-app security pages
    field, passwordField, wirePasswordToggles, wireMeter, setErrors, busy, friendly
  };
})();
