import test from 'node:test';
import assert from 'node:assert/strict';
import { CascadeShiftEngine, DEFAULT_SHIFT_CONFIG } from './cascade-shift-engine.js';

// 辅助创建指定时间的 Date 对象（2026-10-26）
function makeDate(timeStr) {
  return new Date(`2026-10-26T${timeStr}+08:00`);
}

test('1. 零打卡冗余匹配：8:30:00 准时打卡应命中 Shift C (8:30 - 17:30)', () => {
  const t830 = makeDate('08:30:00');
  const shift = CascadeShiftEngine.matchShift(t830, DEFAULT_SHIFT_CONFIG);
  assert.equal(shift.id, 'shift_c');
  assert.equal(shift.endTime, '17:30');
  assert.equal(shift.isLateArrival, false);
});

test('1.1 整分钟包含制核心验证：8:30:59 依然属于 8:30 班次之内，应稳稳命中 Shift C', () => {
  const t83059 = makeDate('08:30:59');
  const shift = CascadeShiftEngine.matchShift(t83059, DEFAULT_SHIFT_CONFIG);
  assert.equal(shift.id, 'shift_c', '8:30:59 尚未跨入 8:31，必须算作 8:30 档');
  assert.equal(shift.endTime, '17:30');
  assert.equal(shift.isLateArrival, false);
});

test('2. 老板WhatsApp案例：8:31:00 打卡零容忍滚入 Shift D (9:00 - 18:00)', () => {
  const t831 = makeDate('08:31:00');
  const shift = CascadeShiftEngine.matchShift(t831, DEFAULT_SHIFT_CONFIG);
  assert.equal(shift.id, 'shift_d', '8:31 超过 8:30，应强制顺延至 9:00 班次');
  assert.equal(shift.endTime, '18:00');
  assert.equal(shift.endStr, '18:00:00');
  assert.equal(shift.isLateArrival, false);
});

test('3. 管理员动态容差支持：若配置 graceMinutes = 2，8:31:00 应可宽限命中 Shift C', () => {
  const customConfig = {
    ...DEFAULT_SHIFT_CONFIG,
    graceMinutes: 2
  };
  const t831 = makeDate('08:31:00');
  const shift = CascadeShiftEngine.matchShift(t831, customConfig);
  assert.equal(shift.id, 'shift_c', '在 2 分钟宽限期内，8:31 应命中 8:30 班次');
});

test('4. 老板WhatsApp案例：8:31 打卡顺延至 18:00 下班，若 17:59:00 提前签退应绝杀判定为违规迟到', () => {
  const events = [
    { type: 'CLOCK_IN', timestamp: makeDate('08:31:00') },
    { type: 'CLOCK_OUT', timestamp: makeDate('17:59:00') }
  ];
  const res = CascadeShiftEngine.resolveDailyShift(events, DEFAULT_SHIFT_CONFIG);
  assert.equal(res.shift.id, 'shift_d');
  assert.equal(res.compliance, 'EARLY_LEAVE_AS_LATE');
  assert.equal(res.isViolation, true);
  assert.equal(res.isLate, true, '老板原话：提前签退按迟到计');
  assert.equal(res.isMissingPunch, false);
});

test('5. 忘记打卡容错：只有签到无签退，下班显示未打卡，工时为 null，严禁伪造签退时间', () => {
  const events = [
    { type: 'CLOCK_IN', timestamp: makeDate('08:30:00') }
  ];
  const res = CascadeShiftEngine.resolveDailyShift(events, DEFAULT_SHIFT_CONFIG);
  assert.equal(res.clockInStr, '08:30:00');
  assert.equal(res.clockOutStr, '未打卡 (Missed)');
  assert.equal(res.durationHours, null);
  assert.equal(res.compliance, 'MISSED_OUT');
  assert.equal(res.isMissingPunch, true);
});

test('5.1 当日工作中容错：当天未过凌晨12点，已签到未签退算在岗工作中，工时为 null，签退为 -，不计为缺卡', () => {
  const events = [
    { type: 'CLOCK_IN', timestamp: makeDate('08:30:00') }
  ];
  const res = CascadeShiftEngine.resolveDailyShift(events, DEFAULT_SHIFT_CONFIG, { isToday: true });
  assert.equal(res.clockInStr, '08:30:00');
  assert.equal(res.clockOutStr, '-');
  assert.equal(res.durationHours, null);
  assert.equal(res.compliance, 'IN_PROGRESS');
  assert.equal(res.isMissingPunch, false);
  assert.equal(res.isCompliant, true);
});

