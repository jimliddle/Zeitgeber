'use strict';
/* Zeitgeber: encrypted, offline analytics for Amazfit / Zepp data. */
const DAY=864e5,MIN=6e4;
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
function el(tag,props,...kids){
  const n=document.createElement(tag);
  if(props)for(const[k,v]of Object.entries(props)){
    if(v==null||v===false)continue;
    if(k==='class')n.className=v;
    else if(k.startsWith('on'))n.addEventListener(k.slice(2),v);
    else if(k in n&&k!=='list'&&k!=='form')n[k]=v;
    else n.setAttribute(k,v===true?'':v);
  }
  for(const c of kids.flat(9)){if(c==null||c===false)continue;n.append(c.nodeType?c:document.createTextNode(String(c)))}
  return n;
}
const dn=s=>Math.floor(Date.UTC(+s.slice(0,4),+s.slice(5,7)-1,+s.slice(8,10))/DAY);
const ds=n=>new Date(n*DAY).toISOString().slice(0,10);
const wd=n=>(((n+3)%7)+7)%7; /* Monday = 0 */
const WD=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const dparts=n=>{const d=new Date(n*DAY);return{y:d.getUTCFullYear(),m:d.getUTCMonth(),d:d.getUTCDate()}};
const fmtD=n=>{const p=dparts(n);return`${p.d} ${MON[p.m]} ${p.y}`};
const fmtDS=n=>{const p=dparts(n);return`${p.d} ${MON[p.m]}`};
const fmtDW=n=>`${WD[wd(n)]} ${fmtD(n)}`;
const pad=x=>String(x).padStart(2,'0');
const hm=m=>{m=((Math.round(m)%1440)+1440)%1440;return`${pad(Math.floor(m/60))}:${pad(m%60)}`};
const dur=m=>{if(!isFinite(m))return'–';const s=m<0?'−':'';m=Math.abs(Math.round(m));return s+(m>=60?`${Math.floor(m/60)}h ${pad(m%60)}m`:`${m}m`)};
const fmtN=(v,d=0)=>isFinite(v)?v.toLocaleString('en-GB',{maximumFractionDigits:d,minimumFractionDigits:d}):'–';
const sign=(v,d=0,u='')=>isFinite(v)?(v>0?'+':v<0?'−':'±')+fmtN(Math.abs(v),d)+u:'–';
const clamp=(x,a,b)=>x<a?a:x>b?b:x;
const num=v=>{if(v==null||v===''||v==='null')return NaN;const n=+v;return Number.isFinite(n)?n:NaN};
const tick=()=>new Promise(r=>setTimeout(r));
const utf8=s=>new TextEncoder().encode(s);
const unutf8=b=>new TextDecoder().decode(b);
const toB64=u=>{let s='';for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode.apply(null,u.subarray(i,i+32768));return btoa(s)};
const fromB64=s=>{const b=atob(s.replace(/-/g,'+').replace(/_/g,'/'));const u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u};
const gzip=async u=>new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
const gunzip=async u=>new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
async function saveFile(name,blob){
  const installed=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
  if(installed&&matchMedia('(pointer: coarse)').matches&&navigator.canShare){
    const f=new File([blob],name,{type:blob.type||'application/octet-stream'});
    if(navigator.canShare({files:[f]})){try{await navigator.share({files:[f]});return}catch(e){if(e.name==='AbortError')return}}
  }
  const a=el('a',{href:URL.createObjectURL(blob),download:name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4e3);
}
function toast(msg,ms=4200){const d=el('div',null,msg);$('#toast').append(d);setTimeout(()=>d.remove(),ms)}

/* In-memory state. It exists only while the vault is unlocked; locking reloads the page. */
const CFG_DEFAULT={theme:'auto',units:'km',tz:Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC',idle:10,hrMax:0,hrRest:0,sleepTarget:450,sex:'m',birth:'',autoSync:false,
  host:'api-mifit-de2.zepp.com',userId:'',token:'',relay:'',relayKey:'',lastSync:'',backfill:365,sample:false,lastBackup:0,tagList:['Alcohol','Travel','Ill','Late meal','Rest day']};
const CFG=structuredClone(CFG_DEFAULT);
const D={hr:new Map(),st:new Map(),sg:new Map(),days:new Map(),sleeps:new Map(),workouts:new Map(),tags:new Map(),live:[],log:[]};
const dirty=new Set();
const touch=(kind,n)=>dirty.add(`${kind}:${dparts(n).y}`);
function setDay(n,o){
  let r=D.days.get(n);if(!r){r={};D.days.set(n,r)}
  for(const[k,v]of Object.entries(o))if(v!=null&&!(typeof v==='number'&&!Number.isFinite(v)))r[k]=v;
  touch('days',n);
}
const hrOf=n=>{let a=D.hr.get(n);if(!a){a=new Uint8Array(1440);D.hr.set(n,a)}touch('hr',n);return a};
const stOf=n=>{let a=D.st.get(n);if(!a){a=new Uint16Array(1440);D.st.set(n,a)}touch('st',n);return a};
const sgOf=n=>{let a=D.sg.get(n);if(!a){a=new Uint8Array(1440);D.sg.set(n,a)}touch('sg',n);return a};
/* The same sleep or workout can arrive from an export and from the cloud with slightly different bounds. */
function upsertSleep(s){
  for(const[k,o]of D.sleeps){const ov=Math.min(o.e,s.e)-Math.max(o.s,s.s);if(ov>0&&ov>=.5*Math.min(o.e-o.s,s.e-s.s))D.sleeps.delete(k)}
  D.sleeps.set(s.id,s);
}
function upsertWorkout(w){
  for(const[k,o]of D.workouts)if(Math.abs(o.s-w.s)<3*MIN&&Math.abs(o.dur-w.dur)<3){w={...o,...w};D.workouts.delete(k)}
  D.workouts.set(w.id,w);
}
const STAGE={LIGHT:1,DEEP:2,REM:3,WAKE:4,AWAKE:4};
const STAGE_NAME=['','Light','Deep','REM','Awake'];
/* Convert an instant to floating local wall-clock milliseconds in a named time zone. */
const tzCache=new Map();
function tzOffsetMin(ms,tz){
  const key=tz+'|'+Math.floor(ms/36e5);
  if(tzCache.has(key))return tzCache.get(key);
  let off=0;
  try{
    const f=new Intl.DateTimeFormat('en-GB',{timeZone:tz,hourCycle:'h23',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',second:'numeric'});
    const p={};for(const x of f.formatToParts(ms))p[x.type]=+x.value;
    off=Math.round((Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second)-Math.floor(ms/1e3)*1e3)/MIN);
  }catch(e){}
  tzCache.set(key,off);return off;
}
const toLocal=(ms,tz=CFG.tz)=>ms+tzOffsetMin(ms,tz)*MIN;
