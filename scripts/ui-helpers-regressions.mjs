import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const compiled = await build({ stdin: { contents: 'export * from "./lib/trip-actions.ts";export * from "./lib/trip-exports.ts";export {tripSchema,activitySchema,summarize,settleExpenses,actualAmount,plannedAmount,getTravelers} from "./lib/travel.ts";', resolveDir:root, loader:'ts'}, bundle:true, platform:'node', format:'esm', write:false, logLevel:'silent' });
const m = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const clone = structuredClone;
const results = [];
function test(name, body) { try { body(); results.push({name, ok:true}); console.log(`PASS ${name}`); } catch (error) { results.push({name, ok:false}); console.error(`FAIL ${name}: ${error.message}`); } }
function activity(overrides={}) { return {id:'a-legacy',date:'2026-12-31',startTime:'23:00',endTime:'00:30',endNextDay:true,title:'Điểm ghé',category:'food',place:'Quán',address:'Địa chỉ',transport:'Đi bộ',travelMinutes:15,cost:20,actualCost:10,perPerson:true,status:'done',notes:'Ghi chú',bookingId:'',url:'https://example.test/place',priority:'must',backup:'Phương án B',paidBy:'  lÂm ',previousStatus:'booked',...overrides}; }
function trip() {
  return m.tripSchema.parse({id:'trip',title:'Chuyến đi cuối năm',destination:'TP.HCM',startDate:'2026-12-31',endDate:'2027-01-02',people:2,budget:10000,timezone:'Asia/Ho_Chi_Minh',notes:'Ghi chú chuyến đi',sample:false,travelers:['Lâm','Vy'],
    activities:[activity(),activity({id:'a-zero',actualCost:0,paidBy:'Vy'}),activity({id:'a-null',actualCost:null,status:'planned',previousStatus:undefined}),activity({id:'a-snapshot',actualCost:30,actualPeople:5}),activity({id:'a-group',actualCost:40,perPerson:false})],
    expenses:[{id:'e-legacy',title:'Khoản chi',category:'other',cost:100,actualCost:30,perPerson:true,paidBy:'Vy',notes:'Ghi chú chi tiêu'}],
    bookings:[{id:'booking',title:'Khách sạn',type:'stay',date:'2027-01-01',time:'23:30',reference:'PRIVATE-REFERENCE',provider:'Nhà cung cấp',url:'https://example.test/booking?code=abc&room=2',phone:'PRIVATE-PHONE',total:1000,paid:200,refunded:50,status:'confirmed',notes:'PRIVATE-BOOKING-NOTE',paidBy:'lâm'}],
    places:[{id:'place',name:'Điểm đã lưu',address:'SAVED-PRIVATE-ADDRESS',category:'visit',url:'https://example.test/private',notes:'PRIVATE-PLACE-NOTE',visited:false}],
    checklist:[{id:'check',text:'PRIVATE-CHECKLIST',group:'Riêng tư',done:false,assignee:'PRIVATE-ASSIGNEE'}],
    dayNotes:{'2026-12-31':'PRIVATE-DAY-NOTE','2027-01-04':'Ghi chú ngoài khoảng chuyến'}
  });
}

test('metadata edit snapshots legacy actuals, keeps existing snapshots and zero/null distinct', () => {
  const old=trip(), oldBefore=clone(old), draft={...clone(old),people:4,travelersText:'Thành Lâm\nHà Vy\nMinh\nAn',shiftAll:false}, draftBefore=clone(draft);
  const next=m.tripSchema.parse(m.prepareTripEdit(old,draft));
  assert.equal(m.summarize(old).spent,420);
  assert.equal(m.summarize(next).spent,420);
  assert.equal(next.activities[0].actualPeople,2);
  assert.equal(next.activities[1].actualPeople,2);
  assert.equal(next.activities[1].actualCost,0);
  assert.equal(next.activities[2].actualPeople,undefined);
  assert.equal(next.activities[2].actualCost,null);
  assert.equal(next.activities[3].actualPeople,5);
  assert.equal(next.activities[4].actualPeople,undefined);
  assert.equal(next.expenses[0].actualPeople,2);
  assert.equal(m.plannedAmount(next.activities[0],next.people),80);
  assert.equal(next.activities[0].paidBy,'Thành Lâm');
  assert.equal(next.expenses[0].paidBy,'Hà Vy');
  assert.equal(next.bookings[0].paidBy,'Thành Lâm');
  assert.equal(m.settleExpenses(next).totalAssigned,m.settleExpenses(old).totalAssigned);
  assert.deepEqual(old,oldBefore); assert.deepEqual(draft,draftBefore);
  assert.ok(!Object.hasOwn(next,'shiftAll') && !Object.hasOwn(next,'travelersText'));
  const again=m.tripSchema.parse(m.prepareTripEdit(next,{...clone(next),people:1,travelersText:'Thành Lâm'}));
  assert.equal(m.summarize(again).spent,420);
  assert.equal(again.activities[0].actualPeople,2);
  assert.equal(again.activities[3].actualPeople,5);
  assert.equal(again.expenses[0].paidBy,'Hà Vy');
});

