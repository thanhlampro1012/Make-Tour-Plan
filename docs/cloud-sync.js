/* Make Tour Plan: opt-in encrypted GitHub Gist cross-device sync.
   Secret Gists are unlisted, NOT private; never upload unencrypted trips. */
(()=>{
"use strict";
const shared=new URLSearchParams(location.search).get("shared")==="1";
const CLEAN=shared?"make-tour-plan:shared:v1:preview:clean":"make-tour-plan:pages:v1:preview:clean",SETTINGS="make-tour-plan:cloud:v1",OWNER="make-tour-plan:cloud:owner:v1";
const FILE="make-tour-plan-cloud.json",PART="make-tour-plan-part-",FORMAT="make-tour-plan-sync/v1";
const API="https://api.github.com",SIZE=420000,MAX_PARTS=10,MAX_BYTES=1800000,KDF=310000;
const enc=new TextEncoder(),dec=new TextDecoder(),$=id=>document.getElementById(id);
let sessionStore=null,lastLocalSnapshot=null;
const tripStorage=()=>shared?sessionStore:localStorage;
let auth=null,connected=false,pending=null,busy=false,clock=0,base="",baseline="",lastCheck=0,downloaded=false;
const parse=x=>{try{return JSON.parse(x)}catch{return null}};
const bytes=x=>enc.encode(JSON.stringify(x)).length;
function valid(data){
 if(!window.tourWorkspace)throw Error("Ứng dụng chưa tải xong. Hãy tải lại trang rồi thử lại.");
 return bytes(data)<=MAX_BYTES && window.tourWorkspace.validBackup(data);
}
function local(){
 let raw;try{raw=tripStorage().getItem(CLEAN)}catch{throw Error("Không đọc được dữ liệu trên thiết bị.")}
 if(lastLocalSnapshot&&raw===lastLocalSnapshot.raw)return lastLocalSnapshot;
 const v=parse(raw||"");
 if(!v||v.version!==1||v.dirty!==false||!Number.isSafeInteger(v.revision)||v.revision<0||
 !valid({version:1,trips:v.trips}))throw Error("Chưa có bản lưu hợp lệ trên thiết bị. Hãy mở app, đợi lịch được lưu rồi thử lại.");
 lastLocalSnapshot={raw,trips:v.trips,json:JSON.stringify(v.trips),revision:v.revision};
 return lastLocalSnapshot;
}
function config(){if(shared)return null;let c;try{c=parse(localStorage.getItem(SETTINGS)||"")}catch{return null}
 return c?.version===1&&typeof c.gistId==="string"&&typeof c.vault?.cipher==="string"?c:null;}
function recordedOwner(){try{
 const owner=localStorage.getItem(OWNER);
 if(owner&&/^[a-z0-9-]{1,39}$/.test(owner))return owner;
 const previous=config();
 return typeof previous?.username==="string"?previous.username.toLowerCase():"";
 }catch{return ""}}
function requireOwner(username){
 const incoming=username.toLowerCase(),previous=recordedOwner();
 if(previous&&previous!==incoming)throw Error("Trình duyệt này đã liên kết dữ liệu với GitHub @"+previous+
 ". Không thể gắn lịch cũ sang @"+incoming+". Chọn “Mở phiên trên máy dùng chung” để dùng tài khoản khác.");
}

function b64(data){let pieces=[];for(let i=0;i<data.length;i+=8192)pieces.push(String.fromCharCode(...data.subarray(i,i+8192)));return btoa(pieces.join(""))}
function un64(text){const raw=atob(text),a=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)a[i]=raw.charCodeAt(i);return a}
function random(n){const a=new Uint8Array(n);crypto.getRandomValues(a);return a}
async function key(pass,salt){const k=await crypto.subtle.importKey("raw",enc.encode(pass),{name:"PBKDF2"},false,["deriveKey"]);
return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:KDF,hash:"SHA-256"},k,{name:"AES-GCM",length:256},false,["encrypt","decrypt"])}
async function encrypt(value,pass){const salt=random(16),iv=random(12);const k=await key(pass,salt);
const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv},k,enc.encode(JSON.stringify(value)));
return {salt:b64(salt),iv:b64(iv),iterations:KDF,cipher:b64(new Uint8Array(cipher))}}
async function decrypt(box,pass){if(!box||box.iterations!==KDF||typeof box.salt!=="string"||typeof box.iv!=="string"||
typeof box.cipher!=="string"||box.cipher.length>6000000)throw Error("Bản lưu mã hóa không hợp lệ.");
try{const k=await key(pass,un64(box.salt));const raw=await crypto.subtle.decrypt({name:"AES-GCM",iv:un64(box.iv)},k,un64(box.cipher));
return JSON.parse(dec.decode(raw))}catch{throw Error("Không giải mã được. Hãy kiểm tra mật khẩu đồng bộ (không phải mật khẩu GitHub).")}}
async function hash(text){const v=new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(text)));
return [...v].map(n=>n.toString(16).padStart(2,"0")).join("")}
async function api(path,token,method="GET",body){
const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),20000);
try{const response=await fetch(API+path,{method,cache:"no-store",signal:ctrl.signal,
headers:{Accept:"application/vnd.github+json",Authorization:"Bearer "+token,"X-GitHub-Api-Version":"2022-11-28",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
let out;try{out=await response.json()}catch{out=null}
if(!response.ok)throw Error(response.status===401?"Token GitHub không hợp lệ hoặc hết hạn.":
response.status===403?"GitHub từ chối: hãy kiểm tra quyền Gists: write hoặc giới hạn API.":
response.status===404?"Không tìm thấy bản lưu Gist dưới tài khoản này.":"GitHub trả lỗi HTTP "+response.status);
return out;
}catch(e){if(e?.name==="AbortError")throw Error("Hết thời gian kết nối GitHub; lịch cục bộ vẫn được giữ.");throw e}
finally{clearTimeout(timer)}}
const part=i=>PART+String(i+1).padStart(2,"0")+".txt";
function manifest(gist){const f=gist?.files?.[FILE];if(!f||f.truncated||typeof f.content!=="string")throw Error("Không tìm thấy manifest của Make Tour Plan.");
const m=parse(f.content);if(!m||m.format!==FORMAT||!Number.isSafeInteger(m.revision)||m.revision<1||m.iterations!==KDF||
!Number.isInteger(m.parts)||m.parts<1||m.parts>MAX_PARTS||!/^[a-f0-9]{64}$/.test(m.digest))
throw Error("Manifest của bản lưu trên đám mây không đúng cấu trúc.");return m}
function signature(g){const m=manifest(g);return m.revision+":"+m.digest}
async function gist(id,credentials){
 if(!/^[a-f0-9]{8,40}$/i.test(id))throw Error("ID Gist không hợp lệ.");
 const record=await api("/gists/"+id,credentials.token);
 if(record?.owner?.login?.toLowerCase()!==credentials.username.toLowerCase() || record.public!==false)
  throw Error("Hãy chọn Gist không công khai thuộc chính tài khoản GitHub của bạn.");
 return record;
}
async function cloudTrips(g,pass){const m=manifest(g);let cipher="";
for(let i=0;i<m.parts;i++){const f=g.files?.[part(i)];
if(!f||f.truncated||typeof f.content!=="string"||f.content.length>SIZE+10)throw Error("Bản lưu thiếu phần mã hóa.");
cipher+=f.content;}
if(await hash(cipher)!==m.digest)throw Error("Bản lưu không vượt qua kiểm tra toàn vẹn SHA-256.");
const obj=await decrypt({salt:m.salt,iv:m.iv,iterations:m.iterations,cipher},pass);
if(!valid(obj))throw Error("Dữ liệu trên đám mây không hợp lệ hoặc vượt giới hạn 1,8 MB.");
return obj.trips}
async function pack(trips,pass,revision){const backup={version:1,trips};
if(!valid(backup))throw Error("Dữ liệu vượt giới hạn đồng bộ; hãy xuất JSON và rút gọn dữ liệu.");
const box=await encrypt(backup,pass),count=Math.ceil(box.cipher.length/SIZE);
if(count>MAX_PARTS)throw Error("Số phần Gist vượt giới hạn. Hãy dùng bản sao JSON.");
const m={format:FORMAT,revision,updatedAt:new Date().toISOString(),salt:box.salt,iv:box.iv,
iterations:KDF,parts:count,digest:await hash(box.cipher),writer:crypto.randomUUID()};
const files={[FILE]:{content:JSON.stringify(m)}};
for(let i=0;i<count;i++)files[part(i)]={content:box.cipher.slice(i*SIZE,(i+1)*SIZE)};
return {files,signature:revision+":"+m.digest}}
async function findGist(token){const found=[];
for(let page=1;page<=5;page++){const list=await api("/gists?per_page=100&page="+page,token);
if(!Array.isArray(list))throw Error("GitHub không trả về danh sách Gist.");
found.push(...list.filter(g=>g?.public===false&&g.files?.[FILE]&&typeof g.id==="string"));
if(list.length<100)break;
if(page===5)throw Error("Có quá nhiều Gist. Hãy nhập ID bản lưu thủ công.");}
if(found.length>1)throw Error("Có nhiều Gist Make Tour Plan. Hãy nhập ID để chọn chính xác bản lưu.");
return found[0]?.id||""}
async function writeCloud(trips,old,credentials){
const content=await pack(trips,credentials.pass,(old?manifest(old).revision:0)+1),files={...content.files};
let saved;
if(old){
 // Gist has no atomic compare-and-swap. This check narrows the race window;
 // concurrent writers still need manual conflict recovery.
 const head=await gist(old.id,credentials);
 if(signature(head)!==signature(old))throw Error("Cloud vừa được cập nhật từ thiết bị khác. Dừng ghi để tránh mất lịch; hãy đồng bộ lại.");
 for(const name of Object.keys(old.files||{}))if(name.startsWith(PART)&&!Object.hasOwn(files,name))files[name]=null;
 saved=await api("/gists/"+old.id,credentials.token,"PATCH",{files});}
else saved=await api("/gists",credentials.token,"POST",{description:"Make Tour Plan - AES-256-GCM encrypted sync",public:false,files});
if(!/^[a-f0-9]{8,40}$/i.test(saved?.id||""))throw Error("GitHub chưa xác nhận ID Gist.");
const confirmed=await gist(saved.id,credentials);
if(signature(confirmed)!==content.signature)throw Error("Gist vừa thay đổi trong lúc lưu; tạm dừng để tránh ghi đè.");
return confirmed}
function download(){const s=local(),blob=new Blob([JSON.stringify({version:1,trips:s.trips},null,2)],{type:"application/json"});
const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="Make-Tour-Plan-"+new Date().toISOString().slice(0,10)+".json";
document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)}
function applyRemote(trips,expected){const s=local();if(s.json!==expected)throw Error("Dữ liệu vừa thay đổi trên máy này. Chưa thay thế.");
const value=JSON.stringify({version:1,trips,revision:s.revision+1,dirty:false});
tripStorage().setItem(CLEAN,value);
try{window.dispatchEvent(new StorageEvent("storage",{key:CLEAN,oldValue:s.raw,newValue:value,storageArea:shared?null:localStorage,url:location.href}));}
catch{const ev=new Event("storage");Object.defineProperty(ev,"key",{value:CLEAN});window.dispatchEvent(ev)}
return JSON.stringify(trips)}
function status(text,tone="normal"){$("mtc-status").textContent=text;$("mtc-status").dataset.tone=tone;
$("mtc-open").textContent=pending?"Chọn bản đồng bộ":connected&&tone==="warning"?"Kiểm tra đồng bộ":connected?"☁️ Cloud đã bật":"☁️ Đồng bộ thiết bị"}
function stop(){if(clock)clearInterval(clock);clock=0}
function showSetup(){stop();connected=false;auth=null;pending=null;
$("mtc-setup").hidden=false;$("mtc-connected").hidden=true;$("mtc-choose").hidden=true;
const c=config();$("mtc-token-section").hidden=!!c;$("mtc-forget-setup").hidden=!c;
$("mtc-gist").value=c?.gistId||"";$("mtc-secret").value="";$("mtc-token").value="";
$("mtc-connect").textContent=c?"Mở khóa đồng bộ":"Kết nối GitHub";
status(shared?"Nhập token GitHub và mật khẩu mã hóa của bạn. Lịch chỉ mở trong tab này.":c?"Tài khoản "+c.username+" đã lưu token dưới dạng mã hóa. Nhập mật khẩu mã hóa để mở khóa.":"Chưa bật cloud. Các lịch hiện chỉ nằm trên thiết bị này.")}
function showReady(){$("mtc-close").hidden=false;$("mtc-setup").hidden=true;$("mtc-connected").hidden=false;$("mtc-choose").hidden=true;
$("mtc-account").textContent="@"+auth.username;$("mtc-gist-link").href="https://gist.github.com/"+auth.gistId;
status("✅ Đồng bộ đã bật. App tự lưu khi bạn đang mở trang, có kết nối mạng.","ok")}
function showChoice(info,g,localSnapshot){downloaded=false;stop();connected=false;
$("mtc-setup").hidden=true;$("mtc-connected").hidden=true;$("mtc-choose").hidden=false;
$("mtc-choice-info").textContent=info+" Bản cloud cập nhật "+manifest(g).updatedAt+". Thiết bị này có "+localSnapshot.trips.length+" chuyến.";
$("mtc-pull").disabled=true;status("Phát hiện hai bản khác nhau. Chưa có dữ liệu nào bị ghi đè.","warning")}
async function remember(credentials){requireOwner(credentials.username);
 const vault=await encrypt({token:credentials.token,username:credentials.username},credentials.pass);
 requireOwner(credentials.username);
 localStorage.setItem(SETTINGS,JSON.stringify({version:1,gistId:credentials.gistId,username:credentials.username,vault}));
 localStorage.setItem(OWNER,credentials.username.toLowerCase());}
async function connectDone(credentials,g,trips){
credentials.gistId=g.id;
if(shared){
 if(!sessionStore)sessionStore=window.tourWorkspace.openShared(credentials.username,trips);
}else{
 await remember(credentials);
}
auth=credentials;base=signature(g);baseline=JSON.stringify(trips);lastCheck=Date.now();connected=true;pending=null;
showReady();stop();clock=setInterval(()=>{if(!document.hidden)void sync(false)},5000)}
async function begin(e){e.preventDefault();if(busy)return;busy=true;$("mtc-connect").disabled=true;
try{
if(!crypto?.subtle)throw Error("Trình duyệt cần HTTPS và Web Crypto để mã hóa.");
const saved=config(),pass=$("mtc-secret").value;
if(pass.length<12||pass.length>200)throw Error("Mật khẩu mã hóa cần từ 12–200 ký tự; không dùng mật khẩu GitHub.");
let token=$("mtc-token").value.trim();
if(saved){const old=await decrypt(saved.vault,pass);token=old?.token;}
if(typeof token!=="string"||!/^[A-Za-z0-9_-]{20,255}$/.test(token))throw Error("Token GitHub không hợp lệ. Hãy tạo token với quyền Gists: write.");
status("Đang xác minh GitHub và tìm bản lưu...");
const user=await api("/user",token);if(typeof user?.login!=="string")throw Error("Không xác nhận được GitHub.");
if(saved?.username && saved.username.toLowerCase()!==user.login.toLowerCase())
 throw Error("Token thuộc tài khoản GitHub khác tài khoản được lưu. Để tránh trộn dữ liệu, hãy dùng hồ sơ trình duyệt riêng.");
if(!shared)requireOwner(user.login);
let id=$("mtc-gist").value.trim()||saved?.gistId||"";
if(id&&!/^[a-f0-9]{8,40}$/i.test(id))throw Error("ID Gist chỉ gồm ký tự hex.");
if(!id)id=await findGist(token);
const credentials={token,pass,username:user.login,gistId:id};
if(!id){
 const trips=shared?[]:local().trips;
 const message=shared?"Tạo kho lịch trống cho @"+user.login+"?":
  "Tạo bản lưu GitHub cho @"+user.login+" từ "+trips.length+" chuyến đi trên thiết bị này?";
 if(!confirm(message)){status("Chưa tạo bản lưu trên GitHub.","warning");return}
 const created=await writeCloud(trips,null,credentials);
 await connectDone(credentials,created,trips);
}else{
 const g=await gist(id,credentials),trips=await cloudTrips(g,pass);
 const s=shared?null:local();
 if(s&&JSON.stringify(trips)!==s.json){
  auth=credentials;pending={credentials,gist:g,localJson:s.json};
  showChoice("Cloud và thiết bị có lịch khác nhau.",g,s);
 }else await connectDone(credentials,g,trips);
}
if(shared)close();
$("mtc-secret").value="";$("mtc-token").value="";
}catch(err){status(err?.message||"Kết nối thất bại; lịch cục bộ vẫn còn nguyên.","error")}
finally{busy=false;$("mtc-connect").disabled=false}}
async function choose(remote){if(busy||!pending)return;
if(remote&&!downloaded){status("Trước tiên hãy tải bản sao JSON trên thiết bị.","warning");return}
if(!remote&&!confirm("Bạn chắc chắn muốn dùng bản thiết bị để thay bản cloud? Lịch sử Gist vẫn giữ các phiên bản trước."))return;
busy=true;
try{const c=pending,s=local();
const fresh=await gist(c.gist.id,c.credentials);
const latest=local();
if(latest.json!==c.localJson || signature(fresh)!==signature(c.gist)){
 pending={credentials:c.credentials,gist:fresh,localJson:latest.json};
 showChoice("Có thay đổi mới. Hãy kiểm tra và chọn lại bản muốn giữ.",fresh,latest);
 return;
}
if(remote){const trips=await cloudTrips(fresh,c.credentials.pass);applyRemote(trips,c.localJson);await connectDone(c.credentials,fresh,trips)}
else{const written=await writeCloud(s.trips,fresh,c.credentials);await connectDone(c.credentials,written,s.trips)}
}catch(e){status(e.message||"Chưa ghi được bản đồng bộ.","error")}
finally{busy=false}}
async function sync(force){if(!connected||busy||pending||!auth)return;
let initial;try{initial=local()}catch(e){status(e.message,"error");return}
if(!force&&initial.json===baseline&&Date.now()-lastCheck<40000)return;
busy=true;
try{const g=await gist(auth.gistId,auth),remoteSig=signature(g),s=local();lastCheck=Date.now();
if(remoteSig!==base){
 if(s.json!==baseline){pending={credentials:auth,gist:g,localJson:s.json};
 showChoice("Hai thiết bị đều có thay đổi chưa đồng bộ.",g,s);return}
 const trips=await cloudTrips(g,auth.pass);
 const current=applyRemote(trips,baseline);baseline=current;base=remoteSig;
 status("✅ Đã cập nhật từ cloud xuống thiết bị.","ok");return}
if(s.json!==baseline){const written=await writeCloud(s.trips,g,auth);base=signature(written);baseline=s.json;
status("✅ Thay đổi đã lưu lên cloud (mã hóa).","ok");return}
status("✅ Đồng bộ hoàn tất lúc "+new Date().toLocaleTimeString("vi-VN"),"ok");
}catch(e){status((e.message||"Mất kết nối")+(shared?" Lịch còn trong tab này. Giữ tab mở hoặc tải bản JSON.":" Lịch còn trên thiết bị và sẽ được đồng bộ lại."),"warning")}
finally{busy=false}}
function hasUnsavedSession(){
 if(!sessionStore)return false;
 try{return local().json!==baseline}catch{return true}
}
async function disconnect(){
 if(busy){status("Đang liên lạc với GitHub. Vui lòng đợi rồi thử lại.","warning");return}
 if(shared){
  if(connected&&hasUnsavedSession())await sync(true);
  if(hasUnsavedSession()&&!confirm("Tab này còn thay đổi chưa được lưu lên GitHub. Đăng xuất sẽ bỏ các thay đổi đó. Bạn muốn đăng xuất ngay?"))return;
  stop();connected=false;pending=null;auth=null;lastLocalSnapshot=null;baseline="";sessionStore?.clear();sessionStore=null;
  location.reload();
 }else showSetup();
}
function forget(){if(shared||busy)return;if(!confirm("Quên kết nối cloud trên thiết bị này? Lịch cục bộ và bản mã hóa trên GitHub vẫn được giữ. Trình duyệt này vẫn được đánh dấu thuộc tài khoản hiện tại để tránh trộn lịch với tài khoản khác."))return;
try{const old=config();if(old?.username)localStorage.setItem(OWNER,old.username.toLowerCase());
 localStorage.removeItem(SETTINGS)}catch{}showSetup()}
const launch=document.createElement("div");launch.id="mtc-launcher";launch.innerHTML='<button id="mtc-open" type="button">☁️ Đồng bộ thiết bị</button>';($("mt-tools")||document.body).append(launch);
const overlay=document.createElement("div");overlay.id="mtc-overlay";overlay.hidden=true;
overlay.innerHTML='<section class="mtc-dialog" role="dialog" aria-modal="true" aria-labelledby="mtc-title">'+
'<header><div><strong id="mtc-title">Đồng bộ lịch giữa các thiết bị</strong><p>Dùng GitHub của bạn · mã hóa trước khi lưu</p></div><button id="mtc-close" type="button" aria-label="Đóng">✕</button></header>'+
'<p id="mtc-status" role="status" aria-live="polite"></p>'+
'<form id="mtc-setup"><p>Tạo token có <b>Account permissions → Gists: Read and write</b>. Mật khẩu mã hóa là mật khẩu <b>riêng</b> do bạn đặt, dùng giống nhau trên mọi thiết bị.</p>'+
'<div id="mtc-token-section"><label for="mtc-token">GitHub access token</label><input type="password" id="mtc-token" autocomplete="off" placeholder="github_pat_..." /><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">Tạo GitHub token chỉ có quyền Gists ↗</a></div>'+
'<label for="mtc-secret">Mật khẩu mã hóa riêng (từ 12 ký tự)</label><input type="password" id="mtc-secret" autocomplete="off" minlength="12" maxlength="200" required />'+
'<label for="mtc-gist">ID Gist (tùy chọn; mặc định tự tìm)</label><input id="mtc-gist" type="text" autocomplete="off" placeholder="Để trống để tự tìm" />'+
'<button type="button" id="mtc-initial-backup">⬇ Tải JSON trước khi kết nối</button>'+
'<button type="submit" id="mtc-connect" class="mtc-primary">Kết nối GitHub</button><button type="button" id="mtc-forget-setup" hidden>Quên thông tin tài khoản trên máy này</button></form>'+
'<section id="mtc-connected" hidden><p>Đã kết nối <b id="mtc-account"></b>. Đồng bộ chỉ hoạt động khi trang đang mở và có mạng.</p>'+
'<a id="mtc-gist-link" target="_blank" rel="noopener noreferrer">Xem bản lưu đã mã hóa trên GitHub ↗</a><div class="mtc-actions"><button id="mtc-now" class="mtc-primary">↻ Đồng bộ ngay</button><button id="mtc-lock">Khóa phiên</button><button id="mtc-forget">Quên thiết bị này</button></div></section>'+
'<section id="mtc-choose" hidden><p id="mtc-choice-info"></p><div class="mtc-actions"><button id="mtc-backup">⬇ Tải bản sao JSON thiết bị</button><button id="mtc-pull" class="mtc-primary" disabled>Dùng bản cloud</button><button id="mtc-push">Dùng bản thiết bị</button><button id="mtc-stop">Tạm dừng, chưa ghi đè</button></div></section>'+
'<footer>GitHub Gist lưu lịch đã mã hóa. Người có đường dẫn có thể xem nội dung mã hóa. Giữ riêng token và mật khẩu.</footer>'+
(shared?'':'<p><a href="?shared=1">Mở phiên trên máy dùng chung</a></p>')+'</section>';

document.body.append(overlay);
function setBackgroundInert(inert){
 for(const id of ["root","mt-launcher","mtc-launcher","mt-overlay"]){
  const element=$(id);
  if(element)element.inert=inert;
 }
}
function open(){
 overlay.hidden=false;setBackgroundInert(true);document.body.style.overflow="hidden";
 const focusTarget=shared&&!sessionStore?$("mtc-token"):$("mtc-close");
 focusTarget.focus?.();
}
function close(){
 if(shared&&!sessionStore)return;
 overlay.hidden=true;setBackgroundInert(false);document.body.style.overflow="";
 $("mtc-open").focus?.();
}
$("mtc-open").onclick=open;$("mtc-close").onclick=close;
overlay.addEventListener("click",e=>{if(e.target===overlay)close()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!overlay.hidden)close()});
$("mtc-setup").onsubmit=begin;$("mtc-now").onclick=()=>void sync(true);
$("mtc-initial-backup").onclick=()=>{try{download();status("Đã tạo tệp sao lưu JSON để giữ riêng trên thiết bị của bạn.","ok")}
 catch(e){status(e.message||"Chưa sao lưu được JSON.","error")}};
