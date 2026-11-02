/**
 * TALENT FLOW - 企业级多 Sheet Excel 导出引擎 (ExcelExporter v2.0.0)
 * 纯前端 0 延迟秒出报表、公式注入安全转义、三表联动（总账/日历矩阵/流水明细）与智能双宽列宽自适应
 */

import { CascadeShiftEngine } from './cascade-shift-engine.js';
import { resolveCanonicalPic } from './identity.mjs';
import { getGuaranteeRemainingDays } from './commission-engine.js';

/**
 * 纯原生浏览器文件下载触发器（彻底规避 file-saver 在 Turbopack/Webpack 下的 UMD 导出兼容崩溃）
 * @param {Blob} blob
 * @param {string} filename
 */
function triggerBrowserDownload(blob, filename) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    if (link.parentNode) link.parentNode.removeChild(link);
    URL.revokeObjectURL(url);
  }, 1500);
}

export const EXCEL_I18N = {
  zh: {
    sheetSummary: (m) => `${m} 全员出勤总账`,
    sheetMatrix: (m) => `${m} 考勤日历矩阵`,
    sheetDetail: '每日打卡流水明细',
    colPicName: '顾问姓名 (PIC)',
    colEmail: '注册邮箱',
    colTotalWorkDays: '当月总工作日 (天)',
    colElapsedWorkDays: '截止目前应出勤 (天)',
    colPresentDays: '实际出勤天数 (天)',
    colOfficeDays: '办公室打卡 (天)',
    colWfhDays: '🏠 WFH居家 (天)',
    colLeaveDays: '请假天数 (天)',
    colCompliantDays: '阶梯班次达标 (天)',
    colViolations: '迟到/早退违规 (次)',
    colMissedAnomalies: '未签退/异常 (次)',
    colAttendanceRate: '月度出勤率 (%)',
    colComplianceRate: '班次合规率 (%)',
    colDate: '考勤日期',
    colWeekday: '星期',
    colFirstIn: '首次签到 (In)',
    colLunchOut: '午休离开',
    colLunchIn: '午休返回',
    colShift: '核定阶梯班次',
    colCutoff: '要求下班底线',
    colLastOut: '实际签退 (Out)',
    colDuration: '当日工时 (h)',
    colComplianceStatus: '综合合规判定',
    colVerifyMethod: '核验模式',
    colNotes: '核验凭证与备注',
    defaultPic: '顾问',
    unassignedShift: '未定班次',
    methodWfh: '居家办公 (WFH)',
    methodWifi: '公司 Wi-Fi',
    methodGps: 'GPS 地理围栏',
    methodAdminManual: '管理员补录',
    methodLeave: '获批休假',
    leaveMatrixShort: { ANNUAL: '休(AL)', SICK: '病(MC)', EMERGENCY: '事(EL)', UNPAID: '无薪(UL)', OTHER: '假' },
    manualAuditNoteText: (name, reason) => `[管理员补录: 由 ${name || '管理员'} 补录${reason ? ' - ' + reason : ''}]`,
    methodRegular: '日常打卡',
    weekendRest: '休',
    absentDash: '—',
    missedOutShort: '未签退',
    inProgressShort: '在岗',
    lateShort: '迟到',
    punchInLabel: '签到',
    punchOutLabel: '签退',
    punchLunchOutLabel: '午休出',
    punchLunchInLabel: '午休回',
    allPunchesPrefix: '全部打卡',
    geofenceTag: '地理围栏',
    manualPunchTag: ' (补录)',
    defaultAdminName: '管理员',
    weekdays: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
    sheetAttendanceMatrix: (m) => `${m} 员工考勤矩阵`,
    sheetAttendanceLogs: '上下班打卡与审计流水明细',
    titleBannerText: (m, y) => `${y}年${m} 员工考勤总览表`,
    lblMonth: '月份:',
    lblYear: '年份:',
    legendLabel: '图例:',
    legendNormal: '✔ 正常',
    legendLate: '迟 迟到',
    legendEarly: '早 早退',
    legendLateEarly: '迟早 迟退',
    legendMissed: '漏 漏卡',
    legendLeave: '假 休假',
    legendUnpunched: '✖ 缺卡',
    legendMia: '旷 旷工',
    legendWeekend: '休 周末',
    colEmpId: '员工编号',
    colEmpName: '员工姓名',
    colShiftName: '核定班次',
    colSummaryPresent: '实出勤天数',
    colSummaryLeave: '请假天数',
    colSummaryLateEarly: '迟到/早退',
    colSummaryMissed: '漏卡次数',
    colSummaryMia: '旷工/MIA',
    colSummaryRate: '出勤率 (%)',
    statusNormalCode: '✔',
    statusLateCode: '迟',
    statusEarlyCode: '早',
    statusLateEarlyCode: '迟早',
    statusMissedCode: '漏',
    statusUnpunchedCode: '✖',
    statusMiaCode: '旷',
    statusWeekendCode: '休',
    commentIn: '上班签到',
    commentOut: '下班签退',
    commentShift: '核定班次',
    commentOverride: '主管调整',
    commentManualAdmin: '管理员补录',
    commentLeaveDetail: '已获批休假',
    commentUnpunched: '全天无打卡记录 (Unpunched)',
    commentMia: '半天假全天未签到旷工 / 无故失联旷工 (MIA)',
    emptySheetErr: '导出内容为空，无有效 Sheet',
    sheetCommSummary: (m) => `${m} 顾问佣金结算总账`,
    sheetCommDetail: '成单分成与保证期风控明细',
    colDealsCount: '成单数量 (单)',
    colPendingComm: '保证期待解锁 (RM)',
    colUnlockedComm: '可结算佣金 (RM)',
    colTotalGrossComm: '实得分成总额 (RM)',
    colCandidateName: '候选人姓名',
    colCompanyName: '录用企业客户',
    colPosition: '录用职位',
    colOnboardDate: '到岗入职日期',
    colGuaranteeDays: '保证期 (天)',
    colUnlockDate: '保证期到期日',
    colBillingMode: '计费模式',
    colTotalPool: '总佣金池 (RM)',
    colSplitsDetail: '顾问分成明细',
    colDealStatus: '账单状态',
    colOverrideReason: '主管特批原因',
    colCancelReason: '退工离职冲销原因',
    statusCancelled: '已冲销',
    statusUnlocked: '可结算',
    statusPending: '保证期内',
    sheetClaimsSummary: (m) => `${m} 员工报销与随薪汇总`,
    sheetClaimsLedger: '报销单与双轨审批总账',
    sheetClaimsDetail: '票据与里程补贴明细',
    colClaimsCount: '申报单数 (笔)',
    colClaimsTotal: '申报总额 (MYR)',
    colPayrollApproved: '已核准随薪发放 (MYR)',
    colBatchPaid: '已批次结清 (MYR)',
    colReviewingAmt: '审核中金额 (MYR)',
    colWarningCount: '风控预警数 (次)',
    colClaimId: '报销单号',
    colClaimTitle: '单据标题',
    colClaimMonth: '归属月份',
    colApplicant: '申请人 (PIC)',
    colItemsCount: '明细项数',
    colPayoutChannel: '放款轨道',
    colCurrentStatus: '审批状态',
    colManagerReviewer: '主管初审人',
    colManagerReviewTime: '初审时间',
    colFinanceReviewer: '财务终审人',
    colFinanceReviewTime: '终审时间',
    colRejectReason: '驳回原因',
    colCategory: '费用类别',
    colExpenseDate: '发生日期',
    colMerchantRoute: '商户名称 / 路线',
    colInvoiceNo: '发票单号',
    colVehicleType: '出行车型',
    colDistanceKm: '里程 (KM)',
    colTollAmt: '过路费 (MYR)',
    colParkingAmt: '停车费 (MYR)',
    colLineAmount: '报销金额 (MYR)',
    colTaxAmt: '税额 (SST)',
    colOcrFlag: 'AI识别',
    colWarnings: '风控标签',
    colLineNotes: '明细说明',
    defaultOverrideReason: '主管特批',
    channelPayrollText: '随薪发放 (Payroll)',
    channelBatchText: '批次打款 (Batch Payout)',
    yesText: '是 (YES)',
    noText: '否 (NO)'
  },
  en: {
    sheetSummary: (m) => `${m} Attendance Summary`,
    sheetMatrix: (m) => `${m} Calendar Matrix`,
    sheetDetail: 'Daily Punch Log Details',
    colPicName: 'Consultant / PIC',
    colEmail: 'Registered Email',
    colTotalWorkDays: 'Month Working Days',
    colElapsedWorkDays: 'Expected Days (To Date)',
    colPresentDays: 'Days Present',
    colOfficeDays: 'Office Days',
    colWfhDays: '🏠 WFH Days',
    colLeaveDays: 'Leave Days',
    colCompliantDays: 'Compliant Shifts',
    colViolations: 'Violations / Late',
    colMissedAnomalies: 'Missed / Anomalies',
    colAttendanceRate: 'Attendance Rate (%)',
    colComplianceRate: 'Shift Compliance (%)',
    colDate: 'Date',
    colWeekday: 'Day',
    colFirstIn: 'First Clock-In (In)',
    colLunchOut: 'Lunch Out',
    colLunchIn: 'Lunch In',
    colShift: 'Assigned Shift',
    colCutoff: 'Mandatory Cutoff',
    colLastOut: 'Actual Clock-Out (Out)',
    colDuration: 'Hours Worked (h)',
    colComplianceStatus: 'Compliance Status',
    colVerifyMethod: 'Verification Method',
    colNotes: 'Credentials & Notes',
    defaultPic: 'Advisor',
    unassignedShift: 'Unassigned Shift',
    methodWfh: 'Work From Home (WFH)',
    methodWifi: 'Office Wi-Fi',
    methodGps: 'GPS Geofence',
    methodAdminManual: 'Admin Manual Entry',
    methodLeave: 'On Leave',
    leaveMatrixShort: { ANNUAL: 'AL', SICK: 'MC', EMERGENCY: 'EL', UNPAID: 'UL', OTHER: 'Leave' },
    manualAuditNoteText: (name, reason) => `[Admin Manual Entry: Added by ${name || 'Admin'}${reason ? ' - ' + reason : ''}]`,
    methodRegular: 'Standard Check-in',
    weekendRest: 'OFF',
    absentDash: '—',
    missedOutShort: 'No Out',
    inProgressShort: 'On Duty',
    lateShort: 'Late',
    punchInLabel: 'In',
    punchOutLabel: 'Out',
    punchLunchOutLabel: 'LunchOut',
    punchLunchInLabel: 'LunchIn',
    allPunchesPrefix: 'All Punches',
    geofenceTag: 'Geofence',
    manualPunchTag: ' (Manual)',
    defaultAdminName: 'Admin',
    weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    sheetAttendanceMatrix: (m) => `Attendance Sheet - ${m}`,
    sheetAttendanceLogs: 'Clock-in & Clock-out Audit Log',
    titleBannerText: (m, y) => `Attendance Sheet for ${m} - ${y}`,
    lblMonth: 'Month:',
    lblYear: 'Year:',
    legendLabel: 'Legend:',
    legendNormal: '✔ Normal',
    legendLate: 'L Late',
    legendEarly: 'E Early',
    legendLateEarly: 'LE Late & Early',
    legendMissed: '? Missed',
    legendLeave: 'AL/MC Leave',
    legendUnpunched: '✖ Absent',
    legendMia: 'MIA Absent',
    legendWeekend: 'OFF Weekend',
    colEmpId: 'Employee ID',
    colEmpName: 'Employee Name',
    colShiftName: 'Assigned Shift',
    colSummaryPresent: 'Days Present',
    colSummaryLeave: 'Leave Days',
    colSummaryLateEarly: 'Late / Early',
    colSummaryMissed: 'Missed Punches',
    colSummaryMia: 'MIA / Absent',
    colSummaryRate: 'Attendance Rate (%)',
    statusNormalCode: '✔',
    statusLateCode: 'L',
    statusEarlyCode: 'E',
    statusLateEarlyCode: 'LE',
    statusMissedCode: '?',
    statusUnpunchedCode: '✖',
    statusMiaCode: 'MIA',
    statusWeekendCode: 'OFF',
    commentIn: 'Clock-In',
    commentOut: 'Clock-Out',
    commentShift: 'Shift',
    commentOverride: 'Override',
    commentManualAdmin: 'Admin Manual Entry',
    commentLeaveDetail: 'Approved Leave',
    commentUnpunched: 'No punch record for working day',
    commentMia: 'Half-day leave unpunched / Unexcused MIA',
    emptySheetErr: 'Export content is empty — no valid sheet found',
    sheetCommSummary: (m) => `${m} Commission Summary`,
    sheetCommDetail: 'Deals & Guarantee Risk Details',
    colDealsCount: 'Deals Count',
    colPendingComm: 'In Guarantee (RM)',
    colUnlockedComm: 'Ready for Payout (RM)',
    colTotalGrossComm: 'Total Commission (RM)',
    colCandidateName: 'Candidate Name',
    colCompanyName: 'Client Company',
    colPosition: 'Position',
    colOnboardDate: 'Onboard Date',
    colGuaranteeDays: 'Guarantee Days',
    colUnlockDate: 'Unlock Date',
    colBillingMode: 'Billing Mode',
    colTotalPool: 'Total Pool (RM)',
    colSplitsDetail: 'Splits Breakdown',
    colDealStatus: 'Deal Status',
    colOverrideReason: 'Supervisor Override Reason',
    colCancelReason: 'Clawback / Cancellation Reason',
    statusCancelled: 'Cancelled',
    statusUnlocked: 'Unlocked',
    statusPending: 'In Guarantee',
    sheetClaimsSummary: (m) => `${m} Claims & Payroll Summary`,
    sheetClaimsLedger: 'Claims & Approval Ledger',
    sheetClaimsDetail: 'Line Items & Mileage Details',
    colClaimsCount: 'Claims Count',
    colClaimsTotal: 'Total Claimed (MYR)',
    colPayrollApproved: 'Approved for Payroll (MYR)',
    colBatchPaid: 'Paid via Batch (MYR)',
    colReviewingAmt: 'In-Review Amount (MYR)',
    colWarningCount: 'Policy Warnings',
    colClaimId: 'Claim ID',
    colClaimTitle: 'Claim Title',
    colClaimMonth: 'Claim Month',
    colApplicant: 'Applicant (PIC)',
    colItemsCount: 'Items Count',
    colPayoutChannel: 'Payout Channel',
    colCurrentStatus: 'Status',
    colManagerReviewer: 'Manager Reviewer',
    colManagerReviewTime: 'Manager Review Time',
    colFinanceReviewer: 'Finance Reviewer',
    colFinanceReviewTime: 'Finance Review Time',
    colRejectReason: 'Rejection Reason',
    colCategory: 'Category',
    colExpenseDate: 'Expense Date',
    colMerchantRoute: 'Merchant / Route',
    colInvoiceNo: 'Invoice No.',
    colVehicleType: 'Vehicle',
    colDistanceKm: 'Distance (KM)',
    colTollAmt: 'Toll Fees (MYR)',
    colParkingAmt: 'Parking (MYR)',
    colLineAmount: 'Line Amount (MYR)',
    colTaxAmt: 'Tax (SST)',
    colOcrFlag: 'AI OCR',
    colWarnings: 'Warning Tags',
    colLineNotes: 'Item Notes',
    defaultOverrideReason: 'Supervisor Override',
    channelPayrollText: 'Payroll',
    channelBatchText: 'Batch Payout',
    yesText: 'YES',
    noText: 'NO'
  }
};

