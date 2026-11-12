'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../lib/auth-context';
import { useI18n } from '../lib/i18n-context';
import { APP_VERSION } from '../lib/version';
import { FirestoreStore } from '../lib/firestore-store';
import { LanguageToggle, ThemeToggle } from './ChromeToggles';

export default function Sidebar({ isOpen, closeSidebar }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, userProfile, teamId: authTeamId, signOut, isOwner, isManager, isHqTeam } = useAuth();
  const { t } = useI18n();
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
    { path: '/calendar', labelKey: 'nav.calendar', fallback: '面试日程', icon: 'ph-calendar-blank' },
    { path: '/analytics', labelKey: 'nav.analytics', fallback: '数据洞察', icon: 'ph-chart-pie-slice', supervisorOnly: true },
    { path: '/leaderboard', labelKey: 'nav.leaderboard', fallback: 'Leaderboard', icon: 'ph-trophy', hqOnly: true },
    { path: '/claims', labelKey: 'nav.claims', fallback: '费用与报销', icon: 'ph-receipt', hqOnly: true, supervisorOnly: true },
    // { path: '/whatsapp', labelKey: 'nav.whatsapp', fallback: 'WhatsApp 触达', icon: 'ph-whatsapp-logo' },
    { path: '/team', labelKey: 'nav.team', fallback: '团队与权限', icon: 'ph-users-three' },
    { path: '/feedback', labelKey: 'nav.feedback', fallback: '意见反馈', icon: 'ph-chat-circle-dots' },
  ];

  const visibleNavItems = navItems.filter((item) => {
    if (item.ownerOnly && !isOwner) return false;
    if (item.supervisorOnly && !isOwner && !isManager) return false;
    if (item.hqOnly && !isHqTeam) return false;
    return true;
  });

  return (
    <aside className={`app-sidebar ${isOpen ? 'open' : ''}`} id="appSidebar">
      <div className="sidebar-bezel-outer">
        <div className="sidebar-bezel-inner">
          <div>
            <button
              type="button"
              className="sidebar-brand"
              onClick={handleLogoClick}
              title={t('brand.product', 'TALENT FLOW · Sunrise Recruit')}
              aria-label={t('brand.product', 'TALENT FLOW · Sunrise Recruit')}
            >
              <div className="brand-symbol" aria-hidden="true">TF</div>
              <div className="brand-text">
                <span className="brand-title">{t('brand.name', 'TALENT FLOW')}</span>
                <span className="brand-subtitle">{t('brand.subtitle', 'Sunrise Recruit')}</span>
              </div>
            </button>

            <nav className="sidebar-nav" aria-label={t('nav.sectionManagement', '管理视图')}>
              <span className="nav-section-label">{t('nav.sectionManagement', '管理视图')}</span>

              {visibleNavItems.filter((item) => item.path !== '/team' && item.path !== '/feedback').map((item) => {
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
                          fontSize: 'var(--text-xs)',
                          background: 'var(--color-danger)',
                          color: 'var(--accent-on)',
                          padding: '1px 6px',
                          borderRadius: '10px',
                          marginLeft: 'auto',
                          fontWeight: '700'
                        }}>
                          {unreadAnnouncementsCount > 99 ? '99+' : unreadAnnouncementsCount}
                        </span>
                      )}
                      {item.ownerOnly && (
                        <span style={{ fontSize: 'var(--text-xs)', background: 'rgba(234, 179, 8, 0.15)', color: 'var(--accent-amber)', padding: '1px 5px', borderRadius: '4px', marginLeft: 'auto', fontWeight: '600' }}>
                          Owner
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}

              <span className="nav-section-label">{t('nav.sectionTeam', '团队')}</span>
              {visibleNavItems.filter((item) => item.path === '/team' || item.path === '/feedback').map((item) => {
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
                fontSize: 'var(--text-xs)',
                fontWeight: '700',
                color: 'var(--accent)',
                background: 'var(--fill-selected)',
                border: '1px solid transparent',
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
              <LanguageToggle
                variant="labeled"
                className="sidebar-action-btn"
                style={{ justifyContent: 'center', background: 'var(--fill)', borderRadius: 'var(--radius-md)' }}
              />
              <ThemeToggle
                variant="labeled"
                className="sidebar-action-btn"
                style={{ justifyContent: 'center', background: 'var(--fill)', borderRadius: 'var(--radius-md)' }}
              />
            </div>

            <button type="button" className="sidebar-action-btn" onClick={() => signOut()}>
              <i className="ph-light ph-sign-out"></i>
              {t('nav.signOut', '退出账号')}
            </button>

            {userProfile && (
              <div style={{ padding: 'var(--space-3)', marginTop: 'var(--space-2)', background: 'var(--fill)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <img src={userProfile.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=fallback'} alt="Avatar" style={{ width: '28px', height: '28px', borderRadius: '50%' }} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: '600', color: 'var(--text-primary)' }}>{userProfile.displayName || 'User'}</span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Role: {userProfile.role || 'pending'}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
