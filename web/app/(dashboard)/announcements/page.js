'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../../lib/auth-context';
import { useFeedback } from '../../../lib/feedback-context';
import { useI18n } from '../../../lib/i18n-context';
import { FirestoreStore } from '../../../lib/firestore-store';
import { db } from '../../../lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';

// 初始系统更新日志种子数据（支持中英自适应）
const GET_INITIAL_SYSTEM_CHANGELOG = (isEn) => [
  {
    id: 'sys_v1_7_1',
    category: 'SYSTEM_UPDATE',
    priority: 'P2_NORMAL',
    title: 'v1.7.1 考勤手滑误触防护闭环与最晚签退自动自愈',
    titleEn: 'v1.7.1 Accidental Clock-Out Guard & Latest-Wins Self Healing',
    versionTag: 'v1.7.1',
    changeTypes: ['feat', 'fix', 'opt'],
    author: {
      name: isEn ? 'Architecture Team' : '系统架构组',
      avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=sys171'
    },
    createdAt: '2026-10-27T08:30:00Z',
    content: `### 核心更新亮点：
- **最晚签退自愈机制**：员工误触提前签退后，下班真正离开时再次打卡，系统自动以当天最晚记录生效覆盖，零人工介入。
- **全量秒级打卡流水**：解除流水限制，每日考勤记录完整保存多次打卡历史并标记徽章（如 x2）。
- **提前签退强防呆弹窗**：顶部快捷签退检测到早于下班底线时弹出高警示确认框，保护全勤奖。`,
    contentEn: `### Key Updates:
- **Latest-Wins Self Healing**: If a teammate accidentally clocks out early, clocking out again at end-of-shift automatically takes effect. Zero manual correction cost.
- **Full Punch History Trail**: Removes punch log truncation; full second-level punches are preserved with badge indicators (e.g. x2).
- **Accidental Exit Interceptor**: Triggers a high-alert dialog when attempting to clock out earlier than scheduled exit time to protect full-attendance bonus.`,
    readCount: 15,
    ackCount: 15
  },
  {
    id: 'sys_v1_7_0',
    category: 'SYSTEM_UPDATE',
    priority: 'P2_NORMAL',
    title: 'v1.7.0 纯净考勤记录重构与午夜12点缺卡分水岭',
    titleEn: 'v1.7.0 Pure Attendance Stream & Midnight Shift Cutoff',
    versionTag: 'v1.7.0',
    changeTypes: ['opt', 'fix'],
    author: {
      name: isEn ? 'Architecture Team' : '系统架构组',
      avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=sys170'
    },
    createdAt: '2026-10-27T01:00:00Z',
    content: `### 核心更新亮点：
- **纯净考勤数据流隔离**：彻底剔除日常候选人跟进等非打卡日志，报表纯粹精准。
- **下班签退与工时留白**：员工未签退前工时严格留白，签退后精确核算真实工时。
- **午夜缺卡分水岭**：当日进行中判定为在岗状态，次日零点后未打卡才核定缺卡。`,
    contentEn: `### Key Updates:
- **Pure Attendance Stream Isolation**: Excludes daily candidate tracking operations; reports reflect only genuine punch actions.
- **Clock-Out Blank Protection**: Durations remain clean and blank until explicit clock-out punch occurs.
- **Midnight Status Cutoff**: Shifts in progress on current day are flagged as In-Progress; missed clock-out is finalized strictly after midnight.`,
    readCount: 15,
    ackCount: 15
  },
  {
    id: 'sys_v1_6_9',
    category: 'SYSTEM_UPDATE',
    priority: 'P2_NORMAL',
    title: 'v1.6.9 全局架构说明书全景重构与双语国际化矩阵',
    titleEn: 'v1.6.9 Global Architecture Documentation & Full Bilingual Matrix',
    versionTag: 'v1.6.9',
    changeTypes: ['feat', 'opt'],
    author: {
      name: isEn ? 'Architecture Team' : '系统架构组',
      avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=sys169'
    },
    createdAt: '2026-10-26T16:00:00Z',
    content: `### 核心更新亮点：
- **企业级弹性排班体系**：支持 4 档弹性工时阶梯判定与主管单日改派审计。
- **HQ 专属竞技排行榜**：公司本部考勤出勤率与销售成单排行看板上线。
- **全站中英双语即时切换**：操作手册与工作台组件 100% 覆盖双语词条。`,
    contentEn: `### Key Updates:
- **Enterprise Cascade Shifts**: Supports 4-tier flexible work shifts with manager day-override snapshot audits.
- **HQ Competitive Leaderboard**: Corporate attendance rank and sales performance boards go live.
- **Full Bilingual Support**: Manuals and UI components feature seamless 100% bilingual toggle.`,
    readCount: 15,
    ackCount: 15
  }
];

// 简单轻量 Markdown / 富文本解析组件
function SimpleMarkdownRenderer({ content }) {
  if (!content) return null;
  const lines = content.split('\n');

  return (
    <div style={{ lineHeight: 1.8, fontSize: '0.92rem', color: 'var(--text-secondary, #cbd5e1)', letterSpacing: '0.02em' }}>
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={idx} style={{
              margin: '16px 0 8px 0',
              color: 'var(--text-primary, #f8fafc)',
              fontSize: '1rem',
              fontWeight: '700',
              borderLeft: '3px solid var(--accent-blue, #3b82f6)',
              paddingLeft: '10px'
            }}>
              {trimmed.replace('### ', '')}
            </h4>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={idx} style={{
              margin: '18px 0 10px 0',
              color: 'var(--text-primary, #f8fafc)',
              fontSize: '1.1rem',
              fontWeight: '700'
            }}>
              {trimmed.replace('## ', '')}
            </h3>
          );
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const itemText = trimmed.substring(2);
          return (
            <div key={idx} style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px', paddingLeft: '4px' }}>
              <span style={{ color: 'var(--accent-blue, #3b82f6)', fontSize: '0.8rem' }}>●</span>
              <span>{renderFormattedInline(itemText)}</span>
            </div>
          );
        }
        if (trimmed === '') {
          return <div key={idx} style={{ height: '8px' }}></div>;
        }
        return (
          <p key={idx} style={{ margin: '4px 0 8px 0' }}>
            {renderFormattedInline(line)}
          </p>
        );
      })}
    </div>
  );
}

