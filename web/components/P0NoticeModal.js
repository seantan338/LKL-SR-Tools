'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth-context';
import { useI18n } from '../lib/i18n-context';
import { FirestoreStore } from '../lib/firestore-store';

/**
 * P0 紧急公告全局强阻断模态框 (P0 Critical Notice Modal)
 * 遇到管理层/系统发布的 P0_CRITICAL 级别公告且当前用户尚未确认知晓时，
 * 在全站页面实施无死角阻断，强制要求点击“我已阅读并知晓”方可解除。
 * 支持双语（中/英）自适应及手动对照切换。
 */
export default function P0NoticeModal() {
  const { user, userProfile, teamId } = useAuth();
  const { t, lang } = useI18n();
  const [announcements, setAnnouncements] = useState([]);
  const [myReads, setMyReads] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewLang, setViewLang] = useState(lang || 'zh'); // 支持弹窗内手动切换 'zh' | 'en'

  useEffect(() => {
    setViewLang(lang || 'zh');
  }, [lang]);

  useEffect(() => {
    if (!user?.uid || !teamId) return;

    const unsubAnn = FirestoreStore.subscribeToAnnouncements(teamId, (list) => {
      setAnnouncements(list || []);
    });

    const unsubReads = FirestoreStore.subscribeToMyAnnouncementReads(user.uid, (reads) => {
      setMyReads(reads || {});
    });

    return () => {
      unsubAnn();
      unsubReads();
    };
  }, [user?.uid, teamId]);

  // 筛选出所有未被当前用户确认知晓的 P0 公告
  const pendingP0 = announcements.filter(item => {
    if (item.priority !== 'P0_CRITICAL') return false;
    const read = myReads[item.id];
    return !read || !read.ackAt;
  });

  const activeNotice = pendingP0[0];

  if (!activeNotice) return null;

  const hasBilingual = Boolean(
    (activeNotice.titleEn || activeNotice.contentEn) &&
    (activeNotice.titleZh || activeNotice.contentZh || (activeNotice.title && activeNotice.title !== activeNotice.titleEn))
  );

  // 动态解析当前展示语言的标题与正文 (自适应回退：en模式优先取titleEn，zh模式优先取titleZh/title)
  const currentTitle = viewLang === 'en'
    ? (activeNotice.titleEn || activeNotice.title || activeNotice.titleZh || '')
    : (activeNotice.titleZh || activeNotice.title || activeNotice.titleEn || '');

  const currentContent = viewLang === 'en'
    ? (activeNotice.contentEn || activeNotice.content || activeNotice.contentZh || '')
    : (activeNotice.contentZh || activeNotice.content || activeNotice.contentEn || '');

  const handleAcknowledge = async () => {
    if (!user || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await FirestoreStore.acknowledgeAnnouncement(activeNotice.id, {
        uid: user.uid,
        displayName: userProfile?.displayName || user.email || t('announcements.teamMemberFallback', '团队成员'),
        photoURL: userProfile?.photoURL || '',
        teamId: teamId || 'default_team'
      });
    } catch (err) {
      console.error('Acknowledge P0 failed:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formattedTime = activeNotice.createdAt
    ? new Date(activeNotice.createdAt).toLocaleString(viewLang === 'en' ? 'en-US' : 'zh-CN', { hour12: false })
    : t('announcements.timeRecent', '近期');

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 99999,
      background: 'rgba(15, 23, 42, 0.88)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      animation: 'p0FadeIn 0.3s ease-out'
    }}>
      <div style={{
        maxWidth: '620px',
        width: '100%',
        background: 'var(--bg-surface, #1e293b)',
        border: '2px solid #ef4444',
        borderRadius: '16px',
        boxShadow: '0 0 40px rgba(239, 68, 68, 0.35)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative'
      }}>
        {/* 顶部警示条 */}
        <div style={{
          background: 'linear-gradient(90deg, #b91c1c 0%, #ef4444 100%)',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#ffffff'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', fontSize: '0.95rem' }}>
            <span style={{
              display: 'inline-block',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: '#fff',
              boxShadow: '0 0 10px #fff',
              animation: 'p0Pulse 1.2s infinite'
            }}></span>
            <span>🚨 {t('announcements.p0BannerTitle', '紧急重要通知 (P0 CRITICAL)')}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* 双语切换胶囊 */}
            {hasBilingual && (
              <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', padding: '2px' }}>
                <button
                  type="button"
                  onClick={() => setViewLang('zh')}
                  style={{
                    background: viewLang === 'zh' ? 'rgba(255,255,255,0.25)' : 'transparent',
                    border: 'none',
                    color: '#ffffff',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    fontWeight: viewLang === 'zh' ? '700' : '400',
                    cursor: 'pointer'
                  }}
                >
                  中
                </button>
                <button
                  type="button"
                  onClick={() => setViewLang('en')}
                  style={{
                    background: viewLang === 'en' ? 'rgba(255,255,255,0.25)' : 'transparent',
                    border: 'none',
                    color: '#ffffff',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    fontWeight: viewLang === 'en' ? '700' : '400',
                    cursor: 'pointer'
                  }}
                >
                  EN
                </button>
              </div>
            )}
            <span style={{ fontSize: '0.8rem', background: 'rgba(0,0,0,0.25)', padding: '2px 8px', borderRadius: '4px' }}>
              {t('announcements.p0ForceBadge', '强制知晓')}
            </span>
          </div>
        </div>

        {/* 主体正文 */}
        <div style={{ padding: '24px', overflowY: 'auto', maxHeight: '65vh' }}>
          <h2 style={{
            fontSize: '1.25rem',
            fontWeight: '700',
            color: 'var(--text-primary, #f8fafc)',
            marginBottom: '14px',
            lineHeight: 1.4
          }}>
            {currentTitle}
          </h2>

          {/* 发布人信息：头像 + 姓名 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            paddingBottom: '14px',
            marginBottom: '16px',
            borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.08))'
          }}>
            <img
              src={activeNotice.author?.avatarUrl || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + (activeNotice.author?.name || 'admin')}
              alt="Avatar"
              style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.15)' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-primary, #f1f5f9)' }}>
                {activeNotice.author?.name || t('announcements.adminTeamFallback', '管理团队')}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)' }}>
                {t('announcements.postedAt', { time: formattedTime }, `发布于 ${formattedTime}`)}
              </span>
            </div>
          </div>

          {/* 正文内容 */}
          <div style={{
            fontSize: '0.95rem',
            lineHeight: 1.8,
            color: 'var(--text-secondary, #cbd5e1)',
            whiteSpace: 'pre-wrap',
            letterSpacing: '0.02em',
            background: 'rgba(0,0,0,0.15)',
            padding: '16px',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.05)'
          }}>
            {currentContent}
          </div>
        </div>

        {/* 底部确认栏 */}
        <div style={{
          padding: '16px 24px',
          background: 'rgba(0,0,0,0.2)',
          borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px'
        }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)' }}>
            {t('announcements.p0NoticeRequiredTip', '⚠️ 本条消息需要您确认知晓后方可继续使用系统')}
          </div>
          <button
            onClick={handleAcknowledge}
            disabled={isSubmitting}
            style={{
              background: '#ef4444',
              color: '#ffffff',
              border: 'none',
              padding: '10px 24px',
              borderRadius: '8px',
              fontWeight: '700',
              fontSize: '0.92rem',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {isSubmitting ? (
              <span>{t('announcements.p0SubmittingBtn', '提交中...')}</span>
            ) : (
              <>
                <span>{t('announcements.p0AcknowledgeBtn', '✓ 我已阅读并知晓')}</span>
              </>
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes p0Pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.3); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes p0FadeIn {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
