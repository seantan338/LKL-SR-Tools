import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectJobOrderColumns,
  findExistingJobOrder,
  jobOrderSheetKey,
  mapSheetRowsToJobOrders,
  normalizeJobOrderStatus,
  parseSheetTimestamp,
} from './job-order-sheet.mjs';

// Header row of "Job Order 2026" > Database
const HEADERS = ['Company Name', 'Status', 'Job Title', 'Company Background', 'Location', 'Salary Range', 'Working Day', 'Working Hours', 'Preferred Gender', 'Race', 'Requirement/Skill Set', 'Benefit / Allowance', 'Person In Charge', 'Time of Updated', 'Commission Range', 'content', 'finishReason', 'index', 'companyId', 'Country'];

test('detects Database tab columns without confusing Company Background', () => {
  const cols = detectJobOrderColumns(HEADERS);
  assert.equal(cols.company, 0);
  assert.equal(cols.companyBackground, 3);
  assert.equal(cols.position, 2);
  assert.equal(cols.benefits, 11);
  assert.equal(cols.commission, 14);
  assert.equal(cols.country, 19);
});

test('returns null when company or position column is missing', () => {
  assert.equal(detectJobOrderColumns(['Name', 'Phone', 'Position']), null);
});

test('maps a full row into a job order', () => {
  const row = ['Benjamin Barker', 'Open', 'Warehouse & Logistic Driver', '-', 'Seri Kembangan', 'RM2,000-RM3,000', 'Mon - Fri', '9am to 6pm', 'Male', 'Chinese', 'GDL Class D licence', 'Attendance incentive, OT payable', 'LCP Lissa', '2026-10-21 9:54', '-'];
  const { orders } = mapSheetRowsToJobOrders(HEADERS, [row]);
  assert.equal(orders.length, 1);
  const o = orders[0];
  assert.equal(o.company, 'Benjamin Barker');
  assert.equal(o.status, 'open');
  assert.equal(o.workHours, 'Mon - Fri · 9am to 6pm');
  assert.equal(o.requirements, 'Gender: Male\nRace: Chinese\nGDL Class D licence');
  assert.equal(o.benefits, 'Attendance incentive, OT payable');
  assert.equal(o.picName, 'LCP Lissa');
  assert.equal(o.notes, '');
  assert.equal(o.sourceUpdatedAt, '2026-10-21T09:54:00.000Z');
  assert.equal(o.sourceRow, 2);
  assert.equal(o.headcount, undefined);
});

test('fills app defaults for "-" cells and keeps commission in notes', () => {
  const row = ['PSA', 'Open', 'Lashing Specialist', '-', '-', 'SGD1800', '-', '-', '不限', '-', '-', '-', 'Sunrise', '2026-10-19 12:09', 'RM270 - RM450'];
  const [o] = mapSheetRowsToJobOrders(HEADERS, [row]).orders;
  assert.equal(o.location, 'TBD');
  assert.equal(o.workHours, 'TBD');
  assert.equal(o.requirements, 'Gender: Open');
  assert.equal(o.notes, 'Commission: RM270 - RM450');
});

test('skips rows without company or position and ignores blank rows', () => {
  const rows = [
    ['-', 'Open', 'Technician'],
    ['GSP', 'Open', '-'],
    ['-', '-', '-'],
    [],
  ];
  const { orders, skipped } = mapSheetRowsToJobOrders(HEADERS, rows);
  assert.equal(orders.length, 0);
  assert.deepEqual(skipped.map(s => [s.row, s.reason]), [[2, 'missing_company'], [3, 'missing_position']]);
});

test('merges re-posted rows, keeping the latest update', () => {
  const rows = [
    ['PSA', 'Open', 'Lashing Specialist', '-', '-', 'SGD1800', '', '', '', '', '', '', 'Sunrise', '2026-10-19 12:09'],
    ['PSA', 'Closed', 'Lashing Specialist', '-', '-', 'SGD1700', '', '', '', '', '', '', 'Sunrise', '11/5/2025'],
    ['psa ', 'Open', 'Lashing  Specialist', '-', '-', 'SGD1900', '', '', '', '', '', '', 'Sunrise', '2026-10-25 08:00'],
  ];
  const { orders, mergedCount } = mapSheetRowsToJobOrders(HEADERS, rows);
  assert.equal(orders.length, 1);
  assert.equal(mergedCount, 2);
  assert.equal(orders[0].salary, 'SGD1900');
});

test('same position at different outlets stays separate', () => {
  const rows = [
    ['Sunrise', 'Open', 'Foodserver', '-', 'MID VALLEY'],
    ['Sunrise', 'Open', 'Foodserver', '-', 'SUBANG'],
  ];
  assert.equal(mapSheetRowsToJobOrders(HEADERS, rows).orders.length, 2);
});

test('status normalization', () => {
  assert.equal(normalizeJobOrderStatus('Open'), 'open');
  assert.equal(normalizeJobOrderStatus('Active'), 'open');
  assert.equal(normalizeJobOrderStatus('on hold'), 'paused');
  assert.equal(normalizeJobOrderStatus('Pending'), 'paused');
  assert.equal(normalizeJobOrderStatus('Filled'), 'filled');
  assert.equal(normalizeJobOrderStatus('Closed'), 'closed');
  assert.equal(normalizeJobOrderStatus('-'), 'open');
});

test('parses both timestamp formats (US-locale M/D/YYYY)', () => {
  assert.equal(new Date(parseSheetTimestamp('2026-10-20 1:58')).toISOString(), '2026-10-20T01:58:00.000Z');
  assert.equal(new Date(parseSheetTimestamp('1/29/2026')).toISOString(), '2026-01-29T00:00:00.000Z');
  assert.equal(parseSheetTimestamp('-'), 0);
});

test('finds existing orders by sheetKey or company+position+location', () => {
  const existing = [
    { id: 'a', company: 'PSA', position: 'Lashing Specialist', location: 'TBD' },
    { id: 'b', sheetKey: 'chili\'s::cook (full time)::subang', company: 'Chili\'s', position: 'Cook', location: 'Subang' },
  ];
  assert.equal(findExistingJobOrder(existing, { company: 'psa', position: 'lashing specialist', location: '' }).id, 'a');
  assert.equal(findExistingJobOrder(existing, { sheetKey: 'chili\'s::cook (full time)::subang' }).id, 'b');
  assert.equal(findExistingJobOrder(existing, { company: 'PSA', position: 'Welder', location: '' }), null);
  assert.equal(jobOrderSheetKey({ company: ' PSA ', position: 'Lashing  Specialist', location: 'TBD' }), 'psa::lashing specialist::');
});
