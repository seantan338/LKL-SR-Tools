/**
 * Candidate Follow-up Management System
 * Calendar View: Month Grid, Interview Events & Upcoming Agenda
 */

const CalendarModule = {
  currentDate: new Date(),

  init() {
    this.bindEvents();
    this.render();
  },

  bindEvents() {
    const prevBtn = document.getElementById('calPrevMonthBtn');
    const nextBtn = document.getElementById('calNextMonthBtn');
    const todayBtn = document.getElementById('calTodayBtn');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        this.currentDate.setMonth(this.currentDate.getMonth() - 1);
        this.render();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        this.currentDate.setMonth(this.currentDate.getMonth() + 1);
        this.render();
      });
    }

    if (todayBtn) {
      todayBtn.addEventListener('click', () => {
        this.currentDate = new Date();
        this.render();
      });
    }
  },

  render() {
    this.renderMonthGrid();
    this.renderUpcomingAgenda();
  },

  renderMonthGrid() {
    const titleEl = document.getElementById('calMonthTitle');
    const gridEl = document.getElementById('calendarDaysGrid');
    if (!titleEl || !gridEl) return;

    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth(); // 0-indexed

    titleEl.textContent = `${year}年 ${month + 1}月`;

    // Map all interviews by date string YYYY-MM-DD
    const candidates = Store.getAllCandidates();
    const interviewMap = {};

    candidates.forEach(c => {
      if (c.interviewDate) {
        const dateKey = Utils.formatDate(c.interviewDate);
        if (!interviewMap[dateKey]) interviewMap[dateKey] = [];
        interviewMap[dateKey].push(c);
      }
    });

    // Calendar math: Monday-based week
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const totalDays = lastDayOfMonth.getDate();

    // Day of week: 0 is Sunday, 1 is Monday... convert so Monday is 0
    let firstDayIndex = firstDayOfMonth.getDay() - 1;
    if (firstDayIndex === -1) firstDayIndex = 6; // Sunday becomes 6

    const prevMonthLastDay = new Date(year, month, 0).getDate();

    const todayStr = Utils.formatDate(new Date());

    let cellsHtml = '';

    // 1. Previous month trailing days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = prevMonthLastDay - i;
      const prevDate = new Date(year, month - 1, dayNum);
      const dateKey = Utils.formatDate(prevDate);
      const interviews = interviewMap[dateKey] || [];

      cellsHtml += this.renderDayCellHtml(dayNum, dateKey, interviews, true, false);
    }

    // 2. Current month days
    for (let d = 1; d <= totalDays; d++) {
      const curDate = new Date(year, month, d);
      const dateKey = Utils.formatDate(curDate);
      const interviews = interviewMap[dateKey] || [];
      const isToday = dateKey === todayStr;

      cellsHtml += this.renderDayCellHtml(d, dateKey, interviews, false, isToday);
    }

    // 3. Next month leading days to complete full weeks
    const currentTotalCells = firstDayIndex + totalDays;
    const remainingCells = (7 - (currentTotalCells % 7)) % 7;

    for (let d = 1; d <= remainingCells; d++) {
      const nextDate = new Date(year, month + 1, d);
      const dateKey = Utils.formatDate(nextDate);
      const interviews = interviewMap[dateKey] || [];

      cellsHtml += this.renderDayCellHtml(d, dateKey, interviews, true, false);
    }

    gridEl.innerHTML = cellsHtml;

    // Attach click listeners to day cells
    gridEl.querySelectorAll('.calendar-day-cell').forEach(cell => {
      cell.addEventListener('click', () => {
        const dateStr = cell.getAttribute('data-date');
        const count = parseInt(cell.getAttribute('data-count') || '0', 10);
        if (count > 0) {
          // Highlight agenda or open first interview candidate
          const list = interviewMap[dateStr];
          if (list && list[0]) {
            CandidatesModule.openDetailDrawer(list[0].id);
          }
        }
      });
    });
  },

  renderDayCellHtml(dayNum, dateStr, interviews, isOtherMonth, isToday) {
    const count = interviews.length;

    return `
      <div class="calendar-day-cell ${isOtherMonth ? 'other-month' : ''} ${isToday ? 'is-today' : ''}" data-date="${dateStr}" data-count="${count}">
        <div class="calendar-day-top">
          <span class="day-number">${dayNum}</span>
          ${count > 0 ? `<span class="day-event-count">${count}</span>` : ''}
        </div>
        <div class="day-events-list">
          ${interviews.slice(0, 3).map(c => `
            <div class="day-event-pill" title="${Utils.escapeHtml(c.name)} - ${Utils.escapeHtml(c.interviewTime || '')}">
              <span>${c.interviewTime ? Utils.escapeHtml(c.interviewTime) + ' ' : ''}${Utils.escapeHtml(c.name)}</span>
            </div>
          `).join('')}
          ${count > 3 ? `<span class="agy-style-0184f8">+${count - 3} 场</span>` : ''}
        </div>
      </div>
    `;
  },

  renderUpcomingAgenda() {
    const listEl = document.getElementById('upcomingAgendaList');
    if (!listEl) return;

    const candidates = Store.getAllCandidates();
    const now = new Date();
    const todayStr = Utils.formatDate(now);

    // Filter candidates with upcoming interviews
    const upcoming = candidates.filter(c => {
      if (!c.interviewDate) return false;
      const dStr = Utils.formatDate(c.interviewDate);
      return dStr >= todayStr;
    });

    // Sort by interview date + time ascending
    upcoming.sort((a, b) => {
      const timeA = new Date(`${a.interviewDate} ${a.interviewTime || '00:00'}`).getTime();
      const timeB = new Date(`${b.interviewDate} ${b.interviewTime || '00:00'}`).getTime();
      return timeA - timeB;
    });

    if (upcoming.length === 0) {
      listEl.innerHTML = `
        <div class="agy-style-254f3f">
          <i class="ph-light ph-calendar-x agy-style-970dbb"></i>
          <span>近期暂无已排期的面试</span>
        </div>
      `;
      return;
    }

    listEl.innerHTML = upcoming.map(c => `
      <div class="agenda-card-item" onclick="CandidatesModule.openDetailDrawer('${c.id}')">
        <div class="agy-style-651ca0">
          <span class="agy-style-37c5c3">${Utils.escapeHtml(c.name)}</span>
          <span class="agenda-time-badge agy-style-1126cc">${Utils.formatDate(c.interviewDate)} ${Utils.escapeHtml(c.interviewTime || '')}</span>
        </div>
        <div class="agy-style-09ce20">
          ${Utils.escapeHtml(c.company ? c.company + ' · ' : '')}${Utils.escapeHtml(c.position || '未定岗位')} · ${Utils.escapeHtml(c.school || '院校未填')}
        </div>
        ${c.interviewNotes ? `
          <div class="agy-style-79c152">
            ${Utils.escapeHtml(c.interviewNotes)}
          </div>
        ` : ''}
      </div>
    `).join('');
  }
};

window.CalendarModule = CalendarModule;
