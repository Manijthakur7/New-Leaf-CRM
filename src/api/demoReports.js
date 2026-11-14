/* Demo API — analytics/report endpoints (GET /api/reports/*).
   All figures respect the caller's data scope. Results are memoised per
   (endpoint, params, user, db version) so re-renders don't recompute. */
(function(){
  const S = NL.demoServer; const H = S.h; const db = H.db; const { HttpError } = S;
  const DAY = 86400000;
  const cache = new Map();
  const isConnectedCall = (c) => NL.outcomes.isConnected(c.outcome); // "connected" is defined by the outcome master

  function R(path, perm, fn){
    S.route('GET', path, perm, (ctx) => {
      const key = path + JSON.stringify(ctx.query) + ctx.user.id + ':' + db.version() + ':' + new Date().getMinutes();
      if (cache.has(key)) return cache.get(key);
      const out = fn(ctx, range(ctx.query));
      if (cache.size > 60) cache.clear();
      cache.set(key, out); return out;
    });
  }
  function range(q){
    const to = q.to || new Date(Date.now() + DAY).toISOString();
    let from = q.from || new Date(2000, 0, 1).toISOString();
    if (from < '2001'){ const first = db.all('leads').reduce((m, l) => l.createdAt < m ? l.createdAt : m, to); from = NL.fmt.startOfDay(first).toISOString(); }
    return { from, to, days: Math.max(1, Math.round((new Date(to) - new Date(from)) / DAY)) };
  }
  const inR = (t, r) => !!t && t >= r.from && t < r.to;
  const stages = () => H.settings().leadStages;
  function reachedIdx(l){ const st = stages(); let m = 0; (l.stageHistory || []).forEach(h => { const i = st.indexOf(h.stage); if (i > m) m = i; }); return m; }
  function eventAt(l, stage){ const h = (l.stageHistory || []).find(x => x.stage === stage); return h ? h.at : null; }
  const isPaid = (p) => p.status === 'Successful' || p.status === 'Partially Paid';

  function scoped(ctx){
    const leads = db.all('leads').filter(l => H.leadVisible(ctx, l));
    const apps = db.all('applications').filter(a => H.appVisible(ctx, a));
    const vis = H.visibleStudentIds(ctx);
    const pays = db.all('payments').filter(p => !vis || vis.has(p.studentId));
    const calls = db.all('calls').filter(c => H.ownerVisible(ctx, c.counsellorId));
    const fus = db.all('followups').filter(f => H.ownerVisible(ctx, f.counsellorId));
    const docs = db.all('documents').filter(d => !vis || vis.has(d.studentId));
    return { leads, apps, pays, calls, fus, docs };
  }
  function buckets(r){
    const unit = r.days <= 45 ? 'day' : r.days <= 210 ? 'week' : 'month';
    const out = []; let t = NL.fmt.startOfDay(r.from);
    if (unit === 'week'){ const dow = (t.getDay() + 6) % 7; t = new Date(t.getTime() - dow * DAY); }
    if (unit === 'month') t = new Date(t.getFullYear(), t.getMonth(), 1);
    const end = new Date(r.to);
    while (t < end && out.length < 400){
      const next = unit === 'day' ? new Date(t.getTime() + DAY) : unit === 'week' ? new Date(t.getTime() + 7 * DAY) : new Date(t.getFullYear(), t.getMonth() + 1, 1);
      const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      out.push({ from: t.toISOString(), to: next.toISOString(), label: unit === 'month' ? `${M[t.getMonth()]} ${String(t.getFullYear()).slice(2)}` : `${t.getDate()} ${M[t.getMonth()]}` });
      t = next;
    }
    return { unit, list: out };
  }
  function series(b, rows, dateFn, valFn){ return b.list.map(k => rows.reduce((s, x) => { const d = dateFn(x); return d && d >= k.from && d < k.to ? s + (valFn ? valFn(x) : 1) : s; }, 0)); }
  function workers(ctx, teamId){
    return db.all('users').filter(u => ['counsellor', 'telecaller', 'agent'].includes(u.role) && (!teamId || u.teamId === teamId) && H.ownerVisible(ctx, u.id));
  }

  function kpis(d, r){
    const cohort = d.leads.filter(l => inR(l.createdAt, r));
    const today = NL.fmt.range('today');
    const enrolled = d.leads.filter(l => inR(eventAt(l, 'Enrolled'), r)).length;
    const calls = d.calls.filter(c => inR(c.startAt, r));
    return {
      totalLeads: cohort.length, allTimeLeads: d.leads.length, newToday: d.leads.filter(l => inR(l.createdAt, today)).length,
      contacted: cohort.filter(l => reachedIdx(l) >= 1).length, qualified: cohort.filter(l => reachedIdx(l) >= 4).length,
      applications: d.apps.filter(a => inR(a.createdAt, r)).length, paidApplications: d.apps.filter(a => inR(a.createdAt, r) && a.paymentStatus === 'Paid').length,
      enrolled, admissions: d.leads.filter(l => inR(eventAt(l, 'Admission Confirmed'), r)).length,
      todaysAdmissions: d.leads.filter(l => inR(eventAt(l, 'Admission Confirmed'), today)).length,
      conversionRate: cohort.length ? enrolled / cohort.length * 100 : 0,
      pendingFollowups: d.fus.filter(f => f.status === 'Pending').length, overdueFollowups: d.fus.filter(f => f.status === 'Pending' && f.dueAt < new Date().toISOString()).length,
      calls: calls.length, connectedCalls: calls.filter(isConnectedCall).length, todaysCalls: d.calls.filter(c => inR(c.startAt, today)).length,
      revenue: d.pays.filter(p => isPaid(p) && inR(p.paymentDate, r)).reduce((s, p) => s + p.amount, 0)
    };
  }
  function funnel(d, r){
    const st = stages(); const cohort = d.leads.filter(l => inR(l.createdAt, r)); const total = cohort.length;
    const reached = cohort.map(reachedIdx);
    const rows = st.map((name, k) => {
      const count = reached.filter(x => x >= k).length;
      const prev = k === 0 ? total : reached.filter(x => x >= k - 1).length;
      const durs = [];
      if (k < st.length - 1) cohort.forEach(l => { const a = eventAt(l, name), b = eventAt(l, st[k + 1]); if (a && b && b >= a) durs.push(new Date(b) - new Date(a)); });
      return { stage: name, count, conversion: total ? count / total * 100 : 0, dropOff: prev ? (1 - count / prev) * 100 : 0, avgHours: durs.length ? durs.reduce((s, x) => s + x, 0) / durs.length / 3600000 : null };
    });
    const negative = H.settings().negativeStages.map(n => ({ stage: n, count: cohort.filter(l => l.stage === n).length }));
    return { total, rows, negative };
  }
  function groupRows(d, r, keyFn, labelFn){
    const cohort = d.leads.filter(l => inR(l.createdAt, r)); const m = new Map();
    const row = (k) => { if (!m.has(k)) m.set(k, { key: k, label: labelFn(k), leads: 0, contacted: 0, qualified: 0, applications: 0, paid: 0, admissions: 0, enrolled: 0, revenue: 0 }); return m.get(k); };
    cohort.forEach(l => { const x = row(keyFn(l, 'lead')); x.leads++; const i = reachedIdx(l); if (i >= 1) x.contacted++; if (i >= 4) x.qualified++; });
    d.leads.forEach(l => { if (inR(eventAt(l, 'Admission Confirmed'), r)) row(keyFn(l, 'lead')).admissions++; if (inR(eventAt(l, 'Enrolled'), r)) row(keyFn(l, 'lead')).enrolled++; });
    d.apps.filter(a => inR(a.createdAt, r)).forEach(a => { const x = row(keyFn(a, 'app')); x.applications++; if (a.paymentStatus === 'Paid') x.paid++; });
    const appMap = new Map(db.all('applications').map(a => [a.id, a]));
    d.pays.filter(p => isPaid(p) && inR(p.paymentDate, r)).forEach(p => { const a = appMap.get(p.applicationId); if (a) row(keyFn(a, 'app')).revenue += p.amount; });
    return Array.from(m.values()).map(x => Object.assign(x, { conversion: x.leads ? x.enrolled / x.leads * 100 : 0 })).sort((a, b) => b.leads - a.leads || b.applications - a.applications);
  }
  const uniName = (id) => (db.get('universities', id) || {}).name || 'Not specified';
  const courseName = (id) => (db.get('courses', id) || {}).name || 'Not specified';
  const groupers = {
    university: [(x) => x.universityId || '', uniName],
    course: [(x, t) => t === 'lead' ? (courseName(x.courseId) !== 'Not specified' ? courseName(x.courseId) : x.preferredCourse || 'Not specified') : courseName(x.courseId), (k) => k],
    programme: [(x, t) => NL.programs.programmeOf(t === 'lead' ? (courseName(x.courseId) !== 'Not specified' ? courseName(x.courseId) : x.preferredCourse || '') : (courseName(x.courseId) !== 'Not specified' ? courseName(x.courseId) : '')) || 'Not specified', (k) => k],
    source: [(x, t) => t === 'lead' ? x.source || 'Other' : ((db.get('leads', x.leadId) || {}).source || 'Other'), (k) => k],
    state: [(x, t) => t === 'lead' ? x.state || 'Not specified' : ((db.get('students', x.studentId) || {}).state || 'Not specified'), (k) => k],
    campaign: [(x, t) => t === 'lead' ? x.campaignId || '' : ((db.get('leads', x.leadId) || {}).campaignId || ''), (k) => (db.get('campaigns', k) || {}).name || 'No campaign'],
    team: [(x, t) => t === 'lead' ? x.teamId || '' : ((db.get('users', x.counsellorId) || {}).teamId || ''), (k) => (db.get('teams', k) || {}).name || 'Unassigned']
  };

  function counsellorRows(ctx, d, r, teamId){
    const perf = H.settings().performance;
    const rows = workers(ctx, teamId).map(u => {
      const mine = d.leads.filter(l => l.counsellorId === u.id);
      const assigned = mine.filter(l => inR(l.assignedAt || l.createdAt, r));
      const calls = d.calls.filter(c => c.counsellorId === u.id && inR(c.startAt, r));
      const connected = calls.filter(isConnectedCall);
      const apps = d.apps.filter(a => a.counsellorId === u.id && inR(a.createdAt, r));
      const appIds = new Set(d.apps.filter(a => a.counsellorId === u.id).map(a => a.id));
      const admissions = mine.filter(l => inR(eventAt(l, 'Admission Confirmed'), r)).length;
      const target = u.targets && u.targets.monthlyAdmissions ? Math.max(1, Math.round(u.targets.monthlyAdmissions * r.days / 30.4)) : 0;
      return { id: u.id, name: u.fullName, role: u.role, teamId: u.teamId, teamName: (db.get('teams', u.teamId) || {}).name || '', presence: u.presence,
        assigned: assigned.length, activeLeads: mine.filter(l => l.status === 'Active' && !H.settings().negativeStages.includes(l.stage) && l.stage !== 'Enrolled').length,
        contacted: assigned.filter(l => reachedIdx(l) >= 1).length, uncontacted: mine.filter(l => l.stage === 'New' && l.status === 'Active').length,
        calls: calls.length, connected: connected.length, talkTime: calls.reduce((s, c) => s + (c.duration || 0), 0),
        followupsDone: d.fus.filter(f => f.counsellorId === u.id && f.status === 'Completed' && inR(f.completedAt, r)).length,
        followupsPending: d.fus.filter(f => f.counsellorId === u.id && f.status === 'Pending').length,
        overdue: d.fus.filter(f => f.counsellorId === u.id && f.status === 'Pending' && f.dueAt < new Date().toISOString()).length,
        applications: apps.length, paidApplications: apps.filter(a => a.paymentStatus === 'Paid').length, admissions,
        enrolled: mine.filter(l => inR(eventAt(l, 'Enrolled'), r)).length,
        revenue: d.pays.filter(p => appIds.has(p.applicationId) && isPaid(p) && inR(p.paymentDate, r)).reduce((s, p) => s + p.amount, 0),
        conversion: assigned.length ? admissions / assigned.length * 100 : 0, target, achievement: admissions, achievementPct: target ? admissions / target * 100 : 0 };
    });
    const by = perf.rankBy;
    if (by && by !== 'none'){ rows.sort((a, b) => b[by] - a[by]); rows.forEach((x, i) => (x.rank = i + 1)); }
    else rows.sort((a, b) => a.name.localeCompare(b.name));
    return { rows, rankBy: by || 'none' };
  }

  /* ---------- endpoints ---------- */
  R('/reports/dashboard', 'dashboard.view', (ctx, r) => {
    const d = scoped(ctx); const b = buckets(r);
    const prev = { from: new Date(new Date(r.from).getTime() - (new Date(r.to) - new Date(r.from))).toISOString(), to: r.from, days: r.days };
    const k = kpis(d, r), kp = kpis(d, prev);
    const payApps = new Map(db.all('applications').map(a => [a.id, a]));
    const teams = db.all('teams').filter(t => t.status === 'Active' && (ctx.scope === 'all' || t.id === ctx.user.teamId)).map(t => {
      const g = groupRows(d, r, groupers.team[0], groupers.team[1]).find(x => x.key === t.id) || { leads: 0, applications: 0, admissions: 0, enrolled: 0, revenue: 0, conversion: 0 };
      return Object.assign({ id: t.id, name: t.name, members: db.all('users').filter(u => u.teamId === t.id && u.status === 'Active').length }, g);
    });
    const floor = workers(ctx).concat(db.all('users').filter(u => u.role === 'team_leader' && H.ownerVisible(ctx, u.id)));
    const openSess = (u) => { const s = u.sessions || []; const last = s[s.length - 1]; return !!(last && !last.logout && u.presence !== 'Offline'); };
    return {
      range: r, kpis: k, previous: kp, funnel: funnel(d, r),
      trend: { unit: b.unit, labels: b.list.map(x => x.label),
        leads: series(b, d.leads, l => l.createdAt), applications: series(b, d.apps, a => a.createdAt), enrolled: series(b, d.leads, l => eventAt(l, 'Enrolled')),
        revenue: series(b, d.pays.filter(isPaid), p => p.paymentDate, p => p.amount) },
      bySource: groupRows(d, r, groupers.source[0], groupers.source[1]).slice(0, 12),
      byState: groupRows(d, r, groupers.state[0], groupers.state[1]).filter(x => x.leads).slice(0, 12),
      byUniversity: groupRows(d, r, groupers.university[0], groupers.university[1]),
      byCourse: groupRows(d, r, groupers.programme[0], groupers.programme[1]), // every programme; the card shows the top ones plus an "other" row
      campaigns: db.all('campaigns').map(c => Object.assign({ id: c.id, name: c.name, source: c.source, budget: c.budget }, H.campaignMetrics(c.id, c.budget, r.from, r.to))).filter(c => c.leads).sort((a, b) => b.leads - a.leads).slice(0, 6),
      teams,
      pending: {
        unassigned: d.leads.filter(l => !l.counsellorId && l.status === 'Active').length,
        uncontacted: d.leads.filter(l => l.stage === 'New' && l.status === 'Active').length,
        overdueFollowups: k.overdueFollowups,
        documentsToReview: d.docs.filter(x => ['Uploaded', 'Under Review'].includes(x.status)).length,
        documentsRejected: d.docs.filter(x => x.status === 'Rejected').length,
        paymentsToVerify: d.pays.filter(p => ['Pending', 'Initiated'].includes(p.status) || (p.status === 'Successful' && !p.verifiedBy)).length,
        universityReview: d.apps.filter(a => a.stage === 'University Review').length
      },
      floor: { total: floor.length, loggedIn: floor.filter(openSess).length, available: floor.filter(u => openSess(u) && u.presence === 'Available').length,
        onCall: floor.filter(u => openSess(u) && u.presence === 'On Call').length, onBreak: floor.filter(u => openSess(u) && u.presence === 'On Break').length,
        offline: floor.filter(u => !openSess(u)).length,
        people: floor.map(u => ({ id: u.id, name: u.fullName, role: u.role, presence: openSess(u) ? u.presence : 'Offline', since: u.presenceSince, loginAt: openSess(u) ? (u.sessions[u.sessions.length - 1] || {}).login : null })) },
      revenueByMode: (() => { const m = {}; d.pays.filter(p => isPaid(p) && inR(p.paymentDate, r)).forEach(p => (m[p.mode] = (m[p.mode] || 0) + p.amount)); return Object.entries(m).sort((a, b) => b[1] - a[1]); })(),
      _apps: payApps.size
    };
  });
  R('/reports/admissions', 'reports.view', (ctx, r) => {
    const g = groupers[ctx.query.groupBy || 'university']; if (!g) throw new HttpError(422, 'Unknown grouping');
    const d = scoped(ctx);
    return { range: r, kpis: kpis(d, r), funnel: funnel(d, r), rows: groupRows(d, r, g[0], g[1]) };
  });
  R('/reports/counsellors', 'reports.view', (ctx, r) => {
    const d = scoped(ctx); const out = counsellorRows(ctx, d, r, ctx.query.teamId || null);
    return Object.assign(out, { range: r });
  });
  /* Completed follow-ups per outcome code in the date range (by completion time), within the user's data scope. */
  R('/reports/followup-outcomes', 'reports.view', (ctx, r) => {
    const catalogue = H.settings().followupOutcomes || [];
    const leads = new Map(db.all('leads').map(l => [l.id, l]));
    const done = db.all('followups').filter(f => f.status === 'Completed' && inR(f.completedAt, r) && (!ctx.query.counsellorId || f.counsellorId === ctx.query.counsellorId)
      && (H.ownerVisible(ctx, f.counsellorId) || H.leadVisible(ctx, leads.get(f.leadId))));
    const counts = {}, subCounts = {};
    done.forEach(f => { const k = f.completionOutcome || '_none'; counts[k] = (counts[k] || 0) + 1; if (f.completionSubOutcome){ const sk = k + '/' + f.completionSubOutcome; subCounts[sk] = (subCounts[sk] || 0) + 1; } });
    const rows = catalogue.map(o => {
      const row = { value: o.value, label: o.label, count: counts[o.value] || 0 };
      if (o.subOutcomes && o.subOutcomes.length){
        row.subOutcomes = o.subOutcomes.map(x => ({ value: x.value, label: x.label, count: subCounts[o.value + '/' + x.value] || 0 })).sort((a, b) => b.count - a.count);
        const tagged = row.subOutcomes.reduce((n, x) => n + x.count, 0);
        if (row.count > tagged) row.subOutcomes.push({ value: '_none', label: 'No sub outcome (older follow-ups)', count: row.count - tagged });
      }
      return row;
    });
    rows.sort((a, b) => b.count - a.count || catalogue.findIndex(o => o.value === a.value) - catalogue.findIndex(o => o.value === b.value));
    // Deactivated outcomes still used by saved follow-ups, then completions from before outcome codes existed.
    NL.outcomes.INACTIVE_OUTCOMES.forEach(o => { if (counts[o.value]) rows.push({ value: o.value, label: o.label + ' (inactive)', count: counts[o.value], inactive: true }); });
    if (counts._none) rows.push({ value: '_none', label: 'No outcome recorded (older follow-ups)', count: counts._none, unrecorded: true });
    const total = done.length;
    rows.forEach(x => (x.share = total ? x.count / total * 100 : 0));
    return { range: r, rows, total };
  });
  R('/reports/campaigns', 'reports.view', (ctx, r) => {
    const rows = db.all('campaigns').filter(c => !ctx.query.status || c.status === ctx.query.status).map(c => Object.assign({ id: c.id, name: c.name, source: c.source, status: c.status, universityName: uniName(c.universityId), startDate: c.startDate, endDate: c.endDate, cost: c.budget }, H.campaignMetrics(c.id, c.budget, r.from, r.to)));
    const d = scoped(ctx);
    return { range: r, rows, bySource: groupRows(d, r, groupers.source[0], groupers.source[1]) };
  });
  R('/reports/revenue', 'reports.revenue', (ctx, r) => {
    const d = scoped(ctx); const pays = d.pays.filter(p => inR(p.paymentDate, r)); const b = buckets(r);
    const sumBy = (fn, list) => { const m = {}; (list || pays.filter(isPaid)).forEach(p => { const k = fn(p); m[k] = (m[k] || 0) + p.amount; }); return Object.entries(m).sort((a, b2) => b2[1] - a[1]); };
    const tot = (st) => pays.filter(p => st.includes(p.status)).reduce((s, p) => s + p.amount, 0);
    return { range: r, totals: { collected: tot(['Successful', 'Partially Paid']), pending: tot(['Pending', 'Initiated']), failed: tot(['Failed']), refunded: tot(['Refunded']), count: pays.length, unverified: pays.filter(p => isPaid(p) && !p.verifiedBy).length },
      byUniversity: sumBy(p => uniName(p.universityId)), byCourse: sumBy(p => courseName(p.courseId)).slice(0, 12), byMode: sumBy(p => p.mode), byType: sumBy(p => p.type),
      trend: { labels: b.list.map(x => x.label), collected: series(b, pays.filter(isPaid), p => p.paymentDate, p => p.amount) } };
  });
  R('/reports/applications', 'reports.view', (ctx, r) => {
    const d = scoped(ctx); const apps = d.apps.filter(a => inR(a.createdAt, r)); const st = H.settings().applicationStages;
    const cnt = (fn) => { const m = {}; apps.forEach(a => { const k = fn(a); m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
    const conf = apps.map(a => { const h = (a.stageHistory || []).find(x => x.stage === 'Admission Confirmed'); return h ? (new Date(h.at) - new Date(a.createdAt)) / DAY : null; }).filter(x => x != null);
    return { range: r, total: apps.length, byStage: st.map(s => [s, apps.filter(a => a.stage === s).length]), byUniversity: groupRows(d, r, groupers.university[0], groupers.university[1]),
      documents: cnt(a => a.documentsStatus), payment: cnt(a => a.paymentStatus), admission: cnt(a => a.admissionStatus), avgDaysToConfirm: conf.length ? conf.reduce((s, x) => s + x, 0) / conf.length : null };
  });
  R('/reports/mis', 'reports.view', (ctx, r) => {
    const d = scoped(ctx); const rows = [];
    let t = NL.fmt.startOfDay(r.from); const end = new Date(r.to); let guard = 0;
    while (t < end && guard++ < 370){
      const day = { from: t.toISOString(), to: new Date(t.getTime() + DAY).toISOString() };
      const calls = d.calls.filter(c => inR(c.startAt, day));
      rows.push({ date: NL.fmt.ymd(t), newLeads: d.leads.filter(l => inR(l.createdAt, day)).length, calls: calls.length, connected: calls.filter(isConnectedCall).length,
        followupsDone: d.fus.filter(f => f.status === 'Completed' && inR(f.completedAt, day)).length, applications: d.apps.filter(a => inR(a.createdAt, day)).length,
        payments: d.pays.filter(p => isPaid(p) && inR(p.paymentDate, day)).length, admissions: d.leads.filter(l => inR(eventAt(l, 'Admission Confirmed'), day)).length,
        enrolled: d.leads.filter(l => inR(eventAt(l, 'Enrolled'), day)).length, revenue: d.pays.filter(p => isPaid(p) && inR(p.paymentDate, day)).reduce((s, p) => s + p.amount, 0) });
      t = new Date(t.getTime() + DAY);
    }
    return { range: r, rows: rows.reverse() };
  });
  R('/reports/team', 'reports.view', (ctx, r) => {
    let teamId = ctx.query.teamId || null;
    if (ctx.scope === 'team') teamId = ctx.user.teamId;
    if (ctx.scope === 'own') throw new HttpError(403, 'Team dashboards are available to Team Leaders and managers');
    const d = scoped(ctx); const members = counsellorRows(ctx, d, r, teamId).rows;
    const sum = (k) => members.reduce((s, m) => s + (m[k] || 0), 0);
    const teamIds = teamId ? [teamId] : db.all('teams').map(t => t.id);
    const tleads = d.leads.filter(l => teamIds.includes(l.teamId));
    const target = sum('target');
    return { range: r, team: teamId ? db.get('teams', teamId) : null, teamLeaderName: teamId ? H.userName((db.get('teams', teamId) || {}).teamLeaderId) : '',
      size: members.length, active: members.filter(m => m.presence && m.presence !== 'Offline').length,
      leadsAssigned: tleads.filter(l => l.status === 'Active' && l.counsellorId).length, uncontacted: tleads.filter(l => l.stage === 'New' && l.status === 'Active').length,
      unassigned: tleads.filter(l => !l.counsellorId && l.status === 'Active').length,
      overdue: sum('overdue'), applications: sum('applications'), admissions: sum('admissions'), assignedInRange: sum('assigned'),
      conversion: sum('assigned') ? sum('admissions') / sum('assigned') * 100 : 0, target, achievement: sum('admissions'), achievementPct: target ? sum('admissions') / target * 100 : 0,
      members, teams: db.all('teams').filter(t => ctx.scope === 'all' || t.id === ctx.user.teamId).map(t => ({ id: t.id, name: t.name })) };
  });
  R('/reports/workspace', 'dashboard.view', (ctx) => {
    const u = ctx.user; const x = S.h.decorators.L(); const D = S.h.decorators;
    const mine = db.all('leads').filter(l => l.counsellorId === u.id && l.status === 'Active');
    const neg = H.settings().negativeStages; const active = mine.filter(l => !neg.includes(l.stage) && l.stage !== 'Enrolled');
    const fus = db.all('followups').filter(f => f.counsellorId === u.id && f.status === 'Pending').map(f => D.decFu(f, x)).sort((a, b) => a.dueAt < b.dueAt ? -1 : 1);
    const apps = db.all('applications').filter(a => a.counsellorId === u.id);
    const openApps = apps.filter(a => !['Enrollment Completed', 'Rejected', 'Cancelled'].includes(a.stage));
    const studentIds = new Set(db.all('students').filter(s => s.counsellorId === u.id).map(s => s.id));
    const today = NL.fmt.range('today'), month = NL.fmt.range('thisMonth');
    const callsToday = db.all('calls').filter(c => c.counsellorId === u.id && inR(c.startAt, today));
    const monthAdmissions = mine.concat(db.all('leads').filter(l => l.counsellorId === u.id && l.status !== 'Active')).filter(l => inR(eventAt(l, 'Admission Confirmed'), month)).length;
    const t = u.targets || {};
    const lite = (l) => D.decLead(l, x);
    return {
      myLeads: active.length, todaysFollowups: fus.filter(f => f.bucket === 'today'), overdueFollowups: fus.filter(f => f.bucket === 'overdue'), upcoming: fus.filter(f => f.bucket === 'upcoming').slice(0, 8),
      newLeads: active.filter(l => l.stage === 'New').map(lite).slice(0, 10), newLeadsCount: active.filter(l => l.stage === 'New').length,
      hotLeads: active.filter(l => l.score >= 61).sort((a, b) => b.score - a.score).map(lite).slice(0, 10), hotLeadsCount: active.filter(l => l.score >= 61).length,
      applications: openApps.map(a => D.decApp(a, x)).slice(0, 10), applicationsCount: openApps.length,
      pendingDocuments: db.all('documents').filter(dd => studentIds.has(dd.studentId) && ['Pending', 'Rejected'].includes(dd.status)).length,
      paymentPending: openApps.filter(a => ['Pending', 'Partially Paid'].includes(a.paymentStatus)).length,
      today: { target: t.dailyCalls || 0, calls: callsToday.length, connected: callsToday.filter(isConnectedCall).length, talkTime: callsToday.reduce((s, c) => s + c.duration, 0) },
      month: { target: t.monthlyAdmissions || 0, admissions: monthAdmissions, applicationsTarget: t.monthlyApplications || 0, applications: apps.filter(a => inR(a.createdAt, month)).length }
    };
  });
})();
