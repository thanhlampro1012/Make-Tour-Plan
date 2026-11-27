import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
for(const name of ["sw.js","register-sw.js","manifest.webmanifest","app-icon.svg"])
 assert.equal(read("docs/"+name),read("public/"+name),name+" source/build mismatch");
const manifest=JSON.parse(read("docs/manifest.webmanifest"));
assert.equal(manifest.scope,"/Make-Tour-Plan/");
assert.equal(manifest.start_url,"/Make-Tour-Plan/");
assert.equal(manifest.display,"standalone");
assert(manifest.icons.some(x=>x.type==="image/svg+xml"));
const html=read("docs/index.html");
for(const p of ["manifest.webmanifest","app-icon.svg","register-sw.js"])
 assert(html.includes("/Make-Tour-Plan/"+p),"HTML missing "+p);
const sw=read("docs/sw.js");
const events=new Map(),calls=[];
const origin="https://thanhlampro1012.github.io",root="/Make-Tour-Plan/";
const htmlContent='<html><head><link rel="stylesheet" href="/Make-Tour-Plan/assets/app-abc.css"></head><body><script src="/Make-Tour-Plan/assets/app-abc.js"></script></body></html>';
class FakeResponse{
 constructor(text,options={}){this.body=text;this.ok=options.ok??true;this.type="basic";}
 clone(){return new FakeResponse(this.body,{ok:this.ok})}
 async text(){return this.body}
}
const saved=new Map(),caches={
 async open(name){
  if(!saved.has(name))saved.set(name,new Map());
  const map=saved.get(name);const key=k=>typeof k==="string"?k:new URL(k.url).pathname;
  return {async put(request,response){map.set(key(request),response.clone())},
   async match(request){return map.get(key(request))?.clone()}};
 },
 async keys(){return [...saved.keys()]},
 async delete(name){return saved.delete(name)},
 async match(request){
  for(const name of saved.keys()){const hit=await(await this.open(name)).match(request);if(hit)return hit}
  return undefined;
 }
};
const assets=new Map([[root+"cloud-sync.js","cloud-v1"],[root+"assets/app-abc.js","bundle-v1"]]);
let offline=false;
async function fakeFetch(request){
 const path=typeof request==="string"?request:new URL(request.url).pathname;
 calls.push(path);
 if(offline)throw Error("offline");
 return new FakeResponse(path===root+"index.html"?htmlContent:assets.get(path)??"static:"+path);
}
const self={location:{origin},clients:{async claim(){}},async skipWaiting(){},
 addEventListener(type,callback){events.set(type,callback)}};
vm.runInNewContext(sw,{self,caches,fetch:fakeFetch,URL,Set,Error,Promise,Response:{error(){return new FakeResponse("failed",{ok:false})}}},{filename:"sw.js",timeout:2000});
async function lifecycle(event){const waits=[];events.get(event)({waitUntil(p){waits.push(p)}});await Promise.all(waits)}
await lifecycle("install");
const cache=await caches.open("make-tour-plan-shell-v1");
assert((await cache.match(root+"index.html")),"offline entry precached");
assert((await cache.match(root+"assets/app-abc.js")),"built JS asset precached");
assert((await cache.match(root+"cloud-sync.js")),"unversioned cloud sync asset precached");
saved.set("make-tour-plan-shell-obsolete",new Map());
await lifecycle("activate");
assert(!saved.has("make-tour-plan-shell-obsolete"),"old static caches must be purged");
async function dispatch(url,{mode="same-origin",method="GET"}={}){
 let output;events.get("fetch")({request:{url,mode,method},respondWith(result){output=result}});
 return output?await output:undefined;
}
offline=true;
let response=await dispatch(origin+root,{mode:"navigate"});
assert(response&&await response.text()===htmlContent,"offline navigation should use cached app shell");
response=await dispatch(origin+root+"assets/app-abc.js");
assert(response&&await response.text()==="bundle-v1","hashed JS must be accessible offline");
assert.equal(await dispatch("https://api.github.com/gists/secret"),undefined,"never cache GitHub API");
assert.equal(await dispatch(origin+root+"export-personal.json"),undefined,"never intercept backup files");
assert.equal(await dispatch(origin+root+"api/trips"),undefined,"never intercept personal API");
assert.equal(await dispatch(origin+root+"cloud-sync.js",{method:"POST"}),undefined,"never intercept mutations");
offline=false;assets.set(root+"cloud-sync.js","cloud-v2");
response=await dispatch(origin+root+"cloud-sync.js");
assert.equal(await response.text(),"cloud-v2","unversioned app security scripts must be network first");
offline=true;response=await dispatch(origin+root+"cloud-sync.js");
assert.equal(await response.text(),"cloud-v2","updated script should be cached as offline fallback");
assert(!calls.some(x=>String(x).includes("api.github.com")),"offline shell must never fetch personal APIs");
console.log("PASS mobile PWA manifest, install, scoped cache, offline navigation, no personal API caching and script updates.");