/**
 * 将 Date 对象安全格式化为 'YYYY-MM-DD'（纯数字拼接，100% 独立于系统与浏览器 locale）
 */
export function toIsoDateStr(dateObj) {
  if (!dateObj || isNaN(dateObj.getTime())) return '';
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 将 Date 对象格式化为 'HH:mm'
 */
export function toShortTimeStr(dateObj) {
  if (!dateObj || isNaN(dateObj.getTime())) return '';
  const hh = String(dateObj.getHours()).padStart(2, '0');
  const mm = String(dateObj.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * 解析任意格式的月份输入（如 '2026-10', '2026年10月', '2026/10'）为纯数字年月
 */
export function parseTargetYearMonth(monthStr) {
  const now = new Date();
  if (monthStr) {
    const nums = String(monthStr).match(/\d+/g);
    if (nums && nums.length >= 2) {
      const n0 = parseInt(nums[0], 10);
      const n1 = parseInt(nums[1], 10);
      const year = n0 >= 1970 ? n0 : n1;
      const month = n0 >= 1970 ? n1 : n0;
      if (year >= 2000 && month >= 1 && month <= 12) {
        return {
          year,
          month,
          formatted: `${year}-${String(month).padStart(2, '0')}`
        };
      }
    }
  }
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return {
    year: y,
    month: m,
    formatted: `${y}-${String(m).padStart(2, '0')}`
  };
}

/**
 * 计算当月日历元数据、自然工作日总数与截止今日已过工作日
 */
export function getMonthCalendarMeta(year, month) {
  const todayStr = toIsoDateStr(new Date());
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = [];
  let totalWorkingDays = 0;
  let elapsedWorkingDays = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month - 1, d);
    const dateStr = toIsoDateStr(dateObj);
    const dayOfWeek = dateObj.getDay(); // 0: Sun, 6: Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isPastOrToday = dateStr <= todayStr;

    if (!isWeekend) {
      totalWorkingDays += 1;
      if (isPastOrToday) {
        elapsedWorkingDays += 1;
      }
    }
    days.push({
      year,
      month,
      day: d,
      dateStr,
      dayOfWeek,
      isWeekend,
      isPastOrToday
    });
  }

  return {
    days,
    totalWorkingDays,
    elapsedWorkingDays: Math.max(elapsedWorkingDays, 1),
    todayStr
  };
}

/**
 * 智能中英文双宽列宽自适应算法 (Auto-Fit Column Widths)
 * 中文字符计 2.1 宽，ASCII 字符计 1.1 宽，外加 4 字符边距，彻底杜绝表头被切
 */
export function computeAutoColWidths(headers = [], rows = []) {
  const calcDisplayLen = (val) => {
    const str = String(val ?? '');
    let len = 0;
    for (let i = 0; i < str.length; i++) {
      len += str.charCodeAt(i) > 255 ? 2.1 : 1.1;
    }
    return Math.ceil(len);
  };

  return headers.map((h, colIdx) => {
    let maxWch = calcDisplayLen(h);
    rows.forEach(r => {
      if (r && r[colIdx] !== undefined) {
        const w = calcDisplayLen(r[colIdx]);
        if (w > maxWch) maxWch = w;
      }
    });
    return Math.min(Math.max(maxWch + 4, 12), 55);
  });
}

/**
 * CSV / Excel 公式注入清洗器 (Formula Injection Sanitizer)
 * 若单元格为字符串且以 =, +, -, @ 开头，自动拼接前置单引号 '
 */
export function sanitizeExcelValue(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number' || typeof val === 'boolean') return val;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '-';
    return toIsoDateStr(val) + ' ' + val.toTimeString().split(' ')[0];
  }
  const str = String(val).trim();
  // 放行单独的短横杠/破折号占位符，防止 Excel 单元格显示为 "'-"
  if (str === '-' || str === '—' || str === '--') {
    return str;
  }
  if (/^[=+@-]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

/**
 * 对同一天同一人的打卡事件按时间升序排列并消除双写重复（attendance 与 logs 集合在 60 秒内的同类型重复记录）
 */
export function deduplicateDayEvents(events = []) {
  if (!Array.isArray(events) || events.length === 0) return [];
  const sorted = [...events]
    .filter(e => e && e.dateObj && !isNaN(e.dateObj.getTime()))
    .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

  const deduped = [];
  for (const evt of sorted) {
    const prev = deduped[deduped.length - 1];
    if (
      prev &&
      prev.type === evt.type &&
      Math.abs(evt.dateObj.getTime() - prev.dateObj.getTime()) < 60 * 1000
    ) {
      // 保留带 verifyMethod / verifySnapshot 更完整的那条
      if (!prev.verifyMethod && evt.verifyMethod) {
        deduped[deduped.length - 1] = evt;
      }
      continue;
    }
    deduped.push(evt);
  }
  return deduped;
}

/**
 * 判断某个账户是否位于免考勤/排除统计名单中
 */
export function isAccountExcluded({ uid = '', email = '', name = '' }, excludedAccounts = []) {
  if (!Array.isArray(excludedAccounts) || excludedAccounts.length === 0) return false;
  const normUid = String(uid || '').trim();
  const normEmail = String(email || '').trim().toLowerCase();
  const normName = String(name || '').trim().toLowerCase();

  return excludedAccounts.some(item => {
    const target = String(item || '').trim();
    if (!target) return false;
    const targetLower = target.toLowerCase();
    return (
      (normUid && normUid === target) ||
      (normEmail && normEmail === targetLower) ||
      (normName && normName === targetLower)
    );
  });
}

/**
 * 纯原生 XML Spreadsheet 2003 生成器 (零第三方依赖多 Sheet 兜底引擎)
 */

/**
 * 考勤状态转视觉编码纯函数 (7大核心状态映射 + 悬浮批注审计生成)
 * 严格执行 Zero-Emoji 纯文本规范与高辨识度无障碍色板
 * @param {object} params
 * @returns {object} { code, category, bgHex, textHex, isBold, styleId, commentText }
 */
export function mapAttendanceVisualState({
  dayLog,
  directLeave,
  dayMeta,
  todayStr,
  locale = 'zh'
}) {
  const isEn = locale === 'en';
  const labels = EXCEL_I18N[locale] || EXCEL_I18N.zh;

  // 1. 周末休息日判定
  if (dayMeta?.isWeekend) {
    if (!dayLog?.analysis?.hasAttendance && !directLeave) {
      return {
        code: labels.statusWeekendCode || (isEn ? 'OFF' : '休'),
        category: 'WEEKEND',
        bgHex: 'F1F5F9',
        textHex: '64748B',
        isBold: false,
        styleId: 'CellWeekend',
        commentText: ''
      };
    }
  }

  // 2. 未来日期时间守卫（严格过滤未发生工作日，防提前污染当期指标）
  if (dayMeta?.dateStr && todayStr && dayMeta.dateStr > todayStr && !dayMeta?.isWeekend) {
    return {
      code: '',
      category: 'FUTURE',
      bgHex: '',
      textHex: '',
      isBold: false,
      styleId: 'CellEmpty',
      commentText: ''
    };
  }

  // 3. 全天获批休假（无打卡，或 isOnFullLeave）
  const isFullLeave = (directLeave && directLeave.durationType === 'FULL_DAY') || Boolean(dayLog?.analysis?.isOnFullLeave);
  if (isFullLeave && (!dayLog || !dayLog.analysis?.hasAttendance || dayLog.analysis?.isOnFullLeave)) {
    const lType = directLeave?.leaveType || dayLog?.leaveRecord?.leaveType || 'LEAVE';
    const shortCode = labels.leaveMatrixShort?.[lType] || (isEn ? 'AL' : '假');
    const reason = directLeave?.reason || dayLog?.leaveRecord?.reason || '';
    const comment = `[${labels.commentLeaveDetail}: ${lType}${reason ? ' - ' + reason : ''}]`;
    return {
      code: shortCode,
      category: 'LEAVE',
      bgHex: 'CCFBF1',
      textHex: '115E59',
      isBold: true,
      styleId: 'CellLeave',
      commentText: comment
    };
  }

  // 3.5 失联旷工 / 半天假零打卡旷工 (MIA)
  // 当员工获批半天假但全天零打卡被 CascadeShiftEngine 裁定为旷工，或无故失联旷工时，统一触发炭黑底白字 MIA（旷）
  const isMiaAbsent = Boolean(
    dayLog?.analysis?.compliance === 'ABSENT' ||
    dayLog?.analysis?.isMia
  );
  if (isMiaAbsent) {
    const a = dayLog?.analysis || {};
    const commentLines = [labels.commentMia || (isEn ? 'Half-day leave unpunched / Unexcused MIA' : '半天假全天无打卡旷工 / 旷工')];
    if (a.note) commentLines.push(a.note);
    if (directLeave) commentLines.push(`[${labels.commentLeaveDetail}: ${directLeave.leaveType || ''}${directLeave.reason ? ' - ' + directLeave.reason : ''}]`);
    return {
      code: labels.statusMiaCode || (isEn ? 'MIA' : '旷'),
      category: 'MIA',
      bgHex: '1E293B',
      textHex: 'FFFFFF',
      isBold: true,
      styleId: 'CellMia',
      commentText: commentLines.join('\n').trim()
    };
  }

  // 4. 当天有打卡记录
  if (dayLog && dayLog.analysis?.hasAttendance) {
    const a = dayLog.analysis;
    const inTime = a.clockInStr && a.clockInStr !== '-' && a.clockInStr !== labels.notClocked ? a.clockInStr.slice(0, 5) : '';
    const outTime = a.clockOutStr && a.clockOutStr !== '-' && a.clockOutStr !== labels.notClocked ? a.clockOutStr.slice(0, 5) : '';

    // 构建审计悬浮批注
    const commentLines = [];
    if (inTime) commentLines.push(`${labels.commentIn}: ${inTime}`);
    if (outTime) commentLines.push(`${labels.commentOut}: ${outTime}`);
    if (a.shift?.name) commentLines.push(`${labels.commentShift}: ${a.shift.name}`);
    if (a.shift?.isOverridden) commentLines.push(`[${labels.commentOverride}: ${a.shift.overrideReason || labels.defaultOverrideReason || '主管调整'}]`);
    if (dayLog.manualEntry) commentLines.push(`[${labels.commentManualAdmin}: ${dayLog.manualEntry.addedByName || labels.defaultAdminName || '管理员'}${dayLog.manualEntry.reason ? ' - ' + dayLog.manualEntry.reason : ''}]`);
    if (directLeave) commentLines.push(`[${labels.commentLeaveDetail}: ${directLeave.leaveType || ''}${directLeave.reason ? ' - ' + directLeave.reason : ''}]`);
    const commentText = commentLines.join('\n');

    // 4.2 既迟到又早退
    if (a.compliance === 'LATE_AND_EARLY') {
      return {
        code: labels.statusLateEarlyCode || (isEn ? 'LE' : '迟早'),
        category: 'LATE_AND_EARLY',
        bgHex: 'FFEDD5',
        textHex: '9A3412',
        isBold: true,
        styleId: 'CellLateEarly',
        commentText
      };
    }

    // 4.3 忘记打卡（单边缺卡）
    if (a.isMissingPunch || a.compliance === 'MISSED_OUT' || a.compliance === 'MISSED_IN') {
      return {
        code: labels.statusMissedCode || (isEn ? '?' : '漏'),
        category: 'MISSED',
        bgHex: 'FEF08A',
        textHex: '1E293B',
        isBold: true,
        styleId: 'CellMissing',
        commentText
      };
    }

    // 4.4 违规早退
    if (a.compliance === 'EARLY_LEAVE') {
      return {
        code: labels.statusEarlyCode || (isEn ? 'E' : '早'),
        category: 'EARLY',
        bgHex: 'FFEDD5',
        textHex: '9A3412',
        isBold: false,
        styleId: 'CellEarly',
        commentText
      };
    }

    // 4.5 上班迟到
    if (a.compliance === 'LATE' || a.isLate) {
      return {
        code: labels.statusLateCode || (isEn ? 'L' : '迟'),
        category: 'LATE',
        bgHex: 'FEF3C7',
        textHex: '92400E',
        isBold: false,
        styleId: 'CellLate',
        commentText
      };
    }

    // 4.6 半天假复合状态拼接
    if (a.isHalfAm || directLeave?.durationType === 'HALF_AM') {
      const punchCode = a.isLate ? (isEn ? 'L' : '迟') : '✔';
      return {
        code: `AM${punchCode}`,
        category: 'HALF_LEAVE',
        bgHex: 'CCFBF1',
        textHex: '115E59',
        isBold: true,
        styleId: 'CellLeave',
        commentText
      };
    }
    if (a.isHalfPm || directLeave?.durationType === 'HALF_PM') {
      const punchCode = a.isLate ? (isEn ? 'L' : '迟') : '✔';
      return {
        code: `PM${punchCode}`,
        category: 'HALF_LEAVE',
        bgHex: 'CCFBF1',
        textHex: '115E59',
        isBold: true,
        styleId: 'CellLeave',
        commentText
      };
    }

    // 4.7 正常上下班
    return {
      code: labels.statusNormalCode || '✔',
      category: 'NORMAL',
      bgHex: 'DCFCE7',
      textHex: '166534',
      isBold: true,
      styleId: 'CellNormal',
      commentText
    };
  }

  // 5. 过去工作日，零打卡且无请假单
  if (dayMeta?.dateStr && todayStr && dayMeta.dateStr <= todayStr && !dayMeta?.isWeekend) {
    return {
      code: labels.statusUnpunchedCode || '✖',
      category: 'UNPUNCHED',
      bgHex: 'FEE2E2',
      textHex: '991B1B',
      isBold: true,
      styleId: 'CellUnpunched',
      commentText: labels.commentUnpunched || (isEn ? 'No punch record' : '全天无打卡记录')
    };
  }

  // 6. 兜底空
  return {
    code: '',
    category: 'NONE',
    bgHex: '',
    textHex: '',
    isBold: false,
    styleId: 'CellEmpty',
    commentText: ''
  };
}


function buildXmlSpreadsheet(sheets) {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Borders/>
   <Font ss:FontName="Segoe UI" x:CharSet="134" ss:Size="10" ss:Color="#1E293B"/>
   <Interior/>
   <NumberFormat/>
   <Protection/>
  </Style>
  <!-- 主标题横幅: 深海蓝 #1E40AF 白字加粗 -->
  <Style ss:ID="BannerTitle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI" x:CharSet="134" ss:Size="14" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#1E40AF" ss:Pattern="Solid"/>
  </Style>
  <!-- 元数据标签与高亮值 -->
  <Style ss:ID="MetaLabel">
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI" x:CharSet="134" ss:Size="10" ss:Color="#1E293B" ss:Bold="1"/>
  </Style>
  <Style ss:ID="MetaValue">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI" x:CharSet="134" ss:Size="10" ss:Color="#1E40AF" ss:Bold="1"/>
   <Interior ss:Color="#EFF6FF" ss:Pattern="Solid"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#93C5FD"/></Borders>
  </Style>
  <!-- 主表头: 左侧固定列 深灰蓝 #1E293B 白字加粗 -->
  <Style ss:ID="HeaderLeftDark">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#475569"/>
   </Borders>
   <Font ss:FontName="Segoe UI" x:CharSet="134" ss:Size="10" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#1E293B" ss:Pattern="Solid"/>
  </Style>
  <!-- 主表头: 中间动态日期列 90度竖排旋转 (压缩列宽) -->
  <Style ss:ID="HeaderRotatedDate">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:Rotate="90"/>
   <Borders>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
   <Font ss:FontName="Segoe UI" x:CharSet="134" ss:Size="9" ss:Color="#1E293B" ss:Bold="1"/>
   <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
  </Style>
  <!-- 主表头: 右侧汇总列 深森林绿 #15803D 白字加粗 -->
  <Style ss:ID="HeaderRightGreen">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#166534"/>
   </Borders>
   <Font ss:FontName="Segoe UI" x:CharSet="134" ss:Size="10" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#15803D" ss:Pattern="Solid"/>
  </Style>
  <!-- 默认通用表头 -->
  <Style ss:ID="HeaderStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
   <Font ss:FontName="Segoe UI" x:CharSet="134" ss:Size="10" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#1E293B" ss:Pattern="Solid"/>
  </Style>
  <!-- 7大考勤状态高对比度冷暖撞色色板 -->
  <!-- 1. 正常上下班: 浅绿底 #DCFCE7 / 深绿字 #166534 -->
  <Style ss:ID="CellNormal">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders>
   <Font ss:FontName="Segoe UI" x:CharSet="134" ss:Size="10" ss:Color="#166534" ss:Bold="1"/>
   <Interior ss:Color="#DCFCE7" ss:Pattern="Solid"/>
  </Style>
  <!-- 2. 迟上班: 浅黄底 #FEF3C7 / 深琥珀字 #92400E -->
  <Style ss:ID="CellLate">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders>
   <Font ss:FontName="Segoe UI" x:CharSet="134" ss:Size="10" ss:Color="#92400E" ss:Bold="1"/>
   <Interior ss:Color="#FEF3C7" ss:Pattern="Solid"/>
  </Style>
  <!-- 3. 早下班: 浅橘底 #FFEDD5 / 深橘字 #9A3412 -->
  <Style ss:ID="CellEarly">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders>
   <Font ss:FontName="Segoe UI" x:CharSet="134" ss:Size="10" ss:Color="#9A3412" ss:Bold="1"/>
   <Interior ss:Color="#FFEDD5" ss:Pattern="Solid"/>
  </Style>
  <!-- 3.1 既迟到又早退: 浅橘底 #FFEDD5 / 深橘加粗 -->
  <Style ss:ID="CellLateEarly">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders>
   <Font ss:FontName="Segoe UI" x:CharSet="134" ss:Size="10" ss:Color="#9A3412" ss:Bold="1"/>
   <Interior ss:Color="#FFEDD5" ss:Pattern="Solid"/>
  </Style>
  <!-- 4. 忘记打卡: 明黄底 #FEF08A / 炭黑字 #1E293B 加粗 -->
  <Style ss:ID="CellMissing">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders>
   <Font ss:FontName="Segoe UI" x:CharSet="134" ss:Size="10" ss:Color="#1E293B" ss:Bold="1"/>
   <Interior ss:Color="#FEF08A" ss:Pattern="Solid"/>
  </Style>
  <!-- 5. 获批休假: 薄荷青底 #CCFBF1 / 深青字 #115E59 加粗 -->
  <Style ss:ID="CellLeave">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders>
   <Font ss:FontName="Segoe UI" x:CharSet="134" ss:Size="9" ss:Color="#115E59" ss:Bold="1"/>
   <Interior ss:Color="#CCFBF1" ss:Pattern="Solid"/>
  </Style>
  <!-- 6. 没有打卡: 浅红底 #FEE2E2 / 深红字 #991B1B 加粗 -->
  <Style ss:ID="CellUnpunched">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders>
   <Font ss:FontName="Segoe UI" x:CharSet="134" ss:Size="10" ss:Color="#991B1B" ss:Bold="1"/>
   <Interior ss:Color="#FEE2E2" ss:Pattern="Solid"/>
  </Style>
  <!-- 7. 失联旷工: 炭黑底 #1E293B / 纯白字 #FFFFFF 加粗 -->
  <Style ss:ID="CellMia">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders>
   <Font ss:FontName="Segoe UI" x:CharSet="134" ss:Size="9" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#1E293B" ss:Pattern="Solid"/>
  </Style>
  <!-- 周末休息: 柔和灰底 #F1F5F9 / 字色 #64748B -->
  <Style ss:ID="CellWeekend">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders>
   <Font ss:FontName="Segoe UI" x:CharSet="134" ss:Size="9" ss:Color="#64748B"/>
   <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
  </Style>
  <!-- 空单元格 (未发生未来工作日) -->
  <Style ss:ID="CellEmpty">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders>
  </Style>
  <!-- 汇总数据单元格: 居中加粗 -->
  <Style ss:ID="SummaryCellNumber">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders>
   <Font ss:FontName="Segoe UI" x:CharSet="134" ss:Size="10" ss:Color="#15803D" ss:Bold="1"/>
  </Style>
  <!-- 左侧固定信息单元格 -->
  <Style ss:ID="CellLeftText">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/></Borders>
   <Font ss:FontName="Segoe UI" x:CharSet="134" ss:Size="10" ss:Color="#1E293B"/>
  </Style>
  <!-- 流水异常样式 -->
  <Style ss:ID="ViolationStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI" x:CharSet="134" ss:Size="10" ss:Color="#DC2626" ss:Bold="1"/>
  </Style>
  <Style ss:ID="CompliantStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Segoe UI" x:CharSet="134" ss:Size="10" ss:Color="#059669" ss:Bold="1"/>
  </Style>
 </Styles>`;

  for (const sheet of sheets) {
    const cleanName = (sheet.name || 'Sheet').replace(/[:\\/?*\[\]]/g, '_').slice(0, 31);
    xml += `\n <Worksheet ss:Name="${cleanName}">\n  <Table ss:DefaultRowHeight="22">`;

    // 1. 列宽设定
    if (Array.isArray(sheet.customCols) && sheet.customCols.length > 0) {
      sheet.customCols.forEach(col => {
        const px = Math.min(Math.max((col.wch || 10) * 7.5, 32), 400);
        xml += `\n   <Column ss:AutoFitWidth="0" ss:Width="${Math.round(px)}"/>`;
      });
    } else {
      const autoWchs = computeAutoColWidths(sheet.headers || [], sheet.rows || []);
      autoWchs.forEach(wch => {
        const pxWidth = Math.min(Math.max(wch * 7.5, 80), 380);
        xml += `\n   <Column ss:AutoFitWidth="0" ss:Width="${Math.round(pxWidth)}"/>`;
      });
    }

    // 2. 表头行（针对 Sheet 2 等普通表格）
    if (Array.isArray(sheet.headers) && sheet.headers.length > 0) {
      xml += `\n   <Row ss:Height="26">`;
      for (const h of sheet.headers) {
        const safeH = String(h).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        xml += `\n    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">${safeH}</Data></Cell>`;
      }
      xml += `\n   </Row>`;
    }

    // 3. 数据行渲染（支持普通单元格与对象单元格）
    if (Array.isArray(sheet.rows)) {
      for (const row of sheet.rows) {
        xml += `\n   <Row>`;
        for (const cell of row) {
          // 判断单元格类型
          const isObj = cell && typeof cell === 'object' && !(cell instanceof Date);
          const rawVal = isObj ? cell.val : cell;
          const val = sanitizeExcelValue(rawVal);
          const customStyleId = isObj ? cell.styleId : null;
          const mergeAttr = (isObj && cell.mergeAcross) ? ` ss:MergeAcross="${cell.mergeAcross}"` : '';

          let commentXml = '';
          if (isObj && cell.comment) {
            const safeComment = String(cell.comment)
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/\n/g, '&#10;');
            commentXml = `<Comment ss:Author="TalentFlow"><ss:Data xmlns="http://www.w3.org/TR/REC-html40"><Font html:Size="9" html:Color="#1E293B">${safeComment}</Font></ss:Data></Comment>`;
          }

          const isNum = typeof val === 'number' && !isNaN(val);
          const isViolation = typeof val === 'string' && (val.includes('❌') || val.includes('违规') || val.includes('早退') || val.includes('Violation') || val.includes('Late') || val.includes('Early'));
          const isCompliant = typeof val === 'string' && val.includes('✅');

          const finalStyle = customStyleId
            ? ` ss:StyleID="${customStyleId}"`
            : isViolation
              ? ' ss:StyleID="ViolationStyle"'
              : isCompliant
                ? ' ss:StyleID="CompliantStyle"'
                : '';

          if (isNum) {
            xml += `\n    <Cell${finalStyle}${mergeAttr}><Data ss:Type="Number">${val}</Data>${commentXml}</Cell>`;
          } else {
            const escaped = String(val)
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;');
            xml += `\n    <Cell${finalStyle}${mergeAttr}><Data ss:Type="String">${escaped}</Data>${commentXml}</Cell>`;
          }
        }
        xml += `\n   </Row>`;
      }
    }

    xml += `\n  </Table>`;

    // 4. 工作表窗口冻结选项 (Freeze Panes)
    if (sheet.freezePanes) {
      const splitH = sheet.freezePanes.splitHorizontal || 0;
      const splitV = sheet.freezePanes.splitVertical || 0;
      xml += `\n  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <FreezePanes/>
   <FrozenNoSplit/>
   <SplitHorizontal>${splitH}</SplitHorizontal>
   <TopRowBottomPane>${splitH}</TopRowBottomPane>
   <SplitVertical>${splitV}</SplitVertical>
   <LeftColumnRightPane>${splitV}</LeftColumnRightPane>
   <ActivePane>0</ActivePane>
  </WorksheetOptions>`;
    }

    xml += `\n </Worksheet>`;
  }

  xml += `\n</Workbook>`;
  return xml;
}

