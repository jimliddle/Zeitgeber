/* Figures. Titles state what the data shows; the subtitle says how to read the chart. */
const UI={view:'overview',chrono:'hr',night:null,x:'sleep',y:'rhr',lag:0,corrLag:0,forest:'',forestShift:0,cal:'steps',mat:'steps',box:'steps',sortK:'date',sortD:-1,live:null};
let S={idx:[],prev:[]};
function seg(opts,val,on,label){
  return el('div',{class:'seg',role:'group','aria-label':label||''},opts.map(([v,l])=>el('button',{type:'button','aria-pressed':String(v===val),onclick:()=>on(v)},l)));
}
function pick(list,val,on,label){
  return el('select',{'aria-label':label||'',onchange:e=>on(e.target.value)},list.map(([v,l])=>el('option',{value:v,selected:v===val},l)));
}
const metricOpts=(f=()=>true)=>R.avail.filter(f).map(id=>[id,MI[id].l]);
function ticksFor(id,a,b){const m=MI[id];
  if(m&&m.time==='dur'){const st=b-a>360?120:b-a>150?60:b-a>60?30:15,o=[];for(let v=Math.ceil(a/st)*st;v<=b;v+=st)o.push(v);return o}
  if(m&&m.time==='clock')return clockTicks(a,b);
  return nice(a,b,5)}
const axisFmt=id=>{const m=MI[id];if(m&&m.time==='dur')return v=>v%60?dur(v):`${v/60}h`;if(m&&m.time==='clock')return hm;return v=>fmtN(v,v%1?1:0)};
function labelW(c,ticks,f){c.font=`400 12px ${FONT}`;return Math.ceil(Math.max(20,...ticks.map(t=>c.measureText(f(t)).width)))+11}

