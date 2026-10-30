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
    methodGps: '100m 地理围栏',
    methodAdminManual: '管理员补录',
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
    weekdays: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
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
    statusPending: '保证期内'
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
    methodGps: '100m Geofence',
    methodAdminManual: 'Admin Manual Entry',
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
    weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
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
    statusPending: 'In Guarantee'
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
  <Style ss:ID="HeaderStyle">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
   </Borders>
   <Font ss:FontName="Segoe UI" x:CharSet="134" ss:Size="10" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#1E293B" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="CellCenter">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
  </Style>
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

    // 智能列宽换算为像素 (约 wch * 7.5px)
    const autoWchs = computeAutoColWidths(sheet.headers || [], sheet.rows || []);
    autoWchs.forEach(wch => {
      const pxWidth = Math.min(Math.max(wch * 7.5, 80), 380);
      xml += `\n   <Column ss:AutoFitWidth="0" ss:Width="${Math.round(pxWidth)}"/>`;
    });

    // 表头行
    if (Array.isArray(sheet.headers) && sheet.headers.length > 0) {
      xml += `\n   <Row ss:Height="26">`;
      for (const h of sheet.headers) {
        const safeH = String(h).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        xml += `\n    <Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">${safeH}</Data></Cell>`;
      }
      xml += `\n   </Row>`;
    }

    // 数据行
    if (Array.isArray(sheet.rows)) {
      for (const row of sheet.rows) {
        xml += `\n   <Row>`;
        for (const cell of row) {
          const val = sanitizeExcelValue(cell);
          const isNum = typeof val === 'number' && !isNaN(val);
          const isViolation = typeof val === 'string' && (val.includes('❌') || val.includes('违规') || val.includes('早退') || val.includes('Violation') || val.includes('Late') || val.includes('Early'));
          const isCompliant = typeof val === 'string' && val.includes('✅');
          const styleId = isViolation ? 'ss:StyleID="ViolationStyle"' : isCompliant ? 'ss:StyleID="CompliantStyle"' : '';

          if (isNum) {
            xml += `\n    <Cell ${styleId}><Data ss:Type="Number">${val}</Data></Cell>`;
          } else {
            const escaped = String(val)
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;');
            xml += `\n    <Cell ${styleId}><Data ss:Type="String">${escaped}</Data></Cell>`;
          }
        }
        xml += `\n   </Row>`;
      }
    }

    xml += `\n  </Table>\n </Worksheet>`;
  }

  xml += `\n</Workbook>`;
  return xml;
}

