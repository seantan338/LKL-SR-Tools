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
import { DragDropContext, Draggable } from '@hello-pangea/dnd';
import { StrictModeDroppable } from '../../../components/StrictModeDroppable';
import ScrollContainer from 'react-indiana-drag-scroll';

export default function PipelinePage() {
  const { teamId, role, user, isReadOnlyView } = useAuth();
  const { candidates, candidatesLoading: loading } = useNotifications();
  const { showToast } = useFeedback();
  const { t } = useI18n();
const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isBrowser, setIsBrowser] = useState(false);

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
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    if (destination.droppableId !== source.droppableId) {
      const candidateId = draggableId;
      const targetStageKey = destination.droppableId;
      
      const candidate = candidates.find(c => c.id === candidateId);
      if (!candidate) return;

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
      } catch (error) {
        console.error('Failed to update stage:', error);
        showToast(t('pipeline.stageUpdateFailed', '状态更新失败，请重试: ') + error.message, 'error');
      }
    }
  };

  const openCandidate = (candidate) => {
    setSelectedCandidate(candidate);
    setIsDrawerOpen(true);
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
        onClose={() => setIsDrawerOpen(false)} 
        candidate={selectedCandidate} 
      />
    </>
  );
}
