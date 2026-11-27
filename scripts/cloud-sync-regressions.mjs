import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import vm from "node:vm";
import { sampleTrip, backupSchema } from "../lib/travel.ts";

const code=readFileSync(new URL("../docs/cloud-sync.js",import.meta.url),"utf8");
assert.equal(code,readFileSync(new URL("../pages/cloud-sync.js",import.meta.url),"utf8"));
const html=readFileSync(new URL("../docs/index.html",import.meta.url),"utf8");
assert(html.includes("/Make-Tour-Plan/cloud-sync.js"));
assert(html.includes("/Make-Tour-Plan/cloud-sync.css"));
assert(code.includes("AES-GCM")&&code.includes("PBKDF2")&&code.includes("public:false"));
const PASSWORD="strong-unique-passphrase-2026";
const TOKEN="github_pat_"+ "test_x".repeat(9);

function trip(title){
 const t=sampleTrip();
 t.title=title;
 return t;
}
function storage(items={}){
 const map=new Map(Object.entries(items));
 return {getItem(k){return map.has(k)?map.get(k):null},
 setItem(k,v){map.set(k,String(v))},removeItem(k){map.delete(k)},
 key(i){return [...map.keys()][i]??null},get length(){return map.size}};
}
const CLEAN="make-tour-plan:pages:v1:preview:clean";
const SETTINGS="make-tour-plan:cloud:v1";
const cloud=new Map();
let next=1;
function clone(v){return JSON.parse(JSON.stringify(v))}
function respond(status,value){return {ok:status>=200&&status<300,status,json:async()=>clone(value)}}
async function githubFetch(url,init){
 assert.equal(init.headers.Authorization,"Bearer "+TOKEN);
 const u=new URL(url);
 if(u.pathname==="/user")return respond(200,{login:"tester"});
 if(u.pathname==="/gists"){
  if(init.method==="GET")return respond(200,[...cloud.values()]);
  if(init.method==="POST"){
   const payload=JSON.parse(init.body),id=String(next++).padStart(40,"a");
   const value={id,public:payload.public,files:Object.fromEntries(Object.entries(payload.files).map(([k,v])=>[k,{filename:k,content:v.content,truncated:false}]))};
   cloud.set(id,value);return respond(201,value);
  }
 }
 if(u.pathname.startsWith("/gists/")){
  const id=u.pathname.slice(7);
  const gist=cloud.get(id);
  if(!gist)return respond(404,{message:"Not Found"});
  if(init.method==="PATCH"){
   const payload=JSON.parse(init.body);
   for(const [k,v] of Object.entries(payload.files)){if(v===null)delete gist.files[k];else gist.files[k]={filename:k,content:v.content,truncated:false}}
   return respond(200,gist);
  }
  return respond(200,gist);
 }
 return respond(404,{message:"Not found"});
}
function browser(trips,shareStorage){
 const localStorage=shareStorage||storage();
 if(trips)localStorage.setItem(CLEAN,JSON.stringify({version:1,trips,revision:1,dirty:false}));
 const els=new Map(),handlers=new Map();
 const el=id=>{
  if(!els.has(id))els.set(id,{id,hidden:false,value:"",dataset:{},style:{},disabled:false,textContent:"",innerHTML:"",
   addEventListener(){},append(){},remove(){},click(){this.onclick?.()}});
  return els.get(id);
 };
 const document={body:{style:{},append(){}},hidden:false,getElementById:el,createElement:()=>({style:{},append(){},remove(){},click(){}}),
 addEventListener(name,cb){handlers.set("doc:"+name,cb)}};
 const window={addEventListener(name,cb){handlers.set("win:"+name,cb)},dispatchEvent(event){handlers.get("win:"+event.type)?.(event)}};
 const URLMock={createObjectURL(){return "blob:sample"},revokeObjectURL(){}};
 class StorageEventMock{constructor(type,props){this.type=type;Object.assign(this,props)}}
 class EventMock{constructor(type){this.type=type}}
 const context={document,window,localStorage,crypto:webcrypto,TextEncoder,TextDecoder,fetch:githubFetch,
 AbortController,URL:URLMock,setTimeout,clearTimeout,setInterval:()=>1,clearInterval(){},
 btoa:value=>Buffer.from(value,"binary").toString("base64"),
 atob:value=>Buffer.from(value,"base64").toString("binary"),
 confirm:()=>true,StorageEvent:StorageEventMock,Event:EventMock,
 location:{href:"https://thanhlampro1012.github.io/Make-Tour-Plan/"},
 Blob,console,Uint8Array,Date,JSON,Object,Array,Math,Error};
 vm.runInNewContext(code,context,{timeout:10000,filename:"cloud-sync.js"});
 const run=async({token=TOKEN,password=PASSWORD,id=""}={})=>{
  el("mtc-token").value=token;el("mtc-secret").value=password;el("mtc-gist").value=id;
  await el("mtc-setup").onsubmit({preventDefault(){}});
 };
 return {el,localStorage,run,focus(){handlers.get("win:focus")?.()}};
}
async function until(test,label){
 for(let i=0;i<400;i++){if(test())return;await new Promise(r=>setTimeout(r,20))}
 throw Error("Timeout waiting for "+label);
}
const A=browser([trip("Đi chơi trên máy tính")]);
await A.run();
assert.equal(A.el("mtc-connected").hidden,false,"Desktop should connect and create Gist");
assert.equal(cloud.size,1);
const gistId=[...cloud.keys()][0],gist=cloud.get(gistId);
assert.equal(gist.public,false,"Gist must be unlisted");
const allContent=Object.values(gist.files).map(f=>f.content).join("");
assert(!allContent.includes("Đi chơi trên máy tính"),"Trip data must not be in cleartext");
assert(!A.localStorage.getItem(SETTINGS).includes(TOKEN),"Token must be encrypted on device");
assert(!A.localStorage.getItem(SETTINGS).includes(PASSWORD),"Password must never be stored");

