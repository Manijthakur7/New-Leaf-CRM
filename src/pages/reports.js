/* Reports — counsellor performance, campaign and follow-up outcome reports (plus the admission,
   revenue and application reports, which are no longer in the menu). All exportable. */
(function(){
  const { html, raw, toHtml, $, $$ } = NL.util;
  const S = NL.services, st = NL.store, ui = NL.ui, w = NL.w, ch = NL.charts, F = NL.fmt;
  const KINDS = {
    admissions: { title: 'Admission Reports', perm: 'reports.view' }, counsellors: { title: 'Counsellor Performance', perm: 'reports.view' },
    campaigns: { title: 'Campaign Reports', perm: 'reports.view' }, outcomes: { title: 'Follow-up Outcomes', perm: 'reports.view' }, revenue: { title: 'Revenue / Fee Reports', perm: 'reports.revenue' }, applications: { title: 'Application Reports', perm: 'reports.view' }
  };

  function table(cols, rows, o){
    o = o || {};
    if (!rows.length) return ui.empty({ icon: '📊', title: 'No data for this period', text: 'Try a wider date range.' });
    const tot = o.totals ? cols.map(c => c.sum ? rows.reduce((s, r) => s + (Number(c.v(r)) || 0), 0) : null) : null;
    return html`<div class="table-wrap flat"><table class="table compact"><thead><tr>${cols.map(c => html`<th class="${c.r ? 'r' : ''}">${c.l}</th>`)}</tr></thead>
      <tbody>${rows.map(r => html`<tr ${o.link ? raw(`class="clickable" data-link="${NL.util.escape(o.link(r))}"`) : ''}>${cols.map(c => html`<td class="${c.r ? 'r num' : ''} ${c.cls || ''}">${c.f ? c.f(c.v(r), r) : c.v(r)}</td>`)}</tr>`)}</tbody>
      ${tot ? html`<tfoot><tr>${cols.map((c, i) => html`<td class="${c.r ? 'r num' : ''}"><b>${i === 0 ? 'Total' : tot[i] == null ? '' : c.f && !c.pctCol ? c.f(tot[i]) : F.num(tot[i])}</b></td>`)}</tr></tfoot>` : ''}</table></div>`;
  }
  /* Outcome → sub-outcome tree: each outcome (with its total) followed by its sub-outcomes, largest first. */
  function subTree(groups, link){
    if (!groups.length) return ui.empty({ icon: '📋', title: 'No outcomes recorded in this period' });
    return html`<div class="table-wrap flat"><table class="table compact sub-tree"><thead><tr><th>Outcome / sub outcome</th><th class="r">Follow-ups</th><th class="r">Share of outcome</th></tr></thead>
      <tbody>${groups.map(g => html`<tr class="st-group clickable" data-link="${link(g)}"><td>${g.label}</td><td class="r num">${F.num(g.count)}</td><td></td></tr>
        ${g.subOutcomes.filter(x => x.count).map((x, i, arr) => html`<tr class="st-sub clickable" data-link="${link(g) + (x.value === '_none' ? '' : '&completionSubOutcome=' + encodeURIComponent(x.value))}">
          <td><span class="st-branch" aria-hidden="true">${i === arr.length - 1 ? '└──' : '├──'}</span> ${x.label}</td><td class="r num">${F.num(x.count)}</td><td class="r num">${F.pct(g.count ? x.count / g.count * 100 : 0)}</td></tr>`)}`)}</tbody></table></div>`;
  }
  const exportCols = (cols) => cols.map(c => ({ label: c.l, value: (r) => { const v = c.v(r); return typeof v === 'number' ? Math.round(v * 100) / 100 : v; } }));

  function render(el, params, query){
    const kind = KINDS[params.kind] ? params.kind : 'admissions'; const K = KINDS[kind];
    const pref = st.getPref('rep:' + kind, { preset: 'thisMonth', from: '', to: '' });
    let groupBy = query.groupBy || 'university', teamId = query.teamId || '', current = null;
    const rangeQ = () => { const r = F.range(pref.preset, pref.from, pref.to); return { from: r.from, to: r.to }; };
    el.innerHTML = toHtml(html`${w.pageHead({ title: K.title, sub: 'Figures respect your data scope and the selected date range', actions: [st.can('reports.export') && { label: 'Export CSV', icon: '⤓', action: 'csv' }, st.can('reports.export') && { label: 'Export Excel', icon: '📊', action: 'xlsx' }] })}
      <div class="filterbar"><div class="fb-row">
        <div class="fb-field"><label>Date range</label><select data-r="preset">${NL.fmt.RANGE_PRESETS.map(([k, l]) => html`<option value="${k}" ${pref.preset === k ? raw('selected') : ''}>${l}</option>`)}</select></div>
        <div class="fb-field" data-custom ${pref.preset === 'custom' ? '' : raw('hidden')}><label>From</label><input type="date" data-r="from" value="${pref.from}"></div>
        <div class="fb-field" data-custom ${pref.preset === 'custom' ? '' : raw('hidden')}><label>To</label><input type="date" data-r="to" value="${pref.to}"></div>
        ${kind === 'admissions' ? html`<div class="fb-field"><label>Report</label><select data-r="groupBy">${[['university', 'University-wise'], ['programme', 'Programme-wise'], ['course', 'Course-wise (full name)'], ['source', 'Source-wise'], ['state', 'State-wise'], ['campaign', 'Campaign-wise'], st.scope() === 'all' ? ['team', 'Team-wise'] : null, ['mis', 'Daily MIS']].filter(Boolean).map(([k, l]) => html`<option value="${k}" ${groupBy === k ? raw('selected') : ''}>${l}</option>`)}</select></div>` : ''}
        ${kind === 'counsellors' && st.scope() === 'all' ? html`<div class="fb-field"><label>Team</label><select data-r="teamId"><option value="">All teams</option>${st.options.teams().map(t => html`<option value="${t.value}" ${teamId === t.value ? raw('selected') : ''}>${t.label}</option>`)}</select></div>` : ''}
      </div></div><div id="repBody"></div>`);
    const body = $('#repBody', el);

    function load(){
      const q = rangeQ(); const svc = S.reportService;
      const loader = kind === 'admissions' ? (groupBy === 'mis' ? () => svc.mis(q) : () => svc.admissions(Object.assign({ groupBy }, q))) : kind === 'counsellors' ? () => svc.counsellors(Object.assign({ teamId }, q))
        : kind === 'campaigns' ? () => svc.campaigns(q) : kind === 'outcomes' ? () => svc.followupOutcomes(q) : kind === 'revenue' ? () => svc.revenue(q) : () => svc.applications(q);
      ui.load(body, loader, (d) => { current = draw(d); }, { cards: 6, what: 'the report' });
    }
    function draw(d){
      const lbl = F.rangeLabel(pref.preset);
      if (kind === 'admissions' && groupBy === 'mis'){
        const cols = [{ l: 'Date', v: r => r.date, f: v => F.date(v) }, { l: 'New leads', v: r => r.newLeads, r: 1, sum: 1 }, { l: 'Calls', v: r => r.calls, r: 1, sum: 1 }, { l: 'Connected', v: r => r.connected, r: 1, sum: 1 },
          { l: 'Follow-ups done', v: r => r.followupsDone, r: 1, sum: 1 }, { l: 'Applications', v: r => r.applications, r: 1, sum: 1 }, { l: 'Payments', v: r => r.payments, r: 1, sum: 1 },
          { l: 'Admissions', v: r => r.admissions, r: 1, sum: 1 }, { l: 'Enrolled', v: r => r.enrolled, r: 1, sum: 1 }, { l: 'Revenue', v: r => r.revenue, r: 1, sum: 1, f: v => F.money(v) }];
        const rev = d.rows.slice().reverse();
        body.innerHTML = toHtml(html`${w.card('Daily activity', ch.bars({ labels: rev.map(r => F.date(r.date).slice(0, 6)), series: [{ name: 'New leads', values: rev.map(r => r.newLeads) }, { name: 'Applications', values: rev.map(r => r.applications) }, { name: 'Admissions', values: rev.map(r => r.admissions) }] }))}
          ${w.card(`Daily MIS · ${lbl}`, table(cols, d.rows, { totals: true }))}`);
        return { rows: d.rows, cols, name: 'daily_mis' };
      }
      if (kind === 'admissions'){
        const k = d.kpis;
        const link = { university: r => '#/leads?universityId=' + r.key, campaign: r => '#/leads?campaignId=' + r.key, team: r => '#/leads?teamId=' + r.key }[groupBy];
        const cols = [{ l: { university: 'University', programme: 'Programme', course: 'Course', source: 'Lead source', state: 'State', campaign: 'Campaign', team: 'Team' }[groupBy], v: r => r.label, cls: 'name' },
          { l: 'Leads', v: r => r.leads, r: 1, sum: 1 }, { l: 'Contacted', v: r => r.contacted, r: 1, sum: 1 }, { l: 'Qualified', v: r => r.qualified, r: 1, sum: 1 }, { l: 'Applications', v: r => r.applications, r: 1, sum: 1 },
          { l: 'Paid', v: r => r.paid, r: 1, sum: 1 }, { l: 'Admissions', v: r => r.admissions, r: 1, sum: 1 }, { l: 'Enrolled', v: r => r.enrolled, r: 1, sum: 1 }, { l: 'Revenue', v: r => r.revenue, r: 1, sum: 1, f: v => F.money(v) }, { l: 'Conversion', v: r => r.conversion, r: 1, f: v => F.pct(v) }];
        body.innerHTML = toHtml(html`<div class="kpi-grid">${w.kpi({ icon: '🎯', value: F.num(k.totalLeads), label: 'Leads' })}${w.kpi({ icon: '📝', value: F.num(k.applications), label: 'Applications' })}${w.kpi({ icon: '💳', value: F.num(k.paidApplications), label: 'Paid applications' })}
          ${w.kpi({ icon: '🏛️', value: F.num(k.admissions), label: 'Admissions' })}${w.kpi({ icon: '🎓', value: F.num(k.enrolled), label: 'Enrolled' })}${w.kpi({ icon: '📈', value: F.pct(k.conversionRate, 2), label: 'Conversion' })}</div>
          <div class="grid-2">${w.card('Admission funnel', ch.funnel(d.funnel))}${w.card('Leads vs admissions', ch.bars({ labels: d.rows.slice(0, 10).map(r => r.label.length > 16 ? r.label.slice(0, 15) + '…' : r.label), series: [{ name: 'Leads', values: d.rows.slice(0, 10).map(r => r.leads) }, { name: 'Applications', values: d.rows.slice(0, 10).map(r => r.applications) }, { name: 'Admissions', values: d.rows.slice(0, 10).map(r => r.admissions) }] }))}</div>
          ${w.card(`${cols[0].l}-wise admission report · ${lbl}`, table(cols, d.rows, { totals: true, link }))}`);
        return { rows: d.rows, cols, name: 'admission_report_' + groupBy };
      }
      if (kind === 'counsellors'){
        const cols = [d.rankBy !== 'none' ? { l: 'Rank', v: r => r.rank, r: 1 } : null, { l: 'Counsellor', v: r => r.name, cls: 'name' }, { l: 'Team', v: r => r.teamName || '—' }, { l: 'Leads assigned', v: r => r.assigned, r: 1, sum: 1 }, { l: 'Contacted', v: r => r.contacted, r: 1, sum: 1 },
          { l: 'Calls', v: r => r.calls, r: 1, sum: 1 }, { l: 'Connected', v: r => r.connected, r: 1, sum: 1 }, { l: 'Talk time', v: r => r.talkTime, r: 1, sum: 1, f: v => F.duration(v) }, { l: 'Follow-ups done', v: r => r.followupsDone, r: 1, sum: 1 },
          { l: 'Applications', v: r => r.applications, r: 1, sum: 1 }, { l: 'Paid apps', v: r => r.paidApplications, r: 1, sum: 1 }, { l: 'Admissions', v: r => r.admissions, r: 1, sum: 1 },
          st.can('reports.revenue') ? { l: 'Revenue', v: r => r.revenue, r: 1, sum: 1, f: v => F.money(v) } : null, { l: 'Conversion', v: r => r.conversion, r: 1, f: v => F.pct(v) },
          { l: 'Target', v: r => r.target, r: 1, sum: 1 }, { l: 'Achievement', v: r => r.achievement, r: 1, sum: 1 }, { l: 'Achievement %', v: r => r.achievementPct, r: 1, f: v => F.pct(v, 0), pctCol: 1 }].filter(Boolean);
        const top = d.rows.slice(0, 14); const short = (n) => n.split(' ')[0] + ' ' + (n.split(' ')[1] || '')[0] + '.';
        body.innerHTML = toHtml(html`<div class="notice">${d.rankBy === 'none' ? html`Counsellors are listed alphabetically — no ranking rule is configured. An administrator can set a ranking rule in <a href="#/settings?section=performance">Settings → Performance</a>.` : html`Ranked by <b>${d.rankBy}</b> (configured in Settings → Performance).`}</div>
          <div class="grid-2">${w.card('Admissions vs target', ch.bars({ labels: top.map(r => short(r.name)), series: [{ name: 'Target', values: top.map(r => r.target), color: '#9ec5f4' }, { name: 'Admissions', values: top.map(r => r.admissions), color: '#2a78d6' }] }))}
            ${w.card('Calls vs connected', ch.bars({ labels: top.map(r => short(r.name)), series: [{ name: 'Calls', values: top.map(r => r.calls), color: '#eb6834' }, { name: 'Connected', values: top.map(r => r.connected), color: '#1baf7a' }] }))}</div>
          ${w.card(`Counsellor performance · ${lbl}`, table(cols, d.rows, { totals: true, link: r => '#/leads?counsellorId=' + r.id }))}`);
        return { rows: d.rows, cols, name: 'counsellor_performance' };
      }
      if (kind === 'outcomes'){
        const cols = [{ l: 'Outcome', v: r => r.label, cls: 'name' }, { l: 'Follow-ups', v: r => r.count, r: 1, sum: 1 }, { l: 'Share', v: r => r.share, r: 1, f: v => F.pct(v), pctCol: 1 }];
        const link = (r) => '#/followups?bucket=completed&completionOutcome=' + encodeURIComponent(r.value);
        const coded = d.rows.filter(r => !r.unrecorded && r.count); const top = coded.filter(r => !r.inactive)[0];
        body.innerHTML = toHtml(html`<div class="kpi-grid">${w.kpi({ icon: '✅', value: F.num(d.total), label: 'Follow-ups completed', sub: lbl })}
            ${top ? w.kpi({ icon: '🏆', value: F.num(top.count), label: 'Most common: ' + top.label, sub: F.pct(top.share) + ' of completions' }) : ''}</div>
          ${w.card(`Outcomes · ${lbl}`, coded.length ? ch.hbars(coded.map(r => [r.label, r.count, F.pct(r.share)])) : ui.empty({ icon: '📋', title: 'No outcomes recorded in this period', text: 'Outcomes appear here once follow-ups are completed with the Complete Follow-up dialog.' }))}
          ${w.card('Outcome breakdown', table(cols, d.rows, { totals: true, link }))}
          ${w.card('Sub outcome breakdown', subTree(d.rows.filter(r => r.subOutcomes && r.count), link))}`);
        // Export: one row per outcome, followed by its sub-outcomes.
        const flat = []; d.rows.forEach(r => { flat.push({ outcome: r.label, sub: '', count: r.count, share: r.share }); (r.subOutcomes || []).filter(x => x.count).forEach(x => flat.push({ outcome: r.label, sub: x.label, count: x.count, share: r.count ? x.count / r.count * 100 : 0 })); });
        return { rows: flat, cols: [{ l: 'Outcome', v: r => r.outcome }, { l: 'Sub outcome', v: r => r.sub }, { l: 'Follow-ups', v: r => r.count }, { l: 'Share %', v: r => r.share }], name: 'followup_outcomes' };
      }
      if (kind === 'campaigns'){
        const cols = [{ l: 'Campaign', v: r => r.name, cls: 'name' }, { l: 'Source', v: r => r.source }, { l: 'University', v: r => r.universityName || 'All' }, { l: 'Status', v: r => r.status, f: v => ui.badge(v) },
          { l: 'Leads', v: r => r.leads, r: 1, sum: 1 }, { l: 'Contacted', v: r => r.contacted, r: 1, sum: 1 }, { l: 'Qualified', v: r => r.qualified, r: 1, sum: 1 }, { l: 'Applications', v: r => r.applications, r: 1, sum: 1 }, { l: 'Admissions', v: r => r.admissions, r: 1, sum: 1 },
          { l: 'Cost', v: r => r.cost, r: 1, sum: 1, f: v => F.money(v) }, { l: 'Cost / lead', v: r => r.cpl, r: 1, f: v => F.money(v) }, { l: 'Revenue', v: r => r.revenue, r: 1, sum: 1, f: v => F.money(v) },
          { l: 'ROI', v: r => r.roi, r: 1, f: v => html`<span class="${v < 0 ? 'neg' : 'pos'}">${F.pct(v, 0)}</span>`, pctCol: 1 }, { l: 'Conversion', v: r => r.conversionRate, r: 1, f: v => F.pct(v), pctCol: 1 }];
        body.innerHTML = toHtml(html`<div class="notice">Cost uses each campaign's total budget; leads, revenue and admissions are for leads created in the selected period.</div>
          <div class="grid-2">${w.card('Leads by campaign', ch.hbars(d.rows.filter(r => r.leads).sort((a, b) => b.leads - a.leads).map(r => [r.name, r.leads, `${r.admissions} admissions`])))}
            ${w.card('Leads by source', ch.hbars(d.bySource.map(r => [r.label, r.leads, `${r.enrolled} enrolled`])))}</div>
          ${w.card(`Campaign performance · ${lbl}`, table(cols, d.rows, { totals: true, link: r => '#/leads?campaignId=' + r.id }))}`);
        return { rows: d.rows, cols, name: 'campaign_report' };
      }
      if (kind === 'revenue'){
        const t = d.totals; const pairsCols = [{ l: 'Group', v: r => r[0], cls: 'name' }, { l: 'Collected', v: r => r[1], r: 1, sum: 1, f: v => F.money(v) }];
        body.innerHTML = toHtml(html`<div class="kpi-grid">${w.kpi({ tone: 'good', icon: '💰', value: F.compactMoney(t.collected), label: 'Collected', sub: F.money(t.collected) })}${w.kpi({ icon: '⏳', value: F.compactMoney(t.pending), label: 'Pending / initiated' })}
          ${w.kpi({ icon: '⛔', value: F.compactMoney(t.failed), label: 'Failed' })}${w.kpi({ icon: '↩️', value: F.compactMoney(t.refunded), label: 'Refunded' })}${w.kpi({ icon: '🧾', value: F.num(t.count), label: 'Transactions' })}${w.kpi({ icon: '🔍', value: F.num(t.unverified), label: 'Awaiting verification', link: '#/payments?status=Successful' })}</div>
          ${w.card('Collections trend', ch.bars({ labels: d.trend.labels, series: [{ name: 'Collected', values: d.trend.collected, color: '#1baf7a' }], format: F.money, axisFormat: v => F.compactMoney(v) }))}
          <div class="grid-2">${w.card('By university', ch.hbars(d.byUniversity, { format: F.money }))}${w.card('By course', ch.hbars(d.byCourse, { format: F.money }))}</div>
          <div class="grid-2">${w.card('By payment mode', ch.donut(d.byMode.map(([l, v]) => ({ label: l, value: v })), { format: F.compactMoney, center: F.compactMoney(t.collected), centerLabel: 'COLLECTED' }))}${w.card('By payment type', table(pairsCols, d.byType, { totals: true }))}</div>`);
        const rows = d.byUniversity.map(r => ({ group: 'University', name: r[0], amount: r[1] })).concat(d.byCourse.map(r => ({ group: 'Course', name: r[0], amount: r[1] })), d.byMode.map(r => ({ group: 'Mode', name: r[0], amount: r[1] })), d.byType.map(r => ({ group: 'Type', name: r[0], amount: r[1] })));
        return { rows, cols: [{ l: 'Dimension', v: r => r.group }, { l: 'Value', v: r => r.name }, { l: 'Collected (INR)', v: r => r.amount }], name: 'revenue_report' };
      }
      // applications
      const cols = [{ l: 'University', v: r => r.label, cls: 'name' }, { l: 'Applications', v: r => r.applications, r: 1, sum: 1 }, { l: 'Paid', v: r => r.paid, r: 1, sum: 1 }, { l: 'Admissions', v: r => r.admissions, r: 1, sum: 1 }, { l: 'Revenue', v: r => r.revenue, r: 1, sum: 1, f: v => F.money(v) }];
      body.innerHTML = toHtml(html`<div class="kpi-grid">${w.kpi({ icon: '📝', value: F.num(d.total), label: 'Applications created' })}${w.kpi({ icon: '⏱️', value: d.avgDaysToConfirm == null ? '—' : d.avgDaysToConfirm.toFixed(1) + ' d', label: 'Avg. days to admission' })}
        ${d.admission.map(([k, v]) => w.kpi({ icon: '•', value: F.num(v), label: k }))}</div>
        ${w.card('Applications by stage', ch.hbars(d.byStage.filter(x => x[1]), { multi: false }))}
        <div class="grid-2">${w.card('Document status', ch.donut(d.documents.map(([l, v]) => ({ label: l, value: v }))))}${w.card('Payment status', ch.donut(d.payment.map(([l, v]) => ({ label: l, value: v }))))}</div>
        ${w.card(`University-wise applications · ${lbl}`, table(cols, d.byUniversity.filter(r => r.applications), { totals: true, link: r => '#/applications?universityId=' + r.key }))}`);
      return { rows: d.byStage.map(([s, n]) => ({ s, n })), cols: [{ l: 'Stage', v: r => r.s }, { l: 'Applications', v: r => r.n }], name: 'application_report' };
    }

    el.addEventListener('change', (e) => {
      const k = e.target.dataset.r; if (!k) return;
      if (k === 'preset'){ pref.preset = e.target.value; $$('[data-custom]', el).forEach(x => (x.hidden = pref.preset !== 'custom')); if (pref.preset === 'custom' && !(pref.from && pref.to)) return; }
      if (k === 'from' || k === 'to'){ pref[k] = e.target.value; if (!pref.from || !pref.to) return; if (pref.to < pref.from){ ui.toast('End date is before start date', 'warn'); return; } }
      if (k === 'groupBy') groupBy = e.target.value;
      if (k === 'teamId') teamId = e.target.value;
      st.setPref('rep:' + kind, pref); load();
    });
    el.addEventListener('click', (e) => {
      const lk = e.target.closest('[data-link]'); if (lk){ location.hash = lk.dataset.link; return; }
      const b = e.target.closest('.page-head [data-action]'); if (!b || !current) return;
      NL.file.exportData(b.dataset.action, current.rows, exportCols(current.cols), current.name);
    });
    load();
  }

  NL.pages.reports = { title: (p) => (KINDS[p.kind] || KINDS.admissions).title, perm: (p) => (KINDS[p.kind] || KINDS.admissions).perm, crumbs: (p) => ['Reports', (KINDS[p.kind] || KINDS.admissions).title], render };
})();
