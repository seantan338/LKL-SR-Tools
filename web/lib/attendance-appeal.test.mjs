import test from 'node:test';
import assert from 'node:assert/strict';
import { ExcelExporter, mapAttendanceVisualState } from './excel-exporter.js';
import { DEFAULT_SHIFT_CONFIG } from './cascade-shift-engine.js';

test('ExcelExporter formats ADMIN_MANUAL punch record with audit note in dual-sheet architecture', () => {
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

  // 核心架构红线：双表架构 (Sheet 1 矩阵 & 汇总 + Sheet 2 打卡与审计流水)
  assert.equal(sheets.length, 2);

  // Sheet 1 矩阵表验证
  const matrixSheet = sheets[0];
  assert.ok(matrixSheet.isMatrix);
  assert.ok(matrixSheet.name.includes('考勤矩阵'));
  assert.ok(matrixSheet.rows.length >= 6); // 5行表头 + 数据行

  // Sheet 2 流水表验证
  const detailSheet = sheets[1];
  assert.equal(detailSheet.name, '上下班打卡与审计流水明细');

  // Verify headers and rows exist
  assert.ok(detailSheet.headers.length >= 14);
  assert.ok(detailSheet.rows.length >= 1);
  const row = detailSheet.rows[0]; // first data row
  assert.equal(row[3], 'Staff Member');
  assert.equal(row[6], '08:30:00');
  assert.equal(row[9], '18:05:00');
  assert.equal(row[12], '管理员补录');

  // Check audit notes column
  const notes = row[13];
  assert.ok(notes.includes('管理员补录'));
  assert.ok(notes.includes('Admin User'));
  assert.ok(notes.includes('外出客户面试'));
});

test('ExcelExporter formats ADMIN_MANUAL in English locale and dual-sheet structure', () => {
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

  assert.equal(sheets.length, 2);
  const detailSheet = sheets[1];
  assert.equal(detailSheet.name, 'Clock-in & Clock-out Audit Log');
  assert.ok(detailSheet.rows.length >= 1);
  const row = detailSheet.rows[0];
  assert.equal(row[12], 'Admin Manual Entry');
  assert.ok(row[13].includes('Supervisor Bob'));
  assert.ok(row[13].includes('Offsite recruitment event'));
});

test('mapAttendanceVisualState correctly outputs Zero-Emoji codes and high-contrast color styles', () => {
  // 1. 周末休息
  const weekendState = mapAttendanceVisualState({
    dayMeta: { isWeekend: true, dateStr: '2026-10-25' },
    todayStr: '2026-10-30',
    locale: 'zh'
  });
  assert.equal(weekendState.code, '休');
  assert.equal(weekendState.category, 'WEEKEND');

  // 2. 正常打卡
  const normalState = mapAttendanceVisualState({
    dayLog: {
      analysis: {
        hasAttendance: true,
        isCompliant: true,
        clockInStr: '08:30:00',
        clockOutStr: '17:35:00'
      }
    },
    dayMeta: { isWeekend: false, dateStr: '2026-10-26' },
    todayStr: '2026-10-30',
    locale: 'zh'
  });
  assert.equal(normalState.code, '✔');
  assert.equal(normalState.category, 'NORMAL');
  assert.equal(normalState.bgHex, 'DCFCE7');

  // 3. 忘记打卡（单边缺卡）
  const missingState = mapAttendanceVisualState({
    dayLog: {
      analysis: {
        hasAttendance: true,
        isMissingPunch: true,
        compliance: 'MISSED_OUT',
        clockInStr: '08:30:00',
        clockOutStr: '-'
      }
    },
    dayMeta: { isWeekend: false, dateStr: '2026-10-27' },
    todayStr: '2026-10-30',
    locale: 'en'
  });
  assert.equal(missingState.code, '?');
  assert.equal(missingState.category, 'MISSED');
  assert.equal(missingState.bgHex, 'FEF08A');

  // 4. 失联旷工 (MIA)
  const miaState = mapAttendanceVisualState({
    dayLog: {
      analysis: {
        hasAttendance: false,
        compliance: 'ABSENT',
        note: '半天假全天无打卡'
      }
    },
    dayMeta: { isWeekend: false, dateStr: '2026-10-28' },
    todayStr: '2026-10-30',
    locale: 'en'
  });
  assert.equal(miaState.code, 'MIA');
  assert.equal(miaState.category, 'MIA');
  assert.equal(miaState.bgHex, '1E293B');

  // 5. 未来未发生日期严格拦截
  const futureState = mapAttendanceVisualState({
    dayMeta: { isWeekend: false, dateStr: '2026-11-15' },
    todayStr: '2026-10-30',
    locale: 'zh'
  });
  assert.equal(futureState.code, '');
  assert.equal(futureState.category, 'FUTURE');
});
