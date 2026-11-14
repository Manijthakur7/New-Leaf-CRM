/* Frontend validation. The demo server re-runs the same rules, mirroring how a
   real backend must never trust client-side validation alone. */
(function(){
  const digits = (s) => String(s || '').replace(/\D/g, '');
  function normalizeMobile(s){
    let d = digits(s);
    if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
    if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
    return d;
  }
  const isMobile = (s) => /^[6-9]\d{9}$/.test(normalizeMobile(s)) || (digits(s).length >= 10 && digits(s).length <= 15 && !/^0+$/.test(digits(s)));
  const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim());
  const isDate = (s) => !!s && !isNaN(new Date(s).getTime());
  const isAmount = (n) => n !== '' && n != null && isFinite(n) && Number(n) >= 0;
  const isPositive = (n) => isAmount(n) && Number(n) > 0;

  /* rules: { field: ['required', 'mobile', 'email', 'date', 'amount', 'positive', {min:n}, {max:n}, fn] } */
  function check(values, rules, labels){
    const errors = {};
    Object.entries(rules || {}).forEach(([k, list]) => {
      const v = values[k]; const empty = v == null || String(v).trim() === '';
      const label = (labels && labels[k]) || k;
      for (const r of list){
        if (r === 'required' && empty){ errors[k] = `${label} is required`; break; }
        if (empty) continue;
        if (r === 'mobile' && !isMobile(v)){ errors[k] = 'Enter a valid mobile number'; break; }
        if (r === 'email' && !isEmail(v)){ errors[k] = 'Enter a valid email address'; break; }
        if (r === 'date' && !isDate(v)){ errors[k] = 'Enter a valid date'; break; }
        if (r === 'amount' && !isAmount(v)){ errors[k] = 'Enter a valid amount'; break; }
        if (r === 'positive' && !isPositive(v)){ errors[k] = 'Amount must be greater than zero'; break; }
        if (typeof r === 'object' && r.min != null && String(v).length < r.min){ errors[k] = `${label} must be at least ${r.min} characters`; break; }
        if (typeof r === 'object' && r.max != null && Number(v) > r.max){ errors[k] = `${label} cannot exceed ${r.max}`; break; }
        if (typeof r === 'function'){ const m = r(v, values); if (m){ errors[k] = m; break; } }
      }
    });
    return errors;
  }

  function passwordIssues(pw, policy){
    policy = policy || { minLength: 8, requireUpper: true, requireNumber: true, requireSpecial: true };
    const issues = [];
    if (String(pw || '').length < policy.minLength) issues.push(`at least ${policy.minLength} characters`);
    if (policy.requireUpper && !/[A-Z]/.test(pw)) issues.push('an uppercase letter');
    if (policy.requireNumber && !/\d/.test(pw)) issues.push('a number');
    if (policy.requireSpecial && !/[^A-Za-z0-9]/.test(pw)) issues.push('a special character');
    return issues;
  }

  NL.validate = { digits, normalizeMobile, isMobile, isEmail, isDate, isAmount, isPositive, check, passwordIssues };
})();
