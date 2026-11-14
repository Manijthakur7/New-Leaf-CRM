/* listPage — composes page header + segment tabs + FilterBar + DataTable +
   export + auto-refresh on data changes. Used by every list module. */
(function(){
  const { html, raw, toHtml, $, $$ } = NL.util;

  function listPage(o){
    const el = o.el; const q0 = o.initial || {};
    let segment = (o.segments || []).find(s => s.key === q0.segment) || (o.segments || [])[0] || null;
    if (o.segments && o.pickSegment){ const s = o.pickSegment(q0); if (s) segment = o.segments.find(x => x.key === s) || segment; }
    const actions = (o.actions || []).filter(a => !a.perm || NL.store.can(a.perm));
    el.innerHTML = toHtml(html`${NL.w.pageHead({ title: o.title, sub: o.sub, actions })}
      ${o.above || ''}
      ${o.segments ? html`<div class="segments" role="tablist">${o.segments.filter(s => !s.perm || NL.store.can(s.perm)).map(s => html`<button class="seg ${segment && s.key === segment.key ? 'active' : ''}" data-seg="${s.key}">${s.label}<span class="seg-count" data-seg-count="${s.key}"></span></button>`)}</div>` : ''}
      <div class="fb-host"></div><div class="table-host"></div>`);
    const initial = Object.assign({}, q0);
    const fb = new NL.FilterBar({ container: $('.fb-host', el), module: o.module, filters: o.filters, searchPlaceholder: o.searchPlaceholder, initial, defaultPreset: o.defaultPreset,
      onChange: () => table.reload(), onExport: o.exportName ? doExport : null,
      tools: [{ label: '☰ Columns', onClick: (b) => table.chooseColumns(b) }] });
    const extra = {}; (o.passThrough || []).forEach(k => { if (q0[k]) extra[k] = q0[k]; });
    const getQuery = () => Object.assign({}, o.fixed || {}, segment ? segment.query : {}, extra, fb.query());
    const table = new NL.DataTable({ container: $('.table-host', el), id: o.id || o.module, columns: o.columns, fetch: o.fetch, getQuery, selectable: !!(o.selectable || (o.bulk && o.bulk.length)), bulkActions: o.bulk, onSelectionChange: o.onSelectionChange, hideBulkBar: o.hideBulkBar,
      rowActions: o.rowActions, onRowClick: o.onRowClick, empty: o.empty, emptyHandlers: Object.assign({ clearFilters: () => { $('[data-fb=clear]', el).click(); } }, o.emptyHandlers || {}),
      loadingText: o.loadingText, sort: o.sort, dir: o.dir, rowClass: o.rowClass, what: o.what, onLoad: o.onLoad });

    async function doExport(format){
      try {
        const rows = await table.exportRows();
        const cols = o.exportColumns || o.columns.filter(c => c.label && !c.noExport).map(c => ({ label: c.label, value: c.export || ((r) => r[c.key]) }));
        NL.file.exportData(format, rows, cols, o.exportName);
      } catch (e){ NL.ui.toast(e.message, 'error'); }
    }
    el.addEventListener('click', (e) => {
      const s = e.target.closest('[data-seg]');
      if (s){ segment = o.segments.find(x => x.key === s.dataset.seg); $$('.seg', el).forEach(b => b.classList.toggle('active', b === s)); Object.keys(extra).forEach(k => delete extra[k]); table.reload(); return; }
      const a = e.target.closest('.page-head [data-action]');
      if (a){ const act = actions.find(x => x.action === a.dataset.action); if (act && act.onClick) act.onClick(a); }
    });
    const off = NL.store.on('data-changed', (m) => { if (!o.refreshOn || o.refreshOn.includes(m)) table.refresh(); });
    return { table, fb, cleanup: off, reload: () => table.reload(false), exportData: doExport };
  }

  /* column helpers */
  const C = {
    link: (key, label, href, o) => Object.assign({ key, label, cls: 'name', render: (r) => html`<a href="${href(r)}" class="rowlink">${r[key] || '—'}</a>` }, o || {}),
    mono: (key, label, o) => Object.assign({ key, label, cls: 'mono', render: (r) => r[key] || html`<span class="muted">—</span>` }, o || {}),
    badge: (key, label, o) => Object.assign({ key, label, render: (r) => NL.ui.badge(r[key]) }, o || {}),
    date: (key, label, o) => Object.assign({ key, label, cls: 'nowrap', render: (r) => r[key] ? html`<span title="${NL.fmt.dateTime(r[key])}">${NL.fmt.date(r[key])}</span>` : html`<span class="muted">—</span>`, export: (r) => r[key] ? NL.fmt.dateTime(r[key]) : '' }, o || {}),
    datetime: (key, label, o) => Object.assign({ key, label, cls: 'nowrap', render: (r) => r[key] ? html`${NL.fmt.date(r[key])}<div class="muted tiny">${NL.fmt.time(r[key])}</div>` : html`<span class="muted">—</span>`, export: (r) => r[key] ? NL.fmt.dateTime(r[key]) : '' }, o || {}),
    money: (key, label, o) => Object.assign({ key, label, cls: 'r num', render: (r) => NL.fmt.money(r[key]), export: (r) => r[key] }, o || {}),
    num: (key, label, o) => Object.assign({ key, label, cls: 'r num', render: (r) => NL.fmt.num(r[key]) }, o || {}),
    text: (key, label, o) => Object.assign({ key, label }, o || {})
  };

  NL.listPage = listPage; NL.cols = C;
})();
