'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../lib/i18n-context';

export default function MatchParameterModal({ isOpen, onClose, order, onStartMatch }) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [location, setLocation] = useState('');
  const [mineTalentPool, setMineTalentPool] = useState(true); // V2 Feature!

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (order?.location) {
      setLocation(order.location);
    }
  }, [order]);

  if (!mounted || !isOpen) return null;

  const handleStart = () => {
    onStartMatch({
      location: location,
      excludeRejected: !mineTalentPool // If we mine talent pool, we don't exclude rejected
    });
  };

  return createPortal(
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
    }} onClick={onClose}>
      <div className="bezel-shell modal-bezel" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', width: '90%', animation: 'modalEnter 0.3s cubic-bezier(0.32, 0.72, 0, 1)' }}>
        <div className="bezel-core modal-core" style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', maxHeight: '90vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: 'var(--text-lg)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0, color: 'var(--text-primary)' }}>
              <i className="ph-fill ph-magic-wand" style={{ color: 'var(--accent-blue)' }}></i> {t('orders.matchModalTitle', 'AI 智能匹配预设条件')}
            </h3>
            <button className="btn-icon" onClick={onClose}>
              <i className="ph-light ph-x"></i>
            </button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <div style={{ background: 'var(--bg-card)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: '4px' }}>{t('orders.matchModalTargetPos', '目标岗位')}</div>
              <div style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{order?.position || '-'} <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal' }}>({order?.company || '-'})</span></div>
            </div>

            <div>
              <h4 style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', marginBottom: 'var(--space-3)' }}>🎯 {t('orders.matchModalHardFilters', '必须符合的硬性条件')}</h4>
              
              <div className="form-group" style={{ marginBottom: 'var(--space-3)' }}>
                <label className="form-label">📍 {t('orders.matchModalLocationLimit', '地点限制 (留空则不限)')}</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder={t('orders.matchModalLocationPlaceholder', '例如：Johor Bahru 或 Singapore')}
                />
              </div>

              <div 
                style={{ 
                  display: 'flex', 
                  alignItems: 'flex-start', 
                  gap: '12px', 
                  padding: 'var(--space-4)', 
                  background: mineTalentPool ? 'rgba(56, 189, 248, 0.1)' : 'var(--bg-card)',
                  border: `1px solid ${mineTalentPool ? 'var(--accent-blue)' : 'var(--border-subtle)'}`,
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onClick={() => setMineTalentPool(!mineTalentPool)}
              >
                <input 
                  type="checkbox" 
                  checked={mineTalentPool}
                  readOnly
                  style={{ marginTop: '4px', cursor: 'pointer' }}
                />
                <div>
                  <div style={{ fontWeight: '500', color: mineTalentPool ? 'var(--accent-blue)' : 'var(--text-primary)', marginBottom: '4px' }}>
                    {t('orders.matchModalMineTalentPool', '重点挖掘储备人才库 (盘活历史资源)')}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                    {t('orders.matchModalMineTalentPoolDesc', '开启后，AI 将重点检索之前因薪资、地点或暂无合适岗位等原因被标记为“已淘汰 / 放弃”的候选人。并根据他们过去的淘汰原因与当前新岗位的匹配度，给出“反转”推荐。')}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--space-4)', marginTop: 'var(--space-2)', display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
            <button className="btn btn-secondary" onClick={onClose}>{t('orders.cancel', '取消')}</button>
            <button className="btn btn-primary" onClick={handleStart} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="ph-bold ph-sparkle"></i> {t('orders.matchModalStartBtn', '开始智能匹配')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
