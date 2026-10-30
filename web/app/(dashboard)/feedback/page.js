'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../../lib/auth-context';
import { useFeedback } from '../../../lib/feedback-context';
import { useI18n } from '../../../lib/i18n-context';
import { FirestoreStore } from '../../../lib/firestore-store';
import { SystemLogger } from '../../../lib/logger';
import { Utils } from '../../../lib/utils';

const CATEGORIES_META = {
  feature: { icon: 'ph-lightbulb', color: 'var(--accent-blue)', bg: 'rgba(59, 130, 246, 0.1)' },
  bug: { icon: 'ph-bug', color: 'var(--accent-rose)', bg: 'rgba(244, 63, 94, 0.1)' },
  ux: { icon: 'ph-paint-brush', color: 'var(--accent-purple)', bg: 'rgba(168, 85, 247, 0.1)' },
  other: { icon: 'ph-chat-circle-text', color: 'var(--accent-amber)', bg: 'rgba(245, 158, 11, 0.1)' },
};

const STATUS_META = {
  pending: { color: 'var(--text-muted)', bg: 'rgba(255, 255, 255, 0.05)', dot: '#94a3b8' },
  in_review: { color: 'var(--accent-amber)', bg: 'rgba(245, 158, 11, 0.1)', dot: '#f59e0b' },
  resolved: { color: 'var(--accent-emerald)', bg: 'rgba(16, 185, 129, 0.1)', dot: '#10b981' },
  closed: { color: 'var(--text-faint)', bg: 'rgba(255, 255, 255, 0.02)', dot: '#64748b' },
};

const PRIORITIES_META = {
  low: { color: 'var(--text-muted)' },
  medium: { color: 'var(--accent-blue)' },
  high: { color: 'var(--accent-rose)' },
};

