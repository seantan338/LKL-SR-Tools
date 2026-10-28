/**
 * TALENT FLOW - 阶梯式级联考勤与异常容错判定内核 (CascadeShiftEngine)
 * 严格执行老板要求的阶梯顺延工时、提前签退绝杀及漏卡/误触容错
 */

export const DEFAULT_SHIFT_CONFIG = {
  enabled: true,
  graceMinutes: 0, // 零打卡冗余（8:30:00 前算 8:30，8:31 绝不算）
  strictClockOut: true, // 提前签退按迟到计
  shifts: [
    { id: 'shift_a', name: 'Shift A (7:30am - 4:30pm)', startTime: '07:30', endTime: '16:30' },
    { id: 'shift_b', name: 'Shift B (8:00am - 5:00pm)', startTime: '08:00', endTime: '17:00' },
    { id: 'shift_c', name: 'Shift C (8:30am - 5:30pm)', startTime: '08:30', endTime: '17:30' },
    { id: 'shift_d', name: 'Shift D (9:00am - 6:00pm)', startTime: '09:00', endTime: '18:00' }
  ]
};

export const CASCADE_I18N = {
  zh: {
    notClocked: '未打卡',
    notClockedMissed: '未打卡 (Missed)',
    absent: '缺勤',
    noRecord: '全天无打卡记录',
    invalidTs: '打卡时间戳异常',
    inProgress: '💼 工作中 (在岗)',
    inProgressNote: '今日进行中，待下班打卡',
    missedOut: '⚠️ 下班未打卡',
    missedOutNote: (inTime) => `已完成上班签到(${inTime})，下班未打卡`,
    missedIn: '⚠️ 上班未打卡',
    missedInNote: (outTime) => `仅记录下班签退(${outTime})，上班缺卡`,
    unassignedShift: '未定班次',
    abnormalTouch: '⚠️ 异常签退 (疑似误触)',
    abnormalTouchNote: (min) => `签退与签到间隔仅 ${min} 分钟，疑似手滑误触，需核实离岗时间`,
    abnormalOut: (time) => `${time} (异常)`,
    earlyDescMinSec: (m, s) => `${m}分${s}秒`,
    earlyDescSec: (s) => `${s}秒`,
    earlyLeave: (desc) => `❌ 违规早退 (提前${desc}计迟到)`,
    earlyLeaveNote: (endStr, desc) => `未达核定班次下班底线 ${endStr}，提前 ${desc} 签退`,
    lateArrival: '⚠️ 迟到完成 (上班迟到)',
    lateArrivalNote: (inTime, outTime) => `上班迟到(${inTime})，已于 ${outTime} 满勤签退`,
    compliant: '✅ 达标完成',
    compliantNote: '考勤阶梯工时达标',
    lateSuffix: ' (迟到)',
    overriddenTag: '[主管调整]',
    overrideHint: '经主管人工调整'
  },
  en: {
    notClocked: 'Not Clocked',
    notClockedMissed: 'Missed Punch',
    absent: 'Absent',
    noRecord: 'No punch records for the day',
    invalidTs: 'Invalid punch timestamp',
    inProgress: '💼 On Duty',
    inProgressNote: 'In progress today, awaiting clock out',
    missedOut: '⚠️ Missing Clock-Out',
    missedOutNote: (inTime) => `Clock-in recorded (${inTime}), missed clock-out`,
    missedIn: '⚠️ Missing Clock-In',
    missedInNote: (outTime) => `Clock-out recorded (${outTime}), missed morning clock-in`,
    unassignedShift: 'Unassigned Shift',
    abnormalTouch: '⚠️ Suspicious Quick Clock-Out',
    abnormalTouchNote: (min) => `Interval between in/out is only ${min} min, suspicious touch`,
    abnormalOut: (time) => `${time} (Abnormal)`,
    earlyDescMinSec: (m, s) => `${m}m ${s}s`,
    earlyDescSec: (s) => `${s}s`,
    earlyLeave: (desc) => `❌ Early Departure (${desc} early, counted as late)`,
    earlyLeaveNote: (endStr, desc) => `Failed to meet cutoff ${endStr}, punched out ${desc} early`,
    lateArrival: '⚠️ Late Arrival Completed',
    lateArrivalNote: (inTime, outTime) => `Late arrival (${inTime}), completed shift at ${outTime}`,
    compliant: '✅ Compliant',
    compliantNote: 'Shift hours requirement fulfilled',
    lateSuffix: ' (Late)',
    overriddenTag: '[Adjusted]',
    overrideHint: 'Manually adjusted by manager'
  }
};