// 行内加粗与代码高亮解析
function renderFormattedInline(text) {
  if (!text) return '';
  const parts = [];
  let remaining = text;
  let key = 0;

  while (remaining) {
    const boldMatch = remaining.match(/\*\*(.*?)\*\*/);
    const codeMatch = remaining.match(/`(.*?)`/);

    let firstMatch = null;
    let type = null;

    if (boldMatch && codeMatch) {
      if (boldMatch.index < codeMatch.index) {
        firstMatch = boldMatch;
        type = 'bold';
      } else {
        firstMatch = codeMatch;
        type = 'code';
      }
    } else if (boldMatch) {
      firstMatch = boldMatch;
      type = 'bold';
    } else if (codeMatch) {
      firstMatch = codeMatch;
      type = 'code';
    }

    if (!firstMatch) {
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }

    const before = remaining.substring(0, firstMatch.index);
    if (before) parts.push(<span key={key++}>{before}</span>);

    if (type === 'bold') {
      parts.push(<strong key={key++} style={{ color: 'var(--text-primary, #ffffff)', fontWeight: '600' }}>{firstMatch[1]}</strong>);
    } else if (type === 'code') {
      parts.push(
        <code key={key++} style={{
          background: 'rgba(255,255,255,0.08)',
          color: 'var(--accent-amber, #f59e0b)',
          padding: '2px 6px',
          borderRadius: '4px',
          fontSize: '0.85em',
          fontFamily: 'monospace'
        }}>
          {firstMatch[1]}
        </code>
      );
    }

    remaining = remaining.substring(firstMatch.index + firstMatch[0].length);
  }

  return parts;
}

