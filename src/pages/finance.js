/* Documents (verification queue) and Payments (fee management). */
(function(){
  const { html } = NL.util;
  const S = NL.services, st = NL.store, ui = NL.ui, A = NL.actions, C = NL.cols, F = NL.fmt;

  function documents(el, p, query){
    const s = st.settings();
    const page = NL.listPage({ el, id: 'documents', module: 'documents', title: 'Documents', sub: 'Document checklist and verification queue', exportName: 'documents', what: 'documents', refreshOn: ['documents'], initial: query,
      segments: [{ key: 'queue', label: 'Awaiting review', query: { status: 'Uploaded' } }, { key: 'review', label: 'Under review', query: { status: 'Under Review' } }, { key: 'pending', label: 'Pending upload', query: { status: 'Pending' } },
        { key: 'rejected', label: 'Rejected', query: { status: 'Rejected' } }, { key: 'verified', label: 'Verified', query: { status: 'Verified' } }, { key: 'all', label: 'All', query: {} }],
      pickSegment: (q) => ({ Uploaded: 'queue', 'Under Review': 'review', Pending: 'pending', Rejected: 'rejected', Verified: 'verified' })[q.status] || (st.can('documents.verify') ? 'queue' : 'all'),
      searchPlaceholder: 'Search student, document, file, application…',
      filters: [{ type: 'daterange', label: 'Uploaded', field: 'uploadedAt' }, { key: 'type', label: 'Type', options: s.documentTypes }, { key: 'universityId', label: 'University', options: () => st.options.universities(true) },
        st.scope() !== 'own' ? { key: 'counsellorId', label: 'Counsellor', options: () => st.options.assignable() } : null].filter(Boolean),
      columns: [C.mono('id', 'Document ID'), C.link('studentName', 'Student', (d) => '#/students/' + d.studentId, { always: true }), C.text('type', 'Document'), C.mono('applicationId', 'Application', { render: (d) => d.applicationId ? html`<a class="rowlink mono" href="#/applications/${d.applicationId}">${d.applicationId}</a>` : '—' }),
        C.text('universityName', 'University', { hidden: true }), { key: 'fileName', label: 'File', render: (d) => d.fileName ? html`${d.fileName}<div class="muted tiny">${F.bytes(d.fileSize || 0)}</div>` : html`<span class="muted">Not uploaded</span>` },
        C.badge('status', 'Status'), C.datetime('uploadedAt', 'Uploaded'), C.text('uploaderName', 'Uploaded By', { hidden: true }), C.text('reviewerName', 'Reviewer'), C.datetime('reviewedAt', 'Reviewed', { hidden: true }),
        { key: 'rejectionReason', label: 'Rejection Reason / Remarks', cls: 'remarks', render: (d) => d.rejectionReason ? html`<span class="neg">${d.rejectionReason}</span>` : d.remarks || '—' }],
      fetch: (q) => S.documentService.list(q),
      rowActions: (d) => [
        st.can('documents.verify') && d.status === 'Uploaded' && { label: 'Mark under review', icon: '🔍', onClick: () => A.reviewDocument(d, 'Under Review') },
        st.can('documents.verify') && ['Uploaded', 'Under Review'].includes(d.status) && { label: 'Verify', icon: '✅', onClick: () => A.reviewDocument(d, 'Verified') },
        st.can('documents.verify') && ['Uploaded', 'Under Review', 'Verified'].includes(d.status) && { label: 'Reject', icon: '❌', danger: true, onClick: () => A.reviewDocument(d, 'Rejected') },
        st.can('documents.upload') && ['Pending', 'Rejected'].includes(d.status) && { label: d.status === 'Rejected' ? 'Re-upload' : 'Upload', icon: '⤒', onClick: () => A.uploadDocument({ studentId: d.studentId, studentName: d.studentName, type: d.type, applicationId: d.applicationId }) },
        { label: 'Open student', icon: '👨‍🎓', onClick: () => (location.hash = '#/students/' + d.studentId + '?tab=documents') }].filter(Boolean),
      bulk: st.can('documents.verify') ? [{ label: 'Verify selected', icon: '✅', handler: async (ids, t, rows) => {
        rows = rows || await t.selectedRows(); const ok = rows.filter(d => ['Uploaded', 'Under Review'].includes(d.status));
        if (!ok.length){ ui.toast('Only uploaded / under-review documents can be verified', 'warn'); return false; }
        if (!await ui.confirm({ title: 'Verify documents', message: `Verify ${ok.length} document${ok.length === 1 ? '' : 's'}?`, confirmText: 'Verify' })) return false;
        for (const d of ok) await S.documentService.review(d.id, 'Verified');
        ui.toast(`${ok.length} documents verified`); return A.changed('documents'); } }] : [],
      empty: () => ({ icon: '📄', title: 'No documents in this view', text: 'Try another tab or clear filters.', actions: [{ label: 'Clear Filters', action: 'clearFilters' }] })
    });
    return page.cleanup;
  }

  function payments(el, p, query){
    const s = st.settings();
    const page = NL.listPage({ el, id: 'payments', module: 'payments', title: 'Payments', sub: 'Fee collection, verification and refunds', exportName: 'payments', what: 'payments', refreshOn: ['payments'], initial: query,
      actions: [{ label: 'Record Payment', icon: '＋', primary: true, action: 'add', perm: 'payments.create', onClick: () => A.addPayment() }],
      segments: [{ key: 'all', label: 'All', query: {} }, { key: 'pending', label: 'Pending', query: { status: 'Pending' } }, { key: 'initiated', label: 'Initiated', query: { status: 'Initiated' } },
        { key: 'successful', label: 'Successful', query: { status: 'Successful' } }, { key: 'partial', label: 'Partially paid', query: { status: 'Partially Paid' } }, { key: 'failed', label: 'Failed', query: { status: 'Failed' } }, { key: 'refunded', label: 'Refunded', query: { status: 'Refunded' } }],
      pickSegment: (q) => ({ Pending: 'pending', Initiated: 'initiated', Successful: 'successful', 'Partially Paid': 'partial', Failed: 'failed', Refunded: 'refunded' })[q.status] || 'all',
      searchPlaceholder: 'Search payment ID, student, transaction, receipt…',
      filters: [{ type: 'daterange', label: 'Payment date', field: 'paymentDate' }, { key: 'universityId', label: 'University', options: () => st.options.universities(true) },
        { key: 'courseId', label: 'Course', dependsOn: 'universityId', options: (v) => st.options.courses(v.universityId, null, true) }, { key: 'type', label: 'Type', options: s.paymentTypes }, { key: 'mode', label: 'Mode', options: s.paymentModes }],
      columns: [C.mono('id', 'Payment ID'), C.link('studentName', 'Student', (x) => '#/students/' + x.studentId, { always: true }), C.mono('applicationId', 'Application', { render: (x) => html`<a class="rowlink mono" href="#/applications/${x.applicationId}">${x.applicationId}</a>` }),
        C.text('universityName', 'University'), C.text('courseName', 'Course'), C.money('amount', 'Amount'), C.text('type', 'Payment Type'), C.text('mode', 'Payment Mode'), C.mono('transactionId', 'Transaction ID'),
        C.date('paymentDate', 'Payment Date'), C.badge('status', 'Status'), C.mono('receiptNo', 'Receipt Number'), { key: 'verifiedByName', label: 'Verified By', render: (x) => x.verifiedByName || (['Successful', 'Partially Paid'].includes(x.status) ? html`<span class="badge b-amber">Unverified</span>` : '—') },
        C.text('remarks', 'Remarks', { hidden: true, cls: 'remarks' })],
      fetch: (q) => S.paymentService.list(q),
      rowActions: (x) => [
        st.can('payments.verify') && !x.verifiedBy && ['Pending', 'Initiated', 'Successful', 'Partially Paid'].includes(x.status) && { label: ['Pending', 'Initiated'].includes(x.status) ? 'Confirm & verify' : 'Verify', icon: '✅', onClick: () => A.verifyPayment(x) },
        st.can('payments.verify') && ['Pending', 'Initiated'].includes(x.status) && { label: 'Mark failed', icon: '⛔', danger: true, onClick: () => A.markPaymentFailed(x) },
        st.can('payments.refund') && ['Successful', 'Partially Paid'].includes(x.status) && { label: 'Refund', icon: '↩️', danger: true, onClick: () => A.refundPayment(x) },
        { label: 'Open application', icon: '📝', onClick: () => (location.hash = '#/applications/' + x.applicationId) }, { label: 'Open student', icon: '👨‍🎓', onClick: () => (location.hash = '#/students/' + x.studentId) }].filter(Boolean),
      bulk: [{ label: 'Export', icon: '⤓', handler: async (ids, t, rows) => NL.file.exportData('csv', rows || await t.selectedRows(), [['id', 'Payment ID'], ['studentName', 'Student'], ['applicationId', 'Application'], ['amount', 'Amount'], ['type', 'Type'], ['mode', 'Mode'], ['transactionId', 'Transaction'], ['status', 'Status'], ['receiptNo', 'Receipt']].map(([k, l]) => ({ label: l, value: (r) => r[k] })), 'payments_selected') }],
      empty: () => ({ icon: '💰', title: 'No payments found', text: 'Try changing your filters or record a payment.', actions: [{ label: 'Clear Filters', action: 'clearFilters' }].concat(st.can('payments.create') ? [{ label: 'Record Payment', action: 'pay' }] : []) }),
      emptyHandlers: { pay: () => A.addPayment() }
    });
    return page.cleanup;
  }

  NL.pages.documents = { title: 'Documents', perm: 'documents.view', crumbs: ['Admissions', 'Documents'], render: documents };
  NL.pages.payments = { title: 'Payments', perm: 'payments.view', crumbs: ['Admissions', 'Payments'], render: payments };
})();
