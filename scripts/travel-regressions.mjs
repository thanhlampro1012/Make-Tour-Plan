// Run with: node --experimental-strip-types scripts/travel-regressions.mjs
import assert from 'node:assert/strict';
import {
  MAX_BACKUP_BYTES, MAX_MAP_URL_LENGTH, MAX_STATE_BYTES,
  actualAmount, addDays, backupSchema, bookingBudget, bookingSchema, copyDay,
  createTrip, dayList, duration, exportICS, getTravelers, mapsUrl, normalizeSearch,
  plannedAmount, routeSegments, routeStops, sampleTrip, settleExpenses,
  shiftTripDates, summarize, toggleActivityDone, tripSchema, warnings,
} from '../lib/travel.ts';

const results = [];
function test(name, run) { run(); results.push(name); }
const sample = sampleTrip();
const base = createTrip({ id: 'regression-trip', startDate: '2026-12-31', endDate: '2027-01-02', people: 3, travelers: ['Lâm', 'Minh', 'An'], activities: [], bookings: [], expenses: [], checklist: [], dayNotes: {} });
const activity = (overrides = {}) => ({ ...sample.activities[0], id: 'activity-test', date: base.startDate, title: 'Điểm hẹn', startTime: '09:00', endTime: '10:00', endNextDay: false, cost: 100, actualCost: null, bookingId: '', perPerson: false, travelMinutes: 0, status: 'planned', ...overrides });
const expense = (overrides = {}) => ({ id: 'expense-test', title: 'Khoản chi', category: 'other', cost: 0, actualCost: null, perPerson: false, paidBy: '', notes: '', ...overrides });
const booking = (overrides = {}) => ({ ...sample.bookings[0], id: 'booking-test', date: base.startDate, total: 1000, paid: 300, refunded: 100, paidBy: 'Lâm', status: 'confirmed', ...overrides });
const unfold = (text) => text.replace(/\r\n[ \t]/g, '');

test('Legacy backups and deterministic sample stay valid', () => {
  assert.deepEqual(sample, sampleTrip());
  assert.equal(backupSchema.safeParse({ version: 1, trips: [sample] }).success, true);
  assert.equal(summarize(sample).planned, 5_690_000);
  assert.equal(summarize(sample).spent, 860_000);
  assert.equal(sample.activities.length, 21);
});

test('Search folds uppercase Đ, accents, and repeated whitespace', () => {
  assert.equal(normalizeSearch('  ĐÀ   LẠT  '), 'da lat');
  assert.equal(normalizeSearch('Quán Cà Phê').includes(normalizeSearch('ca phe')), true);
});

test('Refunds preserve unrefunded cash and reject impossible refunds', () => {
  assert.deepEqual(bookingBudget(booking()), { planned: 1000, spent: 200, remaining: 800 });
  assert.deepEqual(bookingBudget(booking({ status: 'cancelled' })), { planned: 200, spent: 200, remaining: 0 });
  assert.deepEqual(bookingBudget(booking({ status: 'cancelled', refunded: 300 })), { planned: 0, spent: 0, remaining: 0 });
  assert.equal(bookingSchema.safeParse(booking({ refunded: 301 })).success, false);
  assert.equal(bookingSchema.safeParse(booking({ refunded: -1 })).success, false);
  const trip = { ...base, bookings: [booking({ status: 'cancelled' })], activities: [activity({ bookingId: 'booking-test', cost: 999, actualCost: 999 })] };
  assert.equal(summarize(trip).planned, 200);
  assert.equal(summarize(trip).spent, 200);
  assert.equal(summarize({ ...trip, activities: [activity({ cost: 999, actualCost: 999 })] }).spent, 1199);
});

test('Actual per-person history keeps its recorded party size', () => {
  const item = expense({ cost: 50, actualCost: 50, perPerson: true, actualPeople: 2 });
  assert.equal(plannedAmount(item, 4), 200);
  assert.equal(actualAmount(item, 4), 100);
  assert.equal(actualAmount({ ...item, actualCost: 0 }, 4), 0);
  assert.equal(actualAmount({ ...item, actualCost: null }, 4), 0);
  assert.equal(actualAmount({ ...item, perPerson: false }, 4), 50);
  const { actualPeople: _, ...legacy } = item;
  assert.equal(actualAmount(legacy, 4), 200);
  assert.equal(summarize({ ...base, people: 4, expenses: [item] }).spent, 100);
});