function figChrono(){
  const a=F.from,z=F.to,n=z-a+1,mode=UI.chrono;
  const hrs=[];
  for(let d=a;d<=z;d++){const h=D.hr.get(d);if(h)for(let m=0;m<1440;m+=11)if(h[m])hrs.push(h[m])}
  const lo=St.quant(hrs,.02)||45,hi=St.quant(hrs,.995)||150;
  const off=document.createElement('canvas');off.width=n;off.height=288;
  {const g=off.getContext('2d'),img=g.createImageData(n,288),px=img.data;
   const stagePx=[null,T.light,T.deep,T.rem,T.awake].map(c=>c&&hex2(c));
   for(let c=0;c<n;c++){
     const d=a+c,i=d-R.start;if(i<0||i>=R.n||!passes(i))continue;
     for(let r=0;r<288;r++){
       let m=720+r*5,day=d;if(m>=1440){m-=1440;day=d+1}
       let col=null;
       if(mode==='hr'){const h=D.hr.get(day);if(h){let s=0,k=0;for(let q=m;q<m+5;q++)if(h[q]){s+=h[q];k++}if(k)col=EMBER[Math.round(255*clamp((s/k-lo)/(hi-lo),0,1)**.9)]}}
       else if(mode==='steps'){const h=D.st.get(day);if(h){let s=0;for(let q=m;q<m+5;q++)s+=h[q];col=TEAL[Math.round(255*clamp(Math.sqrt(s/400),0,1))]}}
       else{const h=D.sg.get(day);if(h){const v=h[m+2]||h[m]||h[m+4];if(v)col=stagePx[v]}}
       if(col){const p=(r*n+c)*4;px[p]=col[0];px[p+1]=col[1];px[p+2]=col[2];px[p+3]=255}
     }
   }
   g.putImageData(img,0,0)}
  const span=`${dparts(a).y===dparts(z).y?fmtDS(a):fmtD(a)} to ${fmtD(z)}`,titles={hr:`Every minute of heart rate, ${span}`,steps:`Every step you took, ${span}`,sleep:`Every night of sleep, ${span}`};
  const geom=w=>({l:58,r:w-14,t:30,b:Math.round(clamp(w*.4,250,500))+30});
  const dayAt=(x,b)=>a+clamp(Math.floor((x-b.l)/(b.r-b.l)*n),0,n-1);
  const brushDraw=(f,x)=>{const g=f.ov.getContext('2d'),dpr=devicePixelRatio||1,b=geom(f.last);g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,f.ov.width,f.ov.height);
    const[p,q]=[Math.min(f.bx,x),Math.max(f.bx,x)];g.fillStyle=rgba('#FFFFFF',.2);g.fillRect(p,b.t,q-p,b.b-b.t);if(q-p>4)f.moved=true};
  const f=fig({title:titles[mode],plate:true,
    sub:'Each column is one day, read downwards from noon through midnight to the next noon. Drag across the plate to zoom into those dates.',
    controls:el('div',{class:'ctrl'},seg([['hr','Heart rate'],['steps','Movement'],['sleep','Sleep stages']],mode,v=>{UI.chrono=v;render()},'Chart layer')),
    h:w=>Math.round(clamp(w*.4,250,500))+56,
    draw(c,w,h,fo){
      const b=geom(w);b.b=h-26;
      c.fillStyle=T.plate;c.fillRect(0,0,w,h);
      c.imageSmoothingEnabled=false;c.drawImage(off,0,0,n,288,b.l,b.t,b.r-b.l,b.b-b.t);
      const yy=sc(0,1440,b.t,b.b);
      [[0,'Noon'],[360,'18:00'],[720,'Midnight'],[1080,'06:00'],[1440,'Noon']].forEach(([m,s])=>{txt(c,s,b.l-7,yy(m),{a:'right',b:'middle',c:T['plate-ink2']});
        if(m%1440){c.strokeStyle=rgba('#FFFFFF',.14);c.beginPath();c.moveTo(b.l,Math.round(yy(m))+.5);c.lineTo(b.r,Math.round(yy(m))+.5);c.stroke()}});
      tAxis(c,b,sc(a,z+1,b.l,b.r),a,z,{ink:T['plate-ink2'],line:T['plate-line']});
      if(mode==='sleep')legend(c,[{l:'Deep',c:T.deep},{l:'Light',c:T.light},{l:'REM',c:T.rem},{l:'Awake',c:T.awake}],b.l,14,{ink:T['plate-ink']});
      else{const L=mode==='hr'?EMBER:TEAL,x0=b.l+74,bw=150;
        txt(c,mode==='hr'?`${Math.round(lo)} bpm`:'Still',b.l,14,{b:'middle',c:T['plate-ink']});
        for(let i=0;i<bw;i++){const k=L[Math.round(i/bw*255)];c.fillStyle=`rgb(${k})`;c.fillRect(x0+i,9,1.5,10)}
        txt(c,mode==='hr'?`${Math.round(hi)} bpm`:'80 steps a minute',x0+bw+8,14,{b:'middle',c:T['plate-ink']})}
      fo.hit=(x,y)=>{
        if(x<b.l||x>b.r||y<b.t||y>b.b)return null;
        const d=dayAt(x,b),mi=(y-b.t)/(b.b-b.t)*1440,raw=720+mi,day=raw>=1440?d+1:d,m=Math.floor(raw%1440);
        const rows=[];
        const hv=D.hr.get(day)?.[m],sv=D.st.get(day)?.[m],sg=D.sg.get(day)?.[m];
        if(hv)rows.push({v:`${hv} bpm`,l:'heart rate',c:'#F2B04A'});
        if(sv)rows.push({v:`${sv}`,l:'steps that minute'});
        if(sg)rows.push({v:STAGE_NAME[sg],l:'sleep stage',c:stageColor(sg)});
        if(!rows.length)rows.push({v:'No reading'});
        return{title:`${fmtDW(day)}, ${hm(m)}`,rows,cross:x,y0:b.t,y1:b.b};
      };
      for(let i=0;i<n;i+=Math.max(1,Math.round(n/60)))fo.keys.push([b.l+(i+.5)*(b.r-b.l)/n,b.t+(b.b-b.t)*.5]);
    },
    brush:{start(f,x){f.bx=x},move:brushDraw,end(f,x){
      const g=f.ov.getContext('2d');g.clearRect(0,0,f.ov.width,f.ov.height);
      if(!f.moved)return;const b=geom(f.last),p=dayAt(Math.min(f.bx,x),b),q=dayAt(Math.max(f.bx,x),b);
      if(q>p){F.preset='custom';F.from=p;F.to=q;setTimeout(render)}}},
    table:()=>({cols:['Date','Lowest','Average','Highest','Readings'],rows:S.idx.map(i=>{const d=R.dn[i],h=D.hr.get(d);if(!h)return[ds(d),'–','–','–',0];const v=[...h].filter(Boolean);return[ds(d),v.length?Math.min(...v):'–',v.length?Math.round(St.mean(v)):'–',v.length?Math.max(...v):'–',v.length]})}),
    summary:'Heat map of the selected days against time of day.'});
  return f;
}
function figTrend(id,o={}){
  const idx=S.idx,x=idx.map(i=>R.dn[i]),y=Array.from(col(id,idx)),span=F.to-F.from+1,win=Math.round(clamp(span/6,7,28));
  const roll=St.rolling(x,y,win,Math.max(3,win/2*idx.length/span)),cps=St.changepoints(y),an=o.noAnom?[]:St.anomalies(x,y);
  const fin=St.fin(y);
  const m=MI[id],first=roll.med.find(Number.isFinite),last=[...roll.med].reverse().find(Number.isFinite),d=last-first;
  const title=o.title||(fin.length<4?`${m.l}: not enough readings here`:cps.length?`${m.l} shifted around ${fmtDS(x[cps[cps.length-1].i])}, and now sits near ${fmtM(id,last)}`:Math.abs(d)<(St.sd(fin)||1)*.35?`${m.l} held steady near ${fmtM(id,last)}`:`${m.l} ${d>0?'rose':'fell'} ${fmtDelta(id,Math.abs(d)).replace('+','')}, now near ${fmtM(id,last)}`);
  return fig({title,span:o.span||6,sub:o.sub||`Line is the ${win}-day median; the band covers the middle half of readings in that window.`,h:o.h||230,
    draw(c,w,h,f){
      if(fin.length<4)return emptyPlot(c,w,h,'Too few readings in this selection.');
      let lo=St.quant(y,.01),hi=St.quant(y,.99);if(o.target!=null){lo=Math.min(lo,o.target);hi=Math.max(hi,o.target)}
      const p=(hi-lo)*.12||1;lo-=p;hi+=p;
      const ticks=ticksFor(id,lo,hi),fm=axisFmt(id),b={l:labelW(c,ticks,fm),r:w-8,t:w<460?44:26,b:h-24},ys=sc(lo,hi,b.b,b.t),xs=sc(F.from,F.to,b.l,b.r);
      yAxis(c,b,ys,ticks,fm);tAxis(c,b,xs,F.from,F.to);
      c.save();c.beginPath();c.rect(b.l,0,b.r-b.l,b.b);c.clip();
      const px=x.map(xs);
      if(o.target!=null){c.strokeStyle=T.ink3;c.lineWidth=1;c.setLineDash([3,4]);c.beginPath();c.moveTo(b.l,ys(o.target));c.lineTo(b.r,ys(o.target));c.stroke();c.setLineDash([])}
      c.fillStyle=rgba(T.s1,.17);area(c,px,Array.from(roll.lo,ys),Array.from(roll.hi,ys));
      if(idx.length<=150){c.fillStyle=rgba(T.s1,.55);y.forEach((v,i)=>{if(Number.isFinite(v)){c.beginPath();c.arc(px[i],ys(v),2,0,7);c.fill()}})}
      else{c.strokeStyle=rgba(T.s1,.3);c.lineWidth=1;path(c,px,y.map(ys))}
      c.strokeStyle=T.s1;c.lineWidth=2;c.lineJoin='round';path(c,px,Array.from(roll.med,ys));
      for(const cp of cps){const q=Math.round(px[cp.i])+.5;c.strokeStyle=T.ink2;c.setLineDash([4,3]);c.lineWidth=1;c.beginPath();c.moveTo(q,b.t);c.lineTo(q,b.b);c.stroke();c.setLineDash([])}
      c.strokeStyle=T.bad;c.lineWidth=2;for(const a of an){c.beginPath();c.arc(px[a.i],ys(y[a.i]),5,0,7);c.stroke()}
      c.restore();
      const leg=[{l:`${win}-day median`,c:T.s1,kind:'line'},{l:'Middle half',c:rgba(T.s1,.3)}];
      if(cps.length)leg.push({l:'Level shift',c:T.ink2,kind:'line',dash:[4,3]});
      if(an.length)leg.push({l:'Unusual day',c:T.bad,kind:'ring'});
      if(o.target!=null)leg.push({l:'Target',c:T.ink3,kind:'line',dash:[3,4]});
      legend(c,leg,b.l,10,{max:w});
      f.hit=(mx,my)=>{
        if(mx<b.l-8||mx>b.r+8||my>b.b+4)return null;
        const dd=Math.round(xs.inv(mx));let bi=-1,bd=1e9;x.forEach((v,i)=>{const e=Math.abs(v-dd);if(e<bd&&Number.isFinite(y[i])){bd=e;bi=i}});
        if(bi<0)return null;
        const rows=[{v:fmtM(id,y[bi]),l:'that day',c:rgba(T.s1,.6)}];if(Number.isFinite(roll.med[bi]))rows.push({v:fmtM(id,roll.med[bi]),l:`${win}-day median`,c:T.s1});
        const hit=an.find(a=>a.i===bi);if(hit)rows.push({v:`${sign(y[bi]-hit.base,MI[id].d)} from recent normal`,c:T.bad});
        const tg=D.tags.get(x[bi]);if(tg)rows.push({v:tg.join(', ')});
        const cp=cps.find(q=>q.i===bi);if(cp)rows.push({v:`${fmtM(id,cp.before)} to ${fmtM(id,cp.after)}`,l:'level shift'});
        return{title:fmtDW(x[bi]),rows,cross:px[bi],y0:b.t,y1:b.b,pts:[{x:px[bi],y:ys(y[bi]),c:T.s1}]};
      };
      f.keys=x.map((v,i)=>[px[i],(b.t+b.b)/2]).filter((_,i)=>Number.isFinite(y[i]));
    },
    table:()=>({cols:['Date',m.l,`${win}-day median`],rows:x.map((v,i)=>[ds(v),fmtM(id,y[i]),fmtM(id,roll.med[i])])}),
    summary:`Daily ${m.l.toLowerCase()} from ${fmtD(F.from)} to ${fmtD(F.to)}.`});
}
function figProfile(){
  const p=dayProfile(S.idx),q=F.compare&&S.prev.length>=7?dayProfile(S.prev):null;
  const c=St.cosinor(Array.from({length:p.n},(_,i)=>(i+.5)*p.bin/60),Array.from(p.med));
  return fig({title:c?`Your heart rate bottoms out near ${hm(c.trough*60)} and peaks near ${hm(c.peak*60)}`:'Heart rate through the day',span:7,sub:'Median for each quarter hour. The band spans the 10th to 90th percentile of days.',h:270,
    draw(g,w,h,f){
      const lo=St.quant(p.lo,0)-3,hi=St.quant(p.hi,1)+3;if(!Number.isFinite(lo))return emptyPlot(g,w,h,'No minute heart rate in this selection.');
      const tk=nice(lo,hi,5),b={l:labelW(g,tk,v=>v),r:w-8,t:w<460?44:26,b:h-24},ys=sc(lo,hi,b.b,b.t),xs=sc(0,1440,b.l,b.r);
      yAxis(g,b,ys,tk,v=>v);
      g.strokeStyle=T.line;g.beginPath();g.moveTo(b.l,b.b+.5);g.lineTo(b.r,b.b+.5);g.stroke();
      for(let m=0;m<=1440;m+=240)txt(g,hm(m%1440),xs(m),b.b+16,{a:m===0?'left':m===1440?'right':'center'});
      const px=Array.from({length:p.n},(_,i)=>xs((i+.5)*p.bin));
      g.fillStyle=rgba(T.s1,.17);area(g,px,Array.from(p.lo,ys),Array.from(p.hi,ys));
      if(q){g.strokeStyle=T.s2;g.lineWidth=2;g.setLineDash([5,4]);path(g,px,Array.from(q.med,ys));g.setLineDash([])}
      g.strokeStyle=T.s1;g.lineWidth=2;path(g,px,Array.from(p.med,ys));
      legend(g,[{l:'This period',c:T.s1,kind:'line'},q&&{l:'Previous period',c:T.s2,kind:'line',dash:[5,4]},{l:'10th to 90th percentile',c:rgba(T.s1,.3)}].filter(Boolean),b.l,10,{max:w});
      f.hit=(x,y)=>{if(x<b.l||x>b.r)return null;const k=clamp(Math.floor((xs.inv(x))/p.bin),0,p.n-1);if(!Number.isFinite(p.med[k]))return null;
        const rows=[{v:`${fmtN(p.med[k])} bpm`,l:'median',c:T.s1},{v:`${fmtN(p.lo[k])} to ${fmtN(p.hi[k])}`,l:'typical range'}];if(q&&Number.isFinite(q.med[k]))rows.push({v:`${fmtN(q.med[k])} bpm`,l:'previous period',c:T.s2});
        return{title:hm(k*p.bin),rows,cross:px[k],y0:b.t,y1:b.b,pts:[{x:px[k],y:ys(p.med[k]),c:T.s1}]}};
      f.keys=px.map(v=>[v,(b.t+b.b)/2]);
    },
    table:()=>({cols:['Time','10th','Median','90th'],rows:Array.from({length:p.n},(_,i)=>[hm(i*p.bin),fmtN(p.lo[i]),fmtN(p.med[i]),fmtN(p.hi[i])])})});
}
function figDial(){
  const p=dayProfile(S.idx),hours=Array.from({length:p.n},(_,i)=>(i+.5)*p.bin/60),co=St.cosinor(hours,Array.from(p.med));
  const beds=St.fin(col('bed',S.idx)),wakes=St.fin(col('wakeT',S.idx)),b0=St.median(beds),w0=St.median(wakes);
  return fig({title:co?`A swing of ${fmtN(co.amp*2)} bpm around ${fmtN(co.mesor)} bpm`:'Daily rhythm',span:5,sub:co?`Your 24-hour dial. A cosine fit explains ${fmtN(co.r2*100)}% of the shape; the violet arc is your usual sleep.`:'',h:w=>clamp(w*.78,250,340),
    draw(g,w,h,f){
      if(!co)return emptyPlot(g,w,h,'No minute heart rate in this selection.');
      const cx=w/2,cy=h/2,Ro=Math.min(w,h)/2-22,Ri=Ro*.46,lo=St.quant(p.med,0)-2,hi=St.quant(p.med,1)+2,rr=sc(lo,hi,Ri,Ro);
      const ang=m=>m/1440*2*Math.PI-Math.PI/2;
      g.strokeStyle=T.grid;g.lineWidth=1;for(const v of nice(lo,hi,3)){g.beginPath();g.arc(cx,cy,rr(v),0,7);g.stroke()}
      if(Number.isFinite(b0)){g.strokeStyle=T.deep;g.lineWidth=7;g.lineCap='round';g.beginPath();g.arc(cx,cy,Ro-3,ang(b0),ang(w0));g.stroke();g.lineCap='butt'}
      for(let m=0;m<1440;m+=180){const a=ang(m),big=m%360===0;g.strokeStyle=T.ink3;g.lineWidth=big?2:1;g.beginPath();g.moveTo(cx+Math.cos(a)*(Ro+1),cy+Math.sin(a)*(Ro+1));g.lineTo(cx+Math.cos(a)*(Ro+(big?7:4)),cy+Math.sin(a)*(Ro+(big?7:4)));g.stroke();
        if(big)txt(g,hm(m).slice(0,2),cx+Math.cos(a)*(Ro+16),cy+Math.sin(a)*(Ro+16),{a:'center',b:'middle'})}
      const pt=k=>{const a=ang((k+.5)*p.bin);return[cx+Math.cos(a)*rr(p.med[k]),cy+Math.sin(a)*rr(p.med[k])]};
      g.beginPath();for(let k=0;k<p.n;k++){if(!Number.isFinite(p.med[k]))continue;const[x,y]=pt(k);k?g.lineTo(x,y):g.moveTo(x,y)}g.closePath();
      g.fillStyle=rgba(T.act,.18);g.fill();g.strokeStyle=T.act;g.lineWidth=2;g.stroke();
      g.beginPath();for(let k=0;k<=96;k++){const t=k/96*24,v=co.mesor+co.amp*Math.cos(2*Math.PI*(t-co.peak)/24),a=ang(t*60),r=rr(v),x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r;k?g.lineTo(x,y):g.moveTo(x,y)}
      g.strokeStyle=T.ink3;g.lineWidth=1;g.setLineDash([3,4]);g.stroke();g.setLineDash([]);
      txt(g,`${fmtN(co.mesor)}`,cx,cy-5,{a:'center',b:'middle',s:26,w:600,f:DISP,c:T.ink});txt(g,'bpm mean',cx,cy+15,{a:'center',b:'middle'});
      f.hit=(x,y)=>{const dx=x-cx,dy=y-cy,r=Math.hypot(dx,dy);if(r<Ri*.5||r>Ro+8)return null;let m=(Math.atan2(dy,dx)+Math.PI/2)/(2*Math.PI)*1440;if(m<0)m+=1440;const k=clamp(Math.floor(m/p.bin),0,p.n-1);if(!Number.isFinite(p.med[k]))return null;const[px,py]=pt(k);return{title:hm(k*p.bin),rows:[{v:`${fmtN(p.med[k])} bpm`,l:'median',c:T.act}],pts:[{x:px,y:py,c:T.act}]}};
      f.keys=Array.from({length:24},(_,i)=>{const[x,y]=pt(i*4);return[x,y]});
    },
    table:()=>({cols:['Measure','Value'],rows:co?[['Mean',`${fmtN(co.mesor,1)} bpm`],['Amplitude',`${fmtN(co.amp,1)} bpm`],['Peak',hm(co.peak*60)],['Trough',hm(co.trough*60)],['Variance explained',`${fmtN(co.r2*100)}%`]]:[]})});
}
function figZones(){
  const bins=new Map();let tot=0;hrMinutes(S.idx,h=>{for(let m=0;m<1440;m++)if(h[m]){const k=Math.floor(h[m]/5)*5;bins.set(k,(bins.get(k)||0)+1);tot++}});
  const keys=[...bins.keys()].sort((a,b)=>a-b),max=R.hrMax,z=[.5,.6,.7,.8,.9].map(x=>x*max),nm=['Warm-up','Fat burn','Aerobic','Threshold','Peak'],zm=[0,0,0,0,0];
  for(const[k,v]of bins){for(let i=4;i>=0;i--)if(k+2.5>=z[i]){zm[i]+=v;break}}
  const days=Math.max(1,S.idx.length),act=zm.reduce((a,b)=>a+b,0);
  return fig({title:`You spend about ${dur(act/days)} a day above ${Math.round(z[0])} bpm`,span:7,sub:`Minutes at each heart rate. Lines mark zones as a share of your maximum, ${max} bpm, which you can change on the Vault page.`,h:250,
    draw(g,w,h,f){
      if(!keys.length)return emptyPlot(g,w,h,'No minute heart rate in this selection.');
      const hi=Math.max(...bins.values()),tk=nice(0,hi/60,4),b={l:labelW(g,tk,v=>`${fmtN(v)}h`),r:w-8,t:22,b:h-24},a0=keys[0],a1=keys[keys.length-1]+5,xs=sc(a0,a1,b.l,b.r),ys=sc(0,hi/60*1.05,b.b,b.t);
      yAxis(g,b,ys,tk,v=>`${fmtN(v)}h`);
      const bw=Math.max(2,xs(5)-xs(0)-2);
      g.fillStyle=T.s1;for(const k of keys)roundTop(g,xs(k)+1,ys(bins.get(k)/60),bw,b.b-ys(bins.get(k)/60),3);
      g.strokeStyle=T.line;g.beginPath();g.moveTo(b.l,b.b+.5);g.lineTo(b.r,b.b+.5);g.stroke();
      for(const t of nice(a0,a1,8))txt(g,String(t),xs(t),b.b+16,{a:'center'});
      z.forEach((v,i)=>{if(v<a0||v>a1)return;const p=Math.round(xs(v))+.5;g.strokeStyle=T.ink3;g.setLineDash([3,4]);g.lineWidth=1;g.beginPath();g.moveTo(p,b.t);g.lineTo(p,b.b);g.stroke();g.setLineDash([]);txt(g,nm[i],p+4,b.t+2,{b:'top',s:11})});
      f.hit=(x,y)=>{if(x<b.l||x>b.r)return null;const k=Math.floor(xs.inv(x)/5)*5,v=bins.get(k);if(!v)return null;return{title:`${k}–${k+4} bpm`,rows:[{v:dur(v),l:'total'},{v:dur(v/days),l:'per day'},{v:`${fmtN(v/tot*100,1)}%`,l:'of readings'}],rect:[xs(k),ys(v/60),bw+2,b.b-ys(v/60)]}};
      f.keys=keys.map(k=>[xs(k)+bw/2,(b.t+b.b)/2]);
    },
    table:()=>({cols:['Zone','From','Per day','Total'],rows:nm.map((n,i)=>[n,`${Math.round(z[i])} bpm`,dur(zm[i]/days),dur(zm[i])])})});
}
function figPhase(){
  const wk=[];for(let i=0;i<S.idx.length;i+=7){const part=S.idx.slice(i,i+7);if(part.length<4)continue;const ho=[],y=[];
    hrMinutes(part,h=>{for(let m=0;m<1440;m+=10)if(h[m]){ho.push(m/60);y.push(h[m])}});
    const c=St.cosinor(ho,y);if(c&&c.amp>2)wk.push({d:R.dn[part[0]],t:c.peak*60>360?c.peak*60:c.peak*60+1440,a:c.amp})}
  const v=wk.map(a=>a.t),sp=St.sd(v);
  return fig({title:wk.length>2?`The peak of your day moves by about ${dur(sp)} week to week`:'Rhythm timing',span:5,sub:'Peak time from a cosine fit to each week. A flat line means a steady body clock.',h:250,
    draw(g,w,h,f){
      if(wk.length<3)return emptyPlot(g,w,h,'Needs at least three weeks of heart rate.');
      const lo=Math.min(...v)-40,hi=Math.max(...v)+40,tk=clockTicks(lo,hi),b={l:48,r:w-8,t:12,b:h-24},ys=sc(lo,hi,b.b,b.t),xs=sc(F.from,F.to,b.l,b.r);
      yAxis(g,b,ys,tk,hm);tAxis(g,b,xs,F.from,F.to);
      const px=wk.map(a=>xs(a.d)),py=v.map(ys);g.strokeStyle=T.s1;g.lineWidth=2;path(g,px,py);
      f.hit=x=>{if(x<b.l||x>b.r)return null;let k=0;px.forEach((p,i)=>{if(Math.abs(p-x)<Math.abs(px[k]-x))k=i});return{title:`Week of ${fmtD(wk[k].d)}`,rows:[{v:hm(v[k]),l:'peak',c:T.s1},{v:`${fmtN(wk[k].a*2)} bpm`,l:'daily swing'}],cross:px[k],y0:b.t,y1:b.b,pts:[{x:px[k],y:py[k],c:T.s1}]}};
      f.keys=px.map(p=>[p,(b.t+b.b)/2]);
    },
    table:()=>({cols:['Week of','Peak','Swing'],rows:wk.map(a=>[ds(a.d),hm(a.t),`${fmtN(a.a*2)} bpm`])})});
}
function figActogram(){
  const a=F.from,z=F.to,n=z-a+1,sess=[...D.sleeps.values()].filter(s=>s.date>=a-1&&s.date<=z+1);
  const med=St.median(col('mid',S.idx)),sd=St.sd(St.fin(col('mid',S.idx)));
  return fig({title:Number.isFinite(sd)?`Your sleep midpoint wanders by about ${dur(sd)} from one night to the next`:'Sleep timing',span:12,
    sub:'Double-plotted actogram: each row shows two days, so a night is never cut in half. Stripes that drift sideways mean a shifting schedule. Click a night to open it below.',
    h:w=>clamp(n*7,220,620),
    draw(g,w,h,f){
      const b={l:58,r:w-8,t:24,b:h-22},rh=(b.b-b.t)/n,xs=sc(0,2880,b.l,b.r);
      for(let m=0;m<=2880;m+=360){const p=Math.round(xs(m))+.5;g.strokeStyle=m%1440?T.grid:T.line;g.lineWidth=1;g.beginPath();g.moveTo(p,b.t);g.lineTo(p,b.b);g.stroke();if(w>=560||m%720===0)txt(g,hm((720+m)%1440),p,b.b+15,{a:m===0?'left':m===2880?'right':'center'})}
      const rowStart=d=>(d*DAY+12*36e5);
      for(let d=a;d<=z;d++){
        const i=d-a,y=b.t+i*rh,dim=!passes(d-R.start),h2=Math.max(1,rh-(rh>3?1:0));
        if(dim)g.globalAlpha=.2;
        for(const s of sess){
          const o=s.s-rowStart(d);if(o>=2*DAY||s.e-rowStart(d)<=0)continue;
          for(let t=s.s;t<s.e;t+=5*MIN){const k=(t-rowStart(d))/MIN;if(k<0||k>=2880)continue;
            const q=Math.floor(t/DAY),v=D.sg.get(q)?.[Math.floor((t-q*DAY)/MIN)]||1;
            g.fillStyle=stageColor(v);g.fillRect(xs(k),y,Math.ceil(xs(5)-xs(0)),h2)}
        }
        g.globalAlpha=1;
      }
      const ev=Math.max(1,Math.ceil(n/((b.b-b.t)/26)));
      for(let d=a;d<=z;d++)if((d-a)%ev===0)txt(g,fmtDS(d),b.l-7,b.t+(d-a+.5)*rh,{a:'right',b:'middle'});
      legend(g,[{l:'Deep',c:T.deep},{l:'Light',c:T.light},{l:'REM',c:T.rem},{l:'Awake',c:T.awake}],b.l,10);
      f.rows={b,rh};
      f.hit=(x,y)=>{if(x<b.l||x>b.r||y<b.t||y>b.b)return null;const d=a+clamp(Math.floor((y-b.t)/rh),0,n-1),m=xs.inv(x),t=rowStart(d)+m*MIN;
        const s=sess.find(q=>t>=q.s&&t<q.e);if(!s)return{title:fmtDW(d),rows:[{v:hm((720+m)%1440),l:'no sleep recorded'}]};
        return{title:`Night ending ${fmtDW(s.date)}`,rows:[{v:dur(s.deep+s.light+s.rem),l:'asleep',c:T.light},{v:`${hm((s.s%DAY)/MIN)} to ${hm((s.e%DAY)/MIN)}`},{v:dur(s.deep),l:'deep',c:T.deep},{v:dur(s.rem),l:'REM',c:T.rem}],rect:[xs((s.s-rowStart(d))/MIN),b.t+(d-a)*rh,xs((s.e-s.s)/MIN)-b.l,rh]}};
      f.keys=S.idx.filter(i=>R.sleepBy.get(R.dn[i])).map(i=>{const d=R.dn[i]-1,s=R.sleepBy.get(R.dn[i]).main;return[xs((s.s-rowStart(d))/MIN)+6,b.t+(d-a+.5)*rh]}).filter(k=>k[1]>b.t);
    },
    onclick(x,y,f){const{b,rh}=f.rows,d=a+clamp(Math.floor((y-b.t)/rh),0,n-1),t=d*DAY+12*36e5+sc(0,2880,b.l,b.r).inv(x)*MIN,s=sess.find(q=>t>=q.s&&t<q.e);if(s){UI.night=s.date;setTimeout(render)}},
    table:()=>({cols:['Night ending','Bedtime','Wake','Asleep','Deep','REM','Awake'],rows:S.idx.filter(i=>Number.isFinite(R.c.sleep[i])).map(i=>[ds(R.dn[i]),hm(R.c.bed[i]),hm(R.c.wakeT[i]),dur(R.c.sleep[i]),dur(R.c.deep[i]),dur(R.c.rem[i]),dur(R.c.awake[i])])})});
}
function figStages(){
  const nights=S.idx.filter(i=>Number.isFinite(R.c.sleep[i])),weekly=nights.length>70;
  const groups=[];
  if(weekly){const m=new Map();for(const i of nights){const k=R.dn[i]-wd(R.dn[i]);(m.get(k)||m.set(k,[]).get(k)).push(i)}for(const[k,v]of m)if(v.length>=3)groups.push({d:k,n:v.length,deep:St.mean(col('deep',v)),light:St.mean(col('light',v)),rem:St.mean(col('rem',v))||0,awake:St.mean(col('awake',v))})}
  else for(const i of nights)groups.push({d:R.dn[i],n:1,deep:R.c.deep[i],light:R.c.light[i],rem:R.c.rem[i]||0,awake:R.c.awake[i]||0});
  const parts=[['deep','Deep','deep'],['light','Light','light'],['rem','REM','rem'],['awake','Awake','awake']];
  const short=nights.filter(i=>R.c.sleep[i]<CFG.sleepTarget).length;
  return fig({title:nights.length?`You missed your ${dur(CFG.sleepTarget)} target on ${short} of ${nights.length} nights`:'Sleep stages',span:12,sub:weekly?'Average night in each week, split by stage.':'Each night split by stage. The dashed line is your target.',h:260,
    draw(g,w,h,f){
      if(!groups.length)return emptyPlot(g,w,h,'No sleep recorded in this selection.');
      const mx=Math.max(CFG.sleepTarget,...groups.map(q=>q.deep+q.light+q.rem+q.awake))*1.05,tk=ticksFor('sleep',0,mx),fm=axisFmt('sleep'),b={l:labelW(g,tk,fm),r:w-8,t:w<460?44:26,b:h-24},ys=sc(0,mx,b.b,b.t),x0=weekly?F.from-wd(F.from):F.from,xs=sc(x0,F.to+(weekly?7:1),b.l,b.r);
      yAxis(g,b,ys,tk,fm);tAxis(g,b,xs,x0,F.to);
      const bw=Math.max(1.5,(xs(weekly?7:1)-xs(0))-2),rects=[];
      for(const q of groups){let y=b.b;const x=xs(q.d)+1,top=parts.filter(p=>q[p[0]]>0).pop();
        for(const p of parts){const v=q[p[0]];if(!(v>0))continue;const y2=ys(v)-b.b,hh=-y2;g.fillStyle=T[p[2]];
          const gap=bw>4?1:0;if(p===top)roundTop(g,x,y-hh+gap,bw,hh-gap,Math.min(3,bw/2));else g.fillRect(x,y-hh+gap,bw,hh-gap);y-=hh}
        rects.push({x,q})}
      g.strokeStyle=T.ink2;g.lineWidth=1;g.setLineDash([3,4]);const ty=Math.round(ys(CFG.sleepTarget))+.5;g.beginPath();g.moveTo(b.l,ty);g.lineTo(b.r,ty);g.stroke();g.setLineDash([]);
      legend(g,parts.map(p=>({l:p[1],c:T[p[2]]})).concat([{l:'Target',c:T.ink2,kind:'line',dash:[3,4]}]),b.l,10,{max:w});
      f.hit=(x)=>{const r=rects.find(k=>x>=k.x-1&&x<k.x+bw+1);if(!r)return null;const q=r.q,t=q.deep+q.light+q.rem;
        return{title:weekly?`Week of ${fmtD(q.d)}`:`Night ending ${fmtDW(q.d)}`,rows:[{v:dur(t),l:'asleep'},...parts.map(p=>({v:dur(q[p[0]]),l:p[1],c:T[p[2]]}))],rect:[r.x-1,ys(t+q.awake),bw+2,b.b-ys(t+q.awake)]}};
      f.keys=rects.map(r=>[r.x+bw/2,(b.t+b.b)/2]);
    },
    table:()=>({cols:['Date','Deep','Light','REM','Awake'],rows:groups.map(q=>[ds(q.d),dur(q.deep),dur(q.light),dur(q.rem),dur(q.awake)])})});
}
function figNight(){
  const dates=S.idx.filter(i=>R.sleepBy.get(R.dn[i])).map(i=>R.dn[i]);
  let dd=UI.night!=null&&R.sleepBy.get(UI.night)?UI.night:dates[dates.length-1];
  if(dd==null)return null;
  const s=R.sleepBy.get(dd).main,L=Math.round((s.e-s.s)/MIN);
  const st=new Uint8Array(L),hr=new Float64Array(L).fill(NaN);
  for(let i=0;i<L;i++){const t=s.s+i*MIN,k=Math.floor(t/DAY),m=Math.floor((t-k*DAY)/MIN);st[i]=D.sg.get(k)?.[m]||0;const h=D.hr.get(k)?.[m];if(h)hr[i]=h}
  const hasSt=st.some(x=>x),low=Math.min(...St.fin(hr));
  const levels=[[4,'Awake'],[3,'REM'],[1,'Light'],[2,'Deep']];
  const row=g=>levels.findIndex(l=>l[0]===g);
  return fig({title:`Night ending ${fmtDW(dd)}: ${dur(s.deep+s.light+s.rem)} asleep`,span:7,sub:`Stages above, heart rate below on the same clock.${Number.isFinite(low)?` Lowest reading ${low} bpm.`:''}`,h:320,
    draw(g,w,h,f){
      const b={l:54,r:w-10,t:10,b:150},b2={l:54,r:w-10,t:172,b:h-24},xs=sc(0,L,b.l,b.r),rh=(b.b-b.t)/4;
      levels.forEach((l,i)=>txt(g,l[1],b.l-7,b.t+(i+.5)*rh,{a:'right',b:'middle'}));
      if(!hasSt)txt(g,'No stage detail for this night.',b.l,b.t+20);
      for(let i=0,j=0;i<L;i=j){while(j<L&&st[j]===st[i])j++;if(!st[i])continue;const r=row(st[i]);g.fillStyle=stageColor(st[i]);g.fillRect(xs(i),b.t+r*rh+2,Math.max(1,xs(j)-xs(i)),rh-4)}
      const v=St.fin(hr);
      if(v.length){const lo=Math.min(...v)-3,hi=Math.max(...v)+3,tk=nice(lo,hi,3),ys=sc(lo,hi,b2.b,b2.t);yAxis(g,b2,ys,tk,x=>x);
        const px=Array.from({length:L},(_,i)=>xs(i));g.strokeStyle=T.s2;g.lineWidth=2;path(g,px,Array.from(hr,ys));f.ys=ys}
      g.strokeStyle=T.line;g.beginPath();g.moveTo(b2.l,b2.b+.5);g.lineTo(b2.r,b2.b+.5);g.stroke();
      const sm=(s.s%DAY)/MIN;for(let q=Math.ceil(sm/60)*60;q<sm+L;q+=L>480?120:60)txt(g,hm(q),xs(q-sm),b2.b+16,{a:'center'});
      f.hit=(x)=>{if(x<b.l||x>b.r)return null;const i=clamp(Math.round(xs.inv(x)),0,L-1),rows=[];if(st[i])rows.push({v:STAGE_NAME[st[i]],c:stageColor(st[i])});if(Number.isFinite(hr[i]))rows.push({v:`${hr[i]} bpm`,c:T.s2});return{title:hm(sm+i),rows,cross:xs(i)}};
      f.keys=Array.from({length:Math.floor(L/10)},(_,i)=>[xs(i*10),100]);
    },
    table:()=>({cols:['Time','Stage','Heart rate'],rows:Array.from({length:Math.floor(L/5)},(_,i)=>[hm((s.s%DAY)/MIN+i*5),STAGE_NAME[st[i*5]]||'–',Number.isFinite(hr[i*5])?hr[i*5]:'–'])})});
}
function figBox(id,o={}){
  const groups=WD.map((_,k)=>St.sorted(col(id,S.idx.filter(i=>wd(R.dn[i])===k))));
  const meds=groups.map(a=>St.q(a,.5)),valid=meds.map((v,i)=>[v,i]).filter(x=>Number.isFinite(x[0])).sort((a,b)=>b[0]-a[0]);
  const title=valid.length>1?`${WD[valid[0][1]]} is your highest for ${MI[id].l.toLowerCase()}, ${WD[valid[valid.length-1][1]]} the lowest`:`${MI[id].l} by weekday`;
  return fig({title,span:o.span||5,sub:'Box covers the middle half of days, the line inside is the median, whiskers reach the 10th and 90th percentiles.',controls:o.controls,h:o.h||250,
    draw(g,w,h,f){
      const all=St.fin(groups.flatMap(a=>[...a]));if(all.length<4)return emptyPlot(g,w,h,'Too few readings in this selection.');
      const lo0=St.quant(all,.03),hi0=St.quant(all,.97),pad=(hi0-lo0)*.1,lo=Math.max(MI[id].time==='clock'?-1e9:0,lo0-pad),hi=hi0+pad,tk=ticksFor(id,lo,hi),fm=axisFmt(id),b={l:labelW(g,tk,fm),r:w-8,t:10,b:h-24},ys=sc(lo,hi,b.b,b.t),cw=(b.r-b.l)/7;
      yAxis(g,b,ys,tk,fm);g.strokeStyle=T.line;g.beginPath();g.moveTo(b.l,b.b+.5);g.lineTo(b.r,b.b+.5);g.stroke();
      groups.forEach((a,k)=>{const cx=b.l+(k+.5)*cw;txt(g,WD[k],cx,b.b+16,{a:'center'});if(a.length<3)return;
        const[p10,p25,p50,p75,p90]=[.1,.25,.5,.75,.9].map(q=>St.q(a,q)),bw=Math.min(cw*.5,34);
        g.strokeStyle=T.ink3;g.lineWidth=1;g.beginPath();g.moveTo(cx,ys(p10));g.lineTo(cx,ys(p90));g.stroke();
        g.fillStyle=k>=5?T.s2:T.s1;g.fillRect(cx-bw/2,ys(p75),bw,ys(p25)-ys(p75));
        g.fillStyle=T.ground;g.fillRect(cx-bw/2,ys(p50)-1.5,bw,3)});
      legend(g,[],0,0);
      f.hit=x=>{const k=clamp(Math.floor((x-b.l)/cw),0,6),a=groups[k];if(a.length<3)return null;return{title:`${WD[k]}, ${a.length} days`,rows:[{v:fmtM(id,St.q(a,.5)),l:'median',c:k>=5?T.s2:T.s1},{v:`${fmtM(id,St.q(a,.25))} to ${fmtM(id,St.q(a,.75))}`,l:'middle half'}],rect:[b.l+k*cw+2,b.t,cw-4,b.b-b.t]}};
      f.keys=WD.map((_,k)=>[b.l+(k+.5)*cw,(b.t+b.b)/2]);
    },
    table:()=>({cols:['Day','Days','Lower quartile','Median','Upper quartile'],rows:groups.map((a,k)=>[WD[k],a.length,fmtM(id,St.q(a,.25)),fmtM(id,St.q(a,.5)),fmtM(id,St.q(a,.75))])})});
}
function figCalendar(){
  const id=UI.cal,idx=S.idx,v=new Map(idx.map(i=>[R.dn[i],R.c[id][i]])),f0=F.from-wd(F.from),weeks=Math.ceil((F.to-f0+1)/7);
  const vals=St.fin([...v.values()]),lo=St.quant(vals,.05),hi=St.quant(vals,.95),m=MI[id];
  const best=idx.filter(i=>Number.isFinite(R.c[id][i])).sort((a,b)=>R.c[id][b]-R.c[id][a])[0];
  const cell=w=>clamp(Math.floor((w-40)/weeks)-1,5,weeks<30?34:22);
  return fig({title:best!=null?`Your biggest day was ${fmtDW(R.dn[best])}, at ${fmtM(id,R.c[id][best])}`:'Calendar',span:12,sub:'Stronger colour means more. Blank squares are filtered out or have no reading.',
    controls:el('div',{class:'ctrl'},el('span',null,'Show'),pick(metricOpts(),id,x=>{UI.cal=x;render()},'Calendar metric')),
    h:w=>7*(cell(w)+1)+24,
    draw(g,w,h,f){
      const cs=cell(w),st=cs+1,l=34,t=20;
      [0,2,4,6].forEach(i=>txt(g,WD[i],l-6,t+(i+.5)*st,{a:'right',b:'middle',s:11}));
      let lastM=-1,lastX=-99;
      for(let d=f0;d<=F.to;d++){
        const k=d-f0,x=l+Math.floor(k/7)*st,y=t+(k%7)*st,p=dparts(d);
        if(k%7===0&&p.m!==lastM&&d+6>=F.from){if(x-lastX>26){txt(g,MON[p.m],x,12,{s:11});lastX=x}lastM=p.m}
        const a=v.get(d);if(!Number.isFinite(a))continue;
        g.fillStyle=seqColor(clamp((a-lo)/((hi-lo)||1),0,1));g.beginPath();g.roundRect(x,y,cs,cs,Math.min(2,cs/3));g.fill();
      }
      f.hit=(x,y)=>{const cx=Math.floor((x-l)/st),cy=Math.floor((y-t)/st);if(cx<0||cy<0||cy>6)return null;const d=f0+cx*7+cy,a=v.get(d);if(d>F.to||d<F.from)return null;return{title:fmtDW(d),rows:[{v:fmtM(id,a),l:m.l}],rect:[l+cx*st-.5,t+cy*st-.5,cs+1,cs+1]}};
      f.keys=idx.map(i=>{const k=R.dn[i]-f0;return[l+Math.floor(k/7)*st+cs/2,t+(k%7)*st+cs/2]});
    },
    table:()=>({cols:['Date',m.l],rows:idx.map(i=>[ds(R.dn[i]),fmtM(id,R.c[id][i])])})});
}
function figMatrix(){
  const kind=UI.mat,sum=Array.from({length:7},()=>new Float64Array(24)),cnt=Array.from({length:7},()=>new Float64Array(24));
  for(const i of S.idx){const d=R.dn[i],k=wd(d),a=kind==='steps'?D.st.get(d):D.hr.get(d);if(!a)continue;
    for(let h=0;h<24;h++){let s=0,c=0;for(let m=h*60;m<(h+1)*60;m++)if(kind==='steps'||a[m]){s+=a[m];c++}if(c){sum[k][h]+=kind==='steps'?s:s/c;cnt[k][h]++}}}
  const val=(k,h)=>cnt[k][h]?sum[k][h]/cnt[k][h]:NaN,all=[];for(let k=0;k<7;k++)for(let h=0;h<24;h++)all.push(val(k,h));
  const fin=St.fin(all),lo=St.quant(fin,0),hi=St.quant(fin,.99);let top=[0,0];for(let k=0;k<7;k++)for(let h=0;h<24;h++)if(val(k,h)>val(...top))top=[k,h];
  return fig({title:fin.length?`Your ${kind==='steps'?'busiest':'hardest-working'} hour is ${WD[top[0]]} ${hm(top[1]*60)}`:'Week by hour',span:7,sub:`Average ${kind==='steps'?'steps per hour':'heart rate'} for each weekday and hour.`,
    controls:el('div',{class:'ctrl'},seg([['steps','Steps'],['hr','Heart rate']],kind,v=>{UI.mat=v;render()},'Matrix measure')),h:236,
    draw(g,w,h,f){
      const b={l:36,r:w-4,t:4,b:h-20},cw=(b.r-b.l)/24,ch=(b.b-b.t)/7;
      for(let k=0;k<7;k++){txt(g,WD[k],b.l-6,b.t+(k+.5)*ch,{a:'right',b:'middle'});for(let q=0;q<24;q++){const v=val(k,q);if(!Number.isFinite(v))continue;g.fillStyle=seqColor(clamp((v-lo)/((hi-lo)||1),0,1)**.8,kind==='steps'?170:45);g.fillRect(b.l+q*cw+1,b.t+k*ch+1,cw-2,ch-2)}}
      for(let q=0;q<24;q+=w<520?6:3)txt(g,pad(q),b.l+q*cw,b.b+15);
      f.hit=(x,y)=>{const q=Math.floor((x-b.l)/cw),k=Math.floor((y-b.t)/ch);if(q<0||q>23||k<0||k>6)return null;return{title:`${WD[k]} ${hm(q*60)}`,rows:[{v:kind==='steps'?fmtN(val(k,q)):`${fmtN(val(k,q))} bpm`,l:kind==='steps'?'steps on average':'average'}],rect:[b.l+q*cw,b.t+k*ch,cw,ch]}};
      for(let k=0;k<7;k++)for(let q=0;q<24;q+=3)f.keys.push([b.l+(q+.5)*cw,b.t+(k+.5)*ch]);
    },
    table:()=>({cols:['Hour',...WD],rows:Array.from({length:24},(_,q)=>[hm(q*60),...WD.map((_,k)=>fmtN(val(k,q)))])})});
}
function figLoad(){
  const idx=S.idx,x=idx.map(i=>R.dn[i]),ctl=col('ctl',idx),atl=col('atl',idx),l=ctl[ctl.length-1],a=atl[atl.length-1];
  return fig({title:Number.isFinite(l)?(a>l*1.15?'Recent training is running ahead of your fitness base':a<l*.85?'You are training below your fitness base':'Recent training matches your fitness base'):'Training load',span:7,sub:'Training impulse from minute heart rate. Fitness is a 42-day average and fatigue a 7-day average.',h:250,
    draw(g,w,h,f){
      if(!St.fin(col('trimp',idx)).length)return emptyPlot(g,w,h,'No minute heart rate in this selection.');
      const hi=Math.max(...St.fin([...ctl,...atl]))*1.1||1,tk=nice(0,hi,4),b={l:labelW(g,tk,v=>v),r:w-8,t:26,b:h-24},ys=sc(0,hi,b.b,b.t),xs=sc(F.from,F.to,b.l,b.r);
      yAxis(g,b,ys,tk,v=>fmtN(v));tAxis(g,b,xs,F.from,F.to);
      const px=x.map(xs);g.lineWidth=2;g.strokeStyle=T.s2;path(g,px,Array.from(atl,ys));g.strokeStyle=T.s1;path(g,px,Array.from(ctl,ys));
      legend(g,[{l:'Fitness (42-day)',c:T.s1,kind:'line'},{l:'Fatigue (7-day)',c:T.s2,kind:'line'}],b.l,10);
      f.hit=q=>{if(q<b.l||q>b.r)return null;const dd=Math.round(xs.inv(q));let k=0;x.forEach((v,i)=>{if(Math.abs(v-dd)<Math.abs(x[k]-dd))k=i});return{title:fmtDW(x[k]),rows:[{v:fmtN(ctl[k],1),l:'fitness',c:T.s1},{v:fmtN(atl[k],1),l:'fatigue',c:T.s2}],cross:px[k],y0:b.t,y1:b.b,pts:[{x:px[k],y:ys(ctl[k]),c:T.s1},{x:px[k],y:ys(atl[k]),c:T.s2}]}};
      f.keys=px.map(p=>[p,(b.t+b.b)/2]);
    },
    table:()=>({cols:['Date','Fitness','Fatigue','Impulse'],rows:idx.map(i=>[ds(R.dn[i]),fmtN(R.c.ctl[i],1),fmtN(R.c.atl[i],1),fmtN(R.c.trimp[i],1)])})});
}
function figAcwr(){
  const idx=S.idx,x=idx.map(i=>R.dn[i]),y=Array.from(col('acwr',idx)),last=[...y].reverse().find(Number.isFinite);
  return fig({title:Number.isFinite(last)?`Load ratio is ${fmtN(last,2)}`:'Load ratio',span:5,sub:'Fatigue over four-week load. Many coaches treat 0.8 to 1.3 as a steady zone. The research on it is mixed, so read it as a prompt.',h:250,
    draw(g,w,h,f){
      if(!St.fin(y).length)return emptyPlot(g,w,h,'Needs four weeks of minute heart rate.');
      const hi=Math.max(1.6,...St.fin(y))*1.05,tk=nice(.4,hi,4),b={l:38,r:w-8,t:10,b:h-24},ys=sc(.4,hi,b.b,b.t),xs=sc(F.from,F.to,b.l,b.r);
      g.fillStyle=rgba(T.s3,.15);g.fillRect(b.l,ys(1.3),b.r-b.l,ys(.8)-ys(1.3));
      yAxis(g,b,ys,tk,v=>fmtN(v,1));tAxis(g,b,xs,F.from,F.to);const px=x.map(xs);g.strokeStyle=T.s1;g.lineWidth=2;path(g,px,y.map(v=>ys(v)));
      f.hit=q=>{if(q<b.l||q>b.r)return null;const dd=Math.round(xs.inv(q));let k=0;x.forEach((v,i)=>{if(Math.abs(v-dd)<Math.abs(x[k]-dd))k=i});if(!Number.isFinite(y[k]))return null;return{title:fmtDW(x[k]),rows:[{v:fmtN(y[k],2),l:'load ratio',c:T.s1}],cross:px[k],y0:b.t,y1:b.b,pts:[{x:px[k],y:ys(y[k]),c:T.s1}]}};
      f.keys=px.map(p=>[p,(b.t+b.b)/2]);
    },
    table:()=>({cols:['Date','Ratio'],rows:idx.map((i,k)=>[ds(R.dn[i]),fmtN(y[k],2)])})});
}
const workoutsIn=()=>{const set=new Set(S.idx.map(i=>R.dn[i]));return[...D.workouts.values()].filter(w=>set.has(Math.floor(w.s/DAY))).sort((a,b)=>b.s-a.s)};
function workoutHr(w){const v=[];for(let t=w.s;t<w.s+w.dur*MIN;t+=MIN){const k=Math.floor(t/DAY),h=D.hr.get(k)?.[Math.floor((t-k*DAY)/MIN)];if(h)v.push(h)}return{avg:w.hrAvg||(v.length>=3?St.mean(v):NaN),max:w.hrMax||(v.length>=3?Math.max(...v):NaN)}}
const sportName=c=>SPORTS[c]||`Activity type ${c}`;
function figMix(){
  const by=new Map();for(const w of workoutsIn()){const k=sportName(w.type),o=by.get(k)||{m:0,n:0};o.m+=w.dur;o.n++;by.set(k,o)}
  const rows=[...by].sort((a,b)=>b[1].m-a[1].m),top=rows.slice(0,7),rest=rows.slice(7);
  if(rest.length)top.push(['Other',{m:rest.reduce((a,r)=>a+r[1].m,0),n:rest.reduce((a,r)=>a+r[1].n,0)}]);
  return fig({title:rows.length?`${rows[0][0]} took most of your training time`:'Workouts',span:5,sub:'Total hours by workout type.',h:Math.max(170,top.length*34+30),
    draw(g,w,h,f){
      if(!top.length)return emptyPlot(g,w,h,'No workouts in this selection.');
      const b={l:Math.min(150,w*.42),r:w-58,t:4,b:h-4},rh=(b.b-b.t)/top.length,mx=top[0][1].m,xs=sc(0,mx,b.l,b.r);
      top.forEach(([n,o],i)=>{const y=b.t+i*rh;txt(g,n,b.l-8,y+rh/2,{a:'right',b:'middle',c:T.ink2});g.fillStyle=T.s1;g.beginPath();g.roundRect(b.l,y+rh*.18,Math.max(2,xs(o.m)-b.l),rh*.64,[0,4,4,0]);g.fill();txt(g,`${fmtN(o.m/60,o.m<600?1:0)}h`,xs(o.m)+6,y+rh/2,{b:'middle',c:T.ink2})});
      f.hit=(x,y)=>{const i=Math.floor((y-b.t)/rh);if(i<0||i>=top.length)return null;return{title:top[i][0],rows:[{v:dur(top[i][1].m),l:'total'},{v:String(top[i][1].n),l:'sessions'}],rect:[0,b.t+i*rh,w,rh]}};
      f.keys=top.map((_,i)=>[b.l+10,b.t+(i+.5)*rh]);
    },
    table:()=>({cols:['Type','Sessions','Hours'],rows:rows.map(([n,o])=>[n,o.n,fmtN(o.m/60,1)])})});
}
function figEconomy(){
  const usable=workoutsIn().filter(w=>w.dist>400&&w.dur>8).map(w=>{const h=workoutHr(w);return{d:w.s/DAY,v:w.dist/(h.avg*w.dur),w,h}}).filter(p=>Number.isFinite(p.v)).reverse();
  const top=modeOf(usable.map(p=>p.w.type)),pts=usable.filter(p=>p.w.type===top),t=St.ols(pts.map(p=>p.d),pts.map(p=>p.v));
  const rate=t?t.m*30/(St.mean(pts.map(p=>p.v))||1)*100:0;
  return fig({title:t&&pts.length>=5?(Math.abs(rate)<1?`${sportName(top)}: distance per heartbeat is holding steady`:`${sportName(top)}: distance per heartbeat is ${rate>0?'improving':'slipping'} by ${fmtN(Math.abs(rate),1)}% a month`):'Metres per heartbeat',span:7,sub:'Metres covered per heartbeat for your most common distance workout. Higher means you cover more ground for the same cardiac work.',h:250,
    draw(g,w,h,f){
      if(pts.length<3)return emptyPlot(g,w,h,'Needs three workouts with distance and heart rate.');
      const v=pts.map(p=>p.v),lo=Math.min(...v)*.92,hi=Math.max(...v)*1.08,tk=nice(lo,hi,4),b={l:40,r:w-8,t:10,b:h-24},ys=sc(lo,hi,b.b,b.t),xs=sc(F.from,F.to,b.l,b.r);
      yAxis(g,b,ys,tk,x=>fmtN(x,2));tAxis(g,b,xs,F.from,F.to);
      for(const p of pts){g.fillStyle=T.s1;g.strokeStyle=T.ground;g.lineWidth=2;g.beginPath();g.arc(xs(p.d),ys(p.v),4.5,0,7);g.fill();g.stroke()}
      if(t){g.strokeStyle=T.ink2;g.lineWidth=2;g.beginPath();g.moveTo(b.l,ys(t.m*F.from+t.c));g.lineTo(b.r,ys(t.m*F.to+t.c));g.stroke()}
      f.hit=(x,y)=>{let n=null,bd=900;for(const p of pts){const e=(xs(p.d)-x)**2+(ys(p.v)-y)**2;if(e<bd){bd=e;n=p}}if(!n)return null;return{title:`${sportName(n.w.type)}, ${fmtD(Math.floor(n.d))}`,rows:[{v:`${fmtN(n.v,2)} m`,l:'per heartbeat',c:T.s1},{v:`${fmtN(n.h.avg)} bpm`,l:'average'},{v:`${fmtN(n.w.dist*kmf(),1)} ${CFG.units}`}],pts:[{x:xs(n.d),y:ys(n.v),c:T.s1}]}};
      f.keys=pts.map(p=>[xs(p.d),ys(p.v)]);
    },
    table:()=>({cols:['Date','Type','Metres per beat'],rows:pts.map(p=>[ds(Math.floor(p.d)),sportName(p.w.type),fmtN(p.v,2)])})});
}
const shortL=id=>MI[id].l.replace(' heart rate',' HR').replace('Heart rate variability','HRV').replace(' duration','').replace(' sleep','').replace('Training impulse','Training').replace('Sleep efficiency','Efficiency').replace('Brisk minutes','Brisk');
function figCorr(){
  const ids=['rhr','hrv','stress','ready','sleep','deep','rem','eff','mid','nap','steps','brisk','trimp','pai'].filter(id=>has(id)&&St.sd(col(id,S.idx))>0).slice(0,12),n=ids.length,L=UI.corrLag;
  const cells=[];
  for(let a=0;a<n;a++)for(let b=0;b<n;b++){
    if(!L&&a===b){cells.push(null);continue}
    const x=[],y=[];for(const i of S.idx){const k=i+L;if(k<R.n){x.push(R.c[ids[a]][i]);y.push(R.c[ids[b]][k])}}
    cells.push({a,b,...St.spearman(x,y)});
  }
  const list=cells.filter(c=>c&&(L||c.a<c.b)),qs=St.bh(list.map(c=>c.p));list.forEach((c,i)=>{c.q=qs[i]});
  if(!L)for(const c of cells)if(c&&c.a>c.b)c.q=cells[c.b*n+c.a].q;
  const passed=list.filter(c=>c.q<.05).length;
  return fig({title:`${passed} of ${list.length} pairs survive correction for multiple testing`,span:7,sub:'Rank correlation, discounted for how much each day resembles the last. A dot marks a pair that passes a 5% false-discovery rate. Click a square to explore it.',
    controls:el('div',{class:'ctrl'},seg([[0,'Same day'],[1,'Row today, column tomorrow']],L,v=>{UI.corrLag=v;render()},'Correlation lag')),
    h:w=>w<560?w*.85+66:clamp(w*.72,300,560),
    draw(g,w,h,f){
      if(n<2)return emptyPlot(g,w,h,'Needs at least two metrics.');
      g.font=`400 12px ${FONT}`;
      const lw=Math.ceil(Math.max(...ids.map(i=>g.measureText(shortL(i)).width)))+8,top=62,cs=Math.min((w-lw-4)/n,(h-top-4)/n);
      ids.forEach((id,i)=>{txt(g,shortL(id),lw-6,top+(i+.5)*cs,{a:'right',b:'middle',c:T.ink2});g.save();g.translate(lw+(i+.5)*cs,top-5);g.rotate(-Math.PI/4);txt(g,shortL(id),0,0,{b:'middle',c:T.ink2});g.restore()});
      cells.forEach(k=>{if(!k||!Number.isFinite(k.r))return;const x=lw+k.b*cs,y=top+k.a*cs;g.fillStyle=divColor(k.r);g.fillRect(x+1,y+1,cs-2,cs-2);if(k.q<.05){g.fillStyle=Math.abs(k.r)>.5?'#fff':T.ink;g.beginPath();g.arc(x+cs/2,y+cs/2,2.5,0,7);g.fill()}});
      for(let i=0;i<64;i++){g.fillStyle=divColor(i/31.5-1);g.fillRect(i*1.2,12,1.5,10)}txt(g,'−1',0,34,{s:11});txt(g,'0',38,34,{s:11,a:'center'});txt(g,'+1',76,34,{s:11,a:'right'});
      f.pos={lw,top,cs};
      f.hit=(x,y)=>{const b=Math.floor((x-lw)/cs),a=Math.floor((y-top)/cs);if(a<0||b<0||a>=n||b>=n)return null;const k=cells[a*n+b];if(!k)return null;return{title:`${MI[ids[a]].l}${L?' today':''} and ${MI[ids[b]].l.toLowerCase()}${L?' tomorrow':''}`,rows:[{v:Number.isFinite(k.r)?sign(k.r,2):'–',l:'rank correlation'},{v:String(k.n),l:'paired days'},{v:Number.isFinite(k.q)?k.q<.001?'below 0.001':fmtN(k.q,3):'–',l:'adjusted p'}],rect:[lw+b*cs,top+a*cs,cs,cs]}};
      for(let a=0;a<n;a++)for(let b=0;b<n;b++)f.keys.push([lw+(b+.5)*cs,top+(a+.5)*cs]);
    },
    onclick(x,y,f){const{lw,top,cs}=f.pos,b=Math.floor((x-lw)/cs),a=Math.floor((y-top)/cs);if(a>=0&&b>=0&&a<n&&b<n&&a!==b){UI.x=ids[a];UI.y=ids[b];UI.lag=L;setTimeout(render)}},
    table:()=>({cols:['First','Second','Correlation','Days','Adjusted p'],rows:list.slice().sort((p,q)=>p.p-q.p).map(c=>[MI[ids[c.a]].l,MI[ids[c.b]].l,sign(c.r,2),c.n,fmtN(c.q,3)])})});
}
function figScatter(){
  if(!has(UI.x))UI.x=R.avail[0];if(!has(UI.y))UI.y=R.avail[1]||R.avail[0];
  const X=UI.x,Y=UI.y,L=UI.lag,pts=[];
  for(const i of S.idx){const k=i+L;if(k<0||k>=R.n)continue;const a=R.c[X][i],b=R.c[Y][k];if(Number.isFinite(a)&&Number.isFinite(b))pts.push({a,b,d:R.dn[i],we:wd(R.dn[i])>=5})}
  const s=St.spearman(pts.map(p=>p.a),pts.map(p=>p.b)),t=St.ols(pts.map(p=>p.a),pts.map(p=>p.b));
  const strength=Math.abs(s.r)<.1?'barely tracks':Math.abs(s.r)<.3?'weakly tracks':Math.abs(s.r)<.5?'moderately tracks':'strongly tracks';
  const title=Number.isFinite(s.r)?`${MI[X].l} ${strength} ${L===0?'':L>0?`${L===1?'the next day’s':`${L} days later`} `:`${-L} days earlier `}${MI[Y].l.toLowerCase()}`:'Pick two metrics';
  return fig({title,span:12,sub:Number.isFinite(s.r)?`Rank correlation ${sign(s.r,2)}, p ${s.p<.001?'below 0.001':fmtN(s.p,3)}, ${pts.length} days. An association in your data, which cannot show cause.`:'',
    controls:el('div',{class:'ctrl'},el('span',null,'Compare'),pick(metricOpts(),X,v=>{UI.x=v;render()},'First metric'),el('span',null,'with'),pick(metricOpts(),Y,v=>{UI.y=v;render()},'Second metric'),
      pick([-3,-2,-1,0,1,2,3,7].map(k=>[String(k),k===0?'the same day':k>0?`${k} day${k>1?'s':''} later`:`${-k} day${k<-1?'s':''} earlier`]),String(L),v=>{UI.lag=+v;render()},'Lag')),
    h:360,
    draw(g,w,h,f){
      if(pts.length<8)return emptyPlot(g,w,h,'Too few paired days. Try a wider date range.');
      const[x0,x1]=[St.quant(pts.map(p=>p.a),0),St.quant(pts.map(p=>p.a),1)],[y0,y1]=[St.quant(pts.map(p=>p.b),0),St.quant(pts.map(p=>p.b),1)];
      const px=(x1-x0)*.06||1,py=(y1-y0)*.08||1,tx=ticksFor(X,x0-px,x1+px),ty=ticksFor(Y,y0-py,y1+py),fx=axisFmt(X),fy=axisFmt(Y),b={l:labelW(g,ty,fy),r:w-10,t:w<460?44:26,b:h-40},xs=sc(x0-px,x1+px,b.l,b.r),ys=sc(y0-py,y1+py,b.b,b.t);
      yAxis(g,b,ys,ty,fy);g.strokeStyle=T.line;g.beginPath();g.moveTo(b.l,b.b+.5);g.lineTo(b.r,b.b+.5);g.stroke();
      for(const v of tx)txt(g,fx(v),xs(v),b.b+15,{a:'center'});
      txt(g,MI[X].l+(MI[X].u?` (${MI[X].u})`:''),(b.l+b.r)/2,h-6,{a:'center',c:T.ink2});
      if(t){g.fillStyle=rgba(T.ink3,.16);g.beginPath();const st=40,us=[];for(let i=0;i<=st;i++)us.push(x0+(x1-x0)*i/st);us.forEach((u,i)=>{const y=ys(t.m*u+t.c+t.band(u));i?g.lineTo(xs(u),y):g.moveTo(xs(u),y)});us.reverse().forEach(u=>g.lineTo(xs(u),ys(t.m*u+t.c-t.band(u))));g.closePath();g.fill()}
      for(const p of pts){g.fillStyle=rgba(p.we?T.s2:T.s1,.72);g.beginPath();g.arc(xs(p.a),ys(p.b),3.2,0,7);g.fill()}
      if(t){g.strokeStyle=T.ink;g.lineWidth=2;g.beginPath();g.moveTo(xs(x0),ys(t.m*x0+t.c));g.lineTo(xs(x1),ys(t.m*x1+t.c));g.stroke()}
      legend(g,[{l:'Weekday',c:T.s1},{l:'Weekend',c:T.s2},{l:'Linear fit, 95% band',c:T.ink,kind:'line'}],b.l,10,{max:w});
      txt(g,`Up: ${MI[Y].l}${L?` ${L>0?`${L}d later`:`${-L}d earlier`}`:''}`,b.r,w<460?28:10,{a:'right',b:'middle',c:T.ink2});
      f.hit=(x,y)=>{let n=null,bd=1600;for(const p of pts){const e=(xs(p.a)-x)**2+(ys(p.b)-y)**2;if(e<bd){bd=e;n=p}}if(!n)return null;return{title:fmtDW(n.d),rows:[{v:fmtM(X,n.a),l:MI[X].l,c:n.we?T.s2:T.s1},{v:fmtM(Y,n.b),l:MI[Y].l}],pts:[{x:xs(n.a),y:ys(n.b),c:n.we?T.s2:T.s1}]}};
      f.keys=pts.map(p=>[xs(p.a),ys(p.b)]);
    },
    table:()=>({cols:['Date',MI[X].l,MI[Y].l],rows:pts.map(p=>[ds(p.d),fmtM(X,p.a),fmtM(Y,p.b)])})});
}
function figLag(){
  const X=UI.x,Y=UI.y,lags=[];for(let k=-7;k<=7;k++){const a=[],b=[];for(const i of S.idx){const q=i+k;if(q>=0&&q<R.n){a.push(R.c[X][i]);b.push(R.c[Y][q])}}lags.push({k,...St.spearman(a,b)})}
  const qs=St.bh(lags.map(l=>l.p));lags.forEach((l,i)=>l.q=qs[i]);
  const best=lags.filter(l=>l.q<.05).sort((a,b)=>Math.abs(b.r)-Math.abs(a.r))[0];
  return fig({title:best?`The link is strongest ${best.k===0?'on the same day':best.k>0?`with ${MI[Y].l.toLowerCase()} ${best.k} day${best.k>1?'s':''} later`:`with ${MI[Y].l.toLowerCase()} ${-best.k} day${best.k<-1?'s':''} earlier`}`:'No offset stands out from chance',span:12,sub:'Correlation at each offset, from a week before to a week after. Solid bars pass a 5% false-discovery rate.',h:210,
    draw(g,w,h,f){
      const m=Math.max(.2,...lags.map(l=>Math.abs(l.r)||0))*1.1,tk=nice(-m,m,4),b={l:40,r:w-8,t:8,b:h-24},ys=sc(-m,m,b.b,b.t),cw=(b.r-b.l)/15;
      yAxis(g,b,ys,tk,v=>fmtN(v,1));
      lags.forEach((l,i)=>{const x=b.l+i*cw+cw*.2,bw=cw*.6;txt(g,(l.k>0?'+':'')+l.k,x+bw/2,b.b+16,{a:'center'});if(!Number.isFinite(l.r))return;const y=ys(Math.max(0,l.r)),hh=Math.abs(ys(l.r)-ys(0));
        if(l.q<.05){g.fillStyle=T.s1;g.fillRect(x,y,bw,hh)}else{g.strokeStyle=T.s1;g.lineWidth=1.5;g.strokeRect(x+.75,y+.75,bw-1.5,Math.max(0,hh-1.5))}});
      g.strokeStyle=T.ink3;g.lineWidth=1;g.beginPath();g.moveTo(b.l,ys(0));g.lineTo(b.r,ys(0));g.stroke();
      f.hit=x=>{const i=Math.floor((x-b.l)/cw);if(i<0||i>14)return null;const l=lags[i];return{title:l.k===0?'Same day':`${Math.abs(l.k)} day${Math.abs(l.k)>1?'s':''} ${l.k>0?'later':'earlier'}`,rows:[{v:Number.isFinite(l.r)?sign(l.r,2):'–',l:'rank correlation',c:T.s1},{v:String(l.n),l:'paired days'}],rect:[b.l+i*cw,b.t,cw,b.b-b.t]}};
      f.keys=lags.map((_,i)=>[b.l+(i+.5)*cw,(b.t+b.b)/2]);
    },
    table:()=>({cols:['Offset (days)','Correlation','Days','Adjusted p'],rows:lags.map(l=>[l.k,sign(l.r,2),l.n,fmtN(l.q,3)])})});
}
function figForest(){
  const tags=[...new Set([...D.tags.values()].flat())].sort();
  const opts=[['weekend','Weekends'],['workout','Workout days'],...tags.map(t=>['tag:'+t,t])];
  if(!opts.some(o=>o[0]===UI.forest))UI.forest=opts.find(o=>o[0].startsWith('tag:'))?.[0]||'weekend';
  const key=UI.forest,sh=UI.forestShift,wdays=new Set([...D.workouts.values()].map(w=>Math.floor(w.s/DAY)));
  const inGroup=d=>key==='weekend'?wd(d)>=5:key==='workout'?wdays.has(d):(D.tags.get(d)||[]).includes(key.slice(4));
  const ids=['rhr','nightHr','hrv','hrvN','stress','ready','sleep','deep','rem','eff','bed','steps','brisk'].filter(has);
  const rows=[];
  for(const id of ids){const a=[],b=[];for(const i of S.idx){const k=i+sh;if(k>=R.n)continue;(inGroup(R.dn[i])?a:b).push(R.c[id][k])}
    const rho=clamp(St.lag1(St.fin(col(id,S.idx))),0,.8),h=St.hedges(a,b,rho);if(h)rows.push({id,...h})}
  rows.sort((a,b)=>Math.abs(b.g)-Math.abs(a.g));
  const clear=rows.filter(r=>r.lo>0||r.hi<0),name=opts.find(o=>o[0]===key)[1];
  return fig({title:clear.length?`${name} go${/s$/.test(name)?'':'es'} with a clear change in ${clear.length} measure${clear.length>1?'s':''}, led by ${MI[clear[0].id].l.toLowerCase()}`:`No clear difference on ${name.toLowerCase()} in this selection`,span:12,sub:'Standardised difference against all other days, with a 95% interval widened for day-to-day dependence. Intervals that miss zero are solid.',
    controls:el('div',{class:'ctrl'},el('span',null,'Compare'),pick(opts,key,v=>{UI.forest=v;render()},'Group'),seg([[0,'On the day'],[1,'The day after']],sh,v=>{UI.forestShift=v;render()},'Timing')),
    h:Math.max(180,rows.length*29+34),
    draw(g,w,h,f){
      if(!rows.length)return emptyPlot(g,w,h,'Too few days in one of the groups. Tag more days on the Records page.');
      const lw=Math.min(190,w*.3),rw=Math.min(120,w*.21),m=Math.max(1,...rows.map(r=>Math.max(Math.abs(r.lo),Math.abs(r.hi))))*1.05,b={l:lw,r:w-rw,t:4,b:h-24},xs=sc(-m,m,b.l,b.r),rh=(b.b-b.t)/rows.length;
      for(const t of nice(-m,m,6)){const p=Math.round(xs(t))+.5;g.strokeStyle=t?T.grid:T.ink3;g.lineWidth=1;g.beginPath();g.moveTo(p,b.t);g.lineTo(p,b.b);g.stroke();txt(g,fmtN(t,1),p,b.b+16,{a:'center'})}
      rows.forEach((r,i)=>{const y=b.t+(i+.5)*rh,solid=r.lo>0||r.hi<0;txt(g,w<560?shortL(r.id):MI[r.id].l,lw-8,y,{a:'right',b:'middle',c:T.ink2});
        g.strokeStyle=solid?T.s1:T.ink3;g.lineWidth=2;g.beginPath();g.moveTo(xs(r.lo),y);g.lineTo(xs(r.hi),y);g.stroke();
        g.fillStyle=solid?T.s1:T.ground;g.strokeStyle=solid?T.ground:T.ink3;g.beginPath();g.arc(xs(r.g),y,5,0,7);g.fill();g.stroke();
        txt(g,fmtDelta(r.id,r.diff),w,y,{a:'right',b:'middle',c:T.ink2})});
      f.hit=(x,y)=>{const i=Math.floor((y-b.t)/rh);if(i<0||i>=rows.length)return null;const r=rows[i];return{title:MI[r.id].l,rows:[{v:fmtDelta(r.id,r.diff),l:'difference',c:T.s1},{v:`${fmtN(r.g,2)} (${fmtN(r.lo,2)} to ${fmtN(r.hi,2)})`,l:'effect size'},{v:`${r.n1} against ${r.n2}`,l:'days'}],rect:[0,b.t+i*rh,w,rh]}};
      f.keys=rows.map((_,i)=>[lw,b.t+(i+.5)*rh]);
    },
    table:()=>({cols:['Measure','Difference','Effect size','Lower','Upper','Days in group'],rows:rows.map(r=>[MI[r.id].l,fmtDelta(r.id,r.diff),fmtN(r.g,2),fmtN(r.lo,2),fmtN(r.hi,2),r.n1])})});
}
