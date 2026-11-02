/* Small canvas chart kit. Every figure supports hover, keyboard, a data table and PNG export. */
let T={};
function readTheme(){
  const s=getComputedStyle(document.documentElement),v=n=>s.getPropertyValue('--'+n).trim();
  T={};for(const k of['ground','raised','sunk','ink','ink2','ink3','line','grid','act','plate','plate-ink','plate-ink2','plate-line','s1','s2','s3','s4','s5','s6','awake','rem','light','deep','good','warn','bad','divA','divB','divM'])T[k]=v(k);
}
const stageColor=g=>[null,T.light,T.deep,T.rem,T.awake][g];
const FONT='"Zg Text",system-ui,sans-serif',DISP='"Zg Display","Zg Text",sans-serif';
const hex2=h=>{const n=parseInt(h.slice(1),16);return[n>>16&255,n>>8&255,n&255]};
const rgba=(h,a)=>{const[r,g,b]=hex2(h);return`rgba(${r},${g},${b},${a})`};
function oklch(L,C,H){
  const a=C*Math.cos(H*Math.PI/180),b=C*Math.sin(H*Math.PI/180);
  const l=(L+.3963377774*a+.2158037573*b)**3,m=(L-.1055613458*a-.0638541728*b)**3,s=(L-.0894841775*a-1.291485548*b)**3;
  const f=x=>{x=clamp(x,0,1);return Math.round(255*(x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055))};
  return[f(4.0767416621*l-3.3077115913*m+.2309699292*s),f(-1.2684380046*l+2.6097574011*m-.3413193965*s),f(-.0041960863*l-.7034186147*m+1.707614701*s)];
}
/* single-hue sequential ramps for the dark plate */
const ramp=(H,L0=.25,L1=.95,Cm=.17)=>Array.from({length:256},(_,i)=>{const t=i/255;return oklch(L0+(L1-L0)*t,.05+Cm*Math.sin(Math.PI*Math.min(1,t*1.15)*.8),H)});
const EMBER=ramp(58),TEAL=ramp(170,.25,.93,.13);
/* light-surface sequential scale for calendars and matrices, read from the theme */
function seqColor(t,hue=250){
  const dark=document.documentElement.dataset.resolved==='dark';
  const[r,g,b]=dark?oklch(.3+.58*t,.03+.13*t,hue):oklch(.93-.55*t,.02+.14*t,hue);return`rgb(${r},${g},${b})`;
}
function divColor(t){const[a,m,b]=[hex2(T.divA),hex2(T.divM),hex2(T.divB)],p=t<0?a:b,k=Math.min(1,Math.abs(t))**.8;return`rgb(${m.map((v,i)=>Math.round(v+(p[i]-v)*k)).join(',')})`}
const sc=(d0,d1,r0,r1)=>{const k=(r1-r0)/((d1-d0)||1),f=v=>r0+(v-d0)*k;f.inv=p=>d0+(p-r0)/k;return f};
function nice(a,b,n=5){
  if(!(b>a)){a-=1;b+=1}
  const raw=(b-a)/n,mag=10**Math.floor(Math.log10(raw)),st=[1,2,2.5,5,10].map(x=>x*mag).find(x=>x>=raw*.95)||10*mag;
  const o=[];for(let v=Math.ceil(a/st-1e-9)*st;v<=b+1e-9;v+=st)o.push(+v.toFixed(8));return o;
}
function clockTicks(a,b){const sp=b-a,st=sp>600?180:sp>300?120:sp>120?60:sp>50?30:15,o=[];for(let v=Math.ceil(a/st)*st;v<=b;v+=st)o.push(v);return o}
function txt(c,s,x,y,o={}){c.font=`${o.w||400} ${o.s||12}px ${o.f||FONT}`;c.fillStyle=o.c||T.ink3;c.textAlign=o.a||'left';c.textBaseline=o.b||'alphabetic';c.fillText(s,x,y)}
function yAxis(c,b,y,ticks,fmt,o={}){
  c.lineWidth=1;
  for(const t of ticks){const p=Math.round(y(t))+.5;c.strokeStyle=o.line||T.grid;c.beginPath();c.moveTo(b.l,p);c.lineTo(b.r,p);c.stroke();txt(c,fmt(t),b.l-7,p,{a:'right',b:'middle',c:o.ink||T.ink3})}
}
function tAxis(c,b,x,a,z,o={}){
  const sp=z-a,w=b.r-b.l,ink=o.ink||T.ink3;
  c.strokeStyle=o.line||T.line;c.lineWidth=1;c.beginPath();c.moveTo(b.l,b.b+.5);c.lineTo(b.r,b.b+.5);c.stroke();
  let lastX=-1e9;
  const put=(d,s)=>{const p=x(d);if(p<b.l-1||p>b.r+1)return;const wd2=(s.length*3.6);if(p-wd2<lastX+10||p+wd2>b.r+6)return;txt(c,s,Math.max(b.l,p),b.b+16,{a:p<b.l+8?'left':'center',c:ink});lastX=p+wd2};
  if(sp<=45){const st=sp<=16?2:7;for(let d=a;d<=z;d++)if(sp<=16?((d-a)%st===0):wd(d)===0)put(d,fmtDS(d))}
  else{const months=[];for(let d=a;d<=z;d++)if(dparts(d).d===1)months.push(d);
    const every=Math.max(1,Math.ceil(months.length/(w/62)));
    months.forEach((d,i)=>{const p=dparts(d);if(i%every===0)put(d,p.m===0||i===0?`${MON[p.m]} ${p.y}`:MON[p.m])})}
}
function legend(c,items,x,y,o={}){
  c.textBaseline='middle';const x0=x;
  for(const it of items){
    c.font=`400 12px ${FONT}`;
    const tw=c.measureText(it.l).width;
    if(o.max&&x>x0&&x+21+tw>o.max){x=x0;y+=18}
    if(it.kind==='line'){c.strokeStyle=it.c;c.lineWidth=2;c.setLineDash(it.dash||[]);c.beginPath();c.moveTo(x,y);c.lineTo(x+16,y);c.stroke();c.setLineDash([])}
    else if(it.kind==='ring'){c.strokeStyle=it.c;c.lineWidth=2;c.beginPath();c.arc(x+7,y,4,0,7);c.stroke()}
    else{c.fillStyle=it.c;c.fillRect(x,y-5,16,10)}
    c.fillStyle=o.ink||T.ink2;c.textAlign='left';c.fillText(it.l,x+21,y);x+=21+tw+14;
  }
}
function roundTop(c,x,y,w,h,r){r=Math.min(r,w/2,Math.abs(h));c.beginPath();c.moveTo(x,y+h);c.lineTo(x,y+r);c.arcTo(x,y,x+r,y,r);c.arcTo(x+w,y,x+w,y+r,r);c.lineTo(x+w,y+h);c.closePath();c.fill()}
function path(c,xs,ys){let on=false;c.beginPath();for(let i=0;i<xs.length;i++){if(Number.isFinite(ys[i])){on?c.lineTo(xs[i],ys[i]):c.moveTo(xs[i],ys[i]);on=true}else on=false}c.stroke()}
function area(c,xs,lo,hi){let i=0;const n=xs.length;
  while(i<n){while(i<n&&!Number.isFinite(lo[i]))i++;let j=i;while(j<n&&Number.isFinite(lo[j]))j++;
    if(j>i+1){c.beginPath();c.moveTo(xs[i],hi[i]);for(let k=i+1;k<j;k++)c.lineTo(xs[k],hi[k]);for(let k=j-1;k>=i;k--)c.lineTo(xs[k],lo[k]);c.closePath();c.fill()}i=j}}

