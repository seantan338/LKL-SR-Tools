'use client';

import { useState } from 'react';
import { Utils } from '../../lib/utils';
import { useI18n } from '../../lib/i18n-context';
import { orderActivityTime } from '../../lib/order-view.mjs';
import OrderStatusSelect, { OrderStatusBadge } from './OrderStatusSelect';

// Column keys double as sort keys (lib/order-view.mjs)
export const ORDER_TABLE_COLUMNS = [
  { key: 'company', labelKey: 'ordersView.colCompany' },
  { key: 'position', labelKey: 'ordersView.colPosition', required: true },
  { key: 'status', labelKey: 'ordersView.colStatus' },
  { key: 'location', labelKey: 'ordersView.colLocation' },
  { key: 'salary', labelKey: 'ordersView.colSalary' },
  { key: 'pic', labelKey: 'ordersView.colPic' },
  { key: 'commission', labelKey: 'ordersView.colCommission' },
  { key: 'updated', labelKey: 'ordersView.colUpdated' }
];

function Truncated({ text, style }) {
  return <span className="orders-table-truncate" style={style} title={text || ''}>{text || '-'}</span>;
}

export default function OrdersTableView({ orders, sortKey, sortDir, onSort, hiddenColumns, onOpen, onQuickStatusChange, canEdit }) {
  const { t } = useI18n();
  const columns = ORDER_TABLE_COLUMNS.filter(col => col.required || !hiddenColumns.includes(col.key));

  const renderCell = (key, order) => {
    switch (key) {
      case 'company': return <Truncated text={order.company} />;
      case 'position': return <Truncated text={order.position || t('orders.unnamedPosition')} style={{ color: 'var(--text-primary)', fontWeight: 600 }} />;
      case 'status': return canEdit
        ? <OrderStatusSelect order={order} onChange={onQuickStatusChange} />
        : <OrderStatusBadge status={order.status} />;
      case 'location': return <Truncated text={order.location} />;
      case 'salary': return <Truncated text={order.salary} style={{ color: 'var(--accent-emerald)' }} />;
      case 'pic': return <Truncated text={order.picName} />;
      case 'commission': return <Truncated text={order.commission} />;
      case 'updated': {
        const ms = orderActivityTime(order);
        return <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{ms ? Utils.formatDate(new Date(ms)) : '-'}</span>;
      }
      default: return null;
    }
  };

  return (
    <div className="table-wrapper orders-table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map(col => {
              const active = sortKey === col.key;
              const icon = active ? (sortDir === 'asc' ? 'ph-caret-up' : 'ph-caret-down') : 'ph-caret-up-down';
              return (
                <th
                  key={col.key}
                  onClick={() => onSort(col.key)}
                  aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  title={t('ordersView.sortByColumn')}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    {t(col.labelKey)}
                    <i className={`ph-bold ${icon}`} style={{ opacity: active ? 1 : 0.35 }}></i>
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {orders.map(order => (
            <tr
              key={order.id}
              tabIndex={0}
              onClick={() => onOpen(order)}
              onKeyDown={(e) => { if (e.key === 'Enter') onOpen(order); }}
            >
              {columns.map(col => <td key={col.key}>{renderCell(col.key, order)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OrdersColumnChooser({ hiddenColumns, onChange }) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);

  const toggleColumn = (key) => {
    onChange(hiddenColumns.includes(key) ? hiddenColumns.filter(k => k !== key) : [...hiddenColumns, key]);
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => setIsOpen(open => !open)}
        aria-expanded={isOpen}
        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
      >
        <i className="ph-light ph-sliders-horizontal"></i> {t('ordersView.columns')}
      </button>
      {isOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 20 }} onClick={() => setIsOpen(false)}></div>
          <div className="orders-popover">
            {ORDER_TABLE_COLUMNS.map(col => (
              <label key={col.key} className="orders-popover-item">
                <input
                  type="checkbox"
                  checked={col.required || !hiddenColumns.includes(col.key)}
                  disabled={col.required}
                  onChange={() => toggleColumn(col.key)}
                />
                {t(col.labelKey)}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
