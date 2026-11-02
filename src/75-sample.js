/* Clearly labelled sample data so the app can be explored before anything real is imported. */
function loadSample(days=430){
  clearData();
  let seed=20261102;const rnd=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296};
  const nrm=()=>Math.sqrt(-2*Math.log(rnd()||1e-9))*Math.cos(6.2831853*rnd());
  const last=Math.floor(Date.now()/DAY)-1,first=last-days+1,tags=new Map();
  const ill=[last-210,last-209,last-208,last-207],trip=[last-96,last-95,last-94,last-93,last-92];
  let w=82.5,fit=0,lastAlc=false;
  for(let n=first;n<=last;n++){
    const k=wd(n),off=k>=5,dayIx=n-first,shift=dayIx>days-130?-3.4:0;fit+=(shift-fit)*.03;
    const sick=ill.includes(n),away=trip.includes(n),alc=(k===4||k===5)&&rnd()<.34,t=[];
    if(alc)t.push('Alcohol');if(sick)t.push('Ill');if(away)t.push('Travel');
    if(t.length)tags.set(n,t);
    const bed=(off?1420:1385)+nrm()*22+(alc?35:0)+(away?50:0);
    const hours=(off?8:7.15)+nrm()*.45-(alc?.5:0)-(away?.6:0)+(sick?1:0);
    const s=(n-1)*DAY+bed*MIN,e=s+hours*36e5,L=Math.round(hours*60);
    const hr=hrOf(n),st=stOf(n),sg=sgOf(n);
    const rest=57+fit+(lastAlc?3.4:0)+(sick?8.5:0)+nrm()*1.1,deepAt=.3+rnd()*.28-(alc?.1:0),remAt=.68+rnd()*.18,cyc=84+rnd()*16;
    let dp=0,lt=0,rm=0,wk=0;
    for(let m=0;m<L;m++){
      const phase=m/cyc%1,prog=m/L;
      let g=phase<deepAt?(prog<.55?2:1):phase<remAt?1:(prog>.3?3:1);
      if(rnd()<.012)g=4;
      const t0=s+m*MIN,d=Math.floor(t0/DAY),a=sgOf(d);a[Math.floor((t0-d*DAY)/MIN)]=g;
      if(g===2)dp++;else if(g===1)lt++;else if(g===3)rm++;else wk++;
    }
    D.sleeps.set(s,{id:s,s,e,date:n,deep:dp,light:lt,rem:rm,wake:wk,score:Math.round(clamp(62+(hours-7)*10+nrm()*5,30,99))});
    const workout=(k===1||k===3||k===6)&&!sick&&rnd()<.82,wStart=off?10*60+nrm()*25:18*60+nrm()*20,wLen=38+rnd()*32,wPeak=128+rnd()*28-fit;
    const eMin=(e-n*DAY)/MIN,bMin=(s+DAY-n*DAY)/MIN;
    let steps=0,dist=0;
    for(let m=0;m<1440;m++){
      const asleep=(m<eMin)||(m>=bMin),phase=Math.cos(2*Math.PI*(m-17*60)/1440);
      let v=asleep?rest+2+nrm()*1.6:rest+15+6*phase+nrm()*3.4,c=0;
      if(!asleep){
        const busy=Math.exp(-(((m-(off?11*60:8.4*60))/60)**2))+Math.exp(-(((m-17.8*60)/70)**2));
        if(rnd()<.07+.25*busy){c=Math.round(25+rnd()*(off?85:100));v+=c/5}
      }
      if(workout&&m>=wStart&&m<wStart+wLen){const x=(m-wStart)/wLen;v=wPeak*(.82+.18*Math.sin(Math.PI*x))+nrm()*3;c=Math.round(120+rnd()*40)}
      if(sick&&!asleep)c=Math.round(c*.25);
      if(rnd()>.03)hr[m]=clamp(Math.round(v),35,205);
      st[m]=c;steps+=c;
    }
    dist=steps*.74;
    const hrv=62-fit*1.6+(lastAlc?-11:0)+(sick?-16:0)+(hours-7.3)*3+nrm()*5;
    const stress=clamp(38+(off?-7:3)+(sick?18:0)+(lastAlc?9:0)+nrm()*7,5,95);
    setDay(n,{steps,dist,kcal:Math.round(steps*.042+(workout?wLen*9:0)),stress:Math.round(stress),hrv:Math.round(hrv),hrvN:Math.round(hrv+4),
      ready:Math.round(clamp(66+(hrv-60)*.8+(hours-7.3)*5+nrm()*4,5,99)),spo2:Math.round(clamp(96.6+nrm()*.7,92,100)),resp:13.6+nrm()*.5+(sick?1.8:0),pai:workout?Math.round(24+rnd()*22):Math.round(rnd()*6)});
    if(workout){const id=n*DAY+wStart*MIN;D.workouts.set(id,{id,s:id,dur:wLen,type:k===6?1:(k===1?52:9),dist:k===1?0:wLen*(k===6?165:380),kcal:Math.round(wLen*9.5)})}
    w+=(79.8-w)*.003+nrm()*.05;
    if(dayIx%3===0)setDay(n,{weight:+(w+nrm()*.25).toFixed(1),fat:+(21+(w-80)*.5+nrm()*.2).toFixed(1)});
    lastAlc=alc;
  }
  for(const[k,v]of tags)D.tags.set(k,v);
  for(const k of['sleeps:0','workouts:0','tags:0'])dirty.add(k);
  CFG.sample=true;dirty.add('cfg:0');
}
