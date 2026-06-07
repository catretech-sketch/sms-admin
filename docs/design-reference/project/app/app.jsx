/* ============================================================
   SchoolMate — Root app + router
   ============================================================ */
function Router() {
  const app=useApp();
  const v=app.view;

  // Owner console
  if(v==='owner.dashboard') return <OwnerDashboard />;
  if(v==='owner.schools') return <OwnerSchools />;
  if(v==='owner.create') return <CreateSchoolWizard />;
  if(v==='owner.reports') return <OwnerReports />;
  if(v==='owner.billing') return <OwnerBilling />;
  if(v==='owner.users') return <OwnerUsers />;
  if(v==='owner.settings') return <OwnerSettings />;

  // School console — flagship
  if(v==='school.dashboard') return <SchoolDashboard />;
  if(v==='school.approvals') return <ApprovalsInbox />;
  if(v==='school.sis') return <StudentsScreen key="students" initialTab="students" />;
  if(v==='school.student') return <Student360 />;
  if(v==='school.teachers') return <StudentsScreen key="teachers" initialTab="teachers" />;
  if(v==='school.staff') return <StudentsScreen key="staff" initialTab="staff" />;
  if(v==='school.parents') return <StudentsScreen key="parents" initialTab="parents" />;
  if(v==='school.attendance') return <AttendanceScreen />;
  if(v==='school.exams') return <ExamsScreen />;
  if(v==='school.fees') return <FeesScreen />;
  if(v==='school.hr') return <PayrollScreen />;
  if(v==='school.gps') return <GpsScreen />;

  // School console — placeholders (specced, not flagship)
  if(v==='school.academics') return <AcademicsScreen />;
  if(v==='school.comm') return <CommunicationScreen />;
  if(v==='school.ops') return <OperationsScreen />;
  if(v==='school.identity') return app.role==='admin' ? <IdentityScreen /> : <RestrictedScreen title="Identity & access" />;
  if(v==='school.settings') return <SettingsScreen />;
  if(v==='school.reports') return <SchoolReports />;

  return <SchoolDashboard />;
}

