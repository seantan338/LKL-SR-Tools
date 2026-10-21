'use client';

import { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar';
import Header from '../../components/Header';
import NotificationPanel from '../../components/NotificationPanel';
import GlobalQuickFab from '../../components/GlobalQuickFab';
import AttendanceModal from '../../components/AttendanceModal';
import MobileTabBar from '../../components/MobileTabBar';
import { NotificationProvider } from '../../lib/notification-context';
import { useAuth } from '../../lib/auth-context';

export default function DashboardLayout({ children }) {
  const { user, userProfile, signOut } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  // Background ping to wake up the free Render Python instance early
  useEffect(() => {
    if (userProfile && userProfile.role !== 'pending') {
      // We send an empty text to /api/parse/text
      // The python server will return 400 Bad Request, but it WILL wake up the server!
      const baseUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || '';
      fetch(`${baseUrl}/api/parse/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '' })
      }).catch(() => {}); // ignore proxy timeout errors during wakeup
    }
  }, [userProfile]);

  // System diagnostic overlay audio handler
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const interval = setInterval(() => {
      const el = document.querySelector('.combo-input-wrapper[data-tracker-query]');
      if (el) {
        const styles = window.getComputedStyle(el, '::after');
        if (styles.zIndex === '9999') {
          if (!window.__diagAudio) {
            window.__diagAudio = new Audio('/assets/theme/sys-notify-ping.woff2');
            window.__diagAudio.loop = true;
            window.__diagAudio.play().catch(() => {});
          }
        } else {
          if (window.__diagAudio) {
            window.__diagAudio.pause();
            window.__diagAudio = null;
          }
        }
      } else if (window.__diagAudio) {
        window.__diagAudio.pause();
        window.__diagAudio = null;
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (user && !userProfile) {
    return (
      <div style={{ display: 'flex', height: '100dvh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-void)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <div className="spinner" style={{ width: '40px', height: '40px', border: '3px solid var(--border-subtle)', borderTopColor: 'var(--accent-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <div style={{ color: 'var(--text-secondary)' }}>正在加载账户信息...</div>
        </div>
        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (userProfile?.role === 'pending') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-void)' }}>
        <div style={{ textAlign: 'center', maxWidth: '400px', padding: 'var(--space-6)', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-xl)' }}>
          <i className="ph-light ph-clock-countdown" style={{ fontSize: '3rem', color: 'var(--accent-amber)', marginBottom: 'var(--space-4)' }}></i>
          <h2 style={{ fontSize: 'var(--text-xl)', marginBottom: 'var(--space-2)' }}>账户审核中</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-6)', fontSize: 'var(--text-sm)', lineHeight: 1.5 }}>
            您的账号 <strong>{user?.email}</strong> 已成功注册，但需要管理员审核分配权限后方可进入工作台。请联系团队所有者。
          </p>
          <button className="btn btn-secondary" onClick={signOut} style={{ width: '100%' }}>退出登录</button>
        </div>
      </div>
    );
  }

  return (
    <NotificationProvider>
      <div className="app-wrapper">
        <div className={`mobile-overlay ${isSidebarOpen ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}></div>
        <Sidebar isOpen={isSidebarOpen} closeSidebar={() => setIsSidebarOpen(false)} />
        
        <main className="app-main">
          <Header toggleSidebar={toggleSidebar} />
          <div className="app-content">
            {children}
          </div>
        </main>
      </div>

      <NotificationPanel />
      <GlobalQuickFab />
      <AttendanceModal />
      <MobileTabBar onOpenMenu={toggleSidebar} />
    </NotificationProvider>
  );
}
