'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useAuth } from '../../../lib/auth-context';
import { useI18n } from '../../../lib/i18n-context';
import { useFeedback } from '../../../lib/feedback-context';
import { FirestoreStore } from '../../../lib/firestore-store';
import { ExcelExporter } from '../../../lib/excel-exporter';
import ExpenseClaimModal from '../../../components/ExpenseClaimModal';
import ExpenseClaimsAnalyticsTab from '../../../components/ExpenseClaimsAnalyticsTab';

const HQ_TEAM_ID = 'default_team';

const getCurrentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export default function ClaimsPage() {
  const router = useRouter();
  const { user, role, isHqTeam, isOwner, isManager, userProfile } = useAuth();
  const { t, lang } = useI18n();
  const { showToast } = useFeedback();

  const isAdmin = Boolean(isOwner || isManager);

  const [activeTab, setActiveTab] = useState('mine'); // 'mine' | 'team'
  const [claims, setClaims] = useState([]);
  const [claimsLoading, setClaimsLoading] = useState(true);
  const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);
  const [expandedMyClaimId, setExpandedMyClaimId] = useState(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMonth, setExportMonth] = useState(getCurrentMonth);

  const exportMonthOptions = useMemo(() => {
    const list = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      list.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return list;
  }, []);

  // URL 深链接：?tab=team / ?action=new
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'team' && isAdmin) setActiveTab('team');
    if (params.get('action') === 'new') setIsClaimModalOpen(true);
  }, [isAdmin]);

  // 订阅报销单（管理层返回全团队，普通员工仅返回本人）
  useEffect(() => {
    if (!isHqTeam || !user?.uid) {
      setClaimsLoading(false);
      return;
    }
    setClaimsLoading(true);
    const unsub = FirestoreStore.subscribeExpenseClaims(HQ_TEAM_ID, role, user.uid, (data) => {
      setClaims(data || []);
      setClaimsLoading(false);
    });
    return () => unsub();
  }, [isHqTeam, role, user?.uid]);

  const myClaims = useMemo(
    () => claims.filter((c) => c.userId === user?.uid),
    [claims, user?.uid]
  );

  const myStats = useMemo(() => {
    const month = getCurrentMonth();
    const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
    const monthApplied = myClaims
      .filter((c) => c.claimMonth === month && c.status !== 'CANCELLED' && c.status !== 'REJECTED')
      .reduce((acc, c) => acc + (Number(c.totalAmount) || 0), 0);
    const pendingCount = myClaims.filter((c) =>
      ['SUBMITTED', 'MANAGER_APPROVED', 'APPROVED_PENDING_PAYOUT'].includes(c.status)
    ).length;
    const settled = myClaims
      .filter((c) => c.status === 'PAID' || c.status === 'LOCKED_IN_PAYROLL')
      .reduce((acc, c) => acc + (Number(c.totalAmount) || 0), 0);
    const rejectedCount = myClaims.filter((c) => c.status === 'REJECTED').length;
    return {
      monthApplied: round2(monthApplied),
      pendingCount,
      settled: round2(settled),
      rejectedCount
    };
  }, [myClaims]);

  const statusMeta = {
    SUBMITTED: { bg: 'rgba(245, 158, 11, 0.15)', text: 'var(--accent-amber)', label: t('claims.statusSubmitted', '待主管初审') },
    MANAGER_APPROVED: { bg: 'rgba(59, 130, 246, 0.15)', text: 'var(--accent-blue)', label: t('claims.statusManagerApproved', '待财务终审') },
    APPROVED_PENDING_PAYOUT: { bg: 'rgba(16, 185, 129, 0.15)', text: 'var(--accent-emerald)', label: t('claims.statusApprovedPendingPayout', '已批准 · 待放款') },
    PAID: { bg: 'rgba(16, 185, 129, 0.25)', text: '#10b981', label: t('claims.statusPaid', '已放款结清') },
    LOCKED_IN_PAYROLL: { bg: 'rgba(139, 92, 246, 0.2)', text: '#a78bfa', label: t('claims.statusLockedInPayroll', '已并入薪资单锁定') },
    REJECTED: { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', label: t('claims.statusRejected', '已驳回') },
    CANCELLED: { bg: 'rgba(107, 114, 128, 0.15)', text: '#9ca3af', label: t('claims.statusCancelled', '已撤回') }
  };

  // ---------- Actions ----------
  const handleCancelClaim = async (claim) => {
    try {
      setIsCancelling(true);
      await FirestoreStore.updateExpenseClaimStatus(HQ_TEAM_ID, user, claim.id, 'CANCELLED', {
        title: claim.title
      });
      showToast(t('claims.toastCancelSuccess', '报销单已成功撤回'), 'success');
    } catch (err) {
      showToast(`${t('claims.toastCancelFailed', '撤回失败')}: ${err.message}`, 'error');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleManagerApproveClaim = async (claim) => {
    try {
      await FirestoreStore.updateExpenseClaimStatus(HQ_TEAM_ID, user, claim.id, 'MANAGER_APPROVED', {
        title: claim.title,
        note: '主管初审通过，流转至财务/Owner终审 / Manager approved'
      });
      showToast(t('claims.toastManagerApproved', '初审通过，已流转至财务/Owner终审'), 'success');
    } catch (err) {
      showToast(`${t('claims.toastManagerFailed', '初审失败')}: ${err.message}`, 'error');
    }
  };

  const handleFinanceApproveClaim = async (claim) => {
    try {
      await FirestoreStore.updateExpenseClaimStatus(HQ_TEAM_ID, user, claim.id, 'APPROVED_PENDING_PAYOUT', {
        title: claim.title,
        note: '财务终审批准，进入待放款资金池 / Final approval granted'
      });
      showToast(t('claims.toastFinanceApproved', '终审批准，已进入待放款资金池'), 'success');
    } catch (err) {
      showToast(`${t('claims.toastFinanceFailed', '终审失败')}: ${err.message}`, 'error');
    }
  };

  const handleExecuteBatch = async (type, selectedIds) => {
    const claimIds = Array.isArray(selectedIds) ? selectedIds : [];
    if (!claimIds.length) return;
    // 失败时异常向上抛出，由审批台组件统一提示并保留勾选状态
    const batchTitle = type === 'PAYROLL'
      ? `${exportMonth === 'all' ? getCurrentMonth() : exportMonth} 薪资随薪发放报销批次 / Payroll claims batch`
      : `批次放款 / Batch payout - ${new Date().toISOString().slice(0, 10)}`;

    await FirestoreStore.createClaimPayoutBatch(HQ_TEAM_ID, user, {
      batchTitle,
      claimIds,
      payoutChannel: type,
      payrollPeriod: type === 'PAYROLL' ? (exportMonth !== 'all' ? exportMonth : getCurrentMonth()) : null
    });
    showToast(
      type === 'PAYROLL'
        ? t('claims.toastPayrollSuccess', '已成功并入薪资单锁定')
        : t('claims.toastBatchSuccess', '放款批次生成成功，已结清'),
      'success'
    );
  };

  const handleExportReport = async () => {
    if (claims.length === 0) {
      showToast(t('claims.exportEmpty', '当前无可导出的报销数据'), 'error');
      return;
    }
    try {
      setIsExporting(true);
      let teamMembers = [];
      try {
        const snap = await getDocs(collection(db, 'users'));
        teamMembers = snap.docs.map((d) => ({
          id: d.id,
          uid: d.id,
          ...d.data(),
          name: d.data().displayName || d.data().name || (d.data().email ? d.data().email.split('@')[0] : '')
        }));
      } catch (e) {
        console.warn('[claims] load members for export failed:', e);
      }
      await ExcelExporter.exportExpenseClaimsReport({
        claims,
        teamMembers,
        monthStr: exportMonth === 'all' ? '' : exportMonth,
        locale: lang
      });
      showToast(t('claims.exportSuccess', '报销财务对账表导出成功'), 'success');
    } catch (err) {
      console.error('Failed to export claims Excel:', err);
      showToast(`${t('claims.exportFailed', '导出报销报表失败')}: ${err.message}`, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  // ---------- Non-HQ gate ----------
  if (!isHqTeam) {
    return (
      <div className="page-view active" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
        <div className="bezel-shell" style={{ maxWidth: '420px', width: '100%' }}>
          <div className="bezel-core" style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
            <i className="ph-bold ph-lock-key" style={{ fontSize: '36px', color: 'var(--accent-amber)' }}></i>
            <h3 style={{ margin: '12px 0 6px', fontSize: '16px' }}>{t('claims.moduleTitle', '费用与报销')}</h3>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
              公司本部 (HQ) 专属功能 / HQ members only
            </p>
          </div>
        </div>
      </div>
    );
  }

  const statCards = [
    { icon: 'ph-calendar-check', color: 'var(--accent-blue)', label: t('claims.myStatMonthApplied', '本月已申请'), value: `MYR ${myStats.monthApplied.toFixed(2)}`, mono: true },
    { icon: 'ph-hourglass-simple', color: 'var(--accent-amber)', label: t('claims.myStatPending', '审批中'), value: myStats.pendingCount, unit: t('claims.myStatUnit', '笔') },
    { icon: 'ph-check-circle', color: '#a78bfa', label: t('claims.myStatSettled', '累计已结清'), value: `MYR ${myStats.settled.toFixed(2)}`, mono: true },
    { icon: 'ph-x-circle', color: '#f87171', label: t('claims.myStatRejected', '已驳回'), value: myStats.rejectedCount, unit: t('claims.myStatUnit', '笔') }
  ];

  return (
    <div className="page-view active" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', paddingBottom: 'var(--space-6)' }}>
      {/* Top bar: tabs + actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{
          display: 'flex',
          gap: '4px',
          background: 'var(--input-bg)',
          padding: '3px',
          borderRadius: 'var(--radius-full)',
          border: '1px solid var(--border-interactive)'
        }}>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'mine' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ border: 'none', gap: '6px' }}
            onClick={() => setActiveTab('mine')}
          >
            <i className="ph-bold ph-receipt"></i>
            {t('claims.tabMine', '我的报销单')}
          </button>
          {isAdmin && (
            <button
              type="button"
              className={`btn btn-sm ${activeTab === 'team' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ border: 'none', gap: '6px' }}
              onClick={() => setActiveTab('team')}
            >
              <i className="ph-bold ph-bank"></i>
              {t('claims.tabTeam', '审批与放款总台')}
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {isAdmin && activeTab === 'team' && (
            <>
              <select
                value={exportMonth}
                onChange={(e) => setExportMonth(e.target.value)}
                className="select"
                style={{ height: '32px', fontSize: '12px' }}
                title={t('claims.exportReportBtn', '导出报销对账表')}
              >
                <option value="all">全部月份 (All Months)</option>
                {exportMonthOptions.map((ym) => (
                  <option key={ym} value={ym}>{ym}</option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ height: '32px', fontSize: '12px', gap: '6px', borderColor: 'rgba(16, 185, 129, 0.4)', color: 'var(--accent-emerald)' }}
                onClick={handleExportReport}
                disabled={isExporting}
              >
                <i className={isExporting ? 'ph-bold ph-spinner ph-spin' : 'ph-bold ph-file-arrow-down'}></i>
                <span>{isExporting ? '...' : t('claims.exportBtn', '导出对账表')}</span>
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn-sm btn-primary"
            style={{
              height: '32px',
              fontSize: '12px',
              gap: '6px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              border: 'none',
              color: '#fff',
              fontWeight: '700',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
            }}
            onClick={() => setIsClaimModalOpen(true)}
          >
            <i className="ph-bold ph-plus"></i>
            <span>{t('claims.newClaimBtn', '发起报销申请')}</span>
          </button>
        </div>
      </div>

      {/* ============ Tab: My Claims ============ */}
      {activeTab === 'mine' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
            {statCards.map((card) => (
              <div key={card.label} className="bezel-shell">
                <div className="bezel-core" style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: card.color, marginBottom: '8px', fontSize: '12px', fontWeight: '600' }}>
                    <i className={`ph-bold ${card.icon}`} style={{ fontSize: '18px' }}></i>
                    <span>{card.label}</span>
                  </div>
                  <div style={{ fontSize: card.mono ? '22px' : '26px', fontWeight: '800', fontFamily: 'monospace', color: card.color }}>
                    {card.value}
                    {card.unit && (
                      <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text-muted)', marginLeft: '4px' }}>{card.unit}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="bezel-shell">
            <div className="bezel-core" style={{ padding: 'var(--space-5)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-4)' }}>
                <i className="ph-bold ph-receipt" style={{ color: 'var(--accent-emerald)', fontSize: '16px' }}></i>
                <h4 style={{ fontSize: '14px', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>
                  {t('claims.tabMine', '我的报销单')}
                </h4>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'rgba(255, 255, 255, 0.05)', padding: '2px 8px', borderRadius: '4px' }}>
                  {myClaims.length}
                </span>
              </div>

              {claimsLoading ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                  <i className="ph-bold ph-spinner ph-spin" style={{ fontSize: '24px' }}></i>
                </div>
              ) : myClaims.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)' }}>
                  <i className="ph-bold ph-tray" style={{ fontSize: '36px', opacity: 0.5 }}></i>
                  <div style={{ marginTop: '10px', fontSize: '14px', color: 'var(--text-secondary)', fontWeight: '600' }}>
                    {t('claims.myEmpty', '您还没有提交过报销单')}
                  </div>
                  <div style={{ marginTop: '4px', fontSize: '12px' }}>
                    {t('claims.myEmptyHint', '点击右上角「发起报销申请」，拍照上传票据即可 AI 自动识别填单')}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {myClaims.map((claim) => {
                    const isExpanded = expandedMyClaimId === claim.id;
                    const meta = statusMeta[claim.status] || statusMeta.SUBMITTED;
                    const hasWarning = (claim.items || []).some((it) => it.warnings?.length > 0);
                    return (
                      <div
                        key={claim.id}
                        style={{
                          padding: '12px 14px',
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid var(--border-hairline)',
                          borderRadius: 'var(--radius-md)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px'
                        }}
                      >
                        <div
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', cursor: 'pointer' }}
                          onClick={() => setExpandedMyClaimId(isExpanded ? null : claim.id)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', minWidth: 0 }}>
                            <i className={isExpanded ? 'ph-bold ph-caret-down' : 'ph-bold ph-caret-right'} style={{ color: 'var(--text-muted)' }}></i>
                            <span style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '13px' }}>{claim.title}</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{claim.claimMonth}</span>
                            <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
                              {claim.payoutChannel === 'PAYROLL' ? t('claims.channelPayroll', '随薪') : t('claims.channelBatch', '批次')}
                            </span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              {t('claims.itemsCount', { count: (claim.items || []).length }, `${(claim.items || []).length} 项明细`)}
                            </span>
                            {hasWarning && (
                              <i className="ph-bold ph-warning-circle" style={{ color: 'var(--accent-red)' }} title="Risk warning"></i>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }} onClick={(e) => e.stopPropagation()}>
                            <span style={{ fontSize: '14px', fontWeight: '800', color: 'var(--accent-emerald)', fontFamily: 'monospace' }}>
                              MYR {Number(claim.totalAmount || 0).toFixed(2)}
                            </span>
                            <span style={{ fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: '4px', background: meta.bg, color: meta.text }}>
                              {meta.label}
                            </span>
                            {claim.status === 'SUBMITTED' && (
                              <button
                                type="button"
                                onClick={() => handleCancelClaim(claim)}
                                disabled={isCancelling}
                                className="btn btn-xs btn-ghost"
                                style={{ color: '#f87171', border: 'none', fontSize: '11px', gap: '4px' }}
                                title={t('claims.cancelHint', '初审前可自主撤回')}
                              >
                                <i className="ph-bold ph-x"></i>
                                <span>{t('claims.actionCancel', '撤回')}</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {isExpanded && (
                          <div style={{
                            marginTop: '4px',
                            padding: '10px 12px',
                            background: 'rgba(0, 0, 0, 0.25)',
                            borderRadius: '6px',
                            border: '1px solid rgba(255, 255, 255, 0.05)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px'
                          }}>
                            <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)' }}>
                              {t('claims.detailTitle', '费用明细')}
                            </div>
                            {(claim.items || []).map((it, i) => (
                              <div key={it.itemId || i} style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', paddingBottom: '6px', borderBottom: i < (claim.items.length - 1) ? '1px dashed var(--border-hairline)' : 'none' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>#{i + 1}</span>
                                    <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{it.merchantName || '-'}</span>
                                    <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
                                      {it.category}
                                    </span>
                                    {it.invoiceNo && (
                                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>#{it.invoiceNo}</span>
                                    )}
                                    {it.ocrExtracted && (
                                      <span style={{ fontSize: '10px', color: 'var(--accent-emerald)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                        <i className="ph-bold ph-scan"></i>OCR
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{it.receiptDate}</span>
                                    <span style={{ fontWeight: '700', fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                                      MYR {Number(it.amount || 0).toFixed(2)}
                                    </span>
                                  </div>
                                </div>
                                {it.mileageMeta && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '11px', flexWrap: 'wrap' }}>
                                    <i className="ph-bold ph-car-profile"></i>
                                    <span>
                                      {it.mileageMeta.origin} → {it.mileageMeta.destination} · {it.mileageMeta.distanceKm} km
                                      {' · '}RM {Number(it.mileageMeta.appliedRate || 0).toFixed(2)}/km
                                      {Number(it.mileageMeta.tollAmount) > 0 && ` · Toll ${Number(it.mileageMeta.tollAmount).toFixed(2)}`}
                                      {Number(it.mileageMeta.parkingAmount) > 0 && ` · Parking ${Number(it.mileageMeta.parkingAmount).toFixed(2)}`}
                                    </span>
                                  </div>
                                )}
                                {it.warnings && it.warnings.length > 0 && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-red)', fontSize: '11px' }}>
                                    <i className="ph-bold ph-warning"></i>
                                    <span>{it.warnings.join(', ')}</span>
                                  </div>
                                )}
                                {it.notes && (
                                  <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{it.notes}</div>
                                )}
                              </div>
                            ))}

                            {claim.rejection?.reason && (
                              <div style={{ padding: '8px 12px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', fontSize: '12px' }}>
                                <strong>{t('claims.rejectReasonLabel', '驳回原因')}:</strong> {claim.rejection.reason} ({claim.rejection.rejectedByName})
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ============ Tab: Team Approvals & Payouts ============ */}
      {isAdmin && activeTab === 'team' && (
        <ExpenseClaimsAnalyticsTab
          expenseClaims={claims}
          teamMembers={[]}
          isOwner={isOwner}
          isManager={isManager}
          teamId={HQ_TEAM_ID}
          user={user}
          exportMonth={exportMonth}
          exportMonthOptions={exportMonthOptions}
          onApproveManager={handleManagerApproveClaim}
          onApproveFinance={handleFinanceApproveClaim}
          onExecuteBatch={handleExecuteBatch}
          showToast={showToast}
        />
      )}

      {isClaimModalOpen && (
        <ExpenseClaimModal
          isOpen={isClaimModalOpen}
          onClose={() => setIsClaimModalOpen(false)}
          existingClaims={myClaims}
        />
      )}
    </div>
  );
}
