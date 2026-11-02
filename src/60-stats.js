/* Statistics. NaN marks a missing value everywhere. */
const St=(()=>{
  const fin=a=>{const o=[];for(const v of a)if(Number.isFinite(v))o.push(v);return o};
  const mean=a=>{let s=0,c=0;for(const v of a)if(Number.isFinite(v)){s+=v;c++}return c?s/c:NaN};
  const q=(s,p)=>{if(!s.length)return NaN;const h=(s.length-1)*p,l=Math.floor(h);return s[l]+(h-l)*((s[Math.min(l+1,s.length-1)])-s[l])};
  const sorted=a=>Float64Array.from(fin(a)).sort();
  const quant=(a,p)=>q(sorted(a),p);
  const median=a=>quant(a,.5);
  const sd=a=>{const f=fin(a);if(f.length<2)return NaN;const m=mean(f);let s=0;for(const v of f)s+=(v-m)**2;return Math.sqrt(s/(f.length-1))};
  const mad=a=>{const m=median(a);return 1.4826*median(fin(a).map(v=>Math.abs(v-m)))};
  function ranks(a){
    const ix=a.map((v,i)=>[v,i]).sort((x,y)=>x[0]-y[0]),r=new Array(a.length);
    for(let i=0;i<ix.length;){let j=i;while(j+1<ix.length&&ix[j+1][0]===ix[i][0])j++;const v=(i+j)/2+1;for(let k=i;k<=j;k++)r[ix[k][1]]=v;i=j+1}
    return r;
  }
  function pearson(x,y){
    const n=x.length;let sx=0,sy=0;for(let i=0;i<n;i++){sx+=x[i];sy+=y[i]}
    const mx=sx/n,my=sy/n;let a=0,b=0,c=0;for(let i=0;i<n;i++){const u=x[i]-mx,v=y[i]-my;a+=u*v;b+=u*u;c+=v*v}
    return b&&c?a/Math.sqrt(b*c):NaN;
  }
  const lag1=a=>{if(a.length<4)return 0;const r=pearson(a.slice(0,-1),a.slice(1));return Number.isFinite(r)?r:0};
  function lgam(x){const c=[76.18009172947146,-86.50532032941677,24.01409824083091,-1.231739572450155,.1208650973866179e-2,-.5395239384953e-5];let y=x,t=x+5.5;t-=(x+.5)*Math.log(t);let s=1.000000000190015;for(const k of c)s+=k/++y;return-t+Math.log(2.5066282746310005*s/x)}
  function betacf(a,b,x){let c=1,d=1-(a+b)*x/(a+1);if(Math.abs(d)<1e-30)d=1e-30;d=1/d;let h=d;
    for(let m=1;m<=300;m++){const m2=2*m;let u=m*(b-m)*x/((a-1+m2)*(a+m2));d=1+u*d;if(Math.abs(d)<1e-30)d=1e-30;c=1+u/c;if(Math.abs(c)<1e-30)c=1e-30;d=1/d;h*=d*c;
      u=-(a+m)*(a+b+m)*x/((a+m2)*(a+1+m2));d=1+u*d;if(Math.abs(d)<1e-30)d=1e-30;c=1+u/c;if(Math.abs(c)<1e-30)c=1e-30;d=1/d;const e=d*c;h*=e;if(Math.abs(e-1)<1e-10)break}
    return h}
  function ibeta(a,b,x){if(x<=0)return 0;if(x>=1)return 1;const bt=Math.exp(lgam(a+b)-lgam(a)-lgam(b)+a*Math.log(x)+b*Math.log(1-x));return x<(a+1)/(a+b+2)?bt*betacf(a,b,x)/a:1-bt*betacf(b,a,1-x)/b}
  const tp=(t,df)=>df>0?ibeta(df/2,.5,df/(df+t*t)):NaN; /* two-sided */
  /* Spearman with an effective sample size that discounts day-to-day autocorrelation (Bretherton 1999). */
  function spearman(x,y){
    const a=[],b=[];for(let i=0;i<x.length;i++)if(Number.isFinite(x[i])&&Number.isFinite(y[i])){a.push(x[i]);b.push(y[i])}
    const n=a.length;if(n<8)return{r:NaN,p:NaN,n,neff:n};
    const ra=ranks(a),rb=ranks(b),r=pearson(ra,rb),l=clamp(lag1(ra)*lag1(rb),-.9,.9),neff=Math.max(3,Math.min(n,n*(1-l)/(1+l)));
    if(!Number.isFinite(r))return{r:NaN,p:NaN,n,neff};
    if(Math.abs(r)>=1)return{r,p:0,n,neff};
    const t=r*Math.sqrt((neff-2)/(1-r*r));return{r,p:tp(t,neff-2),n,neff};
  }
  function ols(x,y){
    const a=[],b=[];for(let i=0;i<x.length;i++)if(Number.isFinite(x[i])&&Number.isFinite(y[i])){a.push(x[i]);b.push(y[i])}
    const n=a.length;if(n<3)return null;
    const mx=mean(a),my=mean(b);let sxx=0,sxy=0,syy=0;for(let i=0;i<n;i++){const u=a[i]-mx,v=b[i]-my;sxx+=u*u;sxy+=u*v;syy+=v*v}
    if(!sxx)return null;
    const m=sxy/sxx,c=my-m*mx,sse=Math.max(0,syy-m*sxy),s2=sse/Math.max(1,n-2);
    return{m,c,r2:syy?1-sse/syy:0,n,band:x0=>1.96*Math.sqrt(s2*(1/n+(x0-mx)**2/sxx))};
  }
  /* Benjamini-Hochberg: returns adjusted q-values in input order. */
  function bh(ps){
    const ix=ps.map((p,i)=>[p,i]).filter(x=>Number.isFinite(x[0])).sort((a,b)=>a[0]-b[0]),o=new Array(ps.length).fill(NaN);let min=1;
    for(let i=ix.length-1;i>=0;i--){min=Math.min(min,ix[i][0]*ix.length/(i+1));o[ix[i][1]]=min}
    return o;
  }
  /* Hedges' g with a normal approximation CI, using effective n when the series is autocorrelated. */
  function hedges(a,b,rho=0){
    a=fin(a);b=fin(b);const n1=a.length,n2=b.length;if(n1<3||n2<3)return null;
    const s1=sd(a),s2=sd(b),sp=Math.sqrt(((n1-1)*s1*s1+(n2-1)*s2*s2)/(n1+n2-2));if(!sp)return null;
    const j=1-3/(4*(n1+n2)-9),g=j*(mean(a)-mean(b))/sp,f=clamp((1-rho)/(1+rho),.1,1),e1=n1*f,e2=n2*f;
    const se=Math.sqrt((e1+e2)/(e1*e2)+g*g/(2*(e1+e2)));
    return{g,lo:g-1.96*se,hi:g+1.96*se,n1,n2,diff:mean(a)-mean(b)};
  }
  /* 24 h cosinor on hourly means or minutes. */
  function cosinor(h,y,period=24){
    let n=0,sc=0,ss=0,scc=0,sss=0,scs=0,sy=0,syc=0,sys=0,syy=0;
    for(let i=0;i<h.length;i++){if(!Number.isFinite(y[i]))continue;const w=2*Math.PI*h[i]/period,c=Math.cos(w),s=Math.sin(w);n++;sc+=c;ss+=s;scc+=c*c;sss+=s*s;scs+=c*s;sy+=y[i];syc+=y[i]*c;sys+=y[i]*s;syy+=y[i]*y[i]}
    if(n<6)return null;
    const A=[[n,sc,ss,sy],[sc,scc,scs,syc],[ss,scs,sss,sys]];
    for(let i=0;i<3;i++){let p=i;for(let k=i+1;k<3;k++)if(Math.abs(A[k][i])>Math.abs(A[p][i]))p=k;[A[i],A[p]]=[A[p],A[i]];if(!A[i][i])return null;
      for(let k=0;k<3;k++)if(k!==i){const f=A[k][i]/A[i][i];for(let j=i;j<4;j++)A[k][j]-=f*A[i][j]}}
    const m=A[0][3]/A[0][0],b=A[1][3]/A[1][1],g=A[2][3]/A[2][2],amp=Math.hypot(b,g);
    let ph=Math.atan2(g,b)/(2*Math.PI)*period;if(ph<0)ph+=period;
    const sst=syy-sy*sy/n,sse=syy-(m*sy+b*syc+g*sys);
    return{mesor:m,amp,peak:ph,trough:(ph+period/2)%period,r2:sst?1-sse/sst:0};
  }
  /* Rolling window stats on calendar positions. */
  function rolling(x,y,win,minN){
    const n=x.length,med=new Float64Array(n).fill(NaN),lo=new Float64Array(n).fill(NaN),hi=new Float64Array(n).fill(NaN);let a=0;
    for(let i=0;i<n;i++){
      while(x[a]<=x[i]-win)a++;
      const w=[];for(let k=a;k<=i;k++)if(Number.isFinite(y[k]))w.push(y[k]);
      if(w.length>=(minN||Math.max(4,win/2))){const s=Float64Array.from(w).sort();med[i]=q(s,.5);lo[i]=q(s,.25);hi[i]=q(s,.75)}
    }
    return{med,lo,hi};
  }
  /* Binary segmentation for shifts in level, with a penalty inflated for autocorrelation so noise is not called a change. */
  function changepoints(y,minSeg=14,maxK=4){
    const idx=[],raw=[];y.forEach((a,i)=>{if(Number.isFinite(a)){idx.push(i);raw.push(a)}});
    const n=raw.length;if(n<minSeg*2+2)return[];
    /* winsorise so a few odd days cannot pass as a change in level */
    const m0=median(raw),s0=mad(raw)||sd(raw);if(!s0)return[];
    const v=raw.map(a=>clamp(a,m0-3*s0,m0+3*s0));
    const dif=[];for(let i=1;i<n;i++)dif.push(v[i]-v[i-1]);
    const s=(mad(dif)||sd(dif))/Math.SQRT2;if(!s)return[];
    const rho=clamp(lag1(v.map((a,i)=>a-mean(v.slice(Math.max(0,i-14),i+15)))),0,.8),pen=4*Math.log(n)*s*s*(1+rho)/(1-rho);
    const P=new Float64Array(n+1),Q=new Float64Array(n+1);
    for(let i=0;i<n;i++){P[i+1]=P[i]+v[i];Q[i+1]=Q[i]+v[i]*v[i]}
    const cost=(a,b)=>{const m=(P[b]-P[a]);return Q[b]-Q[a]-m*m/(b-a)};
    const found=[],segs=[[0,n]];
    while(found.length<maxK){
      let best=null;
      for(const[a,b]of segs){if(b-a<2*minSeg)continue;const c=cost(a,b);
        for(let k=a+minSeg;k<=b-minSeg;k++){const g=c-cost(a,k)-cost(k,b);if(!best||g>best.g)best={g,k,a,b}}}
      if(!best||best.g<pen)break;
      found.push(best.k);segs.splice(segs.findIndex(x=>x[0]===best.a&&x[1]===best.b),1,[best.a,best.k],[best.k,best.b]);
    }
    const ks=found.sort((a,b)=>a-b),edges=[0,...ks,n],seg=(a,b)=>(P[b]-P[a])/(b-a);
    return ks.map((k,j)=>({i:idx[k],before:seg(edges[j],k),after:seg(k,edges[j+2])})).filter(c=>Math.abs(c.after-c.before)>=.6*s0);
  }
  /* Robust z against the trailing four weeks, excluding the day itself. */
  function anomalies(x,y,win=28,th=3.5){
    const o=[];
    for(let i=0;i<y.length;i++){
      if(!Number.isFinite(y[i]))continue;
      const w=[];for(let k=i-1;k>=0&&x[k]>=x[i]-win;k--)if(Number.isFinite(y[k]))w.push(y[k]);
      if(w.length<14)continue;
      const m=median(w),d=Math.max(mad(w),1e-6),z=(y[i]-m)/d;
      if(Math.abs(z)>=th)o.push({i,z,base:m});
    }
    return o;
  }
  const ewma=(y,tc)=>{const k=1-Math.exp(-1/tc),o=new Float64Array(y.length);let s=0;for(let i=0;i<y.length;i++){s+=k*((Number.isFinite(y[i])?y[i]:0)-s);o[i]=s}return o};
  return{fin,mean,quant,median,sd,mad,sorted,q,ranks,pearson,lag1,tp,spearman,ols,bh,hedges,cosinor,rolling,changepoints,anomalies,ewma};
})();
