import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const root=fileURLToPath(new URL('../',import.meta.url));
const compiled=await build({stdin:{contents:'export * from "./lib/research.ts";export * from "./lib/editor-safety.ts";export * from "./lib/trip-exports.ts";export {sampleTrip,tripSchema,referenceSchema,backupSchema} from "./lib/travel.ts";',resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const m=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
let passed=0,failed=0;
function test(name,fn){try{fn();passed++;console.log(`PASS ${name}`);}catch(e){failed++;console.error(`FAIL ${name}: ${e.message}`);}}

test('social searches encode Unicode and cannot inject extra URL parameters',()=>{
  const name='Gốm & chill?x=1#ảnh',city='TP. Hồ Chí Minh';
  const links=m.communityLinks(name,city);assert.equal(links.length,6);
  const reddit=new URL(links.find(x=>x.platform==='reddit').url);
  assert.equal(reddit.hostname,'www.reddit.com');assert.equal(reddit.searchParams.get('q'),`${name} ${city}`);
  assert.equal(reddit.searchParams.size,1);assert.equal(reddit.hash,'');
  const threads=new URL(links.find(x=>x.platform==='threads').url);
  assert.equal(threads.hostname,'www.google.com');assert.equal(threads.searchParams.get('q'),`site:threads.com ${name} ${city}`);
  assert.deepEqual(m.communityLinks('  \n ',' '),[]);
});

test('direction links include the chosen mode, omit origin, and fit Maps URL limits',()=>{
  for(const mode of m.travelModes){
    const url=new URL(m.directionsTo('Ga Đà Lạt','01 Quang Trung',mode.value));
    assert.equal(url.hostname,'www.google.com');assert.equal(url.searchParams.get('api'),'1');
    assert.equal(url.searchParams.get('travelmode'),mode.value);assert.equal(url.searchParams.has('origin'),false);
    assert.equal(url.searchParams.get('destination'),'Ga Đà Lạt, 01 Quang Trung');
    const long=m.directionsTo('Ảnh 🧳'.repeat(100),'Địa chỉ '.repeat(100),mode.value);
    assert.ok(long.length<=2048);assert.ok(!new URL(long).searchParams.get('destination').includes('\ufffd'));
  }
});

test('source identities deduplicate Reddit share variants without trusting spoofed domains',()=>{
  const canonical=m.sourceIdentity('https://www.reddit.com/r/travel/comments/abc123/review/');
  assert.equal(canonical,m.sourceIdentity('https://old.reddit.com/r/travel/comments/abc123/other/?utm_source=share#comment'));
  assert.equal(canonical,m.sourceIdentity('https://redd.it/abc123'));
  assert.notEqual(canonical,m.sourceIdentity('https://reddit.com.attacker.test/r/travel/comments/abc123/'));
  assert.equal(m.sourcePlatform('https://reddit.com.attacker.test/x'),'reddit.com.attacker.test');
  assert.equal(m.sourcePlatform('https://www.threads.com/@travel/post/abc'),'Threads');
  assert.equal(m.sourcePlatform('https://www.google.com/maps/search/?api=1&query=A'),'Google Maps');
});

test('source schema rejects unsafe URLs and duplicate IDs while preserving old backups',()=>{
  const trip=m.sampleTrip();delete trip.references;
  assert.ok(m.backupSchema.safeParse({version:1,trips:[trip]}).success);
  const source=m.referenceFromUrl('Nguồn','https://example.test/review','Đà Lạt','Ghi chú');
  assert.ok(m.referenceSchema.safeParse(source).success);assert.match(source.addedOn,/^\d{4}-\d{2}-\d{2}$/);
  assert.equal(m.referenceSchema.safeParse({...source,url:'javascript:alert(1)'}).success,false);
  assert.equal(m.referenceSchema.safeParse({...source,url:''}).success,false);
  assert.equal(m.tripSchema.safeParse({...trip,references:[source,source]}).success,false);
  assert.deepEqual(m.backupSchema.parse({version:1,trips:[{...trip,references:[source]}]}).trips[0].references,[source]);
});

test('offline references escape private notes and reject active URLs; short sharing excludes them',()=>{
  const trip=m.sampleTrip();trip.references=[{...m.referenceFromUrl('PRIVATE-SOURCE <script>','https://example.test/?a=1&b=2','PRIVATE-PLACE','PRIVATE-NOTE <img src=x onerror=alert(1)>'),id:'r1'},{...m.referenceFromUrl('Unsafe','javascript:alert(1)'),id:'r2'}];
  const html=m.exportOfflineHTML(trip);
  assert.ok(html.includes('PRIVATE-NOTE &lt;img'));assert.ok(html.includes('PRIVATE-SOURCE &lt;script&gt;'));
  assert.ok(html.includes('https://example.test/?a=1&amp;b=2'));assert.ok(!html.includes('href="javascript:'));
  assert.ok(!html.includes('<script>'));assert.ok(!m.exportTripText(trip).includes('PRIVATE-'));
});

test('undo invalidates after any remote edit, addition, or deletion',()=>{
  const trip=m.sampleTrip(),current=[trip],after=JSON.stringify(current);
  assert.equal(m.canUndoTrips(structuredClone(current),after),true);
  assert.equal(m.canUndoTrips([{...trip,notes:'Updated remotely'}],after),false);
  assert.equal(m.canUndoTrips([...current,{...trip,id:'other'}],after),false);
  assert.equal(m.canUndoTrips([],after),false);
});

test('stale entity editors reject changed or deleted records and keep the draft intact',()=>{
  const baseline={id:'a',title:'Old'},draft={...baseline,title:'My draft'};
  assert.doesNotThrow(()=>m.assertUnchangedRecord(baseline,structuredClone(baseline)));
  assert.throws(()=>m.assertUnchangedRecord(baseline,{...baseline,title:'Remote'}),/phiên khác/);
  assert.throws(()=>m.assertUnchangedRecord(baseline,undefined),/bị xóa/);
  assert.equal(draft.title,'My draft');
});

test('curated discussion records have real source links, clear scope, dates, and no invented ratings',()=>{
  const data=JSON.parse(readFileSync(new URL('../lib/community-data.json',import.meta.url),'utf8'));
  assert.equal(data.length,6);assert.equal(new Set(data.map(x=>m.sourceIdentity(x.url))).size,6);
  for(const source of data){
    assert.equal(m.sourcePlatform(source.url),'Reddit');assert.ok(source.summary&&source.limitation&&source.scope);
    assert.match(source.publishedAt,/^\d{4}-\d{2}-\d{2}$/);assert.ok(source.publishedAt<=source.checkedAt);
    assert.equal(source.checkedAt,'2026-11-27');assert.equal(Object.hasOwn(source,'rating'),false);
  }
});

console.log(`Research/editor checks: ${passed} passed, ${failed} failed.`);
if(failed)process.exitCode=1;
