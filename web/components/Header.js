'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useNotifications } from '../lib/notification-context';
import { useI18n } from '../lib/i18n-context';
import { useAuth } from '../lib/auth-context';
import SectionTitleWithHelp from './SectionTitleWithHelp';
import CommissionWalletBadge from './CommissionWalletBadge';
import { APP_VERSION, BUILD_DATE, RELEASE_CODENAME } from '../lib/version';

const DOCS_BASE_URL = process.env.NEXT_PUBLIC_DOCS_URL || '/docs';

const PAGE_TITLES = {
  '/announcements': { 
    title: '公告与系统日志', 
    subtitle: '管理层与业务公告、系统更新日志与查岗确认',
    docSlug: 'announcements',
    helpGuide: [
      '双栏分流浏览：左侧关注管理与业务通报，右侧时间轴跟踪系统更新日志',
      '强制知晓保障：P0 紧急公告要求点击确认，全员触达不遗漏',
      '主管查岗看板：管理层可实时查阅全团队各成员已读与确认状态'
    ]
  },
  '/overview': { 
    title: '工作台概览', 
    subtitle: 'Internship 招聘看板与核心数据指标',
    docSlug: 'overview',
    helpGuide: [
      '核心指标看板：聚合展现总候选人、进行中流程、近期面试与关键转化率',
      '快捷日程概览：实时同步近期排期面试与最新候选人流转记录'
    ]
  },
  '/orders': { 
    title: '招聘订单与岗位需求库', 
    subtitle: '目标公司招聘指标、薪资福利、工作时间与多词智能检索',
    docSlug: 'orders',
    helpGuide: [
      '职位需求管理：录入与维护合作企业的开放职位、名额指标与薪酬工时',
      '智能多维检索：支持按薪资、工作地点、技能与状态多关键词检索',
      'AI 简章联动：基于岗位信息一键提炼并生成标准化中英简章'
    ]
  },
  '/candidates': { 
    title: '候选人管理', 
    subtitle: '全流程信息追踪、面评档案与标签管理',
    docSlug: 'candidates',
    helpGuide: [
      '全生命周期档案：追踪候选人基本信息、IC/联系方式与求职记录',
      '流转与批量操作：推进初筛至入职各阶段，支持意向企业批量关联',
      '私密安全保护：支持私密薪资与佣金端到端零知识加密保护'
    ]
  },
  '/pipeline': { 
    title: '招聘看板', 
    subtitle: '5 阶段敏捷流转与拖拽式候选人状态管理',
    docSlug: 'pipeline',
    helpGuide: [
      '敏捷泳道看板：直观呈现初筛、沟通、面试、Offer到入职的分布',
      '拖拽式状态流转：拖拽候选人卡片即可秒级更新阶段并记录审计',
      '只读视图保护：穿透查看合作人团队数据时自动锁定修改权限'
    ]
  },
  '/calendar': { 
    title: '面试日程', 
    subtitle: '面试排期、日历视图与待办议程',
    docSlug: 'calendar',
    helpGuide: [
      '多视图排期：按月历与周历直观排期候选人面试与重要日程',
      '顾问筛选聚焦：支持查看全团队日程或聚焦筛选特定顾问经办事项',
      '外部日历导出：支持一键导出 ICS 日程或快捷同步至 Google 日历'
    ]
  },
  '/analytics': { 
    title: '数据洞察', 
    subtitle: '全环节转化漏斗、渠道分析与招聘效能',
    docSlug: 'analytics',
    helpGuide: [
      '全链路漏斗分析：监控初筛到入职各环节转化率与流失瓶颈',
      '渠道效能统计：分析不同招聘渠道的投入产出与候选人质量'
    ]
  },
  '/leaderboard': { 
    title: 'Leaderboard', 
    subtitle: '团队考勤与销售业绩实时排行',
    docSlug: 'leaderboard',
    helpGuide: [
      '销售业绩排行：统计顾问成功入职、Offer 与面试等核心业务成单效能',
      '考勤出勤排行：呈现出勤天数、出勤率及办公室与 WFH 出勤分布'
    ]
  },
  '/team': { 
    title: '团队与权限', 
    subtitle: '多用户团队协作与角色管理',
    docSlug: 'team',
    helpGuide: [
      '权限层级管理：精细划分 Owner (所有者)、Manager (管理员) 与 Recruiter (招聘员)',
      '合作人单向穿透：HQ 可单向穿透查看合作人数据，合作人无法查看本部',
      '成员调度与审核：支持新用户审核入队与现有成员团队归属/权限调配'
    ]
  },
  '/settings': { 
    title: '系统设置', 
    subtitle: '数据导入导出与全局配置',
    docSlug: 'settings',
    helpGuide: [
      'Google Sheets 同步：支持 12 列映射导入与 AI 智能清洗',
      'E2EE 零知识密钥库：管理本地加密密钥，确保敏感薪酬端到端安全',
      '系统偏好设定：中英多语言切换、外观主题与通知规则'
    ]
  },
  '/ai-parser': { 
    title: 'AI 职位生成', 
    subtitle: '智能解析招聘文本并生成多语言简章',
    docSlug: 'ai-parser',
    helpGuide: [
      '智能信息提炼：粘贴文本或上传文档，AI 自动提炼核心职位要素',
      '多语言版本导出：自动生成内部详尽版、中文对外版与英文版',
      '订单库快速关联：生成完毕可一键与招聘订单库岗位绑定归档'
    ]
  },
  '/feedback': { 
    title: '意见与反馈中心', 
    subtitle: '收集团队改进建议、需求期待与问题报修',
    docSlug: 'feedback',
    helpGuide: [
      '需求期待收集：提交顾问在日常使用中的痛点与新功能期望',
      '问题报修追踪：快速上报系统异常，技术团队优先排查'
    ]
  },
  '/cv-autofill': { 
    title: 'CV 简历解析与入库', 
    subtitle: '批量/独立界面的 AI 简历智能解析与入库',
    docSlug: 'cv-autofill',
    helpGuide: [
      '简历智能提取：AI 自动解析 PDF/Word 简历中的联系方式、学历与履历',
      '核对与快速建档：可视化预览核对后一键导入候选人数据库'
    ]
  },
  '/talent-pool': { 
    title: '储备人才库', 
    subtitle: '已淘汰/暂缓跟进候选人沉淀与唤醒激活',
    docSlug: 'talent-pool',
    helpGuide: [
      '人才资产沉淀：归档淘汰与暂缓跟进的候选人，沉淀企业人才资产',
      '细分原因检索：按未接电话、薪资不符、已接其他Offer等精细检索',
      '一键重新激活：匹配到新招聘岗位时可一键唤醒并转入活跃流程'
    ]
  },
  '/whatsapp': { 
    title: 'WhatsApp 触达控制台', 
    subtitle: '候选人自动跟进、提醒回传与会话管理',
    docSlug: 'whatsapp',
    helpGuide: [
      '多租户会话调度：连接独立 WhatsApp 节点，支持点对点快速触达',
      '面试提醒回传：到期自动向候选人与顾问发送日程跟进提醒'
    ]
  },
  '/docs': {
    title: '用户操作与业务手册',
    subtitle: 'TALENT FLOW 全功能实操指引与业务规范',
    docSlug: 'overview',
    helpGuide: [
      '系统全景指引：全流程业务闭环、订单管理与候选人流转指南',
      '快捷锚点定位：支持按模块一键跳转对应教程章节',
      '持续演进知识库：团队实操规范与自动化配置手册'
    ]
  },
};

