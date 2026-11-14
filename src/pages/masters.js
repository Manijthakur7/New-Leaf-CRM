/* Master data — universities, campuses, courses. */
(function(){
  const { html } = NL.util;
  const S = NL.services, st = NL.store, ui = NL.ui, A = NL.actions, C = NL.cols, F = NL.fmt;

  async function saveMaster(svc, rec, fields, title, label){
    await st.loadMasters();
    const res = await ui.formModal({ title: rec ? `Edit ${label} · ${rec.name}` : `Add ${label}`, fields, values: rec || {}, size: fields.length > 8 ? 'lg' : 'md',
      onSubmit: (v) => rec ? svc.update(rec.id, v) : svc.create(v) });
    if (res){ ui.toast(`${label} ${rec ? 'updated' : 'created'}`); st.invalidateMasters(); await st.loadMasters(true); A.changed(title); }
    return res;
  }
  async function toggleStatus(svc, rec, label, module){
    const to = rec.status === 'Active' ? 'Inactive' : 'Active';
    const ok = await ui.confirm({ title: `${to === 'Active' ? 'Activate' : 'Deactivate'} ${label}`, message: `${to === 'Active' ? 'Activate' : 'Deactivate'} “${rec.name}”?`, detail: to === 'Inactive' ? `Inactive ${label.toLowerCase()} records are hidden from new lead and application forms. Existing records are unaffected.` : '', danger: to === 'Inactive', confirmText: to === 'Active' ? 'Activate' : 'Deactivate' });
    if (!ok) return false;
    try { await svc.update(rec.id, { status: to }); ui.toast(`${label} ${to === 'Active' ? 'activated' : 'deactivated'}`); await st.loadMasters(true); return A.changed(module); } catch (e){ return A.fail(e); }
  }

  /* ---------- Universities ---------- */
  const uniFields = () => [{ name: 'name', label: 'University name', required: true, full: true }, { name: 'code', label: 'University code', required: true, placeholder: 'e.g. CU' },
    { name: 'type', label: 'Type', type: 'select', options: ['Private', 'Private (Online)', 'Public', 'Deemed', 'State', 'Central', 'International'] }, { name: 'accreditation', label: 'Accreditation', placeholder: 'NAAC A+, UGC-DEB…' },
    { name: 'website', label: 'Website', placeholder: 'https://' }, { name: 'logo', label: 'Logo URL', placeholder: 'https://…/logo.png' }, { name: 'location', label: 'Location' }, { name: 'state', label: 'State' },
    { name: 'country', label: 'Country', default: 'India' }, { name: 'contactPerson', label: 'Contact person' }, { name: 'contactNumber', label: 'Contact number', type: 'tel' }, { name: 'email', label: 'Email', type: 'email' },
    { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], placeholder: false, default: 'Active' }];
  function universities(el, p, query){
    const page = NL.listPage({ el, id: 'universities', module: 'universities', title: 'Universities', sub: 'Partner universities and their admission contacts', exportName: 'universities', what: 'universities', refreshOn: ['universities'], initial: query,
      actions: [{ label: 'Add University', icon: '＋', primary: true, action: 'add', perm: 'universities.manage', onClick: () => saveMaster(S.universityService, null, uniFields(), 'universities', 'University') }],
      searchPlaceholder: 'Search name, code, location…',
      filters: [{ key: 'status', label: 'Status', options: ['Active', 'Inactive'] }, { key: 'type', label: 'Type', options: ['Private', 'Private (Online)', 'Public', 'Deemed', 'State', 'Central', 'International'] }],
      columns: [C.mono('id', 'University ID'), { key: 'name', label: 'University', always: true, cls: 'name', render: (u) => html`<div class="uni-cell">${u.logo ? html`<img src="${u.logo}" alt="" class="uni-logo" loading="lazy" referrerpolicy="no-referrer">` : html`<span class="uni-logo txt">${u.code}</span>`}<div>${u.name}<div class="muted tiny">${u.accreditation || ''}</div></div></div>` },
        C.mono('code', 'Code'), C.text('type', 'Type'), C.text('location', 'Location'), C.text('state', 'State'), C.text('contactPerson', 'Contact Person', { hidden: true }), C.mono('contactNumber', 'Contact Number', { hidden: true }),
        C.text('email', 'Email', { hidden: true }), { key: 'website', label: 'Website', hidden: true, render: (u) => u.website ? html`<a href="${u.website}" target="_blank" rel="noopener noreferrer">${u.website.replace(/^https?:\/\//, '')}</a>` : '—' },
        C.num('campusCount', 'Campuses'), C.num('courseCount', 'Courses'), C.num('leadCount', 'Leads'), C.num('admissionCount', 'Admissions'), C.badge('status', 'Status')],
      fetch: (q) => S.universityService.list(q),
      rowActions: (u) => [st.can('universities.manage') && { label: 'Edit', icon: '✏️', onClick: () => saveMaster(S.universityService, u, uniFields(), 'universities', 'University') },
        st.can('universities.manage') && { label: u.status === 'Active' ? 'Deactivate' : 'Activate', icon: u.status === 'Active' ? '⏸️' : '▶️', danger: u.status === 'Active', onClick: () => toggleStatus(S.universityService, u, 'University', 'universities') }, '-',
        { label: 'View courses', icon: '📚', onClick: () => (location.hash = '#/courses?universityId=' + u.id) }, { label: 'View campuses', icon: '🏢', onClick: () => (location.hash = '#/campuses?universityId=' + u.id) },
        st.can('applications.view') && { label: 'View admissions', icon: '🎓', onClick: () => (location.hash = '#/applications?universityId=' + u.id + '&stage=Admission%20Confirmed') },
        st.can('leads.view') && { label: 'View leads', icon: '🎯', onClick: () => (location.hash = '#/leads?universityId=' + u.id) }].filter(Boolean),
      empty: () => ({ icon: '🏫', title: 'No universities found', text: 'Try changing your filters.', actions: [{ label: 'Clear Filters', action: 'clearFilters' }] })
    });
    return page.cleanup;
  }

  /* ---------- Campuses ---------- */
  const campusFields = () => [{ name: 'universityId', label: 'University', type: 'select', required: true, options: () => st.options.universities(true) }, { name: 'name', label: 'Campus name', required: true },
    { name: 'location', label: 'Location / city' }, { name: 'state', label: 'State' }, { name: 'address', label: 'Address', full: true }, { name: 'contact', label: 'Contact number' },
    { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], placeholder: false, default: 'Active' }];
  function campuses(el, p, query){
    const page = NL.listPage({ el, id: 'campuses', module: 'campuses', title: 'Campuses', sub: 'Each university can have multiple campuses, including online', exportName: 'campuses', what: 'campuses', refreshOn: ['campuses'], initial: query,
      actions: [{ label: 'Add Campus', icon: '＋', primary: true, action: 'add', perm: 'campuses.manage', onClick: () => saveMaster(S.campusService, null, campusFields(), 'campuses', 'Campus') }],
      filters: [{ key: 'universityId', label: 'University', options: () => st.options.universities(true) }, { key: 'status', label: 'Status', options: ['Active', 'Inactive'] }],
      columns: [C.mono('id', 'Campus ID'), C.text('universityName', 'University'), C.text('name', 'Campus Name', { cls: 'name', always: true }), C.text('location', 'Location'), C.text('state', 'State'),
        C.text('address', 'Address', { cls: 'remarks' }), C.mono('contact', 'Contact'), C.num('courseCount', 'Courses'), C.badge('status', 'Status')],
      fetch: (q) => S.campusService.list(q),
      rowActions: (c) => [st.can('campuses.manage') && { label: 'Edit', icon: '✏️', onClick: () => saveMaster(S.campusService, c, campusFields(), 'campuses', 'Campus') },
        st.can('campuses.manage') && { label: c.status === 'Active' ? 'Deactivate' : 'Activate', icon: c.status === 'Active' ? '⏸️' : '▶️', danger: c.status === 'Active', onClick: () => toggleStatus(S.campusService, c, 'Campus', 'campuses') },
        { label: 'View courses', icon: '📚', onClick: () => (location.hash = `#/courses?universityId=${c.universityId}&campusId=${c.id}`) }].filter(Boolean),
      empty: () => ({ icon: '🏢', title: 'No campuses found', actions: [{ label: 'Clear Filters', action: 'clearFilters' }] })
    });
    return page.cleanup;
  }

  /* ---------- Courses ---------- */
  function courseFields(){
    const s = st.settings(); const o = st.options;
    return [{ section: 'Course' }, { name: 'universityId', label: 'University', type: 'select', required: true, options: () => o.universities(true) },
      { name: 'campusId', label: 'Campus', type: 'select', required: true, dependsOn: 'universityId', options: (v) => o.campuses(v.universityId, true) },
      { name: 'name', label: 'Course name', required: true, placeholder: 'e.g. MBA' }, { name: 'code', label: 'Course code', required: true },
      { name: 'degreeType', label: 'Degree type', type: 'select', options: s.degreeTypes }, { name: 'department', label: 'Department' },
      { name: 'duration', label: 'Duration', placeholder: 'e.g. 2 Years' }, { name: 'mode', label: 'Learning mode', type: 'select', options: s.learningModes },
      { name: 'eligibility', label: 'Eligibility', full: true }, { section: 'Fees & intake' },
      { name: 'totalFees', label: 'Total fees (₹)', type: 'number', required: true, min: 0, rules: ['amount'] }, { name: 'applicationFee', label: 'Application fee (₹)', type: 'number', min: 0, rules: ['amount'] },
      { name: 'semesterFee', label: 'Semester fee (₹)', type: 'number', min: 0, rules: ['amount'] }, { name: 'scholarship', label: 'Scholarship' },
      { name: 'intake', label: 'Intake', placeholder: 'e.g. July 2026' }, { name: 'seats', label: 'Available seats', type: 'number', min: 0, rules: ['amount'] },
      { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], placeholder: false, default: 'Active' }];
  }
  function courses(el, p, query){
    const s = st.settings(); const o = st.options;
    const page = NL.listPage({ el, id: 'courses', module: 'courses', title: 'Courses', sub: 'Course master with fees, intake and seats', exportName: 'courses', what: 'courses', refreshOn: ['courses'], initial: query,
      actions: [{ label: 'Add Course', icon: '＋', primary: true, action: 'add', perm: 'courses.manage', onClick: () => saveMaster(S.courseService, null, courseFields(), 'courses', 'Course') }],
      searchPlaceholder: 'Search course, code, department…',
      filters: [{ key: 'universityId', label: 'University', options: () => o.universities(true) }, { key: 'campusId', label: 'Campus', dependsOn: 'universityId', options: (v) => o.campuses(v.universityId, true) },
        { key: 'degreeType', label: 'Degree', options: s.degreeTypes }, { key: 'mode', label: 'Mode', options: s.learningModes }, { key: 'name', label: 'Course', options: () => o.courseNames() }, { key: 'status', label: 'Status', options: ['Active', 'Inactive'] }],
      columns: [C.mono('id', 'Course ID'), C.text('universityName', 'University'), C.text('campusName', 'Campus'), C.text('name', 'Course Name', { cls: 'name', always: true }), C.mono('code', 'Code'),
        C.text('degreeType', 'Degree'), C.text('department', 'Department', { hidden: true }), C.text('duration', 'Duration'), C.badge('mode', 'Mode', { render: (c) => ui.badge(c.mode, 'blue') }),
        C.text('eligibility', 'Eligibility', { hidden: true, cls: 'remarks' }), C.money('totalFees', 'Total Fees'), C.money('applicationFee', 'Application Fee', { hidden: true }), C.money('semesterFee', 'Semester Fee'),
        C.text('scholarship', 'Scholarship', { hidden: true }), C.text('intake', 'Intake'), C.num('seats', 'Seats'), C.badge('status', 'Status')],
      fetch: (q) => S.courseService.list(q),
      rowActions: (c) => [st.can('courses.manage') && { label: 'Edit', icon: '✏️', onClick: () => saveMaster(S.courseService, c, courseFields(), 'courses', 'Course') },
        st.can('courses.manage') && { label: c.status === 'Active' ? 'Deactivate' : 'Activate', icon: c.status === 'Active' ? '⏸️' : '▶️', danger: c.status === 'Active', onClick: () => toggleStatus(S.courseService, c, 'Course', 'courses') },
        st.can('leads.view') && { label: 'View leads', icon: '🎯', onClick: () => (location.hash = `#/leads?universityId=${c.universityId}&courseId=${c.id}`) },
        st.can('applications.view') && { label: 'View applications', icon: '📝', onClick: () => (location.hash = `#/applications?universityId=${c.universityId}&courseId=${c.id}`) }].filter(Boolean),
      empty: () => ({ icon: '📚', title: 'No courses found', text: 'Try changing your filters.', actions: [{ label: 'Clear Filters', action: 'clearFilters' }] })
    });
    return page.cleanup;
  }

  NL.pages.universities = { title: 'Universities', perm: 'universities.view', crumbs: ['Admissions', 'Universities'], render: universities };
  NL.pages.campuses = { title: 'Campuses', perm: 'campuses.view', crumbs: ['Admissions', 'Campuses'], render: campuses };
  NL.pages.courses = { title: 'Courses', perm: 'courses.view', crumbs: ['Admissions', 'Courses'], render: courses };
  NL.masters = { saveMaster, toggleStatus };
})();
