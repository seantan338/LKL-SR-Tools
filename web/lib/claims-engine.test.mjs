import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CLAIMS_CONFIG,
  roundCurrency,
  calculateMileageClaim,
  generateReceiptFingerprint,
  detectClaimAnomalies,
  aggregateClaimsForPayroll
} from './claims-engine.js';

test('1. roundCurrency 保留两位小数精度测试', () => {
  assert.equal(roundCurrency(10.555), 10.56);
  assert.equal(roundCurrency(10.554), 10.55);
  assert.equal(roundCurrency('100.80'), 100.8);
  assert.equal(roundCurrency(0), 0);
  assert.equal(roundCurrency(null), 0);
});

test('2. calculateMileageClaim 里程补贴纯函数计算测试', () => {
  // 场景 A: 轿车出行 100km，过路费 RM 25.50，停车费 RM 10.00
  // 补贴 = 100 * 0.80 = 80.00, 总额 = 80.00 + 25.50 + 10.00 = 115.50
  const carResult = calculateMileageClaim({
    vehicleType: 'CAR',
    distanceKm: 100,
    tollAmount: 25.5,
    parkingAmount: 10
  });

  assert.equal(carResult.appliedRate, 0.80);
  assert.equal(carResult.mileageSubsidy, 80.00);
  assert.equal(carResult.tollAmount, 25.50);
  assert.equal(carResult.parkingAmount, 10.00);
  assert.equal(carResult.totalAmount, 115.50);

  // 场景 B: 摩托车出行 50km，无过路费与停车费
  // 补贴 = 50 * 0.40 = 20.00
  const motoResult = calculateMileageClaim({
    vehicleType: 'MOTORCYCLE',
    distanceKm: 50
  });

  assert.equal(motoResult.appliedRate, 0.40);
  assert.equal(motoResult.mileageSubsidy, 20.00);
  assert.equal(motoResult.totalAmount, 20.00);

  // 场景 C: 边界负数防呆处理
  const negativeResult = calculateMileageClaim({
    vehicleType: 'CAR',
    distanceKm: -50,
    tollAmount: -10
  });
  assert.equal(negativeResult.totalAmount, 0);
});

test('3. generateReceiptFingerprint 发票防重指纹测试', () => {
  // 场景 A: 存在明确发票号（大写/带符号/空格统一清洗）
  const fp1 = generateReceiptFingerprint({
    invoiceNo: 'INV-2026-88899',
    receiptDate: '2026-10-28',
    totalAmount: 150.00,
    merchantName: 'Shell Malaysia'
  });
  assert.equal(fp1, 'inv:inv202688899');

  // 场景 B: 发票号缺失，回退为 日期 + 金额 + 商户名清洗
  const fp2 = generateReceiptFingerprint({
    invoiceNo: '',
    receiptDate: '2026-10-28',
    totalAmount: 48.50,
    merchantName: 'McDonald\'s Skudai'
  });
  assert.equal(fp2, 'dt:2026-10-28_amt:48.50_m:mcdonald\'sskudai');
});

test('4. detectClaimAnomalies 发票防重、超标与陈旧预警测试', () => {
  const existingClaims = [
    {
      id: 'claim_001',
      status: 'APPROVED_PENDING_PAYOUT',
      items: [
        {
          itemId: 'item_1',
          invoiceNo: 'INV-1001',
          receiptDate: '2026-10-15',
          amount: 80.00,
          merchantName: 'Shell',
          fingerprint: 'inv:inv1001'
        }
      ]
    },
    {
      id: 'claim_002',
      status: 'CANCELLED', // 已撤回的单据不参与查重
      items: [
        {
          itemId: 'item_2',
          invoiceNo: 'INV-1002',
          fingerprint: 'inv:inv1002'
        }
      ]
    }
  ];

  // 场景 A: 疑似重复发票 (命中 INV-1001)
  const duplicateWarnings = detectClaimAnomalies(
    {
      itemId: 'item_new_1',
      invoiceNo: 'INV-1001',
      category: 'TRANSPORT',
      amount: 80.00,
      receiptDate: '2026-10-28',
      merchantName: 'Shell'
    },
    existingClaims
  );
  assert.ok(duplicateWarnings.includes('DUPLICATE_SUSPECTED'));

  // 场景 B: 撤回单据不会触发查重
  const cancelledWarnings = detectClaimAnomalies(
    {
      itemId: 'item_new_2',
      invoiceNo: 'INV-1002',
      category: 'TRANSPORT',
      amount: 50.00,
      receiptDate: '2026-10-28',
      merchantName: 'Grab'
    },
    existingClaims
  );
  assert.ok(!cancelledWarnings.includes('DUPLICATE_SUSPECTED'));

  // 场景 C: 单笔餐饮超出上限 (MEAL 上限 RM 50，申请 RM 120)
  const overlimitWarnings = detectClaimAnomalies(
    {
      itemId: 'item_new_3',
      invoiceNo: 'INV-9999',
      category: 'MEAL',
      amount: 120.00,
      receiptDate: '2026-10-28',
      merchantName: 'Restaurant'
    },
    existingClaims
  );
  assert.ok(overlimitWarnings.includes('OVER_LIMIT'));

  // 场景 D: 陈旧票据超过 60 天
  const expiredWarnings = detectClaimAnomalies(
    {
      itemId: 'item_new_4',
      invoiceNo: 'INV-7777',
      category: 'TRANSPORT',
      amount: 40.00,
      receiptDate: '2025-01-01',
      merchantName: 'Touch n Go'
    },
    existingClaims
  );
  assert.ok(expiredWarnings.includes('EXPIRED_RECEIPT'));
});

test('5. aggregateClaimsForPayroll 随薪发放按月归集测试', () => {
  const claims = [
    {
      id: 'claim_101',
      userId: 'user_a',
      claimMonth: '2026-10',
      status: 'APPROVED_PENDING_PAYOUT',
      payoutChannel: 'PAYROLL',
      totalAmount: 180.50,
      items: [
        { category: 'MEAL', amount: 50.00 },
        { category: 'MILEAGE', amount: 130.50 }
      ]
    },
    {
      id: 'claim_102',
      userId: 'user_a',
      claimMonth: '2026-10',
      status: 'APPROVED_PENDING_PAYOUT',
      payoutChannel: 'BATCH_PAYOUT', // 批次打款，不走薪资
      totalAmount: 500.00,
      items: [{ category: 'OFFICE', amount: 500.00 }]
    },
    {
      id: 'claim_103',
      userId: 'user_a',
      claimMonth: '2026-10',
      status: 'SUBMITTED', // 未终审通过，不计入
      payoutChannel: 'PAYROLL',
      totalAmount: 90.00,
      items: [{ category: 'TRANSPORT', amount: 90.00 }]
    },
    {
      id: 'claim_104',
      userId: 'user_b', // 他人单据，不计入
      claimMonth: '2026-10',
      status: 'APPROVED_PENDING_PAYOUT',
      payoutChannel: 'PAYROLL',
      totalAmount: 300.00,
      items: [{ category: 'ACCOMMODATION', amount: 300.00 }]
    }
  ];

  const result = aggregateClaimsForPayroll(claims, {
    userId: 'user_a',
    monthStr: '2026-10'
  });

  assert.equal(result.claimCount, 1);
  assert.equal(result.totalReimbursement, 180.50);
  assert.deepEqual(result.claimIds, ['claim_101']);
  assert.equal(result.breakdownByCategory.MEAL, 50.00);
  assert.equal(result.breakdownByCategory.MILEAGE, 130.50);
});
