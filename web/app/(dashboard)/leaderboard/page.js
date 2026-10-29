'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../../lib/auth-context';
import { useNotifications } from '../../../lib/notification-context';
import { useI18n } from '../../../lib/i18n-context';
import { FirestoreStore } from '../../../lib/firestore-store';
import { resolveCanonicalPic } from '../../../lib/identity.mjs';
import { db } from '../../../lib/firebase';
import { collection, query, orderBy, limit, onSnapshot, where } from 'firebase/firestore';
import { ExcelExporter, isAccountExcluded, deduplicateDayEvents } from '../../../lib/excel-exporter';
import { CascadeShiftEngine, DEFAULT_SHIFT_CONFIG } from '../../../lib/cascade-shift-engine';
import { SystemLogger } from '../../../lib/logger';
import { 
  getGuaranteeRemainingDays, 
  evaluateGuaranteeStatus, 
  formatCommissionCurrency 
} from '../../../lib/commission-engine';

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

  // Commission Engine States (Phase 6)
  const [commissionRecords, setCommissionRecords] = useState([]);
  const [commissionConfig, setCommissionConfig] = useState(null);
  const [dealStatusFilter, setDealStatusFilter] = useState('ALL'); // 'ALL' | 'PENDING' | 'UNLOCKED' | 'CANCELLED'
  const [clawbackModalDeal, setClawbackModalDeal] = useState(null);
  const [clawbackReason, setClawbackReason] = useState('');
  const [isProcessingCommission, setIsProcessingCommission] = useState(false);

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

  // 2.6 Subscribe to Commission Records & Config (Phase 6)
  useEffect(() => {
    const currentTeam = teamId || 'default_team';
    const unsubRecords = FirestoreStore.subscribeToCommissionRecords(currentTeam, (recs) => {
      setCommissionRecords(recs || []);
    });
    const unsubConfig = FirestoreStore.subscribeToCommissionConfig(currentTeam, (cfg) => {
      setCommissionConfig(cfg);
    });
    return () => {
      unsubRecords();
      unsubConfig();
    };
  }, [teamId]);

  const canViewAllAmounts = Boolean(isOwner || isManager || commissionConfig?.leaderboardVisibility === 'PUBLIC_AMOUNT');

  const formatLeaderboardAmount = (amount, advisorUid) => {
    if (canViewAllAmounts || (user?.uid && advisorUid === user.uid)) {
      return formatCommissionCurrency(amount, 'MYR');
    }
    return 'RM ***';
  };

  const handleUnlockDeal = async (record) => {
    if (!isOwner && !isManager) return;
    try {
      setIsProcessingCommission(true);
      const currentTeam = teamId || 'default_team';
      await FirestoreStore.updateCommissionStatus(currentTeam, user?.displayName || user?.email || 'manager', record.id, 'UNLOCKED', {
        candidateName: record.candidateName,
        unlockedAt: new Date().toISOString(),
        unlockedBy: user?.displayName || user?.email || 'supervisor'
      });
      showToast(t('commission.dealUnlockedToast', `已确认回款并解锁 ${record.candidateName} 的佣金！`));
    } catch (err) {
      console.error('Failed to unlock deal:', err);
      showToast(t('commission.dealUnlockFailed', '解锁失败: ') + (err.message || err));
    } finally {
      setIsProcessingCommission(false);
    }
  };

  const handleConfirmClawback = async () => {
    if (!clawbackModalDeal) return;
    if (!clawbackReason.trim()) {
      showToast(t('commission.clawbackReasonRequired', '请填写退工离职原因以便审计留痕'));
      return;
    }
    try {
      setIsProcessingCommission(true);
      const currentTeam = teamId || 'default_team';
      await FirestoreStore.updateCommissionStatus(currentTeam, user?.displayName || user?.email || 'manager', clawbackModalDeal.id, 'CANCELLED', {
        candidateName: clawbackModalDeal.candidateName,
        cancellation: {
          cancelledAt: new Date().toISOString(),
          cancelledBy: user?.displayName || user?.email || 'supervisor',
          reason: clawbackReason.trim()
        }
      });
      showToast(t('commission.dealCancelledToast', `已冲销 ${clawbackModalDeal.candidateName} 的保证期佣金`));
      setClawbackModalDeal(null);
      setClawbackReason('');
    } catch (err) {
      console.error('Failed to cancel deal:', err);
      showToast(t('commission.dealCancelFailed', '冲销失败: ') + (err.message || err));
    } finally {
      setIsProcessingCommission(false);
    }
  };

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
        excludedAccounts: attendanceRules?.excludedAccounts || [],
        hideZeroAttendance: Boolean(attendanceRules?.hideZeroAttendanceInReport),
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

  const handleExportCommissionExcel = async () => {
    if (!isHqTeam || (!isOwner && !isManager)) {
      showToast(t('commission.exportNoPermission', '仅 HQ 本部管理人员可导出佣金结算报表'));
      return;
    }
    if (commissionRecords.length === 0) {
      showToast(t('commission.exportNoData', '当前无可导出的成单佣金数据'));
      return;
    }

    try {
      setIsExporting(true);
      const targetMonth = new Date().toISOString().slice(0, 7);
      await ExcelExporter.exportCommissionReport({
        records: commissionRecords,
        teamMembers: teamMembers,
        monthStr: dateFilter === 'month' ? targetMonth : '',
        locale: lang
      });

      showToast(t('commission.exportSuccess', '🎉 月度佣金结算报表导出成功！'));
    } catch (err) {
      console.error('Failed to export commission Excel:', err);
      showToast(t('commission.exportFailed', '导出佣金报表失败: ') + (err.message || err));
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
        activeOrders: 0,
        pendingCommission: 0,
        unlockedCommission: 0,
        totalDeals: 0
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
          activeOrders: 0,
          pendingCommission: 0,
          unlockedCommission: 0,
          totalDeals: 0
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

    // Aggregate Commission from commissionRecords (Phase 6)
    const todayStr = new Date().toISOString().split('T')[0];
    commissionRecords.forEach(rec => {
      if (rec.status === 'CANCELLED') return;
      const dealTime = rec.createdAt || rec.onboardDate;
      if (!isDateInRange(dealTime)) return;

      const remainingDays = getGuaranteeRemainingDays(rec.unlockDate, todayStr);
      const isUnlocked = rec.status === 'UNLOCKED' || rec.status === 'SETTLED' || (Number(rec.guaranteeDays) <= 0) || (remainingDays === 0);

      (rec.splits || []).forEach(split => {
        const pic = getOrCreatePic(split.displayName, split.uid);
        if (!pic) return;

        const amt = Number(split.amount) || 0;
        if (isUnlocked) {
          pic.unlockedCommission += amt;
        } else {
          pic.pendingCommission += amt;
        }
        pic.totalDeals += 1;
      });
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
    }).filter(item => item.compositeScore > 0 || item.totalSourced > 0);

    // Primary: Onboarded DESC, Secondary: Composite Score DESC, Tertiary: Total Sourced DESC
    return list.sort((a, b) => b.onboarded - a.onboarded || b.compositeScore - a.compositeScore || b.totalSourced - a.totalSourced);
  }, [candidates, orders, hqMembers, teamMembers, dateFilter, commissionRecords]);

  // -------------------------------------------------------------
  // Track 2: Attendance & Punctuality Leaderboard (HQ Only)
  // -------------------------------------------------------------
  const attendanceLeaderboard = useMemo(() => {
    const map = {};

    // Pre-populate with HQ members
    hqMembers.forEach(m => {
      const cleanName = m.displayName || m.name || m.email?.split('@')[0] || 'Advisor';
      if (isAccountExcluded({ uid: m.id, email: m.email, name: cleanName }, attendanceRules?.excludedAccounts)) {
        return;
      }
      map[m.id] = {
        key: m.id,
        uid: m.id,
        name: cleanName,
        email: m.email || '',
        photoURL: m.photoURL || '',
        daysPresent: 0,
        officeDays: 0,
        wfhDays: 0,
        compliantDays: 0,
        violationDays: 0,
        earliestMinutesSum: 0,
        firstInCount: 0,
        dayRecords: {}
      };
    });

    const combinedEvents = [...manualCheckins, ...logs];
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    combinedEvents.forEach(evt => {
      const ts = evt.timestamp || evt.createdAt;
      if (!isDateInRange(ts)) return;

      const canonical = resolveCanonicalPic(evt.picName || evt.userName || evt.userEmail, evt.userId, teamMembers);
      if (!isHqAdvisor(canonical)) return;

      if (isAccountExcluded({ uid: canonical.uid, email: canonical.email || evt.userEmail, name: canonical.displayName }, attendanceRules?.excludedAccounts)) {
        return;
      }

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
          compliantDays: 0,
          violationDays: 0,
          earliestMinutesSum: 0,
          firstInCount: 0,
          dayRecords: {}
        };
      }

      const d = CascadeShiftEngine.toSafeDate(ts);
      if (!d) return;

      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const rec = map[targetKey];

      if (!rec.dayRecords[dateStr]) {
        rec.dayRecords[dateStr] = {
          events: [],
          isWfh: evt.verifyMethod === 'WFH' || evt.verifySnapshot?.method === 'WFH'
        };
      }
      rec.dayRecords[dateStr].events.push({
        ...evt,
        dateObj: d,
        type: evt.type || evt.action || 'CLOCK_IN'
      });
      if (evt.verifyMethod === 'WFH' || evt.verifySnapshot?.method === 'WFH') {
        rec.dayRecords[dateStr].isWfh = true;
      }
    });

    const shiftConfig = attendanceRules?.shiftConfig || DEFAULT_SHIFT_CONFIG;
    const shiftOverrides = attendanceRules?.shiftOverrides || {};

    Object.values(map).forEach(member => {
      const dates = Object.keys(member.dayRecords);
      member.daysPresent = 0;

      dates.forEach(dateStr => {
        const dayData = member.dayRecords[dateStr];
        const overrideKey = `${dateStr}__${member.name}`;
        const overrideKeyUid = `${dateStr}__${member.uid}`;
        const overrideShift = shiftOverrides[overrideKey] || shiftOverrides[overrideKeyUid] || null;
        const isToday = dateStr === todayStr;

        const cleanEvents = deduplicateDayEvents(dayData.events);
        const res = CascadeShiftEngine.resolveDailyShift(
          cleanEvents,
          shiftConfig,
          { locale: isEn ? 'en' : 'zh', overrideShift, isToday }
        );

        // 今日在岗进行中（已打上班卡但尚未打下班卡）：暂不计入已结考勤与准点率结算，避免白天未下班前将准点率拉低
        const isTodayInProgress = isToday && (res.isInProgress || res.compliance === 'IN_PROGRESS');
        if (isTodayInProgress) {
          return;
        }

        if (res.firstIn) {
          const minutesFromMidnight = res.firstIn.getHours() * 60 + res.firstIn.getMinutes();
          member.earliestMinutesSum += minutesFromMidnight;
          member.firstInCount += 1;
        }

        member.daysPresent += 1;
        if (dayData.isWfh) {
          member.wfhDays += 1;
        } else {
          member.officeDays += 1;
        }

        // Punctuality compliance:
        // Compliant means on-time (early arrival or on-time arrival) and compliant clock-out
        // Late arrival, early leave, missed punch count as violations
        if (res.isCompliant && !res.isViolation) {
          member.compliantDays += 1;
        } else if (res.isViolation || res.isLate) {
          member.violationDays += 1;
        }
      });
    });

    const list = Object.values(map)
      .filter(item => item.daysPresent > 0)
      .map(item => {
      const punctualityRate = item.daysPresent > 0
        ? Number(((item.compliantDays / item.daysPresent) * 100).toFixed(1))
        : 0;

      let avgArrivalStr = '-';
      if (item.firstInCount > 0) {
        const avgMin = Math.round(item.earliestMinutesSum / item.firstInCount);
        const hh = String(Math.floor(avgMin / 60)).padStart(2, '0');
        const mm = String(avgMin % 60).padStart(2, '0');
        avgArrivalStr = `${hh}:${mm}`;
      }

      // 0 attendance is strictly 0 score!
      // Score = (compliantDays * 20) + (daysPresent * 5) - (violationDays * 10)
      const punctualityScore = item.daysPresent > 0
        ? Math.max(0, (item.compliantDays * 20) + (item.daysPresent * 5) - (item.violationDays * 10))
        : 0;

      return {
        ...item,
        punctualityRate,
        avgArrivalStr,
        punctualityScore
      };
    });

    // Primary: punctualityScore DESC, Secondary: punctualityRate DESC, Tertiary: compliantDays DESC, Quaternary: daysPresent DESC
    return list.sort((a, b) => 
      b.punctualityScore - a.punctualityScore ||
      b.punctualityRate - a.punctualityRate ||
      b.compliantDays - a.compliantDays ||
      b.daysPresent - a.daysPresent
    );
  }, [manualCheckins, logs, hqMembers, teamMembers, dateFilter, attendanceRules, isEn]);

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
      
      {/* Top Controls: Compact Filter Toolbar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 'var(--space-3)',
        background: 'var(--card-bg)',
        border: '1px solid var(--border-interactive)',
        borderRadius: 'var(--radius-lg)',
        padding: '8px 14px',
        boxShadow: 'var(--shadow-card)'
      }}>
        {/* Track Toggle Tabs (Sales vs Attendance) */}
        <div style={{
          display: 'inline-flex',
          gap: '4px',
          background: 'var(--input-bg)',
          padding: '3px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-interactive)'
        }}>
          <button
            onClick={() => setActiveTab('sales')}
            style={{
              padding: '6px 14px',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              background: activeTab === 'sales' ? 'var(--card-bg)' : 'transparent',
              color: activeTab === 'sales' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: '700',
              fontSize: 'var(--text-sm)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: activeTab === 'sales' ? 'var(--shadow-card)' : 'none',
              borderBottom: activeTab === 'sales' ? '2px solid var(--accent-blue)' : '2px solid transparent',
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
              padding: '6px 14px',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              background: activeTab === 'attendance' ? 'var(--card-bg)' : 'transparent',
              color: activeTab === 'attendance' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: '700',
              fontSize: 'var(--text-sm)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: activeTab === 'attendance' ? 'var(--shadow-card)' : 'none',
              borderBottom: activeTab === 'attendance' ? '2px solid #8b5cf6' : '2px solid transparent',
              transition: 'all 0.2s ease'
            }}
          >
            <i className="ph-bold ph-calendar-check" style={{ color: activeTab === 'attendance' ? '#8b5cf6' : 'inherit' }}></i>
            <span>{t('leaderboard.tabAttendance', '考勤守时榜')}</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '500' }}>
              ({attendanceLeaderboard.length})
            </span>
          </button>
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

      {/* Sales Tab Action Bar: Export Commission Excel */}
      {activeTab === 'sales' && isHqTeam && (isOwner || isManager) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-2)', position: 'relative', zIndex: 60, pointerEvents: 'auto' }}>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              borderColor: 'rgba(16, 185, 129, 0.4)',
              color: '#10B981',
              background: 'rgba(16, 185, 129, 0.08)',
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
              handleExportCommissionExcel();
            }}
            disabled={isExporting}
            title={t('commission.exportExcelTitle', '导出月度顾问佣金结算与成单风控双 Sheet Excel 报表')}
          >
            <i className={`ph-bold ${isExporting ? 'ph-spinner-gap ph-spin' : 'ph-file-xls'}`} style={{ pointerEvents: 'none' }}></i>
            <span style={{ pointerEvents: 'none' }}>{isExporting ? t('leaderboard.exporting', '正在导出报表...') : t('commission.exportExcelBtn', '导出月度佣金报表 (Excel)')}</span>
          </button>
        </div>
      )}

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
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-end',
          gap: 'var(--space-4)',
          flexWrap: 'wrap'
        }}>
          
          {/* Rank 2: Silver */}
          {top2 && (
            <div style={{
              flex: '1 1 260px',
              maxWidth: '340px',
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
                  {top2.onboarded > 0 ? (
                    <div style={{
                      padding: '8px', background: 'rgba(59, 130, 246, 0.08)',
                      borderRadius: 'var(--radius-md)', border: '1px solid rgba(59, 130, 246, 0.2)'
                    }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>{t('leaderboard.onboarded', '成功入职')}</span>
                      <span style={{ fontSize: '1.35rem', fontWeight: '800', color: 'var(--accent-emerald)' }}>{top2.onboarded}</span>
                    </div>
                  ) : (
                    <div style={{
                      padding: '8px', background: 'rgba(245, 158, 11, 0.08)',
                      borderRadius: 'var(--radius-md)', border: '1px solid rgba(245, 158, 11, 0.2)'
                    }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>{t('leaderboard.compositeScore', '综合积分')}</span>
                      <span style={{ fontSize: '1.35rem', fontWeight: '800', color: 'var(--accent-amber)' }}>{top2.compositeScore}</span>
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    {top2.onboarded > 0 ? (
                      <>
                        <span>{t('leaderboard.compositeScore', '综合积分')}: <strong style={{ color: 'var(--text-primary)' }}>{top2.compositeScore}</strong></span>
                        <span>{t('leaderboard.conversionRate', '转化率')}: <strong style={{ color: 'var(--text-primary)' }}>{top2.rate}%</strong></span>
                      </>
                    ) : (
                      <>
                        <span>{t('leaderboard.interviews', '面试数')}: <strong style={{ color: 'var(--text-primary)' }}>{top2.interview}</strong></span>
                        <span>{t('leaderboard.sourced', '推人量')}: <strong style={{ color: 'var(--text-primary)' }}>{top2.totalSourced}</strong></span>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{
                    padding: '8px', background: 'rgba(139, 92, 246, 0.08)',
                    borderRadius: 'var(--radius-md)', border: '1px solid rgba(139, 92, 246, 0.2)'
                  }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>{t('leaderboard.punctualityRate', '准点率')}</span>
                    <span style={{ fontSize: '1.35rem', fontWeight: '800', color: '#c084fc' }}>
                      {top2.daysPresent === 0 ? '-' : `${top2.punctualityRate}%`}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    <span>{t('leaderboard.compliantDays', '准点天数')}: <strong style={{ color: 'var(--text-primary)' }}>{top2.compliantDays}/{top2.daysPresent} {t('leaderboard.unitDays', isEn ? 'd' : '天')}</strong></span>
                    <span>{t('leaderboard.punctualityScore', '守时指数')}: <strong style={{ color: 'var(--text-primary)' }}>{top2.punctualityScore}</strong></span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Rank 1: Gold (Center & Elevated) */}
          {top1 && (
            <div style={{
              flex: '1 1 280px',
              maxWidth: '360px',
              background: 'linear-gradient(180deg, rgba(245, 158, 11, 0.08) 0%, var(--card-bg) 100%)',
              border: '2px solid rgba(245, 158, 11, 0.65)',
              borderRadius: 'var(--radius-xl)',
              padding: 'var(--space-6) var(--space-5)',
              textAlign: 'center',
              boxShadow: '0 12px 36px rgba(245, 158, 11, 0.15)',
              position: 'relative',
              order: top2 ? 0 : -1
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
                  {top1.onboarded > 0 ? (
                    <div style={{
                      padding: '10px', background: 'rgba(16, 185, 129, 0.1)',
                      borderRadius: 'var(--radius-md)', border: '1px solid rgba(16, 185, 129, 0.3)'
                    }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>{t('leaderboard.onboarded', '成功入职')}</span>
                      <span style={{ fontSize: '1.65rem', fontWeight: '900', color: 'var(--accent-emerald)' }}>{top1.onboarded}</span>
                    </div>
                  ) : (
                    <div style={{
                      padding: '10px', background: 'rgba(245, 158, 11, 0.12)',
                      borderRadius: 'var(--radius-md)', border: '1px solid rgba(245, 158, 11, 0.35)'
                    }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>{t('leaderboard.compositeScore', '综合积分')}</span>
                      <span style={{ fontSize: '1.65rem', fontWeight: '900', color: 'var(--accent-amber)' }}>{top1.compositeScore}</span>
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {top1.onboarded > 0 ? (
                      <>
                        <span>{t('leaderboard.compositeScore', '综合积分')}: <strong style={{ color: 'var(--accent-amber)' }}>{top1.compositeScore}</strong></span>
                        <span>{t('leaderboard.conversionRate', '转化率')}: <strong style={{ color: 'var(--text-primary)' }}>{top1.rate}%</strong></span>
                      </>
                    ) : (
                      <>
                        <span>{t('leaderboard.interviews', '面试数')}: <strong style={{ color: 'var(--text-primary)' }}>{top1.interview}</strong></span>
                        <span>{t('leaderboard.sourced', '推人量')}: <strong style={{ color: 'var(--text-primary)' }}>{top1.totalSourced}</strong></span>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{
                    padding: '10px', background: 'rgba(139, 92, 246, 0.12)',
                    borderRadius: 'var(--radius-md)', border: '1px solid rgba(139, 92, 246, 0.35)'
                  }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>{t('leaderboard.punctualityRate', '准点率')}</span>
                    <span style={{ fontSize: '1.65rem', fontWeight: '900', color: '#c084fc' }}>
                      {top1.daysPresent === 0 ? '-' : `${top1.punctualityRate}%`}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    <span>{t('leaderboard.compliantDays', '准点天数')}: <strong style={{ color: 'var(--text-primary)' }}>{top1.compliantDays}/{top1.daysPresent} {t('leaderboard.unitDays', isEn ? 'd' : '天')}</strong></span>
                    <span>{t('leaderboard.punctualityScore', '守时指数')}: <strong style={{ color: 'var(--accent-amber)' }}>{top1.punctualityScore}</strong></span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Rank 3: Bronze */}
          {top3 && (
            <div style={{
              flex: '1 1 260px',
              maxWidth: '340px',
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
                  {top3.onboarded > 0 ? (
                    <div style={{
                      padding: '8px', background: 'rgba(59, 130, 246, 0.08)',
                      borderRadius: 'var(--radius-md)', border: '1px solid rgba(59, 130, 246, 0.2)'
                    }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>{t('leaderboard.onboarded', '成功入职')}</span>
                      <span style={{ fontSize: '1.35rem', fontWeight: '800', color: 'var(--accent-emerald)' }}>{top3.onboarded}</span>
                    </div>
                  ) : (
                    <div style={{
                      padding: '8px', background: 'rgba(245, 158, 11, 0.08)',
                      borderRadius: 'var(--radius-md)', border: '1px solid rgba(245, 158, 11, 0.2)'
                    }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>{t('leaderboard.compositeScore', '综合积分')}</span>
                      <span style={{ fontSize: '1.35rem', fontWeight: '800', color: 'var(--accent-amber)' }}>{top3.compositeScore}</span>
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    {top3.onboarded > 0 ? (
                      <>
                        <span>{t('leaderboard.compositeScore', '综合积分')}: <strong style={{ color: 'var(--text-primary)' }}>{top3.compositeScore}</strong></span>
                        <span>{t('leaderboard.conversionRate', '转化率')}: <strong style={{ color: 'var(--text-primary)' }}>{top3.rate}%</strong></span>
                      </>
                    ) : (
                      <>
                        <span>{t('leaderboard.interviews', '面试数')}: <strong style={{ color: 'var(--text-primary)' }}>{top3.interview}</strong></span>
                        <span>{t('leaderboard.sourced', '推人量')}: <strong style={{ color: 'var(--text-primary)' }}>{top3.totalSourced}</strong></span>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{
                    padding: '8px', background: 'rgba(139, 92, 246, 0.08)',
                    borderRadius: 'var(--radius-md)', border: '1px solid rgba(139, 92, 246, 0.2)'
                  }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block' }}>{t('leaderboard.punctualityRate', '准点率')}</span>
                    <span style={{ fontSize: '1.35rem', fontWeight: '800', color: '#c084fc' }}>
                      {top3.daysPresent === 0 ? '-' : `${top3.punctualityRate}%`}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    <span>{t('leaderboard.compliantDays', '准点天数')}: <strong style={{ color: 'var(--text-primary)' }}>{top3.compliantDays}/{top3.daysPresent} {t('leaderboard.unitDays', isEn ? 'd' : '天')}</strong></span>
                    <span>{t('leaderboard.punctualityScore', '守时指数')}: <strong style={{ color: 'var(--text-primary)' }}>{top3.punctualityScore}</strong></span>
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
              <span>{activeTab === 'sales' ? t('leaderboard.tabSales', '销售业绩榜') : t('leaderboard.tabAttendance', '考勤守时榜')}</span>
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
                      <th style={{ padding: '10px 12px', minWidth: '130px' }}>{t('leaderboard.conversionRate', '成单转化率')}</th>
                      <th style={{ padding: '10px 12px', minWidth: '130px', color: 'var(--accent-amber)' }}>{t('commission.pendingColumn', '🔒 保证期待解')}</th>
                      <th style={{ padding: '10px 12px', minWidth: '130px', color: '#10B981', fontWeight: '700' }}>{t('commission.unlockedColumn', '✅ 可结算佣金')}</th>
                      <th style={{ padding: '10px 12px', color: 'var(--accent-amber)', fontWeight: '700' }}>{t('leaderboard.compositeScore', '综合积分')}</th>
                    </>
                  ) : (
                    <>
                      <th style={{ padding: '10px 12px', color: '#c084fc', fontWeight: '700', minWidth: '130px' }}>{t('leaderboard.punctualityRate', '准点率')}</th>
                      <th style={{ padding: '10px 12px' }}>{t('leaderboard.compliantDaysCol', '准点 / 出勤天数')}</th>
                      <th style={{ padding: '10px 12px' }}>{t('leaderboard.avgArrival', '平均签到')}</th>
                      <th style={{ padding: '10px 12px' }}>{t('leaderboard.violations', '迟到 / 异常')}</th>
                      <th style={{ padding: '10px 12px', color: 'var(--accent-amber)', fontWeight: '700' }}>{t('leaderboard.punctualityScore', '守时指数')}</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {currentRankingList.length === 0 ? (
                  <tr>
                    <td colSpan={activeTab === 'sales' ? 10 : 7} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
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
                              background: idx === 0 
                                ? 'linear-gradient(135deg, #f59e0b, #d97706)' 
                                : idx === 1 
                                  ? 'linear-gradient(135deg, #94a3b8, #64748b)' 
                                  : idx === 2 
                                    ? 'linear-gradient(135deg, #b45309, #78350f)' 
                                    : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                              color: idx === 0 || idx === 1 ? '#000' : '#fff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '12px', fontWeight: '700',
                              border: idx === 0 ? '1px solid #f59e0b' : idx === 1 ? '1px solid #94a3b8' : idx === 2 ? '1px solid #b45309' : 'none'
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
                              <span style={{
                                fontWeight: item.onboarded > 0 ? '800' : '400',
                                fontSize: '1.05rem',
                                color: item.onboarded > 0 ? 'var(--accent-emerald)' : 'var(--text-muted)',
                                opacity: item.onboarded > 0 ? 1 : 0.6
                              }}>
                                {item.onboarded}
                              </span>
                            </td>
                            <td style={{ padding: '12px', color: item.offer > 0 ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: item.offer > 0 ? '600' : '400', opacity: item.offer > 0 ? 1 : 0.6 }}>
                              {item.offer}
                            </td>
                            <td style={{ padding: '12px', color: item.interview > 0 ? 'var(--text-secondary)' : 'var(--text-muted)', opacity: item.interview > 0 ? 1 : 0.6 }}>
                              {item.interview}
                            </td>
                            <td style={{ padding: '12px', color: item.totalSourced > 0 ? 'var(--text-secondary)' : 'var(--text-muted)', opacity: item.totalSourced > 0 ? 1 : 0.6 }}>
                              {item.totalSourced}
                            </td>
                            <td style={{ padding: '12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ flex: 1, height: '6px', background: 'var(--input-bg)', borderRadius: '3px', overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.min(100, item.rate * 2)}%`, height: '100%', background: 'var(--accent-emerald)', borderRadius: '3px' }}></div>
                                </div>
                                <span style={{ fontSize: '11px', fontWeight: '600', color: item.rate > 0 ? 'var(--text-secondary)' : 'var(--text-muted)', minWidth: '38px', opacity: item.rate > 0 ? 1 : 0.6 }}>
                                  {item.rate}%
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: '12px' }}>
                              <span style={{ fontSize: '0.84rem', color: (item.pendingCommission || 0) > 0 ? 'var(--accent-amber)' : 'var(--text-muted)', fontWeight: '600' }} title={canViewAllAmounts || item.uid === user?.uid ? '' : t('commission.privacyTooltip', '金额隐私保护，仅展示个人真实金额')}>
                                {formatLeaderboardAmount(item.pendingCommission || 0, item.uid)}
                              </span>
                            </td>
                            <td style={{ padding: '12px' }}>
                              <span style={{ fontSize: '0.88rem', color: (item.unlockedCommission || 0) > 0 ? '#10B981' : 'var(--text-muted)', fontWeight: '700' }} title={canViewAllAmounts || item.uid === user?.uid ? '' : t('commission.privacyTooltip', '金额隐私保护，仅展示个人真实金额')}>
                                {formatLeaderboardAmount(item.unlockedCommission || 0, item.uid)}
                              </span>
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
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ flex: 1, height: '6px', background: 'var(--input-bg)', borderRadius: '3px', overflow: 'hidden' }}>
                                  <div style={{
                                    width: `${item.daysPresent > 0 ? item.punctualityRate : 0}%`,
                                    height: '100%',
                                    background: item.punctualityRate >= 90 ? 'var(--accent-emerald)' : (item.punctualityRate >= 70 ? 'var(--accent-amber)' : 'var(--accent-rose)'),
                                    borderRadius: '3px'
                                  }}></div>
                                </div>
                                <span style={{
                                  fontWeight: '800',
                                  fontSize: '1.05rem',
                                  color: item.daysPresent === 0 ? 'var(--text-muted)' : (item.punctualityRate >= 90 ? 'var(--accent-emerald)' : '#c084fc'),
                                  minWidth: '46px'
                                }}>
                                  {item.daysPresent === 0 ? '-' : `${item.punctualityRate}%`}
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: '12px' }}>
                              <span style={{ fontWeight: '700', color: item.compliantDays > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                {item.compliantDays}
                              </span>
                              <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}> / {item.daysPresent} {t('leaderboard.unitDays', isEn ? 'd' : '天')}</span>
                            </td>
                            <td style={{ padding: '12px', color: item.avgArrivalStr !== '-' ? 'var(--text-secondary)' : 'var(--text-muted)', fontWeight: '500' }}>
                              {item.avgArrivalStr}
                            </td>
                            <td style={{ padding: '12px' }}>
                              {item.violationDays > 0 ? (
                                <span style={{ color: 'var(--accent-rose)', fontWeight: '700' }}>
                                  {item.violationDays} {t('leaderboard.unitViolations', isEn ? 'late' : '次')}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>0</span>
                              )}
                            </td>
                            <td style={{ padding: '12px' }}>
                              <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.12)', color: 'var(--accent-amber)', fontWeight: '700', fontSize: '12px', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
                                {item.punctualityScore}
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

      {/* Guarantee Period & Deal Commission Ledger (Phase 6) */}
      {activeTab === 'sales' && (
        <div className="bezel-shell" style={{ marginTop: 'var(--space-6)' }}>
          <div className="bezel-core" style={{ padding: 'var(--space-5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
              <div>
                <h3 style={{ fontSize: 'var(--text-md)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="ph-bold ph-shield-check" style={{ color: 'var(--accent-emerald, #10B981)' }}></i>
                  <span>{t('commission.ledgerTitle', '保证期双态风控与成单佣金台账')}</span>
                  <span className="badge" style={{ fontSize: '11px', background: 'rgba(59, 130, 246, 0.12)', color: 'var(--accent-blue)', borderColor: 'rgba(59, 130, 246, 0.3)' }}>
                    {commissionRecords.length} {t('commission.dealsCount', '单记录')}
                  </span>
                </h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  {t('commission.ledgerSubtitle', '猎头试用期 90 天保证期风控跟踪、客户回款确认解锁与离职退工冲销')}
                </p>
              </div>

              {/* Status Filter Buttons */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[
                  { key: 'ALL', label: t('common.all', '全部') },
                  { key: 'PENDING', label: t('commission.filterPending', '🔒 保证期内') },
                  { key: 'UNLOCKED', label: t('commission.filterUnlocked', '✅ 已解锁/待发') },
                  { key: 'CANCELLED', label: t('commission.filterCancelled', '🛑 退工冲销') }
                ].map(f => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setDealStatusFilter(f.key)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.76rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      border: `1px solid ${dealStatusFilter === f.key ? 'var(--accent-blue)' : 'var(--border-hairline)'}`,
                      background: dealStatusFilter === f.key ? 'rgba(59, 130, 246, 0.12)' : 'var(--bg-subtle, transparent)',
                      color: dealStatusFilter === f.key ? 'var(--accent-blue)' : 'var(--text-muted)',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Ledger Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '10px 12px' }}>{t('commission.colCandidate', '候选人 / 入职岗位')}</th>
                    <th style={{ padding: '10px 12px' }}>{t('commission.colCompany', '客户单位')}</th>
                    <th style={{ padding: '10px 12px' }}>{t('commission.colOnboardDate', '入职日期')}</th>
                    <th style={{ padding: '10px 12px' }}>{t('commission.colGuarantee', '保证期风控')}</th>
                    <th style={{ padding: '10px 12px' }}>{t('commission.colTotalPool', '佣金池总额')}</th>
                    <th style={{ padding: '10px 12px', minWidth: '180px' }}>{t('commission.colSplits', '顾问分成明细')}</th>
                    <th style={{ padding: '10px 12px' }}>{t('commission.colStatus', '账单状态')}</th>
                    {(isOwner || isManager) && (
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>{t('common.actions', '主管操作')}</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const filtered = commissionRecords.filter(rec => {
                      if (dealStatusFilter === 'ALL') return true;
                      if (dealStatusFilter === 'PENDING') return rec.status === 'PENDING';
                      if (dealStatusFilter === 'UNLOCKED') return rec.status === 'UNLOCKED' || rec.status === 'SETTLED';
                      if (dealStatusFilter === 'CANCELLED') return rec.status === 'CANCELLED';
                      return true;
                    });

                    if (filtered.length === 0) {
                      return (
                        <tr>
                          <td colSpan={(isOwner || isManager) ? 8 : 7} style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--text-muted)' }}>
                            {t('commission.noRecordsMatch', '暂无符合筛选条件的成单佣金台账')}
                          </td>
                        </tr>
                      );
                    }

                    const todayStr = new Date().toISOString().split('T')[0];

                    return filtered.map(rec => {
                      const remainingDays = getGuaranteeRemainingDays(rec.unlockDate, todayStr);
                      const isReadyToUnlock = rec.status === 'PENDING' && (remainingDays === 0 || Number(rec.guaranteeDays) <= 0);

                      return (
                        <tr key={rec.id} style={{ borderBottom: '1px solid var(--border-hairline)' }}>
                          <td style={{ padding: '12px' }}>
                            <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{rec.candidateName}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{rec.position}</div>
                          </td>

                          <td style={{ padding: '12px', color: 'var(--text-secondary)' }}>
                            {rec.companyName}
                          </td>

                          <td style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                            {rec.onboardDate || '-'}
                          </td>

                          <td style={{ padding: '12px' }}>
                            {rec.status === 'CANCELLED' ? (
                              <span style={{ fontSize: '0.74rem', color: '#EF4444' }}>🛑 {t('commission.clawedBackLabel', '已退工冲销')}</span>
                            ) : rec.status === 'UNLOCKED' || rec.status === 'SETTLED' ? (
                              <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10B981', borderColor: 'rgba(16, 185, 129, 0.3)', fontSize: '10px' }}>
                                ✅ {t('commission.unlockedReady', '保证期已达标')}
                              </span>
                            ) : isReadyToUnlock ? (
                              <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent-blue)', borderColor: 'rgba(59, 130, 246, 0.3)', fontSize: '10px' }}>
                                ⏳ {t('commission.readyToUnlockBadge', '已到期待解锁')}
                              </span>
                            ) : (
                              <div>
                                <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.12)', color: 'var(--accent-amber)', borderColor: 'rgba(245, 158, 11, 0.3)', fontSize: '10px' }}>
                                  🔒 {remainingDays} {t('common.days', '天到期')}
                                </span>
                                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                  {rec.unlockDate}
                                </div>
                              </div>
                            )}
                          </td>

                          <td style={{ padding: '12px' }}>
                            <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.88rem' }}>
                              {canViewAllAmounts ? formatCommissionCurrency(rec.billingSnapshot?.totalCommissionPool || rec.totalCommissionPool || 0, 'MYR') : 'RM ***'}
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                              {rec.billingSnapshot?.billingMode || 'DIRECT_FLAT'}
                            </div>
                          </td>

                          <td style={{ padding: '12px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              {(rec.splits || []).map((s, idx) => (
                                <div key={idx} style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                  <span style={{ color: 'var(--text-secondary)' }}>
                                    {s.displayName} ({s.role}):
                                  </span>
                                  <strong style={{ color: canViewAllAmounts || s.uid === user?.uid ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                                    {canViewAllAmounts || s.uid === user?.uid ? formatCommissionCurrency(s.amount, 'MYR') : 'RM ***'}
                                  </strong>
                                </div>
                              ))}
                            </div>
                            {rec.isOverridden && (
                              <div style={{ fontSize: '10px', color: 'var(--accent-amber)', marginTop: '3px', fontStyle: 'italic' }}>
                                ⚠️ {rec.overrideReason || t('commission.overriddenNote', '特批改派')}
                              </div>
                            )}
                          </td>

                          <td style={{ padding: '12px' }}>
                            <span
                              className="badge"
                              style={{
                                fontSize: '10px',
                                background: rec.status === 'CANCELLED' ? 'rgba(239, 68, 68, 0.12)' : (rec.status === 'UNLOCKED' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)'),
                                color: rec.status === 'CANCELLED' ? '#EF4444' : (rec.status === 'UNLOCKED' ? '#10B981' : 'var(--accent-amber)'),
                                borderColor: rec.status === 'CANCELLED' ? 'rgba(239, 68, 68, 0.3)' : (rec.status === 'UNLOCKED' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)')
                              }}
                            >
                              {rec.status === 'CANCELLED' ? t('commission.statusCancelled', '已冲销') : (rec.status === 'UNLOCKED' ? t('commission.statusUnlocked', '可结算') : t('commission.statusPending', '保证期内'))}
                            </span>
                          </td>

                          {(isOwner || isManager) && (
                            <td style={{ padding: '12px', textAlign: 'right' }}>
                              {rec.status === 'PENDING' && (
                                <div style={{ display: 'inline-flex', gap: '6px' }}>
                                  <button
                                    type="button"
                                    className="btn-secondary"
                                    disabled={isProcessingCommission}
                                    onClick={() => handleUnlockDeal(rec)}
                                    style={{ fontSize: '11px', padding: '3px 8px', color: '#10B981', borderColor: 'rgba(16, 185, 129, 0.4)' }}
                                    title={t('commission.confirmUnlockTitle', '确认客户已回款并解锁佣金')}
                                  >
                                    <i className="ph-bold ph-lock-key-open"></i> {t('commission.unlockAction', '解锁')}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-secondary"
                                    disabled={isProcessingCommission}
                                    onClick={() => setClawbackModalDeal(rec)}
                                    style={{ fontSize: '11px', padding: '3px 8px', color: '#EF4444', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                                    title={t('commission.clawbackActionTitle', '候选人试用期离职，标记退工冲销')}
                                  >
                                    <i className="ph-bold ph-prohibit"></i> {t('commission.clawbackAction', '退工')}
                                  </button>
                                </div>
                              )}
                              {rec.status === 'UNLOCKED' && (
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                  {t('commission.readyForExport', '待月报导出')}
                                </span>
                              )}
                              {rec.status === 'CANCELLED' && (
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                  {rec.cancellation?.reason ? `${rec.cancellation.reason.slice(0, 16)}...` : '-'}
                                </span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Clawback / Deal Cancellation Modal */}
      {clawbackModalDeal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '16px'
          }}
          onClick={() => setClawbackModalDeal(null)}
        >
          <div
            className="bezel-shell modal-bezel"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '480px', width: '100%', animation: 'modalEnter 0.25s ease-out' }}
          >
            <div className="bezel-core modal-core" style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EF4444', fontSize: '1.25rem' }}>
                  <i className="ph-bold ph-warning-octagon"></i>
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)', fontWeight: '700' }}>
                    {t('commission.clawbackModalTitle', '确认标记退工冲销 (Clawback)')}
                  </h3>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    {clawbackModalDeal.candidateName} ➔ {clawbackModalDeal.companyName}
                  </div>
                </div>
              </div>

              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                {t('commission.clawbackWarning', '候选人在保证期试用期内离职或退工。冲销后，该单所有参与顾问的待解锁提成将被自动清零，杜绝坏账错发。')}
              </p>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: '600' }}>
                  {t('commission.clawbackReasonLabel', '离职 / 退单具体原因 (必填审计)')} *
                </label>
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder="例如：候选人入职第 18 天因个人家庭原因主动离职 / 未通过客户试用期技能考核"
                  value={clawbackReason}
                  onChange={(e) => setClawbackReason(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: 'var(--space-2)' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={isProcessingCommission}
                  onClick={() => setClawbackModalDeal(null)}
                >
                  {t('common.cancel', '取消')}
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={isProcessingCommission || !clawbackReason.trim()}
                  onClick={handleConfirmClawback}
                  style={{ background: '#EF4444', borderColor: '#DC2626' }}
                >
                  {isProcessingCommission ? (
                    <i className="ph-bold ph-spinner ph-spin"></i>
                  ) : (
                    <i className="ph-bold ph-trash"></i>
                  )}
                  <span>{t('commission.confirmClawbackBtn', '确认冲销佣金')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
