/**
 * Candidate Follow-up Management System
 * LocalStorage Data Layer: Candidates, TagStore & Custom Reminders
 */

const STORAGE_KEYS = {
  CANDIDATES: 'agy_candidates_data_v1',
  TAGS: 'agy_tags_pool_v1',
  SETTINGS: 'agy_app_settings_v1',
  JOB_ORDERS: 'agy_job_orders_v1'
};

class DataStore {
  constructor() {
    this.candidates = [];
    this.jobOrders = [];
    this.tagPool = {
      companies: {}, // { "字节跳动": count }
      positions: {}, // { "前端开发实习生": count }
      sources: {},   // { "Boss直聘": count }
      customTags: {}
    };
    this.listeners = [];
  }

  /**
   * Load from LocalStorage or Electron File System
   */
  async loadFromStorage() {
    try {
      if (window.electronAPI) {
        let rawData = null;
        let password = null;

        const isEncrypted = await window.electronAPI.isEncrypted();
        if (isEncrypted) {
          while (true) {
            password = await App.promptDialog('请输入数据解密密码', '该备份文件已加密。');
            if (password === null) {
              App.showToast('已取消解密，系统将使用空数据启动。', 'warning');
              break;
            }
            App.showToast('正在解密数据，请稍候...', 'info');
            // Give UI a chance to render the toast before blocking if main process lag occurs
            await new Promise(r => setTimeout(r, 50)); 
            const res = await window.electronAPI.readData(password);
            if (res && res.error === 'decrypt_failed') {
              App.showToast('解密失败：密码错误或文件已损坏，请重试。', 'danger');
              continue;
            }
            rawData = res;
            // 如果密码正确，通知主进程记住
            await window.electronAPI.setEncryptionPassword(password);
            break;
          }
        } else {
          rawData = await window.electronAPI.readData();
        }

        if (rawData) {
          this.candidates = rawData.candidates || [];
          this.jobOrders = rawData.jobOrders || [];
          this.tagPool = rawData.tagPool || { companies: {}, positions: {}, sources: {}, customTags: {} };
        } else {
          this.candidates = [];
          this.jobOrders = [];
          this.tagPool = { companies: {}, positions: {}, sources: {}, customTags: {} };
        }
      } else {
        const rawCandidates = localStorage.getItem(STORAGE_KEYS.CANDIDATES);
        this.candidates = rawCandidates ? JSON.parse(rawCandidates) : [];

        const rawJobOrders = localStorage.getItem(STORAGE_KEYS.JOB_ORDERS);
        this.jobOrders = rawJobOrders ? JSON.parse(rawJobOrders) : [];

        const rawTags = localStorage.getItem(STORAGE_KEYS.TAGS);
        this.tagPool = rawTags ? JSON.parse(rawTags) : { companies: {}, positions: {}, sources: {}, customTags: {} };
      }
    } catch (err) {
      console.error('Failed to load from storage:', err);
      this.candidates = [];
      this.jobOrders = [];
      this.tagPool = { companies: {}, positions: {}, sources: {}, customTags: {} };
    }
  }

  /**
   * Save to LocalStorage or Electron File System
   */
  saveToStorage() {
    try {
      if (window.electronAPI) {
        window.electronAPI.writeData(JSON.stringify({
          candidates: this.candidates,
          jobOrders: this.jobOrders,
          tagPool: this.tagPool
        }));
      } else {
        localStorage.setItem(STORAGE_KEYS.CANDIDATES, JSON.stringify(this.candidates));
        localStorage.setItem(STORAGE_KEYS.JOB_ORDERS, JSON.stringify(this.jobOrders));
        localStorage.setItem(STORAGE_KEYS.TAGS, JSON.stringify(this.tagPool));
      }
      this.notifyListeners();
    } catch (err) {
      console.error('Failed to save to storage:', err);
    }
  }

  /**
   * Event subscription
   */
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  notifyListeners() {
    this.listeners.forEach(cb => {
      try {
        cb(this.candidates);
      } catch (err) {
        console.error('Listener callback error:', err);
      }
    });
  }

