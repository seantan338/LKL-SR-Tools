'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '../lib/i18n-context';

export default function MobileTabBar({ onOpenMenu }) {
  const pathname = usePathname();
  const { t } = useI18n();

  const tabs = [
    { path: '/overview', label: t('nav.mobileHome', '概览'), icon: 'ph-squares-four' },
    { path: '/orders', label: t('nav.mobileJobs', '订单'), icon: 'ph-briefcase' },
    { path: '/candidates', label: t('nav.mobileTalent', '人才'), icon: 'ph-users' },
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
          aria-label={t('nav.mobileMore', '更多')}
        >
          <i className="ph-bold ph-list mobile-tab-icon"></i>
          <span className="mobile-tab-label">{t('nav.mobileMore', '更多')}</span>
        </button>
      </div>
    </nav>
  );
}
