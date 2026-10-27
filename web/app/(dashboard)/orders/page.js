'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../../lib/auth-context';
import { useFeedback } from '../../../lib/feedback-context';
import { FirestoreStore } from '../../../lib/firestore-store';
import { Utils } from '../../../lib/utils';
import { SystemLogger } from '../../../lib/logger';
import { MatchService } from '../../../lib/match-service';
import { authFetch } from '../../../lib/api-client';
import OrderDrawer from '../../../components/OrderDrawer';
import OrdersViewToolbar, { OrdersFilterSelect, OrdersPagination } from '../../../components/orders/OrdersViewToolbar';
import OrdersCardsView from '../../../components/orders/OrdersCardsView';
import OrdersTableView from '../../../components/orders/OrdersTableView';
import OrdersGroupedView from '../../../components/orders/OrdersGroupedView';
import OrdersSplitView from '../../../components/orders/OrdersSplitView';
import { useOrdersViewPrefs } from '../../../lib/orders-view-prefs';
import { buildFilterOptions, defaultSortDir, groupOrders, matchesFilter, sortOrders } from '../../../lib/order-view.mjs';
import { useI18n } from '../../../lib/i18n-context';

// Cards / rows per page; the grouped view pages through groups instead
const PAGE_SIZES = { cards: 30, table: 50, grouped: 20, split: 50 };