/* Bus list with live status */
function BusListTab() {
  const toast=useToast();
  const [tick,setTick]=useState(0);
  const [addOpen,setAddOpen]=useState(false);
  useEffect(()=>{ const iv=setInterval(()=>setTick(t=>t+1),2500); return ()=>clearInterval(iv); },[]);
  const stMeta={ on_route:{tone:'success',label:'On route'}, at_stop:{tone:'info',label:'At stop'}, delayed:{tone:'danger',label:'Delayed'}, idle:{tone:'neutral',label:'Idle'}, maintenance:{tone:'warning',label:'Maintenance'} };
  const buses=SM.buses.map(b=>({ ...b, liveSpeed: b.status==='on_route'?Math.max(0,b.speed+((tick+b.label.length)%5-2)*3):b.speed }));
  const active=buses.filter(b=>b.status==='on_route'||b.status==='at_stop'||b.status==='delayed').length;
  const columns=[
    { key:'label', label:'Bus', render:r=><div className="row ai-center gap10"><span style={{ width:34, height:34, borderRadius:9, background:r.color, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', flex:'0 0 auto' }}><Icon name="bus" size={16} /></span>
        <div><div className="fw6">{r.label}</div><div className="t-xs muted3 mono">{r.no}</div></div></div>, sortValue:r=>r.label },
    { key:'route', label:'Route', render:r=><div><div className="t-md">{r.route}</div><div className="t-xs muted3">{r.id} · {r.stops} stops</div></div>, sortValue:r=>r.route },
    { key:'driver', label:'Driver / conductor', render:r=>r.driver==='—'?<span className="muted3">—</span>:<div><div className="t-md">{r.driver}</div><div className="t-xs muted3">{r.conductor}</div></div> },
    { key:'students', label:'Occupancy', align:'right', render:r=><div className="row ai-center gap8 jc-end"><span className="sm-meter"><span style={{ width:(r.students/r.capacity*100)+'%', background:r.students/r.capacity>0.9?'var(--warning)':'var(--success)' }} /></span><span className="tnum t-sm">{r.students}/{r.capacity}</span></div>, sortValue:r=>r.students },
    { key:'liveSpeed', label:'Speed', align:'right', render:r=>r.status==='on_route'||r.status==='delayed'?<span className="row ai-center gap5 jc-end"><span className="sm-dot-live" style={{width:6,height:6}} /><span className="tnum fw6">{r.liveSpeed} km/h</span></span>:<span className="muted3">—</span> },
    { key:'eta', label:'ETA', render:r=>r.eta==='—'?<span className="muted3">—</span>:<Badge tone="neutral" icon="clock">{r.eta} AM</Badge> },
    { key:'fuel', label:'Fuel', align:'right', render:r=><span className="tnum t-sm" style={{ color:r.fuel<30?'var(--danger)':r.fuel<50?'var(--warning)':'var(--text-2)' }}>{r.fuel}%</span> },
    { key:'status', label:'Live status', render:r=><Badge tone={stMeta[r.status].tone} soft dot>{stMeta[r.status].label}</Badge>, sortValue:r=>r.status },
  ];
  return <div className="sm-table-wrap">
    <div className="row ai-center jc-between" style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)' }}>
      <div className="row ai-center gap10"><span className="sm-dot-live" /><span className="fw7 t-lg">Fleet & live status</span><Badge tone="success" soft>{active} active now</Badge></div>
      <Btn size="sm" variant="secondary" icon="plus" onClick={()=>setAddOpen(true)}>Add vehicle</Btn>
    </div>
    <DataTable columns={columns} rows={buses} pageSize={8} initialSort={{key:'status',dir:'asc'}} />
    <AddVehicleModal open={addOpen} onClose={()=>setAddOpen(false)} onSave={(n)=>{ setAddOpen(false); toast.success('Vehicle added',n+' registered to the fleet'); }} />
  </div>;
}

function AddVehicleModal({ open, onClose, onSave }) {
  const [f,setF]=useState({ label:'', no:'', route:'', capacity:'42', driver:'', conductor:'', stops:'' });
  const set=(k,v)=>setF(d=>({...d,[k]:v}));
  useEffect(()=>{ if(open) setF({ label:'', no:'', route:'', capacity:'42', driver:'', conductor:'', stops:'' }); },[open]);
  const drivers=SM.staff.filter(s=>s.role==='Bus Driver');
  const conductors=SM.staff.filter(s=>s.role==='Bus Conductor');
  return <Modal open={open} onClose={onClose} size="md" icon="bus" title="Add vehicle" sub="Register a bus to the transport fleet"
    footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="primary" icon="check" disabled={!f.label||!f.no} onClick={()=>onSave(f.label||'Bus')}>Add vehicle</Btn></>}>
    <div className="col gap16">
      <div className="sm-grid-2">
        <Field label="Bus name / number" required><Input icon="bus" placeholder="e.g. Bus 24" value={f.label} onChange={e=>set('label',e.target.value)} /></Field>
        <Field label="Registration no" required><Input placeholder="e.g. KA-01-F-0000" value={f.no} onChange={e=>set('no',e.target.value.toUpperCase())} /></Field>
      </div>
      <Field label="Route"><Select value={f.route} onChange={e=>set('route',e.target.value)} options={[{value:'',label:'Assign route…'},'Indiranagar loop','Whitefield express','Koramangala','HSR Layout','Marathahalli','Jayanagar','Electronic City']} /></Field>
      <div className="sm-grid-2">
        <Field label="Seating capacity"><Input type="number" value={f.capacity} onChange={e=>set('capacity',e.target.value)} /></Field>
        <Field label="No. of stops"><Input type="number" placeholder="e.g. 10" value={f.stops} onChange={e=>set('stops',e.target.value)} /></Field>
      </div>
      <div className="sm-grid-2">
        <Field label="Driver"><Select value={f.driver} onChange={e=>set('driver',e.target.value)} options={[{value:'',label:'Assign driver…'},...drivers.slice(0,8).map(d=>({value:d.id,label:d.name}))]} /></Field>
        <Field label="Conductor"><Select value={f.conductor} onChange={e=>set('conductor',e.target.value)} options={[{value:'',label:'Assign conductor…'},...conductors.slice(0,8).map(d=>({value:d.id,label:d.name}))]} /></Field>
      </div>
      <div className="sm-card" style={{ background:'var(--surface-2)', padding:13, display:'flex', gap:10 }}><Icon name="pin" size={15} style={{color:'var(--platinum)',marginTop:1}} /><div className="t-sm muted">A GPS device can be paired after the vehicle is created — live tracking requires the <span className="fw6" style={{color:'var(--text)'}}>Platinum</span> plan.</div></div>
    </div>
  </Modal>;
}

