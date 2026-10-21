/**
 * Candidate Follow-up Management System
 * Main Application Coordinator: Router, Reminder Background Worker, Toast System & Backup
 */

const App = {
  currentRoute: 'overview',
  reminderInterval: null,
  unreadRemindersCount: 0,

  init() {
    if (window.JobOrdersModule) {
      window.JobOrdersModule.init();
    }
    if (window.WhatsAppModule) {
      window.WhatsAppModule.init();
    }
    this.initRouter();
    this.initNavigation();
    this.initReminderWorker();
    this.initBackupHandlers();
    this.initMobileMenu();

    // Subscribe store changes to update UI
    Store.subscribe(() => {
      this.refreshCurrentView();
      this.updateSidebarStats();
    });

    // Initial render
    this.navigateTo(this.getRouteFromHash() || 'overview');
    this.updateSidebarStats();
  },

  /* ========================================================================
     Router & View Transitions
     ======================================================================== */
  getRouteFromHash() {
    const hash = window.location.hash.replace('#', '');
    return ['overview', 'orders', 'candidates', 'pipeline', 'calendar', 'analytics', 'whatsapp'].includes(hash) ? hash : 'overview';
  },

  initRouter() {
    window.addEventListener('hashchange', () => {
      this.navigateTo(this.getRouteFromHash());
    });
  },

  initNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', e => {
        e.preventDefault();
        const route = item.getAttribute('data-route');
        if (route) {
          window.location.hash = '#' + route;
        }
      });
    });

    // Global "New Candidate" button in Topbar
    const globalAddBtn = document.getElementById('globalAddCandidateBtn');
    if (globalAddBtn) {
      globalAddBtn.addEventListener('click', () => {
        if (window.CandidatesModule) {
          window.CandidatesModule.openAddModal();
        }
      });
    }

    // Bell Button Handler
    const bellBtn = document.getElementById('headerBellBtn');
    if (bellBtn) {
      bellBtn.addEventListener('click', () => {
        this.requestNotificationPermission();
        this.checkAndShowDueReminders();
      });
    }
  },

  navigateTo(route) {
    this.currentRoute = route;

    // Update Nav Active State
    document.querySelectorAll('.nav-item').forEach(item => {
      if (item.getAttribute('data-route') === route) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Update Page View Visibility
    document.querySelectorAll('.page-view').forEach(view => {
      if (view.id === `view-${route}`) {
        view.classList.add('active');
      } else {
        view.classList.remove('active');
      }
    });

    // Update Header Titles
    const titles = {
      overview: { title: '工作台概览', subtitle: 'Internship 招聘看板与核心数据指标' },
      orders: { title: '招聘订单与岗位需求库', subtitle: '目标公司招聘指标、薪资福利、工作时间与多词智能检索' },
      candidates: { title: '候选人管理', subtitle: '全流程信息追踪、面评档案与标签管理' },
      pipeline: { title: '招聘看板', subtitle: '5 阶段敏捷流转与拖拽式候选人状态管理' },
      calendar: { title: '面试日程', subtitle: '面试排期、日历视图与待办议程' },
      analytics: { title: '数据洞察', subtitle: '全环节转化漏斗、渠道分析与招聘效能' },
      whatsapp: { title: 'WhatsApp 通知与触达', subtitle: '利用本地机器人接口发送面试提醒与模板消息' }
    };

    const headerTitle = document.getElementById('headerTitle');
    const headerSubtitle = document.getElementById('headerSubtitle');
    if (headerTitle && titles[route]) headerTitle.textContent = titles[route].title;
    if (headerSubtitle && titles[route]) headerSubtitle.textContent = titles[route].subtitle;

    // Close mobile drawer if open
    const sidebar = document.getElementById('appSidebar');
    const overlay = document.getElementById('mobileOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');

    // Trigger Module Render
    this.refreshCurrentView();
  },

  refreshCurrentView() {
    switch (this.currentRoute) {
      case 'overview':
        this.renderOverview();
        break;
      case 'orders':
        if (window.JobOrdersModule) window.JobOrdersModule.render();
        break;
      case 'candidates':
        if (window.CandidatesModule) window.CandidatesModule.render();
        break;
      case 'pipeline':
        if (window.PipelineModule) window.PipelineModule.render();
        break;
      case 'calendar':
        if (window.CalendarModule) window.CalendarModule.render();
        break;
      case 'analytics':
        if (window.AnalyticsModule) window.AnalyticsModule.render();
        break;
      case 'whatsapp':
        if (window.WhatsAppModule) window.WhatsAppModule.render();
        break;
    }
  },

  /* ========================================================================
     Overview / Dashboard Renderer
     ======================================================================== */
  renderOverview() {
    const candidates = Store.getAllCandidates();

    // 1. Metric Cards (exclude rejected)
    const activeCandidates = candidates.filter(c => c.status !== 'rejected');
    const total = activeCandidates.length;
    const active = activeCandidates.filter(c => ['screening', 'phone', 'interview', 'offer', 'pre_onboarding'].includes(c.stage)).length;
    const offerAndOnboard = activeCandidates.filter(c => ['offer', 'pre_onboarding', 'onboarding', 'post_onboarding'].includes(c.stage)).length;
    const rate = total > 0 ? ((offerAndOnboard / total) * 100).toFixed(1) : '0.0';

    // Upcoming interviews in next 7 days
    const today = Utils.formatDate(new Date());
    const next7DaysDate = new Date();
    next7DaysDate.setDate(next7DaysDate.getDate() + 7);
    const maxUpcomingDate = Utils.formatDate(next7DaysDate);
    const upcomingInterviews = candidates
      .filter(c => {
        if (!c.interviewDate) return false;
        const d = Utils.formatDate(c.interviewDate);
        return d && d !== '-' && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= today && d <= maxUpcomingDate;
      })
      .sort((a, b) => {
        const timeA = a.interviewTime || '00:00';
        const timeB = b.interviewTime || '00:00';
        const dtA = `${Utils.formatDate(a.interviewDate)} ${timeA}`;
        const dtB = `${Utils.formatDate(b.interviewDate)} ${timeB}`;
        return dtA.localeCompare(dtB);
      });

    const mTotal = document.getElementById('bentoMetricTotal');
    const mActive = document.getElementById('bentoMetricActive');
    const mUpcoming = document.getElementById('bentoMetricUpcoming');
    const mRate = document.getElementById('bentoMetricRate');

    if (mTotal) mTotal.textContent = total;
    if (mActive) mActive.textContent = active;
    if (mUpcoming) mUpcoming.textContent = upcomingInterviews.length;
    if (mRate) mRate.textContent = `${rate}%`;

    // 2. Mini Charts inside Overview
    this.renderOverviewCharts(candidates);

    // 3. Upcoming List inside Overview
    this.renderOverviewUpcomingList(upcomingInterviews);

    // 4. Recent Candidates List
    this.renderOverviewRecentList(candidates);
  },

  renderOverviewCharts(candidates) {
    if (!window.Chart) return;

    // Funnel Chart inside Bento
    const funnelCanvas = document.getElementById('bentoFunnelCanvas');
    if (funnelCanvas) {
      if (this.bentoFunnelChart) this.bentoFunnelChart.destroy();

      const stages = [
        { label: '初筛', count: candidates.filter(c => c.stage === 'screening').length, color: '#6366f1' },
        { label: '电话', count: candidates.filter(c => c.stage === 'phone').length, color: '#3b82f6' },
        { label: '面试', count: candidates.filter(c => c.stage === 'interview').length, color: '#f59e0b' },
        { label: 'Offer', count: candidates.filter(c => c.stage === 'offer').length, color: '#8b5cf6' },
        { label: '待入职', count: candidates.filter(c => c.stage === 'pre_onboarding').length, color: '#0ea5e9' },
        { label: '入职', count: candidates.filter(c => c.stage === 'onboarding').length, color: '#10b981' },
        { label: '入职后', count: candidates.filter(c => c.stage === 'post_onboarding').length, color: '#ec4899' }
      ];

      const ctx = funnelCanvas.getContext('2d');
      this.bentoFunnelChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: stages.map(s => s.label),
          datasets: [{
            data: stages.map(s => s.count),
            backgroundColor: stages.map(s => s.color + '88'),
            borderColor: stages.map(s => s.color),
            borderWidth: 1.5,
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#0f111c',
              titleColor: '#f4f5f9',
              bodyColor: '#9497ab',
              borderColor: 'rgba(255, 255, 255, 0.12)',
              borderWidth: 1,
              padding: 8,
              cornerRadius: 6
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: '#9497ab', font: { family: 'Plus Jakarta Sans', size: 11 } }
            },
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(255, 255, 255, 0.04)' },
              ticks: { color: '#9497ab', stepSize: 1, font: { family: 'Geist Mono', size: 10 } }
            }
          }
        }
      });
    }

    // Sources Doughnut inside Bento
    const sourcesCanvas = document.getElementById('bentoSourcesCanvas');
    if (sourcesCanvas) {
      if (this.bentoSourcesChart) this.bentoSourcesChart.destroy();

      const sourceMap = {};
      candidates.forEach(c => {
        const src = c.source || '未标明来源';
        sourceMap[src] = (sourceMap[src] || 0) + 1;
      });

      const labels = Object.keys(sourceMap);
      const data = Object.values(sourceMap);
      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

      const ctx = sourcesCanvas.getContext('2d');
      this.bentoSourcesChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: labels.length > 0 ? labels : ['暂无数据'],
          datasets: [{
            data: data.length > 0 ? data : [1],
            backgroundColor: data.length > 0 ? colors.slice(0, labels.length) : ['rgba(255,255,255,0.06)'],
            borderColor: '#0b0c13',
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '70%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: '#9497ab', font: { size: 11, family: 'Plus Jakarta Sans' }, boxWidth: 10, padding: 8 }
            }
          }
        }
      });
    }
  },

  renderOverviewUpcomingList(upcoming) {
    const listEl = document.getElementById('bentoUpcomingList');
    if (!listEl) return;

    if (upcoming.length === 0) {
      listEl.innerHTML = `
        <div class="agy-style-1fabc6">
          暂无近期排期的面试
        </div>
      `;
      return;
    }

    listEl.innerHTML = upcoming.slice(0, 4).map(c => `
      <div class="agenda-item" onclick="CandidatesModule.openDetailDrawer('${c.id}')">
        <div>
          <div class="agenda-candidate-name">${Utils.escapeHtml(c.name)}</div>
          <div class="agenda-position-tag">${Utils.escapeHtml(c.company ? c.company + ' · ' : '')}${Utils.escapeHtml(c.position || '未定岗位')}</div>
        </div>
        <span class="agenda-time-badge">${Utils.formatDate(c.interviewDate)} ${Utils.escapeHtml(c.interviewTime || '')}</span>
      </div>
    `).join('');
  },

  renderOverviewRecentList(candidates) {
    const listEl = document.getElementById('bentoRecentCandidatesList');
    if (!listEl) return;

    if (candidates.length === 0) {
      listEl.innerHTML = `
        <div class="agy-style-014b94">
          暂无候选人记录，点击右上角「新增候选人」开始管理
        </div>
      `;
      return;
    }

    listEl.innerHTML = candidates.slice(0, 5).map(c => {
      const stageMeta = Utils.getStageMeta(c.stage);
      return `
        <div class="agenda-item" onclick="CandidatesModule.openDetailDrawer('${c.id}')" class="agy-style-89da1c">
          <div class="agy-style-2b367b">
            <div class="agy-style-a4196e">
              <span class="agy-style-a52d69">${Utils.escapeHtml(c.name)}</span>
              <span class="agy-style-fb08c5">${Utils.escapeHtml(c.school || '院校未填')}</span>
            </div>
            ${c.company ? `<span class="tag-pill agy-style-54603c"><i class="ph-light ph-buildings agy-style-3af4ed"></i>${Utils.escapeHtml(c.company)}</span>` : ''}
            ${c.position ? `<span class="tag-pill">${Utils.escapeHtml(c.position)}</span>` : ''}
          </div>
          <div class="agy-style-2b367b">
            <span class="badge ${stageMeta.badgeClass}">
              <span class="badge-dot"></span>
              ${stageMeta.label}
            </span>
            <span class="agy-style-03a992">
              ${Utils.formatRelativeTime(c.createdAt)}
            </span>
          </div>
        </div>
      `;
    }).join('');
  },

  updateSidebarStats() {
    const candidates = Store.getAllCandidates();
    const candidateNavBadge = document.getElementById('sidebarCandidatesBadge');
    if (candidateNavBadge) {
      candidateNavBadge.textContent = candidates.length;
    }

    const jobOrders = Store.getAllJobOrders ? Store.getAllJobOrders() : [];
    const activeOrders = jobOrders.filter(o => o.status === 'open' || o.status === 'urgent');
    const orderNavBadge = document.getElementById('sidebarOrdersBadge');
    if (orderNavBadge) {
      orderNavBadge.textContent = activeOrders.length;
    }

    const storageStatus = document.getElementById('storageCandidateCount');
    if (storageStatus) {
      storageStatus.textContent = `${candidates.length} 候选人 · ${jobOrders.length} 需求`;
    }
  },

  /* ========================================================================
     Notification & Background Reminder Worker
     ======================================================================== */
  initReminderWorker() {
    // Check reminders immediately on startup
    this.checkAndFireReminders();

    // Set interval to check every 30 seconds
    if (this.reminderInterval) clearInterval(this.reminderInterval);
    this.reminderInterval = setInterval(() => {
      this.checkAndFireReminders();
    }, 30000);
  },

  requestNotificationPermission() {
    if ('Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            App.showToast('桌面系统通知权限已开启', 'success');
          } else {
            App.showToast('桌面系统通知权限未开启，将使用应用内提醒', 'info');
          }
        });
      } else if (Notification.permission === 'granted') {
        App.showToast('桌面系统通知已启用', 'info');
      }
    }
  },

  checkAndFireReminders() {
    const candidates = Store.getAllCandidates();
    const now = new Date();

    let newFired = 0;

    candidates.forEach(candidate => {
      if (Array.isArray(candidate.reminders)) {
        candidate.reminders.forEach(reminder => {
          if (!reminder.fired && reminder.datetime) {
            const reminderTime = new Date(reminder.datetime);
            // If reminder time is passed or within current minute
            if (reminderTime <= now) {
              Store.markReminderFired(candidate.id, reminder.id);
              this.dispatchReminderNotification(candidate, reminder);
              newFired++;
            }
          }
        });
      }
    });

    this.updateBellBadge();
  },

  dispatchReminderNotification(candidate, reminder) {
    const title = `跟进提醒: ${candidate.name}`;
    const body = reminder.note || `请跟进候选人 ${candidate.name} 的招聘流程`;

    if (window.electronAPI) {
      // 1. Electron Native System Notification
      window.electronAPI.sendNotification(title, body);
    } else {
      // 1. Browser Native Desktop Notification
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(title, {
            body: body,
            tag: `reminder-${reminder.id}`
          });
        } catch (err) {
          console.warn('Failed to spawn desktop notification:', err);
        }
      }
    }

    // 2. In-app High-end Toast Notification
    this.showToast(`【提醒】${candidate.name}: ${body}`, 'warning', 8000);
    this.unreadRemindersCount++;
    this.updateBellBadge();
  },

  updateBellBadge() {
    const badge = document.getElementById('headerBellBadge');
    if (!badge) return;

    if (this.unreadRemindersCount > 0) {
      badge.textContent = this.unreadRemindersCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  },

  checkAndShowDueReminders() {
    const candidates = Store.getAllCandidates();
    const allReminders = [];

    candidates.forEach(c => {
      if (Array.isArray(c.reminders)) {
        c.reminders.forEach(r => {
          allReminders.push({ candidate: c, reminder: r });
        });
      }
    });

    if (allReminders.length === 0) {
      this.showToast('当前无任何待办提醒设定', 'info');
    } else {
      const pendingCount = allReminders.filter(item => !item.reminder.fired).length;
      this.showToast(`共有 ${allReminders.length} 条提醒记录（${pendingCount} 条待提醒）`, 'info');
    }
    this.unreadRemindersCount = 0;
    this.updateBellBadge();
  },

  /* ========================================================================
     Toast System
     ======================================================================== */
  showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;

    let iconClass = 'ph-info';
    if (type === 'success') iconClass = 'ph-check-circle';
    if (type === 'warning') iconClass = 'ph-warning-circle';
    if (type === 'danger') iconClass = 'ph-x-circle';

    toast.innerHTML = `
      <i class="ph-light ${iconClass} toast-icon"></i>
      <span>${Utils.escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => {
        if (container.contains(toast)) {
          container.removeChild(toast);
        }
      }, 300);
    }, duration);
  },

  /* ========================================================================
     Async UI Components
     ======================================================================== */
  confirmDialog(title, message) {
    return new Promise(resolve => {
      const overlay = document.getElementById('confirmModalOverlay');
      const titleEl = document.getElementById('confirmModalTitle');
      const msgEl = document.getElementById('confirmModalMessage');
      const confirmBtn = document.getElementById('confirmModalConfirmBtn');
      const cancelBtn = document.getElementById('confirmModalCancelBtn');

      titleEl.textContent = title;
      msgEl.textContent = message;
      overlay.classList.add('active');

      const cleanup = () => {
        overlay.classList.remove('active');
        confirmBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click', onCancel);
      };

      const onConfirm = () => { cleanup(); resolve(true); };
      const onCancel = () => { cleanup(); resolve(false); };

      confirmBtn.addEventListener('click', onConfirm);
      cancelBtn.addEventListener('click', onCancel);
    });
  },

  promptDialog(title, message) {
    return new Promise(resolve => {
      const overlay = document.getElementById('promptModalOverlay');
      const titleEl = document.getElementById('promptModalTitle');
      const msgEl = document.getElementById('promptModalMessage');
      const inputEl = document.getElementById('promptModalInput');
      const confirmBtn = document.getElementById('promptModalConfirmBtn');
      const cancelBtn = document.getElementById('promptModalCancelBtn');

      titleEl.textContent = title;
      msgEl.textContent = message;
      inputEl.value = '';
      overlay.classList.add('active');
      inputEl.focus();

      const cleanup = () => {
        overlay.classList.remove('active');
        confirmBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click', onCancel);
        inputEl.removeEventListener('keydown', onKeyDown);
      };

      const onConfirm = () => { cleanup(); resolve(inputEl.value); };
      const onCancel = () => { cleanup(); resolve(null); };
      const onKeyDown = (e) => {
        if (e.key === 'Enter') onConfirm();
        if (e.key === 'Escape') onCancel();
      };

      confirmBtn.addEventListener('click', onConfirm);
      cancelBtn.addEventListener('click', onCancel);
      inputEl.addEventListener('keydown', onKeyDown);
    });
  },

  /* ========================================================================
     JSON Data Backup: Export & Import Handlers
     ======================================================================== */
  initBackupHandlers() {
    const exportBtn = document.getElementById('sidebarExportBtn');
    const importBtn = document.getElementById('sidebarImportBtn');
    const fileInput = document.getElementById('hiddenBackupFileInput');

    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const backupData = Store.exportFullBackup();
        Utils.downloadJson(backupData);
        this.showToast('数据备份已导出至 JSON 文件', 'success');
      });
    }

    if (importBtn && fileInput) {
      importBtn.addEventListener('click', () => {
        fileInput.click();
      });

      fileInput.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async evt => {
          try {
            const data = JSON.parse(evt.target.result);
            
            const report = Store.validateImportData(data);

            if (!report.valid) {
              this.showToast(`导入失败：${report.errors.join('；')}`, 'danger');
              fileInput.value = '';
              return;
            }

            if (report.warnings.length > 0) {
              const warningText = report.warnings.map((w, i) => `${i + 1}. ${w}`).join('\n');
              const confirmed = await this.confirmDialog(
                '确认导入数据？',
                `即将导入 ${report.candidateCount} 条候选人数据。\n\n⚠️ 以下事项需要确认：\n${warningText}`
              );
              if (!confirmed) {
                this.showToast('已取消导入', 'info');
                fileInput.value = '';
                return;
              }
            }

            const res = Store.importFullBackup(report.sanitizedData, 'merge');
            this.showToast(`成功导入数据，当前共 ${res.count} 位候选人`, 'success');
            fileInput.value = '';
          } catch (err) {
            console.error('Import parse error:', err);
            this.showToast('备份文件解析失败，请确认文件格式正确', 'danger');
            fileInput.value = '';
          }
        };
        reader.readAsText(file);
      });
    }

    const encryptBtn = document.getElementById('sidebarEncryptBtn');
    if (encryptBtn && window.electronAPI) {
      encryptBtn.addEventListener('click', async () => {
        const pwd = await this.promptDialog('设置加密密码', '要求至少 8 位，包含字母和数字。设置后，您的本地数据将被加密存储。留空则取消操作。');
        if (!pwd) return;

        const res = await window.electronAPI.setEncryptionPassword(pwd);
        if (res.success) {
          Store.saveToStorage(); // Rewrite data with new encryption
          this.showToast('数据加密密码设置成功，数据已重新加密。', 'success');
        } else {
          this.showToast(res.reason === 'WEAK_PASSWORD' ? '密码强度过弱，需至少 8 位且包含字母与数字。' : '密码设置失败。', 'danger');
        }
      });
    }
  },

  /* ========================================================================
     Mobile Navigation Toggle
     ======================================================================== */
  initMobileMenu() {
    const toggle = document.getElementById('mobileNavToggle');
    const sidebar = document.getElementById('appSidebar');
    const overlay = document.getElementById('mobileOverlay');

    if (toggle && sidebar && overlay) {
      toggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('active');
      });

      overlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
      });
    }
  }
};

window.App = App;

// Bootstrap on DOM Ready
document.addEventListener('DOMContentLoaded', async () => {
  if (window.Store && typeof window.Store.loadFromStorage === 'function') {
    await window.Store.loadFromStorage();
  }
  CandidatesModule.init();
  PipelineModule.init();
  CalendarModule.init();
  AnalyticsModule.init();
  App.init();
});
