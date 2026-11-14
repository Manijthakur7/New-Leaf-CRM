/* RBAC catalogue — shared by the browser (NL.rbac) and the Node server
   (require('src/auth/permissions.js')). Roles and their default permission
   sets live here; the effective matrix is stored in the database and editable
   from Administration → Roles & Permissions. The server is the source of truth —
   UI checks only hide controls, the API refuses unauthorised calls. */
(function(root, factory){
  const rbac = factory();
  if (typeof module === 'object' && module.exports) module.exports = rbac;
  else { root.NL = root.NL || {}; root.NL.rbac = rbac; }
})(typeof self !== 'undefined' ? self : this, function(){
  const PERMISSION_GROUPS = [
    ['Dashboard', [['dashboard.view','View dashboard'],['dashboard.executive','Executive / management dashboard']]],
    ['Leads', [['leads.view','View leads'],['leads.create','Create leads'],['leads.edit','Edit leads'],['leads.archive','Archive (delete) leads'],
      ['leads.assign','Assign / reassign leads'],['leads.import','Import leads'],['leads.export','Export leads'],['leads.merge','Merge duplicates'],['leads.convert','Convert lead to student']]],
    ['Students', [['students.view','View students'],['students.create','Create students'],['students.edit','Edit students']]],
    ['Applications', [['applications.view','View applications'],['applications.create','Create applications'],['applications.edit','Edit applications'],['applications.stage','Change admission status']]],
    ['Documents', [['documents.view','View documents'],['documents.upload','Upload documents'],['documents.verify','Verify / reject documents']]],
    ['Payments', [['payments.view','View payments'],['payments.create','Record payments'],['payments.verify','Verify payments'],['payments.refund','Refund payments']]],
    ['Masters', [['universities.view','View universities'],['universities.manage','Manage universities'],['campuses.view','View campuses'],['campuses.manage','Manage campuses'],
      ['courses.view','View courses'],['courses.manage','Manage courses']]],
    ['Counselling', [['calls.view','View call activity'],['calls.create','Log calls'],['followups.view','View follow-ups'],['followups.manage','Schedule / update follow-ups'],
      ['notes.view','View counselling notes'],['notes.create','Add notes']]],
    ['Operations', [['teams.view','View teams'],['teams.manage','Manage teams'],['campaigns.view','View campaigns'],['campaigns.manage','Manage campaigns']]],
    ['Users & Access', [['users.view','View users'],['users.create','Create / invite users'],['users.edit','Edit users, reset passwords, revoke sessions'],
      ['users.delete','Suspend / disable users'],['users.assign_role','Assign roles'],['roles.view','View roles & permissions'],['roles.manage','Manage roles & permissions']]],
    ['Reports', [['reports.view','View reports'],['reports.revenue','Revenue / fee reports'],['reports.export','Export reports']]],
    ['Administration', [['settings.view','View settings'],['settings.manage','Change settings'],['audit.view','View audit & security logs']]]
  ];
  const ALL = PERMISSION_GROUPS.flatMap(g => g[1].map(p => p[0]));
  const except = (...drop) => ALL.filter(p => !drop.includes(p));

  /* Permissions that were split or renamed. Old role matrices (stored demo data,
     pre-migration databases) are expanded through this map when loaded. */
  const LEGACY_PERMISSIONS = { 'users.manage': ['users.create', 'users.edit', 'users.delete'] };
  function upgradePermissions(list){
    const out = new Set();
    (list || []).forEach(p => (LEGACY_PERMISSIONS[p] || [p]).forEach(x => { if (ALL.includes(x)) out.add(x); }));
    return Array.from(out);
  }

  /* `code` is the stable external identifier (SUPER_ADMIN …); `id` is the
     storage key already used throughout CRM data, so it is kept unchanged.
     `rank` orders roles for the "cannot manage someone above you" rule. */
  const ROLES = [
    { id: 'super_admin', code: 'SUPER_ADMIN', rank: 100, name: 'Super Admin', scope: 'all', color: 'b-purple', description: 'Full system access including roles, settings and audit.', permissions: ALL.slice() },
    { id: 'admin', code: 'ADMIN', rank: 80, name: 'Admin', scope: 'all', color: 'b-blue', description: 'Operational administration. Cannot modify Super Admin accounts.',
      permissions: except('roles.manage', 'settings.manage') },
    { id: 'management', code: 'MANAGEMENT', rank: 60, name: 'Management', scope: 'all', color: 'b-gray', description: 'Read-only view of dashboards, funnels, reports and performance. No modifications.',
      permissions: ['dashboard.view','dashboard.executive','leads.view','students.view','applications.view','payments.view','universities.view','campuses.view','courses.view',
        'calls.view','followups.view','teams.view','campaigns.view','reports.view','reports.revenue'] },
    { id: 'team_leader', code: 'TEAM_LEADER', rank: 50, name: 'Team Leader', scope: 'team', color: 'b-teal', description: 'Leads a counselling team; assigns leads, monitors performance and follow-ups.',
      permissions: ['dashboard.view','leads.view','leads.create','leads.edit','leads.assign','leads.export','leads.convert','leads.merge','students.view','students.create','students.edit',
        'applications.view','applications.create','applications.edit','applications.stage','documents.view','documents.upload','payments.view',
        'universities.view','campuses.view','courses.view','calls.view','calls.create','followups.view','followups.manage','notes.view','notes.create',
        'teams.view','users.view','campaigns.view','reports.view','reports.export'] },
    { id: 'finance', code: 'FINANCE', rank: 40, name: 'Finance', scope: 'all', color: 'b-blue', description: 'Fee and payment management, payment verification and revenue reports.',
      permissions: ['dashboard.view','students.view','applications.view','payments.view','payments.create','payments.verify','payments.refund','universities.view','courses.view',
        'reports.view','reports.revenue','reports.export'] },
    { id: 'doc_verifier', code: 'DOC_VERIFICATION', rank: 40, name: 'Document Verification', scope: 'all', color: 'b-teal', description: 'Reviews and verifies or rejects student documents.',
      permissions: ['dashboard.view','students.view','applications.view','documents.view','documents.verify','universities.view','courses.view'] },
    { id: 'counsellor', code: 'COUNSELLOR', rank: 30, name: 'Counsellor', scope: 'own', color: 'b-green', description: 'Admission counsellor working assigned leads through to enrolment.',
      permissions: ['dashboard.view','leads.view','leads.create','leads.edit','leads.convert','students.view','students.create','students.edit','applications.view','applications.create',
        'applications.edit','documents.view','documents.upload','payments.view','universities.view','campuses.view','courses.view','calls.view','calls.create',
        'followups.view','followups.manage','notes.view','notes.create','reports.view'] },
    { id: 'telecaller', code: 'TELECALLER', rank: 20, name: 'Telecaller', scope: 'own', color: 'b-amber', description: 'Calls assigned leads, logs call outcomes and callbacks.',
      permissions: ['dashboard.view','leads.view','leads.edit','calls.view','calls.create','followups.view','followups.manage','notes.view','notes.create','courses.view','universities.view'] },
    { id: 'agent', code: 'AGENT', rank: 20, name: 'Agent', scope: 'own', color: 'b-amber', description: 'Calling agent (legacy LeafPulse role) — same access as Telecaller.',
      permissions: ['dashboard.view','leads.view','leads.edit','calls.view','calls.create','followups.view','followups.manage','notes.view','notes.create','courses.view','universities.view'] },
    { id: 'unassigned', code: 'UNASSIGNED', rank: 0, name: 'Unassigned', scope: 'own', color: 'b-gray', description: 'Default for new sign-ups. Can sign in and manage their own profile only, until an administrator assigns a role.', permissions: [] }
  ];
  ROLES.find(r => r.id === 'admin').permissions.push('dashboard.executive');
  /* 'read_only' was the previous id of the Management role. */
  const ROLE_ALIASES = { read_only: 'management' };
  const canonicalRole = (id) => ROLE_ALIASES[id] || id;
  const findRole = (id) => ROLES.find(r => r.id === canonicalRole(id) || r.code === id) || null;

  const roleName = (id) => (findRole(id) || { name: id || 'Unassigned' }).name;
  const roleColor = (id) => (findRole(id) || { color: 'b-gray' }).color;
  const roleRank = (id) => (findRole(id) || { rank: 0 }).rank;
  const DEFAULT_ROLE = 'unassigned';
  // Roles that receive and work leads
  const WORKING_ROLES = ['counsellor', 'telecaller', 'agent', 'team_leader'];

  /* Account lifecycle. LOCKED is set by an administrator (or kept from a
     legacy import); automatic brute-force protection uses a temporary
     lock-until timestamp instead, so an attacker cannot lock anyone out for good. */
  const ACCOUNT_STATUS = ['PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DISABLED', 'LOCKED'];
  const STATUS_LABEL = { PENDING_VERIFICATION: 'Pending verification', ACTIVE: 'Active', SUSPENDED: 'Suspended', DISABLED: 'Disabled', LOCKED: 'Locked' };
  const STATUS_TRANSITIONS = {
    PENDING_VERIFICATION: ['ACTIVE', 'DISABLED'],
    ACTIVE: ['SUSPENDED', 'DISABLED', 'LOCKED'],
    SUSPENDED: ['ACTIVE', 'DISABLED'],
    LOCKED: ['ACTIVE', 'DISABLED'],
    DISABLED: ['ACTIVE', 'PENDING_VERIFICATION']
  };
  const canTransition = (from, to) => (STATUS_TRANSITIONS[from] || []).includes(to);
  /* CRM records keep the older Active / Inactive / Locked vocabulary. */
  const legacyStatus = (s) => s === 'ACTIVE' ? 'Active' : s === 'LOCKED' ? 'Locked' : 'Inactive';

  function can(subject, permission){
    const perms = Array.isArray(subject) ? subject : subject instanceof Set ? Array.from(subject) : (subject && subject.permissions) || [];
    return perms.includes(permission);
  }

  return { PERMISSION_GROUPS, ALL_PERMISSIONS: ALL, LEGACY_PERMISSIONS, upgradePermissions, ROLES, ROLE_ALIASES, canonicalRole, findRole, roleName, roleColor, roleRank,
    DEFAULT_ROLE, WORKING_ROLES, ACCOUNT_STATUS, STATUS_LABEL, STATUS_TRANSITIONS, canTransition, legacyStatus, can };
});
