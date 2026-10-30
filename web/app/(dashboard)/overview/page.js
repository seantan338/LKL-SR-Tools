'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/auth-context';
import { useNotifications } from '../../../lib/notification-context';
import { useI18n } from '../../../lib/i18n-context';
import { FirestoreStore } from '../../../lib/firestore-store';
import { Utils } from '../../../lib/utils';
import CandidateDrawer from '../../../components/CandidateDrawer';
import ExpenseClaimModal from '../../../components/ExpenseClaimModal';

export default function OverviewPage() {
  const { teamId, role, user, isHqTeam, isOwner, isManager } = useAuth();
  const { candidates, candidatesLoading: loading } = useNotifications();
  const { t } = useI18n();
  const router = useRouter();

  const [latestFilter, setLatestFilter] = useState('all'); // 'all', 'active', 'rejected'
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);

  const handleOpenCandidate = (candidate) => {
    setSelectedCandidate(candidate);
    setIsDrawerOpen(true);
  };

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const handleGoAttendance = () => {
    router.push('/leaderboard?tab=my_attendance');
  };

  const handleQuickPunch = (e) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('omni_open_attendance_modal'));
  };

  const handleGoClaims = () => {
    router.push('/claims');
  };

  const handleOpenNewClaim = (e) => {
    e.stopPropagation();
    setIsClaimModalOpen(true);
  };

  useEffect(() => {
    const onGlobalRefresh = () => handleRefresh();
    window.addEventListener('talent_flow_refresh', onGlobalRefresh);
    return () => window.removeEventListener('talent_flow_refresh', onGlobalRefresh);
  }, []);
