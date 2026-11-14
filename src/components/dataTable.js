/* DataTable — server-driven pagination, sorting, selection (with "select all
   matching"), bulk actions, row menus, column chooser, and loading / empty /
   error states. Only the current page is rendered to keep the DOM light. */
(function(){
  const { html, raw, toHtml, $, $$ } = NL.util;

  function DataTable(o){
    const self = this;
    const prefId = 'cols:' + (o.id || 'table');
    const hiddenDefault = o.columns.filter(c => c.hidden).map(c => c.key);
    let hidden = new Set(NL.store.getPref(prefId, hiddenDefault));
    let state = { page: 1, pageSize: NL.store.getPref('pageSize', o.pageSize || NL.config.DEFAULT_PAGE_SIZE), sort: o.sort || '', dir: o.dir || 'desc' };
    let data = { items: [], total: 0, pages: 1 }; let selected = new Map(); let allMatching = false; let reqSeq = 0; let loadedOnce = false;
    const root = o.container; root.classList.add('dt');
    root.innerHTML = toHtml(html`<div class="dt-bulk" hidden></div><div class="dt-scroll"><div class="dt-body"></div></div><div class="dt-foot"></div>`);
    const bulkEl = $('.dt-bulk', root), bodyEl = $('.dt-body', root), footEl = $('.dt-foot', root);
    const visibleCols = () => o.columns.filter(c => c.always || !hidden.has(c.key));
    const rowId = (r) => (o.rowId ? o.rowId(r) : r.id);

    function query(){
      const q = Object.assign({}, o.getQuery ? o.getQuery() : {}, { page: state.page, pageSize: state.pageSize });
      if (state.sort){ q.sort = state.sort; q.dir = state.dir; }
      return q;
    }

    async function load(){
      const seq = ++reqSeq;
      if (!loadedOnce) bodyEl.innerHTML = toHtml(NL.ui.skeleton(Math.min(8, state.pageSize), o.loadingText));
      else root.classList.add('dt-loading');
      try {
        const res = await o.fetch(query());
        if (seq !== reqSeq) return;
        data = res; loadedOnce = true; root.classList.remove('dt-loading'); render();
        if (o.onLoad) o.onLoad(res);
      } catch (err){
        if (seq !== reqSeq) return;
        root.classList.remove('dt-loading'); loadedOnce = false;
        if (err && err.status === 401) return;
        bodyEl.innerHTML = toHtml(NL.ui.errorView(err, o.what || 'records')); footEl.innerHTML = '';
        const b = $('[data-action="retry"]', bodyEl); if (b) b.onclick = (e) => { e.stopPropagation(); load(); };
      }
    }

    function render(){
      const cols = visibleCols();
      if (!data.items.length){
        bodyEl.innerHTML = toHtml(NL.ui.empty(typeof o.empty === 'function' ? o.empty() : o.empty || { title: 'No records found', text: 'Try changing your filters.' }));
        footEl.innerHTML = ''; renderBulk(); return;
      }
      const pageIds = data.items.map(rowId); const allOnPage = pageIds.every(id => selected.has(id));
      bodyEl.innerHTML = toHtml(html`<table class="table">
        <thead><tr>
          ${o.selectable ? html`<th class="cb"><input type="checkbox" data-sel-all ${allOnPage ? raw('checked') : ''} aria-label="Select page"></th>` : ''}
          ${cols.map(c => html`<th class="${c.sortable === false || !c.key ? 'nosort' : ''} ${c.cls || ''}" ${c.sortable !== false && c.key ? raw(`data-sort="${c.sortKey || c.key}"`) : ''}>${c.label}${state.sort === (c.sortKey || c.key) ? html`<span class="arrow">${state.dir === 'asc' ? '▲' : '▼'}</span>` : ''}</th>`)}
          ${o.rowActions ? html`<th class="nosort act-col"></th>` : ''}
        </tr></thead>
        <tbody>${data.items.map((r, i) => html`<tr data-i="${i}" class="${o.rowClass ? o.rowClass(r) : ''} ${selected.has(rowId(r)) ? 'sel' : ''} ${o.onRowClick ? 'clickable' : ''}">
          ${o.selectable ? html`<td class="cb"><input type="checkbox" data-sel="${i}" ${selected.has(rowId(r)) ? raw('checked') : ''} aria-label="Select row"></td>` : ''}
          ${cols.map(c => html`<td class="${c.cls || ''}">${c.render ? c.render(r) : (r[c.key] == null || r[c.key] === '' ? html`<span class="muted">—</span>` : r[c.key])}</td>`)}
          ${o.rowActions ? html`<td class="act-col"><button class="icon-btn" data-row-menu="${i}" aria-label="Actions" title="Actions">⋯</button></td>` : ''}
        </tr>`)}</tbody></table>`);
      const from = (data.page - 1) * data.pageSize + 1, to = from + data.items.length - 1;
      footEl.innerHTML = toHtml(html`<div class="muted">Showing <b>${NL.fmt.num(from)}–${NL.fmt.num(to)}</b> of <b>${NL.fmt.num(data.total)}</b></div>
        <div class="dt-pager"><label class="muted small">Rows <select data-pagesize>${[10, 25, 50, 100].map(n => html`<option ${n === Number(state.pageSize) ? raw('selected') : ''}>${n}</option>`)}</select></label>
        <button class="btn-ghost btn-sm" data-page="prev" ${data.page <= 1 ? raw('disabled') : ''}>‹ Prev</button><span class="small">Page ${data.page} of ${data.pages}</span>
        <button class="btn-ghost btn-sm" data-page="next" ${data.page >= data.pages ? raw('disabled') : ''}>Next ›</button></div>`);
      renderBulk();
    }

    function renderBulk(){
      const n = allMatching ? data.total : selected.size;
      // Select-all box: checked when the whole page is selected, "partial" when only some rows are.
      const sa = $('[data-sel-all]', root);
      if (sa){ const k = data.items.filter(r => selected.has(rowId(r))).length; sa.checked = k > 0 && k === data.items.length; sa.indeterminate = k > 0 && k < data.items.length; }
      if (o.onSelectionChange) o.onSelectionChange(n, Array.from(selected.values()));
      if (!o.selectable || !n || o.hideBulkBar){ bulkEl.hidden = true; return; }
      const pageAll = data.items.length && data.items.every(r => selected.has(rowId(r)));
      bulkEl.hidden = false;
      bulkEl.innerHTML = toHtml(html`<b>${NL.fmt.num(n)} selected</b>
        ${pageAll && !allMatching && data.total > data.items.length ? html`<button class="link-btn" data-sel-matching>Select all ${NL.fmt.num(data.total)} matching</button>` : ''}
        <span class="spacer"></span>${(o.bulkActions || []).map((b, i) => html`<button class="${b.danger ? 'btn-danger' : 'btn-ghost'} btn-sm" data-bulk="${i}">${b.icon || ''} ${b.label}</button>`)}
        <button class="btn-ghost btn-sm" data-sel-clear>Clear</button>`);
    }

    async function selectedIds(){
      if (!allMatching) return Array.from(selected.keys());
      const res = await o.fetch(Object.assign(query(), { page: 1, pageSize: 'all' }));
      return res.items.map(rowId);
    }
    async function selectedRows(){
      if (!allMatching) return Array.from(selected.values());
      const res = await o.fetch(Object.assign(query(), { page: 1, pageSize: 'all' })); return res.items;
    }

    root.addEventListener('click', async (e) => {
      const t = e.target;
      const th = t.closest('th[data-sort]');
      if (th){ const k = th.dataset.sort; if (state.sort === k) state.dir = state.dir === 'asc' ? 'desc' : 'asc'; else { state.sort = k; state.dir = 'asc'; } state.page = 1; return load(); }
      if (t.closest('[data-page]')){ state.page += t.closest('[data-page]').dataset.page === 'next' ? 1 : -1; return load(); }
      if (t.matches('[data-sel-all]')){ data.items.forEach(r => t.checked ? selected.set(rowId(r), r) : selected.delete(rowId(r))); if (!t.checked) allMatching = false; return render(); }
      if (t.matches('[data-sel]')){ const r = data.items[Number(t.dataset.sel)]; if (t.checked) selected.set(rowId(r), r); else { selected.delete(rowId(r)); allMatching = false; } t.closest('tr').classList.toggle('sel', t.checked); return renderBulk(); }
      if (t.closest('[data-sel-matching]')){ allMatching = true; return renderBulk(); }
      if (t.closest('[data-sel-clear]')){ self.clearSelection(); return; }
      const bb = t.closest('[data-bulk]');
      if (bb){ const act = o.bulkActions[Number(bb.dataset.bulk)]; bb.disabled = true; try { const ids = await selectedIds(); const ok = await act.handler(ids, self, allMatching ? null : Array.from(selected.values())); if (ok && !act.keepSelection) self.clearSelection(); } catch (err){ if (err && err.message) NL.ui.toast(err.message, 'error'); } finally { bb.disabled = false; } return; }
      const rm = t.closest('[data-row-menu]');
      if (rm){ e.stopPropagation(); const items = o.rowActions(data.items[Number(rm.dataset.rowMenu)]).filter(x => x && x !== '-'); NL.ui.menu(rm, items.length ? o.rowActions(data.items[Number(rm.dataset.rowMenu)]) : [{ label: 'No actions available for your role', disabled: true }]); return; }
      const ea = t.closest('.empty-state [data-action]');
      if (ea && o.emptyHandlers && o.emptyHandlers[ea.dataset.action]){ o.emptyHandlers[ea.dataset.action](); return; }
      if (t.closest('a,button,input,select,label')) return;
      const tr = t.closest('tbody tr[data-i]');
      if (tr && o.onRowClick) o.onRowClick(data.items[Number(tr.dataset.i)]);
    });
    root.addEventListener('change', (e) => { if (e.target.matches('[data-pagesize]')){ state.pageSize = Number(e.target.value); state.page = 1; NL.store.setPref('pageSize', state.pageSize); load(); } });

    this.reload = (resetPage) => { if (resetPage !== false) state.page = 1; allMatching = false; return load(); };
    this.refresh = () => load();
    this.clearSelection = () => { selected.clear(); allMatching = false; render(); };
    this.selectedIds = selectedIds; this.selectedRows = selectedRows;
    this.query = query;
    this.exportRows = async () => (await o.fetch(Object.assign(query(), { page: 1, pageSize: 'all', export: 1 }))).items;
    this.chooseColumns = (anchor) => {
      NL.ui.menu(anchor, [{ header: 'Show columns' }].concat(o.columns.filter(c => !c.always && c.label).map(c => ({ label: c.label, icon: hidden.has(c.key) ? '☐' : '☑', onClick: () => {
        if (hidden.has(c.key)) hidden.delete(c.key); else hidden.add(c.key); NL.store.setPref(prefId, Array.from(hidden)); render(); setTimeout(() => self.chooseColumns(anchor), 0);
      } }))).concat(['-', { label: 'Reset to default', icon: '↺', onClick: () => { hidden = new Set(hiddenDefault); NL.store.setPref(prefId, hiddenDefault); render(); } }]));
    };
    load();
  }

  NL.DataTable = DataTable;
})();
