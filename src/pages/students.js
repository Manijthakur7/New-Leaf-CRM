/* Students — list and full student profile. */
(function(){
  const { html, toHtml, $, $$ } = NL.util;
  const S = NL.services, st = NL.store, ui = NL.ui, A = NL.actions, w = NL.w, F = NL.fmt, C = NL.cols, T = () => NL.detailTabs;

  function studentFields(){
    const s = st.settings(); const o = st.options;
    return [
      { section: 'Personal information' },
      { name: 'fullName', label: 'Full name', required: true }, { name: 'gender', label: 'Gender', type: 'select', options: ['Female', 'Male', 'Other', 'Prefer not to say'] },
      { name: 'fatherName', label: "Father's name" }, { name: 'motherName', label: "Mother's name" },
      { name: 'dob', label: 'Date of birth', type: 'date', max: F.ymd(new Date()) }, { name: 'mobile', label: 'Mobile', type: 'tel', required: true },
      { name: 'altMobile', label: 'Alternate mobile', type: 'tel' }, { name: 'whatsapp', label: 'WhatsApp', type: 'tel' },
      { name: 'email', label: 'Email', type: 'email' }, { name: 'address', label: 'Address', full: true },
      { name: 'city', label: 'City' }, { name: 'state', label: 'State', type: 'select', options: (v) => NL.actions.stateOptions(v.state) }, { name: 'country', label: 'Country', default: 'India' },
      { name: 'pin', label: 'PIN code', rules: [(v) => v && !/^\d{6}$/.test(v) ? 'PIN code must be 6 digits' : ''] },
      { section: 'Academic information' },
      { name: 'highestQualification', label: 'Highest qualification', type: 'select', options: s.qualifications }, { name: 'board', label: 'Board / University' },
      { name: 'passingYear', label: 'Passing year' }, { name: 'percentage', label: 'Percentage', type: 'number', min: 0, max: 100, step: '0.01', rules: [(v) => v !== '' && (v < 0 || v > 100) ? 'Must be 0–100' : ''] },
      { name: 'cgpa', label: 'CGPA', type: 'number', min: 0, max: 10, step: '0.01', rules: [(v) => v !== '' && (v < 0 || v > 10) ? 'Must be 0–10' : ''] }, { name: 'graduation', label: 'Graduation' },
      { name: 'postGraduation', label: 'Post graduation' }, { name: 'workExperience', label: 'Work experience' },
      { section: 'Admission preferences' },
      { name: 'prefUniversityId', label: 'Preferred university', type: 'select', options: () => o.universities() },
      { name: 'prefCampusId', label: 'Preferred campus', type: 'select', dependsOn: 'prefUniversityId', options: (v) => o.campuses(v.prefUniversityId) },
      { name: 'prefCourseId', label: 'Preferred course', type: 'select', dependsOn: ['prefUniversityId', 'prefCampusId'], options: (v) => o.courses(v.prefUniversityId, v.prefCampusId), full: true },
      { name: 'learningMode', label: 'Learning mode', type: 'select', options: s.learningModes }, { name: 'intake', label: 'Preferred intake', placeholder: 'e.g. July 2026' },
      { name: 'prefLocation', label: 'Preferred location' }, { name: 'budget', label: 'Budget (₹)', type: 'number', min: 0, rules: ['amount'] }
    ];
  }
  async function studentForm(student){
    await st.loadMasters();
    const res = await ui.formModal({ title: student ? `Edit student · ${student.id}` : 'Add student', size: 'xl', onMount: (m, form) => NL.actions.wireCityState(form), fields: studentFields(), values: student || {}, submitLabel: student ? 'Save profile' : 'Create student',
      onSubmit: (v) => student ? S.studentService.update(student.id, v) : A.withDuplicates((x) => S.studentService.create(x), v, { kind: 'student' }) });
    if (res && !res.navigated){ ui.toast(student ? 'Profile updated' : res.merged ? 'Merged into existing student' : `Student ${res.student.id} created`); A.changed('students'); return res; }
    return null;
  }

  function list(el, params, query){
    const o = st.options;
    const page = NL.listPage({ el, id: 'students', module: 'students', title: 'Students', sub: 'Qualified leads converted to student profiles', exportName: 'students', what: 'students', refreshOn: ['students', 'applications'], initial: query,
      actions: [{ label: 'Add Student', icon: '＋', primary: true, action: 'add', perm: 'students.create', onClick: async () => { const r = await studentForm(); if (r && r.student) location.hash = '#/students/' + r.student.id; } }],
      searchPlaceholder: 'Search name, mobile, email, student ID, lead ID…',
      filters: [{ type: 'daterange', label: 'Created', field: 'createdAt' }, { key: 'prefUniversityId', label: 'University', options: () => o.universities(true) },
        { key: 'prefCampusId', label: 'Campus', dependsOn: 'prefUniversityId', options: (v) => o.campuses(v.prefUniversityId, true) },
        { key: 'prefCourseId', label: 'Course', dependsOn: 'prefUniversityId', options: (v) => o.courses(v.prefUniversityId, null, true) },
        st.scope() !== 'own' ? { key: 'counsellorId', label: 'Counsellor', options: () => o.assignable() } : null, { key: 'learningMode', label: 'Mode', options: st.settings().learningModes }].filter(Boolean),
      columns: [C.mono('id', 'Student ID', { render: (s) => html`<a class="rowlink mono" href="#/students/${s.id}">${s.id}</a>` }), C.link('fullName', 'Full Name', (s) => '#/students/' + s.id, { always: true }),
        C.mono('mobile', 'Mobile'), C.text('email', 'Email'), C.text('city', 'City'), { key: 'state', label: 'State', render: (s) => NL.w.stateBadge(s.state), export: (s) => s.state || '' }, C.text('highestQualification', 'Qualification'),
        C.text('prefCourseName', 'Preferred Course'), C.text('prefUniversityName', 'Preferred University'), C.text('learningMode', 'Mode', { hidden: true }),
        C.num('applicationsCount', 'Applications'), C.text('counsellorName', 'Counsellor'), C.mono('leadId', 'Lead ID', { hidden: true, render: (s) => s.leadId ? html`<a class="rowlink mono" href="#/leads/${s.leadId}">${s.leadId}</a>` : '—' }),
        C.date('createdAt', 'Created')],
      fetch: (q) => S.studentService.list(q), onRowClick: (s) => (location.hash = '#/students/' + s.id),
      rowActions: (s) => [{ label: 'Open profile', icon: '👁️', onClick: () => (location.hash = '#/students/' + s.id) }, st.can('students.edit') && { label: 'Edit profile', icon: '✏️', onClick: () => S.studentService.get(s.id).then(d => studentForm(d.student)) },
        st.can('applications.create') && { label: 'Create application', icon: '📝', onClick: () => A.createApplication({ studentId: s.id, student: s }) }, st.can('documents.upload') && { label: 'Upload document', icon: '⤒', onClick: () => A.uploadDocument({ studentId: s.id, studentName: s.fullName }) },
        s.leadId && { label: 'Open lead record', icon: '🎯', onClick: () => (location.hash = '#/leads/' + s.leadId) }].filter(Boolean),
      bulk: [{ label: 'Export', icon: '⤓', handler: async (ids, t, rows) => { NL.file.exportData('csv', rows || await t.selectedRows(), NL.cols && [['id', 'Student ID'], ['fullName', 'Name'], ['mobile', 'Mobile'], ['email', 'Email'], ['city', 'City'], ['prefCourseName', 'Course'], ['prefUniversityName', 'University'], ['counsellorName', 'Counsellor']].map(([k, l]) => ({ label: l, value: (r) => r[k] })), 'students_selected'); } }],
      empty: () => ({ icon: '👨‍🎓', title: 'No students found', text: 'Convert a qualified lead or add a student directly.', actions: [{ label: 'Clear Filters', action: 'clearFilters' }] })
    });
    return page.cleanup;
  }

  function detail(el, params, query){
    let data = null, tab = query.tab || 'profile';
    const load = () => ui.load(el, () => S.studentService.get(params.id), (d) => { data = d; draw(); }, { cards: 6, what: 'this student' });
    function draw(){
      const s = data.student;
      el.innerHTML = toHtml(html`
        <div class="detail-head"><div class="dh-main">${ui.avatar(s.fullName, 'lg')}<div><h1>${s.fullName}</h1>
          <div class="dh-meta"><span class="mono">${s.id}</span>${s.leadId ? html`<a class="badge b-blue" href="#/leads/${s.leadId}">Lead ${s.leadId}</a>` : html`<span class="badge b-gray">Direct student</span>`}${data.lead ? ui.badge(data.lead.stage) : ''}${ui.badge(`${s.applicationsCount} application${s.applicationsCount === 1 ? '' : 's'}`, 'purple')}</div>
          <div class="dh-sub"><span>👤 Counsellor: <b>${s.counsellorName || '—'}</b></span><span>📱 <span class="mono">${s.mobile}</span></span>${s.email ? html`<span>✉️ ${s.email}</span>` : ''}${data.lead ? html`<span>Source: ${data.lead.source}${data.lead.campaignName ? ' · ' + data.lead.campaignName : ''}</span>` : ''}</div></div></div>
          <div class="dh-actions">${st.can('students.edit') ? html`<button class="btn-ghost" data-action="edit">✏️ Edit profile</button>` : ''}${st.can('applications.create') ? html`<button class="btn-primary" data-action="app">📝 New application</button>` : ''}
            ${st.can('documents.upload') ? html`<button class="btn-ghost" data-action="upload">⤒ Document</button>` : ''}${st.can('payments.create') && data.applications.length ? html`<button class="btn-ghost" data-action="pay">💰 Payment</button>` : ''}
            ${st.can('notes.create') ? html`<button class="btn-ghost" data-action="note">🗒️ Note</button>` : ''}${data.lead && st.can('calls.create') ? html`<button class="btn-ghost" data-action="call">📞 Call</button>` : ''}</div></div>
        ${w.card('Admission timeline', w.milestones(data.milestones), { cls: 'ms-card' })}
        ${w.tabs([{ key: 'profile', label: 'Profile' }, { key: 'applications', label: 'Applications', count: data.applications.length }, { key: 'documents', label: 'Documents', count: data.documents.length },
          { key: 'payments', label: 'Payments', count: data.payments.length }, { key: 'activity', label: 'Activity', count: data.timeline.length }, { key: 'notes', label: 'Notes', count: data.notes.length },
          data.lead ? { key: 'calls', label: 'Calls', count: data.calls.length } : null, { key: 'audit', label: 'Audit' }], tab)}
        <div class="tab-panel card">${panel()}</div>`);
    }
    function panel(){
      const s = data.student; const t = T();
      switch (tab){
        case 'applications': return t.applications(data.applications);
        case 'documents': return t.documents(data.documents, st.can('documents.upload'));
        case 'payments': return t.payments(data.payments);
        case 'activity': return w.timeline(data.timeline);
        case 'notes': return t.notes(data.notes);
        case 'calls': return t.calls(data.calls);
        case 'audit': return t.audit(data.audit);
        default: return html`<div class="grid-3">
          ${w.card('Personal information', w.detailGrid([['Student ID', html`<span class="mono">${s.id}</span>`], ['Full name', s.fullName], ["Father's name", s.fatherName], ["Mother's name", s.motherName], ['Date of birth', s.dob ? F.date(s.dob) : ''], ['Gender', s.gender],
            ['Mobile', s.mobile], ['Alternate mobile', s.altMobile], ['WhatsApp', s.whatsapp], ['Email', s.email], ['Address', s.address], ['City', s.city], ['State', NL.w.stateBadge(s.state)], ['Country', s.country], ['PIN code', s.pin]]))}
          ${w.card('Academic information', w.detailGrid([['Highest qualification', s.highestQualification], ['Board / University', s.board], ['Passing year', s.passingYear], ['Percentage', s.percentage ? s.percentage + '%' : ''], ['CGPA', s.cgpa], ['Graduation', s.graduation], ['Post graduation', s.postGraduation], ['Work experience', s.workExperience]]))}
          ${w.card('Admission preferences', w.detailGrid([['Preferred university', s.prefUniversityName], ['Preferred campus', s.prefCampusName], ['Preferred course', s.prefCourseName], ['Learning mode', s.learningMode], ['Preferred intake', s.intake], ['Preferred location', s.prefLocation], ['Budget', s.budget ? F.money(s.budget) : '']]))}
        </div>`;
      }
    }
    el.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-tab]'); if (t){ tab = t.dataset.tab; $$('.tab-btn', el).forEach(b => b.classList.toggle('active', b === t)); $('.tab-panel', el).innerHTML = toHtml(panel()); return; }
      const a = e.target.closest('.detail-head [data-action]'); if (!a) return; const s = data.student; let ok = false;
      switch (a.dataset.action){
        case 'edit': ok = await studentForm(s); break;
        case 'app': ok = await A.createApplication({ studentId: s.id, student: s }); break;
        case 'upload': ok = await A.uploadDocument({ studentId: s.id, studentName: s.fullName }); break;
        case 'pay': ok = await A.addPayment({ studentId: s.id }); break;
        case 'note': ok = await A.addNote({ studentId: s.id, leadId: s.leadId || undefined }); break;
        case 'call': ok = await A.logCall(data.lead); break;
      }
      if (ok) load();
    });
    NL.wireTabActions(el, () => data, load, { student: () => data.student, newApp: () => A.createApplication({ studentId: data.student.id, student: data.student }) });
    load();
  }

  NL.pages.students = { title: 'Students', perm: 'students.view', crumbs: ['Admissions', 'Students'], render: list };
  NL.pages.studentDetail = { title: 'Student', perm: 'students.view', crumbs: (p) => [['Students', '#/students'], p.id], render: detail };
  NL.studentForm = studentForm;
})();
