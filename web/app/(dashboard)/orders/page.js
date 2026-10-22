'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../../lib/auth-context';
import { useFeedback } from '../../../lib/feedback-context';
import { FirestoreStore } from '../../../lib/firestore-store';
import { Utils } from '../../../lib/utils';
import { SystemLogger } from '../../../lib/logger';
import { MatchService } from '../../../lib/match-service';
import { authFetch } from '../../../lib/api-client';
import OrderDrawer from '../../../components/OrderDrawer';
import { useI18n } from '../../../lib/i18n-context';

export default function OrdersPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { teamId, role, user, isRecruiter, isReadOnlyView } = useAuth();
  const { showToast, confirm } = useFeedback();
  const { t, lang } = useI18n();
  const [orders, setOrders] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isSyncing, setIsSyncing] = useState(false);

  // Modal State for Creation/Editing
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [formData, setFormData] = useState({});
  const [formErrors, setFormErrors] = useState({});

  // Duplicate Resolution State
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [duplicateMatch, setDuplicateMatch] = useState(null);
  const [pendingSaveData, setPendingSaveData] = useState(null);
  const [isResolvingDuplicate, setIsResolvingDuplicate] = useState(false);

  // AI Import State
  const [showAiImport, setShowAiImport] = useState(false);
  const [aiImportText, setAiImportText] = useState('');
  const [isAiImporting, setIsAiImporting] = useState(false);

  // Drawer State for Viewing
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const openDrawer = (order) => {
    setSelectedOrder(order);
    setIsDrawerOpen(true);
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedOrder(null);
  };

  const openModal = (order = null) => {
    if (order) {
      setEditingOrder(order);
      const { id, createdAt, updatedAt, decryptedPrivateNotes, privateNotesError, privateNotes, ...rest } = order;
      setFormData({
        ...rest
      });
    } else {
      setEditingOrder(null);
      setFormData({
        company: '', position: '', salary: '', location: '', workHours: '',
        requirements: '', benefits: '', notes: '', status: 'open',
        headcount: 1
      });
    }
    setFormErrors({});
    setIsModalOpen(true);
  };

  const openEditFromDrawer = (order) => {
    closeDrawer();
    openModal(order);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingOrder(null);
    setFormErrors({});
    setShowAiImport(false);
    setAiImportText('');
    setIsDuplicateModalOpen(false);
    setDuplicateMatch(null);
    setPendingSaveData(null);
    setIsResolvingDuplicate(false);
  };

  const handleCloseDuplicateModal = () => {
    setIsDuplicateModalOpen(false);
    setDuplicateMatch(null);
    setPendingSaveData(null);
    setIsResolvingDuplicate(false);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const REQUIRED_FIELDS = [
    { key: 'company', label: t('orders.company') },
    { key: 'position', label: t('orders.position') },
    { key: 'salary', label: t('orders.salary') },
    { key: 'location', label: t('orders.location') },
    { key: 'workHours', label: t('orders.workHours') },
    { key: 'requirements', label: t('orders.requirements') },
  ];

  const handleAiImport = async () => {
    if (!aiImportText.trim()) return;
    setIsAiImporting(true);
    try {
      const response = await authFetch('/api/parse/sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: aiImportText, targetType: 'job_order' })
      });
      const resData = await response.json();
      
      if (resData.status === 'success' && resData.data && resData.data.length > 0) {
        const orderData = resData.data[0];
        setFormData(prev => ({
          ...prev,
          company: orderData.company || prev.company || '',
          position: orderData.position || prev.position || '',
          salary: orderData.salary || prev.salary || '',
          location: orderData.location || prev.location || '',
          workHours: orderData.workHours || prev.workHours || '',
          requirements: orderData.requirements || prev.requirements || '',
          benefits: orderData.benefits || prev.benefits || '',
          notes: orderData.notes || prev.notes || ''
        }));
        setShowAiImport(false);
        setAiImportText('');
        SystemLogger.audit(teamId, user, 'AI_PARSE', 'JOB_ORDER', orderData.position || t('orders.unnamedPosition'), {
          actionDetail: t('orders.importFromOrder'),
          company: orderData.company
        });
      } else {
        showToast(resData.message || t('orders.aiParseFailed'), 'error');
      }
    } catch (err) {
      showToast(t('orders.networkError') + err.message, 'error');
    } finally {
      setIsAiImporting(false);
    }
  };

  const handleSave = async () => {
    // Validate required fields
    const errors = {};
    REQUIRED_FIELDS.forEach(({ key, label }) => {
      if (!formData[key] || !formData[key].trim()) {
        errors[key] = `${label} ${t('orders.isRequired')}`;
      }
    });
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});

    try {
      let finalData = { ...formData };
      delete finalData.decryptedPrivateNotes;
      delete finalData.privateNotesError;
      delete finalData.privateNotes;
      delete finalData.id;
      delete finalData.createdAt;
      delete finalData.updatedAt;

      // Ensure headcount is a number
      finalData.headcount = parseInt(finalData.headcount) || 1;
      if (finalData.headcount < 1) finalData.headcount = 1;

      if (editingOrder) {
        await FirestoreStore.updateJobOrder(teamId, editingOrder.id, finalData);
        SystemLogger.audit(teamId, user, 'UPDATE', 'JOB_ORDER', finalData.position);
        showToast(t('orders.orderUpdated'), 'success');
      } else {
        // Check for duplicates in current orders (same company and same position)
        const normComp = (finalData.company || '').trim().toLowerCase();
        const normPos = (finalData.position || '').trim().toLowerCase();
        const duplicate = orders.find(o => 
          (o.company || '').trim().toLowerCase() === normComp &&
          (o.position || '').trim().toLowerCase() === normPos
        );

        if (duplicate) {
          setDuplicateMatch(duplicate);
          setPendingSaveData(finalData);
          setIsDuplicateModalOpen(true);
          return;
        }

        await FirestoreStore.addJobOrder(teamId, user.uid, finalData);
        SystemLogger.audit(teamId, user, 'CREATE', 'JOB_ORDER', finalData.position);
        showToast(t('orders.orderPublished'), 'success');
      }
      closeModal();
    } catch (error) {
      showToast(t('orders.saveFailed') + error.message, 'error');
    }
  };

  const handleResolveDuplicateUpdate = async () => {
    if (!duplicateMatch || !pendingSaveData) return;
    setIsResolvingDuplicate(true);
    try {
      let dataToUpdate = { ...pendingSaveData };
      await FirestoreStore.updateJobOrder(teamId, duplicateMatch.id, dataToUpdate);
      SystemLogger.audit(teamId, user, 'UPDATE', 'JOB_ORDER', dataToUpdate.position, {
        actionDetail: t('orders.duplicateUpdateAudit'),
        company: dataToUpdate.company
      });
      showToast(t('orders.orderCoverUpdated'), 'success');
      handleCloseDuplicateModal();
      closeModal();
    } catch (error) {
      showToast(t('orders.saveFailed') + error.message, 'error');
    } finally {
      setIsResolvingDuplicate(false);
    }
  };

  const handleResolveDuplicateCreateNew = async () => {
    if (!pendingSaveData) return;
    setIsResolvingDuplicate(true);
    try {
      await FirestoreStore.addJobOrder(teamId, user.uid, pendingSaveData);
      SystemLogger.audit(teamId, user, 'CREATE', 'JOB_ORDER', pendingSaveData.position, {
        actionDetail: t('orders.duplicateCreateNewAudit'),
        company: pendingSaveData.company
      });
      showToast(t('orders.orderPublished'), 'success');
      handleCloseDuplicateModal();
      closeModal();
    } catch (error) {
      showToast(t('orders.saveFailed') + error.message, 'error');
    } finally {
      setIsResolvingDuplicate(false);
    }
  };

  const handleDelete = async (orderId, positionName) => {
    const ok = await confirm(`${t('orders.confirmDeletePre')}${positionName}${t('orders.confirmDeletePost')}`, {
      title: t('orders.deleteConfirmTitle'),
      danger: true,
      confirmLabel: t('orders.confirmDeleteBtn')
    });
    if (!ok) return;
    try {
      await FirestoreStore.deleteJobOrder(teamId, orderId);
      SystemLogger.audit(teamId, user, 'DELETE', 'JOB_ORDER', positionName);
      showToast(t('orders.orderDeleted'), 'info');
      closeModal();
    } catch (error) {
      showToast(t('orders.deleteFailed') + error.message, 'error');
    }
  };

  const handleQuickStatusChange = async (orderId, newStatus, positionName) => {
    try {
      await FirestoreStore.updateJobOrder(teamId, orderId, { status: newStatus });
      setSelectedOrder(prev => (prev && prev.id === orderId) ? { ...prev, status: newStatus } : prev);
      SystemLogger.audit(teamId, user, 'UPDATE', 'JOB_ORDER', positionName || t('orders.orderTitleFallback'), {
        actionDetail: `${t('orders.quickChangeStatus')} ${Utils.getJobOrderStatusMeta(newStatus, t).label}`
      });
      showToast(`${t('orders.updatedTo')} ${Utils.getJobOrderStatusMeta(newStatus, t).label}`, 'success');
    } catch (err) {
      console.error('更新状态失败:', err);
      showToast(t('orders.updateStatusFailed') + ' ' + err.message, 'error');
    }
  };

  useEffect(() => {
    if (!teamId || !user?.uid) return;
    
    const unsubscribe = FirestoreStore.subscribeToJobOrders(teamId, role, user.uid, (data) => {
      // Sort immediately so orders array is consistently newest first
      const sortedData = [...data].sort((a, b) => Utils.getRecordTimestamp(b) - Utils.getRecordTimestamp(a));
      setOrders(sortedData);
      setSelectedOrder(prev => {
        if (!prev) return null;
        return sortedData.find(o => o.id === prev.id) || prev;
      });
      setIsSyncing(false);
    });
    
    return () => unsubscribe();
  }, [teamId, role, user]);

  // Listen for global quick action and query params to open new order modal
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkUrlAction = () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('action') === 'new') {
        openModal(null);
        const url = new URL(window.location.href);
        url.searchParams.delete('action');
        window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
      }
    };

    checkUrlAction();

    const handleGlobalNewOrder = () => openModal(null);
    window.addEventListener('open-new-order-modal', handleGlobalNewOrder);
    return () => {
      window.removeEventListener('open-new-order-modal', handleGlobalNewOrder);
    };
  }, []);

  const handleSync = async () => {
    try {
      setIsSyncing(true);
      const res = await MatchService.syncEmbeddings(teamId);
      showToast(res.message, 'success');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Derived state: Search, Filter & Guaranteed Descending Order by Latest Creation/Import Time
  const filteredOrders = orders
    .filter(order => {
      // 1. Status Filter
      if (statusFilter !== 'all' && order.status !== statusFilter) return false;
      
      // 2. Keyword Search
      const tokens = searchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);
      if (tokens.length === 0) return true;

      const compositeText = [
        order.company, order.position, order.salary, order.benefits,
        order.requirements, order.workHours, order.location, order.notes
      ].filter(Boolean).join(' ').toLowerCase();

      return tokens.every(token => compositeText.includes(token));
    })
    .sort((a, b) => Utils.getRecordTimestamp(b) - Utils.getRecordTimestamp(a));

  return (
    <div className="page-view active">
      
      {/* Utility Bar */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-5)', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flex: 1, minWidth: '260px', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0, flex: '1 1 180px' }}>
            <div className="combo-input-wrapper">
              <input 
                type="text" 
                className="form-input" 
                placeholder={t('orders.searchPlaceholder')} 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <i className="ph-light ph-magnifying-glass"></i>
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0, flex: '0 1 130px', minWidth: '110px' }}>
            <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">{t('orders.filterAll')}</option>
              <option value="open">{t('orders.statusOpen')}</option>
              <option value="urgent">{t('orders.statusUrgent')}</option>
              <option value="paused">{t('orders.statusPaused')}</option>
              <option value="filled">{t('orders.statusFilled')}</option>
              <option value="closed">{t('orders.statusClosed')}</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
          <button 
            className="btn btn-secondary" 
            onClick={handleSync}
            disabled={isSyncing}
            title={t('orders.syncTooltip')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <i className={isSyncing ? "ph-light ph-spinner ph-spin" : "ph-light ph-arrows-clockwise"}></i>
            {isSyncing ? t('orders.syncing') : t('orders.syncEmbeddings')}
          </button>

          {!isReadOnlyView ? (
            <button className="btn btn-primary" onClick={() => openModal(null)}>
              <span className="btn-icon-circle"><i className="ph-bold ph-plus"></i></span>
              {t('orders.createJob')}
            </button>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: 'var(--radius-full)',
              color: 'var(--accent-amber)',
              fontSize: 'var(--text-xs)',
              fontWeight: '600'
            }}>
              <i className="ph-bold ph-lock-key"></i>
              <span>{t('team.readOnlyBadge', '单向只读')} · 合作人数据</span>
            </div>
          )}
        </div>
      </div>

      {/* Grid or Empty State */}
      {filteredOrders.length === 0 ? (
        <div className="bezel-shell" style={{ borderStyle: 'dashed', background: 'var(--empty-icon-bg, rgba(255,255,255,0.01))', padding: 'var(--space-8)' }}>
          <div className="bezel-core" style={{ padding: 'var(--space-8)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 'var(--space-3)' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--empty-icon-bg, rgba(255,255,255,0.04))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', color: 'var(--text-muted)' }}>
              <i className="ph-light ph-briefcase"></i>
            </div>
            <div style={{ fontSize: 'var(--text-md)', fontWeight: '600', color: 'var(--text-primary)' }}>{t('orders.emptyTitle') || t('orders.emptyList')}</div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', maxWidth: '420px', margin: 0, lineHeight: 1.6 }}>
              {t('orders.emptyDesc')}
            </p>
            <button className="btn btn-primary btn-sm" style={{ marginTop: 'var(--space-2)' }} onClick={() => openModal(null)}>
              <i className="ph-bold ph-plus"></i> {t('orders.createNow')}
            </button>
          </div>
        </div>
      ) : (
        <div className="orders-cards-grid">
          {filteredOrders.map(order => {
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
                    <select 
                      className="form-select btn-sm" 
                      style={{ fontSize: '11px', padding: '2px 8px', height: '28px', background: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', cursor: 'pointer' }}
                      value={order.status || 'open'}
                      onChange={(e) => handleQuickStatusChange(order.id, e.target.value, order.position)}
                      title={t('orders.quickChangeStatusTitle')}
                    >
                      <option value="open">{t('orders.statusOpen')}</option>
                      <option value="urgent">{t('orders.statusUrgent')}</option>
                      <option value="paused">{t('orders.statusPaused')}</option>
                      <option value="filled">{t('orders.statusFilled')}</option>
                      <option value="closed">{t('orders.statusClosed')}</option>
                    </select>
                  </div>
                  <button 
                    className="btn btn-sm btn-primary" 
                    onClick={() => openDrawer(order)}
                  >
                    {t('orders.viewDetails')} <i className="ph-bold ph-arrow-right"></i>
                  </button>
                </div>

              </div>
            </div>
          );
        })}
        </div>
      )}

      {/* Add / Edit Modal - Teleported to document.body via Portal to prevent centering issues caused by parent CSS transforms */}
      {isModalOpen && mounted && createPortal(
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div className="bezel-shell modal-bezel" style={{ width: '600px', maxWidth: '95vw', animation: 'modalEnter 0.3s cubic-bezier(0.32, 0.72, 0, 1)' }}>
            <form className="bezel-core modal-core" onSubmit={(e) => e.preventDefault()} style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', maxHeight: '90vh', overflowY: 'auto' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: 'var(--text-lg)', margin: 0, color: 'var(--text-primary)' }}>
                  {editingOrder ? t('orders.editTitle') : t('orders.newTitle')}
                </h3>
                <button className="btn-icon" onClick={closeModal}><i className="ph-light ph-x"></i></button>
              </div>

              {!editingOrder && (
                <div style={{ marginBottom: 'var(--space-2)' }}>
                  {!showAiImport ? (
                    <button 
                      type="button" 
                      className="btn btn-secondary btn-sm" 
                      onClick={() => setShowAiImport(true)}
                      style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
                    >
                      <i className="ph-light ph-magic-wand" style={{ color: 'var(--accent-purple)' }}></i> {t('orders.smartImport')}
                    </button>
                  ) : (
                    <div style={{ padding: 'var(--space-4)', background: 'var(--empty-icon-bg, rgba(0,0,0,0.2))', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                      <textarea
                        className="form-input"
                        rows="4"
                        placeholder={t('orders.pasteJDPlaceholder')}
                        value={aiImportText}
                        onChange={(e) => setAiImportText(e.target.value)}
                        disabled={isAiImporting}
                        style={{ marginBottom: 'var(--space-3)' }}
                      ></textarea>
                      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                        <button 
                          type="button" 
                          className="btn btn-primary btn-sm" 
                          onClick={handleAiImport} 
                          disabled={isAiImporting || !aiImportText.trim()}
                          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
                        >
                          {isAiImporting ? (
                            <><i className="ph-light ph-spinner ph-spin"></i> {t('orders.parsing')}</>
                          ) : (
                            <><i className="ph-light ph-magic-wand"></i> {t('orders.startParse')}</>
                          )}
                        </button>
                        <button 
                          type="button" 
                          className="btn btn-secondary btn-sm" 
                          onClick={() => { setShowAiImport(false); setAiImportText(''); }}
                          disabled={isAiImporting}
                        >
                          {t('orders.cancel')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                <div className="form-group">
                  <label className="form-label">{t('orders.company')} <span className="required">*</span></label>
                  <input type="text" className={`form-input ${formErrors.company ? 'form-input-error' : ''}`} name="company" value={formData.company || ''} onChange={handleChange} placeholder={t('orders.requiredPlaceholder')} />
                  {formErrors.company && <span className="form-error-text">{formErrors.company}</span>}
                </div>
                <div className="form-group">
                  <label className="form-label">{t('orders.position')} <span className="required">*</span></label>
                  <input type="text" className={`form-input ${formErrors.position ? 'form-input-error' : ''}`} name="position" value={formData.position || ''} onChange={handleChange} placeholder={t('orders.requiredPlaceholder')} />
                  {formErrors.position && <span className="form-error-text">{formErrors.position}</span>}
                </div>
                <div className="form-group">
                  <label className="form-label">{t('orders.salary')} <span className="required">*</span></label>
                  <input type="text" className={`form-input ${formErrors.salary ? 'form-input-error' : ''}`} name="salary" value={formData.salary || ''} onChange={handleChange} placeholder={t('orders.salaryExample')} />
                  {formErrors.salary && <span className="form-error-text">{formErrors.salary}</span>}
                </div>
                <div className="form-group">
                  <label className="form-label">{t('orders.location')} <span className="required">*</span></label>
                  <input type="text" className={`form-input ${formErrors.location ? 'form-input-error' : ''}`} name="location" value={formData.location || ''} onChange={handleChange} placeholder={t('orders.requiredPlaceholder')} />
                  {formErrors.location && <span className="form-error-text">{formErrors.location}</span>}
                </div>
                <div className="form-group">
                  <label className="form-label">{t('orders.workHours')} <span className="required">*</span></label>
                  <input type="text" className={`form-input ${formErrors.workHours ? 'form-input-error' : ''}`} name="workHours" value={formData.workHours || ''} onChange={handleChange} placeholder={t('orders.hoursExample')} />
                  {formErrors.workHours && <span className="form-error-text">{formErrors.workHours}</span>}
                </div>
                <div className="form-group">
                  <label className="form-label">{t('orders.headcount')} <span className="required">*</span></label>
                  <input type="number" min="1" className="form-input" name="headcount" value={formData.headcount || 1} onChange={handleChange} />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">{t('orders.currentStatus')}</label>
                  <select className="form-select" name="status" value={formData.status || 'open'} onChange={handleChange}>
                    <option value="open">{t('orders.statusOpen')}</option>
                    <option value="urgent">{t('orders.statusUrgent')}</option>
                    <option value="paused">{t('orders.statusPaused')}</option>
                    <option value="filled">{t('orders.statusFilled')}</option>
                    <option value="closed">{t('orders.statusClosed')}</option>
                  </select>
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">{t('orders.requirements')} <span className="required">*</span></label>
                  <textarea className={`form-input ${formErrors.requirements ? 'form-input-error' : ''}`} name="requirements" value={formData.requirements || ''} onChange={handleChange} rows={3} placeholder={t('orders.reqsPlaceholder')}></textarea>
                  {formErrors.requirements && <span className="form-error-text">{formErrors.requirements}</span>}
                </div>

                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">{t('orders.benefits')}</label>
                  <input type="text" className="form-input" name="benefits" value={formData.benefits || ''} onChange={handleChange} placeholder={t('orders.benefitsExample')} />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">{t('orders.publicNotes')}</label>
                  <input type="text" className="form-input" name="notes" value={formData.notes || ''} onChange={handleChange} placeholder={t('orders.notesPlaceholder')} />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                {Object.keys(formErrors).length > 0 && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--text-xs)', color: 'var(--accent-rose)', marginRight: 'auto' }}>
                    <i className="ph-fill ph-warning-circle"></i>
                    {t('orders.fillAllRequired')}
                  </span>
                )}
                {editingOrder && (
                  <button className="btn btn-secondary" style={{ color: 'var(--accent-rose)', borderColor: 'rgba(244, 63, 94, 0.3)' }} onClick={() => handleDelete(editingOrder.id, editingOrder.position)}>
                    <i className="ph-light ph-trash"></i> {t('orders.deleteOrder')}
                  </button>
                )}
                <button className="btn btn-secondary" onClick={closeModal}>{t('orders.cancel')}</button>
                <button className="btn btn-primary" onClick={handleSave}>
                  <i className="ph-light ph-floppy-disk"></i> {t('orders.save')}
                </button>
              </div>

            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Duplicate Resolution Modal */}
      {isDuplicateModalOpen && mounted && duplicateMatch && pendingSaveData && createPortal(
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000
        }}>
          <div className="bezel-shell modal-bezel" style={{ width: '680px', maxWidth: '95vw', animation: 'modalEnter 0.25s cubic-bezier(0.32, 0.72, 0, 1)' }}>
            <div className="bezel-core modal-core" style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', maxHeight: '90vh', overflowY: 'auto' }}>
              
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)' }}>
                <div style={{ 
                  width: '44px', height: '44px', borderRadius: '12px', flexShrink: 0,
                  background: 'rgba(245, 158, 11, 0.14)', border: '1px solid rgba(245, 158, 11, 0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--accent-amber)', fontSize: '1.5rem'
                }}>
                  <i className="ph-fill ph-copy"></i>
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: 'var(--text-lg)', margin: '0 0 var(--space-1) 0', color: 'var(--text-primary)', fontWeight: 600 }}>
                    {t('orders.duplicateTitle')}
                  </h3>
                  <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                    {t('orders.duplicateDesc')}
                  </p>
                </div>
                <button className="btn-icon" onClick={handleCloseDuplicateModal} disabled={isResolvingDuplicate}>
                  <i className="ph-light ph-x"></i>
                </button>
              </div>

              {/* Comparison Cards Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
                {/* Existing Order Card */}
                <div style={{
                  padding: 'var(--space-4)', borderRadius: 'var(--radius-md)',
                  background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle)',
                  display: 'flex', flexDirection: 'column', gap: 'var(--space-3)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {t('orders.existingOrderLabel')}
                    </span>
                    <span className={`badge ${Utils.getJobOrderStatusMeta(duplicateMatch.status, t).badgeClass}`} style={{ fontSize: '0.72rem' }}>
                      {Utils.getJobOrderStatusMeta(duplicateMatch.status, t).label}
                    </span>
                  </div>

                  <div>
                    <h4 style={{ margin: '0 0 4px 0', fontSize: 'var(--text-base)', color: 'var(--text-primary)', fontWeight: 600 }}>
                      {duplicateMatch.position}
                    </h4>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <i className="ph-light ph-buildings"></i> {duplicateMatch.company}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                    <div><strong style={{ color: 'var(--text-muted)' }}>{t('orders.salary')}:</strong> {duplicateMatch.salary || '-'}</div>
                    <div><strong style={{ color: 'var(--text-muted)' }}>{t('orders.location')}:</strong> {duplicateMatch.location || '-'}</div>
                    <div><strong style={{ color: 'var(--text-muted)' }}>{t('orders.workHours')}:</strong> {duplicateMatch.workHours || '-'}</div>
                    <div><strong style={{ color: 'var(--text-muted)' }}>{t('orders.headcount')}:</strong> {duplicateMatch.headcount || 1} {t('orders.pax')}</div>
                    {(duplicateMatch.updatedAt || duplicateMatch.createdAt) && (
                      <div style={{ color: 'var(--text-muted)', marginTop: '4px', fontSize: '0.7rem' }}>
                        {t('orders.existingTime')}: {Utils.formatDate(duplicateMatch.updatedAt || duplicateMatch.createdAt)}
                      </div>
                    )}
                  </div>
                </div>

                {/* New Order Data Card */}
                <div style={{
                  padding: 'var(--space-4)', borderRadius: 'var(--radius-md)',
                  background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.28)',
                  display: 'flex', flexDirection: 'column', gap: 'var(--space-3)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {t('orders.newOrderLabel')}
                    </span>
                    <span className={`badge ${Utils.getJobOrderStatusMeta(pendingSaveData.status, t).badgeClass}`} style={{ fontSize: '0.72rem' }}>
                      {Utils.getJobOrderStatusMeta(pendingSaveData.status, t).label}
                    </span>
                  </div>

                  <div>
                    <h4 style={{ margin: '0 0 4px 0', fontSize: 'var(--text-base)', color: 'var(--text-primary)', fontWeight: 600 }}>
                      {pendingSaveData.position}
                    </h4>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <i className="ph-light ph-buildings"></i> {pendingSaveData.company}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                    <div><strong style={{ color: 'var(--text-muted)' }}>{t('orders.salary')}:</strong> {pendingSaveData.salary || '-'}</div>
                    <div><strong style={{ color: 'var(--text-muted)' }}>{t('orders.location')}:</strong> {pendingSaveData.location || '-'}</div>
                    <div><strong style={{ color: 'var(--text-muted)' }}>{t('orders.workHours')}:</strong> {pendingSaveData.workHours || '-'}</div>
                    <div><strong style={{ color: 'var(--text-muted)' }}>{t('orders.headcount')}:</strong> {pendingSaveData.headcount || 1} {t('orders.pax')}</div>
                    <div style={{ color: 'var(--accent-emerald)', marginTop: '4px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <i className="ph-fill ph-check-circle"></i> {t('orders.newTitle')}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={handleCloseDuplicateModal}
                  disabled={isResolvingDuplicate}
                >
                  {t('orders.cancel')}
                </button>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={handleResolveDuplicateCreateNew}
                  disabled={isResolvingDuplicate}
                  style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
                >
                  {isResolvingDuplicate ? (
                    <i className="ph-light ph-spinner ph-spin"></i>
                  ) : (
                    <i className="ph-light ph-plus-circle" style={{ color: 'var(--accent-blue)' }}></i>
                  )}
                  {t('orders.createAsNewBtn')}
                </button>
                <button 
                  type="button" 
                  className="btn btn-primary" 
                  onClick={handleResolveDuplicateUpdate}
                  disabled={isResolvingDuplicate}
                  style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
                >
                  {isResolvingDuplicate ? (
                    <i className="ph-light ph-spinner ph-spin"></i>
                  ) : (
                    <i className="ph-light ph-arrows-clockwise"></i>
                  )}
                  {t('orders.updateExistingBtn')}
                </button>
              </div>

            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Details Drawer */}
      <OrderDrawer 
        order={selectedOrder}
        isOpen={isDrawerOpen}
        onClose={closeDrawer}
        onEdit={openEditFromDrawer}
        onQuickStatusChange={handleQuickStatusChange}
      />

    </div>
  );
}
