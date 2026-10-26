# 📘 TALENT FLOW 阶梯式弹性考勤与双 Sheet 报表导出开发技术规范 (CASCADE_ATTENDANCE_SPEC.md)

> **版本**：v1.0.0  
> **状态**：定稿待开发 (Approved & Ready for Implementation)  
> **最后更新时间**：2026-10-26  
> **适用范围**：TALENT FLOW Web 端 (`/analytics`, `/leaderboard`, `AttendanceModal`) 及底层 Excel 导出引擎

---

## 1. 业务背景与管理核心目标

在 TALENT FLOW 的日常运营中，内部员工考勤核算一直面临两大痛点：
1. **现实打卡异常多**：员工经常忘记打下班卡，或早上误触连击导致系统聚合出“签退时间 = 签到时间”以及“0 工时”的尴尬数据；
2. **阶梯式弹性考勤新规落地**：管理层制定了全新的“阶梯顺延式弹性工时”考核体系，要求系统能够智能核算员工打卡所属的阶梯档位，并严格执行“提前签退按迟到计”的纪律约束。

### 核心管理规则要点：
- **4 档标准班次**：`07:30 - 16:30`、`08:00 - 17:00`、`08:30 - 17:30`、`09:00 - 18:00`（工时跨度均为 9 小时，含 1 小时午休）。
- **零冗余阶梯顺延 (Cascade Punitive Shifts)**：
  - 8:30 班次必须在 `08:30:00` 及之前打卡；
  - 只要晚了 1 秒/1 分钟（如 `08:31:00`），**绝不给任何隐性宽限**，直接强制顺延至下一档（9:00 - 18:00 班次），当日下班底线强制变为 `18:00:00`；
  - 超过 `09:00:00` 打卡，属于超额严重迟到。
- **动态可配置性 (Admin Configurable)**：
  - 当前默认打卡宽限容差为 `graceMinutes = 0`；
  - 但**严禁将时间硬编码在代码中**，管理员可在设置面板随时修改各班次时间及宽限容差（如后续调整为 2 或 5 分钟）。
- **离线一分钟绝杀 (Strict Clock-Out)**：
  - 若核定下班时间为 18:00，员工在 `17:59:xx` 签退（哪怕差 1 秒），**直接判定为违规早退，并按迟到记录**。
- **双 Sheet 报表直出**：
  - 导出 Excel 账本包含：Sheet 1（月度全员汇总，供老板/HR 算工资全勤）与 Sheet 2（每日打卡阶梯流水，供行政对账与审计）。

---

## 2. 数据模型规范 (Data Models)

### 2.1 考勤规则扩展实体 (`teams/{teamId}/settings/attendance`)
在既有的考勤网络与地理围栏配置中，新增 `shiftConfig` 实体：

```typescript
interface AttendanceShiftRule {
  id: string;                      // 班次唯一标识 (如 'shift_a')
  name: string;                    // 班次显示名称 (如 'Shift A (7:30am - 4:30pm)')
  startTime: string;               // 签到基准/截止时间 'HH:mm' (如 '07:30')
  endTime: string;                 // 下班达标底线时间 'HH:mm' (如 '16:30')
}

interface AttendanceShiftConfig {
  enabled: boolean;                // 是否开启阶梯班次考核 (默认 true)
  graceMinutes: number;            // 打卡宽限容差分钟数 (【当前默认 0】，零冗余)
  strictClockOut: boolean;         // 提前签退是否直接按迟到计 (默认 true)
  shifts: AttendanceShiftRule[];   // 阶梯班次列表 (按时间升序)
}
```

**系统默认配置种子 (Fallback Default)**：
```javascript
export const DEFAULT_SHIFT_CONFIG = {
  enabled: true,
  graceMinutes: 0, // 零打卡冗余
  strictClockOut: true,
  shifts: [
    { id: 'shift_a', name: 'Shift A (7:30am - 4:30pm)', startTime: '07:30', endTime: '16:30' },
    { id: 'shift_b', name: 'Shift B (8:00am - 5:00pm)', startTime: '08:00', endTime: '17:00' },
    { id: 'shift_c', name: 'Shift C (8:30am - 5:30pm)', startTime: '08:30', endTime: '17:30' },
    { id: 'shift_d', name: 'Shift D (9:00am - 6:00pm)', startTime: '09:00', endTime: '18:00' }
  ]
};
```

---

## 3. 核心算法判定引擎规范 (`web/lib/cascade-shift-engine.js`)

