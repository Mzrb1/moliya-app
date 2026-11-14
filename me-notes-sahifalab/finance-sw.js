/* ME Notes finance shell: only static files are cached. NEVER cache API/health/token requests. */
const CACHE='me-notes-finance-shell-v2';
const FILES=['./finance-unified.html','./finance-unified.js','./finance-core.js'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('me-notes-finance-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET')return;
 const url=new URL(req.url);
 if(url.origin!==self.location.origin)return;
 if(!FILES.some(f=>new URL(f,self.registration.scope).pathname===url.pathname))return;
 event.respondWith(fetch(req).then(res=>{
  if(res.ok){const copy=res.clone();caches.open(CACHE).then(cache=>cache.put(req,copy));}
  return res;
 }).catch(async()=>(await caches.match(req))||Response.error()));
});
