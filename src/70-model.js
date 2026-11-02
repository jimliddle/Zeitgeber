/* Derived daily table. Everything the charts show comes from R, so filters apply consistently. */
const kmf=()=>CFG.units==='mi'?1/1609.344:1/1000;
const METRICS=[
 {id:'rhr',l:'Resting heart rate',u:'bpm',d:0,g:'Heart',good:-1},
 {id:'nightHr',l:'Sleeping heart rate',u:'bpm',d:0,g:'Heart',good:-1},
 {id:'hrMean',l:'Average heart rate',u:'bpm',d:0,g:'Heart',good:0},
 {id:'hrMax',l:'Peak heart rate',u:'bpm',d:0,g:'Heart',good:0},
 {id:'hrv',l:'Heart rate variability',u:'ms',d:0,g:'Heart',good:1},
 {id:'hrvN',l:'Overnight HRV',u:'ms',d:0,g:'Heart',good:1},
 {id:'stress',l:'Stress',u:'',d:0,g:'Recovery',good:-1},
 {id:'ready',l:'Readiness',u:'',d:0,g:'Recovery',good:1},
 {id:'spo2',l:'Blood oxygen',u:'%',d:0,g:'Recovery',good:1},
 {id:'odi',l:'Oxygen desaturation index',u:'/h',d:1,g:'Recovery',good:-1},
 {id:'resp',l:'Breathing rate',u:'/min',d:1,g:'Recovery',good:0},
 {id:'skin',l:'Skin temperature change',u:'°C',d:1,g:'Recovery',good:0},
 {id:'sleep',l:'Sleep duration',u:'',d:0,g:'Sleep',good:1,time:'dur'},
 {id:'deep',l:'Deep sleep',u:'',d:0,g:'Sleep',good:1,time:'dur'},
 {id:'rem',l:'REM sleep',u:'',d:0,g:'Sleep',good:1,time:'dur'},
 {id:'light',l:'Light sleep',u:'',d:0,g:'Sleep',good:0,time:'dur'},
 {id:'awake',l:'Time awake in bed',u:'',d:0,g:'Sleep',good:-1,time:'dur'},
 {id:'eff',l:'Sleep efficiency',u:'%',d:0,g:'Sleep',good:1},
 {id:'bed',l:'Bedtime',u:'',d:0,g:'Sleep',good:0,time:'clock'},
 {id:'wakeT',l:'Wake time',u:'',d:0,g:'Sleep',good:0,time:'clock'},
 {id:'mid',l:'Mid-sleep',u:'',d:0,g:'Sleep',good:0,time:'clock'},
 {id:'score',l:'Sleep score',u:'',d:0,g:'Sleep',good:1},
 {id:'nap',l:'Naps',u:'',d:0,g:'Sleep',good:0,time:'dur'},
 {id:'steps',l:'Steps',u:'',d:0,g:'Activity',good:1},
 {id:'dist',l:'Distance',u:'km',d:1,g:'Activity',good:1},
 {id:'brisk',l:'Brisk minutes',u:'min',d:0,g:'Activity',good:1},
 {id:'kcal',l:'Active calories',u:'kcal',d:0,g:'Activity',good:0},
 {id:'pai',l:'Daily PAI',u:'',d:0,g:'Activity',good:1},
 {id:'trimp',l:'Training impulse',u:'',d:0,g:'Activity',good:0},
 {id:'load',l:'Watch training load',u:'',d:0,g:'Activity',good:0},
 {id:'vo2',l:'VO₂ max',u:'ml/kg/min',d:0,g:'Body',good:1},
 {id:'weight',l:'Weight',u:'kg',d:1,g:'Body',good:0},
 {id:'fat',l:'Body fat',u:'%',d:1,g:'Body',good:0},
];
const MI=Object.fromEntries(METRICS.map(m=>[m.id,m]));
const fmtM=(id,v)=>{const m=MI[id];if(!Number.isFinite(v))return'–';
  if(m.time==='dur')return dur(v);if(m.time==='clock')return hm(v);
  const u=id==='dist'?(CFG.units==='mi'?'mi':'km'):m.u;return fmtN(v,m.d)+(u?(u[0]==='/'||u==='%'||u==='°C'?u:' '+u):'')};
const fmtDelta=(id,v)=>{const m=MI[id];if(!Number.isFinite(v))return'–';
  if(m.time)return(v>0?'+':v<0?'−':'±')+dur(Math.abs(v));
  const u=id==='dist'?(CFG.units==='mi'?' mi':' km'):m.u?(m.u[0]==='/'||m.u==='%'||m.u==='°C'?m.u:' '+m.u):'';return sign(v,Math.max(m.d,Math.abs(v)<10?1:0))+u};

