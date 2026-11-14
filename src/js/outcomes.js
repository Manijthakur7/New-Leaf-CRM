/**
 * ==========================================================
 * NEW LEAF UNIVERSITY CRM
 * CENTRAL OUTCOME MASTER
 * ==========================================================
 *
 * IMPORTANT:
 * Every CRM module must use CRM_OUTCOMES / CRM_SUB_OUTCOMES from this file
 * (browser: NL.outcomes or the CRM_OUTCOMES / CRM_SUB_OUTCOMES globals;
 *  server: require('src/js/outcomes.js')).
 *
 * DO NOT create separate outcome arrays inside modules.
 *
 * - `value` is the code that is stored and sent to the API; `label` is what users see.
 * - When an outcome has sub-outcomes, the Sub Outcome field is required.
 * - After editing, restart the CRM (npm run dev / npm start): the list is copied into
 *   each organization's settings at startup.
 * - Adding entries or changing labels is safe. To retire an outcome, move it to INACTIVE_OUTCOMES
 *   (don't delete it) so saved follow-ups keep a readable label. If you rename a sub-outcome `value`
 *   that has been used, add old → new to LEGACY_CODES so saved follow-ups are converted.
 */
(function(root, factory){
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.NL = root.NL || {}; root.NL.outcomes = api;
    root.CRM_OUTCOMES = api.CRM_OUTCOMES; root.CRM_SUB_OUTCOMES = api.CRM_SUB_OUTCOMES;
  }
})(typeof self !== 'undefined' ? self : this, function(){
  const CRM_OUTCOMES = [
    { value: 'interested', label: 'Interested' },
    { value: 'callback', label: 'Call Back' },
    { value: 'will_decide_later', label: 'Will Decide Later' },
    { value: 'not_interested', label: 'Not Interested' },
    { value: 'not_eligible', label: 'Not Eligible' },
    { value: 'admitted_other_college', label: 'Admitted Other College' },
    { value: 'duplicate_lead', label: 'Duplicate Lead' },
    { value: 'general_query', label: 'General Query' },
    { value: 'not_available', label: 'Not Available' },
    { value: 'non_relevant', label: 'Non Relevant' },
    { value: 'others', label: 'Others' }
  ];

  const CRM_SUB_OUTCOMES = {
    interested: [
      { value: 'highly_interested', label: 'Highly Interested' },
      { value: 'fee_discussion', label: 'Fee Discussion' },
      { value: 'documents_pending', label: 'Documents Pending' },
      { value: 'parent_discussion', label: 'Parent Discussion' },
      { value: 'admission_process', label: 'Admission Process' }
    ],
    callback: [
      { value: 'student_requested', label: 'Student Requested Callback' },
      { value: 'parent_requested', label: 'Parent Requested Callback' },
      { value: 'callback_later_today', label: 'Callback Later Today' },
      { value: 'callback_tomorrow', label: 'Callback Tomorrow' },
      { value: 'specific_time', label: 'Callback at Specific Time' }
    ],
    will_decide_later: [
      { value: 'needs_more_time', label: 'Needs More Time' },
      { value: 'discuss_with_parents', label: 'Will Discuss with Parents' },
      { value: 'comparing_courses', label: 'Comparing Courses' },
      { value: 'comparing_universities', label: 'Comparing Universities' },
      { value: 'financial_consideration', label: 'Financial Consideration' }
    ],
    not_interested: [
      { value: 'course_not_interested', label: 'Not Interested in Course' },
      { value: 'fee_too_high', label: 'Fee Too High' },
      { value: 'location_issue', label: 'Location Issue' },
      { value: 'career_change', label: 'Career Plan Changed' },
      { value: 'family_decision', label: 'Family Decision' },
      { value: 'joined_job', label: 'Joined Job' }
    ],
    not_eligible: [
      { value: 'qualification_not_met', label: 'Qualification Criteria Not Met' },
      { value: 'percentage_not_met', label: 'Required Percentage Not Met' },
      { value: 'age_criteria', label: 'Age Criteria Not Met' },
      { value: 'course_eligibility', label: 'Course Eligibility Issue' },
      { value: 'document_issue', label: 'Document Eligibility Issue' }
    ],
    admitted_other_college: [
      { value: 'same_course', label: 'Admitted in Same Course' },
      { value: 'other_course', label: 'Admitted in Other Course' },
      { value: 'other_university', label: 'Admitted in Other University' },
      { value: 'already_admitted', label: 'Already Admitted' }
    ],
    duplicate_lead: [
      { value: 'duplicate_mobile', label: 'Duplicate Mobile Number' },
      { value: 'duplicate_student', label: 'Duplicate Student' },
      { value: 'duplicate_enquiry', label: 'Duplicate Enquiry' }
    ],
    general_query: [
      { value: 'course_query', label: 'Course Related Query' },
      { value: 'fee_query', label: 'Fee Related Query' },
      { value: 'eligibility_query', label: 'Eligibility Query' },
      { value: 'admission_query', label: 'Admission Query' },
      { value: 'scholarship_query', label: 'Scholarship Query' },
      { value: 'university_query', label: 'University Related Query' },
      { value: 'other_query', label: 'Other Query' }
    ],
    not_available: [
      { value: 'switched_off', label: 'Phone Switched Off' },
      { value: 'not_reachable', label: 'Not Reachable' },
      { value: 'busy', label: 'Number Busy' },
      { value: 'no_response', label: 'No Response' },
      { value: 'network_issue', label: 'Network Issue' }
    ],
    non_relevant: [
      { value: 'wrong_program', label: 'Wrong Program' },
      { value: 'wrong_lead', label: 'Wrong Lead' },
      { value: 'not_a_student', label: 'Not a Student' },
      { value: 'service_not_required', label: 'Service Not Required' },
      { value: 'irrelevant_enquiry', label: 'Irrelevant Enquiry' }
    ],
    others: [
      { value: 'other_reason', label: 'Other Reason' }
    ]
  };

  /* Deactivated outcomes (is_active = false): not offered in any dropdown and refused for new
     completions, but follow-ups already saved with them keep their code and still appear in reports. */
  const INACTIVE_OUTCOMES = [
    { value: 'course_details_shared', label: 'Course Details Shared' }
  ];

  /* Sub-outcome codes renamed in later versions → current codes. Saved follow-ups are converted at startup. */
  const LEGACY_CODES = {
    subOutcomes: {
      interested: { interested_fee_discussion: 'fee_discussion', interested_documents_pending: 'documents_pending', interested_parent_discussion: 'parent_discussion', interested_admission_process: 'admission_process' },
      callback: { callback_student: 'student_requested', callback_parent: 'parent_requested', callback_specific_time: 'specific_time' },
      will_decide_later: { need_time: 'needs_more_time', compare_courses: 'comparing_courses', compare_universities: 'comparing_universities' },
      admitted_other_college: { admitted_same_course: 'same_course', admitted_other_course: 'other_course', admitted_other_university: 'other_university' },
      non_relevant: { not_student: 'not_a_student' }
    }
  };

  const find = (value) => CRM_OUTCOMES.find(o => o.value === value) || null;
  const findInactive = (value) => INACTIVE_OUTCOMES.find(o => o.value === value) || null;
  const isActive = (value) => !!find(value);
  const subOutcomesFor = (value) => CRM_SUB_OUTCOMES[value] || [];
  const label = (value, subValue) => { const o = find(value) || findInactive(value); if (!o) return ''; const s = subValue && subOutcomesFor(value).find(x => x.value === subValue); return s ? s.label : o.label; };
  /* Combined copy ({ value, label, subOutcomes }) as stored in organization settings. */
  const list = () => JSON.parse(JSON.stringify(CRM_OUTCOMES.map(o => Object.assign({}, o, { subOutcomes: subOutcomesFor(o.value) }))));
  /* ---------- Calls ----------
     A call counts as "connected" unless nobody could be reached. */
  const NOT_CONNECTED = ['not_available'];
  const isConnected = (outcome) => !!outcome && !NOT_CONNECTED.includes(outcome);
  /* Lead stage a call / completion moves the lead to. advanceOnly: never moves a lead backwards;
     otherwise applied only when the user ticks "update lead stage" (exit stages). */
  const LEAD_STAGE_RULES = {
    interested: { stage: 'Interested', advanceOnly: true },
    not_interested: { stage: 'Not Interested' },
    not_eligible: { stage: 'Not Eligible' },
    duplicate_lead: { stage: 'Duplicate' },
    non_relevant: { stage: 'Wrong Number', subOutcomes: ['wrong_lead'] }
  };
  function stageRule(outcome, subOutcome){
    const r = LEAD_STAGE_RULES[outcome]; if (!r) return null;
    if (r.subOutcomes && !r.subOutcomes.includes(subOutcome)) return null;
    return r;
  }
  /* Call dispositions used before calls moved to the outcome master → { outcome, subOutcome }. */
  const LEGACY_DISPOSITIONS = {
    'Connected': { outcome: 'general_query', subOutcome: '' },
    'Not Connected': { outcome: 'not_available', subOutcome: 'no_response' },
    'Busy': { outcome: 'not_available', subOutcome: 'busy' },
    'Switched Off': { outcome: 'not_available', subOutcome: 'switched_off' },
    'Wrong Number': { outcome: 'non_relevant', subOutcome: 'wrong_lead' },
    'Interested': { outcome: 'interested', subOutcome: '' },
    'Not Interested': { outcome: 'not_interested', subOutcome: '' },
    'Callback Required': { outcome: 'callback', subOutcome: '' }
  };
  const fromDisposition = (d) => LEGACY_DISPOSITIONS[d] ? Object.assign({}, LEGACY_DISPOSITIONS[d]) : null;

  /* Throws unless the code is an active outcome (and, when given, a sub-outcome of it). */
  const validOutcomes = new Set(CRM_OUTCOMES.map(o => o.value));
  function validateOutcome(outcome, subOutcome){
    if (!validOutcomes.has(outcome)) throw new Error('Invalid outcome selected.');
    const subs = subOutcomesFor(outcome);
    if (subs.length && !subOutcome) throw new Error('Select a sub outcome.');
    if (subOutcome && !subs.some(x => x.value === subOutcome)) throw new Error('Invalid sub outcome selected.');
    return true;
  }
  /* Maps a saved { outcome, subOutcome } from an older version to current codes (unchanged if already current). */
  function upgradeCodes(outcome, subOutcome){
    const sub = subOutcome && (LEGACY_CODES.subOutcomes[outcome] || {})[subOutcome];
    return sub ? { outcome, subOutcome: sub, changed: true } : { outcome, subOutcome, changed: false };
  }

  /* ---------- Browser helpers: any module can use these instead of building its own options ---------- */
  const PLACEHOLDER_OUTCOME = 'Select Outcome', PLACEHOLDER_SUB = 'Select Sub Outcome';
  function fillSelect(select, items, placeholder){
    const previous = select.value;
    select.innerHTML = '';
    const first = document.createElement('option'); first.value = ''; first.textContent = placeholder; select.appendChild(first);
    items.forEach(item => { const o = document.createElement('option'); o.value = item.value; o.textContent = item.label; select.appendChild(o); });
    // Restore only if the value still exists (retired codes are not restored).
    if (items.some(item => item.value === previous)) select.value = previous;
  }
  /* Fills the sub-outcome select for the chosen outcome: disabled until an outcome with sub-outcomes is chosen, required when enabled. */
  function loadSubOutcomes(outcomeSelect, subSelect){
    const subs = subOutcomesFor(outcomeSelect.value);
    fillSelect(subSelect, subs, PLACEHOLDER_SUB);
    subSelect.disabled = subs.length === 0;
    subSelect.required = subs.length > 0;
    if (!subs.length) subSelect.value = '';
  }
  /* Populates every .crm-outcome-select (and its paired .crm-sub-outcome-select in the same form) inside `root`. */
  function populateOutcomeDropdowns(root){
    const scope = root || document;
    scope.querySelectorAll('.crm-outcome-select').forEach(select => {
      fillSelect(select, CRM_OUTCOMES, PLACEHOLDER_OUTCOME);
      const form = select.closest('form') || scope;
      const sub = form.querySelector('.crm-sub-outcome-select');
      if (!sub) return;
      loadSubOutcomes(select, sub);
      if (!select.dataset.outcomeBound){ select.dataset.outcomeBound = '1'; select.addEventListener('change', () => loadSubOutcomes(select, sub)); }
    });
  }
  if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('DOMContentLoaded', () => populateOutcomeDropdowns());

  return { CRM_OUTCOMES, CRM_SUB_OUTCOMES, INACTIVE_OUTCOMES, LEGACY_CODES, LEGACY_DISPOSITIONS, LEAD_STAGE_RULES, find, findInactive, isActive, isConnected, stageRule, fromDisposition, validateOutcome, subOutcomesFor, label, list, upgradeCodes, populateOutcomeDropdowns, loadSubOutcomes, populateSubOutcomes: loadSubOutcomes };
});
