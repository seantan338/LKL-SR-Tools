'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../lib/i18n-context';
import { useFeedback } from '../lib/feedback-context';
import { FirestoreStore } from '../lib/firestore-store';
import { 
  DEFAULT_COMMISSION_CONFIG, 
  resolveEffectiveRule, 
  calculateDealCommission, 
  parseSalaryNumber, 
  formatCommissionCurrency 
} from '../lib/commission-engine';

export default function CommissionDealModal({
  isOpen,
  onClose,
  candidate,
  teamId,
  currentUser,
  teamMembers = [],
  jobOrders = [],
  onConfirmDeal,
  onSkipCommission
}) {
  const { t, lang } = useI18n();
  const isEn = lang === 'en';
  const { showToast } = useFeedback();
  const [mounted, setMounted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [teamConfig, setTeamConfig] = useState(DEFAULT_COMMISSION_CONFIG);

  // Form State
  const [onboardDate, setOnboardDate] = useState('');
  const [salaryInput, setSalaryInput] = useState('');
  const [billingMode, setBillingMode] = useState('DIRECT_FLAT');
  const [flatCommissionAmount, setFlatCommissionAmount] = useState(500);
  const [agencyFlatFee, setAgencyFlatFee] = useState(2000);
  const [agencyFlatRate, setAgencyFlatRate] = useState(20);
  const [billingMonths, setBillingMonths] = useState(12);
  const [agencyFeeRate, setAgencyFeeRate] = useState(15);
  const [recruiterRate, setRecruiterRate] = useState(20);
  const [guaranteeDays, setGuaranteeDays] = useState(90);
  const [userSplits, setUserSplits] = useState([]);

  // Manual Supervisor Override State
  const [manualPoolAmount, setManualPoolAmount] = useState(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [isOverrideMode, setIsOverrideMode] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Subscribe to team commission config
  useEffect(() => {
    if (!teamId) return;
    const unsub = FirestoreStore.subscribeToCommissionConfig(teamId, (cfg) => {
      if (cfg) setTeamConfig(cfg);
    });
    return () => unsub();
  }, [teamId]);

  // Find matched job order
  const matchedJobOrder = useMemo(() => {
    if (!candidate || !Array.isArray(jobOrders)) return null;
    if (candidate.jobOrderId) {
      const found = jobOrders.find(j => j.id === candidate.jobOrderId);
      if (found) return found;
    }
    const cCompany = (candidate.company || '').trim().toLowerCase();
    const cPos = (candidate.position || '').trim().toLowerCase();
    if (!cCompany && !cPos) return null;
    return jobOrders.find(j => 
      (j.company || '').trim().toLowerCase() === cCompany &&
      (j.position || '').trim().toLowerCase() === cPos
    ) || null;
  }, [candidate, jobOrders]);

  // Resolve effective rule (Team default + Job order override)
  const effectiveRule = useMemo(() => {
    return resolveEffectiveRule(teamConfig, matchedJobOrder?.commissionOverride);
  }, [teamConfig, matchedJobOrder]);

  // Initialize form when modal opens
  useEffect(() => {
    if (!isOpen || !candidate) return;

    const todayStr = new Date().toISOString().split('T')[0];
    setOnboardDate(candidate.onboardDate || todayStr);
    
    const initialSalary = candidate.offered || candidate.salary || matchedJobOrder?.salary || '';
    setSalaryInput(initialSalary);

    setBillingMode(effectiveRule.billingMode || 'DIRECT_FLAT');
    setFlatCommissionAmount(effectiveRule.flatCommissionAmount ?? 500);
    setAgencyFlatFee(effectiveRule.agencyFlatFee ?? 2000);
    setAgencyFlatRate(effectiveRule.agencyFlatRate ?? 20);
    setBillingMonths(effectiveRule.billingMonths ?? 12);
    setAgencyFeeRate(effectiveRule.agencyFeeRate ?? 15);
    setRecruiterRate(effectiveRule.recruiterRate ?? 20);
    setGuaranteeDays(effectiveRule.guaranteeDays ?? 90);

    // Build initial splits
    // Match primary recruiter from candidate.assignedTo or picName
    let primaryUid = candidate.assignedTo || currentUser?.uid || '';
    let primaryName = candidate.picName || currentUser?.displayName || 'Delivery Recruiter';

    const defaultRoles = effectiveRule.splits || DEFAULT_COMMISSION_CONFIG.defaultSplits;
    const initialSplits = defaultRoles.map((roleDef, idx) => {
      if (idx === 0) {
        return {
          uid: primaryUid,
          displayName: primaryName,
          role: roleDef.roleId || 'delivery',
          roleLabel: isEn ? roleDef.labelEn : roleDef.labelZh,
          ratio: roleDef.ratio
        };
      }
      return {
        uid: '',
        displayName: '',
        role: roleDef.roleId || 'bd',
        roleLabel: isEn ? roleDef.labelEn : roleDef.labelZh,
        ratio: roleDef.ratio
      };
    });

    setUserSplits(initialSplits);
    setManualPoolAmount(null);
    setOverrideReason('');
    setIsOverrideMode(false);
  }, [isOpen, candidate, effectiveRule, currentUser, isEn]);

  if (!mounted || !isOpen || !candidate) return null;

  // Real-time calculation
  const calculatedResult = calculateDealCommission({
    salary: salaryInput,
    onboardDate,
    billingMode,
    flatCommissionAmount: manualPoolAmount !== null ? manualPoolAmount : flatCommissionAmount,
    agencyFlatFee,
    agencyFlatRate,
    billingMonths,
    agencyFeeRate,
    recruiterRate,
    guaranteeDays
  }, effectiveRule, userSplits);

  const activeTotalPool = manualPoolAmount !== null ? manualPoolAmount : calculatedResult.totalCommissionPool;
  const isRuleOverridden = isOverrideMode || manualPoolAmount !== null || effectiveRule.isJobOverridden;

  const handleSplitMemberSelect = (index, selectedUid) => {
    const member = teamMembers.find(m => m.uid === selectedUid);
    const updated = [...userSplits];
    updated[index] = {
      ...updated[index],
      uid: selectedUid,
      displayName: member ? (member.displayName || member.email) : ''
    };
    setUserSplits(updated);
  };

  const handleSplitRatioChange = (index, newRatio) => {
    const updated = [...userSplits];
    updated[index] = { ...updated[index], ratio: parseFloat(newRatio) || 0 };
    setUserSplits(updated);
  };

  const handleSplitAmountChange = (index, newAmount) => {
    setIsOverrideMode(true);
    const updated = [...userSplits];
    updated[index] = { ...updated[index], amount: parseFloat(newAmount) || 0 };
    setUserSplits(updated);
  };

  const handleAddSplitRole = () => {
    const newRole = {
      uid: '',
      displayName: '',
      role: `role_${Date.now()}`,
      roleLabel: isEn ? 'Collaborator' : '协作顾问',
      ratio: 0
    };
    setUserSplits([...userSplits, newRole]);
  };

  const handleRemoveSplitRole = (index) => {
    if (userSplits.length <= 1) return;
    setUserSplits(userSplits.filter((_, i) => i !== index));
  };

  const totalSplitRatio = userSplits.reduce((acc, s) => acc + (Number(s.ratio) || 0), 0);
  const isRatioValid = Math.abs(totalSplitRatio - 100) < 0.1 || userSplits.some(s => s.amount !== undefined);

  // Submit deal
  const handleSubmit = async () => {
    if (!isRatioValid) {
      showToast(t('commission.splitRatioMustBe100', `分成角色比例总和必须为 100% (当前为 ${totalSplitRatio}%)`), 'error');
      return;
    }

    if (isOverrideMode && !overrideReason.trim()) {
      showToast(t('commission.overrideReasonRequired', '人工特批改派偏离系统规则，必须填写调整原因以便审计留痕'), 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      const dealData = {
        candidateId: candidate.id,
        candidateName: candidate.name,
        jobOrderId: matchedJobOrder?.id || candidate.jobOrderId || '',
        companyName: candidate.company || matchedJobOrder?.company || 'N/A',
        position: candidate.position || matchedJobOrder?.position || 'N/A',
        onboardDate,
        guaranteeDays: parseInt(guaranteeDays, 10) || 0,
        unlockDate: calculatedResult.unlockDate,
        status: calculatedResult.status,
        billingSnapshot: {
          ...calculatedResult.billingSnapshot,
          totalCommissionPool: activeTotalPool
        },
        splits: calculatedResult.splits.map((s, idx) => ({
          ...s,
          displayName: userSplits[idx]?.displayName || s.displayName,
          role: userSplits[idx]?.role || s.role
        })),
        isOverridden: Boolean(isOverrideMode || manualPoolAmount !== null),
        overrideReason: isOverrideMode ? overrideReason.trim() : '',
        overrideBy: currentUser?.displayName || currentUser?.email || 'supervisor',
        overrideAt: isOverrideMode ? new Date().toISOString() : null
      };

      await onConfirmDeal(dealData);
      onClose();
    } catch (err) {
      console.error('Failed to confirm deal commission:', err);
      showToast(t('commission.dealSubmitFailed', '成单核定失败，请稍后重试: ') + (err.message || err), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        className="bezel-shell modal-bezel"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '820px', width: '100%', animation: 'modalEnter 0.25s ease-out' }}
      >
        <div
          className="bezel-core modal-core"
          style={{
            padding: 'var(--space-6)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-5)',
            maxHeight: '92vh',
            overflowY: 'auto'
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-hairline)', paddingBottom: 'var(--space-4)' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10B981', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
                  🎉 {t('commission.dealCelebration', '成单入职核定')}
                </span>
                {effectiveRule.isJobOverridden && (
                  <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent-blue)', borderColor: 'rgba(59, 130, 246, 0.3)' }}>
                    🎯 {t('commission.jobOverrideActive', '职位专属规则生效')}
                  </span>
                )}
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>
                {candidate.name} ➔ {candidate.company || t('commission.unnamedCompany', '录用企业')}
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                {candidate.position || t('commission.unnamedPosition', '入职岗位')} · {t('commission.modalDesc', '系统已根据生效规则预计算佣金池，支持主管特批调整与多人拆单')}
              </p>
            </div>
            <button className="btn-icon" onClick={onClose} title={t('common.close', '关闭')}>
              <i className="ph-bold ph-x" style={{ fontSize: '1.2rem' }}></i>
            </button>
          </div>

          {/* Deal Metadata Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', background: 'var(--bg-subtle, rgba(255,255,255,0.03))', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>
                📅 {t('commission.onboardDateLabel', '正式入职到岗日期')} *
              </label>
              <input
                type="date"
                className="form-control"
                value={onboardDate}
                onChange={(e) => setOnboardDate(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>
                🔒 {t('commission.guaranteeDaysLabelShort', '保证期 (天)')}
              </label>
              <input
                type="number"
                className="form-control"
                min="0"
                value={guaranteeDays}
                onChange={(e) => {
                  setGuaranteeDays(e.target.value);
                  setIsOverrideMode(true);
                }}
              />
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                {guaranteeDays > 0 ? `${t('commission.unlockDate', '预计解锁日')}: ${calculatedResult.unlockDate}` : t('commission.instantUnlock', '秒级解锁 (0天)')}
              </div>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>
                ⚙️ {t('commission.billingModeLabel', '计费模式')}
              </label>
              <select
                className="form-control"
                value={billingMode}
                onChange={(e) => {
                  setBillingMode(e.target.value);
                  setIsOverrideMode(true);
                }}
              >
                <option value="DIRECT_FLAT">{t('commission.modeDirectFlat', '按单固定佣金')}</option>
                <option value="AGENCY_FLAT">{t('commission.modeAgencyFlat', '固定服务费 + 提成')}</option>
                <option value="PERCENTAGE">{t('commission.modePercentage', '薪资百分比模式')}</option>
              </select>
            </div>

            {billingMode === 'PERCENTAGE' && (
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem' }}>
                  💰 {t('commission.candidateSalaryLabel', '核定月薪 (RM)')}
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="如 RM 5,000"
                  value={salaryInput}
                  onChange={(e) => setSalaryInput(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Commission Pool Hero Box */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(16, 185, 129, 0.12) 100%)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: 'var(--radius-lg)',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px'
          }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {t('commission.totalPoolTitle', '本单总佣金池 (COMMISSION POOL)')}
              </div>
              <div style={{ fontSize: '1.8rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{formatCommissionCurrency(activeTotalPool, effectiveRule.currency)}</span>
                {isRuleOverridden && (
                  <span className="badge" style={{ fontSize: '0.7rem', color: 'var(--accent-amber)', borderColor: 'rgba(245, 158, 11, 0.4)' }}>
                    {t('commission.overriddenBadge', '人工特批调整')}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                {billingMode === 'DIRECT_FLAT' && `${t('commission.directFlatFormula', '固定单笔分配')} · RM ${flatCommissionAmount}`}
                {billingMode === 'AGENCY_FLAT' && `${t('commission.agencyFlatFormula', '客户服务费')} RM ${agencyFlatFee} × ${agencyFlatRate}%`}
                {billingMode === 'PERCENTAGE' && `${t('commission.percentageFormula', '薪资')} RM ${parseSalaryNumber(salaryInput)} × ${billingMonths}m × ${agencyFeeRate}% × ${recruiterRate}%`}
              </div>
            </div>

            {/* Quick Supervisor Custom Override */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{t('commission.manualOverrideAmount', '特批总金额')}:</span>
                <input
                  type="number"
                  className="form-control"
                  style={{ width: '130px', fontSize: '0.88rem', fontWeight: '700', textAlign: 'right' }}
                  placeholder="输入特批金额"
                  value={manualPoolAmount !== null ? manualPoolAmount : ''}
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : parseFloat(e.target.value) || 0;
                    setManualPoolAmount(val);
                    if (val !== null) setIsOverrideMode(true);
                  }}
                />
              </div>
              {manualPoolAmount !== null && (
                <button
                  type="button"
                  className="btn-text"
                  onClick={() => setManualPoolAmount(null)}
                  style={{ fontSize: '0.72rem', color: 'var(--accent-blue)', cursor: 'pointer' }}
                >
                  {t('commission.revertToAuto', '恢复系统自动计算')}
                </button>
              )}
            </div>
          </div>

          {/* Section: Split Allocation Among Recruiters */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div>
                <h4 style={{ fontSize: '0.92rem', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)' }}>
                  <i className="ph-bold ph-users-three" style={{ color: 'var(--accent-blue)' }}></i>
                  <span>{t('commission.splitAllocationTitle', '顾问分成拆单明细')}</span>
                </h4>
                <div style={{ fontSize: '0.76rem', color: isRatioValid ? 'var(--text-muted)' : '#EF4444' }}>
                  {t('commission.splitRatioSum', '分成比例总计')}: <strong>{totalSplitRatio}%</strong>
                </div>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleAddSplitRole}
                style={{ fontSize: '0.76rem', padding: '3px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <i className="ph-bold ph-plus"></i> {t('commission.addCollaborator', '添加协作人')}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {userSplits.map((split, idx) => {
                const calculatedAmount = calculatedResult.splits[idx]?.amount || 0;
                return (
                  <div
                    key={idx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.2fr 1.5fr 110px 140px 36px',
                      gap: '8px',
                      alignItems: 'center',
                      background: 'var(--bg-subtle, rgba(255,255,255,0.02))',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-hairline)'
                    }}
                  >
                    {/* Role Label */}
                    <div style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
                      {split.roleLabel || split.role || `Role ${idx + 1}`}
                    </div>

                    {/* Member Select Dropdown */}
                    <div>
                      <select
                        className="form-control"
                        style={{ fontSize: '0.82rem' }}
                        value={split.uid || ''}
                        onChange={(e) => handleSplitMemberSelect(idx, e.target.value)}
                      >
                        <option value="">{t('commission.selectRecruiter', '-- 指派顾问 --')}</option>
                        {teamMembers.map(m => (
                          <option key={m.uid} value={m.uid}>
                            {m.displayName || m.email} ({m.role || 'recruiter'})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Ratio Input */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input
                        type="number"
                        className="form-control"
                        style={{ fontSize: '0.82rem', textAlign: 'right' }}
                        min="0"
                        max="100"
                        value={split.ratio}
                        onChange={(e) => handleSplitRatioChange(idx, e.target.value)}
                      />
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>%</span>
                    </div>

                    {/* Actual Calculated / Overridden Amount */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>RM</span>
                      <input
                        type="number"
                        className="form-control"
                        style={{ fontSize: '0.82rem', textAlign: 'right', fontWeight: '600' }}
                        value={split.amount !== undefined ? split.amount : calculatedAmount}
                        onChange={(e) => handleSplitAmountChange(idx, e.target.value)}
                      />
                    </div>

                    {/* Remove Action */}
                    <button
                      type="button"
                      className="btn-icon"
                      disabled={userSplits.length <= 1}
                      onClick={() => handleRemoveSplitRole(idx)}
                      style={{ color: userSplits.length <= 1 ? 'var(--text-muted)' : '#EF4444' }}
                    >
                      <i className="ph-bold ph-trash"></i>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section: Override Reason (Mandatory when overridden) */}
          {isRuleOverridden && (
            <div style={{
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 14px'
            }}>
              <label className="form-label" style={{ color: 'var(--accent-amber)', fontWeight: '700', fontSize: '0.82rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="ph-bold ph-shield-warning"></i>
                <span>{t('commission.auditReasonTitle', '主管特批调整原因 (强制审计留痕)')} *</span>
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="例如：客户回款协商特批折扣 / 跨部门联合寻访特批拆单"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                style={{ fontSize: '0.84rem' }}
              />
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                {t('commission.auditReasonHint', '本操作将作为不可篡改审计记录永久留存于系统日志。')}
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-hairline)', paddingTop: 'var(--space-4)' }}>
            {onSkipCommission ? (
              <button
                type="button"
                className="btn-text"
                onClick={onSkipCommission}
                disabled={isSubmitting}
                style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textDecoration: 'underline' }}
              >
                {t('commission.skipCommissionLink', '仅推进流转，暂不建佣金单')}
              </button>
            ) : <div />}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={onClose}
                disabled={isSubmitting}
              >
                {t('common.cancel', '取消')}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSubmit}
                disabled={isSubmitting || !isRatioValid}
                style={{ minWidth: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                {isSubmitting ? (
                  <i className="ph-bold ph-spinner ph-spin"></i>
                ) : (
                  <i className="ph-bold ph-check-circle"></i>
                )}
                <span>{t('commission.confirmDealBtn', '确认成单并建立台账')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
