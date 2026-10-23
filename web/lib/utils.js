/**
 * Candidate Follow-up Management System
 * General Utilities & Helper Functions
 */

export const Utils = {
  /**
   * Generate UUID v4
   */
  generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
  },

  /**
   * Escape HTML to prevent XSS injection (High performance, covers quotes)
   */
  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  /**
   * Sanitize URL to prevent javascript: pseudo-protocol XSS
   */
  sanitizeUrl(url) {
    if (!url) return '';
    const str = String(url).trim();
    if (/^(https?:\/\/)/i.test(str)) return str;
    return '';
  },

  /**
   * Normalize candidate notes to a clean string, safely handling both String and legacy Array formats.
   */
  normalizeCandidateNotes(notes) {
    if (!notes) return '';
    if (typeof notes === 'string') return notes.trim();
    if (Array.isArray(notes)) {
      return notes
        .map(item => {
          if (!item) return '';
          if (typeof item === 'string') return item.trim();
          if (typeof item === 'object') {
            const content = String(item.content || item.note || '').trim();
            if (!content) return '';
            const author = item.author ? `${String(item.author).trim()}: ` : '';
            const datePrefix = item.createdAt ? `[${String(item.createdAt).slice(0, 16).replace('T', ' ')}] ` : '';
            return `${datePrefix}${author}${content}`;
          }
          return '';
        })
        .filter(Boolean)
        .join('\n');
    }
    return String(notes).trim();
  },

  /**
   * Normalize phone number to its core digits (stripping non-digits and leading MY '60' or '0' prefix).
   */
  normalizePhoneCore(phone) {
    if (!phone) return '';
    const clean = String(phone).replace(/\D/g, '');
    if (!clean || clean.length < 7) return '';
    if (clean.startsWith('60') && clean.length >= 9) return clean.slice(2);
    if (clean.startsWith('0') && clean.length >= 8) return clean.slice(1);
    return clean;
  },

  /**
   * Generate common phone format variants for Firestore 'in' queries (max 10 items).
   */
  getPhoneVariants(phone) {
    if (!phone) return [];
    const rawTrimmed = String(phone).trim();
    const clean = rawTrimmed.replace(/\D/g, '');
    const core = this.normalizePhoneCore(clean);
    const variants = new Set();
    if (rawTrimmed) variants.add(rawTrimmed);
    if (clean) variants.add(clean);
    if (core && core.length >= 7) {
      variants.add(core);
      variants.add(`0${core}`);
      variants.add(`60${core}`);
      variants.add(`+60${core}`);
    }
    return Array.from(variants).filter(Boolean).slice(0, 10);
  },

  /**
   * Robust parser for interview dates and times from tables/inputs.
   * Handles DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, times like 10am, 2:30pm, 14:00, weekdays etc.
   * Returns { dateStr: 'YYYY-MM-DD' | '-', timeStr: 'HH:mm' | '' }
   */
  parseInterviewDateTime(dateInput, timeInput = '') {
    if (!dateInput && !timeInput) return { dateStr: '-', timeStr: '' };
    
    // Safety unwrap for Firestore Timestamps or serialized date objects
    if (dateInput && typeof dateInput === 'object') {
      if (dateInput instanceof Date) {
        // standard Date instance
      } else if (typeof dateInput.toDate === 'function') {
        dateInput = dateInput.toDate();
      } else if (typeof dateInput.seconds === 'number') {
        dateInput = new Date(dateInput.seconds * 1000);
      } else if (typeof dateInput._seconds === 'number') {
        dateInput = new Date(dateInput._seconds * 1000);
      } else {
        return { dateStr: '-', timeStr: '' };
      }
    }

    let str = String(dateInput || '').trim();
    let timeStr = String(timeInput || '').trim();

    // If time is not yet provided, attempt to extract from dateInput (e.g., '18/8/2026 10am', '21/8 Fri 14:30')
    if (!timeStr && str) {
      const ampmMatch = str.match(/(?:at\s*)?(\b\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
      const colMatch = str.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
      
      if (ampmMatch) {
        let hours = parseInt(ampmMatch[1], 10);
        let minutes = parseInt(ampmMatch[2] || '0', 10);
        const meridiem = (ampmMatch[3] || '').toLowerCase();
        if (meridiem === 'pm' && hours < 12) hours += 12;
        if (meridiem === 'am' && hours === 12) hours = 0;
        timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        str = str.replace(ampmMatch[0], '').trim();
      } else if (colMatch) {
        timeStr = `${String(colMatch[1]).padStart(2, '0')}:${String(colMatch[2]).padStart(2, '0')}`;
        str = str.replace(colMatch[0], '').trim();
      }
    }

    // Clean extraneous weekday tags
    let cleanDateStr = str
      .replace(/\b(mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
      .replace(/(周[一二三四五六日]|星期[一二三四五六日])/g, '')
      .replace(/[\(\)\[\]]/g, ' ')
      .trim();

    // Pattern 1: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    let m = cleanDateStr.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b/);
    if (m) {
      const day = String(m[1]).padStart(2, '0');
      const month = String(m[2]).padStart(2, '0');
      const year = m[3];
      return { dateStr: `${year}-${month}-${day}`, timeStr };
    }

    // Pattern 2: YYYY/MM/DD or YYYY-MM-DD
    m = cleanDateStr.match(/\b(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\b/);
    if (m) {
      const year = m[1];
      const month = String(m[2]).padStart(2, '0');
      const day = String(m[3]).padStart(2, '0');
      return { dateStr: `${year}-${month}-${day}`, timeStr };
    }

    // Pattern 3: DD/MM (without year, default to current year)
    m = cleanDateStr.match(/\b(\d{1,2})[\/\-\.](\d{1,2})\b/);
    if (m) {
      const day = String(m[1]).padStart(2, '0');
      const month = String(m[2]).padStart(2, '0');
      const year = new Date().getFullYear();
      return { dateStr: `${year}-${month}-${day}`, timeStr };
    }

    // Fallback: standard Date parse
    if (dateInput) {
      const d = new Date(dateInput);
      if (!isNaN(d.getTime())) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        if (!timeStr && (d.getHours() !== 0 || d.getMinutes() !== 0)) {
          timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        }
        return { dateStr: `${year}-${month}-${day}`, timeStr };
      }
    }

    // Strict safety fallback: If not a valid parseable date, return '-' to prevent dirty string pollution
    return { dateStr: '-', timeStr };
  },

  /**
   * Check if an input is a valid date (YYYY-MM-DD)
   */
  isValidDate(dateInput) {
    if (!dateInput) return false;
    const formatted = this.formatDate(dateInput);
    return formatted !== '-' && /^\d{4}-\d{2}-\d{2}$/.test(formatted);
  },

  /**
   * Format ISO date string or international table date (DD/MM/YYYY) to YYYY-MM-DD
   */
  formatDate(dateInput) {
    if (!dateInput) return '-';
    if (typeof dateInput === 'object') {
      if (dateInput instanceof Date) {
        if (isNaN(dateInput.getTime())) return '-';
        const year = dateInput.getFullYear();
        const month = String(dateInput.getMonth() + 1).padStart(2, '0');
        const day = String(dateInput.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      } else if (typeof dateInput.toDate === 'function') {
        dateInput = dateInput.toDate();
      } else if (typeof dateInput.seconds === 'number') {
        dateInput = new Date(dateInput.seconds * 1000);
      } else if (typeof dateInput._seconds === 'number') {
        dateInput = new Date(dateInput._seconds * 1000);
      } else {
        return '-';
      }
    }
    const parsed = this.parseInterviewDateTime(dateInput);
    if (parsed.dateStr && parsed.dateStr !== '-' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.dateStr)) {
      return parsed.dateStr;
    }
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '-';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  /**
   * Format ISO date string or date + time to YYYY-MM-DD HH:mm
   */
  formatDateTime(dateInput, timeStr = null) {
    if (!dateInput) return '-';
    const parsed = this.parseInterviewDateTime(dateInput, timeStr);
    const datePart = parsed.dateStr !== '-' ? parsed.dateStr : this.formatDate(dateInput);
    const finalTime = parsed.timeStr || timeStr || '';
    return finalTime ? `${datePart} ${finalTime}` : datePart;
  },

  /**
   * Generic and robust timestamp extraction in milliseconds for any record (Job Order, Candidate, etc.).
   * Handles Firestore Timestamp, Date object, ISO strings, and fallbacks to updatedAt.
   */
  getRecordTimestamp(record) {
    return this.getCandidateTimestamp(record);
  },

  /**
   * Robustly extract timestamp in milliseconds from a candidate record.
   * Handles Firestore Timestamp, Date, ISO strings, and fallbacks to stageHistory or updatedAt.
   */
  getCandidateTimestamp(candidate) {
    if (!candidate) return 0;
    const extractMs = (val) => {
      if (!val) return 0;
      if (typeof val === 'number') return val;
      if (typeof val.toMillis === 'function') return val.toMillis();
      if (typeof val.toDate === 'function') return val.toDate().getTime();
      if (val instanceof Date) return val.getTime();
      if (typeof val === 'object') {
        if (typeof val.seconds === 'number') return val.seconds * 1000;
        if (typeof val._seconds === 'number') return val._seconds * 1000;
      }
      if (typeof val === 'string') {
        let str = val.trim();
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(str)) str += 'Z';
        const ms = new Date(str).getTime();
        return isNaN(ms) ? 0 : ms;
      }
      return 0;
    };

    // 1. Try primary createdAt
    let ms = extractMs(candidate.createdAt);
    if (ms > 0) return ms;

    // 2. Try stageHistory movedAt (first entry represents record creation)
    if (Array.isArray(candidate.stageHistory) && candidate.stageHistory.length > 0) {
      ms = extractMs(candidate.stageHistory[0]?.movedAt);
      if (ms > 0) return ms;
    }

    // 3. Try updatedAt
    ms = extractMs(candidate.updatedAt);
    if (ms > 0) return ms;

    return 0;
  },

  /**
   * Format relative time (e.g. '2小时前', '3天前')
   */
  formatRelativeTime(dateInput, t = null, fallbackCandidate = null) {
    if (!dateInput && !fallbackCandidate) return '-';
    let d = null;
    if (typeof dateInput?.toDate === 'function') {
      d = dateInput.toDate();
    } else if (dateInput && typeof dateInput === 'object' && typeof dateInput.seconds === 'number') {
      d = new Date(dateInput.seconds * 1000);
    } else if (dateInput && typeof dateInput === 'object' && typeof dateInput._seconds === 'number') {
      d = new Date(dateInput._seconds * 1000);
    } else if (dateInput instanceof Date) {
      d = dateInput;
    } else if (dateInput && typeof dateInput !== 'object') {
      let str = String(dateInput || '').trim();
      // Normalize naive ISO strings from UTC backends (append Z)
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(str)) {
        str += 'Z';
      }
      d = new Date(str);
    }

    // Fallback if date is invalid or was corrupted object (e.g. { _methodName: 'serverTimestamp' })
    if (!d || isNaN(d.getTime())) {
      if (fallbackCandidate) {
        const fbMs = this.getCandidateTimestamp(fallbackCandidate);
        if (fbMs > 0) d = new Date(fbMs);
      }
    }
    if (!d || isNaN(d.getTime())) return '-';

    const now = new Date();
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);

    if (t) {
      if (diffSec < 60) return t('common.relativeJustNow', '刚刚');
      if (diffSec < 3600) return t('common.relativeMinutesAgo', { count: Math.floor(diffSec / 60) }, `${Math.floor(diffSec / 60)} 分钟前`);
      if (diffSec < 86400) return t('common.relativeHoursAgo', { count: Math.floor(diffSec / 3600) }, `${Math.floor(diffSec / 3600)} 小时前`);
      if (diffSec < 2592000) return t('common.relativeDaysAgo', { count: Math.floor(diffSec / 86400) }, `${Math.floor(diffSec / 86400)} 天前`);
    } else {
      let isEn = false;
      try {
        if (typeof window !== 'undefined' && localStorage.getItem('talent_flow_lang') === 'en') {
          isEn = true;
        }
      } catch (e) {}
      if (isEn) {
        if (diffSec < 60) return 'Just now';
        if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
        if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
        if (diffSec < 2592000) return `${Math.floor(diffSec / 86400)}d ago`;
      } else {
        if (diffSec < 60) return '刚刚';
        if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`;
        if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小时前`;
        if (diffSec < 2592000) return `${Math.floor(diffSec / 86400)} 天前`;
      }
    }
    return this.formatDate(d);
  },

  /**
   * Stage configuration metadata
   */
  STAGES: {
    screening: {
      key: 'screening',
      label: '简历筛选',
      badgeClass: 'badge-stage-screening',
      color: '#6366f1',
      stepIndex: 1
    },
    phone: {
      key: 'phone',
      label: '初筛电话',
      badgeClass: 'badge-stage-phone',
      color: '#3b82f6',
      stepIndex: 2
    },
    interview: {
      key: 'interview',
      label: '面试考核',
      badgeClass: 'badge-stage-interview',
      color: '#f59e0b',
      stepIndex: 3
    },
    offer: {
      key: 'offer',
      label: 'Offer 发放',
      badgeClass: 'badge-stage-offer',
      color: '#8b5cf6',
      stepIndex: 4
    },
    pre_onboarding: {
      key: 'pre_onboarding',
      label: '待入职跟进',
      badgeClass: 'badge-stage-pre-onboarding',
      color: '#0ea5e9',
      stepIndex: 5
    },
    onboarding: {
      key: 'onboarding',
      label: '正式入职',
      badgeClass: 'badge-stage-onboarding',
      color: '#10b981',
      stepIndex: 6
    },
    post_onboarding: {
      key: 'post_onboarding',
      label: '入职后关怀',
      badgeClass: 'badge-stage-post-onboarding',
      color: '#ec4899',
      stepIndex: 7
    },
    rejected: {
      key: 'rejected',
      label: '已淘汰 / 放弃',
      badgeClass: 'badge-stage-rejected',
      color: '#f43f5e',
      stepIndex: 99
    }
  },

  DROP_REASONS: [
    { key: 'offer_accepted_elsewhere', label: '已接其他Offer / 他家入职', category: 'candidate' },
    { key: 'salary_mismatch', label: '薪资待遇未达期望', category: 'candidate' },
    { key: 'location_mismatch', label: '工作地点太远 / 交通不便', category: 'candidate' },
    { key: 'working_hours_mismatch', label: '工时 / 班次无法接受', category: 'candidate' },
    { key: 'personal_reasons', label: '个人或家庭原因不考虑', category: 'candidate' },
    { key: 'interview_failed', label: '面试考核未通过', category: 'company' },
    { key: 'skills_mismatch', label: '技能背景 / 学历资历不符', category: 'company' },
    { key: 'headcount_filled', label: '岗位编制已满 / 暂停招聘', category: 'company' },
    { key: 'no_show_unreachable', label: '面试爽约 (No Show) / 失联', category: 'process' },
    { key: 'other', label: '其他原因 (自定义说明)', category: 'other' }
  ],

  getDropReasonLabel(reasonKeyOrText, t = null) {
    if (!reasonKeyOrText) return t ? t('common.dropReasons.unspecified', '未说明原因') : '未说明原因';
    const textStr = String(reasonKeyOrText).trim();
    const parts = textStr.split(' · ');
    const baseReason = parts[0].trim();
    const noteSuffix = parts.length > 1 ? ` · ${parts.slice(1).join(' · ').trim()}` : '';

    const found = this.DROP_REASONS.find(r => r.key === baseReason || r.label === baseReason);
    if (found) {
      const translated = t ? t(`common.dropReasons.${found.key}`, found.label) : found.label;
      return translated + noteSuffix;
    }
    return reasonKeyOrText;
  },

  getStageMeta(stageKey, t = null) {
    const meta = this.STAGES[stageKey] || {
      key: stageKey,
      label: stageKey || '未知',
      badgeClass: 'badge',
      color: '#9497ab',
      stepIndex: 0
    };
    if (t) {
      return {
        ...meta,
        label: t(`common.stages.${stageKey}`, meta.label)
      };
    }
    try {
      if (typeof window !== 'undefined' && localStorage.getItem('talent_flow_lang') === 'en') {
        const enStages = {
          screening: 'Screening',
          phone: 'Phone Screening',
          interview: 'Interviewing',
          offer: 'Offer Issued',
          pre_onboarding: 'Pre-onboarding',
          onboarding: 'Onboarded',
          post_onboarding: 'Post-onboarding'
        };
        if (enStages[stageKey]) return { ...meta, label: enStages[stageKey] };
      }
    } catch (e) {}
    return meta;
  },

  /**
   * Debounce helper
   */
  debounce(fn, delay = 250) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  /**
   * Download a JavaScript object as a JSON file
   */
  downloadJson(data, filename) {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `candidate-backup-${this.formatDate(new Date())}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  /**
   * Job Order Status Configuration & Metadata
   */
  JOB_ORDER_STATUSES: {
    open: { key: 'open', label: '招聘中', color: 'var(--accent-emerald)', bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.3)' },
    urgent: { key: 'urgent', label: '🔥 急聘', color: 'var(--accent-rose)', bg: 'rgba(244, 63, 94, 0.1)', border: 'rgba(244, 63, 94, 0.3)' },
    paused: { key: 'paused', label: '⏸️ 已暂停', color: 'var(--accent-amber)', bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)' },
    filled: { key: 'filled', label: '🤝 已招满', color: 'var(--accent-blue)', bg: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.3)' },
    closed: { key: 'closed', label: '已关闭', color: 'var(--text-muted)', bg: 'rgba(255, 255, 255, 0.05)', border: 'var(--border-subtle)' }
  },

  getJobOrderStatusMeta(statusKey, t = null) {
    const meta = this.JOB_ORDER_STATUSES[statusKey] || this.JOB_ORDER_STATUSES.open;
    if (t) {
      const labels = {
        open: t('orders.statusOpen') || t('orders.filterOpen') || meta.label,
        urgent: t('orders.statusUrgent') || t('orders.filterUrgent') || meta.label,
        paused: t('orders.statusPaused') || t('orders.filterPaused') || meta.label,
        filled: t('orders.statusFilled') || (t('components.orderDrawer.statusFilled') || meta.label),
        closed: t('orders.statusClosed') || t('orders.filterClosed') || meta.label
      };
      return { ...meta, label: labels[statusKey] || meta.label };
    }
    try {
      if (typeof window !== 'undefined' && localStorage.getItem('talent_flow_lang') === 'en') {
        const enJobStatus = {
          open: 'Open',
          urgent: '🔥 Urgent',
          paused: '⏸️ Paused',
          filled: '🤝 Filled',
          closed: 'Closed'
        };
        if (enJobStatus[statusKey]) return { ...meta, label: enJobStatus[statusKey] };
      }
    } catch (e) {}
    return meta;
  },

  /**
   * Build Google Calendar URL for pre-filling event and setting reminder
   * Strictly no emojis, clean business text formatting
   */
  buildGoogleCalendarUrl({ title, date, time, durationMinutes = 60, location = '', details = '' }) {
    if (!date || date === '-') return '';
    const encodedTitle = encodeURIComponent(title || '日程安排');
    const encodedLocation = encodeURIComponent(location || '');
    const encodedDetails = encodeURIComponent(details || '');

    let startDt;
    const dateParts = date.includes('-') ? date.split('-').map(Number) : null;
    
    if (dateParts && dateParts.length === 3) {
      const [year, month, day] = dateParts;
      if (time && /^\d{1,2}:\d{2}/.test(time)) {
        const [h, m] = time.split(':').map(Number);
        startDt = new Date(year, month - 1, day, h, m, 0);
      } else {
        startDt = new Date(year, month - 1, day, 10, 0, 0);
      }
    } else {
      startDt = new Date();
    }

    const endDt = new Date(startDt.getTime() + (durationMinutes * 60 * 1000));

    const formatGCalDate = (d) => {
      return d.toISOString().replace(/-|:|\.\d{3}/g, '');
    };

    const datesParam = `${formatGCalDate(startDt)}/${formatGCalDate(endDt)}`;

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodedTitle}&dates=${datesParam}&details=${encodedDetails}&location=${encodedLocation}`;
  },

  openGoogleCalendar(params) {
    const url = this.buildGoogleCalendarUrl(params);
    if (url && typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  },

  /**
   * Layer 1: Strict JSON Import Sanitizer & Anti-Prototype Pollution Engine (UAT IMP-03)
   * 1. Detects and strips __proto__, constructor, prototype in raw text & parsed objects.
   * 2. Uses Object.create(null) to store pure dictionaries.
   * 3. Whitelists candidate and jobOrder fields, discarding unknown/malicious injection keys.
   * 4. Sanitizes URLs, dates, and truncates abnormal lengths.
   * 5. Returns { valid, candidates, jobOrders, sanitizedCount, hasPollutionAttempt, error }
   */
  sanitizeJsonImport(rawInput) {
    let sanitizedCount = 0;
    let hasPollutionAttempt = false;

    let parsed;
    try {
      if (typeof rawInput === 'string') {
        // Fast-path text check for prototype pollution keys
        if (/["'](?:__proto__|constructor|prototype)["']\s*:/i.test(rawInput)) {
          hasPollutionAttempt = true;
          sanitizedCount++;
        }
        parsed = JSON.parse(rawInput);
      } else if (rawInput && typeof rawInput === 'object') {
        parsed = rawInput;
      } else {
        return { valid: false, error: '无效的数据格式 / Invalid data format', candidates: [], jobOrders: [], sanitizedCount: 0 };
      }
    } catch (e) {
      return { valid: false, error: 'JSON 解析错误 / JSON parse error: ' + e.message, candidates: [], jobOrders: [], sanitizedCount: 0 };
    }

    if (!parsed || typeof parsed !== 'object') {
      return { valid: false, error: '数据必须为有效的 JSON 对象或数组 / Data must be a valid JSON object or array', candidates: [], jobOrders: [], sanitizedCount: 0 };
    }

    let rawCandidates = [];
    let rawJobOrders = [];

    // 1. Direct Array format: [ { ... }, { ... } ]
    if (Array.isArray(parsed)) {
      rawCandidates = parsed;
    } 
    // 2. Object format: { candidates: [...] } or aliases { data: [...] }, { candidate: [...] }, { records: [...] }
    else {
      if (Array.isArray(parsed.candidates)) {
        rawCandidates = parsed.candidates;
      } else if (Array.isArray(parsed.data)) {
        rawCandidates = parsed.data;
      } else if (Array.isArray(parsed.candidate)) {
        rawCandidates = parsed.candidate;
      } else if (Array.isArray(parsed.records)) {
        rawCandidates = parsed.records;
      } else if (Array.isArray(parsed.list)) {
        rawCandidates = parsed.list;
      } else {
        // 3. Single candidate object or pure prototype attack probe
        const keys = Object.keys(parsed);
        const nonProtoKeys = keys.filter(k => k !== '__proto__' && k !== 'constructor' && k !== 'prototype');
        if (nonProtoKeys.length === 0 && hasPollutionAttempt) {
          // Pure prototype probe without candidate data: neutralized safely
          return {
            valid: true,
            candidates: [],
            jobOrders: [],
            sanitizedCount,
            hasPollutionAttempt: true,
            isPureProbe: true,
            message: '🛡️ 第一层安全防御已生效：已拦截并清除原型链污染攻击，未检测到有效候选人数据 / Security Layer 1 active: Prototype pollution blocked, no valid candidate records found.'
          };
        } else if (nonProtoKeys.length > 0) {
          // Single candidate object, auto-wrap
          rawCandidates = [parsed];
        }
      }

      if (Array.isArray(parsed.jobOrders)) {
        rawJobOrders = parsed.jobOrders;
      }
    }

    if (rawCandidates.length === 0 && rawJobOrders.length === 0) {
      if (hasPollutionAttempt) {
        return {
          valid: true,
          candidates: [],
          jobOrders: [],
          sanitizedCount,
          hasPollutionAttempt: true,
          isPureProbe: true,
          message: '🛡️ 第一层安全防御已生效：已拦截并清除原型链污染攻击，系统安全无污染 / Security Layer 1 active: Prototype pollution blocked, system is clean.'
        };
      }
      return { valid: false, error: '未找到候选人记录（支持标准备份对象或直接数组 [...]） / No candidate records found (supports backup object or array [...])', candidates: [], jobOrders: [], sanitizedCount: 0 };
    }

    const cleanCandidates = [];
    const cleanJobOrders = [];

    // Helper: safe string with max length
    const safeStr = (v, max = 200) => {
      if (v === null || v === undefined) return '';
      const s = String(v).trim();
      return s.length > max ? s.slice(0, max) : s;
    };

    // Helper: safe date
    const safeDate = (v) => {
      if (!v) return null;
      const s = String(v).trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
      return null;
    };

    // Helper: safe time
    const safeTime = (v) => {
      if (!v) return null;
      const s = String(v).trim();
      if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(s)) return s.slice(0, 5);
      return null;
    };

    const validStages = new Set(['screening', 'phone', 'interview', 'offer', 'pre_onboarding', 'onboarding', 'post_onboarding']);

    // Allowed candidate keys whitelist
    const allowedCandidateKeys = new Set([
      'id', 'name', 'phone', 'email', 'school', 'major', 'company', 'position', 'source',
      'stage', 'interviewDate', 'interviewTime', 'interviewDateRaw', 'interviewNotes',
      'intentionNotes', 'remarks', 'resumeUrl', 'tags', 'status', 'rejectedAt', 'rejectionReason',
      'reminders', 'notes', 'stageHistory', 'stageRemarks', 'workExperience', 'educationLevel',
      'expectedSalary', 'languages', 'skills', 'assignedTo', 'reappliedAt', 'sunriseCv',
      'createdAt', 'updatedAt'
    ]);

    for (const raw of rawCandidates) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        sanitizedCount++;
        continue;
      }

      // Check for forbidden prototype pollution keys & unknown non-whitelisted keys
      for (const k of Object.keys(raw)) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
          hasPollutionAttempt = true;
          sanitizedCount++;
        } else if (!allowedCandidateKeys.has(k)) {
          sanitizedCount++;
        }
      }

      // Create pure prototype-free dictionary
      const pure = Object.create(null);

      pure.id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : this.generateId();
      pure.name = safeStr(raw.name, 100) || '未命名候选人';
      pure.phone = safeStr(raw.phone, 50);
      pure.email = safeStr(raw.email, 100);
      pure.school = safeStr(raw.school, 100);
      pure.major = safeStr(raw.major, 100);
      pure.company = safeStr(raw.company, 100);
      pure.position = safeStr(raw.position, 100);
      pure.source = safeStr(raw.source, 50);
      pure.stage = validStages.has(raw.stage) ? raw.stage : 'screening';
      pure.interviewDate = safeDate(raw.interviewDate);
      pure.interviewTime = safeTime(raw.interviewTime);
      if (raw.interviewDateRaw) pure.interviewDateRaw = safeStr(raw.interviewDateRaw, 100);
      pure.interviewNotes = safeStr(raw.interviewNotes, 2000);
      pure.intentionNotes = safeStr(raw.intentionNotes, 2000);
      if (raw.remarks) pure.remarks = safeStr(raw.remarks, 2000);

      // XSS url sanitizer
      pure.resumeUrl = this.sanitizeUrl(raw.resumeUrl);

      // Tags array sanitizer
      pure.tags = Array.isArray(raw.tags)
        ? raw.tags.filter(t => typeof t === 'string').map(t => safeStr(t, 30)).slice(0, 50)
        : [];

      pure.status = ['active', 'rejected'].includes(raw.status) ? raw.status : 'active';
      pure.rejectedAt = safeDate(raw.rejectedAt);
      pure.rejectionReason = safeStr(raw.rejectionReason, 1000);

      // Reminders list sanitizer
      pure.reminders = Array.isArray(raw.reminders)
        ? raw.reminders.slice(0, 100).map(r => {
            if (!r || typeof r !== 'object') return null;
            const rPure = Object.create(null);
            rPure.id = typeof r.id === 'string' ? r.id : this.generateId();
            rPure.datetime = safeDate(r.datetime) || safeStr(r.datetime, 30);
            rPure.note = safeStr(r.note || r.content, 500);
            rPure.fired = Boolean(r.fired);
            rPure.createdAt = safeStr(r.createdAt, 40) || new Date().toISOString();
            return Object.assign({}, rPure);
          }).filter(Boolean)
        : [];

      // Notes sanitizer (compatible with both String and legacy Array)
      pure.notes = safeStr(this.normalizeCandidateNotes(raw.notes), 5000);

      // Stage history sanitizer
      pure.stageHistory = Array.isArray(raw.stageHistory)
        ? raw.stageHistory.slice(0, 50).map(h => {
            if (!h || typeof h !== 'object') return null;
            const hPure = Object.create(null);
            hPure.stage = validStages.has(h.stage) ? h.stage : 'screening';
            hPure.movedAt = safeStr(h.movedAt || h.timestamp, 40) || new Date().toISOString();
            return Object.assign({}, hPure);
          }).filter(Boolean)
        : [{ stage: pure.stage, movedAt: new Date().toISOString() }];

      if (raw.educationLevel) pure.educationLevel = safeStr(raw.educationLevel, 50);
      if (raw.expectedSalary) pure.expectedSalary = safeStr(raw.expectedSalary, 50);
      if (raw.workExperience) pure.workExperience = safeStr(raw.workExperience, 3000);
      if (raw.languages) pure.languages = Array.isArray(raw.languages) ? raw.languages.slice(0, 20).map(l => safeStr(l, 30)) : safeStr(raw.languages, 200);
      if (raw.skills) pure.skills = Array.isArray(raw.skills) ? raw.skills.slice(0, 50).map(s => safeStr(s, 30)) : safeStr(raw.skills, 200);
      if (raw.assignedTo) pure.assignedTo = safeStr(raw.assignedTo, 100);
      if (raw.reappliedAt) pure.reappliedAt = safeStr(raw.reappliedAt, 40);

      pure.createdAt = safeStr(raw.createdAt, 40) || new Date().toISOString();
      pure.updatedAt = safeStr(raw.updatedAt, 40) || new Date().toISOString();

      // Convert pure dictionary to plain object for consumer
      cleanCandidates.push(Object.assign({}, pure));
    }

    // Allowed job order keys whitelist
    const allowedOrderKeys = new Set(['id', 'title', 'company', 'department', 'headcount', 'status', 'salaryRange', 'requirements', 'notes', 'createdAt', 'updatedAt']);
    for (const raw of rawJobOrders) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        sanitizedCount++;
        continue;
      }
      for (const k of Object.keys(raw)) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
          hasPollutionAttempt = true;
          sanitizedCount++;
        } else if (!allowedOrderKeys.has(k)) {
          sanitizedCount++;
        }
      }
      const pure = Object.create(null);
      pure.id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : this.generateId();
      pure.title = safeStr(raw.title, 100) || '未命名需求';
      pure.company = safeStr(raw.company, 100);
      pure.department = safeStr(raw.department, 100);
      pure.headcount = typeof raw.headcount === 'number' ? raw.headcount : parseInt(raw.headcount, 10) || 1;
      pure.status = ['open', 'closed', 'paused'].includes(raw.status) ? raw.status : 'open';
      pure.salaryRange = safeStr(raw.salaryRange, 50);
      pure.requirements = safeStr(raw.requirements, 2000);
      pure.notes = safeStr(raw.notes, 2000);
      pure.createdAt = safeStr(raw.createdAt, 40) || new Date().toISOString();
      pure.updatedAt = safeStr(raw.updatedAt, 40) || new Date().toISOString();

      cleanJobOrders.push(Object.assign({}, pure));
    }

    return {
      valid: true,
      candidates: cleanCandidates,
      jobOrders: cleanJobOrders,
      sanitizedCount,
      hasPollutionAttempt
    };
  }
};
