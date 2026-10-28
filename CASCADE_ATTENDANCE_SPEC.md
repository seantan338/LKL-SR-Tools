# 📘 TALENT FLOW 阶梯式弹性考勤与三表联动 Excel 导出开发技术规范 (CASCADE_ATTENDANCE_SPEC.md)

> **版本**：v2.0.0 (3-Sheet 矩阵升级与日期格式断崖修复版)  
> **状态**：已批准，待轻量级 AI 按步骤执行 (Approved — Ready for Step-by-Step Execution)  
> **最后更新时间**：2026-10-28  
> **适用范围**：`web/lib/excel-exporter.js`、`web/app/(dashboard)/analytics/page.js`、`web/app/(dashboard)/leaderboard/page.js`

---

## 🤖 给执行 AI 的最高指令 (Instructions for Executing AI)

你现在的任务是**严格按照本规范的 4 个步骤（Step 1 ~ Step 4）**，修复考勤 Excel 导出全为 0 的 Bug，并将报表升级为**“三表联动（3-Sheet）智能考勤账本”**。

### ⚠️ 严禁触碰的红线 (Strict Guardrails)
1. **严禁使用 `toLocaleDateString` 生成月份或过滤日期**：在中文环境下 `toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit' })` 会输出 `"2026年10月"`，与 `"2026-10-28"` 进行 `.startsWith()` 匹配会 100% 失败导致数据全空。必须使用纯数字 `getFullYear()` 与 `getMonth() + 1`。
2. **严禁在订阅考勤规则时丢失字段**：`analytics/page.js` 的 `subscribeToAttendanceRules` 必须保留 `enableLunchPunch`、`shiftConfig`、`shiftOverrides`。
3. **严禁调用原生弹窗**：前端不得使用 `window.alert` / `window.confirm` / `window.prompt`。
4. **必须完成记忆库同步**：代码修改完成后，必须将变更同步至 `memory/05_pitfalls.md` 与 `CHANGELOG.md`。

---

## 🛠️ Step 1：重构 `web/lib/excel-exporter.js`

### 1.1 修改目标
1. 引入 `resolveCanonicalPic`（来自 `./identity.mjs`），确保打卡记录与 HQ 顾问身份 100% 归一化对齐（支持 `uid`、`email`、姓名变体匹配）。
2. 新增纯数字日期解析与日历工作日计算函数：
   - `parseTargetYearMonth(monthStr)`：无论传入 `"2026-10"`、`"2026年10月"` 还是 `"2026/10"`，均用正则提取数字 `{ year, month, formatted: 'YYYY-MM' }`；
   - `toIsoDateStr(dateObj)`：用 `getFullYear()`、`getMonth() + 1`、`getDate()` 拼接标准的 `YYYY-MM-DD`；
   - `getMonthCalendarMeta(year, month)`：自动计算该月所有日期列表、法定工作日总数（排除周六日 `totalWorkingDays`）以及截止今日已过去的工作日数（`elapsedWorkingDays`）。
3. 升级为 **3 张工作表（3-Sheet）**：
   - **Sheet 1（月度全员出勤总账 `Attendance Summary`）**：包含 `当月总工作日`、`截止目前应出勤`、`实际出勤`、`办公室打卡`、`🏠 WFH居家`、`阶梯班次达标`、`迟到/早退违规`、`未签退/异常`、`出勤率 (实出勤/应出勤)`、`班次合规率 (达标/实出勤)`。
   - **Sheet 2（月度考勤日历矩阵 `Monthly Calendar Matrix`）**：纵轴为每位顾问，横轴为当月 `01` ~ 月末每一天（带星期标识），单元格直观填入 `✅ 08:55-18:02`、`🏠 WFH (09:00-18:05)`、`❌ 迟到/早退`、`❗ 未签退(08:58-)`、周末填 `休`、无打卡工作日填 `—`。
   - **Sheet 3（每日打卡流水明细 `Daily Punch Log Details`）**：增加 `星期`、`午休离开`、`午休返回` 列，并展示主管人工改派备注与多次打卡完整流水。
