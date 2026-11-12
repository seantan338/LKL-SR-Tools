'use client';

import { useI18n } from '../lib/i18n-context';

export function Skeleton({ rows = 4, label }) {
  const { t } = useI18n();
  const caption = label || t('common.loading', '加载中...');
  return (
    <div className="skeleton" role="status" aria-live="polite" aria-label={caption}>
      {Array.from({ length: rows }).map((_, i) => (
        <span key={i} className="skeleton-bar" style={{ width: i === rows - 1 ? '62%' : '100%' }} />
      ))}
    </div>
  );
}

export function EmptyState({
  icon = 'ph-tray',
  title,
  description,
  action,
  compact = false,
}) {
  return (
    <div className={`empty-state ${compact ? 'empty-state-compact' : ''}`}>
      <div className="empty-state-icon" aria-hidden="true">
        <i className={`ph-light ${icon}`}></i>
      </div>
      {title ? <div className="empty-state-title">{title}</div> : null}
      {description ? <div className="empty-state-desc">{description}</div> : null}
      {action || null}
    </div>
  );
}

export function ErrorState({
  title,
  description,
  onRetry,
}) {
  const { t } = useI18n();
  return (
    <div className="empty-state empty-state-error" role="alert">
      <div className="empty-state-icon" aria-hidden="true">
        <i className="ph-light ph-warning-circle"></i>
      </div>
      <div className="empty-state-title">{title || t('common.errorTitle', '页面出现问题')}</div>
      <div className="empty-state-desc">{description || t('common.errorDesc', '请重试。如果问题持续，请联系管理员。')}</div>
      {onRetry ? (
        <button type="button" className="btn btn-primary" onClick={onRetry}>
          {t('common.retry', '重试')}
        </button>
      ) : null}
    </div>
  );
}