系统必须封装纯函数类 `CascadeShiftEngine`，负责计算单日考勤状态与班次匹配。

### 3.1 零冗余与动态容差班次匹配逻辑
设员工当天首次有效签到时间为 $T_{\text{firstIn}}$，转换成当天从 0 点起的分钟数 $M_{\text{in}}$：
1. 遍历 `shifts` 列表（按 `startTime` 由早到晚排序）；
2. 针对第 $i$ 个班次，计算其最大签到有效截止分钟线：
   $$Cutoff_i = \text{parseMinutes}(shifts[i].startTime) + \text{graceMinutes}$$
3. 若 $M_{\text{in}} \le Cutoff_i$，则命中该班次 $shifts[i]$，其要求的最低下班时间为 $shifts[i].endTime$；
4. 若遍历完毕仍未命中（即 $M_{\text{in}} > Cutoff_{\text{last}}$），则归入 `Shift Late (严重迟到档)`，下班底线默认不早于最后一个班次的 `endTime`（即 18:00），同时标记为迟到。

### 3.2 签退与异常容错判定规则（黄金避坑 #81）
1. **只有签到无签退 (Missed Out)**：
   - 签退时间显示为 `"未打卡 (Missed)"`；
   - **严禁填入签到时间**（绝不伪造签退）；
   - 当日工时显示为 `"-"`；
   - 算作当天出勤（出勤天数 $+1$），但计入 `缺卡异常次数 +1`。
2. **只有签退无签到 (Missed In)**：
   - 签到时间显示为 `"未打卡 (Missed)"`；
   - 工时显示为 `"-"`；
   - 计入 `缺卡异常次数 +1`。
3. **连击手滑误触防呆 (Abnormal Duration)**：
   - 若 $T_{\text{lastOut}} - T_{\text{firstIn}} < 30 \text{ 分钟}$：
   - 判定为 `⚠️ 异常签退 (疑似误触)`；
   - 工时显示为 `"-"`（严禁导出 0.02h 等荒谬数据）；
   - 计入 `缺卡异常次数 +1`，备注提醒行政核查。
4. **提前签退违规判定 (Early Leave as Late)**：
   - 若实际签退分钟数 $M_{\text{out}} < \text{parseMinutes}(shift.endTime)$：
   - 判定为 `❌ 违规早退 (提前 N 秒按迟到计)`；
   - 记入 `迟到/违规次数 +1`。
5. **合规达标 (Compliant)**：
   - 实际签退 $\ge$ 核定班次下班线，且上班未超标：判定为 `✅ 达标完成`。

---

## 4. Excel 报表双 Sheet 结构规范

使用纯前端库生成 `.xlsx`，文件命名格式：`TalentFlow_Attendance_YYYY-MM.xlsx`。

### Sheet 1：月度全员出勤总账 (Monthly Summary)
供老板和 HR 一眼审阅全员月度出勤、全勤及违规扣款指标：

| 列序 | 列标题 (中/英) | 数据类型 | 统计/计算逻辑 |
| :--- | :--- | :--- | :--- |
| **A** | 顾问姓名 (PIC) | 字符串 | 经过 `resolveCanonicalPic` 归一化后的主姓名 |
| **B** | 注册邮箱 | 字符串 | 顾问账号邮箱 |
| **C** | 应出勤天数 (Work Days) | 整数 | 当月法定工作日总数（或当月天数，可由筛选器指定） |
| **D** | 实际出勤天数 (Days Present)| 整数 | 当月有至少 1 次有效打卡的总天数 |
| **E** | 办公室打卡 (Office Days) | 整数 | 命中 Wi-Fi 或 GPS 围栏的天数 |
| **F** | 🏠 WFH 居家 (WFH Days) | 整数 | 经核准的居家办公打卡天数 |
| **G** | 班次合规天数 (Compliant) | 整数 | 完美按班次上下班的天数 |
| **H** | 迟到/早退违规 (Violations) | 整数 | $\sum (上班迟到 + 提前签退)$ |
| **I** | 漏打卡/异常打卡 (Missing) | 整数 | $\sum (未打下班卡 + 连击误触异常)$ |
| **J** | 综合出勤率 (%) | 百分比 | $\frac{\text{实际出勤天数}}{\text{应出勤天数}} \times 100\%$ |

### Sheet 2：每日打卡与阶梯审计明细 (Daily Shift Logs)
供行政日常对账、漏卡核对与复核审计：

