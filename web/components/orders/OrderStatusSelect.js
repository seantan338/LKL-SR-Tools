'use client';

import { Utils } from '../../lib/utils';
import { useI18n } from '../../lib/i18n-context';

export function OrderStatusBadge({ status }) {
  const { t } = useI18n();
  const statusMeta = Utils.getJobOrderStatusMeta(status, t);
  return (
    <span className="badge" style={{ color: statusMeta.color, background: statusMeta.bg, borderColor: statusMeta.border, whiteSpace: 'nowrap' }}>
      {statusMeta.label}
    </span>
  );
}

/** Compact status picker used on cards, table rows and the preview pane. Clicks don't bubble to the row. */
export default function OrderStatusSelect({ order, onChange, style }) {
  const { t } = useI18n();
  return (
    <select
      className="form-select btn-sm"
      style={{ width: 'auto', fontSize: '11px', padding: '2px 8px', height: '28px', background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', cursor: 'pointer', ...style }}
      value={order.status || 'open'}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onChange={(e) => onChange(order.id, e.target.value, order.position)}
      title={t('orders.quickChangeStatusTitle')}
    >
      <option value="open">{t('orders.statusOpen')}</option>
      <option value="urgent">{t('orders.statusUrgent')}</option>
      <option value="paused">{t('orders.statusPaused')}</option>
      <option value="filled">{t('orders.statusFilled')}</option>
      <option value="closed">{t('orders.statusClosed')}</option>
    </select>
  );
}