4. 实现 **智能中英文自适应列宽 (`autoFitColumnWidths`)**：扫描表头与每行单元格，按中文字符 `2.1` 倍宽、英文数字 `1.1` 倍宽 + `4` 字符边距动态计算 `!cols` 的 `wch`（范围 `12 ~ 55`），彻底解决表头文字被截断的问题。

### 1.2 关键代码实现蓝图（`web/lib/excel-exporter.js`）

请在 `web/lib/excel-exporter.js` 顶部引入 `resolveCanonicalPic`：
```javascript
import { saveAs } from 'file-saver';
import { CascadeShiftEngine } from './cascade-shift-engine';
import { resolveCanonicalPic } from './identity.mjs';
```

在 `EXCEL_I18N` 中补齐 3-Sheet 双语字典：
```javascript
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
    methodRegular: '日常打卡',
    weekendRest: '休',
    absentDash: '—',
    missedOutShort: '未签退',
    weekdays: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
    emptySheetErr: '导出内容为空，无有效 Sheet'
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
    methodRegular: 'Standard Check-in',
    weekendRest: 'OFF',
    absentDash: '—',
    missedOutShort: 'No Out',
    weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    emptySheetErr: 'Export content is empty — no valid sheet found'
  }
};
```

新增核心日期与列宽辅助函数：
```javascript
/**
 * 将 Date 对象安全格式化为 'YYYY-MM-DD'（不依赖任何浏览器 locale）
 */
export function toIsoDateStr(dateObj) {
  if (!dateObj || isNaN(dateObj.getTime())) return '';
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 将 Date 对象安全格式化为 'HH:mm'
 */
export function toShortTimeStr(dateObj) {
  if (!dateObj || isNaN(dateObj.getTime())) return '';
  const hh = String(dateObj.getHours()).padStart(2, '0');
  const mm = String(dateObj.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * 解析任意格式月份字符串（如 '2026-10', '2026年10月', '10/2026'）为标准数字年月
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
 * 计算目标月份的日历元数据、总工作日与截止今日已过工作日
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
 * 根据表头和数据内容自动计算最佳 Excel 列宽 (wch)
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
```

在 `exportWorkbook` 中应用自动列宽：
```javascript
const autoWchs = computeAutoColWidths(sheet.headers || [], sheet.rows || []);
ws['!cols'] = autoWchs.map(wch => ({ wch }));
```

在 `buildAttendanceReportData` 中：
1. 使用 `parseTargetYearMonth(monthStr)` 获取 `{ year, month, formatted }`；
2. 过滤打卡记录时，使用：
   ```javascript
   const dateObj = CascadeShiftEngine.toSafeDate(ts);
   if (!dateObj) return;
   if (dateObj.getFullYear() !== year || (dateObj.getMonth() + 1) !== month) return;
   const dStr = toIsoDateStr(dateObj);
   ```
3. 使用 `resolveCanonicalPic(rawPicName, rawUid, hqMembers)` 解析每位打卡人的标准身份，确保与 `hqMembers` 完美对齐（若未命中 `uid`，继续尝试按 `email.toLowerCase()` 或 `displayName.toLowerCase()` 对齐到 `memberSummaryMap`）。
4. 提取 `LUNCH_OUT` 与 `LUNCH_IN` 时间并在 Sheet 3 中输出。
5. 生成并返回 `[summarySheet, matrixSheet, detailSheet]` 共 3 个 Sheet。

---

## 🛠️ Step 2：修复并升级 `web/app/(dashboard)/analytics/page.js`

