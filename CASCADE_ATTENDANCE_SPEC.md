# 📘 TALENT FLOW 考勤报表净化、双写去重与免考勤账户配置开发计划书 (CASCADE_ATTENDANCE_SPEC.md)

> **版本**：v2.1.0 (双写去重 / 总账闭合 / 英文国际化补全 / 免考勤名单配置版)  
> **状态**：已批准，专供 Flash 3.8 按步骤直接执行 (Approved — Ready for Step-by-Step Execution)  
> **最后更新时间**：2026-10-28  
> **涉及文件**：
> 1. `web/lib/cascade-shift-engine.js`
> 2. `web/lib/excel-exporter.js`
> 3. `web/app/(dashboard)/analytics/page.js`
> 4. `web/app/(dashboard)/leaderboard/page.js`

---

## 🤖 给执行 AI (Flash 3.8) 的最高指令

请严格按照以下 **Step 1 ~ Step 5** 顺序逐步执行代码修改。所有目标逻辑、代码片段与行号均已明确给出，**请勿省略任何细节，直接完成全部代码修改与最终验证**。

### ⚠️ 严禁触碰的红线 (Strict Guardrails)
1. **严禁使用原生弹窗**：禁止调用 `window.alert` / `window.confirm` / `window.prompt`。
2. **严禁破坏现有多语言与日期纯数字逻辑**：保留 `toIsoDateStr` 与 `parseTargetYearMonth` 纯数字处理。
3. **完成后必须同步记忆库**：修改完成后，必须将本次变更归档至 `memory/05_pitfalls.md` 与 `CHANGELOG.md`。

---

## 🛠️ Step 1：修复 `web/lib/cascade-shift-engine.js`（今日在岗状态与违规/缺卡边界解耦）

### 1.1 问题背景
1. 当天还在上班未签退（`isToday === true` 且 `firstIn && !lastOut`）时，原代码把 `isCompliant` 设为了 `true`，导致早上刚打完上班卡就被提前计入“阶梯班次达标天数 (`Compliant Shifts`)”。
2. 历史日期漏打下班卡（`MISSED_OUT`）或误触（`ABNORMAL_PUNCH`）时，原代码把 `isViolation` 强制设为 `true`，导致准时上班但忘签退的员工在总账表里被同时算进 `Violations / Late` 和 `Missed / Anomalies` 两列（1 次漏卡被重复算成 2 次异常）。

### 1.2 具体修改（`web/lib/cascade-shift-engine.js` 约第 340 ~ 421 行）
将 `resolveDailyShift` 中的 **场景 A (`if (firstIn && !lastOut)`)** 与 **场景 C (`if (durationMinutes < 30)`)** 替换为以下精确逻辑：

```javascript
    // 3. 场景 A：只有签到，无签退（解决忘记打卡痛点，严禁签退伪造成签到时间）
    if (firstIn && !lastOut) {
      const shift = manualShift || this.matchShift(firstIn, config, { locale });
      if (isToday) {
        return {
          hasAttendance: true,
          firstIn,
          lastOut: null,
          clockInStr: this.formatTime(firstIn),
          clockOutStr: '-',
          shift,
          durationHours: null,
          compliance: 'IN_PROGRESS',
          complianceLabel: labels.inProgress,
          isCompliant: false,
          isInProgress: true,
          isViolation: Boolean(shift.isLateArrival),
          isMissingPunch: false,
          isLate: Boolean(shift.isLateArrival),
          note: labels.inProgressNote
        };
      }
      return {
        hasAttendance: true,
        firstIn,
        lastOut: null,
        clockInStr: this.formatTime(firstIn),
        clockOutStr: labels.notClockedMissed,
        shift,
        durationHours: null,
        compliance: 'MISSED_OUT',
        complianceLabel: labels.missedOut,
        isCompliant: false,
        isInProgress: false,
        isViolation: Boolean(shift.isLateArrival),
        isMissingPunch: true,
        isLate: Boolean(shift.isLateArrival),
        note: labels.missedOutNote(this.formatTime(firstIn))
      };
    }
```