// Derived state
  const activeCandidates = candidates.filter(c => c.status !== 'rejected');
  const total = activeCandidates.length;
  const active = activeCandidates.filter(c => ['screening', 'phone', 'interview', 'offer', 'pre_onboarding'].includes(c.stage)).length;
  const offerAndOnboard = activeCandidates.filter(c => ['offer', 'pre_onboarding', 'onboarding', 'post_onboarding'].includes(c.stage)).length;
  const rate = total > 0 ? ((offerAndOnboard / total) * 100).toFixed(1) : '0.0';

  const today = Utils.formatDate(new Date());
  const next7DaysDate = new Date();
  next7DaysDate.setDate(next7DaysDate.getDate() + 7);
  const maxUpcomingDate = Utils.formatDate(next7DaysDate);

  const upcomingInterviews = candidates
    .map(c => ({
      ...c,
      _formattedInterviewDate: Utils.formatDate(c.interviewDate)
    }))
    .filter(c => {
      const d = c._formattedInterviewDate;
      return d && d !== '-' && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= today && d <= maxUpcomingDate;
    })
    .sort((a, b) => {
      const timeA = a.interviewTime || '00:00';
      const timeB = b.interviewTime || '00:00';
      const dtA = `${a._formattedInterviewDate} ${timeA}`;
      const dtB = `${b._formattedInterviewDate} ${timeB}`;
      return dtA.localeCompare(dtB);
    });

  return (
    <div className="page-view active" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', paddingBottom: 'var(--space-4)' }}>
      {/* 1. 紧凑型顶部核心指标条 (Compact Metrics Bar) */}
      <div className="overview-metrics-grid">
        {/* 指标 1 */}
        <div className="bezel-shell" style={{ padding: '4px' }}>
          <div className="bezel-core" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
                {t('overview.totalActive', '总活跃候选人')}
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 }}>
                {total}
              </div>
            </div>
            <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-blue-glow)', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
              <i className="ph-fill ph-users"></i>
            </div>
          </div>
        </div>

        {/* 指标 2 */}
        <div className="bezel-shell" style={{ padding: '4px' }}>
          <div className="bezel-core" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
                {t('overview.inProgress', '进行中流转')}
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 }}>
                {active}
              </div>
            </div>
            <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-emerald-glow)', color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
              <i className="ph-fill ph-activity"></i>
            </div>
          </div>
        </div>

        {/* 指标 3 */}
        <div className="bezel-shell" style={{ padding: '4px' }}>
          <div className="bezel-core" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
                {t('overview.upcomingInterviews', '即将排期面试')}
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 }}>
                {upcomingInterviews.length}
              </div>
            </div>
            <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-amber-glow)', color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
              <i className="ph-fill ph-calendar-check"></i>
            </div>
          </div>
        </div>

        {/* 指标 4 */}
        <div className="bezel-shell" style={{ padding: '4px' }}>
          <div className="bezel-core" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
                {t('overview.offerRate', 'Offer 转化率')}
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 }}>
                {rate}%
              </div>
            </div>
            <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', background: 'var(--accent-violet-glow)', color: 'var(--accent-violet)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
              <i className="ph-fill ph-target"></i>
            </div>
          </div>
        </div>
      </div>

      {/* 1.5 HQ 本部核心运营直通入口 (Attendance & Claims Quick Hub) */}
      {isHqTeam && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: (isOwner || isManager) ? 'repeat(auto-fit, minmax(320px, 1fr))' : '1fr',
          gap: 'var(--space-4)'
        }}>
          {/* Card 1: 考勤与出席直达 (Attendance Hub) */}
          <div 
            className="bezel-shell" 
            style={{ 
              padding: '4px',
              cursor: 'pointer',
              transition: 'transform 0.18s ease, box-shadow 0.18s ease'
            }}
            onClick={handleGoAttendance}
            title={t('overview.quickAttendanceSub', '今日打卡 · 考勤明细 · 请假与调休管理')}
          >
            <div 
              className="bezel-core" 
              style={{ 
                padding: '0.85rem 1.15rem', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
                <div 
                  style={{ 
                    width: '42px', 
                    height: '42px', 
                    borderRadius: 'var(--radius-md)', 
                    background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.22) 0%, rgba(2, 132, 199, 0.35) 100%)', 
                    color: '#38bdf8', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    fontSize: '1.4rem',
                    boxShadow: '0 2px 10px rgba(14, 165, 233, 0.25)',
                    flexShrink: 0
                  }}
                >
                  <i className="ph-fill ph-clock-user"></i>
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                    <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                      {t('overview.quickAttendanceTitle', '出席记录与考勤')}
                    </span>
                    <span style={{ 
                      fontSize: '0.68rem', 
                      padding: '1px 7px', 
                      borderRadius: '999px', 
                      background: 'rgba(14, 165, 233, 0.12)', 
                      color: '#38bdf8',
                      border: '1px solid rgba(14, 165, 233, 0.25)',
                      fontWeight: 600
                    }}>
                      HQ
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t('overview.quickAttendanceSub', '今日打卡 · 考勤明细 · 请假与调休管理')}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  style={{
                    height: '32px',
                    fontSize: '12px',
                    gap: '5px',
                    padding: '0 10px',
                    borderColor: 'rgba(14, 165, 233, 0.3)',
                    color: 'var(--text-primary)'
                  }}
                  onClick={handleQuickPunch}
                  title={t('overview.quickPunchBtn', '快捷打卡')}
                >
                  <i className="ph-bold ph-fingerprint" style={{ color: '#38bdf8' }}></i>
                  <span>{t('overview.quickPunchBtn', '快捷打卡')}</span>
                </button>

                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  style={{
                    height: '32px',
                    fontSize: '12px',
                    gap: '5px',
                    padding: '0 12px',
                    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                    border: 'none',
                    color: '#fff',
                    fontWeight: '600',
                    boxShadow: '0 3px 10px rgba(2, 132, 199, 0.3)'
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleGoAttendance();
                  }}
                >
                  <span>{t('overview.quickAttendanceBtn', '前往考勤台')}</span>
                  <i className="ph-bold ph-arrow-up-right"></i>
                </button>
              </div>
            </div>
          </div>

          {/* Card 2: 报销与费用审批直达 (Claims Hub - Admin/Manager only during testing) */}
          {(isOwner || isManager) && (
            <div 
              className="bezel-shell" 
              style={{ 
                padding: '4px',
                cursor: 'pointer',
                transition: 'transform 0.18s ease, box-shadow 0.18s ease'
              }}
              onClick={handleGoClaims}
              title={t('overview.quickClaimsSub', '我的报销进度 · 智能票据识别 · 审批与批次放款')}
            >
              <div 
                className="bezel-core" 
                style={{ 
                  padding: '0.85rem 1.15rem', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
                  <div 
                    style={{ 
                      width: '42px', 
                      height: '42px', 
                      borderRadius: 'var(--radius-md)', 
                      background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.22) 0%, rgba(5, 150, 105, 0.35) 100%)', 
                      color: '#34d399', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      fontSize: '1.4rem',
                      boxShadow: '0 2px 10px rgba(16, 185, 129, 0.25)',
                      flexShrink: 0
                    }}
                  >
                    <i className="ph-fill ph-receipt"></i>
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                      <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                        {t('overview.quickClaimsTitle', '费用与报销')}
                      </span>
                      <span style={{ 
                        fontSize: '0.68rem', 
                        padding: '1px 7px', 
                        borderRadius: '999px', 
                        background: 'rgba(16, 185, 129, 0.12)', 
                        color: '#34d399',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                        fontWeight: 600
                      }}>
                        {t('overview.adminBadge', '管理专享')}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t('overview.quickClaimsSub', '我的报销进度 · 智能票据识别 · 审批与批次放款')}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    style={{
                      height: '32px',
                      fontSize: '12px',
                      gap: '5px',
                      padding: '0 10px',
                      borderColor: 'rgba(16, 185, 129, 0.3)',
                      color: 'var(--text-primary)'
                    }}
                    onClick={handleOpenNewClaim}
                    title={t('overview.quickSubmitClaimBtn', '发起报销')}
                  >
                    <i className="ph-bold ph-plus" style={{ color: '#34d399' }}></i>
                    <span>{t('overview.quickSubmitClaimBtn', '发起报销')}</span>
                  </button>

                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    style={{
                      height: '32px',
                      fontSize: '12px',
                      gap: '5px',
                      padding: '0 12px',
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      border: 'none',
                      color: '#fff',
                      fontWeight: '600',
                      boxShadow: '0 3px 10px rgba(16, 185, 129, 0.3)'
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleGoClaims();
                    }}
                  >
                    <span>{t('overview.quickClaimsBtn', '进入报销中心')}</span>
                    <i className="ph-bold ph-arrow-up-right"></i>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. 双侧对称 6-6 黄金核心看板 (移动端自适应堆叠) */}
      <div className="overview-boards-grid">
        {/* 左侧: 近期排期 (Upcoming) */}
        <div className="bezel-shell overview-board-column">
          <div className="bezel-core" style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 'var(--space-4) var(--space-5)' }}>
            
            {/* 卡片头部 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)', paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--border-hairline)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="ph-fill ph-calendar-check" style={{ color: 'var(--accent-amber)', fontSize: '1.15rem' }}></i>
                <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)' }}>{t('overview.upcomingTitle', '近期排期')}</h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>({upcomingInterviews.length})</span>
              </div>
              <button 
                className="btn-icon" 
                onClick={handleRefresh} 
                title={t('common.refresh', '刷新数据')} 
                style={{ width: '28px', height: '28px', borderRadius: 'var(--radius-sm)', opacity: 0.75 }}
              >
                <i className="ph-bold ph-arrows-clockwise" style={{ fontSize: '0.875rem' }}></i>
              </button>
            </div>

            {/* 列表区域 (独立顺畅滚动) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '4px' }}>
              {upcomingInterviews.length === 0 ? (
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column',
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  margin: 'auto',
                  gap: '8px', 
                  color: 'var(--text-muted)', 
                  fontSize: '0.8125rem', 
                  padding: 'var(--space-4) 0' 
                }}>
                  <i className="ph-light ph-calendar-check" style={{ fontSize: '1.75rem', color: 'var(--accent-amber)', opacity: 0.75, marginBottom: '2px' }}></i>
                  <span>{t('overview.noUpcoming', '暂无近期排期的面试')}</span>
                </div>
              ) : (
                upcomingInterviews.map(c => (
                  <div 
                    key={c.id} 
                    onClick={() => handleOpenCandidate(c)}
                    style={{ 
                      display: 'flex', 
                      flexDirection: 'column',
                      gap: '6px',
                      padding: '10px 14px', 
                      background: 'rgba(255, 255, 255, 0.025)', 
                      borderRadius: 'var(--radius-md)', 
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      transition: 'all 0.15s ease',
                      cursor: 'pointer',
                      width: '100%',
                      minWidth: 0,
                      boxSizing: 'border-box',
                      flexShrink: 0
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.045)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
                    }}
                  >
                    {/* 上层: 姓名 + 日期时间胶囊 */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.84rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {c.name}
                        </span>
                      </div>
                      <span style={{
                        fontSize: '0.72rem',
                        fontFamily: 'var(--font-mono)',
                        padding: '1px 7px',
                        background: 'rgba(59, 130, 246, 0.12)',
                        color: 'var(--accent-blue)',
                        borderRadius: 'var(--radius-pill)',
                        border: '1px solid rgba(59, 130, 246, 0.25)',
                        flexShrink: 0,
                        whiteSpace: 'nowrap'
                      }}>
                        {c._formattedInterviewDate || Utils.formatDate(c.interviewDate)} {c.interviewTime || ''}
                      </span>
                    </div>

                    {/* 下层: 企业微标 + 岗位与电话详情 */}
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', whiteSpace: 'nowrap', width: '100%', minWidth: 0 }}>
                      {c.company && (
                        <span style={{
                          fontSize: '0.68rem',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          background: 'rgba(16, 185, 129, 0.08)',
                          color: 'var(--accent-emerald)',
                          border: '1px solid rgba(16, 185, 129, 0.2)',
                          whiteSpace: 'nowrap',
                          maxWidth: '120px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '2px',
                          flexShrink: 0
                        }}>
                          <i className="ph-light ph-buildings"></i>{c.company}
                        </span>
                      )}
                      {c.position && (
                        <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>
                          {c.position}
                        </span>
                      )}
                      {c.phone && (
                        <span style={{ fontFamily: 'var(--font-mono)', marginLeft: 'auto', flexShrink: 0 }}>
                          <i className="ph-light ph-phone" style={{ marginRight: '3px', fontSize: '11px' }}></i>
                          {c.phone}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

          </div>
        </div>

        {/* 右侧: 最新录入记录 (Recent Candidate Records) */}
        <div className="bezel-shell overview-board-column">
          <div className="bezel-core" style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 'var(--space-4) var(--space-5)' }}>
            
            {/* 卡片头部 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)', paddingBottom: 'var(--space-2)', borderBottom: '1px solid var(--border-hairline)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="ph-fill ph-clock-counter-clockwise" style={{ color: 'var(--accent-blue)', fontSize: '1.15rem' }}></i>
                <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)' }}>{t('overview.latestRecords', '最新录入记录')}</h3>
              </div>
              
              {/* 过滤下拉选框 */}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <select 
                  style={{ 
                    appearance: 'none', 
                    background: 'rgba(255, 255, 255, 0.04)', 
                    border: '1px solid var(--border-hairline)', 
                    color: 'var(--text-secondary)', 
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.75rem', 
                    cursor: 'pointer', 
                    outline: 'none', 
                    padding: '2px 22px 2px 8px'
                  }}
                  value={latestFilter}
                  onChange={(e) => setLatestFilter(e.target.value)}
                >
                  <option value="all">{t('overview.filterAll', '全部显示')}</option>
                  <option value="active">{t('overview.filterActive', '仅进行中')}</option>
                  <option value="rejected">{t('overview.filterRejected', '仅已淘汰')}</option>
                </select>
                <i className="ph-light ph-caret-down" style={{ position: 'absolute', right: '6px', pointerEvents: 'none', fontSize: '0.7rem', color: 'var(--text-muted)' }}></i>
              </div>
            </div>

            {/* 列表区域 (两行紧凑架构，绝对不换行撑裂) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
              {(() => {
                let filtered = candidates;
                if (latestFilter === 'active') filtered = activeCandidates;
                if (latestFilter === 'rejected') filtered = candidates.filter(c => c.status === 'rejected');

                // 严格依据候选人实际录入/变动时间倒序排序 (精确到毫秒)
                filtered = [...filtered].sort((a, b) => Utils.getCandidateTimestamp(b) - Utils.getCandidateTimestamp(a));
                
                if (filtered.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', margin: 'auto', color: 'var(--text-muted)', fontSize: 'var(--text-sm)', padding: 'var(--space-4) 0' }}>
                      <i className="ph-light ph-tray" style={{ fontSize: '1.5rem', display: 'block', marginBottom: 'var(--space-1)', opacity: 0.4 }}></i>
                      {t('overview.noRecords', '暂无符合条件的记录')}
                    </div>
                  );
                }

                return filtered.map(c => {
                  const stageMeta = Utils.getStageMeta(c.stage, t);
                  return (
                    <div 
                      key={c.id} 
                      onClick={() => handleOpenCandidate(c)}
                      style={{ 
                        display: 'flex', 
                        flexDirection: 'column',
                        gap: '6px',
                        padding: '10px 14px', 
                        background: 'rgba(255, 255, 255, 0.025)', 
                        borderRadius: 'var(--radius-md)', 
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        transition: 'all 0.15s ease',
                        cursor: 'pointer',
                        width: '100%',
                        minWidth: 0,
                        boxSizing: 'border-box',
                        flexShrink: 0
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.045)';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
                      }}
                    >
                      {/* 上层: 姓名 + 阶段状态 + 相对时间 (无论名字多长，右侧徽章与时间始终稳定对齐) */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.84rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {c.name}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                          <span
                            className={`badge ${c.status === 'rejected' ? 'badge-stage-rejected' : stageMeta.badgeClass}`}
                            style={{ fontSize: '0.68rem', padding: '1px 6px', whiteSpace: 'nowrap' }}
                          >
                            <span className="badge-dot" style={{ width: '5px', height: '5px' }}></span>
                            {c.status === 'rejected' ? t('candidates.rejected', '已淘汰') : t(`common.stages.${c.stage}`, stageMeta.label)}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', minWidth: '40px', textAlign: 'right', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>
                            {Utils.formatRelativeTime(c.createdAt, t, c)}
                          </span>
                        </div>
                      </div>

                      {/* 下层: 企业微标 + 岗位 + 电话 (单行截断，企业微标限制最大宽度避免撑裂) */}
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', whiteSpace: 'nowrap', width: '100%', minWidth: 0 }}>
                        {c.company && (
                          <span style={{
                            fontSize: '0.68rem',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: 'rgba(16, 185, 129, 0.08)',
                            color: 'var(--accent-emerald)',
                            border: '1px solid rgba(16, 185, 129, 0.2)',
                            whiteSpace: 'nowrap',
                            maxWidth: '120px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            flexShrink: 0
                          }}>
                            <i className="ph-light ph-buildings"></i>{c.company}
                          </span>
                        )}
                        {c.position && (
                          <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>
                            {c.position}
                          </span>
                        )}
                        {c.phone && (
                          <span style={{ fontFamily: 'var(--font-mono)', marginLeft: 'auto', flexShrink: 0, opacity: 0.85 }}>
                            <i className="ph-light ph-phone" style={{ marginRight: '2px', fontSize: '10px' }}></i>
                            {c.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

          </div>
        </div>
      </div>

      {isDrawerOpen && (
        <CandidateDrawer 
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          candidate={selectedCandidate}
        />
      )}

      {/* 3. Expense Claim Modal (HQ Admin / Manager Quick Access) */}
      {isHqTeam && (isOwner || isManager) && (
        <ExpenseClaimModal
          isOpen={isClaimModalOpen}
          onClose={() => setIsClaimModalOpen(false)}
        />
      )}
    </div>
  );
}
