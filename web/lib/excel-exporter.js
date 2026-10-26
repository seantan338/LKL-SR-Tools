/**
 * TALENT FLOW - 企业级多 Sheet Excel 导出引擎 (ExcelExporter)
 * 支持纯前端 0 延迟秒出报表、公式注入安全转义、多 Sheet 封装与列宽自适应
 */

import { saveAs } from 'file-saver';
import { CascadeShiftEngine } from './cascade-shift-engine';

export const EXCEL_I18N = {
  zh: {
    sheetSummary: (m) => `${m} 全员出勤总账`,
    sheetDetail: '每日打卡流水明细',
    colPicName: '顾问姓名 (PIC)',
    colEmail: '注册邮箱',
    colWorkDays: '应出勤工作日 (天)',
    colPresentDays: '实际出勤天数 (天)',
    colOfficeDays: '办公室打卡 (天)',
    colWfhDays: '🏠 WFH居家 (天)',
    colCompliantDays: '阶梯班次达标 (天)',
    colViolations: '迟到/早退违规 (次)',
    colMissedAnomalies: '漏打卡/异常 (次)',
    colComplianceRate: '综合合规出勤率 (%)',
    colDate: '考勤日期',
    colFirstIn: '首次签到 (In)',
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
    methodRegular: '日常打卡',
    emptySheetErr: '导出内容为空，无有效 Sheet'
  },
  en: {
    sheetSummary: (m) => `${m} Attendance Summary`,
    sheetDetail: 'Daily Punch Log Details',
    colPicName: 'Consultant / PIC',
    colEmail: 'Registered Email',
    colWorkDays: 'Working Days (Days)',
    colPresentDays: 'Days Present (Days)',
    colOfficeDays: 'Office Days (Days)',
    colWfhDays: '🏠 WFH Days (Days)',
    colCompliantDays: 'Compliant Shifts (Days)',
    colViolations: 'Violations / Late (Count)',
    colMissedAnomalies: 'Missed / Anomalies (Count)',
    colComplianceRate: 'Compliance Rate (%)',
    colDate: 'Date',
    colFirstIn: 'First Clock-In (In)',
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
    methodRegular: 'Standard Check-in',
    emptySheetErr: 'Export content is empty — no valid sheet found'
  }
};

/**
 * CSV / Excel 公式注入清洗器 (Formula Injection Sanitizer)
 * 若单元格为字符串且以 =, +, -, @ 开头，自动拼接前置单引号 '
 */
