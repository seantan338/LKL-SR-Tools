'use client';

import { Utils } from '../../lib/utils';
import { useI18n } from '../../lib/i18n-context';

/** One dense line per job: company – position · location, status at the end. */
export default function OrdersCompactView({ orders, onOpen }) {
  const { t } = useI18n();

  return (
    <div className="orders-compact">
      {orders.map(order => {
        const statusMeta = Utils.getJobOrderStatusMeta(order.status, t);
        return (
          <div
            key={order.id}
            className="orders-compact-row"
            role="button"
            tabIndex={0}
            onClick={() => onOpen(order)}
            onKeyDown={(e) => { if (e.key === 'Enter') onOpen(order); }}
          >
            <span className="orders-compact-dot" style={{ background: statusMeta.color }}></span>
            <span className="orders-compact-text">
              <span style={{ color: 'var(--text-secondary)' }}>{order.company || t('components.orderDrawer.unnamedCompany')}</span>
              {' – '}
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{order.position || t('orders.unnamedPosition')}</span>
              {order.location && <span style={{ color: 'var(--text-muted)' }}>{' · '}{order.location}</span>}
            </span>
            {order.salary && <span className="orders-compact-salary">{order.salary}</span>}
            <span className="orders-compact-status" style={{ color: statusMeta.color }}>{statusMeta.label}</span>
          </div>
        );
      })}
    </div>
  );
}
