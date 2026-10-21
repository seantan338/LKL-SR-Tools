'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../../lib/auth-context';
import { useNotifications } from '../../../lib/notification-context';
import { useI18n } from '../../../lib/i18n-context';
import { FirestoreStore } from '../../../lib/firestore-store';
import { Utils } from '../../../lib/utils';
import CandidateDrawer from '../../../components/CandidateDrawer';
import { doc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../../../lib/firebase';

export default function CalendarPage() {
  const { teamId, role, user, userProfile } = useAuth();
  const { candidates, candidatesLoading: loading } = useNotifications();
  const { t } = useI18n();
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  
  // New States
  const [viewMode, setViewMode] = useState('global'); // 'personal' | 'global'
  const [selectedPic, setSelectedPic] = useState(''); // Current PIC filter for personal mode
  const [currentDate, setCurrentDate] = useState(new Date()); // For month navigation
  const [selectedDate, setSelectedDate] = useState(Utils.formatDate(new Date())); // Selected day (YYYY-MM-DD)
  const [agendaTab, setAgendaTab] = useState('selected'); // 'selected' | 'all'
  const [hasAutoJumped, setHasAutoJumped] = useState(false);

  // Restore preferred view mode from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedMode = localStorage.getItem('TALENT_FLOW_CALENDAR_MODE');
      if (savedMode === 'personal' || savedMode === 'global') {
        setViewMode(savedMode);
      }
    }
  }, []);

  const handleModeChange = (mode) => {
    setViewMode(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('TALENT_FLOW_CALENDAR_MODE', mode);
    }
  };

  // Subscribe to Candidates data in Real-Time
