/* Course name → programme. Universities publish long names such as
   "Master of Business Administration (Digital Marketing)" or
   "MBA (Applied Finance) with PwC"; programmeOf() rolls them up to one
   programme ("MBA") so course-wise counts add up per programme. Integrated
   degrees keep both parts ("B.Com + LLB"). Shared by the browser and the
   server engine (src/api/demoRoutes.js, demoReports.js). */
(function(){
  // [programme, pattern] — matched against the start of the lower-cased name; order matters.
  const RULES = [
    ['MBA', /^(mba|m\.\s?b\.\s?a\.?|master of business administration|executive mba)\b/],
    ['BBA', /^(bba|b\.\s?b\.\s?a\.?|bachelor of business administration)\b/],
    ['MCA', /^(mca|m\.\s?c\.\s?a\.?|master of computer applications?)\b/],
    ['BCA', /^(bca|b\.\s?c\.\s?a\.?|bachelor of computer applications?)\b/],
    ['M.Com', /^(m\.?\s?com|master of commerce)\b/],
    ['B.Com', /^(b\.?\s?com|bachelor of commerce)\b/],
    ['M.Tech', /^(m\.?\s?tech|master of technology)\b/],
    ['B.Tech', /^(b\.?\s?tech|bachelor of technology)\b/],
    ['M.E.', /^(m\.\s?e\.?|master of engineering)\b/],
    ['B.E.', /^(b\.\s?e\.?|be(?=\s)|bachelor of engineering)\b/],
    ['M.Sc', /^(m\.?\s?sc|master of science)\b/],
    ['B.Sc', /^(b\.?\s?sc|bachelor of science)\b/],
    ['LLM', /^(llm|ll\.m\.?|master of laws?)\b/],
    ['LLB', /^(llb|ll\.b\.?|bachelor of laws?|bachelor of legislative law)\b/],
    ['M.Pharm', /^(m\.?\s?pharm|master of pharmacy)\b/],
    ['B.Pharm', /^(b\.?\s?pharm|bachelor of pharmacy)\b/],
    ['D.Pharm', /^(d\.?\s?pharm|diploma in pharmacy)\b/],
    ['MPT', /^(mpt|master of physiotherapy)\b/],
    ['BPT', /^(bpt|bachelor of physiotherapy)\b/],
    ['M.Des', /^(m\.?\s?des|master of design)\b/],
    ['B.Des', /^(b\.?\s?des|bachelor of design)\b/],
    ['M.P.Ed', /^(m\.?\s?p\.?\s?ed|master of physical education)\b/],
    ['B.P.Ed', /^(b\.?\s?p\.?\s?ed|bachelor of physical education)\b/],
    ['M.Ed', /^(m\.?\s?ed|master of education)\b/],
    ['B.Ed', /^(b\.?\s?ed|bachelor of education)\b/],
    ['B.Arch', /^(b\.?\s?arch|bachelor of architecture)\b/],
    ['BHM', /^(bhm|bachelor of hotel management)\b/],
    ['BJMC', /^(bjmc|bachelor of journalism)\b/],
    ['MJMC', /^(mjmc|master of journalism)\b/],
    ['B.Voc', /^(b\.?\s?voc|bachelor of vocation)\b/],
    ['MBBS', /^mbbs\b/], ['BDS', /^bds\b/],
    ['PhD', /^(ph\.?\s?d|doctor of philosophy)\b/],
    ['PG Diploma', /^(pgdm|pgd|post\s?-?graduat(e|ion) diploma)\b/],
    ['Diploma', /^diploma\b/],
    ['MA', /^(m\.?\s?a\.?|master of arts)\b(?!\s*\w*\s*of\s+(business|computer|commerce|science))/],
    ['BA', /^(b\.?\s?a\.?|bachelor of arts)\b(?!\s*\w*\s*of\s+(business|computer|commerce|science))/]
  ];
  const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  function single(name){
    const n = clean(name).toLowerCase(); if (!n) return '';
    for (const [p, re] of RULES) if (re.test(n)) return p;
    return '';
  }
  /* "MBA (Applied Finance) with PwC" → "MBA"; "Bachelor of Commerce + Bachelor of Law (Hons.) (Integrated)" → "B.Com + LLB";
     unknown names (e.g. "Data Science") stay as they are, so nothing is ever mis-grouped silently. */
  function programmeOf(name){
    const raw = clean(name); if (!raw) return '';
    const law = raw.toLowerCase().match(/^(bba|b\.?\s?b\.?\s?a|b\.?\s?com|b\.?\s?a|b\.?\s?sc)\.?\s*[-/]?\s*ll\.?\s?b\b/); // "BA LLB", "BBA-LLB"
    if (law) return single(law[1].replace(/\s+/g, '') === 'ba' ? 'BA' : law[1]) + ' + LLB';
    if (/\s\+\s|\s&\s(?=bachelor|master|b\.|m\.)/i.test(raw)){
      const parts = raw.split(/\s\+\s|\s&\s/).map(single);
      if (parts.length > 1 && parts.every(Boolean)) return parts.join(' + ');
    }
    return single(raw) || raw.replace(/\s*\(.*$/, '').trim() || raw;
  }
  const KNOWN = RULES.map(r => r[0]);

  const NLref = (typeof window !== 'undefined' && window.NL) || (typeof NL !== 'undefined' && NL);
  NLref.programs = { programmeOf, KNOWN };
})();
