/* DOM + safe templating helpers.
   html`` auto-escapes every interpolated value (XSS protection); wrap trusted
   markup in raw() or nest another html`` result to opt out. */
(function(){
  class SafeHtml { constructor(s){ this.s = s; } toString(){ return this.s; } }

  const ESC = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'};
  function escape(v){ return String(v == null ? '' : v).replace(/[&<>"'`]/g, c => ESC[c]); }

  function toHtml(v){
    if (v == null || v === false) return '';
    if (v instanceof SafeHtml) return v.s;
    if (Array.isArray(v)) return v.map(toHtml).join('');
    return escape(v);
  }
  function html(strings, ...vals){
    let out = '';
    strings.forEach((s, i) => { out += s; if (i < vals.length) out += toHtml(vals[i]); });
    return new SafeHtml(out);
  }
  const raw = (s) => new SafeHtml(String(s == null ? '' : s));

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function setHtml(el, content){ el.innerHTML = toHtml(content); return el; }
  function el(tag, attrs, content){
    const n = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => { if (v != null && v !== false) n.setAttribute(k, v === true ? '' : v); });
    if (content != null) setHtml(n, content);
    return n;
  }

  /* Delegated events: root.addEventListener once; handlers keyed by data-action */
  function delegate(root, type, handlers){
    root.addEventListener(type, (e) => {
      const t = e.target.closest('[data-action]');
      if (!t || !root.contains(t)) return;
      const fn = handlers[t.dataset.action];
      if (fn){ fn(t, e); }
    });
  }

  function debounce(fn, ms){ let h; return function(...a){ clearTimeout(h); h = setTimeout(() => fn.apply(this, a), ms); }; }
  function uid(prefix){ return (prefix || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function clone(o){ return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function groupCount(list, fn){ const m = {}; list.forEach(x => { const k = fn(x); if (k != null && k !== '') m[k] = (m[k] || 0) + 1; }); return m; }
  function sum(list, fn){ return list.reduce((a, x) => a + (Number(fn ? fn(x) : x) || 0), 0); }

  NL.util = Object.assign(NL.util || {}, { SafeHtml, escape, html, raw, toHtml, $, $$, setHtml, el, delegate, debounce, uid, clone, groupCount, sum });
})();
