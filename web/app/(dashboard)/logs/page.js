'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../../lib/auth-context';
import { useI18n } from '../../../lib/i18n-context';
import { db } from '../../../lib/firebase';
import { collection, doc, query, orderBy, limit, onSnapshot, writeBatch, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Utils } from '../../../lib/utils';

export default function LogsPage() {
  const { teamId, isOwner, user } = useAuth();
  const { t } = useI18n();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState(null);
  const [logFilter, setLogFilter] = useState('all'); // 'all' | 'audit' | 'error' | 'deleted'
  const [toastMessage, setToastMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  useEffect(() => {
    if (!teamId) return;

    const q = query(
      collection(db, 'teams', teamId, 'logs'),
      orderBy('timestamp', 'desc'),
      limit(250)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logsData = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      }));
      setLogs(logsData);
      setLoading(false);
      setSelectedLog(prev => {
        if (!prev) return null;
        return logsData.find(l => l.id === prev.id) || prev;
      });
    });

    return () => unsubscribe();
  }, [teamId]);

  // Soft delete a single log (Owner only)
  const handleSoftDeleteLog = async (logId) => {
    if (!isOwner) {
      showToast(t('logsPage.ownerOnlySoftDelete') || '只有最高管理者 (Owner) 具有归档与软删除日志权限');
      return;
    }

    setIsProcessing(true);
    try {
      const docRef = doc(db, 'teams', teamId, 'logs', logId);
      await updateDoc(docRef, {
        isDeleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: user?.uid || 'system',
        deletedByName: user?.displayName || user?.email || '最高管理者'
      });
      showToast(t('logsPage.softDeleteSuccess') || '日志已成功软删除（数据物理保全，进入归档库）');
    } catch (err) {
      showToast((t('logsPage.softDeleteFailed') || '软删除失败: ') + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Restore a soft-deleted log (Owner only)
  const handleRestoreLog = async (logId) => {
    if (!isOwner) {
      showToast(t('logsPage.ownerOnlyRestore') || '只有最高管理者 (Owner) 具有恢复日志权限');
      return;
    }

    setIsProcessing(true);
    try {
      const docRef = doc(db, 'teams', teamId, 'logs', logId);
      await updateDoc(docRef, {
        isDeleted: false,
        restoredAt: serverTimestamp(),
        restoredBy: user?.uid || 'system',
        restoredByName: user?.displayName || user?.email || '最高管理者'
      });
      showToast(t('logsPage.restoreSuccess') || '已成功从归档库恢复该日志');
    } catch (err) {
      showToast((t('logsPage.restoreFailed') || '恢复失败: ') + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // Batch soft delete active logs (Owner only)
  const executeBatchSoftDelete = async () => {
    if (!isOwner) {
      showToast(t('logsPage.ownerOnlySoftDelete') || '只有最高管理者 (Owner) 具有批量归档日志权限');
      return;
    }

    setIsProcessing(true);
    try {
      const logsRef = collection(db, 'teams', teamId, 'logs');
      const snapshot = await getDocs(logsRef);
      const batch = writeBatch(db);
      let count = 0;

      snapshot.docs.forEach((d) => {
        const data = d.data();
        if (!data.isDeleted) {
          batch.update(d.ref, {
            isDeleted: true,
            deletedAt: serverTimestamp(),
            deletedBy: user?.uid || 'system',
            deletedByName: user?.displayName || user?.email || '最高管理者'
          });
          count++;
        }
      });

      if (count > 0) {
        await batch.commit();
      }
      setIsConfirmModalOpen(false);
      setSelectedLog(null);
      const msgTemplate = t('logsPage.batchDeleteSuccess') || '已成功软删除归档 {count} 条活跃日志（合规存证已保全）';
      showToast(msgTemplate.replace('{count}', count));
    } catch (err) {
      showToast((t('logsPage.batchDeleteFailed') || '批量软删除失败: ') + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredLogs = useMemo(() => {
    if (logFilter === 'deleted') {
      return isOwner ? logs.filter(l => l.isDeleted === true) : [];
    }
    const activeLogs = logs.filter(l => !l.isDeleted);
    if (logFilter === 'all') return activeLogs;
    if (logFilter === 'audit') return activeLogs.filter(l => l.level === 'audit');
    if (logFilter === 'error') return activeLogs.filter(l => l.level === 'error' || l.level === 'warn');
    return activeLogs;
  }, [logs, logFilter, isOwner]);

  const getActionLabel = (action) => {
    switch(action) {
      case 'CREATE': return <span className="badge" style={{ color: 'var(--accent-emerald)', borderColor: 'rgba(16,185,129,0.3)' }}>{t('logsPage.actionCreate')}</span>;
      case 'UPDATE': return <span className="badge" style={{ color: 'var(--accent-blue)', borderColor: 'rgba(59,130,246,0.3)' }}>{t('logsPage.actionUpdate')}</span>;
      case 'DELETE': return <span className="badge" style={{ color: 'var(--accent-rose)', borderColor: 'rgba(244,63,94,0.3)' }}>{t('logsPage.actionDelete')}</span>;
      case 'AI_PARSE': return <span className="badge" style={{ color: 'var(--accent-purple)', borderColor: 'rgba(168,85,247,0.3)' }}>{t('logsPage.actionAiParse')}</span>;
      default: return <span className="badge">{action}</span>;
    }
  };

  const getTargetIcon = (targetType) => {
    switch(targetType) {
      case 'CANDIDATE': return 'ph-users';
      case 'JOB_ORDER': return 'ph-briefcase';
      case 'SYSTEM': return 'ph-magic-wand';
      default: return 'ph-folder';
    }
  };

  if (loading) {
    return <div className="page-view active" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <i className="ph-light ph-spinner ph-spin" style={{ fontSize: '2rem', color: 'var(--text-muted)' }}></i>
    </div>;
  }

  return (
    <div className="page-view active" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexShrink: 0 }}>
        <div>
          <h2 style={{ fontSize: 'var(--text-xl)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
            <i className="ph-light ph-activity"></i> {t('logsPage.title')}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', margin: '4px 0 0 0' }}>
            {t('logsPage.subtitle')}
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          <div className="segmented-control" style={{ display: 'flex', background: 'var(--bg-surface-elevated, rgba(125,125,125,0.1))', borderRadius: 'var(--radius-md)', padding: '2px', border: '1px solid var(--border-hairline)' }}>
            <button 
              className={`btn-segment ${logFilter === 'all' ? 'active' : ''}`} 
              onClick={() => setLogFilter('all')} 
              style={{ 
                padding: '4px 12px', fontSize: '0.85rem', border: 'none', 
                background: logFilter === 'all' ? 'var(--card-bg, #ffffff)' : 'transparent', 
                color: logFilter === 'all' ? 'var(--text-primary)' : 'var(--text-secondary)', 
                boxShadow: logFilter === 'all' ? 'var(--shadow-card, 0 1px 3px rgba(0,0,0,0.1))' : 'none',
                borderRadius: '4px', cursor: 'pointer',
                fontWeight: logFilter === 'all' ? '600' : 'normal'
              }}
            >
              {t('logsPage.filterAll')}
            </button>
            <button 
              className={`btn-segment ${logFilter === 'audit' ? 'active' : ''}`} 
              onClick={() => setLogFilter('audit')} 
              style={{ 
                padding: '4px 12px', fontSize: '0.85rem', border: 'none', 
                background: logFilter === 'audit' ? 'var(--card-bg, #ffffff)' : 'transparent', 
                color: logFilter === 'audit' ? 'var(--text-primary)' : 'var(--text-secondary)', 
                boxShadow: logFilter === 'audit' ? 'var(--shadow-card, 0 1px 3px rgba(0,0,0,0.1))' : 'none',
                borderRadius: '4px', cursor: 'pointer',
                fontWeight: logFilter === 'audit' ? '600' : 'normal'
              }}
            >
              {t('logsPage.filterAudit')}
            </button>
            <button 
              className={`btn-segment ${logFilter === 'error' ? 'active' : ''}`} 
              onClick={() => setLogFilter('error')} 
              style={{ 
                padding: '4px 12px', fontSize: '0.85rem', border: 'none', 
                background: logFilter === 'error' ? 'var(--card-bg, #ffffff)' : 'transparent', 
                color: logFilter === 'error' ? 'var(--text-primary)' : 'var(--text-secondary)', 
                boxShadow: logFilter === 'error' ? 'var(--shadow-card, 0 1px 3px rgba(0,0,0,0.1))' : 'none',
                borderRadius: '4px', cursor: 'pointer',
                fontWeight: logFilter === 'error' ? '600' : 'normal'
              }}
            >
              {t('logsPage.filterError')}
            </button>
            {isOwner && (
              <button 
                className={`btn-segment ${logFilter === 'deleted' ? 'active' : ''}`} 
                onClick={() => setLogFilter('deleted')} 
                style={{ 
                  padding: '4px 12px', fontSize: '0.85rem', border: 'none', 
                  background: logFilter === 'deleted' ? 'rgba(244,63,94,0.18)' : 'transparent', 
                  color: logFilter === 'deleted' ? 'var(--accent-rose)' : 'var(--text-secondary)', 
                  boxShadow: logFilter === 'deleted' ? '0 1px 3px rgba(244,63,94,0.2)' : 'none',
                  borderRadius: '4px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '4px',
                  fontWeight: logFilter === 'deleted' ? '600' : 'normal'
                }}
              >
                <i className="ph-light ph-archive"></i>
                {(t('logsPage.filterDeleted') || '已软删除归档 ({count})').replace('{count}', logs.filter(l => l.isDeleted).length)}
              </button>
            )}
          </div>
          {isOwner && (
            <button 
              className="btn btn-secondary" 
              onClick={() => setIsConfirmModalOpen(true)} 
              disabled={logs.filter(l => !l.isDeleted).length === 0 || isProcessing}
              title={t('logsPage.batchDeleteTooltip')}
              style={{ color: 'var(--accent-rose)', borderColor: 'rgba(244, 63, 94, 0.3)' }}
            >
              <i className="ph-light ph-archive"></i> {t('logsPage.batchDeleteBtn')}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-5)', flex: 1, minHeight: 0 }}>
        
        {/* Log List (Left) */}
        <div className="bezel-shell" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="bezel-core" style={{ flex: 1, overflowY: 'auto', background: 'var(--bezel-core-bg, var(--card-bg))' }}>
            {filteredLogs.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon"><i className="ph-light ph-check-circle"></i></div>
                <div className="empty-state-title">{t('logsPage.emptyTitle')}</div>
                <div className="empty-state-desc">{t('logsPage.emptyDesc')}</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', padding: 'var(--space-3)' }}>
                {filteredLogs.map((log) => {
                  const isAudit = log.level === 'audit';
                  const isSelected = selectedLog?.id === log.id;
                  
                  return (
                    <div 
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-3)',
                        padding: 'var(--space-3)',
                        borderBottom: '1px solid var(--border-hairline)',
                        cursor: 'pointer',
                        background: isSelected ? 'var(--bg-surface-elevated, rgba(125,125,125,0.12))' : (log.isDeleted ? 'rgba(244,63,94,0.06)' : 'transparent'),
                        borderRadius: 'var(--radius-md)',
                        marginBottom: '4px',
                        opacity: log.isDeleted && !isSelected ? 0.75 : 1
                      }}
                    >
                      {isAudit ? (
                        <>
                          {/* Audit Row */}
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--bg-surface-elevated, rgba(125,125,125,0.15))', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '0.85rem' }}>
                            {log.user?.displayName ? log.user.displayName.charAt(0).toUpperCase() : '?'}
                          </div>
                          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: '500', color: 'var(--text-primary)', fontSize: '0.9rem' }}>{log.user?.displayName || log.user?.email || t('logsPage.unknownUser')}</span>
                              {getActionLabel(log.action)}
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <i className={`ph-light ${getTargetIcon(log.targetType)}`}></i> {log.targetName}
                              </span>
                              {log.isDeleted && (
                                <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(244,63,94,0.15)', color: 'var(--accent-rose)' }}>
                                  {t('logsPage.softDeletedBadge')}
                                </span>
                              )}
                            </div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                              {Utils.formatRelativeTime(log.timestamp?.toDate ? log.timestamp.toDate() : new Date(), t)}
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          {/* Error Row */}
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(244, 63, 94, 0.1)', color: 'var(--accent-rose)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <i className="ph-bold ph-warning"></i>
                          </div>
                          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 'bold', color: 'var(--accent-rose)', fontSize: '0.85rem', textTransform: 'uppercase' }}>{log.level}</span>
                              <span style={{ color: 'var(--accent-purple)', fontSize: '0.85rem' }}>[{log.module}]</span>
                              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.message}</span>
                              {log.isDeleted && (
                                <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(244,63,94,0.15)', color: 'var(--accent-rose)' }}>
                                  {t('logsPage.softDeletedBadge')}
                                </span>
                              )}
                            </div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                              {Utils.formatRelativeTime(log.timestamp?.toDate ? log.timestamp.toDate() : new Date(), t)}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Log Details (Right) */}
        <div className="bezel-shell" style={{ width: '40%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="bezel-core" style={{ flex: 1, padding: 'var(--space-5)', background: 'var(--bezel-core-bg, var(--card-bg))', overflowY: 'auto' }}>
            {selectedLog ? (
              <div style={{ fontFamily: 'var(--font-mono)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                  <h3 style={{ fontSize: '1rem', margin: 0, color: 'var(--text-primary)' }}>
                    {selectedLog.level === 'audit' ? t('logsPage.auditDetailsTitle') : t('logsPage.errorDetailsTitle')}
                  </h3>
                  {selectedLog.isDeleted && (
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(244,63,94,0.15)', color: 'var(--accent-rose)', fontWeight: 'bold' }}>
                      {t('logsPage.softDeletedArchiveTitle')}
                    </span>
                  )}
                </div>
                
                <div style={{ marginBottom: 'var(--space-3)', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{t('logsPage.fieldTime')}</span> <span style={{ color: 'var(--text-primary)' }}>{selectedLog.timestamp?.toDate ? selectedLog.timestamp.toDate().toLocaleString() : 'N/A'}</span>
                </div>
                
                {selectedLog.level === 'audit' ? (
                  <>
                    <div style={{ marginBottom: 'var(--space-3)', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{t('logsPage.fieldUser')}</span> <span style={{ color: 'var(--text-primary)' }}>{selectedLog.user?.displayName || t('logsPage.unknownUser')} ({selectedLog.user?.email || 'N/A'})</span>
                    </div>
                    <div style={{ marginBottom: 'var(--space-3)', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{t('logsPage.fieldAction')}</span> {getActionLabel(selectedLog.action)}
                    </div>
                    <div style={{ marginBottom: 'var(--space-3)', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{t('logsPage.fieldTarget')}</span> <span style={{ color: 'var(--accent-blue)' }}>{selectedLog.targetType}</span> / <span style={{ color: 'var(--text-primary)' }}>{selectedLog.targetName}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ marginBottom: 'var(--space-3)', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{t('logsPage.fieldModule')}</span> <span style={{ color: 'var(--accent-purple)' }}>{selectedLog.module}</span>
                    </div>
                    <div style={{ marginBottom: 'var(--space-3)', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{t('logsPage.fieldMessage')}</span> <span style={{ color: 'var(--text-primary)' }}>{selectedLog.message}</span>
                    </div>
                  </>
                )}
                
                {selectedLog.details && (
                  <div style={{ marginTop: 'var(--space-5)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '8px' }}>{t('logsPage.fieldDetails')}</div>
                    <pre style={{ 
                      background: 'var(--input-bg, #000)', 
                      padding: 'var(--space-4)', 
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-hairline)',
                      color: selectedLog.level === 'audit' ? 'var(--accent-blue)' : 'var(--accent-emerald)',
                      fontSize: '0.8rem',
                      overflowX: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word'
                    }}>
                      {selectedLog.details}
                    </pre>
                  </div>
                )}

                {/* Soft Delete & Audit Trail Management (Owner Only) */}
                {isOwner && (
                  <div style={{ marginTop: 'var(--space-6)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border-hairline)' }}>
                    {selectedLog.isDeleted ? (
                      <div style={{ padding: '12px', background: 'rgba(244,63,94,0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(244,63,94,0.2)' }}>
                        <div style={{ color: 'var(--accent-rose)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                          <i className="ph-fill ph-shield-check"></i> {t('extraUi.logArchivedBanner', '该日志已被最高管理者软删除归档（底层数据物理保全用于合规存证）')}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
                          {t('extraUi.logArchivedBy', '归档操作人: ')}{selectedLog.deletedByName || '最高管理者'}
                        </div>
                        <button 
                          className="btn btn-secondary btn-sm"
                          style={{ color: 'var(--accent-blue)', borderColor: 'rgba(59, 130, 246, 0.3)' }}
                          onClick={() => handleRestoreLog(selectedLog.id)}
                          disabled={isProcessing}
                        >
                          <i className="ph-light ph-arrow-counter-clockwise"></i> {t('logsPage.restoreBtn')}
                        </button>
                      </div>
                    ) : (
                      <button 
                        className="btn btn-secondary btn-sm"
                        style={{ color: 'var(--accent-rose)', borderColor: 'rgba(244, 63, 94, 0.3)' }}
                        onClick={() => handleSoftDeleteLog(selectedLog.id)}
                        disabled={isProcessing}
                        title={t('extraUi.logOwnerArchiveTip', '仅最高管理者可用：将该条日志从活跃视口软删除归档，底层数据物理保全')}
                      >
                        <i className="ph-light ph-archive"></i> {t('logsPage.deleteBtn')}
                      </button>
                    )}
                  </div>
                )}

              </div>
            ) : (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontSize: '0.85rem' }}>
                {t('logsPage.selectPrompt')}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Toast Notification */}
      {toastMessage && typeof document !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed', top: '24px', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-elevated)', color: 'var(--text-primary)',
          padding: '10px 20px', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--accent-blue)',
          boxShadow: 'var(--shadow-modal, 0 8px 32px rgba(0, 0, 0, 0.25))', zIndex: 10001,
          display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem'
        }}>
          <i className="ph-fill ph-info" style={{ color: 'var(--accent-blue)', fontSize: '1.2rem' }}></i>
          <span>{toastMessage}</span>
        </div>,
        document.body
      )}

      {/* Confirmation Modal for Batch Soft Delete */}
      {isConfirmModalOpen && typeof document !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 11000,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)'
        }}>
          <div style={{
            background: 'var(--bg-elevated, var(--card-bg))', borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-interactive)', width: '100%', maxWidth: '440px',
            padding: 'var(--space-6)', boxShadow: 'var(--shadow-modal, 0 20px 50px rgba(0,0,0,0.4))'
          }}>
            <h3 style={{ margin: '0 0 var(--space-3) 0', fontSize: 'var(--text-base)', color: 'var(--accent-rose)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="ph-fill ph-shield-warning"></i> {t('logsPage.modalConfirmTitle')}
            </h3>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 'var(--space-5)' }}>
              {t('logsPage.modalWarningNotice')}<br/>
              <strong style={{ color: 'var(--text-primary)' }}>{t('logsPage.modalConfirmPrompt')}</strong>
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setIsConfirmModalOpen(false)}
                disabled={isProcessing}
              >
                {t('logsPage.modalCancelBtn')}
              </button>
              <button 
                className="btn btn-primary" 
                style={{ background: 'var(--accent-rose)', borderColor: 'var(--accent-rose)', color: '#fff' }}
                onClick={executeBatchSoftDelete}
                disabled={isProcessing}
              >
                {isProcessing ? '...' : t('logsPage.modalConfirmBtn')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