/* Operations screen — shows live-GPS tier teaser inline */
function OperationsScreen() {
  const app=useApp();
  const [tab,setTab]=useState('library');
  return <div>
    <PageHead title="Operations" sub="Library · Transport · Hostel · Sports" />
    <div style={{ marginBottom:14 }}><Tabs value={tab} onChange={setTab} tabs={[
      {value:'library',label:'Library'},{value:'transport',label:'Transport'},{value:'hostel',label:'Hostel'},{value:'sports',label:'Sports'}]} /></div>
    {tab==='library' && <div className="sm-kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
      <Kpi icon="book" label="Catalogue" value="12,480" /><Kpi icon="users" iconBg="var(--info-bg)" iconColor="var(--info)" label="Members" value="2,332" />
      <Kpi icon="clock" iconBg="var(--warning-bg)" iconColor="var(--warning)" label="Issued" value="486" /><Kpi icon="rupee" iconBg="var(--danger-bg)" iconColor="var(--danger)" label="Fines due" value="₹ 8,420" />
    </div>}
    {tab==='transport' && <div className="col gap16">
      <div className="sm-kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
        <Kpi icon="bus" label="Vehicles" value={SM.buses.length} /><Kpi icon="pin" iconBg="var(--info-bg)" iconColor="var(--info)" label="Routes" value="18" />
        <Kpi icon="users" iconBg="var(--success-bg)" iconColor="var(--success)" label="Students" value="1,284" /><Kpi icon="clock" iconBg="var(--warning-bg)" iconColor="var(--warning)" label="Stops" value="142" />
      </div>
      <BusListTab />
      <Card style={{ background:'linear-gradient(100deg,var(--platinum-bg),transparent)', borderColor:'var(--platinum)' }}>
        <div className="row ai-center jc-between gap14 wrap">
          <div className="row ai-center gap12"><span className="sm-gate-lock" style={{ width:44, height:44, margin:0, background:'var(--platinum)', color:'#fff' }}><Icon name="bus" size={20} /></span>
            <div><div className="row ai-center gap8"><span className="fw7 t-lg">Live GPS bus tracking</span><TierPill plan="platinum" /></div><div className="t-sm muted">See every bus on a live map and share ETAs with parents. Unlock with Platinum.</div></div></div>
          <div className="row gap10"><Btn variant="secondary" onClick={()=>app.go('school.gps')}>Open live map</Btn><Btn variant="platinum" icon="sparkle" onClick={()=>app.upgrade('platinum')}>Upgrade</Btn></div>
        </div>
      </Card>
    </div>}
    {tab==='hostel' && <div className="sm-kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
      <Kpi icon="home" label="Blocks" value="4" /><Kpi icon="grid" iconBg="var(--info-bg)" iconColor="var(--info)" label="Rooms" value="186" />
      <Kpi icon="users" iconBg="var(--success-bg)" iconColor="var(--success)" label="Residents" value="412" /><Kpi icon="checkCircle" iconBg="var(--warning-bg)" iconColor="var(--warning)" label="Occupancy" value="88%" />
    </div>}
    {tab==='sports' && <div className="sm-kpi-grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
      <Kpi icon="shield" label="Teams" value="22" /><Kpi icon="calendar" iconBg="var(--info-bg)" iconColor="var(--info)" label="Events" value="14" />
      <Kpi icon="users" iconBg="var(--success-bg)" iconColor="var(--success)" label="Athletes" value="640" /><Kpi icon="sparkle" iconBg="var(--gold-bg)" iconColor="var(--gold)" label="Medals '26" value="38" />
    </div>}
  </div>;
}

