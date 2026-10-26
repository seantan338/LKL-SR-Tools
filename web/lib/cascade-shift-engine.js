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
   */
  static matchShift(firstIn, customConfig) {
    const config = this.getEffectiveConfig(customConfig);
    const firstInDate = this.toSafeDate(firstIn);
    const lastShift = (config.shifts && config.shifts.length > 0)
      ? config.shifts[config.shifts.length - 1]
      : { id: 'shift_d', name: 'Shift D (9:00am - 6:00pm)', startTime: '09:00', endTime: '18:00' };
    const lastEndMin = this.parseTimeToMinutes(lastShift.endTime);

    // 未能解析合法时间戳：安全回退至最迟班次并标记迟到
    if (!firstInDate) {
      return {
        id: lastShift.id,
        name: lastShift.name,
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
      name: `${lastShift.name} (迟到)`,
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
   */
  static resolveDailyShift(dayEvents = [], customConfig) {
    const config = this.getEffectiveConfig(customConfig);

    if (!Array.isArray(dayEvents) || dayEvents.length === 0) {
      return {
        hasAttendance: false,
        firstIn: null,
        lastOut: null,
        clockInStr: '未打卡',
        clockOutStr: '未打卡',
        shift: null,
        durationHours: null,
        compliance: 'ABSENT',
        complianceLabel: '缺勤',
        isCompliant: false,
        isViolation: false,
        isMissingPunch: true,
        isLate: false,
        note: '全天无打卡记录'
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
        clockInStr: '未打卡',
        clockOutStr: '未打卡',
        shift: null,
        durationHours: null,
        compliance: 'ABSENT',
        complianceLabel: '缺勤',
        isCompliant: false,
        isViolation: false,
        isMissingPunch: true,
        isLate: false,
        note: '打卡时间戳异常'
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
      const shift = this.matchShift(firstIn, config);
      return {
        hasAttendance: true,
        firstIn,
        lastOut: null,
        clockInStr: this.formatTime(firstIn),
        clockOutStr: '未打卡 (Missed)',
        shift,
        durationHours: null,
        compliance: 'MISSED_OUT',
        complianceLabel: '⚠️ 下班未打卡',
        isCompliant: false,
        isViolation: shift.isLateArrival,
        isMissingPunch: true,
        isLate: shift.isLateArrival,
        note: `已完成上班签到(${this.formatTime(firstIn)})，下班未打卡`
      };
    }

    // 4. 场景 B：只有签退，无签到
    if (!firstIn && lastOut) {
      return {
        hasAttendance: true,
        firstIn: null,
        lastOut,
        clockInStr: '未打卡 (Missed)',
        clockOutStr: this.formatTime(lastOut),
        shift: { name: '未定班次', endStr: '-' },
        durationHours: null,
        compliance: 'MISSED_IN',
        complianceLabel: '⚠️ 上班未打卡',
        isCompliant: false,
        isViolation: false,
        isMissingPunch: true,
        isLate: false,
        note: `仅记录下班签退(${this.formatTime(lastOut)})，上班缺卡`
      };
    }

    // 5. 场景 C：签到与签退时间相同，或间隔 < 30 分钟（疑似连击误触防呆）
    const durationMs = lastOut.getTime() - firstIn.getTime();
    const durationMinutes = durationMs / (1000 * 60);
    const shift = this.matchShift(firstIn, config);

    if (durationMinutes < 30) {
      return {
        hasAttendance: true,
        firstIn,
        lastOut,
        clockInStr: this.formatTime(firstIn),
        clockOutStr: `${this.formatTime(lastOut)} (异常)`,
        shift,
        durationHours: null,
        compliance: 'ABNORMAL_PUNCH',
        complianceLabel: '⚠️ 异常签退 (疑似误触)',
        isCompliant: false,
        isViolation: true,
        isMissingPunch: true,
        isLate: shift.isLateArrival,
        note: `签退与签到间隔仅 ${Math.max(0, Math.round(durationMinutes))} 分钟，疑似手滑误触，需核实离岗时间`
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
        ? `${Math.floor(earlySeconds / 60)}分${earlySeconds % 60}秒`
        : `${earlySeconds}秒`;

      return {
        hasAttendance: true,
        firstIn,
        lastOut,
        clockInStr: this.formatTime(firstIn),
        clockOutStr: this.formatTime(lastOut),
        shift,
        durationHours,
        compliance: 'EARLY_LEAVE_AS_LATE',
        complianceLabel: `❌ 违规早退 (提前${earlyDesc}计迟到)`,
        isCompliant: false,
        isViolation: true,
        isMissingPunch: false,
        isLate: true, // 按老板要求统一计为迟到
        note: `未达核定班次下班底线 ${shift.endStr}，提前 ${earlyDesc} 签退`
      };
    }

    // 上班迟到（超9点档）但下班时间达标
    if (shift.isLateArrival) {
      return {
        hasAttendance: true,
        firstIn,
        lastOut,
        clockInStr: this.formatTime(firstIn),
        clockOutStr: this.formatTime(lastOut),
        shift,
        durationHours,
        compliance: 'LATE_COMPLETED',
        complianceLabel: '⚠️ 迟到完成 (上班迟到)',
        isCompliant: false,
        isViolation: true,
        isMissingPunch: false,
        isLate: true,
        note: `上班迟到(${this.formatTime(firstIn)})，已于 ${this.formatTime(lastOut)} 满勤签退`
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
      complianceLabel: '✅ 达标完成',
      isCompliant: true,
      isViolation: false,
      isMissingPunch: false,
      isLate: false,
      note: '考勤阶梯工时达标'
    };
  }
}