test('stale metadata form keeps the latest collections and future model fields', () => {
  const baseline=trip(), latest=clone(baseline), draft={...clone(baseline),title:'Tên nhập trong cửa sổ đang mở'};
  latest.activities=[activity({id:'a-remote',actualCost:123,actualPeople:2,notes:'Hoạt động mới từ tab khác'})];
  latest.expenses=[{...baseline.expenses[0],id:'e-remote',actualCost:456,actualPeople:2,notes:'Chi tiêu mới'}];
  latest.bookings=[{...baseline.bookings[0],id:'b-remote',paid:400,notes:'Đặt chỗ vừa sửa'}];
  latest.places=[{...baseline.places[0],id:'p-remote',visited:true}];
  latest.checklist=[{...baseline.checklist[0],id:'c-remote',done:true}];
  latest.dayNotes={'2027-01-01':'Ghi chú vừa nhập từ tab khác'};
  latest.references=[{id:'r-remote',title:'Nguồn vừa lưu',url:'https://www.reddit.com/r/travel/',place:'Đà Lạt',notes:'Nguồn tham khảo',read:false,addedOn:'2026-11-27'}];
  latest.futureCollection=[{id:'future-field',value:'kept'}];
  const before=clone(latest), draftBefore=clone(draft), next=m.prepareTripEdit(latest,draft,baseline);
  assert.equal(next.title,draft.title);
  assert.deepEqual(next.activities.map(a=>a.id),['a-remote']); assert.equal(next.activities[0].notes,'Hoạt động mới từ tab khác'); assert.equal(next.activities[0].actualCost,123);
  assert.deepEqual(next.expenses.map(e=>e.id),['e-remote']); assert.equal(next.expenses[0].actualCost,456);
  assert.deepEqual(next.bookings.map(b=>b.id),['b-remote']); assert.equal(next.bookings[0].paid,400);
  for(const key of ['places','checklist','dayNotes','references','futureCollection']) assert.deepEqual(next[key],latest[key],key);
  assert.deepEqual(latest,before); assert.deepEqual(draft,draftBefore); assert.deepEqual(baseline,trip());
  const withoutBaseline=m.prepareTripEdit(latest,draft);
  assert.equal(withoutBaseline.title,draft.title); assert.deepEqual(withoutBaseline.futureCollection,latest.futureCollection); assert.equal(withoutBaseline.activities[0].id,'a-remote');
});

test('three-way metadata merge retains untouched remote fields and accepts matching edits', () => {
  const baseline=trip(), latest={...clone(baseline),budget:20000,notes:'Ghi chú mới từ xa',destination:'Đà Lạt',timezone:'Asia/Tokyo',people:3,travelers:['Lâm','Vy','An']};
  const draft={...clone(baseline),title:'  Tên chung mới  ',travelersText:'Lâm\nVy',shiftAll:false};
  const next=m.tripSchema.parse(m.prepareTripEdit(latest,draft,baseline));
  assert.equal(next.title,'Tên chung mới');
  for(const key of ['budget','notes','destination','timezone','people','travelers']) assert.deepEqual(next[key],latest[key],key);
  assert.equal(next.activities[0].actualPeople,3,'snapshot uses the latest party at edit time');
  const matching={...clone(latest),title:'Tên chung mới'};
  assert.equal(m.prepareTripEdit(matching,draft,baseline).title,'Tên chung mới');
  const unnamed=trip();delete unnamed.travelers;
  const remotelyNamed={...clone(unnamed),travelers:['Lâm','Vy']};
  assert.deepEqual(m.prepareTripEdit(remotelyNamed,{...clone(unnamed),title:'Đổi tên',travelersText:''},unnamed).travelers,['Lâm','Vy']);
});

