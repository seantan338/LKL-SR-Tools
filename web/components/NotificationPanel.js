'use client';

import { useState } from 'react';
import { useNotifications } from '../lib/notification-context';
import { useFeedback } from '../lib/feedback-context';
import { Utils } from '../lib/utils';
import { FirestoreStore } from '../lib/firestore-store';
import { useAuth } from '../lib/auth-context';
import { useI18n } from '../lib/i18n-context';

export default function NotificationPanel({ onOpenCandidate }) {
  const { 
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
    openCandidateDrawer
  } = useNotifications();
  const { showToast, confirm } = useFeedback();
  const { teamId } = useAuth();
  const { t } = useI18n();
  
  const [activeTab, setActiveTab] = useState('all'); // all, stale, interview, reminder, activity
  
  const [snoozingId, setSnoozingId] = useState(null);
  const [snoozeReason, setSnoozeReason] = useState('');
  const [snoozeDays, setSnoozeDays] = useState(3);

  if (!isPanelOpen) return null;

  const onClose = () => setIsPanelOpen(false);

  const filteredNotifs = notifications.filter(n => {
    if (activeTab === 'all') return true;
    return n.type === activeTab;
  });

  const handlePushNextStage = async (notif) => {
    onClose();
    if (notif.candidateId) openCandidateDrawer(notif.candidateId);
    markAsRead(notif.id);
  };

  const handleSnooze = async (notif) => {
    if (!snoozeReason.trim()) {
      showToast(t('components.notification.snoozeReasonRequired', '请输入延期原因'), "warning");
      return;
    }
    
    const snoozeUntil = new Date();
    snoozeUntil.setDate(snoozeUntil.getDate() + parseInt(snoozeDays));
    
    const remark = {
      id: Utils.generateId(),
      stage: notif.candidateStage,
      reason: snoozeReason,
      snoozeUntil: Utils.formatDate(snoozeUntil),
      createdAt: new Date().toISOString()
    };

    try {
      await FirestoreStore.addStageRemark(teamId, notif.candidateId, remark);
      setSnoozingId(null);
      setSnoozeReason('');
      dismissNotification(notif.id);
      showToast(t('components.notification.snoozeSaved', '延期备注已保存'), "success");
    } catch (e) {
      console.error(e);
      showToast(t('components.notification.snoozeFailed', { msg: e.message }, '延期保存失败: {msg}'), "error");
    }
  };

  const handleReject = async (notif) => {
    const ok = await confirm(t('components.notification.confirmDropMsg', { name: notif.candidateName }, '确认要将 {name} 标记为淘汰吗？'), {
      title: t('components.notification.confirmDropTitle', '候选人淘汰确认'),
      danger: true,
      confirmLabel: t('components.notification.confirmDropBtn', '确认淘汰')
    });
    if (!ok) return;

    try {
      await FirestoreStore.updateCandidate(teamId, notif.candidateId, { status: 'rejected' });
      dismissNotification(notif.id);
      showToast(t('components.notification.dropSuccess', '候选人已标记为淘汰'), "info");
    } catch (e) {
      console.error(e);
      showToast(t('components.notification.dropFailed', { msg: e.message }, '淘汰操作失败: {msg}'), "error");
    }
  };

  return (
    <>
      <div className="notification-backdrop" onClick={onClose} style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1999, background: 'rgba(0,0,0,0.2)'
      }}></div>
      
      <div className="notification-panel" style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: '400px', maxWidth: '100vw',
        background: 'var(--bg-surface)', backdropFilter: 'blur(16px)',
        borderLeft: '1px solid var(--border-subtle)',
        boxShadow: 'var(--shadow-xl)', zIndex: 2000, display: 'flex', flexDirection: 'column',
        animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        
        {/* Header */}
        <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border-hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 'var(--text-md)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {t('components.notification.title', '通知中心')}
            {unreadCount > 0 && <span className="badge" style={{ background: 'var(--accent-rose)', color: '#fff', border: 'none' }}>{unreadCount}</span>}
          </h3>
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <button 
              className="btn btn-secondary btn-xs" 
              title={t('components.notification.markAllReadTitle', '全部标为已读')} 
              onClick={markAllRead}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', padding: '3px 8px' }}
            >
              <i className="ph-bold ph-checks"></i>
              <span>{t('components.notification.markAllRead', '全部已读')}</span>
            </button>
            <button className="btn-icon" onClick={onClose} title={t('components.notification.closePanel', '关闭面板')}>
              <i className="ph-light ph-x"></i>
            </button>
          </div>
        </div>

        {/* Desktop Notification Permission Banner */}
        {desktopNotifState !== 'granted' && typeof window !== 'undefined' && 'Notification' in window && (
          <div style={{
            padding: '10px 16px',
            background: 'rgba(245, 158, 11, 0.08)',
            borderBottom: '1px solid rgba(245, 158, 11, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px'
          }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="ph-fill ph-bell" style={{ color: 'var(--accent-amber)', fontSize: '0.9rem' }}></i>
              <span>{t('components.notification.desktopHint', '开启桌面通知，切换窗口也不会错过提醒')}</span>
            </div>
            <button 
              className="btn btn-primary btn-xs" 
              style={{ fontSize: '0.72rem', padding: '3px 8px', flexShrink: 0, background: 'var(--accent-amber)', borderColor: 'var(--accent-amber)', color: '#000', fontWeight: '600' }}
              onClick={requestDesktopNotification}
            >
              {t('components.notification.enableDesktop', '开启通知')}
            </button>
          </div>
        )}
        {desktopNotifState === 'granted' && (
          <div style={{
            padding: '6px 16px',
            background: 'rgba(16, 185, 129, 0.06)',
            borderBottom: '1px solid rgba(16, 185, 129, 0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.72rem',
            color: 'var(--accent-emerald)'
          }}>
            <i className="ph-bold ph-check-circle"></i>
            <span>{t('components.notification.desktopEnabled', '系统级桌面弹窗与声音提醒已生效')}</span>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-hairline)', padding: '0 var(--space-4)', overflowX: 'auto', gap: 'var(--space-4)' }}>
          {[
            { id: 'all', label: t('components.notification.tabs.all', '全部') },
            { id: 'stale', label: t('components.notification.tabs.stale', '预警') },
            { id: 'interview', label: t('components.notification.tabs.interview', '面试') },
            { id: 'reminder', label: t('components.notification.tabs.reminder', '提醒') },
            { id: 'activity', label: t('components.notification.tabs.activity', '动态') }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'none', border: 'none', padding: 'var(--space-3) 0', cursor: 'pointer',
                fontSize: 'var(--text-sm)', fontWeight: activeTab === tab.id ? '600' : '400',
                color: activeTab === tab.id ? 'var(--accent-blue)' : 'var(--text-secondary)',
                borderBottom: activeTab === tab.id ? '2px solid var(--accent-blue)' : '2px solid transparent',
                whiteSpace: 'nowrap'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2)' }}>
          {filteredNotifs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-8) var(--space-4)', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2rem', marginBottom: 'var(--space-2)', opacity: 0.4 }}>
                <i className="ph-light ph-tray"></i>
              </div>
              <div>{t('components.notification.empty', '没有需要关注的事项')}</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {filteredNotifs.map(notif => {
                const isUrgent = notif.severity === 'urgent';
                const isWarning = notif.severity === 'warning';
                
                let iconClass = 'ph-bell';
                if (notif.type === 'stale') iconClass = 'ph-warning-circle';
                if (notif.type === 'interview') iconClass = 'ph-calendar-check';
                if (notif.type === 'reminder') iconClass = 'ph-clock';
                if (notif.type === 'activity') iconClass = 'ph-activity';

                let colorClass = 'notification-info';
                if (isUrgent) colorClass = 'notification-urgent';
                else if (isWarning) colorClass = 'notification-warning';

                return (
                  <div key={notif.id} className={`notification-item ${colorClass} ${notif.read ? '' : 'unread'}`} onClick={() => {
                    if (!notif.read) markAsRead(notif.id);
                  }}>
                    <div className="notification-icon">
                      <i className={`ph-fill ${iconClass}`}></i>
                    </div>
                    <div className="notification-content">
                      <div className="notification-header">
                        <span className="notification-title">{notif.title}</span>
                        <span className="notification-time">{Utils.formatRelativeTime(notif.createdAt)}</span>
                      </div>
                      <div 
                        className="notification-body" 
                        onClick={() => {
                          if (notif.candidateId) {
                            openCandidateDrawer(notif.candidateId);
                            setIsPanelOpen(false);
                            if (onOpenCandidate) onOpenCandidate(notif.candidateId);
                          }
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        {notif.body}
                        <div style={{ marginTop: '4px', fontSize: '0.72rem', color: 'var(--accent-blue)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          {t('components.notification.viewProfile', '点击查看候选人资料')} <i className="ph-bold ph-arrow-right"></i>
                        </div>
                      </div>

                      {/* Action Buttons for Stale Alerts */}
                      {notif.type === 'stale' && (
                        <div className="notification-actions" style={{ marginTop: 'var(--space-3)', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                          {snoozingId === notif.id ? (
                            <div style={{ width: '100%', background: 'rgba(0,0,0,0.2)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)' }}>
                              <input 
                                type="text" 
                                className="form-input" 
                                placeholder={t('components.notification.snoozePlaceholder', '输入未推进原因...')} 
                                value={snoozeReason}
                                onChange={e => setSnoozeReason(e.target.value)}
                                style={{ marginBottom: 'var(--space-2)', fontSize: '0.75rem', padding: '4px 8px', minHeight: '30px' }}
                              />
                              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                                <select className="form-select" value={snoozeDays} onChange={e => setSnoozeDays(e.target.value)} style={{ fontSize: '0.75rem', padding: '2px 24px 2px 8px', minHeight: '26px' }}>
                                  <option value={3}>{t('components.notification.snooze3', '延期 3 天')}</option>
                                  <option value={5}>{t('components.notification.snooze5', '延期 5 天')}</option>
                                  <option value={7}>{t('components.notification.snooze7', '延期 7 天')}</option>
                                </select>
                                <button className="btn btn-primary btn-sm" style={{ padding: '2px 8px', minHeight: '26px' }} onClick={() => handleSnooze(notif)}>{t('components.notification.save', '保存')}</button>
                                <button className="btn btn-secondary btn-sm" style={{ padding: '2px 8px', minHeight: '26px' }} onClick={() => setSnoozingId(null)}>{t('components.notification.cancel', '取消')}</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); handlePushNextStage(notif); }}>
                                <i className="ph-light ph-arrow-right"></i> {t('components.notification.actionAdvance', '推进阶段')}
                              </button>
                              <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); setSnoozingId(notif.id); }}>
                                <i className="ph-light ph-note-pencil"></i> {t('components.notification.actionSnooze', '备注延期')}
                              </button>
                              <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); handleReject(notif); }} style={{ color: 'var(--accent-rose)' }}>
                                <i className="ph-light ph-x-circle"></i> {t('components.notification.actionRelease', '释放')}
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      {/* Action Buttons for Custom Reminders */}
                      {notif.type === 'reminder' && notif.reminderId && (
                        <div className="notification-actions" style={{ marginTop: 'var(--space-2)', display: 'flex', gap: 'var(--space-2)' }}>
                          <button 
                            className="btn btn-primary btn-xs" 
                            style={{ background: 'var(--accent-amber)', borderColor: 'var(--accent-amber)', color: '#000000', fontWeight: '600' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              completeReminder(notif.candidateId, notif.reminderId);
                              showToast(t('components.notification.reminderCompleted', '提醒已标记为已完成'), "success");
                            }}
                          >
                            <i className="ph-bold ph-check"></i> {t('components.notification.actionComplete', '标记已完成')}
                          </button>
                          <button 
                            className="btn btn-secondary btn-xs" 
                            onClick={(e) => {
                              e.stopPropagation();
                              dismissNotification(notif.id);
                            }}
                          >
                            {t('components.notification.actionRemove', '移除通知')}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