  /* ========================================================================
     Tag Pool Management (Dynamic Computation)
     ======================================================================== */
  getTags(category, query = '') {
    const dict = {};
    
    // dynamically compute from current candidates
    this.candidates.forEach(c => {
      let values = [];
      if (category === 'companies' && c.company) values.push(c.company);
      if (category === 'positions' && c.position) values.push(c.position);
      if (category === 'sources' && c.source) values.push(c.source);
      if (category === 'customTags' && Array.isArray(c.tags)) values = c.tags;
      
      values.forEach(v => {
        const name = v.trim();
        if (name) {
          dict[name] = (dict[name] || 0) + 1;
        }
      });
    });

    // Also dynamically include from current recruitment job orders
    if (Array.isArray(this.jobOrders)) {
      this.jobOrders.forEach(o => {
        if (category === 'companies' && o.company) {
          const name = o.company.trim();
          if (name) dict[name] = (dict[name] || 0) + 1;
        }
        if (category === 'positions' && o.position) {
          const name = o.position.trim();
          if (name) dict[name] = (dict[name] || 0) + 1;
        }
      });
    }

    const q = query.trim().toLowerCase();
    
    // Sort tags by frequency descending
    const sorted = Object.entries(dict)
      .filter(([name]) => !q || name.toLowerCase().includes(q))
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    return sorted;
  }

  /* ========================================================================
     Candidate CRUD
     ======================================================================== */
  getAllCandidates() {
    return [...this.candidates];
  }

  getCandidateById(id) {
    return this.candidates.find(c => c.id === id) || null;
  }

  addCandidate(data) {
    const now = new Date().toISOString();
    const company = (data.company || '').trim();
    const position = (data.position || '').trim();
    const source = (data.source || '').trim();

    const candidate = {
      id: Utils.generateId(),
      name: (data.name || '').trim(),
      phone: (data.phone || '').trim(),
      email: (data.email || '').trim(),
      school: (data.school || '').trim(),
      major: (data.major || '').trim(),
      company: company,
      position: position,
      source: source,
      stage: data.stage || 'screening',
      stageHistory: [
        { stage: data.stage || 'screening', movedAt: now }
      ],
      interviewDate: data.interviewDate || null,
      interviewTime: data.interviewTime || null,
      interviewNotes: (data.interviewNotes || '').trim(),
      intentionNotes: (data.intentionNotes || '').trim(),
      reminders: Array.isArray(data.reminders) ? data.reminders : [],
      notes: Array.isArray(data.notes) ? data.notes : [],
      resumeUrl: (data.resumeUrl || '').trim(),
      tags: Array.isArray(data.tags) ? data.tags : [],
      status: 'active',
      rejectedAt: null,
      rejectionReason: '',
      createdAt: now,
      updatedAt: now
    };

    this.candidates.unshift(candidate);
    this.saveToStorage();
    return candidate;
  }

  updateCandidate(id, updateData) {
    const index = this.candidates.findIndex(c => c.id === id);
    if (index === -1) return null;

    const candidate = this.candidates[index];
    const now = new Date().toISOString();

    // Track stage changes in history
    if (updateData.stage && updateData.stage !== candidate.stage) {
      if (!Array.isArray(candidate.stageHistory)) {
        candidate.stageHistory = [];
      }
      candidate.stageHistory.push({
        stage: updateData.stage,
        movedAt: now
      });
    }

    this.candidates[index] = {
      ...candidate,
      ...updateData,
      updatedAt: now
    };

    this.saveToStorage();
    return this.candidates[index];
  }

  deleteCandidate(id) {
    this.candidates = this.candidates.filter(c => c.id !== id);
    this.saveToStorage();
  }

  bulkDeleteCandidates(ids) {
    const set = new Set(ids);
    this.candidates = this.candidates.filter(c => !set.has(c.id));
    this.saveToStorage();
  }

  bulkUpdateStage(ids, targetStage) {
    const set = new Set(ids);
    const now = new Date().toISOString();
    this.candidates.forEach(c => {
      if (set.has(c.id) && c.stage !== targetStage) {
        c.stage = targetStage;
        if (!Array.isArray(c.stageHistory)) c.stageHistory = [];
        c.stageHistory.push({ stage: targetStage, movedAt: now });
        c.updatedAt = now;
      }
    });
    this.saveToStorage();
  }

  rejectCandidate(id, reason = '') {
    const candidate = this.getCandidateById(id);
    if (!candidate) return null;
    const now = new Date().toISOString();
    return this.updateCandidate(id, {
      status: 'rejected',
      rejectedAt: now,
      rejectionReason: (reason || '').trim()
    });
  }

  reactivateCandidate(id) {
    const candidate = this.getCandidateById(id);
    if (!candidate) return null;
    return this.updateCandidate(id, {
      status: 'active',
      rejectedAt: null,
      rejectionReason: ''
    });
  }

  bulkRejectCandidates(ids, reason = '') {
    const set = new Set(ids);
    const now = new Date().toISOString();
    this.candidates.forEach(c => {
      if (set.has(c.id) && c.status !== 'rejected') {
        c.status = 'rejected';
        c.rejectedAt = now;
        c.rejectionReason = (reason || '').trim();
        c.updatedAt = now;
      }
    });
    this.saveToStorage();
  }

