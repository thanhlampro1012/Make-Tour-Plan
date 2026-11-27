import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import ts from 'typescript';
import { createTrip } from '../lib/travel.ts';

const source = readFileSync(new URL('../lib/use-travel-store.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace('from "./travel"', 'from "../lib/travel.ts"');
mkdirSync(new URL('../work/', import.meta.url), {recursive:true});
writeFileSync(new URL('../work/persistence-runtime.mjs', import.meta.url), compiled);
const { createTravelStoreController } = await import('../work/persistence-runtime.mjs');

class MemoryStorage {
  constructor(copy) { this.data = new Map(copy?.data ?? []); this.failReads = false; this.failWrites = false; }
  get length() { if (this.failReads) throw new Error('Storage denied'); return this.data.size; }
  key(index) { if (this.failReads) throw new Error('Storage denied'); return [...this.data.keys()][index] ?? null; }
  getItem(key) { if (this.failReads) throw new Error('Storage denied'); return this.data.get(String(key)) ?? null; }
  setItem(key, value) { if (this.failWrites) throw new Error('Quota exceeded'); this.data.set(String(key), String(value)); }
  removeItem(key) { if (this.failWrites) throw new Error('Storage denied'); this.data.delete(String(key)); }
}
const clone = value => structuredClone(value);
const baseTrip = createTrip({ id: 'test-trip', title: 'Server baseline', destination: 'Đà Lạt', startDate: '2026-12-04', endDate: '2026-12-06', checklist: [] });
const trip = title => ({ ...clone(baseTrip), title });
const key = 'len-duong:v1:test-user';
const pause = async () => { for (let index=0; index<12; index++) await Promise.resolve(); };
function server(initial=[baseTrip], revision=1) {
  return {
    trips: clone(initial), revision, authenticatedUser: 'test-user', offline: false, calls: [], holdPut: false, holdGet: false, releasePut: null, releaseGet: null, losePut: false, malformedGet: null,
    async fetcher(_url, init={}) {
      const method=init.method ?? 'GET';
      const expectedUser=new Headers(init.headers).get('x-expected-user-id');
      this.calls.push({method, expectedUser, body:init.body ? JSON.parse(init.body) : null});
      if(this.offline) throw new Error('Network unavailable');
      if(expectedUser!==this.authenticatedUser) return Response.json({code:'identity_changed',error:'Tài khoản đăng nhập đã thay đổi. Hãy xuất bản nháp rồi làm mới trang bằng trình duyệt.'},{status:403});
      if(method==='GET') {
        const payload=this.malformedGet ?? {trips:clone(this.trips),revision:this.revision};
        if(this.holdGet) { this.holdGet=false; return new Promise(resolve=>{this.releaseGet=()=>resolve(Response.json(payload));}); }
        return Response.json(payload);
      }
      const data=JSON.parse(init.body);
      if(data.revision!==this.revision) return Response.json({error:'Conflict'}, {status:409});
      this.trips=clone(data.trips);this.revision++;
      const payload={revision:this.revision};
      if(this.losePut) {this.losePut=false;throw new Error('Response lost after commit');}
      if(this.holdPut) {this.holdPut=false;return new Promise(resolve=>{this.releasePut=()=>resolve(Response.json(payload));});}
      return Response.json(payload);
    }
  };
}
let nextId=0;
let alive=[];
function client(srv, storage=new MemoryStorage(), session=new MemoryStorage(), account='test-user',storageScope) {
  const c=createTravelStoreController(account,{storageScope,localStorage:storage,sessionStorage:session,fetcher:srv.fetcher.bind(srv),makeId:()=>`test-page-${++nextId}`,now:()=>new Date('2026-11-27T00:00:00Z'),debounceMs:60000,timeoutMs:5000});
  alive.push(c);
  return {c,storage,session,ownKey:()=>session?.getItem(`${storageScope??'len-duong'}:v1:${account ?? 'preview'}:active-draft`)??null};
}
function ownRecord(f) {const pointer=f.ownKey();return pointer?JSON.parse(f.storage.getItem(pointer)):null;}
let passed=0;
async function test(name,run) {
  alive=[];
  try { await run(); passed++; console.log(`PASS ${name}`); }
  finally { for(const c of alive)c.stop(); }
}

await test('another tab clean save cannot erase a conflicting local draft; refresh retains original CAS base',async()=>{
  const srv=server(),storage=new MemoryStorage();
  const a=client(srv,storage),b=client(srv,storage);
  await a.c.start();await b.c.start();
  a.c.change([trip('Tab A')]);srv.holdPut=true;const savingA=a.c.retry();await pause();
  b.c.change([trip('Tab B unsaved')]);const bKey=b.ownKey();
  srv.releasePut();await savingA;
  assert.equal(JSON.parse(storage.getItem(bKey)).trips[0].title,'Tab B unsaved');
  await b.c.retry();assert.equal(b.c.getSnapshot().status,'conflict');assert.equal(ownRecord(b).baseRevision,1);
  b.c.stop();const refreshed=client(srv,storage,b.session);await refreshed.c.start();
  assert.equal(refreshed.c.getSnapshot().status,'conflict');assert.equal(refreshed.c.getSnapshot().trips[0].title,'Tab B unsaved');assert.equal(ownRecord(refreshed).baseRevision,1);
  await refreshed.c.retry();assert.equal(srv.trips[0].title,'Tab A');assert.equal(srv.revision,2);
  a.c.refreshFromStorage();assert(a.c.getSnapshot().recoverableDrafts.some(d=>d.trips[0].title==='Tab B unsaved'));
});

await test('failed initial GET really retries, including a clean cached snapshot',async()=>{
  const srv=server();srv.offline=true;const f=client(srv);await f.c.start();assert.equal(f.c.getSnapshot().status,'error');
  srv.offline=false;await f.c.retry();assert.equal(f.c.getSnapshot().status,'saved');assert.equal(f.c.getSnapshot().trips[0].title,'Server baseline');
  const storage=new MemoryStorage();storage.setItem(`${key}:clean`,JSON.stringify({version:1,trips:[baseTrip],revision:1,dirty:false}));
  srv.trips=[trip('Changed elsewhere')];srv.revision=2;srv.offline=true;const g=client(srv,storage);await g.c.start();assert.equal(g.c.getSnapshot().trips[0].title,'Server baseline');
  srv.offline=false;await g.c.retry();assert.equal(g.c.getSnapshot().trips[0].title,'Changed elsewhere');assert.equal(g.c.getSnapshot().status,'saved');
});

await test('edits without a known baseline never overwrite a populated server; an empty server safely accepts them',async()=>{
  const srv=server();srv.offline=true;const f=client(srv);await f.c.start();f.c.change([trip('Offline new plan')]);assert.equal(ownRecord(f).baseRevision,null);
  srv.offline=false;await f.c.retry();assert.equal(f.c.getSnapshot().status,'conflict');assert.equal(srv.trips[0].title,'Server baseline');assert.equal(ownRecord(f).baseRevision,null);
  const fresh=server(null,0);fresh.offline=true;const g=client(fresh);await g.c.start();g.c.change([trip('First new plan')]);fresh.offline=false;await g.c.retry();assert.equal(g.c.getSnapshot().status,'saved');assert.equal(fresh.trips[0].title,'First new plan');assert.equal(fresh.revision,1);
});

await test('failed confirmed reload preserves the plan and all outboxes; successful reload discards only this page',async()=>{
  const srv=server(),storage=new MemoryStorage();const a=client(srv,storage),b=client(srv,storage);await a.c.start();await b.c.start();
  a.c.change([trip('My draft')]);b.c.change([trip('Other tab draft')]);const own=a.ownKey(),other=b.ownKey();srv.offline=true;
  await a.c.reloadServer();assert.equal(a.c.getSnapshot().trips[0].title,'My draft');assert(storage.getItem(own));assert(storage.getItem(other));
  srv.offline=false;await a.c.reloadServer();assert.equal(a.c.getSnapshot().trips[0].title,'Server baseline');assert.equal(storage.getItem(own),null);assert(storage.getItem(other));
});

await test('typing during a save preserves newer draft and advances only its acknowledged base',async()=>{
  const srv=server();const f=client(srv);await f.c.start();f.c.change([trip('Sent snapshot')]);srv.holdPut=true;const save=f.c.retry();await pause();
  f.c.change([trip('Newer edit while saving')]);srv.releasePut();await save;assert.equal(ownRecord(f).baseRevision,2);assert.equal(ownRecord(f).trips[0].title,'Newer edit while saving');assert.equal(f.c.getSnapshot().status,'saving');
  await f.c.retry();assert.equal(srv.trips[0].title,'Newer edit while saving');assert.equal(srv.revision,3);assert.equal(f.c.getSnapshot().status,'saved');assert.equal(f.ownKey(),null);
});

await test('legacy dirty cache migrates without losing base revision or deleting a subsequently changed source',async()=>{
  const srv=server(),storage=new MemoryStorage();const old=JSON.stringify({version:1,trips:[trip('Legacy draft')],revision:1,dirty:true});storage.setItem(key,old);
  const f=client(srv,storage);await f.c.start();assert.equal(f.c.getSnapshot().trips[0].title,'Legacy draft');assert.equal(ownRecord(f).baseRevision,1);assert.equal(storage.getItem(key),old);
  srv.holdPut=true;const saving=f.c.retry();await pause();const changed=JSON.stringify({version:1,trips:[trip('Legacy changed by older tab')],revision:1,dirty:true});storage.setItem(key,changed);srv.releasePut();await saving;
  assert.equal(storage.getItem(key),changed);assert(f.c.getSnapshot().recoverableDrafts.some(d=>d.trips[0].title==='Legacy changed by older tab'));
});

await test('a cloned session adopts a copy; acknowledgement never removes a source edited since adoption',async()=>{
  const srv=server(),storage=new MemoryStorage();const a=client(srv,storage);await a.c.start();a.c.change([trip('Original tab draft')]);const originalKey=a.ownKey();
  const b=client(srv,storage,new MemoryStorage(a.session));await b.c.start();assert.notEqual(b.ownKey(),originalKey);assert.equal(b.c.getSnapshot().trips[0].title,'Original tab draft');
  b.c.change([trip('Clone branch')]);a.c.change([trip('Original tab newer draft')]);await b.c.retry();
  assert.equal(JSON.parse(storage.getItem(originalKey)).trips[0].title,'Original tab newer draft');assert.equal(srv.trips[0].title,'Clone branch');
});

await test('a clone saving a different descendant preserves the original tab even when it made no further edits',async()=>{
  const srv=server(),storage=new MemoryStorage();const a=client(srv,storage);await a.c.start();a.c.change([trip('Original unsaved branch')]);const originalKey=a.ownKey();
  const b=client(srv,storage,new MemoryStorage(a.session));await b.c.start();b.c.change([trip('Different clone descendant')]);await b.c.retry();
  assert.equal(JSON.parse(storage.getItem(originalKey)).trips[0].title,'Original unsaved branch');assert(b.c.getSnapshot().recoverableDrafts.some(d=>d.trips[0].title==='Original unsaved branch'));
  a.c.stop();const restored=client(srv,storage,a.session);await restored.c.start();assert.equal(restored.c.getSnapshot().trips[0].title,'Original unsaved branch');assert.equal(restored.c.getSnapshot().status,'conflict');
});

await test('lost PUT response is recognized on retry without a spurious conflict or duplicate write',async()=>{
  const srv=server();const f=client(srv);await f.c.start();f.c.change([trip('Committed despite lost response')]);srv.losePut=true;await f.c.retry();assert.equal(f.c.getSnapshot().status,'error');assert.equal(srv.revision,2);assert(ownRecord(f));
  await f.c.retry();assert.equal(f.c.getSnapshot().status,'saved');assert.equal(srv.revision,2);assert.equal(f.ownKey(),null);
});

await test('storage failures are explicit and preview never reports a successful local save',async()=>{
  const srv=server(),storage=new MemoryStorage();storage.failWrites=true;const f=client(srv,storage);await f.c.start();assert(f.c.getSnapshot().storageWarning);
  f.c.change([trip('Memory only')]);srv.offline=true;await f.c.retry();assert.equal(f.c.getSnapshot().status,'error');assert(f.c.getSnapshot().storageWarning);assert.equal(f.c.getSnapshot().trips[0].title,'Memory only');
  const preview=client(srv,storage,new MemoryStorage(),null);await preview.c.start();assert.equal(preview.c.getSnapshot().status,'error');assert(preview.c.getSnapshot().storageWarning);
  storage.failWrites=false;await preview.c.retry();assert.equal(preview.c.getSnapshot().status,'local');assert.equal(preview.c.getSnapshot().storageWarning,'');assert(ownRecord(preview));
});

await test('corrupt legacy bytes remain untouched and malformed clean bytes are preserved before replacement',async()=>{
  const srv=server(),storage=new MemoryStorage();storage.setItem(key,'{broken legacy bytes');storage.setItem(`${key}:clean`,'{broken new cache');const f=client(srv,storage);await f.c.start();
  assert.equal(storage.getItem(key),'{broken legacy bytes');assert([...storage.data.entries()].some(([k,v])=>k.includes(':unreadable:')&&v==='{broken new cache'));assert.equal(JSON.parse(storage.getItem(`${key}:clean`)).trips[0].title,'Server baseline');assert(f.c.getSnapshot().storageWarning);
});

await test('a detached loading response cannot mutate a restarted store',async()=>{
  const srv=server();srv.holdGet=true;const f=client(srv);const first=f.c.start();await pause();f.c.stop();srv.trips=[trip('New generation')];srv.revision=2;
  await f.c.start();assert.equal(f.c.getSnapshot().trips[0].title,'New generation');srv.releaseGet();await first;assert.equal(f.c.getSnapshot().trips[0].title,'New generation');
});

await test('an old successful response cannot downgrade the clean cache after another tab saves a newer revision',async()=>{
  const srv=server(),storage=new MemoryStorage();const a=client(srv,storage);await a.c.start();a.c.change([trip('Revision two')]);srv.holdPut=true;const aSave=a.c.retry();await pause();
  const b=client(srv,storage);await b.c.start();b.c.change([trip('Revision three')]);await b.c.retry();assert.equal(srv.revision,3);srv.releasePut();await aSave;
  assert.equal(JSON.parse(storage.getItem(`${key}:clean`)).revision,3);assert.equal(a.c.getSnapshot().trips[0].title,'Revision three');
});

await test('a deliberate empty first account state remains empty after reload',async()=>{
  const srv=server(null,0);const f=client(srv);await f.c.start();assert.equal(f.c.getSnapshot().trips.length,1);f.c.change([]);await f.c.retry();assert.deepEqual(srv.trips,[]);assert.equal(srv.revision,1);
  f.c.stop();const g=client(srv,f.storage,f.session);await g.c.start();assert.deepEqual(g.c.getSnapshot().trips,[]);assert.equal(g.c.getSnapshot().status,'saved');
});

await test('typing while a confirmed reload is in flight preserves that newer edit',async()=>{
  const srv=server();const f=client(srv);await f.c.start();f.c.change([trip('Earlier draft')]);srv.holdGet=true;const reload=f.c.reloadServer();await pause();f.c.change([trip('Typed during reload')]);srv.releaseGet();await reload;
  assert.equal(f.c.getSnapshot().trips[0].title,'Typed during reload');assert.equal(ownRecord(f).trips[0].title,'Typed during reload');await f.c.retry();assert.equal(srv.trips[0].title,'Typed during reload');
});

await test('malformed runtime responses never clear a valid local draft or claim a save',async()=>{
  const srv=server();const f=client(srv);await f.c.start();f.c.change([trip('Protected draft')]);srv.malformedGet={trips:[],revision:'not-a-number'};await f.c.reloadServer();
  assert.equal(f.c.getSnapshot().status,'error');assert.equal(f.c.getSnapshot().trips[0].title,'Protected draft');assert.equal(ownRecord(f).trips[0].title,'Protected draft');
});

await test('GET and PUT are bound to the mounted account; an identity change preserves its draft',async()=>{
  const srv=server();const f=client(srv);await f.c.start();
  assert.equal(srv.calls[0].expectedUser,'test-user');
  f.c.change([trip('Account A unsaved edit')]);srv.authenticatedUser='different-user';srv.trips=[trip('Account B private plan')];
  await f.c.retry();assert.equal(f.c.getSnapshot().status,'error');assert.match(f.c.getSnapshot().message,/Tài khoản đăng nhập đã thay đổi/);assert.equal(ownRecord(f).trips[0].title,'Account A unsaved edit');
  assert.equal(srv.trips[0].title,'Account B private plan');assert.equal(srv.revision,1);assert.equal(srv.calls.find(c=>c.method==='PUT').expectedUser,'test-user');
  await f.c.reloadServer();assert.equal(f.c.getSnapshot().trips[0].title,'Account A unsaved edit');assert.equal(srv.trips[0].title,'Account B private plan');assert.equal(JSON.parse(f.storage.getItem(`${key}:clean`)).trips[0].title,'Server baseline');
});

await test('explicit draft discard removes only the selected displayed snapshot',async()=>{
  const srv=server(),storage=new MemoryStorage();const a=client(srv,storage),b=client(srv,storage);await a.c.start();await b.c.start();
  a.c.change([trip('Current page draft')]);b.c.change([trip('Recovered draft to discard')]);const own=a.ownKey(),other=b.ownKey();a.c.refreshFromStorage();
  const recovered=a.c.getSnapshot().recoverableDrafts.find(d=>d.trips[0].title==='Recovered draft to discard');assert(recovered);
  assert.equal(a.c.discardDraft(own),false);assert(storage.getItem(own));
  assert.equal(a.c.discardDraft('len-duong:v1:someone-else:outbox:untrusted'),false);assert(storage.getItem(other));
  assert.equal(a.c.discardDraft(recovered.id),true);assert.equal(storage.getItem(other),null);assert(storage.getItem(own));assert.equal(a.c.getSnapshot().trips[0].title,'Current page draft');assert.equal(a.c.getSnapshot().recoverableDrafts.length,0);
});

await test('a draft changed since display cannot be deleted by a stale confirmation, even after a list refresh',async()=>{
  const srv=server(),storage=new MemoryStorage();const a=client(srv,storage),b=client(srv,storage);await a.c.start();await b.c.start();b.c.change([trip('Displayed draft')]);a.c.refreshFromStorage();
  const old=a.c.getSnapshot().recoverableDrafts[0];const originalKey=b.ownKey();b.c.change([trip('Newer draft before delete')]);
  assert.equal(a.c.discardDraft(old.id),false);assert.equal(JSON.parse(storage.getItem(originalKey)).trips[0].title,'Newer draft before delete');
  const second=a.c.getSnapshot().recoverableDrafts[0];assert.notEqual(second.id,old.id);b.c.change([trip('Newer again before refreshed confirmation')]);a.c.refreshFromStorage();
  assert.equal(a.c.discardDraft(second.id),false);assert.equal(JSON.parse(storage.getItem(originalKey)).trips[0].title,'Newer again before refreshed confirmation');
  const latest=a.c.getSnapshot().recoverableDrafts[0];assert.equal(a.c.discardDraft(latest.id),true);
});

await test('draft discard storage failures return false and preserve the selected data',async()=>{
  const srv=server(),storage=new MemoryStorage();const a=client(srv,storage),b=client(srv,storage);await a.c.start();await b.c.start();b.c.change([trip('Preserve on denied delete')]);a.c.refreshFromStorage();
  const draft=a.c.getSnapshot().recoverableDrafts[0],other=b.ownKey();storage.failWrites=true;
  assert.equal(a.c.discardDraft(draft.id),false);assert(storage.data.has(other));assert(a.c.getSnapshot().storageWarning);
  storage.failWrites=false;assert.equal(a.c.discardDraft(a.c.getSnapshot().recoverableDrafts[0].id),true);
});

await test('controller compare-and-change refuses a stale React snapshot without touching data or the outbox',async()=>{
  const srv=server(),storage=new MemoryStorage();const a=client(srv,storage),b=client(srv,storage);await a.c.start();await b.c.start();const stale=clone(a.c.getSnapshot().trips);
  b.c.change([trip('New external snapshot')]);await b.c.retry();a.c.refreshFromStorage();const before=clone(a.c.getSnapshot().trips);const keysBefore=[...storage.data.entries()];
  assert.throws(()=>a.c.change([trip('Stale overwrite attempt')],stale),/đã có thay đổi mới/);assert.deepEqual(a.c.getSnapshot().trips,before);assert.deepEqual([...storage.data.entries()],keysBefore);
  const canonicalEquivalent=clone(before);canonicalEquivalent[0].title=`  ${canonicalEquivalent[0].title}  `;
  a.c.change([trip('Intentional new edit')],canonicalEquivalent);assert.equal(a.c.getSnapshot().trips[0].title,'Intentional new edit');
});

const pagesScope='make-tour-plan:pages';
const pagesKey=`${pagesScope}:v1:preview`;

await test('scoped null-user start/change/retry/reload and deliberate empty refresh make zero backend calls',async()=>{
  const srv=server(),storage=new MemoryStorage(),session=new MemoryStorage();const f=client(srv,storage,session,null,pagesScope);
  await f.c.start();assert.equal(f.c.getSnapshot().status,'local');assert.equal(f.c.getSnapshot().trips.length,1);
  f.c.change([trip('My standalone plan')],f.c.getSnapshot().trips);await f.c.retry();await f.c.reloadServer();assert.equal(f.c.getSnapshot().trips[0].title,'My standalone plan');
  f.c.change([]);await f.c.retry();await f.c.reloadServer();assert.deepEqual(f.c.getSnapshot().trips,[]);f.c.stop();
  const sameSession=client(srv,storage,session,null,pagesScope);await sameSession.c.start();assert.deepEqual(sameSession.c.getSnapshot().trips,[]);
  const newTab=client(srv,storage,new MemoryStorage(),null,pagesScope);await newTab.c.start();assert.deepEqual(newTab.c.getSnapshot().trips,[]);assert.equal(srv.calls.length,0);
});

await test('Pages scope isolates local cache/outbox/session keys from the unchanged Site preview namespace',async()=>{
  const srv=server(),storage=new MemoryStorage(),session=new MemoryStorage();const site=client(srv,storage,session,null);await site.c.start();site.c.change([trip('Existing Site preview')]);
  const siteHead=storage.getItem('len-duong:v1:preview:clean');const pages=client(srv,storage,session,null,pagesScope);await pages.c.start();assert.notEqual(pages.c.getSnapshot().trips[0].title,'Existing Site preview');pages.c.change([trip('Pages only')]);
  assert.equal(storage.getItem('len-duong:v1:preview:clean'),siteHead);assert.equal(JSON.parse(storage.getItem(`${pagesKey}:clean`)).trips[0].title,'Pages only');assert(pages.ownKey().startsWith(`${pagesKey}:outbox:`));
  const independent=client(srv,storage,new MemoryStorage(),null,'make-tour-plan:another');await independent.c.start();assert.notEqual(independent.c.getSnapshot().trips[0].title,'Pages only');assert.equal(srv.calls.length,0);
});

await test('focusing a stale clean local tab adopts the newer head without writing it back',async()=>{
  const originalWindow=globalThis.window;const listeners=new Map();
  globalThis.window={addEventListener(type,callback){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(callback);},removeEventListener(type,callback){listeners.get(type)?.delete(callback);}};
  try {
    const srv=server(),storage=new MemoryStorage();const a=client(srv,storage,new MemoryStorage(),null,pagesScope),b=client(srv,storage,new MemoryStorage(),null,pagesScope);await a.c.start();await b.c.start();
    a.c.change([trip('Newest actual edit')]);const head=storage.getItem(`${pagesKey}:clean`);
    for(const callback of listeners.get('focus')??[])callback();await pause();
    assert.equal(storage.getItem(`${pagesKey}:clean`),head);assert.equal(b.c.getSnapshot().trips[0].title,'Newest actual edit');
    const fresh=client(srv,storage,new MemoryStorage(),null,pagesScope);await fresh.c.start();assert.equal(fresh.c.getSnapshot().trips[0].title,'Newest actual edit');assert.equal(srv.calls.length,0);
  } finally {for(const c of alive)c.stop();alive=[];if(originalWindow===undefined)delete globalThis.window;else globalThis.window=originalWindow;}
});

await test('local change checks the shared head before a storage event has rendered',async()=>{
  const srv=server(),storage=new MemoryStorage();const a=client(srv,storage,new MemoryStorage(),null,pagesScope),b=client(srv,storage,new MemoryStorage(),null,pagesScope);await a.c.start();await b.c.start();const stale=clone(a.c.getSnapshot().trips);
  b.c.change([trip('Other tab latest')]);const head=storage.getItem(`${pagesKey}:clean`);
  assert.throws(()=>a.c.change([trip('Stale local overwrite')],stale),/tab khác|thay đổi/);assert.equal(storage.getItem(`${pagesKey}:clean`),head);assert.equal(a.c.getSnapshot().trips[0].title,'Other tab latest');assert.equal(srv.calls.length,0);
});

await test('a local pending draft remains separate when another tab advances the shared head',async()=>{
  const srv=server(),storage=new MemoryStorage();const a=client(srv,storage,new MemoryStorage(),null,pagesScope),b=client(srv,storage,new MemoryStorage(),null,pagesScope);await a.c.start();await b.c.start();
  storage.failWrites=true;a.c.change([trip('Pending after quota failure')]);assert.equal(a.c.getSnapshot().status,'error');assert(a.c.getSnapshot().storageWarning);storage.failWrites=false;
  b.c.change([trip('Newer saved local plan')]);const head=storage.getItem(`${pagesKey}:clean`);a.c.refreshFromStorage();await a.c.retry();
  assert.equal(a.c.getSnapshot().status,'conflict');assert.equal(a.c.getSnapshot().trips[0].title,'Pending after quota failure');assert.equal(ownRecord(a).trips[0].title,'Pending after quota failure');assert.equal(storage.getItem(`${pagesKey}:clean`),head);
  await a.c.reloadServer();assert.equal(a.c.getSnapshot().status,'local');assert.equal(a.c.getSnapshot().trips[0].title,'Newer saved local plan');assert.equal(storage.getItem(`${pagesKey}:clean`),head);assert.equal(srv.calls.length,0);
});

await test('a failed initial local read never seeds over an existing plan when storage recovers',async()=>{
  const srv=server(),storage=new MemoryStorage();const saved=JSON.stringify({version:1,trips:[trip('Previously saved plan')],revision:7,dirty:false});storage.setItem(`${pagesKey}:clean`,saved);storage.failReads=true;storage.failWrites=true;
  const f=client(srv,storage,new MemoryStorage(),null,pagesScope);await f.c.start();assert.equal(f.c.getSnapshot().status,'error');assert.deepEqual(f.c.getSnapshot().trips,[]);assert.equal(storage.data.get(`${pagesKey}:clean`),saved);
  storage.failReads=false;storage.failWrites=false;await f.c.retry();assert.equal(f.c.getSnapshot().trips[0].title,'Previously saved plan');assert.equal(f.c.getSnapshot().status,'local');assert.equal(storage.getItem(`${pagesKey}:clean`),saved);assert.equal(srv.calls.length,0);
});

await test('scoped local quota/session/corruption failures stay recoverable and make no network requests',async()=>{
  const srv=server(),storage=new MemoryStorage();storage.failWrites=true;const f=client(srv,storage,new MemoryStorage(),null,pagesScope);await f.c.start();assert.equal(f.c.getSnapshot().status,'error');assert(f.c.getSnapshot().storageWarning);
  storage.failWrites=false;await f.c.retry();assert.equal(f.c.getSnapshot().status,'local');assert.equal(f.c.getSnapshot().storageWarning,'');
  const noSession=client(srv,storage,null,null,pagesScope);await noSession.c.start();assert.equal(noSession.c.getSnapshot().status,'local');assert(noSession.c.getSnapshot().storageWarning);
  const badStorage=new MemoryStorage();badStorage.setItem(`${pagesKey}:clean`,'{broken original');const corrupt=client(srv,badStorage,new MemoryStorage(),null,pagesScope);await corrupt.c.start();assert(corrupt.c.getSnapshot().storageWarning);assert([...badStorage.data.entries()].some(([key,value])=>key.includes(':unreadable:')&&value==='{broken original'));assert.equal(srv.calls.length,0);
});

await test('scoped local StrictMode start-stop-start does not republish or duplicate a saved head',async()=>{
  const srv=server(),storage=new MemoryStorage();const f=client(srv,storage,new MemoryStorage(),null,pagesScope);await f.c.start();f.c.change([trip('Stable across effect restart')]);const head=storage.getItem(`${pagesKey}:clean`),keys=[...storage.data.keys()].sort();
  f.c.stop();await f.c.start();assert.equal(f.c.getSnapshot().status,'local');assert.equal(f.c.getSnapshot().trips[0].title,'Stable across effect restart');assert.equal(storage.getItem(`${pagesKey}:clean`),head);assert.deepEqual([...storage.data.keys()].sort(),keys);assert.equal(srv.calls.length,0);
});

console.log(`\n${passed} persistence regression scenarios passed.`);
