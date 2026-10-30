import test from 'node:test';
import assert from 'node:assert/strict';
import { ExcelExporter } from './excel-exporter.js';
import { DEFAULT_SHIFT_CONFIG } from './cascade-shift-engine.js';

test('ExcelExporter formats ADMIN_MANUAL punch record with audit note', () => {
  const events = [
    {
      userId: 'user_1',
      userEmail: 'staff@example.com',
      picName: 'Staff Member',
      type: 'CLOCK_IN',
      verifyMethod: 'WIFI_IP',
      timestamp: new Date('2026-10-29T08:30:00')
    },
    {
      userId: 'user_1',
      userEmail: 'staff@example.com',
      picName: 'Staff Member',
      type: 'CLOCK_OUT',
      verifyMethod: 'ADMIN_MANUAL',
      isManualEntry: true,
      manualEntry: {
        addedByName: 'Admin User',
        addedByEmail: 'admin@example.com',
        addedAt: '2026-10-30T09:00:00Z',
        reason: '10月29日外出客户面试，申诉核准补录'
      },
      timestamp: new Date('2026-10-29T18:05:00')
    }
  ];

  const sheets = ExcelExporter.buildAttendanceReportData({
    monthStr: '2026-10',
    attendanceEvents: events,
    hqMembers: [{ uid: 'user_1', displayName: 'Staff Member', email: 'staff@example.com' }],
    shiftConfig: DEFAULT_SHIFT_CONFIG,
    locale: 'zh'
  });

  assert.equal(sheets.length, 3);
  const detailSheet = sheets[2];
  assert.equal(detailSheet.name, '每日打卡流水明细');

  // Verify headers and rows exist
  assert.ok(detailSheet.headers.length >= 12);
  assert.ok(detailSheet.rows.length >= 1);
  const row = detailSheet.rows[0]; // first data row
  // row[0] is Date, row[2] is PIC, row[3] is In (08:30:00), row[8] is Out (18:05:00), row[11] is Verify Method
  assert.equal(row[2], 'Staff Member');
  assert.equal(row[3], '08:30:00');
  assert.equal(row[8], '18:05:00');
  assert.equal(row[11], '管理员补录');

  // Check audit notes column
  const notes = row[12];
  assert.ok(notes.includes('管理员补录'));
  assert.ok(notes.includes('Admin User'));
  assert.ok(notes.includes('外出客户面试'));
});

test('ExcelExporter formats ADMIN_MANUAL in English locale', () => {
  const events = [
    {
      userId: 'user_2',
      userEmail: 'alice@example.com',
      picName: 'Alice',
      type: 'CLOCK_IN',
      verifyMethod: 'WIFI_IP',
      timestamp: new Date('2026-10-29T08:30:00')
    },
    {
      userId: 'user_2',
      userEmail: 'alice@example.com',
      picName: 'Alice',
      type: 'CLOCK_OUT',
      verifyMethod: 'ADMIN_MANUAL',
      isManualEntry: true,
      manualEntry: {
        addedByName: 'Supervisor Bob',
        reason: 'Offsite recruitment event'
      },
      timestamp: new Date('2026-10-29T18:00:00')
    }
  ];

  const sheets = ExcelExporter.buildAttendanceReportData({
    monthStr: '2026-10',
    attendanceEvents: events,
    hqMembers: [{ uid: 'user_2', displayName: 'Alice', email: 'alice@example.com' }],
    shiftConfig: DEFAULT_SHIFT_CONFIG,
    locale: 'en'
  });

  const detailSheet = sheets[2];
  assert.equal(detailSheet.name, 'Daily Punch Log Details');
  assert.ok(detailSheet.rows.length >= 1);
  const row = detailSheet.rows[0];
  assert.equal(row[11], 'Admin Manual Entry');
  assert.ok(row[12].includes('Supervisor Bob'));
  assert.ok(row[12].includes('Offsite recruitment event'));
});