test('Traveler validation and generated names avoid ambiguity', () => {
  const names = getTravelers({ people: 4, travelers: ['Người 2', 'Lâm'] });
  assert.equal(names.length, 4);
  assert.equal(new Set(names.map(normalizeSearch)).size, 4);
  assert.deepEqual(getTravelers({ people: 2 }), ['Người 1', 'Người 2']);
  assert.equal(tripSchema.safeParse({ ...base, travelers: ['Đỗ', 'do'] }).success, false);
  assert.equal(tripSchema.safeParse({ ...base, people: 1, travelers: ['Lâm', 'Minh'] }).success, false);
  assert.equal(tripSchema.safeParse({ ...base, travelers: [''] }).success, false);
});

test('Settlement conserves money, excludes linked activity costs, and exposes unassigned payers', () => {
  const trip = {
    ...base,
    activities: [activity({ id: 'paid-activity', actualCost: 1000, paidBy: 'lam' }), activity({ id: 'linked-activity', bookingId: 'booking-test', actualCost: 999, paidBy: 'An' })],
    bookings: [booking({ status: 'cancelled' })],
    expenses: [expense({ id: 'minh-paid', actualCost: 500, paidBy: 'MINH' }), expense({ id: 'unknown-paid', actualCost: 200, paidBy: 'Tên chưa có' }), expense({ id: 'blank-paid', actualCost: 300 })],
  };
  const result = settleExpenses(trip);
  assert.equal(result.totalAssigned, 1700);
  assert.equal(result.unassigned, 500);
  assert.equal(result.totalAssigned + result.unassigned, summarize(trip).spent);
  assert.deepEqual(result.balances, [
    { name: 'Lâm', paid: 1200, share: 567, balance: 633 },
    { name: 'Minh', paid: 500, share: 567, balance: -67 },
    { name: 'An', paid: 0, share: 566, balance: -566 },
  ]);
  assert.deepEqual(result.transfers, [{ from: 'Minh', to: 'Lâm', amount: 67 }, { from: 'An', to: 'Lâm', amount: 566 }]);
  const reconciled = new Map(result.balances.map(item => [item.name, item.balance]));
  for (const transfer of result.transfers) {
    assert.equal(Number.isInteger(transfer.amount), true);
    assert.ok(transfer.amount > 0);
    reconciled.set(transfer.from, reconciled.get(transfer.from) + transfer.amount);
    reconciled.set(transfer.to, reconciled.get(transfer.to) - transfer.amount);
  }
  assert.ok([...reconciled.values()].every(value => value === 0));
  const unassigned = settleExpenses({ ...base, expenses: [expense({ actualCost: 700 })] });
  assert.equal(unassigned.unassigned, 700);
  assert.equal(unassigned.totalAssigned, 0);
  assert.deepEqual(unassigned.transfers, []);
});

test('Fractional imported money rounds deterministically without creating cash', () => {
  const trip = { ...base, expenses: [expense({ id: 'frac-a', actualCost: 0.6, paidBy: 'Lâm' }), expense({ id: 'frac-b', actualCost: 0.6, paidBy: 'Minh' }), expense({ id: 'frac-c', actualCost: 0.6 })] };
  const result = settleExpenses(trip);
  assert.equal(result.totalAssigned + result.unassigned, Math.round(summarize(trip).spent));
  assert.equal(result.balances.reduce((sum, item) => sum + item.balance, 0), 0);
  assert.ok(result.balances.every(item => Number.isInteger(item.paid) && Number.isInteger(item.share)));
  assert.deepEqual(result, settleExpenses(trip));
});

test('Completion toggles restore booked and planned statuses', () => {
  for (const status of ['planned', 'booked']) {
    const original = activity({ status });
    const done = toggleActivityDone(original);
    assert.equal(done.status, 'done');
    assert.equal(done.previousStatus, status);
    assert.deepEqual(toggleActivityDone(done), original);
  }
  assert.equal(toggleActivityDone(activity({ status: 'done' })).status, 'planned');
});

