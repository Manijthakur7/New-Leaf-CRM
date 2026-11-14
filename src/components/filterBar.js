/* FilterBar — search (debounced), dimension filters, date range, clear, saved
   filters (per user, via savedFilterService) and export (CSV / Excel). */
(function(){
  const { html, raw, toHtml, $, $$ } = NL.util;

  function FilterBar(o){
    const self = this; const root = o.container;
    const initial = Object.assign({}, o.initial || {});
    let collapsed = true;
    let values = Object.assign({ datePreset: initial.datePreset || o.defaultPreset || 'all' }, initial);

    function opts(f){ const list = typeof f.options === 'function' ? f.options(values) : f.options || []; return list.map(x => typeof x === 'object' ? x : { value: x, label: x }); }
    function render(){
      root.className = 'filterbar' + (collapsed ? ' collapsed' : '');
      root.innerHTML = toHtml(html`
        <div class="fb-row">
          ${o.search !== false ? html`<div class="fb-search"><span class="fb-ico">🔍</span><input type="search" data-f="q" value="${values.q || ''}" placeholder="${o.searchPlaceholder || 'Search…'}" aria-label="Search"></div>` : ''}
          ${(o.filters || []).map(f => f.type === 'daterange' ? html`
            <div class="fb-field"><label>${f.label || 'Date'}</label><select data-f="datePreset">${NL.fmt.RANGE_PRESETS.map(([k, l]) => html`<option value="${k}" ${values.datePreset === k ? raw('selected') : ''}>${l}</option>`)}</select></div>
            <div class="fb-field fb-custom" ${values.datePreset === 'custom' ? '' : raw('hidden')}><label>From</label><input type="date" data-f="customFrom" value="${values.customFrom || ''}"></div>
            <div class="fb-field fb-custom" ${values.datePreset === 'custom' ? '' : raw('hidden')}><label>To</label><input type="date" data-f="customTo" value="${values.customTo || ''}"></div>` :
            html`<div class="fb-field"><label>${f.label}</label><select data-f="${f.key}"><option value="">${f.allLabel || 'All'}</option>${opts(f).map(x => html`<option value="${x.value}" ${String(values[f.key] || '') === String(x.value) ? raw('selected') : ''}>${x.label}</option>`)}</select></div>`)}
          <div class="fb-tools">
            <button class="btn-ghost btn-sm fb-toggle" data-fb="toggle">⚙ Filters</button><button class="btn-ghost btn-sm" data-fb="clear" title="Clear filters">✕ Clear</button>
            ${o.module ? html`<button class="btn-ghost btn-sm" data-fb="saved" title="Saved filters">★ Saved</button>` : ''}
            ${(o.tools || []).map((t, i) => html`<button class="btn-ghost btn-sm" data-fb-tool="${i}">${t.label}</button>`)}
            ${o.onExport ? html`<button class="btn-ghost btn-sm" data-fb="export">⤓ Export</button>` : ''}
          </div>
        </div>`);
    }

    function query(){
      const q = {};
      if (values.q) q.q = values.q;
      (o.filters || []).forEach(f => {
        if (f.type === 'daterange'){
          if (values.datePreset && values.datePreset !== 'all'){
            if (values.datePreset === 'custom' && !values.customFrom && !values.customTo) return;
            const r = NL.fmt.range(values.datePreset, values.customFrom, values.customTo); q.dateFrom = r.from; q.dateTo = r.to; if (f.field) q.dateField = f.field;
          }
        } else if (values[f.key]) q[f.key] = values[f.key];
      });
      Object.assign(q, o.fixed || {});
      return q;
    }
    const changed = () => { if (o.onChange) o.onChange(query(), values); };
    const debounced = NL.util.debounce(changed, 300);

    root.addEventListener('input', (e) => { if (e.target.dataset.f === 'q'){ values.q = e.target.value.trim(); debounced(); } });
    root.addEventListener('change', (e) => {
      const k = e.target.dataset.f; if (!k || k === 'q') return;
      values[k] = e.target.value;
      if (k === 'datePreset') $$('.fb-custom', root).forEach(x => (x.hidden = values.datePreset !== 'custom'));
      const dependents = (o.filters || []).filter(f => f.dependsOn === k);
      if (dependents.length){ dependents.forEach(f => (values[f.key] = '')); render(); }
      changed();
    });
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-fb],[data-fb-tool]'); if (!b) return;
      if (b.dataset.fbTool !== undefined) return o.tools[Number(b.dataset.fbTool)].onClick(b);
      const a = b.dataset.fb;
      if (a === 'toggle'){ collapsed = !collapsed; root.classList.toggle('collapsed', collapsed); return; }
      if (a === 'clear'){ values = { datePreset: o.defaultPreset || 'all' }; render(); changed(); }
      if (a === 'export') NL.ui.menu(b, [{ label: 'Export CSV', icon: '📄', onClick: () => o.onExport('csv') }, { label: 'Export Excel (.xlsx)', icon: '📊', onClick: () => o.onExport('xlsx') }]);
      if (a === 'saved') savedMenu(b);
    });

    async function savedMenu(anchor){
      let list = [];
      try { list = await NL.services.savedFilterService.list(o.module); } catch (e){ NL.ui.toast(e.message, 'error'); return; }
      NL.ui.menu(anchor, [{ label: 'Save current filters…', icon: '＋', onClick: saveCurrent }, list.length ? '-' : null, list.length ? { header: 'Apply saved filter' } : null]
        .concat(list.map(f => ({ label: f.name, icon: '★', onClick: () => { values = Object.assign({ datePreset: 'all' }, f.query); render(); changed(); NL.ui.toast(`Applied “${f.name}”`); } })))
        .concat(list.length ? ['-', { header: 'Delete' }].concat(list.map(f => ({ label: f.name, icon: '🗑', danger: true, onClick: async () => { await NL.services.savedFilterService.remove(f.id); NL.ui.toast('Saved filter deleted'); } }))) : []));
    }
    async function saveCurrent(){
      await NL.ui.formModal({ title: 'Save filters', size: 'sm', cols: 1, fields: [{ name: 'name', label: 'Filter name', required: true, placeholder: 'e.g. My hot MBA leads' }], submitLabel: 'Save',
        onSubmit: async (v) => { await NL.services.savedFilterService.create(o.module, v.name, values); NL.ui.toast('Filters saved'); } });
    }

    this.query = query;
    this.values = () => Object.assign({}, values);
    this.set = (k, v) => { values[k] = v; render(); };
    this.rerender = render;
    render();
  }
  NL.FilterBar = FilterBar;
})();
