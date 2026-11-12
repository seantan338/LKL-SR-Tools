'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/auth-context';
import { useI18n } from '../../../lib/i18n-context';
import CachePrefetchEngine from '../../../components/CachePrefetchEngine';

export default function LoginPage() {
  const { signInWithGoogle, user } = useAuth();
  const { t, lang, setLang } = useI18n();
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

  if (user && !isSigningIn && !runPrefetch) {
    return (
      <div className="login-card" style={{ textAlign: 'center' }}>
        <i className="ph-light ph-spinner-gap" style={{ fontSize: '2rem', color: 'var(--accent)' }} aria-hidden="true"></i>
      </div>
    );
  }

  if (runPrefetch) {
    return (
      <CachePrefetchEngine onComplete={() => router.replace('/overview')} text="TALENT FLOW" />
    );
  }

  return (
    <div className="login-card">
      <div className="login-mark" aria-hidden="true">TF</div>
      <h1 className="login-title">{t('authPages.welcomeTitle', '欢迎使用 TALENT FLOW')}</h1>
      <p className="login-subtitle">{t('authPages.welcomeSubtitle', '候选人全生命周期与团队招聘协作')}</p>

      {error && (
        <div className="login-alert error" role="alert">
          <i className="ph-fill ph-warning-circle" aria-hidden="true"></i>
          {error}
        </div>
      )}

      {infoNotice && !error && (
        <div className="login-alert info" role="status">
          <i className="ph-fill ph-info" aria-hidden="true"></i>
          {infoNotice}
        </div>
      )}

      <button
        type="button"
        className="login-google"
        onClick={handleGoogleSignIn}
        disabled={isSigningIn}
      >
        {isSigningIn ? (
          <>
            <i className="ph-light ph-spinner-gap ph-spin" aria-hidden="true"></i>
            {t('authPages.signingIn', '正在登录...')}
          </>
        ) : (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {t('authPages.continueWithGoogle', '使用 Google 继续')}
          </>
        )}
      </button>

      {isSigningIn && (
        <button type="button" className="login-cancel" onClick={resetSignInState}>
          {t('authPages.cancelWaitRetry', '取消等待并重新尝试')}
        </button>
      )}

      <p className="login-footnote">{t('authPages.secureNote', '通过 Firebase Authentication 安全登录')}</p>

      <div className="login-seg" role="group" aria-label={t('authPages.languageGroup', '语言')}>
        <button type="button" aria-pressed={lang === 'zh'} onClick={() => setLang('zh')}>
          {t('authPages.langZh', '中文')}
        </button>
        <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
          {t('authPages.langEn', 'EN')}
        </button>
      </div>
    </div>
  );
}
