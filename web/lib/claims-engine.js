/**
 * TALENT FLOW - 报销与费用 (Claims & Mileage) 纯函数计算与风控引擎
 * 严格遵循纯函数规范，无副作用，金额统一保留2位小数，支持双轨审批与薪资/批次放款联动
 */

export const DEFAULT_CLAIMS_CONFIG = {
  currency: 'MYR',
  mileageRates: {
    CAR: 0.80,         // 轿车每公里补贴 (RM 0.80/km)
    MOTORCYCLE: 0.40   // 摩托车每公里补贴 (RM 0.40/km)
  },
  categoryLimits: {
    MEAL: 50,          // 餐饮单笔基准上限 (RM 50)
    TRANSPORT: 200,    // 交通/打车单笔基准上限 (RM 200)
    ACCOMMODATION: 350,// 差旅住宿单笔基准上限 (RM 350)
    OFFICE: 500,       // 办公用品单笔上限 (RM 500)
    ENTERTAINMENT: 500,// 商务招待单笔上限 (RM 500)
    OTHER: 300         // 其他杂项单笔上限 (RM 300)
  },
  maxReceiptAgeDays: 60, // 超过 60 天的陈旧票据触发预警
  fastTrackThreshold: 100 // 低于 RM 100 标记为小额快速通道
};

/**
 * 安全保留 2 位小数纯函数
 * @param {number|string} val 
 * @returns {number}
 */
