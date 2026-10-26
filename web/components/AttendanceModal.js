'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../lib/auth-context';
import { useI18n } from '../lib/i18n-context';
import { FirestoreStore } from '../lib/firestore-store';
import { SystemLogger } from '../lib/logger';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { CascadeShiftEngine, DEFAULT_SHIFT_CONFIG } from '../lib/cascade-shift-engine';

const getApiUrl = (path) => {
  return path;
};

// Feature toggle: Temporarily disabled per user preference; set to true to re-enable 4-phase lunch clocking
const ENABLE_LUNCH_PUNCH = false;

export default function AttendanceModal() {
  const { user, userProfile, teamId, isOwner, isManager, isHqTeam } = useAuth();
  const canWfh = userProfile?.allowWfhPunch !== undefined ? Boolean(userProfile.allowWfhPunch) : Boolean(isOwner || isManager);
  const { t, lang } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [detectedIp, setDetectedIp] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [userRecords, setUserRecords] = useState([]);
  const [workMode, setWorkMode] = useState('OFFICE'); // 'OFFICE' | 'WFH'
  const [wfhNote, setWfhNote] = useState('');

  // Enforce OFFICE mode if user has no WFH permission
  useEffect(() => {
    if (!canWfh && workMode === 'WFH') {
      setWorkMode('OFFICE');
    }
  }, [canWfh, workMode]);
  const [attendanceRules, setAttendanceRules] = useState({
    enabled: true,
    allowWfh: true,
    maxDistanceMeters: 100,
    maxDriftCompensation: 40,
    officeLocations: [
      { name: '公司总部', latitude: 1.440472, longitude: 103.617917, radiusMeters: 100 }
    ],
    officeWifi: { allowedIps: [] },
    shiftConfig: DEFAULT_SHIFT_CONFIG
  });
  const [toastMsg, setToastMsg] = useState('');
  const [appleHelpMsg, setAppleHelpMsg] = useState('');
  const [earlyClockOutWarning, setEarlyClockOutWarning] = useState(null);
  const autoPopupCheckedRef = useRef(false);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3500);
  };

  // 1. Digital Clock (Updates every second)
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Subscribe to Attendance Rules
  useEffect(() => {
    if (!teamId) return;
    const unsubscribe = FirestoreStore.subscribeToAttendanceRules(teamId, (rules) => {
      if (rules && typeof rules === 'object') {
        setAttendanceRules(rules);
      }
    });
    return () => unsubscribe();
  }, [teamId]);

  // 3. Subscribe to current user's attendance records (dual-listen logs and attendance collections)
  useEffect(() => {
    if (!teamId || !user?.uid) return;

    let attendanceRecords = [];
    let logRecords = [];

    const mergeAndSetRecords = () => {
      const map = new Map();
      [...attendanceRecords, ...logRecords].forEach(r => {
        if (r.id) map.set(r.id, r);
      });
      const merged = Array.from(map.values());
      merged.sort((a, b) => {
        const timeA = a.timestamp?.toMillis ? a.timestamp.toMillis() : new Date(a.timestamp || 0).getTime();
        const timeB = b.timestamp?.toMillis ? b.timestamp.toMillis() : new Date(b.timestamp || 0).getTime();
        return timeB - timeA;
      });
      setUserRecords(merged);
    };

    // Guaranteed permission-safe: listen to team logs where targetType is 'ATTENDANCE'
    const qLogs = query(
      collection(db, 'teams', teamId, 'logs'),
      where('targetType', '==', 'ATTENDANCE')
    );
    const unsubLogs = onSnapshot(qLogs, (snap) => {
      logRecords = snap.docs
        .map(d => ({ ...d.data(), id: d.id, type: d.data().action || d.data().type || 'CLOCK_IN' }))
        .filter(r => r.userId === user.uid || r.user?.uid === user.uid || (user.email && r.userEmail === user.email));
      mergeAndSetRecords();
    }, (err) => {
      console.warn('Notice: Log attendance listener:', err?.message || err);
    });

    // Also listen to dedicated attendance subcollection (if deployed)
    let unsubAttendance = () => {};
    try {
      const qAtt = query(
        collection(db, 'teams', teamId, 'attendance'),
        where('userId', '==', user.uid)
      );
      unsubAttendance = onSnapshot(qAtt, (snap) => {
        attendanceRecords = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        mergeAndSetRecords();
      }, (err) => {
        console.warn('Notice: Dedicated attendance collection listener (fallback to logs):', err?.message || err);
      });
    } catch (e) {}

    return () => {
      unsubLogs();
      unsubAttendance();
    };
  }, [teamId, user]);

  // Compute Today's Attendance Status
  const todayDateStr = useMemo(() => {
    return new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
  }, [currentTime]);

  const todayClockIn = useMemo(() => {
    return userRecords.find(r => {
      const d = r.timestamp?.toDate ? r.timestamp.toDate() : new Date(r.timestamp);
      const str = d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
      return str === todayDateStr && (r.type === 'CLOCK_IN' || !r.type);
    });
  }, [userRecords, todayDateStr]);

  const todayLunchOut = useMemo(() => {
    return userRecords.find(r => {
      const d = r.timestamp?.toDate ? r.timestamp.toDate() : new Date(r.timestamp);
      const str = d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
      return str === todayDateStr && r.type === 'LUNCH_OUT';
    });
  }, [userRecords, todayDateStr]);

  const todayLunchIn = useMemo(() => {
    return userRecords.find(r => {
      const d = r.timestamp?.toDate ? r.timestamp.toDate() : new Date(r.timestamp);
      const str = d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
      return str === todayDateStr && r.type === 'LUNCH_IN';
    });
  }, [userRecords, todayDateStr]);

  const todayClockOut = useMemo(() => {
    return userRecords.find(r => {
      const d = r.timestamp?.toDate ? r.timestamp.toDate() : new Date(r.timestamp);
      const str = d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
      return str === todayDateStr && r.type === 'CLOCK_OUT';
    });
  }, [userRecords, todayDateStr]);

  // Recommended next punch action
  const recommendedPunchType = useMemo(() => {
    if (ENABLE_LUNCH_PUNCH) {
      if (!todayClockIn) return 'CLOCK_IN';
      if (!todayLunchOut) return 'LUNCH_OUT';
      if (!todayLunchIn) return 'LUNCH_IN';
      return 'CLOCK_OUT';
    }
    return !todayClockIn ? 'CLOCK_IN' : 'CLOCK_OUT';
  }, [todayClockIn, todayLunchOut, todayLunchIn]);

  const [selectedPunchType, setSelectedPunchType] = useState(null);
  const activePunch = selectedPunchType || recommendedPunchType;

  // 4. Auto-popup on login / page load if employee has not clocked in today
  useEffect(() => {
    // 分部 / 合作方团队无需打卡，不自动弹出
    if (!isHqTeam || !user || !userProfile || userProfile.role === 'pending' || autoPopupCheckedRef.current) return;

    // Check if dismissed in this session
    const dismissKey = `omni_clockin_dismissed_${user.uid}_${todayDateStr}`;
    const isDismissed = typeof window !== 'undefined' && sessionStorage.getItem(dismissKey);

    // If no check-in record yet and not dismissed, auto-open popup after 900ms smooth delay
    if (!todayClockIn && !isDismissed) {
      autoPopupCheckedRef.current = true;
      const t = setTimeout(() => {
        setIsOpen(true);
      }, 900);
      return () => clearTimeout(t);
    }
  }, [isHqTeam, user, userProfile, todayClockIn, todayDateStr]);

  // 5. Global Event Listener: Can be opened from Header or anywhere via custom event
  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener('omni_open_attendance_modal', handleOpen);
    return () => window.removeEventListener('omni_open_attendance_modal', handleOpen);
  }, []);

  const handleDismiss = () => {
    if (user?.uid) {
      sessionStorage.setItem(`omni_clockin_dismissed_${user.uid}_${todayDateStr}`, 'true');
    }
    setIsOpen(false);
  };

  const handleQuickBindCurrentIp = async () => {
    if (!teamId || !detectedIp) return;
    setIsVerifying(true);
    setStatusMessage(t('attendanceModal.statusBindingIp', { ip: detectedIp }, '正在将当前网络公网出口 IP ({ip}) 登记为公司 Wi-Fi...'));
    try {
      const currentIps = attendanceRules?.officeWifi?.allowedIps || [];
      const updatedIps = Array.from(new Set([...currentIps, detectedIp]));
      const updatedRules = {
        ...attendanceRules,
        officeWifi: {
          ...(attendanceRules.officeWifi || {}),
          allowedIps: updatedIps
        }
      };
      await FirestoreStore.saveAttendanceRules(teamId, updatedRules);
      setAttendanceRules(updatedRules);
      showToast(t('attendanceModal.toastIpBound', { ip: detectedIp }, '已成功将 IP ({ip}) 设为公司 Wi-Fi！正在立即打卡...'));
      setTimeout(() => {
        handlePunch(activePunch);
      }, 500);
    } catch (e) {
      setStatusMessage(t('attendanceModal.bindFailed', { msg: e.message }, '绑定失败: {msg}'));
      setIsVerifying(false);
    }
  };

  const getPunchTypeLabel = (pType) => {
    switch (pType) {
      case 'CLOCK_IN': return t('analytics.clockInBtn', '上班签到');
      case 'LUNCH_OUT': return t('analytics.lunchOutBtn', '午休离开');
      case 'LUNCH_IN': return t('analytics.lunchInBtn', '午休返回');
      case 'CLOCK_OUT': return t('analytics.clockOutBtn', '下班签退');
      default: return pType;
    }
  };

  // Guarded punch handler for strict clock out detection
  const handlePunchWithGuard = (punchType = 'CLOCK_IN', force = false) => {
    // 提前签退防呆拦截 (Strict Clock-Out Guard)
    if (punchType === 'CLOCK_OUT' && !force && todayClockIn) {
      const inDate = todayClockIn.timestamp?.toDate ? todayClockIn.timestamp.toDate() : new Date(todayClockIn.timestamp);
      const shift = CascadeShiftEngine.matchShift(inDate, attendanceRules?.shiftConfig);
      const now = new Date();
      const nowMin = CascadeShiftEngine.getDateMinutesOfDay(now);

      if (nowMin < shift.endMinutes) {
        const diffSec = Math.round((shift.endMinutes - nowMin) * 60);
        const desc = diffSec >= 60 ? `${Math.floor(diffSec / 60)}分${diffSec % 60}秒` : `${diffSec}秒`;
        setEarlyClockOutWarning({
          shift,
          diffSec,
          desc
        });
        return;
      }
    }
    setEarlyClockOutWarning(null);
    handlePunch(punchType);
  };

  // 6. Two-stage Zero-Trust Verification Punch Action
  const handlePunch = async (punchType = 'CLOCK_IN') => {
    if (!teamId || !user) return;
    setIsVerifying(true);
    setStatusMessage(
      workMode === 'WFH'
        ? t('attendanceModal.statusConnectingWfh', '正在提交居家办公 (WFH) 安全打卡...')
        : t('attendanceModal.statusDetecting', '正在探测当前网络环境，核验企业 Wi-Fi 公网出口 IP...')
    );

    const picName = userProfile?.displayName || userProfile?.name || user?.email?.split('@')[0] || t('analytics.defaultPicName', '顾问');

    try {
      // Stage 1: Wi-Fi Public IP check / Stage 0 WFH check (pass coords: null)
      let stage1Res;
      try {
        const resp = await fetch(getApiUrl('/api/attendance/verify'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            teamId,
            userId: user?.uid,
            userRole: userProfile?.role,
            userWfhAllowed: canWfh,
            type: punchType,
            workMode: canWfh ? workMode : 'OFFICE',
            wfhNote: canWfh ? wfhNote.trim() : '',
            rules: attendanceRules,
            coords: null
          })
        });
        stage1Res = await resp.json();
      } catch (err) {
        throw new Error(t('attendanceModal.errServiceUnreachable', '无法连接考勤核验服务，请检查网络连接'));
      }

      const r1 = stage1Res?.result;
      if (r1?.client_ip) {
        setDetectedIp(r1.client_ip);
      }
      if (r1?.apple_help) {
        setAppleHelpMsg(r1.apple_help);
      } else if (r1?.passed) {
        setAppleHelpMsg('');
      }

      // Case 1: Rule disabled OR Wi-Fi IP passed OR WFH passed!
      if (r1?.passed) {
        const isWfh = r1.verify_method === 'WFH';
        const isWifi = r1.verify_method === 'WIFI_IP';
        const methodName = isWfh
          ? t('analytics.methodWfh', '居家办公 (WFH)')
          : isWifi
            ? t('analytics.methodWifi', '公司 Wi-Fi 内网认证')
            : t('analytics.methodRuleDisabled', '规则未限制');
        const verifySnapshot = {
          method: r1.verify_method,
          methodName,
          ip: r1.client_ip || r1.hit_ip || '',
          wfhNote: isWfh ? wfhNote.trim() : '',
          timestamp: new Date().toISOString()
        };

        try {
          await FirestoreStore.addAttendanceRecord(teamId, {
            teamId,
            userId: user.uid,
            userEmail: user.email || '',
            picName,
            type: punchType,
            verifyMethod: r1.verify_method,
            verifySnapshot,
            note: `[${verifySnapshot.methodName}] ${getPunchTypeLabel(punchType)}${isWfh && wfhNote.trim() ? ': ' + wfhNote.trim() : ''}`
          });
        } catch (storeErr) {
          console.warn("Attendance persistence notice:", storeErr?.message || storeErr);
        }

        let successTip = isWfh
          ? t('attendanceModal.toastWfhSuccess', '🏠 居家办公 (WFH) 打卡成功！')
          : isWifi
            ? t('attendanceModal.toastWifiSuccess', { ip: r1.client_ip || '' }, '命中公司 Wi-Fi 认证，打卡成功！(IP: {ip})')
            : t('analytics.checkinSuccess', '打卡成功！');

        if (punchType === 'CLOCK_IN') {
          const shift = CascadeShiftEngine.matchShift(new Date(), attendanceRules?.shiftConfig);
          successTip += ` (${shift.name}，底线: ${shift.endStr})`;
        }

        showToast(successTip);
        setIsVerifying(false);
        setStatusMessage('');
        
        // Auto-close modal after 1.5s on success
        setTimeout(() => setIsOpen(false), 1500);
        return;
      }

      // Case 2: Wi-Fi not matched -> enter Stage 2 (100m GPS Geofence)
      if (r1?.code === 'NEED_GPS') {
        setStatusMessage(t('attendanceModal.statusCheckingGps', '未连接公司 Wi-Fi，正在调用高精度 GPS 校验 100 米考勤围栏...'));

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
          if (geoErr.code === 1) reason = t('analytics.geoErrDenied', '浏览器定位权限被拒绝。苹果手机请至「设置 -> 隐私与安全性 -> 定位服务 -> Safari」开启定位并打开「精确位置」，或在当前 Wi-Fi 设置中关闭「限制 IP 地址跟踪」！');
          else if (geoErr.code === 2) reason = t('analytics.geoErrFailed', '位置获取失败，请确保设备开启了高精度定位服务。');
          else if (geoErr.code === 3) reason = t('analytics.geoErrTimeout', 'GPS 定位获取超时，请移至窗边或连接公司 Wi-Fi 重试。');
          throw new Error(reason);
        }

        setStatusMessage(t('attendanceModal.statusGpsCaptured', { acc: Math.round(pos.coords.accuracy) }, '已捕获 GPS (精度 ±{acc}m)，正在提交后端核验...'));

        const resp2 = await fetch(getApiUrl('/api/attendance/verify'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            teamId,
            type: punchType,
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
            methodName: t('analytics.methodGeofence', '100米地理围栏'),
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
              type: punchType,
              verifyMethod: 'GPS_GEOFENCE',
              verifySnapshot,
              note: `[100m / ${Math.round(r2.effective_distance)}m] ${getPunchTypeLabel(punchType)}`
            });
          } catch (storeErr) {
            console.warn("Attendance persistence notice:", storeErr?.message || storeErr);
          }

          let successTip = t('analytics.successGpsToast', { dist: Math.round(r2.effective_distance) }, '打卡成功！已通过 100 米地理围栏核验（距公司约 {dist} 米）');
          if (punchType === 'CLOCK_IN') {
            const shift = CascadeShiftEngine.matchShift(new Date(), attendanceRules?.shiftConfig);
            successTip += ` (${shift.name}，底线: ${shift.endStr})`;
          }
          showToast(successTip);
          setIsVerifying(false);
          setStatusMessage('');
          setTimeout(() => setIsOpen(false), 1500);
          return;
        } else {
          throw new Error(r2?.message || t('analytics.geofenceExceeded', '超出公司 100 米考勤有效范围'));
        }
      }

      throw new Error(r1?.message || t('analytics.checkinFailedGeneral', '考勤核验未通过'));

    } catch (err) {
      console.error('考勤失败:', err);
      const errMsg = err?.message || t('analytics.checkinFailedGeneral', '考勤核验未通过');
      setStatusMessage(t('analytics.failedCheckin', { msg: errMsg }, '打卡未通过：{msg}'));
      showToast(t('analytics.failedCheckin', { msg: errMsg }, '打卡未通过：{msg}'));
    } finally {
      setIsVerifying(false);
    }
  };

  if (!isOpen || !isHqTeam) return null;

  const hoursStr = String(currentTime.getHours()).padStart(2, '0');
  const minutesStr = String(currentTime.getMinutes()).padStart(2, '0');
  const secondsStr = String(currentTime.getSeconds()).padStart(2, '0');
  // Display-only locale (date-matching logic above intentionally stays on zh-CN)
  const displayLocale = lang === 'en' ? 'en-US' : 'zh-CN';
  const dateFullStr = currentTime.toLocaleDateString(displayLocale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  });

  const userName = userProfile?.displayName || userProfile?.name || user?.email?.split('@')[0] || t('attendanceModal.defaultUserName', '员工');

  // Format record timestamps
  const inTimeStr = todayClockIn ? (
    todayClockIn.timestamp?.toDate ? todayClockIn.timestamp.toDate() : new Date(todayClockIn.timestamp)
  ).toLocaleTimeString(displayLocale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null;

  const lunchOutTimeStr = todayLunchOut ? (
    todayLunchOut.timestamp?.toDate ? todayLunchOut.timestamp.toDate() : new Date(todayLunchOut.timestamp)
  ).toLocaleTimeString(displayLocale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null;

  const lunchInTimeStr = todayLunchIn ? (
    todayLunchIn.timestamp?.toDate ? todayLunchIn.timestamp.toDate() : new Date(todayLunchIn.timestamp)
  ).toLocaleTimeString(displayLocale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null;

  const outTimeStr = todayClockOut ? (
    todayClockOut.timestamp?.toDate ? todayClockOut.timestamp.toDate() : new Date(todayClockOut.timestamp)
  ).toLocaleTimeString(displayLocale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null;

  // Derive status badge
  let statusBadge = {
    bg: 'rgba(234, 179, 8, 0.12)',
    color: 'var(--accent-amber)',
    dot: 'var(--accent-amber)',
    text: t('attendanceModal.statusPending', '今日待签到 · 上班考勤')
  };
  if (todayClockOut) {
    statusBadge = {
      bg: 'rgba(59, 130, 246, 0.15)',
      color: 'var(--accent-blue)',
      dot: 'var(--accent-blue)',
      text: t('attendanceModal.statusClockedOut', { time: outTimeStr }, '今日已下班签退 ({time})')
    };
  } else if (ENABLE_LUNCH_PUNCH && todayLunchOut && !todayLunchIn) {
    statusBadge = {
      bg: 'rgba(245, 158, 11, 0.15)',
      color: 'var(--accent-amber)',
      dot: 'var(--accent-amber)',
      text: t('attendanceModal.statusLunchOut', { time: lunchOutTimeStr }, '午休中 · 离开 ({time})')
    };
  } else if (ENABLE_LUNCH_PUNCH && todayLunchIn) {
    statusBadge = {
      bg: 'rgba(6, 182, 212, 0.15)',
      color: 'var(--accent-cyan, #06b6d4)',
      dot: 'var(--accent-cyan, #06b6d4)',
      text: t('attendanceModal.statusLunchIn', { time: lunchInTimeStr }, '下午工作中 · 返回 ({time})')
    };
  } else if (todayClockIn) {
    const isWfhRecord = todayClockIn.verifyMethod === 'WFH';
    statusBadge = {
      bg: isWfhRecord ? 'rgba(168, 85, 247, 0.15)' : 'rgba(16, 185, 129, 0.12)',
      color: isWfhRecord ? '#c084fc' : 'var(--accent-emerald)',
      dot: isWfhRecord ? '#c084fc' : 'var(--accent-emerald)',
      text: isWfhRecord
        ? t('attendanceModal.statusWfhClockedIn', { time: inTimeStr }, '居家办公 (WFH) · 已签到 ({time})')
        : t('attendanceModal.statusClockedIn', { time: inTimeStr }, '工作中 · 已签到 ({time})')
    };
  }

  const getActionConfig = (type) => {
    switch (type) {
      case 'CLOCK_IN':
        return {
          label: t('attendanceModal.clockInNow', '立即上班打卡'),
          icon: 'ph-sign-in',
          bg: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          shadow: '0 8px 20px -4px rgba(16, 185, 129, 0.4)'
        };
      case 'LUNCH_OUT':
        return {
          label: t('attendanceModal.clockLunchOutNow', '午休离开打卡'),
          icon: 'ph-coffee',
          bg: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
          shadow: '0 8px 20px -4px rgba(245, 158, 11, 0.4)'
        };
      case 'LUNCH_IN':
        return {
          label: t('attendanceModal.clockLunchInNow', '午休回来打卡'),
          icon: 'ph-briefcase',
          bg: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
          shadow: '0 8px 20px -4px rgba(6, 182, 212, 0.4)'
        };
      case 'CLOCK_OUT':
      default:
        return {
          label: t('attendanceModal.clockOutNow', '下班签退打卡'),
          icon: 'ph-sign-out',
          bg: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
          shadow: '0 8px 20px -4px rgba(59, 130, 246, 0.4)'
        };
    }
  };

  const currentAction = getActionConfig(activePunch);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 10000,
      background: 'rgba(0, 0, 0, 0.72)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--space-4)'
    }}>
      {/* Toast Alert */}
      {toastMsg && (
        <div style={{
          position: 'fixed',
          top: '24px',
          zIndex: 10001,
          background: 'rgba(15, 23, 42, 0.95)',
          color: '#fff',
          padding: '12px 24px',
          borderRadius: 'var(--radius-full)',
          boxShadow: '0 15px 30px -5px rgba(0,0,0,0.5)',
          border: '1px solid var(--accent-emerald)',
          fontSize: '14px',
          backdropFilter: 'blur(12px)'
        }}>
          {toastMsg}
        </div>
      )}

      <div className="bezel-shell" style={{ maxWidth: '460px', width: '100%', animation: 'scaleUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)' }}>
        <div className="bezel-core" style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
          
          {/* Header Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px' }}>
                <i className="ph-bold ph-clock-user"></i>
              </div>
              <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{t('attendanceModal.title', '日常考勤签到')}</span>
            </div>
            <button
              onClick={handleDismiss}
              style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: 'var(--text-secondary)', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              title={t('attendanceModal.later', '稍后打卡')}
            >
              <i className="ph-bold ph-x"></i>
            </button>
          </div>

          {/* User Greeting */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 4px 0', color: 'var(--text-primary)' }}>
              {t('attendanceModal.greeting', { name: userName }, '您好，{name}')}
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              {dateFullStr}
            </p>
          </div>

          {/* Digital Clock Card */}
          <div style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-5) var(--space-4)',
            marginBottom: 'var(--space-4)'
          }}>
            <div style={{
              fontSize: '40px',
              fontWeight: '800',
              fontFamily: 'monospace',
              letterSpacing: '2px',
              color: 'var(--text-primary)',
              lineHeight: 1
            }}>
              {hoursStr}<span style={{ opacity: currentTime.getSeconds() % 2 === 0 ? 1 : 0.3 }}>:</span>{minutesStr}<span style={{ opacity: currentTime.getSeconds() % 2 === 0 ? 1 : 0.3 }}>:</span>{secondsStr}
            </div>

            {/* Attendance Status Pill */}
            <div style={{ marginTop: 'var(--space-3)', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '16px', background: statusBadge.bg, fontSize: '12px', fontWeight: '600', color: statusBadge.color }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusBadge.dot }}></span>
              {statusBadge.text}
            </div>
          </div>

          {/* Today Attendance Grid (2 cards when lunch punch disabled, 4 cards when enabled) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: ENABLE_LUNCH_PUNCH ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)',
            gap: ENABLE_LUNCH_PUNCH ? '6px' : 'var(--space-3)',
            marginBottom: 'var(--space-4)',
            textAlign: 'center',
            fontSize: '11px'
          }}>
            {/* Stage 1: Clock In */}
            <div
              onClick={() => setSelectedPunchType('CLOCK_IN')}
              style={{
                background: activePunch === 'CLOCK_IN' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255,255,255,0.02)',
                padding: ENABLE_LUNCH_PUNCH ? '8px 4px' : '12px 8px',
                borderRadius: 'var(--radius-md)',
                border: activePunch === 'CLOCK_IN' ? '1px solid var(--accent-emerald)' : '1px solid var(--border-hairline)',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              <div style={{ color: inTimeStr ? 'var(--accent-emerald)' : 'var(--text-muted)', marginBottom: '3px', fontWeight: '600', fontSize: ENABLE_LUNCH_PUNCH ? '11px' : '13px' }}>
                <i className="ph-bold ph-sign-in" style={{ marginRight: '3px' }}></i>
                {t('attendanceModal.clockInLabel', '上班')}
              </div>
              <div style={{ fontWeight: '700', color: inTimeStr ? 'var(--accent-emerald)' : 'var(--text-muted)', fontFamily: 'monospace', fontSize: ENABLE_LUNCH_PUNCH ? '11px' : '13px' }}>
                {inTimeStr ? inTimeStr.slice(0, 5) : t('attendanceModal.notClockedIn', '未签到')}
              </div>
            </div>

            {/* Stage 2 & 3: Lunch Out & In (When enabled) */}
            {ENABLE_LUNCH_PUNCH && (
              <>
                <div
                  onClick={() => setSelectedPunchType('LUNCH_OUT')}
                  style={{
                    background: activePunch === 'LUNCH_OUT' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(255,255,255,0.02)',
                    padding: '8px 4px',
                    borderRadius: 'var(--radius-md)',
                    border: activePunch === 'LUNCH_OUT' ? '1px solid var(--accent-amber)' : '1px solid var(--border-hairline)',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  <div style={{ color: lunchOutTimeStr ? 'var(--accent-amber)' : 'var(--text-muted)', marginBottom: '3px', fontWeight: '600' }}>
                    <i className="ph-bold ph-coffee" style={{ marginRight: '3px' }}></i>
                    {t('attendanceModal.lunchOutLabel', '午休离开')}
                  </div>
                  <div style={{ fontWeight: '700', color: lunchOutTimeStr ? 'var(--accent-amber)' : 'var(--text-muted)', fontFamily: 'monospace', fontSize: '11px' }}>
                    {lunchOutTimeStr ? lunchOutTimeStr.slice(0, 5) : t('attendanceModal.notClockedLunchOut', '未记录')}
                  </div>
                </div>

                <div
                  onClick={() => setSelectedPunchType('LUNCH_IN')}
                  style={{
                    background: activePunch === 'LUNCH_IN' ? 'rgba(6, 182, 212, 0.12)' : 'rgba(255,255,255,0.02)',
                    padding: '8px 4px',
                    borderRadius: 'var(--radius-md)',
                    border: activePunch === 'LUNCH_IN' ? '1px solid var(--accent-cyan, #06b6d4)' : '1px solid var(--border-hairline)',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  <div style={{ color: lunchInTimeStr ? 'var(--accent-cyan, #06b6d4)' : 'var(--text-muted)', marginBottom: '3px', fontWeight: '600' }}>
                    <i className="ph-bold ph-briefcase" style={{ marginRight: '3px' }}></i>
                    {t('attendanceModal.lunchInLabel', '午休返回')}
                  </div>
                  <div style={{ fontWeight: '700', color: lunchInTimeStr ? 'var(--accent-cyan, #06b6d4)' : 'var(--text-muted)', fontFamily: 'monospace', fontSize: '11px' }}>
                    {lunchInTimeStr ? lunchInTimeStr.slice(0, 5) : t('attendanceModal.notClockedLunchIn', '未记录')}
                  </div>
                </div>
              </>
            )}

            {/* Stage 4: Clock Out */}
            <div
              onClick={() => setSelectedPunchType('CLOCK_OUT')}
              style={{
                background: activePunch === 'CLOCK_OUT' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255,255,255,0.02)',
                padding: ENABLE_LUNCH_PUNCH ? '8px 4px' : '12px 8px',
                borderRadius: 'var(--radius-md)',
                border: activePunch === 'CLOCK_OUT' ? '1px solid var(--accent-blue)' : '1px solid var(--border-hairline)',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              <div style={{ color: outTimeStr ? 'var(--accent-blue)' : 'var(--text-muted)', marginBottom: '3px', fontWeight: '600', fontSize: ENABLE_LUNCH_PUNCH ? '11px' : '12px' }}>
                <i className="ph-bold ph-sign-out" style={{ marginRight: '3px' }}></i>
                {t('attendanceModal.clockOutLabel', '下班')}
              </div>
              <div style={{ fontWeight: '700', color: outTimeStr ? 'var(--accent-blue)' : 'var(--text-muted)', fontFamily: 'monospace', fontSize: ENABLE_LUNCH_PUNCH ? '11px' : '13px' }}>
                {outTimeStr ? outTimeStr.slice(0, 5) : t('attendanceModal.pendingClockOut', '待签退')}
              </div>
            </div>
          </div>

          {/* Quick Action Selector Pills (Only shown when lunch punch is enabled) */}
          {ENABLE_LUNCH_PUNCH && (
            <div style={{
              display: 'flex',
              gap: '4px',
              marginBottom: 'var(--space-4)',
              background: 'rgba(255,255,255,0.03)',
              padding: '4px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-hairline)'
            }}>
              {[
                { id: 'CLOCK_IN', label: t('analytics.clockInBtn', '上班签到'), icon: 'ph-sign-in' },
                { id: 'LUNCH_OUT', label: t('analytics.lunchOutBtn', '午休离开'), icon: 'ph-coffee' },
                { id: 'LUNCH_IN', label: t('analytics.lunchInBtn', '午休返回'), icon: 'ph-briefcase' },
                { id: 'CLOCK_OUT', label: t('analytics.clockOutBtn', '下班签退'), icon: 'ph-sign-out' },
              ].map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedPunchType(item.id)}
                  style={{
                    flex: 1,
                    padding: '5px 2px',
                    fontSize: '11px',
                    fontWeight: activePunch === item.id ? '700' : '500',
                    borderRadius: 'var(--radius-sm)',
                    background: activePunch === item.id ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                    border: activePunch === item.id ? '1px solid var(--border-interactive)' : 'none',
                    color: activePunch === item.id ? '#fff' : 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    transition: 'all 0.15s'
                  }}
                >
                  <i className={`ph-bold ${item.icon}`} style={{ fontSize: '12px' }}></i>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Office vs WFH Mode Selector (Only visible if user has WFH permission) */}
          {attendanceRules.allowWfh !== false && canWfh && (
            <div style={{ marginBottom: 'var(--space-4)', textAlign: 'left' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '6px',
                background: 'rgba(255,255,255,0.03)',
                padding: '4px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)'
              }}>
                <button
                  type="button"
                  onClick={() => setWorkMode('OFFICE')}
                  style={{
                    padding: '7px 10px',
                    fontSize: '12px',
                    fontWeight: '600',
                    borderRadius: 'var(--radius-sm)',
                    border: workMode === 'OFFICE' ? '1px solid rgba(16, 185, 129, 0.4)' : 'none',
                    background: workMode === 'OFFICE' ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                    color: workMode === 'OFFICE' ? 'var(--accent-emerald)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <i className="ph-bold ph-buildings"></i>
                  <span>{t('attendanceModal.modeOffice', '办公室打卡')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWorkMode('WFH')}
                  style={{
                    padding: '7px 10px',
                    fontSize: '12px',
                    fontWeight: '600',
                    borderRadius: 'var(--radius-sm)',
                    border: workMode === 'WFH' ? '1px solid rgba(168, 85, 247, 0.45)' : 'none',
                    background: workMode === 'WFH' ? 'rgba(168, 85, 247, 0.18)' : 'transparent',
                    color: workMode === 'WFH' ? '#c084fc' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <i className="ph-bold ph-house-line"></i>
                  <span>{t('attendanceModal.modeWfh', '居家办公 (WFH)')}</span>
                </button>
              </div>

              {workMode === 'WFH' && (
                <div style={{ marginTop: '8px' }}>
                  <input
                    type="text"
                    className="input"
                    style={{ width: '100%', height: '34px', fontSize: '12px' }}
                    placeholder={t('attendanceModal.wfhNotePlaceholder', '选填居家办公备注 (如：今日远程跟进候选人)...')}
                    value={wfhNote}
                    onChange={(e) => setWfhNote(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          {/* Status / Verification Progress Banner */}
          {statusMessage && (
            <div style={{
              background: isVerifying ? 'rgba(59, 130, 246, 0.12)' : 'rgba(239, 68, 68, 0.12)',
              border: `1px solid ${isVerifying ? 'rgba(59, 130, 246, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              borderRadius: 'var(--radius-md)',
              padding: '10px 14px',
              marginBottom: 'var(--space-4)',
              fontSize: '12px',
              color: isVerifying ? 'var(--accent-blue)' : 'var(--accent-rose)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              textAlign: 'left'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className={`ph-bold ${isVerifying ? 'ph-spinner-gap' : 'ph-warning-circle'}`} style={{ animation: isVerifying ? 'spin 1s linear infinite' : 'none', fontSize: '16px', flexShrink: 0 }}></i>
                <span style={{ lineHeight: 1.4 }}>{statusMessage}</span>
              </div>

              {appleHelpMsg && workMode !== 'WFH' && (
                <div style={{
                  background: 'rgba(234, 179, 8, 0.12)',
                  border: '1px solid rgba(234, 179, 8, 0.35)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '8px 10px',
                  fontSize: '11px',
                  color: 'var(--accent-amber)',
                  lineHeight: 1.45,
                  display: 'flex',
                  gap: '6px'
                }}>
                  <i className="ph-bold ph-apple-logo" style={{ fontSize: '14px', flexShrink: 0, marginTop: '2px' }}></i>
                  <span>{appleHelpMsg}</span>
                </div>
              )}

              {!isVerifying && isOwner && detectedIp && workMode !== 'WFH' && (
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '12px',
                    marginTop: '4px',
                    borderColor: 'var(--accent-amber)',
                    color: 'var(--accent-amber)',
                    background: 'rgba(234, 179, 8, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                  onClick={handleQuickBindCurrentIp}
                >
                  <i className="ph-bold ph-wifi-high"></i>
                  <span>{t('attendanceModal.quickBindIp', { ip: detectedIp }, '【管理员快捷设定】将此网络 IP ({ip}) 设为公司 Wi-Fi 并打卡')}</span>
                </button>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {/* Strict Clock-Out Warning Card */}
            {earlyClockOutWarning && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-3)',
                marginBottom: 'var(--space-3)',
                fontSize: '12px'
              }}>
                <div style={{ fontWeight: '700', color: '#f87171', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <i className="ph-bold ph-warning-circle"></i>
                  <span>{t('attendanceModal.earlyWarningTitle', '⚠️ 提前签退预警 (严格考核)')}</span>
                </div>
                <div style={{ color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: '8px' }}>
                  {t('attendanceModal.earlyWarningText', { end: earlyClockOutWarning.shift?.endStr || '18:00', desc: earlyClockOutWarning.desc }, '当前核定下班底线为 {end}，距离达标还差 {desc}。未达底线签退将直接被计为迟到/早退违规！')}
                </div>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button
                    className="btn btn-sm btn-secondary"
                    style={{ fontSize: '11px', padding: '3px 10px' }}
                    onClick={() => setEarlyClockOutWarning(null)}
                  >
                    {t('attendanceModal.earlyWait', '再等一下 (保住全勤)')}
                  </button>
                  <button
                    className="btn btn-sm btn-outline"
                    style={{ fontSize: '11px', padding: '3px 10px', borderColor: '#ef4444', color: '#f87171' }}
                    onClick={() => handlePunchWithGuard('CLOCK_OUT', true)}
                  >
                    {t('attendanceModal.earlyForce', '坚持提前签退')}
                  </button>
                </div>
              </div>
            )}

            {!ENABLE_LUNCH_PUNCH ? (
              !todayClockIn ? (
                <button
                  className="btn btn-primary"
                  style={{
                    width: '100%',
                    height: '46px',
                    fontSize: '15px',
                    fontWeight: '700',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: '0 8px 20px -4px rgba(16, 185, 129, 0.4)',
                    gap: '8px'
                  }}
                  disabled={isVerifying}
                  onClick={() => handlePunchWithGuard('CLOCK_IN')}
                >
                  <i className="ph-bold ph-sign-in"></i>
                  {isVerifying ? t('attendanceModal.verifying', '正在安全核验...') : t('attendanceModal.clockInNow', '立即上班打卡')}
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  style={{
                    width: '100%',
                    height: '46px',
                    fontSize: '15px',
                    fontWeight: '700',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: '0 8px 20px -4px rgba(59, 130, 246, 0.4)',
                    gap: '8px'
                  }}
                  disabled={isVerifying}
                  onClick={() => handlePunchWithGuard('CLOCK_OUT')}
                >
                  <i className="ph-bold ph-sign-out"></i>
                  {isVerifying ? t('attendanceModal.verifying', '正在安全核验...') : t('attendanceModal.clockOutNow', '下班签退打卡')}
                </button>
              )
            ) : (
              <button
                className="btn btn-primary"
                style={{
                  width: '100%',
                  height: '46px',
                  fontSize: '15px',
                  fontWeight: '700',
                  background: currentAction.bg,
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: currentAction.shadow,
                  gap: '8px'
                }}
                disabled={isVerifying}
                onClick={() => handlePunchWithGuard(activePunch)}
              >
                <i className={`ph-bold ${currentAction.icon}`}></i>
                {isVerifying ? t('attendanceModal.verifying', '正在安全核验...') : currentAction.label}
              </button>
            )}

            <button
              className="btn btn-outline"
              style={{ width: '100%', height: '36px', fontSize: '12px', border: 'none', color: 'var(--text-muted)' }}
              onClick={handleDismiss}
              disabled={isVerifying}
            >
              {t('attendanceModal.later', '稍后打卡')}
            </button>
          </div>

          {/* Security Subtitle */}
          <div style={{ marginTop: 'var(--space-4)', fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <i className="ph-bold ph-shield-check" style={{ color: 'var(--accent-emerald)' }}></i>
            <span>{t('attendanceModal.securityNote', '企业级安全风控：支持公司 Wi-Fi 自动秒验 或 100 米地理围栏')}</span>
          </div>

        </div>
      </div>

      <style jsx>{`
        @keyframes scaleUp {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
