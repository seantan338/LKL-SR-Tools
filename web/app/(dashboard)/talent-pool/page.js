'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '../../../lib/i18n-context';

export default function TalentPoolRedirect() {
  const router = useRouter();
  const { t } = useI18n();

  useEffect(() => {
    router.replace('/candidates?pool=reserved');
  }, [router]);

  return (
    <div className="page-view active" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
        <i className="ph-light ph-archive-tray" style={{ fontSize: '2.5rem', marginBottom: '12px', display: 'block', color: 'var(--accent-amber)' }}></i>
        <p style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
          {t('talentPool.redirectNotice', '储备人才库已整合至「候选人管理」专属选项')}
        </p>
        <p style={{ fontSize: '0.85rem' }}>{t('common.redirecting', '正在为您平滑跳转...')}</p>
      </div>
    </div>
  );
}