test('divergent same-field metadata edits fail atomically with a readable conflict', () => {
  const baseline=trip(), latest={...clone(baseline),title:'Tên từ xa',budget:22000}, draft={...clone(baseline),title:'Tên ở đây',budget:33000};
  const snapshots=[baseline,latest,draft].map(value=>clone(value));
  assert.throws(()=>m.prepareTripEdit(latest,draft,baseline),error=>/tên chuyến đi/.test(error.message)&&/ngân sách/.test(error.message)&&/phiên khác/.test(error.message));
  assert.deepEqual([baseline,latest,draft],snapshots);
  const names={...clone(baseline),travelers:['Lam','Vy']};
  assert.throws(()=>m.prepareTripEdit(names,{...clone(baseline),travelersText:'Lâm mới\nVy'},baseline),/tên người đi cùng/);
});

test('deleted and mismatched baseline trips cannot be resurrected by stale forms', () => {
  const baseline=trip(), draft={...clone(baseline),title:'Tên chưa lưu'};
  assert.throws(()=>m.prepareTripEdit(undefined,draft,baseline),/đã bị xóa/);
  assert.throws(()=>m.prepareTripEdit(baseline,{...draft,id:'another-trip'},baseline),/không còn khớp/);
  assert.throws(()=>m.prepareTripEdit(baseline,draft,{...baseline,id:'another-trip'}),/không còn khớp/);
  const created=m.tripSchema.parse(m.prepareTripEdit(undefined,{...draft,travelersText:'Lâm\nVy',shiftAll:false}));
  assert.equal(created.id,baseline.id);assert.equal(created.title,draft.title);assert.equal(created.activities.length,draft.activities.length);
});

test('stale date form shifts the latest records once and leaves unrelated latest fields intact', () => {
  const baseline=trip(), latest=clone(baseline), draft={...clone(baseline),startDate:'2027-01-02',endDate:'2027-01-04',shiftAll:true};
  latest.activities.push(activity({id:'a-added-later',date:'2027-01-03',actualCost:null,status:'planned'}));
  latest.bookings.push({...latest.bookings[0],id:'b-added-later',date:'2027-01-04'});
  latest.dayNotes['2027-01-05']='Note added later';latest.notes='Keep current notes';latest.references=[{id:'r-later',title:'Nguồn mới',url:'https://www.reddit.com/r/travel/',place:'',notes:'',read:false,addedOn:'2026-11-27'}];
  const next=m.prepareTripEdit(latest,draft,baseline);
  assert.equal(next.activities.find(a=>a.id==='a-added-later').date,'2027-01-05');
  assert.equal(next.activities[0].startTime,'23:00');assert.equal(next.activities[0].endNextDay,true);
  assert.equal(next.bookings.find(b=>b.id==='b-added-later').date,'2027-01-06');assert.equal(next.dayNotes['2027-01-07'],'Note added later');
  assert.equal(next.notes,latest.notes);assert.deepEqual(next.references,latest.references);
  const sameDate=m.prepareTripEdit(next,draft,baseline);
  assert.deepEqual(sameDate.activities,next.activities);assert.deepEqual(sameDate.bookings,next.bookings);assert.deepEqual(sameDate.dayNotes,next.dayNotes);
  const keep=m.prepareTripEdit(latest,{...draft,shiftAll:false},baseline);
  assert.equal(keep.activities.find(a=>a.id==='a-added-later').date,'2027-01-03');assert.deepEqual(keep.dayNotes,latest.dayNotes);
});

test('payer attribution survives middle deletion, reorder, normalized names and true rename', () => {
  const old=trip(); old.people=3; old.travelers=['Lâm','Vy','An']; old.activities=[]; old.bookings=[];
  old.expenses=['  lÂm ','Vy','An'].map((paidBy,i)=>({id:`e-${i}`,title:'Khoản chi',category:'other',cost:0,actualCost:(i+1)*100,perPerson:false,paidBy,notes:''}));
  const removed=m.tripSchema.parse(m.prepareTripEdit(old,{...clone(old),people:2,travelersText:'Lâm\nAn'}));
  assert.deepEqual(removed.expenses.map(e=>e.paidBy),['Lâm','Vy','An']);
  assert.equal(m.settleExpenses(removed).unassigned,200);
  assert.equal(m.settleExpenses(removed).balances.find(x=>x.name==='An').paid,300);
  const reordered=m.tripSchema.parse(m.prepareTripEdit(old,{...clone(old),travelersText:'An\nLâm\nVy'}));
  assert.deepEqual(reordered.expenses.map(e=>e.paidBy),['Lâm','Vy','An']);
  const renamed=m.tripSchema.parse(m.prepareTripEdit(old,{...clone(old),travelersText:'Thành Lâm\nVy\nAn'}));
  assert.deepEqual(renamed.expenses.map(e=>e.paidBy),['Thành Lâm','Vy','An']);
  const placeholder=trip(); delete placeholder.travelers; placeholder.expenses[0].paidBy='người 2';
  const named=m.prepareTripEdit(placeholder,{...clone(placeholder),travelersText:'Lâm\nVy'});
  assert.equal(named.expenses[0].paidBy,'Vy');
});