// Extract all distinct PIC names present in candidates
  const availablePicNames = Array.from(
    new Set(
      candidates
        .map(c => c.picName?.trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  // Initialize selectedPic for calendar view filter (strictly visual, never mutates user profile)
  useEffect(() => {
    if (availablePicNames.length === 0) return;

    // Clean up legacy poisoned TALENT_FLOW_MY_PIC in localStorage
    if (typeof window !== 'undefined' && localStorage.getItem('TALENT_FLOW_MY_PIC')) {
      try { localStorage.removeItem('TALENT_FLOW_MY_PIC'); } catch (e) {}
    }
    // Clean up legacy poisoned assignedPic in Firestore user document if present
    if (user?.uid && userProfile?.assignedPic) {
      updateDoc(doc(db, 'users', user.uid), { assignedPic: deleteField() }).catch(() => {});
    }

    // 1. Check saved calendar filter preference
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('TALENT_FLOW_CALENDAR_SELECTED_PIC');
      if (saved && availablePicNames.includes(saved)) {
        setSelectedPic(saved);
        return;
      }
    }

    // 2. Auto detect from Google display name / email prefix (strictly exact match)
    const myName = (userProfile?.displayName || user?.displayName || '').toLowerCase().trim();
    const myEmailName = (user?.email || '').split('@')[0].toLowerCase().trim();

    const matched = availablePicNames.find(p => {
      const lowerP = p.toLowerCase().trim();
      return (myName && lowerP === myName) || (myEmailName && lowerP === myEmailName);
    });

    if (matched) {
      setSelectedPic(matched);
    } else if (!selectedPic || !availablePicNames.includes(selectedPic)) {
      setSelectedPic(availablePicNames[0]);
    }
  }, [user, userProfile, availablePicNames]);

  const handlePicChange = (newPic) => {
    setSelectedPic(newPic);
    if (typeof window !== 'undefined') {
      if (newPic) {
        localStorage.setItem('TALENT_FLOW_CALENDAR_SELECTED_PIC', newPic);
      } else {
        localStorage.removeItem('TALENT_FLOW_CALENDAR_SELECTED_PIC');
      }
    }
  };

  const handleSyncToGoogleCalendar = (c) => {
    const parsed = Utils.parseInterviewDateTime(c.interviewDate, c.interviewTime);
    const dateStr = parsed.dateStr !== '-' ? parsed.dateStr : (c.parsedDate && c.parsedDate !== '-' ? c.parsedDate : Utils.formatDate(new Date()));
    const timeStr = parsed.timeStr || c.parsedTime || '10:00';

    const details = [
      `候选人：${c.name || '未提供'}`,
      `联系电话：${c.phone || '未提供'}`,
      `电子邮箱：${c.email || '未提供'}`,
      `应聘企业：${c.company || '未指定'}`,
      `应聘岗位：${c.position || '未指定'}${c.department ? ` (${c.department})` : ''}`,
      `薪资待遇：${c.salary || c.offered || '未指定'}`,
      `面试地点：${c.interviewLocation || c.location || '未指定'}`,
      `经办顾问：${c.picName || '未指定'}`,
      `出席状态：${c.interviewStatus || c.normalizedStatus || '待出席'}`,
      c.remarks ? `出席说明：${c.remarks}` : '',
      c.interviewNotes ? `面评备注：${c.interviewNotes}` : ''
    ].filter(Boolean).join('\n');

    Utils.openGoogleCalendar({
      title: `面试：${c.name} - ${c.position || '岗位'} (${c.company || '用人企业'})`,
      date: dateStr,
      time: timeStr,
      durationMinutes: 60,
      location: c.interviewLocation || c.location || c.company || '',
      details
    });
  };
  // In Personal mode: strictly filter by the assigned PIC name (from Google account or selector)
  const targetPic = (selectedPic || userProfile?.assignedPic || '').toLowerCase().trim();
  const myName = (userProfile?.displayName || userProfile?.name || user?.displayName || '').toLowerCase().trim();
  const myEmailName = (user?.email || '').split('@')[0].toLowerCase().trim();

  const modeFilteredCandidates = candidates.filter(c => {
    if (viewMode === 'personal') {
      const cPic = (c.picName || '').toLowerCase().trim();

      // If a target PIC name is determined (e.g. "Anis", "Megat", etc.):
      if (targetPic) {
        if (cPic) {
          return cPic === targetPic || cPic.includes(targetPic) || targetPic.includes(cPic);
        }
        // Candidates without picName do not belong to this consultant
        return false;
      }

      // If no targetPic is explicitly selected, try matching candidate picName against Google account name/email
      if (cPic) {
        if (myName && (cPic.includes(myName) || myName.includes(cPic))) return true;
        if (myEmailName && (cPic.includes(myEmailName) || myEmailName.includes(cPic))) return true;
        return false;
      }

      // Fallback only if candidate has no picName and no targetPic was found: check assignedTo UID
      if (c.assignedTo && user?.uid && c.assignedTo === user.uid) {
        return true;
      }

      return false;
    }

    // Global Mode: show everyone
    return true;
  });

  const interviewCandidates = modeFilteredCandidates.filter(c => c.interviewDate || c.stage === 'interview');

  // Group by date for quick lookup with robust international date & time extraction
  const groupedInterviews = {};
  const allScheduledCandidates = [];

  interviewCandidates.forEach(c => {
    const parsed = Utils.parseInterviewDateTime(c.interviewDate, c.interviewTime);
    const rawDateStr = parsed.dateStr !== '-' ? parsed.dateStr : Utils.formatDate(c.interviewDate);
    const dateStr = (rawDateStr && rawDateStr !== '-' && /^\d{4}-\d{2}-\d{2}$/.test(rawDateStr)) ? rawDateStr : null;
    
    if (dateStr) {
      if (!groupedInterviews[dateStr]) {
        groupedInterviews[dateStr] = [];
      }
      const candidateWithParsed = {
        ...c,
        parsedDate: dateStr,
        parsedTime: c.interviewTime || parsed.timeStr || ''
      };
      groupedInterviews[dateStr].push(candidateWithParsed);
      allScheduledCandidates.push(candidateWithParsed);
    }
  });

  // Sort all scheduled candidates chronologically
  allScheduledCandidates.sort((a, b) => {
    const dtA = `${a.parsedDate} ${a.parsedTime || '00:00'}`;
    const dtB = `${b.parsedDate} ${b.parsedTime || '00:00'}`;
    return dtA.localeCompare(dtB);
  });

  // Detect months with scheduled interviews
  const scheduledMonthMap = {};
  allScheduledCandidates.forEach(c => {
    const ym = c.parsedDate.substring(0, 7); // e.g. "2026-08"
    scheduledMonthMap[ym] = (scheduledMonthMap[ym] || 0) + 1;
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed
  const currentYearMonth = `${year}-${String(month + 1).padStart(2, '0')}`;
  const currentMonthCount = scheduledMonthMap[currentYearMonth] || 0;
  const otherScheduledMonths = Object.keys(scheduledMonthMap).filter(ym => ym !== currentYearMonth).sort();

  // Smart auto-jump to the earliest relevant month on initial load if current month has no interviews
  useEffect(() => {
    if (!hasAutoJumped && allScheduledCandidates.length > 0) {
      if (currentMonthCount === 0 && otherScheduledMonths.length > 0) {
        // Jump to the first scheduled month
        const targetYM = otherScheduledMonths[0];
        const [targetY, targetM] = targetYM.split('-');
        const targetDateObj = new Date(parseInt(targetY, 10), parseInt(targetM, 10) - 1, 1);
        setCurrentDate(targetDateObj);
        
        // Select the first date that has interviews in that month
        const firstDateInMonth = Object.keys(groupedInterviews).sort().find(d => d.startsWith(targetYM));
        if (firstDateInMonth) setSelectedDate(firstDateInMonth);
      }
      setHasAutoJumped(true);
    }
  }, [allScheduledCandidates.length, currentMonthCount, otherScheduledMonths, hasAutoJumped]);

  // Calendar Helpers
  const getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  const getFirstDayOfMonth = (y, m) => {
    const day = new Date(y, m, 1).getDay();
    return day === 0 ? 6 : day - 1; // Convert to Monday-start (0 = Monday, 6 = Sunday)
  };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const daysInPrevMonth = getDaysInMonth(year, month - 1);

  // Generate calendar cells (42 cells to ensure 6 rows usually)
  const calendarCells = [];
  
  // Previous month trailing days
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    const prevMonthDate = new Date(year, month - 1, d);
    calendarCells.push({
      dateStr: Utils.formatDate(prevMonthDate),
      dayNumber: d,
      isCurrentMonth: false
    });
  }
  
  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    const currMonthDate = new Date(year, month, i);
    calendarCells.push({
      dateStr: Utils.formatDate(currMonthDate),
      dayNumber: i,
      isCurrentMonth: true
    });
  }
  
  // Next month leading days (fill remaining of 42 cells)
  const remainingCells = 42 - calendarCells.length;
  for (let i = 1; i <= remainingCells; i++) {
    const nextMonthDate = new Date(year, month + 1, i);
    calendarCells.push({
      dateStr: Utils.formatDate(nextMonthDate),
      dayNumber: i,
      isCurrentMonth: false
    });
  }

  // Navigation handlers
  const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const handleToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(Utils.formatDate(today));
  };

  const jumpToMonth = (ym) => {
    const [y, m] = ym.split('-');
    setCurrentDate(new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1));
    const firstDate = Object.keys(groupedInterviews).sort().find(d => d.startsWith(ym));
    if (firstDate) setSelectedDate(firstDate);
  };

  const weekDays = [
    t('calendar.mon', '周一'),
    t('calendar.tue', '周二'),
    t('calendar.wed', '周三'),
    t('calendar.thu', '周四'),
    t('calendar.fri', '周五'),
    t('calendar.sat', '周六'),
    t('calendar.sun', '周日')
  ];
  
  const selectedDateCandidates = groupedInterviews[selectedDate] || [];

  return (
    <>
      <div className="page-view active" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 'var(--space-6)', alignItems: 'start' }}>
        
        {/* Left Panel: Calendar - Independent Fixed Height, Never Stretched */}
        <div className="bezel-shell" style={{ alignSelf: 'start', position: 'sticky', top: '1rem' }}>
          <div className="bezel-core" style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column' }}>
            
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-5)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-5)' }}>
                <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                  {t('calendar.yearMonth', { year, month: month + 1 }, `${year}年${month + 1}月`)}
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-full)', padding: '2px', border: '1px solid var(--border-hairline)' }}>
                    <button 
                      onClick={() => handleModeChange('global')}
                      style={{
                        background: viewMode === 'global' ? 'var(--bg-elevated)' : 'transparent',
                        color: viewMode === 'global' ? 'var(--text-primary)' : 'var(--text-muted)',
                        border: 'none', padding: '5px 14px', borderRadius: 'var(--radius-full)',
                        fontSize: 'var(--text-xs)', cursor: 'pointer', transition: 'all 0.2s', fontWeight: viewMode === 'global' ? '600' : 'normal'
                      }}
                    >
                      {t('calendar.globalMode', '全局模式')}
                    </button>
                    <button 
                      onClick={() => handleModeChange('personal')}
                      style={{
                        background: viewMode === 'personal' ? 'var(--accent-blue)' : 'transparent',
                        color: viewMode === 'personal' ? '#ffffff' : 'var(--text-muted)',
                        border: 'none', padding: '5px 14px', borderRadius: 'var(--radius-full)',
                        fontSize: 'var(--text-xs)', cursor: 'pointer', transition: 'all 0.2s', fontWeight: viewMode === 'personal' ? '600' : 'normal'
                      }}
                    >
                      {t('calendar.personalMode', '个人模式')}
                    </button>
                  </div>

                  {viewMode === 'personal' && availablePicNames.length > 0 && (
                    <div 
                      title={t('calendar.filterTitle', { pic: selectedPic || t('calendar.all', '全部') }, `日历视图顾问筛选: ${selectedPic || '全部'}`)}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '6px', 
                        background: 'rgba(59, 130, 246, 0.12)', 
                        padding: '3px 10px', 
                        borderRadius: 'var(--radius-full)', 
                        border: '1px solid rgba(59, 130, 246, 0.3)' 
                      }}
                    >
                      <span style={{ fontSize: '11px', color: 'var(--accent-blue)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <i className="ph ph-user"></i>
                        {t('calendar.advisor', '顾问:')}
                      </span>
                      <select
                        value={selectedPic}
                        onChange={(e) => handlePicChange(e.target.value)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-primary)',
                          fontSize: '11px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          outline: 'none'
                        }}
                      >
                        {availablePicNames.map(pic => (
                          <option key={pic} value={pic} style={{ background: 'var(--bg-surface-elevated)', color: 'var(--text-primary)' }}>
                            {t('calendar.picCount', { pic, count: candidates.filter(c => (c.picName || '').toLowerCase().trim() === pic.toLowerCase().trim()).length }, `${pic} (${candidates.filter(c => (c.picName || '').toLowerCase().trim() === pic.toLowerCase().trim()).length}人)`)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                <button 
                  onClick={handlePrevMonth}
                  title={t('calendar.prevMonth', '上个月')}
                  style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-interactive)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
                ><i className="ph ph-caret-left"></i></button>
                <button 
                  onClick={handleToday}
                  style={{ padding: '0 14px', height: '32px', borderRadius: '16px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-interactive)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s' }}
                >{t('calendar.today', '今天')}</button>
                <button 
                  onClick={handleNextMonth}
                  title={t('calendar.nextMonth', '下个月')}
                  style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-interactive)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
                ><i className="ph ph-caret-right"></i></button>
              </div>
            </div>

            {/* Notification Banner when current month has 0 interviews but other months have interviews */}
            {currentMonthCount === 0 && otherScheduledMonths.length > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', background: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: 'var(--radius-md)',
                marginBottom: 'var(--space-3)', fontSize: '0.8rem', color: 'var(--text-secondary)',
                flexShrink: 0
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="ph-fill ph-info" style={{ color: 'var(--accent-blue)', fontSize: '1rem' }}></i>
                  <span>{t('calendar.noInterviewsThisMonth', '当前月份暂无面试，其他月份有')} <strong>{allScheduledCandidates.length}</strong> {t('calendar.scheduledDesc', '场已排期：')}</span>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {otherScheduledMonths.map(ym => {
                    const [y, m] = ym.split('-');
                    return (
                      <button
                        key={ym}
                        onClick={() => jumpToMonth(ym)}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '2px 8px', fontSize: '11px', height: 'auto', background: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent-blue)', border: '1px solid rgba(59, 130, 246, 0.3)' }}
                      >
                        {t('calendar.goTo', '前往')} {t('calendar.yearMonth', { year: y, month: parseInt(m, 10) }, `${y}年${parseInt(m, 10)}月`)} ({scheduledMonthMap[ym]}) ➔
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Calendar Grid - Guaranteed 7 Equal Columns & 6 Fixed Rows */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', 
              gridTemplateRows: '34px repeat(6, 82px)',
              background: 'rgba(255,255,255,0.015)',
              border: '1px solid var(--border-interactive)',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden'
            }}>
              {/* Weekday Headers */}
              {weekDays.map((day, idx) => (
                <div 
                  key={day} 
                  style={{ 
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center', 
                    color: (idx === 5 || idx === 6) ? 'var(--text-muted)' : 'var(--text-secondary)', 
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    letterSpacing: '0.04em',
                    whiteSpace: 'nowrap',
                    background: 'rgba(255, 255, 255, 0.03)',
                    borderBottom: '1px solid var(--border-interactive)',
                    borderRight: idx === 6 ? 'none' : '1px solid var(--border-interactive)',
                    minWidth: 0,
                    userSelect: 'none'
                  }}
                >
                  {day}
                </div>
              ))}
              
              {/* Calendar Date Cells */}
              {calendarCells.map((cell, idx) => {
                const isSelected = cell.dateStr === selectedDate;
                const isToday = cell.dateStr === Utils.formatDate(new Date());
                const dayInterviews = groupedInterviews[cell.dateStr] || [];
                const colIndex = idx % 7;
                const rowIndex = Math.floor(idx / 7);
                
                return (
                  <div 
                    key={idx} 
                    onClick={() => {
                      setSelectedDate(cell.dateStr);
                      setAgendaTab('selected');
                    }}
                    style={{
                      minWidth: 0,
                      boxSizing: 'border-box',
                      padding: '6px 8px',
                      borderRight: colIndex === 6 ? 'none' : '1px solid var(--border-interactive)',
                      borderBottom: rowIndex === 5 ? 'none' : '1px solid var(--border-interactive)',
                      background: isSelected 
                        ? 'rgba(59, 130, 246, 0.12)' 
                        : (cell.isCurrentMonth ? 'transparent' : 'rgba(0,0,0,0.25)'),
                      boxShadow: isSelected ? 'inset 0 0 0 1.5px var(--accent-blue)' : 'none',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease, box-shadow 0.15s ease',
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden'
                    }}
                  >
                    {/* Date Number & Badge */}
                    <div style={{ 
                      minHeight: '24px',
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      marginBottom: '4px'
                    }}>
                      {isToday ? (
                        <div style={{
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          background: 'var(--accent-blue)',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: '700',
                          fontSize: '0.75rem',
                          boxShadow: '0 0 10px var(--accent-blue-glow)'
                        }}>
                          {cell.dayNumber}
                        </div>
                      ) : (
                        <span style={{ 
                          fontSize: '0.8rem',
                          fontWeight: isSelected ? '700' : '500',
                          color: cell.isCurrentMonth 
                            ? (isSelected ? 'var(--text-primary)' : 'var(--text-secondary)') 
                            : 'rgba(255, 255, 255, 0.25)',
                          paddingLeft: '2px'
                        }}>
                          {cell.dayNumber}
                        </span>
                      )}

                      {dayInterviews.length > 0 && (
                        <span style={{ 
                          background: isSelected ? 'var(--accent-blue)' : 'rgba(59, 130, 246, 0.18)', 
                          color: isSelected ? '#ffffff' : 'var(--accent-blue)',
                          padding: '1px 6px', 
                          borderRadius: '10px', 
                          fontSize: '10px', 
                          fontWeight: '600',
                          fontFamily: 'var(--font-mono)',
                          border: isSelected ? 'none' : '1px solid rgba(59, 130, 246, 0.3)'
                        }}>
                          {dayInterviews.length}
                        </span>
                      )}
                    </div>
                    
                    {/* Candidate Micro Tags */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0, overflow: 'hidden' }}>
                      {dayInterviews.slice(0, 3).map(c => {
                        const isAttended = c.normalizedStatus === 'attended';
                        const isNoShow = c.normalizedStatus === 'no_show';
                        const isUnable = c.normalizedStatus === 'unable_to_attend';
                        
                        const tagColor = isAttended ? '#34d399' : isNoShow ? '#f87171' : isUnable ? '#fbbf24' : '#60a5fa';
                        const tagBg = isAttended ? 'rgba(52, 211, 153, 0.12)' : isNoShow ? 'rgba(248, 113, 113, 0.12)' : isUnable ? 'rgba(251, 191, 36, 0.12)' : 'rgba(96, 165, 250, 0.12)';
                        const tagBorder = isAttended ? 'rgba(52, 211, 153, 0.25)' : isNoShow ? 'rgba(248, 113, 113, 0.25)' : isUnable ? 'rgba(251, 191, 36, 0.25)' : 'rgba(96, 165, 250, 0.25)';
                        
                        return (
                          <div 
                            key={c.id} 
                            title={`${c.parsedTime || c.interviewTime || ''} ${c.name}${c.company ? ` [${c.company}]` : ''} - ${c.position || ''}`}
                            style={{
                              background: tagBg, 
                              color: tagColor,
                              border: `1px solid ${tagBorder}`,
                              padding: '2px 5px', 
                              borderRadius: '4px', 
                              fontSize: '11px',
                              lineHeight: 1.3,
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '4px',
                              minWidth: 0,
                              overflow: 'hidden'
                            }}
                          >
                            <span style={{ 
                              fontWeight: '700', 
                              fontSize: '10px', 
                              fontFamily: 'var(--font-mono)', 
                              flexShrink: 0 
                            }}>
                              {c.parsedTime || c.interviewTime || t('calendar.tbdShort', '待定')}
                            </span>
                            <span style={{ 
                              opacity: 0.95, 
                              overflow: 'hidden', 
                              textOverflow: 'ellipsis', 
                              whiteSpace: 'nowrap', 
                              flex: 1, 
                              minWidth: 0 
                            }}>
                              {c.name}
                            </span>
                          </div>
                        );
                      })}
                      
                      {dayInterviews.length > 3 && (
                        <div style={{ 
                          fontSize: '10px', 
                          color: 'var(--accent-blue)', 
                          fontWeight: '600',
                          padding: '1px 5px',
                          background: 'rgba(59, 130, 246, 0.08)',
                          borderRadius: '3px',
                          width: 'fit-content'
                        }}>
                          +{t('calendar.moreItems', { count: dayInterviews.length - 3 }, `${dayInterviews.length - 3} 更多`)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Panel: Daily Interviews & Full Agenda - Expands Independently */}
        <div className="bezel-shell" style={{ alignSelf: 'start', display: 'flex', flexDirection: 'column' }}>
          <div className="bezel-core" style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column' }}>
            
            {/* Right Panel Header with Tab Toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <i className="ph ph-clock" style={{ fontSize: '1.2rem', color: 'var(--accent-blue)' }}></i>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                  {t('calendar.scheduleTitle', '面试日程排期')}
                </h3>
              </div>
            </div>

            {/* Agenda Tab Switcher */}
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--radius-md)', padding: '2px', marginBottom: 'var(--space-4)' }}>
              <button
                onClick={() => setAgendaTab('selected')}
                style={{
                  flex: 1, padding: '6px 8px', fontSize: '11px', fontWeight: agendaTab === 'selected' ? '600' : 'normal',
                  background: agendaTab === 'selected' ? 'var(--bg-card)' : 'transparent',
                  color: agendaTab === 'selected' ? 'var(--text-primary)' : 'var(--text-muted)',
                  border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'all 0.2s'
                }}
              >
                {t('calendar.selectedDay', '选定日')} ({selectedDateCandidates.length})
              </button>
              <button
                onClick={() => setAgendaTab('all')}
                style={{
                  flex: 1, padding: '6px 8px', fontSize: '11px', fontWeight: agendaTab === 'all' ? '600' : 'normal',
                  background: agendaTab === 'all' ? 'var(--bg-card)' : 'transparent',
                  color: agendaTab === 'all' ? 'var(--text-primary)' : 'var(--text-muted)',
                  border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'all 0.2s'
                }}
              >
                {t('calendar.allSchedules', '全部排期')} ({allScheduledCandidates.length})
              </button>
            </div>
            
            <div style={{ marginBottom: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
              <span>
                {agendaTab === 'selected' 
                  ? t('calendar.dayScheduleCount', { date: selectedDate, count: selectedDateCandidates.length }, `${selectedDate} 面试安排 (${selectedDateCandidates.length}人)`)
                  : (viewMode === 'personal' ? t('calendar.myScheduleCount', { pic: selectedPic || t('calendar.personal', '个人'), count: allScheduledCandidates.length }, `我的排期 [${selectedPic || '个人'}] (共 ${allScheduledCandidates.length}人)`) : t('calendar.teamScheduleCount', { count: allScheduledCandidates.length }, `团队全局面试 (共 ${allScheduledCandidates.length}人)`))
                }
              </span>
              {agendaTab === 'selected' && (
                <span style={{ color: 'var(--accent-blue)', cursor: 'pointer' }} onClick={() => setAgendaTab('all')}>{t('calendar.viewAll', '查看全部 ➔')}</span>
              )}
            </div>

            {/* Candidate List Container - Expands smoothly with candidates */}
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: 'var(--space-3)', 
              maxHeight: 'calc(100vh - 220px)', 
              overflowY: 'auto', 
              paddingRight: '4px' 
            }}>
              {(agendaTab === 'selected' ? selectedDateCandidates : allScheduledCandidates).length === 0 ? (
                <div className="empty-state" style={{ marginTop: 'var(--space-8)' }}>
                  <div className="empty-state-icon"><i className="ph-light ph-calendar-blank"></i></div>
                  <div className="empty-state-desc">
                    {agendaTab === 'selected' 
                      ? (viewMode === 'personal' ? `${selectedDate} ${t('calendar.noInterviewsScheduled', '暂无面试安排')}` : `${selectedDate} ${t('calendar.noInterviews', '暂无面试')}`) 
                      : (viewMode === 'personal' ? t('calendar.noSchedules', '暂无任何已排期的面试') : t('calendar.noSchedules', '暂无任何已排期的面试'))
                    }
                  </div>
                  {agendaTab === 'selected' && allScheduledCandidates.length > 0 && (
                    <button 
                      onClick={() => setAgendaTab('all')} 
                      className="btn btn-secondary btn-sm"
                      style={{ marginTop: 'var(--space-3)', fontSize: '11px' }}
                    >
                      {t('calendar.viewOtherSchedules', '查看所有其他日期的面试')} ({allScheduledCandidates.length})
                    </button>
                  )}
                </div>
              ) : (
                (agendaTab === 'selected' 
                  ? [...selectedDateCandidates].sort((a,b) => (a.parsedTime || a.interviewTime || '').localeCompare(b.parsedTime || b.interviewTime || ''))
                  : allScheduledCandidates
                ).map(c => {
                  const displayTime = c.parsedTime || c.interviewTime || t('calendar.tbd', '时间待定');
                  const displayDate = c.parsedDate || Utils.formatDate(c.interviewDate);
                  const isAttended = c.normalizedStatus === 'attended';
                  const isNoShow = c.normalizedStatus === 'no_show';
                  const statusLabel = isAttended ? t('calendar.attended', '已到场') : isNoShow ? t('calendar.noShow', '未到') : c.normalizedStatus === 'unable_to_attend' ? t('calendar.rescheduled', '改期/请假') : t('calendar.pending', '待出席');
                  const statusColor = isAttended ? 'rgb(52, 211, 153)' : isNoShow ? 'rgb(248, 113, 113)' : 'rgb(255, 171, 0)';

                  return (
                    <div 
                      key={c.id} 
                      style={{ 
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid var(--border-interactive)', 
                        borderRadius: 'var(--radius-md)',
                        padding: 'var(--space-3) var(--space-4)',
                        cursor: 'pointer', transition: 'all 0.2s',
                        borderLeft: `3px solid ${statusColor}`
                      }}
                      onClick={() => { 
                        // Auto jump to candidate's date & month if in "all" tab
                        if (c.parsedDate && c.parsedDate !== '-') {
                          const [y, m] = c.parsedDate.split('-');
                          setCurrentDate(new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1));
                          setSelectedDate(c.parsedDate);
                        }
                        setSelectedCandidate(c); 
                        setIsDrawerOpen(true); 
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                        e.currentTarget.style.borderColor = 'var(--border-interactive)';
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                        <div style={{ fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                          {c.name}
                        </div>
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <span style={{
                            background: 'rgba(255, 255, 255, 0.05)', color: statusColor,
                            padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '500'
                          }}>
                            {statusLabel}
                          </span>
                          <span style={{ 
                            background: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent-blue)',
                            padding: '1px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: '600'
                          }}>
                            {displayTime}
                          </span>
                        </div>
                      </div>
                      
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                          <span style={{ 
                            color: c.company ? 'var(--accent-blue)' : 'var(--text-muted)', 
                            fontWeight: '600',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px'
                          }}>
                            <i className="ph ph-buildings" style={{ fontSize: '12px' }}></i>
                            {c.company || t('calendar.noCompany', '未定企业')}
                          </span>
                          <span style={{ color: 'var(--border-interactive)' }}>·</span>
                          <span style={{ color: 'var(--text-primary)' }}>{c.position || t('calendar.noPosition', '未定岗位')}{c.department ? ` (${c.department})` : ''}</span>
                        </div>
                        {agendaTab === 'all' && (
                          <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{displayDate}</span>
                        )}
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '6px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, overflow: 'hidden' }}>
                          <div style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            <i className="ph ph-map-pin" style={{ marginRight: '3px' }}></i> 
                            {c.location || c.interviewLocation || t('calendar.noLocation', '地点未指定')}
                          </div>
                          {c.picName && (
                            <div style={{ flexShrink: 0 }}>PIC: {c.picName}</div>
                          )}
                        </div>
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs"
                          style={{
                            fontSize: '10px',
                            padding: '2px 8px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            borderRadius: '4px',
                            color: 'var(--accent-blue)',
                            borderColor: 'rgba(59, 130, 246, 0.3)',
                            flexShrink: 0
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSyncToGoogleCalendar(c);
                          }}
                          title={t('calendar.addToGoogleTooltip', '将本场面试添加至 Google 日历并设置提醒')}
                        >
                          <i className="ph-light ph-calendar-plus" style={{ fontSize: '12px' }}></i>
                          <span>{t('calendar.addToGoogleCalendar', '添加至 Google 日历')}</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
      
      <CandidateDrawer 
        isOpen={isDrawerOpen} 
        onClose={() => setIsDrawerOpen(false)} 
        candidate={selectedCandidate} 
      />
    </>
  );
}

