/**
 * Pure helpers behind the Orders page views: sorting, grouping and filter options.
 * No React / Firebase imports so it runs under `node --test`.
 */

export const NONE = '__none__';

// Urgent first, closed last
const STATUS_RANK = { urgent: 0, open: 1, paused: 2, filled: 3, closed: 4 };
const ACTIVE_STATUSES = ['open', 'urgent'];

const clean = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
const keyOf = (value) => clean(value).toLowerCase();

const FIELD_LABEL = {
  company: (o) => clean(o.company),
  location: (o) => clean(o.location),
  pic: (o) => clean(o.picName),
  status: (o) => o.status || 'open'
};

function toMs(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return isNaN(ms) ? 0 : ms;
  }
  return 0;
}

/**
 * When the job order last changed. Sheet imports rewrite updatedAt for every row,
 * so the sheet's own "Time of Updated" (sourceUpdatedAt) wins when present.
 */
export function orderActivityTime(order) {
  return toMs(order?.sourceUpdatedAt) || toMs(order?.updatedAt) || toMs(order?.createdAt);
}

/**
 * First number in a salary / commission text, for ordering only (currencies are not converted).
 * "RM2,000-RM3,000" -> 2000, "SGD 1.8k" -> 1800, "面议" -> null
 */
export function parseAmount(text) {
  const match = String(text ?? '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*(k\b)?/i);
  if (!match) return null;
  return parseFloat(match[1]) * (match[2] ? 1000 : 1);
}

const SORT_VALUE = {
  updated: (o) => orderActivityTime(o) || null,
  company: (o) => keyOf(o.company) || null,
  position: (o) => keyOf(o.position) || null,
  location: (o) => keyOf(o.location) || null,
  pic: (o) => keyOf(o.picName) || null,
  salary: (o) => parseAmount(o.salary),
  commission: (o) => parseAmount(o.commission),
  status: (o) => STATUS_RANK[o.status] ?? STATUS_RANK.open
};

export const SORT_KEYS = Object.keys(SORT_VALUE);

export function defaultSortDir(key) {
  return ['updated', 'salary', 'commission'].includes(key) ? 'desc' : 'asc';
}

/**
 * Returns a new sorted array. Blank values always sink to the bottom whatever the direction;
 * ties fall back to most recently updated first.
 */
export function sortOrders(orders, key = 'updated', dir = 'desc') {
  const getValue = SORT_VALUE[key] || SORT_VALUE.updated;
  const sign = dir === 'asc' ? 1 : -1;
  return orders
    .map((order, index) => ({ order, index, value: getValue(order), time: orderActivityTime(order) }))
    .sort((a, b) => {
      const aBlank = a.value == null;
      const bBlank = b.value == null;
      if (aBlank || bBlank) {
        if (aBlank !== bBlank) return aBlank ? 1 : -1;
      } else {
        const cmp = typeof a.value === 'string' ? a.value.localeCompare(b.value) : a.value - b.value;
        if (cmp) return cmp * sign;
      }
      return (b.time - a.time) || (a.index - b.index);
    })
    .map((entry) => entry.order);
}

/** Filter value of an order for a field: the normalized label, or NONE when blank. */
function filterValue(order, field) {
  const label = FIELD_LABEL[field](order);
  return label ? label.toLowerCase() : NONE;
}

export function matchesFilter(order, field, value) {
  return !value || filterValue(order, field) === value;
}

/** Distinct values of a field with counts, A–Z, blank last: [{ value, label, count }] */
export function buildFilterOptions(orders, field) {
  const options = new Map();
  for (const order of orders) {
    const value = filterValue(order, field);
    const option = options.get(value) || { value, label: FIELD_LABEL[field](order), count: 0 };
    option.count += 1;
    options.set(value, option);
  }
  return [...options.values()].sort((a, b) =>
    (a.value === NONE) - (b.value === NONE) || a.label.localeCompare(b.label)
  );
}

export const GROUP_FIELDS = ['company', 'pic', 'status', 'location'];

/**
 * Groups orders (keeping their current order inside each group):
 * [{ key, label, orders, statusCounts, activeCount }]
 * Status groups follow the status order; other groups put the most open/urgent jobs first, blank last.
 */
export function groupOrders(orders, field) {
  const groups = new Map();
  for (const order of orders) {
    const key = filterValue(order, field);
    let group = groups.get(key);
    if (!group) {
      group = { key, label: FIELD_LABEL[field](order), orders: [], statusCounts: {}, activeCount: 0 };
      groups.set(key, group);
    }
    const status = order.status || 'open';
    group.orders.push(order);
    group.statusCounts[status] = (group.statusCounts[status] || 0) + 1;
    if (ACTIVE_STATUSES.includes(status)) group.activeCount += 1;
  }
  const list = [...groups.values()];
  if (field === 'status') {
    return list.sort((a, b) => (STATUS_RANK[a.key] ?? 9) - (STATUS_RANK[b.key] ?? 9));
  }
  return list.sort((a, b) =>
    (a.key === NONE) - (b.key === NONE) ||
    b.activeCount - a.activeCount ||
    b.orders.length - a.orders.length ||
    a.label.localeCompare(b.label)
  );
}
