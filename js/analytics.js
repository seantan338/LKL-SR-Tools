/**
 * Candidate Follow-up Management System
 * Analytics & Visualization Module (Chart.js Integration)
 */

const AnalyticsModule = {
  charts: {},

  init() {
    this.render();
  },

  destroyChart(key) {
    if (this.charts[key]) {
      this.charts[key].destroy();
      delete this.charts[key];
    }
  },

  render() {
    const candidates = Store.getAllCandidates();
    this.renderMetricsSummary(candidates);
    this.renderFunnelChart(candidates);
    this.renderSourcesChart(candidates);
    this.renderPositionsChart(candidates);
    this.renderFunnelConversionTable(candidates);
    this.renderRejectionDistribution(candidates);
  },

  renderMetricsSummary(candidates) {
    // Exclude rejected from metrics
    const active = candidates.filter(c => c.status !== 'rejected');
    const totalCount = active.length;
    const activeCount = active.filter(c => ['screening', 'phone', 'interview', 'offer', 'pre_onboarding'].includes(c.stage)).length;
    const offerCount = active.filter(c => ['offer', 'pre_onboarding', 'onboarding', 'post_onboarding'].includes(c.stage)).length;
    const onboardingCount = active.filter(c => ['onboarding', 'post_onboarding'].includes(c.stage)).length;

    // Offer acceptance rate
    const offerRate = totalCount > 0 ? ((offerCount / totalCount) * 100).toFixed(1) : '0.0';
    const onboardingRate = offerCount > 0 ? ((onboardingCount / offerCount) * 100).toFixed(1) : '0.0';

    const elTotal = document.getElementById('analyticsMetricTotal');
    const elActive = document.getElementById('analyticsMetricActive');
    const elOfferRate = document.getElementById('analyticsMetricOfferRate');
    const elOnboardRate = document.getElementById('analyticsMetricOnboardRate');

    if (elTotal) elTotal.textContent = totalCount;
    if (elActive) elActive.textContent = activeCount;
    if (elOfferRate) elOfferRate.textContent = `${offerRate}%`;
    if (elOnboardRate) elOnboardRate.textContent = `${onboardingRate}%`;
  },

  renderFunnelChart(candidates) {
    const canvas = document.getElementById('funnelChartCanvas');
    if (!canvas) return;

    this.destroyChart('funnel');

    const stages = [
      { key: 'screening', label: '简历筛选', color: '#6366f1' },
      { key: 'phone', label: '初筛电话', color: '#3b82f6' },
      { key: 'interview', label: '面试考核', color: '#f59e0b' },
      { key: 'offer', label: 'Offer 发放', color: '#8b5cf6' },
      { key: 'pre_onboarding', label: '待入职跟进', color: '#0ea5e9' },
      { key: 'onboarding', label: '正式入职', color: '#10b981' },
      { key: 'post_onboarding', label: '入职后关怀', color: '#ec4899' }
    ];

    const counts = stages.map(st => {
      return candidates.filter(c => c.stage === st.key).length;
    });

    // Also calculate cumulative passed candidates for true funnel
    const stageOrder = ['screening', 'phone', 'interview', 'offer', 'pre_onboarding', 'onboarding', 'post_onboarding'];
    const cumulativeCounts = stages.map((st, idx) => {
      return candidates.filter(c => {
        const cIdx = stageOrder.indexOf(c.stage);
        return cIdx >= idx;
      }).length;
    });

    const ctx = canvas.getContext('2d');
    this.charts['funnel'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: stages.map(s => s.label),
        datasets: [
          {
            label: '当前阶段人数',
            data: counts,
            backgroundColor: stages.map(s => s.color + '66'),
            borderColor: stages.map(s => s.color),
            borderWidth: 1.5,
            borderRadius: 8,
            borderSkipped: false
          },
          {
            label: '已达此阶段总计',
            data: cumulativeCounts,
            type: 'line',
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.1)',
            tension: 0.35,
            pointBackgroundColor: '#38bdf8',
            pointRadius: 4,
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: '#9497ab',
              font: { family: 'Plus Jakarta Sans', size: 12 }
            }
          },
          tooltip: {
            backgroundColor: '#0f111c',
            titleColor: '#f4f5f9',
            bodyColor: '#9497ab',
            borderColor: 'rgba(255, 255, 255, 0.12)',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: { color: '#9497ab', font: { family: 'Plus Jakarta Sans', size: 12 } }
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: { color: '#9497ab', stepSize: 1, font: { family: 'Geist Mono', size: 11 } }
          }
        }
      }
    });
  },

  renderSourcesChart(candidates) {
    const canvas = document.getElementById('sourcesChartCanvas');
    if (!canvas) return;

    this.destroyChart('sources');

    const sourceMap = {};
    candidates.forEach(c => {
      const src = c.source || '未标明来源';
      sourceMap[src] = (sourceMap[src] || 0) + 1;
    });

    const labels = Object.keys(sourceMap);
    const data = Object.values(sourceMap);

    const colors = [
      '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', 
      '#06b6d4', '#6366f1', '#14b8a6', '#f97316', '#a855f7'
    ];

    const ctx = canvas.getContext('2d');
    this.charts['sources'] = new Chart(ctx, {
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
            position: 'right',
            labels: {
              color: '#9497ab',
              font: { family: 'Plus Jakarta Sans', size: 12 },
              padding: 12
            }
          },
          tooltip: {
            backgroundColor: '#0f111c',
            titleColor: '#f4f5f9',
            bodyColor: '#9497ab',
            borderColor: 'rgba(255, 255, 255, 0.12)',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8
          }
        }
      }
    });
  },

  renderPositionsChart(candidates) {
    const canvas = document.getElementById('positionsChartCanvas');
    if (!canvas) return;

    this.destroyChart('positions');

    const posMap = {};
    candidates.forEach(c => {
      const pos = c.position || '未定岗位';
      posMap[pos] = (posMap[pos] || 0) + 1;
    });

    const labels = Object.keys(posMap);
    const data = Object.values(posMap);

    const ctx = canvas.getContext('2d');
    this.charts['positions'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels.length > 0 ? labels : ['暂无数据'],
        datasets: [{
          label: '申请人数',
          data: data.length > 0 ? data : [0],
          backgroundColor: 'rgba(59, 130, 246, 0.35)',
          borderColor: '#3b82f6',
          borderWidth: 1.5,
          borderRadius: 6
        }]
      },
      options: {
        indexAxis: 'y',
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
            padding: 10,
            cornerRadius: 8
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: { color: '#9497ab', stepSize: 1, font: { family: 'Geist Mono', size: 11 } }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: { color: '#f4f5f9', font: { family: 'Plus Jakarta Sans', size: 12 } }
          }
        }
      }
    });
  },

  renderFunnelConversionTable(candidates) {
    const container = document.getElementById('funnelConversionRows');
    if (!container) return;

    const stages = [
      { key: 'screening', label: '简历筛选', color: '#6366f1' },
      { key: 'phone', label: '初筛电话', color: '#3b82f6' },
      { key: 'interview', label: '面试考核', color: '#f59e0b' },
      { key: 'offer', label: 'Offer 发放', color: '#8b5cf6' },
      { key: 'pre_onboarding', label: '待入职跟进', color: '#0ea5e9' },
      { key: 'onboarding', label: '正式入职', color: '#10b981' },
      { key: 'post_onboarding', label: '入职后关怀', color: '#ec4899' }
    ];

    const stageOrder = ['screening', 'phone', 'interview', 'offer', 'pre_onboarding', 'onboarding', 'post_onboarding'];
    const cumulativeCounts = stages.map((st, idx) => {
      return candidates.filter(c => stageOrder.indexOf(c.stage) >= idx).length;
    });

    const total = cumulativeCounts[0] || 0;

    container.innerHTML = stages.map((st, idx) => {
      const count = cumulativeCounts[idx];
      const overallPercent = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
      const prevCount = idx > 0 ? cumulativeCounts[idx - 1] : count;
      const stepConversion = prevCount > 0 ? ((count / prevCount) * 100).toFixed(1) : '100.0';

      return `
        <div class="funnel-bar-row">
          <div class="funnel-bar-header">
            <div class="agy-style-87ce07">
              <span class="badge-dot" style="background: ${st.color};"></span>
              <span class="funnel-bar-title">${st.label}</span>
            </div>
            <div class="funnel-bar-meta">
              <span>${count} 人</span>
              <span class="agy-style-658707">/</span>
              <span class="agy-style-5ae5de">${overallPercent}%</span>
              ${idx > 0 ? `<span class="agy-style-b189bd">环节转化率 ${stepConversion}%</span>` : ''}
            </div>
          </div>
          <div class="funnel-bar-track">
            <div class="funnel-bar-fill" style="width: ${overallPercent}%; background: ${st.color};"></div>
          </div>
        </div>
      `;
    }).join('');
  },

  renderRejectionDistribution(candidates) {
    const container = document.getElementById('rejectionDistContainer');
    if (!container) return;

    const rejected = candidates.filter(c => c.status === 'rejected');
    const totalRejected = rejected.length;

    if (totalRejected === 0) {
      container.innerHTML = '<div class="agy-style-25bed5">暂无淘汰记录</div>';
      return;
    }

    const stages = [
      { key: 'screening', label: '简历筛选', color: '#6366f1' },
      { key: 'phone', label: '初筛电话', color: '#3b82f6' },
      { key: 'interview', label: '面试考核', color: '#f59e0b' },
      { key: 'offer', label: 'Offer 发放', color: '#8b5cf6' },
      { key: 'pre_onboarding', label: '待入职跟进', color: '#0ea5e9' },
      { key: 'onboarding', label: '正式入职', color: '#10b981' },
      { key: 'post_onboarding', label: '入职后关怀', color: '#ec4899' }
    ];

    container.innerHTML = stages.map(st => {
      const count = rejected.filter(c => c.stage === st.key).length;
      const percent = totalRejected > 0 ? Math.round((count / totalRejected) * 100) : 0;
      return `
        <div class="agy-style-460a71">
          <div class="agy-style-8aa13d">
            <div class="agy-style-87ce07">
              <span class="badge-dot" style="background: ${st.color};"></span>
              <span class="agy-style-f504ec">${st.label}</span>
            </div>
            <span class="agy-style-d1d4f6">${count} 人 · ${percent}%</span>
          </div>
          <div class="funnel-bar-track">
            <div class="funnel-bar-fill" style="width: ${percent}%; background: #ef4444;"></div>
          </div>
        </div>
      `;
    }).join('');
  }
};

window.AnalyticsModule = AnalyticsModule;
