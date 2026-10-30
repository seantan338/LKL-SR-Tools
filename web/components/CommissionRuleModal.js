'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../lib/i18n-context';
import { useFeedback } from '../lib/feedback-context';
import { FirestoreStore } from '../lib/firestore-store';
import { DEFAULT_COMMISSION_CONFIG } from '../lib/commission-engine';

export default function CommissionRuleModal({ isOpen, onClose, teamId, userId, currentConfig }) {
  const { t, lang } = useI18n();
  const isEn = lang === 'en';
  const { showToast } = useFeedback();
  const [mounted, setMounted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form State initialized with defaults
  const [config, setConfig] = useState(DEFAULT_COMMISSION_CONFIG);
  const [enableTiers, setEnableTiers] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (currentConfig) {
      setConfig({
        ...DEFAULT_COMMISSION_CONFIG,
        ...currentConfig,
        defaultSplits: Array.isArray(currentConfig.defaultSplits) && currentConfig.defaultSplits.length > 0
          ? currentConfig.defaultSplits
          : DEFAULT_COMMISSION_CONFIG.defaultSplits,
        tiers: Array.isArray(currentConfig.tiers)
          ? currentConfig.tiers
          : DEFAULT_COMMISSION_CONFIG.tiers
      });
      setEnableTiers(Array.isArray(currentConfig.tiers) && currentConfig.tiers.length > 0);
    } else {
      setConfig(DEFAULT_COMMISSION_CONFIG);
      setEnableTiers(false);
    }
  }, [currentConfig, isOpen]);

  if (!mounted || !isOpen) return null;

  // Split management
  const handleSplitChange = (index, field, value) => {
    const updated = [...config.defaultSplits];
    updated[index] = { ...updated[index], [field]: value };
    setConfig({ ...config, defaultSplits: updated });
  };

  const handleAddSplit = () => {
    const newRole = {
      roleId: `role_${Date.now()}`,
      labelZh: isEn ? 'Sourcing Specialist' : '寻访/协助顾问',
      labelEn: 'Sourcing Specialist',
      ratio: 0
    };
    setConfig({ ...config, defaultSplits: [...config.defaultSplits, newRole] });
  };

  const handleRemoveSplit = (index) => {
    if (config.defaultSplits.length <= 1) {
      showToast(t('commission.atLeastOneSplitRole', '至少需要保留一个分成角色'), 'warning');
      return;
    }
    const updated = config.defaultSplits.filter((_, i) => i !== index);
    setConfig({ ...config, defaultSplits: updated });
  };

  // Tier management
  const handleTierChange = (index, field, value) => {
    const updated = [...config.tiers];
    updated[index] = { ...updated[index], [field]: value };
    setConfig({ ...config, tiers: updated });
  };

  const handleAddTier = () => {
    const lastTier = config.tiers[config.tiers.length - 1];
    const newTier = {
      threshold: (lastTier?.threshold || 0) + 30000,
      rate: (lastTier?.rate || 20) + 5,
      label: `Tier ${config.tiers.length + 1}`
    };
    setConfig({ ...config, tiers: [...config.tiers, newTier] });
  };

  const handleRemoveTier = (index) => {
    const updated = config.tiers.filter((_, i) => i !== index);
    setConfig({ ...config, tiers: updated });
  };

  // Split sum validation
  const totalSplitRatio = config.defaultSplits.reduce((acc, s) => acc + (Number(s.ratio) || 0), 0);
  const isRatioValid = Math.abs(totalSplitRatio - 100) < 0.1;

  // Save handler
  const handleSave = async () => {
    if (!teamId) return;
    if (!isRatioValid) {
      showToast(t('commission.splitRatioMustBe100', `分成角色比例总和必须为 100% (当前为 ${totalSplitRatio}%)`), 'error');
      return;
    }

    try {
      setIsSaving(true);
      const payload = {
        ...config,
        tiers: enableTiers ? config.tiers : []
      };
      await FirestoreStore.saveCommissionConfig(teamId, userId, payload);
      showToast(t('commission.rulesSavedSuccess', '团队佣金与激励规则配置已生效！'), 'success');
      onClose();
    } catch (err) {
      console.error('Failed to save commission config:', err);
      showToast(t('commission.rulesSavedFailed', '保存佣金规则失败，请检查网络或权限'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to default handler
  const handleReset = () => {
    setConfig(DEFAULT_COMMISSION_CONFIG);
    setEnableTiers(false);
    showToast(t('commission.resetToDefaultsNotice', '已恢复至系统默认模板，请点击保存生效'), 'info');
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
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
            maxHeight: '90vh',
            overflowY: 'auto'
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-hairline)', paddingBottom: 'var(--space-4)' }}>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                <i className="ph-bold ph-coins" style={{ color: 'var(--accent-amber)' }}></i>
                <span>{t('commission.modalTitle', '团队佣金规则与激励引擎设置')}</span>
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                {t('commission.modalSubtitle', '配置团队成单佣金默认计算模板、保证期双态风控与多人协作分成机制')}
              </p>
            </div>
            <button className="btn-icon" onClick={onClose} title={t('common.close', '关闭')}>
              <i className="ph-bold ph-x" style={{ fontSize: '1.1rem' }}></i>
            </button>
          </div>

          {/* Engine Master Toggle */}
          <div style={{
            background: config.enabled ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
            border: `1px solid ${config.enabled ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <i className={`ph-fill ${config.enabled ? 'ph-check-circle' : 'ph-prohibit'}`} style={{ fontSize: '1.4rem', color: config.enabled ? '#10B981' : '#EF4444' }}></i>
              <div>
                <div style={{ fontWeight: '600', fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                  {config.enabled ? t('commission.engineActive', '动态佣金计算引擎已启用') : t('commission.enginePaused', '佣金计算引擎已挂起')}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {t('commission.engineToggleDesc', '开启后，候选人移入 Onboarded 时自动触发佣金核定与保证期账本记录')}
                </div>
              </div>
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: '48px', height: '24px', cursor: 'pointer', flexShrink: 0 }}>
              <input
                type="checkbox"
                checked={Boolean(config.enabled)}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                background: config.enabled ? 'var(--accent-emerald, #10B981)' : 'rgba(255,255,255,0.2)',
                borderRadius: '24px', transition: '0.3s'
              }}>
                <span style={{
                  position: 'absolute', content: '""', height: '18px', width: '18px',
                  left: config.enabled ? '26px' : '3px', bottom: '3px',
                  background: '#fff', borderRadius: '50%', transition: '0.3s'
                }}></span>
              </span>
            </label>
          </div>

          {/* Section 1: Billing Mode Selection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label className="form-label" style={{ fontWeight: '600', fontSize: '0.88rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="ph-bold ph-calculator" style={{ color: 'var(--accent-blue)' }}></i>
              <span>{t('commission.billingModeTitle', '默认服务费计费模式 (可职位级覆写)')}</span>
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              {/* Option 1: DIRECT_FLAT (Default Recommended) */}
              <div
                onClick={() => setConfig({ ...config, defaultBillingMode: 'DIRECT_FLAT' })}
                style={{
                  border: `2px solid ${config.defaultBillingMode === 'DIRECT_FLAT' ? 'var(--accent-blue)' : 'var(--border-hairline)'}`,
                  background: config.defaultBillingMode === 'DIRECT_FLAT' ? 'rgba(59, 130, 246, 0.08)' : 'var(--card-bg)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontWeight: '700', fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                    ⭐ {t('commission.modeDirectFlat', '按单固定佣金 (推荐)')}
                  </span>
                  <input
                    type="radio"
                    name="billingMode"
                    checked={config.defaultBillingMode === 'DIRECT_FLAT'}
                    onChange={() => setConfig({ ...config, defaultBillingMode: 'DIRECT_FLAT' })}
                  />
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                  {t('commission.modeDirectFlatDesc', '最简模式：每成一单固定分配总佣金池 (如每单 RM 500)，无需录入复杂薪资。')}
                </p>
              </div>

              {/* Option 2: AGENCY_FLAT */}
              <div
                onClick={() => setConfig({ ...config, defaultBillingMode: 'AGENCY_FLAT' })}
                style={{
                  border: `2px solid ${config.defaultBillingMode === 'AGENCY_FLAT' ? 'var(--accent-blue)' : 'var(--border-hairline)'}`,
                  background: config.defaultBillingMode === 'AGENCY_FLAT' ? 'rgba(59, 130, 246, 0.08)' : 'var(--card-bg)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontWeight: '700', fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                    💼 {t('commission.modeAgencyFlat', '固定服务费 + 提成')}
                  </span>
                  <input
                    type="radio"
                    name="billingMode"
                    checked={config.defaultBillingMode === 'AGENCY_FLAT'}
                    onChange={() => setConfig({ ...config, defaultBillingMode: 'AGENCY_FLAT' })}
                  />
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                  {t('commission.modeAgencyFlatDesc', '向客户收固定服务费 (如 RM 2,000)，顾问从中抽取提成比例 (如 20% = RM 400)。')}
                </p>
              </div>

              {/* Option 3: PERCENTAGE */}
              <div
                onClick={() => setConfig({ ...config, defaultBillingMode: 'PERCENTAGE' })}
                style={{
                  border: `2px solid ${config.defaultBillingMode === 'PERCENTAGE' ? 'var(--accent-blue)' : 'var(--border-hairline)'}`,
                  background: config.defaultBillingMode === 'PERCENTAGE' ? 'rgba(59, 130, 246, 0.08)' : 'var(--card-bg)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontWeight: '700', fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                    📈 {t('commission.modePercentage', '薪资百分比模式')}
                  </span>
                  <input
                    type="radio"
                    name="billingMode"
                    checked={config.defaultBillingMode === 'PERCENTAGE'}
                    onChange={() => setConfig({ ...config, defaultBillingMode: 'PERCENTAGE' })}
                  />
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                  {t('commission.modePercentageDesc', '传统猎头模式：按候选人月薪 × 计费月数 × 客户服务费率 × 顾问提成率计算。')}
                </p>
              </div>
            </div>

            {/* Mode-Specific Parameters Inputs */}
            <div style={{ background: 'var(--bg-subtle, rgba(255,255,255,0.03))', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)' }}>
              {config.defaultBillingMode === 'DIRECT_FLAT' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.82rem' }}>
                      {t('commission.flatAmountLabel', '每单默认总佣金池 (全员分成基准)')}
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: '600', color: 'var(--text-muted)' }}>{config.currency || 'MYR'}</span>
                      <input
                        type="number"
                        className="form-control"
                        min="0"
                        step="10"
                        value={config.defaultFlatCommissionAmount ?? 500}
                        onChange={(e) => setConfig({ ...config, defaultFlatCommissionAmount: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                </div>
              )}

              {config.defaultBillingMode === 'AGENCY_FLAT' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.82rem' }}>
                      {t('commission.agencyFlatFeeLabel', '客户固定服务费 (RM)')}
                    </label>
                    <input
                      type="number"
                      className="form-control"
                      min="0"
                      value={config.defaultAgencyFlatFee ?? 2000}
                      onChange={(e) => setConfig({ ...config, defaultAgencyFlatFee: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.82rem' }}>
                      {t('commission.agencyFlatRateLabel', '顾问提成比率 (%)')}
                    </label>
                    <input
                      type="number"
                      className="form-control"
                      min="0"
                      max="100"
                      value={config.defaultAgencyFlatRate ?? 20}
                      onChange={(e) => setConfig({ ...config, defaultAgencyFlatRate: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              )}

              {config.defaultBillingMode === 'PERCENTAGE' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.82rem' }}>
                      {t('commission.billingMonthsLabel', '薪资计费基数 (月数)')}
                    </label>
                    <select
                      className="form-control"
                      style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}
                      value={config.defaultBillingMonths ?? 12}
                      onChange={(e) => setConfig({ ...config, defaultBillingMonths: parseInt(e.target.value, 10) })}
                    >
                      <option style={{ backgroundColor: '#0f172a', color: '#f8fafc' }} value="12">{t('commission.months12', '12 个月 (标准年薪)')}</option>
                      <option style={{ backgroundColor: '#0f172a', color: '#f8fafc' }} value="1">{t('commission.months1', '1 个月 (首月月薪)')}</option>
                      <option style={{ backgroundColor: '#0f172a', color: '#f8fafc' }} value="13">{t('commission.months13', '13 个月 (含AWS)')}</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.82rem' }}>
                      {t('commission.agencyFeeRateLabel', '客户收费比率 (%)')}
                    </label>
                    <input
                      type="number"
                      className="form-control"
                      min="0"
                      max="100"
                      step="0.5"
                      value={config.defaultAgencyFeeRate ?? 15}
                      onChange={(e) => setConfig({ ...config, defaultAgencyFeeRate: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.82rem' }}>
                      {t('commission.recruiterRateLabel', '顾问提成比率 (%)')}
                    </label>
                    <input
                      type="number"
                      className="form-control"
                      min="0"
                      max="100"
                      step="0.5"
                      value={config.defaultRecruiterRate ?? 20}
                      onChange={(e) => setConfig({ ...config, defaultRecruiterRate: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Guarantee Period & Privacy Settings */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: '600', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="ph-bold ph-shield-check" style={{ color: 'var(--accent-emerald, #10B981)' }}></i>
                <span>{t('commission.guaranteeDaysLabel', '默认保证期天数 (风控观察期)')}</span>
              </label>
              <select
                className="form-control"
                style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}
                value={config.defaultGuaranteeDays ?? 90}
                onChange={(e) => setConfig({ ...config, defaultGuaranteeDays: parseInt(e.target.value, 10) })}
              >
                <option style={{ backgroundColor: '#0f172a', color: '#f8fafc' }} value="90">{t('commission.days90', '90 天 (猎头行业 3 个月试用期标准)')}</option>
                <option style={{ backgroundColor: '#0f172a', color: '#f8fafc' }} value="60">{t('commission.days60', '60 天 (2 个月)')}</option>
                <option style={{ backgroundColor: '#0f172a', color: '#f8fafc' }} value="30">{t('commission.days30', '30 天 (1 个月)')}</option>
                <option style={{ backgroundColor: '#0f172a', color: '#f8fafc' }} value="0">{t('commission.days0', '0 天 (入职秒解锁，无保证期)')}</option>
              </select>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                {t('commission.guaranteeHint', '在保证期内佣金处于 🔒 待解锁 (Pending) 状态；满足天数后流转为 ✅ 可结算。')}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: '600', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="ph-bold ph-eye-slash" style={{ color: 'var(--accent-purple, #8B5CF6)' }}></i>
                <span>{t('commission.privacyModeLabel', '业绩榜金额隐私设置')}</span>
              </label>
              <select
                className="form-control"
                style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}
                value={config.leaderboardVisibility || 'PRIVATE_AMOUNT'}
                onChange={(e) => setConfig({ ...config, leaderboardVisibility: e.target.value })}
              >
                <option style={{ backgroundColor: '#0f172a', color: '#f8fafc' }} value="PRIVATE_AMOUNT">{t('commission.privateAmount', '隐私保护：仅本人可见具体金额，公开仅显示排名')}</option>
                <option style={{ backgroundColor: '#0f172a', color: '#f8fafc' }} value="PUBLIC_AMOUNT">{t('commission.publicAmount', '透明公开：排行榜向全团队公开展示顾问具体提成金额')}</option>
              </select>
            </div>
          </div>

          {/* Section 3: Split Roles Template */}
          <div style={{ borderTop: '1px solid var(--border-hairline)', paddingTop: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div>
                <label className="form-label" style={{ fontWeight: '600', fontSize: '0.88rem', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="ph-bold ph-users-three" style={{ color: 'var(--accent-blue)' }}></i>
                  <span>{t('commission.splitsTemplateTitle', '协作分成角色池模板 (默认比例)')}</span>
                </label>
                <div style={{ fontSize: '0.76rem', color: isRatioValid ? 'var(--text-muted)' : '#EF4444' }}>
                  {t('commission.splitsSumNotice', '比例总和必须为 100%')} | {t('commission.currentSum', '当前总计')}: <strong>{totalSplitRatio}%</strong>
                </div>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleAddSplit}
                style={{ fontSize: '0.78rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <i className="ph-bold ph-plus"></i>
                <span>{t('commission.addRole', '增加分成角色')}</span>
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {config.defaultSplits.map((split, idx) => (
                <div
                  key={split.roleId || idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: 'var(--bg-subtle, rgba(255,255,255,0.02))',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-hairline)'
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <input
                      type="text"
                      className="form-control"
                      style={{ fontSize: '0.84rem' }}
                      placeholder={t('commission.splitRolePlaceholder', '角色名称 (如 交付顾问 / BD)')}
                      value={isEn ? split.labelEn : split.labelZh}
                      onChange={(e) => {
                        handleSplitChange(idx, isEn ? 'labelEn' : 'labelZh', e.target.value);
                        if (!isEn) handleSplitChange(idx, 'labelEn', e.target.value);
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '120px', flexShrink: 0 }}>
                    <input
                      type="number"
                      className="form-control"
                      style={{ fontSize: '0.84rem', textAlign: 'right', width: '100%' }}
                      min="0"
                      max="100"
                      value={split.ratio}
                      onChange={(e) => handleSplitChange(idx, 'ratio', parseFloat(e.target.value) || 0)}
                    />
                    <span style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-muted)', flexShrink: 0 }}>%</span>
                  </div>
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={() => handleRemoveSplit(idx)}
                    title={t('common.delete', '删除')}
                    style={{ color: '#EF4444' }}
                  >
                    <i className="ph-bold ph-trash"></i>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Section 4: Quarterly Career Tiers (Optional) */}
          <div style={{ borderTop: '1px solid var(--border-hairline)', paddingTop: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="ph-bold ph-trend-up" style={{ color: 'var(--accent-amber)' }}></i>
                <span style={{ fontWeight: '600', fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                  {t('commission.careerTiersTitle', '季度累计业绩阶梯激励 (可选)')}
                </span>
              </div>
              <label style={{ position: 'relative', display: 'inline-block', width: '40px', height: '20px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={enableTiers}
                  onChange={(e) => setEnableTiers(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  background: enableTiers ? 'var(--accent-blue)' : 'rgba(255,255,255,0.2)',
                  borderRadius: '20px', transition: '0.3s'
                }}>
                  <span style={{
                    position: 'absolute', content: '""', height: '14px', width: '14px',
                    left: enableTiers ? '23px' : '3px', bottom: '3px',
                    background: '#fff', borderRadius: '50%', transition: '0.3s'
                  }}></span>
                </span>
              </label>
            </div>

            {enableTiers && (
              <div style={{ background: 'var(--bg-subtle, rgba(255,255,255,0.02))', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)', marginTop: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
                  {config.tiers.map((tier, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        background: 'rgba(255, 255, 255, 0.02)',
                        padding: '6px 10px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-subtle)'
                      }}
                    >
                      <div style={{ flex: 1, minWidth: '150px' }}>
                        <input
                          type="text"
                          className="form-control"
                          style={{ width: '100%', fontSize: '0.82rem' }}
                          placeholder={t('commission.tierLabelPlaceholder', '档位名称')}
                          value={tier.label}
                          onChange={(e) => handleTierChange(idx, 'label', e.target.value)}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', userSelect: 'none' }}>
                          {t('commission.tierThresholdPrefix', '达标 (RM):')}
                        </span>
                        <input
                          type="number"
                          className="form-control"
                          style={{ width: '105px', fontSize: '0.82rem', textAlign: 'right' }}
                          value={tier.threshold}
                          onChange={(e) => handleTierChange(idx, 'threshold', parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', userSelect: 'none' }}>
                          {t('commission.tierRatePrefix', '提成:')}
                        </span>
                        <input
                          type="number"
                          className="form-control"
                          style={{ width: '70px', fontSize: '0.82rem', textAlign: 'right' }}
                          value={tier.rate}
                          onChange={(e) => handleTierChange(idx, 'rate', parseFloat(e.target.value) || 0)}
                        />
                        <span style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>%</span>
                      </div>
                      <button
                        type="button"
                        className="btn-icon"
                        onClick={() => handleRemoveTier(idx)}
                        title={t('common.delete', '删除')}
                        style={{ color: '#EF4444', flexShrink: 0 }}
                      >
                        <i className="ph-bold ph-trash"></i>
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleAddTier}
                  style={{ fontSize: '0.74rem', padding: '3px 8px' }}
                >
                  <i className="ph-bold ph-plus"></i> {t('commission.addTier', '添加业绩档位')}
                </button>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-hairline)', paddingTop: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleReset}
              disabled={isSaving}
              style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}
            >
              {t('commission.resetDefaults', '恢复系统默认')}
            </button>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={onClose}
                disabled={isSaving}
              >
                {t('common.cancel', '取消')}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSave}
                disabled={isSaving || !isRatioValid}
                style={{ minWidth: '110px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                {isSaving ? (
                  <i className="ph-bold ph-spinner ph-spin"></i>
                ) : (
                  <i className="ph-bold ph-floppy-disk"></i>
                )}
                <span>{t('common.save', '保存生效')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
