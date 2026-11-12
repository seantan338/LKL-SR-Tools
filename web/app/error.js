'use client';

import { useI18n } from '../lib/i18n-context';

export default function AppError({ reset }) {
  const { t } = useI18n();
  return (
    <div className="state-screen">
      <div className="empty-state empty-state-error" role="alert">
        <div className="empty-state-icon" aria-hidden="true">
          <i className="ph-light ph-warning-circle"></i>
        </div>
        <div className="empty-state-title">{t('common.errorTitle', '页面出现问题')}</div>
        <div className="empty-state-desc">{t('common.errorDesc', '请重试。如果问题持续，请联系管理员。')}</div>
        <button type="button" className="btn btn-primary" onClick={() => reset()}>
          {t('common.retry', '重试')}
        </button>
      </div>
    </div>
  );
}
