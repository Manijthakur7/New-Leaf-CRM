/* Realistic demo data, generated relative to "now" so today's dashboard is
   populated. Deterministic PRNG → the same dataset on every fresh install.

   DEMO / DEVELOPMENT ONLY. This file holds the demo account credentials. It is
   loaded by the in-browser demo and by `npm run seed:demo`; the server neither
   references nor serves it when DEMO_MODE is off, and demo accounts are refused
   at sign-in in that case. Never reuse the demo password anywhere real. */
(function(){
  const DEMO_PASSWORD = 'Demo@123';
  const DEMO_ACCOUNTS = [['superadmin', 'Super Admin'], ['admin', 'Admin'], ['priya.sharma', 'Team Leader'], ['aarav.mehta', 'Counsellor'], ['suresh.yadav', 'Telecaller'],
    ['amit.khanna', 'Finance'], ['farah.siddiqui', 'Doc Verification'], ['rajesh.nambiar', 'Management'], ['karan.thapa', 'Unassigned']];
  const DEFAULT_SETTINGS = {
    general: { companyName: 'New Leaf Global', productName: 'New Leaf University Admission CRM', logoText: 'NL', timezone: 'Asia/Kolkata', currency: 'INR' },
    leadStages: ['New','Contacted','Interested','Counselling','Qualified','Application Started','Application Submitted','Document Verification','Payment Pending','Paid','Admission Confirmed','Enrolled'],
    negativeStages: ['Not Interested','Invalid Number','Wrong Number','Duplicate','Not Eligible','Lost','Do Not Call'],
    applicationStages: ['Application Started','Application Form Completed','Documents Pending','Documents Submitted','Documents Under Verification','Documents Verified',
      'Payment Pending','Payment Completed','University Review','Admission Confirmed','Enrollment Completed','Rejected','Cancelled'],
    documentTypes: ['Aadhaar','PAN','Passport','Photograph','Signature','10th Certificate','12th Certificate','Graduation Certificate','Marksheet','Transfer Certificate',
      'Migration Certificate','Experience Certificate','Address Proof','Other'],
    requiredDocuments: ['Photograph','Signature','Aadhaar','10th Certificate','12th Certificate','Graduation Certificate'],
    leadSources: ['Website','Facebook','Instagram','YouTube','LinkedIn','X (Twitter)','Snapchat','Telegram','Google','WhatsApp','Referral','Walk-in','Telecalling','Education Fair','University','Partner','Campaign','Other'],
    priorities: ['Low','Medium','High','Urgent'],
    qualifications: ['10th','12th','Diploma','Graduation','Post Graduation','PhD'],
    learningModes: ['Online','On Campus','Distance','Hybrid'],
    degreeTypes: ['UG','PG','Diploma','Certificate','Doctorate'],
    paymentTypes: ['Application Fee','Registration Fee','Semester Fee','Annual Fee','Full Course Fee','Hostel Fee','Other'],
    paymentModes: ['UPI','Credit Card','Debit Card','Net Banking','NEFT/RTGS','Cheque','Cash','EMI'],
    /* Follow-up outcomes + sub-outcomes come from the central master: src/js/outcomes.js */
    followupOutcomes: NL.outcomes.list(),
    followupReasons: ['Callback','Counselling Session','Document Collection','Fee Payment','Application Follow-up','Course Details','Other'],
    scoring: {
      rules: [
        { key: 'validMobile', label: 'Valid mobile number', points: 20, enabled: true },
        { key: 'validEmail', label: 'Valid email address', points: 10, enabled: true },
        { key: 'interested', label: 'Stage is Interested or beyond', points: 20, enabled: true },
        { key: 'courseSelected', label: 'Course selected', points: 15, enabled: true },
        { key: 'universitySelected', label: 'University selected', points: 10, enabled: true },
        { key: 'followupScheduled', label: 'Follow-up scheduled', points: 15, enabled: true },
        { key: 'applicationStarted', label: 'Application started', points: 20, enabled: true }
      ],
      bands: [ { min: 0, max: 30, label: 'Cold' }, { min: 31, max: 60, label: 'Warm' }, { min: 61, max: 80, label: 'Hot' }, { min: 81, max: 100, label: 'Very Hot' } ]
    },
    assignment: { defaultMethod: 'round_robin', rrPointer: 0, universityMap: {}, courseMap: {}, campaignMap: {} },
    notifications: { followupReminderMinutes: 15, reminderPopup: true, applicationAlerts: true, paymentAlerts: true, documentAlerts: true },
    security: { sessionTimeoutMinutes: 30, passwordMinLength: 12, requireUpper: false, requireNumber: false, requireSpecial: false, maxLoginAttempts: 5 },
    performance: { rankBy: 'none', monthlyAdmissionTarget: 4, dailyCallTarget: 60 }
  };

  function run(db, h){
    let s = 20260924;
    const rnd = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const chance = (p) => rnd() < p;
    const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const wpick = (pairs) => { const tot = pairs.reduce((x, p) => x + p[1], 0); let r = rnd() * tot; for (const p of pairs){ r -= p[1]; if (r <= 0) return p[0]; } return pairs[0][0]; };
    const NOW = Date.now(); const HOUR = 3600000, DAY = 86400000;
    const iso = (t) => new Date(t).toISOString();
    const workHour = (t) => { const d = new Date(t); d.setHours(int(9, 19), int(0, 59), int(0, 59), 0); return Math.min(d.getTime(), NOW - 60000); };

    const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    db.setSettings(settings);
    NL.rbac.ROLES.forEach(r => db.insert('roles', { id: r.id, name: r.name, description: r.description, scope: r.scope, permissions: r.permissions.slice(), system: true }));

    /* ---------- Universities, campuses, courses ---------- */
    const UNIS = [
      ['Chandigarh University', 'CU', 'Private', 'NAAC A+, UGC, NIRF Ranked', 'Mohali', 'Punjab', 'https://www.cuchd.in', 'Harpreet Sandhu'],
      ['Manipal University Online', 'MUO', 'Private (Online)', 'NAAC A++, UGC-DEB', 'Manipal', 'Karnataka', 'https://www.onlinemanipal.com', 'Ananya Rao'],
      ['Sikkim Manipal University', 'SMU', 'Private', 'NAAC A+, UGC-DEB', 'Gangtok', 'Sikkim', 'https://www.smu.edu.in', 'Tenzing Bhutia'],
      ['Manipal University Jaipur', 'MUJ', 'Private', 'NAAC A+, UGC', 'Jaipur', 'Rajasthan', 'https://jaipur.manipal.edu', 'Rohit Shekhawat'],
      ['Chitkara University', 'CHU', 'Private', 'NAAC A+, UGC', 'Rajpura', 'Punjab', 'https://www.chitkara.edu.in', 'Simran Gill']
    ];
    const uni = {};
    UNIS.forEach(([name, code, type, acc, loc, state, web, cp]) => {
      uni[code] = db.insert('universities', { name, code, logo: '', website: web, type, accreditation: acc, location: loc, state, country: 'India', contactPerson: cp,
        contactNumber: '9' + String(int(100000000, 999999999)), email: `admissions@${code.toLowerCase()}.example.edu`, status: 'Active', createdAt: iso(NOW - 400 * DAY), updatedAt: iso(NOW - 30 * DAY) });
    });
    const CAMPUSES = [['CU','Mohali','Mohali','Punjab','NH-95, Chandigarh-Ludhiana Highway, Gharuan'],['CU','Uttar Pradesh','Lucknow','Uttar Pradesh','Unnao-Lucknow Road'],['CU','Online','Online','Punjab','Chandigarh University Online, Mohali'],
      ['MUO','Online','Online','Karnataka','Manipal Online, Madhav Nagar'],['SMU','Gangtok','Gangtok','Sikkim','5th Mile, Tadong'],['SMU','Online','Online','Sikkim','SMU Online Learning Centre'],
      ['MUJ','Jaipur','Jaipur','Rajasthan','Dehmi Kalan, Jaipur-Ajmer Expressway'],['MUJ','Online','Online','Rajasthan','MUJ Online Campus'],['CHU','Rajpura','Rajpura','Punjab','Chandigarh-Patiala Highway'],['CHU','Baddi','Baddi','Himachal Pradesh','Atal Shiksha Kunj, Barotiwala']];
    const camp = {};
    CAMPUSES.forEach(([u, name, loc, state, addr]) => {
      camp[u + ':' + name] = db.insert('campuses', { universityId: uni[u].id, name, location: loc, state, address: addr, contact: '0' + int(1700000000, 1799999999), status: 'Active', createdAt: iso(NOW - 380 * DAY), updatedAt: iso(NOW - 40 * DAY) });
    });
    const COURSES = [
      ['CU','Online','MBA','MBA-OL','PG','Management','2 Years','Online','Graduation with 50%',180000,1000,45000,'Up to 20% merit'],
      ['CU','Mohali','BBA','BBA-M','UG','Management','3 Years','On Campus','12th with 50%',390000,1500,65000,'Up to 50% CUCET'],
      ['CU','Online','BCA','BCA-OL','UG','Computer Applications','3 Years','Online','12th pass',150000,1000,25000,''],
      ['CU','Online','MCA','MCA-OL','PG','Computer Applications','2 Years','Online','BCA/B.Sc with Maths',160000,1000,40000,'10% early bird'],
      ['CU','Uttar Pradesh','Data Science','MSC-DS','PG','Computer Science','2 Years','On Campus','Graduation in Science/Engineering',320000,1500,80000,''],
      ['MUO','Online','MBA','MUO-MBA','PG','Management','2 Years','Online','Graduation with 50%',175000,500,43750,'Defence & alumni 20%'],
      ['MUO','Online','BBA','MUO-BBA','UG','Management','3 Years','Online','12th pass',135000,500,22500,''],
      ['MUO','Online','BCA','MUO-BCA','UG','Computer Applications','3 Years','Online','12th pass',135000,500,22500,''],
      ['MUO','Online','MCA','MUO-MCA','PG','Computer Applications','2 Years','Online','BCA/B.Sc/B.Com with Maths',158000,500,39500,''],
      ['MUO','Online','B.Com','MUO-BCOM','UG','Commerce','3 Years','Online','12th pass',99000,500,16500,''],
      ['MUO','Online','M.Com','MUO-MCOM','PG','Commerce','2 Years','Online','B.Com/BBA',110000,500,27500,''],
      ['MUO','Online','MA','MUO-MAJ','PG','Humanities','2 Years','Online','Any graduation',120000,500,30000,''],
      ['SMU','Online','BA','SMU-BA','UG','Humanities','3 Years','Online','12th pass',75000,500,12500,''],
      ['SMU','Online','B.Com','SMU-BCOM','UG','Commerce','3 Years','Online','12th pass',80000,500,13333,''],
      ['SMU','Gangtok','BCA','SMU-BCA','UG','Computer Applications','3 Years','On Campus','12th with Maths',240000,1000,40000,''],
      ['SMU','Online','MBA','SMU-MBA','PG','Management','2 Years','Online','Graduation with 50%',140000,500,35000,''],
      ['MUJ','Online','MBA','MUJ-MBA','PG','Management','2 Years','Online','Graduation with 50%',160000,500,40000,''],
      ['MUJ','Jaipur','Healthcare Management','MUJ-MHA','PG','Healthcare','2 Years','On Campus','Graduation in any stream',420000,1500,105000,'Merit 25%'],
      ['MUJ','Online','MCA','MUJ-MCA','PG','Computer Applications','2 Years','Online','BCA/B.Sc',150000,500,37500,''],
      ['CHU','Rajpura','BBA','CHU-BBA','UG','Management','3 Years','On Campus','12th with 50%',450000,1500,75000,'Sports quota'],
      ['CHU','Rajpura','Healthcare Management','CHU-BHA','UG','Healthcare','3 Years','On Campus','12th pass',360000,1500,60000,''],
      ['CHU','Baddi','Data Science','CHU-BDS','UG','Computer Science','3 Years','On Campus','12th with Maths',480000,1500,80000,'Up to 30% merit']
    ];
    const courses = COURSES.map(([u, c, name, code, deg, dept, dur, mode, elig, total, appFee, sem, sch]) =>
      db.insert('courses', { universityId: uni[u].id, campusId: camp[u + ':' + c].id, name, code, degreeType: deg, department: dept, duration: dur, mode, eligibility: elig,
        totalFees: total, applicationFee: appFee, semesterFee: sem, scholarship: sch, intake: pick(['July 2026','January 2027','July 2027']), seats: int(60, 480), status: 'Active',
        createdAt: iso(NOW - 360 * DAY), updatedAt: iso(NOW - int(5, 90) * DAY) }));

    /* ---------- Teams & users ---------- */
    const salt = () => NL.crypto.randomSalt();
    function user(fullName, username, role, dept, teamId, extra){
      const sl = salt();
      return db.insert('users', Object.assign({ fullName, username, email: username.replace(/\./g, '') + '@newleafglobal.example', mobile: '9' + int(100000000, 999999999),
        employeeId: 'NLG' + int(1000, 9999), department: dept, status: 'Active', accountStatus: 'ACTIVE', emailVerifiedAt: iso(NOW - 60 * DAY), role, teamId: teamId || null, salt: sl, passwordHash: NL.crypto.hashPassword(DEMO_PASSWORD, sl),
        mustChangePassword: false, createdAt: iso(NOW - int(60, 400) * DAY), updatedAt: iso(NOW - int(1, 30) * DAY), lastLoginAt: null, lastLogoutAt: null, lastActivityAt: null,
        presence: 'Offline', presenceSince: iso(NOW - int(1, 8) * HOUR), sessions: [], failedLogins: 0,
        targets: { monthlyAdmissions: 12, dailyCalls: 60, monthlyApplications: 25 } }, extra || {}));
    }
    user('Super Administrator', 'superadmin', 'super_admin', 'Management');
    user('Manij', 'admin', 'admin', 'Operations');
    const tA = db.insert('teams', { name: 'Team Alpha — Online Programs', description: 'Online MBA, MCA, BCA and commerce programs', teamLeaderId: null, status: 'Active', createdAt: iso(NOW - 300 * DAY) });
    const tB = db.insert('teams', { name: 'Team Beta — Campus Programs', description: 'On-campus UG/PG programs at CU, MUJ and Chitkara', teamLeaderId: null, status: 'Active', createdAt: iso(NOW - 300 * DAY) });
    const tC = db.insert('teams', { name: 'Team Gamma — Tele-counselling', description: 'Inbound, campaign and telecalling leads', teamLeaderId: null, status: 'Active', createdAt: iso(NOW - 200 * DAY) });
    const tlA = user('Priya Sharma', 'priya.sharma', 'team_leader', 'Admissions', tA.id);
    const tlB = user('Rahul Verma', 'rahul.verma', 'team_leader', 'Admissions', tB.id);
    const tlC = user('Sneha Iyer', 'sneha.iyer', 'team_leader', 'Admissions', tC.id);
    tA.teamLeaderId = tlA.id; tB.teamLeaderId = tlB.id; tC.teamLeaderId = tlC.id;
    const C = [
      ['Aarav Mehta','aarav.mehta',tA],['Diya Kapoor','diya.kapoor',tA],['Vihaan Singh','vihaan.singh',tA],['Ishita Nair','ishita.nair',tA],
      ['Kabir Malhotra','kabir.malhotra',tB],['Meera Joshi','meera.joshi',tB],['Arjun Reddy','arjun.reddy',tB],
      ['Tanvi Desai','tanvi.desai',tC],['Rohan Gupta','rohan.gupta',tC],['Nisha Bansal','nisha.bansal',tC]
    ].map(([n, u, t]) => user(n, u, 'counsellor', 'Admissions', t.id, { targets: { monthlyAdmissions: int(2, 4), dailyCalls: 60, monthlyApplications: int(6, 10) } }));
    const T = [['Suresh Yadav','suresh.yadav',tC],['Pooja Rawat','pooja.rawat',tC]].map(([n, u, t]) => user(n, u, 'telecaller', 'Tele-calling', t.id, { targets: { monthlyAdmissions: 0, dailyCalls: 120, monthlyApplications: 0 } }));
    const finance = user('Amit Khanna', 'amit.khanna', 'finance', 'Finance');
    const docs = user('Farah Siddiqui', 'farah.siddiqui', 'doc_verifier', 'Document Verification');
    user('Rajesh Nambiar', 'rajesh.nambiar', 'management', 'Management');
    user('Karan Thapa', 'karan.thapa', 'unassigned', 'Admissions');
    const workers = C.concat(T);
    const teamOf = (u) => db.get('teams', u.teamId);
    // Presence / sessions for today (retains the LeafPulse live-floor concept)
    workers.concat([tlA, tlB, tlC]).forEach(u => {
      if (chance(0.8)){
        const login = NOW - int(1, 7) * HOUR - int(0, 59) * 60000;
        u.sessions = [{ login: iso(login), logout: null }]; u.lastLoginAt = iso(login); u.lastActivityAt = iso(NOW - int(1, 40) * 60000);
        u.presence = wpick([['Available', 5], ['On Call', 3], ['On Break', 1]]); u.presenceSince = iso(NOW - int(2, 55) * 60000);
      }
    });
    settings.assignment.universityMap = { [uni.CHU.id]: [C[4].id, C[5].id], [uni.MUJ.id]: [C[6].id, C[5].id] };
    settings.assignment.courseMap = { 'Healthcare Management': [C[5].id, C[6].id], 'Data Science': [C[2].id, C[4].id] };

    /* ---------- Campaigns ---------- */
    const CPN = [['Online MBA — Summer Intake','MUO','MBA','Google',120,20,450000,'Active'],['CU Online Admissions Drive','CU','','Facebook',150,30,380000,'Active'],
      ['Chitkara Campus Open Day','CHU','BBA','Walk-in',90,60,120000,'Completed'],['SMU Distance UG Push','SMU','BA','Instagram',75,5,210000,'Active'],
      ['MUJ Healthcare Leaders','MUJ','Healthcare Management','Google',60,-10,260000,'Active'],['WhatsApp Re-engagement','','','WhatsApp',45,-5,40000,'Active'],
      ['Alumni Referral Program','','','Referral',180,-30,60000,'Active'],['Data Science Webinar Series','CU','Data Science','Campaign',100,10,180000,'Paused']];
    const campaigns = CPN.map(([name, u, course, source, startAgo, endIn, budget, status]) => db.insert('campaigns', { name, universityId: u ? uni[u].id : '', course, source,
      startDate: NL.fmt.ymd(NOW - startAgo * DAY), endDate: NL.fmt.ymd(NOW + endIn * DAY), budget, status, createdAt: iso(NOW - startAgo * DAY), updatedAt: iso(NOW - 3 * DAY) }));

    /* ---------- People data ---------- */
    const FIRST_M = ['Aditya','Rohit','Karan','Yash','Nikhil','Siddharth','Aman','Harsh','Varun','Manish','Deepak','Gaurav','Ankit','Rajat','Abhishek','Mohit','Pranav','Saurabh','Vikram','Kunal','Imran','Faizan','Gurpreet','Jaspreet','Tushar'];
    const FIRST_F = ['Ananya','Priyanka','Shreya','Neha','Riya','Pooja','Sakshi','Aditi','Kritika','Simran','Divya','Megha','Nandini','Swati','Tanya','Aisha','Zoya','Harleen','Bhavna','Isha','Komal','Payal','Rashmi','Sonal','Vaishnavi'];
    const LAST = ['Sharma','Verma','Gupta','Singh','Kumar','Patel','Reddy','Nair','Iyer','Chauhan','Thakur','Bhatia','Arora','Saxena','Mishra','Pandey','Joshi','Kaur','Chopra','Rathore','Das','Banerjee','Mukherjee','Khan','Ansari','Pillai','Menon','Rao','Jain','Agarwal'];
    const PLACES = [['Punjab',['Ludhiana','Amritsar','Jalandhar','Patiala','Mohali']],['Haryana',['Gurugram','Faridabad','Panipat','Ambala']],['Delhi',['New Delhi','Dwarka','Rohini']],
      ['Uttar Pradesh',['Lucknow','Noida','Kanpur','Varanasi','Agra']],['Rajasthan',['Jaipur','Udaipur','Jodhpur','Kota']],['Maharashtra',['Mumbai','Pune','Nagpur','Nashik']],
      ['Karnataka',['Bengaluru','Mysuru','Mangaluru']],['Himachal Pradesh',['Shimla','Solan','Dharamshala']],['Bihar',['Patna','Gaya']],['West Bengal',['Kolkata','Siliguri']],
      ['Madhya Pradesh',['Indore','Bhopal']],['Uttarakhand',['Dehradun','Haridwar']],['Sikkim',['Gangtok']],['Gujarat',['Ahmedabad','Surat','Vadodara']]];
    const NOTES = ['Discussed program structure and fee installments. Student keen on weekend classes.','Parent joined the call; wants placement statistics before deciding.',
      'Working professional — prefers online mode, asked about EMI options.','Compared with another university; highlighted UGC-DEB approval and alumni network.',
      'Shared brochure and fee structure on WhatsApp.','Student needs scholarship details — escalated to university contact.','Eligibility confirmed; asked to keep marksheets ready.',
      'Requested callback after exams next week.','Interested in specialisation in Finance and Business Analytics.','Explained document checklist and application process.'];
    const usedMobiles = new Set();
    const mobile = () => { let m; do { m = pick(['9','8','7','6']) + String(int(100000000, 999999999)); } while (usedMobiles.has(m)); usedMobiles.add(m); return m; };

    const STAGES = settings.leadStages;
    const PROB = [1, 0.86, 0.66, 0.8, 0.74, 0.72, 0.86, 0.88, 0.9, 0.76, 0.9, 0.86];
    const coursesByName = {}; courses.forEach(c => (coursesByName[c.name] = coursesByName[c.name] || []).push(c));

    const leadRecs = [];
    const N = 520;
    for (let i = 0; i < N; i++){
      // Age skewed to recent: more leads in last 30 days; ~18 created today
      const ageDays = i < 18 ? rnd() * ((new Date(NOW).getHours() - 8.5) / 24 > 0 ? (new Date(NOW).getHours() - 8.5) / 24 : 0.05) : Math.pow(rnd(), 1.7) * 180;
      const createdAt = Math.min(NOW - 5 * 60000, i < 18 ? NOW - ageDays * DAY - 60000 : workHour(NOW - ageDays * DAY));
      const female = chance(0.5); const first = pick(female ? FIRST_F : FIRST_M); const last = pick(LAST);
      const [state, cities] = pick(PLACES); const city = pick(cities);
      const course = pick(courses); const c = course;
      const campaign = chance(0.55) ? pick(campaigns) : null;
      const source = campaign ? (campaign.source === 'Walk-in' ? 'Walk-in' : campaign.source) : wpick([['Website', 5], ['Google', 4], ['Facebook', 3], ['Instagram', 3], ['WhatsApp', 2], ['Referral', 2], ['Walk-in', 1], ['Telecalling', 2], ['University', 1], ['Partner', 1], ['Other', 1]]);
      const owner = (i < 6 && chance(0.7)) ? null : pick(workers);
      const m = mobile();
      const lead = {
        name: `${first} ${last}`, mobile: m, whatsapp: chance(0.85) ? m : '', email: chance(0.82) ? `${first}.${last}${int(1, 99)}@${pick(['gmail.com','yahoo.in','outlook.com','rediffmail.com'])}`.toLowerCase() : '',
        source, campaignId: campaign ? campaign.id : '', universityId: c.universityId, campusId: c.campusId, courseId: c.id, preferredCourse: c.name,
        state, city, qualification: c.degreeType === 'PG' ? pick(['Graduation', 'Graduation', 'Post Graduation']) : pick(['12th', '12th', 'Diploma']),
        passingYear: String(int(2012, 2026)), priority: wpick([['Low', 2], ['Medium', 5], ['High', 3], ['Urgent', 1]]), stage: 'New',
        counsellorId: owner ? owner.id : null, teamId: owner ? owner.teamId : null, teamLeaderId: owner ? teamOf(owner).teamLeaderId : null,
        assignedAt: owner ? iso(createdAt + int(2, 90) * 60000) : null, assignmentMethod: owner ? wpick([['round_robin', 5], ['manual', 3], ['team', 1], ['campaign', 1]]) : null,
        assignmentHistory: [], stageHistory: [{ stage: 'New', at: iso(createdAt), by: owner ? owner.id : null }], lastContactAt: null, nextFollowupAt: null,
        createdAt: iso(createdAt), updatedAt: iso(createdAt), status: 'Active', studentId: null, remarks: '', createdBy: null, score: 0
      };
      if (owner) lead.assignmentHistory.push({ from: null, to: owner.id, by: null, at: lead.assignedAt, method: lead.assignmentMethod });
      // progression
      let t = createdAt + int(1, 6) * HOUR; let reached = 0;
      for (let k = 1; k < STAGES.length && owner; k++){
        if (!chance(PROB[k])) break;
        const step = (k <= 2 ? rnd() * 1.5 : rnd() * 5 + 0.3) * DAY;
        if (t + step > NOW) break;
        t += step; reached = k;
        const prevT = new Date(lead.stageHistory[lead.stageHistory.length - 1].at).getTime();
        t = Math.min(NOW - 60000, Math.max(workHour(t), prevT + int(20, 90) * 60000)); // strictly increasing stage times
        lead.stageHistory.push({ stage: STAGES[k], at: iso(t), by: owner.id });
      }
      lead.stage = STAGES[reached];
      const age = (NOW - createdAt) / DAY;
      if (owner && reached < 11 && age > 6 && chance(0.42)){
        const neg = reached === 0 ? pick(['Invalid Number', 'Wrong Number', 'Do Not Call', 'Lost']) : reached < 5 ? pick(['Not Interested', 'Not Interested', 'Not Eligible', 'Lost', 'Duplicate']) : pick(['Lost', 'Not Interested']);
        const at = Math.min(NOW - HOUR, t + int(1, 5) * DAY);
        lead.stageHistory.push({ stage: neg, at: iso(at), by: owner.id }); lead.stage = neg;
      }
      lead.updatedAt = lead.stageHistory[lead.stageHistory.length - 1].at;
      lead.reached = reached;
      leadRecs.push(lead);
    }
    leadRecs.sort((a, b) => a.createdAt < b.createdAt ? -1 : 1);
    leadRecs.forEach(l => { const r = l.reached; delete l.reached; db.insert('leads', l); l._reached = r; });

    /* ---------- Calls, notes, follow-ups ---------- */
    // Demo call outcomes (codes from the outcome master)
    const OK_CALLS = [['interested', 'highly_interested'], ['interested', 'fee_discussion'], ['interested', 'parent_discussion'], ['callback', 'student_requested'], ['callback', 'callback_tomorrow'],
      ['will_decide_later', 'needs_more_time'], ['will_decide_later', 'discuss_with_parents'], ['general_query', 'course_query'], ['general_query', 'fee_query']];
    const NO_CONTACT = [['not_available', 'no_response'], ['not_available', 'busy'], ['not_available', 'switched_off']];
    const callOutcome = (pair) => ({ outcome: pair[0], subOutcome: pair[1] });
    leadRecs.forEach(l => {
      if (!l.counsellorId) return;
      const hist = l.stageHistory; const start = new Date(l.createdAt).getTime(); const end = new Date(hist[hist.length - 1].at).getTime();
      const nCalls = l._reached === 0 ? int(0, 3) : int(1, 2) + Math.min(5, l._reached);
      let lastContact = null;
      for (let k = 0; k < nCalls; k++){
        const at = Math.min(NOW - 120000, workHour(start + (end - start) * (k / Math.max(1, nCalls)) + int(10, 300) * 60000));
        const connected = l._reached > 0 && (k > 0 || chance(0.7));
        const oc = callOutcome(connected ? pick(OK_CALLS) : l.stage === 'Wrong Number' && chance(0.5) ? ['non_relevant', 'wrong_lead'] : pick(NO_CONTACT));
        const dur = connected ? int(90, 1100) : int(0, 35);
        db.insert('calls', { leadId: l.id, counsellorId: l.counsellorId, startAt: iso(at), endAt: iso(at + dur * 1000), duration: dur, type: wpick([['Outgoing', 8], ['Incoming', 2], ['Callback', 2]]),
          outcome: oc.outcome, subOutcome: oc.subOutcome, notes: connected ? pick(NOTES) : '', nextFollowupAt: null, createdAt: iso(at) });
        if (connected) lastContact = at;
      }
      // Today's call activity for active leads
      if (!settings.negativeStages.includes(l.stage) && l._reached < 11 && chance(0.28)){
        const at = NOW - int(5, Math.max(6, Math.min(540, (new Date(NOW).getHours() - 9) * 60))) * 60000;
        if (at > new Date(l.createdAt).getTime()){
          const connected = chance(0.62); const dur = connected ? int(120, 900) : int(0, 30);
          db.insert('calls', { leadId: l.id, counsellorId: l.counsellorId, startAt: iso(at), endAt: iso(at + dur * 1000), duration: dur, type: 'Outgoing',
            ...callOutcome(connected ? pick(OK_CALLS) : pick(NO_CONTACT)), notes: connected ? pick(NOTES) : '', nextFollowupAt: null, createdAt: iso(at) });
          if (connected) lastContact = at;
        }
      }
      if (lastContact) l.lastContactAt = iso(lastContact);
      if (l._reached >= 2 && chance(0.8)) db.insert('notes', { leadId: l.id, studentId: null, authorId: l.counsellorId, type: 'Counselling', text: pick(NOTES), createdAt: l.stageHistory[Math.min(2, l.stageHistory.length - 1)].at });
      // follow-ups
      const active = !settings.negativeStages.includes(l.stage) && l._reached < 11;
      if (l._reached >= 1 && chance(0.6)){
        const done = new Date(l.stageHistory[1].at).getTime() + int(1, 2) * DAY;
        if (done < NOW) db.insert('followups', { leadId: l.id, counsellorId: l.counsellorId, dueAt: iso(done), reason: pick(settings.followupReasons), notes: 'Follow-up on counselling discussion',
          status: 'Completed', completedAt: iso(done + int(0, 120) * 60000), outcome: 'Spoke to student', ...(() => { const c = wpick([['interested', 34], ['callback', 20], ['will_decide_later', 14], ['general_query', 10], ['not_interested', 9], ['not_eligible', 5], ['admitted_other_college', 3], ['not_available', 2], ['duplicate_lead', 1.5], ['non_relevant', 1], ['others', 0.5]]);
            const subs = NL.outcomes.subOutcomesFor(c); return { completionOutcome: c, completionSubOutcome: subs.length ? pick(subs).value : '' }; })(), createdAt: l.stageHistory[1].at, createdBy: l.counsellorId });
      }
      if (active && chance(0.42)){
        const offset = wpick([[-3, 1], [-1, 2], [0, 4], [1, 3], [3, 2], [6, 1]]);
        const at = (t) => { const d = new Date(t); d.setHours(int(10, 18), pick([0, 15, 30, 45]), 0, 0); return d.getTime(); };
        const due = offset === 0 ? NOW + int(-120, 360) * 60000 : offset < 0 ? workHour(NOW + offset * DAY) : at(NOW + offset * DAY);
        const fu = db.insert('followups', { leadId: l.id, counsellorId: l.counsellorId, dueAt: iso(due), reason: pick(settings.followupReasons), notes: pick(['Share fee structure', 'Confirm documents', 'Discuss scholarship', 'Callback requested by student', 'Parent discussion pending']),
          status: 'Pending', completedAt: null, createdAt: iso(Math.min(NOW - 3600000, due - DAY)), createdBy: l.counsellorId });
        l.nextFollowupAt = fu.dueAt;
      }
    });

    /* ---------- Students, applications, documents, payments ---------- */
    const APP_STAGE_FOR = { 5: 'Application Started', 6: 'Documents Submitted', 7: 'Documents Under Verification', 8: 'Payment Pending', 9: 'Payment Completed', 10: 'Admission Confirmed', 11: 'Enrollment Completed' };
    const GENDER = (n) => FIRST_F.includes(n.split(' ')[0]) ? 'Female' : 'Male';
    leadRecs.filter(l => l._reached >= 4).forEach(l => {
      const qAt = l.stageHistory.find(x => x.stage === 'Qualified').at;
      const c = db.get('courses', l.courseId);
      const st = db.insert('students', {
        leadId: l.id, fullName: l.name, fatherName: pick(FIRST_M) + ' ' + l.name.split(' ')[1], motherName: pick(FIRST_F) + ' ' + l.name.split(' ')[1],
        dob: NL.fmt.ymd(new Date(int(1990, 2007), int(0, 11), int(1, 28))), gender: GENDER(l.name), mobile: l.mobile, altMobile: chance(0.4) ? mobile() : '', whatsapp: l.whatsapp, email: l.email,
        address: `${int(1, 400)}, ${pick(['Sector ' + int(1, 60), 'Model Town', 'Civil Lines', 'Shastri Nagar', 'Green Park', 'MG Road'])}`, city: l.city, state: l.state, country: 'India', pin: String(int(110001, 799999)),
        highestQualification: l.qualification, board: pick(['CBSE', 'ICSE', 'State Board', 'Punjab University', 'Delhi University', 'IGNOU']), passingYear: l.passingYear,
        percentage: String(int(52, 94)), cgpa: '', graduation: l.qualification === 'Graduation' || l.qualification === 'Post Graduation' ? pick(['B.Com', 'B.Sc', 'BA', 'BBA', 'B.Tech', 'BCA']) : '',
        postGraduation: l.qualification === 'Post Graduation' ? pick(['M.Com', 'MA', 'M.Sc']) : '', workExperience: c.degreeType === 'PG' ? pick(['Fresher', '1 year', '2 years', '4 years', '6+ years']) : 'Fresher',
        prefUniversityId: l.universityId, prefCampusId: l.campusId, prefCourseId: l.courseId, learningMode: c.mode, intake: c.intake, prefLocation: l.city, budget: String(Math.round(c.totalFees * (0.8 + rnd() * 0.5) / 1000) * 1000),
        counsellorId: l.counsellorId, createdAt: qAt, updatedAt: qAt, createdBy: l.counsellorId
      });
      l.studentId = st.id;
      if (l._reached < 5) return;
      const startedAt = new Date(l.stageHistory.find(x => x.stage === 'Application Started').at).getTime();
      const primary = APP_STAGE_FOR[Math.min(11, l._reached)] || 'Application Started';
      const apps = [{ course: c, stage: l.stage === 'Lost' || l.stage === 'Not Interested' ? 'Cancelled' : primary, at: startedAt }];
      if (chance(0.22)){ const alt = pick(courses.filter(x => x.universityId !== c.universityId && x.degreeType === c.degreeType)); if (alt) apps.push({ course: alt, stage: pick(['Application Started', 'Documents Pending', 'Rejected', 'Cancelled']), at: startedAt + int(1, 4) * DAY }); }
      // documents (student level, linked to first application)
      const docRank = l._reached;
      apps.forEach((a, ai) => {
        if (a.at > NOW) a.at = NOW - HOUR;
        const stagesAll = settings.applicationStages; const tgt = stagesAll.indexOf(a.stage);
        const hist = []; let tt = a.at;
        const linear = a.stage === 'Rejected' || a.stage === 'Cancelled' ? [0, 1, 2, stagesAll.indexOf(a.stage)] : stagesAll.slice(0, tgt + 1).map((_, k) => k).filter(k => k <= tgt && ![11, 12].includes(k));
        linear.forEach((k, j) => { if (j) tt = Math.min(NOW - 60000, tt + rnd() * 1.6 * DAY); hist.push({ stage: stagesAll[k], at: iso(tt), by: l.counsellorId }); });
        const paid = ['Payment Completed', 'University Review', 'Admission Confirmed', 'Enrollment Completed'].includes(a.stage);
        const app = db.insert('applications', {
          applicationNo: `${db.get('universities', a.course.universityId).code}/${new Date(a.at).getFullYear()}/${int(100000, 999999)}`, studentId: st.id, leadId: l.id,
          universityId: a.course.universityId, campusId: a.course.campusId, courseId: a.course.id, applicationDate: NL.fmt.ymd(a.at), stage: a.stage, counsellorId: l.counsellorId,
          documentsStatus: 'Pending', paymentStatus: paid ? 'Paid' : a.stage === 'Payment Pending' ? 'Pending' : 'Not Due', verificationStatus: 'Pending',
          admissionStatus: a.stage === 'Admission Confirmed' ? 'Confirmed' : a.stage === 'Enrollment Completed' ? 'Enrolled' : a.stage === 'Rejected' ? 'Rejected' : a.stage === 'Cancelled' ? 'Cancelled' : 'In Progress',
          stageHistory: hist, createdAt: iso(a.at), updatedAt: hist[hist.length - 1].at, createdBy: l.counsellorId
        });
        if (ai === 0){
          settings.requiredDocuments.forEach(type => {
            if (type === 'Graduation Certificate' && a.course.degreeType !== 'PG') return;
            let status = 'Pending';
            if (docRank >= 6) status = 'Uploaded';
            if (docRank >= 7) status = chance(0.5) ? 'Under Review' : 'Verified';
            if (docRank >= 8) status = chance(0.93) ? 'Verified' : 'Rejected';
            if (docRank === 6 && chance(0.3)) status = 'Pending';
            const upAt = Math.min(NOW - HOUR, a.at + rnd() * 2 * DAY);
            const d = { studentId: st.id, applicationId: app.id, type, fileName: status === 'Pending' ? '' : `${type.replace(/\W+/g, '_').toLowerCase()}_${st.id}.${pick(['pdf', 'jpg', 'pdf'])}`,
              fileSize: status === 'Pending' ? 0 : int(80, 2400) * 1024, status, uploadedAt: status === 'Pending' ? null : iso(upAt), uploadedBy: status === 'Pending' ? null : l.counsellorId,
              reviewedBy: ['Verified', 'Rejected'].includes(status) ? docs.id : null, reviewedAt: ['Verified', 'Rejected'].includes(status) ? iso(Math.min(NOW - 60000, upAt + rnd() * DAY)) : null,
              rejectionReason: status === 'Rejected' ? pick(['Image is blurred — please re-upload a clear scan', 'Name mismatch with Aadhaar', 'Document expired / incomplete pages']) : '',
              remarks: '', createdAt: iso(a.at) };
            db.insert('documents', d);
          });
          const ds = db.all('documents').filter(d => d.applicationId === app.id);
          app.documentsStatus = ds.every(d => d.status === 'Verified') ? 'Verified' : ds.some(d => d.status === 'Rejected') ? 'Rejected' : ds.some(d => d.status === 'Pending') ? 'Pending' : 'Submitted';
          app.verificationStatus = ds.every(d => d.status === 'Verified') ? 'Verified' : ds.some(d => d.status === 'Rejected') ? 'Rejected' : ds.some(d => ['Under Review', 'Uploaded'].includes(d.status)) ? 'Under Review' : 'Pending';
        }
        // payments
        const payAt = (h => h ? new Date(h.at).getTime() : null)(hist.find(x => x.stage === 'Payment Completed'));
        const rcpt = () => 'RCPT-' + int(100000, 999999);
        const txn = () => pick(['UPI', 'TXN', 'NB', 'CC']) + int(1e9, 9.9e9);
        const base = { studentId: st.id, applicationId: app.id, universityId: a.course.universityId, courseId: a.course.id };
        if (paid && payAt){
          db.insert('payments', Object.assign({}, base, { amount: a.course.applicationFee, type: 'Application Fee', mode: pick(['UPI', 'Debit Card', 'Net Banking']), transactionId: txn(), paymentDate: iso(payAt - DAY),
            status: 'Successful', receiptNo: rcpt(), verifiedBy: finance.id, verifiedAt: iso(payAt - DAY + HOUR), remarks: '', createdAt: iso(payAt - DAY), createdBy: l.counsellorId }));
          const partial = chance(0.12);
          db.insert('payments', Object.assign({}, base, { amount: partial ? Math.round(a.course.semesterFee / 2) : a.course.semesterFee, type: 'Semester Fee', mode: pick(['UPI', 'Net Banking', 'NEFT/RTGS', 'Credit Card', 'EMI']), transactionId: txn(), paymentDate: iso(payAt),
            status: partial ? 'Partially Paid' : 'Successful', receiptNo: rcpt(), verifiedBy: chance(0.85) ? finance.id : null, verifiedAt: iso(payAt + 2 * HOUR), remarks: partial ? 'Balance in 2nd installment' : '', createdAt: iso(payAt), createdBy: l.counsellorId }));
        } else if (a.stage === 'Payment Pending'){
          const st2 = wpick([['Pending', 4], ['Initiated', 2], ['Failed', 1]]);
          const pAt = Math.min(NOW - HOUR, new Date(hist[hist.length - 1].at).getTime() + HOUR);
          db.insert('payments', Object.assign({}, base, { amount: a.course.applicationFee + a.course.semesterFee, type: 'Semester Fee', mode: pick(['UPI', 'Net Banking']), transactionId: st2 === 'Pending' ? '' : txn(), paymentDate: iso(pAt),
            status: st2, receiptNo: '', verifiedBy: null, verifiedAt: null, remarks: st2 === 'Failed' ? 'Bank declined — retry shared' : '', createdAt: iso(pAt), createdBy: l.counsellorId }));
        }
      });
    });
    // a couple of refunds for realism
    db.all('payments').filter(p => p.status === 'Successful' && p.type === 'Application Fee').slice(3, 5).forEach(p => {
      db.insert('payments', Object.assign({}, p, { id: undefined, amount: p.amount, type: 'Application Fee', status: 'Refunded', receiptNo: 'RF-' + p.receiptNo, remarks: 'Refund for duplicate transaction', createdAt: p.createdAt, paymentDate: p.paymentDate }));
    });

    leadRecs.forEach(l => { delete l._reached; l.score = h.scoreLead(l, settings); });

    /* ---------- Notifications & audit ---------- */
    const allUsers = db.all('users');
    workers.forEach(u => {
      const mine = leadRecs.filter(l => l.counsellorId === u.id);
      mine.slice(-2).forEach(l => db.insert('notifications', { userId: u.id, type: 'lead_assigned', title: 'New lead assigned', body: `${l.name} (${l.id}) was assigned to you`, link: '#/leads/' + l.id, read: false, at: l.assignedAt || l.createdAt }));
    });
    allUsers.filter(u => ['super_admin', 'admin', 'finance'].includes(u.role)).forEach(u => {
      db.all('payments').filter(p => p.status === 'Successful').slice(0, 3).forEach(p => db.insert('notifications', { userId: u.id, type: 'payment_received', title: 'Payment received', body: `${NL.fmt.money(p.amount)} for ${p.applicationId}`, link: '#/payments?q=' + p.id, read: chance(0.5), at: p.createdAt }));
    });
    db.insert('audit', { userId: allUsers.find(u => u.role === 'super_admin').id, userName: 'Super Administrator', role: 'super_admin', action: 'System initialised', module: 'System', recordId: '-', oldValue: '', newValue: 'Demo dataset seeded', ip: '127.0.0.1', at: iso(NOW - 2 * DAY) });
  }

  /* Brings stored data up to date with the current release (safe to run repeatedly):
     - adds settings sections introduced later (e.g. followupOutcomes)
     - converts follow-up outcomes saved as text by the earlier dialog into outcome codes */
  // Wording used by the very first version of the Complete Follow-up dialog.
  const LEGACY_TEXT = { 'student busy — asked to call back': 'callback', 'not reachable': 'not_available', 'not interested': 'not_interested', 'interested': 'interested',
    'call back': 'callback', 'other': 'others', 'others': 'others' };
  function upgrade(db){
    const s = db.getSettings(); if (!s) return false;
    let changed = false;
    Object.keys(DEFAULT_SETTINGS).forEach(k => { if (s[k] === undefined){ s[k] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS[k])); changed = true; } });
    // The outcome list always follows the central master (src/js/outcomes.js).
    const master = NL.outcomes.list();
    if (JSON.stringify(s.followupOutcomes) !== JSON.stringify(master)){ s.followupOutcomes = master; changed = true; }
    if (s.callDispositions){ delete s.callDispositions; changed = true; } // calls use the outcome master now
    // One time: add the social media channels to an existing lead-source list (admins can remove them afterwards).
    if (!s.leadSourcesV2 && Array.isArray(s.leadSources)){
      const have = new Set(s.leadSources.map(x => String(x).toLowerCase()));
      const add = DEFAULT_SETTINGS.leadSources.filter(x => !have.has(x.toLowerCase()));
      const other = s.leadSources.indexOf('Other');
      if (add.length){ if (other > -1) s.leadSources.splice(other, 0, ...add); else s.leadSources.push(...add); }
      s.leadSourcesV2 = true; changed = true;
    }
    if (changed) db.setSettings(s);
    // Saved calls: legacy disposition → outcome + sub-outcome.
    db.all('calls').forEach(c => {
      if (c.outcome || !c.disposition) return;
      const m = NL.outcomes.fromDisposition(c.disposition) || { outcome: 'others', subOutcome: 'other_reason' };
      const rec = Object.assign({}, c, { outcome: m.outcome, subOutcome: m.subOutcome, legacyDisposition: c.disposition }); delete rec.disposition;
      Object.keys(c).forEach(k => delete c[k]); Object.assign(c, rec); db.update('calls', c.id, {}); changed = true;
    });
    // Saved call feedback: legacy disposition → outcome + sub-outcome.
    db.all('followups').forEach(f => {
      if (!f.feedback || f.feedback.outcome || !f.feedback.disposition) return;
      const m = NL.outcomes.fromDisposition(f.feedback.disposition) || { outcome: 'others', subOutcome: 'other_reason' };
      const fb = Object.assign({}, f.feedback, { outcome: m.outcome, subOutcome: m.subOutcome, legacyDisposition: f.feedback.disposition }); delete fb.disposition;
      db.update('followups', f.id, { feedback: fb }); changed = true;
    });
    // Leads: latest outcome from their calls and completed follow-ups (only for leads not yet backfilled).
    const pending = db.all('leads').filter(l => l.outcome === undefined);
    if (pending.length){
      const latest = new Map();
      const consider = (leadId, outcome, subOutcome, at, source) => { if (!outcome || !at || !NL.outcomes.find(outcome)) return; const cur = latest.get(leadId); if (!cur || at > cur.outcomeAt) latest.set(leadId, { outcome, subOutcome: subOutcome || '', outcomeAt: at, outcomeSource: source }); };
      db.all('calls').forEach(c => consider(c.leadId, c.outcome || (NL.outcomes.fromDisposition(c.disposition) || {}).outcome, c.subOutcome || (NL.outcomes.fromDisposition(c.disposition) || {}).subOutcome, c.startAt, 'call'));
      db.all('followups').forEach(f => { if (f.status === 'Completed') consider(f.leadId, f.completionOutcome, f.completionSubOutcome, f.completedAt, 'followup'); });
      pending.forEach(l => { Object.assign(l, latest.get(l.id) || { outcome: '', subOutcome: '', outcomeAt: null, outcomeSource: '' }); db.update('leads', l.id, {}); });
      changed = true;
    }
    // State-wise bifurcation: canonical state names for existing leads/students ("UP" → "Uttar Pradesh"), filled from the city when blank.
    if (NL.geo) ['leads', 'students'].forEach(t => db.all(t).forEach(r => {
      const st = NL.geo.resolveState(r.state, r.city);
      if ((st || '') !== (r.state || '')){ r.state = st; db.update(t, r.id, {}); changed = true; }
    }));
    // Saved follow-ups: convert old codes / wording to the current master codes.
    db.all('followups').forEach(f => {
      if (!f.completionOutcome) return;
      let outcome = f.completionOutcome, sub = f.completionSubOutcome || '';
      if (NL.outcomes.findInactive(outcome)) return; // deactivated outcome: keep the saved code
      if (!NL.outcomes.find(outcome)) outcome = LEGACY_TEXT[String(outcome).toLowerCase()] || 'others';
      const up = NL.outcomes.upgradeCodes(outcome, sub);
      if (sub && !NL.outcomes.subOutcomesFor(up.outcome).some(x => x.value === up.subOutcome)) up.subOutcome = '';
      if (up.outcome !== f.completionOutcome || (up.subOutcome || '') !== (f.completionSubOutcome || '')){
        db.update('followups', f.id, { completionOutcome: up.outcome, completionSubOutcome: up.subOutcome || '' }); changed = true;
      }
    });
    return changed;
  }
  NL.seed = { run, upgrade, DEFAULT_SETTINGS, DEMO_PASSWORD, DEMO_ACCOUNTS };
})();
