'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../lib/auth-context';
import { useI18n } from '../lib/i18n-context';
import { APP_VERSION } from '../lib/version';
import { FirestoreStore } from '../lib/firestore-store';

export default function Sidebar({ isOpen, closeSidebar }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, userProfile, teamId: authTeamId, signOut, isOwner, isHqTeam } = useAuth();
  const { lang, toggleLang, t } = useI18n();
  const [theme, setTheme] = useState('dark');
  const [unreadAnnouncementsCount, setUnreadAnnouncementsCount] = useState(0);

  useEffect(() => {
    const uid = user?.uid || userProfile?.uid || userProfile?.id;
    if (!uid) return;
    const teamId = authTeamId || userProfile?.teamId || 'default_team';

    let allAnnouncements = [];
    let myReads = {};

    const updateCount = () => {
      const unread = allAnnouncements.filter(item => {
        if (item.isDeleted) return false;
        if (item.priority === 'P3_LOW') return false; // P3 不主动打扰
        if (item.category === 'SYSTEM_UPDATE') return false; // 系统更新由独立日志轴承载，不阻塞红点
        const read = myReads[item.id];
        if (!read) return true;
        if (item.requireAck && !read.ackAt) return true;
        return false;
      });
      setUnreadAnnouncementsCount(unread.length);
    };

    const unsubAnn = FirestoreStore.subscribeToAnnouncements(teamId, (list) => {
      allAnnouncements = list || [];
      updateCount();
    });

    const unsubReads = FirestoreStore.subscribeToMyAnnouncementReads(uid, (reads) => {
      myReads = reads || {};
      updateCount();
    });

    return () => {
      unsubAnn();
      unsubReads();
    };
  }, [user?.uid, userProfile?.uid, userProfile?.id, authTeamId, userProfile?.teamId]);

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme') || (typeof window !== 'undefined' ? localStorage.getItem('talent_flow_theme') : null) || 'dark';
    setTheme(current);

    const onThemeChange = () => {
      const updated = document.documentElement.getAttribute('data-theme') || 'dark';
      setTheme(updated);
    };
    window.addEventListener('themechange', onThemeChange);
    return () => window.removeEventListener('themechange', onThemeChange);
  }, []);

  const toggleTheme = () => {
    let nextTheme = 'dark';
    if (theme === 'dark') nextTheme = 'gemini';
    else if (theme === 'gemini') nextTheme = 'light';
    else nextTheme = 'dark';

    if (nextTheme === 'dark') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', nextTheme);
    }
    try {
      localStorage.setItem('talent_flow_theme', nextTheme);
    } catch (e) {}
    setTheme(nextTheme);
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: nextTheme } }));
  };

  const handleLogoClick = () => {
    router.push('/overview');
    if (closeSidebar) closeSidebar();
  };

  const navItems = [
    { path: '/overview', labelKey: 'nav.overview', fallback: '工作台概览', icon: 'ph-squares-four' },
    { path: '/announcements', labelKey: 'nav.announcements', fallback: '公告通知', icon: 'ph-megaphone-simple' },
    { path: '/orders', labelKey: 'nav.orders', fallback: '招聘订单', icon: 'ph-briefcase' },
    { path: '/ai-parser', labelKey: 'nav.aiParser', fallback: 'AI 职位生成', icon: 'ph-magic-wand' },
    { path: '/cv-autofill', labelKey: 'nav.cvAutofill', fallback: 'CV 简历解析', icon: 'ph-file-text' },
    { path: '/candidates', labelKey: 'nav.candidates', fallback: '候选人管理', icon: 'ph-users' },
    { path: '/talent-pool', labelKey: 'nav.talentPool', fallback: '储备人才库', icon: 'ph-archive-tray' },
    { path: '/pipeline', labelKey: 'nav.pipeline', fallback: '招聘看板', icon: 'ph-kanban' },
    { path: '/calendar', labelKey: 'nav.calendar', fallback: '面试日程', icon: 'ph-calendar-blank' },
    { path: '/analytics', labelKey: 'nav.analytics', fallback: '数据洞察', icon: 'ph-chart-pie-slice' },
    { path: '/leaderboard', labelKey: 'nav.leaderboard', fallback: 'Leaderboard', icon: 'ph-trophy', hqOnly: true },
    // { path: '/whatsapp', labelKey: 'nav.whatsapp', fallback: 'WhatsApp 触达', icon: 'ph-whatsapp-logo' },
    { path: '/team', labelKey: 'nav.team', fallback: '团队与权限', icon: 'ph-users-three' },
    { path: '/feedback', labelKey: 'nav.feedback', fallback: '意见反馈', icon: 'ph-chat-circle-dots' },
  ];

  const visibleNavItems = navItems.filter((item) => {
    if (item.ownerOnly && !isOwner) return false;
    if (item.hqOnly && !isHqTeam) return false;
    return true;
  });

  return (
    <aside className={`app-sidebar ${isOpen ? 'open' : ''}`} id="appSidebar">
      <div className="sidebar-bezel-outer">
        <div className="sidebar-bezel-inner">
          <div>
            <div className="sidebar-brand" onClick={handleLogoClick} style={{ cursor: 'pointer', userSelect: 'none' }} title="TALENT FLOW">
              <div className="brand-symbol">
                <i className="ph-bold ph-intersect-three"></i>
              </div>
              <div className="brand-text">
                <span className="brand-title">OMNI RECRUIT</span>
                <span className="brand-subtitle">MANAGEMENT</span>
              </div>
            </div>

            <nav className="sidebar-nav">
              <span className="nav-section-label">{t('nav.sectionManagement', '管理视图')}</span>

              {visibleNavItems.map((item) => {
                const isActive = pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={`nav-item ${isActive ? 'active' : ''}`}
                    onClick={closeSidebar}
                  >
                    <div className="nav-item-content">
                      <i className={`ph-light ${item.icon}`}></i>
                      <span>{t(item.labelKey, item.fallback)}</span>
                      {item.path === '/announcements' && unreadAnnouncementsCount > 0 && (
                        <span style={{
                          fontSize: '10px',
                          background: '#ef4444',
                          color: '#ffffff',
                          padding: '1px 6px',
                          borderRadius: '10px',
                          marginLeft: 'auto',
                          fontWeight: '700',
                          boxShadow: '0 0 6px rgba(239, 68, 68, 0.5)'
                        }}>
                          {unreadAnnouncementsCount > 99 ? '99+' : unreadAnnouncementsCount}
                        </span>
                      )}
                      {item.ownerOnly && (
                        <span style={{ fontSize: '10px', background: 'rgba(234, 179, 8, 0.15)', color: 'var(--accent-amber)', padding: '1px 5px', borderRadius: '4px', marginLeft: 'auto', fontWeight: '600' }}>
                          Owner
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="sidebar-footer">
            <div className="sidebar-data-status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <div className="status-indicator">
                <span className="status-dot"></span>
                <span>{t('brand.statusConnected', 'Firebase Connected')}</span>
              </div>
              <span style={{
                fontSize: '10px',
                fontWeight: '700',
                color: 'var(--accent-blue)',
                background: 'rgba(59, 130, 246, 0.12)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                padding: '1px 6px',
                borderRadius: '4px',
                letterSpacing: '0.03em'
              }}>
                {APP_VERSION}
              </span>
            </div>

            <Link href="/docs" className="sidebar-action-btn" onClick={closeSidebar}>
              <i className="ph-light ph-book-open"></i>
              {t('nav.docs', '操作手册')}
            </Link>

            <Link href="/logs" className="sidebar-action-btn" onClick={closeSidebar}>
              <i className="ph-light ph-terminal-window"></i>
              {t('nav.logs', '系统日志')}
            </Link>

            <Link href="/settings" className="sidebar-action-btn" onClick={closeSidebar}>
              <i className="ph-light ph-gear"></i>
              {t('nav.settings', '系统设置')}
            </Link>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', margin: '4px 0' }}>
              <button 
                type="button" 
                className="sidebar-action-btn" 
                onClick={toggleLang}
                style={{ justifyContent: 'center', background: 'rgba(255, 255, 255, 0.03)', borderRadius: 'var(--radius-sm)' }}
                title={lang === 'zh' ? 'Switch to English' : '切换为中文'}
              >
                <i className="ph-light ph-translate"></i>
                <span>{lang === 'zh' ? 'EN / 英文' : '中 / 中文'}</span>
              </button>

              <button 
                type="button" 
                className="sidebar-action-btn" 
                onClick={toggleTheme}
                style={{ justifyContent: 'center', background: 'rgba(255, 255, 255, 0.03)', borderRadius: 'var(--radius-sm)' }}
                title={t('extraUi.switchTheme', '切换主题')}
              >
                {theme === 'dark' && <><i className="ph-light ph-moon"></i><span>{t('extraUi.themeDark', '深色')}</span></>}
                {theme === 'gemini' && <><i className="ph-fill ph-sparkle" style={{ color: '#c084fc' }}></i><span>{t('extraUi.themeGemini', '宇宙')}</span></>}
                {theme === 'light' && <><i className="ph-light ph-sun" style={{ color: '#d97706' }}></i><span>{t('extraUi.themeLight', '浅色')}</span></>}
              </button>
            </div>

            <button className="sidebar-action-btn" onClick={() => signOut()}>
              <i className="ph-light ph-sign-out"></i>
              {t('nav.signOut', '退出账号')}
            </button>

            {userProfile && (
              <div style={{ padding: 'var(--space-3)', marginTop: 'var(--space-2)', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <img src={userProfile.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=fallback'} alt="Avatar" style={{ width: '28px', height: '28px', borderRadius: '50%' }} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: '600', color: 'var(--text-primary)' }}>{userProfile.displayName || 'User'}</span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Role: {userProfile.role || 'pending'}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
