/**
 * TALENT FLOW - 实战型动态佣金计算引擎 (CommissionEngine v1.0.0)
 * 纯函数、零副作用、支持三级规则继承、保证期推算、多人拆单与厘级尾差校准
 */

export const DEFAULT_COMMISSION_CONFIG = {
  enabled: true,
  currency: 'MYR',
  defaultBillingMode: 'DIRECT_FLAT', // 'DIRECT_FLAT' | 'AGENCY_FLAT' | 'PERCENTAGE'
  defaultFlatCommissionAmount: 500,  // 默认每单固定总提成池 RM 500
  defaultAgencyFlatFee: 2000,        // 固定服务费模式下：默认客户服务费 RM 2000
  defaultAgencyFlatRate: 20,         // 固定服务费模式下：默认顾问提成率 20%
  defaultBillingMonths: 12,          // 比例模式：年薪月数 (12 个月)
  defaultAgencyFeeRate: 15,          // 比例模式：客户服务费率 15%
  defaultRecruiterRate: 20,          // 比例模式：顾问提成比例 20%
  defaultGuaranteeDays: 90,          // 默认 90 天保证期 (0 为秒解锁)
  leaderboardVisibility: 'PRIVATE_AMOUNT', // 'PRIVATE_AMOUNT' | 'PUBLIC_AMOUNT'
  defaultSplits: [
    { roleId: 'delivery', labelZh: '交付顾问', labelEn: 'Delivery Recruiter', ratio: 70 },
    { roleId: 'bd', labelZh: '客户开发 (BD)', labelEn: 'BD Lead', ratio: 30 }
  ],
  tiers: [
    { threshold: 0, rate: 20, label: 'Base Tier (0+)' },
    { threshold: 30000, rate: 25, label: 'Star Tier (RM 30k+)' },
    { threshold: 60000, rate: 30, label: 'Elite Tier (RM 60k+)' }
  ]
};

/**
 * 辅助：安全四舍五入到 2 位小数
 */
