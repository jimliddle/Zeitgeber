/* Vault: IndexedDB holds only ciphertext. Record ids are keyed hashes, so even bucket names stay private. */
const Vault=(()=>{
  const ITER=1000000,AAD=utf8('zeitgeber/master/v1');
  let db,enc,nam;
  const S=crypto.subtle;
  const idb=r=>new Promise((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
  const store=(s,m)=>db.transaction(s,m).objectStore(s);
  async function open(){
    if(db)return;
    const r=indexedDB.open('zeitgeber-vault',1);
    r.onupgradeneeded=()=>{r.result.createObjectStore('meta');r.result.createObjectStore('rec',{keyPath:'id'})};
    db=await idb(r);
  }
  const meta=()=>idb(store('meta','readonly').get('vault'));
  const exists=async()=>{await open();return!!(await meta())};
  async function kek(pass,salt,iter){
    const k=await S.importKey('raw',utf8(pass.normalize('NFKC')),'PBKDF2',false,['deriveKey']);
    return S.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:iter},k,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }
  async function arm(mk){
    const h=await S.importKey('raw',mk,'HKDF',false,['deriveKey']);
    const salt=new Uint8Array(32);
    enc=await S.deriveKey({name:'HKDF',hash:'SHA-256',salt,info:utf8('zeitgeber/records/v1')},h,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
    nam=await S.deriveKey({name:'HKDF',hash:'SHA-256',salt,info:utf8('zeitgeber/names/v1')},h,{name:'HMAC',hash:'SHA-256',length:256},false,['sign']);
    mk.fill(0);
  }
  async function wrap(mk,pass){
    const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
    const k=await kek(pass,salt,ITER);
    const wrapped=new Uint8Array(await S.encrypt({name:'AES-GCM',iv,additionalData:AAD},k,mk));
    return{v:1,kdf:'PBKDF2-SHA256',iter:ITER,salt,iv,wrapped};
  }
  async function unwrap(m,pass){
    const k=await kek(pass,m.salt,m.iter);
    return new Uint8Array(await S.decrypt({name:'AES-GCM',iv:m.iv,additionalData:AAD},k,m.wrapped));
  }
  async function create(pass){
    await open();
    const mk=crypto.getRandomValues(new Uint8Array(32));
    const m=await wrap(mk,pass);
    await idb(store('meta','readwrite').put(m,'vault'));
    await arm(mk);
    try{navigator.storage&&navigator.storage.persist&&await navigator.storage.persist()}catch(e){}
  }
  async function unlock(pass){
    await open();
    const m=await meta();
    let mk;
    try{mk=await unwrap(m,pass)}catch(e){return false}
    await arm(mk);
    return true;
  }
  async function rekey(oldp,newp){
    const m=await meta();
    let mk;try{mk=await unwrap(m,oldp)}catch(e){return false}
    const n=await wrap(mk,newp);mk.fill(0);
    await idb(store('meta','readwrite').put(n,'vault'));
    return true;
  }
  const rid=async name=>{const h=new Uint8Array(await S.sign('HMAC',nam,utf8(name)));return toB64(h.subarray(0,16))};
  async function put(name,bytes){
    const nb=utf8(name),gz=await gzip(bytes),plain=new Uint8Array(4+nb.length+gz.length);
    new DataView(plain.buffer).setUint32(0,nb.length);plain.set(nb,4);plain.set(gz,4+nb.length);
    const id=await rid(name),iv=crypto.getRandomValues(new Uint8Array(12));
    const ct=new Uint8Array(await S.encrypt({name:'AES-GCM',iv,additionalData:utf8(id)},enc,plain));
    await idb(store('rec','readwrite').put({id,iv,ct}));
  }
  async function del(name){await idb(store('rec','readwrite').delete(await rid(name)))}
  async function all(){
    const rows=await idb(store('rec','readonly').getAll()),out=new Map();
    for(const r of rows){
      const p=new Uint8Array(await S.decrypt({name:'AES-GCM',iv:r.iv,additionalData:utf8(r.id)},enc,r.ct));
      const l=new DataView(p.buffer).getUint32(0);
      out.set(unutf8(p.subarray(4,4+l)),await gunzip(p.subarray(4+l)));
    }
    return out;
  }
  async function backup(){
    const m=await meta(),rows=await idb(store('rec','readonly').getAll());
    return JSON.stringify({format:'zeitgeber-backup',v:1,created:new Date().toISOString(),
      meta:{v:m.v,kdf:m.kdf,iter:m.iter,salt:toB64(m.salt),iv:toB64(m.iv),wrapped:toB64(m.wrapped)},
      records:rows.map(r=>({id:r.id,iv:toB64(r.iv),ct:toB64(r.ct)}))});
  }
  async function restore(text){
    const j=JSON.parse(text);
    if(j.format!=='zeitgeber-backup'||j.v!==1)throw new Error('This file is not a Zeitgeber backup.');
    await open();
    await idb(store('rec','readwrite').clear());
    const m={...j.meta,salt:fromB64(j.meta.salt),iv:fromB64(j.meta.iv),wrapped:fromB64(j.meta.wrapped)};
    await idb(store('meta','readwrite').put(m,'vault'));
    const t=db.transaction('rec','readwrite'),s=t.objectStore('rec');
    for(const r of j.records)s.put({id:r.id,iv:fromB64(r.iv),ct:fromB64(r.ct)});
    await new Promise((ok,no)=>{t.oncomplete=ok;t.onerror=()=>no(t.error)});
  }
  async function wipe(){
    await open();db.close();db=null;
    await new Promise((ok,no)=>{const r=indexedDB.deleteDatabase('zeitgeber-vault');r.onsuccess=ok;r.onerror=()=>no(r.error);r.onblocked=ok});
  }
  const forget=()=>{enc=null;nam=null};
  async function usage(){try{return await navigator.storage.estimate()}catch(e){return{}}}
  return{exists,create,unlock,rekey,put,del,all,backup,restore,wipe,usage,forget,ITER};
})();

/* Serialisation of the in-memory model into yearly encrypted buckets. */
function minuteBucket(kind,y){
  const map=D[kind],w=kind==='st'?2:1,keys=[...map.keys()].filter(n=>dparts(n).y===y).sort((a,b)=>a-b);
  const head=utf8(JSON.stringify({keys,w})),out=new Uint8Array(4+head.length+keys.length*1440*w);
  new DataView(out.buffer).setUint32(0,head.length);out.set(head,4);
  let p=4+head.length;
  for(const k of keys){const a=map.get(k);out.set(new Uint8Array(a.buffer,a.byteOffset,a.byteLength),p);p+=1440*w}
  return out;
}
function readMinuteBucket(kind,b){
  const dv=new DataView(b.buffer,b.byteOffset),l=dv.getUint32(0),h=JSON.parse(unutf8(b.subarray(4,4+l)));
  let p=4+l;const sz=1440*h.w;
  for(const k of h.keys){
    const slice=b.slice(p,p+sz);p+=sz;
    D[kind].set(k,h.w===2?new Uint16Array(slice.buffer):slice);
  }
}
const jsonB=o=>utf8(JSON.stringify(o));
async function persist(){
  const jobs=[...dirty];dirty.clear();
  for(const j of jobs){
    const[kind,y]=j.split(':');
    if(kind==='cfg')await Vault.put('cfg',jsonB(CFG));
    else if(kind==='days'){const o={};for(const[k,v]of D.days)if(dparts(k).y===+y)o[k]=v;await Vault.put(j,jsonB(o))}
    else if(kind==='hr'||kind==='st'||kind==='sg')await Vault.put(j,minuteBucket(kind,+y));
    else if(kind==='sleeps')await Vault.put('sleeps',jsonB([...D.sleeps.values()]));
    else if(kind==='workouts')await Vault.put('workouts',jsonB([...D.workouts.values()]));
    else if(kind==='tags')await Vault.put('tags',jsonB([...D.tags]));
    else if(kind==='live')await Vault.put('live',jsonB(D.live));
    else if(kind==='log')await Vault.put('log',jsonB(D.log));
  }
}
async function loadAll(){
  const m=await Vault.all();
  for(const[name,b]of m){
    const[kind]=name.split(':');
    if(kind==='cfg')Object.assign(CFG,JSON.parse(unutf8(b)));
    else if(kind==='days'){const o=JSON.parse(unutf8(b));for(const k in o)D.days.set(+k,o[k])}
    else if(kind==='hr'||kind==='st'||kind==='sg')readMinuteBucket(kind,b);
    else if(kind==='sleeps')for(const s of JSON.parse(unutf8(b)))D.sleeps.set(s.id,s);
    else if(kind==='workouts')for(const s of JSON.parse(unutf8(b)))D.workouts.set(s.id,s);
    else if(kind==='tags')for(const[k,v]of JSON.parse(unutf8(b)))D.tags.set(+k,v);
    else if(kind==='live')D.live=JSON.parse(unutf8(b));
    else if(kind==='log')D.log=JSON.parse(unutf8(b));
  }
}
const saveCfg=()=>{dirty.add('cfg:0');return persist()};
function clearData(){
  for(const k of['hr','st','sg','days','sleeps','workouts','tags'])D[k].clear();
  D.live=[];
}
