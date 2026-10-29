'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../../lib/auth-context';
import { useNotifications } from '../../../lib/notification-context';
import { useFeedback } from '../../../lib/feedback-context';
import { useI18n } from '../../../lib/i18n-context';
import { FirestoreStore } from '../../../lib/firestore-store';
import { Utils } from '../../../lib/utils';
import { SystemLogger } from '../../../lib/logger';
import CandidateDrawer from '../../../components/CandidateDrawer';
import CommissionDealModal from '../../../components/CommissionDealModal';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { DragDropContext, Draggable } from '@hello-pangea/dnd';
import { StrictModeDroppable } from '../../../components/StrictModeDroppable';
import ScrollContainer from 'react-indiana-drag-scroll';

export default function PipelinePage() {
  const { teamId, role, user, isOwner, isReadOnlyView } = useAuth();
  const { candidates, candidatesLoading: loading } = useNotifications();
  const { showToast } = useFeedback();
  const { t } = useI18n();
const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [focusInterview, setFocusInterview] = useState(false);
  const [isBrowser, setIsBrowser] = useState(false);

  // Commission Deal Modal States (Phase 6)
  const [dealCandidate, setDealCandidate] = useState(null);
  const [isDealModalOpen, setIsDealModalOpen] = useState(false);
  const [jobOrders, setJobOrders] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);

  useEffect(() => {
    if (!teamId) return;
    const unsubOrders = FirestoreStore.subscribeToJobOrders(teamId, role, user?.uid, (orders) => {
      setJobOrders(orders || []);
    });
    const usersRef = collection(db, 'users');
    const unsubUsers = onSnapshot(usersRef, (snap) => {
      const activeMembers = snap.docs
        .map(d => ({ ...d.data(), uid: d.id }))
        .filter(u => u.teamId === teamId && u.role && u.role !== 'pending' && u.role !== 'revoked');
      setTeamMembers(activeMembers);
    }, (err) => {
      console.warn("Could not fetch team members for commission split:", err);
    });
    return () => {
      unsubOrders();
      unsubUsers();
    };
  }, [teamId, role, user?.uid]);

  useEffect(() => {
    setIsBrowser(true);
  }, []);
