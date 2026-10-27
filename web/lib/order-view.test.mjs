import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NONE,
  bucketByStatus,
  buildFilterOptions,
  groupOrders,
  matchesFilter,
  orderActivityTime,
  parseAmount,
  sortOrders
} from './order-view.mjs';

const orders = [
  { id: 'a', company: 'PSA', position: 'Lashing Specialist', status: 'closed', salary: 'SGD1800', picName: 'Sunrise', location: 'Singapore', sourceUpdatedAt: '2026-10-19T12:09:00.000Z' },
  { id: 'b', company: 'Benjamin Barker', position: 'Driver', status: 'open', salary: 'RM2,000-RM3,000', picName: 'LCP Lissa', location: 'Seri Kembangan', sourceUpdatedAt: '2026-10-21T09:54:00.000Z' },
  { id: 'c', company: 'psa ', position: 'Crane Operator', status: 'urgent', salary: '面议', picName: '', location: 'Singapore', updatedAt: { seconds: 1793000000 } },
  { id: 'd', company: 'Acme', position: 'Admin', status: 'open', salary: 'RM 2.5k', picName: 'Sunrise', location: '', createdAt: '2026-01-01T00:00:00Z' }
];

const ids = (list) => list.map((o) => o.id);

test('activity time prefers the sheet timestamp', () => {
  assert.equal(orderActivityTime({ sourceUpdatedAt: '2026-10-19T00:00:00Z', updatedAt: { seconds: 1 } }), Date.parse('2026-10-19T00:00:00Z'));
  assert.equal(orderActivityTime({ updatedAt: { seconds: 2 } }), 2000);
  assert.equal(orderActivityTime({}), 0);
});

test('parses salary amounts for ordering', () => {
  assert.equal(parseAmount('RM2,000-RM3,000'), 2000);
  assert.equal(parseAmount('SGD 1.8k'), 1800);
  assert.equal(parseAmount('RM270 - RM450'), 270);
  assert.equal(parseAmount('面议'), null);
  assert.equal(parseAmount(undefined), null);
});

test('sorts by activity, text and amounts with blanks last', () => {
  assert.deepEqual(ids(sortOrders(orders, 'updated', 'desc')), ['c', 'b', 'a', 'd']);
  assert.deepEqual(ids(sortOrders(orders, 'company', 'asc')), ['d', 'b', 'c', 'a']);
  assert.deepEqual(ids(sortOrders(orders, 'salary', 'desc')), ['d', 'b', 'a', 'c']);
  assert.deepEqual(ids(sortOrders(orders, 'salary', 'asc')), ['a', 'b', 'd', 'c']);
  assert.deepEqual(ids(sortOrders(orders, 'pic', 'asc')), ['b', 'a', 'd', 'c']);
  assert.deepEqual(ids(sortOrders(orders, 'status', 'asc')), ['c', 'b', 'd', 'a']);
  assert.deepEqual(ids(orders), ['a', 'b', 'c', 'd'], 'input is not mutated');
});

test('filter options are case-insensitive with blanks last', () => {
  const companies = buildFilterOptions(orders, 'company');
  assert.deepEqual(companies.map((o) => [o.value, o.count]), [['acme', 1], ['benjamin barker', 1], ['psa', 2]]);
  const pics = buildFilterOptions(orders, 'pic');
  assert.deepEqual(pics.map((o) => o.value), ['lcp lissa', 'sunrise', NONE]);
  assert.ok(matchesFilter(orders[2], 'company', 'psa'));
  assert.ok(matchesFilter(orders[2], 'pic', NONE));
  assert.ok(!matchesFilter(orders[0], 'pic', NONE));
  assert.ok(matchesFilter(orders[0], 'pic', ''));
});

test('groups by company with active jobs first and status counts', () => {
  const groups = groupOrders(orders, 'company');
  assert.deepEqual(groups.map((g) => [g.key, ids(g.orders)]), [['psa', ['a', 'c']], ['acme', ['d']], ['benjamin barker', ['b']]]);
  assert.deepEqual(groups[0].statusCounts, { closed: 1, urgent: 1 });
  assert.equal(groups[0].activeCount, 1);
});

test('groups by status in status order and puts blank groups last', () => {
  assert.deepEqual(groupOrders(orders, 'status').map((g) => g.key), ['urgent', 'open', 'closed']);
  assert.deepEqual(groupOrders(orders, 'location').map((g) => g.key), ['singapore', 'seri kembangan', NONE]);
});

test('buckets orders into kanban columns, unknown status as open', () => {
  const buckets = bucketByStatus([...orders, { id: 'e', status: 'archived' }, { id: 'f' }]);
  assert.deepEqual(Object.keys(buckets), ['open', 'urgent', 'paused', 'filled', 'closed']);
  assert.deepEqual(Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, ids(v)])),
    { open: ['b', 'd', 'e', 'f'], urgent: ['c'], paused: [], filled: [], closed: ['a'] });
});