以及 **场景 C (`if (durationMinutes < 30)`)**：
```javascript
    if (durationMinutes < 30) {
      return {
        hasAttendance: true,
        firstIn,
        lastOut,
        clockInStr: this.formatTime(firstIn),
        clockOutStr: labels.abnormalOut(this.formatTime(lastOut)),
        shift,
        durationHours: null,
        compliance: 'ABNORMAL_PUNCH',
        complianceLabel: labels.abnormalTouch,
        isCompliant: false,
        isInProgress: false,
        isViolation: Boolean(shift.isLateArrival),
        isMissingPunch: true,
        isLate: Boolean(shift.isLateArrival),
        note: labels.abnormalTouchNote(Math.max(0, Math.round(durationMinutes)))
      };
    }
```

---

## 🛠️ Step 2：升级 `web/lib/excel-exporter.js`（去重、消除 `'-`、纯正英文化、免考勤过滤与排序）

### 2.1 在 `EXCEL_I18N` 中补齐中英文词条（约第 29 ~ 110 行）
在 `EXCEL_I18N.zh` 的 `missedOutShort: '未签退',` 下方新增：
```javascript
    inProgressShort: '在岗',
    lateShort: '迟到',
    punchInLabel: '签到',
    punchOutLabel: '签退',
    punchLunchOutLabel: '午休出',
    punchLunchInLabel: '午休回',
    allPunchesPrefix: '全部打卡',
```
在 `EXCEL_I18N.en` 的 `missedOutShort: 'No Out',` 下方新增：
```javascript
    inProgressShort: 'On Duty',
    lateShort: 'Late',
    punchInLabel: 'In',
    punchOutLabel: 'Out',
    punchLunchOutLabel: 'LunchOut',
    punchLunchInLabel: 'LunchIn',
    allPunchesPrefix: 'All Punches',
```

### 2.2 修复 `sanitizeExcelValue` 把占位符 `'-'` 变成 `"'-"` 的 Bug（约第 233 ~ 245 行）
将 `sanitizeExcelValue` 替换为：
```javascript
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
```

### 2.3 新增打卡双写去重函数与免考勤过滤逻辑
在 `sanitizeExcelValue` 下方新增两个纯函数：
```javascript
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
export function isAccountExcluded( { uid = '', email = '', name = '' }, excludedAccounts = []) {
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
```

### 2.4 重构 `buildAttendanceReportData`（约第 398 ~ 705 行）
更新 `buildAttendanceReportData` 参数签名与内部实现：
1. 参数列表增加 `excludedAccounts = []` 和 `hideZeroAttendance = false`：
   ```javascript
   buildAttendanceReportData({
     monthStr = '2026-10',
     attendanceEvents = [],
     hqMembers = [],
     shiftConfig = null,
     shiftOverrides = {},
     excludedAccounts = [],
     hideZeroAttendance = false,
     locale = 'zh'
   })
   ```
2. 在遍历 `attendanceEvents` 时，若该人员命中 `isAccountExcluded({ uid: userId, email: userEmail, name: picName }, excludedAccounts)`，直接 `return` 跳过。
3. 在生成 `dailyLogs` 时，先对 `day.events` 调用 `const cleanEvents = deduplicateDayEvents(day.events);`，再用 `cleanEvents` 调用 `CascadeShiftEngine.resolveDailyShift`，并将 `day.events = cleanEvents` 保存下来。
4. 在预填充 `hqMembers` 到 `memberSummaryMap` 时，若命中 `isAccountExcluded({ uid, email: m.email, name }, excludedAccounts)`，直接 `return` 跳过。
5. 在累加 `memberSummaryMap` 每日判定结果时，确保各列统计边界清晰：
   ```javascript
      if (log.analysis.hasAttendance) {
        target.daysPresent += 1;
        const isWfh = log.verifyMethod === 'WFH' || log.verifySnapshot?.method === 'WFH';
        if (isWfh) target.wfhDays += 1;
        else target.officeDays += 1;

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
   ```