const R={n:0,start:0,dn:null,c:{},avail:[],hrMax:190,hrRest:60,sleepBy:new Map()};
function rebuild(){
  const dates=[];
  for(const m of[D.hr,D.st,D.days])for(const k of m.keys())dates.push(k);
  for(const s of D.sleeps.values())dates.push(s.date);
  const n0=dates.length?Math.min(...dates):0,n1=dates.length?Math.max(...dates):-1;
  const n=n1-n0+1;
  R.n=Math.max(0,n);R.start=n0;R.dn=new Int32Array(R.n);
  const c={};for(const m of METRICS)c[m.id]=new Float64Array(R.n).fill(NaN);
  for(const k of['ctl','atl','acwr','cover'])c[k]=new Float64Array(R.n).fill(NaN);
  /* sleep grouping: the longest session ending on a date is that date's main sleep */
  const by=new Map();
  for(const s of D.sleeps.values()){(by.get(s.date)||by.set(s.date,[]).get(s.date)).push(s)}
  R.sleepBy=new Map();
  for(const[d,a]of by){
    a.sort((x,y)=>(y.e-y.s)-(x.e-x.s));
    const naps=a.slice(1).filter(s=>s.e-s.s<4*36e5);
    R.sleepBy.set(d,{main:a[0],naps});
  }
  const allHr=[];
  for(const a of D.hr.values())for(let i=0;i<1440;i+=7)if(a[i])allHr.push(a[i]);
  const hrPeak=allHr.length?St.quant(allHr,.999):0;
  const age=CFG.birth?(Date.now()-Date.UTC(+CFG.birth.slice(0,4),+CFG.birth.slice(5,7)-1))/(365.25*DAY):0;
  R.hrMax=+CFG.hrMax||(age>10?Math.round(208-.7*age):Math.round(Math.max(hrPeak+5,165)));
  const[ta,tb]=CFG.sex==='f'?[.86,1.67]:[.64,1.92];
  /* resting heart rate is measured the same way every day: lowest 30-minute mean inside main sleep, else inside the day */
  const low30=(vals)=>{let s=0,k=0,best=Infinity;
    for(let i=0;i<vals.length;i++){if(vals[i]){s+=vals[i];k++}if(i>=30&&vals[i-30]){s-=vals[i-30];k--}if(i>=29&&k>=20)best=Math.min(best,s/k)}
    return best<Infinity?best:NaN};
  const seq=(a,b)=>{const L=Math.round((b-a)/MIN),o=new Uint8Array(Math.max(0,L));for(let i=0;i<L;i++){const t=a+i*MIN,k=Math.floor(t/DAY),h=D.hr.get(k);if(h)o[i]=h[Math.floor((t-k*DAY)/MIN)]}return o};
  for(let i=0;i<R.n;i++){
    const d=n0+i;R.dn[i]=d;
    const r=D.days.get(d)||{},h=D.hr.get(d),st=D.st.get(d),z=R.sleepBy.get(d);
    if(r.steps>0)c.steps[i]=r.steps;
    if(r.dist>0)c.dist[i]=r.dist*kmf();
    if(r.kcal>0)c.kcal[i]=r.kcal;
    for(const k of['pai','stress','ready','spo2','odi','resp','load','vo2','weight','fat','hrv','hrvN','skin'])if(r[k]!=null)c[k][i]=r[k];
    if(r.score)c.score[i]=r.score;
    if(st){let b=0,tot=0;for(let m=0;m<1440;m++){tot+=st[m];if(st[m]>=100)b++}c.brisk[i]=b;if(!(r.steps>0)&&tot>0)c.steps[i]=tot}
    if(z){const s=z.main;
      const asleep=s.deep+s.light+s.rem;
      c.sleep[i]=asleep;c.deep[i]=s.deep;c.light[i]=s.light;if(s.rem)c.rem[i]=s.rem;c.awake[i]=s.wake;
      c.eff[i]=100*asleep/(asleep+s.wake||1);
      c.bed[i]=(s.s-d*DAY)/MIN;c.wakeT[i]=(s.e-d*DAY)/MIN;c.mid[i]=(c.bed[i]+c.wakeT[i])/2;
      c.nap[i]=z.naps.reduce((a,x)=>a+x.deep+x.light+x.rem,0);
      if(s.score)c.score[i]=s.score;
      const q=seq(s.s,s.e),f=[];for(const v of q)if(v)f.push(v);
      if(f.length>60){c.nightHr[i]=St.mean(f);c.rhr[i]=low30(q)}
    }
    if(h){let s=0,k=0,mx=0;for(let m=0;m<1440;m++)if(h[m]){s+=h[m];k++;if(h[m]>mx)mx=h[m]}
      c.cover[i]=k;
      if(k>=240){c.hrMean[i]=s/k;c.hrMax[i]=mx;if(!Number.isFinite(c.rhr[i]))c.rhr[i]=low30(h)}}
    if(!Number.isFinite(c.rhr[i])&&r.rhrV)c.rhr[i]=r.rhrV;
  }
  R.hrRest=+CFG.hrRest||Math.round(St.median(c.rhr))||60;
  for(let i=0;i<R.n;i++){
    const h=D.hr.get(R.dn[i]);if(!h||!(c.cover[i]>=240))continue;
    let t=0;for(let m=0;m<1440;m++)if(h[m]){const x=(h[m]-R.hrRest)/(R.hrMax-R.hrRest);if(x>=.3)t+=x*ta*Math.exp(tb*x)}
    c.trimp[i]=t;
  }
  const a7=St.ewma(c.trimp,7),a28=St.ewma(c.trimp,28),a42=St.ewma(c.trimp,42);
  for(let i=0;i<R.n;i++){c.atl[i]=a7[i];c.ctl[i]=a42[i];c.acwr[i]=i>=28&&a28[i]>1?a7[i]/a28[i]:NaN}
  R.c=c;
  R.avail=METRICS.filter(m=>{let k=0;const a=c[m.id];for(let i=0;i<R.n;i++)if(Number.isFinite(a[i])&&++k>=3)return true;return false}).map(m=>m.id);
}
const has=id=>R.avail.includes(id);