test('Shifting a trip preserves overnight timing, bookings, notes, and history across a year boundary', () => {
  const trip = { ...base, activities: [activity({ startTime: '23:30', endTime: '00:30', endNextDay: true, actualCost: 100, actualPeople: 2, paidBy: 'Lâm' })], bookings: [booking({ date: '2027-01-01' })], dayNotes: { '2026-12-31': 'Đêm đầu', '2027-01-02': 'Ngày về' } };
  const before = JSON.stringify(trip);
  const shifted = shiftTripDates(trip, '2027-01-03', '2027-01-05');
  assert.equal(shifted.activities[0].date, '2027-01-03');
  assert.equal(shifted.activities[0].endNextDay, true);
  assert.equal(duration(shifted.activities[0]), 60);
  assert.equal(shifted.activities[0].actualCost, 100);
  assert.equal(shifted.activities[0].actualPeople, 2);
  assert.equal(shifted.bookings[0].date, '2027-01-04');
  assert.deepEqual(shifted.dayNotes, { '2027-01-03': 'Đêm đầu', '2027-01-05': 'Ngày về' });
  assert.equal(JSON.stringify(trip), before);
  assert.throws(() => shiftTripDates(trip, '2027-02-30', '2027-03-01'));
  assert.throws(() => shiftTripDates(trip, '2027-01-03', '2027-01-02'));
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
});

test('Copying a day resets financial and completion history without overwriting target notes', () => {
  const source = activity({ startTime: '23:30', endTime: '00:30', endNextDay: true, status: 'done', previousStatus: 'booked', perPerson: true, actualCost: 150, actualPeople: 2, paidBy: 'Lâm', bookingId: 'booking-test' });
  const trip = { ...base, activities: [source], bookings: [booking()], dayNotes: { '2026-12-31': 'Mang áo khoác', '2027-01-01': 'Ghi chú đang có' } };
  const before = JSON.stringify(trip);
  const copied = copyDay(trip, '2026-12-31', '2027-01-01');
  const next = copied.activities.find(item => item.id !== source.id);
  assert.ok(next);
  assert.equal(next.date, '2027-01-01');
  assert.equal(next.cost, source.cost);
  assert.equal(next.actualCost, null);
  assert.equal(next.actualPeople, undefined);
  assert.equal(next.paidBy, '');
  assert.equal(next.bookingId, '');
  assert.equal(next.status, 'planned');
  assert.equal(next.previousStatus, undefined);
  assert.equal(next.endNextDay, true);
  assert.equal(summarize(copied).spent, summarize(trip).spent);
  assert.equal(summarize(copied).planned, summarize(trip).planned + plannedAmount(next, trip.people));
  assert.equal(copied.bookings.length, 1);
  assert.equal(copied.dayNotes['2027-01-01'], 'Ghi chú đang có\n\nMang áo khoác');
  assert.equal(JSON.stringify(trip), before);
  assert.throws(() => copyDay(trip, '2026-12-31', '2026-12-31'));
  assert.throws(() => copyDay(trip, '2027-01-02', '2027-01-01'));
});

test('Calendar IDs are stable per trip and unique across trips; UTF-8 and time conversion stay valid', () => {
  const trip = { ...base, activities: [activity({ title: 'Đà Lạt, hẹn hò; một ngày đẹp', notes: 'Tiếng Việt có dấu. '.repeat(40) })] };
  const ics = exportICS(trip);
  const uid = unfold(ics).match(/^UID:(.+)$/m)[1].trim();
  assert.equal(uid, `${trip.id}.${trip.activities[0].id}@len-duong.app`);
  assert.equal(unfold(exportICS(trip)).match(/^UID:(.+)$/m)[1].trim(), uid);
  assert.notEqual(unfold(exportICS({ ...trip, id: 'other-trip' })).match(/^UID:(.+)$/m)[1].trim(), uid);
  assert.ok(ics.split('\r\n').every(line => Buffer.byteLength(line, 'utf8') <= 75));
  assert.match(ics, /DTSTART:20261231T020000Z/);
  assert.match(unfold(ics), /SUMMARY:Đà Lạt\\, hẹn hò\\; một ngày đẹp/);
});

