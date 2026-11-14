/* Counselling — Call Activity, Follow-ups, Counselling Notes. */
(function(){
  const { html, toHtml, $ } = NL.util;
  const S = NL.services, st = NL.store, ui = NL.ui, A = NL.actions, C = NL.cols, F = NL.fmt, w = NL.w;

  /* Lead picker (typeahead against the leads API) */
  function pickLead(title){
    return new Promise((resolve) => {
      const m = ui.modal({ title: title || 'Select a lead', size: 'md', body: html`<div class="fb-search"><span class="fb-ico">🔍</span><input type="search" id="plQ" placeholder="Type a name, mobile or lead ID…"></div><div class="pick-list" id="plList"></div>`, onClose: (r) => resolve(r || null) });
      const list = $('#plList', m.el); let seq = 0;
      const run = NL.util.debounce(async () => {
        const my = ++seq; list.innerHTML = toHtml(html`<div class="gs-loading"><span class="spinner"></span> Searching…</div>`);
        try {
          const r = await S.leadService.list({ q: $('#plQ', m.el).value.trim(), pageSize: 12, stageGroup: 'active', sort: 'updatedAt' }); if (my !== seq) return;
          list.innerHTML = toHtml(r.items.length ? r.items.map((l, i) => html`<button class="pick-item" data-i="${i}"><b>${l.name}</b><small>${l.id} · ${l.mobile} · ${l.stage} · ${l.counsellorName || 'Unassigned'}</small></button>`) : html`<div class="gs-empty">No active leads match.</div>`);
          list.onclick = (e) => { const b = e.target.closest('[data-i]'); if (b) m.close(r.items[Number(b.dataset.i)]); };
        } catch (e){ list.innerHTML = toHtml(html`<div class="gs-empty">${e.message}</div>`); }
      }, 250);
      $('#plQ', m.el).addEventListener('input', run); run();
    });
  }
  NL.pickLead = pickLead;

  /* ---------- Call activity ---------- */
  function calls(el, p, query){
    const s = st.settings();
    const page = NL.listPage({ el, id: 'calls', module: 'calls', title: 'Call Activity', sub: 'Every counselling call — ready for a dialer/CTI integration', exportName: 'call_activity', what: 'calls', refreshOn: ['calls'], initial: Object.assign({ datePreset: 'last7' }, query), defaultPreset: 'last7',
      above: html`<div id="callStats" class="kpi-grid slim"></div>`,
      actions: [{ label: 'Log a call', icon: '📞', primary: true, action: 'log', perm: 'calls.create', onClick: async () => { const l = await pickLead('Log a call — select lead'); if (l) A.logCall(l); } }],
      searchPlaceholder: 'Search lead, mobile, notes…',
      filters: [{ type: 'daterange', label: 'Date', field: 'startAt' }, st.scope() !== 'own' ? { key: 'counsellorId', label: 'Counsellor', options: () => st.options.assignable() } : null,
        st.scope() === 'all' ? { key: 'teamId', label: 'Team', options: () => st.options.teams() } : null,
        { key: 'type', label: 'Call type', options: ['Outgoing', 'Incoming', 'Callback'] }, { key: 'outcome', label: 'Outcome', options: NL.outcomes.CRM_OUTCOMES }].filter(Boolean),
      columns: [C.mono('id', 'Call ID'), C.link('leadName', 'Lead', (c) => '#/leads/' + c.leadId, { always: true }), C.mono('leadMobile', 'Mobile'), C.text('counsellorName', 'Counsellor'),
        C.date('startAt', 'Date'), { key: 'startAt', sortKey: 'startAt', label: 'Start Time', render: (c) => F.time(c.startAt), export: (c) => F.time(c.startAt) }, { key: 'endAt', label: 'End Time', render: (c) => F.time(c.endAt), export: (c) => F.time(c.endAt) },
        { key: 'duration', label: 'Duration', cls: 'r num', render: (c) => F.duration(c.duration), export: (c) => c.duration }, C.badge('type', 'Call Type'),
        { key: 'outcome', label: 'Outcome', render: (c) => html`${ui.badge(NL.outcomes.label(c.outcome) || '—', NL.outcomes.isConnected(c.outcome) ? 'blue' : 'gray')}${c.subOutcome ? html`<div class="muted tiny">${NL.outcomes.label(c.outcome, c.subOutcome)}</div>` : ''}`, export: (c) => NL.outcomes.label(c.outcome) },
        { key: 'subOutcome', label: 'Sub Outcome', hidden: true, render: (c) => NL.outcomes.label(c.outcome, c.subOutcome) || '—', export: (c) => c.subOutcome ? NL.outcomes.label(c.outcome, c.subOutcome) : '' },
        C.text('notes', 'Notes', { cls: 'remarks' }), C.datetime('nextFollowupAt', 'Next Follow-up', { hidden: true })],
      fetch: async (q) => { const r = await S.callService.list(q); if (q.page === 1 && q.pageSize !== 'all') stats(q); return r; },
      rowActions: (c) => [{ label: 'Open lead', icon: '🎯', onClick: () => (location.hash = '#/leads/' + c.leadId) }, st.can('calls.create') && { label: 'Call again', icon: '📞', onClick: () => A.logCall({ id: c.leadId, name: c.leadName, mobile: c.leadMobile, stage: c.leadStage }) }].filter(Boolean),
      empty: () => ({ icon: '📞', title: 'No calls in this period', text: 'Try a wider date range.', actions: [{ label: 'Clear Filters', action: 'clearFilters' }] })
    });
    async function stats(q){
      try {
        const all = (await S.callService.list(Object.assign({}, q, { page: 1, pageSize: 'all' }))).items;
        const conn = all.filter(c => NL.outcomes.isConnected(c.outcome)); const talk = all.reduce((x, c) => x + c.duration, 0);
        const box = $('#callStats', el); if (!box) return;
        box.innerHTML = toHtml(html`${w.kpi({ icon: '☎️', value: F.num(all.length), label: 'Calls' })}${w.kpi({ icon: '✅', value: F.num(conn.length), label: 'Connected', sub: F.ratio(conn.length, all.length) + ' connect rate' })}
          ${w.kpi({ icon: '⏱️', value: F.duration(talk), label: 'Talk time' })}${w.kpi({ icon: '📏', value: F.duration(conn.length ? conn.reduce((x, c) => x + c.duration, 0) / conn.length : 0), label: 'Avg connected call' })}
          ${w.kpi({ icon: '🙋', value: F.num(all.filter(c => c.outcome === 'interested').length), label: 'Interested' })}${w.kpi({ icon: '🔁', value: F.num(all.filter(c => c.outcome === 'callback').length), label: 'Callbacks requested' })}`);
      } catch (e){ /* stats are supplementary */ }
    }
    return page.cleanup;
  }

  /* ---------- Follow-ups ---------- */
  function followups(el, p, query){
    const s = st.settings();
    const bucketLabel = { overdue: 'Overdue', today: 'Due Today', upcoming: 'Upcoming', completed: 'Completed', cancelled: 'Cancelled' };
    const rowsById = new Map(); // rows on screen, for the Call feedback buttons
    const page = NL.listPage({ el, id: 'followups', module: 'followups', title: 'Follow-ups', sub: 'Overdue in red, due today in amber, upcoming in blue', exportName: 'followups', what: 'follow-ups', refreshOn: ['followups', 'calls', 'leads'], initial: query,
      above: html`<div class="fu-buckets" id="fuBuckets"></div>`,
      actions: [{ label: 'Schedule follow-up', icon: '📅', primary: true, action: 'add', perm: 'followups.manage', onClick: async () => { const l = await pickLead('Schedule follow-up — select lead'); if (l) A.scheduleFollowup(l); } }],
      segments: [{ key: 'overdue', label: '🔴 Overdue', query: { status: 'Pending', bucket: 'overdue' } }, { key: 'today', label: '🟠 Due today', query: { status: 'Pending', bucket: 'today' } },
        { key: 'upcoming', label: '🔵 Upcoming', query: { status: 'Pending', bucket: 'upcoming' } }, { key: 'pending', label: 'All pending', query: { status: 'Pending' } },
        { key: 'completed', label: 'Completed', query: { status: 'Completed', dir: 'desc' } }, { key: 'cancelled', label: 'Cancelled', query: { status: 'Cancelled', dir: 'desc' } }],
      pickSegment: (q) => q.bucket || 'today', passThrough: ['completionOutcome', 'completionSubOutcome'],
      searchPlaceholder: 'Search student, mobile, reason, notes…',
      filters: [{ type: 'daterange', label: 'Due', field: 'dueAt' }, st.scope() !== 'own' ? { key: 'counsellorId', label: 'Counsellor', options: () => st.options.assignable() } : null,
        st.scope() === 'all' ? { key: 'teamId', label: 'Team', options: () => st.options.teams() } : null, { key: 'reason', label: 'Reason', options: s.followupReasons }].filter(Boolean),
      rowClass: (f) => 'fu-row-' + f.bucket,
      columns: [C.link('leadName', 'Student', (f) => '#/leads/' + f.leadId, { always: true }), C.mono('leadMobile', 'Mobile'), C.text('counsellorName', 'Counsellor'),
        { key: 'dueAt', label: 'Date', cls: 'nowrap', render: (f) => html`<span class="fu-${f.bucket}">${F.date(f.dueAt)}</span>`, export: (f) => F.date(f.dueAt) },
        { key: 'dueAt', sortKey: 'dueAt', label: 'Time', render: (f) => html`<span class="fu-${f.bucket}">${F.time(f.dueAt)}</span>`, export: (f) => F.time(f.dueAt) }, C.text('reason', 'Reason'),
        { key: 'notes', label: 'Notes', cls: 'remarks', render: (f) => html`${f.outcome ? html`${f.notes}<div class="muted tiny">Outcome: ${f.outcome}</div>` : f.notes || '—'}${f.status !== 'Completed' ? '' : f.feedback
            ? html`<div class="fu-fb"><button class="btn-ghost btn-sm" data-callfb-view="${f.id}">✓ View call feedback</button></div>`
            : st.can('calls.create') ? html`<div class="fu-fb"><button class="btn-primary btn-sm" data-callfb="${f.id}">📝 Call feedback</button></div>` : ''}` },
        { key: 'status', label: 'Status', render: (f) => ui.badge(f.status === 'Pending' ? bucketLabel[f.bucket] : f.status, f.bucket === 'upcoming' ? 'blue' : undefined), export: (f) => f.status === 'Pending' ? bucketLabel[f.bucket] : f.status },
        { key: 'feedbackText', label: 'Call feedback', hidden: true, sortable: false, render: (f) => f.feedback ? `${NL.outcomes.label(f.feedback.outcome, f.feedback.subOutcome)}: ${f.feedback.summary}` : '—', export: (f) => f.feedback ? `${NL.outcomes.label(f.feedback.outcome, f.feedback.subOutcome)}: ${f.feedback.summary}` : '' },
        C.badge('leadStage', 'Lead Stage', { hidden: true })],
      fetch: async (q) => { const r = await S.followupService.list(q); r.items.forEach(f => rowsById.set(f.id, f)); if (q.page === 1) buckets(); return r; },
      rowActions: (f) => [f.status === 'Pending' && st.can('followups.manage') && { label: 'Complete', icon: '✅', onClick: () => A.completeFollowup(f) },
        f.status === 'Pending' && st.can('followups.manage') && { label: 'Reschedule', icon: '🗓️', onClick: () => A.rescheduleFollowup(f) },
        f.status === 'Pending' && st.can('followups.manage') && { label: 'Snooze 15 min', icon: '💤', onClick: () => A.snoozeFollowup(f, 15) },
        f.status === 'Pending' && st.can('followups.manage') && { label: 'Snooze 1 hour', icon: '💤', onClick: () => A.snoozeFollowup(f, 60) },
        st.can('calls.create') && { label: 'Call now', icon: '📞', onClick: () => A.logCall({ id: f.leadId, name: f.leadName, mobile: f.leadMobile, stage: f.leadStage }) },
        f.status === 'Completed' && !f.feedback && st.can('calls.create') && { label: 'Call feedback', icon: '📝', onClick: () => A.callFeedback(f) },
        f.feedback && { label: 'View call feedback', icon: '🗒️', onClick: () => A.viewFeedback(f) },
        { label: 'Open student', icon: '👨‍🎓', onClick: () => (location.hash = '#/leads/' + f.leadId) },
        f.status === 'Pending' && st.can('followups.manage') && '-', f.status === 'Pending' && st.can('followups.manage') && { label: 'Cancel', icon: '✖', danger: true, onClick: () => A.cancelFollowup(f) }].filter(Boolean),
      selectable: st.can('followups.manage'), hideBulkBar: true,
      onSelectionChange: (n, rows) => updateToolbar(n, rows),
      empty: () => ({ icon: '📅', title: 'No follow-ups here', text: 'Nothing in this bucket — nice work.', actions: [{ label: 'Clear Filters', action: 'clearFilters' }] })
    });
    async function buckets(){
      try {
        const [o, t, u] = await Promise.all(['overdue', 'today', 'upcoming'].map(b => S.followupService.list({ status: 'Pending', bucket: b, pageSize: 1 })));
        const box = $('#fuBuckets', el); if (!box) return;
        box.innerHTML = toHtml(html`<button class="fub red" data-seg-jump="overdue"><b>${o.total}</b><span>Overdue</span></button><button class="fub amber" data-seg-jump="today"><b>${t.total}</b><span>Due today</span></button><button class="fub blue" data-seg-jump="upcoming"><b>${u.total}</b><span>Upcoming</span></button>`);
      } catch (e){ /* supplementary */ }
    }
    /* Selection toolbar above the table */
    let toolbar = null;
    if (st.can('followups.manage')){
      toolbar = NL.util.el('div', { class: 'fu-toolbar', role: 'region', 'aria-label': 'Selected follow-ups' });
      toolbar.innerHTML = toHtml(html`<div><h3>Follow-ups</h3><span class="fu-selected-count" id="fuSelectedCount" aria-live="polite">0 selected</span></div>
        <div class="fu-toolbar-actions"><button class="fu-btn-complete" id="fuCompleteBtn" disabled>✓ Complete Follow-up</button><button class="btn-ghost" id="fuClearBtn" disabled>Clear Selection</button></div>`);
      $('.table-host', el).before(toolbar);
      $('#fuClearBtn', toolbar).addEventListener('click', () => page.table.clearSelection());
      $('#fuCompleteBtn', toolbar).addEventListener('click', completeSelected);
    }
    function updateToolbar(n, rows){
      if (!toolbar) return;
      const pending = (rows || []).filter(f => f.status === 'Pending').length;
      const done = n - pending;
      $('#fuSelectedCount', toolbar).textContent = `${n} selected${done > 0 && n ? ` · ${done} already completed or cancelled` : ''}`;
      $('#fuCompleteBtn', toolbar).disabled = pending === 0;
      $('#fuClearBtn', toolbar).disabled = n === 0;
    }
    async function completeSelected(){
      const rows = (await page.table.selectedRows()).filter(f => f.status === 'Pending');
      if (!rows.length) return;
      if (await A.completeFollowup(rows)){ page.table.clearSelection(); page.reload(); }
    }
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-seg-jump]'); if (b){ const sg = el.querySelector(`[data-seg="${b.dataset.segJump}"]`); if (sg) sg.click(); } });
    el.addEventListener('click', (e) => {
      const fb = e.target.closest('[data-callfb]'), view = e.target.closest('[data-callfb-view]'); if (!fb && !view) return;
      e.stopPropagation(); const f = rowsById.get((fb || view).dataset[fb ? 'callfb' : 'callfbView']); if (!f) return;
      if (fb) A.callFeedback(f); else A.viewFeedback(f);
    }, true);
    return page.cleanup;
  }

  /* ---------- Counselling notes ---------- */
  function notes(el, p, query){
    const page = NL.listPage({ el, id: 'notes', module: 'notes', title: 'Counselling Notes', sub: 'Notes captured during counselling across all your leads and students', exportName: 'counselling_notes', what: 'notes', refreshOn: ['notes'], initial: query,
      actions: [{ label: 'Add note', icon: '🗒️', primary: true, action: 'add', perm: 'notes.create', onClick: async () => { const l = await pickLead('Add note — select lead'); if (l) A.addNote({ leadId: l.id, studentId: l.studentId || undefined }); } }],
      searchPlaceholder: 'Search note text, student, author…',
      filters: [{ type: 'daterange', label: 'Date', field: 'createdAt' }, { key: 'type', label: 'Type', options: ['Counselling', 'General', 'Call', 'Document', 'Payment'] },
        st.scope() !== 'own' ? { key: 'authorId', label: 'Author', options: () => st.options.users() } : null].filter(Boolean),
      columns: [C.datetime('createdAt', 'Date'), { key: 'leadName', label: 'Student / Lead', always: true, cls: 'name', render: (n) => n.leadId ? html`<a class="rowlink" href="#/leads/${n.leadId}">${n.leadName}</a>` : html`<a class="rowlink" href="#/students/${n.studentId}">${n.leadName}</a>` },
        C.badge('type', 'Type', { render: (n) => ui.badge(n.type, 'blue') }), { key: 'text', label: 'Note', cls: 'note-cell', render: (n) => n.text }, C.text('authorName', 'Author')],
      fetch: (q) => S.noteService.list(q),
      empty: () => ({ icon: '🗒️', title: 'No notes found', actions: [{ label: 'Clear Filters', action: 'clearFilters' }] })
    });
    return page.cleanup;
  }

  NL.pages.calls = { title: 'Call Activity', perm: 'calls.view', crumbs: ['Counselling', 'Call Activity'], render: calls };
  NL.pages.followups = { title: 'Follow-ups', perm: 'followups.view', crumbs: ['Counselling', 'Follow-ups'], render: followups };
  NL.pages.notes = { title: 'Counselling Notes', perm: 'notes.view', crumbs: ['Counselling', 'Counselling Notes'], render: notes };
})();