export function roundCurrency(val) {
  const num = Number(val) || 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * 计算里程补贴金额 (Mileage Claim Calculation)
 * @param {object} params
 * @param {'CAR'|'MOTORCYCLE'} params.vehicleType 车辆类型
 * @param {number} params.distanceKm 行驶公里数
 * @param {number} [params.tollAmount=0] 过路费/ERP (Touch 'n Go)
 * @param {number} [params.parkingAmount=0] 停车费
 * @param {object} [params.rates] 自定义费率
 * @returns {{ mileageSubsidy: number, tollAmount: number, parkingAmount: number, totalAmount: number, appliedRate: number }}
 */
export function calculateMileageClaim({
  vehicleType = 'CAR',
  distanceKm = 0,
  tollAmount = 0,
  parkingAmount = 0,
  rates = DEFAULT_CLAIMS_CONFIG.mileageRates
}) {
  const normKm = Math.max(0, Number(distanceKm) || 0);
  const normToll = Math.max(0, Number(tollAmount) || 0);
  const normParking = Math.max(0, Number(parkingAmount) || 0);
  const appliedRate = rates[vehicleType] !== undefined ? rates[vehicleType] : DEFAULT_CLAIMS_CONFIG.mileageRates.CAR;

  const mileageSubsidy = roundCurrency(normKm * appliedRate);
  const cleanToll = roundCurrency(normToll);
  const cleanParking = roundCurrency(normParking);
  const totalAmount = roundCurrency(mileageSubsidy + cleanToll + cleanParking);

  return {
    mileageSubsidy,
    tollAmount: cleanToll,
    parkingAmount: cleanParking,
    totalAmount,
    appliedRate
  };
}

/**
 * 生成发票/小票的归一化防重指纹 (Receipt Fingerprint)
 * 优先采用发票号；若发票号为空，则基于「开票日期 + 规范金额 + 商户名称」
 * @param {object} item
 * @param {string} [item.invoiceNo]
 * @param {string} item.receiptDate
 * @param {number|string} item.totalAmount
 * @param {string} item.merchantName
 * @returns {string}
 */
export function generateReceiptFingerprint({
  invoiceNo = '',
  receiptDate = '',
  totalAmount = 0,
  merchantName = ''
}) {
  const cleanInv = String(invoiceNo || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (cleanInv.length >= 4) {
    return `inv:${cleanInv}`;
  }

  const cleanDate = String(receiptDate || '').trim().slice(0, 10);
  const cleanAmt = roundCurrency(totalAmount).toFixed(2);
  const cleanMerchant = String(merchantName || '').trim().toLowerCase().replace(/\s+/g, '');

  return `dt:${cleanDate}_amt:${cleanAmt}_m:${cleanMerchant}`;
}

/**
 * 校验票据明细异常并返回风险警告列表 (Anomalies Detection)
 * @param {object} lineItem 待检测的费用明细
 * @param {Array<object>} existingClaims 历史所有有效报销单列表
 * @param {object} [config] 规则配置
 * @returns {string[]} 异常标签数组 (如 ['DUPLICATE_SUSPECTED', 'OVER_LIMIT', 'EXPIRED_RECEIPT'])
 */
export function detectClaimAnomalies(
  lineItem,
  existingClaims = [],
  config = DEFAULT_CLAIMS_CONFIG
) {
  const warnings = [];
  if (!lineItem) return warnings;

  const fingerprint = lineItem.fingerprint || generateReceiptFingerprint({
    invoiceNo: lineItem.invoiceNo,
    receiptDate: lineItem.receiptDate,
    totalAmount: lineItem.amount || lineItem.totalAmount,
    merchantName: lineItem.merchantName
  });

  // 1. 发票查重 (DUPLICATE_SUSPECTED)
  // 排除已撤回或已驳回的历史单据
  let isDuplicate = false;
  for (const claim of existingClaims) {
    if (claim.status === 'CANCELLED' || claim.status === 'REJECTED') continue;
    // 自身同一个 claim 内的同一行 ID 排除
    const items = claim.items || [];
    for (const item of items) {
      if (item.itemId && lineItem.itemId && item.itemId === lineItem.itemId) continue;
      const otherFp = item.fingerprint || generateReceiptFingerprint({
        invoiceNo: item.invoiceNo,
        receiptDate: item.receiptDate,
        totalAmount: item.amount,
        merchantName: item.merchantName
      });
      if (fingerprint && otherFp && fingerprint === otherFp) {
        isDuplicate = true;
        break;
      }
    }
    if (isDuplicate) break;
  }
  if (isDuplicate) {
    warnings.push('DUPLICATE_SUSPECTED');
  }

  // 2. 超额预警 (OVER_LIMIT)
  const category = lineItem.category;
  const limit = (config.categoryLimits && config.categoryLimits[category]) || null;
  const amount = Number(lineItem.amount || lineItem.totalAmount) || 0;
  if (limit && amount > limit) {
    warnings.push('OVER_LIMIT');
  }

  // 3. 陈旧过期票据校验 (EXPIRED_RECEIPT)
  if (lineItem.receiptDate) {
    const receiptTime = new Date(lineItem.receiptDate).getTime();
    if (!isNaN(receiptTime)) {
      const now = new Date().getTime();
      const diffDays = Math.floor((now - receiptTime) / (1000 * 60 * 60 * 24));
      if (diffDays > (config.maxReceiptAgeDays || 60)) {
        warnings.push('EXPIRED_RECEIPT');
      }
    }
  }

  return warnings;
}

/**
 * 薪资联动聚合函数 (Aggregate Claims for Monthly Payroll Run)
 * 提取指定员工在指定月份、已被财务终审批准且勾选随薪发放的有效报销单
 * @param {Array<object>} claims 全量报销单
 * @param {object} params
 * @param {string} params.userId 员工 UID
 * @param {string} params.monthStr 结算月份 "YYYY-MM"
 * @returns {{ totalReimbursement: number, claimCount: number, claimIds: string[], breakdownByCategory: Record<string, number> }}
 */
export function aggregateClaimsForPayroll(claims = [], { userId, monthStr }) {
  if (!userId || !monthStr) {
    return {
      totalReimbursement: 0,
      claimCount: 0,
      claimIds: [],
      breakdownByCategory: {}
    };
  }

  const matchedClaims = claims.filter(c => {
    if (c.userId !== userId) return false;
    // 归属月份匹配或未锁定时在当前发薪月结算
    const isTargetMonth = (c.claimMonth === monthStr) || (!c.payrollPeriod && (c.createdAt?.toDate ? c.createdAt.toDate().toISOString().startsWith(monthStr) : String(c.createdAt || '').startsWith(monthStr)));
    // 只有终审通过待放款，且选择随薪发放通道
    const isApprovedForPayroll = (
      (c.status === 'APPROVED_PENDING_PAYOUT' || c.status === 'LOCKED_IN_PAYROLL') &&
      c.payoutChannel === 'PAYROLL'
    );
    return isTargetMonth && isApprovedForPayroll;
  });

  let totalReimbursement = 0;
  const claimIds = [];
  const breakdownByCategory = {};

  matchedClaims.forEach(claim => {
    claimIds.push(claim.id);
    totalReimbursement += (Number(claim.totalAmount) || 0);

    (claim.items || []).forEach(item => {
      const cat = item.category || 'OTHER';
      breakdownByCategory[cat] = roundCurrency((breakdownByCategory[cat] || 0) + (Number(item.amount) || 0));
    });
  });

  return {
    totalReimbursement: roundCurrency(totalReimbursement),
    claimCount: matchedClaims.length,
    claimIds,
    breakdownByCategory
  };
}