  /* ========================================================================
     Candidate Sub-entities: Reminders & Feedback Notes
     ======================================================================== */
  addReminder(candidateId, { datetime, note }) {
    const candidate = this.getCandidateById(candidateId);
    if (!candidate) return null;

    if (!Array.isArray(candidate.reminders)) {
      candidate.reminders = [];
    }

    const newReminder = {
      id: Utils.generateId(),
      datetime: datetime, // ISO string
      note: (note || '').trim(),
      fired: false,
      createdAt: new Date().toISOString()
    };

    candidate.reminders.push(newReminder);
    candidate.updatedAt = new Date().toISOString();
    this.saveToStorage();
    return newReminder;
  }

  deleteReminder(candidateId, reminderId) {
    const candidate = this.getCandidateById(candidateId);
    if (!candidate || !Array.isArray(candidate.reminders)) return;

    candidate.reminders = candidate.reminders.filter(r => r.id !== reminderId);
    candidate.updatedAt = new Date().toISOString();
    this.saveToStorage();
  }

  markReminderFired(candidateId, reminderId) {
    const candidate = this.getCandidateById(candidateId);
    if (!candidate || !Array.isArray(candidate.reminders)) return;

    const r = candidate.reminders.find(rem => rem.id === reminderId);
    if (r) {
      r.fired = true;
      candidate.updatedAt = new Date().toISOString();
      this.saveToStorage();
    }
  }

  addNote(candidateId, { author, content }) {
    const candidate = this.getCandidateById(candidateId);
    if (!candidate) return null;

    if (!Array.isArray(candidate.notes)) {
      candidate.notes = [];
    }

    const newNote = {
      id: Utils.generateId(),
      author: (author || '面试官').trim(),
      content: (content || '').trim(),
      createdAt: new Date().toISOString()
    };

    candidate.notes.unshift(newNote);

    candidate.updatedAt = new Date().toISOString();
    this.saveToStorage();
    return newNote;
  }

  deleteNote(candidateId, noteId) {
    const candidate = this.getCandidateById(candidateId);
    if (!candidate || !Array.isArray(candidate.notes)) return;

    candidate.notes = candidate.notes.filter(n => n.id !== noteId);
    candidate.updatedAt = new Date().toISOString();
    this.saveToStorage();
  }

  /* ========================================================================
     Job Orders CRUD & Smart Keyword Search
     ======================================================================== */
  getAllJobOrders() {
    return [...this.jobOrders];
  }

  getJobOrderById(id) {
    return this.jobOrders.find(o => o.id === id) || null;
  }

  addJobOrder(data) {
    const now = new Date().toISOString();
    const order = {
      id: Utils.generateId(),
      company: this._toString(data.company).trim(),
      position: this._toString(data.position).trim(),
      salary: this._toString(data.salary).trim(),
      benefits: this._toString(data.benefits).trim(),
      requirements: this._toString(data.requirements).trim(),
      workHours: this._toString(data.workHours).trim(),
      location: this._toString(data.location).trim(),
      status: ['open', 'urgent', 'filled', 'paused'].includes(data.status) ? data.status : 'open',
      notes: this._toString(data.notes).trim(),
      createdAt: now,
      updatedAt: now
    };

    this.jobOrders.unshift(order);
    this.saveToStorage();
    return order;
  }

  updateJobOrder(id, updateData) {
    const index = this.jobOrders.findIndex(o => o.id === id);
    if (index === -1) return null;

    const now = new Date().toISOString();
    this.jobOrders[index] = {
      ...this.jobOrders[index],
      ...updateData,
      updatedAt: now
    };

    this.saveToStorage();
    return this.jobOrders[index];
  }

  deleteJobOrder(id) {
    this.jobOrders = this.jobOrders.filter(o => o.id !== id);
    this.saveToStorage();
  }

  /**
   * Multi-token keyword search across all job order fields
   * @param {string} keywordsStr - e.g. "腾讯 算法 远程"
   * @param {string} statusFilter - 'all' | 'open' | 'urgent' | 'filled' | 'paused'
   */
  searchJobOrders(keywordsStr = '', statusFilter = 'all') {
    let results = [...this.jobOrders];

    // 1. Status Filter
    if (statusFilter && statusFilter !== 'all') {
      results = results.filter(o => o.status === statusFilter);
    }

    // 2. Multi-token Keyword Match (AND logic)
    const tokens = (keywordsStr || '')
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (tokens.length === 0) {
      return results;
    }

    return results.filter(order => {
      // Build searchable composite text from all fields
      const compositeText = [
        order.company,
        order.position,
        order.salary,
        order.benefits,
        order.requirements,
        order.workHours,
        order.location,
        order.notes
      ].filter(Boolean).join(' ').toLowerCase();

      // Every token must be present in the composite text
      return tokens.every(token => compositeText.includes(token));
    });
  }

