'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.warn('Next.js route error caught by error boundary:', error);
  }, [error]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '80vh',
      padding: '24px',
      color: 'var(--text-primary, #ffffff)',
      textAlign: 'center',
      userSelect: 'none'
    }}>
      <div style={{
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '16px',
        padding: '32px 28px',
        maxWidth: '420px',
        width: '100%',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(12px)'
      }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔄</div>
        <h3 style={{ fontSize: '17px', fontWeight: '700', margin: '0 0 8px 0', color: 'var(--text-primary, #fff)' }}>
          页面状态已重置
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-muted, rgba(255,255,255,0.6))', lineHeight: 1.5, margin: '0 0 20px 0' }}>
          检测到云端更新或网络波动，请点击下方按钮重新同步并恢复工作台。
        </p>
        <button
          onClick={() => {
            if (typeof reset === 'function') reset();
            else if (typeof window !== 'undefined') window.location.reload();
          }}
          className="btn btn-primary"
          style={{
            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            color: '#fff',
            border: 'none',
            borderRadius: '999px',
            padding: '8px 24px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          立即重新加载 (Reload)
        </button>
      </div>
    </div>
  );
}