const tipEl=()=>$('#tip');
function showTip(px,py,t){
  const e=tipEl();e.replaceChildren();
  if(t.title)e.append(el('div',{class:'t'},t.title));
  for(const r of t.rows||[]){const i=el('i');if(r.c)i.style.background=r.c;e.append(el('div',{class:'r'},r.c?i:null,el('b',null,r.v),r.l?el('span',null,r.l):null))}
  e.hidden=false;
  const w=e.offsetWidth,h=e.offsetHeight;
  e.style.left=clamp(px+14+w>innerWidth-8?px-w-14:px+14,6,innerWidth-w-6)+'px';
  e.style.top=clamp(py-h-10<6?py+16:py-h-10,6,innerHeight-h-6)+'px';
}
const hideTip=()=>{tipEl().hidden=true};

const FIGS=[];
function fig(o){
  const c=el('canvas',{tabIndex:0,role:'img'}),ov=el('canvas',{class:'ov','aria-hidden':'true'}),wrap=el('div',{class:'pw'},c,ov);
  const f={o,c,ov,wrap,hit:null,keys:[],ki:-1,last:0};
  const tw=el('div',{class:'tw',hidden:true});
  const tb=el('button',{type:'button','aria-expanded':'false',onclick:()=>{
    tw.hidden=!tw.hidden;tb.setAttribute('aria-expanded',String(!tw.hidden));tb.textContent=tw.hidden?'Table':'Hide table';
    if(!tw.hidden&&o.table){const t=o.table();tw.replaceChildren(el('table',null,el('thead',null,el('tr',null,t.cols.map(x=>el('th',null,x)))),el('tbody',null,t.rows.slice(0,1500).map(r=>el('tr',null,r.map(x=>el('td',null,x)))))))}
  }},'Table');
  const head=el('div',{class:'fh'},el('div',null,el('h3',null,o.title),o.sub?el('div',{class:'sub'},o.sub):null),
    el('div',{class:'fa'},o.table?tb:null,el('button',{type:'button',onclick:()=>exportFig(f),title:'Save this chart as a PNG'},'Save image')));
  f.node=el('figure',{class:o.span?`c${o.span}`:'c12'},head,o.controls||null,wrap,tw);
  if(o.className)wrap.classList.add(o.className);
  const draw=()=>drawFig(f);
  f.ro=new ResizeObserver(es=>{const w=Math.round(es[0].contentRect.width);if(w&&w!==f.last){f.last=w;draw()}});
  f.ro.observe(wrap);
  const toCss=e=>{const r=c.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top]};
  const show=(x,y,cx,cy)=>{
    const h=f.hit&&f.hit(x,y),g=ov.getContext('2d'),dpr=devicePixelRatio||1;
    g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,ov.width,ov.height);
    if(!h){hideTip();return}
    if(h.cross!=null){g.strokeStyle=o.plate?T['plate-ink2']:T.ink3;g.lineWidth=1;g.beginPath();g.moveTo(h.cross+.5,h.y0??0);g.lineTo(h.cross+.5,h.y1??c.clientHeight);g.stroke()}
    if(h.rect){g.strokeStyle=o.plate?T['plate-ink']:T.ink;g.lineWidth=1.5;g.strokeRect(...h.rect)}
    for(const p of h.pts||[]){g.fillStyle=p.c;g.strokeStyle=o.plate?T.plate:T.ground;g.lineWidth=2;g.beginPath();g.arc(p.x,p.y,4.5,0,7);g.fill();g.stroke()}
    showTip(cx,cy,h);
  };
  c.addEventListener('pointermove',e=>{if(o.brush&&f.drag){o.brush.move(f,toCss(e)[0]);return}const[x,y]=toCss(e);show(x,y,e.clientX,e.clientY)});
  c.addEventListener('pointerleave',e=>{if(e.pointerType==='touch')return;hideTip();ov.getContext('2d').clearRect(0,0,ov.width,ov.height)});
  c.addEventListener('pointercancel',()=>{hideTip();ov.getContext('2d').clearRect(0,0,ov.width,ov.height)});
  if(!o.brush)c.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'){const[x,y]=toCss(e);show(x,y,e.clientX,e.clientY)}});
  c.addEventListener('blur',hideTip);
  if(o.onclick)c.addEventListener('click',e=>{if(f.moved)return;const[x,y]=toCss(e);o.onclick(x,y,f)});
  if(o.brush){
    c.addEventListener('pointerdown',e=>{f.drag=true;f.moved=false;c.setPointerCapture(e.pointerId);o.brush.start(f,toCss(e)[0]);hideTip()});
    c.addEventListener('pointerup',e=>{if(f.drag){f.drag=false;o.brush.end(f,toCss(e)[0]);if(!f.moved&&e.pointerType==='touch'){const[x,y]=toCss(e);show(x,y,e.clientX,e.clientY)}}});
  }
  c.addEventListener('keydown',e=>{
    if(!f.keys.length)return;
    const d=e.key==='ArrowRight'||e.key==='ArrowDown'?1:e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:0;if(!d)return;
    e.preventDefault();f.ki=clamp(f.ki<0?0:f.ki+d,0,f.keys.length-1);
    const[x,y]=f.keys[f.ki],r=c.getBoundingClientRect();show(x,y,r.left+x,r.top+y);
  });
  FIGS.push(f);
  return f;
}
function drawFig(f){
  const w=f.last||f.wrap.clientWidth;if(!w)return;
  const h=typeof f.o.h==='function'?f.o.h(w):f.o.h||260,dpr=Math.min(devicePixelRatio||1,3);
  for(const k of[f.c,f.ov]){k.width=Math.round(w*dpr);k.height=Math.round(h*dpr);k.style.height=h+'px'}
  const g=f.c.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);
  f.hit=null;f.keys=[];f.ki=-1;
  try{f.o.draw(g,w,h,f)}catch(e){console.error(e);txt(g,'This chart could not be drawn from the current selection.',8,20,{c:T.ink3})}
  f.c.setAttribute('aria-label',`${f.o.title}. ${f.o.summary||f.o.sub||''}`);
}
function emptyPlot(c,w,h,msg){txt(c,msg,0,24,{c:T.ink3,s:14})}
const wrapText=(g,s,maxW)=>{const out=[];let l='';for(const w of s.split(' ')){const t=l?l+' '+w:w;if(g.measureText(t).width>maxW&&l){out.push(l);l=w}else l=t}if(l)out.push(l);return out};
function filterLine(){
  const p=[`${fmtD(F.from)} to ${fmtD(F.to)}`];
  if(F.wds.some(x=>!x))p.push(WD.filter((_,i)=>F.wds[i]).join(' '));
  if(F.tag)p.push(`tag: ${F.tag}`);
  for(const q of F.conds)p.push(`${MI[q.m].l} ${q.op==='>'?'at least':'at most'} ${fmtM(q.m,q.v)}`);
  return p.join(', ');
}
function renderFigCanvas(f,W=1200,scale=2){
  const o=f.o,h=typeof o.h==='function'?o.h(W):o.h||260;
  const m=document.createElement('canvas').getContext('2d');m.font=`600 26px ${DISP}`;
  const pad=36,tl=wrapText(m,o.title,W-pad*2);m.font=`400 15px ${FONT}`;const sl=o.sub?wrapText(m,o.sub,W-pad*2):[];
  const top=pad+tl.length*31+sl.length*21+16,H=top+h+56;
  const cv=document.createElement('canvas');cv.width=(W)*scale;cv.height=H*scale;
  const g=cv.getContext('2d');g.scale(scale,scale);
  g.fillStyle=T.ground;g.fillRect(0,0,W,H);
  let y=pad;g.textBaseline='top';g.textAlign='left';g.fillStyle=T.ink;g.font=`600 26px ${DISP}`;for(const l of tl){g.fillText(l,pad,y);y+=31}
  g.font=`400 15px ${FONT}`;g.fillStyle=T.ink3;for(const l of sl){g.fillText(l,pad,y);y+=21}
  const pc=document.createElement('canvas'),iw=W-pad*2;pc.width=iw*scale;pc.height=h*scale;
  const pg=pc.getContext('2d');pg.scale(scale,scale);
  const shim={...f,keys:[],hit:null};o.draw(pg,iw,h,shim);
  g.drawImage(pc,pad,top,iw,h);
  g.textBaseline='alphabetic';g.font=`400 12px ${FONT}`;g.fillStyle=T.ink3;
  g.fillText(`Zeitgeber. ${filterLine()}${CFG.sample?'. Sample data.':'.'}`,pad,H-20);
  return cv;
}
async function exportFig(f){
  const cv=renderFigCanvas(f);
  const b=await new Promise(r=>cv.toBlob(r,'image/png'));
  saveFile(`zeitgeber-${f.o.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,48)}.png`,b);
  toast('Image saved. It is not encrypted, so keep it somewhere private.');
}
async function exportSheet(name){
  const list=FIGS.filter(f=>f.node.isConnected&&f.wrap.offsetParent!==null).map(f=>renderFigCanvas(f));
  if(!list.length)return;
  const W0=list[0].width,H0=list.reduce((a,c)=>a+c.height,0),k=Math.min(1,Math.sqrt(16e6/(W0*H0)),16000/H0);
  const s=document.createElement('canvas');s.width=Math.round(W0*k);s.height=Math.round(H0*k);
  const g=s.getContext('2d');g.scale(k,k);let y=0;for(const c of list){g.drawImage(c,0,y);y+=c.height}
  const b=await new Promise(r=>s.toBlob(r,'image/png'));
  if(!b){toast('This device could not build an image that large. Save charts one at a time.');return}
  saveFile(`zeitgeber-${name}-${ds(F.to)}.png`,b);toast('Page saved as one image. It is not encrypted, so keep it somewhere private.');
}
