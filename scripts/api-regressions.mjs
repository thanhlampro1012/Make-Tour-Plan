import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { sampleTrip } from '../lib/travel.ts';

const root = resolve(import.meta.dirname, '..');
const headersContext = new AsyncLocalStorage();
const sqlite = new DatabaseSync(':memory:');
let databaseOperations = 0;
const migration = (await readdir(resolve(root, 'drizzle'))).find(name => /^0000.*\.sql$/.test(name));
assert.ok(migration, 'Initial schema migration exists');
sqlite.exec(await readFile(resolve(root, 'drizzle', migration), 'utf8'));

// D1 transport adapter only; production Drizzle query generation and SQLite SQL run unchanged.
class D1Statement {
  constructor(query, params = []) { this.query = query; this.params = params; }
  bind(...params) { return new D1Statement(this.query, params); }
  async raw() {
    const statement = sqlite.prepare(this.query);
    statement.setReturnArrays(true);
    return statement.all(...this.params);
  }
  async all() {
    return { success: true, results: sqlite.prepare(this.query).all(...this.params), meta: {} };
  }
  async run() {
    const result = sqlite.prepare(this.query).run(...this.params);
    return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }
}
globalThis.__travelTestHeaders = headersContext;
globalThis.__travelTestEnv = { DB: { prepare: query => { databaseOperations++; return new D1Statement(query); } } };

await build({
  absWorkingDir: root,
  entryPoints: ['app/api/trips/route.ts'],
  outfile: 'work/api-route-under-test.mjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  packages: 'external',
  logLevel: 'silent',
  plugins: [{
    name: 'request-and-d1-test-adapters',
    setup(context) {
      context.onResolve({ filter: /^(next\/headers|next\/navigation|cloudflare:workers)$/ }, args => ({ path: args.path, namespace: 'test-adapter' }));
      context.onLoad({ filter: /.*/, namespace: 'test-adapter' }, args => ({
        loader: 'js',
        contents: args.path === 'next/headers'
          ? 'export async function headers(){return globalThis.__travelTestHeaders.getStore() ?? new Headers();}'
          : args.path === 'next/navigation'
            ? 'export function redirect(url){throw new Error("Unexpected redirect in API: "+url);}'
            : 'export const env=globalThis.__travelTestEnv;',
      }));
    },
  }],
});

const route = await import(pathToFileURL(resolve(root, 'work/api-route-under-test.mjs')).href);
const results = [];
async function call(method, user, body, options = {}) {
  const headers = new Headers();
  if (user) {
    headers.set('oai-authenticated-user-id', user);
    if (!options.omitEmail) headers.set('oai-authenticated-user-email', `${user}@example.invalid`);
    if (!options.omitExpectedIdentity) headers.set('x-expected-user-id', options.expectedUser ?? user);
  }
  if (method === 'PUT') {
    headers.set('content-type', 'application/json');
    headers.set('origin', options.origin ?? 'https://travel.test');
  }
  const request = new Request('https://travel.test/api/trips', {
    method, headers,
    ...(method === 'PUT' ? { body: options.raw ?? JSON.stringify(body) } : {}),
  });
  const response = await headersContext.run(headers, () => method === 'GET' ? route.GET(request) : route.PUT(request));
  return { status: response.status, data: await response.json(), headers: response.headers };
}
async function expect(name, method, user, body, status, options) {
  const response = await call(method, user, body, options);
  assert.equal(response.status, status, `${name}: ${JSON.stringify(response.data)}`);
  assert.equal(response.headers.get('cache-control'), 'private, no-store', `${name}: private noncacheable response`);
  results.push({ name, status });
  return response.data;
}

const trip = sampleTrip();
await expect('Unauthenticated GET', 'GET', null, undefined, 401);
await expect('Unauthenticated PUT', 'PUT', null, { revision: 0, trips: [trip] }, 401);
await expect('Incomplete identity rejected', 'GET', 'user-a', undefined, 401, { omitEmail: true });
const beforeIdentityChecks = databaseOperations;
for (const method of ['GET', 'PUT']) {
  const missing = await expect(`Missing expected identity rejected before ${method}`, method, 'user-a', method === 'PUT' ? {revision:0,trips:[trip]} : undefined, 403, {omitExpectedIdentity:true});
  assert.equal(missing.code, 'identity_changed');
  const mismatch = await expect(`Changed identity rejected before ${method}`, method, 'user-b', method === 'PUT' ? {revision:0,trips:[trip]} : undefined, 403, {expectedUser:'user-a'});
  assert.equal(mismatch.code, 'identity_changed');
  assert.equal(databaseOperations, beforeIdentityChecks, 'Identity failures must not reach the database');
}
await expect('Malformed JSON rejected', 'PUT', 'user-a', undefined, 400, { raw: '{' });
await expect('JSON null rejected', 'PUT', 'user-a', null, 400);
await expect('Unsafe activity URL rejected', 'PUT', 'user-a', { revision: 0, trips: [{ ...trip, activities: trip.activities.map((item, index) => index ? item : { ...item, url: 'javascript:alert(1)' }) }] }, 400);
await expect('Negative cost rejected', 'PUT', 'user-a', { revision: 0, trips: [{ ...trip, expenses: [{ ...trip.expenses[0], cost: -1 }] }] }, 400);
await expect('Invalid date rejected', 'PUT', 'user-a', { revision: 0, trips: [{ ...trip, startDate: '2026-02-30' }] }, 400);
const multibyteBody=JSON.stringify({padding:'旅'.repeat(1_400_000)});
assert.ok(multibyteBody.length<4_000_000 && new TextEncoder().encode(multibyteBody).byteLength>4_000_000);
await expect('UTF-8 request bytes limited independently of character count', 'PUT', 'user-a', undefined, 413, {raw:multibyteBody});
const largeTrip={...trip,activities:Array.from({length:600},(_,index)=>({...trip.activities[0],id:`large-${index}`,notes:'a'.repeat(3100)}))};
await expect('Aggregate state beyond row-safe storage cap is rejected', 'PUT', 'user-a', {revision:0,trips:[largeTrip]}, 400);