const stages = [
    Utils.STAGES.screening,
    Utils.STAGES.phone,
    Utils.STAGES.interview,
    Utils.STAGES.offer,
    Utils.STAGES.onboarding
  ];

  const onDragEnd = async (result) => {
    if (isReadOnlyView) {
      showToast(t('pipeline.readOnlyTip', '当前为只读视察模式，无法修改其他团队的流转阶段'), 'warning');
      return;
    }
    const { destination, source, draggableId } = result;

    if (!destination) return;

    // 已在「面试考核」栏内再拖一次（看板不保存排序）：直接打开档案调整面试日期 / 时间
    if (destination.droppableId === 'interview' && source.droppableId === 'interview') {
      const candidate = candidates.find(c => c.id === draggableId);
      if (candidate) openInterviewScheduling(candidate);
      return;
    }

    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    if (destination.droppableId !== source.droppableId) {
      const candidateId = draggableId;
      const targetStageKey = destination.droppableId;
      
      const candidate = candidates.find(c => c.id === candidateId);
      if (!candidate) return;

      // Intercept transition to onboarding: open CommissionDealModal for Owner only!
      if (targetStageKey === 'onboarding' && isOwner) {
        setDealCandidate(candidate);
        setIsDealModalOpen(true);
        return;
      }

      const now = new Date().toISOString();
      const newHistory = [...(candidate.stageHistory || []), { stage: targetStageKey, movedAt: now }];

      // Removed local optimistic update because Firebase onSnapshot instantly updates the global CandidatesContext

      try {
        await FirestoreStore.updateCandidate(teamId, candidateId, {
          stage: targetStageKey,
          stageHistory: newHistory
        });

        const fromStageLabel = Utils.getStageMeta(candidate.stage || 'screening', t).label;
        const toStageLabel = Utils.getStageMeta(targetStageKey, t).label;
        SystemLogger.audit(teamId, user, 'UPDATE', 'CANDIDATE', candidate.name, {
          actionDetail: `看板拖拽流转阶段: ${fromStageLabel} -> ${toStageLabel}`,
          fromStage: candidate.stage || 'screening',
          toStage: targetStageKey
        });

        // 拖入「面试考核」后直接打开档案，进入编辑并定位到面试日期 / 时间
        if (targetStageKey === 'interview') {
          openInterviewScheduling({ ...candidate, stage: targetStageKey, stageHistory: newHistory });
        }
      } catch (error) {
        console.error('Failed to update stage:', error);
        showToast(t('pipeline.stageUpdateFailed', '状态更新失败，请重试: ') + error.message, 'error');
      }
    }
  };

  const openCandidate = (candidate) => {
    setSelectedCandidate(candidate);
    setFocusInterview(false);
    setIsDrawerOpen(true);
  };

  // 打开档案并直接进入编辑、定位到面试日期 / 时间
  function openInterviewScheduling(candidate) {
    setSelectedCandidate(candidate);
    setFocusInterview(true);
    setIsDrawerOpen(true);
  }

  // 成单入职确认并持久化佣金台账
  const handleConfirmDeal = async (dealData) => {
    if (!dealCandidate) return;
    const now = new Date().toISOString();
    const newHistory = [...(dealCandidate.stageHistory || []), { stage: 'onboarding', movedAt: now }];

    try {
      // 1. Update candidate stage to onboarding
      await FirestoreStore.updateCandidate(teamId, dealCandidate.id, {
        stage: 'onboarding',
        onboardDate: dealData.onboardDate,
        stageHistory: newHistory
      });

      // 2. Persist commission record
      await FirestoreStore.upsertCommissionRecord(teamId, user?.uid, dealData);

      // 3. Log audit
      SystemLogger.audit(teamId, user, 'UPDATE', 'CANDIDATE', dealCandidate.name, {
        actionDetail: `候选人正式入职成单，已生成保证期佣金台账 (金额: RM ${dealData.billingSnapshot?.totalCommissionPool || 0})`,
        fromStage: dealCandidate.stage || 'screening',
        toStage: 'onboarding'
      });

      showToast(t('commission.dealSuccessToast', `🎉 成单成功！已为 ${dealCandidate.name} 建立佣金台账并在保证期中追踪`), 'success');
    } catch (err) {
      console.error('Failed to complete deal:', err);
      showToast(t('commission.dealFailedToast', '成单处理失败，请重试: ') + (err.message || err), 'error');
    } finally {
      setDealCandidate(null);
      setIsDealModalOpen(false);
    }
  };

  // 仅推进至入职，跳过建立佣金单 (非提成场景)
  const handleSkipCommission = async () => {
    if (!dealCandidate) return;
    const now = new Date().toISOString();
    const newHistory = [...(dealCandidate.stageHistory || []), { stage: 'onboarding', movedAt: now }];

    try {
      await FirestoreStore.updateCandidate(teamId, dealCandidate.id, {
        stage: 'onboarding',
        stageHistory: newHistory
      });
      showToast(t('pipeline.movedToOnboarding', `已推进 ${dealCandidate.name} 至正式入职阶段`), 'info');
    } catch (err) {
      console.error('Failed to advance stage:', err);
      showToast(t('pipeline.stageUpdateFailed', '推进状态失败: ') + (err.message || err), 'error');
    } finally {
      setDealCandidate(null);
      setIsDealModalOpen(false);
    }
  };

  return (
    <>
      <div className="page-view active" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
        {isReadOnlyView && (
          <div style={{
            marginBottom: 'var(--space-3)',
            padding: '8px 16px',
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--accent-amber)',
            fontSize: 'var(--text-xs)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexShrink: 0
          }}>
            <i className="ph-bold ph-eye" style={{ fontSize: '14px' }}></i>
            <span>{t('pipeline.readOnlyBanner', '当前处于合作人团队只读视察模式，仅支持查看看板进度，禁止跨团队拖拽流转。')}</span>
          </div>
        )}
        
        {isBrowser && (
          <DragDropContext onDragEnd={onDragEnd}>
            <ScrollContainer 
              className="pipeline-board" 
              style={{ display: 'flex', gap: 'var(--space-4)', flex: 1, overflowX: 'auto', paddingBottom: 'var(--space-4)' }}
              ignoreElements=".kanban-card, .bezel-core"
            >
              
              {stages.map(stage => {
                const rawStageCandidates = candidates.filter(c => c.stage === stage.key && c.status !== 'rejected' && c.stage !== 'rejected');
                const seenIds = new Set();
                const stageCandidates = [];
                for (let i = 0; i < rawStageCandidates.length; i++) {
                  const c = rawStageCandidates[i];
                  const uniqueId = String(c.id || `cand_${stage.key}_${i}`);
                  if (!seenIds.has(uniqueId)) {
                    seenIds.add(uniqueId);
                    stageCandidates.push({ ...c, id: uniqueId });
                  }
                }
                
                return (
                  <div 
                    key={stage.key} 
                    className="pipeline-column bezel-shell"
                    style={{ minWidth: '320px', display: 'flex', flexDirection: 'column', padding: '0', background: 'var(--bezel-shell-bg, var(--bg-surface))' }}
                  >
                    <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border-hairline)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: stage.color, boxShadow: `0 0 8px ${stage.color}88` }}></div>
                        <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: '600', margin: 0 }}>
                          {Utils.getStageMeta(stage.key, t).label}
                        </h3>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '0.1rem 0.5rem', borderRadius: 'var(--radius-pill)' }}>
                        {stageCandidates.length}
                      </span>
                    </div>
                    
                    <StrictModeDroppable droppableId={stage.key}>
                      {(provided, snapshot) => (
                        <div 
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          style={{ 
                            padding: 'var(--space-4)', 
                            flex: 1, 
                            overflowY: 'auto', 
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: 'var(--space-3)',
                            background: snapshot.isDraggingOver ? 'rgba(255,255,255,0.03)' : 'transparent',
                            transition: 'background 0.2s ease',
                            minHeight: '150px'
                          }}
                        >
                          {stageCandidates.map((c, index) => (
                            <Draggable key={c.id} draggableId={c.id} index={index} isDragDisabled={isReadOnlyView}>
                              {(provided, snapshot) => {
                                const cardNode = (
                                  <div 
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    onClick={() => openCandidate(c)}
                                    className="kanban-card"
                                    style={{ 
                                      flexShrink: 0,
                                      minHeight: '76px',
                                      padding: 'var(--space-3) var(--space-4)', 
                                      background: snapshot.isDragging ? 'var(--bg-elevated)' : 'var(--card-bg)', 
                                      border: snapshot.isDragging ? '1px solid var(--accent-blue)' : '1px solid var(--border-hairline)',
                                      borderRadius: 'var(--radius-lg)',
                                      boxShadow: snapshot.isDragging ? '0 12px 32px rgba(0,0,0,0.35)' : 'var(--shadow-card)',
                                      transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.2s',
                                      ...provided.draggableProps.style,
                                      cursor: isReadOnlyView ? 'pointer' : (snapshot.isDragging ? 'grabbing' : 'grab')
                                    }}
                                  >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, marginRight: '8px' }}>
                                        <div style={{ 
                                          width: '26px', 
                                          height: '26px', 
                                          borderRadius: '50%', 
                                          background: 'rgba(59, 130, 246, 0.15)', 
                                          color: 'var(--accent-blue)', 
                                          display: 'flex', 
                                          alignItems: 'center', 
                                          justifyContent: 'center', 
                                          fontSize: '0.75rem', 
                                          fontWeight: '700',
                                          flexShrink: 0 
                                        }}>
                                          {c.name ? c.name.trim().charAt(0).toUpperCase() : '?'}
                                        </div>
                                        <span style={{ 
                                          fontWeight: '600', 
                                          fontSize: '0.9rem', 
                                          color: 'var(--text-primary)',
                                          lineHeight: 1.35,
                                          wordBreak: 'break-word'
                                        }}>
                                          {c.name}
                                        </span>
                                      </div>
                                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                                        {Utils.formatRelativeTime(c.updatedAt?.toDate ? c.updatedAt.toDate() : c.updatedAt, t)}
                                      </span>
                                    </div>
                                    
                                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap', marginTop: '4px' }}>
                                      <i className="ph ph-buildings" style={{ color: c.company ? 'var(--accent-blue)' : 'var(--text-muted)', fontSize: '12px' }}></i>
                                      <span style={{ color: c.company ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: c.company ? '600' : 'normal' }}>
                                        {c.company || t('pipeline.unspecifiedCompany', '未定企业')}
                                      </span>
                                      {c.position && (
                                        <>
                                          <span style={{ color: 'var(--border-interactive)' }}>·</span>
                                          <span style={{ color: 'var(--text-secondary)' }}>{c.position}</span>
                                        </>
                                      )}
                                    </div>

                                    {stage.key === 'interview' && (() => {
                                      const parsed = Utils.parseInterviewDateTime(c.interviewDate, c.interviewTime);
                                      const scheduled = /^\d{4}-\d{2}-\d{2}$/.test(parsed.dateStr);
                                      const label = scheduled
                                        ? `${parsed.dateStr}${(c.interviewTime || parsed.timeStr) ? ` ${c.interviewTime || parsed.timeStr}` : ''}`
                                        : t('pipeline.interviewNotScheduled', '未安排面试时间');
                                      return (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (isReadOnlyView) openCandidate(c);
                                            else openInterviewScheduling(c);
                                          }}
                                          title={t('pipeline.editInterviewTime', '点击调整面试日期 / 时间')}
                                          style={{
                                            marginTop: '8px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            padding: '3px 8px',
                                            fontSize: 'var(--text-xs)',
                                            fontWeight: 600,
                                            borderRadius: 'var(--radius-pill)',
                                            border: `1px solid ${scheduled ? 'rgba(59, 130, 246, 0.35)' : 'rgba(245, 158, 11, 0.4)'}`,
                                            background: scheduled ? 'rgba(59, 130, 246, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                                            color: scheduled ? 'var(--accent-blue)' : 'var(--accent-amber)',
                                            cursor: 'pointer'
                                          }}
                                        >
                                          <i className={scheduled ? 'ph-bold ph-calendar-check' : 'ph-bold ph-calendar-plus'}></i>
                                          <span>{label}</span>
                                          {!isReadOnlyView && <i className="ph ph-pencil-simple" style={{ opacity: 0.7 }}></i>}
                                        </button>
                                      );
                                    })()}

                                    {(c.school || c.department) && (
                                      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: '6px' }}>
                                        {c.department && (
                                          <span className="tag-pill" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', background: 'rgba(59, 130, 246, 0.08)', color: 'var(--accent-blue)' }}>
                                            {c.department}
                                          </span>
                                        )}
                                        {c.school && (
                                          <span className="tag-pill" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>
                                            {c.school}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );

                                if (snapshot.isDragging && typeof document !== 'undefined') {
                                  return createPortal(cardNode, document.body);
                                }
                                return cardNode;
                              }}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </StrictModeDroppable>
                  </div>
                );
              })}

            </ScrollContainer>
          </DragDropContext>
        )}

      </div>

      <CandidateDrawer
        isOpen={isDrawerOpen}
        onClose={() => { setIsDrawerOpen(false); setFocusInterview(false); }}
        candidate={selectedCandidate}
        focusInterview={focusInterview}
      />

      {/* Commission Deal Modal (Phase 6) */}
      <CommissionDealModal
        isOpen={isDealModalOpen}
        onClose={() => {
          setIsDealModalOpen(false);
          setDealCandidate(null);
        }}
        candidate={dealCandidate}
        teamId={teamId}
        currentUser={user}
        teamMembers={teamMembers}
        jobOrders={jobOrders}
        onConfirmDeal={handleConfirmDeal}
        onSkipCommission={handleSkipCommission}
      />
    </>
  );
}
