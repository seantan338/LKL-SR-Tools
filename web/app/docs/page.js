'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useI18n } from '../../lib/i18n-context';
import { sectionsEn } from './docs_content_en';

export default function StandaloneDocsPage() {
  const router = useRouter();
  const { t, lang, toggleLang } = useI18n();
  const [activeSection, setActiveSection] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedSection, setCopiedSection] = useState(null);
  const [theme, setTheme] = useState('dark');
  const [showBackToTop, setShowBackToTop] = useState(false);

  // Sync theme
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

  // Back to top scroll listener
  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // 15 Documentation Sections
  const sectionsZh = [
    {
      id: 'overview',
      title: '1. 快速上手与工作台 (Overview)',
      badge: '入门基础',
      icon: 'ph-compass',
      tag: '核心',
      summary: '双模运行模式、新账号审批入队、工作台 KPI 指标概览与多语言主题切换。',
      content: (
        <div className="doc-section-body">
          <h4>🌟 系统架构与登录</h4>
          <p>
            TALENT FLOW 提供<strong>云原生 Web 协作版</strong>与 <strong>Electron 本地单机版</strong>双轨运行机制。团队推荐使用 Web 端进行多人实时协作。
          </p>
          <div className="doc-callout doc-callout-info">
            <strong><i className="ph-bold ph-shield-check"></i> 新用户入队审批机制 (Pending 状态)：</strong>
            <p>
              为了保护企业候选人隐私与商业机密，新注册用户账号默认处于 <code>待审核 (pending)</code> 状态。请联系团队 <code>Owner</code> 或 <code>Manager</code> 进入「团队与权限」页面点击「批准」并分配 <code>Recruiter</code> 角色后即可正常开展业务。
            </p>
          </div>
          <h4>📊 工作台概览核心功能</h4>
          <ul>
            <li><strong>关键指标卡片</strong>：实时呈现总候选人、进行中流程、近期面试场次与综合入职转化率。</li>
            <li><strong>敏捷阶段分布条</strong>：一览各流程阶段的候选人堆积情况，直观发现推进瓶颈。</li>
            <li><strong>今日待办与日程预警</strong>：自动聚合即将开始的面试与设置了定时跟进的候选人提醒。</li>
          </ul>
        </div>
      )
    },
    {
      id: 'orders',
      title: '2. 招聘订单使用教程 (Job Orders)',
      badge: '需求管理',
      icon: 'ph-briefcase',
      tag: '高频',
      summary: '招聘需求统一录入、多词空格智能联搜、E2EE 零知识加密保密笔记及 AI 智能人岗推荐。',
      content: (
        <div className="doc-section-body">
          <div className="doc-callout doc-callout-info">
            <strong><i className="ph-bold ph-target"></i> 适用对象：</strong>
            <span>招聘顾问、团队主管、客户经理、公司负责人</span>
          </div>

          <h4>一、招聘订单是做什么的</h4>
          <p>
            招聘订单就是客户的一个招聘需求（一个职位）。它是整个招聘流程的起点和交付目标：先有订单，才知道要找什么样的人、找几个、薪资多少。
          </p>
          <p>订单模块帮你解决四件事：</p>
          <ul>
            <li><strong>需求规范归拢</strong>：需求不再散落在微信和邮件里，统一录入、统一查看；</li>
            <li><strong>进度一目了然</strong>：清楚知道哪些职位急缺人、哪些已经招满；</li>
            <li><strong>商业机密防护</strong>：客户底价、佣金等敏感信息通过密码学加密保存；</li>
            <li><strong>AI 智能人岗匹配</strong>：新订单进来后，用 AI 从人才库里快速找出合适的人。</li>
          </ul>

          <h4>二、进入订单页与界面分区</h4>
          <ul>
            <li><strong>进入方式</strong>：左侧菜单点击 <strong>招聘订单</strong>，地址为 <code>/orders</code>。</li>
            <li><strong>页面四大区域</strong>：
              <ol style={{ margin: '6px 0 6px 20px' }}>
                <li><strong>顶部工具条</strong>：搜索框、状态筛选、「同步 Embedding」按钮、「发布职位」按钮。</li>
                <li><strong>订单卡片区</strong>：每个订单一张卡片，显示职位、公司、薪资、地点、需求人数和当前状态。</li>
                <li><strong>快速状态下拉</strong>：卡片底部可以直接改状态，不用打开编辑表单。</li>
                <li><strong>订单详情抽屉</strong>：点「查看详情」后从右侧滑出，包含完整要求、保密笔记和 AI 推荐入口。</li>
              </ol>
            </li>
          </ul>

          <h4>三、五种订单状态</h4>
          <table className="doc-table">
            <thead>
              <tr>
                <th>状态</th>
                <th>含义</th>
                <th>什么时候用</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span className="badge" style={{ color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.3)' }}>进行中 (open)</span></td>
                <td>正常推进</td>
                <td>标准开放的需求</td>
              </tr>
              <tr>
                <td><span className="badge" style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)' }}>急聘 (urgent)</span></td>
                <td>高优先级</td>
                <td>客户急缺人，需要优先推荐</td>
              </tr>
              <tr>
                <td><span className="badge" style={{ color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', borderColor: 'rgba(245, 158, 11, 0.3)' }}>暂停 (paused)</span></td>
                <td>暂时不招</td>
                <td>客户调整架构、冻结编制</td>
              </tr>
              <tr>
                <td><span className="badge" style={{ color: '#8b5cf6', background: 'rgba(139, 92, 246, 0.1)', borderColor: 'rgba(139, 92, 246, 0.3)' }}>满额 (filled)</span></td>
                <td>人数已招满</td>
                <td>候选人已入职，需求达成</td>
              </tr>
              <tr>
                <td><span className="badge" style={{ color: '#6b7280', background: 'rgba(107, 114, 128, 0.1)', borderColor: 'rgba(107, 114, 128, 0.3)' }}>已关闭 (closed)</span></td>
                <td>终止</td>
                <td>合作结束、需求取消或超时下架</td>
              </tr>
            </tbody>
          </table>
          <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
            * 改状态后，系统会自动记录一条操作审计日志。
          </p>

          <h4>四、基本操作</h4>
          <ol style={{ margin: '8px 0 16px 20px', lineHeight: '1.7' }}>
            <li>
              <strong>发布一个新职位（推荐用 AI 解析）</strong>：
              <ol style={{ margin: '6px 0 8px 18px' }}>
                <li>点击右上角「<strong>发布职位</strong>」。</li>
                <li>点击表单顶部的「<strong>AI 智能解析</strong>」。</li>
                <li>把客户在微信或邮件里发来的原始需求整段粘贴进去，点击「<strong>AI 解析</strong>」。</li>
                <li>系统会自动填好公司名、岗位名称、薪资区间、工作地点、工时制、技能与经验要求、福利待遇和注意事项。</li>
                <li>逐项核对，有错就改，再补充私密笔记（见下文），最后保存发布。</li>
              </ol>
              <div className="doc-callout doc-callout-warning" style={{ margin: '6px 0' }}>
                <strong>小提醒：</strong>AI 填写的内容一定要人工核对一遍，尤其是薪资数字和地点。
              </div>
            </li>
            <li>
              <strong>搜索订单（空格分词联搜）</strong>：
              <p style={{ margin: '4px 0' }}>
                在搜索框输入多个关键词，用空格隔开，例如 <code>前端 远程 25k</code> 或 <code>深圳 运营 急聘</code>。系统会把每个词拆开，在公司名、岗位、薪资、地点、任职要求、福利、工作时间、团队备注乃至解密后的私密笔记里查找，<strong>只有同时包含所有关键词的订单才会显示</strong>。词越多，范围越窄。
              </p>
            </li>
            <li>
              <strong>快速修改状态</strong>：
              <p style={{ margin: '4px 0' }}>
                在订单卡片底部的下拉菜单里直接选新状态，立即生效，不用进入编辑表单。
              </p>
            </li>
            <li>
              <strong>查看订单详情</strong>：
              <p style={{ margin: '4px 0' }}>
                点击卡片上的「<strong>查看详情</strong>」，右侧抽屉里可以看到岗位信息、薪酬范围、工作时间制、任职资格、福利待遇、私密笔记和 AI 推荐入口。
              </p>
            </li>
            <li>
              <strong>写私密笔记（端到端加密）</strong>：
              <p style={{ margin: '4px 0' }}>
                客户的真实底价、佣金点数、回款周期、对接人信息这类内容，请只写在「<strong>私密笔记（Secret Notes）</strong>」里，不要写在公开备注里。
              </p>
              <ul>
                <li>笔记在你的浏览器里加密后才上传，云端只保存密文（以 <code>TLFL_E2EE_V1:</code> 开头）；</li>
                <li>只有输入了团队金库密码的成员，才能在自己的浏览器里解密查看；</li>
                <li>如果看到“已加密内容，请输入金库密码查看”，说明金库处于锁定状态，在金库入口输入口令即可。</li>
              </ul>
            </li>
            <li>
              <strong>用 AI 智能推荐找人</strong>：
              <ol style={{ margin: '6px 0 8px 18px' }}>
                <li>打开某个订单的详情抽屉，点击右上角「<strong>AI 智能推荐</strong>」。</li>
                <li>在弹出的窗口里调整权重：技能匹配、工作经验、薪资偏好、期望地点，各自重视到什么程度。</li>
                <li>系统用语义向量把人才库里所有简历与这个职位要求做对比。</li>
                <li>结果面板列出得分最高的候选人，显示匹配度（如 95%）和 AI 写的推荐理由。</li>
                <li>点击候选人姓名，可以直接打开他的详情抽屉，联系并推进。</li>
              </ol>
            </li>
            <li>
              <strong>同步 Embedding</strong>：
              <p style={{ margin: '4px 0' }}>
                如果团队最近批量导入了很多新简历，或者推荐结果为空、不够新，先点击顶部的「<strong>同步 Embedding</strong>」。系统会刷新向量库，之后推荐才会包含最新的人才。
              </p>
            </li>
          </ol>

          <h4>五、一日工作流程</h4>
          <div className="doc-callout doc-callout-tip">
            <ol style={{ margin: '4px 0 0 20px', lineHeight: '1.7' }}>
              <li><strong>接单录入</strong>：客户发来需求，点「发布职位」，粘贴原文，AI 解析，核对，补私密笔记，发布。</li>
              <li><strong>AI 找人</strong>：打开订单详情，点「AI 智能推荐」，挑选高分候选人，联系他们。</li>
              <li><strong>推进跟进</strong>：在招聘看板里把候选人依次推进到初筛、面试、Offer、入职。</li>
              <li><strong>满额归档</strong>：人数招满后，在订单卡片上把状态改成「满额」。</li>
            </ol>
          </div>

          <h4>六、和候选人管理页配合使用</h4>
          <p>
            「候选人管理」页（<code>/candidates</code>）和订单是配套协作的。
          </p>
          <ul>
            <li><strong>页面构成</strong>：
              <ul>
                <li><strong>搜索框</strong>：可按姓名、公司、职位、电话搜索。</li>
                <li><strong>「所有意向企业」下拉</strong>：按客户企业筛选。</li>
                <li><strong>「全部（数量）」下拉</strong>：按阶段筛选，括号里的数字代表符合条件的总人数（如 <em>全部 (356)</em> 代表总计 356 人）。</li>
                <li><strong>AI 智能简历导入</strong>：把简历交给 AI 自动提取信息建档。</li>
                <li><strong>录入候选人</strong>：手动新建候选人。</li>
                <li><strong>列表列</strong>：候选人（姓名、电话、WhatsApp 图标、标签）、意向企业/应聘岗位、当前阶段、更新时间；每行右侧有红色删除按钮和进入详情的箭头。</li>
              </ul>
            </li>
            <li><strong>两个模块怎么衔接</strong>：
              <ul>
                <li><strong>自动下拉关联</strong>：在录入候选人时，在“应聘企业”或“应聘岗位”里输入关键字，系统会自动列出订单库中状态为「进行中」或「急聘」的职位，可以一键选中。这样公司名和岗位名不会写错，统计也更准。所以订单状态要及时维护：已招满或暂停的订单不要继续留在“进行中”。</li>
                <li><strong>未指定岗位排查</strong>：若候选人显示“未指定岗位”，意思是他们还没有关联到具体订单职位。可以进入详情补上，也方便之后统计各订单的推进情况。</li>
                <li><strong>阶段与看板对应</strong>：列表里的“当前阶段”标签（如面试考核、Offer 发放）与招聘看板的泳道是完全对应的。</li>
                <li><strong>淘汰人才沉淀</strong>：已淘汰的候选人（带“淘汰”标记、阶段显示“已淘汰·已接其他Offer/他家入职”）在候选人管理里仍然能看到，但不会出现在招聘看板活跃泳道上。</li>
              </ul>
            </li>
          </ul>

          <h4>七、权限与只读保护</h4>
          <p>
            管理员在「团队管理」切换到合作团队视角时，订单页会进入单向只读模式：顶部出现金色的「<strong>单向只读 · 合作人数据</strong>」勋章，新建、编辑和删除按钮自动隐藏，避免巡检时误改别人团队的订单。
          </p>

          <h4>八、常见问题与解答 (FAQ)</h4>
          <div className="faq-item">
            <h5>Q: AI 智能推荐结果为空，或者没有最新的人？</h5>
            <p>A: 先点页面顶部的“同步 Embedding”，刷新完成后再试。</p>
          </div>
          <div className="faq-item">
            <h5>Q: 私密笔记显示“已加密内容，请输入金库密码查看”？</h5>
            <p>A: 说明金库还没解锁，输入团队金库口令即可。口令请向团队负责人确认，系统无法替你找回明文。</p>
          </div>
          <div className="faq-item">
            <h5>Q: 改了订单的薪资或要求，之前绑定的候选人会受影响吗？</h5>
            <p>A: 不会，已建档候选人的历史记录不变。之后新建候选人时的联想提示，以及下一次 AI 推荐，会按最新订单内容计算。</p>
          </div>
          <div className="faq-item">
            <h5>Q: 搜索不出东西？</h5>
            <p>A: 检查是不是关键词太多：多个词之间是“且”的关系，必须全部命中。减少一两个词再试。</p>
          </div>
          <div className="faq-item">
            <h5>Q: 订单页的按钮不见了？</h5>
            <p>A: 先确认是否处于合作团队的只读视图，切换回自己的团队即可。</p>
          </div>
        </div>
      )
    },
    {
      id: 'candidates',
      title: '3. 候选人管理使用实战教程 (Candidate Management)',
      badge: '档案中台',
      icon: 'ph-users',
      tag: '核心',
      summary: '全量候选人档案总库。支持多维复合搜索、企业/阶段筛选、AI批量建档、批量设置企业、WhatsApp免存直通及360°全景档案抽屉。',
      content: (
        <div className="doc-section-body">
          <div className="doc-callout doc-callout-info">
            <strong><i className="ph-bold ph-target"></i> 适用对象：</strong>
            <span>招聘顾问、团队主管、客户经理、公司负责人</span>
          </div>

          <h4>一、候选人管理是做什么的</h4>
          <p>
            候选人管理是系统里所有候选人的<strong>全局总档案库与数据中台</strong>。与另外两个相关模块的分工与定位如下：
          </p>
          <table className="doc-table">
            <thead>
              <tr>
                <th>模块页面</th>
                <th>核心职责</th>
                <th>展示范围</th>
                <th>典型操作</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>候选人管理 (/candidates)</strong></td>
                <td>总档案库、批量作业、资产检索</td>
                <td>全量候选人（活跃推进 + 历史淘汰）</td>
                <td>查人、批量指派企业、AI批量建档、360°抽屉维护</td>
              </tr>
              <tr>
                <td><strong>招聘看板 (/pipeline)</strong></td>
                <td>日常敏捷推进、阶段泳道管理</td>
                <td>仅展示当前处于流程中的活跃人员</td>
                <td>鼠标拖拽流转阶段、实时监控各环节堆积与转化卡点</td>
              </tr>
              <tr>
                <td><strong>储备人才库 (/talent-pool)</strong></td>
                <td>资产沉淀、沉睡人才唤醒与激活</td>
                <td>仅展示已被标记淘汰/放弃的候选人</td>
                <td>细分淘汰原因检索、新订单上线时一键唤醒回流</td>
              </tr>
            </tbody>
          </table>

          <h4>二、界面认识与四大功能分区</h4>
          <ul>
            <li><strong>进入方式</strong>：左侧菜单点击 <strong>候选人管理</strong>，浏览器访问地址为 <code>/candidates</code>。</li>
            <li><strong>页面四大功能分区</strong>：
              <ol style={{ margin: '6px 0 6px 20px' }}>
                <li><strong>标题区</strong>：展示页面标题“候选人管理”，右侧配备语言切换（中/EN）、深浅主题切换、系统通知铃铛与团队切换器。</li>
                <li><strong>搜索与筛选工具条</strong>：
                  <ul>
                    <li><strong>复合搜索框</strong>：提示为“搜索候选人姓名、公司、职位、电话…”，支持 10+ 维度的全文模糊检索；</li>
                    <li><strong>意向企业下拉筛选</strong>：按目标客户公司筛选，独设 <code>⚠️ 未指定企业</code> 选项用于排查漏单；</li>
                    <li><strong>招聘阶段下拉筛选</strong>：如“全部 (357)”，按活跃、已淘汰或细分流程阶段精细化过滤。</li>
                  </ul>
                </li>
                <li><strong>顶部核心操作栏</strong>：
                  <ul>
                    <li><strong>AI 智能简历导入</strong>：支持批量拖拽多份 Word/PDF/图片简历并自动解析建档；</li>
                    <li><strong>录入候选人</strong>：手动新建单条档案并智能关联开放订单。</li>
                  </ul>
                </li>
                <li><strong>候选人数据大表与全局悬浮浮钮 (FAB)</strong>：每行一人集中呈现全景信息；页面右下角常驻<strong>蓝色圆形“＋”悬浮按钮 (Global FAB)</strong>，无论在长列表滚动到何处，点击均可秒级唤出建档抽屉。</li>
              </ol>
            </li>
          </ul>

          <h4>三、读懂候选人列表</h4>
          <table className="doc-table">
            <thead>
              <tr>
                <th>列项</th>
                <th>展示内容与核心细节</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>勾选框 (Checkbox)</strong></td>
                <td>单选候选人用于批量操作；表头顶部勾选框可一键「全选 / 取消全选」当前筛选结果。</td>
              </tr>
              <tr>
                <td><strong>候选人基础信息</strong></td>
                <td>圆形渐变首字母头像、加粗候选人姓名、联系电话（带绿色 WhatsApp 免存直通图标）、学历/院校/地点标签胶囊。</td>
              </tr>
              <tr>
                <td><strong>意向企业 / 应聘岗位</strong></td>
                <td>蓝色高亮显示目标客户企业（如 PSA、Santak、IPE），下方显示应聘岗位与部门；若显示“未指定企业”或“未指定岗位”，说明尚未与具体招聘需求绑定。</td>
              </tr>
              <tr>
                <td><strong>当前阶段</strong></td>
                <td>阶段徽章：如“初筛电话”（蓝色）、“面试考核”（橙色）、“Offer 发放”（紫色）、“正式入职”（绿色）。若已淘汰，展示醒目的红色「已淘汰 · 淘汰原因」。</td>
              </tr>
              <tr>
                <td><strong>更新时间</strong></td>
                <td>最近更新日期或相对时间（如“刚刚”、“3天前”）。</td>
              </tr>
              <tr>
                <td><strong>行级快捷操作</strong></td>
                <td>右侧配备红色垃圾桶（删除候选人并留存审计日志）与右箭头图标（点击展开 360° 档案抽屉）。</td>
              </tr>
            </tbody>
          </table>
          <div className="doc-callout doc-callout-warning">
            <strong><i className="ph-bold ph-info"></i> 关于已淘汰候选人的展示：</strong>
            <p>
              已淘汰的候选人在姓名右侧会标注红色「淘汰」小标，阶段徽章会明确展示具体原因（如 <em>已淘汰 · 薪资期望过高</em>）。这类候选人在列表中依然完整保留供日常检索与盘活，但会自动从「招聘看板」的活跃泳道中隐去，并沉淀入「储备人才库」。
            </p>
          </div>

          <h4>四、搜索与筛选深度技巧</h4>
          <ul>
            <li><strong>1. 多维复合联搜引擎</strong>：
              搜索框具备强大的跨字段穿透检索能力，同时匹配以下维度：
              <ul>
                <li><strong>基本信息</strong>：姓名、电话、身份证/IC 号、现居地点；</li>
                <li><strong>教育背景</strong>：毕业院校、专业、学历等级（Degree / Diploma / SPM 等）；</li>
                <li><strong>企业与岗位</strong>：意向企业、部门、岗位名称；</li>
                <li><strong>团队协作</strong>：经办顾问姓名（PIC Name）；</li>
                <li><strong>经历与面评</strong>：离职原因、私密面评 (Remarks/Notes)、淘汰原因与淘汰说明。</li>
              </ul>
              <em>💡 搜人小贴士</em>：若候选人英文拼写较长，可仅输入名字关键词（如 <code>Tan</code>）或手机尾号后 4 位快速锁定。
            </li>
            <li><strong>2. 按意向企业筛选（排查“漏单”神技）</strong>：
              点击“所有意向企业”下拉，系统动态聚合了当前库中所有客户名称。特别内置了 <strong>「⚠️ 未指定企业」</strong> 过滤器，点击后可一次性列出所有尚未分配给任何客户公司的候选人，主管可借此快速指派归属，彻底避免人才资源沉睡。
            </li>
            <li><strong>3. 按阶段筛选（7 大细分颗粒度）</strong>：
              下拉菜单提供“所有进行中”、“已淘汰”，以及更精细的 7 级流程阶段（简历初筛、初筛电话、面试考核、Offer 发放、待入职跟进、正式入职、入职后关怀），方便针对处于特定进展的人群进行专项排查。
            </li>
          </ul>

          <h4>五、全场景建档指引</h4>
          <ul>
            <li><strong>方式一：AI 智能简历导入（批量极速入库）</strong>
              <ol style={{ margin: '6px 0 6px 20px' }}>
                <li>点击列表顶部 <strong>AI 智能简历导入</strong> 按钮；</li>
                <li>将简历文件拖入弹窗区域（支持批量拖入多份）。系统支持 Word (<code>.docx</code>/<code>.doc</code>)、PDF、TXT 以及手机拍摄的清晰简历照片，单文件上限 20MB；</li>
                <li><strong>文件名逆向自动推断</strong>：若简历按规范命名（如 <code>客户公司 - 岗位 - 候选人姓名.docx</code> 或 <code>Sunrise CV - 岗位 - 姓名.docx</code>），系统会自动提取文件名中的企业、岗位与人名注入大模型上下文，提取准确率高达 100%；</li>
                <li>系统呈现 <code>3/10</code> 队列进度条并发解析。解析完成后，可在弹窗中逐个卡片横向预览、现场人工校验；</li>
                <li>核对无误后，点击底部 <strong>一键全部存入人才库</strong>，秒级完成批量入库建档。</li>
              </ol>
            </li>
            <li><strong>方式二：手动录入与招聘订单智能联动</strong>
              <ol style={{ margin: '6px 0 6px 20px' }}>
                <li>点击顶部 <strong>录入候选人</strong>（或点击右下角蓝色“＋”浮钮），右侧滑出全景抽屉并自动处于编辑状态；</li>
                <li>在输入“意向企业”或“应聘岗位”时，系统会自动下拉联想当前「招聘订单库」中处于「进行中」和「急聘」的开放需求，一键点选即可自动对齐客户与岗位规范命名，防止错填；</li>
                <li>录入基础资料后点击保存即可。抽屉顶部亦内置了 AI 提取小组件，可随时在抽屉内二次解析覆盖。</li>
              </ol>
            </li>
            <li><strong>方式三：外部自动化通道（Telegram 机器人与 Google 表格同步）</strong>
              <ul>
                <li><strong>Telegram 机器人外出录入 (n8n & Bot)</strong>：顾问在外出面试或通勤途中，只需在 Telegram 业务群或私信向机器人发送候选人名片文本或简历文件，后台工作流自动解析并录入系统，回办公室刷新即可直接跟进；</li>
                <li><strong>Google Sheets 实时双向同步</strong>：团队习惯在外部 Google 表格收集登记的信息，经后台 Webhook 自动映射为 12 列同步入库；当顾问在系统内将候选人推进至“正式入职”时，状态自动反写回 Google 表格。</li>
              </ul>
            </li>
          </ul>

          <h4>六、批量操作：浮动胶囊一键指派企业</h4>
          <ol style={{ margin: '8px 0 16px 20px' }}>
            <li>在列表左侧勾选一位或多位候选人（支持跨行点选，或表头全选）；</li>
            <li>页面底部自动平滑浮起一枚<strong>毛玻璃悬浮操作胶囊</strong>，实时显示已选中人数；</li>
            <li>点击 <strong>批量设置意向企业</strong>，在弹出面板中直接输入新企业名，或直接点击系统列出的已有企业快速胶囊标签；</li>
            <li>点击确认后，所选人员的意向企业将被批量更新，并自动通过 <code>SystemLogger</code> 记录审计日志，杜绝错漏。</li>
          </ol>

          <h4>七、WhatsApp 免存通讯录即时沟通</h4>
          <p>
            列表与抽屉中的电话号码旁均配备绿色 WhatsApp 官方图标。点击图标系统会自动调用底层规范化算法，无论候选人留的是本地格式（如 <code>011...</code>）还是带国际区号格式（如 <code>+6011...</code>），均能自动清洗并直接在浏览器或桌面端唤醒与该候选人的即时对话通道，<strong>完全无需在手机逐个保存联系人</strong>。
          </p>

          <h4>八、360° 候选人全景档案抽屉 (CandidateDrawer)</h4>
          <p>
            点击任意行即可滑出全景抽屉，无需跳页即可在一个视窗内处理全部业务，分为四大标签页：
          </p>
          <ul>
            <li>
              <strong>1. 档案与履历 (Profile)</strong>：
              <ul>
                <li><strong>抽屉内置 AI Auto-Fill</strong>：抽屉顶部提供折叠式 AI 提取框，支持随时上传新简历刷新覆盖当前字段；</li>
                <li><strong>个人核心画像</strong>：姓名、手机/WhatsApp、身份证/IC 号、年龄、毕业院校、专业、现居地点、国籍、种族、性别、婚姻状况、到岗时间 (Availability) 与语言技能（胶囊标签显示）；</li>
                <li><strong>应聘意向与归属</strong>：目标企业、应聘岗位、部门、期望薪资、上份薪资、经办顾问 (PIC Name) 及当前阶段；</li>
                <li><strong>面试考核排期</strong>：当阶段推进至面试时，自动唤起面试排期卡片，包含面试时间、到场状态（已到场/未到/改期）、面试地点，并配备 <strong>「📅 同步至 Google 日历」</strong> 按钮，一键在 Google Calendar 创建防漏面事件；</li>
                <li><strong>Sunrise 猎头标准工作履历</strong>：每段经历卡片化呈现任职公司、岗位、薪资、在职时间与职责。独家配备醒目的<strong>琥珀色「离职原因 (Reason for Leaving)」徽章</strong>，便于推介前辅导与背调。</li>
              </ul>
            </li>
            <li>
              <strong>2. 面评与资料 (Dossier)</strong>：
              <ul>
                <li><strong>深度面评笔记 (Deep Remarks)</strong>：结构化沉淀顾问电话初筛评价、性格特质、薪酬底线及多轮面试官深入反馈；</li>
                <li><strong>简历原件附件库 (Resumes Vault)</strong>：支持上传并永久归档候选人原始 Word/PDF 简历附件与作品集，支持带进度条上传、查看上传人与时间、在线预览、原件下载与删除。</li>
              </ul>
            </li>
            <li>
              <strong>3. 流转时间线 (Timeline)</strong>：
              <ul>
                <li>按时间顺序记录候选人在系统内的完整生命周期变迁；</li>
                <li>包含：何时录入、谁在何时将其流转至何阶段、何时被淘汰（附带淘汰细分原因与操作备注）、何时被重新激活唤醒。</li>
              </ul>
            </li>
            <li>
              <strong>4. 跟进提醒 (Reminders)</strong>：
              <ul>
                <li><strong>设定跟进日程</strong>：选择跟进日期与时刻，录入提醒内容（如“<em>10月12日 14:00 回访二面意向</em>”）；</li>
                <li><strong>同步 Google 日历</strong>：支持保存时一键在顾问 Google 日历中创建日历待办；</li>
                <li><strong>WhatsApp 机器人到期自动推送</strong>：后台毫秒级调度扫描，到期后自动通过系统 WhatsApp 机器人向该任务经办顾问的个人 WhatsApp 发送点对点提醒，并将该任务标记为已触发。</li>
              </ul>
            </li>
          </ul>

          <h4>九、淘汰归档与一键唤醒激活机制</h4>
          <ul>
            <li><strong>规范化淘汰 (Drop)</strong>：在抽屉中点击「标记淘汰/放弃」，系统强制要求从规范化字典中选择原因（薪资不符、已接其他Offer、无意向、背景不符、面试未到等）并填写淘汰说明。完成后候选人打上红色淘汰标签，自动从「招聘看板」隐去并沉淀入「储备人才库」。</li>
            <li><strong>一键唤醒激活 (Reactivate)</strong>：在抽屉顶部或「储备人才库」中点击「一键激活」，候选人立刻满血复活，重新投送回活跃流程对应阶段，变废为宝。</li>
          </ul>

          <h4>十、删除操作与数据安全边界</h4>
          <p>
            列表行级右侧与抽屉右上角均提供红色垃圾桶「删除」按钮。执行删除时系统会弹出二次确认模态框，删除后操作人、时间与候选人姓名将永久记入系统审计日志（<code>SystemLogger.audit</code>）。
            <strong>业务操作建议</strong>：对于仅仅是暂时没有合适岗位的候选人，<strong>强烈建议使用“标记淘汰”而非“删除”</strong>，以便沉淀为企业长线人才资产随时激活。
          </p>

          <h4>十一、多租户权限与 HQ 合作人单向穿透只读保护</h4>
          <p>
            总部管理员在顶栏切换透视合作团队的数据时，候选人管理页面会自动激活<strong>金色单向只读防护</strong>：
          </p>
          <ul>
            <li>顶部出现金色「<i className="ph-bold ph-lock-key"></i> <strong>单向只读 · 合作人数据</strong>」徽章；</li>
            <li>系统物理隐藏「录入候选人」、「AI 导入简历」、「批量设置企业」以及所有「删除」按钮；</li>
            <li>详情抽屉禁止编辑、拖拽或淘汰，彻底保障合作方商业机密与数据安全。</li>
          </ul>

          <h4>十二、猎头顾问一日标准实战工作流</h4>
          <ol style={{ margin: '8px 0 16px 20px' }}>
            <li><strong>晨会盘点</strong>：打开候选人管理，筛选“未指定企业”，统一使用批量操作胶囊指派今日目标客户；</li>
            <li><strong>极速建档</strong>：将收到的简历批量拖入「AI 智能简历导入」，快速核对并一键批量入库；</li>
            <li><strong>触达沟通</strong>：点击号码旁的 WhatsApp 图标发起即时沟通，在抽屉的「面评与资料」中记录期望薪资与核心优势；</li>
            <li><strong>推进考核</strong>：电话合格的候选人在抽屉中排定面试时间并一键同步 Google 日历；</li>
            <li><strong>日终归档与设闹钟</strong>：未确定的人在抽屉设置明日「跟进提醒」；明确不合适的候选人严谨标记「淘汰原因」并归档。</li>
          </ol>

          <h4>十三、常见问题与解答 (FAQ)</h4>
          <div className="faq-item">
            <h5>Q1: 为什么列表里能看到的候选人，在「招聘看板」上找不到？</h5>
            <p>A: 两种情况：一是该候选人已被“淘汰/放弃”，淘汰人员会自动从看板活跃泳道隐去，沉淀在储备人才库；二是当前登录的是普通顾问 (Recruiter) 账号，系统仅展示分配给您自己的候选人，避免撞单。</p>
          </div>
          <div className="faq-item">
            <h5>Q2: “未指定企业”或“未指定岗位”需要处理吗？</h5>
            <p>A: 强烈建议处理。通过企业筛选器的「⚠️ 未指定企业」可一键筛出这类候选人，通过批量操作指派给对应客户订单，后续的交付统计与 AI 智能人岗推荐才会准确生效。</p>
          </div>
          <div className="faq-item">
            <h5>Q3: AI 简历批量导入识别个别信息有误怎么修正？</h5>
            <p>A: 在导入弹窗的预览卡片里可直接修改后再点击保存；如果已经建档，直接在候选人详情抽屉的「档案与履历」中点击修改并保存即可。</p>
          </div>
          <div className="faq-item">
            <h5>Q4: 怎样快速找回并重新推进以前淘汰过的候选人？</h5>
            <p>A: 在阶段筛选下拉框选择「已淘汰」，在列表中搜索其姓名或技能，点击打开抽屉，在顶部横幅点击「一键激活流转」即可将其重新召回活跃流程。</p>
          </div>
          <div className="faq-item">
            <h5>Q5: 页面顶部的“录入候选人”和批量操作按钮不见了？</h5>
            <p>A: 请查看顶栏是否显示金色“单向只读·合作人数据”。如果是，说明当前正在查看关联合作团队的数据；在顶栏团队切换器切回“公司本部”即可恢复全部操作权限。</p>
          </div>
          <div className="faq-item">
            <h5>Q6: 右下角蓝色的圆形“＋”按钮是做什么的？</h5>
            <p>A: 这是系统的全局快捷建档浮钮 (Global FAB)。无论页面滚动到哪个位置，点击它均能立即展开档案抽屉新建候选人，免去频繁滚动回页面顶部的操作。</p>
          </div>
        </div>
      )
    },
    {
      id: 'pipeline',
      title: '4. 招聘看板使用实战教程 (Pipeline Kanban)',
      badge: '流程推进',
      icon: 'ph-kanban',
      tag: '核心',
      summary: '按招聘阶段排列的敏捷泳道看板。支持卡片拖拽流转、横向平移滑屏、360°抽屉联动与审计日志。',
      content: (
        <div className="doc-section-body">
          <div className="doc-callout doc-callout-info">
            <strong><i className="ph-bold ph-target"></i> 适用对象：</strong>
            <span>招聘顾问、团队主管、公司负责人</span>
          </div>

          <h4>一、招聘看板是做什么的</h4>
          <p>
            招聘看板把候选人按招聘阶段排成一列列“泳道”，每个候选人是一张卡片。打开页面，你可以一眼看到：
          </p>
          <ul>
            <li><strong>谁在哪个阶段</strong>：清晰掌握全员与个人负责的候选人分布；</li>
            <li><strong>每个阶段堆积了多少人</strong>：快速洞察转化漏斗与卡点；</li>
            <li><strong>哪些候选人刚录入、哪些已搁置多天</strong>：及时响应高意向人才，防止线索沉睡。</li>
          </ul>
          <p>推进候选人时，直接把卡片拖到下一个阶段即可，系统会自动记录时间和操作日志。</p>

          <h4>二、界面认识与布局</h4>
          <ul>
            <li><strong>进入方式</strong>：左侧菜单点击 <strong>招聘看板</strong>（浏览器地址为 <code>/pipeline</code>）。</li>
            <li><strong>页面三大区域</strong>：
              <ol style={{ margin: '6px 0 6px 20px' }}>
                <li><strong>左侧主导航</strong>：工作台概览、招聘订单、AI 职位生成、候选人管理、储备人才库、招聘看板、面试日程、团队与权限等。</li>
                <li><strong>顶部栏</strong>：页面标题“招聘看板”和说明，右侧提供语言切换（中/EN）、深浅主题切换、通知铃铛及团队切换器。</li>
                <li><strong>看板主体</strong>：从左到右依次排列的五个泳道。右下角配备蓝色圆形“＋”按钮（<strong>全局快速录入新候选人浮钮</strong>，点击可秒级建档）。</li>
              </ol>
            </li>
          </ul>

          <h4>三、五个核心泳道的含义</h4>
          <div className="doc-pipeline-steps">
            <span className="step-badge" style={{ borderLeft: '3px solid #6366f1' }}>1. 简历筛选 (Screening) · 靛蓝</span>
            <span className="step-arrow">➔</span>
            <span className="step-badge" style={{ borderLeft: '3px solid #3b82f6' }}>2. 初筛电话 (Phone) · 蓝色</span>
            <span className="step-arrow">➔</span>
            <span className="step-badge" style={{ borderLeft: '3px solid #f59e0b' }}>3. 面试考核 (Interview) · 橙色</span>
            <span className="step-arrow">➔</span>
            <span className="step-badge" style={{ borderLeft: '3px solid #8b5cf6' }}>4. Offer 发放 (Offer) · 紫色</span>
            <span className="step-arrow">➔</span>
            <span className="step-badge" style={{ borderLeft: '3px solid #10b981' }}>5. 正式入职 (Onboarding) · 绿色</span>
          </div>
          <ul>
            <li><strong>泳道阶段含义</strong>：
              <ul>
                <li><strong>简历筛选</strong>：新进入流程、等待初筛简历的候选人；</li>
                <li><strong>初筛电话</strong>：已通过简历，待顾问电话沟通基本意向；</li>
                <li><strong>面试考核</strong>：已进入正式面试考核环节（一面/技术面/终面排期）；</li>
                <li><strong>Offer 发放</strong>：面试通过，已发出或准备发出 Offer；</li>
                <li><strong>正式入职</strong>：候选人已确认到岗入职，交付闭环。</li>
              </ul>
            </li>
            <li><strong>阶段人数徽章</strong>：每个泳道标题右侧的圆形数字，即代表该阶段当前堆积的候选人数量。</li>
            <li><strong>淘汰/放弃分流</strong>：被标记为“淘汰/放弃”的候选人<strong>不会在看板上占位</strong>，系统会自动将其移入独立的「<strong>储备人才库</strong>」，保证活跃看板干净聚焦。</li>
          </ul>

          <h4>四、读懂候选人卡片</h4>
          <ul>
            <li><strong>圆形首字母头像</strong>：候选人姓名首字母（如 <code>L</code>、<code>H</code>），带淡蓝渐变背景，方便快速视觉区分。</li>
            <li><strong>姓名</strong>：加粗大字显示，清晰易读。</li>
            <li><strong>相对时间</strong>：如“刚刚”、“2小时前”、“5天前”、“8天前”，表示最近录入或更新至今的时间，用于发现被搁置的候选人（右上角显示“-”表示暂无历史时间）。</li>
            <li><strong>企业与岗位</strong>：蓝色高亮的是目标合作企业（如 PSA、Santak），后面是岗位（如 Prime Mover Driver、Lashing）；显示“未定企业”说明尚未绑定客户。</li>
            <li><strong>标签胶囊</strong>：展示工种部门（如 Warehouse）或毕业院校（如 Kolej MDIS Malaysia）。</li>
          </ul>

          <h4>五、基本操作与手感技巧</h4>
          <ol style={{ margin: '8px 0 16px 20px' }}>
            <li>
              <strong>横向浏览泳道</strong>：
              屏幕放不下五列时，<strong>无需拉底部滚动条</strong>：在泳道的<strong>空白区域按住鼠标左键左右拖动</strong>即可平滑平移整个页面。<em>（注意：在空白处按下；若在卡片上按下则会触发卡片拖拽）</em>。
            </li>
            <li>
              <strong>上下浏览一列里的卡片</strong>：
              每个泳道具备独立的纵向滚动条。在卡片很多的泳道（如“面试考核”），直接滚动鼠标滚轮即可上下流畅翻阅。
            </li>
            <li>
              <strong>拖拽卡片推进阶段</strong>：
              按住卡片左键，卡片浮起并带有立体阴影，拖至目标泳道后松开即可吸附。系统后台会自动追加 <code>stageHistory</code> 时间轴并写入审计日志（如“<em>初筛电话 → 面试考核</em>”）。若拖错直接拖回即可。
            </li>
            <li>
              <strong>单击卡片打开 360° 档案抽屉</strong>：
              单击任意卡片右侧自动滑出详情抽屉，无需跳页即可原地：
              <ul>
                <li>查看/编辑完整档案（国籍、种族、性别、到岗时间、语言、现薪与期望薪资）；</li>
                <li>查看 Sunrise 履历，琥珀色徽章高亮显示<strong>离职原因 (Reason for Leaving)</strong>；</li>
                <li>点击顶部 WhatsApp 按钮直接在网页端发起即时对话；</li>
                <li>排期面试时间与轮次（一面/技术面/终面），录入评语并同步日历；</li>
                <li>设置定时跟进回访提醒，到期顶栏与 WhatsApp 自动提醒。</li>
              </ul>
            </li>
            <li>
              <strong>淘汰或放弃候选人</strong>：
              在卡片点击打开的 360° 抽屉中，点击<strong>抽屉底部左侧红色的「标记淘汰 / 放弃」按钮</strong>，勾选细分原因，候选人将离开看板安全沉淀至「储备人才库」，未来可一键激活召回。
            </li>
          </ol>

          <h4>六、权限说明</h4>
          <ul>
            <li><strong>普通顾问 (Recruiter)</strong>：只能看到分配给自己的候选人，避免撞单与信息交叉。</li>
            <li><strong>团队主管 (Manager) 与 Owner</strong>：拥有全局视图，可纵览全团队候选人。</li>
            <li><strong>查看合作团队时</strong>：总部账号在顶栏切换到合作团队后，看板自动变为<strong>只读模式</strong>，不能拖拽或编辑，保护数据安全。</li>
          </ul>

          <h4>七、推荐的日常使用流程</h4>
          <div className="doc-callout doc-callout-tip">
            <ol style={{ margin: '4px 0 0 20px', lineHeight: '1.7' }}>
              <li><strong>早上开工</strong>：先看各泳道人数，再从左到右扫一遍，重点留意相对时间较长（如 5 天以上）的卡片。</li>
              <li><strong>处理新简历</strong>：在“简历筛选”点开卡片核对档案，合适则拖到“初筛电话”。</li>
              <li><strong>电话沟通后</strong>：WhatsApp 或电话跟进，补充到岗时间与薪资，合适则拖到“面试考核”并排期。</li>
              <li><strong>面试结束后</strong>：录入面评，通过则推进至 Offer，未通过则在抽屉底部点击淘汰。</li>
              <li><strong>Offer 与入职</strong>：发出 Offer 后拖到“Offer 发放”；确认到岗后拖到“正式入职”。</li>
              <li><strong>临走前</strong>：给尚未敲定的候选人设置跟进提醒，避免次日遗忘。</li>
            </ol>
          </div>

          <h4>八、常见问题与解答 (FAQ)</h4>
          <div className="faq-item">
            <h5>Q: 卡片拖不动怎么办？</h5>
            <p>A: 检查顶栏是否处于合作团队的“只读视图”；切回“公司本部”即可恢复编辑。</p>
          </div>
          <div className="faq-item">
            <h5>Q: 为什么我看到的候选人比同事少？</h5>
            <p>A: 普通顾问默认开启物理隔离，仅可见分配给自己的候选人，这是正常的权限设计。</p>
          </div>
          <div className="faq-item">
            <h5>Q: 面试考核里人数很多，怎么快速找人？</h5>
            <p>A: 建议前往「候选人管理」页直接使用顶部综合搜索框查找，或把已结束面试的人及时推进或淘汰。</p>
          </div>
          <div className="faq-item">
            <h5>Q: 横向拖动页面时总是拖起卡片？</h5>
            <p>A: 请把鼠标放在泳道之间或泳道内无卡片的空白区域再按下拖动。</p>
          </div>
          <div className="faq-item">
            <h5>Q: 卡片上显示“未定企业”是什么意思？</h5>
            <p>A: 说明该候选人尚未关联具体客户企业或开放岗位，可在档案抽屉中补充绑定。</p>
          </div>
          <div className="faq-item">
            <h5>Q: 想切换界面语言或深浅主题？</h5>
            <p>A: 点击顶部右侧的“中/EN”按钮切换语言，点击太阳/月亮图标切换深浅主题。</p>
          </div>
        </div>
      )
    },
    {
      id: 'talent-pool',
      title: '5. 储备人才库实战教程 (Talent Pool & Reserves)',
      badge: '资产盘活',
      icon: 'ph-archive-tray',
      tag: '核心资产',
      summary: '已淘汰/暂缓跟进候选人资产沉淀库。支持 10 项标准淘汰原因分类、多维穿透联搜、一键重新激活回流、AI 订单反向挖掘及 WhatsApp 免存直通。',
      content: (
        <div className="doc-section-body">
          <div className="doc-callout doc-callout-info">
            <strong><i className="ph-bold ph-target"></i> 适用对象：</strong>
            <span>招聘顾问、团队主管、客户经理、公司负责人</span>
          </div>

          <h4>一、储备人才库是做什么的</h4>
          <p>
            储备人才库是企业存放<strong>已淘汰、暂缓跟进候选人</strong>的专属人才资产池。在日常招聘交付中，许多候选人被淘汰并非个人能力不足，往往是因为<strong>时机不合</strong>：期望薪资略高于当前客户预算、客户刚好招满关闭编制、或对方先行接受了别家 Offer。
          </p>
          <p>
            如果直接将这类候选人从系统删除，下次客户有新需求时就只能从零开始猎取简历。储备人才库将这些高价值人选集中沉淀保存，在有契合的新订单时支持<strong>一键重新激活</strong>，秒级回到活跃招聘流程，实现企业人才资产的长期复用与变废为宝。
          </p>

          <h4>二、界面认识与四大功能分区</h4>
          <ul>
            <li><strong>进入方式</strong>：左侧导航栏点击 <strong>储备人才库</strong>，浏览器访问地址为 <code>/talent-pool</code>。本页面设置了物理隔离规则，<strong>仅展示状态为“已淘汰 (rejected)”的候选人</strong>。</li>
            <li><strong>页面四大功能分区</strong>：
              <ol style={{ margin: '6px 0 6px 20px' }}>
                <li><strong>标题与操作区</strong>：顶部标题“储备人才库”，副标题为“已淘汰/暂缓跟进候选人沉淀与唤醒激活”；右上角配备语言切换（中/EN）、深浅色主题切换与通知铃铛；</li>
                <li><strong>搜索与精准过滤行</strong>：
                  <ul>
                    <li><strong>复合搜索框</strong>：提示为“搜索人才库(姓名、学校、淘汰原因)...”，支持全文字段模糊穿透检索；</li>
                    <li><strong>淘汰原因下拉选择器</strong>：展示为 <code>所有的淘汰原因 (总人数)</code>，按细分原因聚合人数，0 人的分类自动隐藏；</li>
                  </ul>
                </li>
                <li><strong>人才资产卡片大表</strong>：四列式结构清晰陈列全景信息，每行支持整行点击滑出 360° 档案抽屉；</li>
                <li><strong>全局快捷悬浮动作浮钮 (Global FAB)</strong>：页面右下角常驻<strong>蓝色圆形“＋”浮钮</strong>，无论列表向下滚动多远，点击均可秒级唤出全景抽屉新建候选人或快捷录入招聘订单。</li>
              </ol>
            </li>
          </ul>

          <h4>三、读懂储备人才列表</h4>
          <table className="doc-table">
            <thead>
              <tr>
                <th>列项名称</th>
                <th>展示内容与核心细节</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>人才信息</strong></td>
                <td>
                  圆形首字母头像、加粗候选人姓名、联系电话（配<strong>绿色 WhatsApp 免存直通图标</strong>）；
                  下方展示地点、学历与院校胶囊标签（如 <code>Pontian · SPM · Form 3</code>）。
                </td>
              </tr>
              <tr>
                <td><strong>曾经意向 / 岗位</strong></td>
                <td>
                  呈现候选人此前对接的目标客户企业（如 PSA、Santak、IPE 等）以及应聘岗位名称；若显示“未指定”，代表当时建档尚未关联具体招聘订单。
                </td>
              </tr>
              <tr>
                <td><strong>淘汰 / 不合适原因</strong></td>
                <td>
                  醒目的<strong>红色徽章</strong>展示 10 项标准淘汰原因之一；
                  徽章下方展示顾问当时录入的具体备注说明，鼠标悬停可查看完整内容浮窗。
                </td>
              </tr>
              <tr>
                <td><strong>更新时间</strong></td>
                <td>
                  记录该候选人归档到储备人才库的最近日期（支持格式化日期或相对时间）。
                </td>
              </tr>
              <tr>
                <td><strong>行级快捷操作</strong></td>
                <td>
                  每行右侧配备<strong>红色垃圾桶图标</strong>（物理永久删除，需二次弹窗确认并记审计日志）与<strong>右箭头图标</strong>（点击滑出 360° 档案抽屉）。
                </td>
              </tr>
            </tbody>
          </table>

          <h4>四、跨字段搜索与按淘汰原因筛选</h4>
          <ul>
            <li>
              <strong>多维模糊穿透检索</strong>：
              在搜索框中键入任意关键字，系统将并行模糊匹配以下 10+ 个核心字段：
              <ul>
                <li>候选人基础信息：姓名、电话号码、身份证/IC 号、现居地点；</li>
                <li>教育背景：毕业院校 (School)、学历层次 (Degree)；</li>
                <li>企业与业务信息：曾对接客户公司 (Company)、部门 (Department)、应聘职位 (Position)、经办顾问 (PIC)；</li>
                <li>历史记录与面评：面评笔记 (Remarks/Notes)、淘汰标准原因及淘汰补充备注 (Reject Note)。</li>
              </ul>
              <em>实战技巧：搜索客户缩写（如“PSA”）即可瞬间找出以往所有对接过该客户的历史候选人。</em>
            </li>
            <li>
              <strong>按淘汰原因动态筛选与人数统计</strong>：
              展开“所有的淘汰原因”下拉菜单，选项标题上的括号数字（如 <code>所有的淘汰原因 (15)</code>）即为<strong>当前储备库中的已归档人才总数</strong>。菜单中每个细分原因均自动实时统计匹配人数（如 <code>薪资待遇未达期望 (45)</code>），当某项原因人数为 0 时系统自动将其隐去，保持列表清爽聚焦。
            </li>
          </ul>

          <h4>五、10 大标准淘汰原因字典与人才再利用策略</h4>
          <p>
            系统在执行淘汰操作时，强制要求从 10 项标准化字典中点选对应归属并补充文字备注，严禁随手模糊填写。原因标注得越严谨规范，日后沉淀资产的筛选复用价值就越高：
          </p>
          <table className="doc-table">
            <thead>
              <tr>
                <th>分类维度</th>
                <th>标准淘汰原因</th>
                <th>猎头实战再利用与唤醒建议</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>候选人端</strong></td>
                <td><strong>已接其他Offer / 他家入职</strong></td>
                <td>⭐ 具备高求职竞争力和强市场认可度。建议在 <strong>3–6 个月后</strong>（新入职试用期转正或环境适应期）主动跟进关怀，探询新岗位适应情况或再激活。</td>
              </tr>
              <tr>
                <td><strong>候选人端</strong></td>
                <td><strong>薪资待遇未达期望</strong></td>
                <td>⭐ 极高价值专业人才！当时仅因客户预算受限，当团队接入<strong>高预算订单或急聘溢价职位</strong>时，必须优先重点挖掘定向激活。</td>
              </tr>
              <tr>
                <td><strong>候选人端</strong></td>
                <td><strong>工作地点太远 / 交通不便</strong></td>
                <td>具有稳定的就职意向，当出现<strong>就近工业区、提供员工班车接送或支持远程/混合办公</strong>的职位时，可秒级召回。</td>
              </tr>
              <tr>
                <td><strong>候选人端</strong></td>
                <td><strong>工时 / 班次无法接受</strong></td>
                <td>排斥大夜班或 12 小时两班轮转，当录入<strong>正常五天日班、朝九晚六标准工时</strong>的订单时定向推荐。</td>
              </tr>
              <tr>
                <td><strong>候选人端</strong></td>
                <td><strong>个人或家庭原因不考虑</strong></td>
                <td>突发事件导致求职暂缓（如需顾家、备考、搬家等），建议间隔 <strong>3–6 个月</strong>进行一次温情关怀回访。</td>
              </tr>
              <tr>
                <td><strong>企业端</strong></td>
                <td><strong>岗位编制已满 / 暂停招聘</strong></td>
                <td>🌟 最优质的即插即用资源！候选人完全契合岗位要求，仅因客户名额招满才被归档。<strong>同行业新客户上线类似需求时可直接优先推送！</strong></td>
              </tr>
              <tr>
                <td><strong>企业端</strong></td>
                <td><strong>技能背景 / 学历资历不符</strong></td>
                <td>当前岗位门槛不匹配，可作为技能要求不同、侧重实操或门槛更亲民的<strong>辅助梯队岗位</strong>储备人选。</td>
              </tr>
              <tr>
                <td><strong>企业端</strong></td>
                <td><strong>面试考核未通过</strong></td>
                <td>结合抽屉「面评与资料」中记载的具体未通过短板，推荐给风格互补、考核侧重不同的其他企业客户。</td>
              </tr>
              <tr>
                <td><strong>流程异常</strong></td>
                <td><strong>面试爽约 (No Show) / 失联</strong></td>
                <td>⚠️ 诚信度与配合度风控预警。日后即便再次联系，亦需严格评估其求职意愿与配合度，避免二次资源损耗。</td>
              </tr>
              <tr>
                <td><strong>其他</strong></td>
                <td><strong>其他原因 (自定义说明)</strong></td>
                <td>非通用特殊情况，必须在备注中详细写明具体因由（如“有跨国移民计划”），方便后续关键词全文联搜。</td>
              </tr>
            </tbody>
          </table>

          <h4>六、一键重新激活流转：把人才放回跑道</h4>
          <p>
            当有新订单上线或历史岗位重新扩招时，<strong>完全无需重新录入简历或建档</strong>，遵循以下流程即可一键唤醒：
          </p>
          <ol style={{ margin: '8px 0 16px 20px' }}>
            <li>在储备人才库中直接点击目标候选人所在行，右侧平滑滑出 360° 全景档案抽屉；</li>
            <li>
              抽屉顶部会自动呈现醒目的<strong>粉红色淘汰横幅</strong>，标明淘汰原因与时间：
              <div style={{ margin: '6px 0', padding: '6px 12px', background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.25)', borderRadius: '6px', fontSize: '13px', color: '#fb7185' }}>
                <i className="ph-fill ph-x-circle"></i> 当前状态：已淘汰 / 放弃 · 淘汰原因：薪资待遇未达期望 · 12 天前
              </div>
            </li>
            <li>点击横幅右侧翠绿色的「<strong><i className="ph-bold ph-arrow-counter-clockwise"></i> 重新激活流转</strong>」按钮并进行确认；</li>
            <li>
              确认后系统底层全自动完成以下状态变更：
              <ul>
                <li>候选人状态从 <code>rejected</code> 自动重置为活跃状态 <code>active</code>；</li>
                <li>业务阶段自动回归流水线起点 <code>screening</code>（简历初筛）；</li>
                <li>清空原有的淘汰原因、淘汰备注与淘汰时间；</li>
                <li>在档案流转时间线 (Timeline) 中追加一条记录：<em>“从淘汰状态重新激活”</em>；</li>
                <li>在全局审计日志 (SystemLogger) 中写入本次操作的经办人与毫秒级时间戳。</li>
              </ul>
            </li>
          </ol>
          <div className="doc-callout doc-callout-tip">
            <strong><i className="ph-bold ph-lightbulb"></i> 激活前贴心小技巧：</strong>
            <p>
              由于一键激活会自动重置原淘汰原因和备注，若当年的淘汰细节（如“当时底薪要求 6500、期望有交通补贴”）具有长期参考价值，<strong>建议在点击激活前，将关键要点先复制粘帖到抽屉「面评与资料」的私密面评 (Remarks) 中永久留存</strong>。
            </p>
          </div>

          <h4>七、用 AI 智能推荐“反向挖掘”储备库</h4>
          <p>
            系统将招聘订单管理与储备人才库底层深度打通，支持<strong>智能逆向挖掘</strong>：
          </p>
          <ol style={{ margin: '8px 0 16px 20px' }}>
            <li>进入「招聘订单」模块，打开任意订单的详情抽屉，点击右上角「<strong>AI 智能推荐</strong>」；</li>
            <li>
              在参数配置面板中，系统默认高亮勾选了 <strong>「重点挖掘储备人才库 (盘活历史资源)」</strong> 开关；
            </li>
            <li>
              开启后，AI 语义向量不仅检索活跃候选人，还会对整个储备人才库进行深度计算，并<strong>智能结合当年的淘汰原因进行可行性判定</strong>：
              <ul>
                <li><em>典型应用场景</em>：某资深工程师此前因“薪资未达期望”被淘汰（当时期望 8,000，前客户预算仅给 6,000）；现在新接订单薪酬为 8,500–10,000。AI 将给出高匹配度并在推荐理由中醒目提示：<em>“该候选人已在储备人才库，曾因薪资偏高归档，当前订单预算高度契合，建议立即激活推荐！”</em></li>
              </ul>
            </li>
            <li>顾问在推荐列表直接点击候选人姓名，原地滑出抽屉点击「重新激活流转」即可将其无缝指派给新订单。</li>
          </ol>

          <h4>八、WhatsApp 免存通讯录即时沟通与话术示范</h4>
          <p>
            点击候选人电话号码旁的<strong>绿色 WhatsApp 图标</strong>，系统内置的号码标准化算法会自动剥离连字符与空格、智能识别马来西亚或国际标准区号（自动规范为 <code>+60...</code>），直接在浏览器中拉起 WhatsApp 官方对话窗口，<strong>全程无需在手机中逐个手动添加联系人</strong>。
          </p>
          <div className="doc-callout doc-callout-info">
            <strong><i className="ph-bold ph-chat-teardrop-text"></i> 顾问实战唤醒话术模板（可按实际情况调整）：</strong>
            <p style={{ fontStyle: 'italic', margin: '6px 0' }}>
              “Hi [候选人姓名]，我是 TALENT FLOW 的招聘顾问 [你的姓名]。之前您曾了解过我们对接的 [原客户公司] 的岗位，当时因为 [名额满额/薪资偏离等客观原因] 暂时未能合作。我们近期刚拿到一家知名企业的同类急聘订单，薪酬福利与您的期望非常契合，想了解一下您目前是否在看新的职场发展机会？”
            </p>
          </div>
          <div className="doc-callout doc-callout-warning">
            <strong><i className="ph-bold ph-warning"></i> 沟通前排查贴士：</strong>
            <p>
              若候选人姓名后带有 <code>(found new job)</code> 等标注，请先仔细阅读其更新备注，了解其是否已有稳定在职工作，礼貌拿捏沟通分寸，避免无谓打扰。
            </p>
          </div>

          <h4>九、彻底删除 vs 淘汰归档（数据安全与合规边界）</h4>
          <table className="doc-table">
            <thead>
              <tr>
                <th>操作类型</th>
                <th>触发方式</th>
                <th>系统底层行为</th>
                <th>业务适用场景</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>淘汰归档 (Drop)</strong></td>
                <td>抽屉底部点击「标记淘汰/放弃」</td>
                <td>数据完整保留，状态变更为 <code>rejected</code>，自动从看板隐去并沉淀至储备人才库。</td>
                <td><strong>正常业务首选推荐</strong>。所有真实候选人即使暂时不合作，也应标记淘汰沉淀为长线资产。</td>
              </tr>
              <tr>
                <td><strong>物理删除 (Delete)</strong></td>
                <td>行级或抽屉右上角红色垃圾桶</td>
                <td>从 Firestore 数据库中永久物理抹除档案与关联附件，仅在审计日志保留操作人记录。</td>
                <td><strong>严禁随意滥用</strong>！仅用于清理内部录入的测试脏数据，或候选人依据 GDPR/PDPA 法规明确提出个人数据抹除要求时。</td>
              </tr>
            </tbody>
          </table>

          <h4>十、猎头顾问储备库日常标准使用工作流</h4>
          <div className="doc-callout doc-callout-tip">
            <ol style={{ margin: '4px 0 0 20px', lineHeight: '1.8' }}>
              <li><strong>周度例行巡检</strong>：每周一打开储备库，在淘汰原因下拉菜单选择“岗位编制已满 / 暂停招聘”和“薪资待遇未达期望”，这两类人才含金量最高、沉淀价值最大；</li>
              <li><strong>新订单上线先挖宝</strong>：新订单录入后，先跑一次「AI 智能推荐」（默认勾选挖掘储备人才库），再在储备库搜索目标企业或岗位关键词进行人工复核；</li>
              <li><strong>沟通意向后再激活</strong>：通过 WhatsApp 发起轻量试探沟通，待候选人确认看机会并有意向后，再点击「重新激活流转」，保持招聘看板首个泳道的整洁与高效；</li>
              <li><strong>日常录入规范化</strong>：淘汰任何候选人时，务必严谨选准 10 项标准原因之一，并在备注中写清关键数据（如对方要价与客户出价），为未来的复用留下宝贵上下文。</li>
            </ol>
          </div>

          <h4>十一、常见问题与解答 (FAQ)</h4>
          <div className="faq-item">
            <h5>Q1: 为什么储备库里的人在「招聘看板」上找不到？</h5>
            <p>A: 这是系统的标准隔离机制。被标记为“已淘汰”的候选人会自动从看板活跃泳道中隐去并沉淀在储备人才库中，只有点击「重新激活流转」后，才会满血回到看板的第一个泳道（简历初筛）。</p>
          </div>
          <div className="faq-item">
            <h5>Q2: 筛选框上的“所有的淘汰原因 (15)”里的 15 是什么意思？</h5>
            <p>A: 括号中的数字代表当前团队储备人才库中所有处于“已淘汰”状态的候选人总人数（包括所有细分原因）。</p>
          </div>
          <div className="faq-item">
            <h5>Q3: 为什么在储备人才库里搜不到某位候选人？</h5>
            <p>A: 请先确认该候选人是否真的被标记为了“已淘汰”；若该人还在流程中，应前往「候选人管理」或「招聘看板」查找。此外，请检查“所有的淘汰原因”下拉菜单是否误选了某个细分原因，将其切回“所有的淘汰原因”即可。</p>
          </div>
          <div className="faq-item">
            <h5>Q4: 不小心误点了“重新激活流转”该怎么办？</h5>
            <p>A: 在抽屉底部左侧重新点击「标记淘汰 / 放弃」，重新勾选原因并保存即可，候选人会重新回到储备人才库。系统的流转时间线 (Timeline) 会真实完整记录前后两次操作的时间。</p>
          </div>
          <div className="faq-item">
            <h5>Q5: 一键激活后，之前的历史面评和附件会丢失吗？</h5>
            <p>A: 绝对不会！一键激活仅重置流程阶段和淘汰标记，候选人的所有历史工作履历、面试评价笔记以及上传的 Word/PDF 简历附件均百分之百完整保留。</p>
          </div>
          <div className="faq-item">
            <h5>Q6: 右下角常驻的蓝色“＋”按钮是做什么的？</h5>
            <p>A: 这是系统的全局快捷建档浮钮 (Global FAB)。无论页面滚动到哪个位置，点击它均能立即展开档案抽屉新建录入候选人或快速录入招聘订单，免去频繁滚动回页面顶部的操作。</p>
          </div>
        </div>
      )
    },
    {
      id: 'ai-parser',
      title: '6. AI 职位生成实战教程 (AI Parser & JD Generator)',
      badge: '大模型赋能',
      icon: 'ph-magic-wand',
      tag: '核心效率',
      summary: '一键将零散招工需求或文档转化为 4 大标准商用版本。支持订单关联、PDF/Excel 上传、商业防跑单脱敏、全球反歧视过滤与多版本沉淀。',
      content: (
        <div className="doc-section-body">
          <div className="doc-callout doc-callout-info">
            <strong><i className="ph-bold ph-target"></i> 适用对象：</strong>
            <span>招聘顾问、客户经理、团队主管、公司负责人</span>
          </div>

          <h4>一、AI 职位生成是做什么的</h4>
          <p>
            在猎头与劳务招聘实务中，客户的招工需求往往非常零碎：微信或 WhatsApp 上的几句闲聊碎语、一张手机拍摄的要求便签、或一份排版混乱陈旧的 PDF / Excel。如果顾问直接复制原文转发出去：
          </p>
          <ul>
            <li><strong>形象不专业</strong>：格式散乱、关键信息缺漏，求职者阅读体验差；</li>
            <li><strong>商业机密泄露与“跑单”风险</strong>：原文直接包含客户真实厂名或精准地址，求职者极易绕过中介猎头直接自行上门应聘（造成行业俗称的“跑单”）；</li>
            <li><strong>跨语言制作费时费力</strong>：手动翻译英文或马来文耗时极长，且往往因为图省事而大幅缩写，导致薪酬福利待遇吸引力严重受损。</li>
          </ul>
          <p>
            「AI 职位生成」模块专为解决上述痛点而打造。只需将零散资料输入，系统将<strong>单次并行产出 4 份标准商用版本</strong>（内部沟通版、对外中文版、对外英文版、对外马来文版），自动执行企业名称脱敏与反歧视合规过滤，并支持多版本沉淀复用。
          </p>

          <h4>二、界面认识与三大功能分区</h4>
          <ul>
            <li><strong>进入方式</strong>：左侧主导航点击 <strong>AI 职位生成</strong>，浏览器访问地址为 <code>/ai-parser</code>。</li>
            <li><strong>三大功能分区</strong>：
              <ol style={{ margin: '6px 0 6px 20px' }}>
                <li><strong>左侧边栏（历史版本池）</strong>：呈现按时间倒序排列的所有历史生成草稿卡片；左上方配备「<strong>＋</strong>」按钮（提示为“新建空白草稿”），点击可秒级清空右侧界面重置任务；</li>
                <li><strong>右侧上半部（第一步：录入原始需求）</strong>：需求输入中枢，支持关联系统订单、上传职位文档或直接粘贴纯文本；</li>
                <li><strong>右侧下半部（第二步：查看并微调生成结果）</strong>：生成结果展示区，提供 4 个多语言版本标签页、在线富文本编辑框、一键复制按钮与版本保存操作。</li>
              </ol>
            </li>
          </ul>

          <h4>三、第一步：灵活录入需求 (支持自由叠加)</h4>
          <p>
            第一步区域提供了三种互补的输入模式，顾问可根据手头收到的材料灵活选用，更支持<strong>跨模式自由叠加</strong>：
          </p>
          <table className="doc-table">
            <thead>
              <tr>
                <th>输入方式</th>
                <th>操作指引与系统行为</th>
                <th>推荐适用业务场景</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>方式 1：一键关联招聘订单</strong></td>
                <td>下拉框自动列出库中处于「进行中 (open)」或「急聘 (urgent)」的有效订单，点选后系统自动提取公司代号、岗位、薪资、地点、工时、资格要求与福利等结构化字段。</td>
                <td>该职位已在系统「招聘订单」中建档，需要快速生成对外宣发的各语言招工简章。</td>
              </tr>
              <tr>
                <td><strong>方式 2：上传职位文件</strong></td>
                <td>点击「选择文件」，支持上传 <code>.pdf</code> 或 <code>.xlsx</code> 格式的原始职位说明书 (JD) 或客户需求表格。</td>
                <td>客户企业直接发来了现成的 PDF 岗位 JD 或 Excel 招聘需求明细清单。</td>
              </tr>
              <tr>
                <td><strong>方式 3：直接粘贴描述文本</strong></td>
                <td>在多行文本框中，直接粘贴客户发来的零散文字、口头备忘录或岗位要求草案。</td>
                <td>顾问通过微信或 WhatsApp 临时收到的非结构化碎片需求。</td>
              </tr>
            </tbody>
          </table>
          <div className="doc-callout doc-callout-tip">
            <strong><i className="ph-bold ph-lightbulb"></i> 独家实战技巧 —— 叠加融合输入：</strong>
            <p>
              在下拉框选中已有订单或上传了 PDF 之后，你仍可在下方的文本框中<strong>追加手动补充说明</strong>（例如在文本框输入：“<em>本次急招 10 人，必须持有合法叉车驾照，厂区提供清真餐厅与晚班津贴每天 RM15</em>”）。AI 会将订单/文件内容与你的文本补充进行深度语义融合，生成要素完备的崭新简章。
            </p>
          </div>

          <h4>四、第二步：4 大标准商用版本深度解析</h4>
          <p>
            点击第一步右下角的「<strong><i className="ph-fill ph-magic-wand"></i> 开始智能生成</strong>」按钮（处理时间通常约为 8–15 秒），系统将并行输出以下 4 份各有分工的标准定稿：
          </p>
          <ol style={{ margin: '8px 0 16px 20px' }}>
            <li>
              <strong>🏢 【内部审批 / 沟通版】（全英文输出 · Internal Approval）</strong>：
              <ul>
                <li><strong>适用受众</strong>：招聘团队主管、客户经理 (AM/BD)、公司管理层及客户 HRBP 内部流转；</li>
                <li><strong>核心内容</strong>：采用专业简练的商业管理英语，深度提炼岗位背后的业务驱动力 (Business Drivers)、与部门 OKR 目标的对齐关系、用工预算与 Headcount 编制测算，完整保留真实的薪资底线；</li>
                <li><strong>严正提示</strong>：<span style={{ color: 'var(--accent-rose)' }}>此版本包含真实底薪与商业测算，仅供团队内部决策与汇报使用，严禁向求职者或外部渠道发布！</span></li>
              </ul>
            </li>
            <li>
              <strong>📢 【对外发布版 - 中文】（Public Release - Chinese）</strong>：
              <ul>
                <li><strong>适用受众</strong>：求职者群体、社交媒体（微信社群、朋友圈、小红书、Facebook 招聘群、线下海报）；</li>
                <li><strong>结构严整</strong>：具有极强的人才吸引力与清晰度，100% 完整包含标准 <strong>7 大核心模块</strong>：
                  <ol style={{ margin: '4px 0 6px 18px' }}>
                    <li><strong>岗位名称与核心标签</strong>（如：<code>质检技术员 - 20名 | 柔佛士乃 | 欧美外企 | 立即上岗</code>）；</li>
                    <li><strong>关于企业</strong>（自动改写为 <code>[XX 跨国制造企业]</code> 或 <code>[行业领军大厂]</code> 等代称，隐去真实厂名）；</li>
                    <li><strong>工作细节</strong>（具体工作地、班次工时、轮班津贴、休息时间、是否有空调车间）；</li>
                    <li><strong>主要工作职责</strong>（条理清晰地列出 SOP 执行、物料质检、机械操作等具体任务）；</li>
                    <li><strong>任职资格要求</strong>（学历要求、健康体检、加班配合度、相关经验与必要技能）；</li>
                    <li><strong>薪酬与福利待遇</strong>（基本底薪、加班倍数、全勤奖、综合预估月薪、免费宿舍、免费厂车、医药保险、法定年假与病假）；</li>
                    <li><strong>应聘与投递方式</strong>（明确的联系电话、WhatsApp 免存直通通道与面试形式）。</li>
                  </ol>
                </li>
              </ul>
            </li>
            <li>
              <strong>🌐 【对外发布版 - 英文】（Public Release - English）</strong>：
              <ul>
                <li><strong>适用受众</strong>：外资企业客户管理层、外籍或高阶英语求职者、LinkedIn 等专业职场网络平台；</li>
                <li><strong>1:1 严格镜像</strong>：纯正跨国企业 JD 范式，地道职场用词；<strong>与中文版 7 大核心模块严格 1:1 镜像对称</strong>，绝不偷工减料或概括省略任何福利条款。</li>
              </ul>
            </li>
            <li>
              <strong>🌏 【对外发布版 - 马来文】（Public Release - Bahasa Melayu）</strong>：
              <ul>
                <li><strong>适用受众</strong>：马来西亚本地求职者群体、本地社群及专场线下招聘会；</li>
                <li><strong>本土化规范</strong>：采用标准正规的 Bahasa Melayu 职场表达，严格遵循马来西亚本土劳工市场用语习惯与《1955年雇佣法令》(Employment Act 1955) 合规要求，同样与中文版 7 大核心模块保持 1:1 镜像对齐。</li>
              </ul>
            </li>
          </ol>

          <h4>五、生成后必须检查的 4 大审查防线</h4>
          <p>
            系统内置了高强度的合规与脱敏算法，但在正式将简章外发至公众平台前，顾问仍需养成复核以下 4 大防线的专业习惯：
          </p>
          <table className="doc-table">
            <thead>
              <tr>
                <th>审查防线</th>
                <th>核心检查要点与实战避坑技巧</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>防线 1：商业脱敏与防跑单</strong></td>
                <td>
                  检查正文是否已彻底隐去客户的真实公司全称；<br/>
                  <em>⚠️ 重点防坑</em>：特别留意<strong>厂区具体门牌号、工业区具体路名或内部楼栋</strong>（如“优美城工业区第8路2号”）。AI 会隐去公司名，但若原始文字残留精准地址，候选人可能通过地图直接找到原厂。发布前请手动将精准门牌泛化为区域名（如“柔佛古来优美城工业区”）。
                </td>
              </tr>
              <tr>
                <td><strong>防线 2：全球反歧视法律合规</strong></td>
                <td>
                  系统会自动剔除涉及种族、宗教、性别偏好、年龄、婚育情况（如“限未婚”、“不可怀孕”）、身高体重外貌及籍贯地域等条款。外发前快速通读任职资格部分，确保符合马来西亚劳工法令。
                </td>
              </tr>
              <tr>
                <td><strong>防线 3：核心数字与联系方式准确性</strong></td>
                <td>
                  仔细核对底薪金额、加班费计算倍数、综合预估收入区间、急招人数、轮班工时安排，以及文末留下的顾问联系电话与 WhatsApp 咨询方式。
                </td>
              </tr>
              <tr>
                <td><strong>防线 4：多语言福利术语对齐</strong></td>
                <td>
                  若顾问对英文或马来文不够熟悉，可重点核对关键福利与薪酬专有名词（如 Basic Salary, OT Allowance, Hostel, Asrama, Pengangkutan 厂车），确保与中文版表达完全吻合。
                </td>
              </tr>
            </tbody>
          </table>

          <h4>六、在线编辑、版本保存与一键复制</h4>
          <ul>
            <li><strong>就地直接编辑</strong>：在右侧点击任意版本标签（内部版、中文、英文、马来文），即可在下方文本框中直接修改任何文字，所见即所得；</li>
            <li><strong>保存当前版本</strong>：仅在查看左侧已有历史草稿时出现，点击「<strong><i className="ph-light ph-floppy-disk"></i> 保存当前版本</strong>」可原地覆盖更新此版本；</li>
            <li><strong>另存为新版本</strong>：点击「<strong><i className="ph-light ph-copy"></i> 另存为新版本</strong>」，系统会弹窗提示输入新版本名称，在保留原版本的同时派生一个新变体（例如：<em>版本A突出高底薪，版本B重点突出空调环境与免费厂车</em>）；</li>
            <li><strong>一键复制当前版本文本</strong>：点击第二步右上角的「<strong><i className="ph-light ph-copy"></i> 复制当前版本文本</strong>」按钮，系统自动将<strong>当前所选语言</strong>的全部排版文字写入剪贴板，可直接粘贴至社交群或招聘网。<br/><em>注意：该按钮复制的是当前正处于激活状态的那个语言 Tab；如需发布中英马三种语言，请切换对应 Tab 后分别复制。切勿误选内部审批版进行复制外发！</em></li>
          </ul>

          <h4>七、历史版本管理与沉淀（左侧版本池）</h4>
          <p>
            每次点击“开始智能生成”，系统全自动在云端 Firestore 创建一条版本记录（如 <code>AI草稿 11:22:15</code>），若关联了订单会自动打上 <code>关联订单</code> 徽章：
          </p>
          <ul>
            <li><strong>秒级切换预览</strong>：左侧列表按时间倒序排列，点击任意历史卡片即可在右侧秒级唤回该版本的 4 份文案；</li>
            <li><strong>版本重命名</strong>：点击卡片右上角的铅笔图标，可为版本自定义有辨识度的名字。<em>推荐命名规范：<code>客户代号 - 岗位 - 突出卖点 - 日期</code>（例如：<code>PSA - 货运司机 - 重点突出加班费 - 1008</code>）</em>；</li>
            <li><strong>安全删除</strong>：点击卡片上的红色垃圾桶图标，在弹窗确认后可清理过期的测试草稿；</li>
            <li><strong>新建空白草稿</strong>：点击左上角「<strong>＋</strong>」按钮，可清空右侧编辑区，随时开启全新的招工简章生成任务。</li>
          </ul>

          <h4>八、猎头顾问双场景标准实操工作流</h4>
          <div className="doc-callout doc-callout-tip">
            <h5 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--text-primary)' }}>场景 A：职位已在系统「招聘订单」中建档</h5>
            <ol style={{ margin: '0 0 12px 18px', lineHeight: '1.75' }}>
              <li>进入 AI 职位生成页；</li>
              <li>在「一键从招聘订单导入」下拉菜单中点选目标订单；</li>
              <li>在下方文本框中追加本次特需的补充说明（如急招人数或特殊加分项）；</li>
              <li>点击「开始智能生成」；</li>
              <li>重点审查对外发布的三个版本，确认真实厂名已脱敏且无具体门牌地址；</li>
              <li>确认无误后点击「保存当前版本」，切换各语言 Tab 分别点击「复制当前版本文本」完成全网宣发。</li>
            </ol>
            <h5 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--text-primary)' }}>场景 B：客户微信临时发来一段需求或一份 PDF</h5>
            <ol style={{ margin: '0 0 0 18px', lineHeight: '1.75' }}>
              <li>直接将聊天文字粘贴入文本框，或点击上传 PDF/Excel 文件；</li>
              <li>点击「开始智能生成」；</li>
              <li>先通读英文「内部审批版」，核验 AI 是否准确理解了客户的用人成本与岗位定位；</li>
              <li>再检查对外发布的三大版本，微调后点击「另存为新版本」；</li>
              <li>前往「招聘订单」页面点击「发布职位」，将该需求正式建档为系统活跃订单，形成交付闭环。</li>
            </ol>
          </div>

          <h4>九、常见问题与解答 (FAQ)</h4>
          <div className="faq-item">
            <h5>Q1: 生成大约需要多久？为什么有时需要稍等片刻？</h5>
            <p>A: AI 引擎在底层需要一次性生成并严格校验 4 份长篇多语言文本（通常耗时约 8–15 秒）。全部 4 个版本会在请求完成后同时呈现给您。若偶发提示失败，通常是网络连接偶发抖动或输入文档极长触发了超时，直接再次点击「开始智能生成」即可重试。</p>
          </div>
          <div className="faq-item">
            <h5>Q2: 对外发布的版本里还是包含了客户真实厂名或精准地址怎么办？</h5>
            <p>A: 检查是否是在文本框手动补充输入时写了客户全名或门牌。直接在右侧编辑框中手动将其修改为“某知名企业”或宽泛工业区名，然后点击「保存当前版本」即可永久更新。</p>
          </div>
          <div className="faq-item">
            <h5>Q3: 为什么在下拉框中找不到我想要的某个招聘订单？</h5>
            <p>A: 下拉框只展示当前团队处于「进行中 (open)」或「急聘 (urgent)」状态的开放订单。若目标订单此前被标记为了暂缓、满额或关闭状态，请先前往「招聘订单」模块将其状态更新为进行中，刷新本页即可选取。</p>
          </div>
          <div className="faq-item">
            <h5>Q4: 可以把内部版直接发给客户 HR 或候选人吗？</h5>
            <p>A: 绝对不行！内部审批版包含商业动机、管理层汇报逻辑和真实底薪测算，仅供团队内部沟通。对外发布请务必使用中文版、英文版或马来文版。</p>
          </div>
          <div className="faq-item">
            <h5>Q5: 「另存为新版本」和「保存当前版本」有什么区别？</h5>
            <p>A: 「保存当前版本」会直接覆盖当前正在查看的历史卡片；而「另存为新版本」会保留当前卡片不动，并另外派生出一张全新的历史卡片，方便您针对不同发布渠道制作多个侧重点不同的文案版本。</p>
          </div>
        </div>
      )
    },
    {
      id: 'cv-autofill',
      title: '7. CV 简历解析实战教程 (CV Builder / Autofill)',
      badge: '简历中台',
      icon: 'ph-file-text',
      tag: '核心效率',
      summary: '100% 对齐 Sunrise 猎头标准模版。多格式简历秒级结构化提取、防幻觉未注明黄标、HR 英文追问助手、官方 Word (.docx) 导出与一键存库。',
      content: (
        <div className="doc-section-body">
          <div className="doc-callout doc-callout-info">
            <strong><i className="ph-bold ph-target"></i> 适用对象：</strong>
            <span>招聘顾问、团队主管、交付顾问、公司负责人</span>
          </div>

          <h4>一、CV 简历解析是做什么的</h4>
          <p>
            在日常猎头交付中，候选人发来的简历格式五花八门：PDF 排版混乱、Word 表格错位、手机拍摄反光，甚至是几条零散的微信文字。而且候选人常常漏写期望薪资、现居地点、到岗时间以及雇主极其在意的<strong>离职原因 (Reason for Leaving)</strong>。
          </p>
          <p>
            以往顾问必须手动把零碎信息逐项复制粘贴进公司的官方推荐模板（Sunrise CV 模板），手工排版一份耗时 20–30 分钟，效率低下且容易出错漏字。
          </p>
          <p>
            「CV 简历解析」模块将该流程全自动化：
          </p>
          <ul>
            <li><strong>秒级结构化提取</strong>：AI 自动从杂乱简历中抓取 20+ 项画像字段，100% 对齐 Sunrise 猎头标准推介模板；</li>
            <li><strong>防幻觉未注明标记</strong>：没写的信息绝不胡编乱造，统一标成 <code>[Not Specified]</code> 并以醒目琥珀黄框高亮提醒；</li>
            <li><strong>智能追问小助手</strong>：自动检测缺失信息，并生成 3–5 句专业地道的英文追问话术，电话或 WhatsApp 沟通时可直接照着问；</li>
            <li><strong>双向高价值交付</strong>：既能「一键导出标准 Sunrise Word 推荐报告 (.docx)」直接发给客户，也能「一键录入人才档案库」进入招聘管道。</li>
          </ul>

          <h4>二、页面布局与双栏视窗</h4>
          <ul>
            <li><strong>进入方式</strong>：左侧主导航点击 <strong>CV 简历解析</strong>，浏览器访问地址为 <code>/cv-autofill</code>。</li>
            <li><strong>左右双栏高效视窗</strong>：
              <ol style={{ margin: '6px 0 6px 20px' }}>
                <li><strong>左侧（约 38% 宽度）· 简历内容提供区</strong>：包含「文件解析」与「文本解析」标签页、虚线拖拽上传框、智能解析按钮；解析后下方自动展开黄色「诊断与追问建议卡片」；</li>
                <li><strong>右侧（约 62% 宽度）· Sunrise CV 全景核对区</strong>：展开 5 大核心信息模块，底部提供「导出 Sunrise CV (.docx)」与「确认信息并录入档案库」两大按钮。</li>
              </ol>
            </li>
          </ul>

          <h4>三、第一步：解析简历 (左侧输入通道)</h4>
          <p>
            系统提供两种输入方式，顾问可根据获取到的材料自由选择：
          </p>
          <ul>
            <li>
              <strong>方式 1：文件解析 (多格式支持)</strong>：
              <ol style={{ margin: '4px 0 6px 18px' }}>
                <li>切换至「文件解析」标签；</li>
                <li>将简历拖入虚线框，或点击上传。支持 <code>.pdf</code>、<code>.docx</code>、<code>.doc</code>、<code>.txt</code>、<code>.xlsx</code> 以及手机拍摄的清晰简历照片；</li>
                <li>点击「开始智能解析」。</li>
              </ol>
              <em>提示：手机拍摄简历时若反光或手指遮挡，可能影响识别精度，建议优先让候选人提供电子文档。</em>
            </li>
            <li>
              <strong>方式 2：文本解析 (直接粘贴)</strong>：
              <ol style={{ margin: '4px 0 6px 18px' }}>
                <li>切换至「文本解析」标签；</li>
                <li>将候选人在微信、WhatsApp 或求职微聊中发送的纯文字履历直接粘贴进去；</li>
                <li>点击「开始智能解析」。</li>
              </ol>
            </li>
          </ul>

          <div className="doc-callout doc-callout-tip">
            <strong><i className="ph-bold ph-lightbulb"></i> 黄色诊断卡片：你的初筛电话清单</strong>
            <p>
              解析完成后，左侧下方会自动弹出黄色卡片：
            </p>
            <ul style={{ margin: '4px 0 0 16px' }}>
              <li><strong>关键信息缺失检测</strong>：明确列出简历未注明的敏感字段（如期望薪资、到岗时间、离职原因）；</li>
              <li><strong>建议追问的英文话术</strong>：例如 <em>“Could you please share your expected monthly salary?”</em>、<em>“What was your primary reason for leaving your last role?”</em>。顾问在电话初筛或 WhatsApp 沟通时可直接复制提问。</li>
            </ul>
          </div>

          <h4>四、第二步：核对与补充 (右侧 5 大模块)</h4>
          <p>
            右侧表单与官方 Sunrise 推荐模板 1:1 严格对齐，支持所见即所得的直接修改：
          </p>
          <ol style={{ margin: '8px 0 16px 20px' }}>
            <li>
              <strong>个人基本信息 (Personal Information)</strong>：
              <ul>
                <li>姓名*、电话*、邮箱、居住地址、申请职位、到岗时间、年龄、性别、国籍、种族、婚姻状况、上份薪水 (Last Drawn)、期望薪资 (Expected)；</li>
                <li>凡显示 <code>[Not Specified]</code> 的输入框均带有<strong>琥珀黄色边框与“⚠️ 未注明”角标</strong>；点击黄框会自动全选占位符，输入真实信息即可一秒覆盖。</li>
              </ul>
            </li>
            <li>
              <strong>工作经历 (Professional History)</strong>：
              <ul>
                <li>强制倒序排列（最近一份工作在最上方）；</li>
                <li>每段卡片包含任职公司、职位、在职时间、薪酬、离职原因、职责描述；</li>
                <li>支持点击「＋ 添加工作经历」补录，或点击垃圾桶删除单段经历；</li>
                <li>系统内置职责严格隔离算法，绝不把前公司的职责错配给后公司。离职原因为客户必审项，空缺的务必电话向候选人补齐。</li>
              </ul>
            </li>
            <li>
              <strong>教育背景 (Education)</strong>：
              <ul>
                <li>院校名称、学历层次、所学专业、毕业年份，支持增删多段；</li>
                <li>系统会自动将“Bachelor of Science in IT”拆解为 学位 (Bachelor) 与 专业 (IT)。</li>
              </ul>
            </li>
            <li>
              <strong>技能与语言 (Skills & Languages)</strong>：
              <ul>
                <li>逗号分隔填写，存库时系统自动清洗为标准标签胶囊 (Tags)，方便日后在人才库精准联搜。</li>
              </ul>
            </li>
            <li>
              <strong>ATS 归档配置 (ATS Settings)</strong>：
              <ul>
                <li>累计工作年限、当前流程阶段（默认“简历筛选”）、经办顾问 (PIC)。经办顾问默认自动读取当前登录账号，保证绩效归属清晰。</li>
              </ul>
            </li>
          </ol>

          <h4>五、第三步：两大交付动作</h4>
          <table className="doc-table">
            <thead>
              <tr>
                <th>交付动作</th>
                <th>核心表现与系统底层行为</th>
                <th>业务实战价值</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>📥 动作 1：导出 Sunrise CV (.docx)</strong></td>
                <td>
                  严格依据右侧最新核对的数据生成排版精致的外企级 Word 文档；自动剔除所有“未注明”标记与多余空表格；<br/>
                  文件名自动规范为 <code>Sunrise CV - [申请职位] - [候选人姓名].docx</code>。
                </td>
                <td>
                  <strong>客户推荐交付神器</strong>。排版极度工整，顾问无需手工调字体格式即可直接通过微信或邮件发给客户企业 HR。
                </td>
              </tr>
              <tr>
                <td><strong>💾 动作 2：确认信息并录入档案库</strong></td>
                <td>
                  将基础资料、工作履历、教育经历及完整 Sunrise CV 数据一次性存入系统；<br/>
                  来源标记为“AI 简历解析独立录入”，自动进入「候选人管理」总库及「招聘看板」第一泳道（简历筛选）。
                </td>
                <td>
                  <strong>系统建档流转</strong>。入库成功后表单自动复位清空，方便顾问立刻拖入下一份简历连续建档。
                </td>
              </tr>
            </tbody>
          </table>

          <h4>六、与「候选人管理」中 AI 导入的业务选型对比</h4>
          <table className="doc-table">
            <thead>
              <tr>
                <th>业务场景</th>
                <th>优先使用哪个入口？</th>
                <th>核心差异与原因</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>批量收取大量简历入库</strong></td>
                <td>「候选人管理」顶部的 <strong>AI 智能简历导入</strong> (<code>CvImportModal</code>)</td>
                <td>支持一次性拖入 10~50 份文件，依靠文件名逆向推断与并发队列批量极速建档；仅做轻量快速入库，不生成 Word 推荐报告。</td>
              </tr>
              <tr>
                <td><strong>重点职位单人精修与外发</strong></td>
                <td>一级菜单的 <strong>CV 简历解析</strong> (<code>/cv-autofill</code>)</td>
                <td>单人精细化作业台。支持文本直接粘贴、自动诊断缺失并生成英文追问话术、深度核对 5 大模块、支持「一键导出 Sunrise 猎头标准 Word 报告 (.docx)」向客户正式推介。</td>
              </tr>
            </tbody>
          </table>

          <h4>七、顾问标准实战作业流</h4>
          <div className="doc-callout doc-callout-tip">
            <ol style={{ margin: '4px 0 0 20px', lineHeight: '1.8' }}>
              <li><strong>录入简历</strong>：收到候选人简历后，打开「CV 简历解析」；</li>
              <li><strong>智能提取</strong>：拖入文件或粘贴文字，点击「开始智能解析」；</li>
              <li><strong>查漏诊断</strong>：先扫一眼左侧黄色诊断卡片，明确缺失信息（如期望薪水、离职原因）；</li>
              <li><strong>追问补齐</strong>：点击 WhatsApp 或拨打电话，借助追问话术向候选人确认期望薪资、到岗时间与离职原因，补入右侧黄框；</li>
              <li><strong>核对归属</strong>：核对工作经历与教育背景，确认经办顾问与阶段；</li>
              <li><strong>系统建档</strong>：点击「确认信息并录入档案库」完成系统建档；</li>
              <li><strong>客户推介</strong>：点击「导出 Sunrise CV」，将生成的精致 Word 文件推荐给雇主客户。</li>
            </ol>
          </div>

          <h4>八、常见问题与解答 (FAQ)</h4>
          <div className="faq-item">
            <h5>Q1: 为什么右侧很多输入框是黄色且写着 [Not Specified]？</h5>
            <p>A: 说明原始简历里未提及该信息。系统坚守防幻觉原则绝不胡乱捏造，请利用左侧生成的追问话术向候选人补问后填入。</p>
          </div>
          <div className="faq-item">
            <h5>Q2: 导出的 Word 文件里为什么没有某些未填写的栏目？</h5>
            <p>A: 系统采用了智能无冗余渲染，会自动隐藏未填写的空块，确保交付给客户的 Word 文档排版干净整洁。</p>
          </div>
          <div className="faq-item">
            <h5>Q3: 录入成功后为什么右侧表单被自动清空了？</h5>
            <p>A: 这是专为连续建档设计的高效复位机制。该候选人已安全存入「候选人管理」库中，可前往随时查看。</p>
          </div>
          <div className="faq-item">
            <h5>Q4: 导出 Word 文档会自动存入系统数据库吗？</h5>
            <p>A: 不会。导出 Word 与录入数据库是两个独立动作，推荐顾问在核对无误后两个按钮都点击一次（既存库留存资产，又下载 Word 发客户）。</p>
          </div>
          <div className="faq-item">
            <h5>Q5: 解析结果有个别字段识别不准确怎么办？</h5>
            <p>A: 直接在右侧对应输入框中手动修改即可。无论是存入数据库还是导出 Word，系统均 100% 以右侧最新人工修改的数据为准。</p>
          </div>
        </div>
      )
    },
    {
      id: 'calendar',
      title: '8. 面试日程与排期 (Calendar)',
      badge: '时间管理',
      icon: 'ph-calendar-blank',
      tag: '协同',
      summary: '月历网格直观排期、全局与个人双重视角、状态色彩分类、智能防空窗与 Google 日历无缝同步。',
      content: (
        <div className="doc-section-body">
          <h4>一、 模块定位与四大生态联动</h4>
          <p>
            「<strong>面试日程</strong>」板块将全团队及个人经办的所有候选人面试集中呈现在月历视图中。顾问与主管可以直观掌握某天的面试密度、候选人到场履约情况，并一键调取候选人档案录入面试评价。
          </p>
          <ul>
            <li><strong>候选人档案抽屉</strong>：在候选人卡片中设定面试日期与时间，日程网格<strong>实时秒级同步</strong>。</li>
            <li><strong>工作台概览 (Overview)</strong>：首页右上角「即将进行的面试」卡片，优先展示临期面试。</li>
            <li><strong>全局通知中心</strong>：系统对<strong>今日</strong>与<strong>明日</strong>的面试自动推送红/黄色倒计时提醒。</li>
            <li><strong>Google 日历生态</strong>：一键生成标准 Google 日历日程，方便外部邀约与手机端闹钟提醒。</li>
          </ul>

          <h4>二、 页面整体布局</h4>
          <p>
            页面采用<strong>“左历右单、双向联动”</strong>的宽屏响应式布局：
          </p>
          <ul>
            <li><strong>左侧：月历网格</strong> —— 一个月的面试排期全貌，展示日期、密度与出席状态色块。</li>
            <li><strong>右侧：待办日程清单</strong> —— 面试的详细信息卡片，包含企业、岗位、地点、顾问与快捷操作。</li>
            <li><strong>顶部控制栏</strong>：年月前后切换、回到今天、全局/个人模式切换及专属顾问下拉筛选框。</li>
          </ul>

          <h4>三、 看懂月历网格与出席状态</h4>
          <p>
            月历采用国际标准的 <strong>周一至周日</strong> 排列，固定 6 行（共 42 格），会自动补全上月末尾天数与下月起始天数：
          </p>
          <ul>
            <li><strong>今日高亮</strong>：带有蓝色光晕的实心圆圈。</li>
            <li><strong>选定日期</strong>：选中的日期呈现蓝色高亮边框与微蓝底色。</li>
            <li><strong>场次徽标</strong>：日期右上角显示的数字，代表当天已排期的<strong>面试总场次</strong>。</li>
            <li><strong>微型事件标签</strong>：每个格子里直观展示前 3 场面试，格式为 <code>[时间] [候选人姓名]</code>；超过 3 场自动折叠显示 <code>+N 更多</code>。</li>
          </ul>

          <table className="doc-table">
            <thead>
              <tr>
                <th style={{ width: '15%' }}>视觉标识</th>
                <th style={{ width: '25%' }}>出席状态</th>
                <th>业务语义与顾问操作建议</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ textAlign: 'center' }}>🟢</td>
                <td><strong>已到场 (Attended)</strong></td>
                <td>候选人已按时到场，可继续推进面试并录入面评。</td>
              </tr>
              <tr>
                <td style={{ textAlign: 'center' }}>🔴</td>
                <td><strong>未到 / 爽约 (No-Show)</strong></td>
                <td>候选人无故缺席或失联，建议及时标记并做背景备注。</td>
              </tr>
              <tr>
                <td style={{ textAlign: 'center' }}>🟡</td>
                <td><strong>改期 / 请假 (Rescheduled)</strong></td>
                <td>候选人已提前说明原因，需重新协商并更新排期时间。</td>
              </tr>
              <tr>
                <td style={{ textAlign: 'center' }}>🔵</td>
                <td><strong>待出席 (Pending)</strong></td>
                <td>已确认排期，正在等待面试时间到达（默认初始状态）。</td>
              </tr>
            </tbody>
          </table>

          <h4>四、 右侧日程清单 (双 Tab 体系)</h4>
          <p>
            右侧面板提供独立的双 Tab 视图，方便快速切换微观与宏观视角：
          </p>
          <ul>
            <li><strong>「选定日」Tab</strong>：展示在左侧月历中点击选中的特定日期，按时间从早到晚依次排列。</li>
            <li><strong>「全部排期」Tab</strong>：展示当前模式下所有未来与历史排期的面试总清单。</li>
          </ul>
          <p>
            每张面试卡片包含候选人姓名、出席状态、精准时间、目标企业名称、应聘岗位、面试地点及经办顾问 (PIC)。点击卡片，月历自动跳转该日期并滑出<strong>候选人档案抽屉</strong>。
          </p>

          <h4>五、 全局视角与个人视角</h4>
          <table className="doc-table">
            <thead>
              <tr>
                <th style={{ width: '25%' }}>视角模式</th>
                <th style={{ width: '30%' }}>适用对象</th>
                <th>核心价值与逻辑</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>👑 全局模式 (Global)</strong></td>
                <td>团队管理者、公司负责人</td>
                <td>展现全团队全部顾问的面试排期，用于统筹面试密度与运力把控。</td>
              </tr>
              <tr>
                <td><strong>💼 个人模式 (Personal)</strong></td>
                <td>招聘顾问个人</td>
                <td>严格过滤，仅展示经办顾问 (PIC) 是自己的候选人，聚焦个人待办。</td>
              </tr>
            </tbody>
          </table>

          <div className="doc-callout doc-callout-info">
            <strong>💡 智能顾问识别与持久化记忆</strong>
            <p>
              切换到个人模式时，系统会自动提取当前登录用户的 Google 账号显示名或邮箱前缀，秒级与经办顾问名单匹配并自动选中；也可在下拉框自由切换查看同事排期。选择偏好保存在本地浏览器中，刷新无需重新选。
            </p>
          </div>

          <h4>六、 如何安排一场面试</h4>
          <p>
            面试日程主要为汇总与呈现看板，面试数据源共有三种录入通道：
          </p>
          <ol>
            <li><strong>候选人档案抽屉录入</strong>：在档案抽屉的“面试安排”区域填写日期、时间、地点/会议号并保存。</li>
            <li><strong>表格批量导入</strong>：Google 表格或 Excel 导入时填入“面试日期”列，系统自动清洗建档。</li>
            <li><strong>AI 简历与名片解析</strong>：粘贴沟通文本或名片，AI 自动提取时间并排期。</li>
          </ol>
          <p>
            内置智能正则清洗引擎，宽容支持 <code>2026-08-18</code>、<code>18/8/2026</code>、<code>10am</code>、<code>14:30</code> 等格式，并自动剔除星期标签（如 Mon、周五）与括号。
          </p>

          <h4>七、 空月份智能导航体验</h4>
          <ul>
            <li><strong>首屏智能跳转 (Auto-Jump)</strong>：若当前月暂无任何面试，系统会自动平滑导航至最早有排期的月份，并高亮该月首场面试。</li>
            <li><strong>跨月穿透提示横幅</strong>：翻阅到空月份时，顶部自动出现蓝色提示条（如 <code>前往 2026年9月 (8) ➔</code>），点击即可一键跳转穿透。</li>
          </ul>

          <h4>八、 一键同步至 Google 日历</h4>
          <p>
            在面试卡片及抽屉中点击 <strong>「添加至 Google 日历」</strong> 按钮，浏览器将自动唤起预填完整的 Google 日历日程（含标题、时间、地点及候选人电话/邮箱/企业/岗位/面评备注全量信息）。
          </p>

          <div className="doc-callout doc-callout-warning">
            <strong>⚠️ 合规与隐私提醒</strong>
            <p>
              默认事件时长为 60 分钟，可根据实际情况微调；详细说明中包含候选人电话与薪资等敏感信息，若需公开或抄送非涉密人员，请先检查并剔除敏感字段。
            </p>
          </div>

          <h4>九、 首页工作台与系统通知联动</h4>
          <ul>
            <li><strong>工作台概览 (Overview)</strong>：首页右上角「即将进行的面试」实时拉取今天及以后的所有排期。</li>
            <li><strong>全局通知中心</strong>：今日面试触发红色高优先级紧急提醒；明日面试触发黄色预警通知。</li>
          </ul>

          <h4>十、 推荐日常工作流与排查技巧</h4>
          <ul>
            <li><strong>晨间盘点</strong>：晨会前看通知铃铛和工作台，再到日程页「选定日」锁定今日待办；</li>
            <li><strong>即时同步</strong>：约好面试顺手点「添加至 Google 日历」并通知候选人；</li>
            <li><strong>闭环复盘</strong>：面试结束后半小时内更新到场状态（已到场/爽约/改期）并录入面评；</li>
            <li><strong>周例会协同</strong>：主管每周一切换为全局模式，评估各业务线面试吞吐量。</li>
          </ul>
        </div>
      )
    },
    /*
    // 隐藏模块 (WhatsApp 触达控制台暂不展示)
    {
      id: 'whatsapp',
      title: 'WhatsApp 触达控制台 (WhatsApp Bot)',
      badge: '即时通讯',
      icon: 'ph-whatsapp-logo',
      tag: '触达',
      summary: '顾问号码绑定、到期自动跟进提醒推送、快捷会话与免官方高昂费用部署。',
      content: (
        <div className="doc-section-body">
          <h4>📱 顾问个人通知闭环</h4>
          <p>
            在个人设置中绑定接收通知的国际格式手机号。当设定的候选人面试或回访提醒到期时，系统自动发送 WhatsApp 提醒至顾问手机。
          </p>
          <h4>💬 触达控制台</h4>
          <p>
            支持将候选人按跟进状态分组，随时进行点对点触达与模板沟通。
          </p>
        </div>
      )
    },
    */
    {
      id: 'n8n',
      title: '9. n8n 自动化与生态集成 (n8n & Bots)',
      badge: '工作流引擎',
      icon: 'ph-plugs-connected',
      tag: '自动化',
      summary: 'Telegram 极速建档、Google Sheets 实时增量双向同步、单域名网关与通用文件建档接口。',
      content: (
        <div className="doc-section-body">
          <h4>一、 模块定位与核心价值</h4>
          <p>
            传统招聘建档需要顾问坐在电脑前逐个上传简历。<strong>n8n 自动化与生态集成</strong> 为系统打造了全天候外部“收件中枢”：
          </p>
          <ul>
            <li><strong>Telegram 极速建档</strong>：在手机或电脑 Telegram 群里直接发简历文件、拍照或粘贴长文本，AI 自动解析并写入系统人才库；</li>
            <li><strong>Google 表格实时同步</strong>：外部招聘渠道或协作人在表格中录入或修改候选人数据，系统后台秒级增量同步；</li>
            <li><strong>无限生态扩展通道</strong>：基于通用文件建档接口，未来可无缝打通 Gmail 简历附件、Google Drive、飞书及钉钉机器人。</li>
          </ul>
          <p>
            所有通过外部自动化录入的候选人，会自动出现在系统的 <strong>「候选人管理」</strong> 列表与 <strong>「招聘看板」</strong> 的首个泳道（简历筛选）中，且来源清晰标记为 <code>Telegram</code> 或 <code>Google Sheets Webhook</code>。
          </p>

          <h4>二、 双轨解耦架构与工作原理</h4>
          <p>
            系统采用“流程编排与算法大脑解耦”设计，各司其职：
          </p>

          <table className="doc-table">
            <thead>
              <tr>
                <th style={{ width: '25%' }}>系统分层</th>
                <th style={{ width: '15%' }}>监听端口</th>
                <th>核心职责与定位</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>n8n 可视化编排引擎</strong></td>
                <td><code>:5678</code></td>
                <td>监听外部消息与事件、前置过滤闲聊、转发请求，提供可视化执行流水与死信重试。非开发人员也可拖拽配置。</td>
              </tr>
              <tr>
                <td><strong>FastAPI AI 智能微服务</strong></td>
                <td><code>:8000</code></td>
                <td>重型算法大脑：文档解析（PDF/Word）、OCR 识别、大模型提取、电话邮箱查重、智能合流与数据库事务持久化。</td>
              </tr>
            </tbody>
          </table>

          <h4>三、 工作流 1：Telegram 极速建档</h4>
          <p><strong>🛠️ 管理员配置指南 (一次性搭建)</strong>：</p>
          <ol>
            <li>在 Telegram 中私聊官方 <code>@BotFather</code> 发送 <code>/newbot</code> 获取 Bot Token；</li>
            <li>在 <code>@BotFather</code> 执行 <code>/setprivacy -&gt; Disable</code>（关闭群隐私模式，确保机器人能接收群成员上传的文件附件）；</li>
            <li>将机器人拉入需要监听的招聘业务大群（如顾问找人群）；</li>
            <li>在 <code>ai_backend/.env</code> 配置 Token 及群组白名单；</li>
            <li>在 n8n 控制台（<code>http://localhost:5678</code>）导入 <code>n8n/talentflow_telegram_workflow.json</code> 并激活（Active）。</li>
          </ol>

          <p><strong>💼 顾问怎么用 (实操指引)</strong>：</p>
          <p>在有机器人的群或私聊中，直接发送：</p>
          <ul>
            <li>📄 <strong>转发或上传简历</strong>：支持 PDF、Word (<code>.docx</code> / <code>.doc</code>)；</li>
            <li>📸 <strong>拍照发图</strong>：拍摄纸质简历、展会名片或面试登记表照片；</li>
            <li>📝 <strong>长文本</strong>：粘贴 80 字以上的文字简历（太短会被当成闲聊过滤）。</li>
          </ul>

          <div className="doc-callout doc-callout-info">
            <strong>💡 规范文件命名，识别精准度加倍</strong>
            <p>
              若简历文件名为“企业名 - 岗位 - 姓名.docx”（例如 <code>Greif SG - Stacker - Mohd Izzat.docx</code>），系统会自动逆向提取三元组线索辅助 AI，大幅消除误差。
            </p>
          </div>

          <h4>四、 工作流 2：Google 表格实时增量同步</h4>
          <p>
            由于免费版 ngrok 仅有 1 个静态公网域名（分配给 n8n <code>:5678</code>），系统通过 <strong>n8n Webhook 中继转发</strong> 实现共用：
          </p>
          <ol>
            <li>在 n8n 中导入并激活 <code>n8n/talentflow_sheets_sync_workflow.json</code>；</li>
            <li>在 Google 表格 Apps Script 的 <code>onEdit</code> 触发器中，将 <code>backendUrl</code> 指向 n8n Webhook：<code>https://你的ngrok域名/webhook/sheets-sync</code>；</li>
            <li>表格编辑后，n8n 立即响应 HTTP 200 防卡顿，并透明转发到宿主机 <code>http://host.docker.internal:8000/api/sheets/webhook</code>。</li>
          </ol>

          <div className="doc-callout doc-callout-tip">
            <strong>🛡️ 绝对安全合并原则 (merge=True)</strong>
            <p>
              在表格里修改薪资或手机号，系统秒级更新对应字段；<strong>绝不会覆盖冲掉</strong> 顾问在网页端录入的面评、跟进提醒，也不会重置已流转的看板泳道阶段。
            </p>
          </div>

          <h4>五、 通用文件接入接口 (扩展新渠道)</h4>
          <p>
            系统开放了标准化通用文件建档接口：<code>POST http://host.docker.internal:8000/api/candidates/ingest-file</code> (Content-Type: <code>multipart/form-data</code>)：
          </p>

          <table className="doc-table">
            <thead>
              <tr>
                <th style={{ width: '20%' }}>参数名</th>
                <th style={{ width: '15%' }}>类型</th>
                <th style={{ width: '15%' }}>必填</th>
                <th>说明与示例</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>file</code></td>
                <td>Binary</td>
                <td>是</td>
                <td>Word / PDF / 图片文件二进制数据流。</td>
              </tr>
              <tr>
                <td><code>teamId</code></td>
                <td>String</td>
                <td>否</td>
                <td>归属团队 ID，默认 <code>default_team</code>。</td>
              </tr>
              <tr>
                <td><code>senderName</code></td>
                <td>String</td>
                <td>否</td>
                <td>渠道来源标识，例如 <code>n8n_gmail_pipeline</code>。</td>
              </tr>
            </tbody>
          </table>

          <h4>六、 核心环境变量配置表</h4>
          <table className="doc-table">
            <thead>
              <tr>
                <th style={{ width: '30%' }}>配置项</th>
                <th style={{ width: '20%' }}>推荐值</th>
                <th>作用说明</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>TELEGRAM_BOT_TOKEN</code></td>
                <td>填写实际 Token</td>
                <td>Telegram 机器人密钥（由 <code>@BotFather</code> 生成，严禁外泄）。</td>
              </tr>
              <tr>
                <td><code>TELEGRAM_ENABLE_POLLING</code></td>
                <td><code>false</code></td>
                <td>设为 false（使用 n8n 托管 Webhook，避免与长轮询竞争冲突）。</td>
              </tr>
              <tr>
                <td><code>TELEGRAM_SILENT_MODE</code></td>
                <td><code>true</code></td>
                <td>静默监听模式。进群安静嗅探入库，绝不发确认消息打扰群聊。</td>
              </tr>
              <tr>
                <td><code>TELEGRAM_ALLOWED_CHATS</code></td>
                <td>群组 ID 列表</td>
                <td>授权监听的群聊 ID。留空代表对所有群生效；生产建议限制群组。</td>
              </tr>
            </tbody>
          </table>

          <h4>七、 上线验证与生产安全建议</h4>
          <ul>
            <li><strong>验证清单</strong>：确认 n8n (5678) 与后端 (8000) 存活 ➔ 激活两套工作流 ➔ 在群里发 PDF 测试 ➔ 检查看板是否新增 Telegram 候选人 ➔ 在表格改薪资检查是否无损更新。</li>
            <li><strong>公网隧道依赖</strong>：本地 ngrok 若重启导致免费域名变化，需同步更新 Google 表格中的 Webhook URL；生产环境建议部署至独立公网云服务器。</li>
            <li><strong>群权限收敛与隐私保护</strong>：务必配置群组白名单，且监听群仅对公司内部招聘顾问开放，严密保护候选人隐私。</li>
          </ul>

          <div className="doc-callout doc-callout-warning">
            <strong>⚠️ 常见排查速查</strong>
            <p>
              若发简历未建档：检查文字是否少于 80 字（会被当成闲聊过滤）➔ 检查 Bot 是否关闭了群隐私模式 ➔ 检查 n8n 的 Executions 运行日志是否有报错 ➔ 检查后端 8000 端口是否在线。
            </p>
          </div>
        </div>
      )
    },
    /*
    // 隐藏模块 (数据洞察看板暂不展示)
    {
      id: 'analytics',
      title: '数据洞察与效能大屏 (Analytics)',
      badge: '数据驱动',
      icon: 'ph-chart-pie-slice',
      tag: '报表',
      summary: '全流程转化漏斗分析、渠道来源分布、团队全景 vs 个人专属视图切换。',
      content: (
        <div className="doc-section-body">
          <h4>📉 全流程招聘转化漏斗</h4>
          <p>
            基于 Chart.js 动态绘制各流转阶段转化率，精准诊断初筛流失率与面试通过率。
          </p>
          <h4>🎯 渠道效能评估</h4>
          <p>
            展示内推、猎聘、Boss、官网及 Google 表格导入等各渠道的交付成效，为招聘预算投放提供决策依据。
          </p>
        </div>
      )
    },
    */
    {
      id: 'team',
      title: '10. 团队协作与合作人穿透 (Team & RBAC)',
      badge: '权限架构',
      icon: 'ph-users-three',
      tag: '治理',
      summary: '三级角色权限矩阵、新用户入队审批分流、成员跨团队调配以及 HQ 合作人单向穿透只读透视。',
      content: (
        <div className="doc-section-body">
          <div className="doc-callout doc-callout-info">
            <strong><i className="ph-bold ph-target"></i> 适用对象：</strong>
            <span>公司负责人 (Owner)、团队主管 (Manager)、一线招聘顾问 (Recruiter)</span>
          </div>

          <h4>一、模块定位与核心价值</h4>
          <p>
            在招聘与猎头服务体系中，客户资源、候选人画像、跟进记录与薪酬数据属于至关重要的核心商业资产。系统通过严密的多租户隔离与角色访问控制（RBAC），解决三大协作痛点：
          </p>
          <ul>
            <li><strong>严格准入屏障</strong>：新账号注册后默认处于待审核状态，必须由主管核实身份并指定归属团队后方可放行；</li>
            <li><strong>精准权责边界</strong>：顾问专注自身跟进交付，主管统筹全队进展与审批，负责人掌控全局架构与合作人网络；</li>
            <li><strong>加盟分部单向穿透</strong>：总部享有对合作人团队业务的实时只读穿透监察权，合作人之间互不可见，且绝对无法访问总部机密。</li>
          </ul>

          <h4>二、三级角色权限矩阵</h4>
          <p>系统在数据库引擎底层（Firebase Security Rules）部署了物理安全规则，各角色权限严格界定如下：</p>
          <table className="doc-table">
            <thead>
              <tr>
                <th style={{ width: '28%' }}>功能与操作权限</th>
                <th style={{ width: '24%' }}>团队所有者 (Owner)</th>
                <th style={{ width: '24%' }}>团队主管 (Manager)</th>
                <th style={{ width: '24%' }}>招聘专员 (Recruiter)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>审核批准新成员入队</strong></td>
                <td><span className="badge" style={{ color: 'var(--accent-teal)', background: 'rgba(20, 184, 166, 0.1)' }}>允许</span></td>
                <td><span className="badge" style={{ color: 'var(--accent-teal)', background: 'rgba(20, 184, 166, 0.1)' }}>允许</span></td>
                <td><span className="badge" style={{ color: 'var(--text-muted)', background: 'var(--input-bg)' }}>禁止</span></td>
              </tr>
              <tr>
                <td><strong>调整成员角色与归属团队</strong></td>
                <td><span className="badge" style={{ color: 'var(--accent-teal)', background: 'rgba(20, 184, 166, 0.1)' }}>允许 (专属编辑框)</span></td>
                <td><span className="badge" style={{ color: 'var(--text-muted)', background: 'var(--input-bg)' }}>禁止</span></td>
                <td><span className="badge" style={{ color: 'var(--text-muted)', background: 'var(--input-bg)' }}>禁止</span></td>
              </tr>
              <tr>
                <td><strong>移出 / 移除在册成员</strong></td>
                <td><span className="badge" style={{ color: 'var(--accent-teal)', background: 'rgba(20, 184, 166, 0.1)' }}>允许</span></td>
                <td><span className="badge" style={{ color: 'var(--text-muted)', background: 'var(--input-bg)' }}>禁止</span></td>
                <td><span className="badge" style={{ color: 'var(--text-muted)', background: 'var(--input-bg)' }}>禁止</span></td>
              </tr>
              <tr>
                <td><strong>创建与解绑合作人团队</strong></td>
                <td><span className="badge" style={{ color: 'var(--accent-teal)', background: 'rgba(20, 184, 166, 0.1)' }}>允许</span></td>
                <td><span className="badge" style={{ color: 'var(--text-muted)', background: 'var(--input-bg)' }}>禁止</span></td>
                <td><span className="badge" style={{ color: 'var(--text-muted)', background: 'var(--input-bg)' }}>禁止</span></td>
              </tr>
              <tr>
                <td><strong>查看本团队全量数据</strong></td>
                <td><span className="badge" style={{ color: 'var(--accent-teal)', background: 'rgba(20, 184, 166, 0.1)' }}>允许</span></td>
                <td><span className="badge" style={{ color: 'var(--accent-teal)', background: 'rgba(20, 184, 166, 0.1)' }}>允许</span></td>
                <td><span className="badge" style={{ color: 'var(--accent-blue)', background: 'rgba(59, 130, 246, 0.1)' }}>协同跟进查看</span></td>
              </tr>
              <tr>
                <td><strong>单向穿透查看合作人子团队</strong></td>
                <td><span className="badge" style={{ color: 'var(--accent-amber)', background: 'rgba(245, 158, 11, 0.1)' }}>单向只读穿透</span></td>
                <td><span className="badge" style={{ color: 'var(--accent-amber)', background: 'rgba(245, 158, 11, 0.1)' }}>单向只读穿透</span></td>
                <td><span className="badge" style={{ color: 'var(--text-muted)', background: 'var(--input-bg)' }}>禁止</span></td>
              </tr>
              <tr>
                <td><strong>候选人日常建档、流转与面评</strong></td>
                <td><span className="badge" style={{ color: 'var(--accent-teal)', background: 'rgba(20, 184, 166, 0.1)' }}>允许</span></td>
                <td><span className="badge" style={{ color: 'var(--accent-teal)', background: 'rgba(20, 184, 166, 0.1)' }}>允许</span></td>
                <td><span className="badge" style={{ color: 'var(--accent-teal)', background: 'rgba(20, 184, 166, 0.1)' }}>允许 (核心业务)</span></td>
              </tr>
              <tr>
                <td><strong>审计日志查看与软删除标记</strong></td>
                <td><span className="badge" style={{ color: 'var(--accent-teal)', background: 'rgba(20, 184, 166, 0.1)' }}>允许 (严禁物理硬删)</span></td>
                <td><span className="badge" style={{ color: 'var(--text-muted)', background: 'var(--input-bg)' }}>禁止</span></td>
                <td><span className="badge" style={{ color: 'var(--text-muted)', background: 'var(--input-bg)' }}>禁止</span></td>
              </tr>
            </tbody>
          </table>

          <h4>三、新成员入队审批操作指引</h4>
          <p>
            为防止非授权账号窥探商业信息，所有新用户（通过 Google 账号或邮箱）首次登录后，账号默认处于 <code>待审核 (pending)</code> 拦截状态。
          </p>
          <ol style={{ margin: '8px 0 16px 20px', lineHeight: '1.8' }}>
            <li>
              <strong>识别待审核申请</strong>：
              主管或负责人登录后进入 <code>/team</code> 页面，若有新成员注册，顶部会自动呼出醒目的琥珀色「<strong>待审核申请</strong>」提示区，展示申请人的头像、姓名与注册邮箱。
            </li>
            <li>
              <strong>分流指定归属团队</strong>：
              若系统已配置合作人分支团队，操作栏中会提供目标团队下拉框。审批人可直接指定该新员工是归入「公司本部 (默认)」还是指派至特定「合作人团队」（如 <code>Sunrise Johor</code>）。
            </li>
            <li>
              <strong>执行批准或拒绝</strong>：
              <ul style={{ margin: '4px 0 6px 18px' }}>
                <li>点击「<strong>批准</strong>」：二次弹窗确认后，系统立即将该账号角色提升为 <code>Recruiter</code> 并激活指定团队，新成员刷新即可开始作业；</li>
                <li>点击「<strong>拒绝</strong>」：危险二次确认后，系统永久删除该申请账号记录。</li>
              </ul>
            </li>
          </ol>

          <h4>四、现有成员信息与权限管理 (仅 Owner 可用)</h4>
          <p>
            团队负责人 (Owner) 可随时在「团队成员」列表中对现有成员进行信息维护与权限调整：
          </p>
          <ol style={{ margin: '8px 0 16px 20px', lineHeight: '1.8' }}>
            <li>在成员卡片右侧点击「<strong>编辑</strong>」按钮（铅笔图标），呼出管理模态框；</li>
            <li>
              <strong>核心维护项目</strong>：
              <ul style={{ margin: '4px 0 6px 18px' }}>
                <li><strong>显示姓名</strong>：自由修改顾问在系统内的对外展示姓名或团队花名；</li>
                <li><strong>归属团队</strong>：可在公司本部与各个合作人子团队之间随时转移调配。调配保存后安全隔离规则立即生效，该成员下一次请求将仅能访问新团队的数据；</li>
                <li><strong>角色权限</strong>：在 Owner、Manager、Recruiter 之间平滑调整等级。</li>
              </ul>
            </li>
            <li>点击「<strong>保存更改</strong>」确认，修改即刻写入云端。</li>
          </ol>

          <h4>五、HQ 合作人单向穿透透视机制</h4>
          <p>
            针对多门店、分公司或外部加盟顾问协作场景，TALENT FLOW 提供了极具安全保障的单向穿透架构：
          </p>
          <div className="doc-callout doc-callout-warning">
            <strong><i className="ph-bold ph-shield-check"></i> 单向安全原则：</strong>
            <p>
              总公司（HQ）拥有单向只读视察权；合作人之间绝对不可互通；合作人绝对无法读取总公司的任何私密数据。
            </p>
          </div>
          <ol style={{ margin: '8px 0 16px 20px', lineHeight: '1.8' }}>
            <li>
              <strong>创建合作人团队 (仅 Owner)</strong>：
              点击右上角「<strong>创建并关联合作人团队</strong>」，输入团队名称（如 <code>Sunrise Partner (KL)</code>）与唯一标识 (Slug)。系统将在数据库自动创建团队并生成一条单向关联凭据。
            </li>
            <li>
              <strong>顶栏一键切换与穿透视察</strong>：
              本部人员在系统任何页面，均可点击顶栏右侧的团队切换器，在下拉列表中快速切换至任一合作人团队。切换后，候选人列表与订单库将秒级呈现该合作人的全部业务数据。
            </li>
            <li>
              <strong>单向只读防呆熔断体系</strong>：
              穿透模式下，顶栏亮起金色 <code>[单向只读]</code> 徽标，同时全系统写操作自动熔断：
              <ul style={{ margin: '4px 0 6px 18px' }}>
                <li>候选人管理列表中的「录入候选人」与「AI 导入简历」按钮自动隐藏，替换为带锁提示；</li>
                <li>招聘订单列表中的「发布职位」按钮自动隐藏；</li>
                <li>全局右下角悬浮快捷操作球自动隐藏；</li>
                <li>数据库底层 Security Rules 彻底拒绝来自总部的写请求，确保绝无误改误删风险；</li>
                <li>随时点击顶栏的「退出透视 (返回本部)」按钮，即可一键切回自有数据。</li>
              </ul>
            </li>
            <li>
              <strong>解除合作人关联</strong>：
              在「关联合作人团队」面板中点击垃圾桶图标确认解除。解除后仅切断总部单向透视通道，合作人团队自身的原始数据资产完全完好保留。
            </li>
          </ol>

          <h4>六、常见问题排错指南 (FAQ)</h4>
          <ul style={{ margin: '8px 0 16px 20px', lineHeight: '1.8' }}>
            <li>
              <strong>Q1: 新同事注册后提示“正在等待团队管理员审批”，无法开展业务？</strong><br />
              答：这是系统的防泄密安全机制。请由主管或负责人登录，进入 <code>/team</code> 页面顶部的「待审核申请」点击「批准」即可秒级解锁。
            </li>
            <li>
              <strong>Q2: 切换到合作人团队后，为什么看不到“录入候选人”和“发布职位”按钮？</strong><br />
              答：穿透视察处于“单向只读”受控状态。总部仅拥有业务监督与核验权，不能直接在合作人库中写入数据。如需录入自有业务，请在顶栏切回“公司本部”。
            </li>
            <li>
              <strong>Q3: 可以将已经加入总部的顾问平移到合作人分公司吗？</strong><br />
              答：可以。拥有 Owner 权限的负责人在成员卡片中点击「编辑」，在“归属团队”下拉菜单中选择目标合作人团队并保存，隔离规则立即生效。
            </li>
            <li>
              <strong>Q4: 解除合作人关联会丢失数据吗？</strong><br />
              答：不会。解除关联仅销毁了跨团队单向查看关联文档，合作人团队账号及其名下的候选人、订单库毫发无损。
            </li>
          </ul>
        </div>
      )
    },
    {
      id: 'settings',
      title: '11. 系统设置与数据安全 (Settings)',
      badge: '配置安全',
      icon: 'ph-gear',
      tag: '安全',
      summary: '历史离线 JSON 备份上云、Google 表格 14/15 列映射与 AI 清洗、E2EE 零知识保险库及 WhatsApp 通知绑定。',
      content: (
        <div className="doc-section-body">
          <div className="doc-callout doc-callout-info">
            <strong><i className="ph-bold ph-target"></i> 适用对象：</strong>
            <span>公司负责人 (Owner)、团队主管 (Manager)、一线招聘顾问 (Recruiter)</span>
          </div>

          <h4>一、系统设置是做什么的</h4>
          <p>
            系统设置模块（路由 <code>/settings</code>）是 TALENT FLOW 的全局数据接入与安全管控中台，主要提供四大核心能力：
          </p>
          <ul>
            <li><strong>历史数据上云迁移</strong>：将桌面单机版或离线归档备份一键平滑搬迁至云端；</li>
            <li><strong>Google 表格导入与 AI 清洗</strong>：支持公开与私有表格、列自动匹配推断、AI 查重过滤与智能清洗入库；</li>
            <li><strong>私密保险库 (端到端 E2EE 加密)</strong>：采用客户端原生 Web Crypto 高强度加密，保护客户谈判底价与佣金点数等商业机密；</li>
            <li><strong>WhatsApp 个人通知中枢绑定</strong>：绑定顾问个人手机号，个性化定制跟进提醒与面试回传推送模板。</li>
          </ul>

          <h4>二、离线 JSON 备份一键上云</h4>
          <p>适用于此前使用过 Electron 桌面单机版，或需要恢复离线归档全量数据的团队。</p>
          <ol style={{ margin: '8px 0 16px 20px', lineHeight: '1.8' }}>
            <li>
              <strong>权限限定</strong>：<strong>仅限团队所有者 (Owner) 可操作</strong>，其他角色界面自动置灰禁用；
            </li>
            <li>
              <strong>准备备份文件</strong>：准备好标准 <code>.json</code> 格式备份文件（如 <code>candidate_data.json</code>），内部包含候选人 (<code>candidates</code>) 与需求订单 (<code>jobOrders</code>)；
            </li>
            <li>
              <strong>选择并上传</strong>：点击「选择 JSON 文件」，系统校验数据合法性并自动通过白名单防御原型链污染；
            </li>
            <li>
              <strong>自动批次写入</strong>：平滑写入云端 Firestore 并自动绑定到当前团队，界面实时呈现带载进度条（如 <code>进度: 45/120</code> ➔ <code>迁移完成！成功: 118, 失败: 2</code>）。
            </li>
          </ol>
          <div className="doc-callout doc-callout-warning">
            <strong><i className="ph-bold ph-warning-circle"></i> 关键防重复提醒：</strong>
            <p>
              底层为每次导入的候选人分配全新的系统 UUID，<strong>重复导入同一份备份文件会产生重复数据</strong>！请仅在系统初始化或灾难恢复时执行一次，切勿反复上传。
            </p>
          </div>

          <h4>三、Google 表格导入与 AI 智能清洗</h4>
          <p>
            这是团队最常用的外部数据收拢工具，支持将多源 Google 表格批量导入系统人才库或需求库。<strong>团队全员 (Owner / Manager / Recruiter) 均可使用</strong>。
          </p>

          <ol style={{ margin: '8px 0 16px 20px', lineHeight: '1.8' }}>
            <li>
              <strong>选择导入目标与行数范围</strong>：
              顶部单选框选择导入为「候选人」还是「招聘需求订单」；可勾选「指定行数范围」填写起始行与结束行（例如第 15 行至第 60 行），避免每次导入时重复处理顶部的历史旧数据。
            </li>
            <li>
              <strong>表格拉取与授权模式</strong>：
              <ul style={{ margin: '4px 0 6px 18px' }}>
                <li><strong>公开共享表格</strong>：粘贴分享链接后点击「拉取预览」，系统免登录直接提取 CSV 数据流；</li>
                <li><strong>私有受保护表格</strong>：若表格受企业权限保护提示私有需要授权，点击「Google 授权拉取」使用企业 Google 账号登录授权，系统以只读方式安全直连；</li>
                <li><strong>自动识别企业名</strong>：系统自动从表格底部工作表 Tab 标题（如 <code>Greif SG</code>、<code>PSA</code>）提取企业名并预填入“客户企业”字段。</li>
              </ul>
            </li>
            <li>
              <strong>14 项表头自动推断与 15 项可选映射</strong>：
              拉取成功后，系统根据首行表头自动智能推断映射字段，顾问可在表头下拉框逐列调整（不需要的列选择“跳过”）：
            </li>
          </ol>

          <table className="doc-table">
            <thead>
              <tr>
                <th style={{ width: '25%' }}>映射字段 Key</th>
                <th style={{ width: '25%' }}>对应业务内容</th>
                <th style={{ width: '25%' }}>映射字段 Key</th>
                <th style={{ width: '25%' }}>对应业务内容</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>interviewDate</code></td>
                <td>面试日期与时刻</td>
                <td><code>phone</code></td>
                <td>联系电话 / 手机</td>
              </tr>
              <tr>
                <td><code>position</code></td>
                <td>申请岗位 / 职位</td>
                <td><code>picName</code></td>
                <td>经办顾问 / 负责人</td>
              </tr>
              <tr>
                <td><code>name</code></td>
                <td>候选人姓名</td>
                <td><code>remarks</code></td>
                <td>备注说明 / 状态</td>
              </tr>
              <tr>
                <td><code>icNoAge</code></td>
                <td>年龄 / 身份证号</td>
                <td><code>offered</code></td>
                <td>提供薪资 / 待遇</td>
              </tr>
              <tr>
                <td><code>degree</code></td>
                <td>学历 / 资质证书</td>
                <td><code>department</code></td>
                <td>所属部门 / 工种</td>
              </tr>
              <tr>
                <td><code>experience</code></td>
                <td>工作履历与年限</td>
                <td><code>school</code></td>
                <td>毕业院校</td>
              </tr>
              <tr>
                <td><code>location</code></td>
                <td>现住地点 / 区域</td>
                <td><code>company</code></td>
                <td>客户企业名称</td>
              </tr>
            </tbody>
          </table>
          <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            * 注：早期猎头大表通常为 12 列标准字段，TALENT FLOW 现已扩充为 14 项表头自动推断，并在下拉菜单中额外提供 <code>notes</code>（内控备注）供选配，合计支持 15 项映射。
          </p>

          <h4>四、双导入模式与 AI 清洗流水线</h4>
          <table className="doc-table">
            <thead>
              <tr>
                <th style={{ width: '24%' }}>导入方式</th>
                <th style={{ width: '38%' }}>核心处理逻辑</th>
                <th style={{ width: '38%' }}>最佳适用场景</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>传统映射强制导入</strong></td>
                <td>严格按照表头映射关系逐行直写云端。</td>
                <td>格式极度规范、表头对齐的纯净历史数据。</td>
              </tr>
              <tr>
                <td><strong>AI 智能清洗导入 (推荐)</strong></td>
                <td>先行云端查重，大模型提取画像，提供可编辑审查表。</td>
                <td>包含复杂长文本、需要自动对齐经办顾问或需要人工复核的数据。</td>
              </tr>
            </tbody>
          </table>

          <p style={{ marginTop: '14px' }}><strong>AI 智能清洗的五步流水线：</strong></p>
          <ol style={{ margin: '8px 0 16px 20px', lineHeight: '1.8' }}>
            <li><strong>智能查重拦截</strong>：候选人按“姓名 + 电话”、订单按“公司 + 岗位”与系统现有数据全量比对，已存在的记录直接过滤跳过，并提示 <code>去重拦截了 N 条，已为您节省 Token</code>；</li>
            <li><strong>并发分批调度</strong>：候选人每 30 行一批、订单每 150 行一批，并发调用 Python AI 后端，网络抖动时自动隔离重试，单批次故障不影响其他批次；</li>
            <li><strong>经办顾问智能对齐</strong>：表格中填写的“张顾问”或“Alex”，系统自动模糊匹配团队在册成员列表，导入后自动将数据归属指派至该顾问名下；</li>
            <li><strong>可编辑审查表 (Diff Review)</strong>：导入前展示完整审查大表，支持在顶部工具栏批量统一覆盖公司名、就地修改电话与面试日期，或点击 WhatsApp 图标直接发起沟通；</li>
            <li><strong>标准化入库流转</strong>：系统自动规范日期格式（<code>YYYY-MM-DD</code>）与时刻；若数据包含有效面试日期，该候选人导入后会自动流转至“面试考核”阶段。</li>
          </ol>

          <h4>五、私密数据保险库 (端到端零知识 E2EE 加密)</h4>
          <p>
            客户谈判底价、猎头佣金点数、提成底线及敏感背调评语，必须受到最高等级的安全保护。数据在离开顾问浏览器前即完成加密，云端仅存储密文。
          </p>

          <ol style={{ margin: '8px 0 16px 20px', lineHeight: '1.8' }}>
            <li><strong>设置与解锁</strong>：在「私密数据保险库密码」面板中输入主密码并点击「设置密码」，当前浏览器会话即刻解锁，招聘订单详情与候选人抽屉中的保密笔记即可正常查看与编辑；在公共设备使用完毕后点击「清除本地密码」即刻重新锁定为密文状态；</li>
            <li><strong>团队密码共用规则</strong>：私密保险库采用对称密码机制，<strong>团队内需要互相查阅或协同编辑保密笔记的成员，必须在各自电脑上输入相同的“团队保险库主密码”</strong>；建议由企业负责人统一设定并通过安全渠道同步给有权知悉的核心成员；</li>
            <li><strong>安全原理与密文规范</strong>：采用 W3C 原生 Web Crypto API，通过 <code>PBKDF2-SHA-256</code>（100,000 次哈希迭代）派生 256 位密钥，并使用 <code>AES-GCM-256</code> 高强度算法加密，云端存储的密文均带有系统签名 <code>TLFL_E2EE_V1:</code>，主密码绝不上传服务器。</li>
          </ol>

          <div className="doc-callout doc-callout-warning">
            <strong><i className="ph-bold ph-shield-warning"></i> 核心安全警示：</strong>
            <p>
              保险库密码一旦遗忘，任何人（包括管理员和开发者）均无法找回或重置，该密码加密的内容将永久无法解密！建议使用企业密码管理器妥善保管。
            </p>
          </div>

          <h4>六、WhatsApp 个人通知与模板定制</h4>
          <ol style={{ margin: '8px 0 16px 20px', lineHeight: '1.8' }}>
            <li><strong>绑定个人手机号</strong>：输入带国际区号的个人 WhatsApp 号码（例如 <code>60123456789</code>，无需添加 <code>+</code> 号、空格或 <code>-</code>），点击「绑定/更新号码」；</li>
            <li>
              <strong>定制提醒模板</strong>：系统默认提供标准模板，顾问可自由修改排版与语言，但请保留三个双花括号变量：<code>{`{{候选人名字}}`}</code>、<code>{`{{提醒内容}}`}</code>、<code>{`{{时间}}`}</code>，触发时系统将自动替换为真实数据；
            </li>
            <li>点击「保存提醒模板」后即刻生效，由候选人抽屉中的“跟进提醒”设定时间自动触发触达。</li>
          </ol>

          <h4>七、推荐使用顺序与常见问题 (FAQ)</h4>
          <p><strong>初次配置推荐顺序：</strong>① 设置保险库密码 ➔ ② 绑定 WhatsApp 并检查模板 ➔ ③ 若有旧单机数据，由 Owner 执行一次性 JSON 上云 ➔ ④ 依据日常业务使用 Google 表格 AI 导入。</p>

          <ul style={{ margin: '8px 0 16px 20px', lineHeight: '1.8' }}>
            <li>
              <strong>Q1: 导入 Google 表格时提示“该表格是私有的，需要授权”？</strong><br />
              答：请点击出现的「Google 授权拉取」按钮，使用拥有该表格访问权限的 Google 账号登录授权即可。
            </li>
            <li>
              <strong>Q2: 为什么导入的候选人直接进入了“面试考核”阶段？</strong><br />
              答：系统具备智能状态识别。如果导入的数据行中包含有效的面试日期或已到场状态，系统判定该候选人已在面试流程中，会自动将其归入“面试考核”，无需顾问手动拖拽。
            </li>
            <li>
              <strong>Q3: 换了新电脑登录后，为什么订单的私密笔记显示为加密锁定？</strong><br />
              答：保险库密码仅保存在本地浏览器内存中，绝不上云。换新电脑或清理浏览器缓存后，只需进入「系统设置」重新输入一次保险库密码即可秒级解锁。
            </li>
            <li>
              <strong>Q4: 为什么重复导入同一份 JSON 备份会导致候选人数量翻倍？</strong><br />
              答：JSON 迁移是为灾难恢复和一次性上云设计的底层通道，每次导入都会生成全新的唯一 ID。请勿对同一份备份文件反复执行导入；日常增量录入请使用具有前置查重机制的“Google 表格 AI 导入”或“AI 简历解析”。
            </li>
            <li>
              <strong>Q5: 忘记了保险库密码怎么办？</strong><br />
              答：零知识加密在数学上无法反向破解。请先在其他尚未清除密码缓存的同事电脑上查看并备份明文，随后重设新密码。
            </li>
          </ul>
        </div>
      )
    },
    /*
    {
      id: 'feedback',
      title: '意见与反馈中心 (Feedback)',
      badge: '共创演进',
      icon: 'ph-chat-circle-dots',
      tag: '支持',
      summary: '提交日常业务痛点、新功能期待、问题报修并实时查看管理层处理状态。',
      content: (
        <div className="doc-section-body">
          <h4>💡 反馈与协同</h4>
          <p>
            顾问在日常操作中有任何使用体验不畅或功能期待，可随时在此提交，技术与产品团队会优先排期迭代。
          </p>
        </div>
      )
    },
    */
    {
      id: 'faq',
      title: '12. 常见问题排错指南 (FAQ)',
      badge: '疑难速查',
      icon: 'ph-question',
      tag: '指引',
      summary: '账号审批、看板拖拽、储备库激活、AI 超时、跨月日程、Telegram 机器人与 E2EE 保险库常见疑问汇编。',
      content: (
        <div className="doc-section-body">
          <div className="doc-callout doc-callout-info">
            <strong><i className="ph-bold ph-lightbulb-filament"></i> 查阅小贴士：</strong>
            <span>本章节汇编了团队顾问与主管在日常作业中最常遇到的疑难问题与排错操作，按业务模块分类归整。若遇到系统异常，建议优先对照本篇指引进行快速排查。</span>
          </div>

          <h4>一、账号、登录与团队权限类</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', margin: '14px 0 24px 0' }}>
            <div style={{ padding: '16px 18px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))', borderRadius: '10px' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', fontSize: '0.96rem' }}>
                Q1: 新注册成员登录后提示“待审核 (pending)”，看不到业务数据？
              </div>
              <div style={{ color: 'var(--text-secondary)', lineHeight: '1.8' }}>
                答：这是系统严格的商业数据防护屏障。新账号首次注册后默认无法读取任何团队资产。请联系团队 <code>Owner</code>（所有者）或 <code>Manager</code>（主管）登录，进入「团队协作」页面，在顶部的「待审核申请」卡片中选择分配团队并点击「批准」，即可秒级激活为招聘顾问正式开展业务。
              </div>
            </div>

            <div style={{ padding: '16px 18px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))', borderRadius: '10px' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', fontSize: '0.96rem' }}>
                Q2: 切换到合作人团队后，为什么看不到“录入候选人”和“发布职位”按钮？
              </div>
              <div style={{ color: 'var(--text-secondary)', lineHeight: '1.8' }}>
                答：总部视察合作人受“单向只读安全保护”（顶栏高亮显示金色 <code>[单向只读]</code> 徽标）。为保障合作方数据安全，全系统新增按钮与右下角全局悬浮球会自动熔断隐藏，数据库底层也严格拒绝写请求。如需录入自有业务，请在顶栏切换器切回“公司本部 (自有数据)”。
              </div>
            </div>

            <div style={{ padding: '16px 18px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))', borderRadius: '10px' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', fontSize: '0.96rem' }}>
                Q3: 顾问离职或转岗调动分部，如何处理其账号与名下候选人？
              </div>
              <div style={{ color: 'var(--text-secondary)', lineHeight: '1.8' }}>
                答：拥有 Owner 权限的主管可在「团队协作」列表中点击该成员卡片的「编辑」按钮，将其平移调配至其他分公司团队，或点击垃圾桶图标将其「移出团队」。该顾问离职或移除后，其名下已建档的候选人与订单依然完好保留在团队共享库中，主管可在候选人列表批量指派给新接手的顾问继续推进。
              </div>
            </div>
          </div>

          <h4>二、候选人流转、看板与人才库类</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', margin: '14px 0 24px 0' }}>
            <div style={{ padding: '16px 18px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))', borderRadius: '10px' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', fontSize: '0.96rem' }}>
                Q4: 在招聘看板拖拽候选人卡片时，为什么部分卡片拖动后立刻弹回？
              </div>
              <div style={{ color: 'var(--text-secondary)', lineHeight: '1.8' }}>
                答：请检查两点：① 顶栏是否处于合作人“单向只读”模式（只读模式下拖拽流转被底层锁定）；② 检查网络是否断连，流转操作会自动向云端 Firestore 提交阶段变更并写入不可变操作审计日志，若网络异常会有 Toast 提示。
              </div>
            </div>

            <div style={{ padding: '16px 18px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))', borderRadius: '10px' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', fontSize: '0.96rem' }}>
                Q5: 候选人被淘汰后在主列表和看板中找不到了，如何召回激活？
              </div>
              <div style={{ color: 'var(--text-secondary)', lineHeight: '1.8' }}>
                答：系统对淘汰采用“资产归档”而非物理删除。请前往左侧菜单「储备人才库 (Talent Pool)」，使用多词联搜或按淘汰原因（如“薪资不符”、“已接其他Offer”）筛选；点击该候选人卡片展开 360° 档案抽屉，在抽屉顶部粉红色淘汰提示区点击翠绿色的「重新激活流转」按钮，该候选人即刻恢复为活跃状态并回到“初筛”泳道。
              </div>
            </div>

            <div style={{ padding: '16px 18px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))', borderRadius: '10px' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', fontSize: '0.96rem' }}>
                Q6: 界面右下角常驻的蓝色“＋”悬浮按钮 (Global FAB) 是做什么的？
              </div>
              <div style={{ color: 'var(--text-secondary)', lineHeight: '1.8' }}>
                答：这是全局快捷建档浮钮。无论顾问在长列表中向下滚动到第几屏，随时点击悬浮球即可一键滑出「录入候选人」抽屉或「发布新订单」表单，无需反复滚屏回顶。在只读透视模式下，该浮钮会自动隐藏防误触。
              </div>
            </div>
          </div>

          <h4>三、AI 智能工具箱与简历解析类</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', margin: '14px 0 24px 0' }}>
            <div style={{ padding: '16px 18px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))', borderRadius: '10px' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', fontSize: '0.96rem' }}>
                Q7: AI 职位生成或 CV 简历解析提示“连接超时”或“解析失败”？
              </div>
              <div style={{ color: 'var(--text-secondary)', lineHeight: '1.8' }}>
                答：请依次排查：① 确认 Python AI 微服务（默认端口 8000）是否正常运行（可在浏览器访问 <code>http://localhost:8000/docs</code> 验证接口）；② 检查 <code>ai_backend/.env</code> 中的 <code>GEMINI_API_KEY</code> 是否有效、配额是否充足；③ 大模型偶尔存在网络波动，系统内置了截断重试与超时降级机制，稍候 3~5 秒再次点击即可。
              </div>
            </div>

            <div style={{ padding: '16px 18px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))', borderRadius: '10px' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', fontSize: '0.96rem' }}>
                Q8: 为什么 AI 职位生成会自动将真实公司名替换为通用代称？
              </div>
              <div style={{ color: 'var(--text-secondary)', lineHeight: '1.8' }}>
                答：这是商业防跑单脱敏机制。三大对外发布版（中、英、马）会自动将厂名转换为类似 <code>[某知名跨国制造企业]</code> 的行业代称；系统同时提醒顾问需手动泛化具体门牌路名（泛化为市/县工业区级），防范求职者绕开猎头自行上门应聘。仅全英文的【内部审批版】才会保留真实底薪与客户原名，该版本严禁对外发布。
              </div>
            </div>
          </div>

          <h4>四、日程排期与生态自动化类</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', margin: '14px 0 24px 0' }}>
            <div style={{ padding: '16px 18px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))', borderRadius: '10px' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', fontSize: '0.96rem' }}>
                Q9: 为什么在面试日程月历上看不到某个已知安排的候选人？
              </div>
              <div style={{ color: 'var(--text-secondary)', lineHeight: '1.8' }}>
                答：请检查三点：① 档案中是否填了明确的面试日期（未填日期仅在待办清单，不在月历方格内）；② 顶部视角是否处于“个人模式”，且当前选中的顾问并非你自己；③ 检查月份是否切换正确（若当前月无面试，系统会自动首屏跳转到最早有排期的月份）。
              </div>
            </div>

            <div style={{ padding: '16px 18px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))', borderRadius: '10px' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', fontSize: '0.96rem' }}>
                Q10: 在 Telegram 业务群里发了简历，为什么系统人才库完全没有出现？
              </div>
              <div style={{ color: 'var(--text-secondary)', lineHeight: '1.8' }}>
                答：请依次排查：① 文字简历是否少于 80 字（防闲聊机制会自动忽略过短文字）；② 机器人是否通过官方 <code>@BotFather</code> 执行 <code>/setprivacy -&gt; Disable</code> 关闭了隐私模式（未关闭则 Bot 无权读取群附件）；③ 检查业务群是否在 <code>TELEGRAM_ALLOWED_CHATS</code> 白名单内；④ 确认 n8n (`:5678`) 与 AI 后端 (`:8000`) 正常运行且工作流处于 Active 激活状态。
              </div>
            </div>
          </div>

          <h4>五、商业机密与数据安全类</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', margin: '14px 0 10px 0' }}>
            <div style={{ padding: '16px 18px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))', borderRadius: '10px' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', fontSize: '0.96rem' }}>
                Q11: 换了新电脑登录后，为什么订单的私密笔记显示为加密锁闭状态？
              </div>
              <div style={{ color: 'var(--text-secondary)', lineHeight: '1.8' }}>
                答：这是端到端零知识加密 (E2EE) 的标准表现。主密码仅缓存在本地浏览器内存中，绝不上传云端数据库。换新设备或清理浏览器缓存后，只需进入「系统设置」重新输入一次您的“保险库主密码”并保存，即可秒级解锁。
              </div>
            </div>

            <div style={{ padding: '16px 18px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))', borderRadius: '10px' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', fontSize: '0.96rem' }}>
                Q12: 忘记了私密数据保险库密码怎么办？
              </div>
              <div style={{ color: 'var(--text-secondary)', lineHeight: '1.8' }}>
                答：零知识高强度加密（PBKDF2 + AES-GCM-256）在数学上无法反向破解，服务器与开发者完全无法找回！应急方案：请先联系在其他设备上仍处于解锁状态的团队同事（如 Owner），在对方设备上复制并备份明文笔记，随后统一重新设置新密码。
              </div>
            </div>

            <div style={{ padding: '16px 18px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))', borderRadius: '10px' }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px', fontSize: '0.96rem' }}>
                Q13: 为什么重复导入同一份 JSON 备份会导致候选人数量翻倍？
              </div>
              <div style={{ color: 'var(--text-secondary)', lineHeight: '1.8' }}>
                答：JSON 迁移是面向离线全量灾备恢复的通道，每次导入均会派发全新的系统 UUID。请勿对同一份备份文件反复执行导入；日常增量导入请使用具有前置查重机制的“Google 表格 AI 导入”或“AI 简历解析”。
              </div>
            </div>
          </div>
        </div>
      )
    }
  ];

  const sections = lang === 'en' ? sectionsEn : sectionsZh;

  // URL hash listener and scroll
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash) {
        const found = sections.find(s => s.id === hash);
        if (found) {
          setActiveSection(hash);
          const el = document.getElementById(hash);
          if (el) {
            setTimeout(() => {
              el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
          }
        }
      }
    };

    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const handleNavClick = (id) => {
    setActiveSection(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.history.replaceState(null, null, `#${id}`);
    }
  };

  const filteredSections = sections.filter(sec => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return sec.title.toLowerCase().includes(q) || sec.summary.toLowerCase().includes(q) || sec.id.includes(q);
  });

  const handleBackToApp = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/overview');
    }
  };

  return (
    <div className="standalone-docs-root">
      {/* Dedicated Modern Header */}
      <header className="standalone-docs-navbar">
        <div className="nav-left">
          <Link href="/overview" className="docs-brand-link">
            <div className="docs-brand-symbol">
              <i className="ph-bold ph-intersect-three"></i>
            </div>
            <div className="docs-brand-text">
              <span className="brand-name">TALENT FLOW</span>
              <span className="brand-sub">OMNI RECRUIT</span>
            </div>
          </Link>
          <div className="nav-separator">/</div>
          <div className="docs-title-badge">
            <i className="ph-bold ph-book-open"></i>
            <span>{lang === 'en' ? 'User Manual' : '操作手册 (User Manual)'}</span>
          </div>
        </div>

        <div className="nav-center">
          <div className="standalone-search-box">
            <i className="ph-light ph-magnifying-glass"></i>
            <input 
              type="text" 
              placeholder={lang === 'en' ? "Search manuals, modules, or features..." : "搜索操作教程、模块或功能关键词..."} 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="search-clear-btn" onClick={() => setSearchQuery('')}>
                <i className="ph-bold ph-x"></i>
              </button>
            )}
          </div>
        </div>

        <div className="nav-right">
          <button 
            type="button" 
            className="docs-icon-btn" 
            onClick={toggleTheme}
            title={
              theme === 'dark' 
                ? (lang === 'en' ? 'Current: OLED Dark (Click for Gemini Cosmos)' : '当前: OLED 深空 (点击切换为 Gemini 宇宙)')
                : theme === 'gemini'
                  ? (lang === 'en' ? 'Current: Gemini Cosmos (Click for Daylight Light)' : '当前: Gemini 宇宙 (点击切换为日间清爽)')
                  : (lang === 'en' ? 'Current: Daylight (Click for OLED Dark)' : '当前: 日间清爽 (点击切换为 OLED 深空)')
            }
            style={theme === 'gemini' ? {
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.22) 0%, rgba(168, 85, 247, 0.28) 50%, rgba(236, 72, 153, 0.22) 100%)',
              borderColor: 'rgba(168, 85, 247, 0.55)',
              boxShadow: '0 0 14px rgba(168, 85, 247, 0.4)'
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
            {theme === 'light' && <i className="ph-light ph-sun" style={{ color: '#d97706' }}></i>}
          </button>

          <button 
            type="button" 
            className="docs-icon-btn docs-lang-btn" 
            onClick={toggleLang}
            title={lang === 'en' ? "Switch Language" : "切换语言"}
          >
            {lang === 'zh' ? 'EN' : '中'}
          </button>

          <a 
            href={lang === 'en' ? "https://github.com/GGWD06/Omni_Reruitment_Management/blob/main/USER_MANUAL_EN.md" : "https://github.com/GGWD06/Omni_Reruitment_Management/blob/main/USER_MANUAL.md"} 
            target="_blank" 
            rel="noopener noreferrer"
            className="docs-icon-btn"
            title={lang === 'en' ? "View Markdown on GitHub" : "在 GitHub 查看 Markdown 原版"}
          >
            <i className="ph-bold ph-github-logo"></i>
          </a>

          <button 
            type="button" 
            className="back-to-app-btn"
            onClick={handleBackToApp}
          >
            <i className="ph-bold ph-arrow-left"></i>
            <span>{lang === 'en' ? 'Back to Dashboard' : '返回系统工作台'}</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="standalone-docs-container">
        {/* Left Sticky TOC Sidebar */}
        <aside className="standalone-toc-sidebar">
          <div className="toc-header">
            <i className="ph-bold ph-list-dashes"></i>
            <span>{lang === 'en' ? `Table of Contents (${sections.length})` : `手册目录导航 (${sections.length})`}</span>
          </div>
          <nav className="toc-nav-list">
            {sections.map((sec) => (
              <button
                key={sec.id}
                type="button"
                className={`toc-btn ${activeSection === sec.id ? 'active' : ''}`}
                onClick={() => handleNavClick(sec.id)}
              >
                <i className={`ph-bold ${sec.icon}`}></i>
                <span className="toc-title-text">{sec.title.split(' (')[0]}</span>
                <span className="toc-tag-pill">{sec.tag}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* Right Content Area */}
        <main className="standalone-content-canvas">
          {/* Top Welcome Card */}
          <div className="welcome-banner-card">
            <div className="welcome-tag">
              <i className="ph-bold ph-sparkle"></i>
              <span>{lang === 'en' ? 'TALENT FLOW 2.0 Official Knowledge Base' : 'TALENT FLOW 2.0 官方知识库'}</span>
            </div>
            <h1 className="welcome-title">
              {lang === 'en' ? 'Comprehensive Recruitment Operations & Practice Guide' : '全方位智能招聘业务实战与操作指南'}
            </h1>
            <p className="welcome-desc">
              {lang === 'en' 
                ? 'A complete operational manual designed for HRBPs, recruitment consultants, and team managers. Covers agile Kanban, multi-keyword search, AI generation, CV parsing, and automated ingestion.'
                : '为企业 HRBP、猎头顾问与团队主管打造的全面业务操作手册。包含敏捷看板、多词联搜、AI 生成、简历解析排版及自动化集成实战指引。'}
            </p>
          </div>

          {/* Section Cards */}
          {filteredSections.length === 0 ? (
            <div className="docs-empty-box">
              <i className="ph-light ph-empty"></i>
              <p>
                {lang === 'en' 
                  ? `No tutorial sections matching "${searchQuery}". Please try other keywords.`
                  : `未找到匹配 “${searchQuery}” 的教程章节，请尝试其他关键词。`}
              </p>
            </div>
          ) : (
            filteredSections.map((sec) => (
              <section 
                key={sec.id} 
                id={sec.id} 
                className={`standalone-doc-card ${activeSection === sec.id ? 'active-highlight' : ''}`}
              >
                <div className="card-top-bar">
                  <div className="card-top-left">
                    <div className="card-icon-halo">
                      <i className={`ph-bold ${sec.icon}`}></i>
                    </div>
                    <div>
                      <h2 className="card-heading">{sec.title}</h2>
                      <p className="card-sub">{sec.summary}</p>
                    </div>
                  </div>
                  <div className="card-top-right">
                    <span className="card-badge">{sec.badge}</span>
                    <button 
                      className="copy-link-btn"
                      onClick={() => {
                        const url = `${window.location.origin}/docs#${sec.id}`;
                        navigator.clipboard?.writeText(url);
                        setCopiedSection(sec.id);
                        setTimeout(() => setCopiedSection(null), 2000);
                      }}
                      title={lang === 'en' ? "Copy direct link to section" : "复制本章节锚点直达链接"}
                    >
                      <i className={copiedSection === sec.id ? "ph-bold ph-check" : "ph-bold ph-link"}></i>
                    </button>
                  </div>
                </div>

                <div className="card-inner-body">
                  {sec.content}
                </div>
              </section>
            ))
          )}

          {/* Footer Card */}
          <footer className="docs-bottom-footer">
            <p>
              💡 <strong>{lang === 'en' ? 'Continuous Knowledge Evolution' : '知识库持续演进'}</strong>：
              {lang === 'en' 
                ? 'Documentation evolves continuously with business requirements. For suggestions or new workflow requests, feel free to contact the technical team!'
                : '手册内容将随着业务新需求持续迭代更新。如有新增操作指引建议，欢迎随时向技术团队提出！'}
            </p>
          </footer>
        </main>
      </div>

      {/* Floating Back to Top Button */}
      {showBackToTop && (
        <button 
          className="back-to-top-float"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          title={lang === 'en' ? "Back to top" : "回到顶部"}
        >
          <i className="ph-bold ph-arrow-up"></i>
        </button>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .standalone-docs-root {
          min-height: 100vh;
          background: var(--bg-void, #050508);
          color: var(--text-primary, #ffffff);
          display: flex;
          flex-direction: column;
          position: relative;
          z-index: 1;
        }

        [data-theme="gemini"] .standalone-docs-root {
          background: transparent !important;
        }

        /* Top Navbar */
        .standalone-docs-navbar {
          position: sticky;
          top: 0;
          z-index: 100;
          height: 64px;
          background: var(--header-bg, rgba(14, 16, 25, 0.75));
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid var(--border-hairline, rgba(255, 255, 255, 0.08));
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 28px;
        }

        .nav-left {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .docs-brand-link {
          display: flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
        }

        .docs-brand-symbol {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: linear-gradient(135deg, var(--accent-blue, #3b82f6), #1d4ed8);
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.1rem;
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.35);
        }

        .docs-brand-text {
          display: flex;
          flex-direction: column;
          line-height: 1.1;
        }

        .brand-name {
          font-size: 0.88rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          color: var(--text-primary);
        }

        .brand-sub {
          font-size: 0.65rem;
          color: var(--text-muted);
          letter-spacing: 0.06em;
        }

        .nav-separator {
          color: var(--text-faint, rgba(255, 255, 255, 0.2));
          font-size: 0.9rem;
        }

        .docs-title-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          background: rgba(59, 130, 246, 0.1);
          border: 1px solid rgba(59, 130, 246, 0.25);
          color: var(--accent-blue, #3b82f6);
          border-radius: var(--radius-full, 9999px);
          font-size: 0.78rem;
          font-weight: 600;
        }

        .nav-center {
          flex: 1;
          max-width: 480px;
          margin: 0 24px;
        }

        .standalone-search-box {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--input-bg, #090a10);
          border: 1px solid var(--input-border, rgba(255, 255, 255, 0.08));
          border-radius: var(--radius-md, 8px);
          padding: 7px 12px;
          width: 100%;
          transition: border-color 0.2s ease;
        }

        .standalone-search-box:focus-within {
          border-color: var(--accent-blue);
          box-shadow: 0 0 0 1px var(--accent-blue-glow, rgba(59, 130, 246, 0.25));
        }

        .standalone-search-box input {
          background: transparent;
          border: none;
          outline: none;
          color: var(--text-primary);
          font-size: 0.84rem;
          width: 100%;
        }

        .standalone-search-box input::placeholder {
          color: var(--text-muted);
        }

        .search-clear-btn {
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          font-size: 0.85rem;
          display: flex;
          align-items: center;
        }

        .nav-right {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .docs-icon-btn {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          background: var(--btn-secondary-bg, rgba(255, 255, 255, 0.04));
          border: 1px solid var(--btn-secondary-border, rgba(255, 255, 255, 0.1));
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 1.05rem;
          transition: all 0.2s ease;
        }

        .docs-icon-btn:hover {
          color: var(--text-primary);
          background: var(--btn-secondary-hover-bg, rgba(255, 255, 255, 0.08));
        }

        .docs-lang-btn {
          font-size: 0.8rem;
          font-weight: 700;
        }

        .back-to-app-btn {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 7px 14px;
          background: var(--accent-blue, #3b82f6);
          color: #fff;
          border: none;
          border-radius: var(--radius-md, 8px);
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 2px 10px rgba(59, 130, 246, 0.3);
        }

        .back-to-app-btn:hover {
          background: #2563eb;
          transform: translateY(-1px);
        }

        /* Container Layout */
        .standalone-docs-container {
          display: grid;
          grid-template-columns: 280px 1fr;
          max-width: 1520px;
          width: 100%;
          margin: 0 auto;
          padding: 24px 28px;
          gap: 32px;
          align-items: start;
          flex: 1;
        }

        /* TOC Sidebar */
        .standalone-toc-sidebar {
          position: sticky;
          top: 88px;
          background: var(--card-bg, #0e1019);
          border: 1px solid var(--card-border, rgba(255, 255, 255, 0.06));
          border-radius: var(--radius-md, 12px);
          padding: 16px;
          max-height: calc(100vh - 110px);
          overflow-y: auto;
          box-shadow: var(--shadow-card);
        }

        .toc-header {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--text-primary);
          font-weight: 700;
          font-size: 0.86rem;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.05));
        }

        .toc-nav-list {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .toc-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          text-align: left;
          padding: 8px 10px;
          border-radius: var(--radius-sm, 6px);
          background: transparent;
          border: none;
          color: var(--text-secondary);
          font-size: 0.82rem;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .toc-btn:hover {
          background: rgba(255, 255, 255, 0.04);
          color: var(--text-primary);
        }

        .toc-btn.active {
          background: rgba(59, 130, 246, 0.12);
          color: var(--accent-blue, #3b82f6);
          font-weight: 600;
        }

        .toc-title-text {
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .toc-tag-pill {
          font-size: 0.65rem;
          padding: 2px 6px;
          border-radius: 4px;
          background: rgba(255, 255, 255, 0.05);
          color: var(--text-muted);
        }

        .toc-btn.active .toc-tag-pill {
          background: rgba(59, 130, 246, 0.2);
          color: var(--accent-blue);
        }

        /* Right Content Canvas */
        .standalone-content-canvas {
          display: flex;
          flex-direction: column;
          gap: 24px;
          min-width: 0;
        }

        .welcome-banner-card {
          background: var(--card-bg, #0e1019);
          border: 1px solid var(--card-border, rgba(255, 255, 255, 0.06));
          border-radius: var(--radius-lg, 16px);
          padding: 26px 30px;
          box-shadow: var(--shadow-card);
        }

        .welcome-tag {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 3px 9px;
          background: rgba(59, 130, 246, 0.1);
          border: 1px solid rgba(59, 130, 246, 0.25);
          color: var(--accent-blue);
          border-radius: 9999px;
          font-size: 0.74rem;
          font-weight: 600;
          margin-bottom: 10px;
        }

        .welcome-title {
          font-size: 1.55rem;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 6px;
          letter-spacing: -0.02em;
        }

        .welcome-desc {
          font-size: 0.88rem;
          color: var(--text-secondary);
          line-height: 1.6;
          max-width: 860px;
        }

        .standalone-doc-card {
          background: var(--card-bg, #0e1019);
          border: 1px solid var(--card-border, rgba(255, 255, 255, 0.06));
          border-radius: var(--radius-md, 14px);
          padding: 26px;
          box-shadow: var(--shadow-card);
          scroll-margin-top: 84px;
          transition: all 0.2s ease;
        }

        .standalone-doc-card.active-highlight {
          border-color: rgba(59, 130, 246, 0.45);
          box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.25), var(--shadow-card);
        }

        .card-top-bar {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          padding-bottom: 16px;
          margin-bottom: 16px;
          border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.05));
        }

        .card-top-left {
          display: flex;
          align-items: flex-start;
          gap: 14px;
        }

        .card-icon-halo {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: rgba(59, 130, 246, 0.12);
          color: var(--accent-blue);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.25rem;
          flex-shrink: 0;
        }

        .card-heading {
          font-size: 1.2rem;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 4px;
        }

        .card-sub {
          font-size: 0.85rem;
          color: var(--text-secondary);
          line-height: 1.45;
        }

        .card-top-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .card-badge {
          font-size: 0.72rem;
          font-weight: 600;
          padding: 3px 8px;
          background: rgba(255, 255, 255, 0.06);
          color: var(--text-muted);
          border-radius: 9999px;
        }

        .copy-link-btn {
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          font-size: 1rem;
          padding: 4px;
          border-radius: 4px;
          transition: color 0.15s ease;
        }

        .copy-link-btn:hover {
          color: var(--accent-blue);
        }

        /* Card Inner Content & High-Legibility Typography */
        .doc-section-body {
          font-size: 0.94rem;
          color: var(--text-secondary);
          line-height: 1.85;
          letter-spacing: 0.02em;
        }

        .doc-section-body h4 {
          color: var(--text-primary);
          font-size: 1.05rem;
          font-weight: 700;
          margin: 32px 0 14px 0;
          letter-spacing: 0.015em;
          display: flex;
          align-items: center;
          gap: 8px;
          border-left: 3px solid var(--accent-blue, #3b82f6);
          padding-left: 10px;
        }

        .doc-section-body h4:first-child {
          margin-top: 0;
        }

        .doc-section-body p {
          margin: 10px 0 16px 0;
          line-height: 1.85;
          letter-spacing: 0.015em;
        }

        .doc-section-body ul,
        .doc-section-body ol {
          margin: 12px 0 20px 24px;
          padding: 0;
        }

        .doc-section-body li {
          margin-bottom: 10px;
          line-height: 1.82;
          letter-spacing: 0.015em;
        }

        .doc-section-body li:last-child {
          margin-bottom: 0;
        }

        .doc-section-body strong {
          color: var(--text-primary);
          font-weight: 600;
        }

        .doc-section-body code {
          background: rgba(255, 255, 255, 0.08);
          padding: 2px 7px;
          border-radius: 4px;
          font-size: 0.83rem;
          color: var(--text-primary);
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          margin: 0 2px;
          border: 1px solid rgba(255, 255, 255, 0.06);
        }

        [data-theme="light"] .doc-section-body code {
          background: rgba(0, 0, 0, 0.05);
          border-color: rgba(0, 0, 0, 0.08);
        }

        .doc-callout {
          padding: 16px 20px;
          border-radius: 10px;
          margin: 18px 0 22px 0;
          font-size: 0.88rem;
          line-height: 1.8;
          letter-spacing: 0.015em;
        }

        .doc-callout p {
          margin: 6px 0 0 0;
          line-height: 1.8;
        }

        .doc-callout-info {
          background: rgba(59, 130, 246, 0.09);
          border-left: 4px solid var(--accent-blue);
          color: var(--text-primary);
        }

        .doc-callout-tip {
          background: rgba(16, 185, 129, 0.09);
          border-left: 4px solid #10b981;
          color: var(--text-primary);
        }

        .doc-callout-warning {
          background: rgba(245, 158, 11, 0.09);
          border-left: 4px solid #f59e0b;
          color: var(--text-primary);
        }

        /* High-Clarity Card-Style Grid Table System */
        .doc-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          margin: 20px 0 28px 0;
          font-size: 0.88rem;
          line-height: 1.8;
          letter-spacing: 0.02em;
          border: 1px solid rgba(148, 163, 184, 0.24);
          border-radius: 12px;
          overflow: hidden;
          background: rgba(15, 23, 42, 0.65);
          box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }

        [data-theme="light"] .doc-table {
          background: #ffffff;
          border-color: #cbd5e1;
          box-shadow: 0 4px 16px -2px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.02);
        }

        [data-theme="gemini"] .doc-table {
          background: rgba(10, 14, 39, 0.75);
          border-color: rgba(168, 85, 247, 0.28);
          box-shadow: 0 4px 20px -2px rgba(5, 7, 22, 0.6), 0 0 16px -2px rgba(139, 92, 246, 0.2);
        }

        .doc-table th {
          text-align: left;
          padding: 14px 20px;
          background: rgba(30, 41, 59, 0.92);
          border-bottom: 2px solid rgba(59, 130, 246, 0.55);
          color: #f8fafc;
          font-weight: 700;
          font-size: 0.89rem;
          letter-spacing: 0.03em;
        }

        [data-theme="light"] .doc-table th {
          background: #f1f5f9;
          border-bottom: 2px solid #3b82f6;
          color: #0f172a;
        }

        .doc-table th:not(:last-child),
        .doc-table td:not(:last-child) {
          border-right: 1px solid rgba(148, 163, 184, 0.18);
        }

        [data-theme="light"] .doc-table th:not(:last-child),
        [data-theme="light"] .doc-table td:not(:last-child) {
          border-right: 1px solid #e2e8f0;
        }

        .doc-table th:first-child,
        .doc-table td:first-child {
          width: 25%;
          min-width: 140px;
          font-weight: 600;
          color: #e2e8f0;
        }

        [data-theme="light"] .doc-table th:first-child,
        [data-theme="light"] .doc-table td:first-child {
          color: #1e293b;
        }

        .doc-table td {
          padding: 14px 20px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.14);
          color: #cbd5e1;
          vertical-align: top;
          line-height: 1.8;
        }

        [data-theme="light"] .doc-table td {
          border-bottom: 1px solid #f1f5f9;
          color: #334155;
        }

        .doc-table tbody tr:last-child td {
          border-bottom: none;
        }

        .doc-table tbody tr:nth-child(even) td {
          background: rgba(30, 41, 59, 0.35);
        }

        [data-theme="light"] .doc-table tbody tr:nth-child(even) td {
          background: #f8fafc;
        }

        .doc-table tbody tr:hover td {
          background: rgba(59, 130, 246, 0.12);
          color: #ffffff;
          transition: background 0.15s ease, color 0.15s ease;
        }

        [data-theme="light"] .doc-table tbody tr:hover td {
          background: rgba(59, 130, 246, 0.06);
          color: #0f172a;
        }

        .doc-table td code {
          background: rgba(59, 130, 246, 0.14);
          color: #93c5fd;
          border: 1px solid rgba(59, 130, 246, 0.28);
          padding: 2px 7px;
          border-radius: 5px;
          font-size: 0.83rem;
          font-family: inherit;
        }

        [data-theme="light"] .doc-table td code {
          background: #eff6ff;
          color: #2563eb;
          border-color: #bfdbfe;
        }

        .doc-pipeline-steps {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          margin: 10px 0 16px 0;
        }

        .step-badge {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 0.78rem;
          color: var(--text-primary);
        }

        .step-arrow {
          color: var(--text-muted);
          font-size: 0.8rem;
        }

        .faq-item {
          padding: 14px 0;
          border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.06));
        }

        .faq-item:last-child {
          border-bottom: none;
        }

        .faq-item h5 {
          color: var(--text-primary);
          font-size: 0.95rem;
          font-weight: 600;
          margin-bottom: 6px;
          line-height: 1.6;
        }

        .faq-item p {
          margin: 0;
          color: var(--text-secondary);
          line-height: 1.8;
        }

        .docs-empty-box {
          padding: 48px;
          text-align: center;
          background: var(--card-bg);
          border-radius: 12px;
          color: var(--text-muted);
        }

        .docs-bottom-footer {
          padding: 16px 20px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px dashed var(--card-border);
          border-radius: 10px;
          font-size: 0.84rem;
          color: var(--text-muted);
        }

        .back-to-top-float {
          position: fixed;
          bottom: 28px;
          right: 28px;
          width: 42px;
          height: 42px;
          border-radius: 50%;
          background: var(--accent-blue, #3b82f6);
          color: #fff;
          border: none;
          box-shadow: 0 4px 14px rgba(59, 130, 246, 0.4);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.1rem;
          transition: all 0.2s ease;
          z-index: 90;
        }

        .back-to-top-float:hover {
          transform: translateY(-2px);
          background: #2563eb;
        }

        @media (max-width: 960px) {
          .standalone-docs-container {
            grid-template-columns: 1fr;
            padding: 16px;
          }
          .standalone-toc-sidebar {
            display: none;
          }
          .standalone-docs-navbar {
            padding: 0 16px;
          }
          .nav-center {
            display: none;
          }
        }
      ` }} />
    </div>
  );
}
