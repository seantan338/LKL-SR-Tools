'use client';

import { Utils } from '../../lib/utils';
import { useI18n } from '../../lib/i18n-context';
import OrderStatusSelect from './OrderStatusSelect';

export default function OrdersCardsView({ orders, onOpen, onQuickStatusChange }) {
  const { t } = useI18n();

  return (
    <div className="orders-cards-grid">
      {orders.map(order => {
        const statusMeta = Utils.getJobOrderStatusMeta(order.status, t);
        return (
          <div key={order.id} className="bezel-shell">
            <div className="bezel-core" style={{ padding: 'var(--space-5)', height: '100%', display: 'flex', flexDirection: 'column' }}>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-3)' }}>
                <h3 style={{ fontSize: 'var(--text-md)', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  {order.position || t('orders.unnamedPosition')}
                </h3>
                <span className="badge" style={{
                  color: statusMeta.color,
                  background: statusMeta.bg,
                  borderColor: statusMeta.border
                }}>
                  {statusMeta.label}
                </span>
              </div>

              <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="ph-light ph-buildings"></i> {order.company || t('components.orderDrawer.unnamedCompany')}
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }} title={order.createdAt ? Utils.formatDate(order.createdAt) : ''}>
                  <i className="ph-light ph-clock"></i>
                  {Utils.formatRelativeTime(order.createdAt, t, order)}
                </span>
              </div>

              {/* Key Metrics Only */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: 'var(--space-5)' }}>
                <span className="badge" style={{ color: 'var(--accent-emerald)', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
                  <i className="ph-light ph-currency-circle-dollar" style={{ marginRight: '4px' }}></i>
                  {order.salary || t('orders.salaryNegotiable')}
                </span>
                <span className="badge" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' }}>
                  <i className="ph-light ph-map-pin" style={{ marginRight: '4px' }}></i>
                  {order.location || t('orders.locationAny')}
                </span>
                <span className="badge" style={{ color: 'var(--accent-blue)', borderColor: 'rgba(59, 130, 246, 0.3)' }}>
                  <i className="ph-light ph-users" style={{ marginRight: '4px' }}></i>
                  {t('orders.headcountReq')} {order.headcount || 1} {t('orders.pax')}
                </span>
              </div>

              {/* Footer Action */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--border-subtle)', gap: 'var(--space-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <OrderStatusSelect order={order} onChange={onQuickStatusChange} />
                </div>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => onOpen(order)}
                >
                  {t('orders.viewDetails')} <i className="ph-bold ph-arrow-right"></i>
                </button>
              </div>

            </div>
          </div>
        );
      })}
    </div>
  );
}
