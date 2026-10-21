/**
 * Candidate Follow-up Management System
 * Candidates Management: Table List, Filters, Add/Edit Modal & Slide-over Detail Drawer
 */

const CandidatesModule = {
  selectedIds: new Set(),
  currentFilter: {
    search: '',
    stage: 'all',
    company: 'all',
    position: 'all',
    source: 'all',
    sortBy: 'created_desc'
  },
  activeCandidateId: null,

  init() {
    this.bindEvents();
    this.render();
  },

  bindEvents() {
    // Search input
    const searchInput = document.getElementById('candidateSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', Utils.debounce(e => {
        this.currentFilter.search = e.target.value.trim();
        this.renderTable();
      }, 200));
    }

    // Stage filter
    const stageFilter = document.getElementById('candidateStageFilter');
    if (stageFilter) {
      stageFilter.addEventListener('change', e => {
        this.currentFilter.stage = e.target.value;
        this.renderTable();
      });
    }

    // Company filter
    const companyFilter = document.getElementById('candidateCompanyFilter');
    if (companyFilter) {
      companyFilter.addEventListener('change', e => {
        this.currentFilter.company = e.target.value;
        this.renderTable();
      });
    }

    // Position filter
    const positionFilter = document.getElementById('candidatePositionFilter');
    if (positionFilter) {
      positionFilter.addEventListener('change', e => {
        this.currentFilter.position = e.target.value;
        this.renderTable();
      });
    }

    // Source filter
    const sourceFilter = document.getElementById('candidateSourceFilter');
    if (sourceFilter) {
      sourceFilter.addEventListener('change', e => {
        this.currentFilter.source = e.target.value;
        this.renderTable();
      });
    }

    // Sort By
    const sortFilter = document.getElementById('candidateSortFilter');
    if (sortFilter) {
      sortFilter.addEventListener('change', e => {
        this.currentFilter.sortBy = e.target.value;
        this.renderTable();
      });
    }

    // Select All Checkbox
    const selectAllCheckbox = document.getElementById('selectAllCandidates');
    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener('change', e => {
        const isChecked = e.target.checked;
        const visibleCandidates = this.getFilteredCandidates();
        if (isChecked) {
          visibleCandidates.forEach(c => this.selectedIds.add(c.id));
        } else {
          this.selectedIds.clear();
        }
        this.updateBatchBar();
        this.renderTable();
      });
    }

    // Add Candidate Button in View
    const addBtn = document.getElementById('addCandidateViewBtn');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.openAddModal());
    }

    // Batch Move Stage
    const batchMoveBtn = document.getElementById('batchMoveStageBtn');
    const batchStageSelect = document.getElementById('batchStageSelect');
    if (batchMoveBtn && batchStageSelect) {
      batchMoveBtn.addEventListener('click', () => {
        const stage = batchStageSelect.value;
        if (!stage || this.selectedIds.size === 0) return;
        Store.bulkUpdateStage(Array.from(this.selectedIds), stage);
        App.showToast(`已批量更新 ${this.selectedIds.size} 位候选人至「${Utils.getStageMeta(stage).label}」`, 'success');
        this.selectedIds.clear();
        this.updateBatchBar();
      });
    }

    // Batch Delete
    const batchDeleteBtn = document.getElementById('batchDeleteBtn');
    if (batchDeleteBtn) {
      batchDeleteBtn.addEventListener('click', () => {
        if (this.selectedIds.size === 0) return;
        if (confirm(`确认批量删除选中的 ${this.selectedIds.size} 位候选人吗？此操作无法撤销。`)) {
          Store.bulkDeleteCandidates(Array.from(this.selectedIds));
          App.showToast(`已删除 ${this.selectedIds.size} 位候选人`, 'info');
          this.selectedIds.clear();
          this.updateBatchBar();
        }
      });
    }

    // Close Detail Drawer
    const closeDrawerBtn = document.getElementById('closeDetailDrawerBtn');
    const drawerOverlay = document.getElementById('detailDrawerOverlay');
    if (closeDrawerBtn) {
      closeDrawerBtn.addEventListener('click', () => this.closeDetailDrawer());
    }
    if (drawerOverlay) {
      drawerOverlay.addEventListener('click', e => {
        if (e.target === drawerOverlay) this.closeDetailDrawer();
      });
    }

    // Close Candidate Modal
    const closeModalBtn = document.getElementById('closeCandidateModalBtn');
    const cancelModalBtn = document.getElementById('cancelCandidateModalBtn');
    const modalOverlay = document.getElementById('candidateModalOverlay');
    if (closeModalBtn) closeModalBtn.addEventListener('click', () => this.closeModal());
    if (cancelModalBtn) cancelModalBtn.addEventListener('click', () => this.closeModal());
    if (modalOverlay) {
      modalOverlay.addEventListener('click', e => {
        if (e.target === modalOverlay) this.closeModal();
      });
    }

    // Modal Form Submit
    const candidateForm = document.getElementById('candidateForm');
    if (candidateForm) {
      candidateForm.addEventListener('submit', e => {
        e.preventDefault();
        this.saveCandidateFromModal();
      });
    }

    // Setup Combo Input Auto-suggestions for Company, Position and Source
    this.setupComboInput('candidateCompanyInput', 'companyComboDropdown', 'companies');
    this.setupComboInput('candidatePositionInput', 'positionComboDropdown', 'positions');
    this.setupComboInput('candidateSourceInput', 'sourceComboDropdown', 'sources');
  },

  /**
   * Setup a Combo Input with historical tag suggestion dropdown
   */
  setupComboInput(inputId, dropdownId, category) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;

    const renderDropdown = (query = '') => {
      const tags = Store.getTags(category, query);
      const categoryLabels = { companies: '公司', positions: '岗位', sources: '渠道' };
      const catLabel = categoryLabels[category] || '标签';

      if (tags.length === 0) {
        dropdown.innerHTML = `<div class="combo-item agy-style-992dec">暂无历史${catLabel}标签，直接输入即可</div>`;
      } else {
        dropdown.innerHTML = tags.map(t => `
          <div class="combo-item" data-value="${Utils.escapeHtml(t.name)}">
            <span>${Utils.escapeHtml(t.name)}</span>
            <span class="combo-item-count">${t.count} 次使用</span>
          </div>
        `).join('');

        dropdown.querySelectorAll('.combo-item').forEach(el => {
          el.addEventListener('click', () => {
            const val = el.getAttribute('data-value');
            if (val) {
              input.value = val;
              dropdown.classList.remove('open');
            }
          });
        });
      }
      dropdown.classList.add('open');
    };

    input.addEventListener('focus', () => {
      renderDropdown(input.value);
    });

    input.addEventListener('input', e => {
      renderDropdown(e.target.value);
    });

    // Close when clicking outside
    document.addEventListener('click', e => {
      if (!input.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.remove('open');
      }
    });
  },

  render() {
    this.updateFilterDropdowns();
    this.renderTable();
  },

  updateFilterDropdowns() {
    const companyFilter = document.getElementById('candidateCompanyFilter');
    if (companyFilter) {
      const companies = Store.getTags('companies');
      const curVal = this.currentFilter.company;
      let html = '<option value="all">所有目标公司</option>';
      companies.forEach(c => {
        html += `<option value="${Utils.escapeHtml(c.name)}" ${curVal === c.name ? 'selected' : ''}>${Utils.escapeHtml(c.name)} (${c.count})</option>`;
      });
      companyFilter.innerHTML = html;
    }

    const positionFilter = document.getElementById('candidatePositionFilter');
    if (positionFilter) {
      const positions = Store.getTags('positions');
      const curVal = this.currentFilter.position;
      let html = '<option value="all">所有应聘岗位</option>';
      positions.forEach(p => {
        html += `<option value="${Utils.escapeHtml(p.name)}" ${curVal === p.name ? 'selected' : ''}>${Utils.escapeHtml(p.name)} (${p.count})</option>`;
      });
      positionFilter.innerHTML = html;
    }

    const sourceFilter = document.getElementById('candidateSourceFilter');
    if (sourceFilter) {
      const sources = Store.getTags('sources');
      const curVal = this.currentFilter.source;
      let html = '<option value="all">所有来源渠道</option>';
      sources.forEach(s => {
        html += `<option value="${Utils.escapeHtml(s.name)}" ${curVal === s.name ? 'selected' : ''}>${Utils.escapeHtml(s.name)} (${s.count})</option>`;
      });
      sourceFilter.innerHTML = html;
    }
  },

  getFilteredCandidates() {
    let list = Store.getAllCandidates();
    const { search, stage, company, position, source, sortBy } = this.currentFilter;

    // Search filter
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c => 
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.company && c.company.toLowerCase().includes(q)) ||
        (c.school && c.school.toLowerCase().includes(q)) ||
        (c.major && c.major.toLowerCase().includes(q)) ||
        (c.position && c.position.toLowerCase().includes(q)) ||
        (c.source && c.source.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q))
      );
    }

    // Stage filter
    if (stage !== 'all') {
      list = list.filter(c => c.stage === stage);
    }

    // Company filter
    if (company !== 'all') {
      list = list.filter(c => c.company === company);
    }

    // Position filter
    if (position !== 'all') {
      list = list.filter(c => c.position === position);
    }

    // Source filter
    if (source !== 'all') {
      list = list.filter(c => c.source === source);
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'created_desc') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortBy === 'created_asc') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sortBy === 'name_asc') {
        return (a.name || '').localeCompare(b.name || '', 'zh-CN');
      }
      if (sortBy === 'interview_asc') {
        const timeA = a.interviewDate ? new Date(`${a.interviewDate} ${a.interviewTime || '00:00'}`).getTime() : Infinity;
        const timeB = b.interviewDate ? new Date(`${b.interviewDate} ${b.interviewTime || '00:00'}`).getTime() : Infinity;
        return timeA - timeB;
      }
      return 0;
    });

    return list;
  },

  renderTable() {
    const tbody = document.getElementById('candidatesTableBody');
    const emptyState = document.getElementById('candidatesEmptyState');
    const tableWrapper = document.getElementById('candidatesTableWrapper');
    const candidateCountEl = document.getElementById('candidateTotalCountBadge');

    if (!tbody) return;

    const list = this.getFilteredCandidates();
    if (candidateCountEl) {
      candidateCountEl.textContent = `${list.length} 人`;
    }

    if (list.length === 0) {
      if (tableWrapper) tableWrapper.style.display = 'none';
      if (emptyState) emptyState.style.display = 'flex';
      return;
    }

    if (tableWrapper) tableWrapper.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';

    tbody.innerHTML = list.map(c => {
      const isSelected = this.selectedIds.has(c.id);
      const stageMeta = Utils.getStageMeta(c.stage);
      const interviewDisplay = c.interviewDate 
        ? `${Utils.formatDate(c.interviewDate)} ${Utils.escapeHtml(c.interviewTime || '')}` 
        : '<span class="agy-style-e3e6cc">未安排</span>';

      return `
        <tr data-id="${c.id}" class="${isSelected ? 'selected' : ''}">
          <td onclick="event.stopPropagation();">
            <input type="checkbox" class="custom-checkbox row-select-checkbox" data-id="${c.id}" ${isSelected ? 'checked' : ''} />
          </td>
          <td>
            <div class="candidate-cell-main">
              <span class="candidate-cell-name">${Utils.escapeHtml(c.name)}</span>
              <span class="candidate-cell-school">${Utils.escapeHtml(c.school)}${c.major ? ' · ' + Utils.escapeHtml(c.major) : ''}</span>
            </div>
          </td>
          <td>
            <div class="agy-style-5bcf4c">
              ${c.company ? `<span class="agy-style-c6464b"><i class="ph-light ph-buildings"></i>${Utils.escapeHtml(c.company)}</span>` : ''}
              <span class="agy-style-327bf5">${Utils.escapeHtml(c.position || '-')}</span>
              ${c.source ? `<span class="tag-pill agy-style-4d796c">${Utils.escapeHtml(c.source)}</span>` : ''}
            </div>
          </td>
          <td>
            <span class="badge ${stageMeta.badgeClass}">
              <span class="badge-dot"></span>
              ${stageMeta.label}
            </span>
            ${c.status === 'rejected' ? '<span class="badge agy-style-a56d3f">已淘汰</span>' : ''}
          </td>
          <td>
            <span style="font-family: var(--font-mono); font-size: var(--text-xs); color: ${c.interviewDate ? 'var(--accent-amber)' : 'var(--text-faint)'};">
              ${interviewDisplay}
            </span>
          </td>
          <td>
            <span class="agy-style-03a992">
              ${Utils.formatRelativeTime(c.createdAt)}
            </span>
          </td>
          <td onclick="event.stopPropagation();">
            <div class="agy-style-a2bd09">
              <button class="btn-icon btn-sm action-view-btn" data-id="${c.id}" title="查看跟进详情">
                <i class="ph-light ph-arrow-square-out"></i>
              </button>
              <button class="btn-icon btn-sm action-edit-btn" data-id="${c.id}" title="编辑基本信息">
                <i class="ph-light ph-pencil-simple"></i>
              </button>
              <button class="btn-icon btn-sm action-delete-btn" data-id="${c.id}" title="删除候选人" class="agy-style-0f66d8">
                <i class="ph-light ph-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach Row Click & Action Handlers
    tbody.querySelectorAll('tr').forEach(tr => {
      tr.addEventListener('click', () => {
        const id = tr.getAttribute('data-id');
        this.openDetailDrawer(id);
      });
    });

    tbody.querySelectorAll('.row-select-checkbox').forEach(cb => {
      cb.addEventListener('change', e => {
        const id = e.target.getAttribute('data-id');
        if (e.target.checked) {
          this.selectedIds.add(id);
        } else {
          this.selectedIds.delete(id);
        }
        this.updateBatchBar();
      });
    });

    tbody.querySelectorAll('.action-view-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        this.openDetailDrawer(btn.getAttribute('data-id'));
      });
    });

    tbody.querySelectorAll('.action-edit-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        this.openEditModal(btn.getAttribute('data-id'));
      });
    });

    tbody.querySelectorAll('.action-delete-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const candidate = Store.getCandidateById(id);
        if (confirm(`确认删除候选人「${candidate ? candidate.name : ''}」吗？`)) {
          Store.deleteCandidate(id);
          App.showToast('候选人已删除', 'info');
        }
      });
    });
  },

  updateBatchBar() {
    const batchBar = document.getElementById('candidatesBatchBar');
    const selectedCountEl = document.getElementById('batchSelectedCount');
    if (!batchBar || !selectedCountEl) return;

    const count = this.selectedIds.size;
    if (count > 0) {
      batchBar.classList.add('active');
      selectedCountEl.textContent = `已选择 ${count} 位候选人`;
    } else {
      batchBar.classList.remove('active');
    }
  },

  /* ========================================================================
     Add / Edit Candidate Modal
     ======================================================================== */
  openAddModal() {
    const modal = document.getElementById('candidateModalOverlay');
    const title = document.getElementById('candidateModalTitle');
    const form = document.getElementById('candidateForm');
    if (!modal || !form) return;

    title.textContent = '新增候选人记录';
    form.reset();
    document.getElementById('candidateEditId').value = '';
    document.getElementById('candidateCompanyInput').value = '';

    modal.classList.add('active');
  },

  openEditModal(id) {
    const candidate = Store.getCandidateById(id);
    if (!candidate) return;

    const modal = document.getElementById('candidateModalOverlay');
    const title = document.getElementById('candidateModalTitle');
    if (!modal) return;

    title.textContent = `编辑候选人 - ${candidate.name}`;
    document.getElementById('candidateEditId').value = candidate.id;
    document.getElementById('candidateNameInput').value = candidate.name || '';
    document.getElementById('candidatePhoneInput').value = candidate.phone || '';
    document.getElementById('candidateEmailInput').value = candidate.email || '';
    document.getElementById('candidateSchoolInput').value = candidate.school || '';
    document.getElementById('candidateMajorInput').value = candidate.major || '';
    document.getElementById('candidateCompanyInput').value = candidate.company || '';
    document.getElementById('candidatePositionInput').value = candidate.position || '';
    document.getElementById('candidateSourceInput').value = candidate.source || '';
    document.getElementById('candidateStageSelect').value = candidate.stage || 'screening';
    document.getElementById('candidateTagsInput').value = (candidate.tags || []).join(', ');

    modal.classList.add('active');
  },

  closeModal() {
    const modal = document.getElementById('candidateModalOverlay');
    if (modal) modal.classList.remove('active');
  },

  saveCandidateFromModal() {
    const id = document.getElementById('candidateEditId').value;
    const name = document.getElementById('candidateNameInput').value.trim();
    if (!name) {
      App.showToast('请输入候选人姓名', 'warning');
      return;
    }

    const tagsRaw = document.getElementById('candidateTagsInput').value;
    const tags = tagsRaw
      ? tagsRaw.split(/[,，]/).map(t => t.trim()).filter(Boolean)
      : [];

    const candidateData = {
      name: name,
      phone: document.getElementById('candidatePhoneInput').value.trim(),
      email: document.getElementById('candidateEmailInput').value.trim(),
      school: document.getElementById('candidateSchoolInput').value.trim(),
      major: document.getElementById('candidateMajorInput').value.trim(),
      company: document.getElementById('candidateCompanyInput').value.trim(),
      position: document.getElementById('candidatePositionInput').value.trim(),
      source: document.getElementById('candidateSourceInput').value.trim(),
      stage: document.getElementById('candidateStageSelect').value,
      tags: tags
    };

    if (id) {
      Store.updateCandidate(id, candidateData);
      App.showToast(`候选人「${name}」已更新`, 'success');
    } else {
      Store.addCandidate(candidateData);
      App.showToast(`候选人「${name}」已添加`, 'success');
    }

    this.closeModal();
    this.updateFilterDropdowns();
  },

  /* ========================================================================
     Candidate Slide-over Detail Drawer
     ======================================================================== */
  openDetailDrawer(id) {
    const candidate = Store.getCandidateById(id);
    if (!candidate) return;

    this.activeCandidateId = id;
    const drawer = document.getElementById('detailDrawer');
    const overlay = document.getElementById('detailDrawerOverlay');
    if (!drawer || !overlay) return;

    this.renderDrawerContent(candidate);
    overlay.classList.add('active');
    drawer.classList.add('open');
  },

  closeDetailDrawer() {
    const drawer = document.getElementById('detailDrawer');
    const overlay = document.getElementById('detailDrawerOverlay');
    if (drawer) drawer.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
    this.activeCandidateId = null;
  },

  renderDrawerContent(candidate) {
    const container = document.getElementById('detailDrawerContent');
    if (!container) return;

    const stageMeta = Utils.getStageMeta(candidate.stage);
    const stages = ['screening', 'phone', 'interview', 'offer', 'pre_onboarding', 'onboarding', 'post_onboarding'];
    const currentStageIndex = stages.indexOf(candidate.stage);
    const isRejected = candidate.status === 'rejected';

    container.innerHTML = `
      <!-- Header Block -->
      <div class="candidate-detail-header-content">
        <div class="detail-title-block">
          <div class="eyebrow">
            <span>候选人跟进档案</span>
            <span class="badge ${stageMeta.badgeClass}">${stageMeta.label}</span>
          </div>
          <h2 class="detail-name">${Utils.escapeHtml(candidate.name)}</h2>
          <span class="detail-subline">${Utils.escapeHtml(candidate.company ? candidate.company + ' · ' : '')}${Utils.escapeHtml(candidate.position || '未定岗位')} · ${Utils.escapeHtml(candidate.school || '院校未填')}</span>
        </div>
      </div>

      ${isRejected ? `
        <div class="rejection-banner">
          <div>
            <div><i class="ph-bold ph-prohibit agy-style-63dc25"></i> 此候选人已在「${stageMeta.label}」阶段被淘汰</div>
            ${candidate.rejectionReason ? `<div class="rejection-reason">原因：${Utils.escapeHtml(candidate.rejectionReason)}</div>` : ''}
            ${candidate.rejectedAt ? `<div class="rejection-reason">时间：${Utils.formatDateTime(candidate.rejectedAt)}</div>` : ''}
          </div>
        </div>
      ` : ''}

      <!-- Stage Stepper Progression -->
      <div class="bezel-shell agy-style-80f565">
        <div class="bezel-core bezel-core-tight">
          <div class="stage-stepper">
            ${stages.map((stKey, idx) => {
              const meta = Utils.getStageMeta(stKey);
              let statusClass = '';
              if (idx === currentStageIndex) statusClass = 'active';
              else if (idx < currentStageIndex) statusClass = 'completed';

              return `
                <div class="stage-step-item ${statusClass}" onclick="CandidatesModule.shiftCandidateStage('${candidate.id}', '${stKey}')">
                  <div class="stage-step-dot">
                    ${idx < currentStageIndex ? '<i class="ph-bold ph-check"></i>' : idx + 1}
                  </div>
                  <span class="stage-step-label">${meta.label}</span>
                </div>
              `;
            }).join('')}
          </div>
          
          <div class="agy-style-3b13e5">
            <button class="btn btn-ghost btn-sm" ${currentStageIndex === 0 ? 'disabled class="agy-style-84712b"' : ''} onclick="CandidatesModule.stepStage('${candidate.id}', -1)">
              <i class="ph-light ph-caret-left"></i> 回退阶段
            </button>
            <button class="btn btn-primary btn-sm" ${currentStageIndex === stages.length - 1 ? 'disabled class="agy-style-84712b"' : ''} onclick="CandidatesModule.stepStage('${candidate.id}', 1)">
              <span>推进下一阶段</span>
              <span class="btn-icon-circle"><i class="ph-bold ph-caret-right"></i></span>
            </button>
          </div>
        </div>
      </div>

      <!-- Basic Info Grid -->
      <div class="detail-info-grid">
        <div class="info-item">
          <span class="info-item-label">联系手机</span>
          <span class="info-item-value">${candidate.phone ? `<a href="tel:${candidate.phone}" class="agy-style-e26c47">${Utils.escapeHtml(candidate.phone)}</a>` : '-'}</span>
        </div>
        <div class="info-item">
          <span class="info-item-label">电子邮箱</span>
          <span class="info-item-value">${candidate.email ? `<a href="mailto:${candidate.email}" class="agy-style-e26c47">${Utils.escapeHtml(candidate.email)}</a>` : '-'}</span>
        </div>
        <div class="info-item">
          <span class="info-item-label">目标公司</span>
          <span class="info-item-value">${candidate.company ? `<span class="agy-style-380f81"><i class="ph-light ph-buildings agy-style-ad5ad7"></i>${Utils.escapeHtml(candidate.company)}</span>` : '-'}</span>
        </div>
        <div class="info-item">
          <span class="info-item-label">应聘岗位</span>
          <span class="info-item-value">${Utils.escapeHtml(candidate.position || '-')}</span>
        </div>
        <div class="info-item">
          <span class="info-item-label">简历渠道</span>
          <span class="info-item-value">${Utils.escapeHtml(candidate.source || '-')}</span>
        </div>
        <div class="info-item">
          <span class="info-item-label">毕业院校</span>
          <span class="info-item-value">${Utils.escapeHtml(candidate.school || '-')}</span>
        </div>
        <div class="info-item">
          <span class="info-item-label">所学专业</span>
          <span class="info-item-value">${Utils.escapeHtml(candidate.major || '-')}</span>
        </div>
      </div>

      <!-- Interview Schedule Section -->
      <div class="bezel-shell agy-style-38da06">
        <div class="bezel-core bezel-core-tight">
          <div class="card-header-row agy-style-460a71">
            <span class="card-heading agy-style-b670e3">
              <i class="ph-light ph-calendar-check agy-style-379245"></i>
              面试日程安排
            </span>
            ${candidate.interviewDate ? '<span class="badge badge-stage-interview">已排期</span>' : '<span class="badge">待安排</span>'}
          </div>

          <form id="drawerInterviewForm" onsubmit="event.preventDefault(); CandidatesModule.saveInterviewSchedule('${candidate.id}');">
            <div class="agy-style-b9ef3c">
              <div>
                <label class="form-label agy-style-684c37">面试日期</label>
                <input type="date" id="drawerInterviewDate" class="form-input" value="${Utils.escapeHtml(candidate.interviewDate || '')}" />
              </div>
              <div>
                <label class="form-label agy-style-684c37">面试时间</label>
                <input type="time" id="drawerInterviewTime" class="form-input" value="${Utils.escapeHtml(candidate.interviewTime || '')}" />
              </div>
            </div>
            <div class="agy-style-460a71">
              <label class="form-label agy-style-684c37">地点 / 会议链接备注</label>
              <input type="text" id="drawerInterviewNotes" class="form-input" placeholder="例如：腾讯会议号 888-999-123 或 3号会议室" value="${Utils.escapeHtml(candidate.interviewNotes || '')}" />
            </div>
            <div class="agy-style-f2bf5b">
              <button type="submit" class="btn btn-secondary btn-sm">保存日程</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Custom Free-Input Reminders Section -->
      <div class="bezel-shell agy-style-38da06">
        <div class="bezel-core bezel-core-tight">
          <div class="card-header-row agy-style-460a71">
            <span class="card-heading agy-style-b670e3">
              <i class="ph-light ph-bell-ringing agy-style-200979"></i>
              自定义提醒管理
            </span>
            <span class="agy-style-d1d4f6">
              ${(candidate.reminders || []).length} 条提醒
            </span>
          </div>

          <!-- Existing Reminders List -->
          <div class="reminder-list" id="drawerReminderList" class="agy-style-4fceb0">
            ${(candidate.reminders && candidate.reminders.length > 0) ? candidate.reminders.map(r => `
              <div class="reminder-card ${r.fired ? 'fired' : ''}">
                <div class="agy-style-c30bfe">
                  <span class="reminder-datetime">${Utils.formatDateTime(r.datetime)}</span>
                  <span class="reminder-note-text">${Utils.escapeHtml(r.note || '提醒事件')}</span>
                </div>
                <div class="agy-style-87ce07">
                  <span class="reminder-status-pill ${r.fired ? 'status-pill-fired' : 'status-pill-pending'}">
                    ${r.fired ? '已提醒' : '待触发'}
                  </span>
                  <button class="btn-icon btn-sm" onclick="CandidatesModule.deleteReminder('${candidate.id}', '${r.id}')" title="删除此提醒">
                    <i class="ph-light ph-trash agy-style-7abb3a"></i>
                  </button>
                </div>
              </div>
            `).join('') : '<div class="agy-style-56c3cf">暂无设置自定义提醒，可在下方自由设定时间</div>'}
          </div>

          <!-- Add Reminder Form -->
          <form onsubmit="event.preventDefault(); CandidatesModule.addCustomReminder('${candidate.id}');" class="agy-style-326480">
            <div class="agy-style-81b68d">
              <label class="form-label agy-style-684c37">自由设定提醒时间与内容</label>
              <input type="datetime-local" id="newReminderDatetime" class="form-input" required />
              <input type="text" id="newReminderNote" class="form-input" placeholder="输入提醒备注，例如：发送初试邀请、准备技术考题、致电确认" required />
              <div class="agy-style-98a469">
                <button type="submit" class="btn btn-primary btn-sm">
                  <span>设定提醒</span>
                  <span class="btn-icon-circle"><i class="ph-bold ph-plus"></i></span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <!-- Intentions & Environment Feedback Section -->
      <div class="bezel-shell agy-style-e9ad6b">
        <div class="bezel-core bezel-core-tight">
          <div class="card-header-row agy-style-460a71">
            <span class="card-heading agy-style-b670e3">
              <i class="ph-light ph-heart agy-style-0f66d8"></i>
              意愿与环境反馈
            </span>
          </div>
          <form onsubmit="event.preventDefault(); CandidatesModule.saveIntentionNotes('${candidate.id}');">
            <div class="agy-style-460a71">
              <textarea id="drawerIntentionNotes" class="form-textarea" placeholder="记录候选人入职前意愿、顾虑，以及入职后对工作环境的满意度和反馈..." class="agy-style-6f0a95">${Utils.escapeHtml(candidate.intentionNotes || '')}</textarea>
            </div>
            <div class="agy-style-1ccc02">
              <button type="submit" class="btn btn-secondary btn-sm">
                <span>保存记录</span>
                <span class="btn-icon-circle"><i class="ph-bold ph-floppy-disk"></i></span>
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Feedback Notes & Impressions Section -->
      <div class="bezel-shell agy-style-38da06">
        <div class="bezel-core bezel-core-tight">
          <div class="card-header-row agy-style-460a71">
            <span class="card-heading agy-style-b670e3">
              <i class="ph-light ph-chat-centered-dots agy-style-9d1959"></i>
              面试面评与印象笔记
            </span>
            <span class="agy-style-d1d4f6">
              ${(candidate.notes || []).length} 条反馈
            </span>
          </div>

          <!-- Add Note Form -->
          <form onsubmit="event.preventDefault(); CandidatesModule.addNewNote('${candidate.id}');" class="agy-style-3ea053">
            <div class="agy-style-a55ec1">
              <div>
                <label class="form-label agy-style-684c37">评价人</label>
                <input type="text" id="newNoteAuthor" class="form-input" placeholder="例如：技术主管 / HR" value="招聘负责人" />
              </div>
            </div>
            <div class="agy-style-89da1c">
              <label class="form-label agy-style-684c37">评价内容与综合反馈</label>
              <textarea id="newNoteContent" class="form-textarea" placeholder="记录候选人技术广度、逻辑表达、实习意愿及沟通印象..." required></textarea>
            </div>
            <div class="agy-style-1ccc02">
              <button type="submit" class="btn btn-primary btn-sm">
                <span>提交面评</span>
                <span class="btn-icon-circle"><i class="ph-bold ph-paper-plane-right"></i></span>
              </button>
            </div>
          </form>

          <!-- Historical Notes Timeline -->
          <div class="notes-timeline">
            ${(candidate.notes && candidate.notes.length > 0) ? candidate.notes.map(n => `
              <div class="note-item">
                <div class="note-header">
                  <div class="agy-style-87ce07">
                    <span class="note-author">${Utils.escapeHtml(n.author)}</span>
                  </div>
                  <div class="agy-style-87ce07">
                    <span class="note-date">${Utils.formatRelativeTime(n.createdAt)}</span>
                    <button class="btn-icon btn-sm" onclick="CandidatesModule.deleteNote('${candidate.id}', '${n.id}')" title="删除此评价">
                      <i class="ph-light ph-trash agy-style-af89d6"></i>
                    </button>
                  </div>
                </div>
                <div class="note-content">${Utils.escapeHtml(n.content)}</div>
              </div>
            `).join('') : '<div class="agy-style-56c3cf">暂无面评记录，可在上方填写首次面试反馈</div>'}
          </div>
        </div>
      </div>

      <!-- Reject / Reactivate & Delete Actions -->
      <div class="agy-style-4c4be6">
        ${isRejected ? `
          <button class="btn btn-sm agy-style-d9520c" onclick="CandidatesModule.reactivateCandidateFromDrawer('${candidate.id}')">
            <i class="ph-light ph-arrow-counter-clockwise"></i>
            恢复为活跃状态
          </button>
        ` : `
          <button class="btn btn-sm agy-style-fd53e2" onclick="CandidatesModule.rejectCandidateFromDrawer('${candidate.id}')">
            <i class="ph-light ph-prohibit"></i>
            淘汰该候选人
          </button>
        `}
        <button class="btn btn-danger btn-sm" onclick="CandidatesModule.deleteCandidateFromDrawer('${candidate.id}')">
          <i class="ph-light ph-trash"></i>
          删除候选人档案
        </button>
      </div>
    `;
  },

  stepStage(candidateId, direction) {
    const candidate = Store.getCandidateById(candidateId);
    if (!candidate) return;

    const stages = ['screening', 'phone', 'interview', 'offer', 'pre_onboarding', 'onboarding', 'post_onboarding'];
    const curIdx = stages.indexOf(candidate.stage);
    const newIdx = curIdx + direction;

    if (newIdx >= 0 && newIdx < stages.length) {
      const nextStage = stages[newIdx];
      Store.updateCandidate(candidateId, { stage: nextStage });
      App.showToast(`已流转至「${Utils.getStageMeta(nextStage).label}」`, 'success');
      this.renderDrawerContent(Store.getCandidateById(candidateId));
    }
  },

  shiftCandidateStage(candidateId, targetStage) {
    Store.updateCandidate(candidateId, { stage: targetStage });
    App.showToast(`阶段已变更为「${Utils.getStageMeta(targetStage).label}」`, 'success');
    this.renderDrawerContent(Store.getCandidateById(candidateId));
  },

  saveInterviewSchedule(candidateId) {
    const date = document.getElementById('drawerInterviewDate').value;
    const time = document.getElementById('drawerInterviewTime').value;
    const notes = document.getElementById('drawerInterviewNotes').value.trim();

    Store.updateCandidate(candidateId, {
      interviewDate: date || null,
      interviewTime: time || null,
      interviewNotes: notes
    });

    App.showToast('面试日程已更新', 'success');
    this.renderDrawerContent(Store.getCandidateById(candidateId));
  },

  saveIntentionNotes(candidateId) {
    const notes = document.getElementById('drawerIntentionNotes').value.trim();
    Store.updateCandidate(candidateId, { intentionNotes: notes });
    App.showToast('意愿与环境反馈已保存', 'success');
    this.renderDrawerContent(Store.getCandidateById(candidateId));
  },

  addCustomReminder(candidateId) {
    const datetimeInput = document.getElementById('newReminderDatetime');
    const noteInput = document.getElementById('newReminderNote');
    if (!datetimeInput || !datetimeInput.value) {
      App.showToast('请选择有效的提醒日期与时间', 'warning');
      return;
    }

    // Request Notification permission if not yet decided
    if (window.App && window.App.reminderManager) {
      window.App.reminderManager.requestPermission();
    }

    Store.addReminder(candidateId, {
      datetime: datetimeInput.value,
      note: noteInput.value.trim()
    });

    App.showToast('自定义提醒设定成功', 'success');
    this.renderDrawerContent(Store.getCandidateById(candidateId));
  },

  deleteReminder(candidateId, reminderId) {
    Store.deleteReminder(candidateId, reminderId);
    App.showToast('提醒已删除', 'info');
    this.renderDrawerContent(Store.getCandidateById(candidateId));
  },

  addNewNote(candidateId) {
    const author = document.getElementById('newNoteAuthor').value.trim();
    const content = document.getElementById('newNoteContent').value.trim();

    if (!content) {
      App.showToast('请输入评价内容', 'warning');
      return;
    }

    Store.addNote(candidateId, {
      author,
      content
    });

    App.showToast('面评记录已保存', 'success');
    this.renderDrawerContent(Store.getCandidateById(candidateId));
  },

  deleteNote(candidateId, noteId) {
    if (confirm('确定删除该条评价记录吗？')) {
      Store.deleteNote(candidateId, noteId);
      App.showToast('评价已删除', 'info');
      this.renderDrawerContent(Store.getCandidateById(candidateId));
    }
  },

  deleteCandidateFromDrawer(candidateId) {
    const candidate = Store.getCandidateById(candidateId);
    if (!candidate) return;

    if (confirm(`确认删除候选人「${candidate.name}」的所有记录吗？`)) {
      Store.deleteCandidate(candidateId);
      this.closeDetailDrawer();
      App.showToast('候选人已删除', 'info');
    }
  },

  rejectCandidateFromDrawer(candidateId) {
    const reason = prompt('请输入淘汰原因（可选）：', '');
    if (reason === null) return; // User cancelled
    Store.rejectCandidate(candidateId, reason);
    App.showToast('候选人已标记为淘汰', 'info');
    this.renderDrawerContent(Store.getCandidateById(candidateId));
  },

  reactivateCandidateFromDrawer(candidateId) {
    Store.reactivateCandidate(candidateId);
    App.showToast('候选人已恢复为活跃状态', 'success');
    this.renderDrawerContent(Store.getCandidateById(candidateId));
  },

  bulkRejectCandidates() {
    if (this.selectedIds.size === 0) return;
    const reason = prompt('请输入批量淘汰原因（可选）：', '');
    if (reason === null) return;
    Store.bulkRejectCandidates(Array.from(this.selectedIds), reason);
    App.showToast(`已批量淘汰 ${this.selectedIds.size} 位候选人`, 'info');
    this.selectedIds.clear();
    this.render();
  }
};

window.CandidatesModule = CandidatesModule;