6. 对 `memberSummaryMap` 的成员列表进行过滤与排序（表现最好的顾问排在最前面）：
   ```javascript
    const sortedMembers = Object.values(memberSummaryMap)
      .filter(m => !hideZeroAttendance || m.daysPresent > 0)
      .sort((a, b) => {
        if (b.compliantDays !== a.compliantDays) return b.compliantDays - a.compliantDays;
        const rateA = a.daysPresent > 0 ? a.compliantDays / a.daysPresent : -1;
        const rateB = b.daysPresent > 0 ? b.compliantDays / b.daysPresent : -1;
        if (rateB !== rateA) return rateB - rateA;
        if (b.daysPresent !== a.daysPresent) return b.daysPresent - a.daysPresent;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
   ```
   然后使用 `sortedMembers` 生成 `summaryRows` 和 `matrixRows`！
7. 在 **Sheet 2 (`matrixRows`)** 单元格填充时（约第 610 ~ 618 行），修复 `-未退` 硬编码中文与 `✅ 08:30-` 残缺横杠：
   ```javascript
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
   ```
8. 在 **Sheet 3 (`dailyRows`)** 生成 `punchFlow` 时（约第 659 ~ 661 行），使用去重且升序后的 `log.events` 及多语言词条：
   ```javascript
      const formatPunchType = (type) => {
        if (type === 'CLOCK_IN' || type === 'CHECK_IN') return labels.punchInLabel;
        if (type === 'CLOCK_OUT' || type === 'CHECK_OUT') return labels.punchOutLabel;
        if (type === 'LUNCH_OUT') return labels.punchLunchOutLabel;
        if (type === 'LUNCH_IN') return labels.punchLunchInLabel;
        return type;
      };

      const punchFlow = Array.isArray(log.events) && log.events.length > 2
        ? `[${labels.allPunchesPrefix}: ${log.events.map(e => `${formatPunchType(e.type)} ${e.dateObj ? toShortTimeStr(e.dateObj) : ''}`).join(' -> ')}]`
        : null;
   ```

---

## 🛠️ Step 3：在 `web/app/(dashboard)/analytics/page.js` 增加「免考勤/排除账户」配置界面与双写去重

### 3.1 在 `subscribeToAttendanceRules` 中保留免考勤配置字段（约第 163 ~ 179 行）
在 `setAttendanceRules` 的对象中补充两项：
```javascript
          shiftConfig: rules.shiftConfig || DEFAULT_SHIFT_CONFIG,
          shiftOverrides: rules.shiftOverrides || {},
          excludedAccounts: Array.isArray(rules.excludedAccounts) ? rules.excludedAccounts : [],
          hideZeroAttendanceInReport: Boolean(rules.hideZeroAttendanceInReport)
```
同时在顶部 `import` 处从 `../../../lib/excel-exporter` 引入 `isAccountExcluded`：
```javascript
import { ExcelExporter, isAccountExcluded } from '../../../lib/excel-exporter';
```

### 3.2 在 `picAttendanceRecords` 聚合中过滤免考勤人员并消除双写重复（约第 296 ~ 380 行）
在 `addEvent` 函数开头：
1. 解析 `canonical` 后，检查是否属于免考勤账户：
   ```javascript
      const canonical = resolveCanonicalPic(picName, meta.uid || '', teamMembers);
      const cleanPic = canonical.displayName || (userEmail ? userEmail.split('@')[0] : t('analytics.defaultPicName', '顾问'));
      if (isAccountExcluded({ uid: canonical.uid || meta.uid, email: userEmail || canonical.email, name: cleanPic }, attendanceRules?.excludedAccounts)) {
        return;
      }
   ```
2. 在向 `rec.allPunches` 推入前，检查是否已有同类型且时间差 `< 60 * 1000` 毫秒的双写副本：
   ```javascript
      const isDuplicate = rec.allPunches.some(
        p => p.actionType === actionType && Math.abs(p.time.getTime() - dateObj.getTime()) < 60 * 1000
      );
      if (isDuplicate) return;
   ```

