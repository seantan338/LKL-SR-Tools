'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useNotifications } from '../lib/notification-context';
import { useAuth } from '../lib/auth-context';
import { useFeedback } from '../lib/feedback-context';
import { useI18n } from '../lib/i18n-context';
import { FirestoreStore } from '../lib/firestore-store';
import { SystemLogger } from '../lib/logger';

export default function GlobalQuickFab() {
  const [isOpen, setIsOpen] = useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackData, setFeedbackData] = useState({
    category: 'feature',
    title: '',
    content: '',
    priority: 'medium'
  });

  const router = useRouter();
  const pathname = usePathname();
  const { openCandidateDrawer } = useNotifications();
  const { teamId, user, isReadOnlyView, isHqTeam } = useAuth();
  const { showToast } = useFeedback();
  const { t } = useI18n();
  const fabRef = useRef(null);

  // Close menus on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isFeedbackModalOpen) {
          setIsFeedbackModalOpen(false);
        } else if (isOpen) {
          setIsOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isFeedbackModalOpen]);

  if (isReadOnlyView) return null;

  const handleOpenCandidate = () => {
    setIsOpen(false);
    if (openCandidateDrawer) {
      openCandidateDrawer(null);
    }
  };

  const handleOpenJobOrder = () => {
    setIsOpen(false);
    if (pathname === '/orders') {
      window.dispatchEvent(new CustomEvent('open-new-order-modal'));
    } else {
      router.push('/orders?action=new');
    }
  };

  const handleOpenAttendance = () => {
    setIsOpen(false);
    window.dispatchEvent(new CustomEvent('omni_open_attendance_modal'));
  };

  const handleOpenFeedback = () => {
    setIsOpen(false);
    setIsFeedbackModalOpen(true);
  };

  const handleSubmitFeedback = async (e) => {
    e.preventDefault();
    if (!feedbackData.title.trim() || !feedbackData.content.trim()) {
      showToast(t('fab.toastValidate', '请填写反馈标题和详细描述'), 'error');
      return;
    }

    if (!teamId) {
      showToast('未检测到有效团队，无法提交反馈', 'error');
      return;
    }

    setIsSubmittingFeedback(true);
    try {
      await FirestoreStore.addFeedback(teamId, user, feedbackData);
      SystemLogger.audit(teamId, user, 'CREATE', 'FEEDBACK', feedbackData.title, {
        category: feedbackData.category,
        priority: feedbackData.priority
      });
      showToast(t('fab.toastSuccess', '🎉 意见反馈已成功提交，感谢您的宝贵建议！'), 'success');
      setIsFeedbackModalOpen(false);
      setFeedbackData({
        category: 'feature',
        title: '',
        content: '',
        priority: 'medium'
      });
    } catch (err) {
      console.error('Failed to submit feedback via QuickFab:', err);
      showToast('提交失败，请稍后重试: ' + (err.message || ''), 'error');
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  return (
    <>
      {/* Invisible backdrop to dismiss FAB menu when clicking outside */}
      {isOpen && (
        <div 
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 990,
            background: 'rgba(0, 0, 0, 0.25)',
            backdropFilter: 'blur(2px)',
            transition: 'opacity 0.2s ease'
          }}
        />
      )}

      {/* FAB Wrapper */}
      <div 
        ref={fabRef}
        className="global-quick-fab-wrapper"
        style={{
          position: 'fixed',
          right: '28px',
          bottom: '28px',
          zIndex: 995,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          userSelect: 'none'
        }}
      >
        {/* Speed-dial Option Menu */}
        <div 
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            alignItems: 'flex-end',
            marginBottom: '16px',
            opacity: isOpen ? 1 : 0,
            visibility: isOpen ? 'visible' : 'hidden',
            transform: isOpen ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.92)',
            transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            pointerEvents: isOpen ? 'auto' : 'none'
          }}
        >
          {/* Action 1: Add Candidate */}
          <button
            onClick={handleOpenCandidate}
            className="fab-action-item"
            title={t('fab.addCandidate', '增加候选人')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '8px 18px 8px 10px',
              borderRadius: '999px',
              background: 'rgba(18, 22, 34, 0.92)',
              border: '1px solid rgba(59, 130, 246, 0.35)',
              boxShadow: '0 8px 28px rgba(0,0,0,0.45), 0 0 15px rgba(59, 130, 246, 0.2)',
              backdropFilter: 'blur(16px)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              outline: 'none'
            }}
          >
            <div 
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                boxShadow: '0 2px 10px rgba(16, 185, 129, 0.4)'
              }}
            >
              <i className="ph-bold ph-user-plus"></i>
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#ffffff', lineHeight: 1.2 }}>
                {t('fab.addCandidate', '增加候选人')}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.2, marginTop: '2px' }}>
                {t('fab.addCandidateSub', 'AI 解析 / 手动录入')}
              </div>
            </div>
          </button>

          {/* Action 2: Add Job Order */}
          <button
            onClick={handleOpenJobOrder}
            className="fab-action-item"
            title={t('fab.addOrder', '增加招聘订单')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '8px 18px 8px 10px',
              borderRadius: '999px',
              background: 'rgba(18, 22, 34, 0.92)',
              border: '1px solid rgba(139, 92, 246, 0.35)',
              boxShadow: '0 8px 28px rgba(0,0,0,0.45), 0 0 15px rgba(139, 92, 246, 0.2)',
              backdropFilter: 'blur(16px)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              outline: 'none'
            }}
          >
            <div 
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                boxShadow: '0 2px 10px rgba(139, 92, 246, 0.4)'
              }}
            >
              <i className="ph-bold ph-briefcase"></i>
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#ffffff', lineHeight: 1.2 }}>
                {t('fab.addOrder', '增加招聘订单')}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.2, marginTop: '2px' }}>
                {t('fab.addOrderSub', '岗位 JD / 职位需求')}
              </div>
            </div>
          </button>

          {/* Action 3: Attendance Check-in (HQ only) */}
          {isHqTeam && (
          <button
            onClick={handleOpenAttendance}
            className="fab-action-item"
            title={t('fab.attendance', '考勤打卡')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '8px 18px 8px 10px',
              borderRadius: '999px',
              background: 'rgba(18, 22, 34, 0.92)',
              border: '1px solid rgba(14, 165, 233, 0.35)',
              boxShadow: '0 8px 28px rgba(0,0,0,0.45), 0 0 15px rgba(14, 165, 233, 0.2)',
              backdropFilter: 'blur(16px)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              outline: 'none'
            }}
          >
            <div 
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                boxShadow: '0 2px 10px rgba(14, 165, 233, 0.4)'
              }}
            >
              <i className="ph-bold ph-clock-user"></i>
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#ffffff', lineHeight: 1.2 }}>
                {t('fab.attendance', '考勤打卡')}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.2, marginTop: '2px' }}>
                {t('fab.attendanceSub', '日常签到 / 签退')}
              </div>
            </div>
          </button>
          )}

          {/* Action 4: Submit Feedback (写意见反馈) */}
          <button
            onClick={handleOpenFeedback}
            className="fab-action-item"
            title={t('fab.feedback', '写意见反馈')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '8px 18px 8px 10px',
              borderRadius: '999px',
              background: 'rgba(18, 22, 34, 0.92)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              boxShadow: '0 8px 28px rgba(0,0,0,0.45), 0 0 15px rgba(245, 158, 11, 0.2)',
              backdropFilter: 'blur(16px)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              outline: 'none'
            }}
          >
            <div 
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                boxShadow: '0 2px 10px rgba(245, 158, 11, 0.4)'
              }}
            >
              <i className="ph-bold ph-chat-circle-dots"></i>
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#ffffff', lineHeight: 1.2 }}>
                {t('fab.feedback', '写意见反馈')}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.2, marginTop: '2px' }}>
                {t('fab.feedbackSub', '提需求 / 报修 / 优化')}
              </div>
            </div>
          </button>
        </div>

        {/* Main Trigger Floating Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          aria-label={isOpen ? t('fab.collapse', '收起快捷菜单') : t('fab.quickCreate', '快捷新建')}
          title={isOpen ? t('fab.collapse', '收起快捷菜单') : t('fab.quickCreate', '快捷新建')}
          style={{
            width: '52px',
            height: '52px',
            borderRadius: '50%',
            background: isOpen 
              ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' 
              : 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
            color: '#ffffff',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            boxShadow: isOpen 
              ? '0 6px 24px rgba(239, 68, 68, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.4)' 
              : '0 6px 24px rgba(59, 130, 246, 0.55), inset 0 1px 1px rgba(255, 255, 255, 0.4)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '22px',
            transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
            transform: isOpen ? 'rotate(135deg) scale(1.05)' : 'rotate(0deg) scale(1)',
            outline: 'none'
          }}
          onMouseEnter={(e) => {
            if (!isOpen) e.currentTarget.style.transform = 'scale(1.08)';
          }}
          onMouseLeave={(e) => {
            if (!isOpen) e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <i className="ph-bold ph-plus"></i>
        </button>

        <style jsx>{`
          .fab-action-item:hover {
            transform: translateX(-4px) scale(1.02);
            border-color: rgba(255, 255, 255, 0.35) !important;
            background: rgba(26, 32, 48, 0.98) !important;
          }
          .fab-action-item:active {
            transform: scale(0.98);
          }
        `}</style>
      </div>

      {/* Floating Quick Feedback Modal */}
      {isFeedbackModalOpen && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            animation: 'fadeIn 0.2s ease-out'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsFeedbackModalOpen(false);
          }}
        >
          <div 
            className="bezel-shell" 
            style={{ 
              maxWidth: '560px', 
              width: '100%', 
              boxShadow: '0 24px 60px rgba(0,0,0,0.6), 0 0 40px rgba(245, 158, 11, 0.15)' 
            }}
          >
            <div className="bezel-core" style={{ padding: 'var(--space-6)' }}>
              
              {/* Modal Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(245, 158, 11, 0.15)',
                    color: 'var(--accent-amber)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '22px'
                  }}>
                    <i className="ph-bold ph-chat-circle-dots"></i>
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                      {t('fab.feedbackModalTitle', '写意见反馈与需求建议')}
                    </h3>
                    <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {t('fab.feedbackModalSubtitle', '无论是新功能设想、使用体验槽点还是系统 Bug，我们都第一时间倾听并跟进优化')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsFeedbackModalOpen(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '20px',
                    padding: '4px'
                  }}
                >
                  <i className="ph-bold ph-x"></i>
                </button>
              </div>

              {/* Form Content */}
              <form onSubmit={handleSubmitFeedback}>
                {/* Category Pills */}
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <label className="form-label" style={{ marginBottom: '8px', display: 'block' }}>
                    {t('fab.labelCategory', '反馈类别')}
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                    {[
                      { key: 'feature', icon: 'ph-lightbulb', label: t('fab.categoryFeature', '功能建议'), color: 'var(--accent-blue)' },
                      { key: 'ux', icon: 'ph-paint-brush', label: t('fab.categoryUx', '体验优化'), color: 'var(--accent-purple)' },
                      { key: 'bug', icon: 'ph-bug', label: t('fab.categoryBug', '问题报修'), color: 'var(--accent-rose)' },
                      { key: 'other', icon: 'ph-chat-circle-text', label: t('fab.categoryOther', '其他想法'), color: 'var(--accent-amber)' },
                    ].map(cat => {
                      const isSelected = feedbackData.category === cat.key;
                      return (
                        <button
                          key={cat.key}
                          type="button"
                          onClick={() => setFeedbackData(prev => ({ ...prev, category: cat.key }))}
                          style={{
                            padding: '8px 4px',
                            borderRadius: 'var(--radius-sm)',
                            border: isSelected ? `1px solid ${cat.color}` : '1px solid var(--border-subtle)',
                            background: isSelected ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)',
                            color: isSelected ? cat.color : 'var(--text-secondary)',
                            fontWeight: isSelected ? '600' : '400',
                            fontSize: '0.8rem',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '4px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <i className={`ph-bold ${cat.icon}`} style={{ fontSize: '16px' }}></i>
                          <span>{cat.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Priority */}
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <label className="form-label" style={{ marginBottom: '6px', display: 'block' }}>
                    {t('fab.labelPriority', '期望跟进紧迫度')}
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {[
                      { key: 'low', label: t('fab.priorityLow', '日常体验 (Low)') },
                      { key: 'medium', label: t('fab.priorityMedium', '期望改进 (Medium)') },
                      { key: 'high', label: t('fab.priorityHigh', '紧急需要 (High)') }
                    ].map(p => {
                      const isSelected = feedbackData.priority === p.key;
                      return (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => setFeedbackData(prev => ({ ...prev, priority: p.key }))}
                          style={{
                            flex: 1,
                            padding: '6px 10px',
                            borderRadius: 'var(--radius-pill)',
                            border: isSelected ? '1px solid var(--accent-amber)' : '1px solid var(--border-subtle)',
                            background: isSelected ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
                            color: isSelected ? 'var(--accent-amber)' : 'var(--text-muted)',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Title */}
                <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
                  <label className="form-label" style={{ marginBottom: '6px', display: 'block' }}>
                    {t('fab.labelTitle', '反馈标题')} *
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={feedbackData.title}
                    onChange={(e) => setFeedbackData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder={t('fab.placeholderTitle', '一句话概括您的建议或遇到的问题...')}
                    required
                  />
                </div>

                {/* Content */}
                <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
                  <label className="form-label" style={{ marginBottom: '6px', display: 'block' }}>
                    {t('fab.labelContent', '详细描述与改进设想')} *
                  </label>
                  <textarea
                    className="form-input"
                    rows="4"
                    value={feedbackData.content}
                    onChange={(e) => setFeedbackData(prev => ({ ...prev, content: e.target.value }))}
                    placeholder={t('fab.placeholderContent', '请详细描述您遇到的问题场景、期望的交互方式或期待增加的新功能...')}
                    style={{ resize: 'vertical' }}
                    required
                  />
                </div>

                {/* Footer Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border-subtle)' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsFeedbackModalOpen(false);
                      router.push('/feedback');
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-blue)',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      padding: 0,
                      textDecoration: 'underline'
                    }}
                  >
                    {t('fab.viewAllLink', '前往意见反馈中心查看历史进度 →')}
                  </button>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setIsFeedbackModalOpen(false)}
                      disabled={isSubmittingFeedback}
                    >
                      {t('fab.btnCancel', '取消')}
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary btn-sm"
                      disabled={isSubmittingFeedback}
                      style={{ background: 'var(--accent-amber)', color: '#000', fontWeight: '600' }}
                    >
                      {isSubmittingFeedback ? (
                        <><i className="ph-light ph-spinner ph-spin"></i> {t('fab.btnSubmitting', '正在提交...')}</>
                      ) : (
                        <><i className="ph-bold ph-paper-plane-tilt"></i> {t('fab.btnSubmit', '提交反馈')}</>
                      )}
                    </button>
                  </div>
                </div>
              </form>

            </div>
          </div>
        </div>
      )}
    </>
  );
}
