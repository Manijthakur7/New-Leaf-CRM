/* Lead detail — header, stage stepper, admission timeline, tabbed record. */
(function(){
  const { html, raw, toHtml, $, $$ } = NL.util;
  const S = NL.services, st = NL.store, ui = NL.ui, A = NL.actions, w = NL.w, F = NL.fmt;

  /* Shared tab renderers (also used by student profile) */
  const T = {
    calls(list){
      if (!list.length) return ui.empty({ icon: '📞', title: 'No calls logged yet', text: 'Use “Call” to dial and log the outcome.' });
      return html`<div class="table-wrap flat"><table class="table compact"><thead><tr><th>Call ID</th><th>Date</th><th>Type</th><th>Outcome</th><th class="r">Duration</th><th>Counsellor</th><th>Notes</th></tr></thead>
        <tbody>${list.map(c => html`<tr><td class="mono">${c.id}</td><td class="nowrap">${F.dateTime(c.startAt)}</td><td>${ui.badge(c.type)}</td><td>${ui.badge(NL.outcomes.label(c.outcome) || '—', NL.outcomes.isConnected(c.outcome) ? 'blue' : 'gray')}${c.subOutcome ? html`<div class="muted tiny">${NL.outcomes.label(c.outcome, c.subOutcome)}</div>` : ''}</td><td class="r num">${F.duration(c.duration)}</td><td>${c.counsellorName}</td><td class="remarks">${c.notes || '—'}</td></tr>`)}</tbody></table></div>`;
    },
    notes(list){
      if (!list.length) return ui.empty({ icon: '🗒️', title: 'No counselling notes yet' });
      return html`<div class="notes">${list.map(n => html`<div class="note"><div class="note-head">${ui.avatar(n.authorName, 'sm')}<b>${n.authorName}</b>${ui.badge(n.type, 'blue')}<span class="muted tiny">${F.dateTime(n.createdAt)}</span></div><div class="note-text">${n.text}</div></div>`)}</div>`;
    },
    followups(list){
      if (!list.length) return ui.empty({ icon: '📅', title: 'No follow-ups scheduled' });
      return html`<div class="table-wrap flat"><table class="table compact"><thead><tr><th>Due</th><th>Reason</th><th>Notes</th><th>Counsellor</th><th>Status</th><th></th></tr></thead>
        <tbody>${list.map(f => html`<tr><td class="nowrap ${f.bucket === 'overdue' ? 'fu-overdue' : f.bucket === 'today' ? 'fu-today' : ''}">${F.dateTime(f.dueAt)}</td><td>${f.reason}</td><td class="remarks">${f.notes || f.outcome || '—'}</td><td>${f.counsellorName}</td>
          <td>${ui.badge(f.status === 'Pending' ? ({ overdue: 'Overdue', today: 'Due Today', upcoming: 'Upcoming' })[f.bucket] : f.status)}</td>
          <td class="actions">${f.status === 'Pending' && st.can('followups.manage') ? html`<button class="btn-ghost btn-sm" data-fu="${f.id}" data-act="done">Complete</button><button class="btn-ghost btn-sm" data-fu="${f.id}" data-act="resched">Reschedule</button><button class="btn-ghost btn-sm" data-fu="${f.id}" data-act="snooze">Snooze</button><button class="btn-danger btn-sm" data-fu="${f.id}" data-act="cancel">Cancel</button>` : f.status === 'Completed' ? (f.feedback ? html`<button class="btn-ghost btn-sm" data-fu="${f.id}" data-act="viewfb">✓ View feedback</button>` : st.can('calls.create') ? html`<button class="btn-primary btn-sm" data-fu="${f.id}" data-act="feedback">📝 Call feedback</button>` : '') : ''}</td></tr>`)}</tbody></table></div>`;
    },
    applications(list){
      if (!list.length) return ui.empty({ icon: '📝', title: 'No applications yet', text: 'A student can apply to several universities and courses.', actions: st.can('applications.create') ? [{ label: 'Create Application', action: 'newApp' }] : [] });
      return html`<div class="table-wrap flat"><table class="table compact"><thead><tr><th>Application</th><th>University / Course</th><th>Date</th><th>Stage</th><th>Documents</th><th>Payment</th><th>Admission</th></tr></thead>
        <tbody>${list.map(a => html`<tr class="clickable" data-link="#/applications/${a.id}"><td class="mono"><a class="rowlink" href="#/applications/${a.id}">${a.id}</a><div class="muted tiny">${a.applicationNo}</div></td><td>${a.courseName}<div class="muted tiny">${a.universityName} · ${a.campusName}</div></td><td class="nowrap">${F.date(a.applicationDate)}</td><td>${ui.badge(a.stage)}</td><td>${ui.badge(a.documentsStatus)}</td><td>${ui.badge(a.paymentStatus)}</td><td>${ui.badge(a.admissionStatus)}</td></tr>`)}</tbody></table></div>`;
    },
    documents(list, canUpload){
      if (!list.length) return ui.empty({ icon: '📄', title: 'No documents yet', text: 'The document checklist is created with the first application.', actions: canUpload ? [{ label: 'Upload Document', action: 'upload' }] : [] });
      return html`<div class="doc-grid">${list.map(d => html`<div class="doc-card st-${d.status.replace(/\s/g, '').toLowerCase()}"><div class="doc-top"><b>${d.type}</b>${ui.badge(d.status)}</div>
        <div class="muted tiny">${d.fileName ? html`${d.fileName} · ${F.bytes(d.fileSize || 0)}` : 'Not uploaded'}</div>
        ${d.uploadedAt ? html`<div class="tiny">Uploaded ${F.dateTime(d.uploadedAt)}${d.uploaderName ? ' by ' + d.uploaderName : ''}</div>` : ''}
        ${d.reviewedAt ? html`<div class="tiny">${d.status} ${F.dateTime(d.reviewedAt)} by ${d.reviewerName}</div>` : ''}
        ${d.status === 'Rejected' ? html`<div class="doc-reject">Reason: ${d.rejectionReason}</div>` : ''}
        <div class="doc-acts">${canUpload && ['Pending', 'Rejected'].includes(d.status) ? html`<button class="btn-ghost btn-sm" data-doc-up="${d.type}">⤒ ${d.status === 'Rejected' ? 'Re-upload' : 'Upload'}</button>` : ''}
          ${st.can('documents.verify') && ['Uploaded', 'Under Review'].includes(d.status) ? html`<button class="btn-ghost btn-sm" data-doc="${d.id}" data-st="Verified">✓ Verify</button><button class="btn-danger btn-sm" data-doc="${d.id}" data-st="Rejected">✕ Reject</button>` : ''}</div></div>`)}</div>`;
    },
    payments(list){
      if (!list.length) return ui.empty({ icon: '💰', title: 'No payments recorded', actions: st.can('payments.create') ? [{ label: 'Record Payment', action: 'pay' }] : [] });
      const paid = list.filter(p => ['Successful', 'Partially Paid'].includes(p.status)).reduce((s, p) => s + p.amount, 0);
      return html`<div class="muted small pad">Total received: <b>${F.money(paid)}</b></div><div class="table-wrap flat"><table class="table compact"><thead><tr><th>Payment</th><th>Date</th><th>Type</th><th>Mode</th><th>Transaction</th><th class="r">Amount</th><th>Status</th><th>Receipt</th><th>Verified by</th></tr></thead>
        <tbody>${list.map(p => html`<tr><td class="mono">${p.id}<div class="muted tiny">${p.applicationId}</div></td><td class="nowrap">${F.date(p.paymentDate)}</td><td>${p.type}</td><td>${p.mode}</td><td class="mono">${p.transactionId || '—'}</td><td class="r num">${F.money(p.amount)}</td><td>${ui.badge(p.status)}</td><td class="mono">${p.receiptNo || '—'}</td><td>${p.verifiedByName || html`<span class="muted">Not verified</span>`}</td></tr>`)}</tbody></table></div>`;
    },
    audit(list){
      if (!list.length) return ui.empty({ icon: '🧾', title: 'No audit entries for this record' });
      return html`<div class="table-wrap flat"><table class="table compact"><thead><tr><th>When</th><th>User</th><th>Action</th><th>Old value</th><th>New value</th></tr></thead>
        <tbody>${list.slice().sort((a, b) => a.at < b.at ? 1 : -1).map(a => html`<tr><td class="nowrap">${F.dateTime(a.at)}</td><td>${a.userName}<div class="muted tiny">${NL.rbac.roleName(a.role)}</div></td><td>${a.action}</td><td class="remarks mono tiny">${a.oldValue || '—'}</td><td class="remarks mono tiny">${a.newValue || '—'}</td></tr>`)}</tbody></table></div>`;
    }
  };
  NL.detailTabs = T;

  /* Wire follow-up / document / payment buttons inside tab content */
  function wireTabActions(root, getData, reload, ctx){
    root.addEventListener('click', async (e) => {
      const lk = e.target.closest('[data-link]'); if (lk && !e.target.closest('a,button')){ location.hash = lk.dataset.link; return; }
      const f = e.target.closest('[data-fu]');
      if (f){ const fu = getData().followups.find(x => x.id === f.dataset.fu); const a = f.dataset.act;
        if (a === 'viewfb'){ A.viewFeedback(fu); return; }
        const ok = a === 'done' ? await A.completeFollowup(fu) : a === 'feedback' ? await A.callFeedback(fu) : a === 'resched' ? await A.rescheduleFollowup(fu) : a === 'snooze' ? await A.snoozeFollowup(fu, 15) : await A.cancelFollowup(fu); if (ok) reload(); return; }
      const dv = e.target.closest('[data-doc]'); if (dv){ const d = getData().documents.find(x => x.id === dv.dataset.doc); if (await A.reviewDocument(d, dv.dataset.st)) reload(); return; }
      const du = e.target.closest('[data-doc-up]'); if (du){ const s = ctx.student(); if (await A.uploadDocument({ studentId: s.id, studentName: s.fullName, type: du.dataset.docUp })) reload(); return; }
      const ea = e.target.closest('.empty-state [data-action]');
      if (ea){ const act = ea.dataset.action;
        if (act === 'newApp' && await ctx.newApp()) reload();
        if (act === 'upload'){ const s = ctx.student(); if (s && await A.uploadDocument({ studentId: s.id, studentName: s.fullName })) reload(); }
        if (act === 'pay' && await A.addPayment({ studentId: ctx.student() && ctx.student().id })) reload(); }
    });
  }
  NL.wireTabActions = wireTabActions;

  function render(el, params, query){
    let data = null; let tab = query.tab || 'overview';
    const load = () => ui.load(el, () => S.leadService.get(params.id), (d) => { data = d; draw(); }, { cards: 6, what: 'this lead' });
    function draw(){
      const l = data.lead; const s = st.settings(); const neg = s.negativeStages.includes(l.stage);
      document.title = `${l.name} · Lead ${l.id}`;
      el.innerHTML = toHtml(html`
        <div class="detail-head">
          <div class="dh-main">${ui.avatar(l.name, 'lg')}<div>
            <h1>${l.name} ${l.status === 'Archived' ? ui.badge('Archived') : ''}</h1>
            <div class="dh-meta"><span class="mono">${l.id}</span>${ui.badge(l.stage)}${l.outcome ? html`<span class="badge b-blue" title="Latest outcome${l.outcomeAt ? ' · ' + F.dateTime(l.outcomeAt) : ''}">Outcome: ${NL.outcomes.label(l.outcome) || l.outcome}${l.subOutcome ? ' · ' + NL.outcomes.label(l.outcome, l.subOutcome) : ''}</span>` : ''}${ui.badge(l.priority)}${ui.scoreBadge(l.score, l.scoreBand)}${l.studentId ? html`<a class="badge b-green" href="#/students/${l.studentId}">🎓 Student ${l.studentId}</a>` : ''}${data.duplicates ? html`<button class="badge b-red" data-action="dups">⚠ ${data.duplicates} possible duplicate${data.duplicates > 1 ? 's' : ''}</button>` : ''}</div>
            <div class="dh-sub"><span>👤 Counsellor: <b>${l.counsellorName || 'Unassigned'}</b></span><span>👥 Team Leader: <b>${l.teamLeaderName || '—'}</b></span><span>📱 <span class="mono">${l.mobile}</span></span>${l.email ? html`<span>✉️ ${l.email}</span>` : ''}</div>
          </div></div>
          <div class="dh-actions">
            ${st.can('calls.create') ? html`<button class="btn-primary" data-action="call">📞 Call</button>` : ''}
            <button class="btn-ghost" data-action="wa">💬 WhatsApp</button>
            ${st.can('notes.create') ? html`<button class="btn-ghost" data-action="note">🗒️ Note</button>` : ''}
            ${st.can('followups.manage') ? html`<button class="btn-ghost" data-action="fu">📅 Follow-up</button>` : ''}
            ${st.can('applications.create') ? html`<button class="btn-ghost" data-action="app">📝 Application</button>` : ''}
            <button class="btn-ghost" data-action="more" aria-label="More actions">⋯ More</button>
          </div>
        </div>
        ${w.stepper(s.leadStages, neg ? (l.stageHistory.slice().reverse().map(h => h.stage).find(x => s.leadStages.includes(x)) || 'New') : l.stage, neg)}
        ${neg ? html`<div class="notice bad">This lead exited the pipeline as <b>${l.stage}</b>. Its history is preserved; change the stage to re-activate it.</div>` : ''}
        ${w.card('Admission timeline', w.milestones(data.milestones), { cls: 'ms-card' })}
        ${w.tabs([{ key: 'overview', label: 'Overview' }, { key: 'activity', label: 'Activity', count: data.timeline.length }, { key: 'calls', label: 'Calls', count: data.calls.length }, { key: 'whatsapp', label: 'WhatsApp' },
          { key: 'notes', label: 'Notes', count: data.notes.length }, { key: 'followups', label: 'Follow-ups', count: data.followups.filter(f => f.status === 'Pending').length }, { key: 'applications', label: 'Applications', count: data.applications.length },
          { key: 'documents', label: 'Documents', count: data.documents.length }, { key: 'payments', label: 'Payments', count: data.payments.length }, { key: 'audit', label: 'Audit' }], tab)}
        <div class="tab-panel card">${panel()}</div>`);
    }
    function panel(){
      const l = data.lead;
      switch (tab){
        case 'activity': return w.timeline(data.timeline);
        case 'calls': return T.calls(data.calls);
        case 'whatsapp': return html`<div class="wa-panel"><div class="wa-ico">💬</div><div><b>WhatsApp Business</b><p class="muted">Chat history appears here once a WhatsApp Business API provider (Gupshup, Interakt, Meta Cloud API) is connected to <code>whatsappService</code>. Until then, open a chat in WhatsApp directly — log important conversations as notes.</p>
          <div class="wa-actions"><button class="btn-primary" data-action="wa">Open chat with ${l.whatsapp || l.mobile}</button>${['Share brochure & fee structure', 'Share application link', 'Document reminder'].map(t => html`<button class="btn-ghost btn-sm" data-wa-tpl="${t}">${t}</button>`)}</div></div></div>`;
        case 'notes': return html`${st.can('notes.create') ? html`<div class="panel-actions"><button class="btn-primary btn-sm" data-action="note">+ Add note</button></div>` : ''}${T.notes(data.notes)}`;
        case 'followups': return html`${st.can('followups.manage') ? html`<div class="panel-actions"><button class="btn-primary btn-sm" data-action="fu">+ Schedule follow-up</button></div>` : ''}${T.followups(data.followups)}`;
        case 'applications': return html`${st.can('applications.create') && data.applications.length ? html`<div class="panel-actions"><button class="btn-primary btn-sm" data-action="app">+ Create application</button></div>` : ''}${T.applications(data.applications)}`;
        case 'documents': return data.student ? html`${st.can('documents.upload') ? html`<div class="panel-actions"><button class="btn-primary btn-sm" data-action="upload">⤒ Upload document</button></div>` : ''}${T.documents(data.documents, st.can('documents.upload'))}` : ui.empty({ icon: '📄', title: 'Convert this lead to a student to collect documents', actions: st.can('leads.convert') ? [{ label: 'Convert to Student', action: 'convert' }] : [] });
        case 'payments': return html`${st.can('payments.create') && data.applications.length ? html`<div class="panel-actions"><button class="btn-primary btn-sm" data-action="pay">+ Record payment</button></div>` : ''}${T.payments(data.payments)}`;
        case 'audit': return T.audit(data.audit);
        default: return html`<div class="grid-2">
          ${w.card('Personal details', w.detailGrid([['Student name', l.name], ['Mobile', html`<span class="mono">${l.mobile}</span>`], ['WhatsApp', l.whatsapp], ['Email', l.email], ['City', l.city], ['State', NL.w.stateBadge(l.state)]]))}
          ${w.card('Academic details', w.detailGrid([['Qualification', l.qualification], ['Passing year', l.passingYear], ['Preferred course', l.preferredCourse]]))}
          ${w.card('Programme interest', w.detailGrid([['University', l.universityName], ['Campus', l.campusName], ['Course', l.courseName]]))}
          ${w.card('Source & assignment', w.detailGrid([['Lead source', l.source], ['Campaign', l.campaignName], ['Assigned counsellor', l.counsellorName], ['Team', l.teamName], ['Assignment method', (l.assignmentMethod || '').replace('_', ' ')], ['Assigned on', l.assignedAt ? F.dateTime(l.assignedAt) : ''],
            ['Last contact', l.lastContactAt ? F.dateTime(l.lastContactAt) : ''], ['Next follow-up', l.nextFollowupAt ? F.dateTime(l.nextFollowupAt) : ''], ['Created', F.dateTime(l.createdAt)], ['Updated', F.dateTime(l.updatedAt)]]))}
          </div>
          ${l.remarks ? w.card('Remarks', html`<p>${l.remarks}</p>`) : ''}
          ${(l.assignmentHistory || []).length ? w.card('Assignment history', html`<div class="table-wrap flat"><table class="table compact"><thead><tr><th>Date</th><th>From</th><th>To</th><th>Method</th><th>By</th></tr></thead><tbody>${l.assignmentHistory.slice().reverse().map(a => html`<tr><td>${F.dateTime(a.at)}</td><td>${st.userName(a.from) || '—'}</td><td>${st.userName(a.to)}</td><td>${(a.method || '').replace('_', ' ')}</td><td>${st.userName(a.by) || 'System'}</td></tr>`)}</tbody></table></div>`) : ''}`;
      }
    }
    el.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-tab]'); if (t){ tab = t.dataset.tab; $$('.tab-btn', el).forEach(b => b.classList.toggle('active', b === t)); $('.tab-panel', el).innerHTML = toHtml(panel()); return; }
      const tpl = e.target.closest('[data-wa-tpl]'); if (tpl){ S.whatsappService.open(data.lead.whatsapp || data.lead.mobile, `Hi ${data.lead.name.split(' ')[0]}, ${tpl.dataset.waTpl.toLowerCase()} — ${st.user().fullName}, ${st.settings().general.companyName}`); return; }
      const a = e.target.closest('.detail-head [data-action], .panel-actions [data-action], .wa-actions [data-action], .empty-state [data-action=convert], [data-action=dups]'); if (!a) return;
      const l = data.lead; let ok = false;
      switch (a.dataset.action){
        case 'call': ok = await A.logCall(l); break;
        case 'wa': S.whatsappService.open(l.whatsapp || l.mobile, `Hi ${l.name.split(' ')[0]}, `); break;
        case 'note': ok = await A.addNote({ leadId: l.id }); break;
        case 'fu': ok = await A.scheduleFollowup(l); break;
        case 'app': ok = await A.createApplication({ lead: l }); break;
        case 'upload': ok = await A.uploadDocument({ studentId: l.studentId, studentName: l.name }); break;
        case 'pay': ok = await A.addPayment({ studentId: l.studentId }); break;
        case 'convert': ok = await A.convertLead(l); break;
        case 'dups': ok = await A.duplicateCheck(l); break;
        case 'more': NL.ui.menu(a, NL.leadMenu(l, load)); break;
      }
      if (ok) load();
    });
    wireTabActions(el, () => data, load, { student: () => data.student, newApp: () => A.createApplication({ lead: data.lead }) });
    load();
    return st.on('data-changed', (m) => { if (m === 'presence') return; });
  }

  NL.pages.leadDetail = { title: 'Lead', perm: 'leads.view', crumbs: (p) => [['Leads', '#/leads'], p.id], render };
})();
