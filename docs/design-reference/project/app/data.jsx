/* ============================================================
   SchoolMate — Mock data + typed-ish service layer
   Structured so /v1 REST + SignalR can be wired in later.
   ============================================================ */
(function () {
  // ---------- Tiers ----------
  const TIERS = ['silver', 'gold', 'platinum'];
  const TIER_META = {
    silver:   { label: 'Silver',   color: 'var(--silver)',   bg: 'var(--silver-bg)' },
    gold:     { label: 'Gold',     color: 'var(--gold)',     bg: 'var(--gold-bg)' },
    platinum: { label: 'Platinum', color: 'var(--platinum)', bg: 'var(--platinum-bg)' },
  };
  // feature code -> minimum tier required
  const FEATURE_TIER = {
    'sis': 'silver', 'academics': 'silver', 'attendance': 'silver',
    'exams': 'silver', 'fees': 'silver', 'communication': 'silver',
    'operations': 'silver', 'library': 'silver', 'transport': 'silver',
    'hostel': 'silver', 'sports': 'silver',
    'hr_payroll': 'gold', 'analytics.weak_students': 'gold', 'reporting.advanced': 'gold',
    'attendance.geofence': 'platinum', 'transport.gps': 'platinum', 'support.dedicated': 'platinum',
  };
  function tierIncludes(plan, feature) {
    const need = FEATURE_TIER[feature] || 'silver';
    return TIERS.indexOf(plan) >= TIERS.indexOf(need);
  }
  function requiredTier(feature) { return FEATURE_TIER[feature] || 'silver'; }

  // ---------- Roles & permission matrix ----------
  // V=view E=edit A=approve. Stored as set of capabilities per module.
  const ROLES = ['admin', 'principal', 'vice_principal', 'teacher'];
  const ROLE_META = {
    admin:          { label: 'Admin',          short: 'AD', desc: 'Day-to-day setup & data entry' },
    principal:      { label: 'Principal',      short: 'PR', desc: 'Final approver + all reports' },
    vice_principal: { label: 'Vice-Principal', short: 'VP', desc: 'Academic owner, no financial authority' },
    teacher:        { label: 'Teacher',        short: 'TE', desc: 'Marks, attendance & homework for own classes' },
  };
  // module: {role -> array of caps}
  const PERMS = {
    setup:        { admin:['E'], principal:['V','E'], vice_principal:['V'], teacher:[] },
    dashboard:    { admin:['V'], principal:['V'], vice_principal:['V'], teacher:['V'] },
    identity:     { admin:['E'], principal:['V','E'], vice_principal:['V'], teacher:[] },
    sis:          { admin:['E'], principal:['V','E'], vice_principal:['V','E'], teacher:['V'] },
    academics:    { admin:['E'], principal:['V','A'], vice_principal:['E','A'], teacher:['V','E'] },
    attendance:   { admin:['E'], principal:['V','A'], vice_principal:['V','E','A'], teacher:['V','E'] },
    exams:        { admin:['E'], principal:['A'], vice_principal:['A'], teacher:['V','E'] },
    fees:         { admin:['E'], principal:['A'], vice_principal:['V'], teacher:[] },
    hr:           { admin:['E'], principal:['A'], vice_principal:['A'], teacher:[] }, // VP leave-only enforced in UI
    communication:{ admin:['E'], principal:['E','A'], vice_principal:['E'], teacher:['E'] },
    operations:   { admin:['E'], principal:['V'], vice_principal:['V'], teacher:[] },
    settings:     { admin:['E'], principal:['V'], vice_principal:['V'], teacher:[] },
  };
  function can(role, module, cap) {
    const m = PERMS[module]; if (!m) return false;
    return (m[role] || []).indexOf(cap) >= 0;
  }
  function caps(role, module) { return (PERMS[module] || {})[role] || []; }

  // ---------- Schools (tenants) ----------
  const schools = [
    { id:'grv', name:'Greenwood Valley School', city:'Bengaluru', plan:'platinum', students:2148, staff:184, status:'active', mrr:289000, attendance:94.2, fees:88, payroll:42.8, currency:'₹', tz:'Asia/Kolkata', logo:'GV', color:'#16a34a' },
    { id:'stx', name:'St. Xavier’s High School', city:'Mumbai', plan:'gold', students:1672, staff:142, status:'active', mrr:172000, attendance:91.0, fees:79, payroll:33.1, currency:'₹', tz:'Asia/Kolkata', logo:'SX', color:'#4f46e5' },
    { id:'dps', name:'Delhi Public Academy', city:'New Delhi', plan:'gold', students:2890, staff:233, status:'active', mrr:214000, attendance:89.6, fees:73, payroll:51.0, currency:'₹', tz:'Asia/Kolkata', logo:'DP', color:'#0ea5e9' },
    { id:'srt', name:'Sunrise International', city:'Hyderabad', plan:'silver', students:864, staff:71, status:'active', mrr:64000, attendance:92.7, fees:81, payroll:0, currency:'₹', tz:'Asia/Kolkata', logo:'SI', color:'#f59e0b' },
    { id:'lts', name:'Lotus Montessori', city:'Pune', plan:'silver', students:412, staff:39, status:'trial', mrr:0, attendance:95.1, fees:69, payroll:0, currency:'₹', tz:'Asia/Kolkata', logo:'LM', color:'#ec4899' },
    { id:'amn', name:'Al-Manar Academy', city:'Dubai', plan:'platinum', students:1320, staff:118, status:'active', mrr:412000, attendance:93.3, fees:90, payroll:61.2, currency:'AED', tz:'Asia/Dubai', logo:'AM', color:'#0d9488' },
    { id:'hzn', name:'Horizon World School', city:'Chennai', plan:'gold', students:1985, staff:166, status:'past_due', mrr:188000, attendance:87.4, fees:62, payroll:44.7, currency:'₹', tz:'Asia/Kolkata', logo:'HW', color:'#dc2626' },
  ];

  // ---------- Students ----------
  const firstM = ['Aarav','Vivaan','Aditya','Reyansh','Arjun','Sai','Krishna','Ishaan','Rohan','Kabir','Dhruv','Ayaan','Atharv','Vihaan','Ansh'];
  const firstF = ['Aanya','Diya','Saanvi','Aadhya','Pari','Anika','Myra','Sara','Ira','Kiara','Riya','Navya','Aarohi','Anvi','Tara'];
  const last = ['Sharma','Iyer','Reddy','Khan','Patel','Nair','Gupta','Menon','Verma','Das','Rao','Bose','Shetty','Joshi','Pillai'];
  const sections = ['A','B','C','D'];
  const grades = ['Nursery','LKG','UKG','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
  function rng(seed){ let s=seed; return ()=> (s=(s*1103515245+12345)&0x7fffffff)/0x7fffffff; }
  const rand = rng(42);
  function pick(a){ return a[Math.floor(rand()*a.length)]; }
  const students = [];
  for (let i=0;i<240;i++){
    const male = rand()>0.5;
    const fn = male ? pick(firstM) : pick(firstF);
    const ln = pick(last);
    const grade = pick(grades.slice(4));
    const sec = pick(sections);
    const fee = Math.floor(rand()*100);
    students.push({
      id:'S'+(10240+i),
      adm:'ADM'+(2026000+i),
      name:fn+' '+ln,
      gender: male?'M':'F',
      grade, section:sec, cls:grade+'-'+sec,
      roll: 1+Math.floor(rand()*48),
      guardian:(rand()>.5?pick(firstM):pick(firstF))+' '+ln,
      phone:'+91 9'+String(Math.floor(rand()*900000000+100000000)),
      attendance: 72+Math.floor(rand()*28),
      feeStatus: fee>70?'paid':fee>35?'partial':'due',
      feeDue: fee>70?0:Math.floor(rand()*48+8)*1000,
      status: rand()>0.04?'active':'inactive',
      house: pick(['Ruby','Emerald','Sapphire','Topaz']),
      avatarHue: Math.floor(rand()*360),
    });
  }

  // ---------- Approvals ----------
  const approvals = [
    { id:'AP-3041', type:'Report Card Publish', module:'exams', cap:'A', title:'Publish Term-1 results — Grade X', detail:'Grade X (4 sections · 168 students) Term 1 report cards ready to publish.', requester:'Meera Krishnan', role:'Class Teacher', amount:null, age:'2h', priority:'high', forRoles:['principal','vice_principal'] },
    { id:'AP-3038', type:'Fee Waiver', module:'fees', cap:'A', title:'Fee waiver — Kabir Sharma (Grade VIII-B)', detail:'Hardship waiver request: ₹24,000 of Term-2 tuition. Counsellor recommended.', requester:'Front Office', role:'Accountant', amount:24000, age:'4h', priority:'medium', forRoles:['principal'] },
    { id:'AP-3035', type:'Leave Request', module:'hr', cap:'A', title:'Leave — Rajesh Kumar (Mathematics)', detail:'Casual leave 3 days (12–14 Jun). Substitute arranged.', requester:'Rajesh Kumar', role:'Teacher', amount:null, age:'5h', priority:'low', forRoles:['principal','vice_principal'] },
    { id:'AP-3030', type:'Payroll Run', module:'hr', cap:'A', title:'Approve payroll — May 2026', detail:'184 staff · gross ₹1.32 Cr · net ₹1.08 Cr. Prepared by Admin office.', requester:'Admin Office', role:'Administrator', amount:13200000, age:'1d', priority:'high', forRoles:['principal'] },
    { id:'AP-3028', type:'Attendance Correction', module:'attendance', cap:'A', title:'Attendance correction — Grade IX-A (3 Jun)', detail:'Mark 6 students present (late bus). Submitted by class teacher.', requester:'Sunita Rao', role:'Class Teacher', amount:null, age:'1d', priority:'medium', forRoles:['principal','vice_principal'] },
    { id:'AP-3024', type:'Syllabus Change', module:'academics', cap:'A', title:'Syllabus revision — Grade XII Physics', detail:'Add Unit 9 (Modern Physics) to Term-2 plan.', requester:'A. Banerjee', role:'HOD Science', amount:null, age:'2d', priority:'low', forRoles:['vice_principal','principal'] },
  ];

  // ---------- Notifications ----------
  const notifications = [
    { id:1, icon:'rupee', tone:'success', title:'Payment received', body:'₹48,000 — Aarav Sharma (Grade X-A)', time:'just now', unread:true },
    { id:2, icon:'check', tone:'brand', title:'Attendance submitted', body:'Grade VII-B marked by S. Rao · 41/44 present', time:'3m', unread:true },
    { id:3, icon:'alert', tone:'warning', title:'Fee dues reminder sent', body:'128 parents notified via SMS + push', time:'18m', unread:true },
    { id:4, icon:'inbox', tone:'brand', title:'New approval', body:'Report-card publish awaiting your action', time:'2h', unread:false },
    { id:5, icon:'bus', tone:'info', title:'Bus 12 departed', body:'Route R-04 · ETA first stop 7:42 AM', time:'2h', unread:false },
  ];

  // ---------- Subjects / marks ----------
  const subjects = ['English','Hindi','Mathematics','Science','Social Studies','Computer'];

  // Deterministic academic records: marks per subject, grade, percentage, rank within class
  function hash(str){ let h=0; for(let i=0;i<str.length;i++){ h=(h*31+str.charCodeAt(i))&0x7fffffff; } return h; }
  function gradeFor(p){ if(p>=91)return'A1'; if(p>=81)return'A2'; if(p>=71)return'B1'; if(p>=61)return'B2'; if(p>=51)return'C1'; if(p>=41)return'C2'; if(p>=33)return'D'; return'E'; }
  function gpaFor(g){ return {A1:10,A2:9,B1:8,B2:7,C1:6,C2:5,D:4,E:3}[g]||0; }
  function studentSubjectMarks(stu, subj, examId){
    const h=hash(stu.id+subj+(examId||'')); const base=stu.attendance; // higher attendance -> better
    const m=Math.max(18, Math.min(99, Math.round(base*0.55 + (h%45) + (subj==='Mathematics'?-4:subj==='English'?4:0))));
    return m;
  }
  function reportFor(stu, examId){
    const rows=subjects.map(s=>{ const max=100; const marks=studentSubjectMarks(stu,s,examId); const pct=marks/max*100; const g=gradeFor(pct);
      return { subject:s, max, marks, grade:g, gpa:gpaFor(g), pass:marks>=33 }; });
    const total=rows.reduce((a,r)=>a+r.marks,0); const maxTotal=rows.length*100; const pct=+(total/maxTotal*100).toFixed(1);
    const gpa=+(rows.reduce((a,r)=>a+r.gpa,0)/rows.length).toFixed(1);
    return { rows, total, maxTotal, pct, grade:gradeFor(pct), gpa, result: rows.every(r=>r.pass)?'PASS':'COMPARTMENT' };
  }
  function classRank(stu, examId){
    const peers=students.filter(s=>s.cls===stu.cls);
    const scored=peers.map(s=>({ id:s.id, pct:reportFor(s,examId).pct })).sort((a,b)=>b.pct-a.pct);
    const rank=scored.findIndex(s=>s.id===stu.id)+1;
    return { rank, classSize:peers.length };
  }
  function attendanceMonths(stu){
    const months=['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov']; const h=hash(stu.id);
    return months.map((m,i)=>({ label:m, value: Math.max(60, Math.min(100, stu.attendance + ((h>>(i))%14) - 7)) }));
  }

  // ---------- Teachers ----------
  const depts = ['Mathematics','Science','English','Hindi','Social Studies','Computer','Physical Education','Arts'];
  const desigs = ['Senior Teacher','Teacher','HOD','PGT','TGT','Assistant Teacher'];
  const teachers = [];
  for (let i=0;i<48;i++){
    const male = rand()>0.5;
    const fn = male ? pick(firstM) : pick(firstF);
    const ln = pick(last);
    const dept = pick(depts);
    const rating = +(3.4+rand()*1.6).toFixed(1);
    teachers.push({
      id:'EMP'+(2010+i), name:fn+' '+ln, gender:male?'M':'F', dept,
      desig: pick(desigs), subjects:[pick(subjects),pick(subjects)].filter((v,j,a)=>a.indexOf(v)===j),
      classTeacher: rand()>0.55 ? pick(grades.slice(8))+'-'+pick(sections) : null,
      phone:'+91 9'+String(Math.floor(rand()*900000000+100000000)),
      email:(fn+'.'+ln).toLowerCase()+'@school.edu',
      exp: 1+Math.floor(rand()*22), rating,
      attendance: 88+Math.floor(rand()*12),
      result: 60+Math.floor(rand()*40), // avg class result %
      load: 18+Math.floor(rand()*12), // periods/week
      status: rand()>0.05?'active':'inactive',
      avatarHue: Math.floor(rand()*360),
      top: rating>=4.6,
    });
  }
  teachers.sort((a,b)=>b.rating-a.rating);

  // ---------- Non-teaching staff (guards, drivers, support) ----------
  const staffRoles = [
    ['Bus Driver','transport','briefcase'],['Bus Conductor','transport','briefcase'],
    ['Security Guard','security','shield'],['Gatekeeper','security','shield'],
    ['Lab Assistant','academic','beaker'],['Librarian','academic','book'],
    ['Accountant','admin','rupee'],['Office Clerk','admin','doc'],
    ['Housekeeping','support','box'],['Nurse','support','plus'],['Gardener','support','box'],['Cook','support','box'],
  ];
  const staff = [];
  for (let i=0;i<56;i++){
    const male = rand()>0.4;
    const fn = male ? pick(firstM) : pick(firstF);
    const ln = pick(last);
    const [role,cat] = pick(staffRoles);
    staff.push({
      id:'STF'+(3010+i), name:fn+' '+ln, gender:male?'M':'F', role, cat,
      dept: cat==='transport'?'Transport':cat==='security'?'Security':cat==='academic'?'Academic Support':cat==='admin'?'Administration':'General Support',
      phone:'+91 9'+String(Math.floor(rand()*900000000+100000000)),
      shift: pick(['Morning','Day','Evening','Rotational']),
      route: cat==='transport'?'R-0'+(1+Math.floor(rand()*5)):null,
      attendance: 84+Math.floor(rand()*16),
      status: rand()>0.05?'active':'inactive',
      avatarHue: Math.floor(rand()*360),
    });
  }

  // ---------- Buses / transport ----------
  const busStatuses = ['on_route','at_stop','delayed','idle','maintenance'];
  const buses = [
    { id:'R-01', no:'KA-01-F-2207', label:'Bus 7', driver:'M. Singh', conductor:'R. Das', route:'Indiranagar loop', capacity:42, students:38, stops:9, status:'on_route', speed:32, eta:'7:42', fuel:74, color:'#16a34a' },
    { id:'R-02', no:'KA-01-G-8841', label:'Bus 12', driver:'K. Das', conductor:'S. Roy', route:'Whitefield express', capacity:48, students:44, stops:12, status:'on_route', speed:41, eta:'7:55', fuel:61, color:'#4f46e5' },
    { id:'R-03', no:'KA-05-C-3390', label:'Bus 3', driver:'R. Yadav', conductor:'A. Khan', route:'Koramangala', capacity:36, students:29, stops:7, status:'at_stop', speed:0, eta:'7:38', fuel:88, color:'#f59e0b' },
    { id:'R-04', no:'KA-03-H-1120', label:'Bus 18', driver:'S. Pillai', conductor:'M. Nair', route:'HSR Layout', capacity:40, students:35, stops:10, status:'on_route', speed:28, eta:'8:04', fuel:45, color:'#0ea5e9' },
    { id:'R-05', no:'KA-02-J-7765', label:'Bus 9', driver:'A. Kumar', conductor:'P. Bose', route:'Marathahalli', capacity:44, students:41, stops:11, status:'delayed', speed:12, eta:'8:12', fuel:33, color:'#dc2626' },
    { id:'R-06', no:'KA-01-K-4502', label:'Bus 21', driver:'V. Reddy', conductor:'L. Iyer', route:'Jayanagar', capacity:42, students:0, stops:8, status:'idle', speed:0, eta:'—', fuel:92, color:'#64748b' },
    { id:'R-07', no:'KA-04-B-9981', label:'Bus 5', driver:'—', conductor:'—', route:'Electronic City', capacity:48, students:0, stops:14, status:'maintenance', speed:0, eta:'—', fuel:20, color:'#94a3b8' },
  ];

  // ---------- Exams / tests ----------
  const exams = [
    { id:'EX-T1-26', name:'Term 1 Examination', type:'Term', grades:'VI–XII', from:'2026-09-08', to:'2026-09-20', subjects:6, status:'scheduled', marksEntered:0, published:false },
    { id:'EX-UT1-26', name:'Unit Test 1', type:'Unit Test', grades:'VI–X', from:'2026-07-14', to:'2026-07-18', subjects:5, status:'completed', marksEntered:92, published:true },
    { id:'EX-UT2-26', name:'Unit Test 2', type:'Unit Test', grades:'VI–X', from:'2026-08-11', to:'2026-08-14', subjects:5, status:'marks_entry', marksEntered:64, published:false },
    { id:'EX-MID-26', name:'Mid-Term Examination', type:'Term', grades:'VI–XII', from:'2026-11-03', to:'2026-11-15', subjects:6, status:'draft', marksEntered:0, published:false },
    { id:'EX-PRE-26', name:'Pre-Board (XII)', type:'Board Prep', grades:'XII', from:'2026-12-01', to:'2026-12-12', subjects:6, status:'draft', marksEntered:0, published:false },
    { id:'EX-PT1-26', name:'Periodic Test 1', type:'Periodic', grades:'I–V', from:'2026-07-21', to:'2026-07-23', subjects:4, status:'completed', marksEntered:100, published:true },
  ];

  // ---------- Complaints / messenger ----------
  const complaints = [
    { id:'CMP-204', subject:'Bus 9 arriving late repeatedly', from:'Mr. Sharma (parent)', cat:'Transport', priority:'high', status:'open', age:'2h', assignee:'Transport Dept', body:'Bus 9 on route Marathahalli has been 20+ minutes late for 4 consecutive days. Children reach school after assembly.' },
    { id:'CMP-201', subject:'Cafeteria food quality concern', from:'Mrs. Reddy (parent)', cat:'Facilities', priority:'medium', status:'open', age:'5h', assignee:'Admin', body:'Requesting review of lunch menu hygiene and variety for primary section.' },
    { id:'CMP-198', subject:'Homework load too heavy — Grade VIII', from:'Parent group', cat:'Academics', priority:'medium', status:'in_progress', age:'1d', assignee:'VP Academics', body:'Several parents report 3+ hours of homework nightly. Requesting review of allocation policy.' },
    { id:'CMP-195', subject:'Request for additional bus stop', from:'Mr. Iyer (parent)', cat:'Transport', priority:'low', status:'in_progress', age:'2d', assignee:'Transport Dept', body:'Requesting a new pickup point near Sunrise Apartments on route R-02.' },
    { id:'CMP-189', subject:'Lost ID card replacement delay', from:'Ms. Khan (parent)', cat:'Administration', priority:'low', status:'resolved', age:'4d', assignee:'Front Office', body:'ID replacement took 2 weeks. Resolved — new card issued.' },
    { id:'CMP-184', subject:'Classroom projector not working', from:'R. Kumar (teacher)', cat:'Facilities', priority:'high', status:'resolved', age:'5d', assignee:'IT Support', body:'Projector in Room 204 fixed and tested.' },
  ];
  const threads = [
    { id:1, parent:'Anita Sharma', student:'Aarav Sharma · X-A', teacher:'R. Kumar (Maths)', unread:2, last:'Thank you, I will ensure he revises.', time:'9:24 AM', hue:210,
      msgs:[ {me:false,t:'Good morning, Aarav has been struggling with quadratic equations. Could you share extra practice?',at:'9:02 AM'},
             {me:true,t:'Good morning! Yes, I’ll send a worksheet today. He’s improving in class.',at:'9:15 AM'},
             {me:false,t:'Thank you, I will ensure he revises.',at:'9:24 AM'} ] },
    { id:2, parent:'Vikram Menon', student:'Diya Menon · VIII-B', teacher:'S. Rao (English)', unread:0, last:'Noted, see you at the PTM.', time:'Yesterday', hue:140,
      msgs:[ {me:false,t:'Will the PTM be on Saturday?',at:'Yest 4:10 PM'}, {me:true,t:'Yes, 10 AM–1 PM. Slot booked for you at 10:30.',at:'Yest 4:30 PM'}, {me:false,t:'Noted, see you at the PTM.',at:'Yest 4:32 PM'} ] },
    { id:3, parent:'Fatima Khan', student:'Sara Khan · VII-C', teacher:'Class Teacher', unread:1, last:'She’ll be absent tomorrow for a doctor visit.', time:'Yesterday', hue:300,
      msgs:[ {me:false,t:'She’ll be absent tomorrow for a doctor visit.',at:'Yest 6:00 PM'} ] },
  ];


  const service = {
    listSchools: () => schools,
    getSchool: (id) => schools.find(s => s.id === id),
    listStudents: (opts={}) => {
      let r = students.slice();
      if (opts.q) { const q=opts.q.toLowerCase(); r=r.filter(s=>s.name.toLowerCase().includes(q)||s.adm.toLowerCase().includes(q)||s.cls.toLowerCase().includes(q)); }
      if (opts.grade && opts.grade!=='all') r=r.filter(s=>s.grade===opts.grade);
      if (opts.status && opts.status!=='all') r=r.filter(s=>s.status===opts.status);
      if (opts.fee && opts.fee!=='all') r=r.filter(s=>s.feeStatus===opts.fee);
      return r;
    },
    listApprovals: (role) => approvals.filter(a => a.forRoles.includes(role)),
    notifications: () => notifications,
    listTeachers: (opts={}) => {
      let r = teachers.slice();
      if (opts.q) { const q=opts.q.toLowerCase(); r=r.filter(t=>t.name.toLowerCase().includes(q)||t.dept.toLowerCase().includes(q)||t.id.toLowerCase().includes(q)); }
      if (opts.dept && opts.dept!=='all') r=r.filter(t=>t.dept===opts.dept);
      if (opts.status && opts.status!=='all') r=r.filter(t=>t.status===opts.status);
      return r;
    },
    listStaff: (opts={}) => {
      let r = staff.slice();
      if (opts.q) { const q=opts.q.toLowerCase(); r=r.filter(s=>s.name.toLowerCase().includes(q)||s.role.toLowerCase().includes(q)); }
      if (opts.cat && opts.cat!=='all') r=r.filter(s=>s.cat===opts.cat);
      return r;
    },
  };

  window.SM = {
    TIERS, TIER_META, FEATURE_TIER, tierIncludes, requiredTier,
    ROLES, ROLE_META, PERMS, can, caps,
    schools, students, subjects, grades, sections,
    teachers, staff, buses, exams, complaints, threads, depts,
    approvals, notifications, service,
    reportFor, classRank, gradeFor, gpaFor, studentSubjectMarks, attendanceMonths,
    fmtMoney: (n, cur='₹') => cur + ' ' + Number(n).toLocaleString('en-IN'),
    fmtNum: (n) => Number(n).toLocaleString('en-IN'),
  };
})();