### 3.3 在 `handleExportAttendanceExcel` 中传入排除配置（约第 1079 ~ 1086 行）
```javascript
      const sheets = ExcelExporter.buildAttendanceReportData({
        monthStr: activeMonthStr,
        attendanceEvents: combinedAttendance,
        hqMembers: hqAdvisors,
        shiftConfig: attendanceRules.shiftConfig || DEFAULT_SHIFT_CONFIG,
        shiftOverrides: attendanceRules.shiftOverrides || {},
        excludedAccounts: attendanceRules.excludedAccounts || [],
        hideZeroAttendance: Boolean(attendanceRules.hideZeroAttendanceInReport),
        locale: isEn ? 'en' : 'zh'
      });
```

### 3.4 在「考勤规则设置 (`isSettingsOpen`)」弹窗中新增「免考勤与报表排除名单」配置卡片（约第 2805 行，Modal Footer 上方）
在 `Strict Clock Out Switch` 所在 `</div>` 区块下方、`{/* Modal Footer */}` 上方，插入以下配置模块：

```jsx
              {/* Section 4: 免考勤与报表排除账户设定 (Exempt / Excluded Accounts) */}
              <div style={{ marginBottom: 'var(--space-5)', borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--space-4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                  <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="ph-bold ph-user-Minus" style={{ color: 'var(--accent-amber)' }}></i>
                    {t('analytics.secExemptTitle', '免考勤与报表排除账户 (Exempt Accounts)')}
                  </h4>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {t('analytics.exemptCountTag', `已排除 ${(editingRules.excludedAccounts || []).length} 人`)}
                  </span>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '0 0 var(--space-3) 0', lineHeight: 1.4 }}>
                  {t('analytics.exemptDesc', '点击下方成员标签可将其设为「免考勤/测试账户」。被排除的账户将不再出现在考勤监控列表、准点排行榜及导出的 Excel 月报中。')}
                </p>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '12px', background: 'rgba(0,0,0,0.15)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', marginBottom: 'var(--space-3)' }}>
                  {teamMembers
                    .filter(m => (!m.teamId || m.teamId === 'default_team') && m.role !== 'pending')
                    .map(m => {
                      const identifier = m.email || m.id || m.uid || m.name;
                      const currentList = editingRules.excludedAccounts || [];
                      const isExcluded = isAccountExcluded({ uid: m.id || m.uid, email: m.email, name: m.displayName || m.name }, currentList);
                      return (
                        <button
                          key={m.id || identifier}
                          type="button"
                          onClick={() => {
                            const nextList = isExcluded
                              ? currentList.filter(item => {
                                  const tLower = String(item).toLowerCase();
                                  return (
                                    item !== (m.id || m.uid) &&
                                    tLower !== String(m.email || '').toLowerCase() &&
                                    tLower !== String(m.displayName || m.name || '').toLowerCase()
                                  );
                                })
                              : [...currentList, identifier];
                            setEditingRules({
                              ...editingRules,
                              excludedAccounts: nextList
                            });
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '5px 10px',
                            borderRadius: '999px',
                            fontSize: '12px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            transition: '0.2s',
                            border: isExcluded ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid var(--border-subtle)',
                            background: isExcluded ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                            color: isExcluded ? '#fca5a5' : 'var(--text-secondary)',
                            textDecoration: isExcluded ? 'line-through' : 'none'
                          }}
                          title={m.email || m.name}
                        >
                          <i className={`ph-bold ${isExcluded ? 'ph-eye-slash' : 'ph-user-check'}`} style={{ color: isExcluded ? '#f87171' : 'var(--accent-emerald)' }}></i>
                          <span>{m.displayName || m.name || (m.email ? m.email.split('@')[0] : 'Advisor')}</span>
                        </button>
                      );
                    })}
                </div>

                {/* Hide Zero Attendance Switch */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>
                      {t('analytics.hideZeroAttTitle', '导出月报时自动隐藏当月 0 打卡账户')}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {t('analytics.hideZeroAttDesc', '开启后，当月没有任何打卡记录的账号将自动不在 Excel 总账与日历矩阵中显示。')}
                    </div>
                  </div>
                  <label style={{ position: 'relative', display: 'inline-block', width: '40px', height: '20px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(editingRules.hideZeroAttendanceInReport)}
                      onChange={(e) => {
                        setEditingRules({
                          ...editingRules,
                          hideZeroAttendanceInReport: e.target.checked
                        });
                      }}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                      background: editingRules.hideZeroAttendanceInReport ? 'var(--accent-amber)' : 'rgba(255,255,255,0.15)',
                      borderRadius: '20px', transition: '0.3s'
                    }}>
                      <span style={{
                        position: 'absolute', content: '""', height: '14px', width: '14px',
                        left: editingRules.hideZeroAttendanceInReport ? '22px' : '3px', bottom: '3px',
                        background: '#fff', borderRadius: '50%', transition: '0.3s'
                      }}></span>
                    </span>
                  </label>
                </div>
              </div>
```

