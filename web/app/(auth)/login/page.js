'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/auth-context';
import { useI18n } from '../../../lib/i18n-context';
import CachePrefetchEngine from '../../../components/CachePrefetchEngine';

export default function LoginPage() {
  const { signInWithGoogle, loading, user } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState('');
  const [infoNotice, setInfoNotice] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [runPrefetch, setRunPrefetch] = useState(false);
  const timeoutRef = useRef(null);

  const resetSignInState = () => {
    setIsSigningIn(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setError('');
    setInfoNotice('');

    // Safety timeout: if popup is closed and Firebase SDK delays polling, auto-reset after 10s
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsSigningIn(false);
      setInfoNotice(t('authPages.loginTimeoutNotice', '登录等待超时或授权窗口已关闭。请重新点击登录。'));
    }, 10000);

    try {
      await signInWithGoogle();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      const usePrefetch = typeof window !== 'undefined' && localStorage.getItem('__ag_cache_prefetch') === '1';
      if (usePrefetch) {
        setRunPrefetch(true);
      } else {
        router.replace('/overview');
      }
    } catch (err) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setIsSigningIn(false);

      const code = err?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setInfoNotice(t('authPages.loginCancelledNotice', '已取消 Google 授权登录。如需进入系统，请重新点击登录。'));
      } else if (code === 'auth/popup-blocked') {
        setError(t('authPages.loginPopupBlocked', '登录弹窗被浏览器拦截，请在地址栏允许弹出窗口后重试。'));
      } else if (code === 'auth/unauthorized-domain') {
        setError(t('authPages.loginUnauthorizedDomain', '当前网址未在 Firebase 授权网域白名单中，请联系管理员配置。'));
      } else if (code === 'auth/network-request-failed') {
        setError(t('authPages.loginNetworkError', '网络连接中断，请检查网络后重试。'));
      } else {
        setError(err?.message || t('authPages.loginFailedDefault', '登录失败，请重试。'));
      }
    }
  };

  // If already logged in (and not currently signing in), show loader while AuthGuard redirects
  if ((user || loading) && !isSigningIn && !runPrefetch) {
    return (
      <div className="bezel-shell modal-bezel" style={{ width: '400px', maxWidth: '90vw' }}>
        <div className="bezel-core modal-core" style={{ textAlign: 'center', padding: 'var(--space-10)' }}>
          <i className="ph-light ph-spinner-gap" style={{ fontSize: '2rem', color: 'var(--accent-blue)', animation: 'pulse 2s infinite' }}></i>
        </div>
      </div>
    );
  }

  if (runPrefetch) {
    return (
      <CachePrefetchEngine onComplete={() => router.replace('/overview')} text="Talent Flow" />
    );
  }

  return (
    <div className="bezel-shell modal-bezel" style={{ width: '440px', maxWidth: '90vw', animation: 'modalEnter 0.5s cubic-bezier(0.32, 0.72, 0, 1)' }}>
      <div className="bezel-core modal-core" style={{ padding: 'var(--space-10) var(--space-8)' }}>
        
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-8)' }}>
          <div className="brand-symbol" style={{ width: '56px', height: '56px', fontSize: '1.75rem', margin: '0 auto var(--space-4)' }}>
            <i className="ph-bold ph-intersect-three"></i>
          </div>
          <h1 style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
            Welcome to Talent Flow
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            Internship Recruitment & Candidate Management
          </p>
        </div>

        {error && (
          <div className="agy-style-alert" style={{ 
            padding: 'var(--space-3)', 
            background: 'rgba(244, 63, 94, 0.1)', 
            border: '1px solid rgba(244, 63, 94, 0.2)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--accent-rose)',
            fontSize: 'var(--text-sm)',
            marginBottom: 'var(--space-5)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)'
          }}>
            <i className="ph-fill ph-warning-circle"></i>
            {error}
          </div>
        )}

        {infoNotice && !error && (
          <div className="agy-style-alert" style={{ 
            padding: 'var(--space-3)', 
            background: 'rgba(245, 158, 11, 0.1)', 
            border: '1px solid rgba(245, 158, 11, 0.25)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--accent-amber)',
            fontSize: 'var(--text-sm)',
            marginBottom: 'var(--space-5)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)'
          }}>
            <i className="ph-fill ph-info"></i>
            {infoNotice}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', alignItems: 'center' }}>
          <button 
            className="btn btn-primary" 
            style={{ 
              width: '100%', 
              justifyContent: 'center', 
              padding: '0.875rem', 
              fontSize: 'var(--text-base)',
              background: '#ffffff',
              color: '#000000',
              boxShadow: '0 4px 14px rgba(255,255,255,0.1)'
            }}
            onClick={handleGoogleSignIn}
            disabled={isSigningIn}
          >
            {isSigningIn ? (
              <>
                <i className="ph-light ph-spinner-gap" style={{ animation: 'spin 1s linear infinite' }}></i>
                Signing in...
              </>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </>
            )}
          </button>

          {isSigningIn && (
            <button
              type="button"
              onClick={resetSignInState}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: 'var(--text-xs)',
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: '2px 8px',
                transition: 'color 0.2s'
              }}
            >
              {t('authPages.cancelWaitRetry', '取消等待并重新尝试')}
            </button>
          )}
        </div>

        <div style={{ marginTop: 'var(--space-6)', textAlign: 'center' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Securely authenticate via Firebase Auth.
          </p>
        </div>

      </div>
    </div>
  );
}
