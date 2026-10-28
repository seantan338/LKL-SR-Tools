'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { useAuth } from './auth-context';
import { FirestoreStore } from './firestore-store';
import { Utils } from './utils';
import { useI18n } from './i18n-context';
import { isCandidateOwnedByUser } from './identity.mjs';
import CandidateDrawer from '../components/CandidateDrawer';

const NotificationContext = createContext();

export function useNotifications() {
  return useContext(NotificationContext);
}

const STALE_THRESHOLDS = {
  screening: { days: 3, severity: 'warning', text: '请及时推进' },
  phone: { days: 5, severity: 'warning', text: '等待初筛电话' },
  interview: { days: 7, severity: 'urgent', text: '面试结果待定，候选人可能流失' },
  offer: { days: 10, severity: 'urgent', text: 'Offer 待确认，请尽快跟进' },
  pre_onboarding: { days: 14, severity: 'warning', text: '入职准备未更新' },
};

export function NotificationProvider({ children }) {
  const pathname = usePathname();
  const { teamId, user, role, userProfile, isOwner, isManager } = useAuth();
  const { t } = useI18n();
  // Latest translator for side-effect code paths (alert dispatcher) without adding `t` to their deps,
  // so switching language never re-runs the effect that fires chimes / WhatsApp / desktop notifications.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const [rawCandidates, setRawCandidates] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [candidatesLoading, setCandidatesLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [localDismissed, setLocalDismissed] = useState([]); // Array of notification IDs dismissed
  const [localRead, setLocalRead] = useState([]); // Array of notification IDs read

  // Subscribe to team members for canonical PIC ownership disambiguation
  useEffect(() => {
    if (!user?.uid) {
      setTeamMembers([]);
      return;
    }
    const usersRef = collection(db, 'users');
    const unsub = onSnapshot(usersRef, (snap) => {
      const mems = snap.docs.map(d => ({
        id: d.id,
        uid: d.id,
        ...d.data(),
        name: d.data().displayName || d.data().name || (d.data().email ? d.data().email.split('@')[0] : '')
      }));
      setTeamMembers(mems);
    }, () => {});
    return () => unsub();
  }, [user?.uid]);

  // PDPA Role & Ownership Filtering:
  // - Owner / Manager see all candidates in the active team
  // - Recruiter (PIC) only sees candidates owned by themselves
  const isSupervisor = Boolean(isOwner || isManager || role === 'owner' || role === 'manager');

  const myScopedCandidates = useMemo(() => {
    if (isSupervisor) return rawCandidates;
    return rawCandidates.filter(c => isCandidateOwnedByUser(c, user, userProfile, teamMembers));
  }, [rawCandidates, isSupervisor, user, userProfile, teamMembers]);

  // Leaderboard only computes aggregated advisor KPI counts (zero candidate PII rendered)
  const candidates = pathname === '/leaderboard' ? rawCandidates : myScopedCandidates;

  // Global manual refresh listener
  useEffect(() => {
    const onGlobalRefresh = () => setRefreshTrigger(prev => prev + 1);
    window.addEventListener('talent_flow_refresh', onGlobalRefresh);
    return () => window.removeEventListener('talent_flow_refresh', onGlobalRefresh);
  }, []);
  
  // High-precision clock ticker for real-time reminder firing
  const [currentTime, setCurrentTime] = useState(() => new Date());

  // Interactive real-time reminder popup cards
  const [activeAlerts, setActiveAlerts] = useState([]);
  const alertedRemindersRef = useRef(new Set());
  const isInitialCheckDoneRef = useRef(false);
  const [desktopNotifState, setDesktopNotifState] = useState('default');

  // Global Candidate Drawer state for instant notification navigation
  const [drawerCandidate, setDrawerCandidate] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Sync drawer candidate with fresh Firestore candidate list
  useEffect(() => {
    if (drawerCandidate?.id && myScopedCandidates.length > 0) {
      const updated = myScopedCandidates.find(c => c.id === drawerCandidate.id);
      if (updated) {
        setDrawerCandidate(updated);
      }
    }
  }, [myScopedCandidates]);

  const openCandidateDrawer = useCallback(async (candidateOrId) => {
    if (candidateOrId === null) {
      setDrawerCandidate(null);
      setIsDrawerOpen(true);
      return;
    }
    if (!candidateOrId) return;
    if (typeof candidateOrId === 'object') {
      if (!isSupervisor && !isCandidateOwnedByUser(candidateOrId, user, userProfile, teamMembers)) {
        return;
      }
      setDrawerCandidate(candidateOrId);
      setIsDrawerOpen(true);
      return;
    }
    const cid = String(candidateOrId);
    const found = myScopedCandidates.find(c => c.id === cid);
    if (found) {
      setDrawerCandidate(found);
      setIsDrawerOpen(true);
      return;
    }
    try {
      const fetched = await FirestoreStore.getCandidate(teamId, cid);
      if (fetched && (isSupervisor || isCandidateOwnedByUser(fetched, user, userProfile, teamMembers))) {
        setDrawerCandidate(fetched);
        setIsDrawerOpen(true);
      }
    } catch (err) {
      console.warn('Failed to fetch candidate for drawer:', err);
    }
  }, [myScopedCandidates, teamId, isSupervisor, user, userProfile, teamMembers]);

  const closeCandidateDrawer = useCallback(() => {
    setIsDrawerOpen(false);
    setDrawerCandidate(null);
  }, []);

  // Load persisted states from localStorage
  useEffect(() => {
    if (user?.uid) {
      const storedRead = localStorage.getItem(`readNotifs_${user.uid}`);
      const storedDismiss = localStorage.getItem(`dismissNotifs_${user.uid}`);
      if (storedRead) setLocalRead(JSON.parse(storedRead));
      if (storedDismiss) setLocalDismissed(JSON.parse(storedDismiss));
    }
  }, [user?.uid]);

  // Save states to localStorage when they change
  useEffect(() => {
    if (user?.uid && localRead.length > 0) {
      localStorage.setItem(`readNotifs_${user.uid}`, JSON.stringify(localRead));
    }
  }, [localRead, user?.uid]);

  useEffect(() => {
    if (user?.uid && localDismissed.length > 0) {
      localStorage.setItem(`dismissNotifs_${user.uid}`, JSON.stringify(localDismissed));
    }
  }, [localDismissed, user?.uid]);

  // Panel state
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // 1. Subscribe to candidates data
  useEffect(() => {
    if (!teamId || !user?.uid) {
      setRawCandidates([]);
      setCandidatesLoading(false);
      return;
    }
    setCandidatesLoading(true);
    const unsubscribe = FirestoreStore.subscribeToCandidates(teamId, role, user.uid, (data) => {
      setRawCandidates(data);
      setCandidatesLoading(false);
    });
    return () => unsubscribe();
  }, [teamId, role, user, refreshTrigger]);

  // 2. High-precision background ticker (checks every 10 seconds + on visibility change)
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 10000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setCurrentTime(new Date());
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    if (typeof window !== 'undefined' && 'Notification' in window) {
      setDesktopNotifState(Notification.permission);
    }

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // 3. Audio Chime (Zero external dependencies, Web Audio API gentle double tone)
  const playReminderChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const playTone = (freq, start, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        gain.gain.setValueAtTime(0.16, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + duration);
      };
      // Gentle ascending chime: E5 (659Hz) -> A5 (880Hz)
      playTone(659.25, 0, 0.22);
      playTone(880, 0.18, 0.42);
    } catch (e) {
      console.warn('Audio chime skipped:', e);
    }
  }, []);

  // 4. Request Desktop Notification Permission
  const requestDesktopNotification = useCallback(async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        setDesktopNotifState(perm);
        return perm === 'granted';
      } catch (e) {
        console.warn('Failed to request notification permission:', e);
      }
    }
    return false;
  }, []);

  // 5. Active Real-Time Alert Dispatcher (sound + desktop notification + in-app card)
  useEffect(() => {
    if (!myScopedCandidates || myScopedCandidates.length === 0) return;
    const now = currentTime;
    // Latest translator read via ref (intentionally not a dependency of this side-effect hook)
    const t = tRef.current;

    // Helper: Parse reminder datetime
    const getReminderTime = (r) => {
      if (r.dateTime) {
        const clean = String(r.dateTime).trim().replace(' ', 'T');
        const d = new Date(clean);
        if (!isNaN(d.getTime())) return d;
      }
      if (r.date) {
        const d = new Date(`${String(r.date).trim()}T${r.time ? String(r.time).trim() : '09:00'}`);
        if (!isNaN(d.getTime())) return d;
      }
      return null;
    };

    // On initial candidate load: pre-seed historical reminders so we don't spam audio on load
    if (!isInitialCheckDoneRef.current) {
      myScopedCandidates.forEach(c => {
        (c.reminders || []).forEach(r => {
          const remTime = getReminderTime(r);
          if (remTime && remTime < now) {
            alertedRemindersRef.current.add(r.id);
          }
        });
      });
      isInitialCheckDoneRef.current = true;
      return;
    }

    // Check newly due reminders
    const newlyDue = [];
    myScopedCandidates.forEach(c => {
      if (c.status === 'rejected') return;
      (c.reminders || []).forEach(r => {
        if (r.fired) return;
        if (alertedRemindersRef.current.has(r.id)) return;
        // PRIVACY FILTER: Only trigger alarms/popups for the reminder's creator (unless explicitly marked as broadcast)
        if (!r.isBroadcast && r.creatorId !== user?.uid) {
          if (!r.creatorId) console.warn(`[Dirty Data Warning] Reminder missing creatorId found and hidden: ${r.id ?? 'unknown_id'} in candidate ${c.id}`);
          return;
        }

        const remTime = getReminderTime(r);
        if (remTime && remTime <= now) {
          alertedRemindersRef.current.add(r.id);
          newlyDue.push({
            id: r.id,
            candidateId: c.id,
            candidateName: c.name,
            content: r.content || t('notifications.followUpCandidate', { name: c.name }, '请跟进候选人 {name}'),
            time: r.time || (r.dateTime ? r.dateTime.substring(11, 16) : ''),
            date: r.date || '',
            createdAt: Date.now()
          });
        }
      });
    });

    if (newlyDue.length > 0) {
      // Sound chime
      playReminderChime();

      // Trigger WhatsApp Bot notification only when NEXT_PUBLIC_WA_BOT_URL is explicitly configured (WhatsApp module is currently ON HOLD)
      const waBotBaseUrl = (process.env.NEXT_PUBLIC_WA_BOT_URL || '').trim().replace(/\/$/, '');
      if (waBotBaseUrl && userProfile?.whatsappNumber) {
        newlyDue.forEach(notif => {
          let msgBody = '*Talent Flow 跟进提醒*\n\n*候选人:* {{候选人名字}}\n*提醒内容:* {{提醒内容}}\n*时间:* {{时间}}';
          if (userProfile.waReminderTemplate) {
            msgBody = userProfile.waReminderTemplate;
          }
          
          msgBody = msgBody.replace(/\{\{候选人名字\}\}/g, notif.candidateName || '')
                           .replace(/\{\{提醒内容\}\}/g, notif.content || '')
                           .replace(/\{\{时间\}\}/g, `${notif.date || ''} ${notif.time || ''}`.trim());

          fetch(`${waBotBaseUrl}/api/send-whatsapp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: userProfile.whatsappNumber,
              message: msgBody
            })
          }).catch(err => console.warn('Failed to send WhatsApp notification:', err));
        });
      }

      // HTML5 Desktop Notification
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        newlyDue.forEach(item => {
          try {
            const n = new Notification(t('notifications.desktopReminderTitle', { name: item.candidateName }, '跟进提醒: {name}'), {
              body: item.content,
              tag: `reminder-${item.id}`
            });
            n.onclick = () => {
              window.focus();
              openCandidateDrawer(item.candidateId);
              n.close();
            };
          } catch (e) {
            console.warn('Desktop notification failed:', e);
          }
        });
      }

      // Add to floating in-app banner
      setActiveAlerts(prev => [...prev, ...newlyDue]);
    }
  }, [myScopedCandidates, currentTime, playReminderChime, user?.uid]);

  // 6. Compute Notifications based on candidates data
  const notifications = useMemo(() => {
    if (!myScopedCandidates || myScopedCandidates.length === 0) return [];
    
    const notifs = [];
    const now = currentTime;
    const todayStr = Utils.formatDate(now);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = Utils.formatDate(tomorrow);

    myScopedCandidates.forEach(c => {
      if (c.status === 'rejected') return; // Skip rejected candidates for most alerts

      // --- A. Stale Alerts ---
      const stageMeta = STALE_THRESHOLDS[c.stage];
      if (stageMeta) {
        const history = c.stageHistory || [];
        const lastChange = history.length > 0 ? history[history.length - 1] : null;
        
        if (lastChange && lastChange.movedAt) {
          const movedDate = new Date(lastChange.movedAt);
          const diffDays = Math.floor((now - movedDate) / (1000 * 60 * 60 * 24));
          
          if (diffDays >= stageMeta.days && diffDays <= (stageMeta.days + 14)) {
            const remarks = c.stageRemarks || [];
            const activeSnooze = remarks.find(r => r.stage === c.stage && r.snoozeUntil && r.snoozeUntil >= todayStr);
            
            if (!activeSnooze) {
              const stageLabel = Utils.getStageMeta(c.stage, t).label;
              const staleHint = t(`notifications.stale.${c.stage}`, stageMeta.text);
              notifs.push({
                id: `stale-${c.id}-${c.stage}`,
                type: 'stale',
                severity: stageMeta.severity,
                title: t('notifications.staleTitle', '候选人阶段停滞'),
                body: t('notifications.staleBody', { name: c.name, stage: stageLabel, days: diffDays, hint: staleHint }, '{name} 在「{stage}」已停留 {days} 天。{hint}'),
                candidateId: c.id,
                candidateName: c.name,
                candidateStage: c.stage,
                createdAt: movedDate,
                read: false,
                dismissed: false
              });
            }
          }
        }
      }

      // --- B. Interview Reminders ---
      const formattedInterviewDate = Utils.formatDate(c.interviewDate);
      if (formattedInterviewDate && formattedInterviewDate !== '-') {
        if (formattedInterviewDate === todayStr) {
          notifs.push({
            id: `interview-today-${c.id}`,
            type: 'interview',
            severity: 'urgent',
            title: t('notifications.interviewTodayTitle', '今日面试提醒'),
            body: t('notifications.interviewTodayBody', { name: c.name, time: c.interviewTime || '' }, '{name} 的面试安排在今天 {time}，请提前准备。'),
            candidateId: c.id,
            candidateName: c.name,
            createdAt: new Date(),
            read: false,
            dismissed: false
          });
        } else if (formattedInterviewDate === tomorrowStr) {
          notifs.push({
            id: `interview-tomorrow-${c.id}`,
            type: 'interview',
            severity: 'warning',
            title: t('notifications.interviewTomorrowTitle', '明日面试提醒'),
            body: t('notifications.interviewTomorrowBody', { name: c.name, time: c.interviewTime || '' }, '{name} 的面试安排在明天 {time}。'),
            candidateId: c.id,
            candidateName: c.name,
            createdAt: new Date(),
            read: false,
            dismissed: false
          });
        }
      }

      // --- C. Custom Follow-up Reminders ---
      const reminders = c.reminders || [];
      reminders.forEach(r => {
        // PRIVACY FILTER: Only show reminders in the bell panel if created by current user (unless explicitly marked as broadcast)
        if (!r.isBroadcast && r.creatorId !== user?.uid) {
          if (!r.creatorId) console.warn(`[Dirty Data Warning] Reminder missing creatorId found and hidden from bell panel: ${r.id ?? 'unknown_id'} in candidate ${c.id}`);
          return;
        }

        let isDue = false;
        let remTime = null;
        if (r.dateTime) {
          const clean = String(r.dateTime).trim().replace(' ', 'T');
          remTime = new Date(clean);
          isDue = !isNaN(remTime.getTime()) ? remTime <= now : (r.dateTime.substring(0, 10) <= todayStr);
        } else if (r.date) {
          remTime = new Date(`${String(r.date).trim()}T${r.time ? String(r.time).trim() : '09:00'}`);
          isDue = !isNaN(remTime.getTime()) ? remTime <= now : (r.date <= todayStr);
        }

        if (!r.fired && isDue) {
          // If the reminder is overdue by more than 14 days and never completed/fired, don't permanently pollute notifications
          const overdueDays = remTime && !isNaN(remTime.getTime()) ? Math.floor((now - remTime) / (1000 * 60 * 60 * 24)) : 0;
          if (overdueDays > 14) return;

          notifs.push({
            id: `reminder-${c.id}-${r.id}`,
            type: 'reminder',
            severity: 'info',
            title: t('notifications.reminderTitle', '跟进提醒'),
            body: r.content || t('notifications.reminderBody', { name: c.name }, '请跟进 {name} 的情况'),
            candidateId: c.id,
            candidateName: c.name,
            createdAt: remTime && !isNaN(remTime.getTime()) ? remTime : new Date(r.createdAt || now),
            reminderId: r.id,
            read: false,
            dismissed: false
          });
        }
      });
      
      // --- D. Team Activity Feed (Owner/Manager only) ---
      if (role === 'owner' || role === 'manager') {
        const history = c.stageHistory || [];
        if (history.length > 0) {
           const latestAct = history[history.length - 1];
           if (latestAct && latestAct.movedAt) {
             const actDate = new Date(latestAct.movedAt);
             const isRecent = (now - actDate) < (1000 * 60 * 60 * 24 * 2);
             if (isRecent) {
                const isNew = history.length === 1;
                notifs.push({
                  id: `activity-${c.id}-${history.length}`,
                  type: 'activity',
                  severity: 'info',
                  title: isNew ? t('notifications.activityNewTitle', '新候选人录入') : t('notifications.activityAdvanceTitle', '阶段推进'),
                  body: isNew
                    ? t('notifications.activityNewBody', { name: c.name }, '录入了新候选人: {name}')
                    : t('notifications.activityAdvanceBody', { name: c.name, stage: Utils.getStageMeta(c.stage, t).label }, '将 {name} 推进至「{stage}」'),
                  candidateId: c.id,
                  candidateName: c.name,
                  createdAt: actDate,
                  read: false,
                  dismissed: false
                });
             }
           }
        }
      }
    });

    // Apply local Read/Dismissed states
    return notifs.filter(n => !localDismissed.includes(n.id)).map(n => ({
      ...n,
      read: localRead.includes(n.id)
    })).sort((a, b) => b.createdAt - a.createdAt);

  }, [myScopedCandidates, localDismissed, localRead, role, currentTime, user?.uid, t]);

  // Only high-priority actionable events (today/tomorrow interviews and due follow-up reminders) light up the notification bell badge
  const unreadCount = notifications.filter(n => !n.read && (n.type === 'interview' || n.type === 'reminder')).length;

  const markAsRead = useCallback((id) => {
    setLocalRead(prev => Array.from(new Set([...prev, id])));
  }, []);

  const markAllRead = useCallback(() => {
    setLocalRead(prev => Array.from(new Set([...prev, ...notifications.map(n => n.id)])));
  }, [notifications]);

  const dismissNotification = useCallback((id) => {
    setLocalDismissed(prev => Array.from(new Set([...prev, id])));
  }, []);

  const dismissAlert = useCallback((id) => {
    setActiveAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  const completeReminder = useCallback(async (candidateId, reminderId) => {
    try {
      await FirestoreStore.markReminderFired(teamId, candidateId, reminderId);
      dismissAlert(reminderId);
      dismissNotification(`reminder-${candidateId}-${reminderId}`);
    } catch (err) {
      console.error('Failed to complete reminder:', err);
    }
  }, [teamId, dismissAlert, dismissNotification]);

  return (
    <NotificationContext.Provider value={{
      candidates,
      allTeamCandidates: rawCandidates,
      teamMembers,
      candidatesLoading,
      notifications,
      unreadCount,
      markAsRead,
      markAllRead,
      dismissNotification,
      isPanelOpen,
      setIsPanelOpen,
      desktopNotifState,
      requestDesktopNotification,
      completeReminder,
      openCandidateDrawer,
      closeCandidateDrawer
    }}>
      {children}

      {/* Global Candidate Drawer for Reminders and Notifications */}
      <CandidateDrawer 
        isOpen={isDrawerOpen} 
        onClose={closeCandidateDrawer} 
        candidate={drawerCandidate} 
      />

      {/* Floating In-App Reminder Alert Cards */}
      {typeof document !== 'undefined' && activeAlerts.length > 0 && createPortal(
        <div className="reminder-alert-container">
          {activeAlerts.map(alert => (
            <div 
              key={alert.id} 
              className="reminder-alert-card"
              onClick={() => {
                openCandidateDrawer(alert.candidateId);
                dismissAlert(alert.id);
              }}
              style={{ cursor: 'pointer' }}
            >
              <div className="reminder-alert-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div className="reminder-alert-icon-wrap">
                    <i className="ph-fill ph-bell-ringing"></i>
                  </div>
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '0.88rem', color: '#ffffff' }}>
                      {t('notifications.alertTitle', { name: alert.candidateName }, '跟进提醒 · {name}')}
                    </div>
                    {alert.time && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--accent-amber)', fontWeight: '500' }}>
                        <i className="ph-light ph-clock"></i> {alert.time}
                      </div>
                    )}
                  </div>
                </div>
                <button 
                  className="btn-icon btn-xs" 
                  onClick={(e) => {
                    e.stopPropagation();
                    dismissAlert(alert.id);
                  }}
                  title={t('notifications.alertClose', '关闭提示')}
                  style={{ color: 'var(--text-muted)' }}
                >
                  <i className="ph-light ph-x"></i>
                </button>
              </div>

              <div className="reminder-alert-body">
                {alert.content}
                <div style={{ marginTop: '4px', fontSize: '0.72rem', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>{t('notifications.alertClickHint', '点击卡片直接查看候选人资料')}</span>
                  <i className="ph-bold ph-arrow-up-right"></i>
                </div>
              </div>

              <div className="reminder-alert-actions" onClick={(e) => e.stopPropagation()}>
                <button 
                  className="btn btn-secondary btn-xs" 
                  onClick={() => dismissAlert(alert.id)}
                >
                  {t('notifications.alertLater', '稍后提醒')}
                </button>
                <button 
                  className="btn btn-primary btn-xs" 
                  style={{ background: 'var(--accent-blue)', borderColor: 'var(--accent-blue)', color: '#ffffff', fontWeight: '600' }}
                  onClick={() => {
                    openCandidateDrawer(alert.candidateId);
                    dismissAlert(alert.id);
                  }}
                >
                  <i className="ph-bold ph-user"></i> {t('notifications.alertViewCandidate', '查看候选人')}
                </button>
                <button 
                  className="btn btn-primary btn-xs" 
                  style={{ background: 'var(--accent-amber)', borderColor: 'var(--accent-amber)', color: '#000000', fontWeight: '600' }}
                  onClick={() => completeReminder(alert.candidateId, alert.id)}
                >
                  <i className="ph-bold ph-check"></i> {t('notifications.alertComplete', '标记已完成')}
                </button>
              </div>
            </div>
          ))}
        </div>,
        document.body
      )}
    </NotificationContext.Provider>
  );
}