test('date edit does not move records unless shiftAll, then shifts every dated record equally', () => {
  const old=trip(), before=clone(old);
  const keep=m.tripSchema.parse(m.prepareTripEdit(old,{...clone(old),startDate:'2027-01-02',endDate:'2027-01-04',shiftAll:false}));
  assert.equal(keep.activities[0].date,'2026-12-31'); assert.equal(keep.bookings[0].date,'2027-01-01'); assert.deepEqual(keep.dayNotes,old.dayNotes);
  const shifted=m.tripSchema.parse(m.prepareTripEdit(old,{...clone(old),startDate:'2027-01-02',endDate:'2027-01-04',people:3,travelersText:'Lâm\nVy\nAn',shiftAll:true}));
  assert.equal(shifted.activities[0].date,'2027-01-02'); assert.equal(shifted.activities[0].startTime,'23:00'); assert.equal(shifted.activities[0].endNextDay,true);
  assert.equal(shifted.bookings[0].date,'2027-01-03');
  assert.deepEqual(shifted.dayNotes,{'2027-01-02':'PRIVATE-DAY-NOTE','2027-01-06':'Ghi chú ngoài khoảng chuyến'});
  assert.equal(shifted.activities[0].actualPeople,2); assert.equal(m.summarize(shifted).spent,m.summarize(old).spent);
  assert.deepEqual(old,before);
  assert.throws(()=>m.prepareTripEdit(old,{...clone(old),people:0}));
  assert.throws(()=>m.prepareTripEdit(old,{...clone(old),people:2.5}));
  assert.throws(()=>m.prepareTripEdit(old,{...clone(old),shiftAll:true,startDate:'2027-02-30'}));
});

test('duplicate uses current unsaved draft and clears all payment, booking and completion history', () => {
  const draft=activity({title:'Tên mới chưa lưu',date:'2027-01-05',notes:'Nội dung vừa gõ',cost:12345,actualCost:999,actualPeople:4,bookingId:'booking'}), before=clone(draft);
  const copy=m.activitySchema.parse(m.duplicateActivity(draft));
  assert.notEqual(copy.id,draft.id); assert.equal(copy.title,'Tên mới chưa lưu (bản sao)'); assert.equal(copy.notes,draft.notes); assert.equal(copy.date,draft.date); assert.equal(copy.cost,12345);
  assert.equal(copy.actualCost,null); assert.equal(copy.actualPeople,undefined); assert.equal(copy.paidBy,''); assert.equal(copy.bookingId,''); assert.equal(copy.status,'planned'); assert.equal(copy.previousStatus,undefined);
  assert.equal(copy.backup,draft.backup); assert.equal(copy.endNextDay,true); assert.deepEqual(draft,before);
  assert.throws(()=>m.duplicateActivity({...draft,endTime:'22:00',endNextDay:false}));
});

test('booking-to-activity uses one-hour rollover and zero additional cost', () => {
  const b=trip().bookings[0], a=m.activitySchema.parse({id:'from-booking',...m.activityFromBooking(b)});
  assert.equal(a.startTime,'23:30'); assert.equal(a.endTime,'00:30'); assert.equal(a.endNextDay,true); assert.equal(a.status,'booked'); assert.equal(a.bookingId,b.id); assert.equal(a.cost,0); assert.equal(a.actualCost,null);
});

