'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { DragDropContext, Draggable } from '@hello-pangea/dnd';
import { StrictModeDroppable } from '../StrictModeDroppable';
import { Utils } from '../../lib/utils';
import { useI18n } from '../../lib/i18n-context';
import { KANBAN_STATUSES, bucketByStatus } from '../../lib/order-view.mjs';

// Cards rendered per column before "show more", so a column of 300 closed jobs stays light
const COLUMN_PAGE = 30;

export default function OrdersKanbanView({ orders, onOpen, onQuickStatusChange, canEdit }) {
  const { t } = useI18n();
  const [columnLimits, setColumnLimits] = useState({});
  const buckets = bucketByStatus(orders);

  // Order inside a column follows the toolbar sort, so only a move to another column is saved
  const onDragEnd = ({ source, destination, draggableId }) => {
    if (!destination || destination.droppableId === source.droppableId) return;
    const order = orders.find(o => o.id === draggableId);
    if (order) onQuickStatusChange(order.id, destination.droppableId, order.position);
  };

  return (
    <>
      <div className="orders-row-meta" style={{ marginBottom: 'var(--space-2)' }}>
        <i className={`ph-light ${canEdit ? 'ph-hand-grabbing' : 'ph-lock-key'}`}></i> {t(canEdit ? 'ordersView.kanbanDragHint' : 'ordersView.kanbanReadOnly')}
      </div>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="orders-kanban">
          {KANBAN_STATUSES.map(status => {
            const statusMeta = Utils.getJobOrderStatusMeta(status, t);
            const columnOrders = buckets[status];
            const limit = columnLimits[status] || COLUMN_PAGE;
            const hiddenCount = columnOrders.length - limit;

            return (
              <div key={status} className="orders-kanban-column">
                <div className="orders-kanban-header">
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: statusMeta.color, flexShrink: 0 }}></span>
                  <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{statusMeta.label}</span>
                  <span className="badge" style={{ marginLeft: 'auto', color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' }}>{columnOrders.length}</span>
                </div>

                <StrictModeDroppable droppableId={status}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`orders-kanban-list ${snapshot.isDraggingOver ? 'drag-over' : ''}`}
                    >
                      {columnOrders.slice(0, limit).map((order, index) => (
                        <Draggable key={order.id} draggableId={order.id} index={index} isDragDisabled={!canEdit}>
                          {(provided, snapshot) => {
                            const card = (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`orders-kanban-card ${snapshot.isDragging ? 'dragging' : ''}`}
                                onClick={() => onOpen(order)}
                                style={{ ...provided.draggableProps.style, cursor: canEdit ? (snapshot.isDragging ? 'grabbing' : 'grab') : 'pointer' }}
                              >
                                <div className="orders-row-title" style={{ whiteSpace: 'normal' }}>{order.position || t('orders.unnamedPosition')}</div>
                                <div className="orders-row-meta" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <i className="ph-light ph-buildings"></i> {order.company || t('components.orderDrawer.unnamedCompany')}
                                </div>
                                <div className="orders-row-meta">{[order.location, order.salary].filter(Boolean).join(' · ') || '-'}</div>
                                {order.picName && (
                                  <div className="orders-row-meta" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <i className="ph-light ph-user"></i> {order.picName}
                                  </div>
                                )}
                              </div>
                            );
                            // Render the dragged card on <body> so transformed ancestors don't offset it
                            return snapshot.isDragging ? createPortal(card, document.body) : card;
                          }}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                      {columnOrders.length === 0 && !snapshot.isDraggingOver && (
                        <div className="orders-kanban-empty">{t('ordersView.kanbanEmpty')}</div>
                      )}
                    </div>
                  )}
                </StrictModeDroppable>

                {hiddenCount > 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ margin: '0 var(--space-3) var(--space-3)' }}
                    onClick={() => setColumnLimits(prev => ({ ...prev, [status]: limit + COLUMN_PAGE }))}
                  >
                    {t('ordersView.showMore', { total: hiddenCount })}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </DragDropContext>
    </>
  );
}
