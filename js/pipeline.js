/**
 * Candidate Follow-up Management System
 * Pipeline Kanban Board: 5 Stages, Drag & Drop, Stage Progression
 */

const PipelineModule = {
  STAGES: ['screening', 'phone', 'interview', 'offer', 'pre_onboarding', 'onboarding', 'post_onboarding'],
  showRejected: false,

  init() {
    this.render();
  },

  render() {
    const board = document.getElementById('kanbanBoard');
    if (!board) return;

    const allCandidates = Store.getAllCandidates();
    const totalCount = allCandidates.length;

    // Group candidates by stage
    const stageGroups = {
      screening: [],
      phone: [],
      interview: [],
      offer: [],
      pre_onboarding: [],
      onboarding: [],
      post_onboarding: []
    };

    allCandidates.forEach(c => {
      const st = stageGroups[c.stage] ? c.stage : 'screening';
      stageGroups[st].push(c);
    });

    // Update toggle button UI
    const toggleBtn = document.getElementById('toggleRejectedBtn');
    if (toggleBtn) {
      if (this.showRejected) {
        toggleBtn.classList.add('active');
        toggleBtn.innerHTML = '<i class="ph-light ph-eye"></i> 显示已淘汰';
      } else {
        toggleBtn.classList.remove('active');
        toggleBtn.innerHTML = '<i class="ph-light ph-eye-slash"></i> 隐藏已淘汰';
      }
    }

    board.innerHTML = this.STAGES.map(stKey => {
      const meta = Utils.getStageMeta(stKey);
      let list = stageGroups[stKey] || [];
      // Filter out rejected if toggle is off
      const visibleList = this.showRejected ? list : list.filter(c => c.status !== 'rejected');
      const activeCount = list.filter(c => c.status !== 'rejected').length;
      const percentage = totalCount > 0 ? Math.round((activeCount / totalCount) * 100) : 0;

      return `
        <div class="kanban-column" data-stage="${stKey}">
          <div class="kanban-col-header">
            <div class="kanban-col-title-box">
              <span class="badge-dot" style="background: ${meta.color}; width: 8px; height: 8px;"></span>
              <span class="kanban-col-title">${meta.label}</span>
              <span class="kanban-col-count">${activeCount}</span>
            </div>
            <span class="agy-style-d1d4f6">${percentage}%</span>
          </div>

          <div class="kanban-card-list" data-stage="${stKey}">
            ${visibleList.length > 0 ? visibleList.map(c => this.renderCardHtml(c)).join('') : `
              <div class="agy-style-d9d44a">
                <i class="ph-light ph-tray agy-style-052f52"></i>
                <span>暂无候选人</span>
              </div>
            `}
          </div>
        </div>
      `;
    }).join('');

    this.bindDragDropEvents();
  },

  renderCardHtml(candidate) {
    const isRejected = candidate.status === 'rejected';
    const hasInterview = Boolean(candidate.interviewDate);
    const stages = this.STAGES;
    const curIdx = stages.indexOf(candidate.stage);

    return `
      <div class="kanban-card ${isRejected ? 'rejected' : ''}" draggable="${isRejected ? 'false' : 'true'}" data-id="${candidate.id}">
        ${isRejected ? '<div class="rejected-stamp">已淘汰</div>' : ''}
        <div class="kanban-card-header">
          <span class="kanban-card-name">${Utils.escapeHtml(candidate.name)}</span>
        </div>

        <div class="kanban-card-school">
          ${Utils.escapeHtml(candidate.school || '院校未填')}${candidate.major ? ' · ' + Utils.escapeHtml(candidate.major) : ''}
        </div>

        <div class="kanban-card-tags">
          ${candidate.company ? `<span class="tag-pill agy-style-54603c"><i class="ph-light ph-buildings agy-style-3af4ed"></i>${Utils.escapeHtml(candidate.company)}</span>` : ''}
          ${candidate.position ? `<span class="tag-pill agy-style-a985f8">${Utils.escapeHtml(candidate.position)}</span>` : ''}
          ${candidate.source ? `<span class="tag-pill">${Utils.escapeHtml(candidate.source)}</span>` : ''}
        </div>

        ${hasInterview && !isRejected ? `
          <div class="agy-style-dce845">
            <i class="ph-light ph-clock"></i>
            <span>${Utils.formatDate(candidate.interviewDate)} ${Utils.escapeHtml(candidate.interviewTime || '')}</span>
          </div>
        ` : ''}

        <div class="kanban-card-footer">
          <span class="agy-style-d1d4f6">
            ${Utils.formatRelativeTime(candidate.createdAt)}
          </span>
          ${!isRejected ? `
            <div class="kanban-card-shift-btns" onclick="event.stopPropagation();">
              ${curIdx > 0 ? `
                <button class="btn-shift" title="回退阶段" onclick="PipelineModule.shiftStage('${candidate.id}', -1)">
                  <i class="ph-bold ph-caret-left"></i>
                </button>
              ` : ''}
              ${curIdx < stages.length - 1 ? `
                <button class="btn-shift" title="推进阶段" onclick="PipelineModule.shiftStage('${candidate.id}', 1)">
                  <i class="ph-bold ph-caret-right"></i>
                </button>
              ` : ''}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  },

  bindDragDropEvents() {
    const cards = document.querySelectorAll('.kanban-card');
    const lists = document.querySelectorAll('.kanban-card-list');

    cards.forEach(card => {
      card.addEventListener('dragstart', e => {
        const id = card.getAttribute('data-id');
        e.dataTransfer.setData('text/plain', id);
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => card.classList.add('dragging'), 0);
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
      });

      card.addEventListener('click', () => {
        const id = card.getAttribute('data-id');
        if (window.CandidatesModule) {
          window.CandidatesModule.openDetailDrawer(id);
        }
      });
    });

    lists.forEach(list => {
      list.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        list.classList.add('drag-over');
      });

      list.addEventListener('dragleave', e => {
        if (!list.contains(e.relatedTarget)) {
          list.classList.remove('drag-over');
        }
      });

      list.addEventListener('drop', e => {
        e.preventDefault();
        list.classList.remove('drag-over');

        const candidateId = e.dataTransfer.getData('text/plain');
        const targetStage = list.getAttribute('data-stage');

        if (candidateId && targetStage) {
          const candidate = Store.getCandidateById(candidateId);
          if (candidate && candidate.stage !== targetStage) {
            Store.updateCandidate(candidateId, { stage: targetStage });
            const meta = Utils.getStageMeta(targetStage);
            App.showToast(`已将「${candidate.name}」移至「${meta.label}」`, 'success');
          }
        }
      });
    });
  },

  shiftStage(candidateId, direction) {
    const candidate = Store.getCandidateById(candidateId);
    if (!candidate) return;

    const curIdx = this.STAGES.indexOf(candidate.stage);
    const newIdx = curIdx + direction;

    if (newIdx >= 0 && newIdx < this.STAGES.length) {
      const nextStage = this.STAGES[newIdx];
      Store.updateCandidate(candidateId, { stage: nextStage });
      App.showToast(`已将「${candidate.name}」流转至「${Utils.getStageMeta(nextStage).label}」`, 'success');
    }
  },

  toggleRejected() {
    this.showRejected = !this.showRejected;
    this.render();
  }
};

window.PipelineModule = PipelineModule;