| 列序 | 列标题 (中/英) | 数据类型 | 说明与示例 |
| :--- | :--- | :--- | :--- |
| **A** | 日期 (Date) | 日期 | `2026-10-26` |
| **B** | 顾问姓名 (PIC) | 字符串 | `Kalap Lok` |
| **C** | 首次签到 (Clock-In) | 时间 | `08:31:12` |
| **D** | 核定阶梯班次 (Assigned Shift) | 字符串 | `Shift D (9:00am - 6:00pm) [顺延]` |
| **E** | 要求下班底线 (Required Out) | 时间 | `18:00:00` |
| **F** | 实际下班签退 (Actual Out) | 时间/文本 | `17:59:05` 或 `未打卡 (Missed)` |
| **G** | 当日实际工时 (Work Hours) | 文本/数值 | `9.5h` 或 `-` |
| **H** | 综合合规判定 (Status) | 状态文本 | `❌ 违规早退 (提前55秒按迟到计)` |
| **I** | 打卡核验凭证 (Method) | 文本 | `公司 Wi-Fi` / `100m围栏` / `WFH` |
| **J** | 核验快照与备注 (Audit Snapshot)| 文本 | `IP: 115.164.x.x; 未达班次底线 18:00:00` |

---

## 5. 安全、权限与防呆设计规范

### 5.1 RBAC 权限与 HQ 本部物理隔离
- **入口保护**：
  - 仅对 HQ 本部开放：`isHqTeam && (teamId === 'default_team')`；
  - 外部合作团队或分支机构在 UI 树上**完全不渲染**考勤报表导出按钮（防止越权访问与代码泄露）；
  - 全员月报仅对 `isOwner || isManager` 开放；普通 recruiter 仅可查看或导出本人打卡流水。

### 5.2 前端打卡防呆拦截 (Guardrails)
在 `AttendanceModal.js` 中增加双重保护：
1. **上午签到反馈**：
   - 签到成功后，Toast 醒目告知：`✅ 已核定为【Shift D】班次，今日必须在 18:00:00 之后签退，提前签退将被计为迟到/早退！`
2. **傍晚签退拦截**：
   - 若员工尝试在核定下班时间之前（例如 17:58）点击签退，系统弹出异步确认对话框（非原生 alert/confirm）：
     *“⚠️ 当前距离核定下班时间 (18:00) 还差 2 分钟！按照公司考勤制度，提前签退将直接按迟到/违规记录。确定要现在签退吗？”*

### 5.3 导出安全与公式注入防御 (CSV/Excel Injection)
- 写入 Excel 前，所有文本字段（尤其是备注、姓名）必须经过转义：
  ```javascript
  function sanitizeExcelCell(value) {
    if (typeof value !== 'string') return value;
    if (/^[=+@-]$/.test(value.charAt(0))) {
      return "'" + value;
    }
    return value;
  }
  ```
- 导出完成时，自动调用 `SystemLogger.audit` 留存不可变操作轨迹：
  ```javascript
  SystemLogger.audit(teamId, {
    action: 'EXPORT_ATTENDANCE_EXCEL',
    targetType: 'ATTENDANCE_REPORT',
    details: `导出全员考勤出勤月报 (${exportMonth})`
  });
  ```

---

## 6. 开发实施执行清单 (Implementation Checklist)

- [ ] **Step 1**：创建 `web/lib/cascade-shift-engine.js`，实现 `CascadeShiftEngine` 算法内核与单元测试；
- [ ] **Step 2**：创建 `web/lib/excel-exporter.js`，基于轻量前端引擎封装多 Sheet 生成、公式注入清洗与 Blob 保存；
- [ ] **Step 3**：扩展 `web/app/(dashboard)/analytics/page.js`：
  - 在考勤规则设置弹窗中增加 `shiftConfig` 班次时间与容差（`graceMinutes`）配置；
  - 在打卡记录 Tab 头部挂载 `导出考勤月报` 按钮，集成 Loading 态与防抖；
- [ ] **Step 4**：在 `web/app/(dashboard)/leaderboard/page.js` 考勤出勤榜挂载同步导出入口；
- [ ] **Step 5**：在 `web/components/AttendanceModal.js` 完善打卡成功提示与提前签退防呆确认；
- [ ] **Step 6**：增量同步记忆库文档（`memory/02_data_models.md`、`memory/06_roadmap.md`、`CHANGELOG.md`）。