function parseHTML(html) {
  const python=spawnSync('python',['-c',`from html.parser import HTMLParser
import json,sys
class Audit(HTMLParser):
 def __init__(self):
  super().__init__(convert_charrefs=True); self.tags=[]; self.text=[]
 def handle_starttag(self,tag,attrs): self.tags.append([tag,dict(attrs)])
 def handle_data(self,data): self.text.append(data)
p=Audit();p.feed(sys.stdin.read());print(json.dumps({'tags':p.tags,'text':p.text}))`],{input:html,encoding:'utf8'});
  assert.equal(python.status,0,python.stderr); return JSON.parse(python.stdout);
}
function assertPassiveHTML(audit) {
  for (const [tag,attrs] of audit.tags) {
    assert.ok(!['script','iframe','object','embed','link','img','audio','video','source','base','form'].includes(tag),`active/resource tag: ${tag}`);
    assert.ok(!Object.keys(attrs).some(a=>/^on/i.test(a)||['src','srcset','action','background'].includes(a)),`active/resource attribute: ${JSON.stringify(attrs)}`);
    if (attrs.href) assert.ok(attrs.href.startsWith('#')||/^https?:\/\//i.test(attrs.href),`unsafe href ${attrs.href}`);
    assert.ok(!(tag==='meta'&&String(attrs['http-equiv']).toLowerCase()==='refresh'));
  }
}

test('offline HTML escapes field/URL injection and has no scripts or external assets', () => {
  const t=trip(), payload='</title><img src=x onerror="alert(1)"><script>alert(2)</script><p data-x=" & \'', link='https://example.test/booking?label="x"&tag=<y>&quote=\'';
  t.title=payload; t.destination=payload; t.notes=payload; t.dayNotes[t.startDate]=payload;
  Object.assign(t.activities[0],{title:payload,place:payload,address:payload,notes:payload,backup:payload,transport:payload});
  Object.assign(t.bookings[0],{title:payload,provider:payload,reference:payload,phone:payload,notes:payload,url:link});
  t.expenses[0].title=payload; t.expenses[0].paidBy=payload; t.checklist[0].text=payload; t.checklist[0].assignee=payload;
  const html=m.exportOfflineHTML(t), audit=parseHTML(html);
  assertPassiveHTML(audit);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(audit.text.some(s=>s.includes(payload)));
  assert.ok(audit.tags.some(([tag,attrs])=>tag==='a'&&attrs.href===link));
  assert.ok(!/url\s*\(/i.test(html));
  assert.ok(!/<script(?:\s|>)/i.test(html));
  assert.ok(html.includes('BẢN XEM NGOẠI TUYẾN'));
  assert.ok(audit.tags.some(([tag,attrs])=>tag==='a'&&attrs.href.startsWith('https://www.google.com/maps/')));
});

test('offline export omits unsafe link protocols even if caller bypasses validation', () => {
  for (const url of ['javascript:alert(1)','JaVaScRiPt:alert(1)','data:text/html,<script>alert(1)</script>','//example.test/a','file:///tmp/private',' https://example.test/a','https://example.test/a\n']) {
    const t=trip();t.bookings[0].url=url;
    const audit=parseHTML(m.exportOfflineHTML(t));
    assertPassiveHTML(audit);
    assert.ok(!audit.tags.some(([tag,attrs])=>tag==='a'&&attrs.href===url),url);
  }
  const t=trip(); t.people='<img src=x onerror=alert(1)>';t.activities[0].travelMinutes='<script>alert(1)</script>';
  assertPassiveHTML(parseHTML(m.exportOfflineHTML(t)));
});

test('short share text includes only itinerary fields and leaves confidential sections out', () => {
  const t=trip();t.activities[0].notes='PRIVATE-ACTIVITY-NOTE';t.activities[0].backup='PRIVATE-BACKUP';t.notes='PRIVATE-TRIP-NOTE';t.expenses[0].notes='PRIVATE-EXPENSE-NOTE';t.activities[0].url='https://example.test/PRIVATE-ACTIVITY-URL';
  const before=clone(t), text=m.exportTripText(t);
  for (const token of ['PRIVATE-REFERENCE','PRIVATE-PHONE','PRIVATE-BOOKING-NOTE','PRIVATE-PLACE-NOTE','SAVED-PRIVATE-ADDRESS','PRIVATE-CHECKLIST','PRIVATE-ASSIGNEE','PRIVATE-DAY-NOTE','PRIVATE-ACTIVITY-NOTE','PRIVATE-BACKUP','PRIVATE-TRIP-NOTE','PRIVATE-EXPENSE-NOTE','PRIVATE-ACTIVITY-URL']) assert.ok(!text.includes(token),token);
  for (const expected of [t.title,t.destination,t.activities[0].title,t.activities[0].place,t.activities[0].address,t.timezone,'23:00–00:30 (+1 ngày)']) assert.ok(text.includes(expected),expected);
  assert.ok(!text.includes('₫')&&!text.includes('Ngân sách'));
  assert.deepEqual(t,before);
});

const failed=results.filter(r=>!r.ok);
console.log(`V2 UI helpers: ${results.length-failed.length}/${results.length} checks passed.`);
if(failed.length) process.exitCode=1;
