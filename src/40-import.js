/* Import of the official Zepp data export. Formats below were verified against real exports:
   - files start with a BOM, and quotes inside quoted fields are backslash-escaped;
   - HEARTRATE_AUTO, ACTIVITY_MINUTE and ACTIVITY_STAGE use local wall-clock time;
   - SLEEP start/stop, SPORT and BODY use UTC with an explicit +0000;
   - SLEEP_MINUTE can be dated one day ahead of the true night, so its date offset is measured, not assumed. */
function parseCSV(text){
  if(text.charCodeAt(0)===0xFEFF)text=text.slice(1);
  const rows=[];let p=0;const n=text.length;
  const slow=l=>{const o=[];let c='',q=false;
    for(let i=0;i<l.length;i++){const h=l[i];
      if(q){if(h==='\\'&&l[i+1]==='"'){c+='"';i++}else if(h==='"'){if(l[i+1]==='"'){c+='"';i++}else q=false}else c+=h}
      else if(h==='"')q=true;else if(h===','){o.push(c);c=''}else c+=h}
    o.push(c);return o};
  while(p<n){
    let e=text.indexOf('\n',p);if(e<0)e=n;
    let l=text.slice(p,e);p=e+1;
    if(l.endsWith('\r'))l=l.slice(0,-1);
    if(!l)continue;
    rows.push(l.includes('"')?slow(l):l.split(','));
  }
  return rows;
}
function parseTs(s){
  if(s==null)return NaN;s=String(s).trim();
  if(/^\d{10}$/.test(s))return+s*1e3;
  if(/^\d{13}$/.test(s))return+s;
  const m=s.match(/^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d)(?::(\d\d))?(?:\.\d+)?\s*(Z|[+-]\d\d:?\d\d)?$/);
  if(!m)return NaN;
  let t=Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0));
  if(m[7]&&m[7]!=='Z'){const z=m[7].replace(':',''),o=(+z.slice(1,3)*60+ +z.slice(3,5))*(z[0]==='-'?-1:1);t-=o*MIN}
  return t;
}
const hmMin=s=>{const a=s.split(':');return+a[0]*60+ +a[1]};
const KINDS=[['hr',['date','time','heartrate']],['hrManual',['time','heartrate']],['stepMin',['date','time','steps']],['sleepMin',['date','time','stage']],
  ['sleep',['date','deepsleeptime','shallowsleeptime']],['activity',['date','steps','distance','rundistance','calories']],['bouts',['date','start','stop','distance','calories','steps']],
  ['sport',['type','starttime']],['body',['time','weight']],['user',['userid','gender']],['measure',['date','time','arm']]];
