/**
 * Candidate Follow-up Management System
 * General Utilities & Helper Functions
 */

const Utils = {
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
   * Check if an input is a valid date (YYYY-MM-DD)
   */
  isValidDate(dateInput) {
    if (!dateInput) return false;
    const formatted = this.formatDate(dateInput);
    return formatted !== '-' && /^\d{4}-\d{2}-\d{2}$/.test(formatted);
  },

  /**
   * Format ISO date string to YYYY-MM-DD
   */
  formatDate(dateInput) {
    if (!dateInput) return '-';
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
    if (timeStr) {
      return `${this.formatDate(dateInput)} ${timeStr}`;
    }
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '-';
    const datePart = this.formatDate(d);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${datePart} ${hours}:${minutes}`;
  },

  /**
   * Format relative time (e.g. '2小时前', '3天前')
   */
  formatRelativeTime(dateInput) {
    if (!dateInput) return '-';
    const now = new Date();
    const d = new Date(dateInput);
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);

    if (diffSec < 60) return '刚刚';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小时前`;
    if (diffSec < 2592000) return `${Math.floor(diffSec / 86400)} 天前`;
    return this.formatDate(dateInput);
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
    }
  },

  getStageMeta(stageKey) {
    return this.STAGES[stageKey] || {
      key: stageKey,
      label: stageKey || '未知',
      badgeClass: 'badge',
      color: '#9497ab',
      stepIndex: 0
    };
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


};

window.Utils = Utils;
