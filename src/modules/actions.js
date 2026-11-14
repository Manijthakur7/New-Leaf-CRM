/* Shared admission workflows used from list pages, detail pages and the
   counsellor workspace. Each returns a Promise resolving truthy when data
   changed, and emits 'data-changed' so open views can refresh. */
(function(){
  const { html, raw, toHtml, $ } = NL.util;
  const S = NL.services, st = NL.store, ui = NL.ui;
  const changed = (module) => { st.emit('data-changed', module); return true; };
  const fail = (err) => { if (err && err.status !== 401) ui.toast(err.message || 'Something went wrong', 'error'); return false; };
  const opts = st.options;
  const nowLocal = (mins) => new Date(Date.now() + (mins || 0) * 60000).toISOString();

  /* ---------- Duplicate management ---------- */
  function duplicateDialog(dups, o){
    o = o || {};
    return new Promise((resolve) => {
      const canMerge = st.can('leads.merge') && o.allowMerge !== false;
      const m = ui.modal({ title: '⚠️ Possible duplicate student found', size: 'lg',
        body: html`<p class="muted">We found existing records with the same mobile number or email. Review them before creating a new record.</p>
          <div class="table-wrap"><table class="table"><thead><tr><th></th><th>Name</th><th>Mobile</th><th>Email</th><th>Existing ID</th><th>Student ID</th><th>Stage</th></tr></thead>
          <tbody>${dups.map((d, i) => html`<tr><td><input type="radio" name="dupPick" value="${i}" ${i === 0 ? raw('checked') : ''}></td><td class="name">${d.name}</td><td class="mono">${d.mobile || '—'}</td><td>${d.email || '—'}</td><td class="mono">${d.id}</td><td class="mono">${d.studentId || '—'}</td><td>${d.stage ? ui.badge(d.stage) : '—'}</td></tr>`)}</tbody></table></div>
          ${canMerge ? '' : html`<p class="muted small">Only authorised roles (Team Leader, Admin) can merge records.</p>`}`,
        footer: html`<button class="btn-ghost" data-close>Cancel</button><span class="spacer"></span><button class="btn-ghost" data-d="view">View Existing</button>
          ${canMerge ? html`<button class="btn-ghost" data-d="merge">Merge into selected</button>` : ''}<button class="btn-primary" data-d="create">Create Anyway</button>`,
        onClose: (r) => resolve(r || null) });
      m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-d]'); if (!b) return; const i = Number(($('input[name=dupPick]:checked', m.el) || { value: 0 }).value); m.close({ choice: b.dataset.d, dup: dups[i] }); });
    });
  }
  function linkFor(d){ return d.kind === 'student' ? '#/students/' + d.id : d.kind === 'application' ? '#/applications/' + d.id : '#/leads/' + d.id; }

  /* Wrap a create call with duplicate detection → choice → retry */
  async function withDuplicates(create, v, o){
    try { return await create(v); }
    catch (err){
      if (err.status !== 409 || !err.details || !err.details.duplicates) throw err;
      const pick = await duplicateDialog(err.details.duplicates, o);
      if (!pick){ err.handled = true; err.message = 'Cancelled — nothing was saved.'; throw err; }
      if (pick.choice === 'view'){ location.hash = linkFor(pick.dup); return { navigated: true }; }
      if (pick.choice === 'merge') return create(Object.assign({}, v, { mergeInto: pick.dup.kind === 'student' && o && o.kind === 'lead' ? pick.dup.id : pick.dup.id }));
      return create(Object.assign({}, v, { force: true }));
    }
  }

  /* ---------- Lead create / edit ---------- */
  function leadFields(lead){
    const s = st.settings(); const canAssign = st.can('leads.assign') && st.scope() !== 'own';
    return [
      { section: 'Student details' },
      { name: 'name', label: 'Student name', required: true, rules: [{ min: 2 }] },
      { name: 'mobile', label: 'Mobile', type: 'tel', required: true, placeholder: '10-digit mobile' },
      { name: 'whatsapp', label: 'WhatsApp', type: 'tel', placeholder: 'Same as mobile if blank' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'qualification', label: 'Qualification', type: 'select', options: s.qualifications },
      { name: 'passingYear', label: 'Passing year', type: 'number', min: 1970, max: 2035, rules: [(v) => v && !/^(19|20)\d{2}$/.test(String(v)) ? 'Enter a valid year' : ''] },
      { name: 'city', label: 'City', placeholder: 'Typing a known city fills the state' },
      { name: 'state', label: 'State', type: 'select', required: true, options: (v) => stateOptions(v.state), help: 'Used for state-wise reporting of leads' },
      { section: 'Programme interest' },
      { name: 'universityId', label: 'University', type: 'select', options: () => opts.universities() },
      { name: 'campusId', label: 'Campus', type: 'select', dependsOn: 'universityId', options: (v) => opts.campuses(v.universityId) },
      { name: 'courseId', label: 'Course', type: 'select', dependsOn: ['universityId', 'campusId'], options: (v) => opts.courses(v.universityId, v.campusId), full: true },
      { name: 'preferredCourse', label: 'Preferred course (free text)', placeholder: 'If not in the course list' },
      { name: 'source', label: 'Lead source', type: 'select', required: true, options: s.leadSources, placeholder: '— Where did this lead come from? —', help: 'Required — e.g. Facebook, Instagram, YouTube, Google, Website, Walk-in' },
      { name: 'campaignId', label: 'Campaign', type: 'select', options: () => opts.campaigns() },
      { name: 'priority', label: 'Priority', type: 'select', options: s.priorities, default: 'Medium', placeholder: false },
      lead ? { name: 'stage', label: 'Lead stage', type: 'select', options: s.leadStages.concat(s.negativeStages), placeholder: false } : null,
      lead ? { name: 'outcome', label: 'Outcome', type: 'select', options: NL.outcomes.CRM_OUTCOMES, placeholder: 'Select Outcome', help: 'Updated automatically from calls and follow-ups; change it here if needed.' } : null,
      lead ? { name: 'subOutcome', label: 'Sub Outcome', type: 'select', options: [], placeholder: 'Select Sub Outcome' } : null,
      !lead && canAssign ? { section: 'Assignment' } : null,
      !lead && canAssign ? { name: 'counsellorId', label: 'Assign to counsellor', type: 'select', options: () => opts.assignable(), placeholder: '— Use automatic method —' } : null,
      !lead && canAssign ? { name: 'assignMethod', label: 'Automatic method', type: 'select', options: ASSIGN_METHODS.filter(m => m.value !== 'manual'), placeholder: 'Leave unassigned', default: s.assignment.defaultMethod } : null,
      { name: 'remarks', label: 'Remarks', type: 'textarea', full: true }
    ].filter(Boolean);
  }
  /* Indian states & UTs + "Outside India"; keeps an existing non-standard value selectable */
  function stateOptions(current){
    const list = NL.geo.STATES.slice().sort().concat(['Outside India']);
    if (current && !list.includes(current)) list.unshift(current);
    return list;
  }
  /* City → state auto-fill (only when the state is still empty or was auto-filled) */
  function wireCityState(form){
    const city = form.querySelector('[name=city]'), state = form.querySelector('[name=state]'); if (!city || !state) return;
    let auto = !state.value;
    state.addEventListener('change', () => { auto = !state.value; });
    city.addEventListener('input', () => { if (!auto) return; const s = NL.geo.stateFromCity(city.value); state.value = s && [...state.options].some(o => o.value === s) ? s : ''; });
  }
  async function leadForm(lead){
    await st.loadMasters();
    const values = lead ? Object.assign({}, lead, { state: NL.geo.resolveState(lead.state, lead.city) }) : {};
    const res = await ui.formModal({ title: lead ? `Edit lead · ${lead.id}` : 'Add Lead', fields: leadFields(lead), values, submitLabel: lead ? 'Save changes' : 'Create lead', size: 'lg',
      onMount: (m, form) => { wireCityState(form); if (!lead) return; outcomePair(form); const sub = form.querySelector('[name=subOutcome]'); if (sub && lead.subOutcome && [...sub.options].some(o => o.value === lead.subOutcome)) sub.value = lead.subOutcome; },
      validate: lead ? (v) => v.outcome && NL.outcomes.subOutcomesFor(v.outcome).length && !v.subOutcome ? { subOutcome: 'Select a sub outcome' } : {} : undefined,
      onSubmit: async (v) => {
        if (lead){
          if (v.stage !== lead.stage && st.settings().negativeStages.includes(v.stage)){
            const ok = await ui.confirm({ title: 'Change lead stage', message: `Mark ${lead.name} as “${v.stage}”?`, detail: 'The lead leaves the active pipeline. Its full history is kept.', danger: true, confirmText: 'Change stage' });
            if (!ok) return false;
          }
          return withDuplicates((x) => S.leadService.update(lead.id, x), v, { allowMerge: false });
        }
        return withDuplicates((x) => S.leadService.create(x), v, { kind: 'lead' });
      } });
    if (res && !res.navigated){ ui.toast(res.merged ? 'Merged into the existing lead' : lead ? 'Lead updated' : 'Lead created'); return changed('leads') && res; }
    return null;
  }

  /* ---------- Assignment ---------- */
  const ASSIGN_METHODS = [
    { value: 'manual', label: 'Manual — pick a counsellor' }, { value: 'round_robin', label: 'Round robin — distribute evenly' },
    { value: 'team', label: 'Team based — least-loaded member of a team' }, { value: 'university', label: 'University based — university-specific counsellors' },
    { value: 'course', label: 'Course based — course-specific counsellors' }, { value: 'campaign', label: 'Campaign based — campaign team' }
  ];
  async function assignLeads(ids, o){
    o = o || {}; await st.loadMasters();
    if (!ids.length){ ui.toast('Select at least one lead', 'warn'); return false; }
    const reassign = !!o.reassign;
    const res = await ui.formModal({ title: `${reassign ? 'Reassign' : 'Assign'} ${ids.length} lead${ids.length === 1 ? '' : 's'}`, size: 'md', cols: 1,
      intro: html`Assignment rules for university, course and campaign methods are configured in <b>Settings → Lead Management</b>.`,
      fields: [
        { name: 'method', label: 'Assignment method', type: 'select', options: ASSIGN_METHODS, placeholder: false, default: 'manual' },
        { name: 'counsellorId', label: 'Counsellor', type: 'select', options: () => opts.assignable(), help: 'Required for manual assignment' },
        { name: 'teamId', label: 'Team', type: 'select', options: () => st.scope() === 'all' ? opts.teams() : opts.teams().filter(t => t.value === st.user().teamId), help: 'Round robin / team methods: limit to this team (optional for round robin)' }
      ],
      validate: (v) => v.method === 'manual' && !v.counsellorId ? { counsellorId: 'Pick a counsellor' } : v.method === 'team' && !v.teamId && st.scope() === 'all' ? { teamId: 'Pick a team' } : {},
      onMount: (m, form) => {
        const sync = () => { const mth = form.querySelector('[name=method]').value; form.querySelector('[data-field=counsellorId]').hidden = mth !== 'manual'; form.querySelector('[data-field=teamId]').hidden = !['round_robin', 'team'].includes(mth); };
        form.querySelector('[name=method]').addEventListener('change', sync); sync();
      },
      submitLabel: reassign ? 'Reassign' : 'Assign',
      onSubmit: async (v) => {
        if (ids.length > 1 || reassign){
          const who = v.method === 'manual' ? st.userName(v.counsellorId) : ASSIGN_METHODS.find(m => m.value === v.method).label.split(' — ')[0].toLowerCase();
          const ok = await ui.confirm({ title: reassign ? 'Confirm reassignment' : 'Confirm assignment', message: `Are you sure you want to ${reassign ? 'reassign' : 'assign'} ${ids.length} lead${ids.length === 1 ? '' : 's'}${v.method === 'manual' ? ' to ' + who : ' using ' + who}?`, detail: 'Counsellors are notified and every change is written to the audit log.', confirmText: 'Confirm' });
          if (!ok) return false;
        }
        return S.leadService.assign(ids, v.method, { counsellorId: v.counsellorId, teamId: v.teamId });
      } });
    if (!res) return false;
    const dist = Object.entries(res.distribution || {}).map(([n, c]) => `${n} (${c})`).join(', ');
    ui.toast(res.changed ? `${res.changed} lead${res.changed === 1 ? '' : 's'} assigned${dist ? ' → ' + dist : ''}` : 'No changes — leads already with that counsellor', res.changed ? 'ok' : 'info');
    return changed('leads');
  }

  /* ---------- Calls (with dialer hook + live timer) ---------- */
  async function logCall(lead){
    const s = st.settings(); let timer = null, started = null;
    const res = await ui.formModal({ title: `Call · ${lead.name}`, size: 'lg',
      intro: html`<div class="dial-bar"><div><div class="dial-name">${lead.name}</div><div class="mono muted">${lead.mobile}${lead.leadStage || lead.stage ? html` · ${ui.badge(lead.stage || lead.leadStage)}` : ''}</div></div>
        <div class="dial-ctrl"><span class="dial-timer mono" id="dialTimer">00:00</span><button type="button" class="btn-primary btn-sm" id="dialStart">📞 Dial &amp; start timer</button><button type="button" class="btn-ghost btn-sm" id="dialStop" disabled>■ End call</button>
        <button type="button" class="btn-ghost btn-sm" id="dialWa">💬 WhatsApp</button></div></div>
        <div class="muted small">Dialer provider: <b>${S.telephonyService.provider}</b> — connect a CTI/telephony API in <code>telephonyService</code> to auto-log calls.</div>`,
      fields: [
        { name: 'type', label: 'Call type', type: 'select', options: ['Outgoing', 'Incoming', 'Callback'], placeholder: false, default: 'Outgoing' },
        { name: 'outcome', label: 'Outcome', type: 'select', required: true, options: NL.outcomes.CRM_OUTCOMES, placeholder: 'Select Outcome' },
        { name: 'subOutcome', label: 'Sub Outcome', type: 'select', options: [], placeholder: 'Select Sub Outcome' },
        { name: 'startAt', label: 'Call start', type: 'datetime', required: true, default: nowLocal(-2) },
        { name: 'duration', label: 'Duration (seconds)', type: 'number', min: 0, default: 0, rules: ['amount'] },
        { name: 'notes', label: 'Call notes', type: 'textarea', full: true, placeholder: 'What was discussed?' },
        { name: 'nextFollowupAt', label: 'Next follow-up', type: 'datetime', help: 'Creates a follow-up task' },
        { name: 'followupReason', label: 'Follow-up reason', type: 'select', options: s.followupReasons, default: 'Callback', placeholder: false },
        { name: 'applyStage', label: 'Update the lead stage for exit outcomes (Not Interested, Not Eligible, Duplicate Lead, Wrong Lead)', type: 'checkbox', full: true, default: true }
      ],
      validate: (v) => Object.assign({}, v.nextFollowupAt && new Date(v.nextFollowupAt) < new Date() ? { nextFollowupAt: 'Must be in the future' } : {},
        NL.outcomes.subOutcomesFor(v.outcome).length && !v.subOutcome ? { subOutcome: 'Select a sub outcome' } : {}),
      onMount: (m, form) => {
        outcomePair(form);
        const tEl = $('#dialTimer', m.el), b1 = $('#dialStart', m.el), b2 = $('#dialStop', m.el);
        b1.onclick = async () => { await S.telephonyService.dial(lead.mobile); started = Date.now(); form.querySelector('[name=startAt]').value = NL.fmt.dateLocalInput(new Date()); b1.disabled = true; b2.disabled = false;
          timer = setInterval(() => { const sec = Math.round((Date.now() - started) / 1000); tEl.textContent = `${NL.fmt.pad(Math.floor(sec / 60))}:${NL.fmt.pad(sec % 60)}`; }, 500); };
        b2.onclick = () => { clearInterval(timer); timer = null; form.querySelector('[name=duration]').value = Math.round((Date.now() - started) / 1000); b2.disabled = true; b1.disabled = false; form.querySelector('[name=outcome]').focus(); };
        $('#dialWa', m.el).onclick = () => S.whatsappService.open(lead.whatsapp || lead.mobile, `Hi ${lead.name.split(' ')[0]}, this is ${st.user().fullName} from ${st.settings().general.companyName}.`);
      },
      submitLabel: 'Save call',
      onSubmit: (v) => { if (timer) clearInterval(timer); return S.callService.log(Object.assign(v, { leadId: lead.id })); } });
    if (timer) clearInterval(timer);
    if (res){ ui.toast('Call logged'); return changed('calls'); }
    return false;
  }

  async function scheduleFollowup(leadOrIds, o){
    const s = st.settings(); const bulk = Array.isArray(leadOrIds);
    const res = await ui.formModal({ title: bulk ? `Schedule follow-up for ${leadOrIds.length} leads` : `Schedule follow-up · ${leadOrIds.name}`, cols: 1, size: 'md',
      fields: [{ name: 'dueAt', label: 'Date & time', type: 'datetime', required: true, default: nowLocal(60 * 24) }, { name: 'reason', label: 'Reason', type: 'select', required: true, options: s.followupReasons, default: 'Callback' },
        { name: 'notes', label: 'Notes', type: 'textarea' }],
      validate: (v) => new Date(v.dueAt) < new Date() ? { dueAt: 'Pick a time in the future' } : {},
      submitLabel: 'Schedule',
      onSubmit: (v) => bulk ? S.leadService.bulk(leadOrIds, 'followup', v) : S.followupService.create(Object.assign(v, { leadId: leadOrIds.id })) });
    if (res){ ui.toast('Follow-up scheduled'); return changed('followups'); }
    return false;
  }
  async function rescheduleFollowup(f){
    const res = await ui.formModal({ title: 'Reschedule follow-up', cols: 1, size: 'sm', fields: [{ name: 'dueAt', label: 'New date & time', type: 'datetime', required: true, default: f.dueAt > new Date().toISOString() ? f.dueAt : nowLocal(60) }],
      validate: (v) => new Date(v.dueAt) < new Date() ? { dueAt: 'Pick a time in the future' } : {}, submitLabel: 'Reschedule', onSubmit: (v) => S.followupService.update(f.id, v) });
    if (res){ ui.toast('Follow-up rescheduled'); return changed('followups'); }
    return false;
  }
  /* Outcome + Sub Outcome pair in a form, filled from the central outcome master. */
  function outcomePair(form){
    const o = form.querySelector('[name=outcome]'), sub = form.querySelector('[name=subOutcome]'); if (!o || !sub) return;
    o.classList.add('crm-outcome-select'); sub.classList.add('crm-sub-outcome-select');
    const lbl = form.querySelector('[data-field="subOutcome"] label'); if (lbl && !lbl.querySelector('.req')) lbl.insertAdjacentHTML('beforeend', ' <span class="req" aria-hidden="true">*</span>');
    NL.outcomes.populateOutcomeDropdowns(form);
  }
  /* Complete Follow-up dialog — one follow-up or several selected ones.
     Outcome + completion notes, and optionally the next follow-up (created by the server). */
  const NEXT = [['', 'No further follow-up'], ['1', 'Tomorrow'], ['2', 'In 2 days'], ['3', 'In 3 days'], ['7', 'Next week'], ['custom', 'Pick date & time…']];
  async function completeFollowup(fOrList){
    const list = [].concat(fOrList).filter(Boolean);
    if (!list.length) return false;
    const one = list.length === 1; const f0 = list[0];
    const OC = NL.outcomes; // central outcome master (src/js/outcomes.js)
    const subsFor = (code) => OC.subOutcomesFor(code);
    const res = await ui.formModal({ title: 'Complete Follow-up', size: 'md', cols: 1,
      intro: one ? html`<div class="cf-who"><b>Student:</b> ${f0.leadName || '—'}${f0.leadMobile ? html` <span class="mono muted">${f0.leadMobile}</span>` : ''}</div>
          <div class="muted small">${f0.reason || 'Follow-up'}${f0.notes ? html` · ${f0.notes}` : ''} · due ${NL.fmt.dateTime(f0.dueAt)}</div>`
        : html`<div class="cf-who"><b>${list.length} students:</b> ${list.map(x => x.leadName).join(', ')}</div><div class="muted small">The outcome, notes and next follow-up apply to each of them.</div>`,
      fields: [
        { name: 'outcome', label: 'Outcome', type: 'select', required: true, options: OC.CRM_OUTCOMES, placeholder: 'Select Outcome' },
        { name: 'subOutcome', label: 'Sub Outcome', type: 'select', options: [], placeholder: 'Select Sub Outcome' },
        { name: 'completionNote', label: 'Completion notes', type: 'textarea', rows: 3, placeholder: one && f0.notes ? f0.notes + ' — done' : 'What happened on the call? (optional)' },
        { name: 'next', label: 'Next follow-up', type: 'select', options: NEXT.map(([value, label]) => ({ value, label })), placeholder: false, default: '' },
        { name: 'nextAt', label: 'Next follow-up date & time', type: 'datetime', hidden: true }
      ],
      onMount: (m, form) => {
        // Sub Outcome is disabled until an outcome with sub-outcomes is chosen (shared helper from the outcome master).
        const oSel = form.querySelector('[name=outcome]'); const subBox = form.querySelector('[data-field="subOutcome"]');
        oSel.classList.add('crm-outcome-select'); subBox.querySelector('select').classList.add('crm-sub-outcome-select');
        m.el.querySelector('.modal').classList.add('cf-modal');
        outcomePair(form);
        const sel = form.querySelector('[name=next]'); const box = form.querySelector('[data-field="nextAt"]');
        const sync = () => { box.hidden = sel.value !== 'custom'; if (!box.hidden && !box.querySelector('input').value) box.querySelector('input').value = NL.fmt.dateLocalInput(new Date(Date.now() + 86400000)); };
        sel.addEventListener('change', sync); sync();
      },
      validate: (v) => Object.assign({}, v.next === 'custom' && (!v.nextAt || new Date(v.nextAt) < new Date()) ? { nextAt: 'Pick a time in the future' } : {},
        subsFor(v.outcome).length && !v.subOutcome ? { subOutcome: 'Select a sub outcome' } : {}),
      submitLabel: 'Complete & Save',
      onSubmit: async (v) => {
        const nextAt = v.next === 'custom' ? v.nextAt : v.next ? new Date(Date.now() + Number(v.next) * 86400000).toISOString() : '';
        for (const f of list) await S.followupService.complete(f.id, v.outcome, v.completionNote, nextAt, subsFor(v.outcome).length ? v.subOutcome : '');
        return { next: !!nextAt };
      } });
    if (!res) return false;
    ui.toast(`${one ? 'Follow-up' : list.length + ' follow-ups'} completed${res.next ? ' — next follow-up scheduled' : ''}`);
    return changed('followups');
  }

  /* ---------- Call Feedback Form (for a completed callback / follow-up) ---------- */
  const FEEDBACK_OPTIONS = { spokeWith: ['Student', 'Parent / Guardian', 'Other'], interest: ['Hot', 'Warm', 'Cold', 'Not interested'],
    nextAction: ['Call back', 'Send course details / brochure', 'Counselling session', 'Start application', 'Collect documents', 'Fee discussion', 'No further action'] };
  async function callFeedback(f, o){
    o = o || {};
    const s = st.settings();
    const res = await ui.formModal({ title: `Call Feedback Form · ${f.leadName || ''}`, size: 'lg',
      intro: html`${o.afterComplete ? html`<b>Follow-up completed.</b> Record how the call went — or close this and add it later from the follow-up.<br>` : ''}
        <span class="muted">${f.reason || 'Callback'} · due ${NL.fmt.dateTime(f.dueAt)}${f.leadMobile ? html` · <span class="mono">${f.leadMobile}</span>` : ''}</span>`,
      fields: [
        { name: 'outcome', label: 'Outcome', type: 'select', required: true, options: NL.outcomes.CRM_OUTCOMES, placeholder: 'Select Outcome' },
        { name: 'subOutcome', label: 'Sub Outcome', type: 'select', options: [], placeholder: 'Select Sub Outcome' },
        { name: 'spokeWith', label: 'Spoke with', type: 'select', options: FEEDBACK_OPTIONS.spokeWith, default: 'Student', placeholder: false },
        { name: 'interest', label: 'Interest level', type: 'select', options: FEEDBACK_OPTIONS.interest },
        { name: 'courseDiscussed', label: 'Course discussed', type: 'select', options: () => st.options.courseNames(), placeholder: '— None / not discussed —' },
        { name: 'summary', label: 'Call summary', type: 'textarea', rows: 4, required: true, full: true, rules: [{ min: 3 }], placeholder: 'What did the student say? What was agreed?' },
        { name: 'concerns', label: 'Concerns / objections', type: 'textarea', rows: 2, full: true, placeholder: 'Fees, eligibility, location, timing… (optional)' },
        { name: 'nextAction', label: 'Next action', type: 'select', options: FEEDBACK_OPTIONS.nextAction },
        { name: 'duration', label: 'Call duration (minutes)', type: 'number', min: 0, max: 600, rules: ['amount'] },
        { name: 'nextFollowupAt', label: 'Next follow-up', type: 'datetime', help: 'Leave empty if no further callback is needed' },
        { name: 'followupReason', label: 'Next follow-up reason', type: 'select', options: s.followupReasons, default: 'Callback', placeholder: false },
        { name: 'stage', label: 'Update lead stage', type: 'select', options: s.leadStages.concat(s.negativeStages), placeholder: '— Keep current stage —', full: true, default: '' }
      ],
      onMount: (m, form) => outcomePair(form),
      validate: (v) => Object.assign({}, v.nextFollowupAt && new Date(v.nextFollowupAt) < new Date() ? { nextFollowupAt: 'Must be in the future' } : {},
        NL.outcomes.subOutcomesFor(v.outcome).length && !v.subOutcome ? { subOutcome: 'Select a sub outcome' } : {}),
      submitLabel: 'Save call feedback',
      onSubmit: (v) => S.followupService.feedback(f.id, Object.assign({}, v, { duration: v.duration === '' ? undefined : Math.round(Number(v.duration) * 60) })) });
    if (res){ ui.toast('Call feedback saved'); return changed('followups'); }
    return false;
  }
  function viewFeedback(f){
    const fb = f.feedback || {};
    ui.modal({ title: `Call feedback · ${f.leadName || ''}`, size: 'md',
      body: html`<div class="dh-meta">${ui.badge(NL.outcomes.label(fb.outcome, fb.subOutcome) || fb.legacyDisposition || '—', 'blue')}${fb.interest ? ui.badge(fb.interest, fb.interest === 'Hot' ? 'red' : fb.interest === 'Warm' ? 'amber' : 'gray') : ''}</div>
        ${NL.w.detailGrid([['Recorded', NL.fmt.dateTime(f.feedbackAt)], ['By', st.userName(f.feedbackBy) || '—'], ['Spoke with', fb.spokeWith || '—'], ['Course discussed', fb.courseDiscussed || '—'],
          ['Next action', fb.nextAction || '—'], ['Next follow-up', fb.nextFollowupAt ? NL.fmt.dateTime(fb.nextFollowupAt) : '—'], ['Stage updated to', fb.stage || '—']])}
        <h4>Summary</h4><p>${fb.summary}</p>${fb.concerns ? html`<h4>Concerns / objections</h4><p>${fb.concerns}</p>` : ''}` });
  }
  async function snoozeFollowup(f, minutes){ try { await S.followupService.snooze(f.id, minutes || 15); ui.toast(`Snoozed ${minutes || 15} minutes`); return changed('followups'); } catch (e){ return fail(e); } }
  async function cancelFollowup(f){
    const r = await ui.confirm({ title: 'Cancel follow-up', message: `Cancel the follow-up with ${f.leadName || 'this lead'}?`, danger: true, confirmText: 'Cancel follow-up', reason: true, reasonLabel: 'Reason (optional)' });
    if (!r) return false;
    try { await S.followupService.cancel(f.id, r.reason); ui.toast('Follow-up cancelled'); return changed('followups'); } catch (e){ return fail(e); }
  }

  async function addNote(ref){
    const res = await ui.formModal({ title: 'Add counselling note', cols: 1, size: 'md',
      fields: [{ name: 'type', label: 'Note type', type: 'select', options: ['Counselling', 'General', 'Call', 'Document', 'Payment'], default: 'Counselling', placeholder: false }, { name: 'text', label: 'Note', type: 'textarea', rows: 5, required: true, rules: [{ min: 3 }] }],
      submitLabel: 'Add note', onSubmit: (v) => S.noteService.create(Object.assign(v, ref)) });
    if (res){ ui.toast('Note added'); return changed('notes'); }
    return false;
  }

  async function changeLeadStage(lead){
    const s = st.settings();
    const res = await ui.formModal({ title: `Change stage · ${lead.name}`, cols: 1, size: 'sm', fields: [{ name: 'stage', label: 'New stage', type: 'select', required: true, options: s.leadStages.concat(s.negativeStages), default: lead.stage, placeholder: false }],
      submitLabel: 'Update stage',
      onSubmit: async (v) => {
        if (v.stage === lead.stage) return true;
        const neg = s.negativeStages.includes(v.stage);
        const ok = await ui.confirm({ title: 'Change admission status', message: `Change ${lead.name} from “${lead.stage}” to “${v.stage}”?`, danger: neg, confirmText: 'Change stage' });
        if (!ok) return false;
        return S.leadService.update(lead.id, { stage: v.stage });
      } });
    if (res){ ui.toast('Stage updated'); return changed('leads'); }
    return false;
  }

  async function convertLead(lead){
    if (lead.studentId){ location.hash = '#/students/' + lead.studentId; return false; }
    const ok = await ui.confirm({ title: 'Convert to student', message: `Create a student profile for ${lead.name}?`, detail: 'The lead stays in the CRM with its calls, notes, follow-ups, source, campaign and assignment history. A Student ID will be generated.', confirmText: 'Convert' });
    if (!ok) return false;
    try {
      let res;
      try { res = await S.leadService.convert(lead.id); }
      catch (err){
        if (err.status !== 409) throw err;
        const pick = await duplicateDialog(err.details.duplicates, { allowMerge: false });
        if (!pick) return false;
        if (pick.choice === 'view'){ location.hash = '#/students/' + pick.dup.id; return false; }
        res = await S.leadService.convert(lead.id, pick.choice === 'merge' ? { linkStudentId: pick.dup.id } : { force: true });
      }
      ui.toast(`Student ${res.student.id} ${res.existing ? 'linked' : 'created'}`); changed('students');
      return res.student;
    } catch (e){ return fail(e); }
  }

  /* ---------- Applications ---------- */
  async function createApplication(o){
    o = o || {}; await st.loadMasters();
    let studentId = o.studentId;
    if (!studentId && o.lead){
      if (o.lead.studentId) studentId = o.lead.studentId;
      else { const sres = await convertLead(o.lead); if (!sres) return false; studentId = sres.id; }
    }
    let students = [];
    if (!studentId){ try { students = (await S.studentService.list({ pageSize: 200, sort: 'fullName', dir: 'asc' })).items; } catch (e){ return fail(e); } }
    const pref = o.lead || o.student || {};
    const res = await ui.formModal({ title: 'Create application', size: 'md', cols: 1,
      fields: [
        studentId ? null : { name: 'studentId', label: 'Student', type: 'select', required: true, options: students.map(s => ({ value: s.id, label: `${s.fullName} · ${s.id} · ${s.mobile}` })) },
        { name: 'universityId', label: 'University', type: 'select', required: true, options: () => opts.universities(), default: pref.universityId || pref.prefUniversityId },
        { name: 'campusId', label: 'Campus', type: 'select', dependsOn: 'universityId', options: (v) => opts.campuses(v.universityId), default: pref.campusId || pref.prefCampusId },
        { name: 'courseId', label: 'Course', type: 'select', required: true, dependsOn: ['universityId', 'campusId'], options: (v) => opts.courses(v.universityId, v.campusId), default: pref.courseId || pref.prefCourseId },
        { name: 'applicationDate', label: 'Application date', type: 'date', default: NL.fmt.ymd(new Date()) },
        { name: 'applicationNo', label: 'University application number', placeholder: 'Auto-generated if blank' }
      ].filter(Boolean),
      intro: 'A student can apply to multiple universities and courses. The required document checklist is created automatically.',
      submitLabel: 'Create application',
      onSubmit: (v) => withDuplicates((x) => S.applicationService.create(x), Object.assign(v, { studentId: studentId || v.studentId }), { allowMerge: false }) });
    if (res && res.application){ ui.toast(`Application ${res.application.id} created`); changed('applications'); return res.application; }
    return false;
  }
  async function changeAppStage(app){
    const s = st.settings(); const privileged = ['University Review', 'Admission Confirmed', 'Enrollment Completed', 'Rejected'];
    const list = s.applicationStages.filter(x => st.can('applications.stage') || !privileged.includes(x));
    const res = await ui.formModal({ title: `Update application · ${app.id}`, cols: 1, size: 'md',
      fields: [{ name: 'stage', label: 'Application stage', type: 'select', options: list, default: app.stage, placeholder: false, required: true }, { name: 'remarks', label: 'Remarks', type: 'textarea' }],
      intro: st.can('applications.stage') ? '' : 'Final decisions (University Review, Admission Confirmed, Enrollment, Rejected) require the “Change admission status” permission.',
      submitLabel: 'Update status',
      onSubmit: async (v) => {
        if (v.stage === app.stage) return true;
        const ok = await ui.confirm({ title: 'Change admission status', message: `Change ${app.id} (${app.studentName || ''}) from “${app.stage}” to “${v.stage}”?`, danger: ['Rejected', 'Cancelled'].includes(v.stage), confirmText: 'Change status' });
        if (!ok) return false;
        return S.applicationService.changeStage(app.id, v.stage, v.remarks);
      } });
    if (res){ ui.toast('Application status updated'); return changed('applications'); }
    return false;
  }

  /* ---------- Documents ---------- */
  async function uploadDocument(o){
    const s = st.settings(); const U = NL.config.UPLOAD;
    const res = await ui.formModal({ title: `Upload document${o.studentName ? ' · ' + o.studentName : ''}`, cols: 1, size: 'md',
      intro: html`Accepted: <b>PDF, JPG, PNG</b> · max <b>${NL.fmt.bytes(U.MAX_BYTES)}</b>. In demo mode only file metadata is stored; production streams the file to secure storage via <code>POST /api/documents</code>.`,
      fields: [{ name: 'type', label: 'Document type', type: 'select', required: true, options: s.documentTypes, default: o.type }, { name: 'file', label: 'File', type: 'file', accept: '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png', required: true }, { name: 'remarks', label: 'Remarks', type: 'textarea' }],
      validate: (v) => {
        const f = v.file; if (!f) return { file: 'Choose a file' };
        const ext = f.name.split('.').pop().toLowerCase();
        if (!U.EXTENSIONS.includes(ext) || (f.type && !U.ACCEPT.includes(f.type))) return { file: 'Only PDF, JPG or PNG files are allowed' };
        if (f.size > U.MAX_BYTES) return { file: `File is ${NL.fmt.bytes(f.size)} — maximum is ${NL.fmt.bytes(U.MAX_BYTES)}` };
        if (!f.size) return { file: 'File is empty' };
        return {};
      },
      submitLabel: 'Upload',
      onSubmit: (v) => S.documentService.upload({ studentId: o.studentId, applicationId: o.applicationId, type: v.type, fileName: v.file.name, fileSize: v.file.size, mime: v.file.type, remarks: v.remarks }) });
    if (res){ ui.toast('Document uploaded'); return changed('documents'); }
    return false;
  }
  async function reviewDocument(d, status){
    if (status === 'Rejected'){
      const r = await ui.confirm({ title: 'Reject document', message: `Reject ${d.type} for ${d.studentName}?`, detail: 'The counsellor is notified with your reason.', danger: true, confirmText: 'Reject', reason: true, reasonRequired: true, reasonLabel: 'Rejection reason', reasonPlaceholder: 'e.g. Image is blurred — please re-upload a clear scan' });
      if (!r) return false;
      try { await S.documentService.review(d.id, 'Rejected', r.reason); ui.toast('Document rejected'); return changed('documents'); } catch (e){ return fail(e); }
    }
    try { await S.documentService.review(d.id, status); ui.toast(`Document marked ${status.toLowerCase()}`); return changed('documents'); } catch (e){ return fail(e); }
  }

  /* ---------- Payments ---------- */
  async function addPayment(o){
    o = o || {}; const s = st.settings(); let apps = [];
    if (!o.application){ try { apps = (await S.applicationService.list({ pageSize: 300, sort: 'createdAt', studentId: o.studentId || undefined })).items; } catch (e){ return fail(e); } }
    const res = await ui.formModal({ title: 'Record payment', size: 'lg',
      fields: [
        o.application ? null : { name: 'applicationId', label: 'Application', type: 'select', required: true, full: true, options: apps.map(a => ({ value: a.id, label: `${a.id} · ${a.studentName} · ${a.courseName} (${a.universityName})` })) },
        { name: 'amount', label: 'Amount (₹)', type: 'number', required: true, min: 1, rules: ['positive', { max: 5000000 }], default: o.amount },
        { name: 'type', label: 'Payment type', type: 'select', required: true, options: s.paymentTypes, default: 'Application Fee' },
        { name: 'mode', label: 'Payment mode', type: 'select', required: true, options: s.paymentModes, default: 'UPI' },
        { name: 'transactionId', label: 'Transaction ID', placeholder: 'UTR / reference number' },
        { name: 'paymentDate', label: 'Payment date', type: 'date', required: true, default: NL.fmt.ymd(new Date()), max: NL.fmt.ymd(new Date()) },
        { name: 'status', label: 'Status', type: 'select', required: true, options: ['Successful', 'Pending', 'Initiated', 'Partially Paid', 'Failed'], default: 'Successful', placeholder: false },
        { name: 'remarks', label: 'Remarks', type: 'textarea', full: true }
      ].filter(Boolean),
      intro: o.application ? html`Application <b>${o.application.id}</b> · ${o.application.studentName || ''} · ${o.application.courseName || ''}` : '',
      validate: (v) => ['Successful', 'Partially Paid'].includes(v.status) && v.mode !== 'Cash' && !v.transactionId ? { transactionId: 'Transaction ID is required for successful payments' } : {},
      submitLabel: 'Save payment',
      onSubmit: (v) => S.paymentService.create(Object.assign(v, { applicationId: o.application ? o.application.id : v.applicationId })) });
    if (res){ ui.toast('Payment recorded'); return changed('payments'); }
    return false;
  }
  async function verifyPayment(p){
    if (['Pending', 'Initiated'].includes(p.status)){
      const res = await ui.formModal({ title: `Confirm payment · ${p.id}`, cols: 1, size: 'sm', intro: html`${NL.fmt.money(p.amount)} · ${p.studentName} · ${p.mode}`,
        fields: [{ name: 'transactionId', label: 'Transaction ID', required: p.mode !== 'Cash', default: p.transactionId }], submitLabel: 'Mark successful & verify', onSubmit: (v) => S.paymentService.verify(p.id, v.transactionId) });
      if (res){ ui.toast('Payment verified'); return changed('payments'); } return false;
    }
    const ok = await ui.confirm({ title: 'Verify payment', message: `Verify ${NL.fmt.money(p.amount)} (${p.transactionId || p.mode}) from ${p.studentName}?`, confirmText: 'Verify' });
    if (!ok) return false;
    try { await S.paymentService.verify(p.id); ui.toast('Payment verified'); return changed('payments'); } catch (e){ return fail(e); }
  }
  async function refundPayment(p){
    const r = await ui.confirm({ title: 'Refund payment', message: `Refund ${NL.fmt.money(p.amount)} to ${p.studentName}?`, detail: 'This marks the payment as refunded and recalculates the application’s payment status.', danger: true, confirmText: 'Refund', reason: true, reasonRequired: true, reasonLabel: 'Refund reason' });
    if (!r) return false;
    try { await S.paymentService.refund(p.id, r.reason); ui.toast('Payment refunded'); return changed('payments'); } catch (e){ return fail(e); }
  }
  async function markPaymentFailed(p){
    const r = await ui.confirm({ title: 'Mark payment failed', message: `Mark ${p.id} (${NL.fmt.money(p.amount)}) as failed?`, danger: true, confirmText: 'Mark failed', reason: true, reasonLabel: 'Remarks' });
    if (!r) return false;
    try { await S.paymentService.update(p.id, { status: 'Failed', remarks: r.reason }); ui.toast('Payment marked failed'); return changed('payments'); } catch (e){ return fail(e); }
  }

  async function archiveLeads(ids, restore){
    const ok = await ui.confirm({ title: restore ? 'Restore leads' : 'Archive leads', message: `Are you sure you want to ${restore ? 'restore' : 'archive'} ${ids.length} lead${ids.length === 1 ? '' : 's'}?`, detail: restore ? '' : 'Archived leads are hidden from working lists but keep their full history and can be restored.', danger: !restore, confirmText: restore ? 'Restore' : 'Archive' });
    if (!ok) return false;
    try { await S.leadService.bulk(ids, restore ? 'restore' : 'archive'); ui.toast(`${ids.length} lead${ids.length === 1 ? '' : 's'} ${restore ? 'restored' : 'archived'}`); return changed('leads'); } catch (e){ return fail(e); }
  }
  async function duplicateCheck(lead){
    let d; try { d = await S.leadService.duplicates(lead.id); } catch (e){ return fail(e); }
    if (!d.length){ ui.toast('No duplicates found for this mobile/email', 'info'); return false; }
    const leadsOnly = d.filter(x => x.kind === 'lead');
    const pick = await duplicateDialog(d, { allowMerge: leadsOnly.length > 0 });
    if (!pick || pick.choice === 'create') return false;
    if (pick.choice === 'view'){ location.hash = linkFor(pick.dup); return false; }
    if (pick.dup.kind !== 'lead'){ ui.toast('Only leads can be merged here — open the student to review', 'warn'); return false; }
    const ok = await ui.confirm({ title: 'Merge leads', message: `Merge ${pick.dup.id} into ${lead.id}?`, detail: `Calls, notes, follow-ups and applications move to ${lead.id}. ${pick.dup.id} is archived as “Duplicate”.`, danger: true, confirmText: 'Merge' });
    if (!ok) return false;
    try { await S.leadService.merge(lead.id, pick.dup.id); ui.toast('Leads merged'); return changed('leads'); } catch (e){ return fail(e); }
  }

  function exportRows(format, rows, cols, name){ NL.file.exportData(format, rows, cols, name); }

  NL.actions = { ASSIGN_METHODS, stateOptions, wireCityState, duplicateDialog, withDuplicates, leadForm, assignLeads, logCall, scheduleFollowup, rescheduleFollowup, completeFollowup, callFeedback, viewFeedback, snoozeFollowup, cancelFollowup,
    addNote, changeLeadStage, convertLead, createApplication, changeAppStage, uploadDocument, reviewDocument, addPayment, verifyPayment, refundPayment, markPaymentFailed, archiveLeads, duplicateCheck,
    exportRows, fail, changed };
})();