/* Settings screen — shows plan & feature visibility with upgrade prompts */
function SettingsScreen() {
  const app=useApp();
  const features=[
    ['SIS · Academics · Attendance','silver'],['Examinations & report cards','silver'],['Fees & online payments','silver'],
    ['HR & Payroll','gold'],['Weak-student analytics','gold'],['Advanced reporting','gold'],
    ['Geo-fenced attendance','platinum'],['Live GPS bus tracking','platinum'],['Dedicated support','platinum'],
  ];
  return <div>
    <PageHead title="Settings" sub={app.school.name} />
    <div className="sm-grid-2" style={{ gridTemplateColumns:'1fr 1fr', alignItems:'flex-start' }}>
      <div className="col gap16">
        <Card><CardHead title="School profile & branding" icon="building" />
          <div className="row ai-center gap14"><div className="sm-school-logo" style={{ background:app.school.color, width:54, height:54, fontSize:20, borderRadius:14 }}>{app.school.logo}</div>
            <div className="flex1"><Field label="School name"><Input defaultValue={app.school.name} /></Field></div></div>
          <div className="sm-grid-2" style={{ marginTop:14 }}><Field label="City"><Input defaultValue={app.school.city} /></Field><Field label="Timezone"><Input defaultValue={app.school.tz} /></Field></div>
        </Card>
        <Card><CardHead title="Localization" sub="Language · timezone · RTL" icon="globe" />
          <Field label="Default language"><Select value={app.lang} onChange={e=>app.setLang(e.target.value)} options={[{value:'en',label:'English'},{value:'hi',label:'हिन्दी Hindi'},{value:'ar',label:'العربية Arabic (RTL)'},{value:'ta',label:'தமிழ் Tamil'}]} /></Field>
          <div className="row ai-center jc-between" style={{ marginTop:14 }}><div><div className="fw6 t-md">Right-to-left layout</div><div className="t-xs muted3">Auto-enabled for Arabic & Urdu</div></div><Toggle checked={app.dir==='rtl'} onChange={()=>app.setLang(app.dir==='rtl'?'en':'ar')} /></div>
          <div className="row ai-center jc-between" style={{ marginTop:14 }}><div><div className="fw6 t-md">Dark mode</div><div className="t-xs muted3">Theme preference</div></div><Toggle checked={app.theme==='dark'} onChange={()=>app.setTheme(t=>t==='light'?'dark':'light')} /></div>
        </Card>
      </div>
      <Card><CardHead title="Plan & feature visibility" sub={`Current plan: ${SM.TIER_META[app.plan].label}`} icon="layers"
        action={<TierPill plan={app.plan} />} />
        <div className="col gap2">
          {features.map(([f,t])=>{ const ok=SM.tierIncludes(app.plan,t==='silver'?'sis':t==='gold'?'hr_payroll':'transport.gps'); return <div key={f} className="row ai-center jc-between" style={{ padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
            <div className="row ai-center gap10">{ok?<Icon name="checkCircle" size={17} style={{color:'var(--success)'}} />:<Icon name="lock" size={16} style={{color:SM.TIER_META[t].color}} />}
              <span className="t-md" style={{ color:ok?'var(--text)':'var(--text-3)', fontWeight:ok?500:400 }}>{f}</span></div>
            {ok?<Badge tone="success" soft>Active</Badge>:<TierPill plan={t} />}
          </div>; })}
        </div>
        {app.plan!=='platinum' && <Btn variant={app.plan==='silver'?'gold':'platinum'} icon="sparkle" style={{ width:'100%', marginTop:16 }}
          onClick={()=>app.upgrade(app.plan==='silver'?'gold':'platinum')}>Upgrade to {app.plan==='silver'?'Gold':'Platinum'}</Btn>}
      </Card>
    </div>
  </div>;
}

/* ---------- App root ---------- */
function App() {
  return <ToastProvider><AppProvider><Shell /></AppProvider></ToastProvider>;
}
function Shell() {
  const app=useApp();
  if(!app.loggedIn) return <LoginScreen />;
  return <div className="sm-app">
    {app.mobileNav && <div className="sm-scrim only-mobile" onClick={()=>app.setMobileNav(false)} />}
    <Sidebar />
    <div className="sm-main">
      <Topbar />
      <main className="sm-content">
        <div className="sm-content-narrow">
          <Router />
        </div>
      </main>
    </div>
    <SchoolMateTweaks />
  </div>;
}

Object.assign(window, { App, Router, OperationsScreen, SettingsScreen, BusListTab });
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