export default function FeedbackPage() {
  const { teamId, user, role, isOwner } = useAuth();
  const { confirm } = useFeedback();
  const { t } = useI18n();
  const [feedbackList, setFeedbackList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    category: 'feature',
    title: '',
    content: '',
    priority: 'medium'
  });

  // Admin Response Modal
  const [respondingFeedback, setRespondingFeedback] = useState(null);
  const [adminNoteText, setAdminNoteText] = useState('');

  // Toast
  const [toastMsg, setToastMsg] = useState('');
  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const getCategoryLabel = (catKey) => {
    switch (catKey) {
      case 'feature': return t('feedbackPage.catFeature', '功能建议');
      case 'bug': return t('feedbackPage.catBug', '问题报修');
      case 'ux': return t('feedbackPage.catUx', '体验优化');
      case 'other': return t('feedbackPage.catOther', '其他想法');
      default: return catKey;
    }
  };

  const getStatusLabel = (statusKey, full = false) => {
    switch (statusKey) {
      case 'pending': return t('feedbackPage.statusPending', '待评估');
      case 'in_review': return t('feedbackPage.statusInReview', '推进中');
      case 'resolved': return full ? t('feedbackPage.statusResolvedFull', '已采纳/解决') : t('feedbackPage.statusResolved', '已解决');
      case 'closed': return t('feedbackPage.statusClosed', '已关闭');
      default: return statusKey;
    }
  };

  const getPriorityLabel = (priKey, withDesc = false) => {
    switch (priKey) {
      case 'low': return withDesc ? t('feedbackPage.priorityLowDesc', '日常体验 (不紧急)') : t('feedbackPage.priorityLow', '日常体验');
      case 'medium': return withDesc ? t('feedbackPage.priorityMediumDesc', '期望改进 (建议近期)') : t('feedbackPage.priorityMedium', '期望改进');
      case 'high': return withDesc ? t('feedbackPage.priorityHighDesc', '紧急需要 (影响作业)') : t('feedbackPage.priorityHigh', '紧急需要');
      default: return priKey;
    }
  };

  useEffect(() => {
    if (!teamId) return;

    const unsubscribe = FirestoreStore.subscribeToFeedback(teamId, (data) => {
      setFeedbackList(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [teamId]);

  const filteredItems = useMemo(() => {
    return feedbackList.filter(item => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const text = [item.title, item.content, item.creatorName, item.adminNote].filter(Boolean).join(' ').toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [feedbackList, statusFilter, categoryFilter, searchQuery]);

  // Metrics
  const metrics = useMemo(() => {
    const total = feedbackList.length;
    const pending = feedbackList.filter(f => f.status === 'pending').length;
    const inReview = feedbackList.filter(f => f.status === 'in_review').length;
    const resolved = feedbackList.filter(f => f.status === 'resolved').length;
    return { total, pending, inReview, resolved };
  }, [feedbackList]);

  const handleSubmitFeedback = async (e) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.content.trim()) {
      showToast(t('feedbackPage.requiredFieldsToast', '请完整填写标题和详细描述'));
      return;
    }

    setIsSubmitting(true);
    try {
      await FirestoreStore.addFeedback(teamId, user, formData);
      SystemLogger.audit(teamId, user, 'CREATE', 'FEEDBACK', formData.title, {
        actionDetail: `提交了意见反馈 [${getCategoryLabel(formData.category)}]: ${formData.title}`
      });
      setIsModalOpen(false);
      setFormData({ category: 'feature', title: '', content: '', priority: 'medium' });
      showToast(t('feedbackPage.submittedToast', '🎉 感谢您的宝贵建议！我们已收到并将尽快评估。'));
    } catch (err) {
      console.error(err);
      showToast(t('feedbackPage.submitFailedToast', '提交失败: ') + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (item, newStatus) => {
    try {
      await FirestoreStore.updateFeedbackStatus(teamId, item.id, newStatus);
      SystemLogger.audit(teamId, user, 'UPDATE', 'FEEDBACK', item.title, {
        actionDetail: `修改意见状态为: ${getStatusLabel(newStatus)}`
      });
      showToast(`${t('feedbackPage.statusUpdatedToast', '状态已更新为: ')}"${getStatusLabel(newStatus)}"`);
    } catch (err) {
      showToast(t('feedbackPage.statusUpdateFailedToast', '状态更新失败: ') + err.message);
    }
  };

  const handleSaveAdminNote = async () => {
    if (!respondingFeedback) return;
    try {
      await FirestoreStore.updateFeedbackStatus(teamId, respondingFeedback.id, respondingFeedback.status, adminNoteText);
      showToast(t('feedbackPage.replySavedToast', '管理员回复已保存'));
      setRespondingFeedback(null);
      setAdminNoteText('');
    } catch (err) {
      showToast(t('feedbackPage.replySaveFailedToast', '回复保存失败: ') + err.message);
    }
  };

  const handleDelete = async (item) => {
    const ok = await confirm(
      t('feedbackPage.confirmDeleteDesc', '确认永久删除这条反馈意见吗？此操作无法撤销。'),
      {
        title: t('feedbackPage.confirmDeleteTitle', '删除反馈确认'),
        danger: true,
        confirmLabel: t('feedbackPage.confirmDeleteBtn', '确认删除'),
        cancelLabel: t('feedbackPage.cancelBtn', '取消')
      }
    );
    if (!ok) return;
    try {
      await FirestoreStore.deleteFeedback(teamId, item.id);
      SystemLogger.audit(teamId, user, 'DELETE', 'FEEDBACK', item.title);
      showToast(t('feedbackPage.deletedToast', '已删除此条反馈'));
    } catch (err) {
      showToast(t('feedbackPage.deleteFailedToast', '删除失败: ') + err.message);
    }
  };

  const canManage = isOwner || role === 'manager';

  return (
    <div className="page-view active" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Toast Notification */}
      {toastMsg && (
        <div style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          background: 'var(--bg-surface-elevated, #1e293b)',
          color: 'var(--text-primary)',
          border: '1px solid var(--accent-emerald)',
          padding: '12px 20px',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <i className="ph-fill ph-check-circle" style={{ color: 'var(--accent-emerald)', fontSize: '1.2rem' }}></i>
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
        <div className="bezel-shell">
          <div className="bezel-core" style={{ padding: 'var(--space-4)' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', marginBottom: '4px' }}>
              {t('feedbackPage.metricTotal', '总反馈收集')}
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--text-primary)' }}>{metrics.total}</div>
          </div>
        </div>
        <div className="bezel-shell">
          <div className="bezel-core" style={{ padding: 'var(--space-4)' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', marginBottom: '4px' }}>
              {t('feedbackPage.metricPending', '待评估提案')}
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--text-primary)' }}>{metrics.pending}</div>
          </div>
        </div>
        <div className="bezel-shell">
          <div className="bezel-core" style={{ padding: 'var(--space-4)' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', marginBottom: '4px' }}>
              {t('feedbackPage.metricInReview', '正在推进实施')}
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--text-primary)' }}>{metrics.inReview}</div>
          </div>
        </div>
        <div className="bezel-shell">
          <div className="bezel-core" style={{ padding: 'var(--space-4)' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', marginBottom: '4px' }}>
              {t('feedbackPage.metricResolved', '已采纳与解决')}
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--text-primary)' }}>{metrics.resolved}</div>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', flex: 1, maxWidth: '700px' }}>
          {/* Search Box */}
          <div className="combo-input-wrapper" style={{ flex: 1, minWidth: '220px' }}>
            <input 
              type="text" 
              className="form-input" 
              placeholder={t('feedbackPage.searchPlaceholder', '搜索反馈内容、提案人或回复...')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <i className="ph-light ph-magnifying-glass"></i>
          </div>

          {/* Status Filter */}
          <select 
            className="form-select" 
            style={{ width: 'auto', minWidth: '130px' }}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="all">{t('feedbackPage.allStatuses', '所有状态')}</option>
            <option value="pending">{t('feedbackPage.statusPending', '待评估')}</option>
            <option value="in_review">{t('feedbackPage.statusInReview', '推进中')}</option>
            <option value="resolved">{t('feedbackPage.statusResolved', '已解决')}</option>
            <option value="closed">{t('feedbackPage.statusClosed', '已关闭')}</option>
          </select>

          {/* Category Filter */}
          <select 
            className="form-select" 
            style={{ width: 'auto', minWidth: '130px' }}
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
          >
            <option value="all">{t('feedbackPage.allCategories', '所有分类')}</option>
            <option value="feature">{t('feedbackPage.catFeature', '功能建议')}</option>
            <option value="bug">{t('feedbackPage.catBug', '问题报修')}</option>
            <option value="ux">{t('feedbackPage.catUx', '体验优化')}</option>
            <option value="other">{t('feedbackPage.catOther', '其他想法')}</option>
          </select>
        </div>

        <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
          <i className="ph-bold ph-plus"></i> {t('feedbackPage.btnNewFeedback', '提出新建议 / 意见')}
        </button>
      </div>

      {/* Feedback List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {loading ? (
          <div className="bezel-shell">
            <div className="bezel-core" style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--text-muted)' }}>
              <i className="ph-light ph-spinner ph-spin" style={{ fontSize: '2rem', marginBottom: 'var(--space-2)' }}></i>
              <div>{t('feedbackPage.loading', '正在加载意见列表...')}</div>
            </div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="bezel-shell">
            <div className="bezel-core" style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--text-muted)' }}>
              <i className="ph-light ph-chat-circle-dots" style={{ fontSize: '2.5rem', marginBottom: 'var(--space-3)', display: 'block', color: 'var(--text-faint)' }}></i>
              <div style={{ fontSize: 'var(--text-md)', fontWeight: '600', color: 'var(--text-primary)' }}>
                {t('feedbackPage.emptyTitle', '暂无相关反馈内容')}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', marginTop: '4px' }}>
                {t('feedbackPage.emptySubtitle', '如果您在使用过程中有任何改进建议或遇到系统问题，欢迎随时点击右上角反馈！')}
              </div>
            </div>
          </div>
        ) : (
          filteredItems.map(item => {
            const catMeta = CATEGORIES_META[item.category] || CATEGORIES_META.other;
            const statMeta = STATUS_META[item.status] || STATUS_META.pending;
            const priMeta = PRIORITIES_META[item.priority] || PRIORITIES_META.medium;
            const isCreator = user?.uid === item.createdBy;

            return (
              <div 
                key={item.id} 
                className="bezel-shell hover-row" 
              >
                <div
                  className="bezel-core"
                  style={{ 
                    padding: 'var(--space-5)', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: 'var(--space-3)',
                    borderLeft: `4px solid ${catMeta.color}`
                  }}
                >
                {/* Card Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <span style={{ 
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600',
                      background: catMeta.bg, color: catMeta.color 
                    }}>
                      <i className={`ph-fill ${catMeta.icon}`}></i>
                      {getCategoryLabel(item.category)}
                    </span>

                    <span style={{ 
                      fontSize: '0.75rem', color: priMeta.color, 
                      padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-hairline)' 
                    }}>
                      {getPriorityLabel(item.priority)}
                    </span>

                    <span style={{ 
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '500',
                      background: statMeta.bg, color: statMeta.color 
                    }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: statMeta.dot }}></span>
                      {getStatusLabel(item.status)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    {/* Management Dropdown for Status */}
                    {canManage && (
                      <select 
                        className="form-select" 
                        style={{ fontSize: '0.75rem', padding: '2px 8px', height: '28px', width: 'auto' }}
                        value={item.status}
                        onChange={e => handleUpdateStatus(item, e.target.value)}
                      >
                        <option value="pending">{t('feedbackPage.statusPending', '待评估')}</option>
                        <option value="in_review">{t('feedbackPage.statusInReview', '推进中')}</option>
                        <option value="resolved">{t('feedbackPage.statusResolvedFull', '已采纳/解决')}</option>
                        <option value="closed">{t('feedbackPage.statusClosed', '已关闭')}</option>
                      </select>
                    )}

                    {canManage && (
                      <button 
                        className="btn-icon btn-sm" 
                        title={t('feedbackPage.titleAddReply', '追加管理员回复')}
                        style={{ color: 'var(--accent-blue)' }}
                        onClick={() => {
                          setRespondingFeedback(item);
                          setAdminNoteText(item.adminNote || '');
                        }}
                      >
                        <i className="ph-light ph-chat-text"></i>
                      </button>
                    )}

                    {(canManage || isCreator) && (
                      <button 
                        className="btn-icon btn-sm" 
                        title={t('feedbackPage.titleDelete', '删除反馈')}
                        style={{ color: 'var(--accent-rose)' }}
                        onClick={() => handleDelete(item)}
                      >
                        <i className="ph-light ph-trash"></i>
                      </button>
                    )}
                  </div>
                </div>

                {/* Title and Content */}
                <div>
                  <h3 style={{ fontSize: 'var(--text-md)', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>
                    {item.title}
                  </h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                    {item.content}
                  </p>
                </div>

                {/* Admin Note if present */}
                {item.adminNote && (
                  <div style={{ 
                    padding: 'var(--space-3)', 
                    background: 'rgba(59, 130, 246, 0.05)', 
                    border: '1px solid rgba(59, 130, 246, 0.2)', 
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-primary)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-blue)', fontWeight: '600' }}>
                      <i className="ph-fill ph-check-shield"></i>
                      <span>{t('feedbackPage.adminReplyTitle', '团队管理员回复:')}</span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)' }}>{item.adminNote}</div>
                  </div>
                )}

                {/* Footer Meta */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--border-hairline)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="ph-light ph-user"></i>
                    <span>{item.creatorName}</span>
                    {item.creatorEmail && <span style={{ opacity: 0.6 }}>({item.creatorEmail})</span>}
                  </div>
                  <div>
                    {Utils.formatDate(item.createdAt?.toDate ? item.createdAt.toDate() : item.createdAt)}
                  </div>
                </div>
              </div>
            </div>
          );
          })
        )}
      </div>

      {/* New Feedback Modal */}
      {isModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999
        }}>
          <div className="bezel-shell modal-bezel" style={{ width: '90%', maxWidth: '560px' }}>
            <div className="bezel-core" style={{ padding: 'var(--space-6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <i className="ph-light ph-chat-circle-dots" style={{ fontSize: '1.5rem', color: 'var(--accent-blue)' }}></i>
                <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: '600', color: 'var(--text-primary)' }}>
                  {t('feedbackPage.modalTitle', '提出改进意见与反馈')}
                </h3>
              </div>
              <button className="btn-icon" onClick={() => setIsModalOpen(false)}>
                <i className="ph-light ph-x"></i>
              </button>
            </div>

            <form onSubmit={handleSubmitFeedback} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">
                    {t('feedbackPage.labelCategory', '反馈分类')} <span className="required">*</span>
                  </label>
                  <select 
                    className="form-select"
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                  >
                    <option value="feature">{t('feedbackPage.catFeature', '功能建议')}</option>
                    <option value="bug">{t('feedbackPage.catBug', '问题报修')}</option>
                    <option value="ux">{t('feedbackPage.catUx', '体验优化')}</option>
                    <option value="other">{t('feedbackPage.catOther', '其他想法')}</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">{t('feedbackPage.labelPriority', '期望处理优先级')}</label>
                  <select 
                    className="form-select"
                    value={formData.priority}
                    onChange={e => setFormData({ ...formData, priority: e.target.value })}
                  >
                    <option value="low">{t('feedbackPage.priorityLowDesc', '日常体验 (不紧急)')}</option>
                    <option value="medium">{t('feedbackPage.priorityMediumDesc', '期望改进 (建议近期)')}</option>
                    <option value="high">{t('feedbackPage.priorityHighDesc', '紧急需要 (影响作业)')}</option>
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">
                  {t('feedbackPage.labelTitle', '标题概括')} <span className="required">*</span>
                </label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder={t('feedbackPage.placeholderTitle', '例如: 希望在招聘订单中支持按公司一键筛选候选人...')}
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">
                  {t('feedbackPage.labelContent', '详细描述与场景期望')} <span className="required">*</span>
                </label>
                <textarea 
                  className="form-input" 
                  rows={4} 
                  placeholder={t('feedbackPage.placeholderContent', '请尽可能详述您的真实使用场景、改进思路或遇到的 Bug 触发步骤...')}
                  value={formData.content}
                  onChange={e => setFormData({ ...formData, content: e.target.value })}
                  required
                ></textarea>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
                  {t('feedbackPage.btnCancel', '取消')}
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? t('feedbackPage.btnSubmitting', '提交中...') : t('feedbackPage.btnSubmit', '确认提交')}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      )}

      {/* Admin Response Modal */}
      {respondingFeedback && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999
        }}>
          <div className="bezel-shell modal-bezel" style={{ width: '90%', maxWidth: '500px' }}>
            <div className="bezel-core" style={{ padding: 'var(--space-6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <h3 style={{ fontSize: 'var(--text-md)', fontWeight: '600', color: 'var(--text-primary)' }}>
                {t('feedbackPage.replyModalTitle', '回复反馈: ')}{respondingFeedback.title}
              </h3>
              <button className="btn-icon" onClick={() => setRespondingFeedback(null)}>
                <i className="ph-light ph-x"></i>
              </button>
            </div>

            <div className="form-group">
              <label className="form-label">
                {t('feedbackPage.labelAdminReply', '管理员批注 / 处理回复')}
              </label>
              <textarea 
                className="form-input" 
                rows={4}
                placeholder={t('feedbackPage.placeholderAdminReply', '例如: 该功能已纳入下周迭代计划，预计周五上线...')}
                value={adminNoteText}
                onChange={e => setAdminNoteText(e.target.value)}
              ></textarea>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
              <button className="btn btn-secondary" onClick={() => setRespondingFeedback(null)}>
                {t('feedbackPage.btnCancel', '取消')}
              </button>
              <button className="btn btn-primary" onClick={handleSaveAdminNote}>
                {t('feedbackPage.btnSaveReply', '保存回复')}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}
