'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '../lib/i18n-context';

export default function MobileTabBar({ onOpenMenu }) {
  const pathname = usePathname();
  const { lang, t } = useI18n();
  const isEn = lang === 'en';

  const tabs = [
    { path: '/overview', label: isEn ? 'Home' : '概览', icon: 'ph-squares-four' },
    { path: '/orders', label: isEn ? 'Jobs' : '订单', icon: 'ph-briefcase' },
    { path: '/candidates', label: isEn ? 'Talent' : '人才', icon: 'ph-users' },
    { path: '/pipeline', label: isEn ? 'Kanban' : '看板', icon: 'ph-kanban' },
  ];

  return (
    <nav className="mobile-bottom-tabbar" aria-label="Mobile Navigation">
      <div className="mobile-tabbar-inner">
        {tabs.map((tab) => {
          const isActive = pathname === tab.path;
          return (
            <Link
              key={tab.path}
              href={tab.path}
              className={`mobile-tab-item ${isActive ? 'active' : ''}`}
            >
              <i className={`ph-bold ${tab.icon} mobile-tab-icon`}></i>
              <span className="mobile-tab-label">{tab.label}</span>
              {isActive && <span className="mobile-tab-indicator" />}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onOpenMenu}
          className="mobile-tab-item mobile-tab-menu-btn"
          aria-label={isEn ? 'More' : '更多菜单'}
        >
          <i className="ph-bold ph-list mobile-tab-icon"></i>
          <span className="mobile-tab-label">{isEn ? 'More' : '更多'}</span>
        </button>
      </div>
    </nav>
  );
}
