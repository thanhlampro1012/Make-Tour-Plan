import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = await build({
  stdin: {
    contents: 'export * from "./lib/discovery.ts"; export { activitySchema, placeSchema, dateSchema, categories, duration, mapsUrl } from "./lib/travel.ts";',
    resolveDir: root,
    sourcefile: 'discovery-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
});
const m = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const data = JSON.parse(await readFile(path.join(root, 'lib/suggestions-data.json'), 'utf8'));
const checks = [];
function test(name, fn) { fn(); checks.push(name); console.log(`PASS ${name}`); }
const timestamp = (a, end = false) => Date.parse(`${a.date}T${end ? a.endTime : a.startTime}:00Z`) + (end && a.endNextDay ? 86400000 : 0);

test('32 researched records, unique IDs and expected city coverage', () => {
  assert.equal(m.suggestions.length, 32);
  assert.equal(new Set(m.suggestions.map(p => p.id)).size, 32);
  assert.equal(data.places.length, 32);
  const counts = Object.fromEntries(m.discoveryCities.map(city => [city, m.suggestions.filter(p => p.city === city).length]));
  assert.deepEqual(counts, { 'TP.HCM': 22, 'Vũng Tàu': 4, 'Đà Lạt': 3, 'Đà Nẵng': 2, 'Hội An': 1 });
});

test('required source/estimate fields and safe URL shape', () => {
  for (const p of m.suggestions) {
    for (const k of ['id','name','city','address','description','bestTime','tips','sourceUrl','sourceLabel','mapsQuery']) assert.ok(typeof p[k] === 'string' && p[k].trim(), `${p.id}: ${k}`);
    assert.ok(p.category in m.categories, `${p.id}: category`);
    assert.equal(typeof p.indoor, 'boolean');
    assert.ok(p.vibes.length >= 2 && p.vibes.every(v => typeof v === 'string' && v.trim()));
    assert.equal(new Set(p.vibes).size, p.vibes.length);
    assert.ok(Number.isInteger(p.visitMinutes) && p.visitMinutes > 0 && p.visitMinutes < 1440);
    assert.ok((p.budgetMin === null && p.budgetMax === null) || (Number.isFinite(p.budgetMin) && Number.isFinite(p.budgetMax) && p.budgetMin >= 0 && p.budgetMax >= p.budgetMin));
    assert.equal(p.checkedAt, '2026-11-27');
    m.dateSchema.parse(p.checkedAt);
    const source = new URL(p.sourceUrl);
    assert.equal(source.protocol, 'https:');
    assert.equal(source.username, '');
    assert.equal(source.password, '');
    const map = new URL(m.mapsUrl(p.name, p.address));
    assert.equal(map.hostname, 'www.google.com');
    assert.ok(map.searchParams.get('query').includes(p.name));
    assert.ok(map.searchParams.get('query').includes(p.address));
    assert.ok(!Object.hasOwn(p, 'rating') && !Object.hasOwn(p, 'stars'));
  }
});

test('all suggestions convert to strict Activity and Place schema', () => {
  const ids = new Set();
  for (const p of m.suggestions) {
    const a = m.activitySchema.parse(m.suggestionActivity(p, '2026-12-31', '23:30'));
    const place = m.placeSchema.parse(m.suggestionPlace(p));
    assert.equal(m.duration(a), p.visitMinutes);
    assert.equal(a.perPerson, true);
    assert.equal(a.actualCost, null);
    assert.equal(a.status, 'planned');
    assert.equal(a.bookingId, '');
    assert.equal(a.cost, m.suggestedCost(p));
    assert.ok(a.notes.includes(p.sourceUrl));
    assert.ok(a.notes.includes('dự trù'));
    assert.equal(place.address, p.address);
    assert.equal(place.visited, false);
    assert.ok(!ids.has(a.id) && !ids.has(place.id) && a.id !== place.id);
    ids.add(a.id); ids.add(place.id);
  }
});

test('templates resolve IDs, preserve order, allow year rollover, and leave 25-minute gaps', () => {
  for (const idea of m.dayIdeas) {
    for (const start of [idea.startTime, '23:30']) {
      const built = m.buildDayIdea(idea.ids, '2026-12-31', start);
      assert.equal(built.length, idea.ids.length);
      for (let i = 0; i < built.length; i++) {
        const a = m.activitySchema.parse(built[i]);
        assert.equal(a.title, m.suggestions.find(p => p.id === idea.ids[i]).name);
        assert.equal(a.travelMinutes, i ? 25 : 0);
        if (i) assert.equal(timestamp(a) - timestamp(built[i - 1], true), 25 * 60000);
      }
    }
  }
  const first = m.dayIdeas[0];
  const overnight = m.buildDayIdea(first.ids, '2026-12-31', '23:30');
  assert.equal(overnight[0].endNextDay, true);
  assert.equal(overnight[1].date, '2027-01-01');
  assert.throws(() => m.buildDayIdea(['missing-place'], '2026-11-27', '09:00'));
  assert.throws(() => m.buildDayIdea(first.ids, '2026-02-30', '09:00'));
});

test('activity-based youth choices are represented without closed sample venues', () => {
  const activities = m.suggestions.filter(p => p.category === 'other');
  assert.equal(activities.length, 8);
  for (const tag of ['Workshop','Vận động','Giải đố','Photobooth']) assert.ok(activities.some(p => p.vibes.includes(tag)), tag);
  assert.ok(!m.suggestions.some(p => /Snow Town|Hey Camel|Jump Arena.*Lê Thị Riêng/i.test(p.name)));
});

console.log(`Discovery validation complete: ${checks.length} checks, ${m.suggestions.length} venues, ${m.dayIdeas.length} templates.`);
