/* Password policy + strength estimation — one implementation shared by the
   browser (NL.passwordPolicy, drives the strength meter) and the Node server
   (require(), enforces the policy). The server is authoritative.

   Policy (NIST SP 800-63B aligned):
   - at least 12 characters (org settings may raise, never lower, this), at most 128
   - rejects common / breached-style passwords and trivial patterns
   - rejects passwords containing the user's name, email or username
   - upper/lower/number/special are *recommended*; an org can make them required
   - estimated strength must be at least "Fair" */
(function(root, factory){
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.NL = root.NL || {}; root.NL.passwordPolicy = api; }
})(typeof self !== 'undefined' ? self : this, function(){
  const MIN_LENGTH = 12, MAX_LENGTH = 128, MIN_SCORE = 2;
  const LABELS = ['Weak', 'Weak', 'Fair', 'Good', 'Strong'];

  /* Frequently breached base words. A password whose "core" (letters left after
     stripping leading/trailing digits and symbols and undoing leet-speak) is
     one of these — or a repetition of one — is rejected. */
  const COMMON_WORDS = ('password passwd pass passcode passphrase welcome qwerty qwertz azerty qwertyuiop asdf asdfgh asdfghjkl zxcvbn zxcvbnm letmein iloveyou loveyou ' +
    'admin administrator root user guest test tester testing default changeme change secret login logon master monkey dragon football baseball soccer cricket hockey ' +
    'basketball sunshine princess shadow superman batman spiderman trustno trustnoone hello hellothere freedom whatever starwars pokemon michael jessica charlie jordan ' +
    'hunter ranger killer samsung google computer internet mustang harley love family forever friends summer winter spring autumn january february march april may june ' +
    'july august september october november december monday friday sunday india bharat newleaf newleafglobal leaf university admission admissions crm student students ' +
    'college school counsellor counselor telecaller finance manager company office abc abcd abcdef abcdefg abcdefgh abcdefghijkl qazwsx qazwsxedc zaq zaqxsw ' +
    'princess1 flower cookie chocolate banana orange purple yellow silver golden diamond secure security access entry open openup sesame tiger lion eagle ' +
    'apple mango cheese pepper ginger matrix ninja welcome1 blessed jesus christ god allah krishna ganesh').split(/\s+/);
  const COMMON_EXACT = ('password1234 password12345 password123456 qwertyuiop12 qwertyuiop123 1q2w3e4r5t6y 1qaz2wsx3edc qazwsxedcrfv 123456789012 1234567890123 ' +
    'abcdefghijkl aaaaaaaaaaaa iloveyou1234 letmein12345 welcome12345 changeme1234 qwerty123456 asdfghjkl123 zaq12wsxcde3 passw0rd1234 p@ssw0rd1234 p@ssword1234 ' +
    'monkey123456 dragon123456 football1234 sunshine1234 princess1234 superman1234 baseball1234 1234qwerasdf qwer1234asdf q1w2e3r4t5y6 a1b2c3d4e5f6 987654321098 ' +
    '111111111111 000000000000 123123123123 abc123abc123 newleaf12345 newleafglobal administrator1 admin1234567 qwertyqwerty passwordpassword 1234567890ab').split(/\s+/);
  const KEYBOARD_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890', 'abcdefghijklmnopqrstuvwxyz'];
  const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i', '+': 't', '|': 'i' };

  function deLeet(s){ return s.replace(/[0134578@$!+|]/g, c => LEET[c] || c); }
  function core(pw){
    const lower = String(pw).toLowerCase();
    const stripped = lower.replace(/^[^a-z@$!|+]+|[^a-z]+$/g, '');
    return deLeet(stripped).replace(/[^a-z]/g, '');
  }
  function isRepetitionOf(s, word){ if (!word || s.length < word.length || s.length % word.length) return false; return word.repeat(s.length / word.length) === s; }
  function isCommon(pw){
    const lower = String(pw).toLowerCase();
    if (COMMON_EXACT.includes(lower)) return true;
    const c = core(pw);
    if (c.length < 3) return false; // digit/symbol-only passwords are judged by the pattern + entropy checks
    return COMMON_WORDS.some(w => c === w || isRepetitionOf(c, w));
  }

  /* Count characters that belong to runs (aaa), keyboard/alphabet sequences
     (abcd, 4321, qwer) — they add little entropy. */
  function patternChars(pw){
    const s = String(pw).toLowerCase(); let weak = 0;
    for (let i = 0; i < s.length;){
      let j = i + 1;
      while (j < s.length && s[j] === s[i]) j++;
      if (j - i >= 3){ weak += j - i - 1; i = j; continue; }
      let best = 0;
      for (const row of KEYBOARD_ROWS){
        for (const r of [row, row.split('').reverse().join('')]){
          const k = r.indexOf(s[i]); if (k < 0) continue;
          let n = 1; while (i + n < s.length && r[k + n] === s[i + n]) n++;
          if (n > best) best = n;
        }
      }
      if (best >= 3){ weak += best - 1; i += best; } else i++;
    }
    return weak;
  }

  function classes(pw){
    return { lower: /[a-z]/.test(pw), upper: /[A-Z]/.test(pw), digit: /\d/.test(pw), special: /[^A-Za-z0-9]/.test(pw) };
  }
  function estimateBits(pw){
    pw = String(pw || '');
    if (!pw) return 0;
    const c = classes(pw); let pool = 0;
    if (c.lower) pool += 26; if (c.upper) pool += 26; if (c.digit) pool += 10; if (c.special) pool += 33;
    if (/[^\x00-\x7F]/.test(pw)) pool += 60;
    const effective = Math.max(1, pw.length - patternChars(pw));
    let bits = effective * Math.log2(Math.max(pool, 10));
    if (isCommon(pw)) bits = Math.min(bits, 30);
    const uniq = new Set(pw).size; if (uniq <= 3) bits = Math.min(bits, 15);
    return bits;
  }
  function scoreFromBits(bits){ return bits < 40 ? 0 : bits < 55 ? 1 : bits < 70 ? 2 : bits < 90 ? 3 : 4; }

  function personalTokens(ctx){
    ctx = ctx || {}; const out = [];
    const add = (v, min) => { v = String(v || '').toLowerCase().trim(); if (v.length >= min) out.push(v); };
    add(ctx.firstName, 3); add(ctx.lastName, 3); add(ctx.username, 4);
    const email = String(ctx.email || '').toLowerCase(); const local = email.split('@')[0];
    add(local, 4); local.split(/[._+-]/).forEach(p => add(p, 4));
    return out;
  }

  /* evaluate(password, context, policy) → { ok, score, label, bits, errors, requirements }
     context: { email, firstName, lastName, username } — used to block personal info
     policy:  { minLength, requireUpper, requireNumber, requireSpecial } (optional) */
  function evaluate(password, context, policy){
    const pw = typeof password === 'string' ? password : '';
    policy = policy || {};
    const minLength = Math.max(MIN_LENGTH, Math.min(64, Number(policy.minLength) || MIN_LENGTH));
    const c = classes(pw);
    const lowerPw = pw.toLowerCase();
    const personal = personalTokens(context).some(t => lowerPw.includes(t) || deLeet(lowerPw).includes(t));
    const common = pw.length > 0 && isCommon(pw);
    const bits = estimateBits(pw); const score = pw ? scoreFromBits(bits) : 0;
    const requirements = [
      { id: 'length', label: `At least ${minLength} characters`, met: pw.length >= minLength && pw.length <= MAX_LENGTH, required: true },
      { id: 'common', label: 'Not a common or easily guessed password', met: pw.length > 0 && !common && score >= MIN_SCORE, required: true },
      { id: 'personal', label: "Doesn't contain your name or email", met: pw.length > 0 && !personal, required: true },
      { id: 'case', label: 'Upper- and lowercase letters', met: c.lower && c.upper, required: !!policy.requireUpper },
      { id: 'number', label: 'At least one number', met: c.digit, required: !!policy.requireNumber },
      { id: 'special', label: 'At least one special character', met: c.special, required: !!policy.requireSpecial }
    ];
    const errors = [];
    if (pw.length < minLength) errors.push(`Use at least ${minLength} characters.`);
    if (pw.length > MAX_LENGTH) errors.push(`Use at most ${MAX_LENGTH} characters.`);
    if (pw.length >= minLength && common) errors.push('This password is too common. Choose something harder to guess.');
    else if (pw.length >= minLength && score < MIN_SCORE) errors.push('This password is too easy to guess. Avoid repeated characters and sequences.');
    if (personal) errors.push("Don't include your name or email address.");
    if (policy.requireUpper && !(c.lower && c.upper)) errors.push('Include both upper- and lowercase letters.');
    if (policy.requireNumber && !c.digit) errors.push('Include at least one number.');
    if (policy.requireSpecial && !c.special) errors.push('Include at least one special character.');
    return { ok: errors.length === 0, score, label: pw ? LABELS[score] : '', bits: Math.round(bits), errors, requirements };
  }

  return { evaluate, estimateBits, isCommon, MIN_LENGTH, MAX_LENGTH, MIN_SCORE, LABELS };
});
