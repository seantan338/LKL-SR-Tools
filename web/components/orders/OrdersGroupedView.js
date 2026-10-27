'use client';

import { useState } from 'react';
import { Utils } from '../../lib/utils';
import { useI18n } from '../../lib/i18n-context';
import { NONE } from '../../lib/order-view.mjs';
import { OrderStatusBadge } from './OrderStatusSelect';

const GROUP_ICONS = { company: 'ph-buildings', pic: 'ph-user', status: 'ph-flag', location: 'ph-map-pin' };
const NONE_LABEL_KEYS = { company: 'ordersView.noCompany', pic: 'ordersView.noPic', location: 'ordersView.noLocation' };
const STATUS_ORDER = ['urgent', 'open', 'paused', 'filled', 'closed'];

export default function OrdersGroupedView({ groups, groupBy, onOpen }) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState({});

  const groupLabel = (group) => {
    if (groupBy === 'status') return Utils.getJobOrderStatusMeta(group.key, t).label;
    return group.key === NONE ? t(NONE_LABEL_KEYS[groupBy]) : group.label;
  };

  // The grouped field is already in the header, so leave it out of each row
  const rowMeta = (order) => [
    groupBy !== 'company' && order.company,
    groupBy !== 'location' && order.location,
    order.salary,
    groupBy !== 'pic' && order.picName && `PIC: ${order.picName}`
  ].filter(Boolean).join(' · ');

  const setAllCollapsed = (value) => setCollapsed(Object.fromEntries(groups.map(group => [group.key, value])));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAllCollapsed(false)}>
          <i className="ph-light ph-caret-double-down"></i> {t('ordersView.expandAll')}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAllCollapsed(true)}>
          <i className="ph-light ph-caret-double-up"></i> {t('ordersView.collapseAll')}
        </button>
      </div>

      {groups.map(group => {
        const isCollapsed = !!collapsed[group.key];
        return (
          <div key={group.key} className="orders-group">
            <button
              type="button"
              className="orders-group-header"
              onClick={() => setCollapsed(prev => ({ ...prev, [group.key]: !isCollapsed }))}
              aria-expanded={!isCollapsed}
            >
              <i className={`ph-bold ${isCollapsed ? 'ph-caret-right' : 'ph-caret-down'}`} style={{ color: 'var(--text-muted)' }}></i>
              <i className={`ph-light ${GROUP_ICONS[groupBy]}`} style={{ color: 'var(--text-muted)' }}></i>
              <span style={{ fontWeight: 600 }}>{groupLabel(group)}</span>
              <span className="badge" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' }}>{group.orders.length}</span>
              {groupBy !== 'status' && (
                <span className="orders-group-counts">
                  {STATUS_ORDER.filter(status => group.statusCounts[status]).map(status => {
                    const statusMeta = Utils.getJobOrderStatusMeta(status, t);
                    return <span key={status} style={{ color: statusMeta.color }}>{group.statusCounts[status]} {statusMeta.label}</span>;
                  })}
                </span>
              )}
            </button>

            {!isCollapsed && group.orders.map(order => (
              <div
                key={order.id}
                className="orders-group-row"
                role="button"
                tabIndex={0}
                onClick={() => onOpen(order)}
                onKeyDown={(e) => { if (e.key === 'Enter') onOpen(order); }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="orders-row-title">{order.position || t('orders.unnamedPosition')}</div>
                  <div className="orders-row-meta">{rowMeta(order) || '-'}</div>
                </div>
                {groupBy !== 'status' && <OrderStatusBadge status={order.status} />}
                <i className="ph-light ph-caret-right" style={{ color: 'var(--text-muted)' }}></i>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