export const ExcelExporter = {
  /**
   * 导出多 Sheet 工作簿文件
   * @param {object} params
   * @param {string} params.filename - 文件名（如 'TalentFlow_Attendance_2026-10.xlsx'）
   * @param {Array<{ name: string, headers: string[], rows: any[][] }>} params.sheets
   */
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
        if (sheet.headers) {
          sheetData.push(sheet.headers.map(sanitizeExcelValue));
        }
        if (sheet.rows) {
          sheet.rows.forEach(r => {
            sheetData.push(r.map(sanitizeExcelValue));
          });
        }
        const ws = XLSX.utils.aoa_to_sheet(sheetData);

        // 应用智能自适应列宽
        const autoWchs = computeAutoColWidths(sheet.headers || [], sheet.rows || []);
        ws['!cols'] = autoWchs.map(wch => ({ wch }));

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

    // 容错回退：生成纯原生 UTF-8 XML 多 Sheet 电子表格
    const xmlContent = buildXmlSpreadsheet(sheets);
    const blob = new Blob([xmlContent], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const fallbackFilename = filename.replace(/\.xlsx$/i, '.xls');
    triggerBrowserDownload(blob, fallbackFilename.endsWith('.xls') ? fallbackFilename : `${fallbackFilename}.xls`);
  },

  /**
   * 汇聚并生成内部员工考勤报表数据（包含 Sheet 1 月度总账 + Sheet 2 考勤日历矩阵 + Sheet 3 每日阶梯流水）
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
    locale = 'zh'
  }) {
    const labels = EXCEL_I18N[locale] || EXCEL_I18N.zh;

    // 1. 规范化月份并提取日历元数据
    const { year, month, formatted: formattedMonth } = parseTargetYearMonth(monthStr);
    const meta = getMonthCalendarMeta(year, month);

    // 2. 严格按纯数字年份与月份过滤打卡事件，并按日期+顾问标准身份聚合
    // 键格式: `${dateStr}__${picCanonicalKey}`
    const dailyMap = {};

    attendanceEvents.forEach(evt => {
      const ts = evt.timestamp || evt.createdAt;
      const dateObj = CascadeShiftEngine.toSafeDate(ts);
      if (!dateObj) return;

      // 纯数学年份月份比对，100% 免疫中英文或系统区域格式差异
      if (dateObj.getFullYear() !== year || (dateObj.getMonth() + 1) !== month) return;
      const dStr = toIsoDateStr(dateObj);

      const rawPic = evt.picName || evt.userName || evt.user?.displayName || (evt.userEmail ? evt.userEmail.split('@')[0] : labels.defaultPic);
      const rawUid = evt.userId || evt.user?.uid || '';
      const canonical = resolveCanonicalPic(rawPic, rawUid, hqMembers);
      const picName = canonical.displayName || rawPic;
      const userId = canonical.uid || rawUid || canonical.key || picName;
      const userEmail = evt.userEmail || evt.user?.email || '';

      // 免考勤/排除名单过滤
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

    // 3. 针对每一条每日记录应用 CascadeShiftEngine 判定（支持主管人工改派班次）
    const dailyLogs = Object.values(dailyMap).map(day => {
      // 对单日事件按时间正序排列并消除双写重复记录
      const cleanEvents = deduplicateDayEvents(day.events);
      day.events = cleanEvents;

      const overrideKey = `${day.dateStr}__${day.picName}`;
      const overrideKeyUid = `${day.dateStr}__${day.userId}`;
      const overrideShift = (shiftOverrides && (shiftOverrides[overrideKey] || shiftOverrides[overrideKeyUid])) || null;
      const isToday = day.dateStr === meta.todayStr;
      const res = CascadeShiftEngine.resolveDailyShift(cleanEvents, shiftConfig, { locale, overrideShift, isToday });

      // 提取午休打卡流水
      const lunchOutEvt = cleanEvents.find(e => e.type === 'LUNCH_OUT');
      const lunchInEvt = cleanEvents.find(e => e.type === 'LUNCH_IN');
      const lunchOutStr = lunchOutEvt ? toShortTimeStr(lunchOutEvt.dateObj) : '-';
      const lunchInStr = lunchInEvt ? toShortTimeStr(lunchInEvt.dateObj) : '-';

      return {
        ...day,
        analysis: res,
        lunchOutStr,
        lunchInStr
      };
    });

    // 排序：按日期升序，同日按姓名排序
    dailyLogs.sort((a, b) => a.dateStr.localeCompare(b.dateStr) || a.picName.localeCompare(b.picName));

    // 4. 构建 Sheet 1: 月度全员出勤总账 (Monthly Attendance Summary)
    const memberSummaryMap = {};

    // 预填充所有 HQ 顾问成员（排除免考勤人员）
    hqMembers.forEach(m => {
      const canonical = resolveCanonicalPic(m.displayName || m.name || '', m.id || m.uid || '', hqMembers);
      const uid = m.id || m.uid || canonical.uid;
      const name = canonical.displayName || m.displayName || m.name || (m.email ? m.email.split('@')[0] : labels.defaultPic);
      const email = m.email || '';

      if (isAccountExcluded({ uid, email, name }, excludedAccounts)) {
        return;
      }

      memberSummaryMap[uid] = {
        uid,
        name,
        email,
        daysPresent: 0,
        officeDays: 0,
        wfhDays: 0,
        compliantDays: 0,
        violationCount: 0,
        missingPunchCount: 0
      };
    });

    // 累加每日判定结果，支持 uid / email / displayName 多重容错绑定
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
          name: log.picName,
          email: log.userEmail,
          daysPresent: 0,
          officeDays: 0,
          wfhDays: 0,
          compliantDays: 0,
          violationCount: 0,
          missingPunchCount: 0
        };
        memberSummaryMap[log.userId] = target;
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
      }
    });

    // 成员列表按 表现最优（达标天数降序 -> 合规率降序 -> 实际出勤降序 -> 姓名升序）排序，并按需隐藏 0 出勤账号
    const sortedMembers = Object.values(memberSummaryMap)
      .filter(m => !hideZeroAttendance || m.daysPresent > 0)
      .sort((a, b) => {
        if (b.compliantDays !== a.compliantDays) return b.compliantDays - a.compliantDays;
        const evalDaysA = a.evaluatedDays !== undefined ? a.evaluatedDays : a.daysPresent;
        const evalDaysB = b.evaluatedDays !== undefined ? b.evaluatedDays : b.daysPresent;
        const rateA = evalDaysA > 0 ? a.compliantDays / evalDaysA : -1;
        const rateB = evalDaysB > 0 ? b.compliantDays / evalDaysB : -1;
        if (rateB !== rateA) return rateB - rateA;
        if (b.daysPresent !== a.daysPresent) return b.daysPresent - a.daysPresent;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });

    const summaryHeaders = [
      labels.colPicName,
      labels.colEmail,
      labels.colTotalWorkDays,
      labels.colElapsedWorkDays,
      labels.colPresentDays,
      labels.colOfficeDays,
      labels.colWfhDays,
      labels.colCompliantDays,
      labels.colViolations,
      labels.colMissedAnomalies,
      labels.colAttendanceRate,
      labels.colComplianceRate
    ];

    const summaryRows = sortedMembers.map(m => {
      // 出勤率 = 实际出勤天数 / 截止目前应出勤工作日
      const attendanceRate = meta.elapsedWorkingDays > 0 ? ((m.daysPresent / meta.elapsedWorkingDays) * 100).toFixed(1) + '%' : '0.0%';
      // 班次合规率 = 达标天数 / 实际已结出勤天数（剔除今日尚未下班在岗中未决状态，避免白天未下班拉低合规率）
      const evalDays = m.evaluatedDays !== undefined ? m.evaluatedDays : m.daysPresent;
      const complianceRate = evalDays > 0 ? ((m.compliantDays / evalDays) * 100).toFixed(1) + '%' : '0.0%';
      return [
        m.name,
        m.email,
        meta.totalWorkingDays,
        meta.elapsedWorkingDays,
        m.daysPresent,
        m.officeDays,
        m.wfhDays,
        m.compliantDays,
        m.violationCount,
        m.missingPunchCount,
        attendanceRate,
        complianceRate
      ];
    });

    // 5. 构建 Sheet 2: 月度考勤日历矩阵 (Monthly Calendar Matrix)
    const matrixHeaders = [
      labels.colPicName,
      labels.colPresentDays,
      labels.colCompliantDays,
      ...meta.days.map(d => `${String(d.day).padStart(2, '0')} (${labels.weekdays[d.dayOfWeek]})`)
    ];

    const matrixRows = sortedMembers.map(m => {
      const row = [m.name, m.daysPresent, m.compliantDays];
      meta.days.forEach(d => {
        // 查找该顾问当天的打卡记录
        const dayLog = dailyLogs.find(l => {
          if (l.dateStr !== d.dateStr) return false;
          if (l.userId === m.uid) return true;
          if (l.userEmail && m.email && l.userEmail.toLowerCase() === m.email.toLowerCase()) return true;
          if (l.picName && m.name && l.picName.toLowerCase() === m.name.toLowerCase()) return true;
          return false;
        });

        if (dayLog && dayLog.analysis.hasAttendance) {
          const a = dayLog.analysis;
          const inStr = a.clockInStr && a.clockInStr !== '-' && a.clockInStr !== labels.notClocked ? a.clockInStr.slice(0, 5) : '';
          const outStr = a.clockOutStr && a.clockOutStr !== '-' && a.clockOutStr !== labels.notClocked ? a.clockOutStr.slice(0, 5) : '';
          const isWfh = dayLog.verifyMethod === 'WFH' || dayLog.verifySnapshot?.method === 'WFH';

          if (a.compliance === 'IN_PROGRESS' || a.isInProgress) {
            row.push(a.isLate ? `⚠️ ${inStr} (${labels.lateShort})` : `💼 ${inStr} (${labels.inProgressShort})`);
          } else if (a.isMissingPunch) {
            row.push(inStr ? `❗ ${inStr}-${labels.missedOutShort}` : (outStr ? `❗ ${labels.missedOutShort}-${outStr}` : `❗ ${labels.missedOutShort}`));
          } else if (isWfh) {
            row.push(`🏠 WFH ${inStr}-${outStr}`);
          } else if (a.isCompliant) {
            row.push(`✅ ${inStr}-${outStr}`);
          } else {
            row.push(`❌ ${inStr}-${outStr}`);
          }
        } else {
          if (d.isWeekend) {
            row.push(labels.weekendRest);
          } else if (d.dateStr > meta.todayStr) {
            row.push('');
          } else {
            row.push(labels.absentDash);
          }
        }
      });
      return row;
    });

    // 6. 构建 Sheet 3: 每日打卡与阶梯审计明细 (Daily Shift Logs)
    const dailyHeaders = [
      labels.colDate,
      labels.colWeekday,
      labels.colPicName,
      labels.colFirstIn,
      labels.colLunchOut,
      labels.colLunchIn,
      labels.colShift,
      labels.colCutoff,
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
      const isManual = log.verifyMethod === 'ADMIN_MANUAL' || log.isManualEntry || (Array.isArray(log.events) && log.events.some(e => e.verifyMethod === 'ADMIN_MANUAL' || e.isManualEntry));
      const methodLabel = isManual
        ? labels.methodAdminManual
        : log.verifyMethod === 'WFH'
          ? labels.methodWfh
          : log.verifyMethod === 'WIFI_IP'
            ? labels.methodWifi
            : log.verifyMethod === 'GPS_GEOFENCE'
              ? labels.methodGps
              : log.verifyMethod || labels.methodRegular;

      const manualEntryData = log.manualEntry || (Array.isArray(log.events) && log.events.find(e => e.manualEntry)?.manualEntry);
      const manualAuditNote = manualEntryData
        ? (labels.manualAuditNoteText ? labels.manualAuditNoteText(manualEntryData.addedByName, manualEntryData.reason) : `[管理员补录: 由 ${manualEntryData.addedByName || '管理员'} 补录${manualEntryData.reason ? ' - ' + manualEntryData.reason : ''}]`)
        : (log.verifySnapshot?.method === 'ADMIN_MANUAL' ? `[${labels.methodAdminManual}: ${log.verifySnapshot.reason || log.verifySnapshot.adminName || ''}]` : null);

      const punchFlow = Array.isArray(log.events) && log.events.length > 2
        ? `[${labels.allPunchesPrefix}: ${log.events.map(e => `${formatPunchType(e.type)} ${e.dateObj ? toShortTimeStr(e.dateObj) : ''}${e.verifyMethod === 'ADMIN_MANUAL' ? ' (补录)' : ''}`).join(' -> ')}]`
        : null;

      const verifyDetails = [
        manualAuditNote,
        log.verifySnapshot?.ip ? `IP: ${log.verifySnapshot.ip}` : null,
        a.note ? a.note : null,
        punchFlow
      ].filter(Boolean).join('; ') || '-';

      const weekdayStr = log.dateObj ? labels.weekdays[log.dateObj.getDay()] : '-';

      return [
        log.dateStr,
        weekdayStr,
        log.picName,
        a.clockInStr || '-',
        log.lunchOutStr,
        log.lunchInStr,
        a.shift?.name || labels.unassignedShift,
        a.shift?.endStr || '-',
        a.clockOutStr || '-',
        a.durationHours !== null ? a.durationHours : '-',
        a.complianceLabel || '-',
        methodLabel,
        verifyDetails
      ];
    });

    return [
      {
        name: labels.sheetSummary(formattedMonth),
        headers: summaryHeaders,
        rows: summaryRows
      },
      {
        name: labels.sheetMatrix(formattedMonth),
        headers: matrixHeaders,
        rows: matrixRows
      },
      {
        name: labels.sheetDetail,
        headers: dailyHeaders,
        rows: dailyRows
      }
    ];
  },

  /**
   * 导出顾问月度佣金结算与成单风控审计明细双 Sheet 报表 (Phase 6)
   * @param {object} params
   * @param {Array} params.records - 佣金流水台账记录
   * @param {Array} params.teamMembers - 团队成员列表
   * @param {string} params.monthStr - 目标月份 'YYYY-MM'
   * @param {string} params.locale - 'zh' | 'en'
   */
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
        rec.isOverridden ? (rec.overrideReason || '主管特批') : '-',
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
  }
};
