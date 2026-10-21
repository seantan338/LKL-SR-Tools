'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Utils } from '../lib/utils';
import { MatchService } from '../lib/match-service';
import { useI18n } from '../lib/i18n-context';
import { useFeedback } from '../lib/feedback-context';
import { useAuth } from '../lib/auth-context';
import MatchParameterModal from './MatchParameterModal';
import MatchResultPanel from './MatchResultPanel';

export default function OrderDrawer({ order, isOpen, onClose, onEdit, onQuickStatusChange, onViewCandidate }) {
  const [mounted, setMounted] = useState(false);
  const [isParamModalOpen, setIsParamModalOpen] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [matchResults, setMatchResults] = useState(null);
  const router = useRouter();
  const { t } = useI18n();
  const { showToast } = useFeedback();
  const { teamId } = useAuth();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  const statusMeta = Utils.getJobOrderStatusMeta(order?.status, t);

  return createPortal(
    <>
      <div className={`drawer-overlay ${isOpen ? 'active' : ''}`} onClick={onClose}></div>
      <div className={`drawer-container ${isOpen ? 'open' : ''}`}>
        
        {/* Drawer Header */}
        <div className="drawer-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)', margin: 0 }}>
                {order?.position || t('components.orderDrawer.unnamedPos')}
              </h2>
              <span className="badge" style={{ 
                color: statusMeta.color, 
                background: statusMeta.bg,
                borderColor: statusMeta.border
              }}>
                {statusMeta.label}
              </span>
              {onQuickStatusChange && order && (
                <select 
                  className="form-select btn-sm" 
                  style={{ fontSize: '11px', padding: '2px 8px', height: '28px', background: 'var(--bg-card)', borderColor: 'var(--border-subtle)', cursor: 'pointer' }}
                  value={order?.status || 'open'}
                  onChange={(e) => onQuickStatusChange(order.id, e.target.value, order.position)}
                  title={t('components.orderDrawer.quickStatus')}
                >
                  <option value="open">{t('orders.statusOpen')}</option>
                  <option value="urgent">{t('orders.statusUrgent')}</option>
                  <option value="paused">{t('orders.statusPaused')}</option>
                  <option value="filled">{t('orders.statusFilled')}</option>
                  <option value="closed">{t('orders.statusClosed')}</option>
                </select>
              )}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-md)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="ph-light ph-buildings"></i> {order?.company || t('components.orderDrawer.unnamedCompany')}
              </span>
              {(order?.createdAt || order?.updatedAt) && (
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <i className="ph-light ph-clock"></i>
                  {Utils.formatRelativeTime(order?.createdAt, t, order)}
                </span>
              )}
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button 
              className="btn btn-sm btn-primary" 
              onClick={() => setIsParamModalOpen(true)} 
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <i className="ph-fill ph-magic-wand"></i> {t('orders.aiRecommend', 'AI 智能推荐')}
            </button>
            <button className="btn btn-sm" onClick={() => onEdit(order)} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
              <i className="ph-light ph-pencil-simple"></i> {t('components.orderDrawer.edit')}
            </button>
            <button className="btn btn-icon" onClick={onClose}>
              <i className="ph-light ph-x" style={{ fontSize: '1.25rem' }}></i>
            </button>
          </div>
        </div>

        {/* Drawer Content */}
        <div className="drawer-body">
          {order ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
              
              <MatchResultPanel 
                isLoading={isMatching}
                results={matchResults}
                onDismiss={() => setMatchResults(null)}
                onViewCandidate={(id) => {
                  if (onViewCandidate) {
                    onViewCandidate(id);
                  } else {
                    router.push(`/candidates?id=${id}`);
                  }
                }}
              />

              {/* Quick Metrics */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', 
                gap: 'var(--space-4)',
                background: 'var(--bg-card)',
                padding: 'var(--space-5)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)'
              }}>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', marginBottom: '4px' }}>{t('components.orderDrawer.salary')}</div>
                  <div style={{ color: 'var(--accent-emerald)', fontWeight: '600' }}>{order.salary || t('components.orderDrawer.notSet')}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', marginBottom: '4px' }}>{t('components.orderDrawer.location')}</div>
                  <div style={{ color: 'var(--text-primary)' }}>{order.location || t('components.orderDrawer.notSet')}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', marginBottom: '4px' }}>{t('components.orderDrawer.headcount')}</div>
                  <div style={{ color: 'var(--accent-amber)' }}>{order.headcount || 1} {t('orders.pax')}</div>
                </div>
              </div>

              <div>
                <h4 style={{ color: 'var(--text-primary)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="ph-light ph-clock" style={{ color: 'var(--accent-amber)' }}></i> {t('components.orderDrawer.workHours')}
                </h4>
                <div style={{ 
                  background: 'rgba(255,255,255,0.02)', 
                  padding: 'var(--space-4)', 
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-secondary)',
                  fontSize: 'var(--text-sm)',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap'
                }}>
                  {order.workHours || t('components.orderDrawer.noWorkHours')}
                </div>
              </div>

              <div>
                <h4 style={{ color: 'var(--text-primary)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="ph-light ph-list-checks" style={{ color: 'var(--accent-blue)' }}></i> {t('components.orderDrawer.reqs')}
                </h4>
                <div style={{ 
                  background: 'rgba(255,255,255,0.02)', 
                  padding: 'var(--space-4)', 
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-secondary)',
                  fontSize: 'var(--text-sm)',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-wrap'
                }}>
                  {order.requirements || t('components.orderDrawer.noReqs')}
                </div>
              </div>

              {order.benefits && (
                <div>
                  <h4 style={{ color: 'var(--text-primary)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="ph-light ph-gift" style={{ color: 'var(--accent-rose)' }}></i> {t('components.orderDrawer.benefits')}
                  </h4>
                  <div style={{ 
                    background: 'rgba(255,255,255,0.02)', 
                    padding: 'var(--space-4)', 
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-secondary)',
                    fontSize: 'var(--text-sm)',
                    lineHeight: '1.6',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {order.benefits}
                  </div>
                </div>
              )}

              {order.notes && (
                <div style={{ 
                  borderTop: '1px dashed var(--border-subtle)', 
                  paddingTop: 'var(--space-5)', 
                  marginTop: 'var(--space-2)' 
                }}>
                  <h4 style={{ color: 'var(--text-primary)', marginBottom: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>{t('components.orderDrawer.teamNotes')}</h4>
                  <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>{order.notes}</div>
                </div>
              )}

            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
              {t('components.orderDrawer.emptySelect')}
            </div>
          )}
        </div>
      </div>
      <MatchParameterModal 
        isOpen={isParamModalOpen}
        onClose={() => setIsParamModalOpen(false)}
        order={order}
        onStartMatch={async (params) => {
          setIsParamModalOpen(false);
          setIsMatching(true);
          try {
            const results = await MatchService.matchCandidates(order, params, 5, 20, teamId);
            setMatchResults(results);
          } catch (e) {
            console.error("Match error:", e);
            showToast(e.message, 'error');
          } finally {
            setIsMatching(false);
          }
        }}
      />
    </>,
    document.body
  );
}