export default function OrdersPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { teamId, role, user, isRecruiter, isReadOnlyView } = useAuth();
  const { showToast, confirm } = useFeedback();
  const { t, lang } = useI18n();
  const [orders, setOrders] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [picFilter, setPicFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [page, setPage] = useState(1);
  const [splitSelectedId, setSplitSelectedId] = useState(null);
  const [viewPrefs, updateViewPrefs] = useOrdersViewPrefs();
  const listTopRef = useRef(null);
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
  const [batchPreviewOrders, setBatchPreviewOrders] = useState([]);
  const [isBatchSaving, setIsBatchSaving] = useState(false);

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
    setBatchPreviewOrders([]);
    setIsBatchSaving(false);
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
      
      if (resData.status === 'success' && Array.isArray(resData.data) && resData.data.length > 0) {
        if (resData.data.length === 1) {
          const orderData = resData.data[0];
          setFormData(prev => ({
            ...prev,
            company: orderData.company || prev.company || '',
            position: orderData.position || prev.position || '',
            salary: orderData.salary || prev.salary || 'Negotiable',
            location: orderData.location || prev.location || 'TBD',
            workHours: orderData.workHours || prev.workHours || 'TBD',
            requirements: orderData.requirements || prev.requirements || 'TBD',
            benefits: orderData.benefits || prev.benefits || '',
            notes: orderData.notes || prev.notes || '',
            headcount: parseInt(orderData.headcount) || prev.headcount || 1
          }));
          setBatchPreviewOrders([]);
          setShowAiImport(false);
          setAiImportText('');
          SystemLogger.audit(teamId, user, 'AI_PARSE', 'JOB_ORDER', orderData.position || t('orders.unnamedPosition'), {
            actionDetail: t('orders.importFromOrder'),
            company: orderData.company
          });
        } else {
          // 多岗位模式：构建可编辑批量预览队列
          const fallbackCompany = resData.data.find(d => d.company && d.company.trim())?.company?.trim() || formData.company || '';
          const prepared = resData.data.map((item, idx) => ({
            _tempId: `batch_${Date.now()}_${idx}`,
            _selected: true,
            company: (item.company || fallbackCompany || '').trim(),
            position: (item.position || '').trim(),
            salary: (item.salary || 'Negotiable').trim(),
            location: (item.location || 'TBD').trim(),
            workHours: (item.workHours || 'TBD').trim(),
            requirements: (item.requirements || 'TBD').trim(),
            benefits: (item.benefits || '').trim(),
            notes: (item.notes || '').trim(),
            headcount: parseInt(item.headcount) || 1,
            status: 'open'
          }));
          setBatchPreviewOrders(prepared);
          setShowAiImport(false);
          setAiImportText('');
          SystemLogger.audit(teamId, user, 'AI_PARSE', 'JOB_ORDER', `${prepared.length} positions`, {
            actionDetail: t('orders.importFromOrder'),
            company: fallbackCompany
          });
        }
      } else {
        showToast(resData.message || t('orders.aiParseFailed'), 'error');
      }
    } catch (err) {
      showToast(t('orders.networkError') + err.message, 'error');
    } finally {
      setIsAiImporting(false);
    }
  };

  const handleBatchItemChange = (tempId, field, value) => {
    setBatchPreviewOrders(prev => prev.map(item =>
      item._tempId === tempId ? { ...item, [field]: value } : item
    ));
  };

  const handleBatchSharedCompanyChange = (newCompany) => {
    setBatchPreviewOrders(prev => prev.map(item => ({ ...item, company: newCompany })));
  };

  const handleBatchSave = async () => {
    const selected = batchPreviewOrders.filter(item => item._selected && item.position.trim());
    if (selected.length === 0) return;

    const missingCompany = selected.some(item => !item.company || !item.company.trim());
    if (missingCompany) {
      showToast(`${t('orders.company')} ${t('orders.isRequired')}`, 'error');
      return;
    }

    setIsBatchSaving(true);
    let createdCount = 0;
    let updatedCount = 0;

    try {
      for (const item of selected) {
        const payload = {
          company: item.company.trim(),
          position: item.position.trim(),
          salary: (item.salary || 'Negotiable').trim(),
          location: (item.location || 'TBD').trim(),
          workHours: (item.workHours || 'TBD').trim(),
          requirements: (item.requirements || 'TBD').trim(),
          benefits: (item.benefits || '').trim(),
          notes: (item.notes || '').trim(),
          headcount: Math.max(1, parseInt(item.headcount) || 1),
          status: item.status || 'open'
        };

        const normComp = payload.company.toLowerCase();
        const normPos = payload.position.toLowerCase();
        const existing = orders.find(o =>
          (o.company || '').trim().toLowerCase() === normComp &&
          (o.position || '').trim().toLowerCase() === normPos
        );

        if (existing) {
          await FirestoreStore.updateJobOrder(teamId, existing.id, payload);
          updatedCount++;
        } else {
          await FirestoreStore.addJobOrder(teamId, user.uid, payload);
          createdCount++;
        }
      }

      SystemLogger.audit(teamId, user, 'CREATE', 'JOB_ORDER', `Batch Import (${createdCount} new, ${updatedCount} updated)`);
      showToast(
        t('orders.batchImportSuccess', { created: createdCount, updated: updatedCount }, `成功批量导入 ${createdCount} 个新岗位，更新 ${updatedCount} 个已有岗位！`),
        'success'
      );
      closeModal();
    } catch (error) {
      showToast(t('orders.saveFailed') + error.message, 'error');
    } finally {
      setIsBatchSaving(false);
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

  // Derived state: Search & Filters, then the sort picked in the view toolbar (default: most recently updated first)
  const searchTokens = searchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const filteredOrders = sortOrders(orders.filter(order => {
    // 1. Status / PIC / Location / Company Filters
    if (statusFilter !== 'all' && order.status !== statusFilter) return false;
    if (!matchesFilter(order, 'pic', picFilter)) return false;
    if (!matchesFilter(order, 'location', locationFilter)) return false;
    if (!matchesFilter(order, 'company', companyFilter)) return false;

    // 2. Keyword Search
    if (searchTokens.length === 0) return true;

    const compositeText = [
      order.company, order.position, order.salary, order.benefits,
      order.requirements, order.workHours, order.location, order.notes
    ].filter(Boolean).join(' ').toLowerCase();

    return searchTokens.every(token => compositeText.includes(token));
  }), viewPrefs.sortKey, viewPrefs.sortDir);

  const filterOptions = {
    pic: buildFilterOptions(orders, 'pic'),
    location: buildFilterOptions(orders, 'location'),
    company: buildFilterOptions(orders, 'company')
  };
  const hasActiveFilters = Boolean(statusFilter !== 'all' || picFilter || locationFilter || companyFilter || searchQuery.trim());

  // Pagination
  const { view } = viewPrefs;
  const orderGroups = view === 'grouped' ? groupOrders(filteredOrders, viewPrefs.groupBy) : [];
  const pageItems = view === 'grouped' ? orderGroups : filteredOrders;
  const pageSize = PAGE_SIZES[view];
  const pageCount = Math.max(1, Math.ceil(pageItems.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedItems = pageItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const splitOrder = view === 'split' ? (pagedItems.find(o => o.id === splitSelectedId) || pagedItems[0] || null) : null;

  // Any filter, sort or view change starts again from page 1
  const setFilter = (setter, value) => {
    setter(value);
    setPage(1);
  };

  const handleViewPrefsChange = (patch) => {
    updateViewPrefs(patch);
    setPage(1);
  };

  const handleTableSort = (key) => {
    handleViewPrefsChange(key === viewPrefs.sortKey
      ? { sortDir: viewPrefs.sortDir === 'asc' ? 'desc' : 'asc' }
      : { sortKey: key, sortDir: defaultSortDir(key) });
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setPicFilter('');
    setLocationFilter('');
    setCompanyFilter('');
    setPage(1);
  };

  const handlePageChange = (nextPage) => {
    setPage(nextPage);
    listTopRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  return (
    <div className="page-view active">
      
      {/* Utility Bar */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-3)', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flex: 1, minWidth: '260px', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ marginBottom: 0, flex: '1 1 180px' }}>
            <div className="combo-input-wrapper">
              <input 
                type="text" 
                className="form-input" 
                placeholder={t('orders.searchPlaceholder')} 
                value={searchQuery}
                onChange={(e) => setFilter(setSearchQuery, e.target.value)}
              />
              <i className="ph-light ph-magnifying-glass"></i>
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0, flex: '0 1 130px', minWidth: '110px' }}>
            <select className="form-select" value={statusFilter} onChange={(e) => setFilter(setStatusFilter, e.target.value)}>
              <option value="all">{t('orders.filterAll')}</option>
              <option value="open">{t('orders.statusOpen')}</option>
              <option value="urgent">{t('orders.statusUrgent')}</option>
              <option value="paused">{t('orders.statusPaused')}</option>
              <option value="filled">{t('orders.statusFilled')}</option>
              <option value="closed">{t('orders.statusClosed')}</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, flex: '0 1 150px', minWidth: '120px' }}>
            <OrdersFilterSelect 
              value={picFilter} 
              onChange={(value) => setFilter(setPicFilter, value)} 
              options={filterOptions.pic} 
              allLabel={t('ordersView.allPic')} 
              noneLabel={t('ordersView.noPic')} 
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0, flex: '0 1 150px', minWidth: '120px' }}>
            <OrdersFilterSelect 
              value={locationFilter} 
              onChange={(value) => setFilter(setLocationFilter, value)} 
              options={filterOptions.location} 
              allLabel={t('ordersView.allLocations')} 
              noneLabel={t('ordersView.noLocation')} 
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0, flex: '0 1 170px', minWidth: '120px' }}>
            <OrdersFilterSelect 
              value={companyFilter} 
              onChange={(value) => setFilter(setCompanyFilter, value)} 
              options={filterOptions.company} 
              allLabel={t('ordersView.allCompanies')} 
              noneLabel={t('ordersView.noCompany')} 
            />
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
              <span>{t('team.readOnlyBadge', '单向只读')} · {t('extraUi.partnerDataBadge', '合作人数据')}</span>
            </div>
          )}
        </div>
      </div>

      {/* View Toolbar */}
      <div ref={listTopRef} style={{ scrollMarginTop: 'var(--space-4)' }}>
        <OrdersViewToolbar 
          prefs={viewPrefs} 
          onChange={handleViewPrefsChange}
          summary={(
            <>
              <span>
                {view === 'grouped'
                  ? t('ordersView.groupedCount', { count: filteredOrders.length, groups: orderGroups.length })
                  : t('ordersView.resultCount', { count: filteredOrders.length })}
              </span>
              {hasActiveFilters && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>
                  <i className="ph-light ph-x"></i> {t('ordersView.clearFilters')}
                </button>
              )}
            </>
          )}
        />
      </div>

      {/* Orders View or Empty State */}
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
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)', flexWrap: 'wrap', justifyContent: 'center' }}>
              {hasActiveFilters && (
                <button className="btn btn-secondary btn-sm" onClick={clearFilters}>
                  <i className="ph-light ph-x"></i> {t('ordersView.clearFilters')}
                </button>
              )}
              <button className="btn btn-primary btn-sm" onClick={() => openModal(null)}>
                <i className="ph-bold ph-plus"></i> {t('orders.createNow')}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {view === 'cards' && (
            <OrdersCardsView orders={pagedItems} onOpen={openDrawer} onQuickStatusChange={handleQuickStatusChange} />
          )}
          {view === 'table' && (
            <OrdersTableView 
              orders={pagedItems}
              sortKey={viewPrefs.sortKey}
              sortDir={viewPrefs.sortDir}
              onSort={handleTableSort}
              hiddenColumns={viewPrefs.hiddenColumns}
              onOpen={openDrawer}
              onQuickStatusChange={handleQuickStatusChange}
              canEdit={!isReadOnlyView}
            />
          )}
          {view === 'grouped' && (
            <OrdersGroupedView groups={pagedItems} groupBy={viewPrefs.groupBy} onOpen={openDrawer} />
          )}
          {view === 'split' && (
            <OrdersSplitView 
              orders={pagedItems}
              selectedOrder={splitOrder}
              onSelect={setSplitSelectedId}
              onOpenDrawer={openDrawer}
              onEdit={openModal}
              onQuickStatusChange={handleQuickStatusChange}
              canEdit={!isReadOnlyView}
              keyboardEnabled={!isModalOpen && !isDrawerOpen && !isDuplicateModalOpen}
            />
          )}
          <OrdersPagination page={currentPage} pageCount={pageCount} onChange={handlePageChange} />
        </>
      )}

      {/* Add / Edit Modal - Teleported to document.body via Portal to prevent centering issues caused by parent CSS transforms */}
      {isModalOpen && mounted && createPortal(
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div className="bezel-shell modal-bezel" style={{ width: batchPreviewOrders.length > 0 ? '780px' : '600px', maxWidth: '95vw', animation: 'modalEnter 0.3s cubic-bezier(0.32, 0.72, 0, 1)' }}>
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
                    <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button 
                        type="button" 
                        className="btn btn-secondary btn-sm" 
                        onClick={() => setShowAiImport(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
                      >
                        <i className="ph-light ph-magic-wand" style={{ color: 'var(--accent-purple)' }}></i> {t('orders.smartImport')}
                      </button>
                      {batchPreviewOrders.length > 0 && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => setBatchPreviewOrders([])}
                        >
                          <i className="ph-light ph-arrow-counter-clockwise"></i> {t('orders.batchBackToSingle', '清空并退回单条录入')}
                        </button>
                      )}
                    </div>
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

              {batchPreviewOrders.length > 0 ? (
                <>
                  <div style={{
                    padding: 'var(--space-3) var(--space-4)',
                    background: 'rgba(139, 92, 246, 0.08)',
                    border: '1px solid rgba(139, 92, 246, 0.28)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 'var(--space-3)'
                  }}>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <i className="ph-fill ph-stack" style={{ color: 'var(--accent-purple)' }}></i>
                      {t('orders.batchPreviewTitle', { count: batchPreviewOrders.length }, `已从文本中拆出 ${batchPreviewOrders.length} 个独立岗位，请核对后批量入库`)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <input
                        type="text"
                        className="form-input"
                        style={{ width: '200px', height: '30px', fontSize: 'var(--text-xs)' }}
                        placeholder={t('orders.batchSharedCompany', '统一归属企业')}
                        value={batchPreviewOrders[0]?.company || ''}
                        onChange={(e) => handleBatchSharedCompanyChange(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          const allChecked = batchPreviewOrders.every(i => i._selected);
                          setBatchPreviewOrders(prev => prev.map(i => ({ ...i, _selected: !allChecked })));
                        }}
                      >
                        {t('orders.batchSelectAll', '全选 / 取消全选')}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', maxHeight: '52vh', overflowY: 'auto', paddingRight: '4px' }}>
                    {batchPreviewOrders.map((item, idx) => {
                      const isDup = orders.some(o =>
                        (o.company || '').trim().toLowerCase() === (item.company || '').trim().toLowerCase() &&
                        (o.position || '').trim().toLowerCase() === (item.position || '').trim().toLowerCase()
                      );
                      return (
                        <div
                          key={item._tempId}
                          style={{
                            padding: 'var(--space-4)',
                            borderRadius: 'var(--radius-md)',
                            border: item._selected ? '1px solid var(--border-interactive)' : '1px solid var(--border-subtle)',
                            background: item._selected ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.01)',
                            opacity: item._selected ? 1 : 0.55,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 'var(--space-3)'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                              <input
                                type="checkbox"
                                checked={item._selected}
                                onChange={(e) => handleBatchItemChange(item._tempId, '_selected', e.target.checked)}
                              />
                              <span>#{idx + 1} · {item.position || t('orders.unnamedPosition')}</span>
                            </label>
                            <span className="badge" style={{
                              fontSize: '11px',
                              color: isDup ? 'var(--accent-amber)' : 'var(--accent-emerald)',
                              borderColor: isDup ? 'rgba(245, 158, 11, 0.35)' : 'rgba(16, 185, 129, 0.35)'
                            }}>
                              {isDup ? t('orders.batchDuplicateBadge', '已有同名岗位 (保存时将自动更新)') : t('orders.batchNewBadge', '新岗位')}
                            </span>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-2)' }}>
                            <div>
                              <label className="form-label" style={{ fontSize: '11px' }}>{t('orders.company')} *</label>
                              <input
                                type="text"
                                className="form-input"
                                value={item.company}
                                onChange={(e) => handleBatchItemChange(item._tempId, 'company', e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="form-label" style={{ fontSize: '11px' }}>{t('orders.position')} *</label>
                              <input
                                type="text"
                                className="form-input"
                                value={item.position}
                                onChange={(e) => handleBatchItemChange(item._tempId, 'position', e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="form-label" style={{ fontSize: '11px' }}>{t('orders.salary')}</label>
                              <input
                                type="text"
                                className="form-input"
                                value={item.salary}
                                onChange={(e) => handleBatchItemChange(item._tempId, 'salary', e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="form-label" style={{ fontSize: '11px' }}>{t('orders.location')}</label>
                              <input
                                type="text"
                                className="form-input"
                                value={item.location}
                                onChange={(e) => handleBatchItemChange(item._tempId, 'location', e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="form-label" style={{ fontSize: '11px' }}>{t('orders.requirements')}</label>
                              <input
                                type="text"
                                className="form-input"
                                value={item.requirements}
                                onChange={(e) => handleBatchItemChange(item._tempId, 'requirements', e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="form-label" style={{ fontSize: '11px' }}>{t('orders.benefits')}</label>
                              <input
                                type="text"
                                className="form-input"
                                value={item.benefits}
                                onChange={(e) => handleBatchItemChange(item._tempId, 'benefits', e.target.value)}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                    <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={isBatchSaving}>
                      {t('orders.cancel')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleBatchSave}
                      disabled={isBatchSaving || batchPreviewOrders.filter(i => i._selected && i.position.trim()).length === 0}
                    >
                      {isBatchSaving ? (
                        <><i className="ph-light ph-spinner ph-spin"></i> {t('orders.batchImporting', '正在批量写入...')}</>
                      ) : (
                        <><i className="ph-light ph-floppy-disk"></i> {t('orders.batchImportBtn', { count: batchPreviewOrders.filter(i => i._selected && i.position.trim()).length }, `一键批量入库 (${batchPreviewOrders.filter(i => i._selected && i.position.trim()).length} 个岗位)`)}</>
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <>
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
                </>
              )}

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
