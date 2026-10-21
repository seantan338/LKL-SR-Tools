'use client';

import { useState } from 'react';
import { useI18n } from '../lib/i18n-context';

export default function MatchResultPanel({ results, isLoading, onDismiss, onViewCandidate, onWhatsAppContact }) {
  const { t } = useI18n();
  if (!isLoading && (!results || results.length === 0)) return null;

  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.4)',
      border: '1px solid var(--accent-blue)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-5)',
      marginTop: 'var(--space-4)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Decorative Glow */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: '20%',
        width: '60%',
        height: '1px',
        background: 'linear-gradient(90deg, transparent, var(--accent-blue), transparent)',
        boxShadow: '0 0 20px 2px var(--accent-blue)'
      }}></div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, color: 'var(--accent-blue)' }}>
          <i className="ph-fill ph-magic-wand"></i> {t('orders.matchResultTitle', 'AI 匹配推荐')}
        </h3>
        {!isLoading && (
          <button className="btn btn-icon" onClick={onDismiss} style={{ color: 'var(--text-muted)' }}>
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
          <div style={{ color: 'var(--text-secondary)' }}>{t('orders.matchSearching', 'AI 正在深度检索人才库与储备池...')}</div>
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          `}} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {results.map((match, idx) => {
            const isReverseRecommendation = match.reason?.includes('【强烈建议复用】');
            
            return (
              <div key={match.candidateId || idx} style={{
                background: 'var(--bg-card)',
                border: `1px solid ${isReverseRecommendation ? 'var(--accent-amber)' : 'var(--border-subtle)'}`,
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-4)',
                position: 'relative'
              }}>
                {isReverseRecommendation && (
                  <div style={{
                    position: 'absolute',
                    top: '-10px',
                    right: '16px',
                    background: 'var(--accent-amber)',
                    color: '#000',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: '0 2px 8px rgba(245, 158, 11, 0.4)'
                  }}>
                    <i className="ph-fill ph-fire"></i> {t('orders.matchRevive', '资源盘活')}
                  </div>
                )}
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-3)' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <strong style={{ fontSize: 'var(--text-lg)' }}>{t('orders.matchCandidateId', '候选人 ID')}: {match.candidateId.substring(0, 8)}...</strong>
                      <span className="badge" style={{ background: 'rgba(56, 189, 248, 0.1)', color: 'var(--accent-blue)', border: '1px solid rgba(56,189,248,0.2)' }}>
                        {t('orders.matchScore', '匹配度')} {match.score}%
                      </span>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <button 
                      className="btn btn-sm" 
                      onClick={() => onViewCandidate(match.candidateId)}
                      style={{ background: 'transparent', border: '1px solid var(--border-subtle)' }}
                    >
                      <i className="ph-light ph-user"></i> {t('orders.matchViewProfile', '查看档案')}
                    </button>
                  </div>
                </div>

                <div style={{ 
                  fontSize: 'var(--text-sm)', 
                  color: isReverseRecommendation ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: isReverseRecommendation ? 'rgba(245, 158, 11, 0.05)' : 'transparent',
                  padding: isReverseRecommendation ? 'var(--space-3)' : '0',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: 'var(--space-3)',
                  lineHeight: '1.5'
                }}>
                  {match.reason}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', fontSize: 'var(--text-xs)' }}>
                  <div>
                    <div style={{ color: 'var(--accent-emerald)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <i className="ph-fill ph-check-circle"></i> {t('orders.matchHighlights', '关键亮点')}
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '16px', color: 'var(--text-secondary)' }}>
                      {(match.highlights || []).map((hl, i) => <li key={i}>{hl}</li>)}
                    </ul>
                  </div>
                  <div>
                    <div style={{ color: 'var(--accent-rose)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <i className="ph-fill ph-warning-circle"></i> {t('orders.matchRisks', '潜在风险')}
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '16px', color: 'var(--text-secondary)' }}>
                      {(match.risks || []).map((rk, i) => <li key={i}>{rk}</li>)}
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
