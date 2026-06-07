/* ============================================================
   SchoolMate — Shared screen building blocks
   ============================================================ */
function PageHead({ title, sub, crumbs, actions }) {
  return <div>
    {crumbs && <div style={{ marginBottom:10 }}><Breadcrumb items={crumbs} /></div>}
    <div className="sm-page-head">
      <div><h1 className="sm-page-title">{title}</h1>{sub && <div className="sm-page-sub">{sub}</div>}</div>
      {actions && <div className="row gap10 ai-center wrap">{actions}</div>}
    </div>
  </div>;
}

function Kpi({ icon, iconBg, iconColor, label, value, delta, deltaDir, spark, sparkColor }) {
  return <div className="sm-kpi">
    <div className="sm-kpi-top">
      <div className="sm-kpi-ic" style={{ background:iconBg||'var(--brand-50)', color:iconColor||'var(--brand-600)' }}><Icon name={icon} size={19} /></div>
      {delta!=null && <span className={`sm-kpi-delta ${deltaDir||'up'}`}><Icon name="trend" size={13} style={{ transform:deltaDir==='down'?'scaleY(-1)':'none' }} />{delta}</span>}
    </div>
    <div className="sm-kpi-label">{label}</div>
    <div className="sm-kpi-value tnum">{value}</div>
    {spark && <div style={{ marginTop:8 }}><Spark data={spark} w={200} h={32} color={sparkColor||'var(--brand-600)'} /></div>}
  </div>;
}

function SectionTitle({ children, sub, action }) {
  return <div className="row ai-end jc-between" style={{ margin:'4px 0 14px' }}>
    <div><h2 style={{ fontSize:16, fontWeight:700 }}>{children}</h2>{sub && <div className="t-sm muted" style={{ marginTop:2 }}>{sub}</div>}</div>
    {action}
  </div>;
}

/* Placeholder for modules not fully built — keeps nav coherent */
function Placeholder({ title, icon, module, points }) {
  const app=useApp();
  return <div>
    <PageHead title={title} sub="Module workspace" />
    <Card className="col ai-center" style={{ padding:'46px 28px', textAlign:'center' }}>
      <div className="sm-empty-ic" style={{ width:64, height:64, background:'var(--brand-50)', color:'var(--brand-600)' }}><Icon name={icon} size={28} /></div>
      <h3 style={{ fontSize:18, marginTop:14 }}>{title}</h3>
      <p className="muted" style={{ maxWidth:460, marginTop:8, lineHeight:1.55 }}>
        This module is part of the SchoolMate School Console. The screens below are fully specced in the IA;
        this prototype focuses on the 12 flagship flows.
      </p>
      {points && <div className="row gap8 wrap jc-center" style={{ marginTop:16, maxWidth:560 }}>
        {points.map((p,i)=><span key={i} className="sm-chip">{p}</span>)}
      </div>}
      <div className="row gap10" style={{ marginTop:20 }}>
        <Btn variant="secondary" icon="arrowLeft" onClick={()=>app.go('school.dashboard')}>Back to dashboard</Btn>
        <Btn variant="primary" icon="sparkle">Request walkthrough</Btn>
      </div>
    </Card>
  </div>;
}

Object.assign(window, { PageHead, Kpi, SectionTitle, Placeholder, RestrictedScreen });

/* Access-denied screen for role-gated routes */
function RestrictedScreen({ title }) {
  const app=useApp();
  return <div>
    <PageHead title={title} sub="Access restricted" />
    <Card className="col ai-center" style={{ padding:'46px 28px', textAlign:'center' }}>
      <div className="sm-empty-ic" style={{ width:64, height:64, background:'var(--danger-bg)', color:'var(--danger)' }}><Icon name="lock" size={28} /></div>
      <h3 style={{ fontSize:18, marginTop:14 }}>You don't have access to {title}</h3>
      <p className="muted" style={{ maxWidth:440, marginTop:8, lineHeight:1.55 }}>
        This area is available to <span className="fw6" style={{color:'var(--text)'}}>School Admins</span> and the <span className="fw6" style={{color:'var(--text)'}}>Owner</span> only. Ask your administrator if you need access.
      </p>
      <div className="row gap10" style={{ marginTop:20 }}>
        <Btn variant="secondary" icon="arrowLeft" onClick={()=>app.go('school.dashboard')}>Back to dashboard</Btn>
        <Btn variant="ghost" icon="user" onClick={()=>app.setRole('admin')}>Switch to Admin (demo)</Btn>
      </div>
    </Card>
  </div>;
}
