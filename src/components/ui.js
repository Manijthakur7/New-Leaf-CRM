/* Core UI components: toast, modal stack, confirm, forms, menus, state views. */
(function(){
  const { html, raw, toHtml, $, $$, escape } = NL.util;

  /* ---------- Toast (retained from LeafPulse, now stackable with variants) ---------- */
  function toast(msg, variant){
    let host = $('#toastHost'); if (!host){ host = NL.util.el('div', { id: 'toastHost', class: 'toast-host', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(host); }
    const t = NL.util.el('div', { class: 'toast ' + (variant || 'ok') }, html`<span class="toast-ico">${variant === 'error' ? '⚠️' : variant === 'warn' ? '⚠️' : variant === 'info' ? 'ℹ️' : '✓'}</span><span>${msg}</span>`);
    host.appendChild(t); requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 250); }, variant === 'error' ? 4200 : 2600);
  }

  /* ---------- Modal stack ---------- */
  const stack = [];
  function modal(opts){
    const ov = NL.util.el('div', { class: 'overlay open', role: 'dialog', 'aria-modal': 'true' });
    ov.style.zIndex = 200 + stack.length * 10;
    ov.innerHTML = toHtml(html`<div class="modal ${opts.size ? 'modal-' + opts.size : ''}">
      <header><h2>${opts.title}</h2><button class="x" data-close aria-label="Close">&times;</button></header>
      <div class="modal-content">${opts.body || ''}</div>
      ${opts.footer === false ? '' : html`<footer>${opts.footer || html`<button class="btn-ghost" data-close>Close</button>`}</footer>`}
    </div>`);
    document.body.appendChild(ov);
    const inst = {
      el: ov, body: $('.modal-content', ov), footer: $('footer', ov),
      close(result){ if (inst.closed) return; inst.closed = true; ov.remove(); const i = stack.indexOf(inst); if (i > -1) stack.splice(i, 1); if (opts.onClose) opts.onClose(result); }
    };
    ov.addEventListener('click', (e) => { if (e.target === ov && opts.dismissable !== false) inst.close(); if (e.target.closest('[data-close]')) inst.close(); });
    stack.push(inst);
    setTimeout(() => { const f = $('input:not([type=hidden]):not([readonly]),select,textarea', ov); if (f && opts.autofocus !== false) f.focus(); }, 30);
    return inst;
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && stack.length){ const top = stack[stack.length - 1]; if (!top.el.querySelector('.modal[data-busy]')) top.close(); } });

  /* confirm → Promise<false | true | {reason}> */
  function confirm(o){
    return new Promise((resolve) => {
      const m = modal({ title: o.title || 'Please confirm', size: 'sm', dismissable: true,
        body: html`<div class="confirm-body">${o.danger ? html`<div class="confirm-ico danger">!</div>` : html`<div class="confirm-ico">?</div>`}<div><p class="confirm-msg">${o.message}</p>${o.detail ? html`<p class="muted small" style="white-space:pre-line">${o.detail}</p>` : ''}
          ${o.reason ? html`<div class="field"><label>${o.reasonLabel || 'Reason'}${o.reasonRequired ? ' *' : ''}</label><textarea id="cfReason" rows="3" placeholder="${o.reasonPlaceholder || ''}"></textarea><div class="field-err" id="cfErr"></div></div>` : ''}</div></div>`,
        footer: html`<button class="btn-ghost" data-close>${o.cancelText || 'Cancel'}</button><button class="${o.danger ? 'btn-danger-solid' : 'btn-primary'}" id="cfOk">${o.confirmText || 'Confirm'}</button>`,
        onClose: (r) => resolve(r || false), autofocus: !!o.reason });
      $('#cfOk', m.el).addEventListener('click', () => {
        if (o.reason){ const v = $('#cfReason', m.el).value.trim(); if (o.reasonRequired && !v){ $('#cfErr', m.el).textContent = (o.reasonLabel || 'Reason') + ' is required'; return; } m.close({ reason: v }); }
        else m.close(true);
      });
    });
  }

  /* ---------- Forms ---------- */
  function resolveOptions(f, values){ const o = typeof f.options === 'function' ? f.options(values || {}) : f.options || []; return o.map(x => typeof x === 'object' ? x : { value: x, label: x }); }
  function fieldHtml(f, values){
    const v = values[f.name] == null ? (f.default == null ? '' : f.default) : values[f.name];
    const id = 'f_' + f.name; const req = f.required ? html`<span class="req">*</span>` : '';
    const attrs = raw(`${f.readonly ? 'readonly' : ''} ${f.disabled ? 'disabled' : ''} ${f.min != null ? `min="${escape(f.min)}"` : ''} ${f.max != null ? `max="${escape(f.max)}"` : ''} ${f.step ? `step="${escape(f.step)}"` : ''}`);
    let input;
    if (f.type === 'select'){
      const opts = resolveOptions(f, values);
      input = html`<select id="${id}" name="${f.name}" ${attrs}>${f.placeholder !== false ? html`<option value="">${f.placeholder || '— Select —'}</option>` : ''}${opts.map(o => html`<option value="${o.value}" ${String(o.value) === String(v) ? raw('selected') : ''}>${o.label}</option>`)}</select>`;
    } else if (f.type === 'textarea') input = html`<textarea id="${id}" name="${f.name}" rows="${f.rows || 3}" placeholder="${f.placeholder || ''}" ${attrs}>${v}</textarea>`;
    else if (f.type === 'checkbox') return html`<div class="field ${f.full ? 'full' : ''}" data-field="${f.name}"><label class="check"><input type="checkbox" id="${id}" name="${f.name}" ${v ? raw('checked') : ''} ${attrs}> ${f.label}</label>${f.help ? html`<div class="field-help">${f.help}</div>` : ''}</div>`;
    else if (f.type === 'file') input = html`<input type="file" id="${id}" name="${f.name}" accept="${f.accept || ''}" ${attrs}>`;
    else {
      const type = f.type === 'datetime' ? 'datetime-local' : f.type || 'text';
      const val = f.type === 'datetime' ? NL.fmt.dateLocalInput(v) : f.type === 'date' && v ? String(v).slice(0, 10) : v;
      input = html`<input type="${type}" id="${id}" name="${f.name}" value="${val}" placeholder="${f.placeholder || ''}" autocomplete="${f.autocomplete || 'off'}" ${f.type === 'tel' ? raw('inputmode="tel"') : ''} ${attrs}>`;
    }
    return html`<div class="field ${f.full ? 'full' : ''}" data-field="${f.name}" ${f.hidden ? raw('hidden') : ''}><label for="${id}">${f.label} ${req}</label>${input}${f.help ? html`<div class="field-help">${f.help}</div>` : ''}<div class="field-err"></div></div>`;
  }
  function renderForm(fields, values, cols){
    return html`<form class="form-grid ${cols === 1 ? 'one-col' : ''}" novalidate>${fields.map(f => f.section ? html`<div class="form-section full">${f.section}</div>` : fieldHtml(f, values || {}))}</form>`;
  }
  function readForm(root, fields){
    const out = {};
    fields.filter(f => f.name).forEach(f => {
      const el = root.querySelector(`[name="${f.name}"]`); if (!el) return;
      if (f.type === 'checkbox') out[f.name] = el.checked;
      else if (f.type === 'file') out[f.name] = el.files && el.files[0] || null;
      else if (f.type === 'datetime') out[f.name] = el.value ? new Date(el.value).toISOString() : '';
      else if (f.type === 'number') out[f.name] = el.value === '' ? '' : Number(el.value);
      else out[f.name] = el.value.trim();
    });
    return out;
  }
  function showErrors(root, errors){
    $$('.field', root).forEach(f => { f.classList.remove('has-err'); const e = $('.field-err', f); if (e) e.textContent = ''; });
    let first = null;
    Object.entries(errors || {}).forEach(([k, msg]) => { const f = root.querySelector(`[data-field="${k}"]`); if (f){ f.classList.add('has-err'); const e = $('.field-err', f); if (e) e.textContent = msg; if (!first) first = f; } });
    if (first){ const i = $('input,select,textarea', first); if (i) i.focus(); }
    return !!first;
  }
  function validateFields(fields, values){
    const rules = {}, labels = {};
    fields.filter(f => f.name && !f.hidden).forEach(f => {
      const r = [];
      if (f.required) r.push('required');
      if (f.type === 'email') r.push('email');
      if (f.type === 'tel') r.push('mobile');
      if (f.type === 'date' || f.type === 'datetime') r.push('date');
      (f.rules || []).forEach(x => r.push(x));
      if (r.length){ rules[f.name] = r; labels[f.name] = f.label; }
    });
    return NL.validate.check(values, rules, labels);
  }
  /* Re-render dependent selects when a parent field changes */
  function wireDependencies(root, fields, getValues){
    fields.filter(f => f.dependsOn).forEach(f => {
      [].concat(f.dependsOn).forEach(dep => {
        const src = root.querySelector(`[name="${dep}"]`); if (!src) return;
        src.addEventListener('change', () => {
          const vals = getValues(); const el = root.querySelector(`[name="${f.name}"]`); if (!el) return;
          const cur = el.value; const opts = resolveOptions(f, vals);
          el.innerHTML = toHtml(html`<option value="">${f.placeholder || '— Select —'}</option>${opts.map(o => html`<option value="${o.value}">${o.label}</option>`)}`);
          if (opts.some(o => String(o.value) === cur)) el.value = cur;
          el.dispatchEvent(new Event('change'));
        });
      });
    });
  }

  /* formModal: validation + submit + server error mapping. Resolves with onSubmit's result or null. */
  function formModal(o){
    return new Promise((resolve) => {
      let done = false;
      const m = modal({ title: o.title, size: o.size || (o.fields.length > 6 ? 'lg' : ''),
        body: html`${o.intro ? html`<div class="form-intro">${o.intro}</div>` : ''}<div class="form-alert" hidden></div>${renderForm(o.fields, o.values || {}, o.cols)}`,
        footer: html`${o.extraFooter || ''}<span class="spacer"></span><button class="btn-ghost" data-close>Cancel</button><button class="btn-primary" data-submit>${o.submitLabel || 'Save'}</button>`,
        onClose: () => { if (!done) resolve(null); } });
      const form = $('form', m.el); const alertEl = $('.form-alert', m.el); const btn = $('[data-submit]', m.el);
      const values = () => Object.assign({}, o.values || {}, readForm(form, o.fields));
      wireDependencies(form, o.fields, values);
      if (o.onMount) o.onMount(m, form, values);
      const submit = async (e) => {
        if (e) e.preventDefault();
        const v = values(); alertEl.hidden = true;
        const errs = Object.assign(validateFields(o.fields, v), o.validate ? o.validate(v) || {} : {});
        if (showErrors(form, errs)) return;
        btn.disabled = true; btn.classList.add('loading'); m.el.querySelector('.modal').setAttribute('data-busy', '');
        try {
          const res = await o.onSubmit(v, m);
          if (res === false) return;
          done = true; m.close(); resolve(res === undefined ? true : res);
        } catch (err){
          if (err && err.details && err.details.errors) showErrors(form, err.details.errors);
          if (!(err && err.handled)){ alertEl.hidden = false; alertEl.textContent = (err && err.message) || 'Could not save. Please try again.'; }
        } finally { if (!m.closed){ btn.disabled = false; btn.classList.remove('loading'); const md = m.el.querySelector('.modal'); if (md) md.removeAttribute('data-busy'); } }
      };
      btn.addEventListener('click', submit); form.addEventListener('submit', submit);
    });
  }

  /* ---------- Popover menu ---------- */
  let openMenu = null;
  function closeMenu(){ if (openMenu){ openMenu.remove(); openMenu = null; } }
  function menu(anchor, items){
    closeMenu();
    const m = NL.util.el('div', { class: 'menu-pop', role: 'menu' });
    m.innerHTML = toHtml(items.filter(Boolean).map((it, i) => it === '-' ? html`<div class="menu-sep"></div>` : it.header ? html`<div class="menu-header">${it.header}</div>` :
      html`<button type="button" class="menu-item ${it.danger ? 'danger' : ''}" data-i="${i}" ${it.disabled ? raw('disabled') : ''} role="menuitem"><span class="mi-ico">${it.icon || ''}</span>${it.label}</button>`));
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect(); const mw = m.offsetWidth, mh = m.offsetHeight;
    let left = Math.min(window.innerWidth - mw - 8, Math.max(8, r.right - mw)); let top = r.bottom + 4;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
    m.style.left = left + 'px'; m.style.top = top + 'px';
    m.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (!b) return; const it = items.filter(Boolean)[Number(b.dataset.i)]; closeMenu(); if (it && it.onClick) it.onClick(); });
    setTimeout(() => (openMenu = m), 0);
  }
  document.addEventListener('click', (e) => { if (openMenu && !openMenu.contains(e.target)) closeMenu(); });
  window.addEventListener('resize', closeMenu); document.addEventListener('scroll', closeMenu, true);

  /* ---------- State views ---------- */
  function skeleton(rows, text){ return html`<div class="skeleton-wrap" aria-busy="true"><div class="loading-text"><span class="spinner"></span>${text || 'Loading…'}</div>${Array.from({ length: rows || 6 }).map(() => html`<div class="sk-row"><span class="sk sk-a"></span><span class="sk sk-b"></span><span class="sk sk-c"></span><span class="sk sk-d"></span></div>`)}</div>`; }
  function skeletonCards(n){ return html`<div class="sk-cards">${Array.from({ length: n || 4 }).map(() => html`<div class="sk-card"><span class="sk sk-b"></span><span class="sk sk-big"></span></div>`)}</div>`; }
  function empty(o){
    return html`<div class="empty-state"><div class="empty-ico">${o.icon || '📭'}</div><div class="big">${o.title || 'Nothing here yet'}</div><div class="muted">${o.text || ''}</div>
      ${o.actions && o.actions.length ? html`<div class="empty-actions">${o.actions.map((a, i) => html`<button class="${i === o.actions.length - 1 ? 'btn-primary' : 'btn-ghost'}" data-action="${a.action}">${a.label}</button>`)}</div>` : ''}</div>`;
  }
  function errorView(err, what){
    const msg = err && err.status === 403 ? 'You do not have permission to view this.' : (err && err.message) || 'Something went wrong.';
    return html`<div class="empty-state error-state"><div class="empty-ico">⚠️</div><div class="big">Unable to load ${what || 'data'}.</div><div class="muted">${msg}</div>
      ${err && err.status === 403 ? '' : html`<div class="empty-actions"><button class="btn-primary" data-action="retry">Retry</button></div>`}</div>`;
  }
  /* Load → render with loading / error+retry handling. */
  async function load(container, loader, render, o){
    o = o || {};
    const run = async () => {
      if (o.skeleton !== false) container.innerHTML = toHtml(o.cards ? skeletonCards(o.cards) : skeleton(o.rows, o.loadingText));
      try { const data = await loader(); if (!container.isConnected && o.requireConnected) return; render(data); }
      catch (err){
        if (err && err.status === 401) return;
        container.innerHTML = toHtml(errorView(err, o.what));
        const b = container.querySelector('[data-action="retry"]'); if (b) b.addEventListener('click', (e) => { e.stopPropagation(); run(); });
      }
    };
    return run();
  }

  /* ---------- Badges ---------- */
  const STATUS = {
    green: ['Active','Verified','Successful','Completed','Paid','Confirmed','Enrolled','Admission Confirmed','Enrollment Completed','Payment Completed','Documents Verified','Available','Connected','Interested','Yes'],
    blue: ['Uploaded','Initiated','In Progress','Submitted','Contacted','Application Started','Application Form Completed','Documents Submitted','On Call','Incoming','Outgoing','Callback','Upcoming','Online'],
    purple: ['Under Review','Qualified','Application Submitted','University Review','Documents Under Verification','Counselling'],
    teal: ['Interested '],
    amber: ['Pending','Partially Paid','Payment Pending','Documents Pending','Document Verification','On Break','Busy','Callback Required','Due Today','Paused','Warm','Medium','High','Not Due'],
    red: ['Rejected','Failed','Locked','Overdue','Invalid Number','Wrong Number','Do Not Call','Not Interested','Lost','Not Eligible','Duplicate','Urgent','Switched Off','Not Connected'],
    gray: ['Inactive','Refunded','Cancelled','Archived','New','Offline','Completed ','Low','Unassigned','Cold','No']
  };
  const MAP = {}; Object.entries(STATUS).forEach(([c, list]) => list.forEach(s => (MAP[s] = c)));
  MAP['Hot'] = 'amber'; MAP['Very Hot'] = 'red'; MAP['Paid '] = 'green'; MAP['Enrolled'] = 'green';
  function badge(v, cls){ if (v == null || v === '') return html`<span class="muted">—</span>`; return html`<span class="badge b-${cls || MAP[v] || 'gray'}">${v}</span>`; }
  function scoreBadge(score, band){ const cls = band === 'Very Hot' ? 'red' : band === 'Hot' ? 'amber' : band === 'Warm' ? 'blue' : 'gray'; return html`<span class="score-pill b-${cls}" title="${band}"><b>${score}</b> ${band}</span>`; }
  function avatar(name, size){ return html`<span class="avatar ${size || ''}" aria-hidden="true">${NL.fmt.initials(name)}</span>`; }

  NL.ui = { toast, modal, confirm, formModal, renderForm, readForm, showErrors, validateFields, wireDependencies, menu, closeMenu, skeleton, skeletonCards, empty, errorView, load, badge, scoreBadge, avatar, stackSize: () => stack.length };
})();
