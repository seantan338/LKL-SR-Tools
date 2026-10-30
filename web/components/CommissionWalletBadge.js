'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../lib/auth-context';
import { useI18n } from '../lib/i18n-context';
import { FirestoreStore } from '../lib/firestore-store';
import { getGuaranteeRemainingDays, formatCommissionCurrency } from '../lib/commission-engine';

/**
 * 纯 CSS / JS Count-up 数字平滑跳动 Hook
 */
function useCountUp(targetValue, duration = 600) {
  const [displayValue, setDisplayValue] = useState(targetValue);
  const prevTargetRef = useRef(targetValue);

  useEffect(() => {
    const startVal = prevTargetRef.current;
    const endVal = targetValue;
    prevTargetRef.current = targetValue;

    if (startVal === endVal) {
      setDisplayValue(endVal);
      return;
    }

    const startTime = performance.now();

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutCubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = startVal + (endVal - startVal) * ease;
      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setDisplayValue(endVal);
      }
    };

    requestAnimationFrame(animate);
  }, [targetValue, duration]);

  return displayValue;
}

export default function CommissionWalletBadge() {
  const { teamId, user, isOwner } = useAuth();
  const { t, lang } = useI18n();
  const isEn = lang === 'en';
  const [records, setRecords] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef(null);

  // Subscribe to commission records
  useEffect(() => {
    if (!teamId) return;
    const unsub = FirestoreStore.subscribeToCommissionRecords(teamId, (recs) => {
      setRecords(recs || []);
    });
    return () => unsub();
  }, [teamId]);

  // Close popover on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Aggregate user's personal commission wallet
  const walletSummary = useMemo(() => {
    if (!user || !records.length) {
      return { pending: 0, unlocked: 0, activeDeals: [] };
    }

    const myUid = user.uid;
    const myName = (user.displayName || '').toLowerCase().trim();

    let pendingSum = 0;
    let unlockedSum = 0;
    const myActiveDeals = [];

    const todayStr = new Date().toISOString().split('T')[0];

    records.forEach(rec => {
      if (rec.status === 'CANCELLED') return;

      // Find my split
      const mySplit = (rec.splits || []).find(s => 
        s.uid === myUid || 
        (myName && (s.displayName || '').toLowerCase().trim() === myName)
      );

      if (mySplit) {
        const splitAmount = Number(mySplit.amount) || 0;
        const remainingDays = getGuaranteeRemainingDays(rec.unlockDate, todayStr);
        const isActuallyUnlocked = rec.status === 'UNLOCKED' || rec.status === 'SETTLED' || (rec.guaranteeDays <= 0) || (remainingDays === 0 && rec.status !== 'CANCELLED');

        if (isActuallyUnlocked) {
          unlockedSum += splitAmount;
        } else {
          pendingSum += splitAmount;
        }

        myActiveDeals.push({
          ...rec,
          myAmount: splitAmount,
          myRole: mySplit.role,
          remainingDays,
          isActuallyUnlocked
        });
      }
    });

    return {
      pending: Math.round(pendingSum * 100) / 100,
      unlocked: Math.round(unlockedSum * 100) / 100,
      activeDeals: myActiveDeals.slice(0, 8)
    };
  }, [user, records]);

  const animatedPending = useCountUp(walletSummary.pending);
  const animatedUnlocked = useCountUp(walletSummary.unlocked);

  if (!user || !isOwner) return null;

  return (
    <div style={{ position: 'relative' }} ref={popoverRef}>
      {/* Wallet Badge Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '4px 12px',
          borderRadius: '9999px',
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          lineHeight: 1.2
        }}
        title={t('commission.walletTooltip', '点击展开个人双态佣金钱包 (待解锁与可结算总额)')}
      >
        <i className="ph-bold ph-coins" style={{ color: 'var(--accent-amber)', fontSize: '14px' }}></i>

        {/* Pending Badge */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          <i className="ph-bold ph-lock-simple" style={{ color: 'var(--accent-amber)', fontSize: '12px' }}></i>
          <strong style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
            {formatCommissionCurrency(animatedPending, 'MYR')}
          </strong>
        </span>

        <span style={{ width: '1px', height: '12px', background: 'var(--border-subtle)' }} />

        {/* Unlocked Badge */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--accent-emerald, #10B981)' }}>
          <i className="ph-bold ph-check-circle" style={{ color: 'var(--accent-emerald, #10B981)', fontSize: '12px' }}></i>
          <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatCommissionCurrency(animatedUnlocked, 'MYR')}
          </strong>
        </span>
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: '320px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-interactive)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-xl)',
            padding: '14px',
            zIndex: 1000,
            backdropFilter: 'blur(16px)',
            animation: 'modalEnter 0.2s ease-out'
          }}
        >
          {/* Popover Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid var(--border-hairline)', paddingBottom: '8px' }}>
            <div style={{ fontWeight: '700', fontSize: '0.88rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="ph-bold ph-wallet" style={{ color: 'var(--accent-amber)' }}></i>
              <span>{t('commission.myWalletTitle', '我的佣金双态钱包')}</span>
            </div>
            <a
              href="/leaderboard"
              style={{ fontSize: '0.74rem', color: 'var(--accent-blue)', textDecoration: 'none' }}
              onClick={() => setIsOpen(false)}
            >
              {t('commission.viewLeaderboard', '查看业绩榜 ➔')}
            </a>
          </div>

          {/* Dual Status Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
            <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', padding: '8px 10px', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--accent-amber)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <i className="ph-bold ph-lock-simple"></i>
                <span>{t('commission.pendingInGuarantee', '保证期内 (待解锁)')}</span>
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '2px' }}>
                {formatCommissionCurrency(walletSummary.pending, 'MYR')}
              </div>
            </div>

            <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', padding: '8px 10px', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '0.7rem', color: '#10B981', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <i className="ph-bold ph-check-circle"></i>
                <span>{t('commission.readyForPayout', '已到期 (可结算)')}</span>
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: '800', color: 'var(--text-primary)', marginTop: '2px' }}>
                {formatCommissionCurrency(walletSummary.unlocked, 'MYR')}
              </div>
            </div>
          </div>

          {/* Active Deals Mini List */}
          <div style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
            {t('commission.recentDealsList', '近期成单分成流水')}
          </div>

          {walletSummary.activeDeals.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '16px 8px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {t('commission.noDealsYet', '暂无入账成单流水，首单加油破冰！')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
              {walletSummary.activeDeals.map((deal) => (
                <div
                  key={deal.id}
                  style={{
                    background: 'var(--bg-subtle, rgba(255,255,255,0.02))',
                    border: '1px solid var(--border-hairline)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '6px 8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1, paddingRight: '8px' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {deal.candidateName}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {deal.companyName} · {deal.position}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: '700', color: deal.isActuallyUnlocked ? '#10B981' : 'var(--text-primary)' }}>
                      +{formatCommissionCurrency(deal.myAmount, 'MYR')}
                    </div>
                    <span
                      className="badge"
                      style={{
                        fontSize: '9px',
                        padding: '1px 5px',
                        background: deal.isActuallyUnlocked ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                        color: deal.isActuallyUnlocked ? '#10B981' : 'var(--accent-amber)',
                        borderColor: deal.isActuallyUnlocked ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'
                      }}
                    >
                      {deal.isActuallyUnlocked ? t('commission.unlockedBadge', '可结算') : `${deal.remainingDays} ${t('common.days', '天')}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
