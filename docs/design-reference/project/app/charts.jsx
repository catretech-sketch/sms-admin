/* ============================================================
   SchoolMate — Charts (lightweight SVG) + Tier lock-gate
   ============================================================ */

/* ---------- Sparkline ---------- */
function Spark({ data, w=120, h=34, color='var(--brand-600)', fill=true, strokeW=2 }) {
  const max=Math.max(...data), min=Math.min(...data), rng=(max-min)||1;
  const pts=data.map((d,i)=>[ (i/(data.length-1))*w, h-4-((d-min)/rng)*(h-8) ]);
  const line=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  const area=line+` L${w} ${h} L0 ${h} Z`;
  const id='sp'+Math.random().toString(36).slice(2,7);
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display:'block', overflow:'visible' }}>
    <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={color} stopOpacity=".22" /><stop offset="1" stopColor={color} stopOpacity="0" />
    </linearGradient></defs>
    {fill && <path d={area} fill={`url(#${id})`} />}
    <path d={line} fill="none" stroke={color} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round" />
    <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="2.6" fill={color} />
  </svg>;
}

/* ---------- Donut ---------- */
function Donut({ segments, size=120, thickness=16, gap=2, center }) {
  const total=segments.reduce((a,s)=>a+s.value,0)||1;
  const r=(size-thickness)/2, c=2*Math.PI*r; let off=0;
  return <div style={{ position:'relative', width:size, height:size }}>
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform:'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={thickness} />
      {segments.map((s,i)=>{ const len=(s.value/total)*c; const dash=`${Math.max(0,len-gap)} ${c-Math.max(0,len-gap)}`;
        const el=<circle key={i} cx={size/2} cy={size/2} r={r} fill="none" stroke={s.color} strokeWidth={thickness}
          strokeDasharray={dash} strokeDashoffset={-off} strokeLinecap="round" />; off+=len; return el; })}
    </svg>
    {center && <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>{center}</div>}
  </div>;
}

/* ---------- Bars ---------- */
function Bars({ data, h=140, color='var(--brand-600)', labels, valueFmt }) {
  const max=Math.max(...data.map(d=>typeof d==='object'?d.value:d))||1;
  return <div className="sm-bars" style={{ height:h }}>
    {data.map((d,i)=>{ const v=typeof d==='object'?d.value:d; const lab=typeof d==='object'?d.label:(labels&&labels[i]);
      const cl=typeof d==='object'&&d.color; return <div key={i} className="sm-bar-col">
      <div className="sm-bar-val">{valueFmt?valueFmt(v):v}</div>
      <div className="sm-bar-track" style={{ height:'100%' }}>
        <div className="sm-bar-fill" style={{ height:`${(v/max)*100}%`, background:cl||color }} />
      </div>
      <div className="sm-bar-lab">{lab}</div>
    </div>; })}
  </div>;
}