  /* ========================================================================
     Backup: JSON Export & Import
     ======================================================================== */
  exportFullBackup() {
    return {
      version: '1.2.0',
      exportedAt: new Date().toISOString(),
      candidates: this.candidates,
      jobOrders: this.jobOrders,
      tagPool: this.tagPool
    };
  }

  /**
   * Step 1: Validate import data, generate report (does not write)
   */
  validateImportData(jsonData) {
    const report = {
      valid: true,
      candidateCount: 0,
      jobOrderCount: 0,
      warnings: [],
      errors: [],
      sanitizedData: null
    };

    if (!jsonData || typeof jsonData !== 'object') {
      report.valid = false;
      report.errors.push('无效的 JSON 数据格式');
      return report;
    }

    const rawCandidates = Array.isArray(jsonData.candidates) ? jsonData.candidates : [];
    report.candidateCount = rawCandidates.length;

    if (rawCandidates.length > 10000) {
      report.warnings.push(`数据量较大（${rawCandidates.length} 条），导入可能需要较长时间`);
    }

    const sanitized = [];
    let fieldWarnings = 0;

    rawCandidates.forEach((raw, idx) => {
      if (!raw || typeof raw !== 'object') {
        report.warnings.push(`第 ${idx + 1} 条候选人记录格式无效，将被跳过`);
        return;
      }

      const candidate = this._sanitizeCandidateFields(raw);

      if (typeof raw.name !== 'string' && raw.name !== undefined) {
        fieldWarnings++;
      }
      if (raw.interviewTime && !/^\d{2}:\d{2}(:\d{2})?$/.test(String(raw.interviewTime))) {
        fieldWarnings++;
        candidate.interviewTime = null;
      }

      sanitized.push(candidate);
    });

    if (fieldWarnings > 0) {
      report.warnings.push(`${fieldWarnings} 个字段的数据类型或格式被自动修正`);
    }

    // Sanitize Job Orders
    const rawJobOrders = Array.isArray(jsonData.jobOrders) ? jsonData.jobOrders : [];
    report.jobOrderCount = rawJobOrders.length;
    const sanitizedOrders = [];
    rawJobOrders.forEach(raw => {
      const order = this._sanitizeJobOrder(raw);
      if (order) sanitizedOrders.push(order);
    });

    report.sanitizedData = {
      candidates: sanitized,
      jobOrders: sanitizedOrders,
      tagPool: jsonData.tagPool && typeof jsonData.tagPool === 'object' ? jsonData.tagPool : {}
    };

    return report;
  }

  /**
   * Deep sanitize job order fields to prevent prototype pollution
   */
  _sanitizeJobOrder(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const order = {
      id: typeof raw.id === 'string' ? raw.id : Utils.generateId(),
      company: this._toString(raw.company).slice(0, 100),
      position: this._toString(raw.position).slice(0, 100),
      salary: this._toString(raw.salary).slice(0, 100),
      benefits: this._toString(raw.benefits).slice(0, 500),
      requirements: this._toString(raw.requirements).slice(0, 2000),
      workHours: this._toString(raw.workHours).slice(0, 100),
      location: this._toString(raw.location).slice(0, 100),
      status: ['open', 'urgent', 'filled', 'paused'].includes(raw.status) ? raw.status : 'open',
      notes: this._toString(raw.notes).slice(0, 1000),
      createdAt: this._sanitizeDateStr(raw.createdAt) || new Date().toISOString(),
      updatedAt: this._sanitizeDateStr(raw.updatedAt) || new Date().toISOString()
    };
    return Object.assign(Object.create(null), order);
  }

