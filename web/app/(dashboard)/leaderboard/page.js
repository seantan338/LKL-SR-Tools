'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../../lib/auth-context';
import { useNotifications } from '../../../lib/notification-context';
import { useI18n } from '../../../lib/i18n-context';
import { FirestoreStore } from '../../../lib/firestore-store';
import { resolveCanonicalPic } from '../../../lib/identity.mjs';
import { db } from '../../../lib/firebase';
import { collection, query, orderBy, limit, onSnapshot, where } from 'firebase/firestore';
import { ExcelExporter } from '../../../lib/excel-exporter';
import { DEFAULT_SHIFT_CONFIG } from '../../../lib/cascade-shift-engine';
import { SystemLogger } from '../../../lib/logger';

export default function LeaderboardPage() {
  const { teamId, isHqTeam, role, user, isOwner, isManager } = useAuth();
  const { candidates, candidatesLoading } = useNotifications();
  const { t, lang } = useI18n();
  const isEn = lang === 'en';

  const [activeTab, setActiveTab] = useState('sales'); // 'sales' | 'attendance'
  const [dateFilter, setDateFilter] = useState('month'); // 'month' | '7days' | '30days' | 'all'
  const [orders, setOrders] = useState([]);
  const [logs, setLogs] = useState([]);
  const [manualCheckins, setManualCheckins] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [attendanceRules, setAttendanceRules] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3500);
  };

  // 1. Subscribe to Job Orders for HQ
  useEffect(() => {
    if (!isHqTeam || !user?.uid) return;
    const currentTeam = teamId || 'default_team';
    const unsubscribe = FirestoreStore.subscribeToJobOrders(currentTeam, role, user.uid, (data) => {
      setOrders(data || []);
    });
    return () => unsubscribe();
  }, [isHqTeam, teamId, role, user]);

  // 2. Subscribe to HQ Attendance Records
  useEffect(() => {
    if (!isHqTeam) return;
    const currentTeam = 'default_team';

    const qAtt = query(
      collection(db, 'teams', currentTeam, 'attendance'),
      orderBy('timestamp', 'desc'),
      limit(500)
    );

    const unsubAtt = onSnapshot(qAtt, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      }));
      setManualCheckins(data);
    }, (err) => console.warn('Attendance subscription notice:', err?.message));

    // Also listen to attendance logs for complete audit coverage
    const qLogs = query(
      collection(db, 'teams', currentTeam, 'logs'),
      where('targetType', '==', 'ATTENDANCE'),
      orderBy('timestamp', 'desc'),
      limit(500)
    );

    const unsubLogs = onSnapshot(qLogs, (snapshot) => {
      const logsData = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      }));
      setLogs(logsData);
    }, (err) => console.warn('Logs subscription notice:', err?.message));

    return () => {
      unsubAtt();
      unsubLogs();
    };
  }, [isHqTeam]);

  // 2.5 Subscribe to Attendance Rules for Shift Configuration
  useEffect(() => {
    if (!isHqTeam) return;
    const unsub = FirestoreStore.subscribeToAttendanceRules('default_team', (rules) => {
      if (rules && typeof rules === 'object') {
        setAttendanceRules(rules);
      }
    });
    return () => unsub();
  }, [isHqTeam]);

  const handleExportAttendanceExcel = async () => {
    if (!isHqTeam || (!isOwner && !isManager)) {
      showToast(t('leaderboard.exportNoPermission', '仅 HQ 本部管理人员可导出考勤出勤月报'));
      return;
    }
    const combinedEvents = [...manualCheckins, ...logs];
    if (combinedEvents.length === 0) {
      showToast(t('leaderboard.exportNoData', '当前无可导出的考勤打卡数据'));
      return;
    }

    setIsExporting(true);
    try {
      const now = new Date();
      const activeMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const hqAdvisors = teamMembers.filter(m => (!m.teamId || m.teamId === 'default_team') && m.role !== 'pending');

      const sheets = ExcelExporter.buildAttendanceReportData({
        monthStr: activeMonthStr,
        attendanceEvents: combinedEvents,
        hqMembers: hqAdvisors,
        shiftConfig: attendanceRules?.shiftConfig || DEFAULT_SHIFT_CONFIG,
        shiftOverrides: attendanceRules?.shiftOverrides || {},
        locale: isEn ? 'en' : 'zh'
      });

      const filename = `TalentFlow_Attendance_${activeMonthStr}.xlsx`;
      await ExcelExporter.exportWorkbook({ filename, sheets, locale: isEn ? 'en' : 'zh' });

      try {
        await SystemLogger.audit(teamId || 'default_team', {
          action: 'EXPORT_ATTENDANCE_EXCEL',
          targetType: 'ATTENDANCE_REPORT',
          details: `Export monthly attendance report from leaderboard (${filename})`
        });
      } catch (logErr) {}

      showToast(t('leaderboard.exportSuccess', { filename }, `🎉 考勤报表 (${filename}) 导出成功！`));
    } catch (err) {
      console.error('Export leaderboard attendance error:', err);
      showToast(`${t('leaderboard.exportFailed', '导出失败: ')}${err.message}`, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  // 3. Subscribe to Team Members for Canonical PIC Resolution
  useEffect(() => {
    const usersRef = collection(db, 'users');
    const unsub = onSnapshot(usersRef, (snapshot) => {
      const mems = snapshot.docs.map(doc => ({
        id: doc.id,
        uid: doc.id,
        ...doc.data(),
        name: doc.data().displayName || doc.data().name || (doc.data().email ? doc.data().email.split('@')[0] : '')
      }));
      setTeamMembers(mems);
      setLoadingMembers(false);
    }, (err) => {
      console.warn('Error loading team members in leaderboard:', err);
      setLoadingMembers(false);
    });
    return () => unsub();
  }, []);

  // Filter ONLY Company HQ Members (default_team)
  const hqMembers = useMemo(() => {
    return teamMembers.filter(m => (!m.teamId || m.teamId === 'default_team') && m.role !== 'pending');
  }, [teamMembers]);

  // Helper: Match if a canonical PIC belongs to Company HQ
  const isHqAdvisor = (canonical) => {
    if (!canonical) return false;
    if (canonical.isExternal) return false;
    if (canonical.uid) {
      return hqMembers.some(m => m.id === canonical.uid);
    }
    const targetName = (canonical.displayName || '').trim().toLowerCase();
    return hqMembers.some(m => {
      const dName = (m.displayName || '').trim().toLowerCase();
      const nName = (m.name || '').trim().toLowerCase();
      const eName = (m.email ? m.email.split('@')[0] : '').toLowerCase();
      return dName === targetName || nName === targetName || eName === targetName;
    });
  };

  // Helper: Date filter matching
  const isDateInRange = (ts) => {
    if (dateFilter === 'all') return true;
    if (!ts) return false;
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(d.getTime())) return false;

    const now = new Date();
    if (dateFilter === 'month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      return d >= startOfMonth;
    }
    if (dateFilter === '7days') {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return d >= sevenDaysAgo;
    }
    if (dateFilter === '30days') {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return d >= thirtyDaysAgo;
    }
    return true;
  };

  // -------------------------------------------------------------
  // Track 1: Sales Performance Leaderboard (HQ Only)
  // -------------------------------------------------------------
  const salesLeaderboard = useMemo(() => {
    const map = {};

    // Pre-populate with all active HQ members so everyone is represented
    hqMembers.forEach(m => {
      const cleanName = m.displayName || m.name || m.email?.split('@')[0] || 'Advisor';
      map[m.id] = {
        key: m.id,
        uid: m.id,
        name: cleanName,
        email: m.email || '',
        photoURL: m.photoURL || '',
        totalSourced: 0,
        interview: 0,
        offer: 0,
        onboarded: 0,
        activeOrders: 0
      };
    });

    const getOrCreatePic = (name, uid = '') => {
      const canonical = resolveCanonicalPic(name, uid, teamMembers);
      if (!isHqAdvisor(canonical)) return null;

      const targetKey = canonical.uid || canonical.key;
      if (!map[targetKey]) {
        map[targetKey] = {
          key: targetKey,
          uid: canonical.uid || '',
          name: canonical.displayName,
          email: canonical.email || '',
          photoURL: canonical.photoURL || '',
          totalSourced: 0,
          interview: 0,
          offer: 0,
          onboarded: 0,
          activeOrders: 0
        };
      }
      return map[targetKey];
    };

    // Aggregate from Candidates
    candidates.forEach(c => {
      const candidateTime = c.updatedAt || c.createdAt || c.stageHistory?.[c.stageHistory?.length - 1]?.timestamp;
      if (!isDateInRange(candidateTime)) return;

      const pic = getOrCreatePic(c.picName, c.assignedTo);
      if (!pic) return;

      pic.totalSourced += 1;
      const stage = c.stage || 'screening';
      if (stage === 'interview') pic.interview += 1;
      else if (stage === 'offer') pic.offer += 1;
      else if (stage === 'pre_onboarding' || stage === 'onboarding' || stage === 'post_onboarding') {
        pic.onboarded += 1;
      }
    });

    // Aggregate from Job Orders
    orders.forEach(o => {
      const orderTime = o.updatedAt || o.createdAt;
      if (!isDateInRange(orderTime)) return;

      const pic = getOrCreatePic(o.picName, o.assignedTo);
      if (!pic) return;

      if (o.status !== 'filled' && o.status !== 'paused') {
        pic.activeOrders += 1;
      }
    });

    const list = Object.values(map).map(item => {
      const rate = item.totalSourced > 0
        ? ((item.onboarded / item.totalSourced) * 100).toFixed(1)
        : '0.0';
      const compositeScore = (item.onboarded * 100) + (item.offer * 40) + (item.interview * 15) + (item.totalSourced * 2);

      return {
        ...item,
        rate: Number(rate),
        compositeScore
      };
    });

    // Primary: Onboarded DESC, Secondary: Composite Score DESC, Tertiary: Total Sourced DESC
    return list.sort((a, b) => b.onboarded - a.onboarded || b.compositeScore - a.compositeScore || b.totalSourced - a.totalSourced);
  }, [candidates, orders, hqMembers, teamMembers, dateFilter]);

  // -------------------------------------------------------------
  // Track 2: Attendance Leaderboard (HQ Only)
  // -------------------------------------------------------------
  const attendanceLeaderboard = useMemo(() => {
    const map = {};

    // Pre-populate with HQ members
    hqMembers.forEach(m => {
      const cleanName = m.displayName || m.name || m.email?.split('@')[0] || 'Advisor';
      map[m.id] = {
        key: m.id,
        uid: m.id,
        name: cleanName,
        email: m.email || '',
        photoURL: m.photoURL || '',
        daysPresent: 0,
        officeDays: 0,
        wfhDays: 0,
        earliestMinutesSum: 0,
        earliestPunchesCount: 0,
        dayRecords: {}
      };
    });

    const combinedEvents = [...manualCheckins, ...logs];

    combinedEvents.forEach(evt => {
      const ts = evt.timestamp;
      if (!isDateInRange(ts)) return;

      const canonical = resolveCanonicalPic(evt.picName || evt.userName || evt.userEmail, evt.userId, teamMembers);
      if (!isHqAdvisor(canonical)) return;

      const targetKey = canonical.uid || canonical.key;
      if (!map[targetKey]) {
        map[targetKey] = {
          key: targetKey,
          uid: canonical.uid || '',
          name: canonical.displayName,
          email: canonical.email || '',
          photoURL: canonical.photoURL || '',
          daysPresent: 0,
          officeDays: 0,
          wfhDays: 0,
          earliestMinutesSum: 0,
          earliestPunchesCount: 0,
          dayRecords: {}
        };
      }

      const d = ts.toDate ? ts.toDate() : new Date(ts);
      if (isNaN(d.getTime())) return;

      const dateStr = d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
      const rec = map[targetKey];

      if (!rec.dayRecords[dateStr]) {
        const isWfh = evt.verifyMethod === 'WFH' || evt.verifySnapshot?.method === 'WFH';
        rec.dayRecords[dateStr] = {
          firstTime: d,
          isWfh
        };
        rec.daysPresent += 1;
        if (isWfh) rec.wfhDays += 1;
        else rec.officeDays += 1;

        const minutesFromMidnight = d.getHours() * 60 + d.getMinutes();
        rec.earliestMinutesSum += minutesFromMidnight;
        rec.earliestPunchesCount += 1;
      }
    });

    const list = Object.values(map).map(item => {
      // Consistency score = (daysPresent * 20) + (officeDays * 5)
      const avgMinutes = item.earliestPunchesCount > 0 ? (item.earliestMinutesSum / item.earliestPunchesCount) : 570;
      // Bonus if arriving around 09:00 (540 min)
      const promptBonus = Math.max(0, Math.round((600 - avgMinutes) / 5));
      const consistencyScore = (item.daysPresent * 20) + (item.officeDays * 5) + promptBonus;

      return {
        ...item,
        consistencyScore: Math.max(0, consistencyScore)
      };
    });

    // Primary: Days Present DESC, Secondary: Consistency Score DESC, Tertiary: Office Days DESC
    return list.sort((a, b) => b.daysPresent - a.daysPresent || b.consistencyScore - a.consistencyScore || b.officeDays - a.officeDays);
  }, [manualCheckins, logs, hqMembers, teamMembers, dateFilter]);

  // Current active list & Top 3
  const currentRankingList = activeTab === 'sales' ? salesLeaderboard : attendanceLeaderboard;
  const top1 = currentRankingList[0] || null;
  const top2 = currentRankingList[1] || null;
  const top3 = currentRankingList[2] || null;

  // Non-HQ Gate Protection
  if (!isHqTeam) {
    return (
      <div style={{ maxWidth: '620px', margin: '4rem auto', textAlign: 'center', padding: '0 1rem' }}>
        <div className="bezel-shell">
          <div className="bezel-core" style={{ padding: '3rem 2rem' }}>
            <div style={{
              width: '60px', height: '60px', borderRadius: '50%',
              background: 'rgba(245, 158, 11, 0.12)', color: 'var(--accent-amber)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '2rem', marginBottom: '1.25rem'
            }}>
              <i className="ph-light ph-shield-warning"></i>
            </div>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: '700', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
              {t('leaderboard.hqOnlyNotice', 'Leaderboard 仅对公司本部成员开放')}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', lineHeight: 1.6, maxWidth: '440px', margin: '0 auto' }}>
              {t('leaderboard.hqOnlyDesc', '当前账号所属团队为外部合作人，无权查看公司本部内部考勤与销售业绩榜单。')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', paddingBottom: '3rem' }}>
      
      {/* Top Controls Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 'var(--space-4)',
        background: 'var(--card-bg)',
        border: '1px solid var(--border-interactive)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-4) var(--space-5)',
        boxShadow: 'var(--shadow-card)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '10px',
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.18) 0%, rgba(217, 119, 6, 0.18) 100%)',
            color: 'var(--accent-amber)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.4rem', border: '1px solid rgba(245, 158, 11, 0.3)'
          }}>
            <i className="ph-bold ph-trophy"></i>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: '800', color: 'var(--text-primary)', margin: 0, letterSpacing: '0.02em' }}>
                Leaderboard
              </h2>
              <span className="badge" style={{
                background: 'rgba(59, 130, 246, 0.12)',
                color: 'var(--accent-blue)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                fontSize: '11px',
                fontWeight: '600'
              }}>
                <i className="ph-bold ph-buildings" style={{ marginRight: '4px' }}></i>
                {t('leaderboard.hqBadge', '公司本部专属')}
              </span>
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: '3px 0 0 0' }}>
              {t('leaderboard.subtitle', '公司本部考勤与销售业绩数据排行')}
            </p>
          </div>
        </div>

        {/* Date Filter Pills */}
        <div style={{
          display: 'flex',
          gap: '4px',
          background: 'var(--input-bg)',
          padding: '3px',
          borderRadius: 'var(--radius-full)',
          border: '1px solid var(--border-interactive)'
        }}>
          {[
            { id: 'month', label: t('leaderboard.filterMonth', '本月') },
            { id: '7days', label: t('leaderboard.filter7Days', '近 7 天') },
            { id: '30days', label: t('leaderboard.filter30Days', '近 30 天') },
            { id: 'all', label: t('leaderboard.filterAll', '全部') },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setDateFilter(f.id)}
              style={{
                border: 'none',
                background: dateFilter === f.id ? 'var(--accent-blue)' : 'transparent',
                color: dateFilter === f.id ? '#ffffff' : 'var(--text-muted)',
                padding: '4px 12px',
                borderRadius: 'var(--radius-full)',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Track Toggle Tabs (Sales vs Attendance) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '8px',
        background: 'var(--input-bg)',
        padding: '5px',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-interactive)'
      }}>
        <button
          onClick={() => setActiveTab('sales')}
          style={{
            padding: '10px 16px',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            background: activeTab === 'sales' ? 'var(--card-bg)' : 'transparent',
            color: activeTab === 'sales' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: '700',
            fontSize: 'var(--text-sm)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: activeTab === 'sales' ? 'var(--shadow-card)' : 'none',
            borderBottom: activeTab === 'sales' ? '2px solid var(--accent-blue)' : 'none',
            transition: 'all 0.2s ease'
          }}
        >
          <i className="ph-bold ph-chart-line-up" style={{ color: activeTab === 'sales' ? 'var(--accent-blue)' : 'inherit' }}></i>
          <span>{t('leaderboard.tabSales', '销售业绩榜')}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '500' }}>
            ({salesLeaderboard.length})
          </span>
        </button>

        <button
          onClick={() => setActiveTab('attendance')}
          style={{
            padding: '10px 16px',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            background: activeTab === 'attendance' ? 'var(--card-bg)' : 'transparent',
            color: activeTab === 'attendance' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: '700',
            fontSize: 'var(--text-sm)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: activeTab === 'attendance' ? 'var(--shadow-card)' : 'none',
            borderBottom: activeTab === 'attendance' ? '2px solid #8b5cf6' : 'none',
            transition: 'all 0.2s ease'
          }}
        >
          <i className="ph-bold ph-calendar-check" style={{ color: activeTab === 'attendance' ? '#8b5cf6' : 'inherit' }}></i>
          <span>{t('leaderboard.tabAttendance', '考勤出勤榜')}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '500' }}>
            ({attendanceLeaderboard.length})
          </span>
        </button>
      </div>

      {/* Attendance Tab Action Bar */}
      {activeTab === 'attendance' && isHqTeam && (isOwner || isManager) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-2)', position: 'relative', zIndex: 60, pointerEvents: 'auto' }}>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              borderColor: 'rgba(139, 92, 246, 0.4)',
              color: '#a78bfa',
              background: 'rgba(139, 92, 246, 0.08)',
              padding: '5px 14px',
              fontSize: '12px',
              fontWeight: '600',
              borderRadius: 'var(--radius-md)',
              cursor: isExporting ? 'wait' : 'pointer',
              pointerEvents: isExporting ? 'none' : 'auto',
              position: 'relative',
              zIndex: 62,
              flexShrink: 0
            }}
            onClick={(e) => {
              e.stopPropagation();
              handleExportAttendanceExcel();
            }}
            disabled={isExporting}
            title={t('leaderboard.exportAttendanceTitle', '导出当月内部员工考勤 3-Sheet Excel 报表')}
          >
            <i className={`ph-bold ${isExporting ? 'ph-spinner-gap ph-spin' : 'ph-file-xls'}`} style={{ pointerEvents: 'none' }}></i>
            <span style={{ pointerEvents: 'none' }}>{isExporting ? t('leaderboard.exporting', '正在导出报表...') : t('leaderboard.exportExcel', '导出考勤月报 (Excel)')}</span>
          </button>
        </div>
      )}

      {/* Global Toast Notification */}
      {toastMsg && (
        <div style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          zIndex: 9999,
          background: 'rgba(15, 23, 42, 0.95)',
          color: '#fff',
          padding: '12px 20px',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
          border: '1px solid #8b5cf6',
          fontSize: '14px',
          backdropFilter: 'blur(10px)'
        }}>
          {toastMsg}
        </div>
      )}

      {/* Top 3 Podium (Classic Olympic Stagger: #2 Left, #1 Center, #3 Right) */}
      {currentRankingList.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 'var(--space-4)',
          alignItems: 'end'
        }}>
          
          {/* Rank 2: Silver */}
          {top2 && (
            <div style={{
              background: 'var(--card-bg)',
              border: '1px solid rgba(148, 163, 184, 0.4)',
              borderRadius: 'var(--radius-xl)',
              padding: 'var(--space-5)',
              textAlign: 'center',
              boxShadow: 'var(--shadow-card)',
              position: 'relative'
            }}>
              <div style={{
                position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)',
                background: '#94a3b8', color: '#0f172a', fontWeight: '800', fontSize: '12px',
                padding: '2px 14px', borderRadius: 'var(--radius-full)',
                display: 'inline-flex', alignItems: 'center', gap: '4px', boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
              }}>
                <i className="ph-bold ph-medal"></i>
                <span>RANK 2</span>
              </div>

              <div style={{
                width: '54px', height: '54px', borderRadius: '50%',
                background: 'linear-gradient(135deg, rgba(148, 163, 184, 0.25) 0%, rgba(71, 85, 105, 0.25) 100%)',
                border: '2px solid #94a3b8',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.25rem', fontWeight: '800', color: '#cbd5e1',
                margin: '10px auto 12px auto'
              }}>
                {top2.name.charAt(0).toUpperCase()}
              </div>

              <div style={{ fontWeight: '700', fontSize: 'var(--text-md)', color: 'var(--text-primary)', marginBottom: '4px' }}>
                {top2.name}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '14px' }}>
                {top2.email}
              </div>

              {activeTab === 'sales' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{
                    padding: '8px', background: 'rgba(59, 130, 246, 0.08)',
                    borderRadius: 'var(--radius-md)', border: '1px solid rgba(59, 130, 246, 0.2)'
                  }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>{t('leaderboard.onboarded', '成功入职')}</span>
                    <span style={{ fontSize: '1.35rem', fontWeight: '800', color: 'var(--accent-emerald)' }}>{top2.onboarded}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    <span>{t('leaderboard.compositeScore', '综合积分')}: <strong style={{ color: 'var(--text-primary)' }}>{top2.compositeScore}</strong></span>
                    <span>{t('leaderboard.conversionRate', '转化率')}: <strong style={{ color: 'var(--text-primary)' }}>{top2.rate}%</strong></span>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{
                    padding: '8px', background: 'rgba(139, 92, 246, 0.08)',
                    borderRadius: 'var(--radius-md)', border: '1px solid rgba(139, 92, 246, 0.2)'
                  }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>{t('leaderboard.daysPresent', '出勤天数')}</span>
                    <span style={{ fontSize: '1.35rem', fontWeight: '800', color: '#c084fc' }}>{top2.daysPresent}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    <span>{t('leaderboard.officeDays', '办公室')}: <strong style={{ color: 'var(--text-primary)' }}>{top2.officeDays}</strong></span>
                    <span>{t('leaderboard.consistencyScore', '勤奋指数')}: <strong style={{ color: 'var(--text-primary)' }}>{top2.consistencyScore}</strong></span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Rank 1: Gold (Center & Elevated) */}
          {top1 && (
            <div style={{
              background: 'linear-gradient(180deg, rgba(245, 158, 11, 0.08) 0%, var(--card-bg) 100%)',
              border: '2px solid rgba(245, 158, 11, 0.65)',
              borderRadius: 'var(--radius-xl)',
              padding: 'var(--space-6) var(--space-5)',
              textAlign: 'center',
              boxShadow: '0 12px 36px rgba(245, 158, 11, 0.15)',
              position: 'relative'
            }}>
              <div style={{
                position: 'absolute', top: '-14px', left: '50%', transform: 'translateX(-50%)',
                background: '#f59e0b', color: '#000000', fontWeight: '900', fontSize: '12px',
                padding: '3px 18px', borderRadius: 'var(--radius-full)',
                display: 'inline-flex', alignItems: 'center', gap: '5px', boxShadow: '0 4px 14px rgba(245, 158, 11, 0.4)'
              }}>
                <i className="ph-bold ph-trophy"></i>
                <span>RANK 1</span>
              </div>

              <div style={{
                width: '64px', height: '64px', borderRadius: '50%',
                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.3) 0%, rgba(217, 119, 6, 0.3) 100%)',
                border: '3px solid #f59e0b',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.5rem', fontWeight: '900', color: '#fbbf24',
                margin: '12px auto 14px auto',
                boxShadow: '0 0 20px rgba(245, 158, 11, 0.35)'
              }}>
                {top1.name.charAt(0).toUpperCase()}
              </div>

              <div style={{ fontWeight: '800', fontSize: 'var(--text-lg)', color: 'var(--text-primary)', marginBottom: '4px' }}>
                {top1.name}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '16px' }}>
                {top1.email}
              </div>

              {activeTab === 'sales' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{
                    padding: '10px', background: 'rgba(16, 185, 129, 0.1)',
                    borderRadius: 'var(--radius-md)', border: '1px solid rgba(16, 185, 129, 0.3)'
                  }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>{t('leaderboard.onboarded', '成功入职')}</span>
                    <span style={{ fontSize: '1.65rem', fontWeight: '900', color: 'var(--accent-emerald)' }}>{top1.onboarded}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    <span>{t('leaderboard.compositeScore', '综合积分')}: <strong style={{ color: 'var(--accent-amber)' }}>{top1.compositeScore}</strong></span>
                    <span>{t('leaderboard.conversionRate', '转化率')}: <strong style={{ color: 'var(--text-primary)' }}>{top1.rate}%</strong></span>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{
                    padding: '10px', background: 'rgba(139, 92, 246, 0.12)',
                    borderRadius: 'var(--radius-md)', border: '1px solid rgba(139, 92, 246, 0.35)'
                  }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>{t('leaderboard.daysPresent', '出勤天数')}</span>
                    <span style={{ fontSize: '1.65rem', fontWeight: '900', color: '#c084fc' }}>{top1.daysPresent}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    <span>{t('leaderboard.officeDays', '办公室')}: <strong style={{ color: 'var(--text-primary)' }}>{top1.officeDays}</strong></span>
                    <span>{t('leaderboard.consistencyScore', '勤奋指数')}: <strong style={{ color: 'var(--accent-amber)' }}>{top1.consistencyScore}</strong></span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Rank 3: Bronze */}
          {top3 && (
            <div style={{
              background: 'var(--card-bg)',
              border: '1px solid rgba(180, 83, 9, 0.4)',
              borderRadius: 'var(--radius-xl)',
              padding: 'var(--space-5)',
              textAlign: 'center',
              boxShadow: 'var(--shadow-card)',
              position: 'relative'
            }}>
              <div style={{
                position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)',
                background: '#b45309', color: '#ffffff', fontWeight: '800', fontSize: '12px',
                padding: '2px 14px', borderRadius: 'var(--radius-full)',
                display: 'inline-flex', alignItems: 'center', gap: '4px', boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
              }}>
                <i className="ph-bold ph-medal"></i>
                <span>RANK 3</span>
              </div>

              <div style={{
                width: '54px', height: '54px', borderRadius: '50%',
                background: 'linear-gradient(135deg, rgba(180, 83, 9, 0.25) 0%, rgba(120, 53, 15, 0.25) 100%)',
                border: '2px solid #b45309',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.25rem', fontWeight: '800', color: '#f59e0b',
                margin: '10px auto 12px auto'
              }}>
                {top3.name.charAt(0).toUpperCase()}
              </div>

              <div style={{ fontWeight: '700', fontSize: 'var(--text-md)', color: 'var(--text-primary)', marginBottom: '4px' }}>
                {top3.name}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '14px' }}>
                {top3.email}
              </div>

              {activeTab === 'sales' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{
                    padding: '8px', background: 'rgba(59, 130, 246, 0.08)',
                    borderRadius: 'var(--radius-md)', border: '1px solid rgba(59, 130, 246, 0.2)'
                  }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>{t('leaderboard.onboarded', '成功入职')}</span>
                    <span style={{ fontSize: '1.35rem', fontWeight: '800', color: 'var(--accent-emerald)' }}>{top3.onboarded}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    <span>{t('leaderboard.compositeScore', '综合积分')}: <strong style={{ color: 'var(--text-primary)' }}>{top3.compositeScore}</strong></span>
                    <span>{t('leaderboard.conversionRate', '转化率')}: <strong style={{ color: 'var(--text-primary)' }}>{top3.rate}%</strong></span>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{
                    padding: '8px', background: 'rgba(139, 92, 246, 0.08)',
                    borderRadius: 'var(--radius-md)', border: '1px solid rgba(139, 92, 246, 0.2)'
                  }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>{t('leaderboard.daysPresent', '出勤天数')}</span>
                    <span style={{ fontSize: '1.35rem', fontWeight: '800', color: '#c084fc' }}>{top3.daysPresent}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    <span>{t('leaderboard.officeDays', '办公室')}: <strong style={{ color: 'var(--text-primary)' }}>{top3.officeDays}</strong></span>
                    <span>{t('leaderboard.consistencyScore', '勤奋指数')}: <strong style={{ color: 'var(--text-primary)' }}>{top3.consistencyScore}</strong></span>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* Full Rankings Table */}
      <div className="bezel-shell">
        <div className="bezel-core" style={{ padding: 'var(--space-5)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
            <h3 style={{ fontSize: 'var(--text-md)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="ph-bold ph-list-numbers" style={{ color: 'var(--accent-blue)' }}></i>
              <span>{activeTab === 'sales' ? t('leaderboard.tabSales', '销售业绩榜') : t('leaderboard.tabAttendance', '考勤出勤榜')}</span>
            </h3>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              {t('leaderboard.hqMembersCount', { count: currentRankingList.length }, `${currentRankingList.length} 位公司本部成员`)}
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '10px 12px', width: '60px' }}>{t('leaderboard.rank', '排名')}</th>
                  <th style={{ padding: '10px 12px' }}>{t('leaderboard.advisor', '顾问')}</th>
                  {activeTab === 'sales' ? (
                    <>
                      <th style={{ padding: '10px 12px', color: 'var(--accent-emerald)', fontWeight: '700' }}>{t('leaderboard.onboarded', '成功入职')}</th>
                      <th style={{ padding: '10px 12px' }}>{t('leaderboard.offers', 'Offer 数')}</th>
                      <th style={{ padding: '10px 12px' }}>{t('leaderboard.interviews', '面试数')}</th>
                      <th style={{ padding: '10px 12px' }}>{t('leaderboard.sourced', '推人量')}</th>
                      <th style={{ padding: '10px 12px', minWidth: '140px' }}>{t('leaderboard.conversionRate', '成单转化率')}</th>
                      <th style={{ padding: '10px 12px', color: 'var(--accent-amber)', fontWeight: '700' }}>{t('leaderboard.compositeScore', '综合积分')}</th>
                    </>
                  ) : (
                    <>
                      <th style={{ padding: '10px 12px', color: '#c084fc', fontWeight: '700' }}>{t('leaderboard.daysPresent', '出勤天数')}</th>
                      <th style={{ padding: '10px 12px' }}>{t('leaderboard.officeDays', '办公室出勤')}</th>
                      <th style={{ padding: '10px 12px' }}>{t('leaderboard.wfhDays', '居家办公 (WFH)')}</th>
                      <th style={{ padding: '10px 12px', color: 'var(--accent-amber)', fontWeight: '700' }}>{t('leaderboard.consistencyScore', '勤奋指数')}</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {currentRankingList.length === 0 ? (
                  <tr>
                    <td colSpan={activeTab === 'sales' ? 8 : 6} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
                      {t('leaderboard.noData', '暂无榜单数据')}
                    </td>
                  </tr>
                ) : (
                  currentRankingList.map((item, idx) => {
                    let rankBadge = (
                      <span style={{ color: 'var(--text-muted)', fontWeight: '600', paddingLeft: '4px' }}>
                        #{idx + 1}
                      </span>
                    );
                    if (idx === 0) {
                      rankBadge = (
                        <span style={{ background: '#f59e0b', color: '#000000', borderRadius: '50%', width: '22px', height: '22px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '11px' }}>
                          1
                        </span>
                      );
                    } else if (idx === 1) {
                      rankBadge = (
                        <span style={{ background: '#94a3b8', color: '#000000', borderRadius: '50%', width: '22px', height: '22px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '11px' }}>
                          2
                        </span>
                      );
                    } else if (idx === 2) {
                      rankBadge = (
                        <span style={{ background: '#b45309', color: '#ffffff', borderRadius: '50%', width: '22px', height: '22px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '11px' }}>
                          3
                        </span>
                      );
                    }

                    return (
                      <tr key={item.key || item.name} style={{ borderBottom: '1px solid var(--border-hairline)', transition: 'background 0.2s' }}>
                        <td style={{ padding: '12px' }}>
                          {rankBadge}
                        </td>
                        <td style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                              width: '32px', height: '32px', borderRadius: '50%',
                              background: idx === 0 ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                              color: idx === 0 ? '#000' : '#fff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '12px', fontWeight: '700'
                            }}>
                              {item.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{item.name}</div>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.email}</div>
                            </div>
                          </div>
                        </td>

                        {activeTab === 'sales' ? (
                          <>
                            <td style={{ padding: '12px' }}>
                              <span style={{ fontWeight: '800', fontSize: '1.05rem', color: 'var(--accent-emerald)' }}>
                                {item.onboarded}
                              </span>
                            </td>
                            <td style={{ padding: '12px', color: 'var(--text-primary)', fontWeight: '600' }}>{item.offer}</td>
                            <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>{item.interview}</td>
                            <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{item.totalSourced}</td>
                            <td style={{ padding: '12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ flex: 1, height: '6px', background: 'var(--input-bg)', borderRadius: '3px', overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.min(100, item.rate * 2)}%`, height: '100%', background: 'var(--accent-emerald)', borderRadius: '3px' }}></div>
                                </div>
                                <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', minWidth: '38px' }}>
                                  {item.rate}%
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: '12px' }}>
                              <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.12)', color: 'var(--accent-amber)', fontWeight: '700', fontSize: '12px', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
                                {item.compositeScore}
                              </span>
                            </td>
                          </>
                        ) : (
                          <>
                            <td style={{ padding: '12px' }}>
                              <span style={{ fontWeight: '800', fontSize: '1.05rem', color: '#c084fc' }}>
                                {item.daysPresent}
                              </span>
                            </td>
                            <td style={{ padding: '12px' }}>
                              <span style={{ color: 'var(--accent-emerald)', fontWeight: '600' }}>
                                <i className="ph-bold ph-buildings" style={{ marginRight: '4px' }}></i>
                                {item.officeDays}
                              </span>
                            </td>
                            <td style={{ padding: '12px' }}>
                              <span style={{ color: '#c084fc', fontWeight: '600' }}>
                                <i className="ph-bold ph-house-line" style={{ marginRight: '4px' }}></i>
                                {item.wfhDays}
                              </span>
                            </td>
                            <td style={{ padding: '12px' }}>
                              <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.12)', color: 'var(--accent-amber)', fontWeight: '700', fontSize: '12px', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
                                {item.consistencyScore}
                              </span>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  );
}