const B=browser([trip("Lịch mẫu điện thoại")]);
await B.run();
assert.equal(B.el("mtc-choose").hidden,false,"New phone must choose data source, never overwrite");
assert.equal(B.el("mtc-pull").disabled,true,"Manual local backup is mandatory");
B.el("mtc-backup").onclick();
assert.equal(B.el("mtc-pull").disabled,false);
B.el("mtc-pull").onclick();
await until(()=>B.el("mtc-connected").hidden===false,"phone pull");
let phone=JSON.parse(B.localStorage.getItem(CLEAN));
assert.equal(phone.trips[0].title,"Đi chơi trên máy tính");
assert(backupSchema.safeParse({version:1,trips:phone.trips}).success,"Cloud must satisfy trip schema");

phone.trips[0].title="Cập nhật lịch từ điện thoại";
phone.revision+=1;
B.localStorage.setItem(CLEAN,JSON.stringify(phone));
B.el("mtc-now").onclick();
await until(()=>JSON.parse(cloud.get(gistId).files["make-tour-plan-cloud.json"].content).revision===2,"phone push");
A.el("mtc-now").onclick();
await until(()=>JSON.parse(A.localStorage.getItem(CLEAN)).trips[0].title==="Cập nhật lịch từ điện thoại","desktop pull");
const latest=JSON.parse(A.localStorage.getItem(CLEAN));
assert(backupSchema.safeParse({version:1,trips:latest.trips}).success);

const aUpdated={...latest,revision:latest.revision+1,trips:clone(latest.trips)};
aUpdated.trips[0].title="Máy tính thay đổi đồng thời";
A.localStorage.setItem(CLEAN,JSON.stringify(aUpdated));
const bCurrent=JSON.parse(B.localStorage.getItem(CLEAN));
bCurrent.trips[0].title="Điện thoại thay đổi đồng thời";bCurrent.revision+=1;
B.localStorage.setItem(CLEAN,JSON.stringify(bCurrent));
A.el("mtc-now").onclick();
await until(()=>JSON.parse(cloud.get(gistId).files["make-tour-plan-cloud.json"].content).revision===3,"desktop update");
B.el("mtc-now").onclick();
await until(()=>B.el("mtc-choose").hidden===false,"conflict detection");
assert.equal(JSON.parse(B.localStorage.getItem(CLEAN)).trips[0].title,"Điện thoại thay đổi đồng thời","Conflicted local draft must survive");

const locked=browser(null,A.localStorage);
assert.equal(locked.el("mtc-token-section").hidden,true,"Returning device should ask only for passphrase");
await locked.run({token:"",password:"wrong-password-long"});
assert.equal(locked.el("mtc-connected").hidden,true,"Wrong password must not unlock");
assert.equal(JSON.parse(locked.localStorage.getItem(CLEAN)).trips[0].title,"Máy tính thay đổi đồng thời");

const big=trip("Large encrypted file");
big.notes="X".repeat(1200000);
const large=browser([big]);
const normalCloud=[...cloud.values()];
cloud.clear();
await large.run();
assert.equal(large.el("mtc-connected").hidden,false);
const largeGist=[...cloud.values()][0];
const manifest=JSON.parse(largeGist.files["make-tour-plan-cloud.json"].content);
assert(manifest.parts>=4&&manifest.parts<=10,"Large encrypted backup should split into Gist parts");
assert.equal(Object.keys(largeGist.files).length,manifest.parts+1);
cloud.clear();for(const g of normalCloud)cloud.set(g.id,g);
console.log("PASS encrypted gist sync: create, two-device pull/push, conflict, lock, and multi-part backups.");
