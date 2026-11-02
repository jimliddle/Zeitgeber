/* Application shell, pages and vault flows. */
const NAV=[['overview','Overview'],['heart','Heart'],['sleep','Sleep'],['activity','Activity'],['relations','Relations'],['records','Records'],['sources','Sources'],['vault','Vault']];
let firstPaint=true,lastActive=Date.now(),busy=0,unlocked=false,watching=false;
function applyTheme(){
  const dark=CFG.theme==='dark'||(CFG.theme==='auto'&&matchMedia('(prefers-color-scheme:dark)').matches);
  if(CFG.theme==='auto')delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=CFG.theme;
  document.documentElement.dataset.resolved=dark?'dark':'light';readTheme();
  $('meta[name=theme-color]')?.setAttribute('content',T.ground);
}
/* Locking must not reload the page: an installed app may have no signal to load it again. */
async function lockNow(){
  if(!unlocked)return;
  try{await persist()}catch(e){}
  unlocked=false;hideTip();
  for(const f of FIGS)f.ro.disconnect();FIGS.length=0;
  const theme=CFG.theme;
  clearData();D.log=[];dirty.clear();
  for(const k of Object.keys(CFG))delete CFG[k];
  Object.assign(CFG,structuredClone(CFG_DEFAULT),{theme});
  Object.assign(F,{preset:'90',from:0,to:0,wds:[1,1,1,1,1,1,1],tag:'',conds:[],compare:true});
  Object.assign(UI,{view:'overview',night:null,fOpen:false});
  S={idx:[],prev:[]};rebuild();Vault.forget();firstPaint=true;
  await lockScreen();
}
function checkIdle(){if(unlocked&&!busy&&Date.now()-lastActive>(+CFG.idle||10)*MIN)lockNow()}
function startIdleWatch(){
  if(watching)return;watching=true;
  const bump=()=>{if(!document.hidden)lastActive=Date.now()};
  for(const e of['pointerdown','pointermove','keydown','wheel','touchstart'])addEventListener(e,bump,{passive:true});
  setInterval(checkIdle,15e3);
  /* timers stop while a phone app is in the background, so check on return */
  document.addEventListener('visibilitychange',()=>{if(document.hidden){if(unlocked)persist().catch(()=>{})}else checkIdle()});
  addEventListener('scroll',hideTip,{passive:true});
  addEventListener('pointerdown',e=>{if(e.target.tagName!=='CANVAS')hideTip()},{passive:true});
}
/* The manifest lives inside this file. It is built at load time so its URLs match wherever the page is hosted. */
const APP_ICONS=/*ICONS*/{};
let installEvt=null;
const hosted=()=>location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1';
const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
function setupPWA(){
  addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvt=e;if(UI.view==='vault'&&unlocked)render()});
  addEventListener('appinstalled',()=>{installEvt=null;toast('Zeitgeber is installed.')});
  if(!hosted())return;
  const page=location.origin+location.pathname,scope=page.replace(/[^/]*$/,'');
  const m={name:'Zeitgeber',short_name:'Zeitgeber',description:'Private analytics for an Amazfit watch. Your health data stays encrypted on your own device.',
    id:location.pathname,start_url:page,scope,display:'standalone',orientation:'any',background_color:'#17163A',theme_color:'#17163A',lang:'en',categories:['health','fitness'],
    icons:[{src:APP_ICONS.a192,sizes:'192x192',type:'image/png',purpose:'any'},{src:APP_ICONS.a512,sizes:'512x512',type:'image/png',purpose:'any'},{src:APP_ICONS.m512,sizes:'512x512',type:'image/png',purpose:'maskable'}]};
  document.head.append(el('link',{rel:'manifest',href:'data:application/manifest+json;charset=utf-8,'+encodeURIComponent(JSON.stringify(m))}));
  /* sw.js sits beside this page and adds offline start-up. Without it the app still works, online. */
  if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
}
const installState=()=>standalone()?'installed':installEvt?'prompt':!hosted()?'local':/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)?'ios':'menu';
function installBlock(){
  const st=installState(),box=el('section',{class:'stack'},el('h2',null,'Install'));
  if(st==='installed')box.append(el('p',{class:'small'},'You are using the installed app.'));
  else if(st==='prompt')box.append(el('p',{class:'small'},'Add Zeitgeber to your home screen or app list.'),el('div',null,el('button',{class:'btn primary',type:'button',onclick:async()=>{const e=installEvt;installEvt=null;await e.prompt();await e.userChoice;render()}},'Install app')));
  else if(st==='ios')box.append(el('p',{class:'small'},'In Safari, tap Share, then Add to Home Screen.'));
  else if(st==='menu')box.append(el('p',{class:'small'},'Open your browser’s menu and choose Install app, or Add to Home screen.'));
  else box.append(el('p',{class:'small'},'Installing needs the hosted version of this page. A file opened from your computer cannot be installed.'));
  if(st!=='local')box.append(el('p',{class:'small muted'},'After your first visit the app opens without a connection. Syncing with Zepp still needs one.'));
  return box;
}
function shell(){
  const app=$('#app');
  app.replaceChildren(el('div',{id:'shell'},
    el('nav',{id:'rail','aria-label':'Pages'},el('div',{class:'mark'},'Zeitgeber'),
      NAV.map(([k,l])=>el('button',{type:'button','data-v':k,onclick:()=>{UI.view=k;render();scrollTo(0,0)}},l)),
      el('div',{class:'sp'}),el('button',{type:'button',onclick:lockNow},'Lock')),
    el('main',{id:'main',tabIndex:-1})));
}
function filterBar(){
  const presets=[['30','30 days'],['90','90 days'],['180','6 months'],['365','1 year'],['all','All']];
  const go=()=>{applyPreset();render()};
  const conds=F.conds.map((q,i)=>el('span',{class:'cond'},
    pick(metricOpts(),q.m,v=>{q.m=v;q.v=NaN;const a=St.fin(R.c[v]);q.v=St.median(a);render()},'Filter metric'),
    pick([['>','at least'],['<','at most']],q.op,v=>{q.op=v;render()},'Comparison'),
    MI[q.m].time?el('span',null,fmtM(q.m,q.v)):null,
    el('input',{type:'number',step:'any',value:Math.round(q.v*10)/10,'aria-label':'Value',title:MI[q.m].time?'Minutes':'',onchange:e=>{q.v=+e.target.value;render()}}),
    el('button',{type:'button',class:'link','aria-label':'Remove this filter',onclick:()=>{F.conds.splice(i,1);render()}},'Remove')));
  const tags=[...new Set([...D.tags.values()].flat())].sort();
  const active=F.wds.filter(x=>!x).length+(F.tag?1:0)+F.conds.length+(F.preset==='custom'?1:0);
  return el('div',{id:'filters',class:UI.fOpen?'open':null},
    seg(presets,F.preset,v=>{F.preset=v;go()},'Date range'),
    el('button',{type:'button',class:'btn small ftoggle','aria-expanded':String(!!UI.fOpen),onclick:()=>{UI.fOpen=!UI.fOpen;render()}},`${UI.fOpen?'Hide':'More'} filters${active?` (${active})`:''}`),
    el('span',{class:'count'},`${S.idx.length} of ${F.to-F.from+1} days`),
    el('div',{class:'fmore'},
    el('input',{type:'date','aria-label':'From',value:ds(F.from),min:ds(R.start),max:ds(F.to),onchange:e=>{if(e.target.value){F.preset='custom';F.from=dn(e.target.value);go()}}}),
    el('input',{type:'date','aria-label':'To',value:ds(F.to),min:ds(F.from),max:ds(R.start+R.n-1),onchange:e=>{if(e.target.value){F.preset='custom';F.to=dn(e.target.value);go()}}}),
    el('div',{class:'seg soft',role:'group','aria-label':'Weekdays'},WD.map((w,i)=>el('button',{type:'button','aria-pressed':String(!!F.wds[i]),onclick:()=>{F.wds[i]=F.wds[i]?0:1;if(!F.wds.some(Boolean))F.wds[i]=1;render()}},w[0]+(w[1]==='u'||w[1]==='h'?w[1]:'')))),
    tags.length?pick([['','All tags'],...tags.map(t=>[t,t])],F.tag,v=>{F.tag=v;render()},'Tag'):null,
    conds,
    el('button',{type:'button',class:'btn small',onclick:()=>{const m=R.avail[0];F.conds.push({m,op:'>',v:St.median(R.c[m])});render()}},'Add a condition'),
    el('label',{class:'stacklabel small'},el('input',{type:'checkbox',checked:F.compare,onchange:e=>{F.compare=e.target.checked;render()}}),'Compare with previous period'),
    el('button',{type:'button',class:'btn small',onclick:()=>exportSheet(UI.view)},'Save page as image')));
}
function spark(canvas,y,color){
  const w=canvas.clientWidth||160,h=30,dpr=devicePixelRatio||1;canvas.width=w*dpr;canvas.height=h*dpr;const g=canvas.getContext('2d');g.scale(dpr,dpr);
  const v=St.fin(y);if(v.length<3)return;const lo=Math.min(...v),hi=Math.max(...v),xs=sc(0,y.length-1,1,w-3),ys=sc(lo,hi,h-3,3);
  const r=St.rolling(y.map((_,i)=>i),y,Math.max(5,Math.round(y.length/8))).med;
  g.strokeStyle=color;g.lineWidth=2;g.lineJoin='round';path(g,y.map((_,i)=>xs(i)),Array.from(r,ys));
}
function signals(){
  const ids=['rhr','sleep','steps',has('hrv')?'hrv':'nightHr',has('stress')?'stress':'deep',has('pai')?'pai':'brisk'].filter(has).slice(0,6);
  const after=[];
  const nodes=ids.map(id=>{
    const m=MI[id],v=col(id,S.idx),c=St.median(v),p=F.compare?St.median(col(id,S.prev)):NaN,d=c-p,cv=el('canvas');
    const parts=fmtM(id,c).split(' ');
    after.push(()=>spark(cv,Array.from(v),T.s1));
    return el('div',{class:'sig'},el('div',{class:'l'},m.l),
      el('div',{class:'v'},m.time?fmtM(id,c):parts[0],!m.time&&parts[1]?el('small',null,parts[1]):null),
      el('div',{class:'d'},Number.isFinite(d)?`${fmtDelta(id,d)} from the period before`:'Median of this period'),cv);
  });
  return{node:el('div',{class:'strip'},nodes),after};
}
function nodata(){
  return el('div',{class:'empty'},el('h1',null,'Your vault is empty.'),
    el('p',null,'Add your Amazfit data on the Sources page. It stays encrypted on this device.'),
    el('div',{class:'row'},el('button',{class:'btn primary',type:'button',onclick:()=>{UI.view='sources';render()}},'Add my data'),
      el('button',{class:'btn',type:'button',onclick:async()=>{loadSample();await persist();boot2()}},'Explore with sample data')));
}
const grid=(...f)=>el('div',{class:'g'},f.filter(Boolean).map(x=>x.node||x));
function lede(h,p){return el('div',{class:'lede'},el('h1',null,h),p?el('p',null,p):null)}
function pageOverview(m){
  const c=S.idx;
  if(!c.length){m.append(lede('No days match these filters.','Clear a condition or widen the date range.'));return}
  const rhr=St.median(col('rhr',c)),sl=St.median(col('sleep',c)),st=St.median(col('steps',c)),bits=[];
  if(Number.isFinite(rhr))bits.push(`a resting heart rate of ${fmtN(rhr)} bpm`);if(Number.isFinite(sl))bits.push(`${dur(sl)} of sleep`);if(Number.isFinite(st))bits.push(`${fmtN(st)} steps`);
  m.append(lede(bits.length?`A typical day here: ${bits.length>1?bits.slice(0,-1).join(', ')+' and '+bits[bits.length-1]:bits[0]}.`:'No readings in these days yet.'));
  const f=figChrono();if(firstPaint&&!matchMedia('(prefers-reduced-motion: reduce)').matches)f.wrap.classList.add('wipe');firstPaint=false;
  m.append(grid(f));
  const s=signals();m.append(s.node);s.after.forEach(a=>requestAnimationFrame(a));
  const ins=insights(c,S.prev);
  if(ins.length)m.append(el('h2',{class:'sec'},'What stands out'),el('ul',{class:'finds'},ins.map(i=>el('li',{class:i.up?'up':''},el('b',null,i.t),el('span',null,i.d)))));
  m.append(el('p',{class:'note'},'These are patterns in your own data, computed on this device. They are not medical advice, and a watch can misread. See a clinician about anything that worries you.'));
}
function pageHeart(m){
  const v=St.median(col('rhr',S.idx));
  m.append(lede(Number.isFinite(v)?`Resting heart rate: ${fmtN(v)} bpm.`:'Heart',`Measured the same way every day: the lowest 30-minute average during your main sleep, falling back to the whole day when there is no sleep record.`));
  const extra=['hrv','hrvN','stress','ready','spo2','resp','odi','skin','vo2'].filter(has).map(id=>figTrend(id));
  m.append(grid(has('rhr')&&figTrend('rhr',{span:12,h:280}),figProfile(),figDial(),figZones(),figPhase(),...extra));
}
function pageSleep(m){
  const c=S.idx,sri=sleepRegularity(c),j=socialJetlag(c),sl=St.mean(col('sleep',c)),e=St.mean(col('eff',c)),debt=St.fin(col('sleep',c.slice(-14))).reduce((a,v)=>a+(CFG.sleepTarget-v),0);
  m.append(lede(Number.isFinite(sl)?`You average ${dur(sl)} asleep, ${dur(Math.abs(CFG.sleepTarget-sl))} ${sl<CFG.sleepTarget?'under':'over'} target.`:'Sleep'));
  const stat=(l,v,d)=>el('div',{class:'sig'},el('div',{class:'l'},l),el('div',{class:'v'},v),el('div',{class:'d'},d));
  m.append(el('div',{class:'strip'},
    stat('Regularity index',Number.isFinite(sri)?fmtN(sri):'–','100 means the same sleep times every day'),
    stat('Social jetlag',j?dur(Math.abs(j.gap)):'–','Weekend against weekday mid-sleep'),
    stat('Sleep debt',dur(Math.max(0,debt)),'Shortfall over the last 14 nights'),
    stat('Efficiency',Number.isFinite(e)?`${fmtN(e)}%`:'–','Share of the night spent asleep'),
    stat('Usual bedtime',fmtM('bed',St.median(col('bed',c))),'Median'),
    stat('Usual wake time',fmtM('wakeT',St.median(col('wakeT',c))),'Median')));
  const boxC=el('div',{class:'ctrl'},el('span',null,'Show'),pick(metricOpts(i=>MI[i].g==='Sleep'),UI.boxS||'sleep',v=>{UI.boxS=v;render()},'Weekday metric'));
  m.append(grid(figActogram(),figStages(),figNight(),figBox(UI.boxS||'sleep',{controls:boxC}),
    has('bed')&&figTrend('bed',{noAnom:true,sub:'Bedtime for the main sleep each night.'}),has('wakeT')&&figTrend('wakeT',{noAnom:true,sub:'Wake time for the main sleep.'}),
    has('deep')&&figTrend('deep',{noAnom:true}),has('rem')&&figTrend('rem',{noAnom:true}),has('sleep')&&figTrend('sleep',{span:12,target:CFG.sleepTarget,noAnom:true})));
}
function pageActivity(m){
  const c=S.idx,st=St.mean(col('steps',c)),ws=workoutsIn();
  m.append(lede(Number.isFinite(St.median(col('steps',c)))?`${fmtN(St.median(col('steps',c)))} steps on a typical day, and ${ws.length} workout${ws.length===1?'':'s'}.`:'Activity'));
  const wt=el('div',{class:'tw'},el('table',null,el('thead',null,el('tr',null,['Date','Type','Time','Distance','Average HR','Peak HR','Calories'].map(x=>el('th',null,x)))),
    el('tbody',null,ws.slice(0,300).map(w=>{const h=workoutHr(w),d=Math.floor(w.s/DAY);return el('tr',null,[fmtDW(d),sportName(w.type),dur(w.dur),w.dist>0?`${fmtN(w.dist*kmf(),2)} ${CFG.units}`:'–',Number.isFinite(h.avg)?`${fmtN(h.avg)} bpm`:'–',Number.isFinite(h.max)?`${fmtN(h.max)} bpm`:'–',w.kcal?fmtN(w.kcal):'–'].map(x=>el('td',null,x)))}))));
  const boxC=el('div',{class:'ctrl'},el('span',null,'Show'),pick(metricOpts(i=>MI[i].g==='Activity'),UI.box,v=>{UI.box=v;render()},'Weekday metric'));
  m.append(grid(figCalendar(),figMatrix(),figBox(has(UI.box)?UI.box:'steps',{controls:boxC}),has('steps')&&figTrend('steps',{noAnom:true}),has('brisk')&&figTrend('brisk',{noAnom:true,sub:'Minutes at 100 steps or more, a common marker of moderate effort.'}),figLoad(),figAcwr(),figMix(),figEconomy()));
  if(ws.length)m.append(el('h2',{class:'sec'},'Workouts'),wt);
}
function pageRelations(m){
  m.append(lede('How your measures move together.','Sleep belongs to the date you woke up, so “today’s sleep” is the night before. To test whether something during the day affects that night, use a lag of one day.'));
  m.append(grid(figCorr(),el('div',{class:'c5'},el('h3',null,'Reading these results'),el('p',{class:'muted'},'With many pairs, some look strong by luck. Each p-value here is adjusted for how many pairs were tested and for how similar neighbouring days are, which makes it stricter than the usual calculation.'),el('p',{class:'muted'},'A correlation can run either way, or both measures can follow a third thing such as work stress or the weather.')),figScatter(),figLag(),figForest()));
}
function pageRecords(m){
  const cols=['sleep','rhr','steps','brisk','hrv','stress','trimp','weight'].filter(has);
  const rows=S.idx.slice();const k=UI.sortK,dirn=UI.sortD;
  rows.sort((a,b)=>{const p=k==='date'?a:R.c[k][a],q=k==='date'?b:R.c[k][b];return((Number.isFinite(p)?p:-1e12)-(Number.isFinite(q)?q:-1e12))*dirn});
  m.append(lede('Every day in this selection.','Tag days to compare them on the Relations page. Exports below are not encrypted.'));
  const csv=()=>{const ids=R.avail,lines=[['date',...ids,'tags'].join(',')];for(const i of S.idx.slice().sort((a,b)=>a-b))lines.push([ds(R.dn[i]),...ids.map(id=>Number.isFinite(R.c[id][i])?+R.c[id][i].toFixed(2):''),`"${(D.tags.get(R.dn[i])||[]).join('; ').replace(/"/g,'""')}"`].join(','));saveFile(`zeitgeber-days-${ds(F.from)}-${ds(F.to)}.csv`,new Blob([lines.join('\n')],{type:'text/csv'}));toast('CSV saved. It is not encrypted.')};
  m.append(el('div',{class:'row'},el('button',{class:'btn',type:'button',onclick:csv},'Export CSV'),el('span',{class:'muted small'},'Tag list:'),CFG.tagList.map(t=>el('span',{class:'tag'},t)),
    el('input',{type:'text',placeholder:'New tag','aria-label':'New tag',onchange:e=>{const v=e.target.value.trim();if(v&&!CFG.tagList.includes(v)){CFG.tagList.push(v);saveCfg();render()}}})));
  const th=(l,key)=>el('th',{class:'sort','aria-sort':k===key?(dirn>0?'ascending':'descending'):'none',onclick:()=>{if(UI.sortK===key)UI.sortD*=-1;else{UI.sortK=key;UI.sortD=-1}render()}},l+(k===key?(dirn>0?' ▲':' ▼'):''));
  m.append(el('div',{class:'tw'},el('table',null,el('thead',null,el('tr',null,th('Date','date'),cols.map(id=>th(MI[id].l,id)),el('th',null,'Tags'))),
    el('tbody',null,rows.slice(0,400).map(i=>{const d=R.dn[i],tg=D.tags.get(d)||[];
      return el('tr',null,el('td',null,fmtDW(d)),cols.map(id=>el('td',null,fmtM(id,R.c[id][i]))),
        el('td',null,tg.map(t=>el('span',{class:'tag'},t,el('button',{type:'button','aria-label':`Remove ${t}`,onclick:()=>{const n=tg.filter(x=>x!==t);n.length?D.tags.set(d,n):D.tags.delete(d);dirty.add('tags:0');persist();render()}},'×'))),
          pick([['','Add tag'],...CFG.tagList.filter(t=>!tg.includes(t)).map(t=>[t,t])],'',v=>{if(v){D.tags.set(d,[...tg,v]);dirty.add('tags:0');persist();render()}},'Add tag')))})))));
  $('.tw',m).style.maxHeight='68vh';
}
function askDialog({title,body,fields,ok='Continue',danger=false}){
  return new Promise(res=>{
    const inputs=fields.map(f=>el('input',{type:f.type||'password',autocomplete:'off','aria-label':f.label}));
    const err=el('div',{class:'err'});
    const d=el('dialog',null,el('form',{class:'stack',onsubmit:e=>{e.preventDefault();const v=inputs.map(i=>i.value);const m=fields.reduce((a,f,i)=>a||(f.check&&f.check(v[i],v)),null);if(m){err.textContent=m;return}d.close();d.remove();res(v)}},
      el('h2',null,title),body?el('p',null,body):null,fields.map((f,i)=>el('label',{class:'f'},f.label,inputs[i])),err,
      el('div',{class:'row'},el('button',{class:danger?'btn danger':'btn primary',type:'submit'},ok),el('button',{class:'btn',type:'button',onclick:()=>{d.close();d.remove();res(null)}},'Cancel'))));
    document.body.append(d);d.showModal();inputs[0]&&inputs[0].focus();
  });
}
async function doImport(files,status){
  busy++;
  try{
    status.replaceChildren('Reading files…');
    const{files:texts,backup}=await readImportFiles(files,async(name,again)=>{
      const r=await askDialog({title:'This export has a password',body:again?'That password did not open the file. Try again.':`Enter the password Zepp gave you for ${name}. It is used only to open the file.`,fields:[{label:'Export password',type:'text'}],ok:'Open file'});
      return r?r[0]:null});
    if(backup){status.replaceChildren('Backups are restored from the Vault page.');return}
    if(!texts.length){status.replaceChildren('No CSV files found. Choose the ZIP from Zepp, or the CSV files inside it.');return}
    if(CFG.sample){clearData();CFG.sample=false;dirty.add('cfg:0');for(const y of await sampleBuckets())await Vault.del(y);$('.banner')?.remove()}
    await tick();
    const rep=ingestExport(texts);
    await persist();rebuild();applyPreset();
    D.log.unshift({t:Date.now(),k:'import',a:rep.added});D.log=D.log.slice(0,30);dirty.add('log:0');await persist();
    status.replaceChildren(importReport(rep));
    toast(`Imported ${fmtN(rep.added.hr)} heart rate readings and ${rep.added.sleep} sleep records.`);
  }catch(e){console.error(e);status.replaceChildren(el('span',{class:'no'},e.message==='corrupt'?'This ZIP appears to be damaged.':e.message))}
  finally{busy--}
}
async function sampleBuckets(){const y=new Set();for(let k=new Date().getUTCFullYear();k>=new Date().getUTCFullYear()-2;k--)for(const b of['hr','st','sg','days'])y.add(`${b}:${k}`);return[...y,'sleeps','workouts','tags']}
function importReport(r){
  const a=r.added;
  return el('div',{class:'stack'},
    el('ul',{class:'log'},Object.entries({'Heart rate readings':a.hr,'Minute step counts':a.steps,'Sleep records':a.sleep,'Daily activity rows':a.activity,Workouts:a.workouts,'Body measurements':a.body}).map(([l,v])=>el('li',null,el('span',{class:v?'ok':'na'},v?'✓':'–'),`${l}: ${fmtN(v)}`))),
    r.notes.map(n=>el('p',{class:'small'},n)),
    r.skipped.length?el('details',null,el('summary',null,`${r.skipped.length} file${r.skipped.length>1?'s':''} not recognised`),el('ul',{class:'small'},r.skipped.map(s=>el('li',null,`${s.name}: ${s.head}`)))):null,
    el('div',null,el('button',{class:'btn primary',type:'button',onclick:()=>{UI.view='overview';render();scrollTo(0,0)}},'See my data')));
}
function pageSources(m){
  m.append(lede('Add your data.','The easiest way is to export it from your Zepp account and import the file here. Cloud sync and live heart rate are optional extras.'));
  const status=el('div',{class:'small',role:'status'}),input=el('input',{type:'file',multiple:true,accept:'.zip,.csv,application/zip,text/csv',hidden:true,onchange:e=>doImport([...e.target.files],status)});
  const drop=el('div',{class:'drop'},el('p',null,'Drop your Zepp export here'),el('button',{class:'btn primary',type:'button',onclick:()=>input.click()},'Choose ZIP or CSV files'),input);
  drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('over')});
  drop.addEventListener('dragleave',()=>drop.classList.remove('over'));
  drop.addEventListener('drop',async e=>{e.preventDefault();drop.classList.remove('over');
    const walk=en=>new Promise(ok=>{if(en.isFile)en.file(f=>ok([f]),()=>ok([]));else{const r=en.createReader(),all=[];const next=()=>r.readEntries(async b=>{if(!b.length)return ok((await Promise.all(all.map(walk))).flat());all.push(...b);next()},()=>ok([]));next()}});
    const roots=[...e.dataTransfer.items].map(i=>i.webkitGetAsEntry&&i.webkitGetAsEntry()).filter(Boolean);
    doImport(roots.length?(await Promise.all(roots.map(walk))).flat():[...e.dataTransfer.files],status)});
  const left=el('section',{class:'stack'},el('h2',null,'Export from your Zepp account'),
    el('ol',{class:'steps small'},
      el('li',null,'Sign in to your ',el('a',{href:'https://user.huami.com/privacy2/index.html',target:'_blank',rel:'noopener noreferrer'},'Zepp account page'),' and choose Export data. Don’t choose Clear data or Delete account.'),
      el('li',null,'Keep every data type ticked, and pick dates from your first day with the watch to today.'),
      el('li',null,'When the export is ready, download the ZIP and keep its password. Zepp supplies the password with the export.'),
      el('li',null,'Drop the ZIP below. You can add overlapping exports; duplicates merge.')),
    drop,status);
  const H=[['api-mifit-de2.zepp.com','Europe (de2)'],['api-mifit-us2.zepp.com','Americas (us2)'],['api-mifit-us3.zepp.com','Americas (us3)'],['api-mifit.zepp.com','Global'],['api-mifit-sg2.zepp.com','Asia Pacific (sg2)'],['api-mifit-cn3.zepp.com','China (cn3)']];
  const fld=(l,k,t='text',ph='')=>el('label',{class:'f'},l,el('input',{type:t,value:CFG[k]||'',placeholder:ph,autocomplete:'off',onchange:e=>{CFG[k]=e.target.value.trim();saveCfg()}}));
  const log=el('ul',{class:'log'}),msg=el('div',{class:'small',role:'status'});
  const relayBox=el('details',null,el('summary',null,'Run the local relay'),
    el('p',{class:'small'},'Zepp’s servers may refuse direct requests from a web page. This small script runs on your computer, forwards requests only to Zepp, and accepts them only with your private key. It needs Python 3 and nothing else, so it runs on a computer and not on a phone.'),
    el('div',{class:'row'},el('button',{class:'btn small',type:'button',onclick:async()=>{if(!CFG.relayKey){CFG.relayKey=toB64(crypto.getRandomValues(new Uint8Array(24))).replace(/[+/=]/g,'x');await saveCfg()}CFG.relay='http://127.0.0.1:8765';await saveCfg();saveFile('zeitgeber_relay.py',new Blob([RELAY_PY(CFG.relayKey)],{type:'text/x-python'}));toast('Relay script saved and turned on. Run it with: python3 zeitgeber_relay.py');render()}},'Download relay script'),
      CFG.relay?el('button',{class:'btn small',type:'button',onclick:async()=>{CFG.relay='';await saveCfg();render()}},'Stop using the relay'):null),
    CFG.relay?el('p',{class:'small'},`Requests go through ${CFG.relay}.`):null);
  const sync=async()=>{
    if(!CFG.token||!CFG.userId){msg.replaceChildren('Add your token and user ID first.');return}
    log.replaceChildren();const rows=new Map();
    if(CFG.sample){clearData();CFG.sample=false;dirty.add('cfg:0');for(const y of await sampleBuckets())await Vault.del(y);$('.banner')?.remove()}
    busy++;
    const res=await Cloud.sync(({label,state,c,err})=>{
      let li=rows.get(label);if(!li){li=el('li');rows.set(label,li);log.append(li)}
      const[i,t,cl]={run:['…',`${label}: fetching`,'na'],ok:['✓',`${label}: ${fmtN(c)} records`,'ok'],empty:['–',`${label}: nothing returned`,'na'],err:['×',`${label}: ${err}`,'no'],auth:['×',`${label}: token refused`,'no'],blocked:['×',`${label}: connection blocked`,'no']}[state];
      li.replaceChildren(el('span',{class:cl},i),t);
    });
    busy--;await persist();rebuild();if(R.n)applyPreset();
    if(res.auth)msg.replaceChildren('Zepp refused the token. Tokens expire after about 30 days, and each works only on its own region. Copy a fresh one, or try another region.');
    else if(res.blocked){msg.replaceChildren('Zepp’s servers did not accept a request from this page. Use the local relay below, then sync again.');relayBox.open=true}
    else{msg.replaceChildren(`Synced at ${new Date().toLocaleTimeString()}.`)}
  };
  const right=el('section',{class:'stack'},el('h2',null,'Zepp cloud sync (optional)'),
    el('p',{class:'small'},'Most people don’t need this: the export above gives you your data with no token or browser cookies. Use cloud sync only if you want regular updates and are happy to copy a token by hand.'),
    el('p',{class:'small'},'This uses Zepp’s private API, found by community developers. It can change or stop working at any time, and using it may not be covered by Zepp’s terms. Your Zepp password is never needed.'),
    el('details',null,el('summary',null,'Find your token'),el('ol',{class:'steps small'},el('li',null,'Open user.huami.com/privacy2/index.html in a desktop browser and sign in.'),el('li',null,'Press F12, open Application (Storage in Firefox), then Cookies, then user.huami.com.'),el('li',null,'Copy the values of apptoken and userid here.'))),
    el('div',{class:'formgrid'},fld('User ID','userId'),fld('App token','token','password'),
      el('label',{class:'f'},'Account region',pick(H,CFG.host,v=>{CFG.host=v;saveCfg()},'Region')),
      el('label',{class:'f'},'History on first sync (days)',el('input',{type:'number',min:7,max:1825,value:CFG.backfill,onchange:e=>{CFG.backfill=+e.target.value;saveCfg()}}))),
    el('label',{class:'stacklabel'},el('input',{type:'checkbox',checked:CFG.autoSync,onchange:e=>{CFG.autoSync=e.target.checked;saveCfg()}}),'Sync each time I unlock'),
    el('div',{class:'row'},el('button',{class:'btn primary',type:'button',onclick:e=>{e.target.disabled=true;sync().finally(()=>{e.target.disabled=false})}},'Sync now'),
      el('button',{class:'btn',type:'button',onclick:async()=>{msg.replaceChildren('Testing…');const r=await Cloud.test();msg.replaceChildren(r.ok?`Connected. Zepp returned ${r.n} day records.`:r.auth?'Zepp refused the token. Copy a fresh one or change region.':r.blocked?'Blocked before reaching Zepp. Use the local relay below.':r.msg)}},'Test connection'),
      CFG.lastSync?el('span',{class:'muted small'},`Last synced ${CFG.lastSync}`):null),msg,log,relayBox);
  m.append(el('div',{class:'src'},left,right));
  const liveWrap=el('section',{class:'stack'});
  const big=el('div',{class:'live'},'–'),info=el('div',{class:'small muted'}),save=el('button',{class:'btn',type:'button',disabled:true},'Stop and save');
  let session=null;
  const cn=el('button',{class:'btn primary',type:'button',onclick:async()=>{
    try{await Live.connect(s=>{session=s;big.textContent=s.v[s.v.length-1];info.textContent=`${s.name}, ${s.v.length} readings${s.rr.length>10?`, beat-to-beat variation ${fmtN(Live.rmssd(s.rr))} ms`:''}`;save.disabled=false},s=>{info.textContent='Disconnected.';session=s});info.textContent='Connected. Waiting for readings.'}
    catch(e){info.textContent=e.name==='NotFoundError'?'No device chosen.':`Could not connect: ${e.message}`}}},'Connect to watch');
  save.addEventListener('click',async()=>{const s=Live.stop()||session;if(Live.save(s)){await persist();rebuild();applyPreset();toast('Live session saved to your vault.')}else toast('Session was too short to save.');save.disabled=true;big.textContent='–'});
  liveWrap.append(el('h2',null,'Live from the watch'),Live.supported()?
    el('div',{class:'stack'},el('p',{class:'small'},'Turn on Heart Rate Push on the watch (Zepp OS 3 or newer; some models broadcast only during a workout). It uses the standard Bluetooth heart rate service in Chrome or Edge on a desktop or Android.'),el('div',{class:'row'},cn,save),big,info):
    el('p',{class:'small muted'},'This browser has no Web Bluetooth. Chrome or Edge on a desktop or Android can stream live heart rate.'));
  m.append(el('div',null,liveWrap));
  $$('section',m).forEach(s=>s.style.marginBottom='1.6rem');
}
async function pageVault(m){
  m.append(lede('Your vault.','Everything Zeitgeber stores sits encrypted in this browser’s IndexedDB. Nothing leaves this device unless you press Sync, and then only requests to Zepp.'));
  const set=(k,v)=>{CFG[k]=v;saveCfg();rebuild();applyPreset();};
  const fld=(l,k,attrs={},hint)=>el('label',{class:'f'},l,el('input',{type:'number',value:CFG[k]||'',...attrs,onchange:e=>{set(k,+e.target.value||0);render()}}),hint?el('span',{class:'small muted'},hint):null);
  const prefs=el('section',{class:'stack'},el('h2',null,'Preferences'),el('div',{class:'formgrid'},
    el('label',{class:'f'},'Appearance',pick([['auto','Match my device'],['light','Day'],['dark','Night']],CFG.theme,v=>{CFG.theme=v;saveCfg();applyTheme();render()},'Appearance')),
    el('label',{class:'f'},'Distance',pick([['km','Kilometres'],['mi','Miles']],CFG.units,v=>{set('units',v);render()},'Units')),
    fld('Sleep target (minutes)','sleepTarget',{min:240,max:720}),
    fld('Lock after idle (minutes)','idle',{min:1,max:120}),
    fld('Maximum heart rate','hrMax',{min:100,max:240},`In use: ${R.hrMax} bpm`),
    fld('Resting heart rate override','hrRest',{min:25,max:120},`In use: ${R.hrRest} bpm`),
    el('label',{class:'f'},'Training impulse formula',pick([['m','Banister, male coefficients'],['f','Banister, female coefficients']],CFG.sex,v=>{set('sex',v);render()},'Training formula')),
    el('label',{class:'f'},'Time zone for cloud data',el('input',{type:'text',value:CFG.tz,onchange:e=>{try{new Intl.DateTimeFormat('en',{timeZone:e.target.value});set('tz',e.target.value)}catch(x){toast('That is not a valid time zone name, for example Europe/London.')}}}))));
  const usage=await Vault.usage();
  const restore=el('input',{type:'file',hidden:true,onchange:async e=>{
    const f=e.target.files[0];if(!f)return;
    const r=await askDialog({title:'Replace this vault?',body:'Restoring deletes everything here and replaces it with the backup. After the page reloads, enter the passphrase of the backup.',fields:[{label:'Type REPLACE to confirm',type:'text',check:v=>v==='REPLACE'?null:'Type REPLACE exactly.'}],ok:'Replace vault',danger:true});
    if(!r)return;try{dirty.clear();await Vault.restore(await f.text());await lockNow()}catch(x){toast(x.message)}}});
  const sec=el('section',{class:'stack'},el('h2',null,'Security'),
    el('ul',{class:'small'},
      el('li',null,`Your passphrase runs through PBKDF2-SHA-256 ${fmtN(Vault.ITER)} times to unlock a random 256-bit master key.`),
      el('li',null,'Every record is encrypted with AES-256-GCM and its own random nonce. Tampering makes decryption fail.'),
      el('li',null,'Record names are keyed hashes, so the database shows no dates, types or sizes by name.'),
      el('li',null,'Keys are held as non-extractable browser keys and are forgotten when you lock.'),
      el('li',null,'A strict content security policy blocks every outside script and connection except Zepp and a relay on this computer.')),
    el('p',{class:'small muted'},'There is no recovery. If you lose the passphrase, the data is gone. Encryption protects data at rest; it cannot protect you from malware or browser extensions running while the vault is open. Saved images and CSV files are not encrypted.'),
    el('p',{class:'small muted'},'The vault lives in this browser on this device, and each browser keeps its own. Clearing site data removes it. Download a backup before you do, and use the backup to move your data to another device.'),
    usage.usage?el('p',{class:'small muted'},`Browser storage in use: ${fmtN(usage.usage/1048576,1)} MB. Last backup: ${CFG.lastBackup?new Date(CFG.lastBackup).toLocaleDateString():'never'}.`):null,
    el('div',{class:'row'},
      el('button',{class:'btn primary',type:'button',onclick:async()=>{await persist();const t=await Vault.backup();saveFile(`zeitgeber-${ds(Math.floor(Date.now()/DAY))}.zgvault`,new Blob([t],{type:'application/octet-stream'}));CFG.lastBackup=Date.now();await saveCfg();toast('Encrypted backup saved.')}},'Download encrypted backup'),
      el('button',{class:'btn',type:'button',onclick:()=>restore.click()},'Restore a backup'),restore,
      el('button',{class:'btn',type:'button',onclick:async()=>{
        const r=await askDialog({title:'Change passphrase',fields:[{label:'Current passphrase'},{label:'New passphrase',check:v=>v.length<12?'Use at least 12 characters.':null},{label:'Repeat new passphrase',check:(v,a)=>v!==a[1]?'The two new passphrases differ.':null}],ok:'Change passphrase'});
        if(!r)return;toast(await Vault.rekey(r[0],r[1])?'Passphrase changed.':'The current passphrase was wrong.')}},'Change passphrase'),
      el('button',{class:'btn danger',type:'button',onclick:async()=>{
        const r=await askDialog({title:'Erase everything?',body:'This permanently deletes the vault from this browser.',fields:[{label:'Type ERASE to confirm',type:'text',check:v=>v==='ERASE'?null:'Type ERASE exactly.'}],ok:'Erase vault',danger:true});
        if(r){dirty.clear();await Vault.wipe();await lockNow()}}},'Erase vault')));
  m.append(el('div',{class:'src'},el('div',{class:'stack'},installBlock(),prefs),sec));
}
function render(){
  hideTip();
  for(const f of FIGS)f.ro.disconnect();FIGS.length=0;
  const m=$('#main');if(!m)return;
  const ae=document.activeElement,fk=ae&&ae.closest?.('#filters')?ae.textContent:null;
  m.replaceChildren();
  $$('#rail button[data-v]').forEach(b=>{if(b.dataset.v===UI.view){b.setAttribute('aria-current','page');if(innerWidth<=760)b.scrollIntoView({inline:'center',block:'nearest'})}else b.removeAttribute('aria-current')});
  if(CFG.sample)m.append(el('div',{class:'banner'},'You are viewing made-up sample data.',el('button',{class:'link',type:'button',onclick:async()=>{clearData();CFG.sample=false;dirty.add('cfg:0');for(const y of await sampleBuckets())await Vault.del(y);await persist();rebuild();render()}},'Remove it')));
  if(UI.view==='sources'){pageSources(m);return}
  if(UI.view==='vault'){pageVault(m);return}
  if(!R.n){m.append(nodata());return}
  applyPreset();
  S.idx=selection();S.prev=F.compare?prevSelection():[];
  m.append(filterBar());
  ({overview:pageOverview,heart:pageHeart,sleep:pageSleep,activity:pageActivity,relations:pageRelations,records:pageRecords})[UI.view](m);
  if(fk){const b=$$('#filters button').find(x=>x.textContent===fk);b&&b.focus()}
}
async function boot2(){
  rebuild();applyTheme();shell();render();
}
function lockArt(cv){
  const r=cv.getBoundingClientRect(),w=Math.max(200,Math.floor(r.width/3)),h=Math.max(80,Math.floor(r.height/3));cv.width=w;cv.height=h;
  const g=cv.getContext('2d'),img=g.createImageData(w,h);let s=7;const rnd=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296};
  for(let x=0;x<w;x++){const drift=Math.sin(x/w*7)*h*.05+(rnd()-.5)*h*.03,c0=h*.5+drift,hw=h*(.15+.02*rnd());
    for(let y=0;y<h;y++){const q=Math.abs(y-c0),night=q<hw,v=night?.06+.05*rnd():.32+.16*Math.cos((y/h)*6.28)+(rnd()<.03?.5:0)+rnd()*.1,k=EMBER[Math.round(255*clamp(v,0,1))],p=(y*w+x)*4;img.data[p]=k[0];img.data[p+1]=k[1];img.data[p+2]=k[2];img.data[p+3]=255}}
  g.putImageData(img,0,0);
}
async function lockScreen(){
  const app=$('#app'),exists=await Vault.exists();
  const err=el('div',{class:'err',role:'alert'}),cv=el('canvas',{'aria-hidden':'true'});
  const p1=el('input',{type:'password',autocomplete:exists?'current-password':'new-password','aria-label':'Passphrase',placeholder:'Passphrase'}),p2=el('input',{type:'password',autocomplete:'new-password','aria-label':'Repeat passphrase',placeholder:'Repeat passphrase'});
  const btn=el('button',{class:'btn primary',type:'submit'},exists?'Unlock':'Create vault');
  const restore=el('input',{type:'file',hidden:true,onchange:async e=>{const f=e.target.files[0];if(!f)return;try{await Vault.restore(await f.text());await lockScreen()}catch(x){err.textContent=x.message}}});
  const submit=async e=>{
    e.preventDefault();err.textContent='';
    if(!exists){if(p1.value.length<12){err.textContent='Use at least 12 characters. A short sentence works well.';return}if(p1.value!==p2.value){err.textContent='The two passphrases differ.';return}}
    btn.disabled=true;btn.textContent=exists?'Unlocking…':'Creating…';await tick();
    try{
      if(exists){
        if(!await Vault.unlock(p1.value)){err.textContent='That passphrase did not open the vault.';btn.disabled=false;btn.textContent='Unlock';p1.select();return}
        await loadAll();
      }else{await Vault.create(p1.value);await saveCfg()}
      p1.value=p2.value='';unlocked=true;lastActive=Date.now();startIdleWatch();await boot2();
      if(CFG.autoSync&&CFG.token&&CFG.userId&&!CFG.sample){toast('Syncing with Zepp…');const r=await Cloud.sync(()=>{});await persist();rebuild();render();toast(r.auth?'Sync failed: the token has expired.':r.blocked?'Sync failed: connection blocked. Open Sources for the relay.':'Sync finished.')}
    }catch(x){console.error(x);err.textContent='The vault could not be read. It may be damaged. Restore a backup if you have one.';btn.disabled=false;btn.textContent='Unlock'}
  };
  app.replaceChildren(el('div',{id:'lock'},el('div',{class:'lockart'},cv),
    el('form',{class:'lockform',onsubmit:submit},el('h1',null,'Zeitgeber'),
      el('p',null,exists?'Enter your passphrase to open your health data.':'Private analytics for your Amazfit watch. Choose a passphrase to create an encrypted vault in this browser.'),
      p1,exists?null:p2,err,btn,
      exists?null:el('p',{class:'small muted'},'There is no reset. Without this passphrase the data cannot be recovered.'),
      el('p',{class:'small'},el('button',{class:'link',type:'button',onclick:()=>restore.click()},'Restore from a backup')),restore)));
  lockArt(cv);p1.focus();
}
(async()=>{
  applyTheme();setupPWA();
  try{await document.fonts.load('12px "Zg Text"');await document.fonts.load('600 12px "Zg Display"')}catch(e){}
  matchMedia('(prefers-color-scheme:dark)').addEventListener('change',()=>{if(CFG.theme==='auto'){applyTheme();if($('#main'))render()}});
  if(!window.indexedDB||!crypto.subtle){$('#app').append(el('p',null,'This browser lacks IndexedDB or Web Crypto. Open the file in a current desktop browser.'));return}
  await lockScreen();
  /*TEST_HOOK*/
})();