const empty = await expect('New user has empty storage', 'GET', 'user-a', undefined, 200);
assert.deepEqual(empty, { trips: null, revision: 0 });

const created = await expect('Create revision zero', 'PUT', 'user-a', { revision: 0, trips: [trip] }, 200);
assert.equal(created.revision, 1);
const loaded = await expect('Load complete trip round trip', 'GET', 'user-a', undefined, 200);
assert.deepEqual(loaded, { revision: 1, trips: [trip] });

const updatedTrip = { ...trip, title: 'Chuyến đi đã cập nhật', notes: 'Ghi chú tiếng Việt\nDòng thứ hai' };
const updated = await expect('Update advances revision', 'PUT', 'user-a', { revision: 1, trips: [updatedTrip] }, 200);
assert.equal(updated.revision, 2);
await expect('Stale revision conflicts', 'PUT', 'user-a', { revision: 1, trips: [trip] }, 409);
await expect('Duplicate initial create conflicts', 'PUT', 'user-a', { revision: 0, trips: [trip] }, 409);
await expect('Cross-origin mutation rejected', 'PUT', 'user-a', { revision: 2, trips: [] }, 403, { origin: 'https://attacker.invalid' });
assert.deepEqual((await call('GET', 'user-a')).data, { revision: 2, trips: [updatedTrip] });

assert.deepEqual(await expect('Other user cannot read first user', 'GET', 'user-b', undefined, 200), { trips: null, revision: 0 });
const otherTrip = { ...trip, title: 'Chuyến đi của người thứ hai' };
assert.equal((await expect('Other user creates isolated record', 'PUT', 'user-b', { revision: 0, trips: [otherTrip] }, 200)).revision, 1);
assert.deepEqual((await call('GET', 'user-b')).data, { revision: 1, trips: [otherTrip] });
assert.deepEqual((await call('GET', 'user-a')).data, { revision: 2, trips: [updatedTrip] });

const beforeAccountSwitch = databaseOperations;
assert.equal((await expect('Old mounted account cannot read a new authenticated account', 'GET', 'user-b', undefined, 403, {expectedUser:'user-a'})).code,'identity_changed');
assert.equal((await expect('Old mounted account cannot overwrite a new account at its matching revision', 'PUT', 'user-b', {revision:1,trips:[updatedTrip]}, 403, {expectedUser:'user-a'})).code,'identity_changed');
assert.equal(databaseOperations,beforeAccountSwitch,'Changed account must be rejected before either SQL read or write');

const parallel = await Promise.all([
  call('PUT', 'user-a', { revision: 2, trips: [{ ...updatedTrip, title: 'Bản cập nhật A' }] }),
  call('PUT', 'user-a', { revision: 2, trips: [{ ...updatedTrip, title: 'Bản cập nhật B' }] }),
]);
assert.deepEqual(parallel.map(item => item.status).sort(), [200, 409]);
const afterRace = (await call('GET', 'user-a')).data;
assert.equal(afterRace.revision, 3);
assert.ok(['Bản cập nhật A', 'Bản cập nhật B'].includes(afterRace.trips[0].title));
results.push({ name: 'Two same-revision updates: exactly one succeeds', statuses: parallel.map(item => item.status), revision: afterRace.revision });
assert.deepEqual((await call('GET', 'user-b')).data, { revision: 1, trips: [otherTrip] });
const rowCount = sqlite.prepare('select count(*) as count from travel_states').get().count;
assert.equal(rowCount, 2);

console.log(JSON.stringify({ passed: true, assertions: results, isolatedRows: rowCount, adapters: ['Next request headers via AsyncLocalStorage', 'Cloudflare D1 transport via node:sqlite'], realCode: ['API handlers', 'auth helper', 'validation model', 'Drizzle D1 driver', 'SQLite migration and SQL'] }, null, 2));
sqlite.close();
