'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../lib/auth-context';
import { FirestoreStore } from '../lib/firestore-store';
import { SystemLogger } from '../lib/logger';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

const getApiUrl = (path) => {
  return path;
};

export default function AttendanceModal() {
  const { user, userProfile, teamId, isOwner, isHqTeam } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [detectedIp, setDetectedIp] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [userRecords, setUserRecords] = useState([]);
  const [attendanceRules, setAttendanceRules] = useState({
    enabled: true,
    maxDistanceMeters: 100,
    maxDriftCompensation: 40,
    officeLocations: [],
    officeWifi: { allowedIps: [] }
  });
  const [toastMsg, setToastMsg] = useState('');
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

  const todayClockOut = useMemo(() => {
    return userRecords.find(r => {
      const d = r.timestamp?.toDate ? r.timestamp.toDate() : new Date(r.timestamp);
      const str = d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
      return str === todayDateStr && r.type === 'CLOCK_OUT';
    });
  }, [userRecords, todayDateStr]);

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
    setStatusMessage(`正在将当前网络公网出口 IP (${detectedIp}) 登记为公司 Wi-Fi...`);
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
      showToast(`已成功将 IP (${detectedIp}) 设为公司 Wi-Fi！正在立即打卡...`);
      setTimeout(() => {
        handlePunch(todayClockIn ? 'CLOCK_OUT' : 'CLOCK_IN');
      }, 500);
    } catch (e) {
      setStatusMessage(`绑定失败: ${e.message}`);
      setIsVerifying(false);
    }
  };

  // 6. Two-stage Zero-Trust Verification Punch Action
  const handlePunch = async (punchType = 'CLOCK_IN') => {
    if (!teamId || !user) return;
    setIsVerifying(true);
    setStatusMessage('正在探测当前网络环境，核验企业 Wi-Fi 公网出口 IP...');

    const picName = userProfile?.displayName || userProfile?.name || user?.email?.split('@')[0] || '顾问';

    try {
      // Stage 1: Wi-Fi Public IP check (pass coords: null)
      let stage1Res;
      try {
        const resp = await fetch(getApiUrl('/api/attendance/verify'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            teamId,
            type: punchType,
            rules: attendanceRules,
            coords: null
          })
        });
        stage1Res = await resp.json();
      } catch (err) {
        throw new Error('无法连接考勤核验服务，请检查网络连接');
      }

      const r1 = stage1Res?.result;
      if (r1?.client_ip) {
        setDetectedIp(r1.client_ip);
      }

      // Case 1: Rule disabled OR Wi-Fi IP passed!
      if (r1?.passed) {
        const isWifi = r1.verify_method === 'WIFI_IP';
        const verifySnapshot = {
          method: r1.verify_method,
          methodName: isWifi ? '公司 Wi-Fi 内网认证' : '规则未限制',
          ip: r1.client_ip || r1.hit_ip || '',
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
            note: `[${verifySnapshot.methodName}] ${punchType === 'CLOCK_IN' ? '上班签到' : '下班签退'}`
          });
        } catch (storeErr) {
          console.warn("Attendance persistence notice:", storeErr?.message || storeErr);
        }

        showToast(isWifi
          ? `命中公司 Wi-Fi 认证，打卡成功！(IP: ${r1.client_ip || ''})`
          : `打卡成功！`);
        setIsVerifying(false);
        setStatusMessage('');
        
        // Auto-close modal after 1.5s on success
        setTimeout(() => setIsOpen(false), 1500);
        return;
      }

      // Case 2: Wi-Fi not matched -> enter Stage 2 (100m GPS Geofence)
      if (r1?.code === 'NEED_GPS') {
        setStatusMessage('未连接公司 Wi-Fi，正在调用高精度 GPS 校验 100 米考勤围栏...');

        if (typeof window === 'undefined' || !navigator.geolocation) {
          throw new Error('当前浏览器不支持地理定位，且未连接公司 Wi-Fi，无法完成考勤打卡。');
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
          let reason = '定位授权或信号异常';
          if (geoErr.code === 1) reason = '您拒绝了浏览器地理定位授权。请在浏览器地址栏允许定位权限，或连接公司 Wi-Fi 直接打卡。';
          else if (geoErr.code === 2) reason = '位置获取失败，请确保设备开启了高精度定位服务。';
          else if (geoErr.code === 3) reason = 'GPS 定位获取超时，请移至窗边或连接公司 Wi-Fi 重试。';
          throw new Error(reason);
        }

        setStatusMessage(`已捕获 GPS (精度 ±${Math.round(pos.coords.accuracy)}m)，正在提交后端核验...`);

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
            methodName: '100米地理围栏',
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
              note: `[100米围栏 / 距${Math.round(r2.effective_distance)}m] ${punchType === 'CLOCK_IN' ? '上班签到' : '下班签退'}`
            });
          } catch (storeErr) {
            console.warn("Attendance persistence notice:", storeErr?.message || storeErr);
          }

          showToast(`打卡成功！已通过 100 米地理围栏核验（距公司约 ${Math.round(r2.effective_distance)} 米）`);
          setIsVerifying(false);
          setStatusMessage('');
          setTimeout(() => setIsOpen(false), 1500);
          return;
        } else {
          throw new Error(r2?.message || '超出公司 100 米考勤有效范围');
        }
      }

      throw new Error(r1?.message || '考勤核验未通过');

    } catch (err) {
      console.error('考勤失败:', err);
      const errMsg = err?.message || '考勤核验未通过';
      setStatusMessage(`打卡未通过：${errMsg}`);
      showToast(`打卡未通过：${errMsg}`);
    } finally {
      setIsVerifying(false);
    }
  };

  if (!isOpen || !isHqTeam) return null;

  const hoursStr = String(currentTime.getHours()).padStart(2, '0');
  const minutesStr = String(currentTime.getMinutes()).padStart(2, '0');
  const secondsStr = String(currentTime.getSeconds()).padStart(2, '0');
  const dateFullStr = currentTime.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  });

  const userName = userProfile?.displayName || userProfile?.name || user?.email?.split('@')[0] || '员工';

  // Format record timestamps
  const inTimeStr = todayClockIn ? (
    todayClockIn.timestamp?.toDate ? todayClockIn.timestamp.toDate() : new Date(todayClockIn.timestamp)
  ).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null;

  const outTimeStr = todayClockOut ? (
    todayClockOut.timestamp?.toDate ? todayClockOut.timestamp.toDate() : new Date(todayClockOut.timestamp)
  ).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null;

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

      <div className="bezel-shell" style={{ maxWidth: '440px', width: '100%', animation: 'scaleUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)' }}>
        <div className="bezel-core" style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
          
          {/* Header Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px' }}>
                <i className="ph-bold ph-clock-user"></i>
              </div>
              <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>日常考勤签到</span>
            </div>
            <button
              onClick={handleDismiss}
              style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: 'var(--text-secondary)', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              title="稍后打卡"
            >
              <i className="ph-bold ph-x"></i>
            </button>
          </div>

          {/* User Greeting */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 4px 0', color: 'var(--text-primary)' }}>
              您好，{userName}
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
            marginBottom: 'var(--space-5)'
          }}>
            <div style={{
              fontSize: '42px',
              fontWeight: '800',
              fontFamily: 'monospace',
              letterSpacing: '2px',
              color: 'var(--text-primary)',
              lineHeight: 1
            }}>
              {hoursStr}<span style={{ opacity: currentTime.getSeconds() % 2 === 0 ? 1 : 0.3 }}>:</span>{minutesStr}<span style={{ opacity: currentTime.getSeconds() % 2 === 0 ? 1 : 0.3 }}>:</span>{secondsStr}
            </div>

            {/* Attendance Status Pill */}
            <div style={{ marginTop: 'var(--space-3)', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '16px', background: todayClockIn ? 'rgba(16, 185, 129, 0.12)' : 'rgba(234, 179, 8, 0.12)', fontSize: '12px', fontWeight: '600', color: todayClockIn ? 'var(--accent-emerald)' : 'var(--accent-amber)' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: todayClockIn ? 'var(--accent-emerald)' : 'var(--accent-amber)' }}></span>
              {todayClockIn ? `今日已签到 (${inTimeStr})` : '今日待签到 · 上班考勤'}
            </div>
          </div>

          {/* Today Records Info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginBottom: 'var(--space-5)', textAlign: 'left', fontSize: '12px' }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)' }}>
              <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>上班打卡</div>
              <div style={{ fontWeight: '700', color: inTimeStr ? 'var(--accent-emerald)' : 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '13px' }}>
                {inTimeStr || '未签到'}
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)' }}>
              <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>下班打卡</div>
              <div style={{ fontWeight: '700', color: outTimeStr ? 'var(--accent-blue)' : 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '13px' }}>
                {outTimeStr || '待签退'}
              </div>
            </div>
          </div>

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

              {!isVerifying && isOwner && detectedIp && (
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
                  <span>【管理员快捷设定】将此网络 IP ({detectedIp}) 设为公司 Wi-Fi 并打卡</span>
                </button>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {!todayClockIn ? (
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
                onClick={() => handlePunch('CLOCK_IN')}
              >
                <i className="ph-bold ph-sign-in"></i>
                {isVerifying ? '正在安全核验...' : '立即上班打卡'}
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
                onClick={() => handlePunch('CLOCK_OUT')}
              >
                <i className="ph-bold ph-sign-out"></i>
                {isVerifying ? '正在安全核验...' : '下班签退打卡'}
              </button>
            )}

            <button
              className="btn btn-outline"
              style={{ width: '100%', height: '36px', fontSize: '12px', border: 'none', color: 'var(--text-muted)' }}
              onClick={handleDismiss}
              disabled={isVerifying}
            >
              稍后打卡
            </button>
          </div>

          {/* Security Subtitle */}
          <div style={{ marginTop: 'var(--space-4)', fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <i className="ph-bold ph-shield-check" style={{ color: 'var(--accent-emerald)' }}></i>
            <span>企业级安全风控：支持公司 Wi-Fi 自动秒验 或 100 米地理围栏</span>
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
