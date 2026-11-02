/* Cloud sync through Zepp's unofficial API. It reads with a token you copy from your own session
   and never asks for your password. Endpoints come from open-source clients and may change without notice. */
const RELAY_PY=key=>`#!/usr/bin/env python3
"""Zeitgeber local relay. Forwards GET requests from your browser to Zepp's API.
Listens on this computer only and refuses anything that lacks your relay key."""
import http.server, re, urllib.error, urllib.request

KEY = "${key}"
PORT = 8765
HOST_OK = re.compile(r"^api-mifit[a-z0-9-]*\\.(zepp|huami)\\.com$")
FORWARD = ("apptoken", "appname", "appplatform", "v", "vn", "cv", "vb", "lang", "country", "timezone")

class Relay(http.server.BaseHTTPRequestHandler):
    def cors(self):
        self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin", "null"))
        self.send_header("Access-Control-Allow-Headers", "x-relay-key, " + ", ".join(FORWARD))
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Vary", "Origin")

    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.end_headers()

    def do_GET(self):
        parts = self.path.lstrip("/").split("/", 1)
        if self.headers.get("x-relay-key") != KEY or len(parts) != 2 or not HOST_OK.match(parts[0]):
            self.send_response(403); self.cors(); self.end_headers(); return
        headers = {k: self.headers[k] for k in FORWARD if self.headers.get(k) is not None}
        headers["User-Agent"] = "Zepp/10.2.5"
        request = urllib.request.Request("https://" + parts[0] + "/" + parts[1], headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=60) as r:
                status, body = r.status, r.read()
        except urllib.error.HTTPError as e:
            status, body = e.code, e.read()
        except Exception as e:
            status, body = 502, str(e).encode()
        self.send_response(status); self.cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body))); self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass

print("Zeitgeber relay running on http://127.0.0.1:%d. Press Ctrl+C to stop." % PORT)
http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Relay).serve_forever()
`;
const Cloud=(()=>{
  class Auth extends Error{}
  class Blocked extends Error{}
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  let seq=0;
  async function get(path,params={}){
    const q=new URLSearchParams({...params,r:`ZG-${Date.now().toString(16)}-${++seq}`}).toString();
    const headers={apptoken:CFG.token,appname:'com.huami.midong',appplatform:'web',v:'2.0',lang:'en'};
    const base=CFG.relay?`${CFG.relay.replace(/\/$/,'')}/${CFG.host}`:`https://${CFG.host}`;
    if(CFG.relay)headers['x-relay-key']=CFG.relayKey;
    for(let a=0;;a++){
      let res;
      try{res=await fetch(`${base}${path}?${q}`,{headers,credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store'})}
      catch(e){if(a<1){await sleep(600);continue}throw new Blocked(e.message)}
      if(res.status===401||res.status===403)throw new Auth(`HTTP ${res.status}`);
      if(res.status===429||res.status>=500){if(a<3){await sleep(1200*2**a);continue}throw new Error(`HTTP ${res.status}`)}
      if(res.status===404)throw new Error('This endpoint is not available for your account.');
      if(!res.ok)throw new Error(`HTTP ${res.status}`);
      const j=await res.json();
      if(j&&typeof j==='object'&&!Array.isArray(j)){
        const c=String(j.code??j.status??'');
        if(/0102|token/i.test(String(j.message||''))&&c!=='1')throw new Auth(j.message);
        if('code'in j&&'data'in j){if(+j.code!==1)throw new Error(j.message||`Zepp returned code ${j.code}`);return j.data}
      }
      return j;
    }
  }
  const items=b=>{
    if(Array.isArray(b))return b;
    if(!b||typeof b!=='object')return[];
    for(const k of['items','summary','list','records','data','weightRecords'])if(Array.isArray(b[k]))return b[k];
    if(b.data&&typeof b.data==='object')return items(b.data);
    return[];
  };
  const parse=v=>{if(typeof v!=='string')return v;try{return JSON.parse(v)}catch(e){return v}};
  /* events hide their fields in value, extra or the item itself, depending on age */
  const flat=i=>{const a=parse(i.extra),b=parse(i.value);return{...i,...(a&&typeof a==='object'?a:{}),...(b&&typeof b==='object'?b:{})}};
  const when=x=>{
    const v=x.dayId??x.day??x.dateString??x.date;
    if(typeof v==='string'&&/^\d{4}-\d\d-\d\d/.test(v))return dn(v);
    let t=+(x.timestamp??x.time??x.startTime??x.updateTime);
    if(!t)return null;if(t<1e11)t*=1e3;return Math.floor(toLocal(t)/DAY);
  };
  const inr=(v,a,b)=>{const n=+v;return n>=a&&n<=b?n:undefined};
  const dated=d=>new Date(d*DAY).toISOString().slice(0,10);

  function bandDay(rec,raw){
    const n=dn(rec.date_time);
    let sum={};try{sum=JSON.parse(unutf8(fromB64(rec.summary)))}catch(e){}
    const tz=+(sum.tz??sum.tzOffset)||tzOffsetMin(n*DAY,CFG.tz)*60,stp=sum.stp||{},slp=sum.slp||{};
    if(stp.ttl!=null)setDay(n,{steps:num(stp.ttl),dist:num(stp.dis),kcal:num(stp.cal),run:num(stp.runDist)});
    if(slp.ss>0)setDay(n,{score:inr(slp.ss,1,100)});
    if(slp.rhr>0)setDay(n,{rhrV:inr(slp.rhr,25,120)});
    const stg=(slp.stage||[]).filter(x=>x&&x.stop>x.start);
    const hasStamp=slp.ed>slp.st&&slp.st>1e8;
    const total=(+slp.dp||0)+(+slp.lt||0)+(+slp.rem||0);
    if(hasStamp||stg.length){
      const prev=(n-1)*DAY,S=hasStamp?slp.st*1e3+tz*1e3:prev+stg[0].start*MIN,E=hasStamp?slp.ed*1e3+tz*1e3:prev+stg[stg.length-1].stop*MIN;
      /* stage minutes are either relative to the previous local midnight or to slp.st: keep whichever lands inside the session */
      const anchors=[prev,hasStamp?slp.st*1e3+tz*1e3:prev];
      const a=stg.length?anchors.reduce((p,c)=>Math.abs(c+stg[0].start*MIN-S)<Math.abs(p+stg[0].start*MIN-S)?c:p):prev;
      const c=[0,0,0,0,0];
      for(const x of stg){const g={4:1,5:2,8:3,11:3,7:4}[x.mode];if(!g)continue;
        for(let m=x.start;m<x.stop;m++){const t=a+m*MIN,k=Math.floor(t/DAY);sgOf(k)[Math.floor((t-k*DAY)/MIN)]=g;c[g]++}}
      if(E>S&&(c[1]+c[2]+c[3]>0||total>0))
        upsertSleep({id:S,s:S,e:E,date:Math.floor((E-1)/DAY),deep:c[2]||+slp.dp||0,light:c[1]||+slp.lt||0,rem:c[3]||+slp.rem||0,wake:c[4]||+slp.wk||0,score:inr(slp.ss,1,100)});
    }
    if(rec.data_hr){try{const b=fromB64(rec.data_hr);if(b.length>=1440)raw.push({n,b,tz:Math.round(tz/60)})}catch(e){}}
  }
  /* data_hr is described as local by some clients and UTC by others, so the alignment is tested on your nights */
  function placeHr(raw){
    if(!raw.length)return 0;
    const offs=[...new Set([0,raw[0].tz,-raw[0].tz])],sleeps=[...D.sleeps.values()].filter(x=>x.e-x.s>3*36e5);
    let best=0,bs=Infinity;
    if(sleeps.length>=3)for(const o of offs){
      const m=new Map();for(const r of raw)m.set(r.n,r.b);let sum=0,c=0;
      for(const q of sleeps)for(let t=q.s;t<q.e;t+=10*MIN){const u=t-o*MIN,n=Math.floor(u/DAY),b=m.get(n);if(b){const v=b[Math.floor((u-n*DAY)/MIN)];if(v>=25&&v<=240){sum+=v;c++}}}
      if(c>50&&sum/c<bs-.5){bs=sum/c;best=o}
    }
    let c=0;
    for(const r of raw)for(let k=0;k<1440;k++){const v=r.b[k];if(v<25||v>240)continue;
      const t=r.n*DAY+(k+best)*MIN,n=Math.floor(t/DAY);hrOf(n)[Math.floor((t-n*DAY)/MIN)]=v;c++}
    return c;
  }
  const ev2=(eventType,subType,from,to)=>get('/v2/users/me/events',{eventType,...(subType?{subType}:{}),from,to,limit:2000,reverse:1});
  const evU=(eventType,subType,from,to)=>get(`/users/${CFG.userId}/events`,{eventType,...(subType?{subType}:{}),from,to,limit:2000,reverse:1,userId:CFG.userId});
  const med=a=>{const s=a.slice().sort((x,y)=>x-y);return s[s.length>>1]};
  function streams(a,b){
    const from=a*DAY,to=(b+1)*DAY;
    const windows=f=>async()=>{let c=0;for(let w=a;w<=b;w+=30)c+=await f(w*DAY,Math.min(w+30,b+1)*DAY);return c};
    return[
      ['Sleep, steps and minute heart rate',async()=>{
        const raw=[];let c=0;
        for(let w=a;w<=b;w+=30){
          const list=items(await get('/v1/data/band_data.json',{userid:CFG.userId,from_date:dated(w),to_date:dated(Math.min(w+29,b)),query_type:'detail',byteLength:8,device_type:0}));
          for(const r of list)if(r.date_time){bandDay(r,raw);c++}
          await sleep(150);
        }
        dirty.add('sleeps:0');placeHr(raw);return c;
      }],
      ['Workouts',async()=>{
        const l=items(await get('/v1/sport/run/history.json',{userid:CFG.userId,startTrackId:0,stopTrackId:9999999999,need_sub_data:1,type:''}));
        let c=0;for(const w of l){const t=+w.trackid*1e3||+w.start_time*1e3;if(!t)continue;
          const s=toLocal(t);upsertWorkout({id:s,s,dur:(+w.run_time||0)/60,type:+w.type,dist:+w.dis||0,kcal:+w.calorie||0,hrAvg:inr(w.avg_heart_rate,30,240),hrMax:inr(w.max_heart_rate,30,240),src:'cloud'});c++}
        dirty.add('workouts:0');return c;
      }],
      ['PAI',windows(async(f,t)=>{let c=0;for(const i of items(await evU('PaiHealthInfo',null,f,t))){const x=flat(i),n=when(x);if(n==null)continue;setDay(n,{pai:inr(x.dailyPai,0,500),paiT:inr(x.totalPai,0,1000),rhrV:inr(x.restHr,25,120)});c++}return c})],
      ['Stress',windows(async(f,t)=>{let c=0;for(const i of items(await evU('all_day_stress',null,f,t))){const x=flat(i),n=when(x);if(n==null)continue;setDay(n,{stress:inr(x.avgStress,0,100),stressMax:inr(x.maxStress,0,100),relax:inr(x.relaxProportion,0,100)});c++}return c})],
      ['Heart rate variability',windows(async(f,t)=>{const by=new Map();
        for(const i of items(await ev2('HRVRMSSD','real_data',f,t))){const x=flat(i),base=+x.startTime;
          for(const s of parse(x.samples)||[]){const v=+(s.hrv??s.rmssd),o=+(s.s??s.offset??0);if(!(v>1&&v<=400)||Math.abs(o)>7*DAY)continue;const k=Math.floor(toLocal(base+o)/DAY);(by.get(k)||by.set(k,[]).get(k)).push(v)}}
        for(const[n,v]of by)setDay(n,{hrv:med(v)});return by.size})],
      ['Readiness and overnight HRV',windows(async(f,t)=>{let c=0;for(const i of items(await ev2('Charge','insight_data',f,t))){const x=flat(i),n=when(x);if(n==null)continue;
        setDay(n,{ready:inr(x.rdnsScore,1,100),hrvN:inr(x.sleepHRV,1,250),rhrS:inr(x.sleepRHR,25,120),skin:inr(x.skinTempCalibrated,-50,100)});c++}return c})],
      ['Blood oxygen',windows(async(f,t)=>{const by=new Map();let c=0;
        for(const i of items(await evU('blood_oxygen','click',f,t))){const x=flat(i),n=when(x),v=inr(x.spo2??x.value,50,100);if(n==null||v==null)continue;(by.get(n)||by.set(n,[]).get(n)).push(v);c++}
        for(const[n,v]of by)setDay(n,{spo2:med(v)});
        for(const i of items(await evU('blood_oxygen','odi',f,t))){const x=flat(i),n=when(x);if(n==null)continue;setDay(n,{odi:inr(x.odi,0,100)});c++}
        return c})],
      ['Breathing rate',windows(async(f,t)=>{let c=0;for(const i of items(await ev2('RespiratoryRate','real_data',f,t))){const x=flat(i),n=when(x);if(n==null||!x.measurements)continue;
        const b=fromB64(x.measurements);let s=0,k=0;for(const v of b)if(v>=4&&v<=60){s+=v;k++}if(k){setDay(n,{resp:s/k});c++}}return c})],
      ['Training load',async()=>{let c=0;for(const x of items(await get(`/v2/watch/users/${CFG.userId}/WatchSportStatistics/SPORT_LOAD`,{startDay:dated(a),endDay:dated(b),limit:1000,isReverse:'true'}))){const n=when(x);if(n==null)continue;setDay(n,{load:inr(x.currnetDayTrainLoad??x.currentDayTrainLoad,0,1000)});c++}return c}],
      ['VO₂ max',async()=>{let c=0;for(const x of items(await get(`/v2/watch/users/${CFG.userId}/WatchSportStatistics/VO2_MAX`,{startDay:dated(a),endDay:dated(b),limit:1000,isReverse:'true'}))){const n=when(x);if(n==null)continue;setDay(n,{vo2:inr(x.vo2max??x.vo2Max??x.VO2_MAX,1,100)});c++}return c}],
      ['Weight',async()=>{let c=0;for(const x of items(await get(`/users/${CFG.userId}/members/-1/weightRecords`,{fromTime:Math.floor(from/1e3),toTime:Math.floor(to/1e3),limit:300,isForward:0}))){let t=+x.generatedTime;if(!t)continue;if(t<1e11)t*=1e3;
        setDay(Math.floor(toLocal(t)/DAY),{weight:inr(x.weight,20,600),bmi:inr(x.bmi,10,100),fat:inr(x.bodyFatRate??x.fatRate,3,70)});c++}return c}],
    ];
  }
  async function sync(onStep){
    const today=Math.floor(toLocal(Date.now())/DAY);
    let a=today-(+CFG.backfill||365);
    if(CFG.lastSync)a=dn(CFG.lastSync)-4;
    const out=[];
    for(const[label,fn]of streams(a,today)){
      onStep({label,state:'run'});
      try{const c=await fn();out.push({label,c,ok:true});onStep({label,state:c?'ok':'empty',c})}
      catch(e){
        if(e instanceof Auth){out.push({label,auth:true});onStep({label,state:'auth'});return{auth:true,out}}
        if(e instanceof Blocked){out.push({label,blocked:true});onStep({label,state:'blocked'});return{blocked:true,out}}
        out.push({label,err:e.message});onStep({label,state:'err',err:e.message});
      }
      await tick();
    }
    CFG.lastSync=ds(today);dirty.add('cfg:0');
    return{out};
  }
  async function test(){
    try{const l=await get('/v1/data/band_data.json',{userid:CFG.userId,from_date:dated(Math.floor(Date.now()/DAY)-1),to_date:dated(Math.floor(Date.now()/DAY)),query_type:'summary',byteLength:8,device_type:0});return{ok:true,n:items(l).length}}
    catch(e){return{ok:false,auth:e instanceof Auth,blocked:e instanceof Blocked,msg:e.message}}
  }
  return{sync,test,bandDay,placeHr,items,flat};
})();

/* Live heart rate through the standard Bluetooth heart rate service. Works with Heart Rate Push on Zepp OS watches. */
const Live=(()=>{
  let dev=null,ch=null,cur=null;
  const parseHR=dv=>{
    const f=dv.getUint8(0);let p=1,bpm;
    if(f&1){bpm=dv.getUint16(p,true);p+=2}else bpm=dv.getUint8(p++);
    if(f&8)p+=2;
    const rr=[];if(f&16)for(;p+1<dv.byteLength;p+=2)rr.push(dv.getUint16(p,true)/1024*1000);
    return{bpm,rr};
  };
  const supported=()=>!!navigator.bluetooth;
  async function connect(onData,onEnd){
    dev=await navigator.bluetooth.requestDevice({filters:[{services:['heart_rate']}]});
    const gatt=await dev.gatt.connect(),svc=await gatt.getPrimaryService('heart_rate');
    ch=await svc.getCharacteristic('heart_rate_measurement');
    cur={start:Date.now(),name:dev.name||'Heart rate sensor',t:[],v:[],rr:[]};
    ch.addEventListener('characteristicvaluechanged',e=>{const{bpm,rr}=parseHR(e.target.value);cur.t.push(Date.now()-cur.start);cur.v.push(bpm);cur.rr.push(...rr);onData(cur)});
    dev.addEventListener('gattserverdisconnected',()=>onEnd(cur));
    await ch.startNotifications();
  }
  function stop(){if(dev&&dev.gatt.connected)dev.gatt.disconnect();const s=cur;cur=null;return s}
  function save(s){
    if(!s||s.v.length<5)return false;
    const l=toLocal(s.start);
    const by=new Map();s.t.forEach((t,i)=>{const m=Math.floor((l+t)/MIN);(by.get(m)||by.set(m,[]).get(m)).push(s.v[i])});
    for(const[m,a]of by){const ms=m*MIN,n=Math.floor(ms/DAY);hrOf(n)[Math.floor((ms-n*DAY)/MIN)]=Math.round(a.reduce((x,y)=>x+y,0)/a.length)}
    D.live.push({start:s.start,name:s.name,n:s.v.length,dur:(s.t[s.t.length-1]||0)/6e4,mean:s.v.reduce((a,b)=>a+b,0)/s.v.length,max:Math.max(...s.v),rmssd:rmssd(s.rr)});
    dirty.add('live:0');return true;
  }
  const rmssd=rr=>{if(rr.length<10)return null;let s=0,c=0;for(let i=1;i<rr.length;i++){const d=rr[i]-rr[i-1];if(Math.abs(d)<250){s+=d*d;c++}}return c?Math.sqrt(s/c):null};
  return{supported,connect,stop,save,parseHR,rmssd};
})();
