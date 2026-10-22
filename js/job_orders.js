/**
 * Candidate Follow-up Management System
 * Job Orders Module: Company Recruitment Requisitions, Pitch Copier & Smart Search Engine
 */

const JobOrdersModule = {
  searchQuery: '',
  statusFilter: 'all',
  activeChip: '',
  debounceTimer: null,

  init() {
    this.bindEvents();
    this.bindAiEvents();
  },

  bindEvents() {
    // 1. Search Input with Realtime Debounce
    const searchInput = document.getElementById('jobSearchInput');
    const clearBtn = document.getElementById('jobSearchClearBtn');

    if (searchInput) {
      searchInput.addEventListener('input', e => {
        this.searchQuery = e.target.value;
        if (clearBtn) {
          clearBtn.classList.toggle('visible', Boolean(this.searchQuery.trim()));
        }

        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          this.renderCards();
        }, 120);
      });
    }

    if (clearBtn && searchInput) {
      clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        this.searchQuery = '';
        clearBtn.classList.remove('visible');
        this.renderCards();
        searchInput.focus();
      });
    }

    // 2. Status Dropdown Filter
    const statusFilter = document.getElementById('jobStatusFilter');
    if (statusFilter) {
      statusFilter.addEventListener('change', e => {
        this.statusFilter = e.target.value;
        this.renderCards();
      });
    }

    // 3. Quick Preset Filter Chips
    const chips = document.querySelectorAll('.filter-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        const chipVal = chip.getAttribute('data-chip');
        if (this.activeChip === chipVal) {
          // Deselect
          chip.classList.remove('active');
          this.activeChip = '';
          if (searchInput) {
            searchInput.value = '';
            this.searchQuery = '';
            if (clearBtn) clearBtn.classList.remove('visible');
          }
          if (statusFilter) {
            statusFilter.value = 'all';
            this.statusFilter = 'all';
          }
        } else {
          // Select chip
          chips.forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          this.activeChip = chipVal;

          if (chipVal === '急聘') {
            if (statusFilter) {
              statusFilter.value = 'urgent';
              this.statusFilter = 'urgent';
            }
          } else {
            if (searchInput) {
              searchInput.value = chipVal;
              this.searchQuery = chipVal;
              if (clearBtn) clearBtn.classList.add('visible');
            }
          }
        }
        this.renderCards();
      });
    });

    // 4. Modal Open Buttons
    const addBtn = document.getElementById('openAddJobOrderBtn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        this.openAddModal();
      });
    }

    // 5. Modal Close / Cancel
    const closeBtn = document.getElementById('closeJobOrderModalBtn');
    const cancelBtn = document.getElementById('cancelJobOrderModalBtn');
    const modalOverlay = document.getElementById('jobOrderModalOverlay');

    if (closeBtn) closeBtn.addEventListener('click', () => this.closeModal());
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.closeModal());

    if (modalOverlay) {
      modalOverlay.addEventListener('click', e => {
        if (e.target === modalOverlay) this.closeModal();
      });
    }

    // 6. Modal Form Submit
    const form = document.getElementById('jobOrderForm');
    if (form) {
      form.addEventListener('submit', e => {
        e.preventDefault();
        this.handleFormSubmit();
      });
    }

    // 7. Event Delegation for Cards Grid (Copy, Edit, Delete, Status Toggle)
    const grid = document.getElementById('jobOrdersGrid');
    if (grid) {
      grid.addEventListener('click', e => {
        const copyBtn = e.target.closest('[data-action="copy-pitch"]');
        if (copyBtn) {
          const id = copyBtn.getAttribute('data-id');
          this.copyPitch(id);
          return;
        }

        const editBtn = e.target.closest('[data-action="edit"]');
        if (editBtn) {
          const id = editBtn.getAttribute('data-id');
          this.openEditModal(id);
          return;
        }

        const deleteBtn = e.target.closest('[data-action="delete"]');
        if (deleteBtn) {
          const id = deleteBtn.getAttribute('data-id');
          this.deleteOrder(id);
          return;
        }

        const statusSelect = e.target.closest('.job-card-status-select');
        if (statusSelect) {
          // Handled on change
        }
      });

      grid.addEventListener('change', e => {
        if (e.target.classList.contains('job-card-status-select')) {
          const id = e.target.getAttribute('data-id');
          const newStatus = e.target.value;
          this.quickUpdateStatus(id, newStatus);
        }
      });
    }
  },

  render() {
    this.updateMetrics();
    this.renderCards();
  },

  updateMetrics() {
    const allOrders = Store.getAllJobOrders();

    const activeCount = allOrders.filter(o => o.status === 'open' || o.status === 'urgent').length;
    const urgentCount = allOrders.filter(o => o.status === 'urgent').length;

    const companiesSet = new Set(allOrders.map(o => (o.company || '').trim()).filter(Boolean));
    const companyCount = companiesSet.size;

    const elActive = document.getElementById('ordersMetricActive');
    const elUrgent = document.getElementById('ordersMetricUrgent');
    const elCompanies = document.getElementById('ordersMetricCompanies');

    if (elActive) elActive.textContent = activeCount;
    if (elUrgent) elUrgent.textContent = urgentCount;
    if (elCompanies) elCompanies.textContent = companyCount;

    // Also update sidebar badge
    const sidebarBadge = document.getElementById('sidebarOrdersBadge');
    if (sidebarBadge) {
      sidebarBadge.textContent = activeCount;
    }
  },

  renderCards() {
    const grid = document.getElementById('jobOrdersGrid');
    if (!grid) return;

    const orders = Store.searchJobOrders(this.searchQuery, this.statusFilter);

    if (orders.length === 0) {
      const isFiltered = Boolean(this.searchQuery.trim() || this.statusFilter !== 'all');
      grid.innerHTML = `
        <div class="job-empty-state">
          <i class="ph-light ph-briefcase job-empty-icon"></i>
          <h4 class="job-empty-title">${isFiltered ? '未找到符合条件的职位需求' : '暂无职位需求订单'}</h4>
          <p class="job-empty-desc">${isFiltered ? '尝试更换搜索关键词，或清除筛选条件查看全部职位。' : '点击上方“发布新需求”按钮，录入目标公司招聘职位、薪水福利与JD。'}</p>
          ${isFiltered ? `
            <button type="button" class="btn btn-secondary btn-sm" id="resetJobSearchBtn">
              <i class="ph-light ph-arrow-counter-clockwise"></i>
              <span>重置搜索条件</span>
            </button>
          ` : `
            <button type="button" class="btn btn-primary btn-sm" id="emptyAddJobBtn">
              <i class="ph-bold ph-plus"></i>
              <span>发布第一条需求</span>
            </button>
          `}
        </div>
      `;

      const resetBtn = document.getElementById('resetJobSearchBtn');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          const searchInput = document.getElementById('jobSearchInput');
          const clearBtn = document.getElementById('jobSearchClearBtn');
          const statusFilter = document.getElementById('jobStatusFilter');
          if (searchInput) searchInput.value = '';
          if (clearBtn) clearBtn.classList.remove('visible');
          if (statusFilter) statusFilter.value = 'all';
          this.searchQuery = '';
          this.statusFilter = 'all';
          this.activeChip = '';
          document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
          this.renderCards();
        });
      }

      const emptyAddBtn = document.getElementById('emptyAddJobBtn');
      if (emptyAddBtn) {
        emptyAddBtn.addEventListener('click', () => this.openAddModal());
      }
      return;
    }

    grid.innerHTML = orders.map(order => this.createCardHtml(order)).join('');
  },

  /**
   * Escape and Highlight matching keywords
   */
  highlight(rawText, query) {
    if (!rawText) return '';
    const safeText = Utils.escapeHtml(String(rawText));
    if (!query) return safeText;

    const tokens = query
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (tokens.length === 0) return safeText;

    // Replace each token safely
    let highlighted = safeText;
    tokens.forEach(token => {
      const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escapedToken})`, 'gi');
      highlighted = highlighted.replace(regex, '<mark class="search-highlight">$1</mark>');
    });

    return highlighted;
  },

  /**
   * Parse benefits into individual distinct phrases/items
   * Supports: newlines (\n), separator slashes ( / ), commas (,), semicolons (;)
   * Preserves phrases like "Shift allowance RM15/noon", "Quarterly bonus" without splitting spaces.
   */
  parseBenefits(rawText) {
    if (!rawText) return [];

    const rawLines = String(rawText)
      .split(/[\r\n]+/)
      .map(l => l.trim())
      .filter(Boolean);

    if (rawLines.length === 0) return [];

    const items = [];

    if (rawLines.length > 1) {
      // Multi-line mode: each line is an intentional benefit item
      rawLines.forEach(line => {
        // If a line has explicit " / " sub-separators, allow splitting
        if (/\s+[/／]\s+/.test(line)) {
          line.split(/\s+[/／]\s+/).forEach(seg => {
            if (seg.trim()) items.push(seg.trim());
          });
        } else {
          items.push(line);
        }
      });
    } else {
      // Single-line mode: split by " / ", commas, semicolons, or bullets
      const line = rawLines[0];
      if (/\s+[/／]\s+/.test(line)) {
        line.split(/\s+[/／]\s+/).forEach(seg => {
          if (seg.trim()) items.push(seg.trim());
        });
      } else if (/[,，;；|•]/.test(line)) {
        line.split(/[,，;；|•]+/).forEach(seg => {
          if (seg.trim()) items.push(seg.trim());
        });
      } else {
        items.push(line);
      }
    }

    return items
      .map(item => item.replace(/^[-•*·/／]\s*/, '').trim())
      .filter(item => item && item !== '/' && item !== '／');
  },

  createCardHtml(order) {
    const q = this.searchQuery;

    // Status config
    const statusMap = {
      open: { label: '招聘中', cls: 'status-open' },
      urgent: { label: '🔥 急聘', cls: 'status-urgent' },
      filled: { label: '已招满', cls: 'status-filled' },
      paused: { label: '已搁置', cls: 'status-paused' }
    };
    const curStatus = statusMap[order.status] || statusMap.open;

    // Parse benefits items intelligently without breaking English spaces
    const benefitPills = this.parseBenefits(order.benefits);

    return `
      <div class="job-order-card" data-order-id="${Utils.escapeHtml(order.id)}">
        <!-- Top Row: Company Badge & Status Pill -->
        <div class="job-card-top-row">
          <span class="job-company-badge">
            <i class="ph-bold ph-buildings"></i>
            ${this.highlight(order.company, q)}
          </span>

          <span class="job-status-pill ${curStatus.cls}">
            ${curStatus.label}
          </span>
        </div>

        <!-- Position Title -->
        <div class="job-title-row">
          <h3 class="job-position-name">${this.highlight(order.position, q)}</h3>
        </div>

        <!-- Metrics Row: Salary, Hours, Location -->
        <div class="job-metrics-row">
          ${order.salary ? `
            <span class="job-salary-tag" title="职位薪资">
              <i class="ph-bold ph-currency-cny"></i>
              ${this.highlight(order.salary, q)}
            </span>
          ` : ''}

          ${order.workHours ? `
            <span class="job-hours-tag" title="工作时间">
              <i class="ph-light ph-clock"></i>
              ${this.highlight(order.workHours, q)}
            </span>
          ` : ''}

          ${order.location ? `
            <span class="job-location-tag" title="工作地点">
              <i class="ph-light ph-map-pin"></i>
              ${this.highlight(order.location, q)}
            </span>
          ` : ''}
        </div>

        <!-- Benefits Highlights -->
        ${benefitPills.length > 0 ? `
          <div class="job-section-block">
            <span class="job-section-label"><i class="ph-light ph-gift"></i> 职位福利</span>
            <div class="job-benefits-pill-container">
              ${benefitPills.map(b => `
                <span class="job-benefit-pill">
                  <i class="ph-bold ph-check job-benefit-check-icon"></i>
                  ${this.highlight(b, q)}
                </span>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Requirements JD -->
        ${order.requirements ? `
          <div class="job-section-block">
            <span class="job-section-label"><i class="ph-light ph-list-checks"></i> 核心要求 (JD)</span>
            <div class="job-requirements-text">${this.highlight(order.requirements, q)}</div>
          </div>
        ` : ''}

        <!-- Recruiter Internal Notes -->
        ${order.notes ? `
          <div class="job-notes-text" title="仅自己可见的内部备注">
            💡 ${this.highlight(order.notes, q)}
          </div>
        ` : ''}

        <!-- Footer Actions -->
        <div class="job-card-actions">
          <button type="button" class="job-copy-btn" data-action="copy-pitch" data-id="${Utils.escapeHtml(order.id)}" title="一键生成并复制格式化岗位推荐文案">
            <i class="ph-bold ph-copy"></i>
            <span>复制推荐话术</span>
          </button>

          <div class="job-card-menu-btns">
            <!-- Quick Status Select -->
            <select class="form-select btn-sm job-card-status-select" data-id="${Utils.escapeHtml(order.id)}" title="快速变更状态">
              <option value="open" ${order.status === 'open' ? 'selected' : ''}>在招</option>
              <option value="urgent" ${order.status === 'urgent' ? 'selected' : ''}>急聘</option>
              <option value="filled" ${order.status === 'filled' ? 'selected' : ''}>招满</option>
              <option value="paused" ${order.status === 'paused' ? 'selected' : ''}>搁置</option>
            </select>

            <button type="button" class="btn-icon btn-sm" data-action="edit" data-id="${Utils.escapeHtml(order.id)}" title="编辑职位需求">
              <i class="ph-light ph-pencil-simple"></i>
            </button>

            <button type="button" class="btn-icon btn-sm" data-action="delete" data-id="${Utils.escapeHtml(order.id)}" title="删除该需求">
              <i class="ph-light ph-trash"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * One-click copy formatted recruiter pitch to clipboard
   */
  async copyPitch(orderId) {
    const order = Store.getJobOrderById(orderId);
    if (!order) return;

    const lines = [
      `🔥【优质岗位速递】`,
      `🏢 目标公司：${order.company}`,
      `💼 招聘职位：${order.position}`,
      order.salary ? `💰 薪资待遇：${order.salary}` : null,
      order.workHours ? `⏰ 工作时间：${order.workHours}` : null,
      order.location ? `📍 工作地点：${order.location}` : null,
      order.benefits ? (() => {
        const parsed = this.parseBenefits(order.benefits);
        if (parsed.length > 1) {
          return `🎁 职位福利：\n${parsed.map(b => `  • ${b}`).join('\n')}`;
        }
        return `🎁 职位福利：${order.benefits}`;
      })() : null,
      order.requirements ? `\n📋 职位要求：\n${order.requirements.trim()}` : null,
      `\n💬 若对该岗位感兴趣，欢迎随时发送简历或沟通详情！`
    ].filter(Boolean);

    const pitchText = lines.join('\n');

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(pitchText);
      } else {
        // Fallback for non-https/Electron contexts
        const textarea = document.createElement('textarea');
        textarea.value = pitchText;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      App.showToast(`【${order.company} · ${order.position}】推荐话术已复制至剪贴板，可直接发送！`, 'success', 4000);
    } catch (err) {
      console.error('Failed to copy pitch:', err);
      App.showToast('复制失败，请重试或手动复制。', 'danger');
    }
  },

  bindAiEvents() {
    const btnPdf = document.getElementById('btnAiImportPdf');
    const btnText = document.getElementById('btnAiImportText');
    const fileInput = document.getElementById('jobOrderAiFileInput');
    const textContainer = document.getElementById('jobOrderAiTextContainer');
    const textArea = document.getElementById('jobOrderAiTextInput');
    const btnCancelText = document.getElementById('btnCancelAiText');
    const btnSubmitText = document.getElementById('btnSubmitAiText');

    if (btnPdf && fileInput) {
      btnPdf.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        App.showToast('正在通过 AI 解析招聘文档，请稍候...', 'info', 0); // 0 means persistent
        try {
          const formData = new FormData();
          formData.append('file', file);
          const res = await fetch('http://127.0.0.1:8000/api/parse/file/job_order', {
            method: 'POST',
            body: formData
          });
          const json = await res.json();
          if (json.status === 'success' && Array.isArray(json.data) && json.data.length > 0) {
            this.populateAiResult(json.data[0]);
            App.showToast('文档解析成功并已自动填入！', 'success');
          } else {
            throw new Error(json.message || '未提取到有效岗位数据');
          }
        } catch (err) {
          App.showToast(`解析失败: ${err.message}`, 'error');
        } finally {
          e.target.value = ''; // Reset input
        }
      });
    }

    if (btnText && textContainer && btnCancelText && btnSubmitText) {
      btnText.addEventListener('click', () => {
        textContainer.style.display = 'block';
        textArea.focus();
      });

      btnCancelText.addEventListener('click', () => {
        textContainer.style.display = 'none';
        textArea.value = '';
      });

      btnSubmitText.addEventListener('click', async () => {
        const text = textArea.value.trim();
        if (!text) {
          App.showToast('请先粘贴文本内容', 'error');
          return;
        }

        App.showToast('正在通过 AI 解析粘贴文本，请稍候...', 'info', 0);
        try {
          const res = await fetch('http://127.0.0.1:8000/api/parse/sheet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: text, targetType: 'job_order' })
          });
          const json = await res.json();
          if (json.status === 'success' && Array.isArray(json.data) && json.data.length > 0) {
            if (json.data.length === 1) {
              this.populateAiResult(json.data[0]);
              App.showToast('文本解析成功并已自动填入！', 'success');
            } else {
              const fallbackCompany = (json.data.find(d => d.company && d.company.trim()) || {}).company || document.getElementById('jobOrderCompanyInput')?.value?.trim() || '未命名公司';
              let added = 0;
              json.data.forEach(item => {
                if (!item.position) return;
                Store.addJobOrder({
                  company: (item.company || fallbackCompany).trim(),
                  position: item.position.trim(),
                  salary: (item.salary || '').trim(),
                  location: (item.location || '').trim(),
                  workHours: (item.workHours || '').trim(),
                  status: 'open',
                  benefits: (item.benefits || '').trim(),
                  requirements: (item.requirements || '').trim(),
                  notes: (item.notes || '').trim()
                });
                added++;
              });
              this.closeModal();
              this.render();
              App.showToast(`已从文本智能拆分并批量发布 ${added} 个独立岗位！`, 'success', 4000);
            }
            textContainer.style.display = 'none';
            textArea.value = '';
          } else {
            throw new Error(json.message || '未提取到有效岗位数据');
          }
        } catch (err) {
          App.showToast(`解析失败: ${err.message}`, 'error');
        }
      });
    }
  },

  populateAiResult(data) {
    if (data.company) document.getElementById('jobOrderCompanyInput').value = data.company;
    if (data.position) document.getElementById('jobOrderPositionInput').value = data.position;
    if (data.salary) document.getElementById('jobOrderSalaryInput').value = data.salary;
    if (data.location) document.getElementById('jobOrderLocationInput').value = data.location;
    if (data.workHours) document.getElementById('jobOrderHoursInput').value = data.workHours;
    if (data.benefits) document.getElementById('jobOrderBenefitsInput').value = data.benefits;
    if (data.requirements) document.getElementById('jobOrderRequirementsInput').value = data.requirements;
    if (data.notes) document.getElementById('jobOrderNotesInput').value = data.notes;
  },

  openAddModal() {
    const modal = document.getElementById('jobOrderModalOverlay');
    const form = document.getElementById('jobOrderForm');
    const title = document.getElementById('jobOrderModalTitle');
    const editIdInput = document.getElementById('jobOrderEditId');

    if (!modal || !form) return;

    form.reset();
    if (editIdInput) editIdInput.value = '';
    if (title) title.textContent = '发布招聘订单 / 岗位需求';

    modal.classList.add('active');
    const firstInput = document.getElementById('jobOrderCompanyInput');
    if (firstInput) firstInput.focus();
  },

  openEditModal(orderId) {
    const order = Store.getJobOrderById(orderId);
    if (!order) return;

    const modal = document.getElementById('jobOrderModalOverlay');
    const title = document.getElementById('jobOrderModalTitle');

    document.getElementById('jobOrderEditId').value = order.id;
    document.getElementById('jobOrderCompanyInput').value = order.company || '';
    document.getElementById('jobOrderPositionInput').value = order.position || '';
    document.getElementById('jobOrderSalaryInput').value = order.salary || '';
    document.getElementById('jobOrderLocationInput').value = order.location || '';
    document.getElementById('jobOrderHoursInput').value = order.workHours || '';
    document.getElementById('jobOrderStatusSelect').value = order.status || 'open';
    document.getElementById('jobOrderBenefitsInput').value = order.benefits || '';
    document.getElementById('jobOrderRequirementsInput').value = order.requirements || '';
    document.getElementById('jobOrderNotesInput').value = order.notes || '';

    if (title) title.textContent = '编辑招聘订单';
    if (modal) modal.classList.add('active');
  },

  closeModal() {
    const modal = document.getElementById('jobOrderModalOverlay');
    if (modal) modal.classList.remove('active');
  },

  handleFormSubmit() {
    const editId = document.getElementById('jobOrderEditId').value;
    const company = document.getElementById('jobOrderCompanyInput').value.trim();
    const position = document.getElementById('jobOrderPositionInput').value.trim();

    if (!company || !position) {
      App.showToast('请完整填写公司名字与职位名称', 'warning');
      return;
    }

    const payload = {
      company,
      position,
      salary: document.getElementById('jobOrderSalaryInput').value.trim(),
      location: document.getElementById('jobOrderLocationInput').value.trim(),
      workHours: document.getElementById('jobOrderHoursInput').value.trim(),
      status: document.getElementById('jobOrderStatusSelect').value,
      benefits: document.getElementById('jobOrderBenefitsInput').value.trim(),
      requirements: document.getElementById('jobOrderRequirementsInput').value.trim(),
      notes: document.getElementById('jobOrderNotesInput').value.trim()
    };

    if (editId) {
      Store.updateJobOrder(editId, payload);
      App.showToast('职位需求已成功更新', 'success');
    } else {
      Store.addJobOrder(payload);
      App.showToast('新招聘订单已发布入库', 'success');
    }

    this.closeModal();
    this.render();
  },

  quickUpdateStatus(orderId, newStatus) {
    Store.updateJobOrder(orderId, { status: newStatus });
    App.showToast('需求状态已更新', 'info', 2000);
    this.updateMetrics();
    this.renderCards();
  },

  async deleteOrder(orderId) {
    const order = Store.getJobOrderById(orderId);
    if (!order) return;

    const confirmed = await App.confirmDialog(
      '确认删除该职位需求？',
      `即将删除【${order.company} · ${order.position}】的需求记录。\n删除后数据无法恢复，是否继续？`
    );

    if (confirmed) {
      Store.deleteJobOrder(orderId);
      App.showToast('职位需求已删除', 'info');
      this.render();
    }
  }
};

// Global Exposure
window.JobOrdersModule = JobOrdersModule;