  /**
   * Deep sanitize candidate fields to prevent prototype pollution
   */
  _sanitizeCandidateFields(raw) {
    const candidate = {
      id: typeof raw.id === 'string' ? raw.id : Utils.generateId(),
      name: this._toString(raw.name),
      phone: this._toString(raw.phone),
      email: this._toString(raw.email),
      school: this._toString(raw.school),
      major: this._toString(raw.major),
      company: this._toString(raw.company),
      position: this._toString(raw.position),
      source: this._toString(raw.source),
      stage: this._isValidStage(raw.stage) ? raw.stage : 'screening',
      interviewDate: this._sanitizeDateStr(raw.interviewDate),
      interviewTime: this._sanitizeTimeStr(raw.interviewTime),
      interviewNotes: this._toString(raw.interviewNotes),
      intentionNotes: this._toString(raw.intentionNotes),
      resumeUrl: Utils.sanitizeUrl(raw.resumeUrl),
      tags: Array.isArray(raw.tags) ? raw.tags.filter(t => typeof t === 'string') : [],
      status: ['active', 'rejected'].includes(raw.status) ? raw.status : 'active',
      rejectedAt: this._sanitizeDateStr(raw.rejectedAt),
      rejectionReason: this._toString(raw.rejectionReason),
      reminders: Array.isArray(raw.reminders) ? raw.reminders.slice(0, 100).map(r => this._sanitizeReminder(r)).filter(Boolean) : [],
      notes: Array.isArray(raw.notes) ? raw.notes.slice(0, 200).map(n => this._sanitizeNote(n)).filter(Boolean) : [],
      stageHistory: Array.isArray(raw.stageHistory) ? raw.stageHistory.slice(0, 50).map(h => this._sanitizeStageHistory(h)).filter(Boolean) : [],
      createdAt: raw.createdAt || new Date().toISOString(),
      updatedAt: raw.updatedAt || new Date().toISOString()
    };
    
    // Prevent prototype pollution by returning a pure object
    return Object.assign(Object.create(null), candidate);
  }

  _toString(val) {
    if (val === null || val === undefined) return '';
    return String(val);
  }

  _sanitizeDateStr(val) {
    if (!val) return null;
    const s = String(val);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 25);
    return null;
  }

  _sanitizeTimeStr(val) {
    if (!val) return null;
    const s = String(val);
    if (/^\d{2}:\d{2}(:\d{2})?$/.test(s)) return s;
    return null;
  }

  _isValidStage(val) {
    return ['screening', 'phone', 'interview', 'offer', 'pre_onboarding', 'onboarding', 'post_onboarding'].includes(val);
  }

  _sanitizeReminder(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return Object.assign(Object.create(null), {
      id: typeof raw.id === 'string' ? raw.id : Utils.generateId(),
      datetime: this._sanitizeDateStr(raw.datetime),
      note: this._toString(raw.note),
      fired: Boolean(raw.fired),
      createdAt: raw.createdAt || new Date().toISOString()
    });
  }

  _sanitizeNote(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return Object.assign(Object.create(null), {
      id: typeof raw.id === 'string' ? raw.id : Utils.generateId(),
      author: this._toString(raw.author),
      content: this._toString(raw.content),
      createdAt: raw.createdAt || new Date().toISOString()
    });
  }

  _sanitizeStageHistory(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return Object.assign(Object.create(null), {
      stage: this._isValidStage(raw.stage) ? raw.stage : 'screening',
      timestamp: raw.timestamp || new Date().toISOString()
    });
  }

  importFullBackup(jsonData, mode = 'merge') {
    if (!jsonData || typeof jsonData !== 'object') {
      throw new Error('无效的 JSON 数据格式');
    }

    const importedCandidates = Array.isArray(jsonData.candidates) ? jsonData.candidates : [];
    const importedJobOrders = Array.isArray(jsonData.jobOrders) ? jsonData.jobOrders : [];
    const importedTagPool = jsonData.tagPool && typeof jsonData.tagPool === 'object' ? jsonData.tagPool : {};

    if (mode === 'overwrite') {
      this.candidates = importedCandidates;
      this.jobOrders = importedJobOrders;
      this.tagPool = importedTagPool;
    } else {
      // Merge candidates by ID
      const existingCandidateIds = new Set(this.candidates.map(c => c.id));
      importedCandidates.forEach(c => {
        if (!existingCandidateIds.has(c.id)) {
          this.candidates.push(c);
        }
      });

      // Merge job orders by ID
      const existingOrderIds = new Set(this.jobOrders.map(o => o.id));
      importedJobOrders.forEach(o => {
        if (!existingOrderIds.has(o.id)) {
          this.jobOrders.push(o);
        }
      });

      // Merge tags
      ['companies', 'positions', 'sources', 'customTags'].forEach(cat => {
        if (importedTagPool[cat]) {
          if (!this.tagPool[cat]) this.tagPool[cat] = {};
          Object.entries(importedTagPool[cat]).forEach(([name, count]) => {
            this.tagPool[cat][name] = (this.tagPool[cat][name] || 0) + count;
          });
        }
      });
    }

    this.saveToStorage();
    return {
      candidatesCount: this.candidates.length,
      ordersCount: this.jobOrders.length
    };
  }
}

// Global Store Instance
window.Store = new DataStore();