/* Filters */
const F={preset:'90',from:0,to:0,wds:[1,1,1,1,1,1,1],tag:'',conds:[],compare:true};
function applyPreset(){
  const last=R.start+R.n-1;
  if(F.preset==='custom'){F.from=clamp(F.from||R.start,R.start,last);F.to=clamp(F.to||last,F.from,last);return}
  F.to=last;F.from=F.preset==='all'?R.start:Math.max(R.start,last-+F.preset+1);
}
function passes(i){
  const d=R.dn[i];
  if(!F.wds[wd(d)])return false;
  if(F.tag&&!(D.tags.get(d)||[]).includes(F.tag))return false;
  for(const q of F.conds){const v=R.c[q.m]?.[i];if(!Number.isFinite(v))return false;if(q.op==='>'&&!(v>=q.v))return false;if(q.op==='<'&&!(v<=q.v))return false}
  return true;
}
function selection(from=F.from,to=F.to){const o=[];for(let d=from;d<=to;d++){const i=d-R.start;if(i>=0&&i<R.n&&passes(i))o.push(i)}return o}
function prevSelection(){const L=F.to-F.from+1;return selection(F.from-L,F.from-1)}
const col=(id,idx)=>Float64Array.from(idx,i=>R.c[id][i]);

/* Sleep regularity index (Phillips et al. 2017) on 15-minute bins, from recorded sessions. */
function sleepRegularity(idx){
  const set=new Set(idx.map(i=>R.dn[i])),grid=new Map();
  const mark=(s,on)=>{for(let t=s.s;t<s.e;t+=15*MIN){const k=Math.floor(t/DAY);let g=grid.get(k);if(!g){g=new Uint8Array(96);grid.set(k,g)}g[Math.floor((t-k*DAY)/(15*MIN))]=on}};
  for(const s of D.sleeps.values())mark(s,1);
  let same=0,tot=0;
  for(const k of set){const a=grid.get(k),b=grid.get(k+1);if(!a||!b||!set.has(k+1))continue;for(let j=0;j<96;j++){tot++;if(a[j]===b[j])same++}}
  return tot>96*7?200*same/tot-100:NaN;
}
function socialJetlag(idx){
  const free=[],work=[];
  for(const i of idx){const v=R.c.mid[i];if(!Number.isFinite(v))continue;(wd(R.dn[i])>=5?free:work).push(v)}
  if(free.length<4||work.length<8)return null;
  const f=St.median(free),w=St.median(work);return{free:f,work:w,gap:f-w};
}
function hrMinutes(idx,fn){for(const i of idx){const h=D.hr.get(R.dn[i]);if(h)fn(h,i)}}
function dayProfile(idx,bin=15){
  const n=1440/bin,b=Array.from({length:n},()=>[]);
  hrMinutes(idx,h=>{for(let k=0;k<n;k++){let s=0,c=0;for(let m=k*bin;m<(k+1)*bin;m++)if(h[m]){s+=h[m];c++}if(c>=bin/3)b[k].push(s/c)}});
  const p=[.1,.5,.9].map(q=>new Float64Array(n).fill(NaN));
  b.forEach((a,k)=>{if(a.length>=3){const s=Float64Array.from(a).sort();p[0][k]=St.q(s,.1);p[1][k]=St.q(s,.5);p[2][k]=St.q(s,.9)}});
  return{bin,n,lo:p[0],med:p[1],hi:p[2]};
}
function insights(idx,prev){
  const out=[];
  if(idx.length<7)return out;
  const key=['rhr','hrv','sleep','deep','steps','brisk','stress','ready','weight'].filter(has);
  const shifts=[];
  for(const id of key){
    const a=col(id,idx),b=col(id,prev),rho=clamp(St.lag1(St.fin(a)),0,.8),h=St.hedges(a,b,rho);
    if(h&&Math.abs(h.g)>=.5&&(h.lo>0||h.hi<0))shifts.push({id,h});
  }
  shifts.sort((x,y)=>Math.abs(y.h.g)-Math.abs(x.h.g));
  for(const{id,h}of shifts.slice(0,3)){
    const m=MI[id],better=m.good?Math.sign(h.diff)===m.good:null;
    out.push({t:`${m.l} ${h.diff>0?'rose':'fell'} ${fmtDelta(id,Math.abs(h.diff)).replace('+','')}`,d:`Average ${fmtM(id,St.mean(col(id,idx)))} against ${fmtM(id,St.mean(col(id,prev)))} in the period before. Effect size ${fmtN(Math.abs(h.g),1)}, adjusted for how much one day predicts the next.`,up:better===true});
  }
  for(const id of['rhr','sleep','steps'].filter(has)){
    const y=col(id,idx),cp=St.changepoints(y);
    if(cp.length){const p=cp[cp.length-1],dd=R.dn[idx[p.i]];
      out.push({t:`${MI[id].l} shifted level around ${fmtDS(dd)}`,d:`It went from about ${fmtM(id,p.before)} to about ${fmtM(id,p.after)} and held there. Worth checking what changed that week.`});break}
  }
  if(has('rhr')){
    const all=[];for(let i=0;i<R.n;i++)all.push(i);
    const an=St.anomalies(Array.from(R.dn),Array.from(R.c.rhr)).filter(a=>a.z>0&&R.dn[a.i]>=F.from&&R.dn[a.i]<=F.to);
    const last=F.to-13,rec=an.filter(a=>R.dn[a.i]>=last);
    if(rec.length>=2)out.push({t:`Resting heart rate ran high on ${rec.length} of the last 14 days`,d:`Well above your own four-week range. Common causes include illness, alcohol, heat, poor sleep and hard training.`});
    else if(an.length)out.push({t:`${an.length} day${an.length>1?'s':''} of unusually high resting heart rate`,d:`The highest was ${fmtDS(R.dn[an.slice().sort((a,b)=>b.z-a.z)[0].i])}. These days are ringed on the Heart page.`});
  }
  const j=socialJetlag(idx);
  if(j&&Math.abs(j.gap)>=45)out.push({t:`Weekends shift your sleep by ${dur(Math.abs(j.gap))}`,d:`Mid-sleep is ${hm(j.free)} on days off and ${hm(j.work)} on weekdays. Researchers call this gap social jetlag.`});
  const s=col('sleep',idx);
  if(St.fin(s).length>=7){const m=St.mean(s),gap=CFG.sleepTarget-m;
    if(gap>=20)out.push({t:`You average ${dur(gap)} below your sleep target`,d:`${dur(m)} a night against a target of ${dur(CFG.sleepTarget)}. Over this period that adds up to ${fmtN(gap*St.fin(s).length/60)} hours.`})}
  const pairs=[['sleep','rhr',0],['sleep','hrv',0],['trimp','rhr',1],['trimp','deep',1],['steps','sleep',1],['sleep','steps',0],['stress','sleep',1],['nap','sleep',1],['bed','sleep',0]].filter(p=>has(p[0])&&has(p[1]));
  const rs=pairs.map(([a,b,l])=>{const x=[],y=[];for(const i of idx){const k=i+l;if(k<R.n){x.push(R.c[a][i]);y.push(R.c[b][k])}}return{a,b,l,...St.spearman(x,y)}});
  const qs=St.bh(rs.map(r=>r.p));
  const hit=rs.map((r,i)=>({...r,q:qs[i]})).filter(r=>r.q<.05&&Math.abs(r.r)>=.2).sort((p,q)=>Math.abs(q.r)-Math.abs(p.r))[0];
  if(hit)out.push({t:`${MI[hit.a].l} and ${hit.l?'the next day’s':'same-day'} ${MI[hit.b].l.toLowerCase()} ${hit.r>0?'rise and fall together':'move in opposite directions'}`,d:`Rank correlation ${sign(hit.r,2)} over ${hit.n} days, surviving correction for the ${rs.length} pairs tested. This is an association in your data, and it can’t show cause.`});
  const ac=[...idx].reverse().map(i=>R.c.acwr[i]).find(Number.isFinite);
  if(ac>1.5)out.push({t:`Training load is climbing fast`,d:`Your last week is ${fmtN(ac,1)} times your four-week average, computed from minute heart rate.`});
  return out.slice(0,6);
}
