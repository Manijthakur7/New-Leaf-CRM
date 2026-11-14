/* Authentication input validation — shared by the browser (NL.authValidation)
   and the Node server (require()). The server re-validates every request;
   the browser copy only gives early feedback. */
(function(root, factory){
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.NL = root.NL || {}; root.NL.authValidation = api; }
})(typeof self !== 'undefined' ? self : this, function(){
  /* ISO 3166-1 alpha-2 | name | international dialling code */
  const COUNTRIES = ('AF|Afghanistan|93;AX|Åland Islands|358;AL|Albania|355;DZ|Algeria|213;AS|American Samoa|1;AD|Andorra|376;AO|Angola|244;AI|Anguilla|1;AG|Antigua and Barbuda|1;' +
    'AR|Argentina|54;AM|Armenia|374;AW|Aruba|297;AU|Australia|61;AT|Austria|43;AZ|Azerbaijan|994;BS|Bahamas|1;BH|Bahrain|973;BD|Bangladesh|880;BB|Barbados|1;BY|Belarus|375;' +
    'BE|Belgium|32;BZ|Belize|501;BJ|Benin|229;BM|Bermuda|1;BT|Bhutan|975;BO|Bolivia|591;BQ|Caribbean Netherlands|599;BA|Bosnia and Herzegovina|387;BW|Botswana|267;BR|Brazil|55;' +
    'IO|British Indian Ocean Territory|246;VG|British Virgin Islands|1;BN|Brunei|673;BG|Bulgaria|359;BF|Burkina Faso|226;BI|Burundi|257;CV|Cabo Verde|238;KH|Cambodia|855;' +
    'CM|Cameroon|237;CA|Canada|1;KY|Cayman Islands|1;CF|Central African Republic|236;TD|Chad|235;CL|Chile|56;CN|China|86;CX|Christmas Island|61;CC|Cocos (Keeling) Islands|61;' +
    'CO|Colombia|57;KM|Comoros|269;CG|Congo|242;CD|Congo (DRC)|243;CK|Cook Islands|682;CR|Costa Rica|506;CI|Côte d’Ivoire|225;HR|Croatia|385;CU|Cuba|53;CW|Curaçao|599;' +
    'CY|Cyprus|357;CZ|Czechia|420;DK|Denmark|45;DJ|Djibouti|253;DM|Dominica|1;DO|Dominican Republic|1;EC|Ecuador|593;EG|Egypt|20;SV|El Salvador|503;GQ|Equatorial Guinea|240;' +
    'ER|Eritrea|291;EE|Estonia|372;SZ|Eswatini|268;ET|Ethiopia|251;FK|Falkland Islands|500;FO|Faroe Islands|298;FJ|Fiji|679;FI|Finland|358;FR|France|33;GF|French Guiana|594;' +
    'PF|French Polynesia|689;GA|Gabon|241;GM|Gambia|220;GE|Georgia|995;DE|Germany|49;GH|Ghana|233;GI|Gibraltar|350;GR|Greece|30;GL|Greenland|299;GD|Grenada|1;GP|Guadeloupe|590;' +
    'GU|Guam|1;GT|Guatemala|502;GG|Guernsey|44;GN|Guinea|224;GW|Guinea-Bissau|245;GY|Guyana|592;HT|Haiti|509;HN|Honduras|504;HK|Hong Kong|852;HU|Hungary|36;IS|Iceland|354;' +
    'IN|India|91;ID|Indonesia|62;IR|Iran|98;IQ|Iraq|964;IE|Ireland|353;IM|Isle of Man|44;IL|Israel|972;IT|Italy|39;JM|Jamaica|1;JP|Japan|81;JE|Jersey|44;JO|Jordan|962;' +
    'KZ|Kazakhstan|7;KE|Kenya|254;KI|Kiribati|686;XK|Kosovo|383;KW|Kuwait|965;KG|Kyrgyzstan|996;LA|Laos|856;LV|Latvia|371;LB|Lebanon|961;LS|Lesotho|266;LR|Liberia|231;' +
    'LY|Libya|218;LI|Liechtenstein|423;LT|Lithuania|370;LU|Luxembourg|352;MO|Macao|853;MG|Madagascar|261;MW|Malawi|265;MY|Malaysia|60;MV|Maldives|960;ML|Mali|223;MT|Malta|356;' +
    'MH|Marshall Islands|692;MQ|Martinique|596;MR|Mauritania|222;MU|Mauritius|230;YT|Mayotte|262;MX|Mexico|52;FM|Micronesia|691;MD|Moldova|373;MC|Monaco|377;MN|Mongolia|976;' +
    'ME|Montenegro|382;MS|Montserrat|1;MA|Morocco|212;MZ|Mozambique|258;MM|Myanmar|95;NA|Namibia|264;NR|Nauru|674;NP|Nepal|977;NL|Netherlands|31;NC|New Caledonia|687;' +
    'NZ|New Zealand|64;NI|Nicaragua|505;NE|Niger|227;NG|Nigeria|234;NU|Niue|683;NF|Norfolk Island|672;KP|North Korea|850;MK|North Macedonia|389;MP|Northern Mariana Islands|1;' +
    'NO|Norway|47;OM|Oman|968;PK|Pakistan|92;PW|Palau|680;PS|Palestine|970;PA|Panama|507;PG|Papua New Guinea|675;PY|Paraguay|595;PE|Peru|51;PH|Philippines|63;PN|Pitcairn Islands|64;' +
    'PL|Poland|48;PT|Portugal|351;PR|Puerto Rico|1;QA|Qatar|974;RE|Réunion|262;RO|Romania|40;RU|Russia|7;RW|Rwanda|250;BL|Saint Barthélemy|590;SH|Saint Helena|290;' +
    'KN|Saint Kitts and Nevis|1;LC|Saint Lucia|1;MF|Saint Martin|590;PM|Saint Pierre and Miquelon|508;VC|Saint Vincent and the Grenadines|1;WS|Samoa|685;SM|San Marino|378;' +
    'ST|São Tomé and Príncipe|239;SA|Saudi Arabia|966;SN|Senegal|221;RS|Serbia|381;SC|Seychelles|248;SL|Sierra Leone|232;SG|Singapore|65;SX|Sint Maarten|1;SK|Slovakia|421;' +
    'SI|Slovenia|386;SB|Solomon Islands|677;SO|Somalia|252;ZA|South Africa|27;KR|South Korea|82;SS|South Sudan|211;ES|Spain|34;LK|Sri Lanka|94;SD|Sudan|249;SR|Suriname|597;' +
    'SJ|Svalbard and Jan Mayen|47;SE|Sweden|46;CH|Switzerland|41;SY|Syria|963;TW|Taiwan|886;TJ|Tajikistan|992;TZ|Tanzania|255;TH|Thailand|66;TL|Timor-Leste|670;TG|Togo|228;' +
    'TK|Tokelau|690;TO|Tonga|676;TT|Trinidad and Tobago|1;TN|Tunisia|216;TR|Türkiye|90;TM|Turkmenistan|993;TC|Turks and Caicos Islands|1;TV|Tuvalu|688;UG|Uganda|256;' +
    'UA|Ukraine|380;AE|United Arab Emirates|971;GB|United Kingdom|44;US|United States|1;UY|Uruguay|598;VI|U.S. Virgin Islands|1;UZ|Uzbekistan|998;VU|Vanuatu|678;' +
    'VA|Vatican City|39;VE|Venezuela|58;VN|Vietnam|84;WF|Wallis and Futuna|681;EH|Western Sahara|212;YE|Yemen|967;ZM|Zambia|260;ZW|Zimbabwe|263')
    .split(';').map(r => { const [code, name, dial] = r.split('|'); return { code, name, dial }; });
  const COUNTRY_CODES = new Set(COUNTRIES.map(c => c.code));
  const countryByCode = (code) => COUNTRIES.find(c => c.code === code) || null;

  let tzCache = null;
  function timezones(){
    if (tzCache) return tzCache;
    try { tzCache = Intl.supportedValuesOf('timeZone'); } catch (e){ tzCache = []; }
    if (!tzCache.includes('UTC')) tzCache = ['UTC'].concat(tzCache);
    return tzCache;
  }
  /* Browsers disagree on canonical IDs (Asia/Kolkata vs Asia/Calcutta), so any extra valid
     zones (the user's saved or detected one) are always included in the options. */
  function timezoneOptions(...extra){
    const list = timezones().slice();
    extra.forEach(z => { if (z && !list.includes(z) && isTimezone(z)) list.push(z); });
    return list.sort();
  }
  function isTimezone(tz){
    if (typeof tz !== 'string' || !tz || tz.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(tz)) return false;
    if (timezones().includes(tz)) return true;
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (e){ return false; }
  }

  const str = (v) => typeof v === 'string' ? v : '';
  /* Email addresses are compared by their normalised form: trimmed and
     lowercased. Dots and +tags are kept — they are significant for many providers. */
  const normalizeEmail = (v) => str(v).trim().toLowerCase();
  function isEmail(v){
    const e = str(v).trim();
    if (e.length < 6 || e.length > 254 || /[\s<>()\[\]\\,;:"]/.test(e)) return false;
    const at = e.lastIndexOf('@'); if (at < 1) return false;
    const local = e.slice(0, at), domain = e.slice(at + 1);
    if (local.length > 64 || /^\.|\.$|\.\./.test(local) || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return false;
    const labels = domain.split('.'); if (labels.length < 2) return false;
    if (!labels.every(l => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(l))) return false;
    return /^[A-Za-z]{2,63}$/.test(labels[labels.length - 1]) || /^xn--[A-Za-z0-9-]+$/.test(labels[labels.length - 1]);
  }

  /* Phone numbers are stored in E.164 (+<country code><number>). */
  function normalizePhone(v, dial){
    let s = str(v).trim(); if (!s) return '';
    const plus = s.startsWith('+') || s.startsWith('00');
    let d = s.replace(/^00/, '').replace(/\D/g, '');
    if (!plus && dial){ d = d.replace(/^0+/, ''); if (!d.startsWith(dial) || d.length <= 10) d = dial + d; }
    return d ? '+' + d : '';
  }
  function isPhone(v){
    const s = str(v).trim();
    if (!/^\+?[\d\s().-]{8,24}$/.test(s)) return false;
    const d = s.replace(/\D/g, '');
    return d.length >= 8 && d.length <= 15 && !/^0/.test(d) && !/^(\d)\1+$/.test(d);
  }
  const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}' .\-]{0,59}$/u;
  const isName = (v) => NAME_RE.test(str(v).trim());
  const cleanText = (v, max) => str(v).replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max || 200);
  const isSafeText = (v, max) => { const s = str(v).trim(); return s.length <= (max || 200) && !/[<>\u0000-\u001F\u007F]/.test(s); };
  const USERNAME_RE = /^[A-Za-z0-9._-]{3,30}$/;
  const isUsername = (v) => USERNAME_RE.test(str(v));
  const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
  const isId = (v) => typeof v === 'string' && ID_RE.test(v);

  /* Only internal, path-only return URLs are allowed after login. Rejects
     absolute URLs, protocol-relative (//host), backslash tricks, control chars
     and auth pages themselves (no redirect loops). */
  const AUTH_ROUTES = ['login', 'signup', 'forgot-password', 'reset-password', 'verify-email', 'resend-verification', 'check-email', 'logout'];
  function safeReturnUrl(v){
    if (typeof v !== 'string' || !v || v.length > 512) return null;
    let s = v.trim();
    if (s.startsWith('#')) s = s.slice(1);
    if (!s.startsWith('/') || s.startsWith('//') || /[\\\u0000-\u001F\u007F\s]/.test(s) || /^\/[^/?#]*:/.test(s)) return null;
    if (!/^\/[A-Za-z0-9/_\-.~?=&%+]*$/.test(s)) return null;
    // Also judge the decoded form, so encoded tricks (%2F%2F, %0d%0a, %5C) are refused too.
    let decoded; try { decoded = decodeURIComponent(s); } catch (e){ return null; }
    if (decoded.startsWith('//') || /[\\\u0000-\u001F\u007F]/.test(decoded) || /^\/[^/?#]*:/.test(decoded)) return null;
    const first = s.slice(1).split(/[/?]/)[0];
    if (AUTH_ROUTES.includes(first)) return null;
    return s;
  }

  const SIGNUP_LIMITS = { name: 60, email: 254, organization: 120, jobTitle: 100 };
  /* Validates a signup payload → { values, errors } (errors keyed by field). */
  function validateSignup(b){
    b = b && typeof b === 'object' ? b : {};
    const errors = {};
    const values = {
      firstName: cleanText(b.firstName, 80), lastName: cleanText(b.lastName, 80), email: str(b.email).trim(),
      phone: str(b.phone).trim(), organization: cleanText(b.organization, 200), jobTitle: cleanText(b.jobTitle, 200),
      country: str(b.country).trim().toUpperCase(), timezone: str(b.timezone).trim(),
      acceptTerms: b.acceptTerms === true, acceptPrivacy: b.acceptPrivacy === true
    };
    if (!values.firstName) errors.firstName = 'First name is required.'; else if (!isName(values.firstName)) errors.firstName = 'Use letters, spaces, apostrophes or hyphens (max 60).';
    if (!values.lastName) errors.lastName = 'Last name is required.'; else if (!isName(values.lastName)) errors.lastName = 'Use letters, spaces, apostrophes or hyphens (max 60).';
    if (!values.email) errors.email = 'Work email is required.'; else if (!isEmail(values.email)) errors.email = 'Enter a valid email address, like name@university.edu.';
    if (!values.phone) errors.phone = 'Phone number is required.'; else if (!isPhone(values.phone)) errors.phone = 'Enter a valid phone number with country code, like +91 98765 43210.';
    if (!values.organization) errors.organization = 'Organization or university is required.'; else if (!isSafeText(values.organization, SIGNUP_LIMITS.organization) || values.organization.length < 2) errors.organization = 'Enter 2–120 characters without < or >.';
    if (values.jobTitle && !isSafeText(values.jobTitle, SIGNUP_LIMITS.jobTitle)) errors.jobTitle = 'Enter up to 100 characters without < or >.';
    if (!values.country) errors.country = 'Select your country.'; else if (!COUNTRY_CODES.has(values.country)) errors.country = 'Select a country from the list.';
    if (!values.timezone) errors.timezone = 'Select your timezone.'; else if (!isTimezone(values.timezone)) errors.timezone = 'Select a timezone from the list.';
    if (!values.acceptTerms) errors.acceptTerms = 'You must accept the Terms & Conditions.';
    if (!values.acceptPrivacy) errors.acceptPrivacy = 'You must accept the Privacy Policy.';
    if (!errors.phone){ const c = countryByCode(values.country); values.phone = normalizePhone(values.phone, c && c.dial); }
    return { values, errors };
  }

  return { COUNTRIES, COUNTRY_CODES, countryByCode, timezones, timezoneOptions, isTimezone, normalizeEmail, isEmail, normalizePhone, isPhone, isName, cleanText, isSafeText,
    isUsername, isId, safeReturnUrl, AUTH_ROUTES, validateSignup, SIGNUP_LIMITS };
});
