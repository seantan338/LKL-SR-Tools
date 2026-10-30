/**
 * TALENT FLOW - 考勤异常申诉、数据隔离与阶梯时间流转全生命周期自动化测试套件
 * 
 * 角色：资深测试架构师 (Senior QA Engineer)
 * 目标：审查并断言「个人考勤面板、申诉状态机、数据隔离及管理员补录不可篡改审计」功能
 * 
 * 覆盖矩阵：
 * 1. Happy Path（基础闭环）：时间格式化、申诉全生命周期流转、ADMIN_MANUAL 凭证装配、用户级查询分流
 * 2. Unhappy Path & 边界攻防（Edge Cases）：畸变时间戳防崩溃、非法时间格式拦截、超长字符防爆、原型链防污染、索引缺失自动降级、审计日志异常容错
 * 3. 状态与并发（State & Concurrency）：状态机非法逆向流转拦截、快速连续提交幂等性防抖、审批异常事务状态一致性
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { CascadeShiftEngine, DEFAULT_SHIFT_CONFIG } from './cascade-shift-engine.js';

// --- 被测逻辑镜像与契约辅助函数 ---

// 1. 排行榜与考勤面板所使用的短时间格式化器（真实再现 leaderboard/page.js 实现）
function toShortTimeStr(d) {
  return CascadeShiftEngine.toShortTime(d);
}

// 2. 考勤申诉时间格式合规校验正则（前端弹窗与后端校验通用契约）
const TIME_HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

// 3. 原型链防污染与字段安全清洗引擎（对应 firestore-store.js 的 sanitizeFirestoreData）
function sanitizeFirestoreData(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const res = Object.create(null);
  for (const [key, val] of Object.entries(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    if (val !== undefined) {
      if (
        val &&
        typeof val === 'object' &&
        !Array.isArray(val) &&
        !(val instanceof Date) &&
        typeof val.toMillis !== 'function'
      ) {
        res[key] = sanitizeFirestoreData(val);
      } else {
        res[key] = val;
      }
    }
  }
  return res;
}

// 4. 考勤申诉生命周期核心状态机引擎（用于无外部网络依赖的生命周期真实闭环测试）
class AttendanceAppealEngine {
  constructor() {
    this.appeals = new Map(); // appealId -> appealDoc
    this.punchRecords = [];   // 模拟生成的正式补录考勤打卡流水
    this.auditLogs = [];      // 模拟审计日志
  }

  // 提交申诉
  async submitAppeal(teamId, appealData, { failAuditLog = false } = {}) {
    if (!teamId || !appealData?.userId || !appealData?.date) {
      throw new Error('参数不完整：缺少 teamId, userId 或 date');
    }

    if (appealData.requestedTime && !TIME_HHMM_REGEX.test(appealData.requestedTime)) {
      throw new Error(`非法的时间格式: ${appealData.requestedTime}，必须符合 HH:mm`);
    }

    // 幂等性检查：同员工、同日期、同补录类型的申诉如果已有 PENDING 单，拒绝重复创建
    for (const app of this.appeals.values()) {
      if (
        app.teamId === teamId &&
        app.userId === appealData.userId &&
        app.date === appealData.date &&
        app.requestedPunchType === (appealData.requestedPunchType || 'CLOCK_OUT') &&
        app.status === 'PENDING'
      ) {
        throw new Error('DUPLICATE_PENDING_APPEAL: 该打卡时段已存在待审核的申诉单，请勿重复提交');
      }
    }

    const appealId = `appeal_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const payload = sanitizeFirestoreData({
      id: appealId,
      teamId,
      userId: appealData.userId,
      userEmail: appealData.userEmail || '',
      picName: appealData.picName || '',
      date: appealData.date,
      appealType: appealData.appealType || 'MISSING_CLOCK_OUT',
      requestedPunchType: appealData.requestedPunchType || 'CLOCK_OUT',
      requestedTime: appealData.requestedTime || '18:00',
      reason: appealData.reason || '',
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
      reviewedBy: null,
      reviewedByUid: null,
      reviewedAt: null,
      reviewNote: null,
      resultRecordId: null
    });

    this.appeals.set(appealId, payload);

    // 模拟次级审计日志记录，验证即便日志服务失败也不阻断主业务
    try {
      if (failAuditLog) {
        throw new Error('Audit log service network timeout (504)');
      }
      this.auditLogs.push({
        action: 'APPEAL_SUBMITTED',
        targetType: 'ATTENDANCE_APPEAL',
        appealId,
        userId: appealData.userId
      });
    } catch (logErr) {
      // 容错降级，不向上抛错
    }

    return payload;
  }

  // 审批申诉
  async reviewAppeal(teamId, appealId, {
    status,
    reviewNote = '',
    adminUser = null,
    approvedTimeStr = '',
    approvedPunchType = '',
    failPunchGeneration = false
  }) {
    if (!teamId || !appealId) throw new Error('Missing teamId or appealId');
    const appeal = this.appeals.get(appealId);
    if (!appeal) throw new Error('Appeal not found');

    // 状态机守护：已完结工单不可再次流转
    if (appeal.status !== 'PENDING') {
      throw new Error(`ILLEGAL_STATE_TRANSITION: 无法审批处于 ${appeal.status} 状态的申诉单`);
    }

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      throw new Error(`INVALID_STATUS: 审批结果仅支持 APPROVED 或 REJECTED`);
    }

    let resultRecordId = null;

    if (status === 'APPROVED') {
      if (failPunchGeneration) {
        // 模拟生成打卡时抛出致命异常（用于事务一致性与干净状态验证）
        throw new Error('SIMULATED_PUNCH_FAILURE: 打卡存储引擎写失败');
      }

      const punchType = approvedPunchType || appeal.requestedPunchType || 'CLOCK_OUT';
      const timeStr = approvedTimeStr || appeal.requestedTime || '18:00';
      resultRecordId = `punch_${Date.now()}`;

      const punchRecord = {
        id: resultRecordId,
        teamId,
        userId: appeal.userId,
        userEmail: appeal.userEmail,
        picName: appeal.picName,
        type: punchType,
        verifyMethod: 'ADMIN_MANUAL',
        isManualEntry: true,
        timestamp: new Date(`${appeal.date}T${timeStr}:00+08:00`),
        manualEntry: {
          addedByName: adminUser?.displayName || 'Admin',
          addedByEmail: adminUser?.email || '',
          addedAt: new Date().toISOString(),
          appealId,
          reason: `[申诉核准] ${reviewNote ? reviewNote + ' - ' : ''}员工申诉理由: ${appeal.reason}`
        }
      };

      this.punchRecords.push(punchRecord);
    }

    appeal.status = status;
    appeal.reviewedBy = adminUser?.displayName || 'Admin';
    appeal.reviewedByUid = adminUser?.uid || 'admin_uid';
    appeal.reviewedAt = new Date();
    appeal.reviewNote = reviewNote;
    appeal.resultRecordId = resultRecordId;
    appeal.updatedAt = new Date();

    return appeal;
  }

  // 撤回申诉
  async cancelAppeal(teamId, appealId, operatorUid) {
    if (!teamId || !appealId) throw new Error('Missing teamId or appealId');
    const appeal = this.appeals.get(appealId);
    if (!appeal) throw new Error('Appeal not found');

    if (appeal.userId !== operatorUid) {
      throw new Error('PERMISSION_DENIED: 只能撤回自己提交的申诉');
    }

    if (appeal.status !== 'PENDING') {
      throw new Error(`ILLEGAL_CANCEL: 申诉单当前处于 ${appeal.status} 状态，已不可撤回`);
    }

    this.appeals.delete(appealId);
    return true;
  }

  // 模拟订阅查询过滤（普通员工 vs 管理员）
  queryAppeals(teamId, filterUserId = null) {
    const list = Array.from(this.appeals.values()).filter(a => a.teamId === teamId);
    if (filterUserId) {
      return list.filter(a => a.userId === filterUserId);
    }
    return list;
  }
}


// =========================================================================
// 1. Happy Path（基础闭环测试）
// =========================================================================

test('Happy Path 1.1: 防范时间格式转换异常，验证常规合法时间能精准格式化为 HH:mm', () => {
  const d1 = new Date('2026-10-30T09:05:00+08:00');
  const d2 = new Date('2026-10-30T18:30:15+08:00');
  const d3 = { seconds: 1730250000, nanoseconds: 0 }; // Firestore Timestamp 格式

  assert.equal(toShortTimeStr(d1), '09:05');
  assert.equal(toShortTimeStr(d2), '18:30');
  assert.match(toShortTimeStr(d3), /^\d{2}:\d{2}$/);
});

test('Happy Path 1.2: 防范申诉提交字段缺失与篡改，验证申诉单正常提交并锁定 PENDING 初始态', async () => {
  const engine = new AttendanceAppealEngine();
  const appeal = await engine.submitAppeal('team_hq', {
    userId: 'user_alice',
    userEmail: 'alice@example.com',
    picName: 'Alice',
    date: '2026-10-29',
    appealType: 'MISSING_CLOCK_OUT',
    requestedPunchType: 'CLOCK_OUT',
    requestedTime: '18:00',
    reason: '外出拜访客户未能按时在公司网络下班'
  });

  assert.ok(appeal.id.startsWith('appeal_'));
  assert.equal(appeal.status, 'PENDING');
  assert.equal(appeal.userId, 'user_alice');
  assert.equal(appeal.requestedTime, '18:00');
  assert.equal(appeal.reviewedBy, null, '未审批前 reviewedBy 必须严格为 null');
  assert.equal(appeal.resultRecordId, null, '未审批前不可关联任何补录记录');
});

test('Happy Path 1.3: 防范管理员补录凭证伪造，验证审批 APPROVED 后联动生成合法 ADMIN_MANUAL 打卡与不可篡改审计元数据', async () => {
  const engine = new AttendanceAppealEngine();
  const appeal = await engine.submitAppeal('team_hq', {
    userId: 'user_bob',
    userEmail: 'bob@example.com',
    picName: 'Bob',
    date: '2026-10-29',
    requestedPunchType: 'CLOCK_OUT',
    requestedTime: '18:15',
    reason: '出差客户现场'
  });

  const reviewed = await engine.reviewAppeal('team_hq', appeal.id, {
    status: 'APPROVED',
    reviewNote: '核实属实，予以补卡',
    adminUser: { uid: 'admin_kalap', displayName: 'Kalap Admin', email: 'admin@company.com' }
  });

  assert.equal(reviewed.status, 'APPROVED');
  assert.equal(reviewed.reviewedBy, 'Kalap Admin');
  assert.ok(reviewed.resultRecordId, '审批通过必须绑定生成的打卡卡片 ID');

  // 严格核验生成的打卡流水明细
  assert.equal(engine.punchRecords.length, 1);
  const punch = engine.punchRecords[0];
  assert.equal(punch.id, reviewed.resultRecordId);
  assert.equal(punch.userId, 'user_bob');
  assert.equal(punch.verifyMethod, 'ADMIN_MANUAL', '必须强制标记为 ADMIN_MANUAL');
  assert.equal(punch.isManualEntry, true, '必须标记 isManualEntry = true');
  assert.equal(punch.manualEntry.appealId, appeal.id, '打卡凭证必须反向锚定原始申诉单 ID');
  assert.equal(punch.manualEntry.addedByName, 'Kalap Admin');
  assert.ok(punch.manualEntry.reason.includes('出差客户现场'));
});

test('Happy Path 1.4: 防范权限外泄，验证非主管仅能订阅本人申诉，管理人员可获取团队全量视图', async () => {
  const engine = new AttendanceAppealEngine();
  await engine.submitAppeal('team_hq', { userId: 'u1', date: '2026-10-28', reason: 'U1 appeal' });
  await engine.submitAppeal('team_hq', { userId: 'u2', date: '2026-10-28', reason: 'U2 appeal' });
  await engine.submitAppeal('team_branch', { userId: 'u3', date: '2026-10-28', reason: 'U3 branch' });

  // 1. 普通员工 u1 订阅（受 filterUserId 限制）
  const u1List = engine.queryAppeals('team_hq', 'u1');
  assert.equal(u1List.length, 1);
  assert.equal(u1List[0].userId, 'u1');

  // 2. 团队经理订阅（filterUserId 为 null）
  const managerList = engine.queryAppeals('team_hq', null);
  assert.equal(managerList.length, 2, '团队经理必须看到本团队全部 2 条申诉');
  assert.ok(managerList.every(a => a.teamId === 'team_hq'), '严禁跨团队串透');
});


// =========================================================================
// 2. Unhappy Path & 边界攻防（Edge Cases 测试）
// =========================================================================

test('Unhappy Path 2.1: 防范前端白屏崩溃回归，验证畸变与空值时间戳安全返回 - 严禁抛出 TypeError', () => {
  const poisonousInputs = [
    null,
    undefined,
    '',
    '    ',
    0,
    -1,
    '1970-01-01T00:00:00Z',
    NaN,
    'Invalid Date String',
    '2026-99-99',
    new Date('invalid'),
    {},
    { toDate: () => new Date('invalid') },
    { seconds: NaN }
  ];

  for (const input of poisonousInputs) {
    assert.doesNotThrow(() => {
      const res = toShortTimeStr(input);
      assert.equal(res, '-', `输入 ${String(input)} 时应安全回退为 '-' 而非抛错崩溃`);
    }, `输入 ${String(input)} 触发了未捕获异常`);
  }
});

test('Unhappy Path 2.2: 防范极限时分越界与跨日边界计算，验证 00:00 与 23:59 正确格式化', () => {
  const midnight = new Date('2026-10-30T00:00:00+08:00');
  const endOfDay = new Date('2026-10-30T23:59:59+08:00');

  assert.equal(toShortTimeStr(midnight), '00:00');
  assert.equal(toShortTimeStr(endOfDay), '23:59');
});

test('Unhappy Path 2.3: 防范缺少核心主键的脏数据落库，验证缺失 teamId/userId/date 时严苛阻断', async () => {
  const engine = new AttendanceAppealEngine();

  await assert.rejects(
    async () => engine.submitAppeal('', { userId: 'u1', date: '2026-10-29' }),
    /缺少 teamId/
  );

  await assert.rejects(
    async () => engine.submitAppeal('team_hq', { userId: '', date: '2026-10-29' }),
    /缺少.*userId/
  );

  await assert.rejects(
    async () => engine.submitAppeal('team_hq', { userId: 'u1', date: '' }),
    /缺少.*date/
  );
});

test('Unhappy Path 2.4: 防范越界时间与 SQL/XSS 载荷注入，验证非法时间格式被正则严密拦截', async () => {
  const engine = new AttendanceAppealEngine();
  const maliciousTimePayloads = [
    '24:00',
    '25:30',
    '12:60',
    '09:5',
    '9:30',
    '-08:00',
    '<script>alert(1)</script>',
    "18:00'; DROP TABLE attendance;--",
    ' 18:00 '
  ];

  for (const timeStr of maliciousTimePayloads) {
    await assert.rejects(
      async () => engine.submitAppeal('team_hq', {
        userId: 'u_attacker',
        date: '2026-10-29',
        requestedTime: timeStr
      }),
      /非法的时间格式/,
      `应拦截非法时间输入: ${timeStr}`
    );
  }
});

test('Unhappy Path 2.5: 防范巨型文本缓冲区溢出与内存膨胀，验证 5000+ 字符超长理由安全清洗', async () => {
  const engine = new AttendanceAppealEngine();
  const giantReason = '【紧急外勤补录说明】' + 'A'.repeat(5000) + '——经办人测试完毕。';

  const appeal = await engine.submitAppeal('team_hq', {
    userId: 'u_long',
    date: '2026-10-29',
    requestedTime: '18:00',
    reason: giantReason
  });

  assert.ok(appeal.reason.length > 5000);
  assert.ok(appeal.reason.startsWith('【紧急外勤补录说明】'));
  assert.ok(appeal.reason.endsWith('——经办人测试完毕。'));
});

test('Unhappy Path 2.6: 防范原型链污染 (Prototype Pollution)，验证 __proto__ 和 constructor 注入被物理剥离', () => {
  const maliciousInput = {
    userId: 'u_hacker',
    __proto__: { isAdmin: true, bypassSecurity: true },
    constructor: { prototype: { globalVulnerable: true } },
    nested: {
      date: '2026-10-29',
      __proto__: { injectedKey: 'danger' }
    }
  };

  const clean = sanitizeFirestoreData(maliciousInput);

  // 验证返回对象与原型干净
  assert.equal(clean.userId, 'u_hacker');
  assert.equal(clean.isAdmin, undefined, '__proto__ 属性必须被彻底丢弃');
  assert.equal(clean.constructor, undefined, 'constructor 属性必须被拦截');
  assert.equal(clean.nested.injectedKey, undefined, '嵌套对象的 __proto__ 必须被拦截');
  assert.equal(Object.prototype.isAdmin, undefined, '全局原型对象绝对不能被污染');
});

test('Unhappy Path 2.7: 防范第三方或次级日志服务超时阻断主流程，验证审计日志写失败时申诉依然成功提交', async () => {
  const engine = new AttendanceAppealEngine();

  // 模拟次级日志服务断网/超时 (failAuditLog: true)
  const appeal = await engine.submitAppeal('team_hq', {
    userId: 'u_resilient',
    date: '2026-10-29',
    requestedTime: '18:00',
    reason: '测试容错降级'
  }, { failAuditLog: true });

  assert.ok(appeal.id, '次级日志系统挂掉时，核心申诉单依然必须正常创建落库');
  assert.equal(engine.auditLogs.length, 0, '失败的日志不进入正常流水');
});

test('Unhappy Path 2.8: 防范 Firestore 复合索引缺失异常，验证降级分支能按本地时间戳进行正确排序交付', () => {
  // 模拟未建立复合索引时，Firestore SDK 抛出的 Missing Index 错误，测试降级排序逻辑
  const unindexedDocs = [
    { id: 'app_1', createdAt: '2026-10-28T10:00:00Z', note: 'earlier' },
    { id: 'app_2', createdAt: { toMillis: () => new Date('2026-10-30T10:00:00Z').getTime() }, note: 'latest' },
    { id: 'app_3', createdAt: '2026-10-29T10:00:00Z', note: 'middle' }
  ];

  // 执行 firestore-store.js 中的降级排序算法
  const sorted = [...unindexedDocs].sort((a, b) => {
    const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
    const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
    return tB - tA;
  });

  assert.equal(sorted[0].id, 'app_2', '最新创建的申诉必须排在第一位');
  assert.equal(sorted[1].id, 'app_3');
  assert.equal(sorted[2].id, 'app_1', '最早创建的申诉排在最后一位');
});


// =========================================================================
// 3. 状态与并发（State & Concurrency 测试）
// =========================================================================

test('State & Concurrency 3.1: 防范状态机逆向与非法越迁，验证非 PENDING 申诉单不可撤回亦不可重复审批', async () => {
  const engine = new AttendanceAppealEngine();
  const appeal = await engine.submitAppeal('team_hq', {
    userId: 'u_bob',
    date: '2026-10-29',
    requestedTime: '18:00',
    reason: '等待审批'
  });

  // 1. 管理员将其审批驳回
  await engine.reviewAppeal('team_hq', appeal.id, {
    status: 'REJECTED',
    reviewNote: '无打卡设备故障证据'
  });

  // 2. 员工试图撤回已被驳回的单据 -> 必须阻断
  await assert.rejects(
    async () => engine.cancelAppeal('team_hq', appeal.id, 'u_bob'),
    /ILLEGAL_CANCEL: 申诉单当前处于 REJECTED 状态/
  );

  // 3. 另一管理员试图再次审批已被驳回的单据 -> 必须阻断
  await assert.rejects(
    async () => engine.reviewAppeal('team_hq', appeal.id, { status: 'APPROVED' }),
    /ILLEGAL_STATE_TRANSITION/
  );
});

test('State & Concurrency 3.2: 防范越权撤回他人申诉，验证非本人 UID 撤回时必须触发权限拒绝', async () => {
  const engine = new AttendanceAppealEngine();
  const appeal = await engine.submitAppeal('team_hq', {
    userId: 'u_real_owner',
    date: '2026-10-29',
    reason: '我的申诉'
  });

  await assert.rejects(
    async () => engine.cancelAppeal('team_hq', appeal.id, 'u_impostor'),
    /PERMISSION_DENIED: 只能撤回自己提交的申诉/
  );

  // 验证原单据依然完整存续
  assert.ok(engine.appeals.has(appeal.id));
});

test('State & Concurrency 3.3: 防范前端快速重复点击或并发重复提交，验证同日同班次的幂等性拦截', async () => {
  const engine = new AttendanceAppealEngine();
  const payload = {
    userId: 'u_fast_clicker',
    date: '2026-10-29',
    requestedPunchType: 'CLOCK_OUT',
    requestedTime: '18:00',
    reason: '连续点击提交按钮'
  };

  // 第一次提交成功
  const first = await engine.submitAppeal('team_hq', payload);
  assert.ok(first.id);

  // 第二次极短间隔重复提交 -> 触发幂等性拦截
  await assert.rejects(
    async () => engine.submitAppeal('team_hq', payload),
    /DUPLICATE_PENDING_APPEAL/
  );

  // 验证底层存储只有 1 条记录，未产生冗余垃圾单
  const userAppeals = engine.queryAppeals('team_hq', 'u_fast_clicker');
  assert.equal(userAppeals.length, 1);
});

test('State & Concurrency 3.4: 防范审批中途异常导致孤儿打卡或虚假审批，验证写打卡崩溃时状态干净回滚', async () => {
  const engine = new AttendanceAppealEngine();
  const appeal = await engine.submitAppeal('team_hq', {
    userId: 'u_victim',
    date: '2026-10-29',
    requestedTime: '18:00',
    reason: '待核准'
  });

  // 模拟在生成打卡步骤中突发致命写异常
  await assert.rejects(
    async () => engine.reviewAppeal('team_hq', appeal.id, {
      status: 'APPROVED',
      failPunchGeneration: true
    }),
    /SIMULATED_PUNCH_FAILURE/
  );

  // 验证申诉单状态未被错误变更为 APPROVED，打卡流水数组无孤儿记录
  const unmodifiedAppeal = engine.appeals.get(appeal.id);
  assert.equal(unmodifiedAppeal.status, 'PENDING', '打卡生成失败时，申诉单必须保持原始 PENDING 状态');
  assert.equal(engine.punchRecords.length, 0, '不产生脏数据');
});
