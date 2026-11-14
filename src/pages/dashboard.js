/* Dashboards: executive / management, team leader, counsellor workspace.
   Which one renders depends on the signed-in role's scope + permissions. */
(function(){
  const { html, raw, toHtml, $, $$ } = NL.util;
  const S = NL.services, st = NL.store, ui = NL.ui, w = NL.w, ch = NL.charts, F = NL.fmt;

  function rangeBar(preset, custom){
    const P = [['today', 'Today'], ['yesterday', 'Yesterday'], ['last7', 'Last 7 Days'], ['thisWeek', 'This Week'], ['thisMonth', 'This Month'], ['lastMonth', 'Last Month'], ['thisQuarter', 'This Quarter'], ['thisYear', 'This Year'], ['custom', 'Custom']];
    return html`<div class="range-bar" role="group" aria-label="Date range">${P.map(([k, l]) => html`<button class="rb ${preset === k ? 'active' : ''}" data-range="${k}">${l}</button>`)}
      <span class="rb-custom" ${preset === 'custom' ? '' : raw('hidden')}><input type="date" data-cf value="${custom.from || ''}"> – <input type="date" data-ct value="${custom.to || ''}"><button class="btn-primary btn-sm" data-apply>Apply</button></span></div>`;
  }
  function useRange(key, def){
    const saved = st.getPref(key, { preset: def || 'thisMonth', from: '', to: '' });
    return { get: () => saved, q: () => { const r = F.range(saved.preset, saved.from, saved.to); return { from: r.from, to: r.to }; }, set: (p) => { Object.assign(saved, p); st.setPref(key, saved); } };
  }
  function wireRange(root, R, reload){
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-range]');
      if (b){ const p = b.dataset.range; $$('.rb', root).forEach(x => x.classList.toggle('active', x === b)); $('.rb-custom', root).hidden = p !== 'custom'; if (p !== 'custom'){ R.set({ preset: p }); reload(); } else R.set({ preset: 'custom' }); }
      if (e.target.closest('[data-apply]')){ const f = $('[data-cf]', root).value, t = $('[data-ct]', root).value; if (!f || !t){ ui.toast('Pick both dates', 'warn'); return; } if (t < f){ ui.toast('End date is before start date', 'warn'); return; } R.set({ preset: 'custom', from: f, to: t }); reload(); }
    });
  }
  const UNIT = { day: 'daily', week: 'weekly', month: 'monthly' };
  const linkNav = (root) => root.addEventListener('click', (e) => { const k = e.target.closest('[data-link]'); if (k) location.hash = k.dataset.link; });
  // Shortcut to the import wizard, where uploaded leads are distributed across the chosen agents
  const uploadBtn = () => st.can('leads.import') ? html`<div class="page-actions"><button class="btn-primary" data-link="#/import" title="Upload an Excel/CSV file and distribute the leads to agents">📥 Upload Leads (Excel)</button></div>` : '';

  /* ================= EXECUTIVE / MANAGEMENT ================= */
  function renderExecutive(el){
    const R = useRange('dashRange', 'thisMonth');
    const u = st.user();
    el.innerHTML = toHtml(html`
      <div class="hero-greeting"><div><h1>${greet()}, ${u.fullName.split(' ')[0]}</h1><div class="sub">${st.role().name} · ${NL.config.PRODUCT_NAME}</div></div>${uploadBtn()}</div>
      ${rangeBar(R.get().preset, R.get())}
      <div id="dashBody"></div>`);
    const body = $('#dashBody', el);
    wireRange(el, R, load); linkNav(el);
    function load(){
      ui.load(body, () => S.reportService.dashboard(R.q()), (d) => draw(d), { cards: 10, what: 'the dashboard' });
    }
    function draw(d){
      const k = d.kpis, p = d.previous, lbl = F.rangeLabel(R.get().preset);
      const canLeads = st.can('leads.view'), canRev = st.can('reports.revenue') || st.can('payments.view'), canApps = st.can('applications.view');
      const isToday = R.get().preset === 'today';
      body.innerHTML = toHtml(html`
        <div class="hero-kpi-row">
          ${canLeads ? w.kpi({ tone: 'k-blue1', icon: '🎯', value: F.num(k.totalLeads), label: `TOTAL LEADS · ${lbl.toUpperCase()}`, sub: `All-time ${F.num(k.allTimeLeads)}`, delta: w.deltaPct(k.totalLeads, p.totalLeads), link: '#/leads' }) : ''}
          ${canLeads ? w.kpi({ tone: 'k-blue2', icon: '🆕', value: F.num(k.newToday), label: "NEW LEADS TODAY", link: '#/leads?datePreset=today' }) : ''}
          ${canApps ? w.kpi({ tone: 'k-teal', icon: '📝', value: F.num(k.applications), label: 'APPLICATIONS', delta: w.deltaPct(k.applications, p.applications), link: '#/applications' }) : ''}
          ${canLeads ? w.kpi({ tone: 'k-green', icon: '🎓', value: F.num(k.enrolled), label: 'ENROLLED', delta: w.deltaPct(k.enrolled, p.enrolled) }) : ''}
        </div>
        <div class="kpi-grid">
          ${canLeads ? w.kpi({ icon: '📞', value: F.num(k.contacted), label: 'Contacted', sub: F.ratio(k.contacted, k.totalLeads) + ' of leads' }) : ''}
          ${canLeads ? w.kpi({ icon: '✅', value: F.num(k.qualified), label: 'Qualified', sub: F.ratio(k.qualified, k.totalLeads) + ' of leads' }) : ''}
          ${canApps ? w.kpi({ icon: '💳', value: F.num(k.paidApplications), label: 'Paid Applications', sub: F.ratio(k.paidApplications, k.applications) + ' of applications', link: '#/applications?paymentStatus=Paid' }) : ''}
          ${canLeads ? w.kpi({ icon: '📈', value: F.pct(k.conversionRate, 2), label: 'Conversion Rate', sub: 'Enrolled ÷ leads in period' }) : ''}
          ${st.can('followups.view') ? w.kpi({ icon: '📅', value: F.num(k.pendingFollowups), label: 'Pending Follow-ups', sub: html`<span class="neg">${F.num(k.overdueFollowups)} overdue</span>`, link: '#/followups' }) : ''}
          ${st.can('calls.view') ? w.kpi({ icon: '☎️', value: F.num(isToday ? k.todaysCalls : k.calls), label: isToday ? "Today's Calls" : `Calls · ${lbl}`, sub: `${F.num(k.connectedCalls)} connected · today ${F.num(k.todaysCalls)}`, link: '#/calls' }) : ''}
          ${canLeads ? w.kpi({ icon: '🏛️', value: F.num(isToday ? k.todaysAdmissions : k.admissions), label: isToday ? "Today's Admissions" : `Admissions · ${lbl}`, sub: `Today ${F.num(k.todaysAdmissions)}` }) : ''}
          ${st.can('documents.view') ? w.kpi({ icon: '📄', value: F.num(d.pending.documentsToReview), label: 'Documents to review', sub: `${d.pending.documentsRejected} rejected`, link: '#/documents?status=Uploaded' }) : ''}
        </div>
        ${canLeads ? html`<div class="grid-2-1">
          ${w.card('Admission funnel', ch.funnel(d.funnel, { clickable: true }), { right: html`<span class="muted small">Cohort: leads created ${lbl.toLowerCase()}</span>` })}
          <div class="stack">
            ${w.card('Pending actions', pendingList(d.pending))}
            ${w.card('Live floor — all agents', floor(d.floor), { right: html`<a class="link-btn small" href="#/teams?tab=floor">Agent status →</a>` })}
          </div></div>` : ''}
        <div class="grid-2">
          ${canLeads ? w.card(`Lead & admission trend (${UNIT[d.trend.unit]})`, ch.line({ labels: d.trend.labels, series: [{ name: 'Leads', values: d.trend.leads }, { name: 'Applications', values: d.trend.applications }, { name: 'Enrolled', values: d.trend.enrolled }], area: true })) : ''}
          ${canRev ? w.card(`Revenue trend (${UNIT[d.trend.unit]})`, ch.bars({ labels: d.trend.labels, series: [{ name: 'Revenue', values: d.trend.revenue, color: '#1baf7a' }], format: F.money, axisFormat: (v) => F.compactMoney(v).replace('₹', '₹') })) : ''}
        </div>
        ${canLeads ? html`<div class="grid-2">
          ${w.card('University-wise performance', uniTable(d.byUniversity), { right: '' })}
          ${w.card('Programme-wise leads', courseBars(d.byCourse), { right: html`<a class="link-btn small" href="#/leads?insights=course">All courses →</a>` })}
        </div>
        <div class="grid-2">
          ${w.card('Campaign performance', campTable(d.campaigns), { right: st.can('campaigns.view') ? html`<a class="link-btn small" href="#/reports/campaigns">Campaign report →</a>` : '' })}
          ${w.card('Leads by source', ch.hbars(d.bySource.map(r => [r.label, r.leads, `${r.enrolled} enrolled · ${F.pct(r.conversion)} conversion`])))}
        </div>
        ${(d.byState || []).length ? w.card('Leads by state', html`<div class="state-rows">${ch.hbars(d.byState.map(r => [r.label, r.leads, `${r.applications} applications · ${r.admissions} admissions`]))}</div>`,
          { right: html`<a class="link-btn small" href="#/reports/admissions?groupBy=state">State-wise report →</a>` }) : ''}
        ${d.teams.length ? w.card('Team performance', teamTable(d.teams), { right: html`<span class="muted small">Click a team to drill down</span>` }) : ''}` : ''}
        ${!canLeads && canRev ? w.card('Collections by payment mode', ch.hbars(d.revenueByMode, { format: F.money })) : ''}
      `);
      $$('.funnel-line.clickable', body).forEach(r => r.addEventListener('click', () => (location.hash = '#/leads?stage=' + encodeURIComponent(r.dataset.stage))));
    }
    load();
    return st.on('data-changed', (m) => { if (m !== 'presence') return; load(); });
  }
  function greet(){ const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }
  function pendingList(p){
    const rows = [
      ['🎯', 'Unassigned leads', p.unassigned, '#/leads?counsellorId=__none', 'leads.assign'], ['🆕', 'Uncontacted leads', p.uncontacted, '#/leads?stage=New', 'leads.view'],
      ['⏰', 'Overdue follow-ups', p.overdueFollowups, '#/followups?bucket=overdue', 'followups.view'], ['📄', 'Documents awaiting review', p.documentsToReview, '#/documents?status=Uploaded', 'documents.view'],
      ['❌', 'Rejected documents to re-collect', p.documentsRejected, '#/documents?status=Rejected', 'documents.view'],
      ['🏛️', 'Applications in university review', p.universityReview, '#/applications?stage=University%20Review', 'applications.view']
    ].filter(r => st.can(r[4]));
    return html`<div class="pending-list">${rows.map(([i, l, n, link]) => html`<a class="pending-item" href="${link}"><span>${i}</span><span class="pl">${l}</span><span class="num ${n ? 'pn' : 'muted'}">${F.num(n)}</span></a>`)}</div>`;
  }
  function floor(f){
    return html`<div class="floor-kpis"><div><b class="num">${f.total}</b><small>Total</small></div><div><b class="num">${f.loggedIn}</b><small>Logged in</small></div><div><b class="num">${f.onCall}</b><small>On call</small></div><div><b class="num">${f.onBreak}</b><small>On break</small></div><div><b class="num">${f.offline}</b><small>Offline</small></div></div>
      ${ch.donut([{ label: 'Available', value: f.available, color: '#1baf7a' }, { label: 'On Call', value: f.onCall, color: '#2a78d6' }, { label: 'On Break', value: f.onBreak, color: '#eda100' }, { label: 'Offline', value: f.offline, color: '#9aa3ad' }], { size: 120, centerLabel: 'AGENTS' })}`;
  }
  function uniTable(rows){
    if (!rows.length) return ui.empty({ icon: '🏫', title: 'No university activity in this period' });
    return html`<div class="table-wrap flat"><table class="table compact"><thead><tr><th>University</th><th class="r">Leads</th><th class="r">Apps</th><th class="r">Admissions</th><th class="r">Revenue</th><th class="r">Conv.</th></tr></thead>
      <tbody>${rows.map(r => html`<tr class="clickable" data-link="#/leads?universityId=${r.key}"><td class="name">${r.label}</td><td class="r num">${F.num(r.leads)}</td><td class="r num">${F.num(r.applications)}</td><td class="r num">${F.num(r.admissions)}</td><td class="r num">${F.compactMoney(r.revenue)}</td><td class="r num">${F.pct(r.conversion)}</td></tr>`)}</tbody></table></div>`;
  }
  /* Top programmes plus one "Other programmes" row, so the bars always add up to the period's total. */
  function courseBars(rows){
    rows = rows || []; const TOP = 10;
    const total = rows.reduce((n, r) => n + r.leads, 0);
    const pairs = rows.slice(0, TOP).map(r => [r.label, r.leads, `${r.applications} applications · ${r.admissions} admissions`]);
    const rest = rows.slice(TOP);
    if (rest.length) pairs.push([`Other programmes (${rest.length})`, rest.reduce((n, r) => n + r.leads, 0), rest.slice(0, 8).map(r => `${r.label} ${r.leads}`).join(', ') + (rest.length > 8 ? '…' : '')]);
    return html`${ch.hbars(pairs, { multi: false })}<div class="muted small pad">${F.num(total)} leads across ${rows.length} programme${rows.length === 1 ? '' : 's'}. Course names are grouped by programme (e.g. all MBA specialisations count as MBA).</div>`;
  }
  function campTable(rows){
    if (!rows.length) return ui.empty({ icon: '📢', title: 'No campaign leads in this period' });
    return html`<div class="table-wrap flat"><table class="table compact"><thead><tr><th>Campaign</th><th class="r">Leads</th><th class="r">Qualified</th><th class="r">Admissions</th><th class="r">Revenue</th><th class="r">ROI</th></tr></thead>
      <tbody>${rows.map(r => html`<tr class="clickable" data-link="#/leads?campaignId=${r.id}"><td class="name">${r.name}<div class="muted tiny">${r.source}</div></td><td class="r num">${F.num(r.leads)}</td><td class="r num">${F.num(r.qualified)}</td><td class="r num">${F.num(r.admissions)}</td><td class="r num">${F.compactMoney(r.revenue)}</td><td class="r num ${r.roi < 0 ? 'neg' : 'pos'}">${F.pct(r.roi, 0)}</td></tr>`)}</tbody></table></div>`;
  }
  function teamTable(rows){
    return html`<div class="table-wrap flat"><table class="table compact"><thead><tr><th>Team</th><th class="r">Members</th><th class="r">Leads</th><th class="r">Applications</th><th class="r">Admissions</th><th class="r">Revenue</th><th class="r">Conversion</th></tr></thead>
      <tbody>${rows.map(t => html`<tr class="clickable" data-link="#/teams?team=${t.id}"><td class="name">${t.name}</td><td class="r num">${t.members}</td><td class="r num">${F.num(t.leads)}</td><td class="r num">${F.num(t.applications)}</td><td class="r num">${F.num(t.admissions)}</td><td class="r num">${F.compactMoney(t.revenue)}</td><td class="r num">${F.pct(t.conversion)}</td></tr>`)}</tbody></table></div>`;
  }

  /* ================= TEAM LEADER ================= */
  function renderTeamDashboard(el, query, embedded){
    const R = useRange('teamRange', 'thisMonth');
    let teamId = query && query.team || '';
    el.innerHTML = toHtml(html`${embedded ? '' : html`<div class="hero-greeting"><div><h1>${greet()}, ${st.user().fullName.split(' ')[0]}</h1><div class="sub">Team Leader dashboard</div></div>${uploadBtn()}</div>`}
      <div class="row-between">${rangeBar(R.get().preset, R.get())}<div id="teamPick"></div></div><div id="teamBody"></div>`);
    const body = $('#teamBody', el);
    wireRange(el, R, load); linkNav(el);
    el.addEventListener('change', (e) => { if (e.target.matches('#teamSel')){ teamId = e.target.value; load(); } });
    function load(){ ui.load(body, () => Promise.all([S.reportService.team(Object.assign({ teamId }, R.q())), S.reportService.dashboard(R.q())]), ([t, d]) => draw(t, d), { cards: 8, what: 'the team dashboard' }); }
    function draw(t, d){
      if (st.scope() === 'all') $('#teamPick', el).innerHTML = toHtml(html`<label class="small muted">Team <select id="teamSel"><option value="">All teams</option>${t.teams.map(x => html`<option value="${x.id}" ${x.id === teamId ? raw('selected') : ''}>${x.name}</option>`)}</select></label>`);
      body.innerHTML = toHtml(html`
        ${t.team ? html`<div class="team-banner"><b>${t.team.name}</b> <span class="muted">· Team leader: ${t.teamLeaderName || '—'}</span></div>` : ''}
        <div class="kpi-grid">
          ${w.kpi({ icon: '👥', value: t.size, label: 'Team size' })}${w.kpi({ icon: '🟢', value: t.active, label: 'Active counsellors', sub: 'Online now' })}
          ${w.kpi({ icon: '🎯', value: F.num(t.leadsAssigned), label: 'Leads assigned', link: '#/leads' })}${w.kpi({ icon: '🆕', value: F.num(t.uncontacted), label: 'Uncontacted leads', link: '#/leads?stage=New', tone: t.uncontacted ? 'warn' : '' })}
          ${w.kpi({ icon: '⏰', value: F.num(t.overdue), label: 'Overdue follow-ups', link: '#/followups?bucket=overdue', tone: t.overdue ? 'bad' : '' })}${w.kpi({ icon: '📝', value: F.num(t.applications), label: 'Applications' })}
          ${w.kpi({ icon: '🎓', value: F.num(t.admissions), label: 'Admissions' })}${w.kpi({ icon: '📈', value: F.pct(t.conversion), label: 'Conversion', sub: 'Admissions ÷ leads assigned' })}
        </div>
        ${w.card('Target vs achievement', html`${ch.meter(t.achievement, t.target, 'Team admissions')}<div class="meters">${t.members.map(m => ch.meter(m.achievement, m.target, m.name))}</div>`)}
        ${w.card('Counsellors — drill down: team → counsellor → lead → student → application', memberTable(t.members))}
        <div class="grid-2">${w.card('Team funnel', ch.funnel(d.funnel))}${w.card('Trend', ch.line({ labels: d.trend.labels, series: [{ name: 'Leads', values: d.trend.leads }, { name: 'Applications', values: d.trend.applications }, { name: 'Enrolled', values: d.trend.enrolled }] }))}</div>`);
    }
    load();
  }
  function memberTable(rows){
    if (!rows.length) return ui.empty({ icon: '👥', title: 'No counsellors in this team yet', text: 'Add users to the team from Users → Edit.' });
    return html`<div class="table-wrap flat"><table class="table compact"><thead><tr><th>Counsellor</th><th>Status</th><th class="r">Active leads</th><th class="r">Uncontacted</th><th class="r">Calls</th><th class="r">Connected</th><th class="r">Talk time</th><th class="r">Overdue</th><th class="r">Apps</th><th class="r">Admissions</th><th class="r">Target</th></tr></thead>
      <tbody>${rows.map(m => html`<tr class="clickable" data-link="#/leads?counsellorId=${m.id}"><td class="name">${m.name}<div class="muted tiny">${NL.rbac.roleName(m.role)}</div></td><td>${w.presenceDot(m.presence)} ${m.presence || 'Offline'}</td>
        <td class="r num">${m.activeLeads}</td><td class="r num">${m.uncontacted}</td><td class="r num">${m.calls}</td><td class="r num">${m.connected}</td><td class="r num">${F.duration(m.talkTime)}</td><td class="r num ${m.overdue ? 'neg' : ''}">${m.overdue}</td>
        <td class="r num">${m.applications}</td><td class="r num">${m.admissions}</td><td class="r num">${m.target ? F.pct(m.achievementPct, 0) : '—'}</td></tr>`)}</tbody></table></div>`;
  }

  /* ================= COUNSELLOR WORKSPACE ================= */
  function renderWorkspace(el){
    const u = st.user();
    el.innerHTML = toHtml(html`<div class="hero-greeting"><div><h1>${greet()}, ${u.fullName.split(' ')[0]}</h1><div class="sub">My workspace · ${st.role().name}</div></div>
      <div class="page-actions">${st.can('leads.create') ? html`<button class="btn-primary" data-action="add">+ Add Lead</button>` : ''}</div></div><div id="wsBody"></div>`);
    const body = $('#wsBody', el); linkNav(el);
    el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-action=add]')){ const r = await NL.actions.leadForm(); if (r && r.lead) location.hash = '#/leads/' + r.lead.id; }
      const call = e.target.closest('[data-call]'); if (call){ e.stopPropagation(); const l = JSON.parse(call.dataset.call); if (await NL.actions.logCall(l)) load(); }
      const fu = e.target.closest('[data-fu]'); if (fu){ e.stopPropagation(); const f = WS.fus.find(x => x.id === fu.dataset.fu); const act = fu.dataset.act;
        const ok = act === 'done' ? await NL.actions.completeFollowup(f) : act === 'snooze' ? await NL.actions.snoozeFollowup(f, 30) : await NL.actions.rescheduleFollowup(f); if (ok) load(); }
    });
    const WS = { fus: [] };
    function load(){ ui.load(body, () => S.reportService.workspace(), draw, { cards: 8, what: 'your workspace' }); }
    function fuRows(list, cls){
      if (!list.length) return html`<div class="muted small pad">Nothing here 🎉</div>`;
      return html`<div class="ws-list">${list.map(f => html`<div class="ws-item ${cls}" data-link="#/leads/${f.leadId}"><div><b>${f.leadName}</b><div class="muted tiny">${f.reason} · ${F.dateTime(f.dueAt)} · ${f.leadMobile}</div></div>
        <div class="ws-acts"><button class="btn-ghost btn-sm" data-call='${JSON.stringify({ id: f.leadId, name: f.leadName, mobile: f.leadMobile, stage: f.leadStage })}'>📞</button><button class="btn-ghost btn-sm" data-fu="${f.id}" data-act="done" title="Complete">✓</button><button class="btn-ghost btn-sm" data-fu="${f.id}" data-act="snooze" title="Snooze 30 min">💤</button></div></div>`)}</div>`;
    }
    function leadRows(list){
      if (!list.length) return html`<div class="muted small pad">No leads here right now.</div>`;
      return html`<div class="ws-list">${list.map(l => html`<div class="ws-item" data-link="#/leads/${l.id}"><div><b>${l.name}</b> ${ui.scoreBadge(l.score, l.scoreBand)}<div class="muted tiny">${l.courseName || l.preferredCourse || '—'} · ${l.universityName || '—'} · ${l.stage}</div></div>
        <div class="ws-acts"><button class="btn-ghost btn-sm" data-call='${JSON.stringify({ id: l.id, name: l.name, mobile: l.mobile, whatsapp: l.whatsapp, stage: l.stage })}'>📞 Call</button></div></div>`)}</div>`;
    }
    function draw(d){
      WS.fus = d.todaysFollowups.concat(d.overdueFollowups, d.upcoming);
      body.innerHTML = toHtml(html`
        <div class="kpi-grid">
          ${w.kpi({ icon: '🎯', value: d.myLeads, label: 'My active leads', link: '#/leads' })}${w.kpi({ icon: '📅', value: d.todaysFollowups.length, label: "Today's follow-ups", tone: d.todaysFollowups.length ? 'warn' : '', link: '#/followups?bucket=today' })}
          ${w.kpi({ icon: '⚠️', value: d.overdueFollowups.length, label: 'Overdue follow-ups', tone: d.overdueFollowups.length ? 'bad' : '', link: '#/followups?bucket=overdue' })}${w.kpi({ icon: '🆕', value: d.newLeadsCount, label: 'New leads', link: '#/leads?stage=New' })}
          ${w.kpi({ icon: '🔥', value: d.hotLeadsCount, label: 'Hot leads', link: '#/leads?stageGroup=hot' })}${st.can('applications.view') ? w.kpi({ icon: '📝', value: d.applicationsCount, label: 'Open applications', link: '#/applications' }) : ''}
          ${st.can('documents.view') ? w.kpi({ icon: '📄', value: d.pendingDocuments, label: 'Pending documents', link: '#/documents?status=Pending' }) : ''}${st.can('payments.view') ? w.kpi({ icon: '💳', value: d.paymentPending, label: 'Payment pending', link: '#/applications?paymentStatus=Pending' }) : ''}
        </div>
        <div class="grid-2">
          ${w.card("Today's target", html`${ch.meter(d.today.calls, d.today.target, 'Calls today')}<div class="muted small">${d.today.connected} connected · talk time ${F.duration(d.today.talkTime)}</div>`)}
          ${w.card('Monthly target', html`${ch.meter(d.month.admissions, d.month.target, 'Admissions this month')}${d.month.applicationsTarget ? ch.meter(d.month.applications, d.month.applicationsTarget, 'Applications this month') : ''}`)}
        </div>
        <div class="grid-2">
          ${w.card(html`Overdue follow-ups <span class="badge b-red">${d.overdueFollowups.length}</span>`, fuRows(d.overdueFollowups.slice(0, 8), 'overdue'))}
          ${w.card(html`Today's follow-ups <span class="badge b-amber">${d.todaysFollowups.length}</span>`, fuRows(d.todaysFollowups, 'today'))}
        </div>
        <div class="grid-2">${w.card('🔥 Hot leads', leadRows(d.hotLeads))}${w.card('🆕 New leads — call first', leadRows(d.newLeads))}</div>
        ${d.applications.length ? w.card('My open applications', html`<div class="table-wrap flat"><table class="table compact"><thead><tr><th>Application</th><th>Student</th><th>Course</th><th>Stage</th><th>Docs</th><th>Payment</th></tr></thead><tbody>${d.applications.map(a => html`<tr class="clickable" data-link="#/applications/${a.id}"><td class="mono">${a.id}</td><td class="name">${a.studentName}</td><td>${a.courseName}<div class="muted tiny">${a.universityName}</div></td><td>${ui.badge(a.stage)}</td><td>${ui.badge(a.documentsStatus)}</td><td>${ui.badge(a.paymentStatus)}</td></tr>`)}</tbody></table></div>`) : ''}
        ${d.upcoming.length ? w.card('Upcoming follow-ups', fuRows(d.upcoming, 'upcoming')) : ''}`);
    }
    load();
    return st.on('data-changed', () => { if (el.isConnected) load(); });
  }

  NL.pages.dashboard = { title: 'Dashboard', perm: 'dashboard.view', crumbs: ['Dashboard'],
    render(el, p, q){
      if (st.can('dashboard.executive') || (st.scope() === 'all')) return renderExecutive(el);
      if (st.scope() === 'team') return renderTeamDashboard(el, q);
      return renderWorkspace(el);
    } };
  NL.pages.workspace = { title: 'My Workspace', perm: 'leads.view', crumbs: ['Counselling', 'My Workspace'], render: (el) => renderWorkspace(el) };
  NL.dashboards = { renderTeamDashboard, memberTable };
})();
