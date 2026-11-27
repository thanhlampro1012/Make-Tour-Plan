import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { backupSchema } from '../lib/travel.ts';
const places=JSON.parse(readFileSync(new URL('../lib/curated-tour-places.json',import.meta.url),'utf8')).places;
assert.equal(places.length,72);
assert.equal(new Set(places.map(p=>p.city)).size,12);
assert.equal(new Set(places.map(p=>p.city+'|'+p.name)).size,72);
assert.equal(places.filter(p=>p.review).length,12);
for(const p of places){
 assert(['visit','food','coffee'].includes(p.type));
 assert(Number.isSafeInteger(p.cost)&&p.cost>=0&&Number.isSafeInteger(p.minutes)&&p.minutes>0);
 assert(p.address.length>4&&p.sourceUrl.startsWith('https://'));
 if(p.review)assert(p.review.url.startsWith('https://')&&p.review.summary&&p.review.caveat);
}
const script=readFileSync(new URL('../docs/smart-planner.js',import.meta.url),'utf8');
const source=readFileSync(new URL('../pages/smart-planner.js',import.meta.url),'utf8');
assert.equal(script,source,'Build artifact and authored planner must match');
assert(script.includes('mapsDirections(p)')&&script.includes('tiktokSearch(p)')&&script.includes('threadsSearch(p)'));
const els=new Map(),captures={blob:null};
const element=id=>{if(!els.has(id))els.set(id,{id,value:'',textContent:'',innerHTML:'',style:{},hidden:false,options:[],add(option){this.options.push(option);if(!this.value)this.value=option.value},append(){},appendChild(){},addEventListener(){},click(){this.onclick?.()},remove(){}});return els.get(id)};
const dom={documentElement:{classList:{toggle(){},contains(){return false}}},body:{append(){},appendChild(){},style:{}},getElementById:element,createElement:tag=>element('created-'+tag),querySelectorAll:()=>[],addEventListener(){}};
class OptionMock{constructor(text,value){this.text=text;this.value=value}}
const urlMock={createObjectURL(blob){captures.blob=blob;return 'blob:mock'},revokeObjectURL(){}};
new Function('document','Option','URL','setTimeout',script)(dom,OptionMock,urlMock,()=>{});
assert.equal(element('mt-city').options.length,12);
assert(element('mt-cards').innerHTML.includes('google.com/maps/dir'));
assert(element('mt-cards').innerHTML.includes('tiktok.com/search'));
assert(element('mt-cards').innerHTML.includes('reddit.com/search'));
assert(element('mt-cards').innerHTML.includes('threads.com'));
function generate(city,days,people,budget,age='young',pace='balanced',date='2026-12-04'){
 Object.assign(element('mt-city'),{value:city});Object.assign(element('mt-days'),{value:String(days)});
 Object.assign(element('mt-people'),{value:String(people)});Object.assign(element('mt-budget'),{value:String(budget)});
 Object.assign(element('mt-age'),{value:age});Object.assign(element('mt-pace'),{value:pace});Object.assign(element('mt-start'),{value:date});
 element('mt-result').innerHTML='';element('mt-result').textContent='';
 element('mt-form').onsubmit({preventDefault(){}});
 return element('mt-result').innerHTML||element('mt-result').textContent;
}
let passed=0;
for(const city of new Set(places.map(p=>p.city))){
 for(const [days,people,budget,age,pace] of [[1,1,150000,'young','active'],[3,2,4500000,'young','balanced'],[4,4,3000000,'family','relaxed'],[10,2,3000000,'senior','relaxed']]){
  const html=generate(city,days,people,budget,age,pace);
  assert(html.includes('mt-plan-head'),city+': no planner result');
  assert.equal((html.match(/class="mt-day"/g)||[]).length,days);
  assert(!html.includes('NaN'),city+': NaN schedule');
  element('mt-export').onclick();
  const text=await captures.blob.text(),backup=JSON.parse(text);
  const parsed=backupSchema.safeParse(backup);
  assert(parsed.success,city+': '+parsed.error?.issues[0]?.message);
  const trip=parsed.data.trips[0];
  assert.equal(trip.people,people);
  assert.equal(trip.budget,budget);
  assert.equal(trip.activities.length<=days*4,true);
  assert.equal(trip.expenses.length,days*2-1,'One lodging charge per night, not per day');
  const cost=trip.activities.reduce((n,a)=>n+a.cost*people,0)+trip.expenses.reduce((n,e)=>n+e.cost*people,0);
  assert(cost<=budget,'Planner should not exceed entered budget');
  for(const a of trip.activities)assert(a.startTime<a.endTime,'Activity ends after it starts');
  passed++;
 }
}
assert.match(generate('Hà Nội',3,2,4500000,'young','balanced','2026-02-30'),/Kiểm tra ngày hợp lệ/);
assert.match(generate('Hà Nội',10,2,4500000,'young','balanced','2199-12-30'),/Kiểm tra ngày hợp lệ/);
assert.match(generate('Hà Nội',3,2,4500000,'young','balanced','2200-01-01'),/Kiểm tra ngày hợp lệ/);
console.log('PASS 72 named places, 12 sourced summaries and '+passed+' exported trip cases; rejected invalid dates.');
