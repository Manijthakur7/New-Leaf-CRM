/* Leads — list with full column set, segments, filters, bulk + row actions. */
(function(){
  const { html } = NL.util;
  const S = NL.services, st = NL.store, ui = NL.ui, A = NL.actions, C = NL.cols, F = NL.fmt;

  function leadMenu(l, after){
    const can = st.can; const active = l.status === 'Active';
    const run = (p) => p.then(ok => { if (ok && after) after(ok); });
    return [
      { label: 'View details', icon: '👁️', onClick: () => (location.hash = '#/leads/' + l.id) },
      can('leads.edit') && { label: 'Edit', icon: '✏️', onClick: () => run(A.leadForm(l)) },
      can('calls.create') && { label: 'Call / log call', icon: '📞', onClick: () => run(A.logCall(l)) },
      { label: 'WhatsApp', icon: '💬', onClick: () => S.whatsappService.open(l.whatsapp || l.mobile, `Hi ${l.name.split(' ')[0]}, `) },
      can('notes.create') && { label: 'Add note', icon: '🗒️', onClick: () => run(A.addNote({ leadId: l.id })) },
      can('followups.manage') && { label: 'Schedule follow-up', icon: '📅', onClick: () => run(A.scheduleFollowup(l)) },
      can('leads.edit') && { label: 'Change stage', icon: '➡️', onClick: () => run(A.changeLeadStage(l)) },
      can('leads.assign') && { label: l.counsellorId ? 'Reassign' : 'Assign', icon: '👤', onClick: () => run(A.assignLeads([l.id], { reassign: !!l.counsellorId })) },
      '-',
      can('leads.convert') && { label: l.studentId ? 'Open student profile' : 'Convert to student', icon: '🎓', onClick: () => l.studentId ? (location.hash = '#/students/' + l.studentId) : run(A.convertLead(l)) },
      can('applications.create') && { label: 'Create application', icon: '📝', onClick: () => run(A.createApplication({ lead: l })) },
      { label: 'Duplicate check', icon: '🔎', onClick: () => run(A.duplicateCheck(l)) },
      can('leads.archive') && '-',
      can('leads.archive') && { label: active ? 'Archive' : 'Restore', icon: active ? '🗄️' : '♻️', danger: active, onClick: () => run(A.archiveLeads([l.id], !active)) }
    ].filter(Boolean);
  }

  function render(el, params, query){
    const s = st.settings(); const o = st.options; const scope = st.scope();
    const fu = (l) => { const c = { overdue: 'fu-overdue', today: 'fu-today', upcoming: '' }[l.followupState]; return l.nextFollowupAt ? html`<span class="${c}">${F.date(l.nextFollowupAt)}<div class="tiny">${F.time(l.nextFollowupAt)}</div></span>` : html`<span class="muted">—</span>`; };
    const page = NL.listPage({
      el, id: 'leads-v2', module: 'leads', title: 'Leads', sub: 'Every enquiry from first touch to enrolment', what: 'leads', exportName: 'leads', refreshOn: ['leads', 'calls', 'followups', 'applications', 'students'],
      initial: query, passThrough: ['stageGroup', 'uncontacted', 'followup', 'courseId'],
      above: html`<div class="state-strip" id="stateStrip" aria-label="Leads by state and course"></div>`,
      onLoad: () => loadStates(),
      actions: [
        { label: 'Add Lead', icon: '＋', primary: true, action: 'add', perm: 'leads.create', onClick: async () => { const r = await A.leadForm(); if (r && r.lead) location.hash = '#/leads/' + r.lead.id; } },
        { label: 'Import', icon: '📥', action: 'import', perm: 'leads.import', onClick: () => (location.hash = '#/import') },
        { label: 'Export', icon: '⤓', action: 'exportLeads', perm: 'leads.export', onClick: (btn) => ui.menu(btn, [
          { header: 'Export to Excel (.xlsx)' }, { label: 'All leads', icon: '📊', onClick: () => exportLeads('all', 'xlsx') }, { label: 'Current view (filters applied)', icon: '🔎', onClick: () => exportLeads('view', 'xlsx') },
          '-', { header: 'Export to CSV' }, { label: 'All leads', icon: '📄', onClick: () => exportLeads('all', 'csv') }, { label: 'Current view (filters applied)', icon: '📄', onClick: () => exportLeads('view', 'csv') }]) }
      ],
      segments: [
        { key: 'all', label: 'All leads', query: {} },
        { key: 'hot', label: '🔥 Hot', query: { stageGroup: 'hot' } }, { key: 'overdue', label: 'Follow-up overdue', query: { followup: 'overdue' } },
        { key: 'unassigned', label: 'Unassigned', query: { counsellorId: '__none' }, perm: 'leads.assign' }, { key: 'exited', label: 'Exited', query: { stageGroup: 'negative' } },
        { key: 'archived', label: 'Archived', query: { status: 'Archived' } }
      ],
      pickSegment: (q) => q.stageGroup === 'hot' ? 'hot' : q.counsellorId === '__none' ? 'unassigned' : q.stage || q.universityId || q.campaignId || q.counsellorId || q.datePreset ? 'all' : q.segment || 'all',
      searchPlaceholder: 'Search name, mobile, email, lead ID, city…',
      filters: [
        { type: 'daterange', label: 'Created', field: 'createdAt' },
        { key: 'state', label: 'State', options: () => [{ value: '__none', label: '— Not specified —' }].concat(NL.geo.STATES.slice().sort(), ['Outside India']) },
        { key: 'zone', label: 'Zone', options: NL.geo.ZONES.concat(['Other']) },
        { key: 'stage', label: 'Stage', options: s.leadStages.concat(s.negativeStages) },
        { key: 'outcome', label: 'Outcome', options: NL.outcomes.CRM_OUTCOMES },
        { key: 'subOutcome', label: 'Sub Outcome', options: () => NL.outcomes.CRM_OUTCOMES.flatMap(o => NL.outcomes.subOutcomesFor(o.value).map(x => ({ value: x.value, label: `${o.label} › ${x.label}` }))) },
        { key: 'source', label: 'Source', options: s.leadSources },
        { key: 'universityId', label: 'University', options: () => o.universities(true) },
        { key: 'campusId', label: 'Campus', dependsOn: 'universityId', options: (v) => o.campuses(v.universityId, true) },
        { key: 'programme', label: 'Programme', options: (v) => { const l = NL.programs.KNOWN.slice().sort(); if (v.programme && !l.includes(v.programme)) l.unshift(v.programme); return l; } },
        { key: 'courseName', label: 'Course', options: (v) => { const l = o.courseNames(); if (v.courseName && !l.some(x => x.value === v.courseName)) l.unshift({ value: v.courseName, label: v.courseName }); return l; } },
        scope !== 'own' ? { key: 'counsellorId', label: 'Counsellor', options: () => [{ value: '__none', label: '— Unassigned —' }].concat(o.assignable()) } : null,
        scope === 'all' ? { key: 'teamId', label: 'Team', options: () => o.teams() } : null,
        { key: 'campaignId', label: 'Campaign', options: () => o.campaigns() },
        { key: 'priority', label: 'Priority', options: s.priorities },
        { key: 'scoreBand', label: 'Score', options: s.scoring.bands.map(b => b.label) },
        { key: 'followup', label: 'Follow-up', options: [{ value: 'overdue', label: 'Overdue' }, { value: 'today', label: 'Due today' }, { value: 'upcoming', label: 'Upcoming' }, { value: 'none', label: 'Not set' }] }
      ].filter(Boolean),
      columns: [
        C.mono('id', 'Lead ID', { cls: 'mono nowrap', render: (l) => html`<a href="#/leads/${l.id}" class="rowlink mono">${l.id}</a>` }),
        C.link('name', 'Student Name', (l) => '#/leads/' + l.id, { always: true, render: (l) => html`<a href="#/leads/${l.id}" class="rowlink">${l.name}</a>${l.studentId ? html` <span class="badge b-green tiny" title="Student ${l.studentId}">🎓</span>` : ''}` }),
        C.mono('mobile', 'Mobile'),
        { key: 'state', label: 'State', render: (l) => NL.w.stateBadge(l.state), export: (l) => l.state || '' },
        C.mono('whatsapp', 'WhatsApp', { hidden: true }), C.text('email', 'Email', { hidden: true }),
        C.text('source', 'Lead Source'), C.text('campaignName', 'Campaign', { hidden: true, sortKey: 'campaignName' }),
        C.text('universityName', 'University'), C.text('campusName', 'Campus', { hidden: true }), C.text('courseName', 'Course'),
        { key: 'zone', label: 'Zone', hidden: true }, C.text('city', 'City'), C.text('qualification', 'Qualification', { hidden: true }), C.text('passingYear', 'Passing Year', { hidden: true }),
        C.text('preferredCourse', 'Preferred Course', { hidden: true }),
        C.badge('stage', 'Lead Stage'),
        { key: 'outcome', label: 'Outcome', render: (l) => l.outcome ? html`${ui.badge(NL.outcomes.label(l.outcome) || l.outcome, NL.outcomes.isConnected(l.outcome) ? 'blue' : 'gray')}${l.subOutcome ? html`<div class="muted tiny">${NL.outcomes.label(l.outcome, l.subOutcome)}</div>` : ''}` : html`<span class="muted">—</span>`, export: (l) => l.outcome ? NL.outcomes.label(l.outcome) : '' },
        { key: 'subOutcome', label: 'Sub Outcome', hidden: true, render: (l) => l.subOutcome ? NL.outcomes.label(l.outcome, l.subOutcome) : '—', export: (l) => l.subOutcome ? NL.outcomes.label(l.outcome, l.subOutcome) : '' },
        C.datetime('outcomeAt', 'Outcome Date', { hidden: true }),
        { key: 'score', label: 'Lead Score', render: (l) => ui.scoreBadge(l.score, l.scoreBand), export: (l) => `${l.score} (${l.scoreBand})` },
        C.badge('priority', 'Priority'),
        C.text('counsellorName', 'Assigned Counsellor', { render: (l) => l.counsellorName || html`<span class="badge b-amber">Unassigned</span>` }),
        C.text('teamLeaderName', 'Team Leader', { hidden: true }),
        C.date('lastContactAt', 'Last Contact'),
        { key: 'nextFollowupAt', label: 'Next Follow-up', cls: 'nowrap', render: fu, export: (l) => l.nextFollowupAt ? F.dateTime(l.nextFollowupAt) : '' },
        C.date('createdAt', 'Created Date'), C.date('updatedAt', 'Updated Date', { hidden: true }), C.badge('status', 'Status', { hidden: true })
      ],
      fetch: (q) => S.leadService.list(q),
      onRowClick: (l) => (location.hash = '#/leads/' + l.id),
      rowActions: (l) => leadMenu(l),
      bulk: [
        st.can('leads.assign') && { label: 'Assign Counsellor', icon: '👤', handler: (ids) => A.assignLeads(ids) },
        st.can('leads.assign') && { label: 'Reassign', icon: '🔁', handler: (ids) => A.assignLeads(ids, { reassign: true }) },
        st.can('leads.edit') && { label: 'Change Stage', icon: '➡️', handler: (ids) => bulkStage(ids) },
        st.can('followups.manage') && { label: 'Schedule Follow-up', icon: '📅', handler: (ids) => A.scheduleFollowup(ids) },
        st.can('leads.edit') && { label: 'Change Campaign', icon: '📢', handler: (ids) => bulkCampaign(ids) },
        st.can('leads.export') && { label: 'Export', icon: '⤓', handler: async (ids, t, rows) => { const list = rows || (await t.selectedRows()); NL.file.exportData('csv', list, exportCols(), 'leads_selected'); } },
        st.can('leads.archive') && { label: 'Archive', icon: '🗄️', danger: true, handler: (ids) => A.archiveLeads(ids) }
      ].filter(Boolean),
      empty: () => ({ icon: '🎯', title: 'No leads found', text: 'Try changing your filters or add a new lead.', actions: [{ label: 'Clear Filters', action: 'clearFilters' }].concat(st.can('leads.create') ? [{ label: 'Add Lead', action: 'addLead' }] : []) }),
      emptyHandlers: { addLead: () => A.leadForm() }
    });
    /* Export: every lead (active + archived, ignoring filters) or exactly what the current filters show. */
    let exporting = false;
    async function exportLeads(scope, format){
      if (exporting) return; exporting = true;
      ui.toast(scope === 'all' ? 'Preparing all leads for export…' : 'Preparing the current view for export…', 'info');
      try {
        const rows = scope === 'all' ? (await S.leadService.list({ status: 'all', page: 1, pageSize: 'all', export: 1, sort: 'createdAt', dir: 'desc' })).items : await page.table.exportRows();
        NL.file.exportData(format, rows, exportCols(), scope === 'all' ? 'all_leads' : 'leads_filtered');
      } catch (e){ A.fail(e); } finally { exporting = false; }
    }
    function exportCols(){ return [['id', 'Lead ID'], ['name', 'Student Name'], ['mobile', 'Mobile'], ['whatsapp', 'WhatsApp'], ['email', 'Email'], ['source', 'Lead Source'], ['campaignName', 'Campaign'], ['universityName', 'University'], ['campusName', 'Campus'], ['courseName', 'Course'], ['programme', 'Programme'], ['state', 'State'], ['zone', 'Zone'], ['city', 'City'], ['qualification', 'Qualification'], ['passingYear', 'Passing Year'], ['stage', 'Stage'], ['outcomeLabel', 'Outcome'], ['subOutcomeLabel', 'Sub Outcome'], ['score', 'Score'], ['priority', 'Priority'], ['counsellorName', 'Counsellor'], ['teamLeaderName', 'Team Leader'], ['lastContactAt', 'Last Contact'], ['nextFollowupAt', 'Next Follow-up'], ['createdAt', 'Created'], ['status', 'Status']].map(([k, l]) => ({ label: l, value: (r) => /At$/.test(k) && r[k] ? F.dateTime(r[k]) : r[k] })); }
    /* Insight panel above the list, two tabs, both following the current filters:
       "By state" — state-wise bifurcation chips; "By course" — course-wise pipeline dashboard.
       Clicking a state or course filters the list by it. */
    let courseGroup = st.getPref('leadCourseGroup', 'programme');
    let stateSeq = 0, stateOpen = st.getPref('leadStatesOpen', true), insightTab = query.insights === 'course' || query.insights === 'state' ? query.insights : st.getPref('leadInsightTab', 'state');
    const BUCKETS = [['admitted', 'Admitted', 'cb-admitted'], ['applied', 'Applied', 'cb-applied'], ['qualified', 'Qualified', 'cb-qualified'], ['interested', 'Interested', 'cb-interested'],
      ['contacted', 'Contacted', 'cb-contacted'], ['new', 'New', 'cb-new'], ['exited', 'Exited', 'cb-exited']];
    const tabs = () => html`<div class="ins-tabs" role="tablist"><button role="tab" aria-selected="${insightTab === 'state'}" class="${insightTab === 'state' ? 'active' : ''}" data-ins-tab="state">By state</button><button role="tab" aria-selected="${insightTab === 'course'}" class="${insightTab === 'course' ? 'active' : ''}" data-ins-tab="course">By course</button></div>`;
    function stateView(r, box){
      const cur = page.fb.values().state || '';
      const chip = (value, label, n, zone) => html`<button class="chip st-chip ${NL.w.zoneClass(zone)} ${cur === value ? 'active' : ''}" data-state="${value}">${label} <b>${F.num(n)}</b></button>`;
      const top = r.states.filter(x => x.state).slice(0, stateOpen ? 40 : 8); const none = r.states.find(x => !x.state);
      box.innerHTML = NL.util.toHtml(html`<div class="st-head">${tabs()}<span class="muted small">${F.num(r.total)} leads · ${r.states.filter(x => x.state).length} states</span>
        <span class="st-zones">${Object.entries(r.zones).sort((a, b) => b[1] - a[1]).map(([z, n]) => html`<span class="state-pill ${NL.w.zoneClass(z)}">${z} ${F.num(n)}</span>`)}</span>
        <span class="spacer"></span>${cur ? html`<button class="link-btn small" data-state="">✕ All states</button>` : ''}<button class="link-btn small" data-st-toggle>${stateOpen ? 'Show fewer' : 'Show all'}</button></div>
        <div class="st-chips">${top.map(x => chip(x.state, x.state, x.count, x.zone))}${none ? chip('__none', 'Not specified', none.count) : ''}</div>`);
    }
    function courseView(r, box){
      const fkey = courseGroup === 'programme' ? 'programme' : 'courseName'; const cur = page.fb.values()[fkey] || '';
      const named = r.courses.filter(c => c.course); const list = stateOpen ? r.courses : r.courses.slice(0, 6);
      const max = Math.max(1, ...r.courses.map(c => c.leads));
      const adm = named.reduce((n, c) => n + c.reached.admitted, 0);
      const tip = (c) => BUCKETS.filter(([k]) => c.buckets[k]).map(([k, l]) => `${l}: ${c.buckets[k]}`).join(' · ');
      const isP = courseGroup === 'programme'; const noun = isP ? 'programme' : 'course';
      const sw = html`<div class="ins-tabs sm" role="group" aria-label="Group courses by"><button class="${isP ? 'active' : ''}" data-course-group="programme" aria-pressed="${isP}">Programme</button><button class="${!isP ? 'active' : ''}" data-course-group="course" aria-pressed="${!isP}">Full course name</button></div>`;
      box.innerHTML = NL.util.toHtml(html`<div class="st-head">${tabs()}${sw}<span class="muted small">${F.num(r.total)} leads · ${named.length} ${noun}s · ${F.num(adm)} admitted</span>
        <span class="spacer"></span>${cur ? html`<button class="link-btn small" data-course="">✕ All ${noun}s</button>` : ''}${r.courses.length > 6 ? html`<button class="link-btn small" data-st-toggle>${stateOpen ? 'Show fewer' : 'Show all'}</button>` : ''}</div>
        <div class="cw-legend" aria-hidden="true">${BUCKETS.map(([, l, cls]) => html`<span><i class="${cls}"></i>${l}</span>`)}<span class="muted">· each lead counted at the furthest step reached</span></div>
        <div class="cw-scroll"><table class="cw-table"><thead><tr><th>${isP ? 'Programme' : 'Course'}</th><th class="cw-bar-col">Pipeline</th><th class="r">Leads</th><th class="r">Hot</th><th class="r">Qualified</th><th class="r">Applied</th><th class="r">Admitted</th><th class="r">Conv.</th></tr></thead>
        <tbody>${list.map(c => html`<tr class="${cur && cur === c.course ? 'active' : ''} ${c.course ? 'clickable' : ''}" ${c.course ? NL.util.raw(`data-course="${NL.util.escape(c.course)}"`) : ''} title="${c.course ? 'Show only ' + c.course + ' leads' : ''}">
          <td class="cw-name">${c.course || html`<span class="muted">Not specified</span>`}${isP && c.variants > 1 ? html`<span class="muted tiny"> · ${c.variants} course names</span>` : ''}${c.universities > 1 ? html`<span class="muted tiny"> · ${c.universities} universities</span>` : ''}</td>
          <td class="cw-bar-col"><div class="cw-bar" style="width:${Math.max(6, Math.round(c.leads / max * 100))}%" data-tip="${NL.util.escape((c.course || 'Not specified') + ' — ' + tip(c))}">${BUCKETS.map(([k, , cls]) => c.buckets[k] ? html`<span class="${cls}" style="flex:${c.buckets[k]}"></span>` : '')}</div></td>
          <td class="r num"><b>${F.num(c.leads)}</b></td><td class="r num">${F.num(c.hot)}</td><td class="r num">${F.num(c.reached.qualified)}</td><td class="r num">${F.num(c.reached.applied)}</td>
          <td class="r num">${F.num(c.reached.admitted)}</td><td class="r num">${F.pct(c.conversion)}</td></tr>`)}</tbody></table></div>`);
    }
    async function loadStates(){
      const box = el.querySelector('#stateStrip'); if (!box) return;
      const my = ++stateSeq; const q = page.table.query(); delete q.page; delete q.pageSize; delete q.sort; delete q.dir;
      try {
        const r = insightTab === 'course' ? await S.leadService.byCourse(Object.assign(q, { group: courseGroup })) : await S.leadService.byState(q); if (my !== stateSeq) return;
        if (insightTab === 'course') courseView(r, box); else stateView(r, box);
      } catch (e){ box.innerHTML = ''; }
    }
    el.addEventListener('click', (e) => {
      const tb = e.target.closest('[data-ins-tab]'); if (tb){ insightTab = tb.dataset.insTab; st.setPref('leadInsightTab', insightTab); loadStates(); return; }
      const t = e.target.closest('[data-st-toggle]'); if (t){ stateOpen = !stateOpen; st.setPref('leadStatesOpen', stateOpen); loadStates(); return; }
      const cr = e.target.closest('#stateStrip [data-course]');
      if (cr){ const k = courseGroup === 'programme' ? 'programme' : 'courseName'; const v = cr.dataset.course; page.fb.set(k, page.fb.values()[k] === v ? '' : v); page.table.reload(); return; }
      const cg = e.target.closest('[data-course-group]'); if (cg){ courseGroup = cg.dataset.courseGroup; st.setPref('leadCourseGroup', courseGroup); loadStates(); return; }
      const c = e.target.closest('#stateStrip [data-state]'); if (!c) return;
      const v = c.dataset.state; page.fb.set('state', page.fb.values().state === v ? '' : v); page.table.reload();
    });
    async function bulkStage(ids){
      const res = await ui.formModal({ title: `Change stage for ${ids.length} leads`, cols: 1, size: 'sm', fields: [{ name: 'stage', label: 'New stage', type: 'select', required: true, options: s.leadStages.concat(s.negativeStages) }],
        submitLabel: 'Change stage', onSubmit: async (v) => { const ok = await ui.confirm({ title: 'Change admission status', message: `Are you sure you want to move ${ids.length} leads to “${v.stage}”?`, danger: s.negativeStages.includes(v.stage), confirmText: 'Confirm' }); if (!ok) return false; return S.leadService.bulk(ids, 'stage', v.stage); } });
      if (res){ ui.toast(`${ids.length} leads updated`); A.changed('leads'); page.table.clearSelection(); }
    }
    async function bulkCampaign(ids){
      const res = await ui.formModal({ title: `Change campaign for ${ids.length} leads`, cols: 1, size: 'sm', fields: [{ name: 'campaignId', label: 'Campaign', type: 'select', options: () => o.campaigns(), placeholder: '— No campaign —' }],
        submitLabel: 'Update', onSubmit: (v) => S.leadService.bulk(ids, 'campaign', v.campaignId) });
      if (res){ ui.toast(`${ids.length} leads updated`); A.changed('leads'); page.table.clearSelection(); }
    }
    return page.cleanup;
  }

  NL.pages.leads = { title: 'Leads', perm: 'leads.view', crumbs: ['Admissions', 'Leads'], render };
  NL.leadMenu = leadMenu;
})();
