/* Offline cache only for same-origin static GitHub Pages assets; never user data or external APIs. */
const ROOT="/Make-Tour-Plan/",NAME="make-tour-plan-shell-v1",SHELL=ROOT+"index.html";
const ASSET=/\.(?:js|css|svg|png|jpe?g|webp|woff2?|ttf|webmanifest)$/i;
const BASIC=["manifest.webmanifest","app-icon.svg","favicon.svg","smart-planner.js","smart-planner.css","cloud-sync.js","cloud-sync.css","register-sw.js","fonts/fonts.css","trip-hero.jpg"].map(p=>ROOT+p);
self.addEventListener("install",e=>e.waitUntil((async()=>{
 const cache=await caches.open(NAME),html=await fetch(SHELL,{cache:"reload"});
 if(!html.ok)throw Error("App entry unavailable");
 await cache.put(SHELL,html.clone());
 const content=await html.text(),files=new Set(BASIC);
 for(const m of content.matchAll(/(?:src|href)=["'](\/Make-Tour-Plan\/[^"']+)["']/g))
  if(ASSET.test(new URL(m[1],self.location.origin).pathname))files.add(m[1]);
 await Promise.all([...files].map(async path=>{try{const r=await fetch(path,{cache:"reload"});if(r.ok&&r.type!=="opaque")await cache.put(path,r.clone())}catch{}}));
 await self.skipWaiting();
})()));
self.addEventListener("activate",e=>e.waitUntil((async()=>{
 for(const k of await caches.keys())if(k.startsWith("make-tour-plan-shell-")&&k!==NAME)await caches.delete(k);
 await self.clients.claim();
})()));
self.addEventListener("fetch",e=>{
 const req=e.request,u=new URL(req.url);
 if(req.method!=="GET"||u.origin!==self.location.origin||!u.pathname.startsWith(ROOT)||u.pathname.includes("/api/"))return;
 if(req.mode==="navigate"){
  e.respondWith((async()=>{try{const r=await fetch(req);if(r.ok)await(await caches.open(NAME)).put(SHELL,r.clone());return r}catch{return(await caches.match(SHELL))||Response.error()}})());
 }else if(ASSET.test(u.pathname)){
  e.respondWith((async()=>{
   const c=await caches.open(NAME);
   if(u.pathname.includes("/assets/")){const hit=await c.match(req);if(hit)return hit}
   try{const r=await fetch(req);if(r.ok&&r.type!=="opaque")await c.put(req,r.clone());return r}
   catch{return(await c.match(req))||Response.error()}
  })());
 }
});
