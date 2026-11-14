/* Applications — list and detail with stage progress, documents, payments. */
(function(){
  const { html, toHtml, $, $$ } = NL.util;
  const S = NL.services, st = NL.store, ui = NL.ui, A = NL.actions, w = NL.w, F = NL.fmt, C = NL.cols;

  function appMenu(a){
    return [{ label: 'Open application', icon: '👁️', onClick: () => (location.hash = '#/applications/' + a.id) },
      (st.can('applications.edit') || st.can('applications.stage')) && { label: 'Change status', icon: '➡️', onClick: () => A.changeAppStage(a) },
      st.can('payments.create') && { label: 'Record payment', icon: '💰', onClick: () => A.addPayment({ application: a }) },
      st.can('documents.upload') && { label: 'Upload document', icon: '⤒', onClick: () => A.uploadDocument({ studentId: a.studentId, studentName: a.studentName, applicationId: a.id }) },
      { label: 'Open student', icon: '👨‍🎓', onClick: () => (location.hash = '#/students/' + a.studentId) }].filter(Boolean);
  }

  function list(el, params, query){
    const s = st.settings(); const o = st.options;
    const page = NL.listPage({ el, id: 'applications', module: 'applications', title: 'Applications', sub: 'Every application across universities, campuses and courses', exportName: 'applications', what: 'applications',
      refreshOn: ['applications', 'documents', 'payments'], initial: query, passThrough: ['paymentStatus'],
      actions: [{ label: 'Create Application', icon: '＋', primary: true, action: 'add', perm: 'applications.create', onClick: async () => { const a = await A.createApplication(); if (a) location.hash = '#/applications/' + a.id; } }],
      segments: [{ key: 'open', label: 'Open', query: { stageGroup: 'open' } }, { key: 'all', label: 'All', query: {} }, { key: 'payment', label: 'Payment pending', query: { stage: 'Payment Pending' } },
        { key: 'docs', label: 'Docs under verification', query: { stage: 'Documents Under Verification' } }, { key: 'confirmed', label: 'Admission confirmed', query: { stage: 'Admission Confirmed' } }, { key: 'enrolled', label: 'Enrolled', query: { stage: 'Enrollment Completed' } }],
      pickSegment: (q) => q.stage || q.paymentStatus || q.studentId ? 'all' : 'open',
      searchPlaceholder: 'Search application ID/number, student, mobile…',
      filters: [{ type: 'daterange', label: 'Created', field: 'createdAt' }, { key: 'stage', label: 'Stage', options: s.applicationStages },
        { key: 'universityId', label: 'University', options: () => o.universities(true) }, { key: 'campusId', label: 'Campus', dependsOn: 'universityId', options: (v) => o.campuses(v.universityId, true) },
        { key: 'courseId', label: 'Course', dependsOn: 'universityId', options: (v) => o.courses(v.universityId, v.campusId, true) },
        st.scope() !== 'own' ? { key: 'counsellorId', label: 'Counsellor', options: () => o.assignable() } : null,
        { key: 'documentsStatus', label: 'Documents', options: ['Pending', 'Submitted', 'Verified', 'Rejected'] }, { key: 'paymentStatus', label: 'Payment', options: ['Not Due', 'Pending', 'Partially Paid', 'Paid'] },
        { key: 'verificationStatus', label: 'Verification', options: ['Pending', 'Under Review', 'Verified', 'Rejected'] }].filter(Boolean),
      columns: [C.mono('id', 'Application ID', { render: (a) => html`<a class="rowlink mono" href="#/applications/${a.id}">${a.id}</a>` }), C.mono('applicationNo', 'Application Number'),
        C.link('studentName', 'Student', (a) => '#/students/' + a.studentId, { always: true }), C.mono('studentId', 'Student ID', { hidden: true }), C.mono('leadId', 'Lead ID', { hidden: true }),
        C.text('universityName', 'University'), C.text('campusName', 'Campus', { hidden: true }), C.text('courseName', 'Course'), C.date('applicationDate', 'Application Date'),
        C.badge('stage', 'Application Stage'), C.text('counsellorName', 'Counsellor'), C.badge('documentsStatus', 'Documents'), C.badge('paymentStatus', 'Payment'),
        C.badge('verificationStatus', 'Verification', { hidden: true }), C.badge('admissionStatus', 'Admission')],
      fetch: (q) => S.applicationService.list(q), onRowClick: (a) => (location.hash = '#/applications/' + a.id), rowActions: appMenu,
      bulk: [{ label: 'Export', icon: '⤓', handler: async (ids, t, rows) => NL.file.exportData('csv', rows || await t.selectedRows(), [['id', 'Application ID'], ['applicationNo', 'Number'], ['studentName', 'Student'], ['universityName', 'University'], ['courseName', 'Course'], ['stage', 'Stage'], ['paymentStatus', 'Payment'], ['documentsStatus', 'Documents']].map(([k, l]) => ({ label: l, value: (r) => r[k] })), 'applications_selected') }],
      empty: () => ({ icon: '📝', title: 'No applications found', text: 'Try changing your filters or create a new application.', actions: [{ label: 'Clear Filters', action: 'clearFilters' }].concat(st.can('applications.create') ? [{ label: 'Create Application', action: 'newApp' }] : []) }),
      emptyHandlers: { newApp: () => A.createApplication() }
    });
    return page.cleanup;
  }

  function detail(el, params){
    let data = null;
    const load = () => ui.load(el, () => S.applicationService.get(params.id), (d) => { data = d; draw(); }, { cards: 6, what: 'this application' });
    function draw(){
      const a = data.application, s = data.student, c = data.course || {}; const stages = st.settings().applicationStages;
      const flow = stages.filter(x => !['Rejected', 'Cancelled'].includes(x)); const closed = ['Rejected', 'Cancelled'].includes(a.stage);
      const paid = data.payments.filter(p => ['Successful', 'Partially Paid'].includes(p.status)).reduce((x, p) => x + p.amount, 0);
      const req = st.settings().requiredDocuments.filter(t => t !== 'Graduation Certificate' || c.degreeType === 'PG');
      const docsByType = {}; data.documents.forEach(d => (docsByType[d.type] = d));
      el.innerHTML = toHtml(html`
        <div class="detail-head"><div class="dh-main"><div class="app-ico">📝</div><div><h1>${a.id} <span class="muted small">${a.applicationNo}</span></h1>
          <div class="dh-meta">${ui.badge(a.stage)}${ui.badge(a.admissionStatus)}<span>Docs ${ui.badge(a.documentsStatus)}</span><span>Payment ${ui.badge(a.paymentStatus)}</span></div>
          <div class="dh-sub"><span>👨‍🎓 <a href="#/students/${s.id}"><b>${s.fullName}</b></a> (${s.id})</span><span>🏫 ${a.universityName} · ${a.campusName}</span><span>📚 ${a.courseName}</span><span>👤 ${a.counsellorName}</span></div></div></div>
          <div class="dh-actions">${st.can('applications.edit') || st.can('applications.stage') ? html`<button class="btn-primary" data-action="stage">➡️ Change status</button>` : ''}
            ${st.can('payments.create') ? html`<button class="btn-ghost" data-action="pay">💰 Record payment</button>` : ''}${st.can('documents.upload') ? html`<button class="btn-ghost" data-action="upload">⤒ Upload document</button>` : ''}
            ${a.leadId ? html`<a class="btn-ghost btn-link" href="#/leads/${a.leadId}">🎯 Lead</a>` : ''}</div></div>
        ${closed ? html`<div class="notice bad">This application is <b>${a.stage}</b>.</div>` : w.stepper(flow, a.stage)}
        <div class="grid-3">
          ${w.card('Application', w.detailGrid([['Application ID', html`<span class="mono">${a.id}</span>`], ['Application number', a.applicationNo], ['Application date', F.date(a.applicationDate)], ['Student ID', s.id], ['Lead ID', a.leadId], ['Counsellor', a.counsellorName], ['Verification', ui.badge(a.verificationStatus)], ['Admission status', ui.badge(a.admissionStatus)]]))}
          ${w.card('Programme & fees', w.detailGrid([['University', a.universityName], ['Campus', a.campusName], ['Course', `${c.name || ''} (${c.code || ''})`], ['Degree / mode', `${c.degreeType || ''} · ${c.mode || ''}`], ['Duration', c.duration], ['Total fees', F.money(c.totalFees)], ['Application fee', F.money(c.applicationFee)], ['Semester fee', F.money(c.semesterFee)], ['Scholarship', c.scholarship]]))}
          ${w.card('Payment summary', html`${NL.charts.meter(paid, (c.applicationFee || 0) + (c.semesterFee || 0), 'Received vs first-semester due')}${w.detailGrid([['Received', F.money(paid)], ['Total course fee', F.money(c.totalFees)], ['Balance (course)', F.money(Math.max(0, (c.totalFees || 0) - paid))]])}`)}
        </div>
        ${w.card(html`Document checklist <span class="muted small">(${req.filter(t => docsByType[t] && docsByType[t].status === 'Verified').length}/${req.length} required verified)</span>`, NL.detailTabs.documents(data.documents, st.can('documents.upload')))}
        ${w.card('Payments', NL.detailTabs.payments(data.payments))}
        <div class="grid-2">${w.card('Status history', html`<ol class="timeline">${(a.stageHistory || []).slice().reverse().map(h => html`<li class="tl-item"><span class="tl-ico">➡️</span><div class="tl-body"><div class="tl-title">${h.stage}</div>${h.remarks ? html`<div class="tl-text">${h.remarks}</div>` : ''}<div class="tl-meta">${F.dateTime(h.at)} · ${st.userName(h.by) || 'System'}</div></div></li>`)}</ol>`)}
          ${w.card('Audit', NL.detailTabs.audit(data.audit))}</div>`);
    }
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('.detail-head [data-action]'); if (!b) return; const a = data.application; let ok = false;
      if (b.dataset.action === 'stage') ok = await A.changeAppStage(a);
      if (b.dataset.action === 'pay') ok = await A.addPayment({ application: a });
      if (b.dataset.action === 'upload') ok = await A.uploadDocument({ studentId: a.studentId, studentName: a.studentName, applicationId: a.id });
      if (ok) load();
    });
    NL.wireTabActions(el, () => data, load, { student: () => data.student, newApp: () => false });
    load();
  }

  NL.pages.applications = { title: 'Applications', perm: 'applications.view', crumbs: ['Admissions', 'Applications'], render: list };
  NL.pages.applicationDetail = { title: 'Application', perm: 'applications.view', crumbs: (p) => [['Applications', '#/applications'], p.id], render: detail };
})();
