import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_COMMISSION_CONFIG,
  resolveEffectiveRule,
  calculateDealCommission,
  evaluateGuaranteeStatus,
  getGuaranteeRemainingDays,
  matchCareerTier,
  formatCommissionCurrency
} from './commission-engine.js';

test('resolveEffectiveRule defaults to DIRECT_FLAT when config empty', () => {
  const effective = resolveEffectiveRule(null, null);
  assert.equal(effective.billingMode, 'DIRECT_FLAT');
  assert.equal(effective.flatCommissionAmount, 500);
  assert.equal(effective.guaranteeDays, 90);
  assert.equal(effective.isJobOverridden, false);
});

test('resolveEffectiveRule prioritizes job order override when enabled', () => {
  const teamConfig = {
    ...DEFAULT_COMMISSION_CONFIG,
    defaultBillingMode: 'DIRECT_FLAT',
    defaultFlatCommissionAmount: 500,
    defaultGuaranteeDays: 90
  };
  const jobOverride = {
    enabled: true,
    billingMode: 'AGENCY_FLAT',
    agencyFlatFee: 3000,
    agencyFlatRate: 25,
    guaranteeDays: 60
  };
  const effective = resolveEffectiveRule(teamConfig, jobOverride);
  assert.equal(effective.billingMode, 'AGENCY_FLAT');
  assert.equal(effective.agencyFlatFee, 3000);
  assert.equal(effective.agencyFlatRate, 25);
  assert.equal(effective.guaranteeDays, 60);
  assert.equal(effective.isJobOverridden, true);
});

test('calculateDealCommission handles DIRECT_FLAT correctly', () => {
  const rule = {
    billingMode: 'DIRECT_FLAT',
    flatCommissionAmount: 800,
    guaranteeDays: 90
  };
  const splits = [
    { role: 'delivery', ratio: 70 },
    { role: 'bd', ratio: 30 }
  ];
  const result = calculateDealCommission(
    { flatCommissionAmount: 800, onboardDate: '2026-11-01' },
    rule,
    splits
  );
  assert.equal(result.totalCommissionPool, 800);
  assert.equal(result.splits[0].amount, 560);
  assert.equal(result.splits[1].amount, 240);
  assert.equal(result.unlockDate, '2027-01-30');
});

test('calculateDealCommission handles AGENCY_FLAT correctly', () => {
  const rule = {
    billingMode: 'AGENCY_FLAT',
    agencyFlatFee: 2000,
    agencyFlatRate: 20,
    guaranteeDays: 30
  };
  const splits = [{ role: 'delivery', ratio: 100 }];
  const result = calculateDealCommission(
    { agencyFlatFee: 2000, agencyFlatRate: 20, guaranteeDays: 30, onboardDate: '2026-11-01' },
    rule,
    splits
  );
  assert.equal(result.totalCommissionPool, 400); // 2000 * 20%
  assert.equal(result.splits[0].amount, 400);
  assert.equal(result.unlockDate, '2026-12-01');
});

test('calculateDealCommission handles PERCENTAGE correctly', () => {
  const rule = {
    billingMode: 'PERCENTAGE',
    billingMonths: 12,
    agencyFeeRate: 15,
    recruiterRate: 20,
    guaranteeDays: 90
  };
  const splits = [{ role: 'delivery', ratio: 100 }];
  const result = calculateDealCommission(
    { salary: 10000, onboardDate: '2026-11-01' },
    rule,
    splits
  );
  // annualSalary = 120,000; totalBilling = 18,000; commission = 3,600
  assert.equal(result.totalCommissionPool, 3600);
  assert.equal(result.splits[0].amount, 3600);
});

test('calculateDealCommission respects supervisor manual split amount override', () => {
  const rule = {
    billingMode: 'DIRECT_FLAT',
    flatCommissionAmount: 1000,
    guaranteeDays: 90
  };
  const splits = [
    { role: 'delivery', ratio: 60, amount: 650 },
    { role: 'bd', ratio: 40, amount: 350 }
  ];
  const result = calculateDealCommission(
    { flatCommissionAmount: 1000, onboardDate: '2026-11-01' },
    rule,
    splits
  );
  assert.equal(result.totalCommissionPool, 1000);
  assert.equal(result.splits[0].amount, 650);
  assert.equal(result.splits[1].amount, 350);
});

test('evaluateGuaranteeStatus and remaining days calculation', () => {
  assert.equal(evaluateGuaranteeStatus({ status: 'CANCELLED' }), 'CANCELLED');
  assert.equal(evaluateGuaranteeStatus({ status: 'SETTLED' }), 'SETTLED');
  assert.equal(evaluateGuaranteeStatus({ status: 'UNLOCKED' }), 'UNLOCKED');

  // Past unlock date should evaluate to READY_TO_UNLOCK
  const pastDeal = {
    status: 'PENDING',
    guaranteeDays: 90,
    unlockDate: '2020-01-01'
  };
  assert.equal(evaluateGuaranteeStatus(pastDeal, '2026-01-01'), 'READY_TO_UNLOCK');
  assert.equal(getGuaranteeRemainingDays('2020-01-01', '2026-01-01'), 0);

  // Future unlock date should stay PENDING
  const futureDeal = {
    status: 'PENDING',
    guaranteeDays: 90,
    unlockDate: '2026-12-01'
  };
  assert.equal(evaluateGuaranteeStatus(futureDeal, '2026-11-01'), 'PENDING');
  assert.equal(getGuaranteeRemainingDays('2026-12-01', '2026-11-01'), 30);
});

test('matchCareerTier matches correct tier by threshold', () => {
  const tiers = [
    { threshold: 0, rate: 15, label: 'Tier 1' },
    { threshold: 30000, rate: 20, label: 'Tier 2' },
    { threshold: 60000, rate: 25, label: 'Tier 3' }
  ];
  assert.equal(matchCareerTier(tiers, 15000)?.label, 'Tier 1');
  assert.equal(matchCareerTier(tiers, 35000)?.label, 'Tier 2');
  assert.equal(matchCareerTier(tiers, 80000)?.label, 'Tier 3');
});

test('formatCommissionCurrency formats properly', () => {
  assert.equal(formatCommissionCurrency(500, 'MYR'), 'RM 500.00');
  assert.equal(formatCommissionCurrency(1234.56, 'SGD'), 'S$1,234.56');
  assert.equal(formatCommissionCurrency(100, 'USD'), '$100.00');
  assert.equal(formatCommissionCurrency(null, 'MYR'), 'RM 0.00');
});
