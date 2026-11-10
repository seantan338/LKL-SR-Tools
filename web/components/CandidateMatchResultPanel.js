'use client';

import { useI18n } from '../lib/i18n-context';

export default function CandidateMatchResultPanel({ 
  results, 
  isLoading, 
  onDismiss, 
  onViewOrder, 
  onApplyOrder,
  isApplying = false 
}) {
  const { t } = useI18n();
  if (!isLoading && (!results || results.length === 0)) return null;

  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.45)',
      border: '1px solid var(--accent-blue)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-5)',
      marginBottom: 'var(--space-5)',
      position: 'relative',
      overflow: 'hidden',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)'
    }}>
      {/* Decorative Glow */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: '15%',
        width: '70%',
        height: '1px',
        background: 'linear-gradient(90deg, transparent, var(--accent-blue), transparent)',
        boxShadow: '0 0 20px 2px var(--accent-blue)'
      }}></div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, color: 'var(--accent-blue)', fontSize: '1rem' }}>
          <i className="ph-fill ph-magic-wand"></i> 
          {t('candidates.matchResultTitle', 'AI 推荐适配职位')}
          {results && results.length > 0 && !isLoading && (
            <span style={{ fontSize: '12px', fontWeight: 'normal', color: 'var(--text-muted)' }}>
              ({results.length} {t('candidates.matchResultCountSuffix', '个推荐岗位')})
            </span>
          )}
        </h3>
        {!isLoading && (
          <button className="btn btn-icon" onClick={onDismiss} style={{ color: 'var(--text-muted)' }} title={t('common.close', '关闭推荐')}>
            <i className="ph-light ph-x"></i>
          </button>
        )}
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'var(--space-8) 0' }}>
          <div className="spinner" style={{ 
            width: '32px', 
            height: '32px', 
            border: '3px solid rgba(56, 189, 248, 0.1)', 
            borderTopColor: 'var(--accent-blue)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginBottom: 'var(--space-4)'
          }}></div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            {t('candidates.matchSearching', 'AI 正在深度检索职位库并全面评估匹配度与适配性...')}
          </div>
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          `}} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {results.map((match, idx) => {
            const orderId = match.orderId || match.id;
            const score = match.score || 0;
            const scoreColor = score >= 80 ? 'var(--accent-emerald)' : score >= 60 ? 'var(--accent-blue)' : 'var(--accent-amber)';

            return (
              <div key={orderId || idx} style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-4)',
                position: 'relative',
                transition: 'border-color 0.2s'
              }}>
                {/* Header of Item */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-3)', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>
                        {match.position || t('components.orderDrawer.unnamedPos', '未命名职位')}
                      </strong>
                      <span className="badge" style={{ 
                        background: 'rgba(56, 189, 248, 0.1)', 
                        color: scoreColor, 
                        border: `1px solid ${scoreColor}40`,
                        fontWeight: '600'
                      }}>
                        {t('orders.matchScore', '匹配度')} {score}%
                      </span>
                    </div>
                    {match.company && (
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <i className="ph ph-buildings"></i> {match.company}
                      </div>
                    )}
                  </div>
                  
                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                    {orderId && onViewOrder && (
                      <button 
                        type="button"
                        className="btn btn-sm" 
                        onClick={() => onViewOrder(orderId)}
                        style={{ background: 'transparent', border: '1px solid var(--border-subtle)', fontSize: '12px' }}
                        title={t('candidates.viewJobOrder', '在新窗口或抽屉查看招聘需求详情')}
                      >
                        <i className="ph-light ph-arrow-square-out"></i> {t('candidates.matchViewOrder', '查看职位')}
                      </button>
                    )}
                    {onApplyOrder && (
                      <button 
                        type="button"
                        className="btn btn-sm btn-primary" 
                        onClick={() => onApplyOrder(match)}
                        disabled={isApplying}
                        style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                        title={t('candidates.applyOrderTooltip', '将该候选人的意向企业与应聘岗位快速更新为此职位')}
                      >
                        <i className="ph-fill ph-paper-plane-tilt"></i> {t('candidates.matchApplyOrder', '一键转投此岗位')}
                      </button>
                    )}
                  </div>
                </div>

                {/* Analysis */}
                {(match.analysis || match.reason) && (
                  <div style={{ 
                    fontSize: 'var(--text-xs)', 
                    color: 'var(--text-secondary)',
                    background: 'rgba(255, 255, 255, 0.02)',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    marginBottom: 'var(--space-3)',
                    lineHeight: '1.6',
                    border: '1px solid var(--border-hairline)'
                  }}>
                    {match.analysis || match.reason}
                  </div>
                )}

                {/* Highlights & Risks Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', fontSize: '11px' }}>
                  <div>
                    <div style={{ color: 'var(--accent-emerald)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '600' }}>
                      <i className="ph-fill ph-check-circle"></i> {t('orders.matchHighlights', '契合优势')}
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '16px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                      {(match.highlights && match.highlights.length > 0) ? (
                        match.highlights.map((hl, i) => <li key={i}>{hl}</li>)
                      ) : (
                        <li style={{ color: 'var(--text-muted)' }}>-</li>
                      )}
                    </ul>
                  </div>
                  <div>
                    <div style={{ color: 'var(--accent-rose)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '600' }}>
                      <i className="ph-fill ph-warning-circle"></i> {t('orders.matchRisks', '潜在差距 / 风险')}
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '16px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                      {(match.risks && match.risks.length > 0) ? (
                        match.risks.map((rk, i) => <li key={i}>{rk}</li>)
                      ) : (
                        <li style={{ color: 'var(--text-muted)' }}>-</li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
