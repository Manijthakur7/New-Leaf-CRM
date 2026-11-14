/* Lead Import — upload (CSV/XLSX/XLS) → column mapping → duplicate detection
   → options → batched import with progress → results + error report. */
(function(){
  const { html, raw, toHtml, $, $$ } = NL.util;
  const S = NL.services, st = NL.store, ui = NL.ui, w = NL.w, F = NL.fmt;

  const FIELDS = [
    ['name', 'Student Name'], ['mobile', 'Mobile'], ['whatsapp', 'WhatsApp'], ['email', 'Email'], ['source', 'Lead Source'], ['campaign', 'Campaign'],
    ['university', 'University'], ['campus', 'Campus'], ['course', 'Course'], ['state', 'State'], ['city', 'City'], ['qualification', 'Qualification'],
    ['passingYear', 'Passing Year'], ['priority', 'Priority'], ['counsellor', 'Assigned Counsellor'], ['studentId', 'Student ID'], ['remarks', 'Remarks']
  ];
  // Header dictionary (extends the original LeafPulse HEADER_MAP)
  const HEADER_MAP = {
    'name': 'name', 'student name': 'name', 'lead name': 'name', 'customer name': 'name', 'full name': 'name', 'candidate name': 'name',
    'mobile': 'mobile', 'mobile number': 'mobile', 'mobile no': 'mobile', 'mobile no.': 'mobile', 'phone': 'mobile', 'phone number': 'mobile', 'contact': 'mobile', 'contact number': 'mobile', 'number': 'mobile',
    'whatsapp': 'whatsapp', 'whatsapp number': 'whatsapp', 'email': 'email', 'email id': 'email', 'email address': 'email', 'e-mail': 'email',
    'source': 'source', 'lead source': 'source', 'lead origin': 'source', 'origin': 'source', 'campaign': 'campaign', 'campaign name': 'campaign',
    'university': 'university', 'university name': 'university', 'campus': 'campus', 'course': 'course', 'program': 'course', 'programme': 'course', 'preferred course': 'course',
    'state': 'state', 'state name': 'state', 'state/ut': 'state', 'state / ut': 'state', 'region': 'state', 'province': 'state', 'residence state': 'state', 'home state': 'state', 'city': 'city', 'city name': 'city', 'district': 'city', 'location': 'city', 'qualification': 'qualification', 'highest qualification': 'qualification', 'passing year': 'passingYear', 'year of passing': 'passingYear',
    'priority': 'priority', 'counsellor': 'counsellor', 'counselor': 'counsellor', 'assigned counsellor': 'counsellor', 'agent': 'counsellor', 'agent name': 'counsellor', 'agent code': 'counsellor', 'agent code or agent name': 'counsellor', 'caller': 'counsellor',
    'student id': 'studentId', 'remarks': 'remarks', 'remark': 'remarks', 'notes': 'remarks', 'comments': 'remarks'
  };

  /* "Who will call these leads?" — agents grouped by team; the new leads are split evenly between the ticked agents */
  function agentPicker(newCount){
    const groups = new Map();
    st.options.assignable().forEach(o => {
      const u = st.userById(o.value) || {}; const t = u.teamId && st.team(u.teamId);
      const key = t ? t.id : '_none';
      if (!groups.has(key)) groups.set(key, { id: key, name: t ? t.name : 'No team', agents: [] });
      groups.get(key).agents.push(o);
    });
    if (!groups.size) return html`<div class="field full" data-f="agents" hidden><div class="form-alert">No active agents are available. Add counsellors or telecallers under Users first.</div></div>`;
    return html`<div class="field full" data-f="agents" hidden>
      <div class="row-between"><label>Who will call these leads? <span class="req">*</span></label>
        <span><button type="button" class="btn-ghost btn-sm" data-agents="all">Select all</button> <button type="button" class="btn-ghost btn-sm" data-agents="none">Clear</button></span></div>
      <div class="agent-pick">${Array.from(groups.values()).map(g => html`<fieldset class="agent-group"><legend><label><input type="checkbox" data-team-toggle="${g.id}"> ${g.name} <span class="muted">(${g.agents.length})</span></label></legend>
        ${g.agents.map(a => html`<label class="agent-chip"><input type="checkbox" name="agentIds" value="${a.value}" data-team="${g.id}"> ${a.label}</label>`)}</fieldset>`)}</div>
      <div class="agent-split" id="agentSplit">${splitText(newCount, 0)}</div></div>`;
  }
  function splitText(n, k){
    if (!k) return 'Tick the agents who should call these leads.';
    const each = Math.floor(n / k), extra = n % k;
    return `${F.num(n)} new lead${n === 1 ? '' : 's'} → ${k} agent${k === 1 ? '' : 's'} · ${F.num(each)} each${extra ? ` (${extra} ${extra === 1 ? 'agent gets' : 'agents get'} 1 extra)` : ''}`;
  }
  function wireAgentPicker(f, newCount){
    const boxes = () => $$('[name=agentIds]', f);
    const refresh = () => {
      $$('[data-team-toggle]', f).forEach(t => { const mine = boxes().filter(b => b.dataset.team === t.dataset.teamToggle); const on = mine.filter(b => b.checked).length;
        t.checked = on === mine.length; t.indeterminate = on > 0 && on < mine.length; });
      const split = $('#agentSplit', f); if (split) split.textContent = splitText(newCount, boxes().filter(b => b.checked).length);
    };
    f.addEventListener('change', (e) => {
      const t = e.target.closest('[data-team-toggle]');
      if (t) boxes().filter(b => b.dataset.team === t.dataset.teamToggle).forEach(b => (b.checked = t.checked));
      if (t || e.target.name === 'agentIds') refresh();
    });
    f.addEventListener('click', (e) => { const b = e.target.closest('[data-agents]'); if (!b) return; boxes().forEach(x => (x.checked = b.dataset.agents === 'all')); refresh(); });
  }

  function render(el){
    const W = { step: 1, defaultSource: '', file: null, header: [], rows: [], map: {}, preview: null, mapped: [], result: null };
    el.innerHTML = toHtml(html`${w.pageHead({ title: 'Lead Import', sub: 'Bulk-import leads from CSV or Excel with column mapping and duplicate detection', actions: [{ label: 'Download template', icon: '⤓', action: 'tpl' }] })}
      <div class="wizard-steps" id="wzSteps"></div><div class="card"><div class="card-body" id="wzBody"></div></div>`);
    const body = $('#wzBody', el);
    const steps = ['Upload file', 'Map columns', 'Review duplicates', 'Import'];
    function drawSteps(){ $('#wzSteps', el).innerHTML = toHtml(steps.map((s, i) => html`<div class="wz ${i + 1 < W.step ? 'done' : i + 1 === W.step ? 'current' : ''}"><span>${i + 1 < W.step ? '✓' : i + 1}</span>${s}</div>`)); }

    function stepUpload(){
      body.innerHTML = toHtml(html`<label class="dropzone" id="dz"><input type="file" id="impFile" accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>
        <div class="dz-ico">📥</div><div class="big">Drop a CSV, XLSX or XLS file here</div><div class="muted">or click to browse · first row must be the header · max 20,000 rows</div></label>
        <div class="muted small pad">Recognised columns are mapped automatically (e.g. <i>Name → Student Name, Phone → Mobile, Agent → Assigned Counsellor</i>). You can adjust the mapping in the next step.</div>`);
      const inp = $('#impFile', body), dz = $('#dz', body);
      inp.onchange = () => inp.files[0] && readFile(inp.files[0]);
      ['dragover', 'dragenter'].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
      ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
      dz.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) readFile(f); });
    }
    async function readFile(file){
      body.innerHTML = toHtml(ui.skeleton(4, `Reading ${file.name}…`));
      try {
        const rows = await NL.file.readRows(file);
        if (rows.length < 2) throw new Error('The file has no data rows below the header.');
        if (rows.length > 20001) throw new Error('This file has more than 20,000 rows. Split it into smaller files.');
        W.file = file; W.header = rows[0].map((h, i) => h || `Column ${i + 1}`); W.rows = rows.slice(1);
        W.map = {}; W.header.forEach((h, i) => { const k = HEADER_MAP[String(h).trim().toLowerCase()]; if (k && !Object.values(W.map).includes(k)) W.map[i] = k; });
        if (!Object.values(W.map).includes('mobile')){ // fall back to the column that looks most like phone numbers
          let best = -1, score = 0; W.header.forEach((h, i) => { const sc = W.rows.slice(0, 20).filter(r => NL.validate.isMobile(r[i])).length; if (sc > score && W.map[i] === undefined){ score = sc; best = i; } });
          if (best > -1) W.map[best] = 'mobile';
        }
        W.step = 2; drawSteps(); stepMap();
      } catch (e){ ui.toast(e.message, 'error'); stepUpload(); }
    }
    function stepMap(){
      body.innerHTML = toHtml(html`<div class="row-between"><div><b>${W.file.name}</b> · ${F.num(W.rows.length)} rows · ${W.header.length} columns</div><button class="btn-ghost btn-sm" data-wz="restart">Choose another file</button></div>
        <div class="table-wrap flat"><table class="table compact"><thead><tr><th>File column</th><th>→</th><th>CRM field</th><th>Sample values</th></tr></thead>
        <tbody>${W.header.map((h, i) => html`<tr><td class="name">${h}</td><td>→</td><td><select data-map="${i}"><option value="">— Ignore —</option>${FIELDS.map(([k, l]) => html`<option value="${k}" ${W.map[i] === k ? raw('selected') : ''}>${l}</option>`)}</select></td>
          <td class="muted small">${W.rows.slice(0, 3).map(r => r[i]).filter(Boolean).join(' · ') || '—'}</td></tr>`)}</tbody></table></div>
        <div class="form-alert" id="mapErr" hidden></div>
        <div class="wz-foot"><button class="btn-ghost" data-wz="back">‹ Back</button><button class="btn-primary" data-wz="check">Check for duplicates ›</button></div>`);
    }
    async function stepReview(){
      const vals = Object.values(W.map);
      const dupField = vals.find((v, i) => vals.indexOf(v) !== i);
      if (dupField){ const e = $('#mapErr', body); e.hidden = false; e.textContent = `“${FIELDS.find(f => f[0] === dupField)[1]}” is mapped to more than one column.`; return; }
      if (!vals.includes('mobile') || !vals.includes('name')){ const e = $('#mapErr', body); e.hidden = false; e.textContent = 'Map both Student Name and Mobile — they are required for every lead.'; return; }
      W.mapped = W.rows.map((r, ri) => { const o = { __row: ri + 2 }; Object.entries(W.map).forEach(([i, k]) => { o[k] = (r[i] == null ? '' : String(r[i])).trim(); }); return o; });
      W.step = 3; drawSteps();
      body.innerHTML = toHtml(ui.skeleton(4, 'Checking mobile, email and Student ID against existing records…'));
      try {
        const res = { results: [], summary: { total: 0, new: 0, duplicate: 0, invalid: 0 } };
        for (let i = 0; i < W.mapped.length; i += 1000){
          const r = await S.leadService.importPreview(W.mapped.slice(i, i + 1000), W.defaultSource);
          r.results.forEach(x => res.results.push(Object.assign(x, { index: x.index + i })));
          ['total', 'new', 'duplicate', 'invalid'].forEach(k => (res.summary[k] += r.summary[k]));
        }
        W.preview = res; drawReview();
      } catch (e){ body.innerHTML = toHtml(ui.errorView(e, 'the duplicate check')); const b = $('[data-action=retry]', body); if (b) b.onclick = stepReview; }
    }
    function drawReview(){
      const s = W.preview.summary; const bad = W.preview.results.filter(r => r.status !== 'new').slice(0, 100);
      const canAssign = st.can('leads.assign') && st.scope() !== 'own'; const hasCounsellorCol = Object.values(W.map).includes('counsellor'); const hasSourceCol = Object.values(W.map).includes('source');
      body.innerHTML = toHtml(html`<div class="import-summary">
          <div class="is-box good"><b>${F.num(s.new)}</b><span>New records</span></div><div class="is-box warn"><b>${F.num(s.duplicate)}</b><span>Duplicate records</span></div><div class="is-box bad"><b>${F.num(s.invalid)}</b><span>Invalid records</span></div></div>
        ${bad.length ? html`<details class="pad" ${s.invalid + s.duplicate <= 20 ? raw('open') : ''}><summary>Show duplicate / invalid rows (${F.num(s.invalid + s.duplicate)})</summary><div class="table-wrap flat"><table class="table compact"><thead><tr><th>Row</th><th>Name</th><th>Mobile</th><th>Result</th><th>Reason</th><th>Existing record</th></tr></thead>
          <tbody>${bad.map(r => { const m = W.mapped[r.index]; return html`<tr><td class="mono">${m.__row}</td><td>${m.name || '—'}</td><td class="mono">${m.mobile || '—'}</td><td>${ui.badge(r.status === 'invalid' ? 'Rejected' : 'Duplicate')}</td><td>${r.reason}</td><td class="mono">${r.matchId ? html`<a href="#/leads/${r.matchId}" target="_blank">${r.matchId}</a>` : '—'}</td></tr>`; })}</tbody></table></div></details>` : ''}
        <form class="form-grid" id="impOpts">
          <div class="field"><label>Lead source for rows without one <span class="req">*</span></label><select name="defaultSource" data-src><option value="">${hasSourceCol ? '— Use file column only —' : '— Select a source —'}</option>${st.settings().leadSources.map(x => html`<option value="${x}" ${W.defaultSource === x ? raw('selected') : ''}>${x}</option>`)}</select><div class="field-help">${hasSourceCol ? 'Rows with an empty “Lead Source” cell get this source; without it those rows are rejected.' : 'Your file has no Lead Source column, so choose where these leads came from (e.g. Facebook, Instagram).'}</div></div>
          <div class="field"><label>Duplicate records</label><select name="duplicateMode"><option value="skip">Skip duplicates</option><option value="update">Update existing records</option></select><div class="field-help">New records are always imported. Invalid rows are never imported.</div></div>
          ${canAssign ? html`<div class="field"><label>Assign new leads</label><select name="method"><option value="none">Leave unassigned</option>${hasCounsellorCol ? html`<option value="file" selected>Use file's “Assigned Counsellor” column</option>` : ''}<option value="agents" ${hasCounsellorCol ? '' : raw('selected')}>Distribute among selected agents — choose who calls</option>${NL.actions.ASSIGN_METHODS.map(m => html`<option value="${m.value}">${m.label}</option>`)}</select></div>
            ${agentPicker(s.new)}
            <div class="field" data-f="counsellorId" hidden><label>Counsellor</label><select name="counsellorId"><option value="">— Select —</option>${st.options.assignable().map(o => html`<option value="${o.value}">${o.label}</option>`)}</select></div>
            <div class="field" data-f="teamId" hidden><label>Team</label><select name="teamId"><option value="">— Any —</option>${st.options.teams().map(o => html`<option value="${o.value}">${o.label}</option>`)}</select></div>`
            : html`<div class="field"><label>Assignment</label><div class="muted small">Imported leads will be assigned to you.</div></div>`}
        </form>
        <div class="form-alert" id="optErr" hidden></div>
        <div class="wz-foot"><button class="btn-ghost" data-wz="back">‹ Back to mapping</button><button class="btn-primary" data-wz="import" ${s.new + s.duplicate === 0 ? raw('disabled') : ''}>Import ${F.num(s.new)} new lead${s.new === 1 ? '' : 's'} ›</button></div>`);
      const f = $('#impOpts', body); const m = f.querySelector('[name=method]');
      const sync = () => { if (!m) return; f.querySelector('[data-f=counsellorId]').hidden = m.value !== 'manual'; f.querySelector('[data-f=teamId]').hidden = !['round_robin', 'team'].includes(m.value); f.querySelector('[data-f=agents]').hidden = m.value !== 'agents'; };
      if (m) m.onchange = sync; sync();
      if (m) wireAgentPicker(f, s.new);
      // Changing the fallback source re-checks the file, so rows rejected for "Lead source missing" are counted again.
      f.querySelector('[name=defaultSource]').onchange = (e) => { W.defaultSource = e.target.value; stepReview(); };
      f.querySelector('[name=duplicateMode]').onchange = (e) => { $('[data-wz=import]', body).textContent = e.target.value === 'update' ? `Import ${F.num(s.new)} new & update ${F.num(s.duplicate)} existing ›` : `Import ${F.num(s.new)} new leads ›`; };
    }
    async function runImport(){
      const f = $('#impOpts', body); const g = (n) => { const x = f.querySelector(`[name=${n}]`); return x ? x.value : ''; };
      const assignment = { method: g('method') || 'none', counsellorId: g('counsellorId'), teamId: g('teamId') };
      const err = $('#optErr', body);
      if (assignment.method === 'manual' && !assignment.counsellorId){ err.hidden = false; err.textContent = 'Pick a counsellor for manual assignment.'; return; }
      if (assignment.method === 'team' && !assignment.teamId && st.scope() === 'all'){ err.hidden = false; err.textContent = 'Pick a team for team-based assignment.'; return; }
      if (assignment.method === 'agents'){
        assignment.agentIds = $$('[name=agentIds]:checked', f).map(x => x.value); assignment.offset = 0;
        if (!assignment.agentIds.length){ err.hidden = false; err.textContent = 'Tick at least one agent who will call these leads.'; return; }
      }
      const duplicateMode = g('duplicateMode');
      const rows = W.mapped.filter((r, i) => W.preview.results[i].status === 'new' || (duplicateMode === 'update' && W.preview.results[i].status === 'duplicate'));
      const who = assignment.method === 'agents' ? ` New leads will be split evenly between ${assignment.agentIds.length} agent${assignment.agentIds.length === 1 ? '' : 's'}.` : '';
      const ok = await ui.confirm({ title: 'Start import', message: `Import ${F.num(rows.length)} row${rows.length === 1 ? '' : 's'} from ${W.file.name}?${who}`, detail: 'Every created or updated lead is written to the audit log.', confirmText: 'Import' });
      if (!ok) return;
      W.step = 4; drawSteps();
      const batchId = 'IMP-' + Date.now().toString(36).toUpperCase(); const total = rows.length; const out = { created: 0, updated: 0, skipped: 0, invalid: 0, errors: [], distribution: {} };
      const prog = () => html`<div class="progress-wrap"><div class="big">Importing… ${F.num(Math.min(done, total))} / ${F.num(total)}</div><div class="progress"><span style="width:${total ? done / total * 100 : 100}%"></span></div><div class="muted small">Batch ${batchId} · please keep this tab open</div></div>`;
      let done = 0; body.innerHTML = toHtml(prog());
      try {
        for (let i = 0; i < rows.length; i += 100){
          const r = await S.leadService.importBatch({ rows: rows.slice(i, i + 100), duplicateMode, assignment, defaultSource: W.defaultSource, batchId, fileName: W.file.name });
          ['created', 'updated', 'skipped', 'invalid'].forEach(k => (out[k] += r[k])); out.errors.push(...r.errors);
          Object.entries(r.distribution || {}).forEach(([n, c]) => (out.distribution[n] = (out.distribution[n] || 0) + c));
          if (r.nextOffset != null) assignment.offset = r.nextOffset;
          done = i + 100; body.innerHTML = toHtml(prog());
        }
      } catch (e){ out.errors.push({ row: '-', reason: 'Import stopped: ' + e.message }); ui.toast(e.message, 'error'); }
      out.invalid += W.preview.summary.invalid; out.skipped += duplicateMode === 'skip' ? W.preview.summary.duplicate : 0;
      W.result = out; NL.actions.changed('leads');
      body.innerHTML = toHtml(html`<div class="import-done"><div class="dz-ico">✅</div><div class="big">Import complete</div>
        <div class="import-summary"><div class="is-box good"><b>${F.num(out.created)}</b><span>Created</span></div><div class="is-box"><b>${F.num(out.updated)}</b><span>Updated</span></div><div class="is-box warn"><b>${F.num(out.skipped)}</b><span>Skipped duplicates</span></div><div class="is-box bad"><b>${F.num(out.invalid)}</b><span>Invalid</span></div></div>
        ${Object.keys(out.distribution).length ? html`<div class="pad"><b>Leads assigned per agent</b><div class="table-wrap flat"><table class="table compact"><thead><tr><th>Agent</th><th class="r">Leads to call</th></tr></thead>
          <tbody>${Object.entries(out.distribution).sort((a, b) => b[1] - a[1]).map(([n, c]) => html`<tr><td class="name">${n}</td><td class="r num">${F.num(c)}</td></tr>`)}</tbody></table></div></div>` : ''}
        ${out.errors.length ? html`<p class="muted">${F.num(out.errors.length)} row message${out.errors.length === 1 ? '' : 's'} — download the error report for details.</p>` : ''}
        <div class="wz-foot center">${out.errors.length || W.preview.summary.invalid ? html`<button class="btn-ghost" data-wz="errors">⤓ Error report</button>` : ''}<button class="btn-ghost" data-wz="restart">Import another file</button><a class="btn-primary btn-link" href="#/leads?datePreset=today&segment=all">View imported leads</a></div></div>`);
    }
    function errorReport(){
      const rows = W.preview.results.filter(r => r.status === 'invalid').map(r => ({ row: W.mapped[r.index].__row, reason: r.reason, name: W.mapped[r.index].name, mobile: W.mapped[r.index].mobile }))
        .concat(W.result.errors.map(e => ({ row: e.row, reason: e.reason, name: '', mobile: '' })));
      NL.file.exportCSV(rows, [{ label: 'Row', value: r => r.row }, { label: 'Name', value: r => r.name }, { label: 'Mobile', value: r => r.mobile }, { label: 'Reason', value: r => r.reason }], 'import_errors');
    }

    el.addEventListener('change', (e) => { const s = e.target.closest('[data-map]'); if (s){ if (s.value) W.map[s.dataset.map] = s.value; else delete W.map[s.dataset.map]; } });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-wz]'); const a = e.target.closest('.page-head [data-action=tpl]');
      if (a) NL.file.exportCSV([{ n: 'Ananya Sharma', m: '9876543210', e: 'ananya@example.com', s: 'Website', u: 'Manipal University Online', c: 'MBA', st: 'Punjab', ci: 'Ludhiana', q: 'Graduation', y: '2023', a: '' }],
        [['n', 'Student Name'], ['m', 'Mobile'], ['e', 'Email'], ['s', 'Source'], ['u', 'University'], ['c', 'Course'], ['st', 'State'], ['ci', 'City'], ['q', 'Qualification'], ['y', 'Passing Year'], ['a', 'Assigned Counsellor']].map(([k, l]) => ({ label: l, value: r => r[k] })), 'lead_import_template');
      if (!b) return;
      const act = b.dataset.wz;
      if (act === 'restart'){ W.step = 1; drawSteps(); stepUpload(); }
      if (act === 'back'){ W.step = W.step === 3 ? 2 : 1; drawSteps(); W.step === 2 ? stepMap() : stepUpload(); }
      if (act === 'check') stepReview();
      if (act === 'import') runImport();
      if (act === 'errors') errorReport();
    });
    drawSteps(); stepUpload();
  }

  NL.pages.import = { title: 'Lead Import', perm: 'leads.import', crumbs: ['Operations', 'Lead Import'], render };
})();