export function sanitizeExcelValue(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number' || typeof val === 'boolean') return val;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '-';
    return val.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-') + ' ' +
      val.toTimeString().split(' ')[0];
  }
  const str = String(val).trim();
  if (/^[=+@-]/.test(str)) {
    return `'${str}`;
  }
  return str;
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

    // 列宽定义
    if (Array.isArray(sheet.colWidths)) {
      sheet.colWidths.forEach(w => {
        xml += `\n   <Column ss:AutoFitWidth="0" ss:Width="${w || 110}"/>`;
      });
    }

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
   * @param {Array<{ name: string, headers: string[], rows: any[][], colWidths?: number[] }>} params.sheets
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

        // 设置列宽
        if (sheet.colWidths) {
          ws['!cols'] = sheet.colWidths.map(w => ({ wch: Math.round(w / 7) }));
        }

        const safeSheetName = (sheet.name || 'Sheet').replace(/[:\\/?*\[\]]/g, '_').slice(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
      });

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
      return;
    } catch (importErr) {
      console.warn('XLSX dynamic import fallback to XML Spreadsheet:', importErr);
    }

    // 容错回退：生成纯原生 UTF-8 XML 多 Sheet 电子表格
    const xmlContent = buildXmlSpreadsheet(sheets);
    const blob = new Blob([xmlContent], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const fallbackFilename = filename.replace(/\.xlsx$/i, '.xls');
    saveAs(blob, fallbackFilename.endsWith('.xls') ? fallbackFilename : `${fallbackFilename}.xls`);
  },

  /**
   * 汇聚并生成内部员工考勤报表数据（包含 Sheet 1 月度总账 + Sheet 2 每日阶梯流水）
   * @param {object} params
   */
  buildAttendanceReportData({
    monthStr = '2026-10',
    attendanceEvents = [],
    hqMembers = [],
    shiftConfig = null,
    shiftOverrides = {},
    workingDays = 22,
    locale = 'zh'
  }) {
    const labels = EXCEL_I18N[locale] || EXCEL_I18N.zh;

    // 1. 过滤当月事件并按日期+顾问 UID 聚合
    // 键格式: `${dateStr}__${picKey}`
    const dailyMap = {};

    attendanceEvents.forEach(evt => {
      const ts = evt.timestamp || evt.createdAt;
      const dateObj = CascadeShiftEngine.toSafeDate(ts);
      if (!dateObj) return;

      const dStr = dateObj.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
      if (!dStr.startsWith(monthStr)) return; // 严格过滤在指定月份内

      const picName = evt.picName || evt.userName || evt.user?.displayName || (evt.userEmail ? evt.userEmail.split('@')[0] : labels.defaultPic);
      const userId = evt.userId || evt.user?.uid || picName;
      const key = `${dStr}__${userId}`;

      if (!dailyMap[key]) {
        dailyMap[key] = {
          dateStr: dStr,
          userId,
          picName,
          userEmail: evt.userEmail || evt.user?.email || '',
          events: [],
          verifyMethod: evt.verifyMethod || '',
          verifySnapshot: evt.verifySnapshot || null
        };
      }
      dailyMap[key].events.push({
        ...evt,
        dateObj,
        type: evt.type || evt.action || 'CLOCK_IN'
      });
      if (evt.verifyMethod && !dailyMap[key].verifyMethod) {
        dailyMap[key].verifyMethod = evt.verifyMethod;
        dailyMap[key].verifySnapshot = evt.verifySnapshot;
      }
    });

    // 2. 针对每一条每日记录应用 CascadeShiftEngine 判定（支持主管人工改派班次）
    const dailyLogs = Object.values(dailyMap).map(day => {
      const overrideKey = `${day.dateStr}__${day.picName}`;
      const overrideKeyUid = `${day.dateStr}__${day.userId}`;
      const overrideShift = (shiftOverrides && (shiftOverrides[overrideKey] || shiftOverrides[overrideKeyUid])) || null;
      const res = CascadeShiftEngine.resolveDailyShift(day.events, shiftConfig, { locale, overrideShift });
      return {
        ...day,
        analysis: res
      };
    });

    // 排序：按日期升序，同日按姓名排序
    dailyLogs.sort((a, b) => a.dateStr.localeCompare(b.dateStr) || a.picName.localeCompare(b.picName));

    // 3. 构建 Sheet 1: 月度全员出勤总账 (Monthly Summary)
    // 聚合每位成员的月度指标
    const memberSummaryMap = {};

    // 预填充所有 HQ 成员
    hqMembers.forEach(m => {
      const name = m.displayName || m.name || (m.email ? m.email.split('@')[0] : labels.defaultPic);
      memberSummaryMap[m.id] = {
        name,
        email: m.email || '',
        daysPresent: 0,
        officeDays: 0,
        wfhDays: 0,
        compliantDays: 0,
        violationCount: 0,
        missingPunchCount: 0
      };
    });

    // 累加每日判定结果
    dailyLogs.forEach(log => {
      const uid = log.userId;
      if (!memberSummaryMap[uid]) {
        memberSummaryMap[uid] = {
          name: log.picName,
          email: log.userEmail,
          daysPresent: 0,
          officeDays: 0,
          wfhDays: 0,
          compliantDays: 0,
          violationCount: 0,
          missingPunchCount: 0
        };
      }
      const sum = memberSummaryMap[uid];
      if (log.analysis.hasAttendance) {
        sum.daysPresent += 1;
        const isWfh = log.verifyMethod === 'WFH' || log.verifySnapshot?.method === 'WFH';
        if (isWfh) sum.wfhDays += 1;
        else sum.officeDays += 1;

        if (log.analysis.isCompliant) {
          sum.compliantDays += 1;
        }
        if (log.analysis.isViolation || log.analysis.isLate) {
          sum.violationCount += 1;
        }
        if (log.analysis.isMissingPunch) {
          sum.missingPunchCount += 1;
        }
      }
    });

    const summaryHeaders = [
      labels.colPicName,
      labels.colEmail,
      labels.colWorkDays,
      labels.colPresentDays,
      labels.colOfficeDays,
      labels.colWfhDays,
      labels.colCompliantDays,
      labels.colViolations,
      labels.colMissedAnomalies,
      labels.colComplianceRate
    ];

    const summaryRows = Object.values(memberSummaryMap).map(m => {
      const complianceRate = workingDays > 0 ? ((m.compliantDays / workingDays) * 100).toFixed(1) + '%' : '0.0%';
      return [
        m.name,
        m.email,
        workingDays,
        m.daysPresent,
        m.officeDays,
        m.wfhDays,
        m.compliantDays,
        m.violationCount,
        m.missingPunchCount,
        complianceRate
      ];
    });

    // 4. 构建 Sheet 2: 每日打卡与阶梯审计明细 (Daily Shift Logs)
    const dailyHeaders = [
      labels.colDate,
      labels.colPicName,
      labels.colFirstIn,
      labels.colShift,
      labels.colCutoff,
      labels.colLastOut,
      labels.colDuration,
      labels.colComplianceStatus,
      labels.colVerifyMethod,
      labels.colNotes
    ];

    const dailyRows = dailyLogs.map(log => {
      const a = log.analysis;
      const methodLabel = log.verifyMethod === 'WFH'
        ? labels.methodWfh
        : log.verifyMethod === 'WIFI_IP'
          ? labels.methodWifi
          : log.verifyMethod === 'GPS_GEOFENCE'
            ? labels.methodGps
            : log.verifyMethod || labels.methodRegular;

      const verifyDetails = log.verifySnapshot?.ip
        ? `IP: ${log.verifySnapshot.ip}; ${a.note || ''}`
        : (a.note || '-');

      return [
        log.dateStr,
        log.picName,
        a.clockInStr || '-',
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
        name: labels.sheetSummary(monthStr),
        headers: summaryHeaders,
        rows: summaryRows,
        colWidths: [130, 190, 110, 110, 100, 100, 120, 120, 110, 130]
      },
      {
        name: labels.sheetDetail,
        headers: dailyHeaders,
        rows: dailyRows,
        colWidths: [100, 120, 100, 190, 110, 110, 90, 190, 110, 260]
      }
    ];
  }
};
