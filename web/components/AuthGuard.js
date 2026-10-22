'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../lib/auth-context';
import { useI18n } from '../lib/i18n-context';

export default function AuthGuard({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();

  useEffect(() => {
    if (!loading) {
      if (!user && pathname !== '/login') {
        router.replace('/login');
      } else if (user && pathname === '/login') {
        // Only redirect immediately if the easter egg is not enabled
        const usePrefetch = typeof window !== 'undefined' && localStorage.getItem('__ag_cache_prefetch') === '1';
        if (!usePrefetch) {
          router.replace('/overview');
        }
      }
    }
  }, [user, loading, router, pathname]);

  if (loading) {
    return (
      <div className="empty-state" style={{ height: '100dvh', justifyContent: 'center' }}>
        <div className="empty-state-icon" style={{ animation: 'pulse 2s infinite' }}>
          <i className="ph-light ph-spinner-gap"></i>
        </div>
        <div className="empty-state-title">{t('authPages.verifyingIdentity', '正在验证身份...')}</div>
      </div>
    );
  }

  // Prevent rendering children if unauthenticated and trying to access protected routes
  if (!user && pathname !== '/login') {
    return null;
  }

  return children;
}
