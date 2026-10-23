'use client';

import { useAuth } from '../../../lib/auth-context';
import { useFeedback } from '../../../lib/feedback-context';
import { useI18n } from '../../../lib/i18n-context';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { collection, doc, updateDoc, deleteDoc, setDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../lib/firebase';

export default function TeamPage() {
  const { 
    isOwner, 
    isManager, 
    userProfile, 
    teamId, 
    myTeamId, 
    linkedChildTeams, 
    switchActiveTeam,
    activeViewTeamId 
  } = useAuth();
  
  const { showToast, confirm } = useFeedback();
  const { t, lang } = useI18n();
  const isEn = lang === 'en';
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Filter for team members list
  const [teamFilter, setTeamFilter] = useState('all');

  // Mapping for assigning pending user to a team upon approval
  const [pendingTargetTeams, setPendingTargetTeams] = useState({});

  // Modal for creating a new partner team
  const [isCreatePartnerModalOpen, setIsCreatePartnerModalOpen] = useState(false);
  const [newPartnerName, setNewPartnerName] = useState('');
  const [newPartnerId, setNewPartnerId] = useState('');
  const [isSubmittingPartner, setIsSubmittingPartner] = useState(false);

  // Modal for editing existing member
  const [editingMember, setEditingMember] = useState(null);
  const [editForm, setEditForm] = useState({ displayName: '', role: 'recruiter', teamId: 'default_team', allowWfhPunch: false });
  const [isSavingMember, setIsSavingMember] = useState(false);

  // Lock background scrolling when any modal is open
  useEffect(() => {
    const isAnyModalOpen = Boolean(editingMember || isCreatePartnerModalOpen);
    if (isAnyModalOpen) {
      const originalBodyOverflow = document.body.style.overflow;
      const originalHtmlOverflow = document.documentElement.style.overflow;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalBodyOverflow;
        document.documentElement.style.overflow = originalHtmlOverflow;
      };
    }
  }, [editingMember, isCreatePartnerModalOpen]);

  useEffect(() => {
    setMounted(true);
    setLoading(true);
    const usersRef = collection(db, 'users');
    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      const allUsers = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      setUsers(allUsers);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching users:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleApprove = async (userId) => {
    // 只有本部 owner 可以选择分配团队；分部 owner / manager 只能批准进自己的团队
    const targetTeam = (isOwner && myTeamId === 'default_team')
      ? (pendingTargetTeams[userId] || 'default_team')
      : (myTeamId || 'default_team');

    const targetTeamName = targetTeam === 'default_team' 
      ? t('team.hqTeamOption', '公司本部 (默认)')
      : (linkedChildTeams.find(l => l.childTeamId === targetTeam)?.childTeamName || targetTeam);

    const confirmMsg = isOwner 
      ? `${t('team.confirmApprove', '确认批准该用户加入团队？')} \n(${t('team.assignTeamLabel', '分配至团队')}: ${targetTeamName})`
      : t('team.confirmApprove', '确认批准该用户加入团队？');

    const ok = await confirm(confirmMsg, {
      title: t('team.approveTitle', '批准加入团队'),
      confirmLabel: t('team.approveBtn', '确认批准')
    });
    if (!ok) return;
    try {
      await updateDoc(doc(db, 'users', userId), {
        role: 'recruiter',
        teamId: targetTeam
      });
      showToast(t('team.approveSuccess', '已成功批准加入团队'), 'success');
    } catch (e) {
      showToast(t('team.approveError', '批准失败: ') + e.message, 'error');
      console.error(e);
    }
  };

  const handleReject = async (userId) => {
    const ok = await confirm(t('team.confirmReject', '确认拒绝并删除该用户的申请吗？'), {
      title: t('team.rejectTitle', '拒绝申请确认'),
      danger: true,
      confirmLabel: t('team.rejectBtn', '确认拒绝')
    });
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'users', userId));
      showToast(t('team.rejectSuccess', '已拒绝该申请'), 'info');
    } catch (e) {
      showToast(t('team.rejectError', '拒绝失败: ') + e.message, 'error');
      console.error(e);
    }
  };

  const openEditMemberModal = (member) => {
    setEditingMember(member);
    setEditForm({
      displayName: member.displayName || '',
      role: member.role || 'recruiter',
      teamId: member.teamId || 'default_team',
      allowWfhPunch: member.allowWfhPunch !== undefined
        ? Boolean(member.allowWfhPunch)
        : (member.role === 'owner' || member.role === 'manager')
    });
  };

  const handleSaveMember = async (e) => {
    e.preventDefault();
    if (!editingMember) return;
    setIsSavingMember(true);
    try {
      let roleToSave = editForm.role;
      if (editingMember.id === userProfile?.uid && editingMember.role === 'owner') {
        roleToSave = 'owner';
      } else if (!isOwner) {
        roleToSave = editingMember.role || 'recruiter';
      }
      const teamIdToSave = !isOwner ? (editingMember.teamId || 'default_team') : editForm.teamId;

      await updateDoc(doc(db, 'users', editingMember.id), {
        displayName: editForm.displayName.trim(),
        role: roleToSave,
        teamId: teamIdToSave,
        allowWfhPunch: Boolean(editForm.allowWfhPunch)
      });
      showToast(t('team.memberUpdatedSuccess', '成员信息与权限已成功更新'), 'success');
      setEditingMember(null);
    } catch (err) {
      console.error(err);
      showToast(t('team.memberUpdateError', '更新失败: ') + err.message, 'error');
    } finally {
      setIsSavingMember(false);
    }
  };

  const handleCreatePartnerTeam = async (e) => {
    e.preventDefault();
    const cleanName = newPartnerName.trim();
    if (!cleanName) {
      showToast(t('team.partnerNamePlaceholder', '请输入合作人团队名称'), 'error');
      return;
    }

    setIsSubmittingPartner(true);
    try {
      const currentParent = myTeamId || 'default_team';
      const cleanSlug = (newPartnerId.trim() || `partner_${Date.now()}`)
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_');

      // 1. Create or update the team document
      await setDoc(doc(db, 'teams', cleanSlug), {
        id: cleanSlug,
        displayName: cleanName,
        teamType: 'partner',
        parentTeamId: currentParent,
        createdAt: serverTimestamp(),
      }, { merge: true });

      // 2. Create the uni-directional link doc
      const linkId = `${currentParent}_${cleanSlug}`;
      await setDoc(doc(db, 'team_links', linkId), {
        id: linkId,
        parentTeamId: currentParent,
        childTeamId: cleanSlug,
        childTeamName: cleanName,
        accessLevel: 'readonly',
        createdAt: serverTimestamp(),
        createdBy: userProfile?.uid || 'owner',
      });

      showToast(t('team.createPartnerSuccess', '合作人团队已成功创建并建立单向只读关联'), 'success');
      setIsCreatePartnerModalOpen(false);
      setNewPartnerName('');
      setNewPartnerId('');
    } catch (err) {
      console.error(err);
      showToast(t('team.createPartnerError', '创建合作人失败: ') + err.message, 'error');
    } finally {
      setIsSubmittingPartner(false);
    }
  };

  const handleDeletePartnerLink = async (link) => {
    const ok = await confirm(t('team.confirmDeletePartner', '确定要解除与该合作人团队的关联吗？本部将不再能够查看其数据，但该团队数据本身不会丢失。'), {
      title: t('team.deletePartnerTitle', '解除合作人关联确认'),
      danger: true,
      confirmLabel: t('common.confirm', '确认解除')
    });
    if (!ok) return;

    try {
      await deleteDoc(doc(db, 'team_links', link.id));
      if (activeViewTeamId === link.childTeamId) {
        switchActiveTeam(myTeamId);
      }
      showToast(t('team.deletePartnerSuccess', '已成功解除合作人关联'), 'info');
    } catch (err) {
      console.error(err);
      showToast(t('team.deletePartnerError', '解除关联失败: ') + err.message, 'error');
    }
  };

  // Filter approved members (Only Owner sees all cross-team members; non-owners only see their own team)
  const approvedUsers = users.filter(u => u.role !== 'pending');
  const pendingUsers = users.filter(u => u.role === 'pending');

  const visibleApprovedUsers = isOwner 
    ? approvedUsers 
    : approvedUsers.filter(u => (u.teamId || 'default_team') === (userProfile?.teamId || 'default_team'));

  const filteredMembers = visibleApprovedUsers.filter(u => {
    if (!isOwner || teamFilter === 'all') return true;
    return u.teamId === teamFilter;
  });

  return (
    <div className="page-view active">
      <div className="bezel-shell" style={{ maxWidth: '880px', margin: '0 auto' }}>
        <div className="bezel-core">
          
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)', margin: 0 }}>
                {t('team.title', '团队成员与权限')}
              </h3>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 'var(--space-1)' }}>
                {t('team.currentRole', '当前角色：')}
                {userProfile?.role === 'owner' 
                  ? t('team.roleOwner', '超级管理员 (Owner)') 
                  : userProfile?.role === 'manager' 
                    ? t('team.roleManager', '管理员 (Manager)') 
                    : t('team.roleRecruiter', '招聘专员 (Recruiter)')}
              </p>
            </div>

            {isOwner && (
              <button 
                className="btn btn-sm btn-primary"
                onClick={() => setIsCreatePartnerModalOpen(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <i className="ph-bold ph-handshake"></i>
                <span>{t('team.addPartnerBtn', '创建并关联合作人团队')}</span>
              </button>
            )}
          </div>

          {/* Pending Approvals */}
          {(isOwner || isManager) && pendingUsers.length > 0 && (
            <div style={{ marginBottom: 'var(--space-6)' }}>
              <h4 style={{ color: 'var(--accent-amber)', fontSize: 'var(--text-md)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="ph-light ph-clock-countdown"></i> {t('team.pendingApprovals', '待审核申请')} ({pendingUsers.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {pendingUsers.map(u => (
                  <div key={u.id} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    padding: 'var(--space-4)', 
                    background: 'rgba(245, 158, 11, 0.08)', 
                    borderRadius: 'var(--radius-lg)', 
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    boxShadow: 'var(--shadow-card)',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <div style={{ position: 'relative', width: '40px', height: '40px', flexShrink: 0 }}>
                        {u.photoURL && (
                          <img 
                            src={u.photoURL} 
                            alt={u.displayName || 'Avatar'} 
                            style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', position: 'relative', zIndex: 1 }}
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        )}
                        <div style={{ 
                          position: u.photoURL ? 'absolute' : 'relative',
                          top: 0, left: 0,
                          width: '40px', height: '40px', 
                          borderRadius: '50%', 
                          background: 'rgba(245, 158, 11, 0.2)', 
                          color: 'var(--accent-amber)', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          fontWeight: '700',
                          border: '1px solid rgba(245, 158, 11, 0.35)',
                          zIndex: 0
                        }}>
                          {(u.displayName || u.email || '?').charAt(0).toUpperCase()}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{u.displayName || t('team.unnamedUser', '未命名用户')}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>{u.email}</div>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      {/* Team Assignment Selector (Only visible to Owner if partner teams exist) */}
                      {isOwner && linkedChildTeams && linkedChildTeams.length > 0 && (
                        <select
                          value={pendingTargetTeams[u.id] || 'default_team'}
                          onChange={(e) => setPendingTargetTeams(prev => ({ ...prev, [u.id]: e.target.value }))}
                          style={{
                            background: 'var(--input-bg)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-interactive)',
                            padding: '5px 10px',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: 'var(--text-xs)',
                            outline: 'none',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="default_team">{t('team.hqTeamOption', '公司本部 (默认)')}</option>
                          {linkedChildTeams.map(l => (
                            <option key={l.id} value={l.childTeamId}>
                              {l.childTeamName}
                            </option>
                          ))}
                        </select>
                      )}

                      <button className="btn btn-sm" style={{ background: 'var(--accent-blue)', color: '#fff', border: 'none' }} onClick={() => handleApprove(u.id)}>
                        {t('team.approveAction', '批准')}
                      </button>
                      <button className="btn btn-sm btn-secondary" style={{ color: 'var(--accent-rose)' }} onClick={() => handleReject(u.id)}>
                        {t('team.rejectAction', '拒绝')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Linked Partner Teams Management Section (Visible to Owner) */}
          {isOwner && (
            <div style={{ marginBottom: 'var(--space-8)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                <div>
                  <h4 style={{ color: 'var(--text-primary)', fontSize: 'var(--text-md)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="ph-bold ph-handshake" style={{ color: 'var(--accent-amber)' }}></i>
                    <span>{t('team.partnersTitle', '关联合作人团队')}</span>
                  </h4>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {t('team.partnersDesc', '公司本部可单向实时穿透查看已关联合作人的候选人与招聘需求，合作人团队无法查看本部数据。')}
                  </p>
                </div>
              </div>

              {linkedChildTeams.length === 0 ? (
                <div style={{
                  padding: 'var(--space-5)',
                  background: 'var(--card-bg)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px dashed var(--border-interactive)',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: 'var(--text-sm)'
                }}>
                  <i className="ph-light ph-users-three" style={{ fontSize: '2rem', color: 'var(--text-muted)', marginBottom: '8px', display: 'block' }}></i>
                  {isEn ? 'No linked partner teams. Click the button above to add a partner company and establish one-way read-only access.' : '暂无关联的合作人团队。点击上方按钮可添加合作人公司并建立单向只读穿透通道。'}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--space-3)' }}>
                  {linkedChildTeams.map(link => {
                    const memberCount = users.filter(u => u.teamId === link.childTeamId).length;
                    const isCurrentlyViewing = activeViewTeamId === link.childTeamId;

                    return (
                      <div 
                        key={link.id}
                        style={{
                          padding: 'var(--space-4)',
                          background: isCurrentlyViewing ? 'rgba(245, 158, 11, 0.08)' : 'var(--card-bg)',
                          border: `1px solid ${isCurrentlyViewing ? 'rgba(245, 158, 11, 0.45)' : 'var(--border-interactive)'}`,
                          borderRadius: 'var(--radius-lg)',
                          boxShadow: 'var(--shadow-card)',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: '12px',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                            <div style={{ fontWeight: '700', fontSize: 'var(--text-md)', color: 'var(--text-primary)' }}>
                              {link.childTeamName}
                            </div>
                            <span className="badge" style={{
                              background: 'rgba(245, 158, 11, 0.15)',
                              color: 'var(--accent-amber)',
                              borderColor: 'transparent',
                              fontSize: '11px',
                              fontWeight: '600'
                            }}>
                              <i className="ph-bold ph-eye" style={{ marginRight: '3px' }}></i>
                              {t('team.readOnlyBadge', '单向只读')}
                            </span>
                          </div>

                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>ID: <code>{link.childTeamId}</code></span>
                            <span>•</span>
                            <span>{t('team.membersCount', '{count} 位成员').replace('{count}', memberCount)}</span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
                          <button
                            className="btn btn-sm"
                            onClick={() => switchActiveTeam(link.childTeamId)}
                            style={{
                              background: isCurrentlyViewing ? 'var(--accent-amber)' : 'var(--input-bg)',
                              color: isCurrentlyViewing ? '#000' : 'var(--text-primary)',
                              border: '1px solid var(--border-interactive)',
                              fontSize: '11px',
                              fontWeight: '600',
                              padding: '4px 10px'
                            }}
                          >
                            {isCurrentlyViewing ? (isEn ? 'Viewing Now' : '当前正在查看') : t('team.switchToView', '切换查看')}
                          </button>

                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => handleDeletePartnerLink(link)}
                            style={{ color: 'var(--accent-rose)', padding: '4px 8px' }}
                            title={t('team.deletePartnerTitle', '解除合作人关联')}
                          >
                            <i className="ph-light ph-trash"></i>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Existing Members Section */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: '8px' }}>
              <h4 style={{ color: 'var(--text-primary)', fontSize: 'var(--text-md)', margin: 0 }}>
                {t('team.membersTitle', '团队成员')} ({filteredMembers.length})
              </h4>

              {/* Team Filter Tabs (Only visible to Owner if partner teams exist) */}
              {isOwner && linkedChildTeams.length > 0 && (
                <div style={{ display: 'flex', gap: '4px', background: 'var(--input-bg)', padding: '3px', borderRadius: 'var(--radius-full)', border: '1px solid var(--border-interactive)' }}>
                  <button
                    onClick={() => setTeamFilter('all')}
                    style={{
                      border: 'none',
                      background: teamFilter === 'all' ? 'var(--accent-blue)' : 'transparent',
                      color: teamFilter === 'all' ? '#fff' : 'var(--text-muted)',
                      padding: '3px 10px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: '11px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    {isEn ? 'All' : '全部'} ({approvedUsers.length})
                  </button>
                  <button
                    onClick={() => setTeamFilter('default_team')}
                    style={{
                      border: 'none',
                      background: teamFilter === 'default_team' ? 'var(--accent-blue)' : 'transparent',
                      color: teamFilter === 'default_team' ? '#fff' : 'var(--text-muted)',
                      padding: '3px 10px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: '11px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    {isEn ? 'HQ Team' : '公司本部'} ({approvedUsers.filter(u => u.teamId === 'default_team').length})
                  </button>
                  {linkedChildTeams.map(l => (
                    <button
                      key={l.id}
                      onClick={() => setTeamFilter(l.childTeamId)}
                      style={{
                        border: 'none',
                        background: teamFilter === l.childTeamId ? 'var(--accent-amber)' : 'transparent',
                        color: teamFilter === l.childTeamId ? '#000' : 'var(--text-muted)',
                        padding: '3px 10px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: '11px',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      {l.childTeamName} ({approvedUsers.filter(u => u.teamId === l.childTeamId).length})
                    </button>
                  ))}
                </div>
              )}
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--text-muted)' }}>
                {t('common.loading', '加载中...')}
              </div>
            ) : filteredMembers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--text-muted)', background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)' }}>
                {isEn ? 'No members found under this filter' : '该筛选条件下暂无成员'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {filteredMembers.map(member => {
                  const isHqMember = !member.teamId || member.teamId === 'default_team';
                  const partnerInfo = linkedChildTeams.find(l => l.childTeamId === member.teamId);

                  return (
                    <div 
                      key={member.id} 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 'var(--space-4)', 
                        padding: 'var(--space-4)', 
                        background: 'var(--card-bg)', 
                        borderRadius: 'var(--radius-lg)', 
                        border: '1px solid var(--border-interactive)',
                        boxShadow: 'var(--shadow-card)',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{ position: 'relative', width: '42px', height: '42px', flexShrink: 0 }}>
                        {member.photoURL && (
                          <img 
                            src={member.photoURL} 
                            alt={member.displayName || 'Avatar'} 
                            style={{ width: '42px', height: '42px', borderRadius: '50%', objectFit: 'cover', position: 'relative', zIndex: 1 }}
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        )}
                        <div 
                          style={{ 
                            position: member.photoURL ? 'absolute' : 'relative',
                            top: 0, left: 0,
                            width: '42px', 
                            height: '42px', 
                            borderRadius: '50%', 
                            background: (isOwner && !isHqMember) 
                              ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.18) 0%, rgba(217, 119, 6, 0.18) 100%)'
                              : 'linear-gradient(135deg, rgba(59, 130, 246, 0.18) 0%, rgba(139, 92, 246, 0.18) 100%)',
                            color: (isOwner && !isHqMember) ? 'var(--accent-amber)' : 'var(--accent-blue)',
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            fontWeight: '700',
                            fontSize: '1rem',
                            border: `1px solid ${(isOwner && !isHqMember) ? 'rgba(245, 158, 11, 0.25)' : 'rgba(59, 130, 246, 0.25)'}`,
                            zIndex: 0
                          }}
                        >
                          {(member.displayName || member.email || '?').charAt(0).toUpperCase()}
                        </div>
                      </div>

                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: 'var(--text-md)' }}>
                            {member.displayName || t('team.unnamed', '未命名')} {member.id === userProfile?.uid && t('team.me', '(我)')}
                          </span>
                          
                          {/* Team Badge: Strictly visible ONLY to Owner */}
                          {isOwner && (
                            <span style={{
                              fontSize: '10px',
                              fontWeight: '600',
                              padding: '2px 7px',
                              borderRadius: 'var(--radius-sm)',
                              background: isHqMember ? 'rgba(59, 130, 246, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                              color: isHqMember ? 'var(--accent-blue)' : 'var(--accent-amber)',
                              border: `1px solid ${isHqMember ? 'rgba(59, 130, 246, 0.2)' : 'rgba(245, 158, 11, 0.2)'}`,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              <i className={isHqMember ? "ph-bold ph-buildings" : "ph-bold ph-handshake"} style={{ fontSize: '11px' }}></i>
                              <span>{isHqMember ? (isEn ? 'HQ' : '本部') : (partnerInfo?.childTeamName || member.teamId)}</span>
                            </span>
                          )}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginTop: '2px' }}>{member.email}</div>
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <span className="badge" style={{ 
                          color: member.role === 'owner' ? 'var(--accent-rose)' : member.role === 'manager' ? 'var(--accent-amber)' : 'var(--accent-blue)', 
                          background: member.role === 'owner' ? 'rgba(244,63,94,0.1)' : member.role === 'manager' ? 'rgba(245,158,11,0.1)' : 'rgba(59,130,246,0.1)',
                          borderColor: 'transparent',
                          fontWeight: '600'
                        }}>
                          {member.role === 'owner' ? 'Owner' : member.role === 'manager' ? 'Manager' : 'Recruiter'}
                        </span>

                        {/* WFH Permission Badge */}
                        {(member.allowWfhPunch !== undefined ? member.allowWfhPunch : (member.role === 'owner' || member.role === 'manager')) && (
                          <span className="badge" style={{
                            color: '#8b5cf6',
                            background: 'rgba(139, 92, 246, 0.12)',
                            borderColor: 'rgba(139, 92, 246, 0.25)',
                            fontWeight: '600',
                            fontSize: '11px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px'
                          }}>
                            <i className="ph-bold ph-house-line"></i>
                            <span>{t('team.wfhBadge', 'WFH 允许')}</span>
                          </span>
                        )}
                        
                        {(isOwner || (isManager && member.role === 'recruiter')) && (
                          <button 
                            className="btn btn-sm btn-secondary" 
                            style={{ padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '5px' }}
                            title={t('team.editMemberTitle', '编辑成员信息与权限')}
                            onClick={() => openEditMemberModal(member)}
                          >
                            <i className="ph-light ph-note-pencil" style={{ fontSize: '13px' }}></i>
                            <span>{t('team.editMemberBtn', '编辑')}</span>
                          </button>
                        )}

                        {isOwner && member.id !== userProfile?.uid && (
                          <button 
                            className="btn btn-sm btn-secondary" 
                            style={{ color: 'var(--accent-rose)', padding: '4px 8px' }}
                            title={t('team.removeMember', '移出团队')}
                            onClick={() => handleReject(member.id)}
                          >
                            <i className="ph-light ph-trash"></i>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Modal: Create & Link Partner Team (Mounted via Portal) */}
      {mounted && isCreatePartnerModalOpen && createPortal(
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsCreatePartnerModalOpen(false);
          }}
          onWheel={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem',
            overscrollBehavior: 'contain',
            touchAction: 'none'
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-interactive)',
              borderRadius: 'var(--radius-xl)',
              width: '100%',
              maxWidth: '520px',
              maxHeight: '90vh',
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              boxShadow: 'var(--shadow-2xl)'
            }}
          >
            <form onSubmit={handleCreatePartnerTeam}>
              <div style={{ padding: 'var(--space-6)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%',
                    background: 'rgba(245, 158, 11, 0.15)',
                    color: 'var(--accent-amber)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.2rem'
                  }}>
                    <i className="ph-bold ph-handshake"></i>
                  </div>
                  <div>
                    <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                      {t('team.createPartnerTitle', '创建并关联合作人团队')}
                    </h3>
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {isEn ? 'Once linked, HQ has one-way read-only view. Partner cannot view HQ data.' : '建立后本部享有单向只读查看权限，合作人无法查看本部数据'}
                    </p>
                  </div>
                </div>

                <button 
                  type="button" 
                  onClick={() => setIsCreatePartnerModalOpen(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}
                >
                  <i className="ph-bold ph-x"></i>
                </button>
              </div>

              <div style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                {/* Partner Name */}
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>
                    {t('team.partnerNameLabel', '合作人公司 / 团队名称')} *
                  </label>
                  <input
                    type="text"
                    required
                    value={newPartnerName}
                    onChange={(e) => {
                      setNewPartnerName(e.target.value);
                      if (!newPartnerId) {
                        setNewPartnerId(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '_'));
                      }
                    }}
                    placeholder={t('team.partnerNamePlaceholder', '例如：Sunrise Group (Johor), 亚太招聘合伙人')}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      background: 'var(--input-bg)',
                      border: '1px solid var(--border-interactive)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-primary)',
                      fontSize: 'var(--text-sm)',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Partner Slug / ID */}
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>
                    {t('team.partnerIdLabel', '团队唯一标识 (Team ID)')}
                  </label>
                  <input
                    type="text"
                    value={newPartnerId}
                    onChange={(e) => setNewPartnerId(e.target.value)}
                    placeholder="partner_johor_branch"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      background: 'var(--input-bg)',
                      border: '1px solid var(--border-interactive)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-primary)',
                      fontSize: 'var(--text-sm)',
                      fontFamily: 'monospace',
                      outline: 'none'
                    }}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                    {isEn ? 'Letters, numbers, and underscores, used as Firestore Team Collection ID.' : '字母数字及下划线，作为 Firestore 团队集合定位 ID。'}
                  </span>
                </div>

                {/* Security and Visibility Notice */}
                <div style={{
                  padding: 'var(--space-4)',
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-secondary)',
                  lineHeight: '1.6'
                }}>
                  <div style={{ fontWeight: '700', color: 'var(--accent-blue)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="ph-bold ph-shield-check"></i>
                    <span>{isEn ? 'Security & Data Isolation Assurance' : '安全与数据隔离保障'}</span>
                  </div>
                  <div>• <strong>{isEn ? 'HQ: ' : '公司本部：'}</strong>{isEn ? 'Can switch through top bar anytime to view partner candidates & job orders (one-way read-only).' : '可通过顶栏随时切换穿透查看该合作人的候选人名单与招聘订单（单向只读）。'}</div>
                  <div>• <strong>{isEn ? 'Partner Members: ' : '合作人成员：'}</strong>{isEn ? 'Can only see their own candidates & orders; database rules strictly forbid reading HQ private data.' : '仅能看到其自身录入的候选人与订单，在数据库底层（Firestore Rules）绝无权限读取本部任何私密数据。'}</div>
                </div>
              </div>

              <div style={{ padding: 'var(--space-4) var(--space-6)', background: 'var(--bg-void)', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsCreatePartnerModalOpen(false)}
                  disabled={isSubmittingPartner}
                >
                  {t('common.cancel', '取消')}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmittingPartner}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {isSubmittingPartner && <i className="ph-bold ph-spinner ph-spin"></i>}
                  <span>{t('common.confirm', '确认创建并关联')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Modal: Edit Member & Permissions (Mounted via Portal, strictly no emojis) */}
      {mounted && editingMember && createPortal(
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingMember(null);
          }}
          onWheel={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem',
            overscrollBehavior: 'contain',
            touchAction: 'none'
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-interactive)',
              borderRadius: 'var(--radius-xl)',
              width: '100%',
              maxWidth: '500px',
              maxHeight: '90vh',
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              boxShadow: 'var(--shadow-2xl)'
            }}
          >
            <form onSubmit={handleSaveMember}>
              <div style={{ padding: 'var(--space-6)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%',
                    background: 'rgba(59, 130, 246, 0.15)',
                    color: 'var(--accent-blue)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.2rem'
                  }}>
                    <i className="ph-bold ph-user-gear"></i>
                  </div>
                  <div>
                    <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                      {t('team.editMemberTitle', '编辑成员信息与权限')}
                    </h3>
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {t('team.editMemberDesc', '调整该成员的显示姓名、归属团队与角色权限')}
                    </p>
                  </div>
                </div>

                <button 
                  type="button" 
                  onClick={() => setEditingMember(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}
                >
                  <i className="ph-bold ph-x"></i>
                </button>
              </div>

              <div style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                {/* Email (Readonly) */}
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>
                    {t('team.memberEmailLabel', '登录账号 / 邮箱')}
                  </label>
                  <input
                    type="text"
                    disabled
                    value={editingMember.email || ''}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      background: 'var(--input-bg)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-muted)',
                      fontSize: 'var(--text-sm)',
                      cursor: 'not-allowed'
                    }}
                  />
                </div>

                {/* Display Name */}
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>
                    {t('team.memberNameLabel', '显示姓名')} *
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.displayName}
                    onChange={(e) => setEditForm(prev => ({ ...prev, displayName: e.target.value }))}
                    placeholder={isEn ? "Alex Lee / Recruiter" : "张顾问 / Alex Lee"}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      background: 'var(--input-bg)',
                      border: '1px solid var(--border-interactive)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-primary)',
                      fontSize: 'var(--text-sm)',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Assigned Team */}
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>
                    {t('team.memberTeamLabel', '归属团队')} *
                  </label>
                  <select
                    value={editForm.teamId}
                    disabled={!isOwner}
                    onChange={(e) => setEditForm(prev => ({ ...prev, teamId: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      background: 'var(--input-bg)',
                      border: '1px solid var(--border-interactive)',
                      borderRadius: 'var(--radius-md)',
                      color: !isOwner ? 'var(--text-muted)' : 'var(--text-primary)',
                      fontSize: 'var(--text-sm)',
                      outline: 'none',
                      cursor: !isOwner ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <option value="default_team">{isEn ? "HQ Team" : "公司本部 (HQ)"}</option>
                    {linkedChildTeams.map(l => (
                      <option key={l.id} value={l.childTeamId}>
                        {l.childTeamName} {isEn ? "(Partner)" : "(合作人)"}
                      </option>
                    ))}
                  </select>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                    {!isOwner
                      ? (isEn ? 'Only Owner can reassign member teams.' : '仅 Owner 可调配成员归属团队。')
                      : (isEn ? 'After reassignment, this member can only access the selected team data. Isolation rules take effect immediately.' : '调配团队后，该成员将仅能查看所选团队的数据，隔离规则立即生效。')}
                  </span>
                </div>

                {/* Role */}
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}>
                    {t('team.memberRoleLabel', '角色权限')} *
                  </label>
                  <select
                    value={editForm.role}
                    disabled={!isOwner || editingMember.id === userProfile?.uid}
                    onChange={(e) => setEditForm(prev => ({ ...prev, role: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      background: 'var(--input-bg)',
                      border: '1px solid var(--border-interactive)',
                      borderRadius: 'var(--radius-md)',
                      color: (!isOwner || editingMember.id === userProfile?.uid) ? 'var(--text-muted)' : 'var(--text-primary)',
                      fontSize: 'var(--text-sm)',
                      outline: 'none',
                      cursor: (!isOwner || editingMember.id === userProfile?.uid) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <option value="owner">{t('team.ownerOpt', 'Owner (所有者)')}</option>
                    <option value="manager">{t('team.managerOpt', 'Manager (管理员)')}</option>
                    <option value="recruiter">{t('team.recruiterOpt', 'Recruiter (招聘员)')}</option>
                  </select>
                  {editingMember.id === userProfile?.uid && (
                    <span style={{ fontSize: '11px', color: 'var(--accent-amber)', marginTop: '4px', display: 'block' }}>
                      {isEn ? 'Cannot modify your own Owner role to prevent accidental lockout.' : '为防止误操作失去系统管理权限，不可修改自身账号的 Owner 角色。'}
                    </span>
                  )}
                  {!isOwner && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                      {isEn ? 'Only Owner can change member roles.' : '仅 Owner 可变更成员系统角色。'}
                    </span>
                  )}
                </div>

                {/* WFH Check-in Permission Toggle */}
                <div style={{
                  padding: '12px 14px',
                  background: 'rgba(139, 92, 246, 0.06)',
                  border: '1px solid rgba(139, 92, 246, 0.2)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <i className="ph-bold ph-house-line" style={{ color: '#8b5cf6', fontSize: '18px' }}></i>
                      <div>
                        <div style={{ fontSize: 'var(--text-sm)', fontWeight: '600', color: 'var(--text-primary)' }}>
                          {t('team.wfhPermissionLabel', '允许居家办公 (WFH) 打卡')}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {t('team.wfhPermissionDesc', '开启后该员工在打卡时将呈现「WFH」通道，无需连接办公室网络即可签到；关闭后仅能使用办公室打卡。')}
                        </div>
                      </div>
                    </div>
                    <label style={{ position: 'relative', display: 'inline-block', width: '38px', height: '22px', flexShrink: 0, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(editForm.allowWfhPunch)}
                        onChange={(e) => setEditForm(prev => ({ ...prev, allowWfhPunch: e.target.checked }))}
                        style={{ opacity: 0, width: 0, height: 0 }}
                      />
                      <span style={{
                        position: 'absolute',
                        top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: editForm.allowWfhPunch ? '#8b5cf6' : 'var(--border-subtle)',
                        transition: '.3s',
                        borderRadius: '22px'
                      }}>
                        <span style={{
                          position: 'absolute', content: '""', height: '16px', width: '16px', left: editForm.allowWfhPunch ? '19px' : '3px', bottom: '3px',
                          backgroundColor: 'white',
                          transition: '.3s',
                          borderRadius: '50%'
                        }} />
                      </span>
                    </label>
                  </div>
                </div>

                {/* Information Notice (Strictly no emojis) */}
                <div style={{
                  padding: 'var(--space-3) var(--space-4)',
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px'
                }}>
                  <i className="ph-bold ph-shield-check" style={{ color: 'var(--accent-blue)', fontSize: '16px', marginTop: '2px', flexShrink: 0 }}></i>
                  <div>
                    {isEn ? 'Member team assignment and role permissions are physically enforced by database security rules. Changes take effect on next session.' : '团队成员归属与角色权限由数据库安全规则物理隔离，保存后该成员的下一次会话及数据订阅将立即重定向至新团队。'}
                  </div>
                </div>
              </div>

              <div style={{ padding: 'var(--space-4) var(--space-6)', background: 'var(--bg-void)', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingMember(null)}
                  disabled={isSavingMember}
                >
                  {t('common.cancel', '取消')}
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSavingMember}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {isSavingMember && <i className="ph-bold ph-spinner ph-spin"></i>}
                  <span>{t('common.save', '保存更改')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
