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
