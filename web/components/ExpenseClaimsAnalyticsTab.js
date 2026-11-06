'use client';

import { useState, useMemo, Fragment } from 'react';
import { useI18n } from '../lib/i18n-context';
import { FirestoreStore } from '../lib/firestore-store';
import DraggableTableWrapper from './DraggableTableWrapper';

export default function ExpenseClaimsAnalyticsTab({
  expenseClaims = [],
  teamMembers = [],
  isOwner = false,
  isManager = false,
  teamId = 'default_team',
  user = null,
  exportMonth = '',
  exportMonthOptions = [],
  onApproveManager,
  onApproveFinance,
  onExecuteBatch,
  showToast
}) {
  const { t } = useI18n();

  const [claimsFilterMonth, setClaimsFilterMonth] = useState('all');
  const [claimsStatusFilter, setClaimsStatusFilter] = useState('ALL');
  const [claimsSearchText, setClaimsSearchText] = useState('');
  const [selectedClaimIdsForBatch, setSelectedClaimIdsForBatch] = useState([]);
  const [expandedClaimId, setExpandedClaimId] = useState(null);

  // 驳回弹窗状态
  const [claimRejectModalOpen, setClaimRejectModalOpen] = useState(false);
  const [claimToReject, setClaimToReject] = useState(null);
  const [claimRejectReason, setClaimRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  // 1. 顶部 Bento 核心指标计算
  const metrics = useMemo(() => {
    const pendingManagerCount = expenseClaims.filter(c => c.status === 'SUBMITTED').length;
    const pendingFinanceCount = expenseClaims.filter(c => c.status === 'MANAGER_APPROVED').length;
    const pendingPayoutAmt = expenseClaims.filter(c => c.status === 'APPROVED_PENDING_PAYOUT')
      .reduce((acc, c) => acc + (Number(c.totalAmount) || 0), 0);
    const settledAmt = expenseClaims.filter(c => c.status === 'PAID' || c.status === 'LOCKED_IN_PAYROLL')
      .reduce((acc, c) => acc + (Number(c.totalAmount) || 0), 0);
    const warningCount = expenseClaims.filter(c => (c.items || []).some(it => it.warnings?.length > 0)).length;

    return {
      pendingManagerCount,
      pendingFinanceCount,
      pendingPayoutAmt,
      settledAmt,
      warningCount
    };
  }, [expenseClaims]);

  // 2. 列表过滤
  const filteredClaims = useMemo(() => {
    return expenseClaims.filter(c => {
      if (claimsFilterMonth !== 'all' && c.claimMonth !== claimsFilterMonth) return false;
      if (claimsStatusFilter !== 'ALL' && c.status !== claimsStatusFilter) return false;
      if (claimsSearchText.trim()) {
        const q = claimsSearchText.toLowerCase().trim();
        const matchTitle = (c.title || '').toLowerCase().includes(q);
        const matchName = (c.picName || c.userName || '').toLowerCase().includes(q);
        const matchItem = (c.items || []).some(it => 
          (it.merchantName || '').toLowerCase().includes(q) || 
          (it.invoiceNo || '').toLowerCase().includes(q)
        );
        if (!matchTitle && !matchName && !matchItem) return false;
      }
      return true;
    });
  }, [expenseClaims, claimsFilterMonth, claimsStatusFilter, claimsSearchText]);

  // 3. 驳回执行
  const handleConfirmReject = async () => {
    if (!claimToReject) return;
    if (!claimRejectReason.trim()) {
      showToast(t('claims.toastRejectionReasonRequired', '请输入明确的驳回原因'));
      return;
    }

    setIsRejecting(true);
    try {
      const stage = claimToReject.status === 'SUBMITTED' ? 'MANAGER' : 'FINANCE';
      await FirestoreStore.updateExpenseClaimStatus(teamId, user, claimToReject.id, 'REJECTED', {
        title: claimToReject.title,
        stage,
        reason: claimRejectReason.trim()
      });
      showToast(t('claims.toastRejected', '报销单已驳回'));
      setClaimRejectModalOpen(false);
      setClaimToReject(null);
      setClaimRejectReason('');
    } catch (err) {
      showToast(`${t('claims.toastManagerRejectFailed', '驳回失败')}: ${err.message}`);
    } finally {
      setIsRejecting(false);
    }
  };

  // 4. 批次处理封装
  const handleBatchAction = async (type) => {
    if (!selectedClaimIdsForBatch.length) return;
    setIsBatchProcessing(true);
    try {
      if (onExecuteBatch) {
        await onExecuteBatch(type, selectedClaimIdsForBatch);
      }
      setSelectedClaimIdsForBatch([]);
    } catch (err) {
      showToast(`${t('claims.toastPayoutFailed', '放款操作失败')}: ${err.message}`);
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const allApprovedSelectable = filteredClaims.filter(c => c.status === 'APPROVED_PENDING_PAYOUT');
  const isAllSelected = allApprovedSelectable.length > 0 && allApprovedSelectable.every(c => selectedClaimIdsForBatch.includes(c.id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Top Bento Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        <div className="bezel-shell">
          <div className="bezel-core" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-amber)', marginBottom: '8px', fontSize: '12px', fontWeight: '600' }}>
              <i className="ph-bold ph-hourglass-simple" style={{ fontSize: '18px' }}></i>
              <span>{t('claims.bentoPendingManager', '待初审报销单')}</span>
            </div>
            <div style={{ fontSize: '26px', fontWeight: '800', fontFamily: 'monospace', color: metrics.pendingManagerCount > 0 ? 'var(--accent-amber)' : 'var(--text-primary)' }}>
              {metrics.pendingManagerCount} {t('claims.unitItems', '笔') && <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)' }}>{t('claims.unitItems', '笔')}</span>}
            </div>
          </div>
        </div>

        <div className="bezel-shell">
          <div className="bezel-core" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-blue)', marginBottom: '8px', fontSize: '12px', fontWeight: '600' }}>
              <i className="ph-bold ph-seal-check" style={{ fontSize: '18px' }}></i>
              <span>{t('claims.bentoPendingFinance', '待终审报销单')}</span>
            </div>
            <div style={{ fontSize: '26px', fontWeight: '800', fontFamily: 'monospace', color: metrics.pendingFinanceCount > 0 ? 'var(--accent-blue)' : 'var(--text-primary)' }}>
              {metrics.pendingFinanceCount} {t('claims.unitItems', '笔') && <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)' }}>{t('claims.unitItems', '笔')}</span>}
            </div>
          </div>
        </div>

        <div className="bezel-shell">
          <div className="bezel-core" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-emerald)', marginBottom: '8px', fontSize: '12px', fontWeight: '600' }}>
              <i className="ph-bold ph-wallet" style={{ fontSize: '18px' }}></i>
              <span>{t('claims.bentoPendingPayout', '待放款/入薪总额')}</span>
            </div>
            <div style={{ fontSize: '22px', fontWeight: '800', fontFamily: 'monospace', color: 'var(--accent-emerald)' }}>
              MYR {metrics.pendingPayoutAmt.toFixed(2)}
            </div>
          </div>
        </div>

        <div className="bezel-shell">
          <div className="bezel-core" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a78bfa', marginBottom: '8px', fontSize: '12px', fontWeight: '600' }}>
              <i className="ph-bold ph-check-circle" style={{ fontSize: '18px' }}></i>
              <span>{t('claims.bentoSettledMonth', '累计已结清/入薪')}</span>
            </div>
            <div style={{ fontSize: '22px', fontWeight: '800', fontFamily: 'monospace', color: '#a78bfa' }}>
              MYR {metrics.settledAmt.toFixed(2)}
            </div>
          </div>
        </div>

        {metrics.warningCount > 0 && (
          <div className="bezel-shell">
            <div className="bezel-core" style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.05)', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-red)', marginBottom: '8px', fontSize: '12px', fontWeight: '600' }}>
                <i className="ph-bold ph-warning-circle" style={{ fontSize: '18px' }}></i>
                <span>{t('claims.bentoWarnings', '风控合规预警')}</span>
              </div>
              <div style={{ fontSize: '26px', fontWeight: '800', fontFamily: 'monospace', color: 'var(--accent-red)' }}>
                {metrics.warningCount} <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)' }}>{t('claims.warningWithIssues', '单含异常')}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Table Container & Filter Toolbar */}
      <div className="bezel-shell">
        <div className="bezel-core" style={{ padding: 'var(--space-5)' }}>
          {/* Toolbar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={claimsSearchText}
                  onChange={(e) => setClaimsSearchText(e.target.value)}
                  placeholder={t('claims.searchPlaceholder', '搜索顾问姓名、商户名或标题...')}
                  className="input"
                  style={{ height: '32px', fontSize: '12px', width: '220px', paddingLeft: '28px' }}
                />
                <i className="ph-bold ph-magnifying-glass" style={{ position: 'absolute', left: '8px', top: '9px', color: 'var(--text-muted)', fontSize: '14px' }}></i>
              </div>

              <select
                value={claimsFilterMonth}
                onChange={(e) => setClaimsFilterMonth(e.target.value)}
                className="select"
                style={{ height: '32px', fontSize: '12px' }}
              >
                <option value="all">{t('claims.allMonths', '全部月份')}</option>
                {exportMonthOptions.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>

              <select
                value={claimsStatusFilter}
                onChange={(e) => setClaimsStatusFilter(e.target.value)}
                className="select"
                style={{ height: '32px', fontSize: '12px' }}
              >
                <option value="ALL">{t('claims.allStatus', '全部状态')}</option>
                <option value="SUBMITTED">{t('claims.statusSubmitted', '待主管初审')}</option>
                <option value="MANAGER_APPROVED">{t('claims.statusManagerApproved', '待财务终审')}</option>
                <option value="APPROVED_PENDING_PAYOUT">{t('claims.statusApprovedPendingPayout', '已批准 · 待放款')}</option>
                <option value="PAID">{t('claims.statusPaid', '已放款结清')}</option>
                <option value="LOCKED_IN_PAYROLL">{t('claims.statusLockedInPayroll', '已并入薪资单锁定')}</option>
                <option value="REJECTED">{t('claims.statusRejected', '已驳回')}</option>
              </select>
            </div>

            {/* Batch Actions Bar (Owner Only) */}
            {isOwner && selectedClaimIdsForBatch.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(59, 130, 246, 0.1)', padding: '4px 12px', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                <span style={{ fontSize: '12px', color: 'var(--accent-blue)', fontWeight: '700' }}>
                  {t('claims.selectedCount', { count: selectedClaimIdsForBatch.length }, `已选 ${selectedClaimIdsForBatch.length} 笔`)} (MYR {
                    expenseClaims
                      .filter(c => selectedClaimIdsForBatch.includes(c.id))
                      .reduce((acc, c) => acc + (Number(c.totalAmount) || 0), 0)
                      .toFixed(2)
                  })
                </span>
                <button
                  type="button"
                  disabled={isBatchProcessing}
                  onClick={() => handleBatchAction('BATCH_PAYOUT')}
                  className="btn btn-xs btn-primary"
                  style={{ gap: '4px', fontSize: '11px', padding: '4px 10px' }}
                >
                  <i className="ph-bold ph-bank"></i>
                  {t('claims.batchPayoutBtn', '生成放款批次')}
                </button>
                <button
                  type="button"
                  disabled={isBatchProcessing}
                  onClick={() => handleBatchAction('PAYROLL')}
                  className="btn btn-xs"
                  style={{
                    gap: '4px', fontSize: '11px', padding: '4px 10px',
                    background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                    color: '#fff', border: 'none', fontWeight: '700'
                  }}
                >
                  <i className="ph-bold ph-lock"></i>
                  {t('claims.lockPayrollBtn', '并入当月薪资单锁定')}
                </button>
              </div>
            )}
          </div>

          {/* Table */}
          {filteredClaims.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
              <i className="ph-bold ph-tray" style={{ fontSize: '32px', marginBottom: '8px', opacity: 0.5 }}></i>
              <div>{t('claims.emptyClaims', '暂无报销单记录')}</div>
            </div>
          ) : (
            <DraggableTableWrapper>
              <table className="table" style={{ width: '100%', minWidth: '850px', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
                    {isOwner && (
                      <th style={{ width: '36px', textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isAllSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedClaimIdsForBatch(allApprovedSelectable.map(c => c.id));
                            } else {
                              setSelectedClaimIdsForBatch([]);
                            }
                          }}
                          title={t('claims.selectAllPayable', '全选可放款单据')}
                        />
                      </th>
                    )}
                    <th style={{ textAlign: 'left', padding: '10px' }}>{t('claims.titleField', '报销单标题')}</th>
                    <th style={{ textAlign: 'left', padding: '10px' }}>{t('claims.colRecruiter', '申请顾问 (PIC)')}</th>
                    <th style={{ textAlign: 'left', padding: '10px' }}>{t('claims.colMonth', '月份')}</th>
                    <th style={{ textAlign: 'right', padding: '10px' }}>{t('claims.colItemsCount', '明细数')}</th>
                    <th style={{ textAlign: 'right', padding: '10px' }}>{t('claims.colTotalAmount', '总金额 (MYR)')}</th>
                    <th style={{ textAlign: 'center', padding: '10px' }}>{t('claims.colPayoutChannel', '放款轨道')}</th>
                    <th style={{ textAlign: 'center', padding: '10px' }}>{t('claims.colApprovalStatus', '审批状态')}</th>
                    <th style={{ textAlign: 'center', padding: '10px' }}>{t('claims.colRiskAudit', '风控')}</th>
                    <th style={{ textAlign: 'right', padding: '10px' }}>{t('common.actions', '操作')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClaims.map(claim => {
                    const isExpanded = expandedClaimId === claim.id;
                    const hasWarning = (claim.items || []).some(it => it.warnings?.length > 0);
                    const isSelected = selectedClaimIdsForBatch.includes(claim.id);

                    const statusColors = {
                      SUBMITTED: { bg: 'rgba(245, 158, 11, 0.15)', text: 'var(--accent-amber)', label: t('claims.statusSubmitted', '待主管初审') },
                      MANAGER_APPROVED: { bg: 'rgba(59, 130, 246, 0.15)', text: 'var(--accent-blue)', label: t('claims.statusManagerApproved', '待财务终审') },
                      APPROVED_PENDING_PAYOUT: { bg: 'rgba(16, 185, 129, 0.15)', text: 'var(--accent-emerald)', label: t('claims.statusApprovedPendingPayout', '已批准 · 待放款') },
                      PAID: { bg: 'rgba(16, 185, 129, 0.25)', text: '#10b981', label: t('claims.statusPaid', '已放款结清') },
                      LOCKED_IN_PAYROLL: { bg: 'rgba(139, 92, 246, 0.2)', text: '#a78bfa', label: t('claims.statusLockedInPayroll', '已并入薪资单锁定') },
                      REJECTED: { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', label: t('claims.statusRejected', '已驳回') },
                      CANCELLED: { bg: 'rgba(107, 114, 128, 0.15)', text: '#9ca3af', label: t('claims.statusCancelled', '已撤回') }
                    };
                    const curStatus = statusColors[claim.status] || statusColors.SUBMITTED;

                    return (
                      <Fragment key={claim.id}>
                        <tr
                          style={{
                            borderBottom: '1px solid var(--border-hairline)',
                            background: isSelected ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
                            cursor: 'pointer'
                          }}
                          onClick={() => setExpandedClaimId(isExpanded ? null : claim.id)}
                        >
                          {isOwner && (
                            <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                              {claim.status === 'APPROVED_PENDING_PAYOUT' && (
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedClaimIdsForBatch(prev => [...prev, claim.id]);
                                    } else {
                                      setSelectedClaimIdsForBatch(prev => prev.filter(id => id !== claim.id));
                                    }
                                  }}
                                />
                              )}
                            </td>
                          )}

                          <td style={{ padding: '10px' }}>
                            <div style={{ fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <i className={isExpanded ? "ph-bold ph-caret-down" : "ph-bold ph-caret-right"} style={{ color: 'var(--text-muted)' }}></i>
                              <span>{claim.title}</span>
                            </div>
                          </td>

                          <td style={{ padding: '10px' }}>
                            <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{claim.picName || claim.userName}</span>
                          </td>

                          <td style={{ padding: '10px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                            {claim.claimMonth}
                          </td>

                          <td style={{ padding: '10px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                            {(claim.items || []).length} {t('claims.unitItem', '项')}
                          </td>

                          <td style={{ padding: '10px', textAlign: 'right', fontWeight: '800', fontFamily: 'monospace', color: 'var(--accent-emerald)' }}>
                            MYR {Number(claim.totalAmount || 0).toFixed(2)}
                          </td>

                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)' }}>
                              {claim.payoutChannel === 'PAYROLL' ? t('claims.channelPayrollShort', '随薪') : t('claims.channelBatchShort', '批次')}
                            </span>
                          </td>

                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            <span style={{
                              fontSize: '11px',
                              fontWeight: '600',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: curStatus.bg,
                              color: curStatus.text
                            }}>
                              {curStatus.label}
                            </span>
                          </td>

                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            {hasWarning ? (
                              <span style={{ color: 'var(--accent-red)', fontSize: '14px' }} title={t('claims.tipWarning', '该单据存在疑似重复或超额警告')}>
                                <i className="ph-bold ph-warning-circle"></i>
                              </span>
                            ) : (
                              <span style={{ color: 'var(--accent-emerald)', fontSize: '14px' }} title={t('claims.tipCompliant', '合规')}>
                                <i className="ph-bold ph-check"></i>
                              </span>
                            )}
                          </td>

                          <td style={{ padding: '10px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                              {/* 初审按钮 (Manager 或 Owner) */}
                              {claim.status === 'SUBMITTED' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => onApproveManager && onApproveManager(claim)}
                                    className="btn btn-xs btn-primary"
                                    style={{ fontSize: '11px', padding: '3px 8px' }}
                                  >
                                    {t('claims.actionApproveManager', '初审通过')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setClaimToReject(claim);
                                      setClaimRejectReason('');
                                      setClaimRejectModalOpen(true);
                                    }}
                                    className="btn btn-xs btn-ghost"
                                    style={{ fontSize: '11px', padding: '3px 6px', color: '#f87171' }}
                                  >
                                    {t('claims.actionReject', '驳回')}
                                  </button>
                                </>
                              )}

                              {/* 终审按钮 (Owner 专属) */}
                              {claim.status === 'MANAGER_APPROVED' && isOwner && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => onApproveFinance && onApproveFinance(claim)}
                                    className="btn btn-xs"
                                    style={{
                                      fontSize: '11px', padding: '3px 8px',
                                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                      color: '#fff', border: 'none', fontWeight: '700'
                                    }}
                                  >
                                    {t('claims.actionApproveFinance', '终审批准')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setClaimToReject(claim);
                                      setClaimRejectReason('');
                                      setClaimRejectModalOpen(true);
                                    }}
                                    className="btn btn-xs btn-ghost"
                                    style={{ fontSize: '11px', padding: '3px 6px', color: '#f87171' }}
                                  >
                                    {t('claims.actionReject', '驳回')}
                                  </button>
                                </>
                              )}

                              {claim.status === 'PAID' && (
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                  {claim.payoutBatchId ? `${t('claims.batchPrefix', '批次')}: ${claim.payoutBatchId.slice(-6)}` : t('claims.statusSettledShort', '已结清')}
                                </span>
                              )}

                              {claim.status === 'LOCKED_IN_PAYROLL' && (
                                <span style={{ fontSize: '11px', color: '#a78bfa' }}>
                                  {claim.payrollPeriod ? `${t('claims.lockPrefix', '锁定')}: ${claim.payrollPeriod}` : t('claims.statusLockedShort', '已入薪')}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Expanded Row Detail */}
                        {isExpanded && (
                          <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
                            <td colSpan={isOwner ? 10 : 9} style={{ padding: '12px 16px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)' }}>
                                  {t('claims.lineItemsTitle', '费用明细行列表')} ({claim.items?.length || 0}):
                                </div>
                                {(claim.items || []).map((it, idx) => (
                                  <div
                                    key={idx}
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      padding: '8px 12px',
                                      background: 'rgba(255, 255, 255, 0.02)',
                                      borderRadius: '6px',
                                      border: '1px solid rgba(255, 255, 255, 0.05)',
                                      fontSize: '12px'
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                      <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>#{idx + 1}</span>
                                      <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{it.merchantName}</span>
                                      <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)' }}>
                                        {it.category}
                                      </span>
                                      {it.invoiceNo && (
                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t('claims.invoiceNoLabel', '单号')}: {it.invoiceNo}</span>
                                      )}
                                      {it.ocrExtracted && (
                                        <span style={{ fontSize: '10px', color: 'var(--accent-emerald)', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '3px' }}><i className="ph-bold ph-scan"></i>AI OCR</span>
                                      )}
                                      {it.notes && (
                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>({it.notes})</span>
                                      )}
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                      {it.warnings && it.warnings.length > 0 && (
                                        <span style={{ fontSize: '11px', color: 'var(--accent-red)', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                          <i className="ph-bold ph-warning"></i>{it.warnings.join(', ')}
                                        </span>
                                      )}
                                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{it.receiptDate}</span>
                                      <span style={{ fontWeight: '800', fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                                        MYR {Number(it.amount || 0).toFixed(2)}
                                      </span>
                                    </div>
                                  </div>
                                ))}

                                {claim.rejection && (
                                  <div style={{ padding: '8px 12px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', fontSize: '12px' }}>
                                    <strong>{t('claims.rejectionRecord', '驳回记录')}:</strong> {t('claims.rejectedByPrefix', '由')} {claim.rejection.rejectedByName} {t('claims.rejectedAtPrefix', '在')} {claim.rejection.rejectedAt?.slice(0, 16)} {t('claims.rejectedReasonPrefix', '驳回。理由:')} {claim.rejection.reason}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </DraggableTableWrapper>
          )}
        </div>
      </div>

      {/* Rejection Modal */}
      {claimRejectModalOpen && claimToReject && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div className="bezel-shell" style={{ width: '100%', maxWidth: '440px' }}>
            <div className="bezel-core" style={{ padding: '20px', background: 'var(--card-bg)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                  <i className="ph-bold ph-x-circle"></i>
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '15px', fontWeight: '700' }}>{t('claims.rejectModalTitle', '驳回报销单')}</h4>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{claimToReject.title}</div>
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  {t('claims.rejectReasonRequired', '驳回原因与修改指示')} <span style={{ color: 'var(--accent-red)' }}>*</span>
                </label>
                <textarea
                  rows={3}
                  value={claimRejectReason}
                  onChange={(e) => setClaimRejectReason(e.target.value)}
                  placeholder={t('claims.rejectReasonPlaceholder', '请输入明确的驳回原因或补正要求...')}
                  className="input"
                  style={{ width: '100%', resize: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  disabled={isRejecting}
                  className="btn btn-ghost btn-sm"
                  onClick={() => setClaimRejectModalOpen(false)}
                >
                  {t('claims.cancelBtn', '取消')}
                </button>
                <button
                  type="button"
                  disabled={isRejecting}
                  className="btn btn-sm"
                  style={{ background: '#ef4444', color: '#fff', border: 'none', fontWeight: '700' }}
                  onClick={handleConfirmReject}
                >
                  {t('claims.actionReject', '确认驳回')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