export class CascadeShiftEngine {
  /**
   * 将 'HH:mm' 或 'HH:mm:ss' 转换为从 0 点起的分钟数
   * @param {string} timeStr - 如 '08:30' 或 '08:30:00'
   * @returns {number} 分钟数
   */
  static parseTimeToMinutes(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    const parts = timeStr.trim().split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    const s = parseInt(parts[2], 10) || 0;
    return h * 60 + m + s / 60;
  }

  /**
   * 将 Date 转换为当日从 0 点起的总分钟数
   * @param {Date} date
   * @returns {number}
   */
  static getDateMinutesOfDay(date) {
    if (!date || isNaN(date.getTime())) return 0;
    return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  }

  /**
   * 格式化 Date 为 HH:mm:ss
   * @param {Date} date
   * @returns {string}
   */
  static formatTime(date) {
    if (!date || isNaN(date.getTime())) return '-';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  /**
   * 安全转换 Firestore Timestamp / Date / 毫秒数 / ISO string 为合法 Date
   * @param {any} val
   * @returns {Date|null}
   */
  static toSafeDate(val) {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    if (typeof val?.toDate === 'function') {
      const d = val.toDate();
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof val?.toMillis === 'function') {
      return new Date(val.toMillis());
    }
    if (typeof val?.seconds === 'number') {
      return new Date(val.seconds * 1000 + (val.nanoseconds ? Math.floor(val.nanoseconds / 1000000) : 0));
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }

  /**
   * 获取生效的班次配置（带回退）
   */
  static getEffectiveConfig(customConfig) {
    if (!customConfig || typeof customConfig !== 'object') {
      return DEFAULT_SHIFT_CONFIG;
    }
    return {
      enabled: customConfig.enabled !== false,
      graceMinutes: typeof customConfig.graceMinutes === 'number' ? Math.max(0, customConfig.graceMinutes) : 0,
      strictClockOut: customConfig.strictClockOut !== false,
      shifts: Array.isArray(customConfig.shifts) && customConfig.shifts.length > 0
        ? [...customConfig.shifts].sort((a, b) => this.parseTimeToMinutes(a.startTime) - this.parseTimeToMinutes(b.startTime))
        : DEFAULT_SHIFT_CONFIG.shifts
    };
  }

  /**
   * 阶梯匹配班次（严格执行零打卡冗余与管理员配置容差）
   * @param {Date} firstIn - 首次签到时间
   * @param {object} [customConfig] - 考勤规则中的 shiftConfig
   * @param {object} [options] - 可选配置，如 { locale: 'zh' | 'en' }
   */
  static matchShift(firstIn, customConfig, { locale = 'zh' } = {}) {
    const config = this.getEffectiveConfig(customConfig);
    const firstInDate = this.toSafeDate(firstIn);
    const labels = CASCADE_I18N[locale] || CASCADE_I18N.zh;
    const lastShift = (config.shifts && config.shifts.length > 0)
      ? config.shifts[config.shifts.length - 1]
      : { id: 'shift_d', name: 'Shift D (9:00am - 6:00pm)', startTime: '09:00', endTime: '18:00' };
    const lastEndMin = this.parseTimeToMinutes(lastShift.endTime);

    // 未能解析合法时间戳：安全回退至最迟班次并标记迟到
    if (!firstInDate) {
      return {
        id: lastShift.id,
        name: `${lastShift.name}${labels.lateSuffix}`,
        baseName: lastShift.name,
        startTime: lastShift.startTime,
        endTime: lastShift.endTime,
        endMinutes: lastEndMin,
        endStr: `${lastShift.endTime}:00`,
        isLateArrival: true,
        isFallback: true
      };
    }

    // 精确到秒级整分钟包含制（Minute-inclusive Window: 包含目标分钟的 00~59 秒）
    const inSeconds = firstInDate.getHours() * 3600 + firstInDate.getMinutes() * 60 + firstInDate.getSeconds();
    const grace = config.graceMinutes || 0;

    for (const s of config.shifts) {
      const parts = s.startTime.split(':');
      const baseHour = parseInt(parts[0], 10) || 0;
      const baseMin = parseInt(parts[1], 10) || 0;
      // 截止秒数严格设定为目标分钟末尾 59 秒 (例如 8:30 档即 08:30:59)
      const cutoffSeconds = (baseHour * 60 + baseMin + grace) * 60 + 59;

      // 整分钟包含制匹配：只要未跨入下一分钟 (例如 08:30:59 及之前)，均算在该班次内
      // 只有当时钟正式跳到 08:31:00 时，才判定为超时滚入下一班次
      if (inSeconds <= cutoffSeconds) {
        const endMin = this.parseTimeToMinutes(s.endTime);
        return {
          id: s.id,
          name: s.name,
          baseName: s.name,
          startTime: s.startTime,
          endTime: s.endTime,
          endMinutes: endMin,
          endStr: `${s.endTime}:00`,
          isLateArrival: false
        };
      }
    }

    // 超过所有允许班次（严重迟到对不上任何班次）：直接指派归入最迟班次（如 Shift D），继承最迟班次的下班达标底线（如 18:00），同时标记迟到
    return {
      id: lastShift.id,
      name: `${lastShift.name}${labels.lateSuffix}`,
      baseName: lastShift.name,
      startTime: lastShift.startTime,
      endTime: lastShift.endTime,
      endMinutes: lastEndMin,
      endStr: `${lastShift.endTime}:00`,
      isLateArrival: true
    };
  }

  /**
   * 核心单日考勤判定机理（输入单日事件流，输出合规画像）
   * @param {Array<object>} dayEvents - 当天由 Firestore logs / attendance 汇聚的打卡流水
   * @param {object} [customConfig] - 考勤 shiftConfig 配置
   * @param {object} [options] - 可选配置，如 { locale: 'zh' | 'en', overrideShift?: object | string, isToday?: boolean }
   */
  static resolveDailyShift(dayEvents = [], customConfig, { locale = 'zh', overrideShift = null, isToday = false } = {}) {
    const config = this.getEffectiveConfig(customConfig);
    const labels = CASCADE_I18N[locale] || CASCADE_I18N.zh;

    // 解析主管人工改派班次 (Manual Override Shift)
    let manualShift = null;
    if (overrideShift) {
      if (typeof overrideShift === 'object') {
        const targetId = overrideShift.shiftId || overrideShift.id;
        const matched = config.shifts.find(s => s.id === targetId);
        const base = matched || overrideShift;
        const endMinutes = base.endTime ? this.parseTimeToMinutes(base.endTime) : (base.endMinutes || 18 * 60);
        manualShift = {
          id: base.id || targetId || 'override_shift',
          name: base.name || (matched ? matched.name : 'Custom Shift'),
          baseName: base.baseName || base.name || (matched ? matched.name : 'Custom Shift'),
          startTime: base.startTime || '09:00',
          endTime: base.endTime || '18:00',
          endMinutes,
          endStr: `${base.endTime || '18:00'}:00`,
          isLateArrival: false,
          isOverridden: true,
          overrideReason: overrideShift.reason || '',
          overrideBy: overrideShift.overrideBy || '',
          overrideAt: overrideShift.overrideAt || null
        };
      } else if (typeof overrideShift === 'string') {
        const matched = config.shifts.find(s => s.id === overrideShift);
        if (matched) {
          const endMinutes = this.parseTimeToMinutes(matched.endTime);
          manualShift = {
            id: matched.id,
            name: matched.name,
            baseName: matched.name,
            startTime: matched.startTime,
            endTime: matched.endTime,
            endMinutes,
            endStr: `${matched.endTime}:00`,
            isLateArrival: false,
            isOverridden: true
          };
        }
      }
    }

    if (!Array.isArray(dayEvents) || dayEvents.length === 0) {
      return {
        hasAttendance: false,
        firstIn: null,
        lastOut: null,
        clockInStr: labels.notClocked,
        clockOutStr: labels.notClocked,
        shift: manualShift || null,
        durationHours: null,
        compliance: 'ABSENT',
        complianceLabel: labels.absent,
        isCompliant: false,
        isViolation: false,
        isMissingPunch: true,
        isLate: false,
        note: labels.noRecord
      };
    }

    // 1. 标准化事件时间与类型
    const normalized = dayEvents
      .map(e => ({
        ...e,
        dateObj: this.toSafeDate(e.timestamp || e.dateObj || e.createdAt),
        type: e.type || e.action || 'CLOCK_IN'
      }))
      .filter(e => e.dateObj !== null);

    if (normalized.length === 0) {
      return {
        hasAttendance: false,
        firstIn: null,
        lastOut: null,
        clockInStr: labels.notClocked,
        clockOutStr: labels.notClocked,
        shift: manualShift || null,
        durationHours: null,
        compliance: 'ABSENT',
        complianceLabel: labels.absent,
        isCompliant: false,
        isViolation: false,
        isMissingPunch: true,
        isLate: false,
        note: labels.invalidTs
      };
    }

    // 2. 提取打卡：区分上班签到 (CLOCK_IN) 与下班签退 (CLOCK_OUT)
    const inEvents = normalized.filter(e => e.type === 'CLOCK_IN' || e.type === 'CHECK_IN');
    const outEvents = normalized.filter(e => e.type === 'CLOCK_OUT' || e.type === 'CHECK_OUT');

    let firstIn = null;
    let lastOut = null;

    if (inEvents.length > 0) {
      firstIn = inEvents.reduce((earliest, cur) => cur.dateObj < earliest ? cur.dateObj : earliest, inEvents[0].dateObj);
    }
    if (outEvents.length > 0) {
      lastOut = outEvents.reduce((latest, cur) => cur.dateObj > latest ? cur.dateObj : latest, outEvents[0].dateObj);
    }

    // 兼容历史老数据：如果全天只有一条记录且未标记明确类型，默认为首次打卡
    if (!firstIn && !lastOut && normalized.length > 0) {
      firstIn = normalized[0].dateObj;
    }

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

    // 4. 场景 B：只有签退，无签到
    if (!firstIn && lastOut) {
      return {
        hasAttendance: true,
        firstIn: null,
        lastOut,
        clockInStr: labels.notClockedMissed,
        clockOutStr: this.formatTime(lastOut),
        shift: manualShift || { name: labels.unassignedShift, endStr: '-' },
        durationHours: null,
        compliance: 'MISSED_IN',
        complianceLabel: labels.missedIn,
        isCompliant: false,
        isInProgress: false,
        isViolation: false,
        isMissingPunch: true,
        isLate: false,
        note: labels.missedInNote(this.formatTime(lastOut))
      };
    }

    // 5. 场景 C：签到与签退时间相同，或间隔 < 30 分钟（疑似连击误触防呆）
    const durationMs = lastOut.getTime() - firstIn.getTime();
    const durationMinutes = durationMs / (1000 * 60);
    const shift = manualShift || this.matchShift(firstIn, config, { locale });

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

    // 6. 场景 D：正常上下班时长核对 & 提前签退绝杀判定
    const actualOutMinutes = this.getDateMinutesOfDay(lastOut);
    const requiredEndMinutes = shift.endMinutes;
    const durationHours = Number((durationMinutes / 60).toFixed(1));

    // 提前签退（哪怕只提前 1 秒）
    if (config.strictClockOut && actualOutMinutes < requiredEndMinutes) {
      const earlySeconds = Math.round((requiredEndMinutes - actualOutMinutes) * 60);
      const earlyDesc = earlySeconds >= 60
        ? labels.earlyDescMinSec(Math.floor(earlySeconds / 60), earlySeconds % 60)
        : labels.earlyDescSec(earlySeconds);

      return {
        hasAttendance: true,
        firstIn,
        lastOut,
        clockInStr: this.formatTime(firstIn),
        clockOutStr: this.formatTime(lastOut),
        shift,
        durationHours,
        compliance: 'EARLY_LEAVE_AS_LATE',
        complianceLabel: labels.earlyLeave(earlyDesc),
        isCompliant: false,
        isViolation: true,
        isMissingPunch: false,
        isLate: true, // 按老板要求统一计为迟到
        note: labels.earlyLeaveNote(shift.endStr, earlyDesc)
      };
    }

    // 上班迟到（超9点档）但下班时间达标（若主管人工特批改派，则不计迟到）
    if (shift.isLateArrival && !shift.isOverridden) {
      return {
        hasAttendance: true,
        firstIn,
        lastOut,
        clockInStr: this.formatTime(firstIn),
        clockOutStr: this.formatTime(lastOut),
        shift,
        durationHours,
        compliance: 'LATE_COMPLETED',
        complianceLabel: labels.lateArrival,
        isCompliant: false,
        isViolation: true,
        isMissingPunch: false,
        isLate: true,
        note: labels.lateArrivalNote(this.formatTime(firstIn), this.formatTime(lastOut))
      };
    }

    // 完美达标
    return {
      hasAttendance: true,
      firstIn,
      lastOut,
      clockInStr: this.formatTime(firstIn),
      clockOutStr: this.formatTime(lastOut),
      shift,
      durationHours,
      compliance: 'COMPLIANT',
      complianceLabel: `${labels.compliant}${shift.isOverridden ? ` ${labels.overriddenTag}` : ''}`,
      isCompliant: true,
      isViolation: false,
      isMissingPunch: false,
      isLate: false,
      note: shift.isOverridden ? (shift.overrideReason ? `${labels.overrideHint}: ${shift.overrideReason}` : labels.overrideHint) : labels.compliantNote
    };
  }
}
