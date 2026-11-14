/* Service layer — one object per domain. Pages call these and never build
   URLs themselves, so swapping demo ↔ production needs no UI changes. */
(function(){
  const api = NL.api;
  const crud = (base) => ({
    list: (q) => api.get(base, q),
    get: (id) => api.get(`${base}/${encodeURIComponent(id)}`),
    create: (data) => api.post(base, data),
    update: (id, data) => api.patch(`${base}/${encodeURIComponent(id)}`, data)
  });
  const enc = encodeURIComponent;

  NL.services = {
    authService: {
      login: (identifier, password, remember, captchaToken) => api.post('/auth/login', { identifier, password, remember: !!remember, captchaToken }),
      logout: () => api.post('/auth/logout', {}),
      me: () => api.get('/auth/me'),
      refresh: () => api.post('/auth/refresh', {}),
      signup: (data) => api.post('/auth/signup', data),
      verifyEmail: (token) => api.post('/auth/verify-email', { token }),
      resendVerification: (email) => api.post('/auth/resend-verification', { email }),
      forgotPassword: (email, captchaToken) => api.post('/auth/forgot-password', { email, captchaToken }),
      forgot: (email) => api.post('/auth/forgot-password', { email }),
      validateResetToken: (token) => api.post('/auth/reset-password/validate', { token }),
      resetPassword: (token, password, confirmPassword) => api.post('/auth/reset-password', { token, password, confirmPassword }),
      changePassword: (currentPassword, newPassword, confirmPassword, signOutOtherSessions) => api.post('/auth/change-password', { currentPassword, newPassword, confirmPassword: confirmPassword === undefined ? newPassword : confirmPassword, signOutOtherSessions: signOutOtherSessions !== false }),
      updateProfile: (data) => api.patch('/auth/profile', data),
      changeEmail: (newEmail, currentPassword) => api.post('/auth/change-email', { newEmail, currentPassword }),
      sessions: () => api.get('/auth/sessions'),
      revokeSession: (id) => api.del(`/auth/sessions/${enc(id)}`),
      revokeOtherSessions: () => api.post('/auth/sessions/revoke-others', {}),
      securityActivity: () => api.get('/auth/security-activity'),
      setPresence: (presence) => api.post('/auth/presence', { presence })
    },
    bootstrapService: { load: () => api.get('/bootstrap') },
    userService: Object.assign(crud('/users'), {
      detail: (id) => api.get(`/users/${enc(id)}`),
      assignRole: (id, role) => api.post(`/users/${enc(id)}/role`, { role }),
      resetPassword: (id, password) => api.post(`/users/${enc(id)}/reset-password`, { password }),
      sendPasswordReset: (id) => api.post(`/users/${enc(id)}/send-password-reset`, {}),
      setStatus: (id, action, reason) => api.post(`/users/${enc(id)}/${action}`, { reason }), // action: suspend | disable | lock | activate
      unlock: (id) => api.post(`/users/${enc(id)}/unlock`, {}),
      verifyEmail: (id) => api.post(`/users/${enc(id)}/verify-email`, {}),
      revokeSessions: (id) => api.post(`/users/${enc(id)}/revoke-sessions`, {}),
      activity: (id) => api.get(`/users/${enc(id)}/activity`)
    }),
    securityAuditService: { list: (q) => api.get('/security/audit-logs', q) },
    roleService: { list: () => api.get('/roles'), update: (id, data) => api.patch(`/roles/${enc(id)}`, data) },
    teamService: crud('/teams'),
    universityService: crud('/universities'),
    campusService: crud('/campuses'),
    courseService: crud('/courses'),
    campaignService: crud('/campaigns'),
    leadService: Object.assign(crud('/leads'), {
      assign: (ids, method, opts) => api.post('/leads/assign', Object.assign({ ids, method }, opts || {})),
      bulk: (ids, action, value) => api.post('/leads/bulk', { ids, action, value }),
      byState: (q) => api.get('/leads/by-state', q),
      byCourse: (q) => api.get('/leads/by-course', q),
      duplicates: (id) => api.get(`/leads/${enc(id)}/duplicates`),
      merge: (primaryId, duplicateId) => api.post('/leads/merge', { primaryId, duplicateId }),
      convert: (id, opts) => api.post(`/leads/${enc(id)}/convert`, opts || {}),
      importPreview: (rows, defaultSource) => api.post('/leads/import/preview', { rows, defaultSource: defaultSource || '' }),
      importBatch: (payload) => api.post('/leads/import', payload)
    }),
    studentService: crud('/students'),
    applicationService: Object.assign(crud('/applications'), { changeStage: (id, stage, remarks) => api.post(`/applications/${enc(id)}/stage`, { stage, remarks }) }),
    documentService: {
      list: (q) => api.get('/documents', q),
      upload: (meta) => api.post('/documents', meta), // production: multipart upload to POST /api/documents
      review: (id, status, reason, remarks) => api.post(`/documents/${enc(id)}/review`, { status, reason, remarks })
    },
    paymentService: Object.assign(crud('/payments'), {
      verify: (id, transactionId) => api.post(`/payments/${enc(id)}/verify`, { transactionId }),
      refund: (id, reason) => api.post(`/payments/${enc(id)}/refund`, { reason })
    }),
    callService: { list: (q) => api.get('/calls', q), log: (data) => api.post('/calls', data) },
    followupService: Object.assign(crud('/followups'), {
      complete: (id, outcome, completionNote, nextFollowupAt, subOutcome) => api.patch(`/followups/${enc(id)}/complete`, { outcome, subOutcome: subOutcome || undefined, completionNote, nextFollowupAt: nextFollowupAt || undefined }),
      snooze: (id, minutes) => api.post(`/followups/${enc(id)}/snooze`, { minutes }),
      cancel: (id, reason) => api.post(`/followups/${enc(id)}/cancel`, { reason }),
      feedback: (id, data) => api.post(`/followups/${enc(id)}/feedback`, data)
    }),
    noteService: { list: (q) => api.get('/notes', q), create: (data) => api.post('/notes', data) },
    notificationService: { list: (q) => api.get('/notifications', q), markRead: (ids) => api.post('/notifications/read', { ids }) },
    auditService: { list: (q) => api.get('/audit-logs', q) },
    settingsService: { get: () => api.get('/settings'), update: (section, value) => api.patch('/settings', { section, value }) },
    savedFilterService: { list: (module) => api.get('/saved-filters', { module }), create: (module, name, query) => api.post('/saved-filters', { module, name, query }), remove: (id) => api.del(`/saved-filters/${enc(id)}`) },
    searchService: { search: (q) => api.get('/search', { q }) },
    reportService: {
      dashboard: (q) => api.get('/reports/dashboard', q), admissions: (q) => api.get('/reports/admissions', q), counsellors: (q) => api.get('/reports/counsellors', q),
      campaigns: (q) => api.get('/reports/campaigns', q), followupOutcomes: (q) => api.get('/reports/followup-outcomes', q), revenue: (q) => api.get('/reports/revenue', q), applications: (q) => api.get('/reports/applications', q),
      mis: (q) => api.get('/reports/mis', q), team: (q) => api.get('/reports/team', q), workspace: () => api.get('/reports/workspace')
    },
    /* Telephony adapter — plug a dialer/CTI provider in here (Exotel, Knowlarity, Twilio …).
       Demo mode opens the device dialer via tel: and the UI logs the call manually. */
    telephonyService: {
      provider: 'manual',
      dial(number){ const a = document.createElement('a'); a.href = 'tel:' + String(number).replace(/[^\d+]/g, ''); a.click(); return Promise.resolve({ provider: 'manual', startedAt: new Date().toISOString() }); }
    },
    whatsappService: {
      open(number, text){ const n = NL.validate.normalizeMobile(number); window.open(`https://wa.me/91${n}${text ? '?text=' + encodeURIComponent(text) : ''}`, '_blank', 'noopener'); }
    }
  };
})();