### 2.1 修复 `subscribeToAttendanceRules` 丢字段问题（约第 147-164 行）
将原来的 `setAttendanceRules` 修改为保留完整考勤配置：
```javascript
    const unsubscribe = FirestoreStore.subscribeToAttendanceRules(teamId, (rules) => {
      if (rules && typeof rules === 'object') {
        setAttendanceRules(prev => ({
          ...prev,
          enabled: rules.enabled ?? true,
          allowWfh: rules.allowWfh ?? true,
          enableLunchPunch: rules.enableLunchPunch ?? false,
          maxDistanceMeters: rules.maxDistanceMeters || 100,
          maxDriftCompensation: rules.maxDriftCompensation || 40,
          officeLocations: rules.officeLocations && rules.officeLocations.length > 0
            ? rules.officeLocations
            : [{ name: t('analytics.defaultOfficeName', '公司总部'), latitude: 1.440472, longitude: 103.617917, radiusMeters: 100 }],
          officeWifi: rules.officeWifi || { allowedIps: [], ddnsDomain: '' },
          shiftConfig: rules.shiftConfig || DEFAULT_SHIFT_CONFIG,
          shiftOverrides: rules.shiftOverrides || {}
        }));
      }
    });
```

### 2.2 新增导出月份选择器 State 与规范化 `handleExportAttendanceExcel`
1. 在组件 State 区（约第 50 行）新增导出月份状态（使用纯数字拼接默认值）：
   ```javascript
   const [exportMonth, setExportMonth] = useState(() => {
     const now = new Date();
     return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
   });
   ```
2. 在 `handleExportAttendanceExcel`（约第 1041-1090 行）中：
   - 将 `activeMonthStr` 改为：
     ```javascript
     const now = new Date();
     const fallbackMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
     const activeMonthStr = exportMonth || fallbackMonth;
     ```
   - 确保传入 `shiftConfig: attendanceRules.shiftConfig || DEFAULT_SHIFT_CONFIG` 与 `shiftOverrides: attendanceRules.shiftOverrides || {}`。
3. 在导出按钮旁（约第 1380 行与第 1745 行附近）渲染一个紧凑型月份选择输入框 `<input type="month" value={exportMonth} onChange={(e) => setExportMonth(e.target.value)} />`，方便 HR/管理员随时切换导出当月或上月考勤报表。

---

## 🛠️ Step 3：修复 `web/app/(dashboard)/leaderboard/page.js`

在 `web/app/(dashboard)/leaderboard/page.js` 的 `handleExportAttendanceExcel`（约第 112-125 行）中：
1. 替换 `toLocaleDateString` 为安全纯数字年月：
   ```javascript
   const now = new Date();
   const activeMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
   ```
2. 在调用 `ExcelExporter.buildAttendanceReportData` 时补充传入 `shiftOverrides`：
   ```javascript
   const sheets = ExcelExporter.buildAttendanceReportData({
     monthStr: activeMonthStr,
     attendanceEvents: combinedEvents,
     hqMembers: hqAdvisors,
     shiftConfig: attendanceRules?.shiftConfig || DEFAULT_SHIFT_CONFIG,
     shiftOverrides: attendanceRules?.shiftOverrides || {},
     locale: isEn ? 'en' : 'zh'
   });
   ```

---

## 🛠️ Step 4：验证与记忆库同步清单 (Verification & Memory Sync)

执行完上述修改后，请依次完成以下验证与归档：
1. **自动化验证脚本**：使用 `node` 运行快速测试，验证传入 `"2026年10月"` 和 `"2026-10"` 时，`ExcelExporter.buildAttendanceReportData` 均能正确过滤出 2026 年 10 月的打卡事件，且生成的 `sheets` 长度为 `3`（总账、日历矩阵、每日明细），无全 0 现象。
2. **更新 `memory/05_pitfalls.md`**：记录避坑条目 —— *“禁止使用 `toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit' })` 生成 `YYYY-MM` 字符串，因其在中文环境下会输出 `YYYY年MM月` 导致与 `YYYY-MM-DD` 的前缀匹配 100% 失败”*。
3. **更新 `CHANGELOG.md`**：增量记录本次考勤报表 3-Sheet 矩阵升级与日期过滤修复。