export const ExcelExporter = {
  async exportWorkbook({ filename = 'Export.xlsx', sheets = [], locale = 'zh' }) {
    const labels = EXCEL_I18N[locale] || EXCEL_I18N.zh;
    if (!sheets || sheets.length === 0) {
      throw new Error(labels.emptySheetErr);
    }

    // 优先尝试使用 xlsx 库导出原生 .xlsx
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      sheets.forEach(sheet => {
        const sheetData = [];
        if (sheet.headers && sheet.headers.length > 0) {
          sheetData.push(sheet.headers.map(sanitizeExcelValue));
        }
        if (sheet.rows) {
          sheet.rows.forEach(r => {
            const rowVals = r.map(c => {
              const raw = c && typeof c === 'object' && !(c instanceof Date) ? c.val : c;
              return sanitizeExcelValue(raw);
            });
            sheetData.push(rowVals);
          });
        }
        const ws = XLSX.utils.aoa_to_sheet(sheetData);

        // 应用列宽
        if (sheet.customCols && sheet.customCols.length > 0) {
          ws['!cols'] = sheet.customCols;
        } else {
          const autoWchs = computeAutoColWidths(sheet.headers || [], sheet.rows || []);
          ws['!cols'] = autoWchs.map(wch => ({ wch }));
        }

        // 应用单元格合并
        if (sheet.merges && sheet.merges.length > 0) {
          ws['!merges'] = sheet.merges;
        }

        // 应用冻结窗格
        if (sheet.freezePanes) {
          ws['!views'] = [{
            state: 'frozen',
            xSplit: sheet.freezePanes.splitVertical || 0,
            ySplit: sheet.freezePanes.splitHorizontal || 0
          }];
        }

        // 注入单元格悬浮批注 (Comments)
        if (sheet.rows) {
          sheet.rows.forEach((r, rIdx) => {
            r.forEach((c, cIdx) => {
              if (c && typeof c === 'object' && c.comment) {
                const cellRef = XLSX.utils.encode_cell({ r: rIdx, c: cIdx });
                if (!ws[cellRef]) {
                  ws[cellRef] = { t: 's', v: String(c.val || '') };
                }
                ws[cellRef].c = [{
                  a: 'TalentFlow',
                  t: String(c.comment)
                }];
              }
            });
          });
        }

        const safeSheetName = (sheet.name || 'Sheet').replace(/[:\\/?*\[\]]/g, '_').slice(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
      });

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      triggerBrowserDownload(blob, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
      return;
    } catch (importErr) {
      console.warn('XLSX dynamic import fallback to XML Spreadsheet:', importErr);
    }

    // 容错回退：生成高保真原生 UTF-8 XML 多 Sheet 电子表格
    const xmlContent = buildXmlSpreadsheet(sheets);
    const blob = new Blob([xmlContent], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const fallbackFilename = filename.replace(/\.xlsx$/i, '.xls');
    triggerBrowserDownload(blob, fallbackFilename.endsWith('.xls') ? fallbackFilename : `${fallbackFilename}.xls`);
  },

  /**
   * 汇聚并生成内部员工考勤报表数据（重构为 Sheet 1 紧凑日历矩阵与月度总账 + Sheet 2 打卡审计流水明细 双表架构）
   * @param {object} params
   */
  buildAttendanceReportData({
    monthStr = '2026-10',
    attendanceEvents = [],
    hqMembers = [],
    shiftConfig = null,
    shiftOverrides = {},
    excludedAccounts = [],
    hideZeroAttendance = false,
    attendanceLeaves = [],
    locale = 'zh'
  }) {
    const isEn = locale === 'en';
    const labels = EXCEL_I18N[locale] || EXCEL_I18N.zh;

    // 1. 规范化月份并提取日历元数据
    const { year, month, formatted: formattedMonth } = parseTargetYearMonth(monthStr);
    const meta = getMonthCalendarMeta(year, month);

    // 2. 严格按纯数字年份与月份过滤打卡事件，并按日期+顾问标准身份聚合
    const dailyMap = {};

    attendanceEvents.forEach(evt => {
      const ts = evt.timestamp || evt.createdAt;
      const dateObj = CascadeShiftEngine.toSafeDate(ts);
      if (!dateObj) return;

      if (dateObj.getFullYear() !== year || (dateObj.getMonth() + 1) !== month) return;
      const dStr = toIsoDateStr(dateObj);

      const rawPic = evt.picName || evt.userName || evt.user?.displayName || (evt.userEmail ? evt.userEmail.split('@')[0] : labels.defaultPic);
      const rawUid = evt.userId || evt.user?.uid || '';
      const canonical = resolveCanonicalPic(rawPic, rawUid, hqMembers);
      const picName = canonical.displayName || rawPic;
      const userId = canonical.uid || rawUid || canonical.key || picName;
      const userEmail = evt.userEmail || evt.user?.email || '';

      if (isAccountExcluded({ uid: userId, email: userEmail, name: picName }, excludedAccounts)) {
        return;
      }

      const key = `${dStr}__${userId}`;

      if (!dailyMap[key]) {
        dailyMap[key] = {
          dateStr: dStr,
          dateObj,
          userId,
          picName,
          userEmail,
          events: [],
          verifyMethod: evt.verifyMethod || '',
          verifySnapshot: evt.verifySnapshot || null
        };
      }
      if (userEmail && !dailyMap[key].userEmail) {
        dailyMap[key].userEmail = userEmail;
      }
      dailyMap[key].events.push({
        ...evt,
        dateObj,
        type: evt.type || evt.action || 'CLOCK_IN'
      });
      if (evt.manualEntry) {
        dailyMap[key].manualEntry = evt.manualEntry;
      }
      if (evt.isManualEntry) {
        dailyMap[key].isManualEntry = true;
      }
      if (evt.verifyMethod && !dailyMap[key].verifyMethod) {
        dailyMap[key].verifyMethod = evt.verifyMethod;
        dailyMap[key].verifySnapshot = evt.verifySnapshot;
      }
    });

    // 2.1 注入经审批通过的请假记录（严格时间守卫：过滤未来大于今天的预批假）
    const approvedLeaves = (attendanceLeaves || []).filter(l => l && l.status === 'APPROVED');
    approvedLeaves.forEach(leave => {
      const sDate = String(leave.startDate || '').trim();
      const eDate = String(leave.endDate || sDate).trim();
      if (!sDate) return;

      const rawPic = leave.picName || leave.userName || (leave.userEmail ? leave.userEmail.split('@')[0] : labels.defaultPic);
      const rawUid = leave.userId || '';
      const canonical = resolveCanonicalPic(rawPic, rawUid, hqMembers);
      const picName = canonical.displayName || rawPic;
      const userId = canonical.uid || rawUid || canonical.key || picName;
      const userEmail = leave.userEmail || '';

      if (isAccountExcluded({ uid: userId, email: userEmail, name: picName }, excludedAccounts)) {
        return;
      }

      meta.days.forEach(dayMeta => {
        const dStr = dayMeta.dateStr;
        // 核心红线 2：严格过滤大于今天的未来预批假单
        if (dStr <= meta.todayStr && dStr >= sDate && dStr <= eDate) {
          const key = `${dStr}__${userId}`;
          if (!dailyMap[key]) {
            dailyMap[key] = {
              dateStr: dStr,
              dateObj: new Date(dayMeta.year, dayMeta.month - 1, dayMeta.day, 9, 0, 0),
              userId,
              picName,
              userEmail,
              isWeekend: Boolean(dayMeta.isWeekend),
              events: [],
              verifyMethod: 'LEAVE',
              verifySnapshot: null
            };
          }
        }
      });
    });

    // 3. 应用 CascadeShiftEngine 判定
    const dailyLogs = Object.values(dailyMap).map(day => {
      const cleanEvents = deduplicateDayEvents(day.events);
      day.events = cleanEvents;

      const overrideKey = `${day.dateStr}__${day.picName}`;
      const overrideKeyUid = `${day.dateStr}__${day.userId}`;
      const overrideShift = (shiftOverrides && (shiftOverrides[overrideKey] || shiftOverrides[overrideKeyUid])) || null;
      const isToday = day.dateStr === meta.todayStr;

      const leaveRecord = CascadeShiftEngine.findActiveLeaveForDate(
        attendanceLeaves,
        day.userId,
        day.userEmail,
        day.picName,
        day.dateStr
      );

      const res = CascadeShiftEngine.resolveDailyShift(cleanEvents, shiftConfig, {
        locale,
        overrideShift,
        isToday,
        leaveRecord
      });

      const lunchOutEvt = cleanEvents.find(e => e.type === 'LUNCH_OUT');
      const lunchInEvt = cleanEvents.find(e => e.type === 'LUNCH_IN');
      const lunchOutStr = lunchOutEvt ? toShortTimeStr(lunchOutEvt.dateObj) : '-';
      const lunchInStr = lunchInEvt ? toShortTimeStr(lunchInEvt.dateObj) : '-';

      return {
        ...day,
        leaveRecord,
        analysis: res,
        lunchOutStr,
        lunchInStr
      };
    });

    // 排序
    dailyLogs.sort((a, b) => a.dateStr.localeCompare(b.dateStr) || a.picName.localeCompare(b.picName));

    // 4. 汇总统计映射
    const memberSummaryMap = {};
    const defaultShiftName = (shiftConfig?.shifts && shiftConfig.shifts[0]?.name) || 'Shift C (08:30 - 17:30)';

    hqMembers.forEach((m, idx) => {
      const canonical = resolveCanonicalPic(m.displayName || m.name || '', m.id || m.uid || '', hqMembers);
      const uid = m.id || m.uid || canonical.uid || `EMP_${String(idx + 1).padStart(3, '0')}`;
      const name = canonical.displayName || m.displayName || m.name || (m.email ? m.email.split('@')[0] : labels.defaultPic);
      const email = m.email || '';
      const empId = m.empId || m.employeeId || `TF${String(idx + 1).padStart(3, '0')}`;

      if (isAccountExcluded({ uid, email, name }, excludedAccounts)) {
        return;
      }

      memberSummaryMap[uid] = {
        uid,
        empId,
        name,
        email,
        shiftName: defaultShiftName,
        daysPresent: 0,
        officeDays: 0,
        wfhDays: 0,
        leaveDays: 0,
        fullLeaveDaysElapsed: 0,
        compliantDays: 0,
        violationCount: 0,
        missingPunchCount: 0,
        miaCount: 0
      };
    });

    // 统计累加
    dailyLogs.forEach(log => {
      let target = memberSummaryMap[log.userId];
      if (!target && log.userEmail) {
        target = Object.values(memberSummaryMap).find(m => m.email && m.email.toLowerCase() === log.userEmail.toLowerCase());
      }
      if (!target && log.picName) {
        target = Object.values(memberSummaryMap).find(m => m.name && m.name.toLowerCase() === log.picName.toLowerCase());
      }
      if (!target) {
        target = {
          uid: log.userId,
          empId: log.userId.slice(0, 8),
          name: log.picName,
          email: log.userEmail,
          shiftName: log.analysis.shift?.name || defaultShiftName,
          daysPresent: 0,
          officeDays: 0,
          wfhDays: 0,
          leaveDays: 0,
          fullLeaveDaysElapsed: 0,
          compliantDays: 0,
          violationCount: 0,
          missingPunchCount: 0,
          miaCount: 0
        };
        memberSummaryMap[log.userId] = target;
      }

      if (log.analysis.shift?.name && (!target.shiftName || target.shiftName === defaultShiftName)) {
        target.shiftName = log.analysis.shift.name;
      }

      // 请假累计
      if (log.leaveRecord) {
        const isFull = log.leaveRecord.durationType === 'FULL_DAY';
        const addDays = isFull ? 1 : 0.5;
        target.leaveDays = (target.leaveDays || 0) + addDays;
        const dayMeta = meta.days.find(d => d.dateStr === log.dateStr);
        const isWeekend = dayMeta ? dayMeta.isWeekend : (log.dateObj ? (log.dateObj.getDay() === 0 || log.dateObj.getDay() === 6) : false);
        if (isFull && log.dateStr <= meta.todayStr && !isWeekend) {
          target.fullLeaveDaysElapsed = (target.fullLeaveDaysElapsed || 0) + 1;
        }
      }

      if (log.analysis.hasAttendance) {
        target.daysPresent += 1;
        const isWfh = log.verifyMethod === 'WFH' || log.verifySnapshot?.method === 'WFH';
        if (isWfh) target.wfhDays += 1;
        else target.officeDays += 1;

        const isTodayInProgress = (log.dateStr === meta.todayStr) && (log.analysis.isInProgress || log.analysis.compliance === 'IN_PROGRESS');
        if (!isTodayInProgress) {
          target.evaluatedDays = (target.evaluatedDays || 0) + 1;
        }

        if (log.analysis.isCompliant) {
          target.compliantDays += 1;
        }
        if (log.analysis.isViolation || log.analysis.isLate) {
          target.violationCount += 1;
        }
        if (log.analysis.isMissingPunch) {
          target.missingPunchCount += 1;
        }
        if (log.analysis.compliance === 'ABSENT') {
          target.miaCount += 1;
        }
      } else if (log.analysis.compliance === 'ABSENT') {
        target.miaCount += 1;
      }
    });

    const sortedMembers = Object.values(memberSummaryMap)
      .filter(m => !hideZeroAttendance || m.daysPresent > 0 || (m.leaveDays && m.leaveDays > 0))
      .sort((a, b) => {
        if (b.compliantDays !== a.compliantDays) return b.compliantDays - a.compliantDays;
        if (b.daysPresent !== a.daysPresent) return b.daysPresent - a.daysPresent;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });

    // ==========================================
    // 5. 构建 Sheet 1: 可视化考勤日历矩阵 & 月度总账汇总 (Attendance Sheet)
    // ==========================================
    const totalDays = meta.days.length;
    // 总列数: 左侧固定3列 + 中间动态日期列 + 右侧绿色汇总6列
    const totalCols = 3 + totalDays + 6;

    // Row 1: 主标题横幅 (深海蓝 1E40AF 白字加粗)
    const row1Banner = [
      {
        val: labels.titleBannerText(meta.monthName || meta.month, meta.year),
        styleId: 'BannerTitle',
        mergeAcross: totalCols - 1
      }
    ];

    // Row 2: 留白空行
    const row2Blank = [{ val: '', styleId: 'CellEmpty' }];

    // Row 3: 元数据与横向图例条 (7 种考勤状态视觉色块与简短代号)
    const row3MetaAndLegend = [
      { val: labels.lblMonth, styleId: 'MetaLabel' },
      { val: meta.monthName || meta.month, styleId: 'MetaValue' },
      { val: labels.lblYear, styleId: 'MetaLabel' },
      { val: String(meta.year), styleId: 'MetaValue' },
      { val: labels.legendLabel, styleId: 'MetaLabel' },
      { val: labels.legendNormal, styleId: 'CellNormal' },
      { val: labels.legendLate, styleId: 'CellLate' },
      { val: labels.legendEarly, styleId: 'CellEarly' },
      { val: labels.legendMissed, styleId: 'CellMissing' },
      { val: labels.legendLeave, styleId: 'CellLeave' },
      { val: labels.legendUnpunched, styleId: 'CellUnpunched' },
      { val: labels.legendMia, styleId: 'CellMia' }
    ];

    // Row 4: 留白空行
    const row4Blank = [{ val: '', styleId: 'CellEmpty' }];

    // Row 5: 主表头
    const row5Header = [
      { val: labels.colEmpId, styleId: 'HeaderLeftDark' },
      { val: labels.colEmpName, styleId: 'HeaderLeftDark' },
      { val: labels.colShiftName, styleId: 'HeaderLeftDark' },
      // 中间动态日期列: 90度竖排旋转
      ...meta.days.map(d => ({
        val: isEn ? `${d.day}-${meta.shortMonthName || 'M'}` : `${d.day}-${d.month}月`,
        styleId: 'HeaderRotatedDate'
      })),
      // 右侧绿色汇总区 6 列
      { val: labels.colSummaryPresent, styleId: 'HeaderRightGreen' },
      { val: labels.colSummaryLeave, styleId: 'HeaderRightGreen' },
      { val: labels.colSummaryLateEarly, styleId: 'HeaderRightGreen' },
      { val: labels.colSummaryMissed, styleId: 'HeaderRightGreen' },
      { val: labels.colSummaryMia, styleId: 'HeaderRightGreen' },
      { val: labels.colSummaryRate, styleId: 'HeaderRightGreen' }
    ];

    // 员工数据行 (Row 6 开始)
    const memberMatrixRows = sortedMembers.map(m => {
      const leftCols = [
        { val: m.empId, styleId: 'CellLeftText' },
        { val: m.name, styleId: 'CellLeftText' },
        { val: m.shiftName ? m.shiftName.split(' ')[0] : 'Shift', styleId: 'CellLeftText' }
      ];

      const dayCells = meta.days.map(d => {
        const dayLog = dailyLogs.find(l => {
          if (l.dateStr !== d.dateStr) return false;
          if (l.userId === m.uid) return true;
          if (l.userEmail && m.email && l.userEmail.toLowerCase() === m.email.toLowerCase()) return true;
          if (l.picName && m.name && l.picName.toLowerCase() === m.name.toLowerCase()) return true;
          return false;
        });

        const directLeave = dayLog?.leaveRecord || CascadeShiftEngine.findActiveLeaveForDate(
          attendanceLeaves,
          m.uid,
          m.email,
          m.name,
          d.dateStr
        );

        const visual = mapAttendanceVisualState({
          dayLog,
          directLeave,
          dayMeta: d,
          todayStr: meta.todayStr,
          locale
        });

        return {
          val: visual.code,
          styleId: visual.styleId,
          comment: visual.commentText || ''
        };
      });

      // 核心红线 1：出勤率同构公式
      const fullLeaveDays = m.fullLeaveDaysElapsed || 0;
      const effectiveExpectedDays = Math.max(1, meta.elapsedWorkingDays - fullLeaveDays);
      const attendanceRate = meta.elapsedWorkingDays > 0
        ? `${(Math.min(100, (m.daysPresent / effectiveExpectedDays) * 100)).toFixed(1)}%`
        : '0.0%';

      const summaryCols = [
        { val: m.daysPresent, styleId: 'SummaryCellNumber' },
        { val: m.leaveDays || 0, styleId: 'SummaryCellNumber' },
        { val: m.violationCount, styleId: 'SummaryCellNumber' },
        { val: m.missingPunchCount, styleId: 'SummaryCellNumber' },
        { val: m.miaCount, styleId: 'SummaryCellNumber' },
        { val: attendanceRate, styleId: 'SummaryCellNumber' }
      ];

      return [...leftCols, ...dayCells, ...summaryCols];
    });

    // Sheet 1 组装
    const matrixSheet = {
      name: labels.sheetAttendanceMatrix(formattedMonth),
      isMatrix: true,
      customSheetType: 'ATTENDANCE_MATRIX',
      freezePanes: { splitHorizontal: 5, splitVertical: 3 },
      merges: [
        { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } }
      ],
      customCols: [
        { wch: 14 }, // 工号
        { wch: 18 }, // 姓名
        { wch: 18 }, // 班次
        ...meta.days.map(() => ({ wch: 4.8 })), // 日期列严格压缩至 4.8 字符宽度
        { wch: 12 }, // 实出勤
        { wch: 10 }, // 请假
        { wch: 12 }, // 迟早
        { wch: 10 }, // 漏卡
        { wch: 12 }, // 旷工/MIA
        { wch: 14 }  // 出勤率
      ],
      headers: [],
      rows: [
        row1Banner,
        row2Blank,
        row3MetaAndLegend,
        row4Blank,
        row5Header,
        ...memberMatrixRows
      ]
    };

    // ==========================================
    // 6. 构建 Sheet 2: 上下班打卡与审计流水明细 (Clock-in / Clock-out Log)
    // ==========================================
    const dailyHeaders = [
      labels.colDate,
      labels.colWeekday,
      labels.colEmpId,
      labels.colEmpName,
      labels.colShift,
      labels.colCutoff,
      labels.colFirstIn,
      labels.colLunchOut,
      labels.colLunchIn,
      labels.colLastOut,
      labels.colDuration,
      labels.colComplianceStatus,
      labels.colVerifyMethod,
      labels.colNotes
    ];

    const formatPunchType = (type) => {
      if (type === 'CLOCK_IN' || type === 'CHECK_IN') return labels.punchInLabel;
      if (type === 'CLOCK_OUT' || type === 'CHECK_OUT') return labels.punchOutLabel;
      if (type === 'LUNCH_OUT') return labels.punchLunchOutLabel;
      if (type === 'LUNCH_IN') return labels.punchLunchInLabel;
      return type;
    };

    const dailyRows = dailyLogs.map(log => {
      const a = log.analysis;
      const isLeave = Boolean(a.isOnLeave || log.verifyMethod === 'LEAVE');
      const isManual = !isLeave && (log.verifyMethod === 'ADMIN_MANUAL' || log.isManualEntry || (Array.isArray(log.events) && log.events.some(e => e.verifyMethod === 'ADMIN_MANUAL' || e.isManualEntry)));
      const methodLabel = isLeave
        ? labels.methodLeave
        : isManual
          ? labels.methodAdminManual
          : log.verifyMethod === 'WFH'
            ? labels.methodWfh
            : log.verifyMethod === 'WIFI_IP'
              ? labels.methodWifi
              : log.verifyMethod === 'GPS_GEOFENCE'
                ? (log.verifySnapshot?.allowedRadius ? `${log.verifySnapshot.allowedRadius}m ${labels.geofenceTag || 'Geofence'}` : labels.methodGps)
                : log.verifyMethod || labels.methodRegular;

      const manualEntryData = log.manualEntry || (Array.isArray(log.events) && log.events.find(e => e.manualEntry)?.manualEntry);
      const manualAuditNote = manualEntryData
        ? (labels.manualAuditNoteText ? labels.manualAuditNoteText(manualEntryData.addedByName, manualEntryData.reason) : `[${labels.methodAdminManual}: ${manualEntryData.addedByName || labels.defaultAdminName || 'Admin'}${manualEntryData.reason ? ' - ' + manualEntryData.reason : ''}]`)
        : (log.verifySnapshot?.method === 'ADMIN_MANUAL' ? `[${labels.methodAdminManual}: ${log.verifySnapshot.reason || log.verifySnapshot.adminName || ''}]` : null);

      const leaveAuditNote = isLeave
        ? (a.note || `[${labels.methodLeave}: ${log.leaveRecord?.leaveType || ''}${log.leaveRecord?.reason ? ' - ' + log.leaveRecord.reason : ''}]`)
        : null;

      const punchFlow = Array.isArray(log.events) && log.events.length > 2
        ? `[${labels.allPunchesPrefix}: ${log.events.map(e => `${formatPunchType(e.type)} ${e.dateObj ? toShortTimeStr(e.dateObj) : ''}${e.verifyMethod === 'ADMIN_MANUAL' ? (labels.manualPunchTag || ' (Manual)') : ''}`).join(' -> ')}]`
        : null;

      const verifyDetails = [
        manualAuditNote,
        leaveAuditNote,
        log.verifySnapshot?.ip ? `IP: ${log.verifySnapshot.ip}` : null,
        (!isLeave && a.note) ? a.note.replace(/^\[\d+m\s*\/\s*(\d+m)\]/, `[${log.verifySnapshot?.allowedRadius || 100}m / $1]`) : null,
        punchFlow
      ].filter(Boolean).join('; ') || '-';

      const weekdayStr = log.dateObj ? labels.weekdays[log.dateObj.getDay()] : '-';

      return [
        log.dateStr,
        weekdayStr,
        log.userId?.slice(0, 8) || 'EMP',
        log.picName,
        a.shift?.name || labels.unassignedShift,
        a.shift?.endStr || '-',
        a.clockInStr || '-',
        log.lunchOutStr,
        log.lunchInStr,
        a.clockOutStr || '-',
        a.durationHours !== null ? a.durationHours : '-',
        a.complianceLabel || '-',
        methodLabel,
        verifyDetails
      ];
    });

    const logSheet = {
      name: labels.sheetAttendanceLogs || '上下班打卡与审计流水明细',
      freezePanes: { splitHorizontal: 1, splitVertical: 0 },
      headers: dailyHeaders,
      rows: dailyRows
    };

    return [matrixSheet, logSheet];
  },

  async exportCommissionReport({
    records = [],
    teamMembers = [],
    monthStr = '',
    locale = 'zh'
  }) {
    const labels = EXCEL_I18N[locale] || EXCEL_I18N.zh;
    const formattedMonth = monthStr || new Date().toISOString().slice(0, 7);
    const todayStr = new Date().toISOString().split('T')[0];

    // Filter records by month if monthStr is provided
    const monthRecords = records.filter(r => {
      const d = r.onboardDate || (typeof r.createdAt === 'string' ? r.createdAt : '');
      if (!d) return true;
      return !monthStr || d.slice(0, 7) === monthStr;
    });

    // -------------------------------------------------------------
    // Sheet 1: 顾问月度提成总账 (Advisor Commission Summary)
    // -------------------------------------------------------------
    const summaryMap = {};
    (teamMembers || []).forEach(m => {
      const cleanName = m.displayName || m.name || m.email?.split('@')[0] || 'Advisor';
      summaryMap[m.uid || m.id] = {
        name: cleanName,
        email: m.email || '',
        dealsCount: 0,
        pendingComm: 0,
        unlockedComm: 0,
        totalComm: 0
      };
    });

    monthRecords.forEach(rec => {
      if (rec.status === 'CANCELLED') return;
      const remainingDays = getGuaranteeRemainingDays(rec.unlockDate, todayStr);
      const isUnlocked = rec.status === 'UNLOCKED' || rec.status === 'SETTLED' || (Number(rec.guaranteeDays) <= 0) || (remainingDays === 0);

      (rec.splits || []).forEach(split => {
        const uid = split.uid || split.displayName;
        if (!summaryMap[uid]) {
          summaryMap[uid] = {
            name: split.displayName || 'Advisor',
            email: '',
            dealsCount: 0,
            pendingComm: 0,
            unlockedComm: 0,
            totalComm: 0
          };
        }
        const amt = Number(split.amount) || 0;
        summaryMap[uid].dealsCount += 1;
        summaryMap[uid].totalComm += amt;
        if (isUnlocked) {
          summaryMap[uid].unlockedComm += amt;
        } else {
          summaryMap[uid].pendingComm += amt;
        }
      });
    });

    const summaryHeaders = [
      labels.colPicName,
      labels.colEmail,
      labels.colDealsCount,
      labels.colPendingComm,
      labels.colUnlockedComm,
      labels.colTotalGrossComm
    ];

    const summaryRows = Object.values(summaryMap)
      .filter(item => item.totalComm > 0 || item.dealsCount > 0)
      .sort((a, b) => b.totalComm - a.totalComm)
      .map(item => [
        item.name,
        item.email,
        item.dealsCount,
        Math.round(item.pendingComm * 100) / 100,
        Math.round(item.unlockedComm * 100) / 100,
        Math.round(item.totalComm * 100) / 100
      ]);

    // -------------------------------------------------------------
    // Sheet 2: 成单分成与保证期风控明细 (Deals & Split Details)
    // -------------------------------------------------------------
    const detailHeaders = [
      labels.colCandidateName,
      labels.colCompanyName,
      labels.colPosition,
      labels.colOnboardDate,
      labels.colGuaranteeDays,
      labels.colUnlockDate,
      labels.colBillingMode,
      labels.colTotalPool,
      labels.colSplitsDetail,
      labels.colDealStatus,
      labels.colOverrideReason,
      labels.colCancelReason
    ];

    const detailRows = monthRecords.map(rec => {
      const splitsText = (rec.splits || []).map(s => `${s.displayName}(${s.role} ${s.ratio}%): RM ${s.amount}`).join('; ');
      const statusText = rec.status === 'CANCELLED'
        ? (labels.statusCancelled || '已冲销')
        : (rec.status === 'UNLOCKED' ? (labels.statusUnlocked || '已解锁') : (labels.statusPending || '保证期内'));

      return [
        rec.candidateName || '-',
        rec.companyName || '-',
        rec.position || '-',
        rec.onboardDate || '-',
        rec.guaranteeDays ?? 90,
        rec.unlockDate || '-',
        rec.billingSnapshot?.billingMode || 'DIRECT_FLAT',
        rec.billingSnapshot?.totalCommissionPool || rec.totalCommissionPool || 0,
        splitsText,
        statusText,
        rec.isOverridden ? (rec.overrideReason || labels.defaultOverrideReason || '主管特批') : '-',
        rec.cancellation?.reason || '-'
      ];
    });

    const sheets = [
      {
        name: labels.sheetCommSummary(formattedMonth),
        headers: summaryHeaders,
        rows: summaryRows
      },
      {
        name: labels.sheetCommDetail,
        headers: detailHeaders,
        rows: detailRows
      }
    ];

    await this.exportWorkbook({
      filename: `TalentFlow_Commission_${formattedMonth}.xlsx`,
      sheets,
      locale
    });
  },

  /**
   * 导出企业报销对账单 (包含 3 个 Sheet: 员工随薪汇总 / 单据审批总账 / 票据流水明细)
   */
  async exportExpenseClaimsReport({
    claims = [],
    teamMembers = [],
    monthStr = '',
    locale = 'zh'
  }) {
    const labels = EXCEL_I18N[locale] || EXCEL_I18N.zh;
    const formattedMonth = monthStr || new Date().toISOString().slice(0, 7);

    // 1. 过滤指定月份 (若传 monthStr)
    const filteredClaims = claims.filter(c => {
      if (!monthStr || monthStr === 'all') return true;
      return c.claimMonth === monthStr || (c.createdAt?.toDate ? c.createdAt.toDate().toISOString().startsWith(monthStr) : String(c.createdAt || '').startsWith(monthStr));
    });

    // 2. Sheet 1: 员工报销与随薪汇总
    const memberSummaryMap = {};
    teamMembers.forEach(m => {
      const canonical = resolveCanonicalPic(m.displayName || m.name || m.email, [m]);
      const key = canonical.canonicalName || m.displayName || m.email;
      memberSummaryMap[key] = {
        name: key,
        email: m.email || '',
        claimsCount: 0,
        totalClaimed: 0,
        payrollApproved: 0,
        batchPaid: 0,
        reviewingAmt: 0,
        warningCount: 0
      };
    });

    filteredClaims.forEach(c => {
      const canonical = resolveCanonicalPic(c.picName || c.userName || c.userEmail, teamMembers);
      const key = canonical.canonicalName || c.picName || c.userName || 'Employee';
      if (!memberSummaryMap[key]) {
        memberSummaryMap[key] = {
          name: key,
          email: c.userEmail || '',
          claimsCount: 0,
          totalClaimed: 0,
          payrollApproved: 0,
          batchPaid: 0,
          reviewingAmt: 0,
          warningCount: 0
        };
      }
      const entry = memberSummaryMap[key];
      const amt = Number(c.totalAmount || 0);
      entry.claimsCount += 1;
      entry.totalClaimed += amt;

      if (c.status === 'LOCKED_IN_PAYROLL' || (c.status === 'APPROVED_PENDING_PAYOUT' && c.payoutChannel === 'PAYROLL')) {
        entry.payrollApproved += amt;
      } else if (c.status === 'PAID') {
        entry.batchPaid += amt;
      } else if (c.status === 'SUBMITTED' || c.status === 'MANAGER_APPROVED') {
        entry.reviewingAmt += amt;
      }

      (c.items || []).forEach(it => {
        if (it.warnings && it.warnings.length > 0) {
          entry.warningCount += 1;
        }
      });
    });

    const summaryHeaders = [
      labels.colPicName,
      labels.colEmail,
      labels.colClaimsCount,
      labels.colClaimsTotal,
      labels.colPayrollApproved,
      labels.colBatchPaid,
      labels.colReviewingAmt,
      labels.colWarningCount
    ];

    const summaryRows = Object.values(memberSummaryMap)
      .filter(e => e.claimsCount > 0)
      .map(e => [
        e.name,
        e.email,
        e.claimsCount,
        Math.round((e.totalClaimed + Number.EPSILON) * 100) / 100,
        Math.round((e.payrollApproved + Number.EPSILON) * 100) / 100,
        Math.round((e.batchPaid + Number.EPSILON) * 100) / 100,
        Math.round((e.reviewingAmt + Number.EPSILON) * 100) / 100,
        e.warningCount
      ]);

    // 3. Sheet 2: 报销单与双轨审批总账
    const ledgerHeaders = [
      labels.colClaimId,
      labels.colClaimTitle,
      labels.colClaimMonth,
      labels.colApplicant,
      labels.colItemsCount,
      labels.colClaimsTotal,
      labels.colPayoutChannel,
      labels.colCurrentStatus,
      labels.colManagerReviewer,
      labels.colManagerReviewTime,
      labels.colFinanceReviewer,
      labels.colFinanceReviewTime,
      labels.colRejectReason
    ];

    const ledgerRows = filteredClaims.map(c => [
      c.id,
      c.title,
      c.claimMonth,
      c.picName || c.userName,
      (c.items || []).length,
      Number(c.totalAmount || 0),
      c.payoutChannel === 'PAYROLL' ? (labels.channelPayrollText || '随薪发放 (Payroll)') : (labels.channelBatchText || '批次打款 (Batch Payout)'),
      c.status,
      c.managerReview?.reviewedByName || '-',
      c.managerReview?.reviewedAt?.slice(0, 16) || '-',
      c.financeReview?.reviewedByName || '-',
      c.financeReview?.reviewedAt?.slice(0, 16) || '-',
      c.rejection?.reason || '-'
    ]);

    // 4. Sheet 3: 票据与里程明细流水
    const detailHeaders = [
      labels.colClaimId,
      labels.colCategory,
      labels.colExpenseDate,
      labels.colMerchantRoute,
      labels.colInvoiceNo,
      labels.colVehicleType,
      labels.colDistanceKm,
      labels.colTollAmt,
      labels.colParkingAmt,
      labels.colLineAmount,
      labels.colTaxAmt,
      labels.colOcrFlag,
      labels.colWarnings,
      labels.colLineNotes
    ];

    const detailRows = [];
    filteredClaims.forEach(c => {
      (c.items || []).forEach(it => {
        detailRows.push([
          c.id,
          it.category,
          it.receiptDate || '-',
          it.merchantName || '-',
          it.invoiceNo || '-',
          it.mileageMeta?.vehicleType || '-',
          it.mileageMeta?.distanceKm || 0,
          it.mileageMeta?.tollAmount || 0,
          it.mileageMeta?.parkingAmount || 0,
          Number(it.amount || 0),
          Number(it.taxAmount || 0),
          it.ocrExtracted ? (labels.yesText || '是 (YES)') : (labels.noText || '否 (NO)'),
          (it.warnings || []).join('; ') || '-',
          it.notes || '-'
        ]);
      });
    });

    const sheets = [
      {
        name: labels.sheetClaimsSummary(formattedMonth),
        headers: summaryHeaders,
        rows: summaryRows
      },
      {
        name: labels.sheetClaimsLedger,
        headers: ledgerHeaders,
        rows: ledgerRows
      },
      {
        name: labels.sheetClaimsDetail,
        headers: detailHeaders,
        rows: detailRows
      }
    ];

    await this.exportWorkbook({
      filename: `TalentFlow_Claims_${formattedMonth}.xlsx`,
      sheets,
      locale
    });
  }
};