export default function AnnouncementsPage() {
  const { user, userProfile, teamId, isOwner, isManager } = useAuth();
  const { showToast } = useFeedback();
  const { t, lang } = useI18n();
  const isEn = lang === 'en';

  // 是否具有发布/编辑公告权限 (管理层 / 主管)
  const canManage = isOwner || isManager || userProfile?.role === 'manager' || userProfile?.role === 'owner';

  const [announcements, setAnnouncements] = useState([]);
  const [myReads, setMyReads] = useState({});
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  // 筛选与搜索
  const [categoryTab, setCategoryTab] = useState('ALL'); // 'ALL' | 'EXECUTIVE' | 'SUPERVISOR'
  const [searchQuery, setSearchQuery] = useState('');

  // 抽屉与模态框状态
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [trackerNotice, setTrackerNotice] = useState(null); // 选中的查岗公告
  const [trackerReaders, setTrackerReaders] = useState([]);
  const [loadingReaders, setLoadingReaders] = useState(false);
  const [detailNotice, setDetailNotice] = useState(null); // 详情查看
  const [detailViewLang, setDetailViewLang] = useState(lang || 'zh'); // 详情弹窗当前查看语言 'zh' | 'en'
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 新建表单（增设双语栏位 titleEn & contentEn）
  const [newNotice, setNewNotice] = useState({
    title: '',
    content: '',
    titleEn: '',
    contentEn: '',
    category: 'SUPERVISOR', // 'EXECUTIVE' | 'SUPERVISOR' | 'SYSTEM_UPDATE'
    priority: 'P2_NORMAL',   // 'P0_CRITICAL' | 'P1_HIGH' | 'P2_NORMAL' | 'P3_LOW'
    isPinned: false,
    requireAck: true,
    versionTag: '',
    changeTypes: ['feat']
  });

  // 抽屉内双语栏位折叠/展开开关
  const [isBilingualOpen, setIsBilingualOpen] = useState(false);

  // 右侧系统日志展开状态
  const [expandedLogId, setExpandedLogId] = useState('sys_v1_7_1');

  // 当系统语言变化时同步详情弹窗默认视图
  useEffect(() => {
    setDetailViewLang(lang || 'zh');
  }, [lang]);

  // 1. 监听公告与已读记录
  useEffect(() => {
    if (!teamId) return;

    const unsubAnn = FirestoreStore.subscribeToAnnouncements(teamId, (list) => {
      setAnnouncements(list || []);
      setLoading(false);
    });

    let unsubReads = () => {};
    if (user?.uid) {
      unsubReads = FirestoreStore.subscribeToMyAnnouncementReads(user.uid, (reads) => {
        setMyReads(reads || {});
      });
    }

    return () => {
      unsubAnn();
      unsubReads();
    };
  }, [teamId, user?.uid]);

  // 2. 监听团队成员列表（用于查岗比对）
  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const activeMembers = [];
      snap.forEach(d => {
        const u = { ...d.data(), uid: d.id };
        if (u.role && u.role !== 'pending' && (u.teamId === teamId || u.teamId === 'default_team')) {
          activeMembers.push(u);
        }
      });
      setTeamMembers(activeMembers);
    }, (err) => {
      console.warn('Load team members error:', err);
    });

    return () => unsubUsers();
  }, [teamId]);

  // 3. 计算已合并的系统更新日志（数据库中的系统更新 + 内置种子数据）
  const systemChangelogs = useMemo(() => {
    const initialSeed = GET_INITIAL_SYSTEM_CHANGELOG(isEn);
    const fromDb = announcements.filter(a => a.category === 'SYSTEM_UPDATE');
    const existingIds = new Set(fromDb.map(a => a.id));
    const merged = [...fromDb];
    initialSeed.forEach(item => {
      if (!existingIds.has(item.id)) {
        merged.push(item);
      }
    });
    return merged.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [announcements, isEn]);

  // 4. 计算业务公告流（管理层 / 主管，排除系统更新）
  const businessAnnouncements = useMemo(() => {
    return announcements.filter(a => a.category !== 'SYSTEM_UPDATE');
  }, [announcements]);

  // 5. 顶部高优置顶 Banner（P0 与 P1 未读公告）
  const pinnedBannerNotices = useMemo(() => {
    return businessAnnouncements.filter(item => {
      const isHighPriority = item.priority === 'P0_CRITICAL' || item.priority === 'P1_HIGH';
      const isUnread = !myReads[item.id] || (item.requireAck && !myReads[item.id]?.ackAt);
      return item.isPinned || (isHighPriority && isUnread);
    });
  }, [businessAnnouncements, myReads]);

  // 6. 过滤后的业务列表（支持双语搜索模糊匹配）
  const filteredBusinessAnnouncements = useMemo(() => {
    return businessAnnouncements.filter(item => {
      if (categoryTab !== 'ALL' && item.category !== categoryTab) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const titleMatch = item.title?.toLowerCase().includes(q) || item.titleEn?.toLowerCase().includes(q);
        const contentMatch = item.content?.toLowerCase().includes(q) || item.contentEn?.toLowerCase().includes(q);
        const authorMatch = item.author?.name?.toLowerCase().includes(q);
        if (!titleMatch && !contentMatch && !authorMatch) return false;
      }
      return true;
    });
  }, [businessAnnouncements, categoryTab, searchQuery]);

  // 动态获取呈现的标题与正文（英文优先回退中文）
  const getDisplayTitle = (item, currentLang = lang) => {
    if (currentLang === 'en' && item.titleEn?.trim()) {
      return item.titleEn;
    }
    return item.title || item.titleEn || '';
  };

  const getDisplayContent = (item, currentLang = lang) => {
    if (currentLang === 'en' && item.contentEn?.trim()) {
      return item.contentEn;
    }
    return item.content || item.contentEn || '';
  };

  // 操作：标记知晓 / 收到
  const handleAcknowledge = async (item) => {
    if (!user) return;
    try {
      await FirestoreStore.acknowledgeAnnouncement(item.id, {
        uid: user.uid,
        displayName: userProfile?.displayName || user.email || t('announcements.teamMemberFallback', '团队成员'),
        photoURL: userProfile?.photoURL || '',
        teamId: teamId || 'default_team'
      });
      showToast(t('announcements.toastAcknowledgeSuccess', '已确认收到此公告'), 'success');
    } catch (err) {
      console.error(err);
      showToast(t('announcements.toastActionFailed', '操作失败，请重试'), 'error');
    }
  };

  // 操作：打开详情弹窗
  const handleOpenDetail = (item) => {
    setDetailNotice(item);
    setDetailViewLang(lang === 'en' && (item.titleEn || item.contentEn) ? 'en' : 'zh');
    if (user && (!myReads[item.id] || !myReads[item.id]?.ackAt)) {
      FirestoreStore.markAnnouncementRead(item.id, {
        uid: user.uid,
        displayName: userProfile?.displayName || user.email || t('announcements.teamMemberFallback', '团队成员'),
        photoURL: userProfile?.photoURL || '',
        teamId: teamId || 'default_team'
      }, !item.requireAck).catch(() => {});
    }
  };

  // 操作：打开查岗名单
  const handleOpenTracker = async (notice) => {
    setTrackerNotice(notice);
    setLoadingReaders(true);
    try {
      const readers = await FirestoreStore.getAnnouncementReaders(notice.id);
      setTrackerReaders(readers || []);
    } catch (err) {
      console.error(err);
      showToast(t('announcements.toastLoadTrackerFailed', '加载查岗名单失败'), 'error');
    } finally {
      setLoadingReaders(false);
    }
  };

  // 操作：创建公告（支持双语存储）
  const handleCreateAnnouncement = async (e) => {
    e.preventDefault();
    if (!newNotice.title.trim() || !newNotice.content.trim()) {
      showToast(t('announcements.toastFillRequired', '请填写公告标题与内容'), 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      await FirestoreStore.createAnnouncement({
        title: newNotice.title.trim(),
        content: newNotice.content.trim(),
        titleEn: newNotice.titleEn.trim() || null,
        contentEn: newNotice.contentEn.trim() || null,
        category: newNotice.category,
        priority: newNotice.priority,
        isPinned: newNotice.isPinned,
        requireAck: newNotice.requireAck,
        versionTag: newNotice.category === 'SYSTEM_UPDATE' ? (newNotice.versionTag.trim() || 'v2.0.0') : null,
        changeTypes: newNotice.category === 'SYSTEM_UPDATE' ? newNotice.changeTypes : [],
        targetScope: 'ALL',
        teamId: newNotice.category === 'SYSTEM_UPDATE' ? 'ALL' : teamId,
        author: {
          id: user?.uid || '',
          name: userProfile?.displayName || user?.email || t('announcements.adminTeamFallback', '管理团队'),
          avatarUrl: userProfile?.photoURL || ''
        }
      });

      showToast(t('announcements.toastCreateSuccess', '公告发布成功'), 'success');
      setIsCreateOpen(false);
      setNewNotice({
        title: '',
        content: '',
        titleEn: '',
        contentEn: '',
        category: 'SUPERVISOR',
        priority: 'P2_NORMAL',
        isPinned: false,
        requireAck: true,
        versionTag: '',
        changeTypes: ['feat']
      });
      setIsBilingualOpen(false);
    } catch (err) {
      console.error('Create announcement error:', err);
      showToast(t('announcements.toastCreateFailed', { msg: err.message }, `发布失败: ${err.message}`), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 优先级标签渲染辅助
  const renderPriorityBadge = (priority) => {
    switch (priority) {
      case 'P0_CRITICAL':
        return (
          <span style={{
            background: 'rgba(239, 68, 68, 0.15)',
            color: '#ef4444',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            padding: '2px 8px',
            borderRadius: '6px',
            fontSize: '0.75rem',
            fontWeight: '700',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444', animation: 'p0Pulse 1.2s infinite' }}></span>
            {t('announcements.p0Tag', 'P0 紧急')}
          </span>
        );
      case 'P1_HIGH':
        return (
          <span style={{
            background: 'rgba(245, 158, 11, 0.15)',
            color: '#f59e0b',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            padding: '2px 8px',
            borderRadius: '6px',
            fontSize: '0.75rem',
            fontWeight: '700'
          }}>
            {t('announcements.p1Tag', 'P1 重要')}
          </span>
        );
      case 'P2_NORMAL':
        return (
          <span style={{
            background: 'rgba(59, 130, 246, 0.15)',
            color: '#60a5fa',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            padding: '2px 8px',
            borderRadius: '6px',
            fontSize: '0.75rem',
            fontWeight: '600'
          }}>
            {t('announcements.p2Tag', 'P2 常规')}
          </span>
        );
      case 'P3_LOW':
      default:
        return (
          <span style={{
            background: 'rgba(148, 163, 184, 0.12)',
            color: '#94a3b8',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            padding: '2px 8px',
            borderRadius: '6px',
            fontSize: '0.75rem'
          }}>
            {t('announcements.p3Tag', 'P3 归档')}
          </span>
        );
    }
  };

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '16px 20px 40px 20px' }}>
      
      {/* 1. 顶部高优置顶区 (Pinned / Hero Banner) */}
      {pinnedBannerNotices.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          {pinnedBannerNotices.slice(0, 2).map((notice) => {
            const isAcked = Boolean(myReads[notice.id]?.ackAt);
            const isP0 = notice.priority === 'P0_CRITICAL';
            const displayTitle = getDisplayTitle(notice);

            return (
              <div
                key={notice.id}
                style={{
                  background: isP0 
                    ? 'linear-gradient(90deg, rgba(239, 68, 68, 0.15) 0%, rgba(30, 41, 59, 0.95) 100%)' 
                    : 'linear-gradient(90deg, rgba(245, 158, 11, 0.12) 0%, rgba(30, 41, 59, 0.95) 100%)',
                  border: isP0 ? '1.5px solid #ef4444' : '1px solid rgba(245, 158, 11, 0.4)',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  boxShadow: isP0 ? '0 0 25px rgba(239, 68, 68, 0.2)' : '0 4px 15px rgba(245, 158, 11, 0.1)',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: 0 }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    background: isP0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.4rem',
                    flexShrink: 0
                  }}>
                    {isP0 ? t('announcements.p0BannerIcon', '🚨') : t('announcements.p1BannerIcon', '📌')}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      {renderPriorityBadge(notice.priority)}
                      {(notice.titleEn || notice.contentEn) && (
                        <span style={{
                          fontSize: '0.7rem',
                          background: 'rgba(59, 130, 246, 0.18)',
                          color: 'var(--accent-blue, #60a5fa)',
                          border: '1px solid rgba(59, 130, 246, 0.3)',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          fontWeight: '600'
                        }}>
                          {t('announcements.hasBilingualBadge', '双语')}
                        </span>
                      )}
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)' }}>
                        {notice.createdAt ? new Date(notice.createdAt).toLocaleDateString(isEn ? 'en-US' : 'zh-CN') : ''}
                      </span>
                    </div>
                    <h3
                      onClick={() => handleOpenDetail(notice)}
                      style={{
                        fontSize: '1.05rem',
                        fontWeight: '700',
                        color: 'var(--text-primary, #ffffff)',
                        margin: 0,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                      title={displayTitle}
                    >
                      {displayTitle}
                    </h3>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0, marginLeft: '20px' }}>
                  <button
                    onClick={() => handleOpenDetail(notice)}
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: 'var(--text-primary, #ffffff)',
                      padding: '8px 14px',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      fontWeight: '500'
                    }}
                  >
                    {t('announcements.viewDetail', '查看详情')}
                  </button>

                  {notice.requireAck && (
                    <button
                      onClick={() => handleAcknowledge(notice)}
                      disabled={isAcked}
                      style={{
                        background: isAcked ? 'rgba(34, 197, 94, 0.2)' : (isP0 ? '#ef4444' : '#f59e0b'),
                        border: isAcked ? '1px solid rgba(34, 197, 94, 0.4)' : 'none',
                        color: '#ffffff',
                        padding: '8px 16px',
                        borderRadius: '8px',
                        fontSize: '0.85rem',
                        fontWeight: '700',
                        cursor: isAcked ? 'default' : 'pointer',
                        boxShadow: isAcked ? 'none' : '0 2px 8px rgba(0,0,0,0.3)'
                      }}
                    >
                      {isAcked ? t('announcements.alreadyKnown', '✓ 已知晓') : t('announcements.iKnow', '我已知晓')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 2. 主体：方案 A 左主右辅双栏分流布局 (7:3 比例) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 7fr) minmax(320px, 3fr)',
        gap: '24px',
        alignItems: 'start'
      }}>
        
        {/* ========================================================
            左侧主栏 (70% 宽度) - 行政与业务公告卡片流
            ======================================================== */}
        <div style={{ minWidth: 0 }}>
          
          {/* 筛选与操作工具栏 */}
          <div style={{
            background: 'var(--bg-surface, #1e293b)',
            border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
            borderRadius: '12px',
            padding: '12px 18px',
            marginBottom: '16px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}>
            {/* 分类 Tabs */}
            <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '8px' }}>
              <button
                onClick={() => setCategoryTab('ALL')}
                style={{
                  background: categoryTab === 'ALL' ? 'var(--accent-blue, #3b82f6)' : 'transparent',
                  color: categoryTab === 'ALL' ? '#ffffff' : 'var(--text-secondary, #94a3b8)',
                  border: 'none',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                {t('announcements.tabAll', '全部公告')}
              </button>
              <button
                onClick={() => setCategoryTab('EXECUTIVE')}
                style={{
                  background: categoryTab === 'EXECUTIVE' ? 'var(--accent-blue, #3b82f6)' : 'transparent',
                  color: categoryTab === 'EXECUTIVE' ? '#ffffff' : 'var(--text-secondary, #94a3b8)',
                  border: 'none',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                {t('announcements.tabExecutive', '高层通知')}
              </button>
              <button
                onClick={() => setCategoryTab('SUPERVISOR')}
                style={{
                  background: categoryTab === 'SUPERVISOR' ? 'var(--accent-blue, #3b82f6)' : 'transparent',
                  color: categoryTab === 'SUPERVISOR' ? '#ffffff' : 'var(--text-secondary, #94a3b8)',
                  border: 'none',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                {t('announcements.tabSupervisor', '部门业务')}
              </button>
            </div>

            {/* 搜索框与发布按钮 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder={t('announcements.searchPlaceholder', '搜索公告标题或内容...')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    background: 'rgba(0,0,0,0.25)',
                    border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
                    borderRadius: '8px',
                    padding: '7px 12px 7px 32px',
                    fontSize: '0.85rem',
                    color: '#ffffff',
                    outline: 'none',
                    width: '190px'
                  }}
                />
                <i className="ph-light ph-magnifying-glass" style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted, #94a3b8)'
                }}></i>
              </div>

              {canManage && (
                <button
                  onClick={() => setIsCreateOpen(true)}
                  style={{
                    background: 'var(--accent-blue, #3b82f6)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '7px 14px',
                    fontSize: '0.85rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <i className="ph-bold ph-plus"></i>
                  <span>{t('announcements.createBtn', '发布公告')}</span>
                </button>
              )}
            </div>
          </div>

          {/* 公告卡片流列表 */}
          {filteredBusinessAnnouncements.length === 0 ? (
            <div style={{
              background: 'var(--bg-surface, #1e293b)',
              border: '1px dashed var(--border-subtle, rgba(255, 255, 255, 0.1))',
              borderRadius: '12px',
              padding: '60px 20px',
              textAlign: 'center',
              color: 'var(--text-muted, #94a3b8)'
            }}>
              <i className="ph-light ph-tray" style={{ fontSize: '2.5rem', marginBottom: '12px', display: 'block', opacity: 0.6 }}></i>
              <div>{t('announcements.emptyList', '暂无相关公告通知')}</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {filteredBusinessAnnouncements.map((item) => {
                const readRecord = myReads[item.id];
                const isRead = Boolean(readRecord);
                const isAcked = Boolean(readRecord?.ackAt);
                const totalMembers = teamMembers.length || 15;
                const formattedTime = item.createdAt
                  ? new Date(item.createdAt).toLocaleString(isEn ? 'en-US' : 'zh-CN', { hour12: false })
                  : t('announcements.timeRecent', '近期');

                const displayTitle = getDisplayTitle(item);
                const displayContent = getDisplayContent(item);
                const hasBilingual = Boolean(item.titleEn || item.contentEn);

                return (
                  <div
                    key={item.id}
                    style={{
                      background: 'var(--bg-surface, #1e293b)',
                      border: item.priority === 'P1_HIGH' 
                        ? '1px solid rgba(245, 158, 11, 0.35)' 
                        : '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
                      borderRadius: '12px',
                      padding: '20px',
                      transition: 'all 0.2s ease',
                      position: 'relative'
                    }}
                  >
                    {/* 卡片顶栏：发布人头像 + 姓名 (无职位Badge) */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <img
                          src={item.author?.avatarUrl || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + (item.author?.name || 'admin')}
                          alt="Avatar"
                          style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '50%',
                            border: '1px solid rgba(255, 255, 255, 0.15)'
                          }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '0.92rem', fontWeight: '600', color: 'var(--text-primary, #ffffff)' }}>
                            {item.author?.name || t('announcements.adminTeamFallback', '管理团队')}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)' }}>
                            {formattedTime}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {item.isPinned && (
                          <span style={{ color: 'var(--accent-amber, #f59e0b)', fontSize: '0.85rem' }} title={t('announcements.pinnedNotice', '置顶公告')}>
                            <i className="ph-fill ph-push-pin"></i>
                          </span>
                        )}
                        {hasBilingual && (
                          <span style={{
                            fontSize: '0.7rem',
                            background: 'rgba(59, 130, 246, 0.18)',
                            color: 'var(--accent-blue, #60a5fa)',
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            fontWeight: '600'
                          }} title="包含双语翻译">
                            🌐 {t('announcements.hasBilingualBadge', '双语')}
                          </span>
                        )}
                        {renderPriorityBadge(item.priority)}
                      </div>
                    </div>

                    {/* 标题 */}
                    <h3
                      onClick={() => handleOpenDetail(item)}
                      style={{
                        fontSize: '1.1rem',
                        fontWeight: isRead ? '600' : '700',
                        color: isRead ? 'var(--text-primary, #f1f5f9)' : '#ffffff',
                        margin: '0 0 10px 0',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        lineHeight: 1.4
                      }}
                    >
                      {!isRead && (
                        <span style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: 'var(--accent-blue, #3b82f6)',
                          boxShadow: '0 0 6px var(--accent-blue, #3b82f6)',
                          flexShrink: 0
                        }}></span>
                      )}
                      <span>{displayTitle}</span>
                    </h3>

                    {/* 摘要预览 */}
                    <p
                      onClick={() => handleOpenDetail(item)}
                      style={{
                        fontSize: '0.9rem',
                        lineHeight: 1.6,
                        color: 'var(--text-secondary, #cbd5e1)',
                        margin: '0 0 16px 0',
                        cursor: 'pointer',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}
                    >
                      {displayContent}
                    </p>

                    {/* 底部互动操作栏 */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderTop: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.06))',
                      paddingTop: '14px',
                      flexWrap: 'wrap',
                      gap: '10px'
                    }}>
                      {/* 已读人数统计与主管查岗入口 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          onClick={() => canManage && handleOpenTracker(item)}
                          style={{
                            fontSize: '0.82rem',
                            color: 'var(--text-secondary, #94a3b8)',
                            background: 'rgba(255, 255, 255, 0.04)',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            cursor: canManage ? 'pointer' : 'default',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            border: canManage ? '1px solid rgba(255, 255, 255, 0.1)' : 'none'
                          }}
                          title={canManage ? t('announcements.trackerBtn', '查岗名单 ▾') : ''}
                        >
                          <i className="ph-light ph-users"></i>
                          <span>
                            {t('announcements.readCountText', { read: item.readCount || 0, total: totalMembers }, `已读 ${item.readCount || 0}/${totalMembers} 人`)}
                          </span>
                          {canManage && (
                            <span style={{ color: 'var(--accent-blue, #3b82f6)', fontSize: '0.75rem', fontWeight: '600' }}>
                              {t('announcements.trackerBtn', '查岗名单 ▾')}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 互动操作按钮 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          onClick={() => handleOpenDetail(item)}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.15))',
                            color: 'var(--text-secondary, #cbd5e1)',
                            padding: '5px 12px',
                            borderRadius: '6px',
                            fontSize: '0.82rem',
                            cursor: 'pointer'
                          }}
                        >
                          {t('announcements.readBody', '阅读正文')}
                        </button>

                        {item.requireAck && (
                          <button
                            onClick={() => handleAcknowledge(item)}
                            disabled={isAcked}
                            style={{
                              background: isAcked ? 'rgba(34, 197, 94, 0.15)' : 'var(--accent-blue, #3b82f6)',
                              border: isAcked ? '1px solid rgba(34, 197, 94, 0.3)' : 'none',
                              color: isAcked ? '#4ade80' : '#ffffff',
                              padding: '5px 14px',
                              borderRadius: '6px',
                              fontSize: '0.82rem',
                              fontWeight: '600',
                              cursor: isAcked ? 'default' : 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            {isAcked ? (
                              <>
                                <i className="ph-bold ph-check"></i>
                                <span>{t('announcements.alreadyReceived', '已收到')}</span>
                              </>
                            ) : (
                              <span>{t('announcements.receiveAndRead', '收到 / 标记已阅')}</span>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ========================================================
            右侧边栏 (30% 宽度) - 系统更新日志 (System Changelog)
            ======================================================== */}
        <div style={{
          background: 'var(--bg-surface, #1e293b)',
          border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
          borderRadius: '12px',
          padding: '18px 20px',
          position: 'sticky',
          top: '20px'
        }}>
          {/* 边栏头部 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: '14px',
            marginBottom: '16px',
            borderBottom: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                background: 'rgba(59, 130, 246, 0.15)',
                color: 'var(--accent-blue, #3b82f6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1rem'
              }}>
                <i className="ph-fill ph-gear"></i>
              </div>
              <span style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary, #ffffff)' }}>
                {t('announcements.systemChangelogTitle', '系统更新日志')}
              </span>
            </div>
            <span style={{
              fontSize: '0.75rem',
              color: 'var(--accent-blue, #3b82f6)',
              background: 'rgba(59, 130, 246, 0.1)',
              padding: '2px 8px',
              borderRadius: '4px',
              fontWeight: '600'
            }}>
              {t('announcements.timelineBadge', 'Timeline')}
            </span>
          </div>

          {/* 紧凑时间轴流 */}
          <div style={{ position: 'relative', paddingLeft: '20px' }}>
            {/* 时间轴主垂线 */}
            <div style={{
              position: 'absolute',
              left: '6px',
              top: '8px',
              bottom: '8px',
              width: '2px',
              background: 'linear-gradient(180deg, var(--accent-blue, #3b82f6) 0%, rgba(255,255,255,0.06) 100%)'
            }}></div>

            {systemChangelogs.map((log, index) => {
              const isExpanded = expandedLogId === log.id;
              const isLatest = index === 0;
              const displayLogTitle = getDisplayTitle(log);
              const displayLogContent = getDisplayContent(log);

              return (
                <div key={log.id} style={{ position: 'relative', marginBottom: '22px' }}>
                  {/* 时间轴节点圆点 */}
                  <div style={{
                    position: 'absolute',
                    left: '-20px',
                    top: '4px',
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: isLatest ? 'var(--accent-blue, #3b82f6)' : 'var(--bg-surface, #1e293b)',
                    border: isLatest ? '2px solid #ffffff' : '2px solid var(--accent-blue, #3b82f6)',
                    boxShadow: isLatest ? '0 0 8px var(--accent-blue, #3b82f6)' : 'none'
                  }}></div>

                  {/* 节点卡片 */}
                  <div style={{
                    background: 'rgba(0,0,0,0.18)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    transition: 'all 0.2s ease'
                  }}>
                    {/* 版本与日期 */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{
                        fontSize: '0.85rem',
                        fontWeight: '700',
                        color: 'var(--accent-blue, #60a5fa)',
                        background: 'rgba(59, 130, 246, 0.12)',
                        padding: '1px 6px',
                        borderRadius: '4px'
                      }}>
                        {log.versionTag || 'v2.0'}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)' }}>
                        {log.createdAt ? new Date(log.createdAt).toLocaleDateString(isEn ? 'en-US' : 'zh-CN') : ''}
                      </span>
                    </div>

                    {/* 更新类型语义 Tag */}
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                      {log.changeTypes?.includes('feat') && (
                        <span style={{ fontSize: '0.68rem', background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', padding: '1px 5px', borderRadius: '3px' }}>
                          {t('announcements.tagFeat', '新功能')}
                        </span>
                      )}
                      {log.changeTypes?.includes('opt') && (
                        <span style={{ fontSize: '0.68rem', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', padding: '1px 5px', borderRadius: '3px' }}>
                          {t('announcements.tagOpt', '优化')}
                        </span>
                      )}
                      {log.changeTypes?.includes('fix') && (
                        <span style={{ fontSize: '0.68rem', background: 'rgba(148, 163, 184, 0.15)', color: '#cbd5e1', padding: '1px 5px', borderRadius: '3px' }}>
                          {t('announcements.tagFix', '修复')}
                        </span>
                      )}
                    </div>

                    {/* 标题 */}
                    <div
                      onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                      style={{
                        fontSize: '0.88rem',
                        fontWeight: '600',
                        color: 'var(--text-primary, #ffffff)',
                        lineHeight: 1.4,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '6px'
                      }}
                    >
                      <span>{displayLogTitle}</span>
                      <i className={`ph-bold ph-caret-${isExpanded ? 'up' : 'down'}`} style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}></i>
                    </div>

                    {/* 折叠/展开详情 */}
                    {isExpanded && (
                      <div style={{
                        marginTop: '10px',
                        paddingTop: '10px',
                        borderTop: '1px dashed rgba(255, 255, 255, 0.08)',
                        fontSize: '0.82rem'
                      }}>
                        <SimpleMarkdownRenderer content={displayLogContent} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* ========================================================
          模态框 1：主管查岗名单抽屉 (Read Tracker Modal)
          ======================================================== */}
      {trackerNotice && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            maxWidth: '680px',
            width: '100%',
            background: 'var(--bg-surface, #1e293b)',
            borderRadius: '16px',
            border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '85vh'
          }}>
            {/* 顶栏 */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary, #ffffff)' }}>
                  {t('announcements.trackerModalTitle', '📊 主管查岗名单与知晓跟踪')}
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)' }}>
                  {t('announcements.trackerNoticeLabel', { title: getDisplayTitle(trackerNotice) }, `公告：${getDisplayTitle(trackerNotice)}`)}
                </span>
              </div>
              <button
                onClick={() => setTrackerNotice(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* 内容区 */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              {loadingReaders ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  {t('announcements.loadingTrackerData', '正在同步团队查岗数据...')}
                </div>
              ) : (
                (() => {
                  const ackedUids = new Set(trackerReaders.filter(r => r.ackAt).map(r => r.userId));

                  const ackedList = teamMembers.filter(m => ackedUids.has(m.uid));
                  const unackedList = teamMembers.filter(m => !ackedUids.has(m.uid));

                  const copyUnreadList = () => {
                    const names = unackedList.map(u => u.displayName || u.email).join('、');
                    const text = t('announcements.copyPrefix', { title: getDisplayTitle(trackerNotice), names }, `未读公告【${getDisplayTitle(trackerNotice)}】的成员名单：${names}`);
                    navigator.clipboard.writeText(text);
                    showToast(t('announcements.toastCopySuccess', '已复制未读名单至剪贴板'), 'info');
                  };

                  return (
                    <div>
                      {/* 进度条 */}
                      <div style={{ marginBottom: '20px', background: 'rgba(0,0,0,0.2)', padding: '14px', borderRadius: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '8px' }}>
                          <span>{t('announcements.overallAckRate', '全员已知晓率')}</span>
                          <strong style={{ color: 'var(--accent-blue, #60a5fa)' }}>
                            {teamMembers.length ? Math.round((ackedList.length / teamMembers.length) * 100) : 0}% 
                            ({ackedList.length} / {teamMembers.length})
                          </strong>
                        </div>
                        <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${teamMembers.length ? (ackedList.length / teamMembers.length) * 100 : 0}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #3b82f6 0%, #22c55e 100%)',
                            transition: 'width 0.3s ease'
                          }}></div>
                        </div>
                      </div>

                      {/* 左右分栏：已读确认 vs 未读 */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        {/* 🟢 已知晓成员 */}
                        <div style={{ background: 'rgba(34, 197, 94, 0.05)', border: '1px solid rgba(34, 197, 94, 0.2)', borderRadius: '10px', padding: '14px' }}>
                          <div style={{ fontSize: '0.88rem', fontWeight: '700', color: '#4ade80', marginBottom: '10px' }}>
                            {t('announcements.ackedTitle', { count: ackedList.length }, `🟢 已知晓确认 (${ackedList.length} 人)`)}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                            {ackedList.length === 0 ? (
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                {t('announcements.noOneAcked', '暂无人员确认')}
                              </div>
                            ) : (
                              ackedList.map(member => (
                                <div key={member.uid} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem' }}>
                                  <img
                                    src={member.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + (member.displayName || member.email)}
                                    alt="Avatar"
                                    style={{ width: '24px', height: '24px', borderRadius: '50%' }}
                                  />
                                  <span>{member.displayName || member.email}</span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        {/* 🔴 未知晓成员 */}
                        <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '10px', padding: '14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                            <div style={{ fontSize: '0.88rem', fontWeight: '700', color: '#f87171' }}>
                              {t('announcements.unackedTitle', { count: unackedList.length }, `🔴 尚未知晓 (${unackedList.length} 人)`)}
                            </div>
                            {unackedList.length > 0 && (
                              <button
                                onClick={copyUnreadList}
                                style={{
                                  background: 'rgba(239, 68, 68, 0.15)',
                                  border: 'none',
                                  color: '#f87171',
                                  fontSize: '0.72rem',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  cursor: 'pointer'
                                }}
                              >
                                {t('announcements.copyListBtn', '复制名单')}
                              </button>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                            {unackedList.length === 0 ? (
                              <div style={{ fontSize: '0.8rem', color: '#4ade80' }}>
                                {t('announcements.allMembersAcked', '🎉 全员已全部完成知晓确认！')}
                              </div>
                            ) : (
                              unackedList.map(member => (
                                <div key={member.uid} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem' }}>
                                  <img
                                    src={member.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + (member.displayName || member.email)}
                                    alt="Avatar"
                                    style={{ width: '24px', height: '24px', borderRadius: '50%' }}
                                  />
                                  <span style={{ color: 'var(--text-secondary)' }}>{member.displayName || member.email}</span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          模态框 2：公告详情正文阅读 (Detail Modal，支持双语对照切换)
          ======================================================== */}
      {detailNotice && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            maxWidth: '680px',
            width: '100%',
            background: 'var(--bg-surface, #1e293b)',
            borderRadius: '16px',
            border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '85vh'
          }}>
            {/* 顶栏 */}
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {renderPriorityBadge(detailNotice.priority)}
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {detailNotice.category === 'EXECUTIVE'
                    ? t('announcements.tabExecutive', '高层通知')
                    : (detailNotice.category === 'SYSTEM_UPDATE' ? t('announcements.tabSystem', '系统更新') : t('announcements.tabSupervisor', '部门业务'))}
                </span>

                {/* 双语对照切换 Pill */}
                {(detailNotice.titleEn || detailNotice.contentEn) && (
                  <div style={{
                    display: 'flex',
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: '6px',
                    padding: '2px',
                    marginLeft: '8px',
                    border: '1px solid rgba(255,255,255,0.1)'
                  }}>
                    <button
                      type="button"
                      onClick={() => setDetailViewLang('zh')}
                      style={{
                        background: detailViewLang === 'zh' ? 'var(--accent-blue, #3b82f6)' : 'transparent',
                        color: detailViewLang === 'zh' ? '#ffffff' : 'var(--text-secondary, #94a3b8)',
                        border: 'none',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: detailViewLang === 'zh' ? '700' : '500',
                        cursor: 'pointer'
                      }}
                    >
                      {t('announcements.langZh', '中文版')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailViewLang('en')}
                      style={{
                        background: detailViewLang === 'en' ? 'var(--accent-blue, #3b82f6)' : 'transparent',
                        color: detailViewLang === 'en' ? '#ffffff' : 'var(--text-secondary, #94a3b8)',
                        border: 'none',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: detailViewLang === 'en' ? '700' : '500',
                        cursor: 'pointer'
                      }}
                    >
                      {t('announcements.langEn', 'English')}
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={() => setDetailNotice(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* 正文 */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              <h2 style={{ fontSize: '1.3rem', fontWeight: '700', color: 'var(--text-primary, #ffffff)', margin: '0 0 14px 0', lineHeight: 1.4 }}>
                {getDisplayTitle(detailNotice, detailViewLang)}
              </h2>

              {/* 发布人（无Badge，纯头像+姓名） */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                paddingBottom: '14px',
                marginBottom: '16px',
                borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.06))'
              }}>
                <img
                  src={detailNotice.author?.avatarUrl || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + (detailNotice.author?.name || 'admin')}
                  alt="Avatar"
                  style={{ width: '32px', height: '32px', borderRadius: '50%' }}
                />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-primary, #f1f5f9)' }}>
                    {detailNotice.author?.name || t('announcements.adminTeamFallback', '管理团队')}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)' }}>
                    {t('announcements.postedAt', {
                      time: detailNotice.createdAt ? new Date(detailNotice.createdAt).toLocaleString(detailViewLang === 'en' ? 'en-US' : 'zh-CN', { hour12: false }) : ''
                    }, `发布于 ${detailNotice.createdAt ? new Date(detailNotice.createdAt).toLocaleString(detailViewLang === 'en' ? 'en-US' : 'zh-CN', { hour12: false }) : ''}`)}
                  </span>
                </div>
              </div>

              <SimpleMarkdownRenderer content={getDisplayContent(detailNotice, detailViewLang)} />
            </div>

            {/* 底部确认栏 */}
            <div style={{
              padding: '14px 24px',
              borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              background: 'rgba(0,0,0,0.15)'
            }}>
              <button
                onClick={() => setDetailNotice(null)}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: 'none',
                  color: '#ffffff',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                {t('announcements.detailModalClose', '关闭')}
              </button>

              {detailNotice.requireAck && (
                <button
                  onClick={() => {
                    handleAcknowledge(detailNotice);
                    setDetailNotice(null);
                  }}
                  disabled={Boolean(myReads[detailNotice.id]?.ackAt)}
                  style={{
                    background: Boolean(myReads[detailNotice.id]?.ackAt) ? 'rgba(34, 197, 94, 0.2)' : 'var(--accent-blue, #3b82f6)',
                    border: 'none',
                    color: '#ffffff',
                    padding: '8px 18px',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: '700',
                    cursor: Boolean(myReads[detailNotice.id]?.ackAt) ? 'default' : 'pointer'
                  }}
                >
                  {Boolean(myReads[detailNotice.id]?.ackAt) ? t('announcements.alreadyKnown', '✓ 已确认知晓') : t('announcements.detailModalAckBtn', '我已知晓并确认')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          抽屉 3：发布新公告抽屉 (Create Announcement Drawer，支持双语录入)
          ======================================================== */}
      {isCreateOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <div style={{
            width: '560px',
            maxWidth: '100%',
            height: '100%',
            background: 'var(--bg-surface, #1e293b)',
            boxShadow: '-10px 0 30px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderLeft: '1px solid var(--border-subtle, rgba(255,255,255,0.1))'
          }}>
            {/* 顶栏 */}
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '700', color: 'var(--text-primary, #ffffff)' }}>
                {t('announcements.createModalTitle', '📢 发布新公告 / 系统更新')}
              </h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.3rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* 表单主体 */}
            <form onSubmit={handleCreateAnnouncement} style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  {t('announcements.fieldCategory', '公告类型')}
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  {[
                    { id: 'SUPERVISOR', label: t('announcements.fieldCategorySupervisor', '部门业务') },
                    { id: 'EXECUTIVE', label: t('announcements.fieldCategoryExecutive', '高层通知') },
                    { id: 'SYSTEM_UPDATE', label: t('announcements.fieldCategorySystem', '系统更新') }
                  ].map(tab => (
                    <button
                      type="button"
                      key={tab.id}
                      onClick={() => setNewNotice({ ...newNotice, category: tab.id })}
                      style={{
                        background: newNotice.category === tab.id ? 'var(--accent-blue, #3b82f6)' : 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: newNotice.category === tab.id ? '#ffffff' : 'var(--text-secondary)',
                        padding: '8px',
                        borderRadius: '6px',
                        fontSize: '0.82rem',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  {t('announcements.fieldPriority', '优先级 (Priority)')}
                </label>
                <select
                  value={newNotice.priority}
                  onChange={(e) => setNewNotice({ ...newNotice, priority: e.target.value })}
                  style={{
                    width: '100%',
                    background: 'rgba(0,0,0,0.25)',
                    border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#ffffff',
                    fontSize: '0.88rem'
                  }}
                >
                  <option value="P2_NORMAL">{t('announcements.optP2Normal', 'P2 - 普通 (常规公告，列表正常展现)')}</option>
                  <option value="P1_HIGH">{t('announcements.optP1High', 'P1 - 重要 (琥珀色高亮，置顶推荐)')}</option>
                  <option value="P0_CRITICAL">{t('announcements.optP0Critical', 'P0 - 紧急 (红色呼吸边框，登录阻断强触达)')}</option>
                  <option value="P3_LOW">{t('announcements.optP3Low', 'P3 - 归档/次要 (浅灰紧凑，不主动打扰)')}</option>
                </select>
              </div>

              {newNotice.category === 'SYSTEM_UPDATE' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                    {t('announcements.fieldVersionTag', '版本号 (如 v2.2.0)')}
                  </label>
                  <input
                    type="text"
                    value={newNotice.versionTag}
                    onChange={(e) => setNewNotice({ ...newNotice, versionTag: e.target.value })}
                    placeholder={t('announcements.versionTagPlaceholder', '例如 v2.2.0')}
                    style={{
                      width: '100%',
                      background: 'rgba(0,0,0,0.25)',
                      border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      color: '#ffffff',
                      fontSize: '0.88rem'
                    }}
                  />
                </div>
              )}

              {/* 默认语言标题 */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  {t('announcements.fieldTitle', '公告标题')} <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newNotice.title}
                  onChange={(e) => setNewNotice({ ...newNotice, title: e.target.value })}
                  placeholder={t('announcements.titlePlaceholder', '请输入醒目的通知标题...')}
                  style={{
                    width: '100%',
                    background: 'rgba(0,0,0,0.25)',
                    border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
                    borderRadius: '8px',
                    padding: '9px 12px',
                    color: '#ffffff',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              {/* 默认语言正文 */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                  {t('announcements.fieldContent', '正文内容 (支持 Markdown 与列表)')} <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <textarea
                  required
                  value={newNotice.content}
                  onChange={(e) => setNewNotice({ ...newNotice, content: e.target.value })}
                  placeholder={t('announcements.contentPlaceholder', '填写具体通报内容或功能更新说明 (支持 ### 标题、- 列表、**加粗**)...')}
                  style={{
                    width: '100%',
                    minHeight: '120px',
                    background: 'rgba(0,0,0,0.25)',
                    border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    color: '#ffffff',
                    fontSize: '0.88rem',
                    lineHeight: 1.6,
                    resize: 'vertical'
                  }}
                ></textarea>
              </div>

              {/* 🌐 英文双语扩展栏位 (折叠/展开) */}
              <div style={{
                background: 'rgba(59, 130, 246, 0.05)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '8px',
                overflow: 'hidden'
              }}>
                <div
                  onClick={() => setIsBilingualOpen(!isBilingualOpen)}
                  style={{
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    background: 'rgba(59, 130, 246, 0.08)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.95rem' }}>🌐</span>
                    <span style={{ fontSize: '0.86rem', fontWeight: '700', color: 'var(--accent-blue, #60a5fa)' }}>
                      {t('announcements.sectionBilingual', '🌐 英文双语内容 (English Version - 可选)')}
                    </span>
                    {(newNotice.titleEn.trim() || newNotice.contentEn.trim()) && (
                      <span style={{ fontSize: '0.7rem', background: '#22c55e', color: '#fff', padding: '1px 5px', borderRadius: '4px' }}>
                        ✓
                      </span>
                    )}
                  </div>
                  <i className={`ph-bold ph-caret-${isBilingualOpen ? 'up' : 'down'}`} style={{ color: 'var(--text-muted)' }}></i>
                </div>

                {isBilingualOpen && (
                  <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(0,0,0,0.15)' }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {t('announcements.bilingualTip', '若填写英文版本，切换为英文的员工将自动优先阅读英文标题与正文')}
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '600', marginBottom: '4px', color: 'var(--text-secondary)' }}>
                        {t('announcements.fieldTitleEn', '英文标题 (English Title)')}
                      </label>
                      <input
                        type="text"
                        value={newNotice.titleEn}
                        onChange={(e) => setNewNotice({ ...newNotice, titleEn: e.target.value })}
                        placeholder={t('announcements.titleEnPlaceholder', '例如 Notice on Candidate Intake Adjustments...')}
                        style={{
                          width: '100%',
                          background: 'rgba(0,0,0,0.25)',
                          border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
                          borderRadius: '6px',
                          padding: '7px 10px',
                          color: '#ffffff',
                          fontSize: '0.85rem'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '600', marginBottom: '4px', color: 'var(--text-secondary)' }}>
                        {t('announcements.fieldContentEn', '英文正文 (English Content)')}
                      </label>
                      <textarea
                        value={newNotice.contentEn}
                        onChange={(e) => setNewNotice({ ...newNotice, contentEn: e.target.value })}
                        placeholder={t('announcements.contentEnPlaceholder', 'Enter announcement details in English (Markdown supported)...')}
                        style={{
                          width: '100%',
                          minHeight: '100px',
                          background: 'rgba(0,0,0,0.25)',
                          border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
                          borderRadius: '6px',
                          padding: '8px 10px',
                          color: '#ffffff',
                          fontSize: '0.85rem',
                          lineHeight: 1.5,
                          resize: 'vertical'
                        }}
                      ></textarea>
                    </div>
                  </div>
                )}
              </div>

              {/* 置顶与收到确认勾选 */}
              <div style={{ display: 'flex', gap: '16px', background: 'rgba(0,0,0,0.15)', padding: '12px', borderRadius: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={newNotice.isPinned}
                    onChange={(e) => setNewNotice({ ...newNotice, isPinned: e.target.checked })}
                  />
                  <span>{t('announcements.checkIsPinned', '置顶公告')}</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={newNotice.requireAck}
                    onChange={(e) => setNewNotice({ ...newNotice, requireAck: e.target.checked })}
                  />
                  <span>{t('announcements.checkRequireAck', '要求点击“收到/已阅”')}</span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: 'none',
                    color: '#ffffff',
                    padding: '9px 18px',
                    borderRadius: '8px',
                    fontSize: '0.88rem',
                    cursor: 'pointer'
                  }}
                >
                  {t('announcements.cancelBtn', '取消')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    background: 'var(--accent-blue, #3b82f6)',
                    border: 'none',
                    color: '#ffffff',
                    padding: '9px 24px',
                    borderRadius: '8px',
                    fontSize: '0.88rem',
                    fontWeight: '700',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    boxShadow: '0 2px 10px rgba(59, 130, 246, 0.4)'
                  }}
                >
                  {isSubmitting ? t('announcements.submittingBtn', '发布中...') : t('announcements.submitBtn', '立即发布')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 样式定义 */}
      <style>{`
        @keyframes p0Pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.3; transform: scale(1.3); }
          100% { opacity: 1; transform: scale(1); }
        }
        @media (max-width: 1024px) {
          div[style*="gridTemplateColumns: minmax(0, 7fr) minmax(320px, 3fr)"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
