/* Demo API — resource routes. Each route documents the production endpoint it
   stands in for; see README.md for the full API contract. */
(function(){
  const S = NL.demoServer; const H = S.h; const db = H.db; const { HttpError } = S;
  const V = NL.validate;
  const R = (m, p, perm, fn, opts) => S.route(m, p, perm, fn, opts);
  const now = () => new Date().toISOString();
  const lc = (s) => String(s || '').toLowerCase().trim();
  const isNeg = (stage) => H.settings().negativeStages.includes(stage);
  const stageIdx = (stage) => H.settings().leadStages.indexOf(stage);
  const WORKING = NL.rbac.WORKING_ROLES;

  /* ---------- lookups & decorators ---------- */
  function L(){
    const m = (t) => { const x = new Map(); db.all(t).forEach(r => x.set(r.id, r)); return x; };
    return { users: m('users'), unis: m('universities'), campuses: m('campuses'), courses: m('courses'), campaigns: m('campaigns'), teams: m('teams'), students: m('students'), leads: m('leads'), apps: m('applications') };
  }
  const nm = (map, id, f) => { const r = id && map.get(id); return r ? r[f || 'name'] : ''; };
  function fuState(iso){
    if (!iso) return 'none';
    const t = new Date(iso).getTime(); const n = Date.now(); const end = NL.fmt.startOfDay(new Date()).getTime() + 86400000;
    return t < n ? 'overdue' : t < end ? 'today' : 'upcoming';
  }
  function decLead(l, x){
    return Object.assign({}, l, { counsellorName: nm(x.users, l.counsellorId, 'fullName'), teamLeaderName: nm(x.users, l.teamLeaderId, 'fullName'), teamName: nm(x.teams, l.teamId),
      universityName: nm(x.unis, l.universityId), campusName: nm(x.campuses, l.campusId), courseName: nm(x.courses, l.courseId) || l.preferredCourse || '',
      campaignName: nm(x.campaigns, l.campaignId), scoreBand: H.scoreBand(l.score), followupState: fuState(l.nextFollowupAt), zone: NL.geo.zoneOf(l.state), programme: NL.programs.programmeOf(nm(x.courses, l.courseId) || l.preferredCourse || ''),
      outcomeLabel: l.outcome ? NL.outcomes.label(l.outcome) : '', subOutcomeLabel: l.subOutcome ? NL.outcomes.label(l.outcome, l.subOutcome) : '' });
  }
  function decStudent(s, x){
    return Object.assign({}, s, { counsellorName: nm(x.users, s.counsellorId, 'fullName'), prefUniversityName: nm(x.unis, s.prefUniversityId), prefCampusName: nm(x.campuses, s.prefCampusId),
      prefCourseName: nm(x.courses, s.prefCourseId), applicationsCount: db.all('applications').filter(a => a.studentId === s.id).length });
  }
  function decApp(a, x){
    const s = x.students.get(a.studentId) || {};
    return Object.assign({}, a, { studentName: s.fullName || '', studentMobile: s.mobile || '', universityName: nm(x.unis, a.universityId), campusName: nm(x.campuses, a.campusId),
      courseName: nm(x.courses, a.courseId), counsellorName: nm(x.users, a.counsellorId, 'fullName') });
  }
  function decDoc(d, x){
    const s = x.students.get(d.studentId) || {}; const a = x.apps.get(d.applicationId) || {};
    return Object.assign({}, d, { studentName: s.fullName || '', applicationNo: a.applicationNo || '', universityId: a.universityId || '', universityName: nm(x.unis, a.universityId),
      counsellorId: a.counsellorId || s.counsellorId || '', reviewerName: nm(x.users, d.reviewedBy, 'fullName'), uploaderName: nm(x.users, d.uploadedBy, 'fullName') });
  }
  function decPay(p, x){
    const s = x.students.get(p.studentId) || {}; const a = x.apps.get(p.applicationId) || {};
    return Object.assign({}, p, { studentName: s.fullName || '', applicationNo: a.applicationNo || '', universityName: nm(x.unis, p.universityId), courseName: nm(x.courses, p.courseId),
      counsellorId: a.counsellorId || s.counsellorId || '', verifiedByName: nm(x.users, p.verifiedBy, 'fullName') });
  }
  const decLeadRef = (r, x) => { const l = x.leads.get(r.leadId) || {}; return { leadName: l.name || '', leadMobile: l.mobile || '', leadStage: l.stage || '', teamId: l.teamId }; };
  function decCall(c, x){ return Object.assign({}, c, decLeadRef(c, x), { counsellorName: nm(x.users, c.counsellorId, 'fullName') }); }
  function decFu(f, x){ return Object.assign({}, f, decLeadRef(f, x), { counsellorName: nm(x.users, f.counsellorId, 'fullName'), bucket: f.status === 'Pending' ? fuState(f.dueAt) : f.status.toLowerCase() }); }
  function decNote(n, x){ const s = x.students.get(n.studentId) || {}; return Object.assign({}, n, n.leadId ? decLeadRef(n, x) : { leadName: s.fullName || '' }, { authorName: nm(x.users, n.authorId, 'fullName') }); }

  /* ---------- lead helpers ---------- */
  function setStage(ctx, l, stage, opts){
    opts = opts || {};
    if (!stage || l.stage === stage) return false;
    if (opts.advanceOnly && (isNeg(l.stage) || stageIdx(stage) <= stageIdx(l.stage))) return false;
    const old = l.stage;
    l.stage = stage; l.updatedAt = now();
    l.stageHistory = (l.stageHistory || []).concat([{ stage, at: now(), by: ctx.user ? ctx.user.id : null }]);
    H.audit(ctx, `Lead stage changed from ${old} to ${stage}`, 'Leads', l.id, old, stage);
    return true;
  }
  function refreshLead(l){
    const pend = db.all('followups').filter(f => f.leadId === l.id && f.status === 'Pending').sort((a, b) => a.dueAt < b.dueAt ? -1 : 1);
    l.nextFollowupAt = pend.length ? pend[0].dueAt : null;
    l.score = H.scoreLead(l);
  }
  function workingPool(teamId){ return db.all('users').filter(u => u.status === 'Active' && ['counsellor', 'telecaller', 'agent'].includes(u.role) && (!teamId || u.teamId === teamId)); }
  function loadOf(uid){ return db.all('leads').filter(l => l.counsellorId === uid && l.status === 'Active' && !isNeg(l.stage) && l.stage !== 'Enrolled').length; }
  function leastLoaded(pool){ return pool.slice().sort((a, b) => loadOf(a.id) - loadOf(b.id))[0] || null; }

  function doAssign(ctx, l, counsellor, method){
    if (!counsellor) return false;
    if (ctx.scope === 'team' && counsellor.teamId !== ctx.user.teamId && counsellor.id !== ctx.user.id) throw new HttpError(403, `${counsellor.fullName} is not in your team`);
    if (l.counsellorId === counsellor.id) return false;
    const from = l.counsellorId; const team = counsellor.teamId && db.get('teams', counsellor.teamId);
    l.counsellorId = counsellor.id; l.teamId = counsellor.teamId || null; l.teamLeaderId = team ? team.teamLeaderId : null;
    l.assignedAt = now(); l.assignmentMethod = method; l.updatedAt = now();
    l.assignmentHistory = (l.assignmentHistory || []).concat([{ from, to: counsellor.id, by: ctx.user ? ctx.user.id : null, at: now(), method }]);
    db.all('followups').filter(f => f.leadId === l.id && f.status === 'Pending').forEach(f => (f.counsellorId = counsellor.id));
    const fromName = H.userName(from);
    H.audit(ctx, from ? `Lead reassigned from ${fromName} to ${counsellor.fullName}` : `Lead assigned to ${counsellor.fullName}`, 'Leads', l.id, fromName, counsellor.fullName);
    H.notify(counsellor.id, 'lead_assigned', from ? 'Lead reassigned to you' : 'New lead assigned', `${l.name} (${l.id}) · ${method.replace('_', ' ')}`, '#/leads/' + l.id);
    if (from && from !== counsellor.id) H.notify(from, 'lead_reassigned', 'Lead reassigned', `${l.name} (${l.id}) moved to ${counsellor.fullName}`, '#/leads/' + l.id);
    return true;
  }
  function pickCounsellor(ctx, l, method, opts){
    const s = H.settings(); const a = s.assignment;
    const rr = (pool) => { if (!pool.length) return null; const u = pool[a.rrPointer % pool.length]; a.rrPointer = (a.rrPointer + 1) % 100000; db.setSettings(s); return u; };
    const fromIds = (ids) => (ids || []).map(id => db.get('users', id)).filter(u => u && u.status === 'Active');
    const teamScope = ctx.scope === 'team' ? ctx.user.teamId : null;
    switch (method){
      case 'manual': { const u = db.get('users', opts.counsellorId); if (!u || u.status !== 'Active' || !WORKING.includes(u.role)) throw new HttpError(422, 'Select an active counsellor'); return u; }
      case 'round_robin': return rr(workingPool(opts.teamId || teamScope));
      case 'team': { const tid = opts.teamId || teamScope; if (!tid) throw new HttpError(422, 'Select a team'); return leastLoaded(workingPool(tid)); }
      case 'university': return leastLoaded(fromIds(a.universityMap[l.universityId])) || rr(workingPool(teamScope));
      case 'course': { const c = db.get('courses', l.courseId); return leastLoaded(fromIds(a.courseMap[c ? c.name : l.preferredCourse])) || rr(workingPool(teamScope)); }
      case 'campaign': { const tid = a.campaignMap[l.campaignId]; return (tid && leastLoaded(workingPool(tid))) || rr(workingPool(teamScope)); }
      default: throw new HttpError(422, 'Unknown assignment method');
    }
  }

  /* ---------- lookups for import / free text ---------- */
  function resolveMasters(row){
    const out = {};
    if (row.university){ const u = db.all('universities').find(x => lc(x.name) === lc(row.university) || lc(x.code) === lc(row.university)); if (u) out.universityId = u.id; }
    if (row.course){
      const cs = db.all('courses').filter(c => lc(c.name) === lc(row.course) || lc(c.code) === lc(row.course));
      const c = cs.find(x => !out.universityId || x.universityId === out.universityId) || cs[0];
      if (c){ out.courseId = c.id; out.universityId = out.universityId || c.universityId; out.campusId = c.campusId; }
      out.preferredCourse = row.course;
    }
    if (row.campus){ const cp = db.all('campuses').find(x => lc(x.name) === lc(row.campus) && (!out.universityId || x.universityId === out.universityId)); if (cp) out.campusId = cp.id; }
    if (row.campaign){ const cp = db.all('campaigns').find(x => lc(x.name) === lc(row.campaign) || lc(x.id) === lc(row.campaign)); if (cp) out.campaignId = cp.id; }
    if (row.counsellor){ const u = db.all('users').find(x => lc(x.fullName) === lc(row.counsellor) || lc(x.username) === lc(row.counsellor) || lc(x.employeeId) === lc(row.counsellor)); if (u && WORKING.includes(u.role)) out.counsellor = u; }
    return out;
  }
  function findDuplicates(mobile, email, excludeId, table){
    const m = V.normalizeMobile(mobile); const e = lc(email);
    return db.all(table || 'leads').filter(r => r.id !== excludeId && ((m && V.normalizeMobile(r.mobile) === m) || (e && lc(r.email) === e)))
      .map(r => ({ id: r.id, kind: table === 'students' ? 'student' : 'lead', name: r.name || r.fullName, mobile: r.mobile, email: r.email, studentId: r.studentId || (table === 'students' ? r.id : null), stage: r.stage || '' }));
  }

  const LEAD_FIELDS = ['name','mobile','whatsapp','email','source','campaignId','universityId','campusId','courseId','preferredCourse','state','city','qualification','passingYear','priority','stage','remarks'];
  const LEAD_RULES = { name: ['required', { min: 2 }], mobile: ['required', 'mobile'], whatsapp: ['mobile'], email: ['email'], passingYear: [(v) => /^(19|20)\d{2}$/.test(v) ? '' : 'Enter a valid year'] };
  const LEAD_LABELS = { name: 'Student name', mobile: 'Mobile', source: 'Lead source' };

  function milestones(lead, apps, calls, fus, pays){
    const hist = (lead && lead.stageHistory) || []; const at = (st) => { const h = hist.find(x => x.stage === st); return h ? { at: h.at, by: h.by } : null; };
    const appAt = (st) => { let best = null; apps.forEach(a => (a.stageHistory || []).forEach(h => { if (h.stage === st && (!best || h.at < best.at)) best = { at: h.at, by: h.by }; })); return best; };
    const firstCall = calls.filter(c => NL.outcomes.isConnected(c.outcome)).sort((a, b) => a.startAt < b.startAt ? -1 : 1)[0];
    const firstFu = fus.slice().sort((a, b) => a.createdAt < b.createdAt ? -1 : 1)[0];
    const firstApp = apps.slice().sort((a, b) => a.createdAt < b.createdAt ? -1 : 1)[0];
    const firstPay = pays.filter(p => p.status === 'Successful').sort((a, b) => a.paymentDate < b.paymentDate ? -1 : 1)[0];
    const asg = lead && (lead.assignmentHistory || [])[0];
    const items = [
      ['Lead Created', lead && { at: lead.createdAt, by: lead.createdBy }], ['Lead Assigned', asg && { at: asg.at, by: asg.by || asg.to }],
      ['First Contact', firstCall ? { at: firstCall.startAt, by: firstCall.counsellorId } : at('Contacted')], ['Counselling', at('Counselling')],
      ['Follow-up', firstFu && { at: firstFu.createdAt, by: firstFu.createdBy }], ['Application Started', firstApp && { at: firstApp.createdAt, by: firstApp.createdBy }],
      ['Application Submitted', appAt('Application Form Completed') || at('Application Submitted')], ['Documents Submitted', appAt('Documents Submitted')],
      ['Documents Verified', appAt('Documents Verified')], ['Payment Received', firstPay && { at: firstPay.paymentDate, by: firstPay.verifiedBy || firstPay.createdBy }],
      ['Admission Confirmed', appAt('Admission Confirmed') || at('Admission Confirmed')], ['Enrollment', appAt('Enrollment Completed') || at('Enrolled')]
    ];
    return items.map(([label, v]) => ({ label, done: !!(v && v.at), at: v ? v.at : null, by: v ? v.by : null, byName: v ? H.userName(v.by) : '' }));
  }
  function timeline(leadId, studentId){
    const ev = []; const add = (at, type, title, text, by) => at && ev.push({ at, type, title, text: text || '', by: by || null, byName: H.userName(by) });
    const lead = leadId && db.get('leads', leadId);
    const apps = db.all('applications').filter(a => (studentId && a.studentId === studentId) || (leadId && a.leadId === leadId));
    if (lead){
      add(lead.createdAt, 'lead', 'Lead created', `Source: ${lead.source || '—'}`, lead.createdBy);
      (lead.assignmentHistory || []).forEach(a => add(a.at, 'assign', a.from ? 'Lead reassigned' : 'Lead assigned', `${a.from ? H.userName(a.from) + ' → ' : ''}${H.userName(a.to)} (${String(a.method || 'manual').replace('_', ' ')})`, a.by));
      (lead.stageHistory || []).slice(1).forEach(h => add(h.at, isNeg(h.stage) ? 'negative' : 'stage', `Stage: ${h.stage}`, '', h.by));
      db.all('calls').filter(c => c.leadId === leadId).forEach(c => add(c.startAt, 'call', `${c.type} call · ${NL.outcomes.label(c.outcome, c.subOutcome) || '—'}`, `${NL.fmt.duration(c.duration)}${c.notes ? ' — ' + c.notes : ''}`, c.counsellorId));
      db.all('followups').filter(f => f.leadId === leadId).forEach(f => { add(f.createdAt, 'followup', 'Follow-up scheduled', `${f.reason} · due ${NL.fmt.dateTime(f.dueAt)}`, f.createdBy); if (f.completedAt) add(f.completedAt, 'followup', 'Follow-up completed', f.outcome || '', f.counsellorId); });
    }
    db.all('notes').filter(n => (leadId && n.leadId === leadId) || (studentId && n.studentId === studentId)).forEach(n => add(n.createdAt, 'note', `${n.type} note`, n.text, n.authorId));
    apps.forEach(a => (a.stageHistory || []).forEach(h => add(h.at, 'application', `Application ${a.id}: ${h.stage}`, h.remarks || '', h.by)));
    if (studentId){
      db.all('documents').filter(d => d.studentId === studentId).forEach(d => { if (d.uploadedAt) add(d.uploadedAt, 'document', `${d.type} uploaded`, d.fileName, d.uploadedBy); if (d.reviewedAt) add(d.reviewedAt, 'document', `${d.type} ${d.status.toLowerCase()}`, d.rejectionReason || d.remarks, d.reviewedBy); });
      db.all('payments').filter(p => p.studentId === studentId).forEach(p => add(p.paymentDate, 'payment', `Payment ${p.status.toLowerCase()}`, `${NL.fmt.money(p.amount)} · ${p.type} · ${p.mode}`, p.createdBy));
    }
    db.all('activities').filter(a => (leadId && a.leadId === leadId) || (studentId && a.studentId === studentId)).forEach(a => add(a.at, a.type, a.text, '', a.userId));
    return ev.sort((a, b) => a.at < b.at ? 1 : -1);
  }

  /* ============================================================
     AUTH (in-browser demo). Mirrors the server contract in server/routes.js:
     same endpoints, payloads, error codes and rules (generic messages,
     single-use expiring tokens, temporary lockout, password policy, audit).
     Demo-only differences: there is no mail server, so the "email" is
     returned to the page (demoEmail) and shown in a clearly labelled demo
     mailbox; hashing is salted SHA-256 in the browser instead of Argon2id.
     ============================================================ */
  const PP = NL.passwordPolicy, AV = NL.authValidation, RB = NL.rbac;
  const E = (status, code, message, details) => Object.assign(new HttpError(status, message, details), { code });
  const MSG = { invalid: 'Invalid email or password.', tooMany: 'Too many attempts. Please wait a few minutes and try again.', verify: 'Please verify your email address before continuing.',
    unavailable: "This account can't sign in right now. Contact your administrator.", locked: 'Your account is locked. Reset your password or contact your administrator.',
    tokenInvalid: 'This link is invalid or has expired. Request a new one.', signup: 'Please verify your email address. We sent a verification link to your inbox.',
    resend: 'If an account needs verification for this email, we sent a new verification link.', forgot: 'If an account exists for this email, we will send password reset instructions.' };
  const MIN = 60000;
  const acct = (u) => u.accountStatus || (u.status === 'Active' ? 'ACTIVE' : u.status === 'Locked' ? 'LOCKED' : 'DISABLED');
  const demoIp = '127.0.0.1 (demo)';
  const ua = () => (typeof navigator !== 'undefined' ? navigator.userAgent : 'server').slice(0, 200);
  function secEvent(type, userId, actorId, metadata){ db.insert('securityEvents', { eventType: type, userId: userId || null, actorId: actorId || null, ip: demoIp, userAgent: ua(), metadata: metadata || {}, at: now() }); }
  function mail(to, subject, route, token){
    const link = token ? `${location.href.split('#')[0]}#/${route}?token=${token}` : `${location.href.split('#')[0]}#/${route}`;
    db.insert('mailbox', { to: lc(to), subject, link, at: now() });
    return { to, subject, link };
  }
  const TTL = { email_verification: 24 * 60 * MIN, email_change: 24 * 60 * MIN, password_reset: 30 * MIN, invitation: 72 * 60 * MIN };
  function issue(u, type, email){
    db.all('authTokens').filter(t => t.userId === u.id && t.type === type && !t.usedAt).forEach(t => (t.usedAt = now()));
    const token = NL.crypto.randomToken();
    db.insert('authTokens', { userId: u.id, type, tokenHash: NL.crypto.sha256(token), email, expiresAt: new Date(Date.now() + TTL[type]).toISOString(), usedAt: null, createdAt: now() });
    return token;
  }
  function findToken(raw, types){
    if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(raw)) return null;
    const h = NL.crypto.sha256(raw);
    const t = db.all('authTokens').find(x => x.tokenHash === h && types.includes(x.type));
    return t && !t.usedAt && Date.parse(t.expiresAt) > Date.now() ? t : null;
  }
  function consume(raw, types){
    const t = findToken(raw, types); if (!t) throw E(400, 'AUTH_TOKEN_INVALID', MSG.tokenInvalid);
    t.usedAt = now(); db.update('authTokens', t.id, {});
    const u = db.get('users', t.userId); if (!u) throw E(400, 'AUTH_TOKEN_INVALID', MSG.tokenInvalid);
    return { t, u };
  }
  const policyOf = () => { const s = H.settings().security || {}; return { minLength: s.passwordMinLength, requireUpper: s.requireUpper, requireNumber: s.requireNumber, requireSpecial: s.requireSpecial }; };
  const splitName = (u) => { const p = String(u.fullName || '').split(/\s+/); return { firstName: u.firstName || p[0] || '', lastName: u.lastName != null ? u.lastName : p.slice(1).join(' ') }; };
  function checkPolicy(pw, u, field){
    const n = splitName(u);
    const r = PP.evaluate(pw, { email: u.email, firstName: n.firstName, lastName: n.lastName, username: u.username }, policyOf());
    if (!r.ok) throw E(422, 'VALIDATION_ERROR', r.errors[0], { errors: { [field || 'password']: r.errors.join(' ') } });
  }
  function reused(u, pw){ return (u.passwordHistory || []).concat(u.salt ? [{ salt: u.salt, hash: u.passwordHash }] : []).some(h => NL.crypto.hashPassword(pw, h.salt) === h.hash); }
  function setPassword(u, pw, extra){
    const salt = NL.crypto.randomSalt(); const hash = NL.crypto.hashPassword(pw, salt);
    const history = (u.passwordHistory || []).concat(u.salt ? [{ salt: u.salt, hash: u.passwordHash }] : []).slice(-4);
    db.update('users', u.id, Object.assign({ salt, passwordHash: hash, passwordHistory: history, mustChangePassword: false, lockedUntil: null, passwordChangedAt: now(), updatedAt: now() }, extra || {}));
  }
  const revokeAll = (userId, exceptId) => db.all('sessions').filter(s => s.userId === userId && !s.revoked && s.id !== exceptId).forEach(s => { s.revoked = true; s.logoutReason = 'revoked'; db.update('sessions', s.id, {}); });
  const sessionInfo = (s) => ({ id: s.publicId, remember: !!s.remember, createdAt: s.createdAt, lastSeenAt: s.lastActivityAt, idleTimeoutMinutes: s.remember ? 7 * 24 * 60 : H.settings().security.sessionTimeoutMinutes,
    expiresAt: new Date(Date.parse(s.lastActivityAt) + (s.remember ? 7 * 24 * 60 : H.settings().security.sessionTimeoutMinutes) * MIN).toISOString() });
  function filterSettings(role){ const s = JSON.parse(JSON.stringify(H.settings())); if (!role.permissions.includes('settings.view')) delete s.assignment; return s; }
  function pubUser(u){
    const p = H.publicUser(u); const n = splitName(u);
    delete p.passwordHistory;
    return Object.assign(p, { firstName: n.firstName, lastName: n.lastName, phone: u.mobile || '', accountStatus: acct(u), status: RB.legacyStatus(acct(u)), roleCode: (RB.findRole(u.role) || {}).code,
      emailVerified: !!u.emailVerifiedAt, mustChangePassword: !!u.mustChangePassword, passwordSet: !!u.passwordHash, notifyNewLogin: u.notifyNewLogin !== false, notifySecurity: u.notifySecurity !== false,
      lockedUntil: u.lockedUntil && Date.parse(u.lockedUntil) > Date.now() ? u.lockedUntil : null, activeLeads: loadOf(u.id) });
  }
  function sessionPayload(u, s){
    const role = H.roleOf(u); const info = sessionInfo(s);
    return { token: s.id, csrf: s.csrf, user: pubUser(u), role: { id: role.id, code: (RB.findRole(role.id) || {}).code, name: role.name, scope: role.scope }, permissions: role.permissions.slice().sort(),
      session: info, expiresInMinutes: info.idleTimeoutMinutes, mustChangePassword: !!u.mustChangePassword, settings: filterSettings(role) };
  }
  const findUser = (identifier) => { const i = lc(identifier); return i ? db.all('users').find(x => (i.includes('@') ? lc(x.email) : lc(x.username)) === i) : null; };
  function failures(identifier){
    const since = Date.now() - 15 * MIN;
    const mine = db.all('loginAttempts').filter(a => a.identifier === identifier && Date.parse(a.at) > since);
    const lastOk = mine.filter(a => a.success).reduce((m, a) => (a.at > m ? a.at : m), '');
    const f = mine.filter(a => !a.success && a.reason === 'invalid_credentials' && a.at > lastOk);
    return { n: f.length, last: f.reduce((m, a) => (a.at > m ? a.at : m), '') };
  }
  const attempt = (identifier, u, success, reason) => db.insert('loginAttempts', { identifier, userId: u ? u.id : null, success, reason, at: now() });

  R('POST', '/auth/login', 'public', (ctx) => {
    const b = ctx.body; const identifier = lc(b.identifier || b.username || b.email); const password = typeof b.password === 'string' ? b.password : '';
    if (!identifier || !password) throw E(422, 'VALIDATION_ERROR', 'Enter your email or username and password.', { errors: Object.assign({}, identifier ? {} : { identifier: 'Enter your email or username.' }, password ? {} : { password: 'Enter your password.' }) });
    const max = H.settings().security.maxLoginAttempts || 5;
    const f = failures(identifier);
    if (f.n >= max && Date.now() - Date.parse(f.last) < 15 * MIN) throw E(429, 'AUTH_RATE_LIMITED', MSG.tooMany);
    const u = findUser(identifier);
    if (u && u.lockedUntil && Date.parse(u.lockedUntil) > Date.now()) throw E(429, 'AUTH_RATE_LIMITED', MSG.tooMany);
    if (!u || !u.passwordHash || NL.crypto.hashPassword(password, u.salt) !== u.passwordHash){
      attempt(identifier, u, false, 'invalid_credentials');
      if (u){
        secEvent('AUTH_LOGIN_FAILED', u.id, null, { reason: 'invalid_credentials' });
        if (f.n + 1 >= max){ db.update('users', u.id, { lockedUntil: new Date(Date.now() + 15 * MIN).toISOString() }); secEvent('AUTH_ACCOUNT_LOCKED', u.id, null, { temporary: true, minutes: 15 }); }
      }
      throw E(401, 'AUTH_INVALID_CREDENTIALS', MSG.invalid);
    }
    const st = acct(u);
    const deny = (status, code, msg, reason) => { attempt(identifier, u, false, reason); secEvent('AUTH_LOGIN_FAILED', u.id, null, { reason }); throw E(status, code, msg, code === 'AUTH_EMAIL_NOT_VERIFIED' ? { email: u.email } : undefined); };
    if (st === 'PENDING_VERIFICATION') deny(403, 'AUTH_EMAIL_NOT_VERIFIED', MSG.verify, 'email_not_verified');
    if (st === 'LOCKED') deny(423, 'AUTH_ACCOUNT_LOCKED', MSG.locked, 'account_locked');
    if (st !== 'ACTIVE') deny(403, 'AUTH_ACCOUNT_UNAVAILABLE', MSG.unavailable, 'account_' + st.toLowerCase());
    const s = db.insert('sessions', { id: NL.crypto.randomToken(), publicId: 'ses_' + NL.crypto.randomSalt().slice(0, 24), csrf: NL.crypto.randomToken().slice(0, 32), userId: u.id, createdAt: now(), lastActivityAt: now(), remember: b.remember === true, revoked: false, userAgent: ua() });
    attempt(identifier, u, true, 'success'); if (lc(u.email) !== identifier) attempt(lc(u.email), u, true, 'success');
    db.update('users', u.id, { lockedUntil: null, lastLoginAt: now(), lastActivityAt: now(), presence: 'Available', presenceSince: now(), sessions: (u.sessions || []).slice(-19).concat([{ login: now(), logout: null }]) });
    H.audit({ user: u }, 'User logged in', 'Auth', u.id, '', b.remember ? 'remember me' : '');
    secEvent('AUTH_LOGIN_SUCCESS', u.id, null, { sessionId: s.publicId, remember: !!s.remember });
    return sessionPayload(u, s);
  });
  R('GET', '/auth/me', null, (ctx) => sessionPayload(ctx.user, ctx.session), { allowPasswordChange: true });
  R('POST', '/auth/refresh', null, (ctx) => sessionPayload(ctx.user, ctx.session), { allowPasswordChange: true });
  R('POST', '/auth/logout', null, (ctx) => {
    const u = ctx.user; const sess = (u.sessions || []); const last = sess[sess.length - 1]; if (last && !last.logout) last.logout = now();
    db.update('sessions', ctx.session.id, { revoked: true, logoutAt: now() });
    db.update('users', u.id, { lastLogoutAt: now(), presence: 'Offline', presenceSince: now() });
    H.audit(ctx, 'User logged out', 'Auth', u.id);
    secEvent('AUTH_LOGOUT', u.id, null, { sessionId: ctx.session.publicId });
    return { message: 'You have been signed out.' };
  }, { allowPasswordChange: true });

  R('POST', '/auth/signup', 'public', (ctx) => {
    const { values, errors } = AV.validateSignup(ctx.body); const pw = typeof ctx.body.password === 'string' ? ctx.body.password : '';
    if (!pw) errors.password = 'Password is required.';
    else { const r = PP.evaluate(pw, { email: values.email, firstName: values.firstName, lastName: values.lastName }, policyOf()); if (!r.ok) errors.password = r.errors.join(' '); }
    if (!ctx.body.confirmPassword) errors.confirmPassword = 'Confirm your password.'; else if (pw && ctx.body.confirmPassword !== pw) errors.confirmPassword = 'Passwords do not match.';
    if (Object.keys(errors).length) throw E(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', { errors });
    const existing = db.all('users').find(x => lc(x.email) === lc(values.email));
    if (existing){
      const demoEmail = acct(existing) === 'PENDING_VERIFICATION' ? mail(existing.email, 'Verify your email address', 'verify-email', issue(existing, 'email_verification', existing.email))
        : mail(existing.email, 'Sign-up attempt with your email address', 'login');
      secEvent('AUTH_SIGNUP', existing.id, null, { outcome: 'duplicate_email' });
      return { message: MSG.signup, email: values.email, demoEmail };
    }
    const salt = NL.crypto.randomSalt();
    const u = db.insert('users', { fullName: `${values.firstName} ${values.lastName}`, firstName: values.firstName, lastName: values.lastName, username: lc(values.email), email: values.email, mobile: values.phone,
      employeeId: '', department: '', status: 'Inactive', accountStatus: 'PENDING_VERIFICATION', role: RB.DEFAULT_ROLE, teamId: null, salt, passwordHash: NL.crypto.hashPassword(pw, salt),
      organization: values.organization, jobTitle: values.jobTitle, country: values.country, timezone: values.timezone, termsAcceptedAt: now(), privacyAcceptedAt: now(),
      mustChangePassword: false, createdAt: now(), updatedAt: now(), presence: 'Offline', presenceSince: now(), sessions: [], targets: { monthlyAdmissions: 0, dailyCalls: 0, monthlyApplications: 0 } });
    const demoEmail = mail(u.email, 'Verify your email address', 'verify-email', issue(u, 'email_verification', u.email));
    secEvent('AUTH_SIGNUP', u.id, null, { outcome: 'created' }); secEvent('AUTH_EMAIL_VERIFICATION_SENT', u.id);
    return { message: MSG.signup, email: values.email, demoEmail };
  });
  R('POST', '/auth/verify-email', 'public', (ctx) => {
    const { t, u } = consume(ctx.body.token, ['email_verification', 'email_change']);
    if (t.type === 'email_change'){
      if (db.all('users').some(x => x.id !== u.id && lc(x.email) === lc(t.email))) throw E(400, 'AUTH_TOKEN_INVALID', MSG.tokenInvalid);
      const old = u.email; db.update('users', u.id, { email: t.email, emailVerifiedAt: now(), updatedAt: now() }); revokeAll(u.id);
      mail(old, 'Your account email was changed', 'login'); secEvent('AUTH_EMAIL_CHANGED', u.id, null, { from: old, to: t.email });
      return { message: 'Your new email address is confirmed. Please sign in again.', type: 'email_change' };
    }
    if (lc(t.email) !== lc(u.email)) throw E(400, 'AUTH_TOKEN_INVALID', MSG.tokenInvalid);
    const patch = { emailVerifiedAt: u.emailVerifiedAt || now() };
    if (acct(u) === 'PENDING_VERIFICATION'){ patch.accountStatus = 'ACTIVE'; patch.status = 'Active'; }
    db.update('users', u.id, patch); secEvent('AUTH_EMAIL_VERIFIED', u.id);
    return { message: 'Your email has been verified successfully.', type: 'email_verification' };
  });
  R('POST', '/auth/resend-verification', 'public', (ctx) => {
    const email = lc(ctx.body.email); if (!AV.isEmail(email)) throw E(422, 'VALIDATION_ERROR', 'Enter a valid email address.', { errors: { email: 'Enter a valid email address.' } });
    const u = db.all('users').find(x => lc(x.email) === email); let demoEmail;
    if (u && acct(u) === 'PENDING_VERIFICATION' && u.passwordHash){ demoEmail = mail(u.email, 'Verify your email address', 'verify-email', issue(u, 'email_verification', u.email)); secEvent('AUTH_EMAIL_VERIFICATION_SENT', u.id, null, { resend: true }); }
    return { message: MSG.resend, demoEmail };
  });
  function forgot(ctx){
    const email = lc(ctx.body.email || ctx.body.identifier); if (!AV.isEmail(email)) throw E(422, 'VALIDATION_ERROR', 'Enter a valid email address.', { errors: { email: 'Enter a valid email address.' } });
    const u = db.all('users').find(x => lc(x.email) === email); let demoEmail;
    if (u && ['ACTIVE', 'LOCKED', 'PENDING_VERIFICATION'].includes(acct(u))){
      const type = u.passwordHash ? 'password_reset' : 'invitation';
      demoEmail = mail(u.email, type === 'invitation' ? "You're invited to the New Leaf University Admission CRM" : 'Reset your password', 'reset-password', issue(u, type, u.email));
      secEvent('AUTH_PASSWORD_RESET_REQUESTED', u.id);
    }
    return { message: MSG.forgot, demoEmail };
  }
  R('POST', '/auth/forgot-password', 'public', forgot);
  R('POST', '/auth/forgot', 'public', forgot);
  R('POST', '/auth/reset-password/validate', 'public', (ctx) => {
    const t = findToken(ctx.body.token, ['password_reset', 'invitation']); if (!t) throw E(400, 'AUTH_TOKEN_INVALID', MSG.tokenInvalid);
    const u = db.get('users', t.userId); return { valid: true, type: t.type, email: u ? u.email : '', firstName: u ? splitName(u).firstName : '' };
  });
  R('POST', '/auth/reset-password', 'public', (ctx) => {
    const b = ctx.body; const pw = typeof b.password === 'string' ? b.password : '';
    const t = findToken(b.token, ['password_reset', 'invitation']); if (!t) throw E(400, 'AUTH_TOKEN_INVALID', MSG.tokenInvalid);
    const u0 = db.get('users', t.userId); if (!u0 || ['SUSPENDED', 'DISABLED'].includes(acct(u0))) throw E(400, 'AUTH_TOKEN_INVALID', MSG.tokenInvalid);
    if (!pw) throw E(422, 'VALIDATION_ERROR', 'Enter a new password.', { errors: { password: 'Enter a new password.' } });
    if (b.confirmPassword !== pw) throw E(422, 'VALIDATION_ERROR', 'Passwords do not match.', { errors: { confirmPassword: 'Passwords do not match.' } });
    checkPolicy(pw, u0); if (reused(u0, pw)) throw E(422, 'VALIDATION_ERROR', 'Choose a password you have not used recently.', { errors: { password: "You used this password recently. Choose one you haven't used for your last 5 passwords." } });
    const { u } = consume(b.token, ['password_reset', 'invitation']);
    const extra = {}; if (!u.emailVerifiedAt) extra.emailVerifiedAt = now();
    if (['LOCKED', 'PENDING_VERIFICATION'].includes(acct(u))){ extra.accountStatus = 'ACTIVE'; extra.status = 'Active'; }
    setPassword(u, pw, extra); revokeAll(u.id);
    [lc(u.email), lc(u.username)].filter(Boolean).forEach(i => attempt(i, u, true, 'password_reset'));
    secEvent(t.type === 'invitation' ? 'AUTH_INVITATION_ACCEPTED' : 'AUTH_PASSWORD_RESET', u.id);
    return { message: t.type === 'invitation' ? 'Your password is set. Please sign in.' : 'Your password has been reset. Please sign in with your new password.' };
  });
  R('POST', '/auth/change-password', null, (ctx) => {
    const u = ctx.user; const b = ctx.body; const current = b.currentPassword || b.current || ''; const next = b.newPassword || b.next || '';
    const confirm = b.confirmPassword === undefined ? next : b.confirmPassword;
    if (NL.crypto.hashPassword(current, u.salt) !== u.passwordHash) throw E(422, 'VALIDATION_ERROR', 'Current password is incorrect.', { errors: { currentPassword: 'Current password is incorrect.', current: 'Current password is incorrect.' } });
    if (!next) throw E(422, 'VALIDATION_ERROR', 'Enter a new password.', { errors: { newPassword: 'Enter a new password.' } });
    if (confirm !== next) throw E(422, 'VALIDATION_ERROR', 'Passwords do not match.', { errors: { confirmPassword: 'Passwords do not match.' } });
    if (next === current) throw E(422, 'VALIDATION_ERROR', 'Choose a password different from your current one.', { errors: { newPassword: 'Choose a password different from your current one.' } });
    checkPolicy(next, u, 'newPassword');
    if (reused(u, next)) throw E(422, 'VALIDATION_ERROR', 'Choose a password you have not used recently.', { errors: { newPassword: "You used this password recently. Choose one you haven't used for your last 5 passwords." } });
    setPassword(u, next);
    if (b.signOutOtherSessions !== false) revokeAll(u.id, ctx.session.id);
    H.audit(ctx, 'Password changed', 'Users', u.id); secEvent('AUTH_PASSWORD_CHANGED', u.id, u.id);
    return Object.assign(sessionPayload(u, ctx.session), { message: 'Your password has been changed.' });
  }, { allowPasswordChange: true });
  R('PATCH', '/auth/profile', null, (ctx) => {
    const u = ctx.user; const b = ctx.body; const errors = {}; const patch = {};
    const take = (k, check, msg, map) => { if (b[k] === undefined) return; const v = typeof b[k] === 'string' ? AV.cleanText(b[k], 200) : b[k]; if (!check(v)) errors[k] = msg; else patch[map || k] = v; };
    take('firstName', AV.isName, 'Use letters, spaces, apostrophes or hyphens (max 60).'); take('lastName', AV.isName, 'Use letters, spaces, apostrophes or hyphens (max 60).');
    take('phone', AV.isPhone, 'Enter a valid phone number with country code.', 'mobile'); take('organization', (v) => v.length >= 2 && AV.isSafeText(v, 120), 'Enter 2–120 characters without < or >.');
    take('jobTitle', (v) => AV.isSafeText(v, 100), 'Enter up to 100 characters without < or >.'); take('country', (v) => AV.COUNTRY_CODES.has(String(v).toUpperCase()), 'Select a country from the list.');
    take('timezone', AV.isTimezone, 'Select a timezone from the list.'); take('notifyNewLogin', (v) => typeof v === 'boolean', 'Invalid value.'); take('notifySecurity', (v) => typeof v === 'boolean', 'Invalid value.');
    if (Object.keys(errors).length) throw E(422, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', { errors });
    if (patch.firstName || patch.lastName){ const n = splitName(u); patch.fullName = `${patch.firstName || n.firstName} ${patch.lastName != null ? patch.lastName : n.lastName}`.trim(); }
    db.update('users', u.id, Object.assign(patch, { updatedAt: now() })); secEvent('AUTH_PROFILE_UPDATED', u.id, u.id, { fields: Object.keys(patch) });
    return sessionPayload(u, ctx.session);
  });
  R('POST', '/auth/change-email', null, (ctx) => {
    const u = ctx.user; const ne = String(ctx.body.newEmail || '').trim();
    if (!AV.isEmail(ne)) throw E(422, 'VALIDATION_ERROR', 'Enter a valid email address.', { errors: { newEmail: 'Enter a valid email address.' } });
    if (lc(ne) === lc(u.email)) throw E(422, 'VALIDATION_ERROR', 'This is already your email address.', { errors: { newEmail: 'This is already your email address.' } });
    if (NL.crypto.hashPassword(ctx.body.currentPassword || '', u.salt) !== u.passwordHash) throw E(422, 'VALIDATION_ERROR', 'Current password is incorrect.', { errors: { currentPassword: 'Current password is incorrect.' } });
    let demoEmail; if (!db.all('users').some(x => lc(x.email) === lc(ne))) demoEmail = mail(ne, 'Confirm your new email address', 'verify-email', issue(u, 'email_change', ne));
    secEvent('AUTH_EMAIL_CHANGE_REQUESTED', u.id, u.id);
    return { message: `If ${ne} can be used, we sent a confirmation link to it. Your email changes once you open that link.`, demoEmail };
  });
  R('GET', '/auth/sessions', null, (ctx) => {
    const t = H.settings().security.sessionTimeoutMinutes * MIN;
    return db.all('sessions').filter(s => s.userId === ctx.user.id && !s.revoked && (s.remember || Date.now() - Date.parse(s.lastActivityAt) < t))
      .map(s => Object.assign(sessionInfo(s), { current: s.id === ctx.session.id, device: /Edg\//.test(s.userAgent || '') ? 'Edge' : /Firefox/.test(s.userAgent || '') ? 'Firefox' : /Chrome/.test(s.userAgent || '') ? 'Chrome' : 'Browser', ip: demoIp }));
  }, { allowPasswordChange: true });
  R('DELETE', '/auth/sessions/:id', null, (ctx) => {
    const s = db.all('sessions').find(x => x.publicId === ctx.params.id && x.userId === ctx.user.id && !x.revoked); if (!s) throw E(404, 'NOT_FOUND', 'Session not found.');
    s.revoked = true; db.update('sessions', s.id, {}); secEvent('AUTH_SESSION_REVOKED', ctx.user.id, ctx.user.id, { sessionId: s.publicId });
    return { current: s.id === ctx.session.id };
  }, { allowPasswordChange: true });
  R('POST', '/auth/sessions/revoke-others', null, (ctx) => { const n = db.all('sessions').filter(s => s.userId === ctx.user.id && !s.revoked && s.id !== ctx.session.id).length; revokeAll(ctx.user.id, ctx.session.id); secEvent('AUTH_SESSION_REVOKED', ctx.user.id, ctx.user.id, { others: n }); return { revoked: n }; }, { allowPasswordChange: true });
  R('GET', '/auth/security-activity', null, (ctx) => db.all('securityEvents').filter(e => e.userId === ctx.user.id).slice(0, 25).map(e => ({ eventType: e.eventType, at: e.at, ip: e.ip, device: 'This browser', actorName: e.actorId && e.actorId !== ctx.user.id ? H.userName(e.actorId) : '' })), { allowPasswordChange: true });
  R('POST', '/auth/presence', null, (ctx) => {
    const p = ctx.body.presence; if (!['Available', 'On Call', 'On Break', 'Busy', 'Offline'].includes(p)) throw new HttpError(422, 'Invalid status');
    const old = ctx.user.presence; db.update('users', ctx.user.id, { presence: p, presenceSince: now() });
    if (old !== p) H.audit(ctx, `Status changed from ${old} to ${p}`, 'Users', ctx.user.id, old, p);
    return H.publicUser(ctx.user);
  }, { engineAllowed: true });

  /* Bootstrap: cached master data for dropdowns + user directory (no credentials).
     Accounts without any permission (e.g. new sign-ups awaiting a role) get settings only. */
  R('GET', '/bootstrap', null, (ctx) => {
    if (!ctx.perms.size) return { universities: [], campuses: [], courses: [], campaigns: [], teams: [], users: [], roles: [], settings: filterSettings(H.roleOf(ctx.user)) };
    return { universities: db.all('universities'), campuses: db.all('campuses'), courses: db.all('courses'), campaigns: db.all('campaigns'), teams: db.all('teams'),
      users: db.all('users').map(u => ({ id: u.id, fullName: u.fullName, username: u.username, role: u.role, teamId: u.teamId, status: u.status, presence: u.presence, department: u.department })),
      roles: db.all('roles').map(r => ({ id: r.id, name: r.name, scope: r.scope })), settings: filterSettings(H.roleOf(ctx.user)) };
  });

  /* ============================================================
     USERS & ROLES — same rules as server/admin/userAdmin.js
     ============================================================ */
  const isSuper = (ctx) => ctx.user.role === 'super_admin';
  function guardSuper(ctx, target){
    if (target.role === 'super_admin' && !isSuper(ctx)) throw E(403, 'FORBIDDEN_HIERARCHY', 'Only a Super Admin can modify a Super Admin account.');
    if (!isSuper(ctx) && RB.roleRank(target.role) > RB.roleRank(ctx.user.role)) throw E(403, 'FORBIDDEN_HIERARCHY', 'You cannot modify a user with a higher role than yours.');
  }
  const mustUser = (ctx) => { const u = db.get('users', ctx.params.id); if (!u) throw new HttpError(404, 'User not found'); guardSuper(ctx, u); return u; };
  const activeSupers = () => db.all('users').filter(x => x.role === 'super_admin' && acct(x) === 'ACTIVE').length;
  function validateUser(b, id){
    const errors = {};
    if (!b.firstName && !b.fullName) errors.firstName = 'First name is required.';
    if (b.fullName !== undefined && b.fullName !== '' && !AV.isName(String(b.fullName).split(/\s+/)[0])) errors.fullName = 'Enter a valid name.';
    if (b.firstName !== undefined && b.firstName !== '' && !AV.isName(b.firstName)) errors.firstName = 'Enter a valid name.';
    if (b.lastName && !AV.isName(b.lastName)) errors.lastName = 'Enter a valid name.';
    if (!AV.isEmail(b.email)) errors.email = 'Enter a valid email address.';
    if (b.username && !AV.isUsername(b.username)) errors.username = '3–30 letters, numbers, dot, dash or underscore.';
    if (b.mobile && !V.isMobile(b.mobile)) errors.mobile = 'Enter a valid mobile number.';
    const clash = (f, label) => { if (b[f] && db.all('users').some(u => u.id !== id && lc(u[f]) === lc(b[f]))) errors[f] = `${label} already in use`; };
    clash('username', 'Username'); clash('email', 'Email'); clash('employeeId', 'Employee ID');
    if (b.teamId && !db.get('teams', b.teamId)) errors.teamId = 'Select a valid team.';
    if (Object.keys(errors).length) throw E(422, 'VALIDATION_ERROR', errors.username && /already/.test(errors.username) ? 'Username already exists' : 'Please correct the highlighted fields', { errors });
  }
  const USER_FIELDS = ['fullName', 'firstName', 'lastName', 'username', 'email', 'mobile', 'employeeId', 'department', 'teamId', 'jobTitle'];
  function normalizeNames(b){
    if (b.phone !== undefined && b.mobile === undefined) b.mobile = b.phone;
    if (b.firstName !== undefined || b.lastName !== undefined) b.fullName = `${b.firstName || ''} ${b.lastName || ''}`.trim();
    else if (b.fullName){ const p = b.fullName.split(/\s+/); b.firstName = p[0]; b.lastName = p.slice(1).join(' '); }
    return b;
  }
  function grantable(ctx, roleId){
    const role = db.get('roles', roleId); if (!role || RB.canonicalRole(roleId) !== roleId) throw E(422, 'VALIDATION_ERROR', 'Select a valid role', { errors: { role: 'Select a valid role.' } });
    if (role.id === 'super_admin' && !isSuper(ctx)) throw E(403, 'FORBIDDEN_HIERARCHY', 'Only a Super Admin can grant the Super Admin role');
    if (!isSuper(ctx) && role.permissions.some(p => !ctx.perms.has(p))) throw E(403, 'FORBIDDEN_ESCALATION', 'You cannot grant a role with permissions you do not have.');
    return role;
  }
  R('GET', '/users', ['users.view', 'teams.view'], (ctx) => {
    const x = L(); const rows = db.all('users').map(u => Object.assign(pubUser(u), { teamName: nm(x.teams, u.teamId) }));
    return H.list(rows, ctx.query, { search: ['fullName', 'username', 'email', 'employeeId', 'mobile'], filters: ['role', 'status', 'accountStatus', 'teamId', 'department', 'presence'], sort: ctx.query.sort || 'fullName', dir: ctx.query.dir || 'asc' });
  });
  R('GET', '/users/:id', 'users.view', (ctx) => {
    const u = db.get('users', ctx.params.id); if (!u) throw new HttpError(404, 'User not found');
    const out = { user: pubUser(u) };
    if (ctx.can('users.edit')) out.sessions = db.all('sessions').filter(s => s.userId === u.id && !s.revoked).map(s => Object.assign(sessionInfo(s), { device: 'Browser', ip: demoIp }));
    if (ctx.can('audit.view')) out.activity = db.all('securityEvents').filter(e => e.userId === u.id).slice(0, 30);
    return out;
  });
  R('POST', '/users', 'users.create', (ctx) => {
    const b = normalizeNames(H.pickFields(ctx.body, USER_FIELDS.concat(['password', 'onboarding', 'phone', 'role', 'markEmailVerified', 'mustChangePassword'])));
    validateUser(b);
    if (!b.username) b.username = lc(b.email); // sign in with the email when no username is chosen
    const onboarding = b.onboarding === 'password' || (b.onboarding === undefined && b.password) ? 'password' : 'invite';
    const role = b.role ? (ctx.need('users.assign_role'), grantable(ctx, b.role)).id : RB.DEFAULT_ROLE;
    let cred = {};
    if (onboarding === 'password'){
      const r = PP.evaluate(b.password || '', { email: b.email, firstName: b.firstName, lastName: b.lastName, username: b.username }, policyOf());
      if (!r.ok) throw E(422, 'VALIDATION_ERROR', 'Temporary password: ' + r.errors[0], { errors: { password: r.errors.join(' ') } });
      const salt = NL.crypto.randomSalt(); cred = { salt, passwordHash: NL.crypto.hashPassword(b.password, salt), mustChangePassword: b.mustChangePassword !== false };
    }
    const u = db.insert('users', Object.assign({}, b, cred, { password: undefined, onboarding: undefined, markEmailVerified: undefined, phone: undefined, role, accountStatus: onboarding === 'password' ? 'ACTIVE' : 'PENDING_VERIFICATION',
      status: onboarding === 'password' ? 'Active' : 'Inactive', emailVerifiedAt: onboarding === 'password' && b.markEmailVerified === true ? now() : null, department: b.department || '', employeeId: b.employeeId || '',
      createdAt: now(), updatedAt: now(), createdBy: ctx.user.id, presence: 'Offline', presenceSince: now(), sessions: [], lastLoginAt: null,
      targets: { monthlyAdmissions: H.settings().performance.monthlyAdmissionTarget, dailyCalls: H.settings().performance.dailyCallTarget, monthlyApplications: 20 } }));
    ['password', 'onboarding', 'markEmailVerified', 'phone'].forEach(k => delete u[k]);
    H.audit(ctx, `User created: ${u.username}`, 'Users', u.id, '', { username: u.username, role: RB.roleName(role) });
    secEvent('AUTH_USER_CREATED', u.id, ctx.user.id, { onboarding, role });
    const out = pubUser(u);
    if (onboarding === 'invite'){ out.demoEmail = mail(u.email, "You're invited to the New Leaf University Admission CRM", 'reset-password', issue(u, 'invitation', u.email)); secEvent('AUTH_INVITATION_SENT', u.id, ctx.user.id); }
    return out;
  });
  function setAccountStatus(ctx, u, to, reason){
    if (acct(u) === to) return pubUser(u);
    if (u.id === ctx.user.id) throw E(422, 'VALIDATION_ERROR', 'You cannot change the status of your own account.', { errors: { status: 'You cannot change the status of your own account.' } });
    if (!RB.canTransition(acct(u), to)) throw E(422, 'VALIDATION_ERROR', 'That status change is not allowed.', { errors: { status: `A ${RB.STATUS_LABEL[acct(u)].toLowerCase()} account cannot be changed to ${RB.STATUS_LABEL[to].toLowerCase()}.` } });
    if (to !== 'ACTIVE' && u.role === 'super_admin' && acct(u) === 'ACTIVE' && activeSupers() <= 1) throw E(422, 'VALIDATION_ERROR', 'At least one active Super Admin is required.');
    const from = acct(u);
    db.update('users', u.id, { accountStatus: to, status: RB.legacyStatus(to), statusReason: reason || '', lockedUntil: to === 'ACTIVE' ? null : u.lockedUntil, updatedAt: now() });
    if (to !== 'ACTIVE') revokeAll(u.id);
    H.audit(ctx, `User ${u.username} status changed to ${RB.STATUS_LABEL[to]}`, 'Users', u.id, RB.STATUS_LABEL[from], RB.STATUS_LABEL[to]);
    secEvent(from === 'LOCKED' && to === 'ACTIVE' ? 'AUTH_ACCOUNT_UNLOCKED' : { ACTIVE: 'AUTH_ACCOUNT_ACTIVATED', SUSPENDED: 'AUTH_ACCOUNT_SUSPENDED', DISABLED: 'AUTH_ACCOUNT_DISABLED', LOCKED: 'AUTH_ACCOUNT_LOCKED' }[to], u.id, ctx.user.id, { from, to, reason: reason || undefined });
    return pubUser(u);
  }
  R('PATCH', '/users/:id', ['users.edit', 'users.delete'], (ctx) => {
    const u = mustUser(ctx);
    const legacy = { Active: 'ACTIVE', Inactive: 'DISABLED', Locked: 'LOCKED' }[ctx.body.status];
    if (legacy && legacy !== acct(u)){ ctx.need('users.delete'); return setAccountStatus(ctx, u, legacy); }
    ctx.need('users.edit');
    const b = normalizeNames(H.pickFields(ctx.body, USER_FIELDS.concat(['targets', 'phone'])));
    delete b.phone;
    const merged = Object.assign({}, u, b); validateUser(merged, u.id);
    const d = H.diff(u, b); if (!d) return pubUser(u);
    if (b.email && lc(b.email) !== lc(u.email)){ b.emailVerifiedAt = null; mail(b.email, 'Verify your email address', 'verify-email', issue(Object.assign({}, u, b), 'email_verification', b.email)); }
    db.update('users', u.id, Object.assign(b, { updatedAt: now() }));
    H.audit(ctx, `User ${u.username} updated`, 'Users', u.id, d.oldV, d.newV); secEvent('AUTH_USER_UPDATED', u.id, ctx.user.id, { fields: Object.keys(d.newV) });
    return pubUser(u);
  });
  [['suspend', 'SUSPENDED'], ['disable', 'DISABLED'], ['lock', 'LOCKED'], ['activate', 'ACTIVE']].forEach(([action, to]) =>
    R('POST', `/users/:id/${action}`, 'users.delete', (ctx) => setAccountStatus(ctx, mustUser(ctx), to, ctx.body.reason)));
  R('POST', '/users/:id/unlock', 'users.edit', (ctx) => {
    const u = mustUser(ctx); if (acct(u) === 'LOCKED') return setAccountStatus(ctx, u, 'ACTIVE');
    db.update('users', u.id, { lockedUntil: null }); [lc(u.email), lc(u.username)].filter(Boolean).forEach(i => attempt(i, u, true, 'admin_unlock'));
    secEvent('AUTH_ACCOUNT_UNLOCKED', u.id, ctx.user.id, { temporaryLockCleared: true }); return pubUser(u);
  });
  R('POST', '/users/:id/verify-email', 'users.edit', (ctx) => {
    const u = mustUser(ctx); if (!u.passwordHash) throw E(422, 'VALIDATION_ERROR', 'The user has not set a password yet. Resend the invitation instead.');
    const patch = { emailVerifiedAt: u.emailVerifiedAt || now() }; if (acct(u) === 'PENDING_VERIFICATION'){ patch.accountStatus = 'ACTIVE'; patch.status = 'Active'; }
    db.update('users', u.id, patch); secEvent('AUTH_EMAIL_VERIFIED', u.id, ctx.user.id, { forcedByAdmin: true }); return pubUser(u);
  });
  R('POST', '/users/:id/send-password-reset', 'users.edit', (ctx) => {
    const u = mustUser(ctx); if (['SUSPENDED', 'DISABLED'].includes(acct(u))) throw E(422, 'VALIDATION_ERROR', 'Activate the account first.');
    const type = u.passwordHash ? 'password_reset' : 'invitation';
    const demoEmail = mail(u.email, type === 'invitation' ? "You're invited to the New Leaf University Admission CRM" : 'Reset your password', 'reset-password', issue(u, type, u.email));
    secEvent(type === 'invitation' ? 'AUTH_INVITATION_SENT' : 'AUTH_PASSWORD_RESET_REQUESTED', u.id, ctx.user.id, { byAdmin: true });
    return { message: type === 'invitation' ? 'Invitation sent.' : 'Password reset link sent.', type, demoEmail };
  });
  R('POST', '/users/:id/reset-password', 'users.edit', (ctx) => {
    const u = mustUser(ctx); const pw = ctx.body.password || '';
    checkPolicy(pw, u);
    const extra = { mustChangePassword: true }; if (['LOCKED', 'PENDING_VERIFICATION'].includes(acct(u))){ extra.accountStatus = 'ACTIVE'; extra.status = 'Active'; }
    setPassword(u, pw, extra); db.update('users', u.id, { mustChangePassword: true, resetRequested: null }); revokeAll(u.id);
    [lc(u.email), lc(u.username)].filter(Boolean).forEach(i => attempt(i, u, true, 'admin_reset'));
    H.audit(ctx, `Password reset for ${u.username}`, 'Users', u.id); secEvent('AUTH_PASSWORD_RESET', u.id, ctx.user.id, { byAdmin: true, temporary: true });
    return { message: 'Temporary password set.' };
  });
  R('POST', '/users/:id/revoke-sessions', 'users.edit', (ctx) => {
    const u = mustUser(ctx); const n = db.all('sessions').filter(s => s.userId === u.id && !s.revoked).length; revokeAll(u.id);
    secEvent('AUTH_SESSION_REVOKED', u.id, ctx.user.id, { revoked: n, byAdmin: true }); return { revoked: n };
  });
  R('GET', '/users/:id/activity', 'audit.view', (ctx) => db.all('securityEvents').filter(e => e.userId === ctx.params.id).slice(0, 100));
  R('POST', '/users/:id/role', 'users.assign_role', (ctx) => {
    const u = mustUser(ctx);
    const role = grantable(ctx, RB.canonicalRole(String(ctx.body.role || '')));
    if (u.id === ctx.user.id && role.id !== u.role) throw E(422, 'VALIDATION_ERROR', 'You cannot change the role of your own account.');
    if (u.role === 'super_admin' && role.id !== 'super_admin' && activeSupers() <= 1) throw new HttpError(422, 'At least one active Super Admin is required');
    if (u.role === role.id) return pubUser(u);
    const old = u.role;
    db.update('users', u.id, { role: role.id, updatedAt: now() });
    H.audit(ctx, `Role changed from ${RB.roleName(old)} to ${role.name}`, 'Users', u.id, RB.roleName(old), role.name);
    secEvent('AUTH_ROLE_CHANGED', u.id, ctx.user.id, { from: old, to: role.id });
    H.notify(u.id, 'task_assigned', 'Your role was updated', `You are now ${role.name}.`, '#/profile');
    return pubUser(u);
  });
  const ROLE_ORDER = RB.ROLES.map(r => r.id);
  R('GET', '/roles', ['roles.view', 'roles.manage', 'users.assign_role'], () => db.all('roles').filter(r => ROLE_ORDER.includes(r.id)).sort((a, b) => ROLE_ORDER.indexOf(a.id) - ROLE_ORDER.indexOf(b.id))
    .map(r => Object.assign({}, r, { code: (RB.findRole(r.id) || {}).code, userCount: db.all('users').filter(u => u.role === r.id).length })));
  R('PATCH', '/roles/:id', 'roles.manage', (ctx) => {
    const r = db.get('roles', ctx.params.id); if (!r) throw new HttpError(404, 'Role not found');
    if (r.id === 'super_admin') throw new HttpError(422, 'Super Admin always has full access and cannot be edited');
    const perms = RB.upgradePermissions(ctx.body.permissions || []);
    if (!isSuper(ctx) && perms.some(p => !ctx.perms.has(p))) throw E(403, 'FORBIDDEN_ESCALATION', 'You cannot grant permissions you do not have.');
    const patch = { permissions: perms }; if (['all', 'team', 'own'].includes(ctx.body.scope)) patch.scope = ctx.body.scope;
    const added = perms.filter(p => !r.permissions.includes(p)), removed = r.permissions.filter(p => !perms.includes(p));
    db.update('roles', r.id, patch);
    H.audit(ctx, `Permissions updated for ${r.name}`, 'Roles', r.id, removed.length ? 'removed: ' + removed.join(', ') : '', added.length ? 'added: ' + added.join(', ') : (patch.scope ? 'scope: ' + patch.scope : ''));
    secEvent('AUTH_ROLE_PERMISSIONS_CHANGED', null, ctx.user.id, { role: r.id, added, removed });
    return r;
  });
  R('GET', '/security/audit-logs', 'audit.view', (ctx) => {
    const rows = db.all('securityEvents').map(e => Object.assign({}, e, { userName: H.userName(e.userId), actorName: H.userName(e.actorId), metadataText: JSON.stringify(e.metadata || {}) }));
    return H.list(rows, ctx.query, { search: ['eventType', 'userName', 'actorName', 'metadataText', 'ip'], filters: ['eventType', 'userId'], dateField: 'at', sort: 'at' });
  });
  S.h.loadOf = loadOf;

  /* ============================================================
     TEAMS
     ============================================================ */
  R('GET', '/teams', ['teams.view', 'users.view', 'leads.assign'], (ctx) => {
    const x = L(); const rows = db.all('teams').map(t => Object.assign({}, t, { teamLeaderName: nm(x.users, t.teamLeaderId, 'fullName'), memberCount: db.all('users').filter(u => u.teamId === t.id && u.status === 'Active').length }));
    return H.list(rows, ctx.query, { search: ['name', 'teamLeaderName', 'description'], filters: ['status'], sort: 'name', dir: 'asc' });
  });
  function saveTeam(ctx, t, b){
    H.requireFields(b, { name: ['required'] }, { name: 'Team name' });
    if (db.all('teams').some(x => x.id !== (t && t.id) && lc(x.name) === lc(b.name))) throw new HttpError(422, 'A team with this name exists', { errors: { name: 'Name already in use' } });
    if (b.teamLeaderId){ const tl = db.get('users', b.teamLeaderId); if (!tl || tl.role !== 'team_leader') throw new HttpError(422, 'Team leader must be a user with the Team Leader role', { errors: { teamLeaderId: 'Select a Team Leader' } }); db.update('users', tl.id, { teamId: t ? t.id : null }); }
  }
  R('POST', '/teams', 'teams.manage', (ctx) => {
    const b = H.pickFields(ctx.body, ['name', 'description', 'teamLeaderId', 'status']); saveTeam(ctx, null, b);
    const t = db.insert('teams', Object.assign({ status: 'Active' }, b, { createdAt: now() }));
    if (b.teamLeaderId) db.update('users', b.teamLeaderId, { teamId: t.id });
    H.audit(ctx, `Team created: ${t.name}`, 'Teams', t.id, '', t.name); return t;
  });
  R('PATCH', '/teams/:id', 'teams.manage', (ctx) => {
    const t = db.get('teams', ctx.params.id); if (!t) throw new HttpError(404, 'Team not found');
    const b = H.pickFields(ctx.body, ['name', 'description', 'teamLeaderId', 'status']); saveTeam(ctx, t, Object.assign({}, t, b));
    const d = H.diff(t, b); db.update('teams', t.id, b);
    if (d && d.newV.teamLeaderId !== undefined) db.all('leads').filter(l => l.teamId === t.id).forEach(l => (l.teamLeaderId = b.teamLeaderId));
    if (d) H.audit(ctx, `Team updated: ${t.name}`, 'Teams', t.id, d.oldV, d.newV); return t;
  });

  /* ============================================================
     MASTERS — universities, campuses, courses, campaigns
     ============================================================ */
  function master(table, perm, module, cfg){
    R('GET', '/' + cfg.path, [perm + '.view', 'leads.view', 'reports.view'], (ctx) => { const x = L(); return H.list(db.all(table).map(r => cfg.decorate ? cfg.decorate(r, x) : r), ctx.query, cfg.list); });
    R('POST', '/' + cfg.path, perm + '.manage', (ctx) => {
      const b = H.pickFields(ctx.body, cfg.fields); cfg.validate(b, null);
      const r = db.insert(table, Object.assign({ status: 'Active' }, b, { createdAt: now(), updatedAt: now(), createdBy: ctx.user.id }));
      H.audit(ctx, `${module} created: ${r.name}`, module, r.id, '', r.name); return r;
    });
    R('PATCH', '/' + cfg.path + '/:id', perm + '.manage', (ctx) => {
      const r = db.get(table, ctx.params.id); if (!r) throw new HttpError(404, `${module} not found`);
      const b = H.pickFields(ctx.body, cfg.fields); cfg.validate(Object.assign({}, r, b), r.id);
      const d = H.diff(r, b); if (!d) return r;
      db.update(table, r.id, Object.assign(b, { updatedAt: now() }));
      H.audit(ctx, d.newV.status && Object.keys(d.newV).length === 1 ? `${module} ${r.name} ${b.status === 'Active' ? 'activated' : 'deactivated'}` : `${module} updated: ${r.name}`, module, r.id, d.oldV, d.newV);
      return r;
    });
  }
  const unique = (table, id, field, value, label) => { if (db.all(table).some(x => x.id !== id && lc(x[field]) === lc(value))) throw new HttpError(422, `${label} already exists`, { errors: { [field]: `${label} already exists` } }); };
  master('universities', 'universities', 'University', {
    path: 'universities', fields: ['name','code','logo','website','type','accreditation','location','state','country','contactPerson','contactNumber','email','status'],
    list: { search: ['name', 'code', 'location', 'state', 'contactPerson'], filters: ['status', 'type', 'state'], sort: 'name', dir: 'asc' },
    decorate: (u) => {
      const ls = db.all('leads').filter(l => l.universityId === u.id);
      return Object.assign({}, u, { campusCount: db.all('campuses').filter(c => c.universityId === u.id).length, courseCount: db.all('courses').filter(c => c.universityId === u.id).length,
        leadCount: ls.length, admissionCount: db.all('applications').filter(a => a.universityId === u.id && ['Admission Confirmed', 'Enrollment Completed'].includes(a.stage)).length });
    },
    validate: (b, id) => { H.requireFields(b, { name: ['required'], code: ['required'], email: ['email'], contactNumber: ['mobile'], website: [(v) => /^https?:\/\/\S+$/.test(v) ? '' : 'Website must start with http:// or https://'] }, { name: 'University name', code: 'Code' });
      unique('universities', id, 'name', b.name, 'University name'); unique('universities', id, 'code', b.code, 'University code'); }
  });
  master('campuses', 'campuses', 'Campus', {
    path: 'campuses', fields: ['universityId','name','location','state','address','contact','status'],
    list: { search: ['name', 'location', 'state', 'universityName', 'address'], filters: ['universityId', 'status', 'state'], sort: 'universityName', dir: 'asc' },
    decorate: (c, x) => Object.assign({}, c, { universityName: nm(x.unis, c.universityId), courseCount: db.all('courses').filter(k => k.campusId === c.id).length }),
    validate: (b, id) => { H.requireFields(b, { universityId: ['required'], name: ['required'] }, { universityId: 'University', name: 'Campus name' });
      if (!db.get('universities', b.universityId)) throw new HttpError(422, 'Unknown university');
      if (db.all('campuses').some(c => c.id !== id && c.universityId === b.universityId && lc(c.name) === lc(b.name))) throw new HttpError(422, 'This university already has a campus with that name', { errors: { name: 'Duplicate campus' } }); }
  });
  master('courses', 'courses', 'Course', {
    path: 'courses', fields: ['universityId','campusId','name','code','degreeType','department','duration','mode','eligibility','totalFees','applicationFee','semesterFee','scholarship','intake','seats','status'],
    list: { search: ['name', 'code', 'department', 'universityName', 'campusName'], filters: ['universityId', 'campusId', 'degreeType', 'mode', 'status', 'name'], sort: 'name', dir: 'asc' },
    decorate: (c, x) => Object.assign({}, c, { universityName: nm(x.unis, c.universityId), campusName: nm(x.campuses, c.campusId) }),
    validate: (b, id) => {
      H.requireFields(b, { universityId: ['required'], campusId: ['required'], name: ['required'], code: ['required'], totalFees: ['required', 'amount'], applicationFee: ['amount'], semesterFee: ['amount'], seats: ['amount'] },
        { universityId: 'University', campusId: 'Campus', name: 'Course name', code: 'Course code', totalFees: 'Total fees' });
      const cp = db.get('campuses', b.campusId); if (!cp || cp.universityId !== b.universityId) throw new HttpError(422, 'Campus does not belong to the selected university', { errors: { campusId: 'Pick a campus of this university' } });
      ['totalFees', 'applicationFee', 'semesterFee', 'seats'].forEach(k => { if (b[k] !== undefined && b[k] !== '') b[k] = Number(b[k]); });
      unique('courses', id, 'code', b.code, 'Course code');
    }
  });
  master('campaigns', 'campaigns', 'Campaign', {
    path: 'campaigns', fields: ['name','universityId','course','source','startDate','endDate','budget','status'],
    list: { search: ['name', 'source', 'universityName', 'course'], filters: ['universityId', 'source', 'status'], sort: 'startDate', dir: 'desc' },
    decorate: (c, x) => Object.assign({}, c, { universityName: nm(x.unis, c.universityId) }, campaignMetrics(c.id, c.budget)),
    validate: (b, id) => {
      H.requireFields(b, { name: ['required'], source: ['required'], startDate: ['required', 'date'], endDate: ['date'], budget: ['amount'] }, { name: 'Campaign name', source: 'Source', startDate: 'Start date' });
      if (b.endDate && b.endDate < b.startDate) throw new HttpError(422, 'End date must be after start date', { errors: { endDate: 'End date is before start date' } });
      b.budget = Number(b.budget || 0); unique('campaigns', id, 'name', b.name, 'Campaign name');
    }
  });
  function campaignMetrics(cid, budget, from, to){
    const inR = (t) => (!from || t >= from) && (!to || t < to);
    const ls = db.all('leads').filter(l => l.campaignId === cid && inR(l.createdAt)); const ids = new Set(ls.map(l => l.id));
    const reached = (l, st) => (l.stageHistory || []).some(h => h.stage === st);
    const apps = db.all('applications').filter(a => ids.has(a.leadId));
    const appIds = new Set(apps.map(a => a.id));
    const revenue = db.all('payments').filter(p => appIds.has(p.applicationId) && ['Successful', 'Partially Paid'].includes(p.status)).reduce((s, p) => s + p.amount, 0);
    const admissions = ls.filter(l => reached(l, 'Admission Confirmed')).length;
    return { leads: ls.length, contacted: ls.filter(l => reached(l, 'Contacted')).length, qualified: ls.filter(l => reached(l, 'Qualified')).length, applications: apps.length,
      admissions, revenue, conversionRate: ls.length ? admissions / ls.length * 100 : 0, cpl: ls.length ? (budget || 0) / ls.length : 0, roi: budget ? (revenue - budget) / budget * 100 : 0 };
  }
  S.h.campaignMetrics = campaignMetrics;

  /* ============================================================
     LEADS
     ============================================================ */
  function leadRows(ctx){ const x = L(); return db.all('leads').filter(l => H.leadVisible(ctx, l)).map(l => decLead(l, x)); }
  const LEAD_LIST_OPTS = { search: ['name', 'mobile', 'whatsapp', 'email', 'id', 'city', 'state', 'studentId', 'counsellorName', 'courseName', 'universityName'],
    filters: ['stage', 'outcome', 'subOutcome', 'source', 'campaignId', 'universityId', 'campusId', 'courseId', 'counsellorId', 'teamId', 'priority', 'state', 'zone', 'city', 'qualification', 'courseName', 'universityName', 'programme'], sort: 'createdAt' };
  function filteredLeadRows(ctx, q){
    let rows = leadRows(ctx);
    const neg = H.settings().negativeStages;
    rows = rows.filter(l => (q.status || 'Active') === 'all' || l.status === (q.status || 'Active'));
    if (q.stageGroup === 'active') rows = rows.filter(l => !neg.includes(l.stage) && l.stage !== 'Enrolled');
    if (q.stageGroup === 'negative') rows = rows.filter(l => neg.includes(l.stage));
    if (q.stageGroup === 'hot') rows = rows.filter(l => l.score >= 61);
    if (q.followup) rows = rows.filter(l => l.followupState === q.followup);
    if (q.scoreBand) rows = rows.filter(l => l.scoreBand === q.scoreBand);
    if (q.uncontacted) rows = rows.filter(l => l.stage === 'New');
    return rows;
  }
  R('GET', '/leads', 'leads.view', (ctx) => {
    const q = ctx.query; if (q.pageSize === 'all' && q.export) ctx.need('leads.export');
    return H.list(filteredLeadRows(ctx, q), q, LEAD_LIST_OPTS);
  });
  /* State-wise bifurcation of the current lead list (same filters, ignoring the state filter itself). */
  R('GET', '/leads/by-state', 'leads.view', (ctx) => {
    const q = Object.assign({}, ctx.query, { page: 1, pageSize: 'all' }); delete q.state; delete q.zone;
    const rows = H.list(filteredLeadRows(ctx, q), q, LEAD_LIST_OPTS).items;
    const m = new Map();
    rows.forEach(l => { const k = l.state || ''; const r = m.get(k) || { state: k, zone: l.zone || '', count: 0 }; r.count++; m.set(k, r); });
    const states = Array.from(m.values()).sort((a, b) => b.count - a.count || a.state.localeCompare(b.state));
    const zones = {}; rows.forEach(l => { const z = l.zone || 'Not specified'; zones[z] = (zones[z] || 0) + 1; });
    return { total: rows.length, states, zones };
  });
  /* Course-wise pipeline of the current lead list (same filters, ignoring the course filter itself).
     Each lead counts once, in the furthest pipeline step it has reached (or "exited"). */
  R('GET', '/leads/by-course', 'leads.view', (ctx) => {
    const byProgramme = ctx.query.group === 'programme';
    const q = Object.assign({}, ctx.query, { page: 1, pageSize: 'all' }); delete q.courseName; delete q.courseId; delete q.programme; delete q.group;
    const rows = H.list(filteredLeadRows(ctx, q), q, LEAD_LIST_OPTS).items;
    const st = H.settings(); const neg = st.negativeStages;
    const idxOf = (s) => st.leadStages.indexOf(s);
    const I = { contacted: idxOf('Contacted'), interested: idxOf('Interested'), qualified: idxOf('Qualified'), applied: idxOf('Application Started'), admitted: idxOf('Admission Confirmed') };
    const m = new Map();
    rows.forEach(l => {
      const k = (byProgramme ? l.programme : l.courseName) || '';
      const r = m.get(k) || { course: k, names: new Set(), leads: 0, hot: 0, buckets: { admitted: 0, applied: 0, qualified: 0, interested: 0, contacted: 0, new: 0, exited: 0 }, reached: { contacted: 0, interested: 0, qualified: 0, applied: 0, admitted: 0 }, universities: new Set() };
      let max = 0; (l.stageHistory || []).forEach(h => { const i = idxOf(h.stage); if (i > max) max = i; }); max = Math.max(max, idxOf(l.stage));
      r.leads++; if (l.score >= 61) r.hot++; if (l.universityName) r.universities.add(l.universityName); if (l.courseName) r.names.add(l.courseName);
      Object.keys(I).forEach(k2 => { if (max >= I[k2]) r.reached[k2]++; });
      const b = neg.includes(l.stage) ? 'exited' : max >= I.admitted ? 'admitted' : max >= I.applied ? 'applied' : max >= I.qualified ? 'qualified' : max >= I.interested ? 'interested' : max >= I.contacted ? 'contacted' : 'new';
      r.buckets[b]++; m.set(k, r);
    });
    const courses = Array.from(m.values()).map(r => Object.assign(r, { universities: r.universities.size, variants: r.names.size, names: undefined, conversion: r.leads ? r.reached.admitted / r.leads * 100 : 0 }))
      .sort((a, b) => (!a.course) - (!b.course) || b.leads - a.leads || a.course.localeCompare(b.course));
    return { total: rows.length, courses };
  });
  R('GET', '/leads/:id', 'leads.view', (ctx) => {
    const l = H.mustSeeLead(ctx, ctx.params.id); const x = L();
    const calls = db.all('calls').filter(c => c.leadId === l.id); const fus = db.all('followups').filter(f => f.leadId === l.id);
    const apps = db.all('applications').filter(a => a.leadId === l.id || (l.studentId && a.studentId === l.studentId));
    const docs = l.studentId ? db.all('documents').filter(d => d.studentId === l.studentId) : [];
    const pays = l.studentId ? db.all('payments').filter(p => p.studentId === l.studentId) : [];
    const refIds = new Set([l.id, l.studentId].concat(apps.map(a => a.id)).filter(Boolean));
    return {
      lead: decLead(l, x), student: l.studentId ? decStudent(db.get('students', l.studentId) || {}, x) : null,
      calls: calls.map(c => decCall(c, x)).sort((a, b) => a.startAt < b.startAt ? 1 : -1),
      notes: db.all('notes').filter(n => n.leadId === l.id || (l.studentId && n.studentId === l.studentId)).map(n => decNote(n, x)).sort((a, b) => a.createdAt < b.createdAt ? 1 : -1),
      followups: fus.map(f => decFu(f, x)).sort((a, b) => a.dueAt < b.dueAt ? 1 : -1),
      applications: apps.map(a => decApp(a, x)), documents: docs.map(d => decDoc(d, x)), payments: pays.map(p => decPay(p, x)),
      audit: db.all('audit').filter(a => refIds.has(a.recordId)),
      timeline: timeline(l.id, l.studentId), milestones: milestones(l, apps, calls, fus, pays),
      duplicates: findDuplicates(l.mobile, l.email, l.id).length
    };
  });
  /* Maps free-text sources (forms, ad exports, Excel) onto the configured list: "fb ads" → Facebook, "insta" → Instagram. */
  const SOURCE_ALIASES = [[/^(fb|facebook|meta)\b|facebook|meta lead/i, 'Facebook'], [/^(ig|insta)\b|instagram/i, 'Instagram'], [/^yt\b|youtube/i, 'YouTube'],
    [/linked\s*in/i, 'LinkedIn'], [/^x$|twitter|^x\s*\(/i, 'X (Twitter)'], [/snap/i, 'Snapchat'], [/telegram/i, 'Telegram'], [/google|adwords|gads|search ad/i, 'Google'],
    [/whats\s*app|^wa$/i, 'WhatsApp'], [/web|landing|site|seo|organic/i, 'Website'], [/refer/i, 'Referral'], [/walk/i, 'Walk-in'], [/tele|cold call|calling/i, 'Telecalling'],
    [/fair|expo|seminar/i, 'Education Fair'], [/partner|agent|consultant/i, 'Partner']];
  function canonicalSource(v){
    const s = String(v || '').trim(); if (!s) return '';
    const list = H.settings().leadSources || [];
    const exact = list.find(x => lc(x) === lc(s)); if (exact) return exact;
    const hit = SOURCE_ALIASES.find(([re, name]) => re.test(s) && list.includes(name));
    return hit ? hit[1] : (list.includes('Other') ? 'Other' : '');
  }
  function validateLeadBody(b){
    b.source = canonicalSource(b.source); // required: every lead must say where it came from
    H.requireFields(b, Object.assign({ source: ['required'] }, LEAD_RULES), LEAD_LABELS);
    if (b.state || b.city) b.state = NL.geo.resolveState(b.state, b.city); // one canonical state name, derived from the city when missing
    if (b.courseId){ const c = db.get('courses', b.courseId); if (!c) throw new HttpError(422, 'Unknown course'); if (b.universityId && c.universityId !== b.universityId) throw new HttpError(422, 'Course does not belong to the selected university', { errors: { courseId: 'Pick a course of this university' } }); b.campusId = b.campusId || c.campusId; b.preferredCourse = b.preferredCourse || c.name; }
    const st = H.settings(); if (b.stage && !st.leadStages.includes(b.stage) && !st.negativeStages.includes(b.stage)) throw new HttpError(422, 'Unknown lead stage');
  }
  R('POST', '/leads', 'leads.create', (ctx) => {
    const b = H.pickFields(ctx.body, LEAD_FIELDS); validateLeadBody(b);
    if (ctx.body.mergeInto){
      ctx.need('leads.merge');
      const t = H.mustSeeLead(ctx, ctx.body.mergeInto); const filled = {};
      LEAD_FIELDS.forEach(f => { if (b[f] && !t[f]) { filled[f] = b[f]; t[f] = b[f]; } });
      t.updatedAt = now(); refreshLead(t);
      H.audit(ctx, 'Duplicate merged into existing lead', 'Leads', t.id, '', filled); H.activity(t.id, t.studentId, 'merge', 'Duplicate enquiry merged into this lead', ctx.user.id);
      return { lead: t, merged: true };
    }
    if (!ctx.body.force){
      const d = findDuplicates(b.mobile, b.email).concat(findDuplicates(b.mobile, b.email, null, 'students'));
      if (d.length) throw new HttpError(409, 'Possible duplicate student found', { duplicates: d });
    }
    const l = Object.assign({ source: 'Other', priority: 'Medium', stage: 'New' }, b, {
      whatsapp: b.whatsapp || b.mobile, status: 'Active', studentId: null, counsellorId: null, teamId: null, teamLeaderId: null, assignedAt: null, assignmentMethod: null,
      assignmentHistory: [], stageHistory: [{ stage: b.stage || 'New', at: now(), by: ctx.user.id }], lastContactAt: null, nextFollowupAt: null, createdAt: now(), updatedAt: now(), createdBy: ctx.user.id, score: 0 });
    if (ctx.scope === 'team') l.teamId = ctx.user.teamId; // keeps unassigned team leads visible to the creating Team Leader
    db.insert('leads', l);
    H.audit(ctx, `Lead created: ${l.name}`, 'Leads', l.id, '', { name: l.name, mobile: l.mobile, source: l.source });
    const method = ctx.body.assignMethod;
    if (!ctx.can('leads.assign') || ctx.scope === 'own') doAssign(ctx, l, ctx.user.role === 'unassigned' ? null : ctx.user, 'manual');
    else if (ctx.body.counsellorId) doAssign(ctx, l, pickCounsellor(ctx, l, 'manual', { counsellorId: ctx.body.counsellorId }), 'manual');
    else if (method && method !== 'none') doAssign(ctx, l, pickCounsellor(ctx, l, method, { teamId: ctx.body.teamId }), method);
    refreshLead(l);
    return { lead: l };
  });
  R('PATCH', '/leads/:id', 'leads.edit', (ctx) => {
    const l = H.mustSeeLead(ctx, ctx.params.id);
    const b = H.pickFields(ctx.body, LEAD_FIELDS); const merged = Object.assign({}, l, b); validateLeadBody(merged); if ('source' in b) b.source = merged.source; b.campusId = merged.campusId; b.preferredCourse = merged.preferredCourse;
    if ('state' in b || 'city' in b) b.state = merged.state;
    if ((b.mobile && V.normalizeMobile(b.mobile) !== V.normalizeMobile(l.mobile)) || (b.email && lc(b.email) !== lc(l.email))){
      const d = findDuplicates(b.mobile || l.mobile, b.email || l.email, l.id); if (d.length && !ctx.body.force) throw new HttpError(409, 'Another lead already uses this mobile/email', { duplicates: d });
    }
    const stage = b.stage; delete b.stage;
    // Outcome edited on the lead: must come from the outcome master.
    if (ctx.body.outcome !== undefined && (ctx.body.outcome || '') !== (l.outcome || '') || ctx.body.subOutcome !== undefined && (ctx.body.subOutcome || '') !== (l.subOutcome || '')){
      const oc = ctx.body.outcome === undefined ? l.outcome : ctx.body.outcome, sc = ctx.body.subOutcome === undefined ? l.subOutcome : ctx.body.subOutcome;
      if (oc){ checkOutcome(oc, sc); setLeadOutcome(ctx, l, oc, sc, now(), 'manual'); }
    }
    const d = H.diff(l, b);
    Object.assign(l, b, { updatedAt: now() });
    if (d) H.audit(ctx, `Lead updated: ${l.name}`, 'Leads', l.id, d.oldV, d.newV);
    if (stage) setStage(ctx, l, stage);
    if (ctx.body.counsellorId !== undefined && ctx.body.counsellorId !== l.counsellorId){ ctx.need('leads.assign'); doAssign(ctx, l, pickCounsellor(ctx, l, 'manual', { counsellorId: ctx.body.counsellorId }), 'manual'); }
    refreshLead(l); db.update('leads', l.id, {});
    return { lead: l };
  });
  R('POST', '/leads/assign', 'leads.assign', (ctx) => {
    const { ids, method, counsellorId, teamId } = ctx.body;
    if (!Array.isArray(ids) || !ids.length) throw new HttpError(422, 'Select at least one lead');
    let changed = 0; const tally = {};
    ids.forEach(id => { const l = H.mustSeeLead(ctx, id); const u = pickCounsellor(ctx, l, method, { counsellorId, teamId });
      if (!u) throw new HttpError(422, 'No active counsellor is available for this assignment method');
      if (doAssign(ctx, l, u, method)){ changed++; tally[u.fullName] = (tally[u.fullName] || 0) + 1; refreshLead(l); } });
    db.update('leads', ids[0], {});
    return { changed, distribution: tally };
  });
  R('POST', '/leads/bulk', 'leads.view', (ctx) => {
    const { ids, action, value } = ctx.body;
    if (!Array.isArray(ids) || !ids.length) throw new HttpError(422, 'Select at least one lead');
    const leads = ids.map(id => H.mustSeeLead(ctx, id));
    if (action === 'stage'){ ctx.need('leads.edit'); leads.forEach(l => setStage(ctx, l, value)); }
    else if (action === 'priority'){ ctx.need('leads.edit'); leads.forEach(l => { const o = l.priority; l.priority = value; H.audit(ctx, 'Priority changed', 'Leads', l.id, o, value); }); }
    else if (action === 'campaign'){ ctx.need('leads.edit'); const c = value && db.get('campaigns', value); leads.forEach(l => { const o = l.campaignId; l.campaignId = c ? c.id : ''; H.audit(ctx, 'Campaign changed', 'Leads', l.id, o, l.campaignId); }); }
    else if (action === 'archive' || action === 'restore'){ ctx.need('leads.archive'); leads.forEach(l => { const o = l.status; l.status = action === 'archive' ? 'Archived' : 'Active'; H.audit(ctx, `Lead ${action === 'archive' ? 'archived' : 'restored'}`, 'Leads', l.id, o, l.status); }); }
    else if (action === 'followup'){
      ctx.need('followups.manage'); if (!V.isDate(value && value.dueAt)) throw new HttpError(422, 'Pick a follow-up date and time');
      leads.forEach(l => { db.insert('followups', { leadId: l.id, counsellorId: l.counsellorId || ctx.user.id, dueAt: new Date(value.dueAt).toISOString(), reason: value.reason || 'Callback', notes: value.notes || '', status: 'Pending', completedAt: null, createdAt: now(), createdBy: ctx.user.id }); });
      H.audit(ctx, `Bulk follow-up scheduled for ${leads.length} leads`, 'Follow-ups', ids.join(',').slice(0, 60));
    } else throw new HttpError(422, 'Unknown bulk action');
    leads.forEach(l => { l.updatedAt = now(); refreshLead(l); }); db.update('leads', leads[0].id, {});
    return { changed: leads.length };
  });
  R('GET', '/leads/:id/duplicates', 'leads.view', (ctx) => { const l = H.mustSeeLead(ctx, ctx.params.id); return findDuplicates(l.mobile, l.email, l.id).concat(findDuplicates(l.mobile, l.email, l.studentId, 'students')); });
  R('POST', '/leads/merge', 'leads.merge', (ctx) => {
    const p = H.mustSeeLead(ctx, ctx.body.primaryId), d = H.mustSeeLead(ctx, ctx.body.duplicateId);
    if (p.id === d.id) throw new HttpError(422, 'Cannot merge a lead into itself');
    ['calls', 'followups', 'notes', 'applications', 'activities'].forEach(t => db.all(t).forEach(r => { if (r.leadId === d.id){ r.leadId = p.id; db.update(t, r.id, {}); } }));
    LEAD_FIELDS.forEach(f => { if (!p[f] && d[f]) p[f] = d[f]; });
    if (!p.studentId && d.studentId){ p.studentId = d.studentId; const s = db.get('students', d.studentId); if (s) s.leadId = p.id; }
    d.status = 'Archived'; d.mergedInto = p.id; setStage(ctx, d, 'Duplicate');
    refreshLead(p); db.update('leads', p.id, { updatedAt: now() });
    H.audit(ctx, `Lead ${d.id} merged into ${p.id}`, 'Leads', p.id, d.id, p.id); H.activity(p.id, p.studentId, 'merge', `Merged duplicate lead ${d.id}`, ctx.user.id);
    return { lead: p };
  });
  R('POST', '/leads/:id/convert', 'leads.convert', (ctx) => {
    const l = H.mustSeeLead(ctx, ctx.params.id);
    if (l.studentId && db.get('students', l.studentId)) return { student: db.get('students', l.studentId), existing: true };
    if (ctx.body.linkStudentId){ const s = H.mustSeeStudent(ctx, ctx.body.linkStudentId); l.studentId = s.id; H.audit(ctx, `Lead linked to existing student ${s.id}`, 'Leads', l.id, '', s.id); return { student: s, existing: true }; }
    if (!ctx.body.force){ const d = findDuplicates(l.mobile, l.email, null, 'students'); if (d.length) throw new HttpError(409, 'Possible duplicate student found', { duplicates: d }); }
    const c = l.courseId && db.get('courses', l.courseId);
    const s = db.insert('students', { leadId: l.id, fullName: l.name, fatherName: '', motherName: '', dob: '', gender: '', mobile: l.mobile, altMobile: '', whatsapp: l.whatsapp, email: l.email,
      address: '', city: l.city, state: l.state, country: 'India', pin: '', highestQualification: l.qualification, board: '', passingYear: l.passingYear, percentage: '', cgpa: '', graduation: '', postGraduation: '', workExperience: '',
      prefUniversityId: l.universityId, prefCampusId: l.campusId, prefCourseId: l.courseId, learningMode: c ? c.mode : '', intake: c ? c.intake : '', prefLocation: l.city, budget: '',
      counsellorId: l.counsellorId || ctx.user.id, createdAt: now(), updatedAt: now(), createdBy: ctx.user.id });
    l.studentId = s.id; setStage(ctx, l, 'Qualified', { advanceOnly: true }); refreshLead(l); db.update('leads', l.id, { updatedAt: now() });
    H.audit(ctx, `Lead converted to student ${s.id}`, 'Leads', l.id, l.id, s.id); H.activity(l.id, s.id, 'convert', `Converted to student ${s.id} (lead history retained)`, ctx.user.id);
    return { student: s };
  });

  /* Import — preview + commit in batches so the UI can show real progress */
  function normRow(r){ const o = {}; Object.keys(r).forEach(k => (o[k] = typeof r[k] === 'string' ? r[k].trim() : r[k])); return o; }
  function classify(rows, defaultSource){
    const seenM = new Set(), seenE = new Set();
    return rows.map((raw, i) => {
      const r = normRow(raw); const res = { index: i, status: 'new', reason: '', matchId: null };
      if (!r.name) return Object.assign(res, { status: 'invalid', reason: 'Student name missing' });
      if (!V.isMobile(r.mobile)) return Object.assign(res, { status: 'invalid', reason: r.mobile ? 'Invalid mobile number' : 'Mobile missing' });
      if (r.email && !V.isEmail(r.email)) return Object.assign(res, { status: 'invalid', reason: 'Invalid email' });
      if (!r.source && !defaultSource) return Object.assign(res, { status: 'invalid', reason: 'Lead source missing' });
      const m = V.normalizeMobile(r.mobile), e = lc(r.email);
      if (r.studentId){ const s = db.get('students', r.studentId); if (s) return Object.assign(res, { status: 'duplicate', reason: 'Student ID exists', matchId: s.leadId || s.id }); }
      const d = findDuplicates(r.mobile, r.email)[0];
      if (d) return Object.assign(res, { status: 'duplicate', reason: V.normalizeMobile(d.mobile) === m ? 'Mobile exists' : 'Email exists', matchId: d.id });
      if (seenM.has(m) || (e && seenE.has(e))) return Object.assign(res, { status: 'duplicate', reason: 'Repeated within file', matchId: null });
      seenM.add(m); if (e) seenE.add(e);
      return res;
    });
  }
  R('POST', '/leads/import/preview', 'leads.import', (ctx) => {
    const rows = ctx.body.rows || []; const res = classify(rows, canonicalSource(ctx.body.defaultSource));
    return { results: res, summary: { total: rows.length, new: res.filter(r => r.status === 'new').length, duplicate: res.filter(r => r.status === 'duplicate').length, invalid: res.filter(r => r.status === 'invalid').length } };
  });
  R('POST', '/leads/import', 'leads.import', (ctx) => {
    const rows = (ctx.body.rows || []).map(normRow); const mode = ctx.body.duplicateMode || 'skip'; const asg = ctx.body.assignment || { method: 'none' };
    if (rows.length > 1000) throw new HttpError(413, 'Send at most 1000 rows per request');
    const res = classify(rows, canonicalSource(ctx.body.defaultSource)); const out = { created: 0, updated: 0, skipped: 0, invalid: 0, errors: [], distribution: {} };
    const st = H.settings();
    // 'agents': rotate through the agents chosen in the wizard; offset carries the rotation across batches
    let agents = [], turn = 0;
    if (asg.method === 'agents' && ctx.can('leads.assign') && ctx.scope !== 'own'){
      agents = (asg.agentIds || []).map(id => db.get('users', id)).filter(u => u && u.status === 'Active' && WORKING.includes(u.role));
      if (!agents.length) throw new HttpError(422, 'Select at least one active agent to distribute leads to');
      turn = Number(asg.offset) || 0;
    }
    rows.forEach((r, i) => {
      const c = res[i];
      if (c.status === 'invalid'){ out.invalid++; out.errors.push({ row: r.__row || i + 1, reason: c.reason }); return; }
      const m = resolveMasters(r);
      const base = { name: r.name, mobile: V.normalizeMobile(r.mobile) || r.mobile, whatsapp: r.whatsapp || r.mobile, email: r.email || '', source: canonicalSource(r.source || ctx.body.defaultSource),
        campaignId: m.campaignId || '', universityId: m.universityId || '', campusId: m.campusId || '', courseId: m.courseId || '', preferredCourse: m.preferredCourse || '',
        state: NL.geo.resolveState(r.state, r.city), city: r.city || '', qualification: r.qualification || '', passingYear: /^(19|20)\d{2}$/.test(r.passingYear || '') ? r.passingYear : '',
        priority: st.priorities.includes(r.priority) ? r.priority : 'Medium', remarks: r.remarks || '' };
      if (c.status === 'duplicate'){
        if (mode === 'update' && c.matchId){
          const l = db.get('leads', c.matchId); if (!l || !H.leadVisible(ctx, l)){ out.skipped++; return; }
          const patch = {}; Object.keys(base).forEach(k => { if (base[k] && k !== 'mobile' && base[k] !== l[k]) patch[k] = base[k]; });
          const d = H.diff(l, patch); Object.assign(l, patch, { updatedAt: now() }); refreshLead(l);
          if (d) H.audit(ctx, 'Lead updated via import', 'Leads', l.id, d.oldV, d.newV); out.updated++;
        } else out.skipped++;
        return;
      }
      const l = db.insert('leads', Object.assign(base, { stage: 'New', status: 'Active', studentId: null, counsellorId: null, teamId: null, teamLeaderId: null, assignedAt: null, assignmentMethod: null,
        assignmentHistory: [], stageHistory: [{ stage: 'New', at: now(), by: ctx.user.id }], lastContactAt: null, nextFollowupAt: null, createdAt: now(), updatedAt: now(), createdBy: ctx.user.id, importBatch: ctx.body.batchId || null, score: 0 }));
      if (ctx.scope === 'team') l.teamId = ctx.user.teamId;
      try {
        if (!ctx.can('leads.assign') || ctx.scope === 'own') doAssign(ctx, l, ctx.user, 'manual');
        else if (asg.method === 'file' && m.counsellor) doAssign(ctx, l, m.counsellor, 'manual');
        else if (asg.method === 'agents') doAssign(ctx, l, agents[turn++ % agents.length], 'round_robin');
        else if (asg.method && !['none', 'file'].includes(asg.method)) doAssign(ctx, l, pickCounsellor(ctx, l, asg.method, asg), asg.method);
      } catch (e){ out.errors.push({ row: r.__row || i + 1, reason: 'Created but not assigned: ' + e.message }); }
      if (l.counsellorId){ const n = H.userName(l.counsellorId); out.distribution[n] = (out.distribution[n] || 0) + 1; }
      refreshLead(l); out.created++;
    });
    if (agents.length) out.nextOffset = turn % agents.length;
    H.audit(ctx, `Lead import batch: ${out.created} created, ${out.updated} updated, ${out.skipped} skipped, ${out.invalid} invalid`, 'Lead Import', ctx.body.batchId || '-', '', ctx.body.fileName || '');
    return out;
  });

  /* ============================================================
     STUDENTS
     ============================================================ */
  const STUDENT_FIELDS = ['fullName','fatherName','motherName','dob','gender','mobile','altMobile','whatsapp','email','address','city','state','country','pin','highestQualification','board','passingYear',
    'percentage','cgpa','graduation','postGraduation','workExperience','prefUniversityId','prefCampusId','prefCourseId','learningMode','intake','prefLocation','budget','counsellorId'];
  const STUDENT_RULES = { fullName: ['required', { min: 2 }], mobile: ['required', 'mobile'], altMobile: ['mobile'], whatsapp: ['mobile'], email: ['email'], dob: ['date', (v) => new Date(v) > new Date() ? 'Date of birth cannot be in the future' : ''],
    pin: [(v) => /^\d{6}$/.test(v) ? '' : 'PIN code must be 6 digits'], percentage: [(v) => Number(v) >= 0 && Number(v) <= 100 ? '' : 'Percentage must be 0–100'], cgpa: [(v) => Number(v) >= 0 && Number(v) <= 10 ? '' : 'CGPA must be 0–10'], budget: ['amount'] };
  R('GET', '/students', 'students.view', (ctx) => {
    const x = L(); const rows = db.all('students').filter(s => H.studentVisible(ctx, s)).map(s => decStudent(s, x));
    return H.list(rows, ctx.query, { search: ['fullName', 'mobile', 'email', 'id', 'leadId', 'city', 'counsellorName', 'prefCourseName'], filters: ['counsellorId', 'prefUniversityId', 'prefCampusId', 'prefCourseId', 'state', 'city', 'learningMode', 'gender'] });
  });
  R('GET', '/students/:id', 'students.view', (ctx) => {
    const s = H.mustSeeStudent(ctx, ctx.params.id); const x = L();
    const apps = db.all('applications').filter(a => a.studentId === s.id); const lead = s.leadId && db.get('leads', s.leadId);
    const calls = lead ? db.all('calls').filter(c => c.leadId === lead.id) : []; const fus = lead ? db.all('followups').filter(f => f.leadId === lead.id) : [];
    const pays = db.all('payments').filter(p => p.studentId === s.id);
    const refIds = new Set([s.id, s.leadId].concat(apps.map(a => a.id)).filter(Boolean));
    return { student: decStudent(s, x), lead: lead ? decLead(lead, x) : null, applications: apps.map(a => decApp(a, x)), documents: db.all('documents').filter(d => d.studentId === s.id).map(d => decDoc(d, x)),
      payments: pays.map(p => decPay(p, x)), notes: db.all('notes').filter(n => n.studentId === s.id || (lead && n.leadId === lead.id)).map(n => decNote(n, x)).sort((a, b) => a.createdAt < b.createdAt ? 1 : -1),
      calls: calls.map(c => decCall(c, x)), followups: fus.map(f => decFu(f, x)), timeline: timeline(lead ? lead.id : null, s.id), milestones: milestones(lead, apps, calls, fus, pays),
      audit: db.all('audit').filter(a => refIds.has(a.recordId)) };
  });
  R('POST', '/students', 'students.create', (ctx) => {
    const b = H.pickFields(ctx.body, STUDENT_FIELDS); H.requireFields(b, STUDENT_RULES, { fullName: 'Full name', mobile: 'Mobile' });
    if (b.state || b.city) b.state = NL.geo.resolveState(b.state, b.city);
    if (ctx.body.mergeInto){
      ctx.need('leads.merge'); const t = H.mustSeeStudent(ctx, ctx.body.mergeInto); const filled = {};
      STUDENT_FIELDS.forEach(f => { if (b[f] && !t[f]){ filled[f] = b[f]; t[f] = b[f]; } }); t.updatedAt = now(); db.update('students', t.id, {});
      H.audit(ctx, 'Duplicate merged into existing student', 'Students', t.id, '', filled); return { student: t, merged: true };
    }
    if (!ctx.body.force){ const d = findDuplicates(b.mobile, b.email, null, 'students'); if (d.length) throw new HttpError(409, 'Possible duplicate student found', { duplicates: d }); }
    const s = db.insert('students', Object.assign({ country: 'India' }, b, { counsellorId: b.counsellorId || ctx.user.id, leadId: null, createdAt: now(), updatedAt: now(), createdBy: ctx.user.id }));
    H.audit(ctx, `Student created: ${s.fullName}`, 'Students', s.id, '', { name: s.fullName, mobile: s.mobile });
    return { student: s };
  });
  R('PATCH', '/students/:id', 'students.edit', (ctx) => {
    const s = H.mustSeeStudent(ctx, ctx.params.id); const b = H.pickFields(ctx.body, STUDENT_FIELDS);
    H.requireFields(Object.assign({}, s, b), STUDENT_RULES, { fullName: 'Full name', mobile: 'Mobile' });
    if (b.counsellorId && b.counsellorId !== s.counsellorId) ctx.need('leads.assign');
    if ('state' in b || 'city' in b) b.state = NL.geo.resolveState(b.state !== undefined ? b.state : s.state, b.city !== undefined ? b.city : s.city);
    const d = H.diff(s, b); if (!d) return { student: s };
    db.update('students', s.id, Object.assign(b, { updatedAt: now() }));
    H.audit(ctx, `Student profile updated: ${s.fullName}`, 'Students', s.id, d.oldV, d.newV);
    return { student: s };
  });

  /* ============================================================
     APPLICATIONS
     ============================================================ */
  const APP_TO_LEAD = { 'Application Started': 'Application Started', 'Application Form Completed': 'Application Submitted', 'Documents Pending': 'Application Submitted', 'Documents Submitted': 'Application Submitted',
    'Documents Under Verification': 'Document Verification', 'Documents Verified': 'Document Verification', 'Payment Pending': 'Payment Pending', 'Payment Completed': 'Paid', 'University Review': 'Paid',
    'Admission Confirmed': 'Admission Confirmed', 'Enrollment Completed': 'Enrolled' };
  const PRIVILEGED_STAGES = ['University Review', 'Admission Confirmed', 'Enrollment Completed', 'Rejected'];
  function recalcDocs(studentId){
    const docs = db.all('documents').filter(d => d.studentId === studentId);
    db.all('applications').filter(a => a.studentId === studentId).forEach(a => {
      const mine = docs; // documents are held at student level and shared across that student's applications
      a.documentsStatus = !mine.length ? 'Pending' : mine.every(d => d.status === 'Verified') ? 'Verified' : mine.some(d => d.status === 'Rejected') ? 'Rejected' : mine.some(d => d.status === 'Pending') ? 'Pending' : 'Submitted';
      a.verificationStatus = !mine.length ? 'Pending' : mine.every(d => d.status === 'Verified') ? 'Verified' : mine.some(d => d.status === 'Rejected') ? 'Rejected' : mine.some(d => ['Uploaded', 'Under Review'].includes(d.status)) ? 'Under Review' : 'Pending';
      db.update('applications', a.id, {});
    });
  }
  function changeAppStage(ctx, a, stage, remarks){
    const st = H.settings().applicationStages; if (!st.includes(stage)) throw new HttpError(422, 'Unknown application stage');
    if (a.stage === stage) return false;
    if (PRIVILEGED_STAGES.includes(stage)) ctx.need('applications.stage'); else ctx.need('applications.edit');
    const old = a.stage;
    a.stage = stage; a.updatedAt = now(); a.stageHistory = (a.stageHistory || []).concat([{ stage, at: now(), by: ctx.user.id, remarks: remarks || '' }]);
    a.admissionStatus = stage === 'Admission Confirmed' ? 'Confirmed' : stage === 'Enrollment Completed' ? 'Enrolled' : stage === 'Rejected' ? 'Rejected' : stage === 'Cancelled' ? 'Cancelled' : 'In Progress';
    if (['Payment Completed', 'University Review', 'Admission Confirmed', 'Enrollment Completed'].includes(stage) && a.paymentStatus !== 'Paid') a.paymentStatus = 'Paid';
    if (stage === 'Payment Pending' && a.paymentStatus === 'Not Due') a.paymentStatus = 'Pending';
    db.update('applications', a.id, {});
    H.audit(ctx, `Application status changed from ${old} to ${stage}`, 'Applications', a.id, old, stage);
    const lead = a.leadId && db.get('leads', a.leadId);
    if (lead && APP_TO_LEAD[stage]){ setStage(ctx, lead, APP_TO_LEAD[stage], { advanceOnly: true }); refreshLead(lead); db.update('leads', lead.id, {}); }
    const s = db.get('students', a.studentId) || {}; const tl = lead && lead.teamLeaderId;
    if (stage === 'Application Form Completed' || stage === 'Documents Submitted'){ H.notify(tl, 'application_submitted', 'Application submitted', `${s.fullName} · ${a.id}`, '#/applications/' + a.id); }
    if (stage === 'Admission Confirmed'){ [a.counsellorId, tl].forEach(u => H.notify(u, 'admission_confirmed', 'Admission confirmed 🎓', `${s.fullName} · ${a.id}`, '#/applications/' + a.id)); }
    return true;
  }
  R('GET', '/applications', 'applications.view', (ctx) => {
    const x = L(); const rows = db.all('applications').filter(a => H.appVisible(ctx, a)).map(a => decApp(a, x));
    const q = ctx.query; let r = rows;
    if (q.stageGroup === 'open') r = r.filter(a => !['Enrollment Completed', 'Rejected', 'Cancelled'].includes(a.stage));
    return H.list(r, q, { search: ['id', 'applicationNo', 'studentName', 'studentMobile', 'studentId', 'leadId', 'courseName', 'universityName'],
      filters: ['stage', 'universityId', 'campusId', 'courseId', 'counsellorId', 'documentsStatus', 'paymentStatus', 'verificationStatus', 'admissionStatus', 'studentId'] });
  });
  R('GET', '/applications/:id', 'applications.view', (ctx) => {
    const a = db.get('applications', ctx.params.id); if (!a) throw new HttpError(404, 'Application not found'); if (!H.appVisible(ctx, a)) throw new HttpError(403, 'You do not have access to this application');
    const x = L();
    return { application: decApp(a, x), student: decStudent(db.get('students', a.studentId) || {}, x), documents: db.all('documents').filter(d => d.studentId === a.studentId).map(d => decDoc(d, x)),
      payments: db.all('payments').filter(p => p.applicationId === a.id).map(p => decPay(p, x)), course: db.get('courses', a.courseId), audit: db.all('audit').filter(z => z.recordId === a.id) };
  });
  R('POST', '/applications', 'applications.create', (ctx) => {
    const b = H.pickFields(ctx.body, ['studentId', 'universityId', 'campusId', 'courseId', 'applicationDate', 'applicationNo']);
    H.requireFields(b, { studentId: ['required'], universityId: ['required'], courseId: ['required'], applicationDate: ['date'] }, { studentId: 'Student', universityId: 'University', courseId: 'Course' });
    const s = H.mustSeeStudent(ctx, b.studentId); const c = db.get('courses', b.courseId);
    if (!c || c.universityId !== b.universityId) throw new HttpError(422, 'Course does not belong to the selected university', { errors: { courseId: 'Pick a course of this university' } });
    if (c.status !== 'Active') throw new HttpError(422, 'This course is not open for applications');
    const dupe = db.all('applications').find(a => a.studentId === s.id && a.courseId === c.id && !['Rejected', 'Cancelled'].includes(a.stage));
    if (dupe && !ctx.body.force) throw new HttpError(409, `${s.fullName} already has an open application (${dupe.id}) for this course`, { duplicates: [{ id: dupe.id, kind: 'application', name: s.fullName, mobile: s.mobile, email: s.email, studentId: s.id }] });
    const u = db.get('universities', c.universityId);
    const a = db.insert('applications', { applicationNo: b.applicationNo || `${u.code}/${new Date().getFullYear()}/${Math.floor(100000 + Math.random() * 900000)}`, studentId: s.id, leadId: s.leadId || null,
      universityId: c.universityId, campusId: b.campusId || c.campusId, courseId: c.id, applicationDate: b.applicationDate || NL.fmt.ymd(new Date()), stage: 'Application Started', counsellorId: s.counsellorId || ctx.user.id,
      documentsStatus: 'Pending', paymentStatus: 'Not Due', verificationStatus: 'Pending', admissionStatus: 'In Progress', stageHistory: [{ stage: 'Application Started', at: now(), by: ctx.user.id }], createdAt: now(), updatedAt: now(), createdBy: ctx.user.id });
    const have = new Set(db.all('documents').filter(d => d.studentId === s.id).map(d => d.type));
    H.settings().requiredDocuments.forEach(type => { if (type === 'Graduation Certificate' && c.degreeType !== 'PG') return; if (!have.has(type)) db.insert('documents', { studentId: s.id, applicationId: a.id, type, fileName: '', fileSize: 0, status: 'Pending', uploadedAt: null, uploadedBy: null, reviewedBy: null, reviewedAt: null, rejectionReason: '', remarks: '', createdAt: now() }); });
    recalcDocs(s.id);
    H.audit(ctx, `Application created for ${s.fullName}: ${c.name} (${u.name})`, 'Applications', a.id, '', { course: c.name, university: u.name });
    const lead = s.leadId && db.get('leads', s.leadId);
    if (lead){ setStage(ctx, lead, 'Application Started', { advanceOnly: true }); refreshLead(lead); db.update('leads', lead.id, {}); }
    return { application: a };
  });
  R('PATCH', '/applications/:id', 'applications.edit', (ctx) => {
    const a = db.get('applications', ctx.params.id); if (!a || !H.appVisible(ctx, a)) throw new HttpError(404, 'Application not found');
    const b = H.pickFields(ctx.body, ['applicationNo', 'applicationDate', 'campusId', 'counsellorId']);
    if (b.counsellorId && b.counsellorId !== a.counsellorId) ctx.need('leads.assign');
    const d = H.diff(a, b); if (!d) return { application: a };
    db.update('applications', a.id, Object.assign(b, { updatedAt: now() })); H.audit(ctx, 'Application updated', 'Applications', a.id, d.oldV, d.newV);
    return { application: a };
  });
  R('POST', '/applications/:id/stage', ['applications.edit', 'applications.stage'], (ctx) => {
    const a = db.get('applications', ctx.params.id); if (!a || !H.appVisible(ctx, a)) throw new HttpError(404, 'Application not found');
    changeAppStage(ctx, a, ctx.body.stage, ctx.body.remarks); return { application: a };
  });

  /* ============================================================
     DOCUMENTS — upload metadata + verification
     ============================================================ */
  R('GET', '/documents', 'documents.view', (ctx) => {
    const x = L(); const vis = H.visibleStudentIds(ctx);
    const rows = db.all('documents').filter(d => !vis || vis.has(d.studentId)).map(d => decDoc(d, x));
    return H.list(rows, ctx.query, { search: ['studentName', 'studentId', 'type', 'fileName', 'applicationNo', 'applicationId', 'id'], filters: ['status', 'type', 'studentId', 'applicationId', 'universityId', 'counsellorId'], sort: ctx.query.sort || 'uploadedAt' });
  });
  R('POST', '/documents', 'documents.upload', (ctx) => {
    const b = H.pickFields(ctx.body, ['studentId', 'applicationId', 'type', 'fileName', 'fileSize', 'mime', 'remarks']);
    H.requireFields(b, { studentId: ['required'], type: ['required'], fileName: ['required'] }, { studentId: 'Student', type: 'Document type', fileName: 'File' });
    const s = H.mustSeeStudent(ctx, b.studentId);
    if (!H.settings().documentTypes.includes(b.type)) throw new HttpError(422, 'Unknown document type');
    const ext = String(b.fileName).split('.').pop().toLowerCase(); const U = NL.config.UPLOAD;
    if (!U.EXTENSIONS.includes(ext) || (b.mime && !U.ACCEPT.includes(b.mime))) throw new HttpError(415, 'Only PDF, JPG and PNG files are accepted');
    if (Number(b.fileSize) > U.MAX_BYTES) throw new HttpError(413, `File exceeds the ${NL.fmt.bytes(U.MAX_BYTES)} limit`);
    const safeName = String(b.fileName).replace(/[^\w.\-]+/g, '_').slice(-120);
    let d = db.all('documents').find(x => x.studentId === s.id && x.type === b.type && ['Pending', 'Rejected'].includes(x.status));
    const patch = { fileName: safeName, fileSize: Number(b.fileSize) || 0, mime: b.mime || '', status: 'Uploaded', uploadedAt: now(), uploadedBy: ctx.user.id, reviewedBy: null, reviewedAt: null, rejectionReason: '', remarks: b.remarks || '' };
    if (d && b.type !== 'Other'){ db.update('documents', d.id, patch); }
    else d = db.insert('documents', Object.assign({ studentId: s.id, applicationId: b.applicationId || (db.all('applications').find(a => a.studentId === s.id) || {}).id || null, type: b.type, createdAt: now() }, patch));
    recalcDocs(s.id);
    H.audit(ctx, `${b.type} uploaded for ${s.fullName}`, 'Documents', d.id, '', safeName);
    return { document: d };
  });
  R('POST', '/documents/:id/review', 'documents.verify', (ctx) => {
    const d = db.get('documents', ctx.params.id); if (!d) throw new HttpError(404, 'Document not found');
    const { status, reason, remarks } = ctx.body;
    if (!['Verified', 'Rejected', 'Under Review'].includes(status)) throw new HttpError(422, 'Invalid review status');
    if (d.status === 'Pending') throw new HttpError(422, 'Nothing has been uploaded for this document yet');
    if (status === 'Rejected' && !String(reason || '').trim()) throw new HttpError(422, 'A rejection reason is required', { errors: { reason: 'Rejection reason is required' } });
    const old = d.status;
    db.update('documents', d.id, { status, rejectionReason: status === 'Rejected' ? reason.trim() : '', remarks: remarks || '', reviewedBy: status === 'Under Review' ? d.reviewedBy : ctx.user.id, reviewedAt: status === 'Under Review' ? d.reviewedAt : now() });
    recalcDocs(d.studentId);
    const s = db.get('students', d.studentId) || {};
    H.audit(ctx, `Document ${d.type} ${status.toLowerCase()} for ${s.fullName}`, 'Documents', d.id, old, status + (status === 'Rejected' ? ` — ${reason}` : ''));
    if (status === 'Rejected') H.notify(s.counsellorId, 'document_rejected', 'Document rejected', `${s.fullName}: ${d.type} — ${reason}`, '#/students/' + s.id);
    db.all('applications').filter(a => a.studentId === d.studentId).forEach(a => {
      const order = H.settings().applicationStages;
      if (a.verificationStatus === 'Verified' && order.indexOf(a.stage) < order.indexOf('Documents Verified') && !['Rejected', 'Cancelled'].includes(a.stage)){
        a.stage = 'Documents Verified'; a.stageHistory.push({ stage: 'Documents Verified', at: now(), by: ctx.user.id, remarks: 'All documents verified' });
        const lead = a.leadId && db.get('leads', a.leadId); if (lead){ setStage(ctx, lead, 'Document Verification', { advanceOnly: true }); refreshLead(lead); }
      } else if (status !== 'Rejected' && ['Documents Pending', 'Documents Submitted'].includes(a.stage) && a.verificationStatus === 'Under Review'){
        a.stage = 'Documents Under Verification'; a.stageHistory.push({ stage: a.stage, at: now(), by: ctx.user.id });
      }
    });
    return { document: d };
  });

  /* ============================================================
     PAYMENTS
     ============================================================ */
  function recalcPayment(appId){
    const a = db.get('applications', appId); if (!a) return;
    const c = db.get('courses', a.courseId) || {};
    const pays = db.all('payments').filter(p => p.applicationId === appId);
    const paid = pays.filter(p => p.status === 'Successful').reduce((s, p) => s + p.amount, 0);
    const partial = pays.some(p => p.status === 'Partially Paid');
    const due = (c.applicationFee || 0) + (c.semesterFee || 0);
    a.paymentStatus = paid >= due && due > 0 ? 'Paid' : paid > 0 || partial ? 'Partially Paid' : pays.some(p => ['Pending', 'Initiated', 'Failed'].includes(p.status)) ? 'Pending' : a.paymentStatus === 'Paid' ? 'Paid' : a.paymentStatus;
    db.update('applications', a.id, {});
    return a;
  }
  R('GET', '/payments', 'payments.view', (ctx) => {
    const x = L(); const vis = H.visibleStudentIds(ctx);
    const rows = db.all('payments').filter(p => !vis || vis.has(p.studentId)).map(p => decPay(p, x));
    return H.list(rows, ctx.query, { search: ['id', 'studentName', 'transactionId', 'receiptNo', 'applicationNo', 'applicationId', 'studentId'], filters: ['status', 'mode', 'type', 'universityId', 'courseId', 'studentId', 'applicationId', 'counsellorId'], dateField: ctx.query.dateField || 'paymentDate', sort: ctx.query.sort || 'paymentDate' });
  });
  R('POST', '/payments', 'payments.create', (ctx) => {
    const b = H.pickFields(ctx.body, ['applicationId', 'amount', 'type', 'mode', 'transactionId', 'paymentDate', 'status', 'remarks']);
    H.requireFields(b, { applicationId: ['required'], amount: ['required', 'positive', { max: 5000000 }], type: ['required'], mode: ['required'], paymentDate: ['required', 'date'], status: ['required'] },
      { applicationId: 'Application', amount: 'Amount', type: 'Payment type', mode: 'Payment mode', paymentDate: 'Payment date', status: 'Status' });
    if (new Date(b.paymentDate) > new Date(Date.now() + 86400000)) throw new HttpError(422, 'Payment date cannot be in the future', { errors: { paymentDate: 'Cannot be in the future' } });
    if (['Successful', 'Partially Paid'].includes(b.status) && !b.transactionId && b.mode !== 'Cash') throw new HttpError(422, 'Transaction ID is required for successful non-cash payments', { errors: { transactionId: 'Transaction ID is required' } });
    if (!['Pending', 'Initiated', 'Successful', 'Failed', 'Partially Paid'].includes(b.status)) throw new HttpError(422, 'Invalid status');
    const a = db.get('applications', b.applicationId); if (!a || !H.appVisible(ctx, a)) throw new HttpError(404, 'Application not found');
    if (b.transactionId && db.all('payments').some(p => p.transactionId && lc(p.transactionId) === lc(b.transactionId) && p.status !== 'Refunded')) throw new HttpError(409, 'A payment with this transaction ID already exists', { errors: { transactionId: 'Duplicate transaction ID' } });
    const ok = ['Successful', 'Partially Paid'].includes(b.status);
    const p = db.insert('payments', Object.assign(b, { amount: Number(b.amount), paymentDate: new Date(b.paymentDate).toISOString(), studentId: a.studentId, universityId: a.universityId, courseId: a.courseId,
      receiptNo: ok ? 'RCPT-' + Math.floor(100000 + Math.random() * 900000) : '', verifiedBy: null, verifiedAt: null, createdAt: now(), createdBy: ctx.user.id }));
    recalcPayment(a.id);
    if (ok && ['Payment Pending', 'Documents Verified', 'Documents Under Verification', 'Documents Submitted', 'Documents Pending', 'Application Form Completed', 'Application Started'].includes(a.stage) && a.paymentStatus === 'Paid') changeAppStage(Object.assign({}, ctx, { can: () => true, need: () => {} }), a, 'Payment Completed', 'Auto: payment received');
    const s = db.get('students', a.studentId) || {};
    H.audit(ctx, `Payment ${p.status.toLowerCase()}: ${NL.fmt.money(p.amount)} for ${a.id}`, 'Payments', p.id, '', { amount: p.amount, status: p.status, mode: p.mode });
    if (ok) [a.counsellorId].concat(db.all('users').filter(u => u.role === 'finance').map(u => u.id)).forEach(u => H.notify(u, 'payment_received', 'Payment received', `${NL.fmt.money(p.amount)} from ${s.fullName} (${a.id})`, '#/payments?q=' + p.id));
    return { payment: p };
  });
  R('POST', '/payments/:id/verify', 'payments.verify', (ctx) => {
    const p = db.get('payments', ctx.params.id); if (!p) throw new HttpError(404, 'Payment not found');
    if (['Refunded', 'Failed'].includes(p.status)) throw new HttpError(422, `Cannot verify a ${p.status.toLowerCase()} payment`);
    const old = p.status; const patch = { verifiedBy: ctx.user.id, verifiedAt: now() };
    if (['Pending', 'Initiated'].includes(p.status)){ if (!ctx.body.transactionId && !p.transactionId && p.mode !== 'Cash') throw new HttpError(422, 'Enter the transaction ID to confirm this payment', { errors: { transactionId: 'Required' } }); patch.status = 'Successful'; patch.transactionId = ctx.body.transactionId || p.transactionId; patch.receiptNo = p.receiptNo || 'RCPT-' + Math.floor(100000 + Math.random() * 900000); }
    db.update('payments', p.id, patch); const a = recalcPayment(p.applicationId);
    if (a && patch.status === 'Successful' && a.paymentStatus === 'Paid' && H.settings().applicationStages.indexOf(a.stage) < H.settings().applicationStages.indexOf('Payment Completed') && !['Rejected', 'Cancelled'].includes(a.stage)) changeAppStage(Object.assign({}, ctx, { can: () => true, need: () => {} }), a, 'Payment Completed', 'Auto: payment verified');
    H.audit(ctx, `Payment verified (${p.id})`, 'Payments', p.id, old, p.status);
    if (patch.status === 'Successful' && a) H.notify(a.counsellorId, 'payment_received', 'Payment received', `${NL.fmt.money(p.amount)} verified for ${a.id}`, '#/payments?q=' + p.id);
    return { payment: p };
  });
  R('POST', '/payments/:id/refund', 'payments.refund', (ctx) => {
    const p = db.get('payments', ctx.params.id); if (!p) throw new HttpError(404, 'Payment not found');
    if (!['Successful', 'Partially Paid'].includes(p.status)) throw new HttpError(422, 'Only successful payments can be refunded');
    if (!String(ctx.body.reason || '').trim()) throw new HttpError(422, 'Refund reason is required', { errors: { reason: 'Required' } });
    const old = p.status; db.update('payments', p.id, { status: 'Refunded', remarks: ctx.body.reason.trim(), refundedAt: now(), refundedBy: ctx.user.id });
    recalcPayment(p.applicationId);
    H.audit(ctx, `Payment refunded: ${NL.fmt.money(p.amount)}`, 'Payments', p.id, old, 'Refunded — ' + ctx.body.reason.trim());
    return { payment: p };
  });
  R('PATCH', '/payments/:id', 'payments.verify', (ctx) => {
    const p = db.get('payments', ctx.params.id); if (!p) throw new HttpError(404, 'Payment not found');
    const b = H.pickFields(ctx.body, ['status', 'remarks', 'transactionId']);
    if (b.status && !['Pending', 'Initiated', 'Failed'].includes(b.status)) throw new HttpError(422, 'Use Verify or Refund for that status change');
    const d = H.diff(p, b); if (!d) return { payment: p };
    db.update('payments', p.id, b); recalcPayment(p.applicationId); H.audit(ctx, 'Payment updated', 'Payments', p.id, d.oldV, d.newV); return { payment: p };
  });

  /* ============================================================
     CALLS / FOLLOW-UPS / NOTES
     ============================================================ */
  R('GET', '/calls', 'calls.view', (ctx) => {
    const x = L(); const rows = db.all('calls').filter(c => H.ownerVisible(ctx, c.counsellorId) || H.leadVisible(ctx, x.leads.get(c.leadId))).map(c => decCall(c, x));
    return H.list(rows, ctx.query, { search: ['leadName', 'leadMobile', 'id', 'leadId', 'notes', 'counsellorName'], filters: ['counsellorId', 'outcome', 'subOutcome', 'type', 'leadId', 'teamId'], dateField: 'startAt', sort: ctx.query.sort || 'startAt' });
  });
  R('POST', '/calls', 'calls.create', (ctx) => {
    const b = H.pickFields(ctx.body, ['leadId', 'type', 'outcome', 'subOutcome', 'disposition', 'startAt', 'duration', 'notes', 'nextFollowupAt', 'followupReason']);
    // API clients still sending a legacy disposition are mapped onto the outcome master.
    if (!b.outcome && b.disposition){ const m = NL.outcomes.fromDisposition(b.disposition); if (m){ b.outcome = m.outcome; b.subOutcome = b.subOutcome || m.subOutcome || NL.outcomes.subOutcomesFor(m.outcome)[0].value; } }
    H.requireFields(b, { leadId: ['required'], type: ['required'], outcome: ['required'], startAt: ['required', 'date'], duration: ['amount', { max: 36000 }], nextFollowupAt: ['date'] }, { leadId: 'Lead', type: 'Call type', outcome: 'Outcome', startAt: 'Start time', duration: 'Duration' });
    checkOutcome(b.outcome, b.subOutcome);
    if (b.nextFollowupAt && new Date(b.nextFollowupAt) < new Date(Date.now() - 60000)) throw new HttpError(422, 'Next follow-up must be in the future', { errors: { nextFollowupAt: 'Must be in the future' } });
    const l = H.mustSeeLead(ctx, b.leadId);
    const c = recordCall(ctx, l, b, !!ctx.body.applyStage);
    return { call: c };
  });
  /* Outcome + sub-outcome must come from the central outcome master (active outcomes only). */
  function checkOutcome(outcome, subOutcome){
    try { NL.outcomes.validateOutcome(outcome, subOutcome); }
    catch (e){ const sub = /sub/i.test(e.message); throw new HttpError(422, 'Please correct the highlighted fields', { errors: { [sub ? 'subOutcome' : 'outcome']: sub ? 'Select a sub outcome' : 'Select an outcome from the list' } }); }
  }
  /* Lead outcome = the latest recorded outcome (from a call, call feedback, follow-up completion or a manual edit). */
  function setLeadOutcome(ctx, l, outcome, subOutcome, at, source){
    if (!outcome) return;
    at = at || now();
    if (l.outcomeAt && at < l.outcomeAt) return; // an older call never overwrites a newer outcome
    const before = l.outcome ? NL.outcomes.label(l.outcome, l.subOutcome) : '';
    Object.assign(l, { outcome, subOutcome: subOutcome || '', outcomeAt: at, outcomeBy: ctx.user ? ctx.user.id : null, outcomeSource: source });
    const after = NL.outcomes.label(outcome, subOutcome);
    if (before !== after) H.audit(ctx, `Lead outcome: ${after}`, 'Leads', l.id, before, after);
  }
  /* Records a call against a lead: call log, stage progression, optional next follow-up, audit. */
  function recordCall(ctx, l, b, applyStage){
    const start = new Date(b.startAt).getTime(); const dur = Math.round(Number(b.duration) || 0);
    const c = db.insert('calls', { leadId: l.id, counsellorId: ctx.user.id, startAt: new Date(start).toISOString(), endAt: new Date(start + dur * 1000).toISOString(), duration: dur, type: b.type, outcome: b.outcome, subOutcome: b.subOutcome || '',
      notes: b.notes || '', nextFollowupAt: b.nextFollowupAt ? new Date(b.nextFollowupAt).toISOString() : null, createdAt: now(), provider: 'manual' });
    setLeadOutcome(ctx, l, b.outcome, b.subOutcome, c.startAt, 'call');
    if (NL.outcomes.isConnected(b.outcome)){ l.lastContactAt = c.startAt; setStage(ctx, l, 'Contacted', { advanceOnly: true }); }
    const rule = NL.outcomes.stageRule(b.outcome, b.subOutcome); // lead-stage rules live in the outcome master
    if (rule && rule.advanceOnly) setStage(ctx, l, rule.stage, { advanceOnly: true });
    else if (rule && applyStage) setStage(ctx, l, rule.stage);
    if (c.nextFollowupAt){ const f = db.insert('followups', { leadId: l.id, counsellorId: l.counsellorId || ctx.user.id, dueAt: c.nextFollowupAt, reason: b.followupReason || 'Callback', notes: b.notes || '', status: 'Pending', completedAt: null, createdAt: now(), createdBy: ctx.user.id }); c.followupId = f.id; }
    refreshLead(l); l.updatedAt = now(); db.update('leads', l.id, {});
    H.audit(ctx, `Call logged: ${b.type} · ${NL.outcomes.label(b.outcome, b.subOutcome)}`, 'Calls', c.id, '', { lead: l.id, duration: dur, outcome: b.outcome, subOutcome: b.subOutcome || '' });
    return c;
  }
  R('GET', '/followups', 'followups.view', (ctx) => {
    const x = L(); let rows = db.all('followups').filter(f => H.ownerVisible(ctx, f.counsellorId) || H.leadVisible(ctx, x.leads.get(f.leadId))).map(f => decFu(f, x));
    if (ctx.query.bucket) rows = rows.filter(f => f.bucket === ctx.query.bucket);
    if (ctx.query.completionOutcome === '_none') rows = rows.filter(f => f.status === 'Completed' && !f.completionOutcome);
    else if (ctx.query.completionOutcome) rows = rows.filter(f => f.completionOutcome === ctx.query.completionOutcome);
    if (ctx.query.completionSubOutcome) rows = rows.filter(f => f.completionSubOutcome === ctx.query.completionSubOutcome);
    return H.list(rows, ctx.query, { search: ['leadName', 'leadMobile', 'reason', 'notes', 'counsellorName', 'leadId'], filters: ['status', 'counsellorId', 'leadId', 'reason', 'teamId'], dateField: ctx.query.dateField || 'dueAt', sort: ctx.query.sort || 'dueAt', dir: ctx.query.dir || 'asc' });
  });
  function mustFu(ctx){ const f = db.get('followups', ctx.params.id); if (!f) throw new HttpError(404, 'Follow-up not found'); H.mustSeeLead(ctx, f.leadId); return f; }
  R('POST', '/followups', 'followups.manage', (ctx) => {
    const b = H.pickFields(ctx.body, ['leadId', 'dueAt', 'reason', 'notes']);
    H.requireFields(b, { leadId: ['required'], dueAt: ['required', 'date'], reason: ['required'] }, { leadId: 'Lead', dueAt: 'Date & time', reason: 'Reason' });
    if (new Date(b.dueAt) < new Date(Date.now() - 60000)) throw new HttpError(422, 'Follow-up time must be in the future', { errors: { dueAt: 'Must be in the future' } });
    const l = H.mustSeeLead(ctx, b.leadId);
    const f = db.insert('followups', { leadId: l.id, counsellorId: l.counsellorId || ctx.user.id, dueAt: new Date(b.dueAt).toISOString(), reason: b.reason, notes: b.notes || '', status: 'Pending', completedAt: null, createdAt: now(), createdBy: ctx.user.id });
    refreshLead(l); db.update('leads', l.id, {});
    H.audit(ctx, `Follow-up scheduled for ${NL.fmt.dateTime(f.dueAt)}`, 'Follow-ups', f.id, '', { lead: l.id, reason: f.reason });
    if (f.counsellorId !== ctx.user.id) H.notify(f.counsellorId, 'task_assigned', 'Follow-up assigned', `${l.name} · ${f.reason} · ${NL.fmt.dateTime(f.dueAt)}`, '#/followups');
    return { followup: f };
  });
  R('PATCH', '/followups/:id', 'followups.manage', (ctx) => {
    const f = mustFu(ctx); if (f.status !== 'Pending') throw new HttpError(422, 'Only pending follow-ups can be rescheduled');
    const b = H.pickFields(ctx.body, ['dueAt', 'reason', 'notes']);
    if (b.dueAt){ if (!V.isDate(b.dueAt) || new Date(b.dueAt) < new Date(Date.now() - 60000)) throw new HttpError(422, 'Pick a future date and time', { errors: { dueAt: 'Must be in the future' } }); b.dueAt = new Date(b.dueAt).toISOString(); b.notifiedDue = false; b.notifiedOverdue = false; }
    const d = H.diff(f, b); db.update('followups', f.id, b); const l = db.get('leads', f.leadId); refreshLead(l); db.update('leads', l.id, {});
    if (d) H.audit(ctx, 'Follow-up rescheduled', 'Follow-ups', f.id, d.oldV, d.newV); return { followup: f };
  });
  /* Complete a follow-up. Body: { outcome, completionNote, nextFollowupAt? }.
     completedAt / completedBy are always set here from the clock and the signed-in user —
     never taken from the request — so a completion can't be backdated or attributed to someone else. */
  function completeFollowupRoute(ctx){
    const f = mustFu(ctx); if (f.status !== 'Pending') throw new HttpError(422, 'Follow-up is already ' + f.status.toLowerCase());
    const b = ctx.body || {};
    const outcome = typeof b.outcome === 'string' ? b.outcome.trim() : '';
    const note = typeof b.completionNote === 'string' ? b.completionNote.trim() : '';
    const errors = {};
    const known = NL.outcomes.find(outcome); // central outcome master (active outcomes only)
    if (!outcome) errors.outcome = 'Select an outcome';
    else if (!known) errors.outcome = 'Select an outcome from the list';
    const subOutcome = typeof b.subOutcome === 'string' ? b.subOutcome.trim() : '';
    const subs = known ? NL.outcomes.subOutcomesFor(outcome) : [];
    const knownSub = subs.find(x => x.value === subOutcome);
    if (known && subs.length && !subOutcome) errors.subOutcome = 'Select a sub outcome';
    else if (subOutcome && !knownSub) errors.subOutcome = 'Select a sub outcome from the list';
    if (note.length > 2000) errors.completionNote = 'Keep notes under 2000 characters';
    if (b.nextFollowupAt && (isNaN(new Date(b.nextFollowupAt)) || new Date(b.nextFollowupAt) < new Date(Date.now() - 60000))) errors.nextFollowupAt = 'Must be in the future';
    if (Object.keys(errors).length) throw new HttpError(422, 'Please correct the highlighted fields', { errors });
    db.update('followups', f.id, { status: 'Completed', completedAt: now(), completedBy: ctx.user.id, completionOutcome: outcome, completionSubOutcome: knownSub ? knownSub.value : '', completionNote: note,
      outcome: [knownSub ? knownSub.label : known ? known.label : '', note].filter(Boolean).join(' — ') });
    let next = null;
    if (b.nextFollowupAt) next = db.insert('followups', { leadId: f.leadId, counsellorId: f.counsellorId || ctx.user.id, dueAt: new Date(b.nextFollowupAt).toISOString(), reason: f.reason,
      notes: note || f.notes || '', status: 'Pending', completedAt: null, createdAt: now(), createdBy: ctx.user.id, previousFollowupId: f.id });
    const l = db.get('leads', f.leadId); l.lastContactAt = now(); setLeadOutcome(ctx, l, outcome, knownSub ? knownSub.value : '', f.completedAt, 'followup'); refreshLead(l); db.update('leads', l.id, {});
    H.audit(ctx, 'Follow-up completed', 'Follow-ups', f.id, 'Pending', { status: 'Completed', outcome, next: next ? next.dueAt : '' });
    const completion = { followupId: f.id, studentId: l.studentId || null, leadId: l.id, outcome, subOutcome: knownSub ? knownSub.value : null, status: 'completed', completionNote: note, completedAt: f.completedAt, completedBy: f.completedBy };
    return { followup: f, completion, next };
  }
  R('POST', '/followups/:id/complete', 'followups.manage', completeFollowupRoute);
  R('PATCH', '/followups/:id/complete', 'followups.manage', completeFollowupRoute);
  /* Call Feedback Form: structured outcome of a callback. Completes the follow-up if still pending,
     logs the call (Call Activity + lead timeline), optionally moves the lead stage and schedules the next follow-up. */
  const FB = { spokeWith: ['Student', 'Parent / Guardian', 'Other'], interest: ['Hot', 'Warm', 'Cold', 'Not interested'],
    nextAction: ['Call back', 'Send course details / brochure', 'Counselling session', 'Start application', 'Collect documents', 'Fee discussion', 'No further action'] };
  R('POST', '/followups/:id/feedback', ['followups.manage'], (ctx) => {
    ctx.need('calls.create');
    const f = mustFu(ctx);
    if (f.status === 'Cancelled') throw new HttpError(422, 'This follow-up was cancelled');
    if (f.feedback) throw new HttpError(409, 'Call feedback was already recorded for this follow-up');
    const b = H.pickFields(ctx.body, ['outcome', 'subOutcome', 'spokeWith', 'interest', 'courseDiscussed', 'summary', 'concerns', 'nextAction', 'nextFollowupAt', 'followupReason', 'duration', 'stage']);
    const s = H.settings(); const errors = {};
    try { NL.outcomes.validateOutcome(b.outcome, b.subOutcome); } catch (e){ errors[/sub/i.test(e.message) ? 'subOutcome' : 'outcome'] = /sub/i.test(e.message) ? 'Select a sub outcome' : 'Select the call outcome'; }
    if (b.spokeWith && !FB.spokeWith.includes(b.spokeWith)) errors.spokeWith = 'Select who you spoke with';
    if (b.interest && !FB.interest.includes(b.interest)) errors.interest = 'Select an interest level';
    if (b.nextAction && !FB.nextAction.includes(b.nextAction)) errors.nextAction = 'Select the next action';
    if (!b.summary || String(b.summary).length < 3) errors.summary = 'Describe what was discussed';
    else if (String(b.summary).length > 2000) errors.summary = 'Keep the summary under 2000 characters';
    if (b.concerns && String(b.concerns).length > 1000) errors.concerns = 'Keep this under 1000 characters';
    if (b.courseDiscussed && String(b.courseDiscussed).length > 150) errors.courseDiscussed = 'Too long';
    if (b.duration !== undefined && b.duration !== '' && !(Number(b.duration) >= 0 && Number(b.duration) <= 36000)) errors.duration = 'Enter a duration in seconds';
    if (b.nextFollowupAt && (isNaN(new Date(b.nextFollowupAt)) || new Date(b.nextFollowupAt) < new Date(Date.now() - 60000))) errors.nextFollowupAt = 'Must be in the future';
    if (b.followupReason && !s.followupReasons.includes(b.followupReason)) errors.followupReason = 'Select a reason';
    if (b.stage && !s.leadStages.concat(s.negativeStages).includes(b.stage)) errors.stage = 'Select a valid stage';
    if (Object.keys(errors).length) throw new HttpError(422, 'Please correct the highlighted fields', { errors });
    const l = db.get('leads', f.leadId);
    const notes = [b.summary, b.spokeWith && 'Spoke with: ' + b.spokeWith, b.interest && 'Interest: ' + b.interest, b.courseDiscussed && 'Course: ' + b.courseDiscussed,
      b.concerns && 'Concerns: ' + b.concerns, b.nextAction && 'Next action: ' + b.nextAction].filter(Boolean).join(' · ');
    const dur = Math.round(Number(b.duration) || 0);
    const call = recordCall(ctx, l, { type: 'Callback', outcome: b.outcome, subOutcome: b.subOutcome, startAt: new Date(Date.now() - dur * 1000).toISOString(), duration: dur, notes,
      nextFollowupAt: b.nextFollowupAt || null, followupReason: b.followupReason || 'Callback' }, false);
    if (b.stage && b.stage !== l.stage){ setStage(ctx, l, b.stage); refreshLead(l); db.update('leads', l.id, {}); }
    const patch = { feedback: { outcome: b.outcome, subOutcome: b.subOutcome || '', spokeWith: b.spokeWith || '', interest: b.interest || '', courseDiscussed: b.courseDiscussed || '', summary: b.summary,
      concerns: b.concerns || '', nextAction: b.nextAction || '', nextFollowupAt: call.nextFollowupAt, stage: b.stage || '' }, feedbackAt: now(), feedbackBy: ctx.user.id, callId: call.id };
    if (f.status === 'Pending') Object.assign(patch, { status: 'Completed', completedAt: now(), outcome: b.summary });
    db.update('followups', f.id, patch);
    H.activity(l.id, null, 'call', `Call feedback recorded: ${NL.outcomes.label(b.outcome, b.subOutcome)}${b.interest ? ' · ' + b.interest : ''}`, ctx.user.id);
    H.audit(ctx, 'Call feedback recorded', 'Follow-ups', f.id, '', { outcome: b.outcome, subOutcome: b.subOutcome || '', interest: b.interest || '', nextAction: b.nextAction || '' });
    return { followup: f, call };
  });
  R('POST', '/followups/:id/snooze', 'followups.manage', (ctx) => {
    const f = mustFu(ctx); const mins = Math.max(5, Math.min(1440, Number(ctx.body.minutes) || 15));
    const due = new Date(Math.max(Date.now(), new Date(f.dueAt).getTime()) + mins * 60000).toISOString();
    const old = f.dueAt; db.update('followups', f.id, { dueAt: due, notifiedDue: false, notifiedOverdue: false }); const l = db.get('leads', f.leadId); refreshLead(l); db.update('leads', l.id, {});
    H.audit(ctx, `Follow-up snoozed ${mins} min`, 'Follow-ups', f.id, old, due); return { followup: f };
  });
  R('POST', '/followups/:id/cancel', 'followups.manage', (ctx) => {
    const f = mustFu(ctx); if (f.status !== 'Pending') throw new HttpError(422, 'Follow-up is already ' + f.status.toLowerCase());
    db.update('followups', f.id, { status: 'Cancelled', completedAt: now(), outcome: ctx.body.reason || 'Cancelled' }); const l = db.get('leads', f.leadId); refreshLead(l); db.update('leads', l.id, {});
    H.audit(ctx, 'Follow-up cancelled', 'Follow-ups', f.id, 'Pending', 'Cancelled'); return { followup: f };
  });
  R('GET', '/notes', 'notes.view', (ctx) => {
    const x = L(); const rows = db.all('notes').filter(n => (n.leadId ? H.leadVisible(ctx, x.leads.get(n.leadId)) : H.studentVisible(ctx, x.students.get(n.studentId)))).map(n => decNote(n, x));
    return H.list(rows, ctx.query, { search: ['text', 'leadName', 'authorName', 'leadId', 'studentId'], filters: ['authorId', 'type', 'leadId', 'studentId'] });
  });
  R('POST', '/notes', 'notes.create', (ctx) => {
    const b = H.pickFields(ctx.body, ['leadId', 'studentId', 'type', 'text']);
    H.requireFields(b, { text: ['required', { min: 3 }], type: ['required'] }, { text: 'Note', type: 'Note type' });
    if (!b.leadId && !b.studentId) throw new HttpError(422, 'Attach the note to a lead or student');
    if (b.leadId) H.mustSeeLead(ctx, b.leadId); if (b.studentId) H.mustSeeStudent(ctx, b.studentId);
    if (b.text.length > 4000) throw new HttpError(422, 'Note is too long (max 4000 characters)');
    const n = db.insert('notes', { leadId: b.leadId || null, studentId: b.studentId || null, type: b.type, text: b.text, authorId: ctx.user.id, createdAt: now() });
    H.audit(ctx, `${b.type} note added`, 'Notes', b.leadId || b.studentId, '', b.text.slice(0, 80)); return { note: n };
  });

  /* ============================================================
     NOTIFICATIONS, AUDIT, SETTINGS, SAVED FILTERS, SEARCH
     ============================================================ */
  R('GET', '/notifications', null, (ctx) => {
    // Generate follow-up reminders for this user (server-side job in production)
    const mins = (H.settings().notifications.followupReminderMinutes || 15) * 60000; const t = Date.now(); const due = [];
    db.all('followups').filter(f => f.status === 'Pending' && f.counsellorId === ctx.user.id).forEach(f => {
      const d = new Date(f.dueAt).getTime(); const l = db.get('leads', f.leadId); if (!l) return;
      if (d <= t && !f.notifiedOverdue && t - d > 60 * 60000){ f.notifiedOverdue = true; f.notifiedDue = true; H.notify(ctx.user.id, 'followup_overdue', 'Follow-up overdue', `${l.name} · ${f.reason} was due ${NL.fmt.dateTime(f.dueAt)}`, '#/leads/' + l.id); db.update('followups', f.id, {}); }
      else if (d - t <= mins && !f.notifiedDue){ f.notifiedDue = true; H.notify(ctx.user.id, 'followup_due', 'Follow-up due', `${l.name} · ${f.reason} at ${NL.fmt.time(f.dueAt)}`, '#/leads/' + l.id); db.update('followups', f.id, {}); if (d - t > -60 * 60000) due.push(Object.assign({}, f, { leadName: l.name, leadMobile: l.mobile, leadStage: l.stage })); }
    });
    const mine = db.all('notifications').filter(n => n.userId === ctx.user.id).sort((a, b) => a.at < b.at ? 1 : -1);
    return { items: mine.slice(0, Number(ctx.query.limit) || 50), unread: mine.filter(n => !n.read).length, total: mine.length, due };
  });
  R('POST', '/notifications/read', null, (ctx) => {
    const ids = ctx.body.ids; db.all('notifications').forEach(n => { if (n.userId === ctx.user.id && (!ids || ids.includes(n.id)) && !n.read){ n.read = true; db.update('notifications', n.id, {}); } });
  });
  R('GET', '/audit-logs', 'audit.view', (ctx) => H.list(db.all('audit'), ctx.query, { search: ['action', 'userName', 'recordId', 'module', 'oldValue', 'newValue'], filters: ['module', 'userId', 'role'], dateField: 'at', sort: 'at' }));
  R('GET', '/settings', null, (ctx) => { const s = JSON.parse(JSON.stringify(H.settings())); if (!ctx.can('settings.view')) delete s.assignment; return s; });
  R('PATCH', '/settings', 'settings.manage', (ctx) => {
    const { section, value } = ctx.body; const s = H.settings();
    if (!(section in s)) throw new HttpError(422, 'Unknown settings section');
    if (section === 'scoring'){
      if (!Array.isArray(value.rules) || value.rules.some(r => !isFinite(r.points) || r.points < 0 || r.points > 100)) throw new HttpError(422, 'Points must be between 0 and 100');
      value.rules.forEach(r => (r.points = Number(r.points)));
    }
    if (section === 'security'){ value.sessionTimeoutMinutes = Math.max(5, Math.min(480, Number(value.sessionTimeoutMinutes) || 30)); value.passwordMinLength = Math.max(12, Math.min(64, Number(value.passwordMinLength) || 12)); value.maxLoginAttempts = Math.max(3, Math.min(20, Number(value.maxLoginAttempts) || 5)); }
    if (Array.isArray(value) && !value.every(v => typeof v === 'string' && v.trim())) throw new HttpError(422, 'List entries cannot be empty');
    const old = s[section]; s[section] = Array.isArray(value) ? value.map(v => v.trim()) : value; db.setSettings(s);
    if (section === 'scoring') db.all('leads').forEach(l => (l.score = H.scoreLead(l, s))), db.update('leads', (db.all('leads')[0] || {}).id, {});
    H.audit(ctx, `Settings updated: ${section}`, 'Settings', section, old, s[section]);
    return s;
  });
  R('GET', '/saved-filters', null, (ctx) => db.all('savedFilters').filter(f => f.userId === ctx.user.id && (!ctx.query.module || f.module === ctx.query.module)));
  R('POST', '/saved-filters', null, (ctx) => {
    const { module, name, query } = ctx.body; if (!module || !String(name || '').trim()) throw new HttpError(422, 'Give the filter a name');
    return db.insert('savedFilters', { userId: ctx.user.id, module, name: name.trim().slice(0, 60), query: query || {}, createdAt: now() });
  });
  R('DELETE', '/saved-filters/:id', null, (ctx) => { const f = db.get('savedFilters', ctx.params.id); if (!f || f.userId !== ctx.user.id) throw new HttpError(404, 'Saved filter not found'); db.remove('savedFilters', f.id); });
  R('GET', '/search', null, (ctx) => {
    const q = lc(ctx.query.q); if (q.length < 2) return { groups: [] };
    const x = L(); const has = (...v) => v.some(s => String(s || '').toLowerCase().includes(q)); const groups = []; const take = (a) => a.slice(0, 6);
    if (ctx.can('leads.view')) groups.push({ key: 'leads', label: 'Leads', items: take(db.all('leads').filter(l => H.leadVisible(ctx, l) && has(l.name, l.mobile, l.email, l.id)).map(l => ({ id: l.id, title: l.name, sub: `${l.id} · ${l.mobile} · ${l.stage}`, link: '#/leads/' + l.id }))) });
    if (ctx.can('students.view')) groups.push({ key: 'students', label: 'Students', items: take(db.all('students').filter(s => H.studentVisible(ctx, s) && has(s.fullName, s.mobile, s.email, s.id)).map(s => ({ id: s.id, title: s.fullName, sub: `${s.id} · ${s.mobile}`, link: '#/students/' + s.id }))) });
    if (ctx.can('applications.view')) groups.push({ key: 'applications', label: 'Applications', items: take(db.all('applications').filter(a => H.appVisible(ctx, a) && has(a.id, a.applicationNo)).map(a => ({ id: a.id, title: `${a.id} · ${(x.students.get(a.studentId) || {}).fullName || ''}`, sub: `${a.applicationNo} · ${a.stage}`, link: '#/applications/' + a.id }))) });
    if (ctx.can('universities.view')) groups.push({ key: 'universities', label: 'Universities', items: take(db.all('universities').filter(u => has(u.name, u.code)).map(u => ({ id: u.id, title: u.name, sub: `${u.code} · ${u.location}`, link: '#/universities?q=' + encodeURIComponent(u.name) }))) });
    if (ctx.can('courses.view')) groups.push({ key: 'courses', label: 'Courses', items: take(db.all('courses').filter(c => has(c.name, c.code)).map(c => ({ id: c.id, title: `${c.name} — ${nm(x.unis, c.universityId)}`, sub: `${c.code} · ${c.mode} · ${NL.fmt.money(c.totalFees)}`, link: '#/courses?q=' + encodeURIComponent(c.code) }))) });
    return { groups: groups.filter(g => g.items.length) };
  });

  S.h.decorators = { L, decLead, decApp, decStudent, decPay, decCall, decFu, fuState };
})();
