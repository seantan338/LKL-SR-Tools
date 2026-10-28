'use client';

import { useEffect, useRef } from 'react';
import { useI18n } from '../../lib/i18n-context';
import OrderDetailContent from './OrderDetailContent';
import OrderStatusSelect, { OrderStatusBadge } from './OrderStatusSelect';

// Matches the breakpoint in pages.css that hides the preview pane
const NARROW_SCREEN_QUERY = '(max-width: 900px)';

export default function OrdersSplitView({ orders, selectedOrder, onSelect, onOpenDrawer, onEdit, onQuickStatusChange, canEdit, keyboardEnabled }) {
  const { t } = useI18n();
  const itemRefs = useRef({});

  const handleSelect = (order) => {
    if (window.matchMedia(NARROW_SCREEN_QUERY).matches) {
      onOpenDrawer(order);
      return;
    }
    onSelect(order.id);
  };

  // ↑ / ↓ moves through the list unless the user is typing somewhere
  useEffect(() => {
    if (!keyboardEnabled) return;
    const handleKeyDown = (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const index = orders.findIndex(o => o.id === selectedOrder?.id);
      const next = orders[e.key === 'ArrowDown' ? index + 1 : index - 1];
      if (!next) return;
      e.preventDefault();
      onSelect(next.id);
      itemRefs.current[next.id]?.scrollIntoView({ block: 'nearest' });
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keyboardEnabled, orders, selectedOrder, onSelect]);

  return (
    <div className="orders-split">
      <div className="orders-split-list">
        <div className="orders-row-meta" style={{ padding: '0 var(--space-1) var(--space-1)' }}>
          <i className="ph-light ph-keyboard"></i> {t('ordersView.keyboardHint')}
        </div>
        {orders.map(order => (
          <button
            key={order.id}
            ref={(el) => { itemRefs.current[order.id] = el; }}
            type="button"
            className={`orders-split-item ${order.id === selectedOrder?.id ? 'active' : ''}`}
            onClick={() => handleSelect(order)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
              <span className="orders-row-title">{order.position || t('orders.unnamedPosition')}</span>
              <OrderStatusBadge status={order.status} />
            </div>
            <div className="orders-row-meta">{order.company || t('components.orderDrawer.unnamedCompany')}</div>
            <div className="orders-row-meta">{[order.location, order.salary].filter(Boolean).join(' · ') || '-'}</div>
          </button>
        ))}
      </div>

      <div className="orders-split-detail bezel-shell">
        <div className="bezel-core" style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {selectedOrder ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-2)' }}>
                    <h2 style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)', margin: 0 }}>
                      {selectedOrder.position || t('orders.unnamedPosition')}
                    </h2>
                    {canEdit
                      ? <OrderStatusSelect order={selectedOrder} onChange={onQuickStatusChange} />
                      : <OrderStatusBadge status={selectedOrder.status} />}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="ph-light ph-buildings"></i> {selectedOrder.company || t('components.orderDrawer.unnamedCompany')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <button className="btn btn-sm btn-primary" onClick={() => onOpenDrawer(selectedOrder)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="ph-fill ph-magic-wand"></i> {t('orders.aiRecommend', 'AI 智能推荐')}
                  </button>
                  <button className="btn btn-sm" onClick={() => onEdit(selectedOrder)} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
                    <i className="ph-light ph-pencil-simple"></i> {t('components.orderDrawer.edit')}
                  </button>
                </div>
              </div>
              <OrderDetailContent order={selectedOrder} />
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
              {t('ordersView.selectHint')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
