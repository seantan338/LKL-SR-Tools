'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth-context';
import { FirestoreStore } from '../lib/firestore-store';

/**
 * P0 紧急公告全局强阻断模态框 (P0 Critical Notice Modal)
 * 遇到管理层/系统发布的 P0_CRITICAL 级别公告且当前用户尚未确认知晓时，
 * 在全站页面实施无死角阻断，强制要求点击“我已阅读并知晓”方可解除。
 */
export default function P0NoticeModal() {
  const { user, userProfile, teamId } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const [myReads, setMyReads] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const handleAcknowledge = async () => {
    if (!user || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await FirestoreStore.acknowledgeAnnouncement(activeNotice.id, {
        uid: user.uid,
        displayName: userProfile?.displayName || user.email || '用户',
        photoURL: userProfile?.photoURL || '',
        teamId: teamId || 'default_team'
      });
    } catch (err) {
      console.error('Acknowledge P0 failed:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

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
            <span>🚨 紧急重要通知 (P0 CRITICAL)</span>
          </div>
          <span style={{ fontSize: '0.8rem', background: 'rgba(0,0,0,0.25)', padding: '2px 8px', borderRadius: '4px' }}>
            强制知晓
          </span>
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
            {activeNotice.title}
          </h2>

          {/* 发布人信息：仅保留发布人头像 + 姓名 */}
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
                {activeNotice.author?.name || '管理团队'}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)' }}>
                发布于 {activeNotice.createdAt ? new Date(activeNotice.createdAt).toLocaleString('zh-CN', { hour12: false }) : '近期'}
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
            {activeNotice.content}
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
            ⚠️ 本条消息需要您确认知晓后方可继续使用系统
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
              <span>提交中...</span>
            ) : (
              <>
                <span>✓ 我已阅读并知晓</span>
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
