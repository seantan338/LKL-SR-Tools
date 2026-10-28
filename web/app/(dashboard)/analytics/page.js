'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/auth-context';
import { useNotifications } from '../../../lib/notification-context';
import { FirestoreStore } from '../../../lib/firestore-store';
import { SystemLogger } from '../../../lib/logger';
import { Utils } from '../../../lib/utils';
import { db } from '../../../lib/firebase';
import { collection, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import Chart from 'chart.js/auto';
import { resolveCanonicalPic } from '../../../lib/identity.mjs';
import { useI18n } from '../../../lib/i18n-context';
import { CascadeShiftEngine, DEFAULT_SHIFT_CONFIG } from '../../../lib/cascade-shift-engine';
import { ExcelExporter, isAccountExcluded } from '../../../lib/excel-exporter';

const getApiUrl = (path) => {
  return path;
};

export default function AnalyticsPage() {
  const router = useRouter();
  const { teamId, role, isOwner, isManager, user, userProfile, isHqTeam } = useAuth();
  const canWfh = userProfile?.allowWfhPunch !== undefined ? Boolean(userProfile.allowWfhPunch) : Boolean(isOwner || isManager);
  const canManageAttendance = Boolean(isOwner || isManager);
  const { candidates, candidatesLoading } = useNotifications();
  const { t, lang } = useI18n();
  const isEn = lang === 'en';

  // Active Tab: 'performance' (业绩看板) or 'attendance' (打卡记录)
  const [selectedTab, setActiveTab] = useState('performance');
  // 分部 / 合作方团队无需打卡：非本部团队固定显示业绩看板
  const activeTab = isHqTeam ? selectedTab : 'performance';

  // Orders and Logs State
  const [orders, setOrders] = useState([]);
  const [logs, setLogs] = useState([]);
  const [manualCheckins, setManualCheckins] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  // Search & Filter State
  const [selectedPic, setSelectedPic] = useState('all');
  const [dateFilter, setDateFilter] = useState('today'); // 'today' | '7days' | '30days' | 'all'
  const [searchQuery, setSearchQuery] = useState('');
  const [isClockingIn, setIsClockingIn] = useState(false);
  const [clockInStatusMsg, setClockInStatusMsg] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [exportMonth, setExportMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const exportMonthOptions = useMemo(() => {
    const list = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      list.push(ym);
    }
    return list;
  }, []);

  // Attendance Rules & Settings Modal State
  const [attendanceRules, setAttendanceRules] = useState({
    enabled: true,
    allowWfh: true,
    enableLunchPunch: false,
    maxDistanceMeters: 100,
    maxDriftCompensation: 40,
    officeLocations: [
      { name: t('analytics.defaultOfficeName', '公司总部'), latitude: 1.440472, longitude: 103.617917, radiusMeters: 100 }
    ],
    officeWifi: { allowedIps: ['127.0.0.1'], ddnsDomain: '' },
    shiftConfig: DEFAULT_SHIFT_CONFIG,
    shiftOverrides: {},
    excludedAccounts: [],
    hideZeroAttendanceInReport: false
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingRules, setEditingRules] = useState(null);
  const [newIpInput, setNewIpInput] = useState('');
  const [pasteCoordsInput, setPasteCoordsInput] = useState('');
  const [coordsParseMsg, setCoordsParseMsg] = useState('');
  const [coordsParseSuccess, setCoordsParseSuccess] = useState(false);
  const [isDetectingIp, setIsDetectingIp] = useState(false);
  const [isDetectingGps, setIsDetectingGps] = useState(false);
  const [isSavingRules, setIsSavingRules] = useState(false);

  // Shift Override Modal State (主管人工改派单日核定班次)
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideTargetRecord, setOverrideTargetRecord] = useState(null);
  const [selectedOverrideShiftId, setSelectedOverrideShiftId] = useState('');
  const [overrideReasonInput, setOverrideReasonInput] = useState('');
  const [isSavingOverride, setIsSavingOverride] = useState(false);
  const [earlyClockOutModal, setEarlyClockOutModal] = useState(null);

  const chartRef = useRef(null);
  const chartInstanceRef = useRef(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // 1. Subscribe to Job Orders
  useEffect(() => {
    if (!teamId || !user?.uid) return;
    const unsubscribe = FirestoreStore.subscribeToJobOrders(teamId, role, user.uid, (data) => {
      setOrders(data || []);
    });
    return () => unsubscribe();
  }, [teamId, role, user]);

  // 2. Subscribe to System Audit Logs (Used to synthesize daily PIC activity clock-in times)
  useEffect(() => {
    if (!teamId) return;

    const q = query(
      collection(db, 'teams', teamId, 'logs'),
      orderBy('timestamp', 'desc'),
      limit(500)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logsData = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      }));
      setLogs(logsData);
      setLoadingLogs(false);
    }, (err) => {
      console.warn('Error loading logs for attendance:', err);
      setLoadingLogs(false);
    });

    return () => unsubscribe();
  }, [teamId]);

  // 3. Subscribe to dedicated Attendance / Checkin collection
  useEffect(() => {
    if (!teamId) return;

    const q = query(
      collection(db, 'teams', teamId, 'attendance'),
      orderBy('timestamp', 'desc'),
      limit(300)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      }));
      setManualCheckins(data);
    }, () => {});

    return () => unsubscribe();
  }, [teamId]);

  // 4. Subscribe to Attendance Rules & Geofence config
  useEffect(() => {
    if (!teamId) return;
    const unsubscribe = FirestoreStore.subscribeToAttendanceRules(teamId, (rules) => {
      if (rules && typeof rules === 'object') {
        setAttendanceRules(prev => ({
          ...prev,
          enabled: rules.enabled ?? true,
          allowWfh: rules.allowWfh ?? true,
          enableLunchPunch: rules.enableLunchPunch ?? false,
          maxDistanceMeters: rules.maxDistanceMeters || 100,
          maxDriftCompensation: rules.maxDriftCompensation || 40,
          officeLocations: rules.officeLocations && rules.officeLocations.length > 0
            ? rules.officeLocations
            : [{ name: t('analytics.defaultOfficeName', '公司总部'), latitude: 1.440472, longitude: 103.617917, radiusMeters: 100 }],
          officeWifi: rules.officeWifi || { allowedIps: [], ddnsDomain: '' },
          shiftConfig: rules.shiftConfig || DEFAULT_SHIFT_CONFIG,
          shiftOverrides: rules.shiftOverrides || {},
          excludedAccounts: Array.isArray(rules.excludedAccounts) ? rules.excludedAccounts : [],
          hideZeroAttendanceInReport: Boolean(rules.hideZeroAttendanceInReport)
        }));
      }
    });
    return () => unsubscribe();
  }, [teamId]);

  // 5. Subscribe to Team Members for Canonical PIC Master Resolution
  useEffect(() => {
    if (!teamId) return;
    const usersRef = collection(db, 'users');
    const unsub = onSnapshot(usersRef, (snapshot) => {
      const mems = snapshot.docs.map(doc => ({
        id: doc.id,
        uid: doc.id,
        ...doc.data(),
        name: doc.data().displayName || doc.data().name || (doc.data().email ? doc.data().email.split('@')[0] : '')
      }));
      setTeamMembers(mems);
    }, (err) => console.warn('Error loading team members in analytics:', err));
    return () => unsub();
  }, [teamId]);

  // -------------------------------------------------------------
  // Data Aggregation: PIC Performance (业绩指标统计 - 智能归一化合并)
  // -------------------------------------------------------------
  const picPerformanceData = useMemo(() => {
    const map = {};

    // Helper to initialize PIC record with Canonical resolution
    const getOrCreatePic = (name, uid = '') => {
      const canonical = resolveCanonicalPic(name, uid, teamMembers);
      const key = canonical.key;

      if (!map[key]) {
        map[key] = {
          key: key,
          name: canonical.displayName,
          uid: canonical.uid,
          photoURL: canonical.photoURL,
          isExternal: canonical.isExternal || !canonical.uid,
          totalSourced: 0,
          screening: 0,
          phone: 0,
          interview: 0,
          offer: 0,
          preOnboarding: 0,
          onboarded: 0, // 核心业绩：成功入职
          rejected: 0,
          activeOrders: 0,
        };
      }
      if (canonical.uid && !map[key].uid) {
        map[key].uid = canonical.uid;
      }
      if (canonical.photoURL && !map[key].photoURL) {
        map[key].photoURL = canonical.photoURL;
      }
      return map[key];
    };

    // Aggregate from Candidates
    candidates.forEach(c => {
      const pic = getOrCreatePic(c.picName, c.assignedTo);
      pic.totalSourced += 1;

      if (c.status === 'rejected') {
        pic.rejected += 1;
      } else {
        const stage = c.stage || 'screening';
        if (stage === 'screening') pic.screening += 1;
        else if (stage === 'phone') pic.phone += 1;
        else if (stage === 'interview') pic.interview += 1;
        else if (stage === 'offer') pic.offer += 1;
        else if (stage === 'pre_onboarding') pic.preOnboarding += 1;
        else if (stage === 'onboarding' || stage === 'post_onboarding') pic.onboarded += 1;
      }
    });

    // Aggregate from Job Orders
    orders.forEach(o => {
      const pic = getOrCreatePic(o.picName, o.assignedTo);
      if (o.status !== 'filled' && o.status !== 'paused') {
        pic.activeOrders += 1;
      }
    });

    // Calculate rates and convert to array
    const result = Object.values(map).map(p => {
      // Conversion rate = (onboarded + offer) / totalSourced
      const effectivePlaced = p.onboarded + p.preOnboarding;
      const rate = p.totalSourced > 0 ? ((effectivePlaced / p.totalSourced) * 100).toFixed(1) : 0;
      
      // Performance score: (onboarded * 100) + (offer * 40) + (interview * 15) + (totalSourced * 2)
      const score = (p.onboarded * 100) + (p.offer * 40) + (p.interview * 15) + (p.totalSourced * 2);

      return {
        ...p,
        rate: Number(rate),
        score
      };
    });

    // Sort by Placed Descending, then TotalSourced Descending
    return result.sort((a, b) => b.onboarded - a.onboarded || b.score - a.score || b.totalSourced - a.totalSourced);
  }, [candidates, orders, teamMembers]);

  // All distinct PIC names for filter dropdown
  const allPicNames = useMemo(() => {
    return picPerformanceData.map(p => p.name);
  }, [picPerformanceData]);

  // -------------------------------------------------------------
  // Data Aggregation: PIC Attendance & Clock-In (打卡与考勤记录)
  // -------------------------------------------------------------
  const picAttendanceRecords = useMemo(() => {
    // Group events by: `${date}_${picName}`
    const recordMap = {};

    const addEvent = (picName, userEmail, timestamp, actionType = 'ACTIVITY', note = '', meta = {}) => {
      if (!timestamp) return;
      const dateObj = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      if (isNaN(dateObj.getTime())) return;

      const dateStr = dateObj.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
      const canonical = resolveCanonicalPic(picName, meta.uid || '', teamMembers);
      const cleanPic = canonical.displayName || (userEmail ? userEmail.split('@')[0] : t('analytics.defaultPicName', '顾问'));

      // 免考勤/排除名单过滤
      if (isAccountExcluded({ uid: canonical.uid || meta.uid, email: userEmail || canonical.email, name: cleanPic }, attendanceRules?.excludedAccounts)) {
        return;
      }

      const key = `${dateStr}__${cleanPic}`;

      if (!recordMap[key]) {
        recordMap[key] = {
          date: dateStr,
          dateObj: dateObj,
          picName: cleanPic,
          userEmail: userEmail || '',
          firstActionTime: dateObj,
          lastActionTime: dateObj,
          actionCount: 0,
          manualClockIn: null,
          manualLunchOut: null,
          manualLunchIn: null,
          manualClockOut: null,
          verifyMethod: meta.verifyMethod || null,
          verifySnapshot: meta.verifySnapshot || null,
          allClockIns: [],
          allClockOuts: [],
          allLunchOuts: [],
          allLunchIns: [],
          allPunches: [],
          actions: []
        };
      }

      const rec = recordMap[key];

      // 双写记录去重：60秒内的同类型记录视为同一打卡事件
      const isDuplicate = rec.allPunches.some(
        p => p.actionType === actionType && Math.abs(p.time.getTime() - dateObj.getTime()) < 60 * 1000
      );
      if (isDuplicate) return;

      rec.actionCount += 1;
      if (dateObj < rec.firstActionTime) rec.firstActionTime = dateObj;
      if (dateObj > rec.lastActionTime) rec.lastActionTime = dateObj;

      const timeStr = dateObj.toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const punchItem = {
        actionType,
        time: dateObj,
        timeStr,
        verifyMethod: meta.verifyMethod || null,
        verifySnapshot: meta.verifySnapshot || null,
        note
      };
      rec.allPunches.push(punchItem);

      if (actionType === 'CLOCK_IN' || actionType === 'CHECK_IN') {
        rec.allClockIns.push(punchItem);
        // 上班签到始终取当天最早的一次打卡
        if (!rec.manualClockIn || dateObj < rec.manualClockIn) {
          rec.manualClockIn = dateObj;
          if (meta.verifyMethod) {
            rec.verifyMethod = meta.verifyMethod;
            rec.verifySnapshot = meta.verifySnapshot;
          }
        }
      } else if (actionType === 'LUNCH_OUT') {
        rec.allLunchOuts.push(punchItem);
        if (!rec.manualLunchOut || dateObj < rec.manualLunchOut) {
          rec.manualLunchOut = dateObj;
        }
      } else if (actionType === 'LUNCH_IN') {
        rec.allLunchIns.push(punchItem);
        if (!rec.manualLunchIn || dateObj > rec.manualLunchIn) {
          rec.manualLunchIn = dateObj;
        }
      } else if (actionType === 'CLOCK_OUT' || actionType === 'CHECK_OUT') {
        rec.allClockOuts.push(punchItem);
        // 下班签退始终取当天最晚的一次打卡（支持多次打卡自动覆盖）
        if (!rec.manualClockOut || dateObj > rec.manualClockOut) {
          rec.manualClockOut = dateObj;
          if (meta.verifyMethod) {
            rec.verifyMethod = meta.verifyMethod;
            rec.verifySnapshot = meta.verifySnapshot;
          }
        }
      }

      rec.actions.push({ actionType, note, time: dateObj });
    };

    // 1. Process explicit manual check-ins from dedicated collection
    const VALID_PUNCH_ACTIONS = ['CLOCK_IN', 'CLOCK_OUT', 'LUNCH_OUT', 'LUNCH_IN', 'CHECK_IN', 'CHECK_OUT'];
    manualCheckins.forEach(chk => {
      const punchAction = chk.type || chk.action || 'CLOCK_IN';
      if (!VALID_PUNCH_ACTIONS.includes(punchAction)) return;
      addEvent(
        chk.picName || chk.userName,
        chk.userEmail,
        chk.timestamp,
        punchAction,
        chk.note || t('analytics.defaultProgressNote', '员工考勤打卡'),
        {
          verifyMethod: chk.verifyMethod,
          verifySnapshot: chk.verifySnapshot,
          uid: chk.userId || chk.uid
        }
      );
    });

    // 2. Process authentic punch records from logs collection (strictly targetType === 'ATTENDANCE')
    // All system activities (candidate operations, stage movements, audit records) are strictly excluded!
    logs.forEach(l => {
      if (l.isDeleted) return;
      const punchAction = l.action || l.type;
      if (l.targetType !== 'ATTENDANCE' || !VALID_PUNCH_ACTIONS.includes(punchAction)) {
        return; // Exclude non-attendance system activities
      }

      const name = l.user?.displayName || (l.user?.email ? l.user.email.split('@')[0] : t('analytics.defaultEmployeeName', '内部员工'));
      addEvent(
        name,
        l.user?.email || l.userEmail,
        l.timestamp,
        punchAction,
        l.details || l.note || t('analytics.defaultProgressNote', '员工考勤打卡'),
        {
          verifyMethod: l.verifyMethod,
          verifySnapshot: l.verifySnapshot,
          uid: l.userId || l.user?.uid
        }
      );
    });

    // Format & finalize records
    const todayStr = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
    const nowTime = new Date().getTime();

    const result = Object.values(recordMap).map(r => {
      const isToday = r.date === todayStr;

      // 排序保留的所有打卡流水（升序）
      r.allClockIns.sort((a, b) => a.time.getTime() - b.time.getTime());
      r.allClockOuts.sort((a, b) => a.time.getTime() - b.time.getTime());
      r.allPunches.sort((a, b) => a.time.getTime() - b.time.getTime());
      
      // 组装当日实际打卡事件流供 CascadeShiftEngine 判定
      const dayEvents = [];
      if (r.manualClockIn) dayEvents.push({ type: 'CLOCK_IN', timestamp: r.manualClockIn });
      if (r.manualLunchOut) dayEvents.push({ type: 'LUNCH_OUT', timestamp: r.manualLunchOut });
      if (r.manualLunchIn) dayEvents.push({ type: 'LUNCH_IN', timestamp: r.manualLunchIn });
      if (r.manualClockOut) dayEvents.push({ type: 'CLOCK_OUT', timestamp: r.manualClockOut });

      // 检查该人员在当日是否存在主管人工改派班次
      const overrideKey = `${r.date}__${r.picName}`;
      const overrideKeyEmail = r.userEmail ? `${r.date}__${r.userEmail}` : null;
      const overrideData = (attendanceRules?.shiftOverrides && (attendanceRules.shiftOverrides[overrideKey] || (overrideKeyEmail && attendanceRules.shiftOverrides[overrideKeyEmail]))) || null;

      const shiftAnalysis = CascadeShiftEngine.resolveDailyShift(
        dayEvents,
        attendanceRules.shiftConfig,
        { locale: isEn ? 'en' : 'zh', overrideShift: overrideData, isToday }
      );

      // 工时跨度：在明确签退之前严格显示为空 (null)；明确签退后才计算有效工时
      let durationHours = null;
      if (r.manualClockOut) {
        if (shiftAnalysis.durationHours !== null) {
          durationHours = shiftAnalysis.durationHours;
        } else if (r.manualClockIn) {
          const diffMs = r.manualClockOut.getTime() - r.manualClockIn.getTime();
          durationHours = Number((diffMs / (1000 * 60 * 60)).toFixed(1));
        }
      }

      // Determine status
      let status = 'completed';
      let statusLabel = shiftAnalysis.complianceLabel || t('analytics.statusFullShift', '正常完成');
      let statusColor = shiftAnalysis.isViolation ? '#ef4444' : shiftAnalysis.isMissingPunch ? 'var(--accent-amber)' : 'var(--accent-emerald)';

      if (isToday) {
        // 当天进行中（未到午夜 12 点）：未签退不算缺卡
        if (r.manualLunchOut && !r.manualLunchIn) {
          status = 'lunch';
          statusLabel = t('analytics.statusOnLunch', '午休中 (离岗)');
          statusColor = 'var(--accent-amber)';
        } else if (r.manualClockOut) {
          // 今日已签退，显示最终合规判定
          statusLabel = shiftAnalysis.complianceLabel;
          statusColor = shiftAnalysis.isViolation ? '#ef4444' : 'var(--accent-emerald)';
        } else {
          // 今日在岗中，待下班打卡，绝不算作缺卡
          status = 'online';
          statusLabel = r.manualLunchIn
            ? `${t('analytics.statusAfternoonDuty', '工作中 (下午)')} · ${shiftAnalysis.shift?.name ? shiftAnalysis.shift.name.split(' ')[0] : t('analytics.dutyFallback', '在岗')}`
            : `${t('analytics.statusOnDuty', '工作中 (在岗)')}${shiftAnalysis.shift?.endStr ? t('analytics.statusCutoffSuffix', { time: shiftAnalysis.shift.endStr }, ` · 底线 ${shiftAnalysis.shift.endStr}`) : ''}`;
          statusColor = 'var(--accent-blue)';
        }
      } else {
        // 历史日期（已过凌晨 12 点）：若仍未签退，才正式判定为未签退 (缺卡)
        if (!r.manualClockOut) {
          status = 'missed_out';
          statusLabel = shiftAnalysis.complianceLabel || t('analytics.statusMissedOut', '未签退 (缺卡)');
          statusColor = '#ef4444';
        }
      }

      return {
        ...r,
        overrideKey,
        overrideData,
        isOverridden: Boolean(overrideData),
        durationHours,
        shiftAnalysis,
        status,
        statusLabel,
        statusColor,
        isToday
      };
    });

    // Sort by date desc, then by first action time desc
    return result.sort((a, b) => b.firstActionTime.getTime() - a.firstActionTime.getTime());
  }, [logs, manualCheckins, teamMembers, attendanceRules, lang, t]);

  // Filtered attendance list
  const filteredAttendance = useMemo(() => {
    const todayStr = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
    const now = new Date();

    return picAttendanceRecords.filter(item => {
      // PIC Filter
      if (selectedPic !== 'all' && item.picName !== selectedPic) return false;

      // Text Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (!item.picName.toLowerCase().includes(q) && !item.userEmail.toLowerCase().includes(q)) {
          return false;
        }
      }

      // Date Range Filter
      if (dateFilter === 'today') {
        return item.date === todayStr;
      }
      if (dateFilter === '7days') {
        const daysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return item.firstActionTime >= daysAgo;
      }
      if (dateFilter === '30days') {
        const daysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return item.firstActionTime >= daysAgo;
      }
      return true;
    });
  }, [picAttendanceRecords, selectedPic, dateFilter, searchQuery]);

  // Group filtered attendance records by date (descending)
  const groupedAttendanceByDate = useMemo(() => {
    const groups = {};
    filteredAttendance.forEach(item => {
      const d = item.date;
      if (!groups[d]) {
        groups[d] = {
          date: d,
          isToday: item.isToday,
          items: []
        };
      }
      groups[d].items.push(item);
    });

    return Object.values(groups).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredAttendance]);

  const getWeekdayLabel = (dateStr) => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return d.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'short' });
      }
    } catch {
      // ignore
    }
    return '';
  };

  // -------------------------------------------------------------
  // Render Chart: PIC 推送 vs 入职对比 (Chart.js)
  // -------------------------------------------------------------
  useEffect(() => {
    if (activeTab !== 'performance' || !chartRef.current) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
      chartInstanceRef.current = null;
    }

    const topPics = picPerformanceData.slice(0, 8);
    if (topPics.length === 0) return;

    const labels = topPics.map(p => p.name);
    const sourcedData = topPics.map(p => p.totalSourced);
    const onboardedData = topPics.map(p => p.onboarded);
    const interviewData = topPics.map(p => p.interview);

    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#fff';
    const gridColor = 'rgba(255,255,255,0.06)';

    chartInstanceRef.current = new Chart(chartRef.current, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: t('analytics.chartDatasetSourced', '推送候选人'),
            data: sourcedData,
            backgroundColor: 'rgba(59, 130, 246, 0.7)',
            borderColor: '#3b82f6',
            borderWidth: 1,
            borderRadius: 6
          },
          {
            label: t('analytics.chartDatasetInterview', '面试考核'),
            data: interviewData,
            backgroundColor: 'rgba(168, 85, 247, 0.7)',
            borderColor: '#a855f7',
            borderWidth: 1,
            borderRadius: 6
          },
          {
            label: t('analytics.chartDatasetOnboarded', '成功入职 (业绩成单)'),
            data: onboardedData,
            backgroundColor: 'rgba(16, 185, 129, 0.85)',
            borderColor: '#10b981',
            borderWidth: 1,
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: textColor, font: { size: 12, weight: '500' } }
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            padding: 10
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: textColor, font: { size: 11 } }
          },
          y: {
            grid: { color: gridColor },
            ticks: { color: textColor, precision: 0 }
          }
        }
      }
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [picPerformanceData, activeTab, isOwner, lang, t]);

  // -------------------------------------------------------------
  // Manual Clock-in Action (一键打卡登记)
  // -------------------------------------------------------------
  // Progressive Zero-Trust Attendance Clock-in (2-Stage Verification)
  // -------------------------------------------------------------
  const getPunchTypeLabel = (pType) => {
    switch (pType) {
      case 'CLOCK_IN': return t('analytics.clockInBtn', '上班签到');
      case 'LUNCH_OUT': return t('analytics.lunchOutBtn', '午休离开');
      case 'LUNCH_IN': return t('analytics.lunchInBtn', '午休返回');
      case 'CLOCK_OUT': return t('analytics.clockOutBtn', '下班签退');
      default: return pType;
    }
  };

  const executeAttendanceCheckin = async (type = 'CLOCK_IN', workMode = 'OFFICE') => {
    if (!teamId || !user) return;
    if (workMode === 'WFH' && !canWfh) {
      showToast(t('attendanceModal.errWfhUnauthorized', '您未获得居家办公 (WFH) 打卡权限，请在办公室打卡或联系管理员'), 'error');
      return;
    }
    setIsClockingIn(true);
    setClockInStatusMsg(workMode === 'WFH' ? t('analytics.statusConnectingWfh', '正在提交居家办公 (WFH) 安全打卡...') : t('analytics.statusConnecting', '正在连接安全核验网关，校验 Wi-Fi 出口 IP...'));

    const picName = userProfile?.displayName || userProfile?.name || user?.email?.split('@')[0] || t('analytics.defaultPicName', '顾问');

    try {
      // Stage 1: Check Wi-Fi public IP / Stage 0 WFH check (pass coords: null)
      let stage1Res;
      try {
        const resp = await fetch(getApiUrl('/api/attendance/verify'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            teamId,
            userId: user.uid,
            userRole: userProfile?.role,
            userWfhAllowed: canWfh,
            type,
            workMode,
            rules: attendanceRules,
            coords: null
          })
        });
        stage1Res = await resp.json();
      } catch (netErr) {
        throw new Error(t('analytics.netErrGateway', '无法连接考勤核验微服务 (端口 8000)，请确保 Python 后端已启动'));
      }

      const r1 = stage1Res?.result;

      // Case A: Rule disabled OR WFH passed OR Stage 1 Wi-Fi IP verified!
      if (r1?.passed) {
        const isWfh = r1.verify_method === 'WFH';
        const isWifi = r1.verify_method === 'WIFI_IP';
        const methodName = isWfh
          ? t('analytics.methodWfh', '居家办公 (WFH)')
          : isWifi
            ? t('analytics.methodWifi', '公司 Wi-Fi')
            : t('analytics.methodRuleDisabled', '规则未限制');
        const verifySnapshot = {
          method: r1.verify_method,
          methodName,
          ip: r1.client_ip || r1.hit_ip || '',
          timestamp: new Date().toISOString()
        };

        try {
          await FirestoreStore.addAttendanceRecord(teamId, {
            teamId,
            userId: user.uid,
            userEmail: user.email || '',
            picName,
            type,
            verifyMethod: r1.verify_method,
            verifySnapshot,
            note: `[${verifySnapshot.methodName}] ${getPunchTypeLabel(type)}`
          });
        } catch (storeErr) {
          console.warn("Attendance persistence notice:", storeErr?.message || storeErr);
        }

        showToast(isWfh
          ? t('analytics.successWfhToast', '🏠 居家办公 (WFH) 打卡成功！')
          : isWifi
            ? (t('analytics.successWifiToast', '打卡成功！已连入公司 Wi-Fi（出口 IP: {ip}）')).replace('{ip}', r1.client_ip || '')
            : t('analytics.checkinSuccess', '打卡成功！'));
        return;
      }

      // Case B: Wi-Fi not matched -> enter Stage 2 (100m GPS Geofence)
      if (r1?.code === 'NEED_GPS') {
        setClockInStatusMsg(t('analytics.statusCheckingGps', '未连接公司 Wi-Fi，正在调用高精度 GPS 验证 100 米地理围栏...'));

        if (typeof window === 'undefined' || !navigator.geolocation) {
          throw new Error(t('analytics.errNoGeo', '当前浏览器不支持地理定位，且未连接公司 Wi-Fi，无法完成考勤打卡。'));
        }

        const getPos = () => new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            resolve,
            reject,
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
          );
        });

        let pos;
        try {
          pos = await getPos();
        } catch (geoErr) {
          let reason = t('analytics.geoErrDefault', '定位授权或信号异常');
          if (geoErr.code === 1) reason = t('analytics.geoErrDenied', '您拒绝了浏览器地理定位授权。请在浏览器地址栏允许定位权限，或连接公司 Wi-Fi 直接打卡。');
          else if (geoErr.code === 2) reason = t('analytics.geoErrFailed', '位置获取失败，请确保设备开启了高精度定位服务。');
          else if (geoErr.code === 3) reason = t('analytics.geoErrTimeout', 'GPS 定位获取超时，请移至窗边或连接公司 Wi-Fi 重试。');
          throw new Error(reason);
        }

        setClockInStatusMsg((t('analytics.statusGpsCaptured', '已捕获 GPS (精度 ±{acc}m)，正在提交后端进行 100 米测距与室内漂移补偿判定...')).replace('{acc}', Math.round(pos.coords.accuracy)));

        const resp2 = await fetch(getApiUrl('/api/attendance/verify'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            teamId,
            type,
            rules: attendanceRules,
            coords: {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy
            }
          })
        });
        const stage2Res = await resp2.json();
        const r2 = stage2Res?.result;

        if (r2?.passed) {
          const verifySnapshot = {
            method: 'GPS_GEOFENCE',
            methodName: t('analytics.methodGeofence', '100m地理围栏'),
            officeName: r2.office_name,
            effectiveDistance: r2.effective_distance,
            actualDistance: r2.actual_distance,
            accuracy: r2.accuracy,
            compensation: r2.compensation,
            timestamp: new Date().toISOString()
          };

          try {
            await FirestoreStore.addAttendanceRecord(teamId, {
              teamId,
              userId: user.uid,
              userEmail: user.email || '',
              picName,
              type,
              verifyMethod: 'GPS_GEOFENCE',
              verifySnapshot,
              note: `[100m / ${Math.round(r2.effective_distance)}m] ${getPunchTypeLabel(type)}`
            });
          } catch (storeErr) {
            console.warn("Attendance persistence notice:", storeErr?.message || storeErr);
          }

          showToast((t('analytics.successGpsToast', '打卡成功！已通过 100 米地理围栏核验（距公司约 {dist} 米）')).replace('{dist}', Math.round(r2.effective_distance)));
          return;
        } else {
          throw new Error(r2?.message || t('analytics.geofenceExceeded', '超出公司 100 米考勤有效范围'));
        }
      }

      throw new Error(r1?.message || t('analytics.checkinFailedGeneral', '考勤核验未通过'));

    } catch (err) {
      console.error('Attendance error:', err);
      const errMsg = err?.message || t('analytics.checkinFailedGeneral', '考勤核验未通过');
      showToast((t('analytics.failedCheckin', '打卡未通过：{msg}')).replace('{msg}', errMsg));
    } finally {
      setIsClockingIn(false);
      setClockInStatusMsg('');
    }
  };

  // Top Bar Guarded Clock-Out Handler (提前签退防呆拦截确认)
  const handleTopClockOut = (force = false) => {
    if (force) {
      setEarlyClockOutModal(null);
      executeAttendanceCheckin('CLOCK_OUT');
      return;
    }

    const canonical = resolveCanonicalPic(userProfile?.displayName || userProfile?.name || user?.email?.split('@')[0], user?.uid, teamMembers);
    const myTodayRecord = picAttendanceRecords.find(r => r.isToday && (r.userEmail === user?.email || r.picName === canonical.displayName));

    if (myTodayRecord?.manualClockIn) {
      const shift = myTodayRecord.shiftAnalysis?.shift || CascadeShiftEngine.matchShift(myTodayRecord.manualClockIn, attendanceRules?.shiftConfig, { locale: isEn ? 'en' : 'zh' });
      const now = new Date();
      const nowMin = CascadeShiftEngine.getDateMinutesOfDay(now);

      if (shift && typeof shift.endMinutes === 'number' && nowMin < shift.endMinutes) {
        const diffSec = Math.round((shift.endMinutes - nowMin) * 60);
        const desc = diffSec >= 60
          ? t('attendanceModal.timeMinSec', { m: Math.floor(diffSec / 60), s: diffSec % 60 }, `${Math.floor(diffSec / 60)}分${diffSec % 60}秒`)
          : t('attendanceModal.timeSec', { s: diffSec }, `${diffSec}秒`);

        setEarlyClockOutModal({
          shift,
          diffSec,
          desc
        });
        return;
      }
    }

    executeAttendanceCheckin('CLOCK_OUT');
  };

  // 1-Click Detect and Append Current IP
  const handleDetectCurrentIp = async () => {
    setIsDetectingIp(true);
    try {
      const resp = await fetch(getApiUrl('/api/attendance/current-ip'));
      const data = await resp.json();
      if (data.status === 'success' && data.client_ip) {
        const ip = data.client_ip;
        const currentIps = editingRules?.officeWifi?.allowedIps || [];
        if (currentIps.includes(ip)) {
          showToast((t('analytics.currentIpExists', '当前出口 IP ({ip}) 已存在于白名单中')).replace('{ip}', ip));
        } else {
          setEditingRules({
            ...editingRules,
            officeWifi: {
              ...editingRules.officeWifi,
              allowedIps: [...currentIps, ip]
            }
          });
          showToast((t('analytics.addedCurrentIp', '成功添加当前出口 IP: {ip}')).replace('{ip}', ip));
        }
      } else {
        alert(t('analytics.detectIpFailed', '无法检测公网出口 IP: ') + (data.message || 'Error'));
      }
    } catch (err) {
      alert(t('analytics.detectIpNetFailed', '获取当前 IP 失败，请确认后端已运行: ') + err.message);
    } finally {
      setIsDetectingIp(false);
    }
  };

  // Smart Parse Google Maps Coordinates (DMS like 1°26'25.7"N 103°37'04.5"E or Decimal pair 1.440472, 103.617917)
  const parseGoogleMapsCoords = (str) => {
    if (!str) return null;
    const s = str.trim();
    const dmsFullRegex = /(\d+)[°\s]+(\d+)['\s]+([\d.]+)"?\s*([NSns])[\s,]+(\d+)[°\s]+(\d+)['\s]+([\d.]+)"?\s*([EWew])/i;
    const m = s.match(dmsFullRegex);
    if (m) {
      let lat = parseInt(m[1], 10) + parseInt(m[2], 10) / 60 + parseFloat(m[3]) / 3600;
      if (m[4].toUpperCase() === 'S') lat = -lat;
      let lng = parseInt(m[5], 10) + parseInt(m[6], 10) / 60 + parseFloat(m[7]) / 3600;
      if (m[8].toUpperCase() === 'W') lng = -lng;
      return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
    }
    const decPairRegex = /([+-]?\d+\.?\d*)[\s,]+([+-]?\d+\.?\d*)/;
    const md = s.match(decPairRegex);
    if (md && !isNaN(parseFloat(md[1])) && !isNaN(parseFloat(md[2]))) {
      return { lat: Number(parseFloat(md[1]).toFixed(6)), lng: Number(parseFloat(md[2]).toFixed(6)) };
    }
    return null;
  };

  const parseSingleCoord = (str) => {
    if (!str) return '';
    const s = String(str).trim();
    const dmsSingleRegex = /(\d+)[°\s]+(\d+)['\s]+([\d.]+)"?\s*([NSEWnsew]?)/i;
    const m = s.match(dmsSingleRegex);
    if (m) {
      let val = parseInt(m[1], 10) + parseInt(m[2], 10) / 60 + parseFloat(m[3]) / 3600;
      const dir = m[4] ? m[4].toUpperCase() : '';
      if (dir === 'S' || dir === 'W') val = -val;
      return Number(val.toFixed(6));
    }
    const f = parseFloat(s);
    return isNaN(f) ? s : f;
  };

  const handleApplyPastedCoords = (inputVal) => {
    const val = inputVal !== undefined ? inputVal : pasteCoordsInput;
    const parsed = parseGoogleMapsCoords(val);
    if (!parsed) {
      setCoordsParseMsg(t('analytics.coordsUnrecognized', '未能识别坐标格式，支持 1°26\'25.7"N 103°37\'04.5"E 或 1.440472, 103.617917'));
      setCoordsParseSuccess(false);
      setTimeout(() => setCoordsParseMsg(''), 4000);
      return false;
    }
    const currentOffices = editingRules?.officeLocations || [];
    const defaultOffice = t('analytics.defaultOfficeName', '公司总部');
    const primary = currentOffices[0] || { name: defaultOffice, radiusMeters: editingRules?.maxDistanceMeters || 100 };
    const updatedOffices = [
      {
        ...primary,
        latitude: parsed.lat,
        longitude: parsed.lng,
        name: primary.name || defaultOffice
      },
      ...currentOffices.slice(1)
    ];
    setEditingRules({
      ...editingRules,
      officeLocations: updatedOffices
    });
    setCoordsParseMsg(t('analytics.coordsApplied', { lat: parsed.lat, lng: parsed.lng }, `已成功解析并应用坐标：纬度 ${parsed.lat}，经度 ${parsed.lng}`));
    setCoordsParseSuccess(true);
    setPasteCoordsInput('');
    setTimeout(() => setCoordsParseMsg(''), 4000);
    return true;
  };

  // 1-Click Adopt Current GPS as Office Center
  const handleAdoptCurrentGps = () => {
    if (!navigator.geolocation) {
      alert(t('analytics.errNoGeoBrowser', '当前浏览器不支持地理定位'));
      return;
    }
    setIsDetectingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsDetectingGps(false);
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const acc = Math.round(pos.coords.accuracy);

        const currentOffices = editingRules?.officeLocations || [];
        const defaultOffice = t('analytics.defaultOfficeName', '公司总部');
        const primary = currentOffices[0] || { name: defaultOffice, radiusMeters: editingRules?.maxDistanceMeters || 100 };
        const updatedOffices = [
          {
            ...primary,
            latitude: lat,
            longitude: lng,
            name: primary.name || defaultOffice
          },
          ...currentOffices.slice(1)
        ];

        setEditingRules({
          ...editingRules,
          officeLocations: updatedOffices
        });
        showToast((t('analytics.adoptedGpsSuccess', '成功采纳当前位置 ({lat}, {lng})，GPS 精度 ±{acc}米'))
          .replace('{lat}', lat)
          .replace('{lng}', lng)
          .replace('{acc}', acc));
      },
      (err) => {
        setIsDetectingGps(false);
        alert(t('analytics.detectGpsFailed', '获取当前 GPS 失败: ') + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Add Custom IP
  const handleAddCustomIp = () => {
    const trimmed = newIpInput.trim();
    if (!trimmed) return;
    const currentIps = editingRules?.officeWifi?.allowedIps || [];
    if (currentIps.includes(trimmed)) {
      alert(t('analytics.ipAlreadyExists', '该 IP 已在白名单中'));
      return;
    }
    setEditingRules({
      ...editingRules,
      officeWifi: {
        ...editingRules.officeWifi,
        allowedIps: [...currentIps, trimmed]
      }
    });
    setNewIpInput('');
  };

  // Remove IP
  const handleRemoveIp = (ipToRemove) => {
    const currentIps = editingRules?.officeWifi?.allowedIps || [];
    setEditingRules({
      ...editingRules,
      officeWifi: {
        ...editingRules.officeWifi,
        allowedIps: currentIps.filter(ip => ip !== ipToRemove)
      }
    });
  };

  // Export Attendance Excel (3-Sheet Report: Summary / Matrix / Details)
  const handleExportAttendanceExcel = async () => {
    if (!isHqTeam || (!isOwner && !isManager)) {
      showToast(t('analytics.exportNoPermission', '仅 HQ 本部管理人员具备全员考勤月报导出权限'), 'error');
      return;
    }
    if (picAttendanceRecords.length === 0) {
      showToast(t('analytics.exportNoData', '当前时间段内暂无可导出的考勤打卡数据'), 'warning');
      return;
    }

    setIsExportingExcel(true);
    try {
      const now = new Date();
      const fallbackMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const activeMonthStr = exportMonth || fallbackMonth;
      const hqAdvisors = teamMembers.filter(m => (!m.teamId || m.teamId === 'default_team') && m.role !== 'pending');

      const attendanceLogs = logs.filter(l => !l.isDeleted && l.targetType === 'ATTENDANCE' && ['CLOCK_IN', 'CLOCK_OUT', 'LUNCH_OUT', 'LUNCH_IN', 'CHECK_IN', 'CHECK_OUT'].includes(l.action || l.type));
      const combinedAttendance = [...manualCheckins, ...attendanceLogs];

      const sheets = ExcelExporter.buildAttendanceReportData({
        monthStr: activeMonthStr,
        attendanceEvents: combinedAttendance,
        hqMembers: hqAdvisors,
        shiftConfig: attendanceRules.shiftConfig || DEFAULT_SHIFT_CONFIG,
        shiftOverrides: attendanceRules.shiftOverrides || {},
        excludedAccounts: attendanceRules.excludedAccounts || [],
        hideZeroAttendance: Boolean(attendanceRules.hideZeroAttendanceInReport),
        locale: isEn ? 'en' : 'zh'
      });

      const filename = `TalentFlow_Attendance_${activeMonthStr}.xlsx`;
      await ExcelExporter.exportWorkbook({ filename, sheets, locale: isEn ? 'en' : 'zh' });

      // Audit Log Track (Non-blocking)
      try {
        await SystemLogger.audit(teamId, {
          action: 'EXPORT_ATTENDANCE_EXCEL',
          targetType: 'ATTENDANCE_REPORT',
          details: `Export monthly attendance report (${filename})`
        });
      } catch (logErr) {
        console.warn('Attendance audit log notice:', logErr);
      }

      showToast(t('analytics.exportSuccess', { filename }, `🎉 考勤报表 (${filename}) 已成功生成并下载！`));
    } catch (err) {
      console.error('Failed to export attendance excel:', err);
      showToast(`${t('analytics.exportFailed', '导出失败: ')}${err.message}`, 'error');
    } finally {
      setIsExportingExcel(false);
    }
  };

  // --- Flexible Shifts Row Handlers (考勤规则班次行编辑) ---
  const handleUpdateShiftRow = (index, field, value) => {
    if (!editingRules) return;
    const currentShifts = [...(editingRules.shiftConfig?.shifts || DEFAULT_SHIFT_CONFIG.shifts)];
    currentShifts[index] = { ...currentShifts[index], [field]: value };
    setEditingRules({
      ...editingRules,
      shiftConfig: {
        ...(editingRules.shiftConfig || DEFAULT_SHIFT_CONFIG),
        shifts: currentShifts
      }
    });
  };

  const handleAddShiftRow = () => {
    if (!editingRules) return;
    const currentShifts = [...(editingRules.shiftConfig?.shifts || DEFAULT_SHIFT_CONFIG.shifts)];
    const lastShift = currentShifts[currentShifts.length - 1];
    let newStart = '09:30';
    let newEnd = '18:30';
    if (lastShift && lastShift.startTime) {
      const lastStartMin = CascadeShiftEngine.parseTimeToMinutes(lastShift.startTime);
      const nextStartMin = Math.min(23 * 60 + 30, lastStartMin + 30);
      const nextEndMin = Math.min(23 * 60 + 59, nextStartMin + 9 * 60);
      const pad = (n) => String(n).padStart(2, '0');
      newStart = `${pad(Math.floor(nextStartMin / 60))}:${pad(nextStartMin % 60)}`;
      newEnd = `${pad(Math.floor(nextEndMin / 60))}:${pad(nextEndMin % 60)}`;
    }
    const charCode = 65 + currentShifts.length;
    const charLetter = charCode <= 90 ? String.fromCharCode(charCode) : `${currentShifts.length + 1}`;
    currentShifts.push({
      id: `shift_${Date.now()}`,
      name: `Shift ${charLetter} (${newStart} - ${newEnd})`,
      startTime: newStart,
      endTime: newEnd
    });
    setEditingRules({
      ...editingRules,
      shiftConfig: {
        ...(editingRules.shiftConfig || DEFAULT_SHIFT_CONFIG),
        shifts: currentShifts
      }
    });
  };

  const handleRemoveShiftRow = (index) => {
    if (!editingRules) return;
    const currentShifts = [...(editingRules.shiftConfig?.shifts || DEFAULT_SHIFT_CONFIG.shifts)];
    if (currentShifts.length <= 1) return;
    currentShifts.splice(index, 1);
    setEditingRules({
      ...editingRules,
      shiftConfig: {
        ...(editingRules.shiftConfig || DEFAULT_SHIFT_CONFIG),
        shifts: currentShifts
      }
    });
  };

  const handleResetDefaultShifts = () => {
    if (!editingRules) return;
    setEditingRules({
      ...editingRules,
      shiftConfig: {
        ...(editingRules.shiftConfig || DEFAULT_SHIFT_CONFIG),
        shifts: DEFAULT_SHIFT_CONFIG.shifts
      }
    });
  };

  // Save Settings to Firestore (带班次合法性校验与排序)
  const handleSaveSettings = async () => {
    if (!teamId) return;
    setIsSavingRules(true);
    try {
      const currentShifts = [...(editingRules.shiftConfig?.shifts || DEFAULT_SHIFT_CONFIG.shifts)];
      if (currentShifts.length === 0) {
        showToast(t('analytics.errShiftEmpty', '至少需要保留一个班次档位'), 'error');
        setIsSavingRules(false);
        return;
      }

      for (let i = 0; i < currentShifts.length; i++) {
        const s = currentShifts[i];
        if (!s.name || !s.name.trim()) {
          showToast(t('analytics.errShiftNameEmpty', `第 ${i + 1} 档班次名称不能为空`), 'error');
          setIsSavingRules(false);
          return;
        }
        if (!s.startTime || !s.endTime) {
          showToast(t('analytics.errShiftTimeEmpty', `第 ${i + 1} 档班次上下班时间不能为空`), 'error');
          setIsSavingRules(false);
          return;
        }
        const sMin = CascadeShiftEngine.parseTimeToMinutes(s.startTime);
        const eMin = CascadeShiftEngine.parseTimeToMinutes(s.endTime);
        if (eMin <= sMin) {
          showToast(t('analytics.errShiftTimeOrder', `【${s.name}】下班底线时间必须晚于上班签到时间`), 'error');
          setIsSavingRules(false);
          return;
        }
      }

      // 按签到时间由早到晚自动升序排序，并赋予唯一 id
      currentShifts.sort((a, b) => CascadeShiftEngine.parseTimeToMinutes(a.startTime) - CascadeShiftEngine.parseTimeToMinutes(b.startTime));
      const cleanShifts = currentShifts.map((s, idx) => ({
        id: s.id || `shift_${Date.now()}_${idx}`,
        name: s.name.trim(),
        startTime: s.startTime,
        endTime: s.endTime
      }));

      const finalRules = {
        ...editingRules,
        shiftConfig: {
          ...(editingRules.shiftConfig || DEFAULT_SHIFT_CONFIG),
          shifts: cleanShifts
        }
      };

      await FirestoreStore.saveAttendanceRules(teamId, finalRules);
      setAttendanceRules(finalRules);
      setIsSettingsOpen(false);
      showToast(t('analytics.rulesSavedToast', '考勤规则与网络设置已保存并全员实时生效'));
    } catch (err) {
      console.error('Failed to save attendance rules:', err);
      showToast(t('analytics.saveRulesFailed', '保存失败: ') + err.message, 'error');
    } finally {
      setIsSavingRules(false);
    }
  };

  // --- Shift Override Handlers (主管人工改派单日班次) ---
  const handleOpenOverrideModal = (record) => {
    setOverrideTargetRecord(record);
    const existingOverride = record.overrideData;
    if (existingOverride && existingOverride.shiftId) {
      setSelectedOverrideShiftId(existingOverride.shiftId);
      setOverrideReasonInput(existingOverride.reason || '');
    } else {
      setSelectedOverrideShiftId(record.shiftAnalysis?.shift?.id || '');
      setOverrideReasonInput('');
    }
    setOverrideModalOpen(true);
  };

  const handleSaveShiftOverride = async () => {
    if (!teamId || !overrideTargetRecord) return;
    setIsSavingOverride(true);
    try {
      const overrideKey = overrideTargetRecord.overrideKey || `${overrideTargetRecord.date}__${overrideTargetRecord.picName}`;
      
      if (selectedOverrideShiftId === '__AUTO__') {
        await FirestoreStore.saveShiftOverride(teamId, overrideKey, null);
        try {
          await SystemLogger.audit(teamId, {
            action: 'SHIFT_OVERRIDE_RESET',
            targetType: 'ATTENDANCE',
            targetName: overrideTargetRecord.picName,
            details: `主管 ${user?.email || '管理员'} 清除了 ${overrideTargetRecord.picName} 在 ${overrideTargetRecord.date} 的人工改派班次，恢复系统自动核定。`
          });
        } catch (_) {}
        showToast(t('analytics.overrideResetToast', '已恢复系统自动核定班次'));
      } else {
        const allShifts = attendanceRules.shiftConfig?.shifts || DEFAULT_SHIFT_CONFIG.shifts;
        const targetShift = allShifts.find(s => s.id === selectedOverrideShiftId) || {
          id: selectedOverrideShiftId,
          name: selectedOverrideShiftId,
          startTime: '09:00',
          endTime: '18:00'
        };

        const overridePayload = {
          shiftId: targetShift.id,
          shiftName: targetShift.name,
          startTime: targetShift.startTime,
          endTime: targetShift.endTime,
          reason: overrideReasonInput.trim() || t('analytics.defaultOverrideReason', '主管特批调整'),
          overrideBy: user?.email || userProfile?.displayName || '主管',
          overrideAt: new Date().toISOString()
        };

        await FirestoreStore.saveShiftOverride(teamId, overrideKey, overridePayload);

        try {
          await SystemLogger.audit(teamId, {
            action: 'SHIFT_OVERRIDE',
            targetType: 'ATTENDANCE',
            targetName: overrideTargetRecord.picName,
            details: `主管 ${user?.email || '管理员'} 将 ${overrideTargetRecord.picName} 在 ${overrideTargetRecord.date} 的班次调整为【${targetShift.name}】。原因：${overrideReasonInput.trim() || '主管特批'}`
          });
        } catch (_) {}

        showToast(t('analytics.overrideSuccessToast', `已将 ${overrideTargetRecord.picName} 的班次调整为 ${targetShift.name}`));
      }

      setOverrideModalOpen(false);
      setOverrideTargetRecord(null);
    } catch (err) {
      console.error('Failed to save shift override:', err);
      showToast(t('analytics.overrideFailToast', '班次调整失败: ') + err.message, 'error');
    } finally {
      setIsSavingOverride(false);
    }
  };

  // Calculate Top Banner Totals
  const totalSourcedAll = candidates.length;
  const totalOnboardedAll = candidates.filter(c => c.stage === 'onboarding' || c.stage === 'post_onboarding').length;
  const totalInterviewsAll = candidates.filter(c => c.stage === 'interview' || c.stage === 'offer' || c.stage === 'onboarding').length;
  const activePicsToday = picAttendanceRecords.filter(r => r.isToday).length;

  return (
    <div className="page-view active" style={{ paddingBottom: 'var(--space-8)' }}>
      
      {/* Toast Notification */}
      {toastMessage && (
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
          border: '1px solid var(--accent-emerald)',
          fontSize: '14px',
          backdropFilter: 'blur(10px)'
        }}>
          {toastMessage}
        </div>
      )}

      {/* Header & Mode Switcher */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-1)' }}>
            <h2 style={{ fontSize: 'var(--text-xl)', margin: 0, fontWeight: '700' }}>{t('analytics.pageTitle', '数据洞察与顾问效能')}</h2>
          </div>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: 'var(--text-sm)' }}>
            {t('analytics.pageSubtitle', '集中监控经办顾问 (PIC) 的成单业绩转化与日常打卡活动轨迹')}
          </p>
        </div>

        {/* Tab Switcher & Quick Clock In */}
        {/* Tab Switcher & Attendance Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          
          {/* Owner Rule Settings Button */}
          {isOwner && isHqTeam && (
            <button
              className="btn btn-sm btn-outline"
              style={{ border: '1px solid var(--border-interactive)', gap: '6px', background: 'rgba(255,255,255,0.03)' }}
              onClick={() => {
                setEditingRules(JSON.parse(JSON.stringify(attendanceRules)));
                setIsSettingsOpen(true);
              }}
              title={t('analytics.rulesBtnTitle', '配置企业 Wi-Fi 出口 IP 白名单与 100 米考勤地理围栏')}
            >
              <i className="ph-bold ph-gear-six" style={{ color: 'var(--accent-amber)' }}></i>
              {t('analytics.rulesBtn', '考勤规则与网络设置')}
            </button>
          )}

          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <button
              className={`btn btn-sm ${activeTab === 'performance' ? 'btn-primary' : ''}`}
              style={{ background: activeTab === 'performance' ? 'var(--accent-blue)' : 'transparent', border: 'none', gap: '6px' }}
              onClick={() => setActiveTab('performance')}
            >
              <i className="ph-bold ph-trophy"></i>
              {t('analytics.tabPerformance', 'PIC 业绩看板')}
            </button>
            {isHqTeam && (
            <button
              className={`btn btn-sm ${activeTab === 'attendance' ? 'btn-primary' : ''}`}
              style={{ background: activeTab === 'attendance' ? 'var(--accent-blue)' : 'transparent', border: 'none', gap: '6px' }}
              onClick={() => setActiveTab('attendance')}
            >
              <i className="ph-bold ph-clock-user"></i>
              {t('analytics.tabAttendance', 'PIC 打卡记录')}
            </button>
            )}
          </div>

          {/* Top Quick Excel Export Button & Month Selector (HQ Owner / Manager) */}
          {activeTab === 'attendance' && isHqTeam && (isOwner || isManager) && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0, position: 'relative', zIndex: 60, pointerEvents: 'auto' }}>
              <select
                value={exportMonth}
                onChange={(e) => setExportMonth(e.target.value)}
                style={{
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  padding: '5px 8px',
                  borderRadius: 'var(--radius-md)',
                  outline: 'none',
                  cursor: 'pointer',
                  position: 'relative',
                  zIndex: 61
                }}
                title={t('analytics.selectExportMonth', '选择导出考勤报表的月份')}
              >
                {exportMonthOptions.map(ym => (
                  <option key={ym} value={ym} style={{ background: '#0f172a', color: '#fff' }}>{ym}</option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-sm btn-outline"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  borderColor: 'rgba(16, 185, 129, 0.4)',
                  color: 'var(--accent-emerald)',
                  background: 'rgba(16, 185, 129, 0.08)',
                  padding: '5px 12px',
                  fontSize: '12px',
                  fontWeight: '600',
                  borderRadius: 'var(--radius-md)',
                  cursor: isExportingExcel ? 'wait' : 'pointer',
                  pointerEvents: isExportingExcel ? 'none' : 'auto',
                  position: 'relative',
                  zIndex: 62,
                  flexShrink: 0
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleExportAttendanceExcel();
                }}
                disabled={isExportingExcel}
                title={t('analytics.exportBtnTitle', '导出指定月份内部员工考勤 3-Sheet Excel 报表（总账/日历矩阵/流水）')}
              >
                <i className={`ph-bold ${isExportingExcel ? 'ph-spinner-gap ph-spin' : 'ph-file-xls'}`} style={{ pointerEvents: 'none' }}></i>
                <span style={{ pointerEvents: 'none' }}>{isExportingExcel ? t('analytics.exportingBtn', '正在生成报表...') : t('analytics.exportBtn', '导出考勤月报 (Excel)')}</span>
              </button>
            </div>
          )}

          {/* Quick Clock-in Buttons (HQ only) */}
          {isHqTeam && (
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              className="btn btn-sm"
              style={{ background: 'var(--accent-emerald)', color: '#fff', border: 'none', gap: '5px', fontWeight: '600' }}
              disabled={isClockingIn}
              onClick={() => executeAttendanceCheckin('CLOCK_IN')}
              title={t('analytics.clockInTitle', '上班打卡（自动验证公司 Wi-Fi 或 100 米范围）')}
            >
              <i className="ph-bold ph-sign-in"></i>
              {isClockingIn ? t('analytics.clockInVerifying', '核验中...') : t('analytics.clockInBtn', '上班签到')}
            </button>
            {attendanceRules.allowWfh !== false && canWfh && (
              <button
                className="btn btn-sm btn-outline"
                style={{ border: '1px solid #c084fc', color: '#c084fc', background: 'rgba(168, 85, 247, 0.1)', gap: '5px', fontWeight: '600' }}
                disabled={isClockingIn}
                onClick={() => executeAttendanceCheckin('CLOCK_IN', 'WFH')}
                title={t('analytics.wfhClockInTitle', '居家办公 (WFH) 远程打卡（无需 100 米地理围栏）')}
              >
                <i className="ph-bold ph-house-line"></i>
                {t('analytics.wfhClockInBtn', 'WFH 签到')}
              </button>
            )}
            <button
              className="btn btn-sm btn-outline"
              style={{ border: '1px solid var(--accent-blue)', color: 'var(--accent-blue)', gap: '5px', fontWeight: '600' }}
              disabled={isClockingIn}
              onClick={() => handleTopClockOut()}
              title={t('analytics.clockOutTitle', '下班打卡（自动验证公司 Wi-Fi 或 100 米范围）')}
            >
              <i className="ph-bold ph-sign-out"></i>
              {t('analytics.clockOutBtn', '下班签退')}
            </button>
          </div>
          )}

        </div>
      </div>

      {/* 4 Core Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <div className="bezel-shell">
          <div className="bezel-core" style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-2)' }}>
              <span>{t('analytics.kpiTotalSourced', '全团队推荐候选人')}</span>
              <i className="ph-light ph-users" style={{ color: 'var(--accent-blue)', fontSize: '18px' }}></i>
            </div>
            <div style={{ fontSize: '26px', fontWeight: '700', color: 'var(--text-primary)' }}>
              {totalSourcedAll} <span style={{ fontSize: '13px', fontWeight: 'normal', color: 'var(--text-muted)' }}>{t('analytics.kpiTotalSourcedUnit', '人')}</span>
            </div>
          </div>
        </div>

        <div className="bezel-shell">
          <div className="bezel-core" style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-2)' }}>
              <span>{t('analytics.kpiTotalInterviews', '累计安排面试')}</span>
              <i className="ph-light ph-calendar-check" style={{ color: 'var(--accent-purple)', fontSize: '18px' }}></i>
            </div>
            <div style={{ fontSize: '26px', fontWeight: '700', color: 'var(--text-primary)' }}>
              {totalInterviewsAll} <span style={{ fontSize: '13px', fontWeight: 'normal', color: 'var(--text-muted)' }}>{t('analytics.kpiTotalInterviewsUnit', '场次')}</span>
            </div>
          </div>
        </div>

        <div className="bezel-shell">
          <div className="bezel-core" style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-2)' }}>
              <span>{t('analytics.kpiTotalOnboarded', '成功入职 (核心成交)')}</span>
              <i className="ph-light ph-medal" style={{ color: 'var(--accent-emerald)', fontSize: '18px' }}></i>
            </div>
            <div style={{ fontSize: '26px', fontWeight: '700', color: 'var(--accent-emerald)' }}>
              {totalOnboardedAll} <span style={{ fontSize: '13px', fontWeight: 'normal', color: 'var(--text-muted)' }}>{t('analytics.kpiTotalOnboardedUnit', '人成功入职')}</span>
            </div>
          </div>
        </div>

        <div className="bezel-shell">
          <div className="bezel-core" style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-2)' }}>
              <span>{t('analytics.kpiActivePicsToday', '今日打卡/活跃顾问')}</span>
              <i className="ph-light ph-clock" style={{ color: 'var(--accent-amber)', fontSize: '18px' }}></i>
            </div>
            <div style={{ fontSize: '26px', fontWeight: '700', color: 'var(--accent-amber)' }}>
              {activePicsToday} <span style={{ fontSize: '13px', fontWeight: 'normal', color: 'var(--text-muted)' }}>{t('analytics.kpiActivePicsTodayUnit', '位顾问在岗')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: PIC 业绩看板 (Performance Leaderboard & Comparison)               */}
      {/* ========================================================================= */}
      {activeTab === 'performance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          
          {/* Top Chart: Comparison Bar Chart */}
          <div className="bezel-shell">
            <div className="bezel-core" style={{ padding: 'var(--space-5)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                <h3 style={{ fontSize: 'var(--text-md)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="ph-bold ph-chart-bar" style={{ color: 'var(--accent-blue)' }}></i>
                  {t('analytics.chartTitle', '顾问推人量 vs 成功入职成单效能对比 (Top PICs)')}
                </h3>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  {t('analytics.chartNote', '绿色代表最终入职业绩，紫色代表面试量，蓝色代表推送总量')}
                </span>
              </div>
              <div style={{ height: '300px', width: '100%', position: 'relative' }}>
                <canvas ref={chartRef}></canvas>
              </div>
            </div>
          </div>

          {/* Performance Leaderboard Table */}
          <div className="bezel-shell">
            <div className="bezel-core" style={{ padding: 'var(--space-5)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
                <h3 style={{ fontSize: 'var(--text-md)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="ph-bold ph-ranking" style={{ color: 'var(--accent-amber)' }}></i>
                  {t('analytics.tableTitle', 'PIC 顾问个人业绩排行与成单转化明细')}
                </h3>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                  {(t('analytics.tableSubtitle', '共 {count} 位经办顾问')).replace('{count}', picPerformanceData.length)}
                </span>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: 'var(--space-3) var(--space-3)', width: '60px' }}>{t('analytics.colRank', '排名')}</th>
                      <th style={{ padding: 'var(--space-3) var(--space-3)' }}>{t('analytics.colPic', '经办顾问 (PIC)')}</th>
                      <th style={{ padding: 'var(--space-3) var(--space-3)' }}>{t('analytics.colSourced', '推荐推人量')}</th>
                      <th style={{ padding: 'var(--space-3) var(--space-3)' }}>{t('analytics.colInterviews', '面试数')}</th>
                      <th style={{ padding: 'var(--space-3) var(--space-3)' }}>{t('analytics.colOffers', 'Offer 数')}</th>
                      <th style={{ padding: 'var(--space-3) var(--space-3)', color: 'var(--accent-emerald)' }}>{t('analytics.colOnboarded', '成功入职 (业绩成单)')}</th>
                      <th style={{ padding: 'var(--space-3) var(--space-3)', minWidth: '160px' }}>{t('analytics.colRate', '成单转化率')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {picPerformanceData.length === 0 ? (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
                          {t('analytics.emptyPerformance', '暂无顾问业绩数据')}
                        </td>
                      </tr>
                    ) : (
                      picPerformanceData.map((pic, idx) => {
                        let rankBadge = (
                          <span style={{ color: 'var(--text-muted)', fontWeight: '600', paddingLeft: '4px' }}>
                            #{idx + 1}
                          </span>
                        );
                        if (idx === 0) {
                          rankBadge = (
                            <span style={{ background: '#f59e0b', color: '#000', borderRadius: '50%', width: '22px', height: '22px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '11px' }}>
                              1
                            </span>
                          );
                        } else if (idx === 1) {
                          rankBadge = (
                            <span style={{ background: '#94a3b8', color: '#000', borderRadius: '50%', width: '22px', height: '22px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '11px' }}>
                              2
                            </span>
                          );
                        } else if (idx === 2) {
                          rankBadge = (
                            <span style={{ background: '#b45309', color: '#fff', borderRadius: '50%', width: '22px', height: '22px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '11px' }}>
                              3
                            </span>
                          );
                        }

                        return (
                          <tr key={pic.name} style={{ borderBottom: '1px solid var(--border-hairline)', transition: 'background 0.2s' }}>
                            <td style={{ padding: 'var(--space-3) var(--space-3)' }}>
                              {rankBadge}
                            </td>
                            <td style={{ padding: 'var(--space-3) var(--space-3)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '600' }}>
                                  {pic.name.charAt(0).toUpperCase()}
                                </div>
                                <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{pic.name}</span>
                                {userProfile?.role === 'owner' && (
                                  <span style={{
                                    fontSize: '10px',
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    fontWeight: '600',
                                    background: !pic.isExternal && pic.uid ? 'rgba(59, 130, 246, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                    color: !pic.isExternal && pic.uid ? 'var(--accent-blue)' : 'var(--accent-amber)',
                                    border: `1px solid ${!pic.isExternal && pic.uid ? 'rgba(59, 130, 246, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
                                  }}>
                                    {!pic.isExternal && pic.uid ? t('analytics.tagInHouse', '本部') : t('analytics.tagFreelance', '外部/协作')}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: 'var(--space-3) var(--space-3)', fontWeight: '500' }}>
                              {pic.totalSourced} {t('analytics.unitPeople', '人')}
                            </td>
                            <td style={{ padding: 'var(--space-3) var(--space-3)', color: 'var(--accent-purple)' }}>
                              {pic.interview}
                            </td>
                            <td style={{ padding: 'var(--space-3) var(--space-3)', color: 'var(--accent-blue)' }}>
                              {pic.offer}
                            </td>
                            <td style={{ padding: 'var(--space-3) var(--space-3)' }}>
                              <span style={{
                                padding: '3px 10px',
                                background: pic.onboarded > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.04)',
                                color: pic.onboarded > 0 ? 'var(--accent-emerald)' : 'var(--text-muted)',
                                borderRadius: '12px',
                                fontWeight: '700',
                                fontSize: '13px'
                              }}>
                                {pic.onboarded} {t('analytics.unitPeople', '人')}
                              </span>
                            </td>
                            <td style={{ padding: 'var(--space-3) var(--space-3)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ flex: 1, height: '6px', background: 'var(--border-subtle)', borderRadius: '3px', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${Math.min(pic.rate * 3, 100)}%`, background: 'var(--accent-emerald)', borderRadius: '3px' }}></div>
                                </div>
                                <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', width: '42px' }}>
                                  {pic.rate}%
                                </span>
                              </div>
                            </td>
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
      )}

      {/* ========================================================================= */}
      {/* TAB 2: PIC 打卡记录 (Attendance & Activity Logs)                          */}
      {/* ========================================================================= */}
      {activeTab === 'attendance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          
          {/* Attendance Filter Toolbar */}
          <div className="bezel-shell">
            <div className="bezel-core" style={{ padding: 'var(--space-4)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
                
                {/* Search by PIC name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flex: 1, minWidth: '260px' }}>
                  <div style={{ position: 'relative', width: '100%', maxWidth: '320px' }}>
                    <i className="ph-light ph-magnifying-glass" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}></i>
                    <input
                      type="text"
                      className="input"
                      style={{ paddingLeft: '32px', width: '100%', height: '36px', fontSize: '13px' }}
                      placeholder={t('analytics.searchPlaceholder', '搜索顾问姓名或邮箱...')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>

                  {/* Filter by PIC Dropdown */}
                  <select
                    className="select"
                    style={{ height: '36px', fontSize: '13px', minWidth: '140px' }}
                    value={selectedPic}
                    onChange={(e) => setSelectedPic(e.target.value)}
                  >
                    <option value="all">{t('analytics.filterAllPics', '全部经办顾问 (PIC)')}</option>
                    {allPicNames.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>

                {/* Date Filter Buttons */}
                <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', padding: '3px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  <button
                    className={`btn btn-sm ${dateFilter === 'today' ? 'btn-primary' : ''}`}
                    style={{ background: dateFilter === 'today' ? 'var(--accent-blue)' : 'transparent', border: 'none', fontSize: '12px', padding: '4px 10px' }}
                    onClick={() => setDateFilter('today')}
                  >
                    {t('analytics.dateFilterToday', '今日考勤')}
                  </button>
                  <button
                    className={`btn btn-sm ${dateFilter === '7days' ? 'btn-primary' : ''}`}
                    style={{ background: dateFilter === '7days' ? 'var(--accent-blue)' : 'transparent', border: 'none', fontSize: '12px', padding: '4px 10px' }}
                    onClick={() => setDateFilter('7days')}
                  >
                    {t('analytics.dateFilter7Days', '近 7 天')}
                  </button>
                  <button
                    className={`btn btn-sm ${dateFilter === '30days' ? 'btn-primary' : ''}`}
                    style={{ background: dateFilter === '30days' ? 'var(--accent-blue)' : 'transparent', border: 'none', fontSize: '12px', padding: '4px 10px' }}
                    onClick={() => setDateFilter('30days')}
                  >
                    {t('analytics.dateFilter30Days', '近 30 天')}
                  </button>
                  <button
                    className={`btn btn-sm ${dateFilter === 'all' ? 'btn-primary' : ''}`}
                    style={{ background: dateFilter === 'all' ? 'var(--accent-blue)' : 'transparent', border: 'none', fontSize: '12px', padding: '4px 10px' }}
                    onClick={() => setDateFilter('all')}
                  >
                    {t('analytics.dateFilterAll', '全部历史')}
                  </button>
                </div>

              </div>
            </div>
          </div>

          {/* Attendance Header & Actions Bar */}
          <div className="bezel-shell" style={{ marginBottom: 'var(--space-4)' }}>
            <div className="bezel-core" style={{ padding: 'var(--space-4) var(--space-5)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <h3 style={{ fontSize: 'var(--text-md)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="ph-bold ph-calendar-check" style={{ color: 'var(--accent-emerald)' }}></i>
                    {t('analytics.attendanceTableTitle', '顾问考勤打卡明细')}
                  </h3>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', background: 'rgba(255, 255, 255, 0.04)', padding: '3px 8px', borderRadius: '4px' }}>
                    {(t('analytics.attendanceTableSubWithDays', '共检索到 {count} 条打卡记录 · 分布于 {days} 天')).replace('{count}', filteredAttendance.length).replace('{days}', groupedAttendanceByDate.length)}
                  </span>
                </div>
                {isHqTeam && (isOwner || isManager) && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0, position: 'relative', zIndex: 60, pointerEvents: 'auto' }}>
                    <select
                      value={exportMonth}
                      onChange={(e) => setExportMonth(e.target.value)}
                      style={{
                        background: 'rgba(15, 23, 42, 0.85)',
                        border: '1px solid rgba(16, 185, 129, 0.35)',
                        color: 'var(--text-primary)',
                        fontSize: '12px',
                        padding: '4px 8px',
                        borderRadius: 'var(--radius-md)',
                        outline: 'none',
                        cursor: 'pointer',
                        position: 'relative',
                        zIndex: 61
                      }}
                      title={t('analytics.selectExportMonth', '选择导出考勤报表的月份')}
                    >
                      {exportMonthOptions.map(ym => (
                        <option key={ym} value={ym} style={{ background: '#0f172a', color: '#fff' }}>{ym}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        borderColor: 'rgba(16, 185, 129, 0.4)',
                        color: 'var(--accent-emerald)',
                        background: 'rgba(16, 185, 129, 0.08)',
                        padding: '4px 12px',
                        fontSize: '12px',
                        fontWeight: '600',
                        borderRadius: 'var(--radius-md)',
                        cursor: isExportingExcel ? 'wait' : 'pointer',
                        pointerEvents: isExportingExcel ? 'none' : 'auto',
                        position: 'relative',
                        zIndex: 62,
                        flexShrink: 0
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExportAttendanceExcel();
                      }}
                      disabled={isExportingExcel}
                      title={t('analytics.exportBtnTitle', '导出指定月份内部员工考勤 3-Sheet Excel 报表（总账/日历矩阵/流水）')}
                    >
                      <i className={`ph-bold ${isExportingExcel ? 'ph-spinner-gap ph-spin' : 'ph-file-xls'}`} style={{ pointerEvents: 'none' }}></i>
                      <span style={{ pointerEvents: 'none' }}>{isExportingExcel ? t('analytics.exportingBtn', '正在生成报表...') : t('analytics.exportBtn', '导出考勤月报 (Excel)')}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Grouped Attendance Cards by Date */}
          {loadingLogs ? (
            <div className="bezel-shell">
              <div className="bezel-core" style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
                <i className="ph-light ph-spinner-gap" style={{ animation: 'spin 1s linear infinite', marginRight: '8px' }}></i>
                {t('analytics.loadingLogs', '正在加载实时打卡记录...')}
              </div>
            </div>
          ) : groupedAttendanceByDate.length === 0 ? (
            <div className="bezel-shell">
              <div className="bezel-core" style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
                {t('analytics.emptyAttendance', '所选时间范围内暂无打卡记录，可点击上方「上班签到」立即打卡')}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {groupedAttendanceByDate.map((group) => {
                const dayWeekday = getWeekdayLabel(group.date);
                return (
                  <div key={group.date} className="bezel-shell">
                    <div className="bezel-core" style={{ padding: 'var(--space-4) var(--space-5)' }}>
                      {/* Box Day Header */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 'var(--space-3)',
                        paddingBottom: 'var(--space-3)',
                        borderBottom: '1px solid var(--border-subtle)',
                        flexWrap: 'wrap',
                        gap: '10px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            background: group.isToday ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: group.isToday ? 'var(--accent-blue)' : 'var(--text-secondary)'
                          }}>
                            <i className="ph-bold ph-calendar-dots" style={{ fontSize: '18px' }}></i>
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{
                                fontSize: '15px',
                                fontWeight: '700',
                                color: group.isToday ? 'var(--accent-blue)' : 'var(--text-primary)',
                                fontFamily: 'monospace',
                                letterSpacing: '0.02em'
                              }}>
                                {group.date}
                              </span>
                              {dayWeekday && (
                                <span style={{
                                  fontSize: '11px',
                                  fontWeight: '600',
                                  padding: '1px 7px',
                                  borderRadius: '4px',
                                  background: 'rgba(255, 255, 255, 0.06)',
                                  color: 'var(--text-secondary)'
                                }}>
                                  {dayWeekday}
                                </span>
                              )}
                              {group.isToday && (
                                <span style={{
                                  fontSize: '11px',
                                  fontWeight: '700',
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  background: 'rgba(59, 130, 246, 0.18)',
                                  color: 'var(--accent-blue)',
                                  border: '1px solid rgba(59, 130, 246, 0.35)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px'
                                }}>
                                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-blue)', display: 'inline-block' }}></span>
                                  {t('analytics.todayTagLabel', '今日 (Today)')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            fontSize: '12px',
                            color: 'var(--text-secondary)',
                            background: 'rgba(255, 255, 255, 0.04)',
                            padding: '3px 10px',
                            borderRadius: '12px',
                            border: '1px solid var(--border-subtle)'
                          }}>
                            {(t('analytics.dayAdvisorCount', '当日出勤 {count} 人')).replace('{count}', group.items.length)}
                          </span>
                        </div>
                      </div>

                      {/* Day Table */}
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                              <th style={{ padding: 'var(--space-3) var(--space-3)' }}>{t('analytics.colAttPic', '打卡人 (PIC)')}</th>
                              <th style={{ padding: 'var(--space-3) var(--space-3)' }}>{t('analytics.colFirstCheckin', '首次签到时间')}</th>
                              <th style={{ padding: 'var(--space-3) var(--space-3)' }}>{t('analytics.colClockOut', '下班签退')}</th>
                              <th style={{ padding: 'var(--space-3) var(--space-3)' }}>{t('analytics.colWorkDuration', '当日工时跨度')}</th>
                              <th style={{ padding: 'var(--space-3) var(--space-3)' }}>{t('analytics.colVerifyMethod', '核验凭证')}</th>
                              <th style={{ padding: 'var(--space-3) var(--space-3)' }}>{t('analytics.colAssignedShift', '核定阶梯班次')}</th>
                              <th style={{ padding: 'var(--space-3) var(--space-3)' }}>{t('analytics.colAttStatus', '考勤状态')}</th>
                              <th style={{ padding: 'var(--space-3) var(--space-3)' }}>{t('analytics.colMainProgress', '当日主要工作推进')}</th>
                              <th style={{ padding: 'var(--space-3) var(--space-3)', textAlign: 'center' }}>{t('analytics.colAction', '操作')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.items.map((item, idx) => {
                              const firstTimeStr = (item.manualClockIn || item.firstActionTime)?.toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) || '-';
                              const clockOutTimeStr = item.manualClockOut ? item.manualClockOut.toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null;

                              return (
                                <tr key={`${item.date}_${item.picName}_${idx}`} style={{ borderBottom: '1px solid var(--border-hairline)' }}>
                                  <td style={{ padding: 'var(--space-3) var(--space-3)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.2)', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold' }}>
                                        {item.picName.charAt(0).toUpperCase()}
                                      </div>
                                      <div>
                                        <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{item.picName}</div>
                                        {item.userEmail && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.userEmail}</div>}
                                      </div>
                                    </div>
                                  </td>
                                  <td style={{ padding: 'var(--space-3) var(--space-3)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span style={{ color: 'var(--accent-emerald)', fontFamily: 'monospace', fontWeight: '600' }}>
                                        {firstTimeStr}
                                      </span>
                                      {item.allClockIns && item.allClockIns.length > 1 && (
                                        <span
                                          style={{
                                            fontSize: '10px',
                                            padding: '1px 5px',
                                            borderRadius: '4px',
                                            background: 'rgba(16, 185, 129, 0.15)',
                                            color: 'var(--accent-emerald)',
                                            cursor: 'help'
                                          }}
                                          title={t('analytics.multipleClockInTip', { count: item.allClockIns.length, list: item.allClockIns.map((c, i) => `${i + 1}. ${c.timeStr}${i === 0 ? ' (最早生效)' : ''}`).join('\n') }, `共 ${item.allClockIns.length} 次签到打卡\n` + item.allClockIns.map((c, i) => `${i + 1}. ${c.timeStr}${i === 0 ? ' (最早生效)' : ''}`).join('\n'))}
                                        >
                                          x{item.allClockIns.length}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td style={{ padding: 'var(--space-3) var(--space-3)' }}>
                                    {clockOutTimeStr ? (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                                          {clockOutTimeStr}
                                        </span>
                                        {item.allClockOuts && item.allClockOuts.length > 1 && (
                                          <span
                                            style={{
                                              fontSize: '10px',
                                              padding: '1px 5px',
                                              borderRadius: '4px',
                                              background: 'rgba(59, 130, 246, 0.15)',
                                              color: 'var(--accent-blue)',
                                              cursor: 'help'
                                            }}
                                            title={t('analytics.multipleClockOutTip', { count: item.allClockOuts.length, list: item.allClockOuts.map((c, i) => `${i + 1}. ${c.timeStr}${i === item.allClockOuts.length - 1 ? ' (最晚最终生效)' : ' (已覆盖)'}`).join('\n') }, `共 ${item.allClockOuts.length} 次签退打卡\n` + item.allClockOuts.map((c, i) => `${i + 1}. ${c.timeStr}${i === item.allClockOuts.length - 1 ? ' (最晚最终生效)' : ' (已覆盖)'}`).join('\n'))}
                                          >
                                            x{item.allClockOuts.length}
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <span style={{ color: 'var(--text-muted)' }}>-</span>
                                    )}
                                  </td>
                                  <td style={{ padding: 'var(--space-3) var(--space-3)', color: 'var(--text-secondary)' }}>
                                    {item.manualClockOut && item.durationHours !== null && item.durationHours !== undefined ? (
                                      item.durationHours > 0 ? `${item.durationHours} ${t('analytics.unitHours', '小时')}` : t('analytics.unitJustNow', '< 0.1 小时 (刚签到)')
                                    ) : (
                                      <span style={{ color: 'var(--text-muted)' }}>-</span>
                                    )}
                                  </td>
                                  <td style={{ padding: 'var(--space-3) var(--space-3)' }}>
                                    {item.verifyMethod === 'WFH' ? (
                                      <span style={{
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        fontSize: '11px',
                                        fontWeight: '600',
                                        color: '#c084fc',
                                        background: 'rgba(168, 85, 247, 0.15)',
                                        border: '1px solid rgba(168, 85, 247, 0.3)',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                      }} title={item.verifySnapshot?.wfhNote || `IP: ${item.verifySnapshot?.ip || 'Remote'}`}>
                                        <i className="ph-bold ph-house-line"></i>
                                        {t('analytics.methodWfh', '居家办公 (WFH)')}
                                      </span>
                                    ) : item.verifyMethod === 'WIFI_IP' ? (
                                      <span style={{
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        fontSize: '11px',
                                        fontWeight: '600',
                                        color: 'var(--accent-emerald)',
                                        background: 'rgba(16, 185, 129, 0.15)',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                      }} title={`IP: ${item.verifySnapshot?.ip || 'LAN'}`}>
                                        <i className="ph-bold ph-wifi-high"></i>
                                        {t('analytics.methodWifi', '公司 Wi-Fi')}
                                      </span>
                                    ) : item.verifyMethod === 'GPS_GEOFENCE' ? (
                                      <span style={{
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        fontSize: '11px',
                                        fontWeight: '600',
                                        color: 'var(--accent-blue)',
                                        background: 'rgba(59, 130, 246, 0.15)',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                      }} title={`Effective: ${Math.round(item.verifySnapshot?.effectiveDistance || 0)}m (±${Math.round(item.verifySnapshot?.accuracy || 0)}m)`}>
                                        <i className="ph-bold ph-map-pin"></i>
                                        {t('analytics.methodGeofence', '100m围栏')} ({Math.round(item.verifySnapshot?.effectiveDistance || 0)}m)
                                      </span>
                                    ) : item.verifyMethod === 'RULE_DISABLED' ? (
                                      <span style={{
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        fontSize: '11px',
                                        fontWeight: '600',
                                        color: 'var(--accent-amber)',
                                        background: 'rgba(234, 179, 8, 0.15)',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                      }}>
                                        <i className="ph-bold ph-lock-simple-open"></i>
                                        {t('analytics.methodRuleDisabled', '规则免限')}
                                      </span>
                                    ) : (
                                      <span style={{
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        fontSize: '11px',
                                        fontWeight: '500',
                                        color: 'var(--text-muted)',
                                        background: 'rgba(255, 255, 255, 0.04)',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                      }}>
                                        <i className="ph-light ph-terminal-window"></i>
                                        {t('analytics.methodSystem', '系统操作')}
                                      </span>
                                    )}
                                  </td>
                                  <td style={{ padding: 'var(--space-3) var(--space-3)' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                      <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>
                                        {item.shiftAnalysis?.shift?.name || t('analytics.unassignedShift', '未定班次')}
                                      </span>
                                      {item.isOverridden ? (
                                        <span style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          fontSize: '10px',
                                          fontWeight: '700',
                                          color: '#c084fc',
                                          background: 'rgba(168, 85, 247, 0.15)',
                                          padding: '1px 6px',
                                          borderRadius: '4px',
                                          width: 'fit-content',
                                          border: '1px solid rgba(168, 85, 247, 0.3)'
                                        }} title={t('analytics.overrideTooltip', {
                                          by: item.overrideData?.overrideBy || t('analytics.overrideDefaultBy', '主管'),
                                          reason: item.overrideData?.reason || t('analytics.overrideNone', '无'),
                                          time: item.overrideData?.updatedAt ? new Date(item.overrideData.updatedAt).toLocaleString() : ''
                                        }, `调整人: ${item.overrideData?.overrideBy || '主管'}\n原因: ${item.overrideData?.reason || '无'}\n时间: ${item.overrideData?.updatedAt ? new Date(item.overrideData.updatedAt).toLocaleString() : ''}`)}>
                                          <i className="ph-bold ph-pencil-simple"></i>
                                          {t('analytics.tagOverridden', '主管调整')}
                                        </span>
                                      ) : (
                                        item.shiftAnalysis?.shift?.endStr ? (
                                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                            {t('analytics.shiftCutoffPrefix', '底线')} {item.shiftAnalysis.shift.endStr}
                                          </span>
                                        ) : null
                                      )}
                                    </div>
                                  </td>
                                  <td style={{ padding: 'var(--space-3) var(--space-3)' }}>
                                    <span style={{
                                      padding: '2px 8px',
                                      borderRadius: '4px',
                                      fontSize: '11px',
                                      fontWeight: '600',
                                      color: item.statusColor,
                                      background: `${item.statusColor}18`,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px'
                                    }}>
                                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: item.statusColor }}></span>
                                      {item.statusLabel || (
                                        item.status === 'online'
                                          ? t('analytics.statusOnDuty', '工作中 (活跃)')
                                          : item.isToday
                                            ? t('analytics.statusJustClockedIn', '今日已打卡')
                                            : t('analytics.statusFullShift', '正常完成')
                                      )}
                                    </span>
                                  </td>
                                  <td style={{ padding: 'var(--space-3) var(--space-3)', maxWidth: '240px' }}>
                                    <div
                                      style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                      title={item.allPunches && item.allPunches.length > 0 ? item.allPunches.map(p => `[${p.timeStr}] ${p.actionType}: ${p.note || ''}`).join('\n') : item.actions.map(a => a.note).join('; ')}
                                    >
                                      {item.actions.length > 0 ? (item.actions[0].note || t('analytics.defaultProgressNote', '员工考勤打卡')) : t('analytics.onlineProgressNote', '在线跟进')}
                                    </div>
                                  </td>
                                  <td style={{ padding: 'var(--space-3) var(--space-3)', textAlign: 'center' }}>
                                    {canManageAttendance ? (
                                      <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        style={{ padding: '3px 8px', fontSize: '11px', gap: '4px', height: '26px' }}
                                        title={t('analytics.btnOverrideShift', '调整核定班次')}
                                        onClick={() => handleOpenOverrideModal(item)}
                                      >
                                        <i className="ph-bold ph-pencil-simple" style={{ color: 'var(--accent-purple)' }}></i>
                                        {t('analytics.btnEditShift', '改班')}
                                      </button>
                                    ) : (
                                      <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>-</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      )}

      {/* Verification In-Progress Overlay */}
      {isClockingIn && (
        <div style={{
          position: 'fixed',
          bottom: '32px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          background: 'rgba(15, 23, 42, 0.95)',
          color: '#fff',
          padding: '14px 24px',
          borderRadius: 'var(--radius-full)',
          boxShadow: '0 20px 35px -5px rgba(0,0,0,0.6)',
          border: '1px solid var(--accent-blue)',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          backdropFilter: 'blur(12px)',
          maxWidth: '90%'
        }}>
          <i className="ph-bold ph-spinner-gap" style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-blue)', fontSize: '20px' }}></i>
          <span>{clockInStatusMsg || t('analytics.verifyingOverlay', '正在执行企业级安全考勤核验...')}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Owner Attendance & Network Configuration Modal                            */}
      {/* ========================================================================= */}
      {isSettingsOpen && editingRules && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 10000,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-4)'
        }}>
          <div className="bezel-shell" style={{ maxWidth: '680px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="bezel-core" style={{ padding: 'var(--space-6)' }}>
              
              {/* Modal Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-5)', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                    <i className="ph-bold ph-shield-check"></i>
                  </div>
                  <div>
                    <h3 style={{ fontSize: 'var(--text-lg)', margin: 0, fontWeight: '700' }}>{t('analytics.modalTitle', '考勤网络与地理围栏设置')}</h3>
                    <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                      {t('analytics.modalSubtitle', '配置仅在公司 Wi-Fi 或 100 米范围内允许打卡')}
                    </p>
                  </div>
                </div>
                <button
                  className="btn btn-sm btn-outline"
                  style={{ border: 'none', background: 'rgba(255,255,255,0.06)', borderRadius: '50%', width: '32px', height: '32px', padding: 0 }}
                  onClick={() => setIsSettingsOpen(false)}
                >
                  <i className="ph-bold ph-x"></i>
                </button>
              </div>

              {/* Master Switch */}
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', marginBottom: 'var(--space-5)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '2px' }}>{t('analytics.masterSwitchTitle', '强制开启打卡安全核验')}</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                    {t('analytics.masterSwitchDesc', '开启后员工必须命中公司 Wi-Fi 出口 IP 或位于 100 米地理围栏内，关闭则免检放行')}
                  </div>
                </div>
                <label style={{ position: 'relative', display: 'inline-block', width: '48px', height: '24px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editingRules.enabled}
                    onChange={(e) => setEditingRules({ ...editingRules, enabled: e.target.checked })}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    background: editingRules.enabled ? 'var(--accent-emerald)' : 'rgba(255,255,255,0.15)',
                    borderRadius: '24px', transition: '0.3s'
                  }}>
                    <span style={{
                      position: 'absolute', content: '""', height: '18px', width: '18px', left: editingRules.enabled ? '26px' : '3px', bottom: '3px',
                      background: '#fff', borderRadius: '50%', transition: '0.3s'
                    }}></span>
                  </span>
                </label>
              </div>

              {/* Allow WFH Check-in Switch */}
              <div style={{ background: 'rgba(168, 85, 247, 0.06)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(168, 85, 247, 0.25)', marginBottom: 'var(--space-5)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '2px' }}>
                    {t('analytics.wfhSwitchTitle', '允许居家办公 (WFH) 专属打卡')}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                    {t('analytics.wfhSwitchDesc', '开启后员工可在打卡时选择「居家办公 (WFH)」模式，免除 100 米地理围栏限制并单独标记为 WFH 考勤')}
                  </div>
                </div>
                <label style={{ position: 'relative', display: 'inline-block', width: '48px', height: '24px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editingRules.allowWfh !== false}
                    onChange={(e) => setEditingRules({ ...editingRules, allowWfh: e.target.checked })}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    background: editingRules.allowWfh !== false ? '#a855f7' : 'rgba(255,255,255,0.15)',
                    borderRadius: '24px', transition: '0.3s'
                  }}>
                    <span style={{
                      position: 'absolute', content: '""', height: '18px', width: '18px', left: editingRules.allowWfh !== false ? '26px' : '3px', bottom: '3px',
                      background: '#fff', borderRadius: '50%', transition: '0.3s'
                    }}></span>
                  </span>
                </label>
              </div>

              {/* Enable Lunch Break 4-Phase Punch Switch */}
              <div style={{ background: 'rgba(245, 158, 11, 0.06)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(245, 158, 11, 0.25)', marginBottom: 'var(--space-5)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="ph-bold ph-coffee" style={{ color: 'var(--accent-amber)' }}></i>
                    {t('analytics.lunchPunchSwitchTitle', '启用午休打卡 (4段式考勤)')}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                    {t('analytics.lunchPunchSwitchDesc', '开启后考勤弹窗启用「上班 ➔ 午休离开 ➔ 午休返回 ➔ 下班」4段式打卡与午休状态追踪；关闭则自动恢复极简「上班 / 下班」2段式打卡。')}
                  </div>
                </div>
                <label style={{ position: 'relative', display: 'inline-block', width: '48px', height: '24px', cursor: 'pointer', flexShrink: 0, marginLeft: 'var(--space-3)' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(editingRules.enableLunchPunch)}
                    onChange={(e) => setEditingRules({ ...editingRules, enableLunchPunch: e.target.checked })}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    background: Boolean(editingRules.enableLunchPunch) ? 'var(--accent-amber)' : 'rgba(255,255,255,0.15)',
                    borderRadius: '24px', transition: '0.3s'
                  }}>
                    <span style={{
                      position: 'absolute', content: '""', height: '18px', width: '18px', left: Boolean(editingRules.enableLunchPunch) ? '26px' : '3px', bottom: '3px',
                      background: '#fff', borderRadius: '50%', transition: '0.3s'
                    }}></span>
                  </span>
                </label>
              </div>

              {/* Section 1: Office Location & Geofence */}
              <div style={{ marginBottom: 'var(--space-6)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                  <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="ph-bold ph-map-pin" style={{ color: 'var(--accent-blue)' }}></i>
                    {t('analytics.secGeofenceTitle', '办公地点与 100 米弹性地理围栏')}
                  </h4>
                  <button
                    className="btn btn-sm btn-outline"
                    style={{ fontSize: '11px', padding: '3px 8px', gap: '4px', borderColor: 'var(--accent-blue)', color: 'var(--accent-blue)' }}
                    disabled={isDetectingGps}
                    onClick={handleAdoptCurrentGps}
                  >
                    <i className={`ph-bold ${isDetectingGps ? 'ph-spinner-gap' : 'ph-crosshair'}`} style={isDetectingGps ? { animation: 'spin 1s linear infinite' } : {}}></i>
                    {isDetectingGps ? t('analytics.detectingGps', '读取中...') : t('analytics.adoptGpsBtn', '将我当前位置设为公司中心')}
                  </button>
                </div>

                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: 'var(--space-3)', lineHeight: 1.4 }}>
                  💡 {t('analytics.gpsNotice', '电脑端无 GPS 硬件芯片，常因运营商出口 IP 位于雪兰莪导致定位偏移。建议使用下方快捷框直接粘贴 Google 地图真实坐标！')}
                </div>

                {/* Quick Paste Google Maps Coordinates Box */}
                <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px dashed rgba(59, 130, 246, 0.3)', borderRadius: 'var(--radius-md)', padding: '10px 12px', marginBottom: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <i className="ph-bold ph-clipboard-text"></i>
                      {t('analytics.quickPasteCoords', 'Google 地图坐标智能解析 / 粘贴')}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      style={{ fontSize: '11px', padding: '2px 8px', borderColor: 'var(--accent-emerald)', color: 'var(--accent-emerald)', background: 'rgba(16, 185, 129, 0.08)' }}
                      onClick={() => handleApplyPastedCoords('1°26\'25.7"N 103°37\'04.5"E')}
                    >
                      <i className="ph-bold ph-check"></i>
                      {t('analytics.useJohorCoords', '一键填入柔佛总部 (1°26\'25.7"N 103°37\'04.5"E)')}
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      className="input"
                      style={{ flex: 1, height: '32px', fontSize: '12px', fontFamily: 'monospace' }}
                      placeholder={t('analytics.coordsPlaceholder', '支持度分秒 (1°26\'25.7"N 103°37\'04.5"E) 或十进制 (1.440472, 103.617917)')}
                      value={pasteCoordsInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPasteCoordsInput(val);
                        if (val.includes('N') || val.includes(',') || val.includes('°')) {
                          handleApplyPastedCoords(val);
                        }
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && handleApplyPastedCoords()}
                    />
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      style={{ height: '32px', fontSize: '12px' }}
                      onClick={() => handleApplyPastedCoords()}
                    >
                      {t('analytics.applyCoordsBtn', '解析应用')}
                    </button>
                  </div>
                  {coordsParseMsg && (
                    <div style={{ fontSize: '11px', color: coordsParseSuccess ? 'var(--accent-emerald)' : 'var(--accent-rose)', marginTop: '4px' }}>
                      {coordsParseMsg}
                    </div>
                  )}
                </div>

                {/* Office Info Inputs */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>{t('analytics.officeNameLabel', '办公点名称')}</label>
                    <input
                      type="text"
                      className="input"
                      style={{ width: '100%', height: '36px', fontSize: '13px' }}
                      value={editingRules.officeLocations?.[0]?.name || ''}
                      placeholder={t('analytics.officeNamePlaceholder', '例如：总部办公室')}
                      onChange={(e) => {
                        const locs = [...(editingRules.officeLocations || [])];
                        locs[0] = { ...(locs[0] || {}), name: e.target.value };
                        setEditingRules({ ...editingRules, officeLocations: locs });
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>{t('analytics.latLabel', '中心纬度 (Latitude)')}</label>
                    <input
                      type="text"
                      className="input"
                      style={{ width: '100%', height: '36px', fontSize: '13px', fontFamily: 'monospace' }}
                      value={editingRules.officeLocations?.[0]?.latitude ?? ''}
                      placeholder={t('analytics.latPlaceholder', '例如：1.440472')}
                      onChange={(e) => {
                        const val = e.target.value;
                        const fullParsed = parseGoogleMapsCoords(val);
                        if (fullParsed) {
                          const locs = [...(editingRules.officeLocations || [])];
                          locs[0] = { ...(locs[0] || {}), latitude: fullParsed.lat, longitude: fullParsed.lng };
                          setEditingRules({ ...editingRules, officeLocations: locs });
                          return;
                        }
                        const singleParsed = parseSingleCoord(val);
                        const locs = [...(editingRules.officeLocations || [])];
                        locs[0] = { ...(locs[0] || {}), latitude: typeof singleParsed === 'number' ? singleParsed : (parseFloat(val) || 0) };
                        setEditingRules({ ...editingRules, officeLocations: locs });
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>{t('analytics.lngLabel', '中心经度 (Longitude)')}</label>
                    <input
                      type="text"
                      className="input"
                      style={{ width: '100%', height: '36px', fontSize: '13px', fontFamily: 'monospace' }}
                      value={editingRules.officeLocations?.[0]?.longitude ?? ''}
                      placeholder={t('analytics.lngPlaceholder', '例如：103.617917')}
                      onChange={(e) => {
                        const val = e.target.value;
                        const fullParsed = parseGoogleMapsCoords(val);
                        if (fullParsed) {
                          const locs = [...(editingRules.officeLocations || [])];
                          locs[0] = { ...(locs[0] || {}), latitude: fullParsed.lat, longitude: fullParsed.lng };
                          setEditingRules({ ...editingRules, officeLocations: locs });
                          return;
                        }
                        const singleParsed = parseSingleCoord(val);
                        const locs = [...(editingRules.officeLocations || [])];
                        locs[0] = { ...(locs[0] || {}), longitude: typeof singleParsed === 'number' ? singleParsed : (parseFloat(val) || 0) };
                        setEditingRules({ ...editingRules, officeLocations: locs });
                      }}
                    />
                  </div>
                </div>

                {/* Radius Slider */}
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{t('analytics.radiusLabel', '考勤有效打卡半径')}</span>
                    <span style={{ fontWeight: '700', color: 'var(--accent-blue)' }}>{editingRules.maxDistanceMeters || 100} {t('analytics.radiusMeterUnit', '米')}</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="1000"
                    step="10"
                    value={editingRules.maxDistanceMeters || 100}
                    onChange={(e) => {
                      const newRadius = parseInt(e.target.value, 10);
                      const updatedLocs = (editingRules.officeLocations || []).map((loc, idx) =>
                        idx === 0 ? { ...loc, radiusMeters: newRadius } : loc
                      );
                      setEditingRules({
                        ...editingRules,
                        maxDistanceMeters: newRadius,
                        officeLocations: updatedLocs
                      });
                    }}
                    style={{ width: '100%', accentColor: 'var(--accent-blue)' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)' }}>
                    <span>{t('analytics.radiusMark50', '50米 (极高严密)')}</span>
                    <span>{t('analytics.radiusMark100', '100米 (企业推荐)')}</span>
                    <span>{t('analytics.radiusMark500', '500米 (园区)')}</span>
                    <span>{t('analytics.radiusMark1000', '1000米 (宽域)')}</span>
                  </div>
                </div>

                {/* Drift Compensation Slider */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{t('analytics.driftLabel', '高楼/室内 GPS 漂移补偿池')}</span>
                    <span style={{ fontWeight: '700', color: 'var(--accent-purple)' }}>{editingRules.maxDriftCompensation || 40} {t('analytics.radiusMeterUnit', '米')}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={editingRules.maxDriftCompensation || 40}
                    onChange={(e) => setEditingRules({ ...editingRules, maxDriftCompensation: parseInt(e.target.value) })}
                    style={{ width: '100%', accentColor: 'var(--accent-purple)' }}
                  />
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.4 }}>
                    {t('analytics.driftDesc', '写字楼玻璃幕墙与水泥墙体会导致 30~50 米 GPS 多径折射抖动。后端测距时会自动抵扣该漂移误差，确保室内不误拒。')}
                  </div>
                </div>
              </div>

              {/* Section 2: Company Wi-Fi Public IP */}
              <div style={{ marginBottom: 'var(--space-6)', borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--space-5)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                  <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="ph-bold ph-wifi-high" style={{ color: 'var(--accent-emerald)' }}></i>
                    {t('analytics.secWifiTitle', '公司 Wi-Fi / 企业出口 IP 白名单')}
                  </h4>
                  <button
                    className="btn btn-sm btn-outline"
                    style={{ fontSize: '11px', padding: '3px 8px', gap: '4px', borderColor: 'var(--accent-emerald)', color: 'var(--accent-emerald)' }}
                    disabled={isDetectingIp}
                    onClick={handleDetectCurrentIp}
                  >
                    <i className={`ph-bold ${isDetectingIp ? 'ph-spinner-gap' : 'ph-globe'}`} style={isDetectingIp ? { animation: 'spin 1s linear infinite' } : {}}></i>
                    {isDetectingIp ? t('analytics.detectingIp', '探测中...') : t('analytics.detectIpBtn', '一键将当前网络添加为公司 Wi-Fi')}
                  </button>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '0 0 var(--space-3) 0', lineHeight: 1.4 }}>
                  {t('analytics.wifiDesc', '由于现代浏览器沙箱安全机制限制，纯网页端无法读取路由器的物理 SSID/BSSID。系统采用大厂通用的公网出口 IP 方案：员工只要连上公司 Wi-Fi，即可秒级免等待打卡！')}
                </p>

                {/* Allowed IPs List */}
                <div style={{ minHeight: '44px', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                  {(!editingRules.officeWifi?.allowedIps || editingRules.officeWifi.allowedIps.length === 0) ? (
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('analytics.emptyWifiNotice', '暂未添加公司 Wi-Fi IP，请点击右上角一键探测添加')}</span>
                  ) : (
                    editingRules.officeWifi.allowedIps.map(ip => (
                      <span key={ip} style={{
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: 'var(--accent-emerald)',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        borderRadius: '4px',
                        padding: '2px 8px',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <i className="ph-bold ph-wifi-high" style={{ fontSize: '11px' }}></i>
                        {ip}
                        <button
                          onClick={() => handleRemoveIp(ip)}
                          style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                        >
                          <i className="ph-bold ph-x" style={{ fontSize: '10px' }}></i>
                        </button>
                      </span>
                    ))
                  )}
                </div>

                {/* Manual IP Addition */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: 'var(--space-3)' }}>
                  <input
                    type="text"
                    className="input"
                    style={{ flex: 1, height: '34px', fontSize: '12px', fontFamily: 'monospace' }}
                    placeholder={t('analytics.manualIpPlaceholder', '手动输入分公司或专线固定公网 IP (例如 202.108.22.5)')}
                    value={newIpInput}
                    onChange={(e) => setNewIpInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCustomIp()}
                  />
                  <button className="btn btn-sm btn-secondary" onClick={handleAddCustomIp} style={{ height: '34px', fontSize: '12px' }}>
                    {t('analytics.addIpBtn', '添加 IP')}
                  </button>
                </div>

                {/* DDNS Dynamic Domain */}
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>{t('analytics.ddnsLabel', '动态域名 DDNS (针对普通家庭宽带/浮动公网 IP)')}</label>
                  <input
                    type="text"
                    className="input"
                    style={{ width: '100%', height: '34px', fontSize: '12px' }}
                    placeholder={t('analytics.ddnsPlaceholder', '例如：myoffice.ddns.net (系统将自动解析当前出口 IP)')}
                    value={editingRules.officeWifi?.ddnsDomain || ''}
                    onChange={(e) => setEditingRules({
                      ...editingRules,
                      officeWifi: { ...(editingRules.officeWifi || {}), ddnsDomain: e.target.value }
                    })}
                  />
                </div>
              </div>

              {/* Section 3: Flexible Shifts & Cascade Tolerance Configuration */}
              <div style={{ marginBottom: 'var(--space-6)', borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--space-5)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                  <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="ph-bold ph-hourglass-high" style={{ color: 'var(--accent-purple)' }}></i>
                    {t('analytics.secShiftTitle', '阶梯弹性班次与打卡容差配置')}
                  </h4>
                  <span style={{ fontSize: '11px', color: 'var(--accent-purple)', background: 'rgba(168, 85, 247, 0.1)', padding: '2px 8px', borderRadius: '4px', fontWeight: '600' }}>
                    {t('analytics.tagZeroGrace', '当前设定：零打卡冗余 (过一分钟即顺延)')}
                  </span>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '0 0 var(--space-4) 0', lineHeight: 1.4 }}>
                  {t('analytics.shiftConfigDesc', '系统以员工早晨首次签到时间动态核定所属班次。若超出所选档位，下班时间强制顺延至下一档（例如 8:31 打卡需工作至 18:00）。若提前签退（例如 17:59）则直接判定为迟到/早退违规。')}
                </p>

                {/* Grace Minutes Configuration */}
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', marginBottom: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>
                      {t('analytics.graceMinutesLabel', '打卡宽限容差 (Grace Minutes / 分钟)')}
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input
                        type="number"
                        min="0"
                        max="30"
                        className="input"
                        style={{ width: '64px', height: '30px', textAlign: 'center', fontSize: '13px', fontWeight: 'bold' }}
                        value={editingRules.shiftConfig?.graceMinutes ?? 0}
                        onChange={(e) => {
                          const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                          setEditingRules({
                            ...editingRules,
                            shiftConfig: {
                              ...(editingRules.shiftConfig || DEFAULT_SHIFT_CONFIG),
                              graceMinutes: val
                            }
                          });
                        }}
                      />
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{t('analytics.unitMinutes', '分钟')}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    {(editingRules.shiftConfig?.graceMinutes ?? 0) === 0
                      ? t('analytics.graceHintZero', '💡 当前为 0 分钟 (严格执行)：8:30:00 前打卡计为 8:30，只要到 8:31:00 立刻强制顺延至 9:00 - 18:00 档。')
                      : t('analytics.graceHintCustom', `💡 当前容差已调整为 ${editingRules.shiftConfig?.graceMinutes} 分钟，打卡在基准时间 + ${editingRules.shiftConfig?.graceMinutes} 分钟内仍可计入该班次。`)}
                  </div>
                </div>

                {/* Shifts Table */}
                <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', overflow: 'hidden', marginBottom: 'var(--space-3)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 40px', padding: '8px 12px', background: 'rgba(255,255,255,0.04)', fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                    <span>{t('analytics.colShiftName', '阶梯班次档位')}</span>
                    <span style={{ textAlign: 'center' }}>{t('analytics.colShiftIn', '签到基准线')}</span>
                    <span style={{ textAlign: 'center' }}>{t('analytics.colShiftOut', '强制下班底线')}</span>
                    <span style={{ textAlign: 'center' }}>{t('analytics.colShiftAction', '操作')}</span>
                  </div>
                  {(editingRules.shiftConfig?.shifts || DEFAULT_SHIFT_CONFIG.shifts).map((shift, sIdx, arr) => (
                    <div key={shift.id || sIdx} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 40px', gap: '8px', padding: '8px 12px', borderTop: '1px solid var(--border-hairline)', fontSize: '12px', alignItems: 'center' }}>
                      <input
                        type="text"
                        className="input"
                        style={{ height: '32px', fontSize: '12px', padding: '4px 8px' }}
                        value={shift.name || ''}
                        placeholder={t('analytics.shiftNamePlaceholder', '如: Shift A (7:30am - 4:30pm)')}
                        onChange={(e) => handleUpdateShiftRow(sIdx, 'name', e.target.value)}
                      />
                      <input
                        type="time"
                        className="input"
                        style={{ height: '32px', fontSize: '12px', fontFamily: 'monospace', padding: '4px 6px', color: 'var(--accent-emerald)', textAlign: 'center' }}
                        value={shift.startTime || '09:00'}
                        onChange={(e) => handleUpdateShiftRow(sIdx, 'startTime', e.target.value)}
                      />
                      <input
                        type="time"
                        className="input"
                        style={{ height: '32px', fontSize: '12px', fontFamily: 'monospace', padding: '4px 6px', color: 'var(--accent-blue)', textAlign: 'center' }}
                        value={shift.endTime || '18:00'}
                        onChange={(e) => handleUpdateShiftRow(sIdx, 'endTime', e.target.value)}
                      />
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ width: '28px', height: '28px', padding: 0, color: arr.length <= 1 ? 'var(--text-muted)' : '#f87171' }}
                          disabled={arr.length <= 1}
                          title={arr.length <= 1 ? t('analytics.keepAtLeastOneShift', '至少保留一个班次') : t('analytics.deleteShift', '删除此档位')}
                          onClick={() => handleRemoveShiftRow(sIdx)}
                        >
                          <i className="ph-bold ph-trash"></i>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Shift Quick Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '12px', gap: '6px' }}
                    onClick={handleAddShiftRow}
                  >
                    <i className="ph-bold ph-plus-circle" style={{ color: 'var(--accent-emerald)' }}></i>
                    {t('analytics.btnAddShift', '添加班次档位')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: '11px', color: 'var(--text-muted)', gap: '4px' }}
                    onClick={handleResetDefaultShifts}
                    title={t('analytics.resetShiftsHint', '重置回系统标准的 4 档弹性班次 (7:30 / 8:00 / 8:30 / 9:00)')}
                  >
                    <i className="ph-bold ph-arrow-counter-clockwise"></i>
                    {t('analytics.btnResetDefaultShifts', '恢复默认4档')}
                  </button>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: 'var(--space-4)', lineHeight: 1.4 }}>
                  {t('analytics.shiftAutoSortHint', '提示：保存时系统将根据「签到基准线」自动由早至晚排序，下班时间必须晚于上班签到时间。')}
                </div>

                {/* Strict Clock Out Switch */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>{t('analytics.strictClockOutTitle', '严格签退绝杀 (Strict Clock-Out)')}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t('analytics.strictClockOutDesc', '未达到核定班次下班底线提前签退（例如 17:59 签退）将直接被系统计为迟到/早退违规。')}</div>
                  </div>
                  <label style={{ position: 'relative', display: 'inline-block', width: '40px', height: '20px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={editingRules.shiftConfig?.strictClockOut !== false}
                      onChange={(e) => {
                        setEditingRules({
                          ...editingRules,
                          shiftConfig: {
                            ...(editingRules.shiftConfig || DEFAULT_SHIFT_CONFIG),
                            strictClockOut: e.target.checked
                          }
                        });
                      }}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                      background: editingRules.shiftConfig?.strictClockOut !== false ? 'var(--accent-purple)' : 'rgba(255,255,255,0.15)',
                      borderRadius: '20px', transition: '0.3s'
                    }}>
                      <span style={{
                        position: 'absolute', content: '""', height: '14px', width: '14px',
                        left: editingRules.shiftConfig?.strictClockOut !== false ? '22px' : '3px', bottom: '3px',
                        background: '#fff', borderRadius: '50%', transition: '0.3s'
                      }}></span>
                    </span>
                  </label>
                </div>
              </div>

              {/* Section 4: 免考勤与报表排除账户设定 (Exempt / Excluded Accounts) */}
              <div style={{ marginBottom: 'var(--space-5)', borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--space-4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                  <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="ph-bold ph-user-minus" style={{ color: 'var(--accent-amber)' }}></i>
                    {t('analytics.secExemptTitle', '免考勤与报表排除账户 (Exempt Accounts)')}
                  </h4>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {t('analytics.exemptCountTag', { count: (editingRules.excludedAccounts || []).length }, `已排除 ${(editingRules.excludedAccounts || []).length} 人`)}
                  </span>
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '0 0 var(--space-3) 0', lineHeight: 1.4 }}>
                  {t('analytics.exemptDesc', '点击下方成员标签可将其设为「免考勤/测试账户」。被排除的账户将不再出现在考勤监控列表、准点排行榜及导出的 Excel 月报中。')}
                </p>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '12px', background: 'rgba(0,0,0,0.15)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', marginBottom: 'var(--space-3)' }}>
                  {teamMembers
                    .filter(m => (!m.teamId || m.teamId === 'default_team') && m.role !== 'pending')
                    .map(m => {
                      const identifier = m.email || m.id || m.uid || m.name;
                      const currentList = editingRules.excludedAccounts || [];
                      const isExcluded = isAccountExcluded({ uid: m.id || m.uid, email: m.email, name: m.displayName || m.name }, currentList);
                      return (
                        <button
                          key={m.id || identifier}
                          type="button"
                          onClick={() => {
                            const nextList = isExcluded
                              ? currentList.filter(item => {
                                  const tLower = String(item).toLowerCase();
                                  return (
                                    item !== (m.id || m.uid) &&
                                    tLower !== String(m.email || '').toLowerCase() &&
                                    tLower !== String(m.displayName || m.name || '').toLowerCase()
                                  );
                                })
                              : [...currentList, identifier];
                            setEditingRules({
                              ...editingRules,
                              excludedAccounts: nextList
                            });
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '5px 10px',
                            borderRadius: '999px',
                            fontSize: '12px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            transition: '0.2s',
                            border: isExcluded ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid var(--border-subtle)',
                            background: isExcluded ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                            color: isExcluded ? '#fca5a5' : 'var(--text-secondary)',
                            textDecoration: isExcluded ? 'line-through' : 'none'
                          }}
                          title={m.email || m.name}
                        >
                          <i className={`ph-bold ${isExcluded ? 'ph-eye-slash' : 'ph-user-check'}`} style={{ color: isExcluded ? '#f87171' : 'var(--accent-emerald)' }}></i>
                          <span>{m.displayName || m.name || (m.email ? m.email.split('@')[0] : 'Advisor')}</span>
                        </button>
                      );
                    })}
                </div>

                {/* Hide Zero Attendance Switch */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>
                      {t('analytics.hideZeroAttTitle', '导出月报时自动隐藏当月 0 打卡账户')}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {t('analytics.hideZeroAttDesc', '开启后，当月没有任何打卡记录的账号将自动不在 Excel 总账与日历矩阵中显示。')}
                    </div>
                  </div>
                  <label style={{ position: 'relative', display: 'inline-block', width: '40px', height: '20px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={Boolean(editingRules.hideZeroAttendanceInReport)}
                      onChange={(e) => {
                        setEditingRules({
                          ...editingRules,
                          hideZeroAttendanceInReport: e.target.checked
                        });
                      }}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                      background: editingRules.hideZeroAttendanceInReport ? 'var(--accent-amber)' : 'rgba(255,255,255,0.15)',
                      borderRadius: '20px', transition: '0.3s'
                    }}>
                      <span style={{
                        position: 'absolute', content: '""', height: '14px', width: '14px',
                        left: editingRules.hideZeroAttendanceInReport ? '22px' : '3px', bottom: '3px',
                        background: '#fff', borderRadius: '50%', transition: '0.3s'
                      }}></span>
                    </span>
                  </label>
                </div>
              </div>

              {/* Modal Footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--space-4)' }}>
                <button className="btn btn-secondary" onClick={() => setIsSettingsOpen(false)} disabled={isSavingRules}>
                  {t('analytics.btnCancel', '取消')}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleSaveSettings}
                  disabled={isSavingRules}
                  style={{ gap: '6px' }}
                >
                  <i className={`ph-bold ${isSavingRules ? 'ph-spinner-gap' : 'ph-floppy-disk'}`} style={isSavingRules ? { animation: 'spin 1s linear infinite' } : {}}></i>
                  {isSavingRules ? t('analytics.savingRules', '正在保存...') : t('analytics.btnSaveRules', '保存考勤规则')}
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Shift Override Modal (主管人工改派单日核定班次) */}
      {overrideModalOpen && overrideTargetRecord && (
        <div className="modal-backdrop" onClick={() => !isSavingOverride && setOverrideModalOpen(false)}>
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '480px', width: '90%', animation: 'scaleUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-4)', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-3)' }}>
              <div>
                <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="ph-bold ph-pencil-simple" style={{ color: 'var(--accent-purple)' }}></i>
                  {t('analytics.overrideModalTitle', '调整考勤核定班次')}
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  {t('analytics.overrideModalDesc', '为该员工指定或修正此日期的核定班次。调整后下班底线将重新核算，并保留操作审计记录。')}
                </p>
              </div>
              <button
                className="btn btn-ghost"
                onClick={() => setOverrideModalOpen(false)}
                disabled={isSavingOverride}
                style={{ padding: '4px', color: 'var(--text-muted)' }}
              >
                <i className="ph-bold ph-x" style={{ fontSize: '18px' }}></i>
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              
              {/* Employee & Date Snapshot Info */}
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t('analytics.overrideEmployeeLabel', '打卡人员')}</div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginTop: '2px' }}>
                    {overrideTargetRecord.picName}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t('analytics.overrideDateLabel', '考勤日期')}</div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--accent-blue)', marginTop: '2px' }}>
                    {overrideTargetRecord.date}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t('analytics.colFirstCheckin', '首次签到时间')}</div>
                  <div style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--accent-emerald)', marginTop: '2px' }}>
                    {overrideTargetRecord.firstActionTime ? overrideTargetRecord.firstActionTime.toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t('analytics.overrideOriginalShift', '系统原判定')}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {overrideTargetRecord.shiftAnalysis?.shift?.baseName || overrideTargetRecord.shiftAnalysis?.shift?.name || t('analytics.unassignedShift', '未定班次')}
                  </div>
                </div>
              </div>

              {/* Target Shift Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>
                  {t('analytics.overrideTargetShiftLabel', '目标调整班次')} <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select
                  className="input"
                  style={{ width: '100%', height: '36px', fontSize: '13px' }}
                  value={selectedOverrideShiftId}
                  onChange={(e) => setSelectedOverrideShiftId(e.target.value)}
                >
                  <option value="__AUTO__">
                    {t('analytics.overrideShiftAuto', '恢复系统自动判定 (清除人工改派)')}
                  </option>
                  <optgroup label={t('analytics.secShiftTitle', '生效班次档位')}>
                    {(attendanceRules.shiftConfig?.shifts || DEFAULT_SHIFT_CONFIG.shifts).map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.startTime} - {s.endTime})
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Reason / Note */}
              {selectedOverrideShiftId !== '__AUTO__' && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>
                    {t('analytics.overrideReasonLabel', '调整原因说明')}
                  </label>
                  <input
                    type="text"
                    className="input"
                    placeholder={t('analytics.overrideReasonPlaceholder', '例如：经主管特批公出免顺延 / 网络打卡延迟补正')}
                    value={overrideReasonInput}
                    onChange={(e) => setOverrideReasonInput(e.target.value)}
                    style={{ width: '100%', fontSize: '13px' }}
                  />
                </div>
              )}

              {/* Warning Notice */}
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'rgba(168, 85, 247, 0.06)', border: '1px solid rgba(168, 85, 247, 0.2)', padding: '8px 12px', borderRadius: 'var(--radius-sm)', lineHeight: 1.4 }}>
                <i className="ph-bold ph-info" style={{ color: 'var(--accent-purple)', marginRight: '4px' }}></i>
                {t('analytics.overrideWarningNotice', '调整后，员工当日早退与达标底线将依据新班次强制下班时间实时刷新，且写入不可篡改的系统审计日志。')}
              </div>

            </div>

            {/* Modal Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-5)', borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--space-4)' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setOverrideModalOpen(false)}
                disabled={isSavingOverride}
              >
                {t('analytics.btnCancel', '取消')}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSaveShiftOverride}
                disabled={isSavingOverride}
                style={{ gap: '6px' }}
              >
                <i className={`ph-bold ${isSavingOverride ? 'ph-spinner-gap' : 'ph-check-circle'}`} style={isSavingOverride ? { animation: 'spin 1s linear infinite' } : {}}></i>
                {isSavingOverride ? t('analytics.savingRules', '正在保存...') : t('analytics.btnSaveOverride', '保存调整')}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Early Clock-Out Warning Modal (提前签退防呆拦截确认) */}
      {earlyClockOutModal && (
        <div className="modal-backdrop" onClick={() => setEarlyClockOutModal(null)}>
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '440px', width: '90%', animation: 'scaleUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)', border: '1px solid rgba(239, 68, 68, 0.4)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: 'var(--space-3)' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', flexShrink: 0 }}>
                <i className="ph-bold ph-warning-circle" style={{ fontSize: '20px' }}></i>
              </div>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '700', margin: 0, color: '#f87171' }}>
                  {t('attendanceModal.earlyWarningTitle', '⚠️ 提前签退预警 (严格考核)')}
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                  {t('analytics.earlyCutoffNotice', '未达核定班次底线签退将触发违规记录')}
                </p>
              </div>
            </div>

            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 14px',
              fontSize: '13px',
              lineHeight: 1.6,
              color: 'var(--text-primary)',
              marginBottom: 'var(--space-4)',
              border: '1px solid var(--border-subtle)'
            }}>
              {t('attendanceModal.earlyWarningText', {
                end: earlyClockOutModal.shift?.endStr || '18:00',
                desc: earlyClockOutModal.desc
              }, `当前核定下班底线为 ${earlyClockOutModal.shift?.endStr || '18:00'}，距离达标还差 ${earlyClockOutModal.desc}。提前签退将直接按迟到/违规计入考勤！`)}
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '13px', fontWeight: '600' }}
                onClick={() => setEarlyClockOutModal(null)}
              >
                {t('attendanceModal.earlyWait', '再等一下 (保住全勤)')}
              </button>
              <button
                type="button"
                className="btn"
                style={{ background: '#ef4444', color: '#fff', fontSize: '13px', fontWeight: '700', border: 'none' }}
                onClick={() => handleTopClockOut(true)}
              >
                {t('attendanceModal.earlyForce', '坚持提前签退')}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
