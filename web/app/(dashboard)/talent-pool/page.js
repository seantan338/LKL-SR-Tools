'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../../lib/auth-context';
import { useNotifications } from '../../../lib/notification-context';
import { useFeedback } from '../../../lib/feedback-context';
import { useI18n } from '../../../lib/i18n-context';
import { FirestoreStore } from '../../../lib/firestore-store';
import { SystemLogger } from '../../../lib/logger';
import { Utils } from '../../../lib/utils';
import CandidateDrawer from '../../../components/CandidateDrawer';
import WhatsAppButton from '../../../components/WhatsAppButton';

export default function TalentPoolPage() {
  const { teamId, role, user, isReadOnlyView } = useAuth();
  const { candidates, candidatesLoading: loading } = useNotifications();
  const { confirm } = useFeedback();
  const { t, lang } = useI18n();
const [searchQuery, setSearchQuery] = useState('');
  const [reasonFilter, setReasonFilter] = useState('all');
  const [mounted, setMounted] = useState(false);
  
  const [toastMessage, setToastMessage] = useState('');

  // Drawer state
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const showToast = (msg, type = 'info') => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };
// Only consider rejected candidates
  const rejectedCandidates = candidates.filter(c => c.status === 'rejected');

  const filteredCandidates = rejectedCandidates.filter(c => {
    if (reasonFilter !== 'all') {
      const cBase = c.rejectReason ? String(c.rejectReason).split(' · ')[0].trim() : '';
      if (
        c.rejectReason !== reasonFilter &&
        cBase !== reasonFilter &&
        Utils.getDropReasonLabel(c.rejectReason, t) !== Utils.getDropReasonLabel(reasonFilter, t) &&
        Utils.getDropReasonLabel(cBase, t) !== Utils.getDropReasonLabel(reasonFilter, t)
      ) return false;
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchText = [
        c.name, c.company, c.position, c.department, c.school, c.degree, 
        c.phone, c.location, c.icNo, c.picName, c.remarks, c.notes,
        c.rejectReason, c.rejectNote, Utils.getDropReasonLabel(c.rejectReason, t)
      ].filter(Boolean).join(' ').toLowerCase();
      if (!matchText.includes(q)) return false;
    }
    
    return true;
  });

  const openCandidate = (candidate) => {
    setSelectedCandidate(candidate);
    setIsDrawerOpen(true);
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
    setTimeout(() => setSelectedCandidate(null), 300); // Wait for transition
  };

  return (
    <>
      <div className="page-view active">
        {/* Toast Notification */}
        {toastMessage && mounted && typeof document !== 'undefined' && createPortal(
          <div style={{
            position: 'fixed', top: '24px', left: '50%', transform: 'translateX(-50%)',
            background: 'var(--bg-elevated)', color: '#ffffff',
            padding: '10px 20px', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--accent-blue)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)', zIndex: 10001,
            display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem'
          }}>
            <i className="ph-fill ph-info" style={{ color: 'var(--accent-blue)', fontSize: '1.2rem' }}></i>
            <span>{toastMessage}</span>
          </div>,
          document.body
        )}

        {/* Read-only Mode Notice Banner */}
        {isReadOnlyView && (
          <div style={{
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 16px',
            marginBottom: 'var(--space-4)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            color: 'var(--accent-amber)',
            fontSize: 'var(--text-xs)'
          }}>
            <i className="ph-bold ph-lock-key" style={{ fontSize: '1.1rem', flexShrink: 0 }}></i>
            <div style={{ flex: 1 }}>
              <strong>{t('team.readOnlyBadge', '单向只读')}</strong> · {t('pipeline.readOnlyBanner', '您正在视察合作人团队数据。所有状态流转与编辑操作已锁定保护，避免误触。')}
            </div>
          </div>
        )}

        {/* Action Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-3)', width: '100%', maxWidth: '780px', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: '1 1 240px', marginBottom: 0 }}>
              <div className="combo-input-wrapper">
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder={t('talentPoolPage.searchPlaceholder', '搜索人才库(姓名、学校、淘汰原因)...')} 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                <i className="ph-light ph-magnifying-glass"></i>
              </div>
            </div>
            
            {/* Reason Filter */}
            <div className="form-group" style={{ width: '220px', marginBottom: 0 }}>
              <select className="form-select" value={reasonFilter} onChange={e => setReasonFilter(e.target.value)}>
                <option value="all">
                  {t('talentPoolPage.allReasons', { count: rejectedCandidates.length }, `所有的淘汰原因 (${rejectedCandidates.length})`)}
                </option>
                {Utils.DROP_REASONS.map(reason => {
                  const count = rejectedCandidates.filter(c => {
                    if (!c.rejectReason) return false;
                    const base = String(c.rejectReason).split(' · ')[0].trim();
                    return base === reason.key || base === reason.label;
                  }).length;
                  if (count === 0) return null;
                  return (
                    <option key={reason.key} value={reason.key}>
                      {Utils.getDropReasonLabel(reason.key, t)} ({count})
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        </div>

        {/* Table Shell */}
        <div className="bezel-shell" style={{ padding: '0' }}>
          <div className="bezel-core" style={{ padding: '0', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-hairline)', background: 'rgba(255,255,255,0.02)' }}>
                  <th style={{ padding: 'var(--space-4) var(--space-5)', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('talentPoolPage.colTalentInfo', '人才信息')}</th>
                  <th style={{ padding: 'var(--space-4) var(--space-5)', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('talentPoolPage.colTarget', '曾经意向 / 岗位')}</th>
                  <th style={{ padding: 'var(--space-4) var(--space-5)', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('talentPoolPage.colDropReason', '淘汰 / 不合适原因')}</th>
                  <th style={{ padding: 'var(--space-4) var(--space-5)', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('talentPoolPage.colUpdatedAt', '更新时间')}</th>
                  <th style={{ padding: 'var(--space-4) var(--space-5)', width: '80px' }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredCandidates.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <i className="ph-light ph-archive-tray" style={{ fontSize: '2rem', marginBottom: 'var(--space-2)', display: 'block' }}></i>
                      {t('talentPoolPage.empty', '人才库暂无匹配数据')}
                    </td>
                  </tr>
                ) : (
                  filteredCandidates.map(c => {
                    return (
                      <tr 
                        key={c.id} 
                        style={{ 
                          borderBottom: '1px solid var(--border-hairline)', 
                          transition: 'background 0.2s',
                          cursor: 'pointer'
                        }} 
                        className="hover-row"
                        onClick={() => openCandidate(c)}
                      >
                        <td style={{ padding: 'var(--space-3) var(--space-5)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(148, 163, 184, 0.1)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '600', fontSize: '0.875rem' }}>
                              {c.name ? c.name.charAt(0) : '?'}
                            </div>
                            <div>
                              <div style={{ color: 'var(--text-primary)', fontWeight: '500', fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>{c.name}</span>
                              </div>
                              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {c.phone ? (
                                  <>
                                    <WhatsAppButton phone={c.phone} candidateName={c.name} variant="text" />
                                    {[c.location, c.degree, c.school].filter(Boolean).length > 0 && <span>·</span>}
                                  </>
                                ) : (
                                  <span style={{ opacity: 0.6 }}>{t('talentPoolPage.noPhone', '未留电话')}</span>
                                )}
                                <span>{[c.location, c.degree, c.school].filter(Boolean).join(' · ')}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-5)' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span style={{ 
                                fontWeight: c.company ? '600' : '400', 
                                color: c.company ? 'var(--text-primary)' : 'var(--text-muted)', 
                                fontSize: 'var(--text-sm)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                <i className="ph ph-buildings" style={{ color: c.company ? 'var(--text-secondary)' : 'var(--text-muted)', fontSize: '0.9rem' }}></i>
                                {c.company || t('talentPoolPage.unspecified', '未指定')}
                              </span>
                              {c.department && (
                                <span className="tag-pill" style={{ fontSize: '10px', padding: '1px 6px', background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', border: '1px solid var(--border-hairline)' }}>
                                  {c.department}
                                </span>
                              )}
                            </div>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                              {c.position || t('talentPoolPage.unassignedRole', '未指定岗位')}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-5)' }}>
                           <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span 
                              className="badge" 
                              style={{ 
                                background: 'rgba(244, 63, 94, 0.12)', 
                                color: '#fb7185', 
                                border: '1px solid rgba(244, 63, 94, 0.3)', 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '5px',
                                fontWeight: '500',
                                width: 'fit-content'
                              }}
                            >
                              <i className="ph-fill ph-x-circle" style={{ color: '#f43f5e', fontSize: '13px' }}></i>
                              {Utils.getDropReasonLabel(c.rejectReason, t)}
                            </span>
                            {c.rejectNote && (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.rejectNote}>
                                {t('talentPoolPage.notePrefix', '备注: ')}{c.rejectNote}
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-5)', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                          {Utils.formatDate(c.updatedAt?.toDate ? c.updatedAt.toDate() : c.updatedAt)}
                        </td>
                        <td style={{ padding: 'var(--space-3) var(--space-5)', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-1)' }}>
                            {!isReadOnlyView && (
                              <button 
                                className="btn-icon" 
                                title={t('talentPoolPage.deleteTooltip', '删除档案')} 
                                style={{ color: 'var(--accent-rose)', opacity: 0.8 }}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const ok = await confirm(`${t('talentPoolPage.deleteConfirmPre', '确定要永久删除 "')}${c.name}${t('talentPoolPage.deleteConfirmPost', '" 吗？此操作无法撤销。')}`, {
                                    title: t('talentPoolPage.deleteConfirmTitle', '删除档案确认'),
                                    danger: true,
                                    confirmLabel: t('talentPoolPage.confirmDeleteBtn', '确认删除')
                                  });
                                  if (!ok) return;
                                  try {
                                    await FirestoreStore.deleteCandidate(teamId, c.id);
                                    SystemLogger.audit(teamId, user, 'DELETE', 'CANDIDATE', c.name, {
                                      actionDetail: `人才库中删除了候选人: ${c.name}`
                                    });
                                    showToast(`"${c.name}"${t('talentPoolPage.deletedSuccessPost', ' 已删除')}`, 'info');
                                  } catch (err) {
                                    showToast(t('talentPoolPage.deleteFailed', '删除失败: ') + err.message, 'error');
                                  }
                                }}
                              >
                                <i className="ph-light ph-trash"></i>
                              </button>
                            )}
                            <button className="btn-icon" title={t('talentPoolPage.viewProfileTooltip', '查看档案')} onClick={() => openCandidate(c)}>
                              <i className="ph-light ph-caret-right"></i>
                            </button>
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

        <style dangerouslySetInnerHTML={{__html: `
          .hover-row:hover { background: rgba(255,255,255,0.02); }
        `}} />
      </div>

      <CandidateDrawer 
        isOpen={isDrawerOpen} 
        onClose={closeDrawer} 
        candidate={selectedCandidate} 
      />
    </>
  );
}