export default function Header({ toggleSidebar }) {
  const pathname = usePathname();
  const { unreadCount, setIsPanelOpen } = useNotifications();
  const { lang, toggleLang, t } = useI18n();
  const { 
    isOwner,
    myTeamId, 
    activeViewTeamId, 
    activeTeamName, 
    isReadOnlyView, 
    linkedChildTeams, 
    switchActiveTeam 
  } = useAuth();
  
  const [theme, setTheme] = useState('dark');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const switcherRef = useRef(null);

  const handleManualRefresh = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    window.dispatchEvent(new CustomEvent('talent_flow_refresh'));
    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  };

  const translatedMeta = t(`header.pageTitles.${pathname}`);
  const pageMeta = (translatedMeta && typeof translatedMeta === 'object' && translatedMeta.title)
    ? translatedMeta
    : (PAGE_TITLES[pathname] || { title: 'TALENT FLOW', subtitle: 'Management' });
  const docSlug = pageMeta.docSlug || pathname.replace(/^\//, '') || 'overview';
  const docUrl = pageMeta.docUrl || (DOCS_BASE_URL.startsWith('/') ? `${DOCS_BASE_URL}#${docSlug}` : `${DOCS_BASE_URL}#/${docSlug}`);

  // Click outside to close team switcher dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target)) {
        setIsSwitcherOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme') || (typeof window !== 'undefined' ? localStorage.getItem('talent_flow_theme') : null) || 'dark';
    setTheme(current);

    const onThemeChange = () => {
      const updated = document.documentElement.getAttribute('data-theme') || 'dark';
      setTheme(updated);
    };
    window.addEventListener('themechange', onThemeChange);
    return () => window.removeEventListener('themechange', onThemeChange);
  }, []);

  const toggleTheme = () => {
    let nextTheme = 'dark';
    if (theme === 'dark') {
      nextTheme = 'gemini';
    } else if (theme === 'gemini') {
      nextTheme = 'tactical';
    } else if (theme === 'tactical') {
      nextTheme = 'light';
    } else {
      nextTheme = 'dark';
    }

    if (nextTheme === 'dark') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', nextTheme);
    }
    try {
      localStorage.setItem('talent_flow_theme', nextTheme);
    } catch (e) {}
    setTheme(nextTheme);
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: nextTheme } }));
  };

  return (
    <header className="app-header">
      <div className="header-left">
        <button className="mobile-nav-toggle" onClick={toggleSidebar}>
          <i className="ph-light ph-list"></i>
        </button>
        <div className="view-heading-box">
          <SectionTitleWithHelp 
            title={pageMeta.title} 
            helpText={pageMeta.helpGuide || pageMeta.subtitle} 
            docUrl={docUrl}
            titleStyle={{ fontSize: 'var(--text-lg)', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)' }} 
          />
          <span className="view-subheading">{pageMeta.subtitle}</span>
        </div>
      </div>
      
      <div className="header-right">
        {/* Multi-Team Switcher (Strictly visible only to Owner) */}
        {isOwner && linkedChildTeams && linkedChildTeams.length > 0 && (
          <div style={{ position: 'relative' }} ref={switcherRef}>
            <button 
              className="header-team-switcher-btn"
              onClick={() => setIsSwitcherOpen(!isSwitcherOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                background: isReadOnlyView ? 'rgba(245, 158, 11, 0.15)' : 'var(--input-bg)',
                border: `1px solid ${isReadOnlyView ? 'rgba(245, 158, 11, 0.45)' : 'var(--border-interactive)'}`,
                color: isReadOnlyView ? 'var(--accent-amber)' : 'var(--text-primary)',
                fontSize: 'var(--text-xs)',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: isReadOnlyView ? '0 0 10px rgba(245, 158, 11, 0.15)' : 'none'
              }}
              title={t('team.teamSwitcherTitle', '团队视图切换')}
            >
              <i className={isReadOnlyView ? "ph-bold ph-eye" : "ph-bold ph-buildings"} style={{ fontSize: '13px' }}></i>
              <span className="header-team-switcher-name" style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeViewTeamId === myTeamId ? t('team.myHqTeamShort', activeTeamName) : activeTeamName}
              </span>
              <i className="ph-bold ph-caret-down" style={{ fontSize: '10px', opacity: 0.7 }}></i>
            </button>

            {isSwitcherOpen && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                minWidth: '230px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-interactive)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-xl)',
                padding: '6px',
                zIndex: 1000,
                backdropFilter: 'blur(16px)'
              }}>
                <div style={{ padding: '6px 10px', fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {t('team.teamSwitcherTitle', '团队视图切换')}
                </div>
                
                {/* HQ / Own Team */}
                <button
                  onClick={() => { switchActiveTeam(myTeamId); setIsSwitcherOpen(false); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-md)',
                    background: activeViewTeamId === myTeamId ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                    border: 'none',
                    color: activeViewTeamId === myTeamId ? 'var(--accent-blue)' : 'var(--text-primary)',
                    fontSize: 'var(--text-xs)',
                    fontWeight: activeViewTeamId === myTeamId ? '700' : '500',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="ph-bold ph-buildings" style={{ fontSize: '14px' }}></i>
                    <span>{t('team.myHqTeam', '公司本部 (自有数据)')}</span>
                  </div>
                  {activeViewTeamId === myTeamId && <i className="ph-bold ph-check" style={{ fontSize: '13px' }}></i>}
                </button>

                <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '6px 0' }} />

                <div style={{ padding: '4px 10px 6px', fontSize: '11px', fontWeight: '700', color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <i className="ph-bold ph-handshake" style={{ fontSize: '13px' }}></i>
                  <span>{t('team.partnerTeamsHeader', '合作人团队 (单向只读)')}</span>
                </div>

                {linkedChildTeams.map((link) => (
                  <button
                    key={link.id}
                    onClick={() => { switchActiveTeam(link.childTeamId); setIsSwitcherOpen(false); }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-md)',
                      background: activeViewTeamId === link.childTeamId ? 'rgba(245, 158, 11, 0.12)' : 'transparent',
                      border: 'none',
                      color: activeViewTeamId === link.childTeamId ? 'var(--accent-amber)' : 'var(--text-primary)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: activeViewTeamId === link.childTeamId ? '700' : '500',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <i className="ph-light ph-user-focus" style={{ fontSize: '14px' }}></i>
                      <span>{link.childTeamName}</span>
                    </div>
                    {activeViewTeamId === link.childTeamId && <i className="ph-bold ph-check" style={{ fontSize: '13px' }}></i>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Global Version Badge */}
        <div
          className="header-version-pill"
          title={
            (t('header.versionBadgeTitle') || 'TALENT FLOW {version} (Build: {date}) - {codename}')
              .replace('{version}', APP_VERSION)
              .replace('{date}', BUILD_DATE)
              .replace('{codename}', RELEASE_CODENAME)
          }
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 11px',
            borderRadius: '9999px',
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.22)',
            fontSize: '11px',
            fontWeight: '600',
            color: 'var(--accent-blue)',
            letterSpacing: '0.02em',
            userSelect: 'none',
            whiteSpace: 'nowrap',
            lineHeight: 1,
            flexShrink: 0,
            cursor: 'default',
            transition: 'all 0.2s ease'
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#10b981',
              display: 'inline-block',
              boxShadow: '0 0 6px rgba(16, 185, 129, 0.75)'
            }}
          />
          <span>{APP_VERSION}</span>
        </div>

        {/* Dual-State Commission Wallet Badge (Phase 6) */}
        <CommissionWalletBadge />

        {/* Quick Refresh Data Action Button */}
        <button
          className="theme-toggle-btn header-refresh-btn"
          onClick={handleManualRefresh}
          title={t('header.refreshData', '刷新数据')}
          aria-label="Refresh Data"
        >
          <i className={`ph-light ph-arrows-clockwise ${isRefreshing ? 'ph-spin' : ''}`}></i>
        </button>

        {/* Quick Language Toggle Button */}
        <button
          className="lang-toggle-btn header-lang-btn"
          onClick={toggleLang}
          title={lang === 'zh' ? 'Switch to English / 切换至英文' : '切换为中文 / Switch to Chinese'}
          aria-label="Toggle Language"
        >
          <span className="lang-code">{lang === 'zh' ? 'EN' : '中'}</span>
          <i className="ph-light ph-translate"></i>
        </button>

        {/* Quick Theme Toggle Button */}
        <button 
          className="theme-toggle-btn header-theme-btn" 
          onClick={toggleTheme} 
          title={
            theme === 'dark' 
              ? (lang === 'en' ? 'Current: OLED Dark (Click to switch to Gemini Cosmos)' : '当前: OLED 深空 (点击切换为 Gemini 宇宙)')
              : theme === 'gemini'
                ? (lang === 'en' ? 'Current: Gemini Cosmos (Click to switch to Tactical Command)' : '当前: Gemini 宇宙 (点击切换为战术指挥)')
                : theme === 'tactical'
                  ? (lang === 'en' ? 'Current: Tactical Command (Click to switch to Daylight Light)' : '当前: 战术指挥 (点击切换为日间清爽)')
                  : (lang === 'en' ? 'Current: Daylight (Click to switch to OLED Dark)' : '当前: 日间清爽 (点击切换为 OLED 深空)')
          }
          aria-label="Toggle Theme"
          style={theme === 'gemini' ? {
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.22) 0%, rgba(168, 85, 247, 0.28) 50%, rgba(236, 72, 153, 0.22) 100%)',
            borderColor: 'rgba(168, 85, 247, 0.55)',
            boxShadow: '0 0 14px rgba(168, 85, 247, 0.4)'
          } : theme === 'tactical' ? {
            background: 'rgba(16, 185, 129, 0.15)',
            borderColor: 'rgba(16, 185, 129, 0.6)',
            boxShadow: '0 0 14px rgba(16, 185, 129, 0.35)'
          } : undefined}
        >
          {theme === 'dark' && <i className="ph-light ph-moon"></i>}
          {theme === 'gemini' && (
            <i 
              className="ph-fill ph-sparkle" 
              style={{ 
                color: '#c084fc', 
                filter: 'drop-shadow(0 0 6px rgba(192, 132, 252, 0.85))' 
              }}
            ></i>
          )}
          {theme === 'tactical' && (
            <i 
              className="ph-bold ph-crosshair" 
              style={{ 
                color: '#10b981', 
                filter: 'drop-shadow(0 0 6px rgba(16, 185, 129, 0.8))' 
              }}
            ></i>
          )}
          {theme === 'light' && <i className="ph-light ph-sun" style={{ color: '#d97706' }}></i>}
        </button>

        {/* Global Notification Bell */}
        <button className="header-bell-btn" onClick={() => setIsPanelOpen(true)} title={t('header.notifications', '通知中心')}>
          <i className={`ph-light ph-bell ${unreadCount > 0 ? 'bell-shake' : ''}`}></i>
          {unreadCount > 0 && <span className="bell-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
        </button>
      </div>
    </header>
  );
}
