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
const TOKEN_OTHER="github_pat_"+ "other_y".repeat(9);
const OWNER="make-tour-plan:cloud:owner:v1";

function trip(title){
 const t=sampleTrip();
 t.title=title;
 return t;
}
function storage(items={}){
 const map=new Map(Object.entries(items));
 return {getItem(k){return map.has(k)?map.get(k):null},
 setItem(k,v){map.set(k,String(v))},removeItem(k){map.delete(k)},
 clear(){map.clear()},key(i){return [...map.keys()][i]??null},get length(){return map.size}};
}
const CLEAN="make-tour-plan:pages:v1:preview:clean";
const SETTINGS="make-tour-plan:cloud:v1";
const cloud=new Map();
let next=1;
function clone(v){return JSON.parse(JSON.stringify(v))}
function respond(status,value){return {ok:status>=200&&status<300,status,json:async()=>clone(value)}}
async function githubFetch(url,init){
 assert([TOKEN,TOKEN_OTHER].includes(init.headers.Authorization.slice(7)), "Only test account tokens accepted");
 const u=new URL(url);
 const login=init.headers.Authorization==="Bearer "+TOKEN_OTHER?"another-user":"tester";
 if(u.pathname==="/user")return respond(200,{login});
 if(u.pathname==="/gists"){
  if(init.method==="GET")return respond(200,[...cloud.values()].filter(g=>g.owner.login===login));
  if(init.method==="POST"){
   const payload=JSON.parse(init.body),id=String(next++).padStart(40,"a");
   const value={id,owner:{login},public:payload.public,files:Object.fromEntries(Object.entries(payload.files).map(([k,v])=>[k,{filename:k,content:v.content,truncated:false}]))};
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
function browser(trips,shareStorage,shared=false){
 let session=null,reloads=0;
 const localStorage=shareStorage||storage();
 if(trips)localStorage.setItem(CLEAN,JSON.stringify({version:1,trips,revision:1,dirty:false}));
 const els=new Map(),handlers=new Map();
 const el=id=>{
  if(!els.has(id))els.set(id,{id,hidden:false,value:"",dataset:{},style:{},disabled:false,textContent:"",innerHTML:"",
   addEventListener(){},append(){},remove(){},click(){this.onclick?.()}});
  return els.get(id);
 };
 const document={body:{style:{},append(){}},hidden:false,getElementById:el,createElement:()=>({style:{},append(){},remove(){},click(){},addEventListener(){}}),
 addEventListener(name,cb){handlers.set("doc:"+name,cb)}};
 const window={addEventListener(name,cb){handlers.set("win:"+name,cb)},dispatchEvent(event){handlers.get("win:"+event.type)?.(event)}};
 window.tourWorkspace={
  validBackup:value=>backupSchema.safeParse(value).success,
  openShared(username,trips){
   session=storage({"make-tour-plan:shared:v1:preview:clean":JSON.stringify({version:1,trips,dirty:false,revision:1})});
   return session;
  }
 };
 const URLMock={createObjectURL(){return "blob:sample"},revokeObjectURL(){}};
 class StorageEventMock{constructor(type,props){this.type=type;Object.assign(this,props)}}
 class EventMock{constructor(type){this.type=type}}
 const context={document,window,URLSearchParams,localStorage,crypto:webcrypto,TextEncoder,TextDecoder,fetch:githubFetch,
 AbortController,URL:URLMock,setTimeout,clearTimeout,setInterval:()=>1,clearInterval(){},
 btoa:value=>Buffer.from(value,"binary").toString("base64"),
 atob:value=>Buffer.from(value,"base64").toString("binary"),
 confirm:()=>true,StorageEvent:StorageEventMock,Event:EventMock,
 location:{search:shared?"?shared=1":"",reload(){reloads++},href:"https://thanhlampro1012.github.io/Make-Tour-Plan/"},
 Blob,console,Uint8Array,Date,JSON,Object,Array,Math,Error};
 vm.runInNewContext(code,context,{timeout:10000,filename:"cloud-sync.js"});
 const run=async({token=TOKEN,password=PASSWORD,id=""}={})=>{
  el("mtc-token").value=token;el("mtc-secret").value=password;el("mtc-gist").value=id;
  await el("mtc-setup").onsubmit({preventDefault(){}});
 };
 return {el,localStorage,run,get session(){return session},get reloads(){return reloads},focus(){handlers.get("win:focus")?.()}};
}
async function until(test,label){
 for(let i=0;i<400;i++){if(test())return;await new Promise(r=>setTimeout(r,20))}
 throw Error("Timeout waiting for "+label);
}
const A=browser([trip("Đi chơi trên máy tính")]);
await A.run();
assert.equal(A.el("mtc-connected").hidden,false,"Desktop should connect and create Gist");
assert.equal(cloud.size,1);
assert.equal(A.localStorage.getItem(OWNER),"tester","Cloud data is bound to the original GitHub user");
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

const anotherDevice=browser([trip("Không được trộn lịch")],storage({[OWNER]:"tester"}));
await anotherDevice.run({token:TOKEN_OTHER,password:PASSWORD});
assert.equal(anotherDevice.el("mtc-connected").hidden,true,"New Github user cannot silently adopt another user's browser data");
assert.match(anotherDevice.el("mtc-status").textContent,/Không thể gắn lịch cũ/);
assert.equal(anotherDevice.localStorage.getItem(OWNER),"tester");
assert.equal(JSON.parse(anotherDevice.localStorage.getItem(CLEAN)).trips[0].title,"Không được trộn lịch");

// Shared tabs may read a known unlisted gist by ID only if the token belongs to its owner.
const sharedDisk=A.localStorage;
const diskBefore=Array.from({length:sharedDisk.length},(_,i)=>{
 const k=sharedDisk.key(i);return [k,sharedDisk.getItem(k)];
});
const first=browser(null,sharedDisk,true);
assert.equal(first.session,null);
await first.run({password:"wrong-unique-passphrase"});
assert.equal(first.session,null);
await first.run();
const sessionKey="make-tour-plan:shared:v1:preview:clean";
assert.equal(JSON.parse(first.session.getItem(sessionKey)).trips[0].title,"Máy tính thay đổi đồng thời");
first.el("mtc-lock").onclick();
assert.equal(first.reloads,1);
assert.equal(first.session.length,0);
const second=browser(null,sharedDisk,true);
await second.run({token:TOKEN_OTHER,id:gistId});
assert.equal(second.session,null);
assert.match(second.el("mtc-status").textContent,/chính tài khoản/);
await second.run({token:TOKEN_OTHER});
assert.deepEqual(JSON.parse(second.session.getItem(sessionKey)).trips,[]);
const secondRecord=JSON.parse(second.session.getItem(sessionKey));
secondRecord.trips=[trip("Lịch riêng của B")];
second.session.setItem(sessionKey,JSON.stringify({...secondRecord,revision:2}));
second.el("mtc-now").onclick();
await until(()=>second.el("mtc-status").textContent.includes("lưu lên cloud"),"shared upload");
const otherPhone=browser(null,storage(),true);
await otherPhone.run({token:TOKEN_OTHER});
assert.equal(JSON.parse(otherPhone.session.getItem(sessionKey)).trips[0].title,"Lịch riêng của B");
assert.deepEqual(Array.from({length:sharedDisk.length},(_,i)=>{
 const k=sharedDisk.key(i);return [k,sharedDisk.getItem(k)];
}),diskBefore,"Shared sessions must leave personal trips, token vault and ownership untouched");
cloud.delete([...cloud.values()].find(g=>g.owner.login==="another-user").id);

const tampered=cloud.get(gistId).files["make-tour-plan-part-01.txt"];
const originalPart=tampered.content;
tampered.content=(originalPart.startsWith("A")?"B":"A")+originalPart.slice(1);
const corruptBrowser=browser([trip("Dữ liệu thiết bị phải còn nguyên")]);
await corruptBrowser.run();
assert.match(corruptBrowser.el("mtc-status").textContent,/không vượt qua kiểm tra toàn vẹn/);
assert.equal(JSON.parse(corruptBrowser.localStorage.getItem(CLEAN)).trips[0].title,"Dữ liệu thiết bị phải còn nguyên");
tampered.content=originalPart;

const badDate=trip("Invalid date");
badDate.startDate="2201-01-01";
const invalidBrowser=browser([badDate]);
await invalidBrowser.run();
assert.match(invalidBrowser.el("mtc-status").textContent,/Chưa có bản lưu hợp lệ/);

const big=trip("Large encrypted file");
big.expenses=Array.from({length:240},(_,i)=>({id:"expense-"+i,title:"Chi phí",category:"food",cost:0,actualCost:null,perPerson:false,paidBy:"",notes:"X".repeat(5000)}));
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
console.log("PASS encrypted gist sync: create, two-device pull/push, conflict, account-isolation guard, integrity checks, invalid-date rejection, lock and multi-part backups.");