test('Route segments cover every stop and overlap at endpoints', () => {
  const activities = Array.from({ length: 12 }, (_, index) => activity({ id: `route-${index}`, startTime: `${String(index + 8).padStart(2, '0')}:00`, endTime: `${String(index + 8).padStart(2, '0')}:30`, place: `Điểm ${index + 1}`, address: 'Đà Lạt' }));
  const segments = routeSegments([...activities].reverse());
  assert.deepEqual(segments.map(item => item.stops.length), [5, 5, 4]);
  for (let index = 1; index < segments.length; index++) assert.equal(segments[index - 1].stops.at(-1), segments[index].stops[0]);
  const reconstructed = segments.flatMap((segment, index) => index ? segment.stops.slice(1) : segment.stops);
  assert.deepEqual(reconstructed, routeStops(activities));
  assert.ok(segments.every(segment => segment.url.length <= MAX_MAP_URL_LENGTH && segment.stops.length <= 5));
  assert.deepEqual(routeSegments([]), []);
});

test('Long routes and addresses fall back explicitly without dropping stops or invalid URLs', () => {
  const activities = [activity({ id: 'route-a', place: 'Quán A', address: '界'.repeat(600) }), activity({ id: 'route-b', place: 'Quán B', address: '界'.repeat(600), startTime: '11:00', endTime: '12:00' }), activity({ id: 'route-c', place: '界'.repeat(240), address: '界'.repeat(600), startTime: '13:00', endTime: '14:00' })];
  for (const mode of [undefined,'driving','walking','transit','bicycling','two-wheeler']) {
    const segments = routeSegments(activities,mode);
    assert.deepEqual(segments.flatMap(segment => segment.stops), routeStops(activities));
    assert.ok(segments.every(segment => Boolean(segment.note) && segment.url.length <= MAX_MAP_URL_LENGTH));
    assert.equal(new URL(segments[0].url).searchParams.get('query'), 'Quán A');
    if(mode) assert.ok(segments.every(segment => segment.note.includes('phương tiện')));
  }
  assert.doesNotThrow(() => mapsUrl('Quán A', '\ud800'));
  assert.equal(new URL(mapsUrl('Quán A & B', 'Số 1/2')).searchParams.get('query'), 'Quán A & B, Số 1/2');
});

test('Explicit Maps modes retain fixed origins and every stop; transit has adjacent pairs only', () => {
  const activities=Array.from({length:12},(_,i)=>activity({id:`mode-${i}`,place:`Điểm ${i} & bạn`,address:`Số ${i}, Đà Lạt`,startTime:`${String(i).padStart(2,'0')}:00`,endTime:`${String(i+1).padStart(2,'0')}:00`}));
  const before=JSON.stringify(activities), stops=routeStops(activities);
  for(const mode of ['driving','walking','transit','bicycling','two-wheeler']) {
    const segments=routeSegments(activities,mode);
    assert.deepEqual(segments.flatMap((segment,index)=>index?segment.stops.slice(1):segment.stops),stops);
    assert.deepEqual(segments.map(segment=>segment.stops.length),mode==='transit'?Array(11).fill(2):[5,5,4]);
    for(const [index,segment] of segments.entries()) {
      const url=new URL(segment.url);
      assert.ok(segment.url.length<=MAX_MAP_URL_LENGTH);
      assert.equal(url.searchParams.get('api'),'1');assert.equal(url.searchParams.get('travelmode'),mode);
      assert.equal(url.searchParams.get('origin'),segment.stops[0]);assert.equal(url.searchParams.get('destination'),segment.stops.at(-1));
      assert.equal(url.searchParams.get('waypoints'),segment.stops.length>2?segment.stops.slice(1,-1).join('|'):null);
      if(index)assert.equal(segments[index-1].stops.at(-1),segment.stops[0]);
    }
  }
  assert.equal(JSON.stringify(activities),before);
  assert.ok(routeSegments(activities).every(segment=>!new URL(segment.url).searchParams.has('travelmode')),'omitted mode stays backward-compatible');
  assert.throws(()=>routeSegments(activities,'flying'),/Phương tiện/);
  assert.throws(()=>routeSegments(activities,'walking&destination=elsewhere'),/Phương tiện/);
});

