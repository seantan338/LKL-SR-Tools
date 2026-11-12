'use client';

import Link from 'next/link';
import { useI18n } from '../lib/i18n-context';

export default function NotFound() {
  const { t } = useI18n();
  return (
    <div className="state-screen">
      <div className="empty-state">
        <div className="empty-state-icon" aria-hidden="true">
          <i className="ph-light ph-compass"></i>
        </div>
        <div className="empty-state-title">{t('common.notFoundTitle', '找不到此页面')}</div>
        <div className="empty-state-desc">{t('common.notFoundDesc', '该地址不存在，或已被移动。')}</div>
        <Link href="/overview" className="btn btn-primary">
          {t('common.notFoundHome', '返回工作台')}
        </Link>
      </div>
    </div>
  );
}
