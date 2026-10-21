'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../../lib/auth-context';
import { useNotifications } from '../../../lib/notification-context';
import { FirestoreStore } from '../../../lib/firestore-store';
import { QRCodeSVG } from 'qrcode.react';

export default function WhatsAppPage() {
  const { teamId, role, user } = useAuth();
  const { candidates, candidatesLoading: loading } = useNotifications();
const [templates, setTemplates] = useState([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [phone, setPhone] = useState('');
  const [messageContent, setMessageContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  
  // Tab states for left panel
  const [listTab, setListTab] = useState('not_set'); // 'not_set', 'scheduled', 'sent'
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  
  // Date/Time picker state
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  
  // --- Bot Hub State ---
  const [connectedBots, setConnectedBots] = useState([]);
  const [selectedBotId, setSelectedBotId] = useState('');
  const [isBotModalOpen, setIsBotModalOpen] = useState(false);
  const [newBotName, setNewBotName] = useState('');
  const [activeQrCode, setActiveQrCode] = useState('');
  const [qrStatus, setQrStatus] = useState(''); // 'connecting', 'qr', 'connected'

  // Load Templates
  useEffect(() => {
    const saved = localStorage.getItem('tf_whatsapp_templates');
    if (saved) {
      try { setTemplates(JSON.parse(saved)); } catch (e) { setTemplates(getDefaultTemplates()); }
    } else {
      const defs = getDefaultTemplates();
      setTemplates(defs);
      localStorage.setItem('tf_whatsapp_templates', JSON.stringify(defs));
    }
  }, []);

  // Fetch Candidates
// Fetch Bots
  const fetchBots = async () => {
      try {
          const res = await fetch('http://localhost:8002/api/bot/list');
          const data = await res.json();
          if (data.success && user?.uid) {
              setConnectedBots(data.bots);
              const myBots = data.bots.filter(b => b.botId.startsWith(`${user.uid}___`));
              if (myBots.length > 0 && !selectedBotId) {
                  setSelectedBotId(myBots[0].botId);
              }
          }
      } catch (err) {
          console.error("无法连接到本地 Bot Hub", err);
      }
  };

  useEffect(() => {
      fetchBots();
      // Auto refresh bots every 10 seconds
      const interval = setInterval(fetchBots, 10000);
      return () => clearInterval(interval);
  }, [selectedBotId]);

  const getDefaultTemplates = () => [
    { id: '1', name: '面试提醒', content: '你好 {Name}，提醒您明天参加 {Company} 的 {JobTitle} 岗位面试，请提前准备。' },
    { id: '2', name: '材料补交', content: '你好 {Name}，关于您申请的 {JobTitle} 岗位，麻烦您补交一下相关作品集/证明材料，谢谢。' }
  ];

  const saveTemplates = (newTemplates) => {
    setTemplates(newTemplates);
    localStorage.setItem('tf_whatsapp_templates', JSON.stringify(newTemplates));
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  // ... (Template Handlers)
  const handleAddTemplate = () => {
    if (!messageContent.trim()) return showToast('请先在下方输入模板内容，再点击新增');
    const tplName = window.prompt("请输入模板名称:", "新模板");
    if (!tplName) return;
    saveTemplates([...templates, { id: Math.random().toString(36).substr(2, 9), name: tplName, content: messageContent.trim() }]);
    showToast('模板保存成功');
  };

  const handleDeleteTemplate = (id, e) => {
    e.stopPropagation();
    if (window.confirm('确定要删除这个消息模板吗？')) {
      saveTemplates(templates.filter(t => t.id !== id));
      showToast('模板已删除');
    }
  };

  const handleSelectTemplate = (tpl) => {
    let content = tpl.content;
    if (selectedCandidateId) {
      const c = candidates.find(can => can.id === selectedCandidateId);
      if (c) {
        content = content.replace(/{Name}/g, c.name || '')
                         .replace(/{Company}/g, c.company || '')
                         .replace(/{JobTitle}/g, c.jobTitle || '');
      }
    }
    setMessageContent(content);
    showToast(`已应用模板: ${tpl.name}`);
  };

  const handleSelectCandidate = (c) => {
    setSelectedCandidateId(c.id);
    let p = c.phone || '';
    setPhone(p.replace(/[^\d+]/g, ''));
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setScheduleDate(tomorrow.toISOString().split('T')[0]);
    setScheduleTime('10:00');
    
    if (c.whatsappMessage) {
        setMessageContent(c.whatsappMessage);
    }
  };

  const handleSendNow = async () => {
    if (!phone || !messageContent) return showToast('请输入手机号和消息内容');
    if (!selectedBotId) return showToast('请先选择或绑定一个发信账号');

    let formattedPhone = phone.replace(/\D/g, '');
    setIsSending(true);

    try {
      const response = await fetch(`http://localhost:8002/api/send-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId: selectedBotId, phone: formattedPhone, message: messageContent })
      });
      const result = await response.json();

      if (response.ok && result.success) {
        showToast('WhatsApp 发送成功！');
        await FirestoreStore.updateCandidate(teamId, selectedCandidateId, {
            whatsappStatus: 'sent',
            whatsappSentAt: Date.now(),
            whatsappMessage: messageContent
        });
      } else {
        throw new Error(result.error || '未知错误');
      }
    } catch (err) {
      showToast(`发送失败: ${err.message}`);
      await FirestoreStore.updateCandidate(teamId, selectedCandidateId, {
          whatsappStatus: 'failed',
          whatsappError: err.message
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleSchedule = async () => {
      if (!phone || !messageContent) return showToast('请输入手机号和消息内容');
      if (!selectedBotId) return showToast('请先选择或绑定一个发信账号');
      if (!scheduleDate || !scheduleTime) return showToast('请选择定时发送的日期和时间');
      
      const sendTimestamp = new Date(`${scheduleDate}T${scheduleTime}`).getTime();
      if (sendTimestamp <= Date.now()) {
          return showToast('排期时间必须在当前时间之后');
      }

      try {
          await FirestoreStore.updateCandidate(teamId, selectedCandidateId, {
              whatsappStatus: 'scheduled',
              whatsappSendAt: sendTimestamp,
              whatsappMessage: messageContent,
              whatsappBotRole: selectedBotId
          });
          showToast('已成功排期任务！云端机器人将准时发送。');
      } catch (err) {
          showToast(`排期失败: ${err.message}`);
      }
  };

  const handleCancelSchedule = async () => {
      try {
          await FirestoreStore.updateCandidate(teamId, selectedCandidateId, {
              whatsappStatus: 'not_set',
              whatsappSendAt: null
          });
          showToast('已取消该定时任务');
      } catch (err) {
          showToast(`取消失败: ${err.message}`);
      }
  };

  // --- Bot Binding Logic ---
  let pollInterval;
  const startBotBinding = async () => {
      if (!newBotName.trim()) return showToast('请输入一个好记的账号名称');
      setQrStatus('connecting');
      setActiveQrCode('');
      
      const safeBotId = `${user.uid}___${newBotName.trim().replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_')}_${Math.random().toString(36).substr(2,4)}`;

      try {
          await fetch('http://localhost:8002/api/bot/create', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ botId: safeBotId })
          });

          pollInterval = setInterval(async () => {
              const res = await fetch(`http://localhost:8002/api/bot/status/${safeBotId}`);
              const data = await res.json();
              if (data.status === 'qr') {
                  setQrStatus('qr');
                  setActiveQrCode(data.qr);
              } else if (data.status === 'connected') {
                  setQrStatus('connected');
                  clearInterval(pollInterval);
                  showToast('账号绑定成功！');
                  fetchBots();
                  setSelectedBotId(safeBotId);
                  setTimeout(() => setIsBotModalOpen(false), 1500);
              }
          }, 2000);
      } catch (err) {
          showToast('无法连接本地 Hub');
          setQrStatus('');
      }
  };

  const closeBotModal = () => {
      clearInterval(pollInterval);
      setIsBotModalOpen(false);
      setQrStatus('');
      setNewBotName('');
  };

  // Categorize candidates
  const filteredCandidates = candidates.filter(c => {
      if (stageFilter !== 'all') {
          if (stageFilter === 'interviewing' && !['screening', 'interview1', 'interview2'].includes(c.stage)) return false;
          if (stageFilter === 'offered' && c.stage !== 'offered') return false;
          if (stageFilter === 'rejected' && c.stage !== 'rejected') return false;
      }
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (c.name?.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q) || c.jobTitle?.toLowerCase().includes(q) || c.phone?.includes(q));
  });

  const listScheduled = filteredCandidates.filter(c => c.whatsappStatus === 'scheduled');
  const listSent = filteredCandidates.filter(c => c.whatsappStatus === 'sent' || c.whatsappStatus === 'failed');
  const listNotSet = filteredCandidates.filter(c => !c.whatsappStatus || c.whatsappStatus === 'not_set');

  const activeList = listTab === 'not_set' ? listNotSet : (listTab === 'scheduled' ? listScheduled : listSent);
  const selectedCandidate = candidates.find(c => c.id === selectedCandidateId);

  return (
    <>
      <div className="view-heading-box" style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
                <h1 className="view-heading">WhatsApp 多账号任务矩阵</h1>
                <span className="view-subheading">配置你的个人号、官方号，随时调度发送任务</span>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setIsBotModalOpen(true)}>
                <i className="ph-bold ph-plus"></i> 绑定新 WhatsApp
            </button>
        </div>
      </div>

      <div className="bento-grid">
        {/* Left Panel: Status Dashboard */}
        <div className="bento-col-4">
          <div className="bezel-shell" style={{ height: 'calc(100vh - 160px)' }}>
            <div className="bezel-core" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', background: 'var(--bg-secondary)', padding: '4px', borderRadius: 'var(--radius-md)' }}>
                  <button 
                    className={`btn-sm ${listTab === 'not_set' ? '' : 'btn-ghost'}`} 
                    style={{ flex: 1, background: listTab === 'not_set' ? 'var(--bg-surface)' : 'transparent', boxShadow: listTab === 'not_set' ? 'var(--shadow-sm)' : 'none' }}
                    onClick={() => setListTab('not_set')}
                  >
                      待设定 ({listNotSet.length})
                  </button>
                  <button 
                    className={`btn-sm ${listTab === 'scheduled' ? '' : 'btn-ghost'}`} 
                    style={{ flex: 1, background: listTab === 'scheduled' ? 'var(--bg-surface)' : 'transparent', boxShadow: listTab === 'scheduled' ? 'var(--shadow-sm)' : 'none' }}
                    onClick={() => setListTab('scheduled')}
                  >
                      🟡 排期中 ({listScheduled.length})
                  </button>
                  <button 
                    className={`btn-sm ${listTab === 'sent' ? '' : 'btn-ghost'}`} 
                    style={{ flex: 1, background: listTab === 'sent' ? 'var(--bg-surface)' : 'transparent', boxShadow: listTab === 'sent' ? 'var(--shadow-sm)' : 'none' }}
                    onClick={() => setListTab('sent')}
                  >
                      历史记录
                  </button>
              </div>

              <div className="form-input" style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', padding: '0 12px' }}>
                  <i className="ph-light ph-magnifying-glass" style={{ color: 'var(--text-secondary)', marginRight: '8px' }}></i>
                  <input 
                      type="text" 
                      placeholder="搜索名字、手机号..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      style={{ border: 'none', background: 'transparent', outline: 'none', color: 'var(--text-primary)', flex: 1, fontSize: '0.875rem' }}
                  />
                  {searchQuery && (
                      <i className="ph-fill ph-x-circle" style={{ color: 'var(--text-tertiary)', cursor: 'pointer' }} onClick={() => setSearchQuery('')}></i>
                  )}
              </div>

              {/* Stage Filter Tags */}
              <div style={{ paddingBottom: '12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: '8px', overflowX: 'auto', flexWrap: 'wrap', marginBottom: '8px' }}>
                  {['all', 'interviewing', 'offered', 'rejected'].map(stage => {
                      const labels = { all: '全部', interviewing: '面试中', offered: '已发Offer', rejected: '淘汰/放弃' };
                      const isSelected = stageFilter === stage;
                      return (
                          <button 
                              key={stage}
                              type="button"
                              onClick={() => setStageFilter(stage)}
                              style={{ 
                                  padding: '4px 10px', 
                                  borderRadius: '16px', 
                                  fontSize: '0.75rem', 
                                  border: '1px solid',
                                  borderColor: isSelected ? 'var(--accent-blue)' : 'var(--border-subtle)',
                                  background: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                                  color: isSelected ? 'var(--accent-blue)' : 'var(--text-secondary)',
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap'
                              }}
                          >
                              {labels[stage]}
                          </button>
                      );
                  })}
              </div>

              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                {activeList.length === 0 ? (
                    <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>暂无数据</div>
                ) : (
                    activeList.map(c => (
                        <div 
                          key={c.id}
                          onClick={() => handleSelectCandidate(c)}
                          style={{ 
                            padding: '12px', 
                            borderRadius: 'var(--radius-sm)', 
                            cursor: 'pointer', 
                            background: selectedCandidateId === c.id ? 'var(--bg-secondary)' : 'transparent',
                            borderBottom: '1px solid var(--border-hairline)'
                          }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontWeight: 500, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{c.name}</span>
                                {c.whatsappStatus === 'scheduled' && (
                                    <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(234, 179, 8, 0.1)', color: 'var(--accent-amber)' }}>排期中</span>
                                )}
                                {c.whatsappStatus === 'sent' && (
                                    <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-emerald)' }}>已发送</span>
                                )}
                                {c.whatsappStatus === 'failed' && (
                                    <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(244, 63, 94, 0.1)', color: 'var(--accent-rose)' }}>发送失败</span>
                                )}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                {c.jobTitle} &nbsp;|&nbsp; {c.company}
                            </div>
                        </div>
                    ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel: Operation Board */}
        <div className="bento-col-8">
          <div className="bezel-shell" style={{ height: 'calc(100vh - 160px)' }}>
            <div className="bezel-core" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflowY: 'auto', paddingBottom: '24px' }}>
                
                {!selectedCandidate ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'var(--text-tertiary)' }}>
                        <i className="ph-light ph-cursor-click" style={{ fontSize: '3rem', marginBottom: '16px' }}></i>
                        <p>请在左侧选择一位候选人进行配置</p>
                    </div>
                ) : (
                    <>
                        <div className="card-header-row">
                            <span className="card-heading" style={{ display: 'flex', alignItems: 'center' }}>
                                <i className="ph-light ph-user-circle" style={{ color: 'var(--accent-blue)', marginRight: '8px', fontSize: '1.25rem' }}></i>
                                为 {selectedCandidate.name} 配置任务
                            </span>
                        </div>

                        {/* Templates Row */}
                        <div style={{ marginTop: '24px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <label className="form-label" style={{ margin: 0 }}>套用消息模板</label>
                                <button className="btn-icon btn-sm" onClick={handleAddTemplate}>
                                    <i className="ph-light ph-plus"></i> 新增
                                </button>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px' }}>
                                {templates.map(tpl => (
                                    <div key={tpl.id} className="badge" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: '6px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => handleSelectTemplate(tpl)}>
                                        <span style={{ fontSize: '0.875rem' }}>{tpl.name}</span>
                                        <i className="ph-light ph-x" style={{ color: 'var(--text-tertiary)' }} onClick={(e) => handleDeleteTemplate(tpl.id, e)}></i>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Editor */}
                        <div className="form-group" style={{ flex: 1, display: 'flex', flexDirection: 'column', marginTop: '16px' }}>
                            <label className="form-label">消息内容</label>
                            <textarea 
                                className="form-input" 
                                style={{ flex: 1, minHeight: '200px', resize: 'none', background: selectedCandidate.whatsappStatus === 'scheduled' ? 'var(--bg-tertiary)' : '' }} 
                                value={messageContent}
                                onChange={e => setMessageContent(e.target.value)}
                                disabled={selectedCandidate.whatsappStatus === 'scheduled'}
                            />
                        </div>

                        {/* Footer Controls */}
                        {selectedCandidate.whatsappStatus === 'scheduled' ? (
                            <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(234, 179, 8, 0.05)', border: '1px solid rgba(234, 179, 8, 0.2)', borderRadius: 'var(--radius-lg)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div>
                                        <div style={{ color: 'var(--accent-amber)', fontWeight: 500, fontSize: '0.875rem', marginBottom: '4px' }}>
                                            <i className="ph-fill ph-check-circle" style={{ marginRight: '6px' }}></i>任务已锁定并交由云端排期
                                        </div>
                                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                                            发出账号: {selectedCandidate.whatsappBotRole} <br/>
                                            执行时间: {new Date(selectedCandidate.whatsappSendAt).toLocaleString()}
                                        </div>
                                    </div>
                                    <button className="btn btn-secondary" onClick={handleCancelSchedule}>取消该任务</button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ marginTop: '24px', padding: '16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)' }}>
                                <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                                    <div className="form-group" style={{ flex: 1 }}>
                                        <label className="form-label" style={{ fontSize: '0.75rem' }}>接收手机号</label>
                                        <input type="text" className="form-input" value={phone} onChange={e => setPhone(e.target.value)} />
                                    </div>
                                    <div className="form-group" style={{ flex: 1 }}>
                                        <label className="form-label" style={{ fontSize: '0.75rem' }}>
                                            选择发信账号 
                                            {connectedBots.filter(b => b.botId.startsWith(`${user.uid}___`)).length === 0 && <span style={{color: 'var(--accent-rose)', marginLeft: '8px'}}>您暂无绑定的账号</span>}
                                        </label>
                                        <select className="form-input" value={selectedBotId} onChange={e => setSelectedBotId(e.target.value)}>
                                            {connectedBots
                                                .filter(bot => bot.botId.startsWith(`${user.uid}___`))
                                                .map(bot => {
                                                    const displayName = bot.botId.split('___')[1] || bot.botId;
                                                    return (
                                                        <option key={bot.botId} value={bot.botId}>
                                                            {displayName} ({bot.status === 'connected' ? '在线' : '离线'})
                                                        </option>
                                                    );
                                                })
                                            }
                                        </select>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '16px' }}>
                                    <div className="form-group" style={{ flex: 1 }}>
                                        <label className="form-label" style={{ fontSize: '0.75rem' }}>设定发送日期</label>
                                        <input type="date" className="form-input" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} />
                                    </div>
                                    <div className="form-group" style={{ flex: 1 }}>
                                        <label className="form-label" style={{ fontSize: '0.75rem' }}>设定发送时间</label>
                                        <input type="time" className="form-input" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} />
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button className="btn btn-secondary" onClick={handleSendNow} disabled={isSending}>
                                            <i className="ph-light ph-paper-plane-right" style={{ marginRight: '6px' }}></i> 立即发送
                                        </button>
                                        <button className="btn btn-primary" onClick={handleSchedule} disabled={isSending}>
                                            <i className="ph-light ph-clock" style={{ marginRight: '6px' }}></i> 设为定时任务
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}

            </div>
          </div>
        </div>
      </div>

      {/* Bot Binding Modal */}
      {isBotModalOpen && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="bezel-shell" style={{ width: '400px', background: 'var(--bg-surface)' }}>
                  <div className="bezel-core" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <h3 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', justifyContent: 'space-between' }}>
                          绑定新 WhatsApp
                          <i className="ph-light ph-x" style={{ cursor: 'pointer' }} onClick={closeBotModal}></i>
                      </h3>
                      
                      {!qrStatus ? (
                          <>
                              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', margin: 0 }}>
                                  给这个账号起个容易辨识的名字（如: Alex专属号）
                              </p>
                              <input 
                                  className="form-input" 
                                  placeholder="例如：Alex_Personal" 
                                  value={newBotName}
                                  onChange={e => setNewBotName(e.target.value)}
                              />
                              <button className="btn btn-primary" onClick={startBotBinding} style={{ width: '100%' }}>
                                  生成登录二维码
                              </button>
                          </>
                      ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0' }}>
                              {qrStatus === 'connecting' && (
                                  <>
                                      <i className="ph-bold ph-spinner ph-spin" style={{ fontSize: '2rem', color: 'var(--accent-blue)', marginBottom: '16px' }}></i>
                                      <p>正在生成二维码，请稍候...</p>
                                  </>
                              )}
                              {qrStatus === 'qr' && activeQrCode && (
                                  <>
                                      <div style={{ padding: '16px', background: 'white', borderRadius: '8px', marginBottom: '16px' }}>
                                          <QRCodeSVG value={activeQrCode} size={200} />
                                      </div>
                                      <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                                          请打开手机 WhatsApp {'->'} 链接的设备 {'->'} 扫码
                                      </p>
                                  </>
                              )}
                              {qrStatus === 'connected' && (
                                  <>
                                      <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                                          <i className="ph-fill ph-check-circle" style={{ fontSize: '2rem', color: 'var(--accent-emerald)' }}></i>
                                      </div>
                                      <p style={{ fontWeight: 500 }}>账号绑定成功！</p>
                                  </>
                              )}
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {toastMessage && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: 'var(--surface-color)', border: '1px solid var(--border-color)', padding: '12px 24px', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', display: 'flex', alignItems: 'center', gap: '12px', zIndex: 9999, animation: 'slideUp 0.3s ease-out' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-emerald)' }}></div>
          <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>{toastMessage}</span>
        </div>
      )}
    </>
  );
}