/* ---------- Line chart (multi-series) ---------- */
function LineChart({ series, w=560, h=200, labels, yMax, yFmt }) {
  const pad={ l:38, r:12, t:12, b:26 };
  const allVals=series.flatMap(s=>s.data); const max=yMax||Math.max(...allVals)*1.1; const min=0;
  const iw=w-pad.l-pad.r, ih=h-pad.t-pad.b;
  const x=i=>pad.l+(i/(labels.length-1))*iw;
  const y=v=>pad.t+ih-((v-min)/(max-min))*ih;
  const grid=4;
  return <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display:'block' }}>
    {Array.from({length:grid+1}).map((_,i)=>{ const gy=pad.t+(i/grid)*ih; const gv=max-(i/grid)*(max-min);
      return <g key={i}><line x1={pad.l} y1={gy} x2={w-pad.r} y2={gy} stroke="var(--border)" strokeWidth="1" strokeDasharray={i===grid?'0':'3 3'} />
        <text x={pad.l-8} y={gy+3} textAnchor="end" fontSize="10" fill="var(--text-3)">{yFmt?yFmt(gv):Math.round(gv)}</text></g>; })}
    {labels.map((l,i)=> i%Math.ceil(labels.length/7)===0 && <text key={i} x={x(i)} y={h-8} textAnchor="middle" fontSize="10" fill="var(--text-3)">{l}</text>)}
    {series.map((s,si)=>{ const line=s.data.map((d,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(d).toFixed(1)).join(' ');
      return <g key={si}>
        <path d={line} fill="none" stroke={s.color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        {s.data.map((d,i)=><circle key={i} cx={x(i)} cy={y(d)} r="2.4" fill="var(--surface)" stroke={s.color} strokeWidth="1.6" />)}
      </g>; })}
  </svg>;
}

function Legend({ items }) {
  return <div className="row gap16 wrap">{items.map((it,i)=><div key={i} className="row ai-center gap6">
    <span style={{ width:9, height:9, borderRadius:3, background:it.color }} /><span className="t-sm muted">{it.label}</span>
  </div>)}</div>;
}

/* ---------- Radial gauge (semicircle) ---------- */
function Gauge({ value, max=100, size=200, thickness=18, color='var(--brand-600)', label, sub }) {
  const pct=Math.min(1, value/max);
  const r=(size-thickness)/2;
  const cx=size/2, cy=size/2;
  const circ=Math.PI*r; // semicircle length
  const id='g'+Math.random().toString(36).slice(2,7);
  function pt(frac){ const a=Math.PI*(1-frac); return [cx+r*Math.cos(a), cy-r*Math.sin(a)]; }
  const [sx,sy]=pt(0), [ex,ey]=pt(1);
  const [vx,vy]=pt(pct);
  const large=pct>0.5?1:0;
  return <div style={{ position:'relative', width:size, height:size/2+10 }}>
    <svg width={size} height={size/2+10} viewBox={`0 0 ${size} ${size/2+10}`}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={color} stopOpacity=".6" /><stop offset="1" stopColor={color} /></linearGradient></defs>
      <path d={`M ${sx} ${sy} A ${r} ${r} 0 0 1 ${ex} ${ey}`} fill="none" stroke="var(--surface-3)" strokeWidth={thickness} strokeLinecap="round" />
      <path d={`M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${vx} ${vy}`} fill="none" stroke={`url(#${id})`} strokeWidth={thickness} strokeLinecap="round" />
    </svg>
    <div style={{ position:'absolute', inset:0, top:size*0.16, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
      <div style={{ fontSize:size*0.18, fontWeight:800, fontFamily:'var(--font-display)', lineHeight:1 }}>{label}</div>
      {sub && <div className="t-xs muted" style={{ marginTop:3 }}>{sub}</div>}
    </div>
  </div>;
}

Object.assign(window, { Gauge });

/* ============================================================
   Tier lock-gate pattern
   ============================================================ */
function useApp(){ return useContext(AppCtx); }

/* Wrap any feature. If plan doesn't include feature -> locked overlay. */
function LockGate({ feature, children, title, blurb, minHeight=200 }) {
  const { plan } = useApp();
  const ok = SM.tierIncludes(plan, feature);
  if (ok) return children;
  const need = SM.requiredTier(feature);
  const m = SM.TIER_META[need];
  return <div className="sm-gate" style={{ minHeight }}>
    <div className="sm-gate-blur" aria-hidden="true">{children}</div>
    <div className="sm-gate-veil">
      <div className="sm-gate-card">
        <div className="sm-gate-lock" style={{ background:m.bg, color:m.color }}><Icon name="lock" size={22} /></div>
        <div className="sm-gate-tier"><TierPill plan={need} /></div>
        <h3 className="sm-gate-title">{title||'Feature locked'}</h3>
        <p className="sm-gate-blurb">{blurb||`This capability is part of the ${m.label} plan. Upgrade to unlock it for this school.`}</p>
        <Btn variant={need==='platinum'?'platinum':'gold'} icon="sparkle" onClick={()=>window.SM_UPGRADE&&window.SM_UPGRADE(need)}>Upgrade to {m.label}</Btn>
        <button className="sm-gate-link" onClick={()=>window.SM_UPGRADE&&window.SM_UPGRADE(need)}>Compare plans</button>
      </div>
    </div>
  </div>;
}

/* Inline lock chip for sidebar items / small controls */
function LockChip({ tier }) {
  const m=SM.TIER_META[tier]; if(!m) return null;
  return <Tip text={`${m.label} feature — upgrade to unlock`}><span className="sm-lockchip" style={{ color:m.color }}><Icon name="lock" size={12} stroke={2.4} /></span></Tip>;
}

/* Permission gate: render children only if role can(module,cap); else fallback (disabled tooltip) */
function Can({ module, cap, children, fallback=null, role }) {
  const app = useApp(); const r = role||app.role;
  if (SM.can(r, module, cap)) return children;
  return fallback;
}

Object.assign(window, { Spark, Donut, Bars, LineChart, Legend, LockGate, LockChip, Can, useApp });