test('Mode is included before the 2048-character budget and never silently discarded', () => {
  const activities=Array.from({length:5},(_,i)=>activity({id:`boundary-${i}`,place:`P${i}`,address:'a'.repeat(388),startTime:`0${i}:00`,endTime:`0${i+1}:00`}));
  const basic=routeSegments(activities);
  assert.equal(basic.length,1);assert.equal(basic[0].url.length,2046);
  for(const mode of ['driving','walking','transit','bicycling','two-wheeler']) {
    const segments=routeSegments(activities,mode);
    assert.ok(segments.length>1);
    assert.deepEqual(segments.flatMap((segment,index)=>index?segment.stops.slice(1):segment.stops),routeStops(activities));
    assert.ok(segments.every(segment=>segment.url.length<=MAX_MAP_URL_LENGTH&&new URL(segment.url).searchParams.get('travelmode')===mode));
  }
  const [single]=routeSegments([activities[0]],'walking');
  assert.equal(single.stops.length,1);assert.equal(new URL(single.url).pathname,'/maps/search/');assert.match(single.note,/phương tiện/);
  assert.deepEqual(routeSegments([],'transit'),[]);
});

test('Midnight travel warnings and retained dates remain intact', () => {
  const trip = { ...base, activities: [activity({ id: 'night', startTime: '23:00', endTime: '00:00', endNextDay: true }), activity({ id: 'next', date: '2027-01-01', startTime: '00:05', endTime: '00:30', travelMinutes: 15 })] };
  assert.equal(warnings(trip, '2027-01-01')[0].id, 'travel-night-next');
  assert.ok(dayList({ ...trip, startDate: '2027-01-01' }).includes('2026-12-31'));
});

test('Compact UTF-8 backup guard is atomic at the byte limit, including Unicode', () => {
  const heavyTrip = { ...base, activities: Array.from({ length: 600 }, (_, index) => activity({ id: `size-activity-${index}`, notes: '' })), expenses: Array.from({ length: 400 }, (_, index) => expense({ id: `size-expense-${index}`, notes: '' })) };
  const backup = { version: 1, trips: [heavyTrip] };
  let left = MAX_STATE_BYTES - Buffer.byteLength(JSON.stringify(backup));
  for (const item of [...heavyTrip.activities, ...heavyTrip.expenses]) {
    const count = Math.min(5000, left);
    item.notes = 'x'.repeat(count);
    left -= count;
    if (!left) break;
  }
  assert.equal(left, 0);
  assert.equal(Buffer.byteLength(JSON.stringify(backup)), MAX_STATE_BYTES);
  assert.equal(backupSchema.safeParse(backup).success, true);
  const spare = [...heavyTrip.activities, ...heavyTrip.expenses].find(item => item.notes.length < 5000);
  spare.notes += 'x';
  const original = JSON.stringify(backup);
  assert.equal(backupSchema.safeParse(backup).success, false);
  assert.equal(JSON.stringify(backup), original, 'Validation must not mutate the backup');
  assert.ok(MAX_STATE_BYTES < MAX_BACKUP_BYTES);
  const unicode = { version: 1, trips: [{ ...base, activities: Array.from({ length: 600 }, (_, index) => activity({ id: `unicode-${index}`, notes: 'Đ'.repeat(Math.ceil(MAX_STATE_BYTES / 1200)) })) }] };
  assert.ok(JSON.stringify(unicode).length < MAX_STATE_BYTES);
  assert.ok(Buffer.byteLength(JSON.stringify(unicode)) > MAX_STATE_BYTES);
  assert.equal(backupSchema.safeParse(unicode).success, false);
});

test('Unsafe aggregate money is rejected before integer settlement can overflow', () => {
  const trip = { ...base, people: 100, travelers: [], expenses: Array.from({ length: 100 }, (_, index) => expense({ id: `overflow-${index}`, cost: 1e12, actualCost: 1e12, perPerson: true, actualPeople: 100 })) };
  assert.equal(tripSchema.safeParse(trip).success, false);
});

console.log(JSON.stringify({ passed: true, count: results.length, tests: results }, null, 2));