test('6. 连击手滑误触防呆：08:30 签到，08:32 签退（间隔 < 30分钟）判定为疑似误触，工时为 null', () => {
  const events = [
    { type: 'CLOCK_IN', timestamp: makeDate('08:30:00') },
    { type: 'CLOCK_OUT', timestamp: makeDate('08:32:00') }
  ];
  const res = CascadeShiftEngine.resolveDailyShift(events, DEFAULT_SHIFT_CONFIG);
  assert.equal(res.compliance, 'ABNORMAL_PUNCH');
  assert.equal(res.durationHours, null, '误触不能生成 0 工时');
  assert.equal(res.isMissingPunch, true);
});

test('7. 正常全勤完成：08:30 签到，17:31 签退应判定为 COMPLIANT', () => {
  const events = [
    { type: 'CLOCK_IN', timestamp: makeDate('08:30:00') },
    { type: 'CLOCK_OUT', timestamp: makeDate('17:31:00') }
  ];
  const res = CascadeShiftEngine.resolveDailyShift(events, DEFAULT_SHIFT_CONFIG);
  assert.equal(res.compliance, 'COMPLIANT');
  assert.equal(res.isCompliant, true);
  assert.equal(res.isViolation, false);
  assert.equal(res.isLate, false);
  assert.equal(typeof res.durationHours, 'number');
  assert.ok(res.durationHours >= 9.0);
});

test('8. 超过所有班次归入最迟班次（如 9:01 或下午 13:45 打卡指派至 Shift D 并标记迟到）', () => {
  const t0905 = makeDate('09:05:00');
  const shift1 = CascadeShiftEngine.matchShift(t0905, DEFAULT_SHIFT_CONFIG);
  assert.equal(shift1.id, 'shift_d');
  assert.equal(shift1.endTime, '18:00');
  assert.equal(shift1.endStr, '18:00:00');
  assert.equal(shift1.isLateArrival, true);

  const t1345 = makeDate('13:45:00');
  const shift2 = CascadeShiftEngine.matchShift(t1345, DEFAULT_SHIFT_CONFIG);
  assert.equal(shift2.id, 'shift_d');
  assert.equal(shift2.endTime, '18:00');
  assert.equal(shift2.endStr, '18:00:00');
  assert.equal(shift2.isLateArrival, true);
});

test('9. 畸形配置与空参数安全兜底：无班次或残缺参数时自动回退默认班次不崩溃', () => {
  const malformedShift = CascadeShiftEngine.matchShift(null, {});
  assert.equal(malformedShift.id, 'shift_d');
  assert.equal(malformedShift.endTime, '18:00');
  assert.equal(malformedShift.isLateArrival, true);
});

test('10. 国际化 (i18n) 双语标签支持验证', () => {
  const t0905 = makeDate('09:05:00');
  const shiftEn = CascadeShiftEngine.matchShift(t0905, DEFAULT_SHIFT_CONFIG, { locale: 'en' });
  assert.ok(shiftEn.name.includes('(Late)'), '英文环境下迟到班次名称应包含 (Late)');

  const resEn = CascadeShiftEngine.resolveDailyShift([], DEFAULT_SHIFT_CONFIG, { locale: 'en' });
  assert.equal(resEn.complianceLabel, 'Absent', '英文环境下无记录标签应为 Absent');
  assert.equal(resEn.clockInStr, 'Not Clocked');
});

test('11. 主管人工改派班次验证：原本 8:31 打卡被改派为 Shift B (08:00 - 17:00)，17:05 签退应判定为达标且带主管调整标记', () => {
  const events = [
    { type: 'CLOCK_IN', timestamp: makeDate('08:31:00') },
    { type: 'CLOCK_OUT', timestamp: makeDate('17:05:00') }
  ];
  const override = {
    shiftId: 'shift_b',
    reason: '主管特批公出调整',
    overrideBy: 'manager@test.com'
  };
  const res = CascadeShiftEngine.resolveDailyShift(events, DEFAULT_SHIFT_CONFIG, { overrideShift: override });
  assert.equal(res.shift.id, 'shift_b', '应命中主管指定的班次 shift_b');
  assert.equal(res.shift.isOverridden, true, '应标记为已改派');
  assert.equal(res.compliance, 'COMPLIANT', '17:05 已过 17:00，改派为 Shift B 后应判定为达标');
  assert.ok(res.complianceLabel.includes('[主管调整]'), '标签应包含主管调整标记');
  assert.equal(res.isViolation, false, '不应计为违规迟到');
});