function round2(val) {
  const num = Number(val);
  if (isNaN(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * 辅助：从薪资文本解析纯数字 (如 "RM 3,500" -> 3500)
 */
export function parseSalaryNumber(raw) {
  if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;
  if (!raw || typeof raw !== 'string') return 0;
  const cleaned = raw.replace(/[^\d.]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * 辅助：标准 YYYY-MM-DD 增加天数
 */
export function addDaysToDateString(dateStr, days) {
  if (!dateStr || typeof dateStr !== 'string') {
    dateStr = new Date().toISOString().split('T')[0];
  }
  const cleanDays = parseInt(days, 10) || 0;
  if (cleanDays <= 0) return dateStr;
  
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1, d + cleanDays));
  return target.toISOString().split('T')[0];
}

/**
 * 辅助：计算保证期剩余天数
 */
export function getGuaranteeRemainingDays(unlockDateStr, nowStr) {
  if (!unlockDateStr) return 0;
  const today = (nowStr || new Date().toISOString().split('T')[0]).slice(0, 10);
  if (today >= unlockDateStr) return 0;
  
  const [y1, m1, d1] = today.split('-').map(Number);
  const [y2, m2, d2] = unlockDateStr.split('-').map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  const diffDays = Math.ceil((t2 - t1) / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
}

/**
 * 第一层与第二层继承解析：合并团队全局规则与职位专属覆写规则
 * @param {object} teamConfig - 团队配置
 * @param {object} [jobOverride] - 职位订单抽屉中独立配置的覆写
 */
export function resolveEffectiveRule(teamConfig = {}, jobOverride = null) {
  const base = {
    ...DEFAULT_COMMISSION_CONFIG,
    ...(teamConfig || {})
  };

  if (!jobOverride || !jobOverride.enabled) {
    return {
      isJobOverridden: false,
      billingMode: base.defaultBillingMode || 'DIRECT_FLAT',
      flatCommissionAmount: Number(base.defaultFlatCommissionAmount ?? 500),
      agencyFlatFee: Number(base.defaultAgencyFlatFee ?? 2000),
      agencyFlatRate: Number(base.defaultAgencyFlatRate ?? 20),
      billingMonths: Number(base.defaultBillingMonths ?? 12),
      agencyFeeRate: Number(base.defaultAgencyFeeRate ?? 15),
      recruiterRate: Number(base.defaultRecruiterRate ?? 20),
      guaranteeDays: parseInt(base.defaultGuaranteeDays ?? 90, 10),
      splits: Array.isArray(base.defaultSplits) && base.defaultSplits.length > 0 
        ? base.defaultSplits 
        : DEFAULT_COMMISSION_CONFIG.defaultSplits,
      tiers: Array.isArray(base.tiers) ? base.tiers : DEFAULT_COMMISSION_CONFIG.tiers,
      currency: base.currency || 'MYR'
    };
  }

  return {
    isJobOverridden: true,
    billingMode: jobOverride.billingMode || base.defaultBillingMode || 'DIRECT_FLAT',
    flatCommissionAmount: Number(jobOverride.flatCommissionAmount ?? base.defaultFlatCommissionAmount ?? 500),
    agencyFlatFee: Number(jobOverride.agencyFlatFee ?? base.defaultAgencyFlatFee ?? 2000),
    agencyFlatRate: Number(jobOverride.agencyFlatRate ?? base.defaultAgencyFlatRate ?? 20),
    billingMonths: Number(jobOverride.billingMonths ?? base.defaultBillingMonths ?? 12),
    agencyFeeRate: Number(jobOverride.agencyFeeRate ?? base.defaultAgencyFeeRate ?? 15),
    recruiterRate: Number(jobOverride.recruiterRate ?? base.defaultRecruiterRate ?? 20),
    guaranteeDays: parseInt(jobOverride.guaranteeDays ?? base.defaultGuaranteeDays ?? 90, 10),
    splits: Array.isArray(jobOverride.splits) && jobOverride.splits.length > 0
      ? jobOverride.splits
      : (Array.isArray(base.defaultSplits) && base.defaultSplits.length > 0 ? base.defaultSplits : DEFAULT_COMMISSION_CONFIG.defaultSplits),
    tiers: Array.isArray(base.tiers) ? base.tiers : DEFAULT_COMMISSION_CONFIG.tiers,
    currency: base.currency || 'MYR'
  };
}

/**
 * 核心成单佣金计算器 (含 3 种计费模式、多人任意拆分与尾差厘级校准)
 * @param {object} input - { salary, onboardDate, billingMode, flatCommissionAmount, agencyFlatFee, agencyFlatRate, billingMonths, agencyFeeRate, recruiterRate, guaranteeDays }
 * @param {object} effectiveRule - 生效的规则模板
 * @param {Array} userSplits - [{ uid, displayName, role, ratio, amount }]
 */
export function calculateDealCommission(input = {}, effectiveRule = null, userSplits = []) {
  const rule = effectiveRule || resolveEffectiveRule();
  const mode = input.billingMode || rule.billingMode || 'DIRECT_FLAT';
  
  let totalAgencyBilling = 0;
  let totalCommissionPool = 0;
  let commissionRate = 0;
  let candidateSalary = parseSalaryNumber(input.salary || 0);

  if (mode === 'DIRECT_FLAT') {
    const flatAmount = Number(input.flatCommissionAmount ?? rule.flatCommissionAmount ?? 500);
    totalCommissionPool = round2(flatAmount);
    totalAgencyBilling = 0;
    commissionRate = 100;
  } else if (mode === 'AGENCY_FLAT') {
    const clientFee = Number(input.agencyFlatFee ?? rule.agencyFlatFee ?? 2000);
    const rate = Number(input.agencyFlatRate ?? rule.agencyFlatRate ?? 20);
    totalAgencyBilling = round2(clientFee);
    commissionRate = round2(rate);
    totalCommissionPool = round2(totalAgencyBilling * (commissionRate / 100));
  } else if (mode === 'PERCENTAGE') {
    const months = Number(input.billingMonths ?? rule.billingMonths ?? 12);
    const feeRate = Number(input.agencyFeeRate ?? rule.agencyFeeRate ?? 15);
    const recRate = Number(input.recruiterRate ?? rule.recruiterRate ?? 20);
    totalAgencyBilling = round2(candidateSalary * months * (feeRate / 100));
    commissionRate = round2(recRate);
    totalCommissionPool = round2(totalAgencyBilling * (commissionRate / 100));
  }

  // 保证期与解锁日
  const guaranteeDays = parseInt(input.guaranteeDays ?? rule.guaranteeDays ?? 90, 10);
  const onboardDate = input.onboardDate || new Date().toISOString().split('T')[0];
  const unlockDate = addDaysToDateString(onboardDate, guaranteeDays);

  // 顾问分成明细计算
  const splits = [];
  const rawSplits = Array.isArray(userSplits) && userSplits.length > 0 
    ? userSplits 
    : [{ uid: 'unassigned', displayName: 'Delivery Recruiter', role: 'delivery', ratio: 100 }];

  // 校验 ratio 总和
  const totalRatio = rawSplits.reduce((acc, s) => acc + (Number(s.ratio) || 0), 0);
  let distributedSum = 0;

  rawSplits.forEach((split, index) => {
    const ratio = Number(split.ratio) || 0;
    // 如果用户直接手动指定了具体 amount，则尊重主管特批金额，否则按比例计算
    let splitAmount = 0;
    if (split.amount !== undefined && split.amount !== null && !isNaN(Number(split.amount))) {
      splitAmount = round2(split.amount);
    } else {
      const normalizedRatio = totalRatio > 0 ? ratio / totalRatio : (1 / rawSplits.length);
      splitAmount = Math.floor(totalCommissionPool * normalizedRatio * 100) / 100;
    }
    distributedSum = round2(distributedSum + splitAmount);

    splits.push({
      uid: split.uid || `user_${index + 1}`,
      displayName: split.displayName || `Recruiter ${index + 1}`,
      role: split.role || 'delivery',
      ratio: ratio,
      amount: splitAmount
    });
  });

  // 尾差校准 (Penny Adjustment): 将四舍五入产生的尾差 (如 0.01) 分配给权重最高者或首位，确保账目分文不差
  if (splits.length > 0 && splits.every(s => s.amount !== undefined)) {
    const diff = round2(totalCommissionPool - distributedSum);
    if (Math.abs(diff) > 0 && Math.abs(diff) < 1.0) {
      splits[0].amount = round2(splits[0].amount + diff);
    }
  }

  return {
    billingSnapshot: {
      billingMode: mode,
      candidateSalary: candidateSalary > 0 ? candidateSalary : undefined,
      billingMonths: mode === 'PERCENTAGE' ? Number(input.billingMonths ?? rule.billingMonths ?? 12) : undefined,
      agencyFeeRate: mode === 'PERCENTAGE' ? Number(input.agencyFeeRate ?? rule.agencyFeeRate ?? 15) : undefined,
      totalAgencyBilling: totalAgencyBilling > 0 ? totalAgencyBilling : undefined,
      commissionRate: commissionRate,
      totalCommissionPool: totalCommissionPool
    },
    totalCommissionPool,
    splits,
    guaranteeDays,
    onboardDate,
    unlockDate,
    status: guaranteeDays <= 0 ? 'UNLOCKED' : 'PENDING'
  };
}

/**
 * 保证期与结算状态动态判定
 * @param {object} record - CommissionRecord 实体
 * @param {string} [nowStr] - 当前基准日期 YYYY-MM-DD
 */
export function evaluateGuaranteeStatus(record = {}, nowStr = '') {
  if (!record) return 'PENDING';
  if (record.status === 'CANCELLED') return 'CANCELLED';
  if (record.status === 'SETTLED') return 'SETTLED';
  if (record.status === 'UNLOCKED') return 'UNLOCKED';
  
  if (Number(record.guaranteeDays) <= 0) return 'UNLOCKED';

  const today = (nowStr || new Date().toISOString().split('T')[0]).slice(0, 10);
  if (record.unlockDate && today >= record.unlockDate) {
    return 'READY_TO_UNLOCK'; // 到期可由系统或主管一键解锁
  }

  return 'PENDING';
}

/**
 * 业绩阶梯激励比率匹配
 * @param {Array} tiers - 阶梯数组 [{ threshold, rate, label }]
 * @param {number} cumulativeBilling - 累计业绩额
 */
export function matchCareerTier(tiers = [], cumulativeBilling = 0) {
  if (!Array.isArray(tiers) || tiers.length === 0) return null;
  const sorted = [...tiers].sort((a, b) => b.threshold - a.threshold);
  const matched = sorted.find(t => cumulativeBilling >= t.threshold);
  return matched || sorted[sorted.length - 1];
}

/**
 * 币种格式化辅助 (默认 MYR RM)
 */
export function formatCommissionCurrency(amount, currency = 'MYR') {
  const num = Number(amount) || 0;
  const prefix = currency === 'SGD' ? 'S$' : (currency === 'USD' ? '$' : 'RM ');
  return `${prefix}${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