function classify(head){
  const h=head.map(x=>x.trim().toLowerCase().replace(/\(.*$/,''));
  for(const[k,c]of KINDS)if(c.every(x=>h.includes(x))&&!(k==='hrManual'&&h.includes('date'))&&!(k==='stepMin'&&h.includes('stage')))return{k,ix:Object.fromEntries(h.map((x,i)=>[x,i]))};
  return null;
}
function modeOf(a){const c=new Map();let b=null,m=0;for(const x of a){const v=(c.get(x)||0)+1;c.set(x,v);if(v>m){m=v;b=x}}return b}
function ingestExport(files){
  const by={},rep={files:[],skipped:[],notes:[],added:{}};
  for(const f of files){
    const rows=parseCSV(f.text);
    if(!rows.length)continue;
    const c=classify(rows[0]);
    const nm=f.name.split('/').pop();
    if(!c){rep.skipped.push({name:nm,head:rows[0].slice(0,8).join(', ')});continue}
    (by[c.k]=by[c.k]||[]).push({ix:c.ix,rows:rows.slice(1)});
    rep.files.push({name:nm,kind:c.k,rows:rows.length-1});
  }
  const each=(k,fn)=>{for(const f of by[k]||[])for(const r of f.rows)fn(r,f.ix)};
  /* minute heart rate and steps are already local */
  let nHr=0,nSt=0;
  each('hr',(r,x)=>{const v=+r[x.heartrate];if(!(v>=25&&v<=240))return;const n=dn(r[x.date]);if(!Number.isFinite(n))return;hrOf(n)[hmMin(r[x.time])]=v;nHr++});
  each('stepMin',(r,x)=>{const v=+r[x.steps];if(!(v>=0&&v<=500))return;const n=dn(r[x.date]);if(!Number.isFinite(n))return;stOf(n)[hmMin(r[x.time])]=v;nSt++});
  /* sleep sessions: instants in UTC */
  const sess=[];
  each('sleep',(r,x)=>{
    const s=parseTs(r[x.start]),e=parseTs(r[x.stop]);
    const deep=num(r[x.deepsleeptime])||0,light=num(r[x.shallowsleeptime])||0,rem=num(r[x.remtime])||0,wake=num(r[x.waketime])||0;
    if(!(e>s)||deep+light+rem<=0)return;
    sess.push({s,e,deep,light,rem,wake,date:r[x.date]});
  });
  sess.sort((a,b)=>a.s-b.s);
  /* minute-level stages grouped into contiguous runs */
  const mins=[];
  each('sleepMin',(r,x)=>{const g=STAGE[(r[x.stage]||'').trim().toUpperCase()];if(!g)return;const t=dn(r[x.date])*DAY+hmMin(r[x.time])*MIN;if(Number.isFinite(t))mins.push([t,g,num(r[x.respiratory_rate])])});
  mins.sort((a,b)=>a[0]-b[0]);
  const runs=[];
  for(const m of mins){const l=runs[runs.length-1];if(l&&m[0]-l.e<=20*MIN){if(m[0]>=l.e-MIN){l.e=m[0]+MIN;l.c[m[1]]++}}else runs.push({s:m[0],e:m[0]+MIN,c:[0,0,0,0,0],used:false})}
  /* measure the local offset and date error by matching runs to UTC sessions */
  const pairs=[];
  for(const q of sess){
    const d=(q.e-q.s)/MIN;let best=null;
    for(const r of runs){
      if(Math.abs(r.s-q.s)>3*DAY)continue;
      if(Math.abs((r.e-r.s)/MIN-d)>6)continue;
      const off=Math.round((r.s-q.s)/MIN);let o=((off%1440)+1440)%1440;if(o>840)o-=1440;
      const res=((o%15)+15)%15;if(res>2&&res<13)continue;
      const oz=Math.round(o/15)*15,sh=Math.round((off-oz)/1440);
      if(!best||Math.abs(sh)<Math.abs(best.sh))best={r,o:oz,sh,q};
    }
    if(best)pairs.push(best);
  }
  let dayShift=0,offs=[];
  if(pairs.length){
    dayShift=modeOf(pairs.map(p=>p.sh));
    const good=pairs.filter(p=>p.sh===dayShift);
    offs=good.map(p=>[p.q.s,p.o]);
    for(const p of good){p.r.used=true;p.q.stage=p.r}
    rep.notes.push(dayShift?`Sleep stage rows were dated ${dayShift>0?dayShift+' day ahead of':-dayShift+' day behind'} the sleep summary. Zeitgeber corrected ${good.length} nights.`:`Sleep stages matched ${good.length} sleep summaries.`);
  }else if(sess.length&&nSt>500){
    /* no minute stages: pick the offset where sleep sits in the quietest minutes */
    let best=null;const scores=[];
    for(let o=-720;o<=840;o+=30){
      let sum=0,c=0;
      for(const q of sess){const a=q.s+o*MIN,b=q.e+o*MIN;
        for(let t=a;t<b;t+=5*MIN){const n=Math.floor(t/DAY),st=D.st.get(n);if(st){sum+=st[Math.floor((t-n*DAY)/MIN)];c++}}}
      if(c>50){const v=sum/c;scores.push(v);if(!best||v<best.v)best={o,v}}
    }
    const med=scores.slice().sort((a,b)=>a-b)[scores.length>>1];
    if(best&&best.v<.35*med){offs=sess.map(q=>[q.s,best.o]);rep.notes.push(`Worked out a local offset of UTC${sign(best.o/60,1)} from when you stop moving.`)}
  }
  const dominant=offs.length?modeOf(offs.map(o=>o[1])):null;
  const offAt=ms=>{
    if(!offs.length)return tzOffsetMin(ms,CFG.tz);
    let lo=0,hi=offs.length-1;while(lo<hi){const m=(lo+hi)>>1;if(offs[m][0]<ms)lo=m+1;else hi=m}
    const a=offs[Math.max(0,lo-1)],b=offs[lo];return Math.abs(a[0]-ms)<Math.abs(b[0]-ms)?a[1]:b[1];
  };
  if(dominant!=null)rep.notes.push(`Local time in this export is mostly UTC${dominant>=0?'+':'−'}${Math.floor(Math.abs(dominant)/60)}${Math.abs(dominant)%60?':'+pad(Math.abs(dominant)%60):''}, measured from the data itself.`);
  else if(sess.length)rep.notes.push(`Local time could not be measured from this export, so ${CFG.tz} was used for sleep and workouts.`);
  /* write stages with the measured correction */
  const respBy=new Map();
  for(const m of mins){
    const t=m[0]-dayShift*DAY,n=Math.floor(t/DAY);
    sgOf(n)[Math.floor((t-n*DAY)/MIN)]=m[1];
    if(m[2]>4&&m[2]<60){const k=Math.floor((t+6*36e5)/DAY);const a=respBy.get(k)||[];a.push(m[2]);respBy.set(k,a)}
  }
  for(const[k,a]of respBy)setDay(k,{resp:a.reduce((x,y)=>x+y,0)/a.length});
  let nSleep=0;
  for(const q of sess){
    const o=offAt(q.s),s=q.s+o*MIN,e=q.e+o*MIN;
    upsertSleep({id:s,s,e,date:Math.floor((e-1)/DAY),deep:q.deep,light:q.light,rem:q.rem,wake:q.wake});nSleep++;
  }
  /* unmatched minute runs are naps that the summary rolled away */
  for(const r of runs){
    if(r.used||(r.e-r.s)<15*MIN)continue;
    const s=r.s-dayShift*DAY,e=r.e-dayShift*DAY;
    if([...D.sleeps.values()].some(x=>x.s<e&&x.e>s))continue;
    upsertSleep({id:s,s,e,date:Math.floor((e-1)/DAY),deep:r.c[2],light:r.c[1],rem:r.c[3],wake:r.c[4]});nSleep++;
  }
  dirty.add('sleeps:0');
  let nAct=0;
  each('activity',(r,x)=>{const n=dn(r[x.date]);if(!Number.isFinite(n))return;setDay(n,{steps:num(r[x.steps]),dist:num(r[x.distance]),run:num(r[x.rundistance]),kcal:num(r[x.calories])});nAct++});
  const bouts=new Map();
  each('bouts',(r,x)=>{const n=dn(r[x.date]);if(!Number.isFinite(n))return;let m=hmMin(r[x.stop])-hmMin(r[x.start]);if(m<0)m+=1440;bouts.set(n,(bouts.get(n)||0)+m)});
  for(const[n,m]of bouts)setDay(n,{bout:m});
  let nSport=0;
  each('sport',(r,x)=>{
    const t=parseTs(r[x.starttime]);if(!Number.isFinite(t))return;
    const s=t+offAt(t)*MIN;
    upsertWorkout({id:s,s,dur:(num(r[x.sporttime])||0)/60,type:+r[x.type],dist:num(r[x.distance])||0,kcal:num(r[x.calories])||0});nSport++;
  });
  dirty.add('workouts:0');
  let nBody=0;
  each('body',(r,x)=>{const t=parseTs(r[x.time]);if(!Number.isFinite(t))return;const n=Math.floor((t+offAt(t)*MIN)/DAY);
    setDay(n,{weight:num(r[x.weight]),bmi:num(r[x.bmi]),fat:num(r[x.fatrate])});nBody++});
  each('hrManual',(r,x)=>{const v=+r[x.heartrate],t=parseTs(r[x.time]);if(!(v>=25&&v<=240)||!Number.isFinite(t))return;
    const l=t+(/[+Z]/.test(r[x.time])?offAt(t)*MIN:0),n=Math.floor(l/DAY),a=hrOf(n),m=Math.floor((l-n*DAY)/MIN);if(!a[m])a[m]=v});
  each('user',(r,x)=>{const b=r[x.birthday];if(b&&/^\d{4}-\d\d/.test(b))CFG.birth=b.slice(0,7);if(r[x.gender]==='0')CFG.sex='f';else if(r[x.gender]==='1')CFG.sex='m';dirty.add('cfg:0')});
  rep.added={hr:nHr,steps:nSt,sleep:nSleep,activity:nAct,workouts:nSport,body:nBody};
  return rep;
}
async function readImportFiles(fileList,askPw){
  const out=[];let backup=null;
  for(const f of fileList){
    const low=f.name.toLowerCase();
    if(low.endsWith('.zgvault')||low.endsWith('.zgb')){backup=f;continue}
    if(low.endsWith('.zip')){
      const es=(await Zip.entries(f)).filter(e=>!e.dir&&/\.csv$/i.test(e.name)&&!/(^|\/)(__MACOSX|\._)/.test(e.name));
      let pw=null;
      if(Zip.encrypted(es)){
        const probe=es.slice().sort((a,b)=>a.csize-b.csize)[0];
        for(let tries=0;;tries++){
          pw=await askPw(f.name,tries>0);
          if(pw==null)throw new Error('Import cancelled.');
          try{await Zip.read(f,probe,pw);break}catch(e){if(e.message!=='badpw'&&e.message!=='corrupt')throw e}
        }
      }
      for(const e of es){out.push({name:e.name,text:unutf8(await Zip.read(f,e,pw))});await tick()}
    }else if(low.endsWith('.csv'))out.push({name:f.webkitRelativePath||f.name,text:await f.text()});
  }
  return{files:out,backup};
}