$("mtc-lock").onclick=disconnect;$("mtc-forget").onclick=forget;$("mtc-forget-setup").onclick=forget;
$("mtc-backup").onclick=()=>{try{download();downloaded=true;$("mtc-pull").disabled=false;status("Đã tạo tệp JSON thiết bị. Chọn bản cần giữ.","ok")}catch(e){status(e.message,"error")}};
$("mtc-pull").onclick=()=>void choose(true);$("mtc-push").onclick=()=>void choose(false);$("mtc-stop").onclick=disconnect;
window.addEventListener("focus",()=>{if(connected)void sync(true)});
window.addEventListener("online",()=>{if(connected)void sync(true)});
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&connected)void sync(true)});
if(shared){
 $("mtc-title").textContent="Lịch riêng trên máy dùng chung";
 $("mtc-close").hidden=true;
 $("mtc-initial-backup").hidden=true;
 $("mtc-forget").hidden=true;
 $("mtc-lock").textContent="Đăng xuất";
 $("mtc-stop").textContent="Đăng xuất khỏi phiên";
 window.addEventListener("beforeunload",event=>{
  if(hasUnsavedSession()){event.preventDefault();event.returnValue=""}
 });
 window.addEventListener("pageshow",event=>{if(event.persisted)location.reload()});
 open();
}
showSetup();
})();