---

## 🛠️ Step 4：在 `web/app/(dashboard)/leaderboard/page.js` 联动同步免考勤名单与去重

1. 在顶部从 `../../../lib/excel-exporter` 补充引入 `isAccountExcluded, deduplicateDayEvents`：
   ```javascript
   import { ExcelExporter, isAccountExcluded, deduplicateDayEvents } from '../../../lib/excel-exporter';
   ```
2. 在 `handleExportAttendanceExcel`（约第 116 ~ 123 行）中补充传入 `excludedAccounts` 与 `hideZeroAttendance`：
   ```javascript
      const sheets = ExcelExporter.buildAttendanceReportData({
        monthStr: activeMonthStr,
        attendanceEvents: combinedEvents,
        hqMembers: hqAdvisors,
        shiftConfig: attendanceRules?.shiftConfig || DEFAULT_SHIFT_CONFIG,
        shiftOverrides: attendanceRules?.shiftOverrides || {},
        excludedAccounts: attendanceRules?.excludedAccounts || [],
        hideZeroAttendance: Boolean(attendanceRules?.hideZeroAttendanceInReport),
        locale: isEn ? 'en' : 'zh'
      });
   ```
3. 在 `attendanceLeaderboard` 的 `useMemo`（约第 303 ~ 405 行）中：
   - 预填充 `hqMembers` 时，跳过 `isAccountExcluded({ uid: m.id, email: m.email, name: cleanName }, attendanceRules?.excludedAccounts)` 为 `true` 的成员；
   - 遍历 `combinedEvents` 时，若 `isAccountExcluded({ uid: canonical.uid, email: canonical.email || evt.userEmail, name: canonical.displayName }, attendanceRules?.excludedAccounts)` 为 `true`，直接 `return`；
   - 在调用 `CascadeShiftEngine.resolveDailyShift` 前，先对 `dayData.events` 执行 `const cleanEvents = deduplicateDayEvents(dayData.events);`。

---

## 🛠️ Step 5：验证与记忆库同步 (Verification & Memory Sync)

1. **运行 Node 自动化快速验证**：
   - 验证 `sanitizeExcelValue('-')` 返回 `'-'`（不含前置单引号）；
   - 验证双写事件传入 `buildAttendanceReportData` 后，`[全部打卡: ...]` 不会在只有 1 进 1 出的正常工作日触发；
   - 验证 `locale: 'en'` 下日历矩阵未签退显示 `❗ 08:38-No Out`、今日在岗显示 `💼 08:30 (On Duty)`；
   - 验证 `excludedAccounts: ['shizongboshi@gmail.com', 'wstan338@gmail.com']` 能准确将该账户从导出的 3 个 Sheet 中剔除。
2. **同步记忆库**：
   - 更新 `memory/05_pitfalls.md`（记录 `sanitizeExcelValue` 单横杠误判与 `attendance+logs` 双写合并去重准则）；
   - 更新 `CHANGELOG.md`（记录 v2.1.0 考勤报表净化与免考勤账户设定功能）。
