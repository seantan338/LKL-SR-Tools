// Deterministic Google Sheet -> Job Order mapping (no AI).
// Used when a sheet already has one job order per row with recognizable headers,
// e.g. "Job Order 2026" > Database tab.

const normHeader = (h) => String(h || '')
  .toLowerCase()
  .replace(/\s*\/\s*/g, '/')
  .replace(/\s+/g, ' ')
  .trim();

// Exact (normalized) header matches only, so "Company Background" never lands in `company`.
const FIELD_ALIASES = {
  company: ['company name', 'company', 'client', 'client name', 'employer', '公司', '公司名称', '客户', '企业'],
  status: ['status', 'job status', '状态'],
  position: ['job title', 'position', 'role', 'job position', '职位', '岗位'],
  companyBackground: ['company background', 'industry', '公司背景', '行业'],
  location: ['location', 'work location', '地点', '工作地点'],
  salary: ['salary range', 'salary', '薪资', '薪水'],
  workDays: ['working day', 'working days', 'work days', '工作日'],
  workHours: ['working hours', 'work hours', '工作时间'],
  gender: ['preferred gender', 'gender', '性别'],
  race: ['race', '种族'],
  requirements: ['requirement/skill set', 'requirements', 'requirement', 'skill set', 'skills', '要求'],
  benefits: ['benefit/allowance', 'benefits', 'benefit', 'allowance', '福利'],
  picName: ['person in charge', 'pic', '负责人', '顾问'],
  sourceUpdatedAt: ['time of updated', 'updated at', 'last updated', '更新时间'],
  commission: ['commission range', 'commission', '佣金'],
  headcount: ['headcount', 'hc', 'vacancy', 'vacancies', '人数'],
  country: ['country', '国家'],
};

const EMPTY_VALUES = new Set(['-', '–', '—', 'n/a', 'na', 'nil', 'none', 'null']);

const GENDER_MAP = {
  '不限': 'Open', 'open': 'Open', 'open gender': 'Open', 'any': 'Open',
  '男': 'Male', '女': 'Female',
};

const STATUS_MAP = {
  open: 'open', active: 'open', hiring: 'open',
  urgent: 'urgent',
  closed: 'closed', close: 'closed', cancelled: 'closed', canceled: 'closed',
  filled: 'filled',
  pending: 'paused', 'on hold': 'paused', hold: 'paused', paused: 'paused',
};

export function cleanCell(v) {
  const s = String(v ?? '').trim();
  return EMPTY_VALUES.has(s.toLowerCase()) ? '' : s;
}

export function detectJobOrderColumns(headers) {
  const cols = {};
  (headers || []).forEach((h, i) => {
    const n = normHeader(h);
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (cols[field] === undefined && aliases.includes(n)) {
        cols[field] = i;
        break;
      }
    }
  });
  return cols.company !== undefined && cols.position !== undefined ? cols : null;
}

export function normalizeJobOrderStatus(raw) {
  return STATUS_MAP[cleanCell(raw).toLowerCase()] || 'open';
}

// Accepts "2026-10-21 9:54" or Sheets' US-locale "11/5/2025" (M/D/YYYY). Returns ms, or 0.
export function parseSheetTimestamp(raw) {
  const s = cleanCell(raw);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return Date.UTC(+m[3], +m[1] - 1, +m[2]);
  return 0;
}

const keyPart = (v) => cleanCell(v).toLowerCase().replace(/\s+/g, ' ');

// Same company + position at different outlets are separate orders.
export function jobOrderSheetKey(order) {
  const location = keyPart(order?.location);
  return [keyPart(order?.company), keyPart(order?.position), location === 'tbd' ? '' : location].join('::');
}

export function mapSheetRowsToJobOrders(headers, rows, { rowOffset = 2 } = {}) {
  const cols = detectJobOrderColumns(headers);
  if (!cols) return { orders: [], skipped: [], mergedCount: 0, columns: null };

  const get = (row, field) => (cols[field] === undefined ? '' : cleanCell(row?.[cols[field]]));
  const byKey = new Map();
  const skipped = [];
  let mergedCount = 0;

  (rows || []).forEach((row, i) => {
    const rowNumber = i + rowOffset;
    if (!row || !row.some(c => cleanCell(c))) return;

    const company = get(row, 'company');
    const position = get(row, 'position');
    if (!company || !position) {
      skipped.push({ row: rowNumber, reason: !company ? 'missing_company' : 'missing_position', position, company });
      return;
    }

    const gender = get(row, 'gender');
    const race = get(row, 'race');
    const skills = get(row, 'requirements');
    const background = get(row, 'companyBackground');
    const commission = get(row, 'commission');
    const workDays = get(row, 'workDays');
    const hours = get(row, 'workHours');
    const updatedMs = parseSheetTimestamp(get(row, 'sourceUpdatedAt'));
    const normGender = GENDER_MAP[gender.toLowerCase()] || gender;

    const order = {
      company,
      position,
      status: normalizeJobOrderStatus(get(row, 'status')),
      salary: get(row, 'salary') || 'Negotiable',
      location: get(row, 'location') || get(row, 'country') || 'TBD',
      workHours: [workDays, hours].filter(Boolean).join(' · ') || 'TBD',
      requirements: [
        normGender && `Gender: ${normGender}`,
        race && `Race: ${race}`,
        skills,
      ].filter(Boolean).join('\n') || 'TBD',
      benefits: get(row, 'benefits'),
      notes: [
        background && `Background: ${background}`,
        commission && `Commission: ${commission}`,
      ].filter(Boolean).join(' | '),
      companyBackground: background,
      commission,
      workDays,
      gender: normGender,
      race,
      country: get(row, 'country'),
      picName: get(row, 'picName'),
      sourceUpdatedAt: updatedMs ? new Date(updatedMs).toISOString() : '',
      sourceRow: rowNumber,
      importSource: 'google_sheet',
    };
    const headcount = parseInt(get(row, 'headcount'), 10);
    if (headcount > 0) order.headcount = headcount;
    order.sheetKey = jobOrderSheetKey(order);

    // Re-posted rows: keep the most recently updated one (ties keep the earlier row; the sheet is newest-first).
    const prev = byKey.get(order.sheetKey);
    if (prev) {
      mergedCount++;
      if (updatedMs > parseSheetTimestamp(prev.sourceUpdatedAt)) byKey.set(order.sheetKey, order);
    } else {
      byKey.set(order.sheetKey, order);
    }
  });

  return { orders: [...byKey.values()], skipped, mergedCount, columns: cols };
}

export function findExistingJobOrder(existingList, order) {
  const key = order?.sheetKey || jobOrderSheetKey(order);
  return (existingList || []).find(o => o.sheetKey === key || jobOrderSheetKey(o) === key) || null;
}
