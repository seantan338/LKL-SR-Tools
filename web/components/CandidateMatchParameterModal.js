'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../lib/i18n-context';
import { Utils } from '../lib/utils';

export default function CandidateMatchParameterModal({ isOpen, onClose, candidate, onStartMatch }) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [location, setLocation] = useState('');
  const [onlyActive, setOnlyActive] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (candidate?.location) {
      setLocation(candidate.location);
    } else {
      setLocation('');
    }
  }, [candidate]);

  if (!mounted || !isOpen) return null;

  const handleStart = () => {
    onStartMatch({
      location: location.trim(),
      onlyActive
    });
  };

  const isRejected = candidate?.status === 'rejected';

  return createPortal(
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10001
    }} onClick={onClose}>
      <div className="bezel-shell modal-bezel" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px', width: '90%', animation: 'modalEnter 0.3s cubic-bezier(0.32, 0.72, 0, 1)' }}>
        <div className="bezel-core modal-core" style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', maxHeight: '90vh', overflowY: 'auto' }}>
          
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: 'var(--text-lg)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0, color: 'var(--text-primary)' }}>
              <i className="ph-fill ph-magic-wand" style={{ color: 'var(--accent-blue)' }}></i> 
              {t('candidates.matchModalTitle', 'AI 职位反向配对预设')}
            </h3>
            <button className="btn-icon" onClick={onClose}>
              <i className="ph-light ph-x"></i>
            </button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            {/* Candidate Card Summary */}
            <div style={{ background: 'var(--bg-card)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '4px' }}>
                {t('candidates.matchModalTargetCandidate', '匹配候选人')}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '1rem' }}>
                  {candidate?.name || '-'}
                </span>
                {isRejected && (
                  <span className="badge" style={{ background: 'rgba(244, 63, 94, 0.12)', color: '#fb7185', border: '1px solid rgba(244, 63, 94, 0.3)', fontSize: '11px' }}>
                    <i className="ph-fill ph-archive" style={{ marginRight: '4px' }}></i>
                    {t('candidates.matchModalTalentPoolCandidate', '储备人才库档案')}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                <span>🎯 {candidate?.position || t('candidates.drawer.unsetRole', '待定岗位')}</span>
                {candidate?.location && <span>📍 {candidate.location}</span>}
                {candidate?.expectedSalary && <span>💰 期望 {candidate.expectedSalary}</span>}
              </div>
              {isRejected && candidate?.rejectReason && (
                <div style={{ marginTop: '8px', padding: '6px 10px', background: 'rgba(244, 63, 94, 0.05)', borderRadius: 'var(--radius-sm)', border: '1px dashed rgba(244, 63, 94, 0.25)', fontSize: '11px', color: 'var(--text-muted)' }}>
                  ⚠️ {t('candidates.matchModalPastDropReason', '历史放弃原因')}: <strong style={{ color: '#fb7185' }}>{Utils.getDropReasonLabel(candidate.rejectReason, t)}</strong>
                  {candidate.rejectNote && <span> - {candidate.rejectNote}</span>}
                </div>
              )}
            </div>

            <div>
              <h4 style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', marginBottom: 'var(--space-3)' }}>
                🎯 {t('orders.matchModalHardFilters', '必须符合的硬性条件')}
              </h4>
              
              {/* Location */}
              <div className="form-group" style={{ marginBottom: 'var(--space-3)' }}>
                <label className="form-label">
                  📍 {t('candidates.matchModalLocationLimit', '目标工作地点 (留空则不限)')}
                </label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder={t('orders.matchModalLocationPlaceholder', '例如：Johor Bahru 或 Singapore')}
                />
              </div>

              {/* Only Active Orders */}
              <div 
                style={{ 
                  display: 'flex', 
                  alignItems: 'flex-start', 
                  gap: '12px', 
                  padding: 'var(--space-4)', 
                  background: onlyActive ? 'rgba(56, 189, 248, 0.08)' : 'var(--bg-card)',
                  border: `1px solid ${onlyActive ? 'var(--accent-blue)' : 'var(--border-subtle)'}`,
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onClick={() => setOnlyActive(!onlyActive)}
              >
                <input 
                  type="checkbox" 
                  checked={onlyActive}
                  readOnly
                  style={{ marginTop: '4px', cursor: 'pointer' }}
                />
                <div>
                  <div style={{ fontWeight: '500', color: onlyActive ? 'var(--accent-blue)' : 'var(--text-primary)', marginBottom: '4px' }}>
                    {t('candidates.matchModalOnlyActiveOrders', '仅匹配有效在招职位 (推荐)')}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                    {t('candidates.matchModalOnlyActiveOrdersDesc', '排除已结案或已招满的职位，优先推荐急聘 (Urgent) 与正在开放招聘 (Open) 的职位。')}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--space-4)', marginTop: 'var(--space-2)', display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
            <button className="btn btn-secondary" onClick={onClose}>{t('orders.cancel', '取消')}</button>
            <button className="btn btn-primary" onClick={handleStart} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="ph-bold ph-sparkle"></i> {t('candidates.matchModalStartBtn', '开始匹配适配岗位')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
