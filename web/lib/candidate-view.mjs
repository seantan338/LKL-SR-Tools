/**
 * Pure helpers behind the Candidates page views: sorting, grouping and filter options.
 * No React / Firebase imports so it runs under `node --test`.
 */

export const NONE = '__none__';

// Stage rank follows the 7-stage recruitment pipeline, with rejected at the bottom
export const STAGE_RANK = {
  screening: 0,
  phone: 1,
  interview: 2,
  offer: 3,
  pre_onboarding: 4,
  onboarding: 5,
  post_onboarding: 6,
  rejected: 99
};

export const STAGE_ORDER = [
  'screening',
  'phone',
  'interview',
  'offer',
  'pre_onboarding',
  'onboarding',
  'post_onboarding',
  'rejected'
];

const INVALID_COMPANY = new Set(['未指定企业', '未定企业']);
const INVALID_POSITION = new Set(['未指定岗位', '待定职位', '待定']);

const clean = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
const keyOf = (value) => clean(value).toLowerCase();

export function cleanCompany(c) {
  const val = clean(c?.company);
  return val && !INVALID_COMPANY.has(val) ? val : '';
}

export function cleanPosition(c) {
  const val = clean(c?.position);
  return val && !INVALID_POSITION.has(val) ? val : '';
}

export function effectiveStageKey(c) {
  if (c?.status === 'rejected') return 'rejected';
  const st = clean(c?.stage);
  return st && st in STAGE_RANK ? st : 'screening';
}

const FIELD_LABEL = {
  company: (c) => cleanCompany(c),
  pic: (c) => clean(c?.picName),
  location: (c) => clean(c?.location),
  stage: (c) => effectiveStageKey(c)
};

function toMs(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  if (typeof value._seconds === 'number') return value._seconds * 1000;
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return isNaN(ms) ? 0 : ms;
  }
  return 0;
}

export function candidateActivityTime(c) {
  return toMs(c?.updatedAt) || toMs(c?.createdAt);
}

const SORT_VALUE = {
  updatedAt: (c) => candidateActivityTime(c) || null,
  name: (c) => keyOf(c?.name) || null,
  company: (c) => keyOf(cleanCompany(c)) || null,
  position: (c) => keyOf(cleanPosition(c)) || null,
  stage: (c) => STAGE_RANK[effectiveStageKey(c)] ?? 50,
  pic: (c) => keyOf(c?.picName) || null,
  remarks: (c) => keyOf(c?.remarks || c?.rawStatus || (typeof c?.notes === 'string' ? c.notes : '')) || null
};

export const CANDIDATE_SORT_KEYS = Object.keys(SORT_VALUE);

export function defaultCandidateSortDir(key) {
  return key === 'updatedAt' ? 'desc' : 'asc';
}

/**
 * Returns a new sorted array. Blank values always sink to the bottom whatever the direction;
 * ties fall back to most recently updated first.
 */
export function sortCandidates(candidates, key = 'updatedAt', dir = 'desc') {
  const getValue = SORT_VALUE[key] || SORT_VALUE.updatedAt;
  const sign = dir === 'asc' ? 1 : -1;
  return candidates
    .map((candidate, index) => ({
      candidate,
      index,
      value: getValue(candidate),
      time: candidateActivityTime(candidate)
    }))
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
    .map((entry) => entry.candidate);
}

function filterValue(candidate, field) {
  if (field === 'stage') return effectiveStageKey(candidate);
  const label = FIELD_LABEL[field]?.(candidate) || '';
  return label ? label.toLowerCase() : NONE;
}

export function matchesCandidateFilter(candidate, field, value) {
  if (!value || value === 'all') return true;
  return filterValue(candidate, field) === value;
}

/** Distinct values of a field with counts, A–Z, blank last: [{ value, label, count }] */
export function buildCandidateFilterOptions(candidates, field) {
  const options = new Map();
  for (const c of candidates) {
    const value = filterValue(c, field);
    const label = FIELD_LABEL[field]?.(c) || '';
    const option = options.get(value) || { value, label, count: 0 };
    option.count += 1;
    options.set(value, option);
  }
  return [...options.values()].sort((a, b) =>
    (a.value === NONE) - (b.value === NONE) || a.label.localeCompare(b.label)
  );
}

export const CANDIDATE_GROUP_FIELDS = ['company', 'stage', 'pic', 'location'];

/**
 * Groups candidates (keeping their current sort order inside each group):
 * [{ key, label, candidates, stageCounts, activeCount }]
 */
export function groupCandidates(candidates, field = 'company') {
  const validField = CANDIDATE_GROUP_FIELDS.includes(field) ? field : 'company';
  const groups = new Map();
  for (const c of candidates) {
    const key = filterValue(c, validField);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label: FIELD_LABEL[validField](c),
        candidates: [],
        stageCounts: {},
        activeCount: 0
      };
      groups.set(key, group);
    }
    const st = effectiveStageKey(c);
    group.candidates.push(c);
    group.stageCounts[st] = (group.stageCounts[st] || 0) + 1;
    if (st !== 'rejected') group.activeCount += 1;
  }
  const list = [...groups.values()];
  if (validField === 'stage') {
    return list.sort((a, b) => (STAGE_RANK[a.key] ?? 50) - (STAGE_RANK[b.key] ?? 50));
  }
  return list.sort((a, b) =>
    (a.key === NONE) - (b.key === NONE) ||
    b.activeCount - a.activeCount ||
    b.candidates.length - a.candidates.length ||
    a.label.localeCompare(b.label)
  );
}
