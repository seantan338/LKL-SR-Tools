'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useAuth } from '../../../lib/auth-context';
import { useNotifications } from '../../../lib/notification-context';
import { useFeedback } from '../../../lib/feedback-context';
import { useI18n } from '../../../lib/i18n-context';
import { FirestoreStore } from '../../../lib/firestore-store';
import { SystemLogger } from '../../../lib/logger';
import { Utils } from '../../../lib/utils';
import CandidateDrawer from '../../../components/CandidateDrawer';
import CvImportModal from '../../../components/CvImportModal';
import WhatsAppButton from '../../../components/WhatsAppButton';
import { useCandidatesViewPrefs } from '../../../lib/candidates-view-prefs';
import {
  NONE,
  STAGE_ORDER,
  buildCandidateFilterOptions,
  defaultCandidateSortDir,
  effectiveStageKey,
  groupCandidates,
  matchesCandidateFilter,
  sortCandidates
} from '../../../lib/candidate-view.mjs';

/**
 * 智能融合多份候选人档案 (Data Fusion Algorithm)
 */
function fuseCandidateRecords(master, secondaries, currentUser) {
  if (!master) return null;
  const allRecords = [master, ...(secondaries || [])];
  const now = new Date();
  const nowStr = now.toISOString().slice(0, 16).replace('T', ' ');

  // 1. 字段互补：优先主档案，若为空/无效则从副档案按序补齐
  const pickField = (key, invalidVals = ['未留电话', '未指定企业', '未指定岗位', '待定职位']) => {
    const val = master[key];
    if (val !== undefined && val !== null && String(val).trim() !== '' && !invalidVals.includes(String(val).trim())) {
      return val;
    }
    for (const s of (secondaries || [])) {
      const sVal = s[key];
      if (sVal !== undefined && sVal !== null && String(sVal).trim() !== '' && !invalidVals.includes(String(sVal).trim())) {
        return sVal;
      }
    }
    return master[key] || '';
  };

  const name = pickField('name') || master.name;
  const phone = pickField('phone');
  const email = pickField('email');
  const location = pickField('location');
  const school = pickField('school');
  const major = pickField('major');
  const degree = pickField('degree');
  const qualification = pickField('qualification') || degree;
  const age = pickField('age');
  const gender = pickField('gender') || 'Male';
  const nationality = pickField('nationality') || 'Malaysian';
  const race = pickField('race') || 'Chinese';
  const maritalStatus = pickField('maritalStatus') || 'Single';
  const lastDrawnSalary = pickField('lastDrawnSalary');
  const expectedSalary = pickField('expectedSalary');
  const salary = expectedSalary || lastDrawnSalary || pickField('salary');
  const offered = pickField('offered') || expectedSalary || '';
  const availability = pickField('availability') || 'Immediate';
  const experience = pickField('experience');
  const remarks = pickField('remarks') || pickField('rawStatus');

  // 意向企业与应聘职位：如果主档案未指定，从副档案优先提取有实际企业/职位的
  let company = master.company;
  if (!company || !company.trim() || company === '未指定企业') {
    const secWithComp = (secondaries || []).find(s => s.company && s.company.trim() && s.company !== '未指定企业');
    if (secWithComp) company = secWithComp.company;
  }
  let position = master.position;
  if (!position || !position.trim() || position === '未指定岗位' || position === '待定职位') {
    const secWithPos = (secondaries || []).find(s => s.position && s.position.trim() && s.position !== '未指定岗位' && s.position !== '待定职位');
    if (secWithPos) position = secWithPos.position;
  }

  // 2. 标签与技能去重合并
  const allTags = new Set(master.tags || []);
  (secondaries || []).forEach(s => (s.tags || []).forEach(t => allTags.add(t)));
  const tags = Array.from(allTags);

  const allSkills = new Set(Array.isArray(master.skills) ? master.skills : (master.skills ? String(master.skills).split(/[,，、]+/) : []));
  (secondaries || []).forEach(s => {
    const sList = Array.isArray(s.skills) ? s.skills : (s.skills ? String(s.skills).split(/[,，、]+/) : []);
    sList.forEach(k => allSkills.add(k.trim()));
  });
  const skills = Array.from(allSkills).filter(Boolean);

  // 3. 语言合并
  const allLanguages = new Set(Array.isArray(master.languages) ? master.languages : []);
  (secondaries || []).forEach(s => (Array.isArray(s.languages) ? s.languages : []).forEach(l => allLanguages.add(l)));
  const languages = Array.from(allLanguages);

  // 4. 工作经历合并与去重 (按公司+职位归一化去重)
  const masterWork = Array.isArray(master.workExperience) ? master.workExperience : [];
  const combinedWork = [...masterWork];
  const seenWorkKey = new Set(masterWork.map(w => `${(w.company||'').toLowerCase().trim()}::${(w.position||'').toLowerCase().trim()}`));
  (secondaries || []).forEach(s => {
    (Array.isArray(s.workExperience) ? s.workExperience : []).forEach(w => {
      const k = `${(w.company||'').toLowerCase().trim()}::${(w.position||'').toLowerCase().trim()}`;
      if (!seenWorkKey.has(k) && (w.company || w.position)) {
        seenWorkKey.add(k);
        combinedWork.push(w);
      }
    });
  });

  // 5. 历史沟通备注与重投记录聚合
  const notesList = [];
  allRecords.forEach((r) => {
    if (r.notes && String(r.notes).trim()) {
      const isM = r.id === master.id;
      const tag = isM ? '主档案原备注' : `副档案备注 (${r.company || '未指定企业'})`;
      notesList.push(`--- ${tag} ---\n${String(r.notes).trim()}`);
    }
  });

  const secSummary = (secondaries || []).map(s => `${s.company || '未指定企业'}${s.phone ? `(${s.phone})` : ''}`).join(', ');
  const auditNote = `[${nowStr}] 顾问 @${currentUser?.displayName || currentUser?.email || 'HR'} 手动合并了 ${(secondaries || []).length} 份档案 (吸收副档案: ${secSummary})`;
  notesList.push(auditNote);
  const notes = notesList.join('\n\n');

  // 6. 提醒 Reminders 合并
  const masterReminders = Array.isArray(master.reminders) ? master.reminders : [];
  const reminderIds = new Set(masterReminders.map(r => r.id));
  const combinedReminders = [...masterReminders];
  (secondaries || []).forEach(s => {
    (Array.isArray(s.reminders) ? s.reminders : []).forEach(r => {
      if (!reminderIds.has(r.id)) {
        reminderIds.add(r.id);
        combinedReminders.push(r);
      }
    });
  });

  return {
    ...master,
    name,
    phone: phone || '',
    email: email || '',
    location: location || '',
    company: company || '',
    position: position || '待定',
    school: school || '',
    major: major || '',
    degree: degree || '',
    qualification: qualification || '',
    age: age || '',
    gender,
    nationality,
    race,
    maritalStatus,
    lastDrawnSalary: lastDrawnSalary || '',
    expectedSalary: expectedSalary || '',
    salary: salary || '',
    offered: offered || '',
    availability,
    experience: experience || '',
    remarks: remarks || '',
    tags,
    skills,
    languages,
    workExperience: combinedWork,
    notes,
    reminders: combinedReminders,
    mergedAt: now.toISOString(),
    mergedFromCount: allRecords.length
  };
}

/**
 * 提取候选人列表轻量 Remark 摘要（优先显示显式 remarks/rawStatus，若为空则回退提取 notes 首行摘要）
 */
function getCandidateRemarkDisplay(c) {
  if (!c) return { shortText: '', fullText: '', isPrimary: false };
  const primaryRemark = String(c.remarks || c.rawStatus || '').trim();
  const normalizedNotes = Utils.normalizeCandidateNotes(c.notes);

  if (primaryRemark) {
    const firstLine = primaryRemark.split(/\r?\n/).map(s => s.trim()).filter(Boolean)[0] || primaryRemark;
    const fullText = normalizedNotes ? `${primaryRemark}\n\n${normalizedNotes}` : primaryRemark;
    return { shortText: firstLine, fullText, isPrimary: true };
  }

  if (normalizedNotes) {
    const lines = normalizedNotes
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean)
      .filter(line => !/^---.*---$/.test(line));
    const firstLine = lines[0] || normalizedNotes;
    return { shortText: firstLine, fullText: normalizedNotes, isPrimary: false };
  }

  if (c.status === 'rejected' && c.rejectNote) {
    const rejText = String(c.rejectNote).trim();
    if (rejText) {
      return { shortText: rejText, fullText: rejText, isPrimary: true };
    }
  }

  return { shortText: '', fullText: '', isPrimary: false };
}

const CANDIDATE_COLUMN_DEFS = [
  { key: 'name', labelKey: 'candidates.colCandidate', defaultLabel: '候选人姓名与档案', required: true },
  { key: 'companyPosition', labelKey: 'candidates.colCompanyPosition', defaultLabel: '意向企业 / 应聘岗位' },
  { key: 'stage', labelKey: 'candidates.colStage', defaultLabel: '当前阶段' },
  { key: 'remarks', labelKey: 'candidates.colRemarks', defaultLabel: '备注 (Remarks)' },
  { key: 'updatedAt', labelKey: 'candidates.colUpdatedAt', defaultLabel: '导入 / 更新时间' },
];

const STORAGE_KEY_CANDIDATE_COLUMNS = 'talent_flow_candidates_visible_columns';
const DEFAULT_VISIBLE_COLUMNS = {
  companyPosition: true,
  stage: true,
  remarks: true,
  updatedAt: false
};

export default function CandidatesPage() {
  const router = useRouter();
  const { teamId, role, user, isReadOnlyView } = useAuth();
  const { candidates, candidatesLoading: loading } = useNotifications();
  const { confirm } = useFeedback();
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [picFilter, setPicFilter] = useState('all');
  const [viewPrefs, updateViewPrefs] = useCandidatesViewPrefs();
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [mounted, setMounted] = useState(false);
  
  // Visible Columns state
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_VISIBLE_COLUMNS);
  const [isColumnChooserOpen, setIsColumnChooserOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CANDIDATE_COLUMNS);
      if (saved) {
        const parsed = JSON.parse(saved);
        setVisibleColumns(prev => ({ ...prev, ...parsed }));
      }
    } catch (e) {
      // ignore
    }
  }, []);

  const toggleColumn = (key) => {
    setVisibleColumns(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(STORAGE_KEY_CANDIDATE_COLUMNS, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };
  
  // Selection & Batch Action States
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isBatchCompanyModalOpen, setIsBatchCompanyModalOpen] = useState(false);
  const [batchCompanyName, setBatchCompanyName] = useState('');
  const [isBatchUpdating, setIsBatchUpdating] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Merge Candidates States
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [masterCandidateId, setMasterCandidateId] = useState(null);
  const [isMerging, setIsMerging] = useState(false);

  // Drawer state
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCvModalOpen, setIsCvModalOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };
  // Derived list of all distinct companies currently in candidate records
  const existingCompanies = Array.from(
    new Set(candidates.map(c => (c.company || '').trim()).filter(Boolean))
  ).sort();

  const companyOptions = buildCandidateFilterOptions(candidates, 'company');
  const picOptions = buildCandidateFilterOptions(candidates, 'pic');

  const filteredCandidates = sortCandidates(
    candidates.filter(c => {
      if (stageFilter === 'active') {
        if (c.status === 'rejected') return false;
      } else if (stageFilter === 'rejected') {
        if (c.status !== 'rejected') return false;
      } else if (stageFilter !== 'all') {
        if (c.status === 'rejected') return false;
        if (c.stage !== stageFilter) return false;
      }

      if (!matchesCandidateFilter(c, 'company', companyFilter)) return false;
      if (!matchesCandidateFilter(c, 'pic', picFilter)) return false;

      if (searchQuery) {
        const tokens = searchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);
        const matchText = [
          c.name, c.company, c.position, c.department, c.school, c.degree,
          c.phone, c.location, c.icNo, c.picName, c.remarks, c.notes,
          c.rejectReason, c.rejectNote
        ].filter(Boolean).join(' ').toLowerCase();
        if (!tokens.every(tk => matchText.includes(tk))) return false;
      }

      return true;
    }),
    viewPrefs.sortKey,
    viewPrefs.sortDir
  );

  const candidateGroups = viewPrefs.view === 'grouped'
    ? groupCandidates(filteredCandidates, viewPrefs.groupBy)
    : [];

  const hasActiveFilters = Boolean(
    stageFilter !== 'all' ||
    companyFilter !== 'all' ||
    picFilter !== 'all' ||
    searchQuery.trim()
  );

  const clearFilters = () => {
    setSearchQuery('');
    setStageFilter('all');
    setCompanyFilter('all');
    setPicFilter('all');
  };

  const handleColumnSort = (key) => {
    updateViewPrefs(
      viewPrefs.sortKey === key
        ? { sortDir: viewPrefs.sortDir === 'asc' ? 'desc' : 'asc' }
        : { sortKey: key, sortDir: defaultCandidateSortDir(key) }
    );
  };

  const toggleGroupCollapse = (groupKey) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }));
  };

  const setAllGroupsCollapsed = (isCollapsed) => {
    const next = {};
    candidateGroups.forEach(g => {
      next[g.key] = isCollapsed;
    });
    setCollapsedGroups(next);
  };

  const openCandidate = (candidate) => {
    setSelectedCandidate(candidate);
    setIsDrawerOpen(true);
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
    setTimeout(() => setSelectedCandidate(null), 300); // Wait for transition
  };

  // Row selection helpers
  const isAllSelected = filteredCandidates.length > 0 && filteredCandidates.every(c => selectedIds.has(c.id));
  
  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      const newSet = new Set(selectedIds);
      filteredCandidates.forEach(c => newSet.add(c.id));
      setSelectedIds(newSet);
    }
  };

  const handleToggleSelectRow = (id, e) => {
    e.stopPropagation();
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  // Batch Company Update
  const handleExecuteBatchCompany = async () => {
    if (isReadOnlyView) return;
    const comp = batchCompanyName.trim();
    if (!comp) {
      showToast(t('candidates.batchPromptEmpty', '请输入或选择意向企业名称'));
      return;
    }
    if (selectedIds.size === 0) return;

    setIsBatchUpdating(true);
    try {
      const targetIds = Array.from(selectedIds);
      for (const cid of targetIds) {
        await FirestoreStore.updateCandidate(teamId, cid, {
          company: comp,
          companySource: 'manual'
        });
      }
      SystemLogger.audit(teamId, user, 'BATCH_UPDATE', 'CANDIDATE', `${targetIds.length}位候选人批量设置企业为: ${comp}`);
      showToast(t('candidates.batchSuccess', { count: targetIds.length, company: comp }, `已成功为 ${targetIds.length} 位候选人设置意向企业为 "${comp}"！`));
      setIsBatchCompanyModalOpen(false);
      setBatchCompanyName('');
      setSelectedIds(new Set());
    } catch (err) {
      console.error(err);
      showToast(t('candidates.batchFailed', '批量更新失败: ') + err.message);
    } finally {
      setIsBatchUpdating(false);
    }
  };

  // Merge Candidates Handlers & Computed Data
  const selectedCandidatesList = candidates.filter(c => selectedIds.has(c.id));
  const currentMasterCandidate = selectedCandidatesList.find(c => c.id === masterCandidateId) || selectedCandidatesList[0];
  const currentSecondaryCandidates = selectedCandidatesList.filter(c => c.id !== currentMasterCandidate?.id);
  const fusedCandidatePreview = currentMasterCandidate ? fuseCandidateRecords(currentMasterCandidate, currentSecondaryCandidates, user) : null;

  const handleOpenMergeModal = () => {
    if (isReadOnlyView) return;
    const list = candidates.filter(c => selectedIds.has(c.id));
    if (list.length < 2) return;

    // 智能推断主档案：优先选取有真实电话、有明确企业、最近更新的记录
    const sorted = [...list].sort((a, b) => {
      const aScore = (a.phone && a.phone !== '未留电话' ? 10 : 0) + (a.company && a.company !== '未指定企业' ? 5 : 0) + (a.email ? 3 : 0);
      const bScore = (b.phone && b.phone !== '未留电话' ? 10 : 0) + (b.company && b.company !== '未指定企业' ? 5 : 0) + (b.email ? 3 : 0);
      return bScore - aScore;
    });

    setMasterCandidateId(sorted[0]?.id || list[0]?.id);
    setIsMergeModalOpen(true);
  };

  const handleExecuteMerge = async () => {
    if (isReadOnlyView || !masterCandidateId) return;
    const list = candidates.filter(c => selectedIds.has(c.id));
    const master = list.find(c => c.id === masterCandidateId);
    const secondaries = list.filter(c => c.id !== masterCandidateId);

    if (!master || secondaries.length === 0) return;

    setIsMerging(true);
    try {
      const fusedData = fuseCandidateRecords(master, secondaries, user);
      const secondaryIds = secondaries.map(s => s.id);

      await FirestoreStore.mergeCandidates(teamId, user.uid, master.id, secondaryIds, fusedData);

      SystemLogger.audit(teamId, user, 'MERGE', 'CANDIDATE', master.name, {
        actionDetail: `手动合并了 ${secondaries.length} 份副档案至主档案 ${master.name}`,
        mergedTotal: list.length
      });

      showToast(t('candidates.mergeSuccess', { count: list.length }, `🎉 成功将 ${list.length} 份候选人档案合并为 1 份完整主档案！`));
      setIsMergeModalOpen(false);
      setMasterCandidateId(null);
      setSelectedIds(new Set());
    } catch (err) {
      console.error("Merge error:", err);
      showToast(t('candidates.mergeFailed', '合并失败: ') + err.message);
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <>
      <div className="page-view active">
        {/* Toast Notification */}
        {toastMessage && mounted && typeof document !== 'undefined' && createPortal(
          <div style={{
            position: 'fixed', top: '24px', left: '50%', transform: 'translateX(-50%)',
            background: 'var(--bg-elevated)', color: '#ffffff',
            padding: '10px 20px', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--accent-blue)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)', zIndex: 10001,
            display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem'
          }}>
            <i className="ph-fill ph-info" style={{ color: 'var(--accent-blue)', fontSize: '1.2rem' }}></i>
            <span>{toastMessage}</span>
          </div>,
          document.body
        )}

        {/* Action Bar */}
        <div className="candidates-action-bar">
          <div className="candidates-filter-group">
            <div className="form-group" style={{ flex: '2 1 200px', minWidth: '180px', marginBottom: 0 }}>
              <div className="combo-input-wrapper" data-tracker-query={searchQuery.toLowerCase().trim()}>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder={t('candidates.searchPlaceholder', '搜索候选人、企业、岗位或手机号...')} 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                <i className="ph-light ph-magnifying-glass"></i>
              </div>
            </div>
            
            {/* Company Filter */}
            <div className="form-group" style={{ flex: '1 1 130px', minWidth: '120px', marginBottom: 0 }}>
              <select className="form-select" value={companyFilter} onChange={e => setCompanyFilter(e.target.value)}>
                <option value="all">🏢 {t('candidates.filterAllCompanies', '所有意向企业')}</option>
                {companyOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.value === NONE ? `⚠️ ${t('candidates.noCompany', '未指定企业')}` : opt.label} ({opt.count})
                  </option>
                ))}
              </select>
            </div>

            {/* PIC Filter */}
            <div className="form-group" style={{ flex: '1 1 130px', minWidth: '120px', marginBottom: 0 }}>
              <select className="form-select" value={picFilter} onChange={e => setPicFilter(e.target.value)}>
                <option value="all">{t('candidates.allPic', '👤 所有顾问 (PIC)')}</option>
                {picOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.value === NONE ? t('candidates.noPic', '未分配 PIC') : opt.label} ({opt.count})
                  </option>
                ))}
              </select>
            </div>

            {/* Stage Filter */}
            <div className="form-group" style={{ flex: '1 1 130px', minWidth: '120px', marginBottom: 0 }}>
              <select className="form-select" value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
                <option value="all">{t('common.all', '所有候选人')} ({candidates.length})</option>
                <option value="active">🌟 {t('overview.filterActive', '所有进行中')} ({candidates.filter(c => c.status !== 'rejected').length})</option>
                {Object.values(Utils.STAGES).filter(s => s.key !== 'rejected').map(stage => (
                  <option key={stage.key} value={stage.key}>
                    {t(`common.stages.${stage.key}`, stage.label)} ({candidates.filter(c => c.status !== 'rejected' && c.stage === stage.key).length})
                  </option>
                ))}
                <option value="rejected">🛑 {t('candidates.rejected', '已淘汰')} ({candidates.filter(c => c.status === 'rejected').length})</option>
              </select>
            </div>
          </div>

          <div className="candidates-btn-group">
            {!isReadOnlyView ? (
              <>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setIsCvModalOpen(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
                  title={t('candidates.uploadTitle', '上传简历文件 (PDF/Word/TXT) 或粘贴文本，AI 自动提取入库')}
                >
                  <i className="ph-fill ph-file-arrow-up" style={{ color: 'var(--accent-blue)', fontSize: '16px' }}></i>
                  {t('components.cvImport.titleDefault', 'AI 导入简历')}
                </button>

                <button className="btn btn-primary" onClick={() => openCandidate(null)}>
                  <span className="btn-icon-circle"><i className="ph-bold ph-plus"></i></span>
                  {t('candidates.addCandidate', '录入候选人')}
                </button>
              </>
            ) : (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: 'var(--radius-full)',
                color: 'var(--accent-amber)',
                fontSize: 'var(--text-xs)',
                fontWeight: '600'
              }}>
                <i className="ph-bold ph-lock-key"></i>
                <span>{t('team.readOnlyBadge', '单向只读')} · {t('extraUi.partnerDataBadge', '合作人数据')}</span>
              </div>
            )}
          </div>
        </div>

        {/* View & Sort Toolbar (Aligned with Job Orders) */}
        <div className="orders-view-bar">
          <div className="orders-view-toggle" role="tablist">
            {[
              { key: 'table', icon: 'ph-table', label: t('candidates.viewTable', '表格') },
              { key: 'grouped', icon: 'ph-stack', label: t('candidates.viewGrouped', '分组') },
              { key: 'compact', icon: 'ph-list-dashes', label: t('candidates.viewCompact', '紧凑') }
            ].map(opt => (
              <button
                key={opt.key}
                type="button"
                role="tab"
                aria-selected={viewPrefs.view === opt.key}
                className={viewPrefs.view === opt.key ? 'active' : ''}
                onClick={() => updateViewPrefs({ view: opt.key })}
                title={opt.label}
              >
                <i className={`ph-light ${opt.icon}`}></i>
                <span className="orders-view-label">{opt.label}</span>
              </button>
            ))}
          </div>

          <div className="orders-view-controls">
            <select
              className="form-select btn-sm orders-compact-select"
              value={viewPrefs.sortKey}
              onChange={(e) => updateViewPrefs({ sortKey: e.target.value, sortDir: defaultCandidateSortDir(e.target.value) })}
              aria-label={t('candidates.sortBy', '排序')}
            >
              <option value="updatedAt">{t('candidates.sortBy', '排序')}: {t('candidates.sortUpdated', '最近更新')}</option>
              <option value="name">{t('candidates.sortBy', '排序')}: {t('candidates.sortName', '候选人姓名')}</option>
              <option value="company">{t('candidates.sortBy', '排序')}: {t('candidates.sortCompany', '意向企业')}</option>
              <option value="position">{t('candidates.sortBy', '排序')}: {t('candidates.sortPosition', '应聘岗位')}</option>
              <option value="stage">{t('candidates.sortBy', '排序')}: {t('candidates.sortStage', '当前阶段')}</option>
              <option value="pic">{t('candidates.sortBy', '排序')}: {t('candidates.sortPic', '顾问 PIC')}</option>
              <option value="remarks">{t('candidates.sortBy', '排序')}: {t('candidates.sortRemarks', '备注内容')}</option>
            </select>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => updateViewPrefs({ sortDir: viewPrefs.sortDir === 'asc' ? 'desc' : 'asc' })}
              title={viewPrefs.sortDir === 'asc' ? t('candidates.sortAsc', '升序') : t('candidates.sortDesc', '降序')}
            >
              <i className={`ph-light ${viewPrefs.sortDir === 'asc' ? 'ph-sort-ascending' : 'ph-sort-descending'}`}></i>
            </button>

            {viewPrefs.view === 'grouped' && (
              <select
                className="form-select btn-sm orders-compact-select"
                value={viewPrefs.groupBy}
                onChange={(e) => {
                  updateViewPrefs({ groupBy: e.target.value });
                  setCollapsedGroups({});
                }}
              >
                <option value="company">{t('candidates.groupCompany', '按企业分组')}</option>
                <option value="stage">{t('candidates.groupStage', '按阶段分组')}</option>
                <option value="pic">{t('candidates.groupPic', '按 PIC 分组')}</option>
                <option value="location">{t('candidates.groupLocation', '按地区分组')}</option>
              </select>
            )}
          </div>

          <div className="orders-view-summary">
            <span>
              {viewPrefs.view === 'grouped'
                ? t('candidates.groupedCount', { count: filteredCandidates.length, groups: candidateGroups.length }, `共 ${filteredCandidates.length} 位候选人 · ${candidateGroups.length} 组`)
                : t('candidates.resultCount', { count: filteredCandidates.length }, `共 ${filteredCandidates.length} 位候选人`)}
            </span>
            {hasActiveFilters && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>
                <i className="ph-light ph-x"></i> {t('candidates.clearFilters', '清除筛选')}
              </button>
            )}
          </div>
        </div>

        {/* Table View */}
        {viewPrefs.view === 'table' && (
          <div className="bezel-shell candidates-desktop-table" style={{ padding: '0' }}>
          <div className="bezel-core" style={{ padding: '0', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-hairline)', background: 'rgba(255,255,255,0.02)' }}>
                  {!isReadOnlyView && (
                    <th style={{ padding: 'var(--space-4) var(--space-4)', width: '42px', textAlign: 'center' }}>
                      <input 
                        type="checkbox" 
                        checked={isAllSelected} 
                        onChange={handleToggleSelectAll} 
                        style={{ cursor: 'pointer' }}
                        title={t('candidates.selectAllTitle', '全选 / 取消全选')}
                      />
                    </th>
                  )}
                  <th 
                    style={{ padding: 'var(--space-4) var(--space-4)', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => handleColumnSort('name')}
                    title={t('candidates.sortByColumn', '点击按此列排序')}
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <span>{t('candidates.table.name', '候选人')}</span>
                        <i
                          className={`ph-bold ${viewPrefs.sortKey === 'name' ? (viewPrefs.sortDir === 'asc' ? 'ph-caret-up' : 'ph-caret-down') : 'ph-caret-up-down'}`}
                          style={{ color: viewPrefs.sortKey === 'name' ? 'var(--accent-blue)' : undefined, opacity: viewPrefs.sortKey === 'name' ? 1 : 0.35 }}
                        ></i>
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsColumnChooserOpen(open => !open);
                        }}
                        title={t('candidates.columnChooserTooltip', '设定表格要显示的列')}
                        style={{
                          background: isColumnChooserOpen ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '4px',
                          padding: '2px 5px',
                          cursor: 'pointer',
                          color: isColumnChooserOpen ? 'var(--accent-blue)' : 'var(--text-secondary)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s'
                        }}
                      >
                        <i className="ph ph-gear" style={{ fontSize: '13px' }}></i>
                      </button>
                      {isColumnChooserOpen && (
                        <>
                          <div 
                            style={{ position: 'fixed', inset: 0, zIndex: 100 }} 
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsColumnChooserOpen(false);
                            }}
                          ></div>
                          <div 
                            className="orders-popover" 
                            style={{ 
                              position: 'absolute', 
                              top: 'calc(100% + 6px)', 
                              left: 0, 
                              zIndex: 101, 
                              minWidth: '200px', 
                              textTransform: 'none', 
                              letterSpacing: 'normal',
                              background: 'var(--bg-surface-overlay, #1e2430)',
                              boxShadow: '0 10px 28px rgba(0,0,0,0.45)',
                              border: '1px solid var(--border-subtle)'
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div style={{ padding: '4px 8px 6px', fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-hairline)', marginBottom: '4px' }}>
                              {t('candidates.columnChooserTitle', '自定义显示列')}
                            </div>
                            {CANDIDATE_COLUMN_DEFS.map(col => (
                              <label key={col.key} className="orders-popover-item" style={{ cursor: col.required ? 'not-allowed' : 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={col.required || Boolean(visibleColumns[col.key])}
                                  disabled={col.required}
                                  onChange={() => toggleColumn(col.key)}
                                  style={{ cursor: col.required ? 'not-allowed' : 'pointer' }}
                                />
                                <span style={{ color: col.required ? 'var(--text-muted)' : 'var(--text-primary)', fontSize: '12px' }}>
                                  {t(col.labelKey, col.defaultLabel)}
                                </span>
                              </label>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </th>
                  {visibleColumns.companyPosition && (
                    <th 
                      style={{ padding: 'var(--space-4) var(--space-4)', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleColumnSort('company')}
                      title={t('candidates.sortByColumn', '点击按此列排序')}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <span>{t('candidates.table.companyPosition', '意向企业 / 应聘岗位')}</span>
                        <i
                          className={`ph-bold ${viewPrefs.sortKey === 'company' ? (viewPrefs.sortDir === 'asc' ? 'ph-caret-up' : 'ph-caret-down') : 'ph-caret-up-down'}`}
                          style={{ color: viewPrefs.sortKey === 'company' ? 'var(--accent-blue)' : undefined, opacity: viewPrefs.sortKey === 'company' ? 1 : 0.35 }}
                        ></i>
                      </span>
                    </th>
                  )}
                  {visibleColumns.stage && (
                    <th 
                      style={{ padding: 'var(--space-4) var(--space-3)', width: '100px', minWidth: '90px', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleColumnSort('stage')}
                      title={t('candidates.sortByColumn', '点击按此列排序')}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <span>{t('candidates.table.stage', '当前阶段')}</span>
                        <i
                          className={`ph-bold ${viewPrefs.sortKey === 'stage' ? (viewPrefs.sortDir === 'asc' ? 'ph-caret-up' : 'ph-caret-down') : 'ph-caret-up-down'}`}
                          style={{ color: viewPrefs.sortKey === 'stage' ? 'var(--accent-blue)' : undefined, opacity: viewPrefs.sortKey === 'stage' ? 1 : 0.35 }}
                        ></i>
                      </span>
                    </th>
                  )}
                  {visibleColumns.remarks && (
                    <th 
                      style={{ padding: 'var(--space-4) var(--space-4)', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em', maxWidth: '300px', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleColumnSort('remarks')}
                      title={t('candidates.sortByColumn', '点击按此列排序')}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <span>{t('candidates.colRemarks', '备注 (Remarks)')}</span>
                        <i
                          className={`ph-bold ${viewPrefs.sortKey === 'remarks' ? (viewPrefs.sortDir === 'asc' ? 'ph-caret-up' : 'ph-caret-down') : 'ph-caret-up-down'}`}
                          style={{ color: viewPrefs.sortKey === 'remarks' ? 'var(--accent-blue)' : undefined, opacity: viewPrefs.sortKey === 'remarks' ? 1 : 0.35 }}
                        ></i>
                      </span>
                    </th>
                  )}
                  {visibleColumns.updatedAt && (
                    <th 
                      className="candidate-col-updated" 
                      style={{ padding: 'var(--space-4) var(--space-4)', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', width: '130px', cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => handleColumnSort('updatedAt')}
                      title={t('candidates.sortByColumn', '点击按此列排序')}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <span>{t('candidates.table.updatedAt', t('candidates.table.interviewTime', '更新时间'))}</span>
                        <i
                          className={`ph-bold ${viewPrefs.sortKey === 'updatedAt' ? (viewPrefs.sortDir === 'asc' ? 'ph-caret-up' : 'ph-caret-down') : 'ph-caret-up-down'}`}
                          style={{ color: viewPrefs.sortKey === 'updatedAt' ? 'var(--accent-blue)' : undefined, opacity: viewPrefs.sortKey === 'updatedAt' ? 1 : 0.35 }}
                        ></i>
                      </span>
                    </th>
                  )}
                  <th style={{ padding: 'var(--space-4) var(--space-4)', width: '72px', textAlign: 'right' }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredCandidates.length === 0 ? (
                  <tr>
                    <td colSpan={
                      (!isReadOnlyView ? 1 : 0) +
                      1 +
                      (visibleColumns.companyPosition ? 1 : 0) +
                      (visibleColumns.stage ? 1 : 0) +
                      (visibleColumns.remarks ? 1 : 0) +
                      (visibleColumns.updatedAt ? 1 : 0) +
                      1
                    } style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--text-muted)' }}>
                      <i className="ph-light ph-users" style={{ fontSize: '2rem', marginBottom: 'var(--space-2)', display: 'block' }}></i>
                      {t('candidates.emptyList', '暂无匹配的候选人数据')}
                    </td>
                  </tr>
                ) : (
                  filteredCandidates.map(c => {
                    const isSelected = selectedIds.has(c.id);
                    const stageMeta = Utils.getStageMeta(c.stage, t);
                    const subInfo = [c.phone, c.location || c.degree || c.school].filter(Boolean).join(' · ');
                    const remarkInfo = getCandidateRemarkDisplay(c);
                    
                    return (
                      <tr 
                        key={c.id} 
                        style={{ 
                          borderBottom: '1px solid var(--border-hairline)', 
                          transition: 'background 0.2s, opacity 0.2s',
                          background: isSelected 
                            ? 'rgba(59, 130, 246, 0.08)' 
                            : (c.status === 'rejected' ? 'rgba(244, 63, 94, 0.03)' : 'transparent'),
                          opacity: c.status === 'rejected' && !isSelected ? 0.8 : 1,
                          cursor: 'pointer'
                        }} 
                        className="hover-row"
                        onClick={() => openCandidate(c)}
                      >
                        {!isReadOnlyView && (
                          <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                            <input 
                              type="checkbox" 
                              checked={isSelected} 
                              onChange={(e) => handleToggleSelectRow(c.id, e)}
                              style={{ cursor: 'pointer' }}
                            />
                          </td>
                        )}
                        <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: c.status === 'rejected' ? 'rgba(244, 63, 94, 0.12)' : 'rgba(59, 130, 246, 0.1)', color: c.status === 'rejected' ? 'var(--accent-rose)' : 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '600', fontSize: '0.875rem', flexShrink: 0 }}>
                              {c.name ? c.name.charAt(0) : '?'}
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ color: 'var(--text-primary)', fontWeight: '500', fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                                {c.status === 'rejected' && (
                                  <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '4px', background: 'rgba(244, 63, 94, 0.15)', color: '#fb7185', fontWeight: '600', flexShrink: 0 }}>
                                    {t('candidates.rejectedTag', '淘汰')}
                                  </span>
                                )}
                              </div>
                              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
                                {c.phone ? (
                                  <>
                                    <WhatsAppButton phone={c.phone} candidateName={c.name} variant="text" />
                                    {[c.location, c.degree, c.school].filter(Boolean).length > 0 && <span style={{ flexShrink: 0 }}>·</span>}
                                  </>
                                ) : (
                                  <span style={{ opacity: 0.6, flexShrink: 0 }}>{t('candidates.noPhone', '未留电话')}</span>
                                )}
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '240px' }} title={[c.location, c.degree, c.school].filter(Boolean).join(' · ')}>
                                  {[c.location, c.degree, c.school].filter(Boolean).join(' · ')}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        {visibleColumns.companyPosition && (
                          <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ 
                                  fontWeight: c.company ? '600' : '400', 
                                  color: c.company ? 'var(--text-primary)' : 'var(--text-muted)', 
                                  fontSize: 'var(--text-sm)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  maxWidth: '180px',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }} title={c.company || t('candidates.noCompanyAssigned', '未指定企业')}>
                                  <i className="ph ph-buildings" style={{ color: c.company ? 'var(--accent-blue)' : 'var(--text-muted)', fontSize: '0.9rem', flexShrink: 0 }}></i>
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.company || t('candidates.noCompanyAssigned', '未指定企业')}</span>
                                </span>
                                {c.department && (
                                  <span className="tag-pill" style={{ fontSize: '10px', padding: '1px 6px', background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', border: '1px solid var(--border-hairline)', flexShrink: 0 }}>
                                    {c.department}
                                  </span>
                                )}
                              </div>
                              <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }} title={c.position || t('candidates.noPositionAssigned', '未指定岗位')}>
                                {c.position || t('candidates.noPositionAssigned', '未指定岗位')}
                              </span>
                              {!visibleColumns.remarks && remarkInfo.shortText && (
                                <div
                                  title={remarkInfo.fullText}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    maxWidth: '220px',
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    background: remarkInfo.isPrimary ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255, 255, 255, 0.04)',
                                    border: remarkInfo.isPrimary ? '1px solid rgba(59, 130, 246, 0.2)' : '1px solid var(--border-hairline)',
                                    color: remarkInfo.isPrimary ? 'var(--accent-blue)' : 'var(--text-secondary)',
                                    fontSize: '0.72rem',
                                    lineHeight: '1.4',
                                    marginTop: '2px'
                                  }}
                                >
                                  <i
                                    className={remarkInfo.isPrimary ? 'ph ph-note' : 'ph ph-chat-centered-text'}
                                    style={{ fontSize: '0.75rem', flexShrink: 0 }}
                                  ></i>
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {remarkInfo.shortText}
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>
                        )}
                        {visibleColumns.stage && (
                          <td style={{ padding: 'var(--space-3) var(--space-3)', whiteSpace: 'nowrap', width: '100px', minWidth: '90px' }}>
                            {c.status === 'rejected' ? (
                              <span 
                                className="badge" 
                                style={{ 
                                  background: 'rgba(244, 63, 94, 0.12)', 
                                  color: '#fb7185', 
                                  border: '1px solid rgba(244, 63, 94, 0.3)', 
                                  display: 'inline-flex', 
                                  alignItems: 'center', 
                                  gap: '4px',
                                  fontWeight: '600',
                                  fontSize: '0.75rem',
                                  padding: '2px 8px',
                                  whiteSpace: 'nowrap'
                                }}
                                title={c.rejectNote ? `${t('candidates.rejected', '已淘汰')}: ${c.rejectNote}` : (c.rejectReason ? `${t('candidates.rejected', '已淘汰')} · ${Utils.getDropReasonLabel(c.rejectReason, t)}` : t('candidates.rejected', '已淘汰'))}
                              >
                                <i className="ph-fill ph-x-circle" style={{ color: '#f43f5e', fontSize: '12px', flexShrink: 0 }}></i>
                                <span>{t('candidates.rejected', '已淘汰')}</span>
                              </span>
                            ) : (
                              <span className={`badge ${stageMeta.badgeClass}`}>
                                <span className="badge-dot"></span>
                                {stageMeta.label}
                              </span>
                            )}
                          </td>
                        )}
                        {visibleColumns.remarks && (
                          <td style={{ padding: 'var(--space-3) var(--space-4)', maxWidth: '300px' }}>
                            {remarkInfo.shortText ? (
                              <div
                                title={remarkInfo.fullText}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  maxWidth: '100%',
                                  padding: '3px 8px',
                                  borderRadius: '4px',
                                  background: remarkInfo.isPrimary ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255, 255, 255, 0.04)',
                                  border: remarkInfo.isPrimary ? '1px solid rgba(59, 130, 246, 0.2)' : '1px solid var(--border-hairline)',
                                  color: remarkInfo.isPrimary ? 'var(--accent-blue)' : 'var(--text-secondary)',
                                  fontSize: '0.78rem',
                                  lineHeight: '1.4'
                                }}
                              >
                                <i
                                  className={remarkInfo.isPrimary ? 'ph ph-note' : 'ph ph-chat-centered-text'}
                                  style={{ fontSize: '0.8rem', flexShrink: 0 }}
                                ></i>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {remarkInfo.shortText}
                                </span>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', opacity: 0.4 }}>-</span>
                            )}
                          </td>
                        )}
                        {visibleColumns.updatedAt && (
                          <td className="candidate-col-updated" style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--text-secondary)', fontSize: '0.85rem', whiteSpace: 'nowrap', width: '130px' }}>
                            {Utils.formatDate(c.updatedAt?.toDate ? c.updatedAt.toDate() : c.updatedAt)}
                          </td>
                        )}
                        <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-1)' }}>
                            {!isReadOnlyView && (
                              <button 
                                className="btn-icon" 
                                title={t('candidates.deleteTitle', '删除候选人')} 
                                style={{ color: 'var(--accent-rose)', opacity: 0.8 }}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const ok = await confirm(`${t('candidates.confirmDeletePre', '确定要永久删除候选人 "')}${c.name}${t('candidates.confirmDeletePost', '" 吗？此操作无法撤销。')}`, {
                                    title: t('candidates.deleteConfirmTitle', '删除候选人确认'),
                                    danger: true,
                                    confirmLabel: t('candidates.confirmDeleteBtn', '确认删除')
                                  });
                                  if (!ok) return;
                                  try {
                                    await FirestoreStore.deleteCandidate(teamId, c.id);
                                    SystemLogger.audit(teamId, user, 'DELETE', 'CANDIDATE', c.name, {
                                      actionDetail: `列表快捷删除了候选人: ${c.name}`
                                    });
                                    showToast(t('candidates.deleteSuccess', { name: c.name }, `候选人 "${c.name}" 已删除`), 'info');
                                  } catch (err) {
                                    showToast(t('candidates.deleteFailed', '删除失败: ') + err.message, 'error');
                                  }
                                }}
                              >
                                <i className="ph-light ph-trash"></i>
                              </button>
                            )}
                            <button 
                              className="btn-icon" 
                              title={t('candidates.pushToCvAutofill', '推送到 CV Auto Fill (导出 Sunrise 模板)')} 
                              style={{ color: 'var(--accent-purple)' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/cv-autofill?candidateId=${c.id}`);
                              }}
                            >
                              <i className="ph-light ph-file-doc"></i>
                            </button>
                            <button className="btn-icon" title={t('candidates.viewProfile', '查看档案')} onClick={() => openCandidate(c)}>
                              <i className="ph-light ph-caret-right"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {/* Grouped View */}
        {viewPrefs.view === 'grouped' && (
          <div className="candidates-desktop-table" style={{ display: 'flex', flexDirection: 'column' }}>
            {filteredCandidates.length === 0 ? (
              <div className="bezel-shell" style={{ borderStyle: 'dashed', background: 'var(--empty-icon-bg, rgba(255,255,255,0.01))', padding: 'var(--space-8)' }}>
                <div className="bezel-core" style={{ padding: 'var(--space-8)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 'var(--space-3)' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--empty-icon-bg, rgba(255,255,255,0.04))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', color: 'var(--text-muted)' }}>
                    <i className="ph-light ph-users"></i>
                  </div>
                  <div style={{ fontSize: 'var(--text-md)', fontWeight: '600', color: 'var(--text-primary)' }}>{t('candidates.emptyList', '暂无匹配的候选人数据')}</div>
                  {hasActiveFilters && (
                    <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                      <button className="btn btn-secondary btn-sm" onClick={clearFilters}>
                        <i className="ph-light ph-x"></i> {t('candidates.clearFilters', '清除筛选')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAllGroupsCollapsed(false)}>
                    <i className="ph-light ph-caret-double-down"></i> {t('candidates.expandAll', '全部展开')}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAllGroupsCollapsed(true)}>
                    <i className="ph-light ph-caret-double-up"></i> {t('candidates.collapseAll', '全部收起')}
                  </button>
                </div>

                {candidateGroups.map(group => {
                  const isCollapsed = Boolean(collapsedGroups[group.key]);
                  const groupIcon = {
                    company: 'ph-buildings',
                    stage: 'ph-kanban',
                    pic: 'ph-user',
                    location: 'ph-map-pin'
                  }[viewPrefs.groupBy] || 'ph-folders';

                  let displayLabel = group.label;
                  if (viewPrefs.groupBy === 'stage') {
                    displayLabel = group.key === 'rejected' ? t('candidates.rejected', '已淘汰') : Utils.getStageMeta(group.key, t).label;
                  } else if (group.key === NONE) {
                    if (viewPrefs.groupBy === 'company') displayLabel = t('candidates.noCompany', '未指定企业');
                    else if (viewPrefs.groupBy === 'pic') displayLabel = t('candidates.noPic', '未分配 PIC');
                    else if (viewPrefs.groupBy === 'location') displayLabel = t('candidates.noLocation', '未填写地区');
                  }

                  return (
                    <div key={group.key} className="orders-group">
                      <button
                        type="button"
                        className="orders-group-header"
                        onClick={() => toggleGroupCollapse(group.key)}
                        aria-expanded={!isCollapsed}
                      >
                        <i className={`ph-bold ${isCollapsed ? 'ph-caret-right' : 'ph-caret-down'}`} style={{ color: 'var(--text-muted)' }}></i>
                        <i className={`ph-light ${groupIcon}`} style={{ color: 'var(--accent-blue)' }}></i>
                        <span style={{ fontWeight: 600 }}>{displayLabel}</span>
                        <span className="badge" style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' }}>{group.candidates.length}</span>
                        {viewPrefs.groupBy !== 'stage' && (
                          <span className="orders-group-counts">
                            {STAGE_ORDER.filter(st => group.stageCounts[st]).map(st => {
                              const sm = Utils.getStageMeta(st, t);
                              const isRej = st === 'rejected';
                              return (
                                <span key={st} style={{ color: isRej ? '#fb7185' : (sm.color || 'var(--accent-blue)') }}>
                                  {group.stageCounts[st]} {isRej ? t('candidates.rejected', '已淘汰') : sm.label}
                                </span>
                              );
                            })}
                          </span>
                        )}
                      </button>

                      {!isCollapsed && group.candidates.map(c => {
                        const isSelected = selectedIds.has(c.id);
                        const stageMeta = Utils.getStageMeta(c.stage, t);
                        const remarkInfo = getCandidateRemarkDisplay(c);
                        const subInfoParts = [
                          viewPrefs.groupBy !== 'company' && c.company,
                          c.position,
                          c.phone,
                          viewPrefs.groupBy !== 'location' && (c.location || c.degree),
                          viewPrefs.groupBy !== 'pic' && c.picName && `PIC: ${c.picName}`
                        ].filter(Boolean);

                        return (
                          <div
                            key={c.id}
                            className="orders-group-row"
                            role="button"
                            tabIndex={0}
                            onClick={() => openCandidate(c)}
                            onKeyDown={(e) => { if (e.key === 'Enter') openCandidate(c); }}
                            style={{
                              background: isSelected ? 'rgba(59, 130, 246, 0.08)' : undefined
                            }}
                          >
                            {!isReadOnlyView && (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => handleToggleSelectRow(c.id, e)}
                                onClick={(e) => e.stopPropagation()}
                                style={{ cursor: 'pointer', flexShrink: 0, marginRight: '4px' }}
                              />
                            )}
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: c.status === 'rejected' ? 'rgba(244, 63, 94, 0.12)' : 'rgba(59, 130, 246, 0.1)', color: c.status === 'rejected' ? 'var(--accent-rose)' : 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '600', fontSize: '0.75rem', flexShrink: 0 }}>
                              {c.name ? c.name.charAt(0) : '?'}
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div className="orders-row-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>{c.name}</span>
                                {c.status === 'rejected' && (
                                  <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '4px', background: 'rgba(244, 63, 94, 0.15)', color: '#fb7185', fontWeight: '600' }}>
                                    {t('candidates.rejectedTag', '淘汰')}
                                  </span>
                                )}
                              </div>
                              <div className="orders-row-meta" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>{subInfoParts.join(' · ') || '-'}</span>
                                {remarkInfo.shortText && (
                                  <span
                                    title={remarkInfo.fullText}
                                    style={{
                                      fontSize: '0.7rem',
                                      color: remarkInfo.isPrimary ? 'var(--accent-blue)' : 'var(--text-muted)',
                                      background: 'rgba(255, 255, 255, 0.04)',
                                      padding: '1px 6px',
                                      borderRadius: '4px',
                                      border: '1px solid var(--border-hairline)'
                                    }}
                                  >
                                    {remarkInfo.shortText}
                                  </span>
                                )}
                              </div>
                            </div>
                            {c.status === 'rejected' ? (
                              <span className="badge" style={{ background: 'rgba(244, 63, 94, 0.12)', color: '#fb7185', border: '1px solid rgba(244, 63, 94, 0.3)', fontSize: '0.75rem' }}>
                                {t('candidates.rejected', '已淘汰')}
                              </span>
                            ) : (
                              <span className={`badge ${stageMeta.badgeClass}`}>
                                <span className="badge-dot"></span>
                                {stageMeta.label}
                              </span>
                            )}
                            <i className="ph-light ph-caret-right" style={{ color: 'var(--text-muted)' }}></i>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Compact View */}
        {viewPrefs.view === 'compact' && (
          <div className="candidates-desktop-table" style={{ display: 'flex', flexDirection: 'column' }}>
            {filteredCandidates.length === 0 ? (
              <div className="bezel-shell" style={{ borderStyle: 'dashed', background: 'var(--empty-icon-bg, rgba(255,255,255,0.01))', padding: 'var(--space-8)' }}>
                <div className="bezel-core" style={{ padding: 'var(--space-8)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 'var(--space-3)' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--empty-icon-bg, rgba(255,255,255,0.04))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', color: 'var(--text-muted)' }}>
                    <i className="ph-light ph-users"></i>
                  </div>
                  <div style={{ fontSize: 'var(--text-md)', fontWeight: '600', color: 'var(--text-primary)' }}>{t('candidates.emptyList', '暂无匹配的候选人数据')}</div>
                  {hasActiveFilters && (
                    <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                      <button className="btn btn-secondary btn-sm" onClick={clearFilters}>
                        <i className="ph-light ph-x"></i> {t('candidates.clearFilters', '清除筛选')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="orders-compact">
                {filteredCandidates.map(c => {
                  const isSelected = selectedIds.has(c.id);
                  const stageMeta = Utils.getStageMeta(c.stage, t);
                  const remarkInfo = getCandidateRemarkDisplay(c);
                  const statusColor = c.status === 'rejected' ? '#f43f5e' : (stageMeta.color || 'var(--accent-blue)');
                  return (
                    <div
                      key={c.id}
                      className="orders-compact-row"
                      role="button"
                      tabIndex={0}
                      onClick={() => openCandidate(c)}
                      onKeyDown={(e) => { if (e.key === 'Enter') openCandidate(c); }}
                      style={{
                        background: isSelected ? 'rgba(59, 130, 246, 0.08)' : undefined
                      }}
                    >
                      {!isReadOnlyView && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleToggleSelectRow(c.id, e)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ cursor: 'pointer', flexShrink: 0 }}
                        />
                      )}
                      <span className="orders-compact-dot" style={{ background: statusColor }}></span>
                      <span className="orders-compact-text">
                        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{c.name}</span>
                        {c.status === 'rejected' && (
                          <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '4px', background: 'rgba(244, 63, 94, 0.15)', color: '#fb7185', fontWeight: '600', marginLeft: '6px' }}>
                            {t('candidates.rejectedTag', '淘汰')}
                          </span>
                        )}
                        <span style={{ color: 'var(--text-secondary)', marginLeft: '8px' }}>
                          {c.company ? c.company : t('candidates.noCompanyAssigned', '未指定企业')}
                        </span>
                        {c.position && (
                          <>
                            {' – '}
                            <span style={{ color: 'var(--text-muted)' }}>{c.position}</span>
                          </>
                        )}
                        {(c.location || c.degree) && (
                          <span style={{ color: 'var(--text-muted)', opacity: 0.7 }}>{' · '}{[c.location, c.degree].filter(Boolean).join(' ')}</span>
                        )}
                        {c.picName && (
                          <span style={{ color: 'var(--accent-blue)', opacity: 0.8, marginLeft: '6px', fontSize: '0.72rem' }}>[PIC: {c.picName}]</span>
                        )}
                      </span>
                      {remarkInfo.shortText && (
                        <span
                          title={remarkInfo.fullText}
                          style={{
                            fontSize: '0.72rem',
                            color: remarkInfo.isPrimary ? 'var(--accent-blue)' : 'var(--text-muted)',
                            maxWidth: '180px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            background: 'rgba(255, 255, 255, 0.03)',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            border: '1px solid var(--border-hairline)',
                            flexShrink: 0
                          }}
                        >
                          {remarkInfo.shortText}
                        </span>
                      )}
                      <span className="orders-compact-status" style={{ color: statusColor }}>
                        {c.status === 'rejected' ? t('candidates.rejected', '已淘汰') : stageMeta.label}
                      </span>
                      <i className="ph-light ph-caret-right" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', flexShrink: 0 }}></i>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Mobile Cards View (Touch-Optimized for Small Screens) */}
        <div className="candidates-mobile-cards">
          {filteredCandidates.length === 0 ? (
            <div className="bezel-shell" style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
              <i className="ph-light ph-users" style={{ fontSize: '2rem', marginBottom: 'var(--space-2)', display: 'block' }}></i>
              {t('candidates.emptyList', '暂无匹配的候选人数据')}
            </div>
          ) : (
            filteredCandidates.map(c => {
              const isSelected = selectedIds.has(c.id);
              const stageMeta = Utils.getStageMeta(c.stage, t);
              const remarkInfo = getCandidateRemarkDisplay(c);
              return (
                <div 
                  key={c.id} 
                  className="bezel-shell candidate-mobile-card"
                  onClick={() => openCandidate(c)}
                  style={{ 
                    padding: '2px', 
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(59, 130, 246, 0.08)' : undefined,
                    borderColor: isSelected ? 'var(--accent-blue)' : undefined
                  }}
                >
                  <div className="bezel-core" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {/* Card Top Row: Checkbox + Avatar + Name + Stage Badge */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                        {!isReadOnlyView && (
                          <input 
                            type="checkbox" 
                            checked={isSelected} 
                            onChange={(e) => handleToggleSelectRow(c.id, e)}
                            onClick={(e) => e.stopPropagation()}
                            style={{ width: '18px', height: '18px', cursor: 'pointer', flexShrink: 0 }}
                          />
                        )}
                        <div style={{ 
                          width: '32px', 
                          height: '32px', 
                          borderRadius: '50%', 
                          background: c.status === 'rejected' ? 'rgba(244, 63, 94, 0.12)' : 'rgba(59, 130, 246, 0.12)', 
                          color: c.status === 'rejected' ? 'var(--accent-rose)' : 'var(--accent-blue)', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          fontWeight: '700', 
                          fontSize: '0.8rem', 
                          flexShrink: 0 
                        }}>
                          {c.name ? c.name.charAt(0) : '?'}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {c.name}
                          </div>
                        </div>
                      </div>

                      <div style={{ flexShrink: 0 }}>
                        {c.status === 'rejected' ? (
                          <span className="badge" style={{ background: 'rgba(244, 63, 94, 0.12)', color: '#fb7185', border: '1px solid rgba(244, 63, 94, 0.3)', fontSize: '0.68rem', padding: '2px 6px' }}>
                            {t('candidates.rejected', '已淘汰')}
                          </span>
                        ) : (
                          <span className={`badge ${stageMeta.badgeClass}`} style={{ fontSize: '0.68rem', padding: '2px 6px' }}>
                            <span className="badge-dot" style={{ width: '5px', height: '5px' }}></span>
                            {stageMeta.label}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Card Middle Row: Company & Position */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-secondary)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                      <i className="ph ph-buildings" style={{ color: c.company ? 'var(--accent-blue)' : 'var(--text-muted)', fontSize: '13px' }}></i>
                      <span style={{ fontWeight: c.company ? '600' : 'normal', color: c.company ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {c.company || t('candidates.noCompanyAssigned', '未指定企业')}
                      </span>
                      {c.position && (
                        <>
                          <span style={{ opacity: 0.4 }}>·</span>
                          <span>{c.position}</span>
                        </>
                      )}
                    </div>

                    {remarkInfo.shortText && (
                      <div
                        title={remarkInfo.fullText}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          fontSize: '0.74rem',
                          color: remarkInfo.isPrimary ? 'var(--text-secondary)' : 'var(--text-muted)',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        <i className={remarkInfo.isPrimary ? 'ph ph-note' : 'ph ph-chat-centered-text'} style={{ color: remarkInfo.isPrimary ? 'var(--accent-blue)' : 'var(--text-muted)', fontSize: '12px', flexShrink: 0 }}></i>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{remarkInfo.shortText}</span>
                      </div>
                    )}

                    {/* Card Bottom Row: Phone + School/Location + WhatsApp Button + Delete Button */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px solid var(--border-hairline)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1, overflow: 'hidden' }}>
                        {c.phone ? (
                          <WhatsAppButton phone={c.phone} candidateName={c.name} variant="text" />
                        ) : (
                          <span style={{ opacity: 0.6 }}>{t('candidates.noPhone', '未留电话')}</span>
                        )}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {[c.location, c.degree || c.school].filter(Boolean).join(' · ')}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                        {!isReadOnlyView && (
                          <button 
                            className="btn-icon" 
                            style={{ width: '28px', height: '28px', color: 'var(--accent-rose)', opacity: 0.8 }}
                            title={t('candidates.deleteTitle', '删除候选人')}
                            onClick={async (e) => {
                              e.stopPropagation();
                              const ok = await confirm(`${t('candidates.confirmDeletePre', '确定要永久删除候选人 "')}${c.name}${t('candidates.confirmDeletePost', '" 吗？此操作无法撤销。')}`, {
                                title: t('candidates.deleteConfirmTitle', '删除候选人确认'),
                                danger: true,
                                confirmLabel: t('candidates.confirmDeleteBtn', '确认删除')
                              });
                              if (!ok) return;
                              try {
                                await FirestoreStore.deleteCandidate(teamId, c.id);
                                showToast(t('candidates.deleteSuccess', { name: c.name }, `候选人 "${c.name}" 已删除`), 'info');
                              } catch (err) {
                                showToast(t('candidates.deleteFailed', '删除失败: ') + err.message, 'error');
                              }
                            }}
                          >
                            <i className="ph-light ph-trash" style={{ fontSize: '13px' }}></i>
                          </button>
                        )}
                        <button
                          className="btn-icon"
                          style={{ width: '28px', height: '28px', color: 'var(--accent-purple)' }}
                          title={t('candidates.pushToCvAutofill', '推送到 CV Auto Fill (导出 Sunrise 模板)')}
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/cv-autofill?candidateId=${c.id}`);
                          }}
                        >
                          <i className="ph-light ph-file-doc" style={{ fontSize: '13px' }}></i>
                        </button>
                        <button className="btn-icon" style={{ width: '28px', height: '28px' }} title={t('candidates.viewProfile', '查看档案')} onClick={() => openCandidate(c)}>
                          <i className="ph-light ph-caret-right" style={{ fontSize: '13px' }}></i>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <style dangerouslySetInnerHTML={{__html: `
          .hover-row:hover { background: rgba(255,255,255,0.02); }
          @keyframes slideUpBounce {
            0% { opacity: 0; transform: translate(-50%, 20px) scale(0.96); }
            100% { opacity: 1; transform: translate(-50%, 0) scale(1); }
          }
        `}} />
      </div>

      {/* Floating Batch Action Toolbar (Portalled to body so it follows viewport smoothly) */}
      {selectedIds.size > 0 && !isReadOnlyView && mounted && typeof document !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed', bottom: 'calc(76px + env(safe-area-inset-bottom, 12px))', left: '50%', transform: 'translateX(-50%)', maxWidth: 'calc(100vw - 32px)',
          background: 'rgba(20, 24, 38, 0.95)', border: '1px solid rgba(99, 102, 241, 0.4)',
          borderRadius: 'var(--radius-full)', padding: '10px 22px',
          boxShadow: '0 20px 48px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.08)',
          display: 'flex', alignItems: 'center', gap: '16px', zIndex: 9999,
          backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          animation: 'slideUpBounce 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          <span style={{ fontSize: '0.875rem', fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="ph-fill ph-check-circle" style={{ color: 'var(--accent-blue)', fontSize: '1.15rem' }}></i>
            {t('candidates.selectedCount', { count: selectedIds.size }, `已选中 ${selectedIds.size} 位候选人`)}
          </span>
          <div style={{ width: '1px', height: '18px', background: 'rgba(255,255,255,0.15)' }}></div>

          {/* Merge Candidates Action Button (when >= 2 selected) */}
          {selectedIds.size >= 2 && (
            <button 
              className="btn btn-sm"
              onClick={handleOpenMergeModal}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '7px 16px', borderRadius: 'var(--radius-full)', fontWeight: '600',
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                color: '#ffffff', border: 'none', cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(245, 158, 11, 0.35)', transition: 'all 0.15s ease'
              }}
              title={t('candidates.mergeModalDesc', { count: selectedIds.size }, `将选中的 ${selectedIds.size} 位候选人合并为 1 份完整档案`)}
            >
              <i className="ph-bold ph-git-merge"></i>
              {t('candidates.mergeActionBtn', '合并候选人')}
            </button>
          )}

          <button 
            className="btn btn-primary btn-sm"
            onClick={() => {
              setBatchCompanyName('');
              setIsBatchCompanyModalOpen(true);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 16px', borderRadius: 'var(--radius-full)', fontWeight: '600' }}
          >
            <i className="ph-bold ph-buildings"></i>
            {t('candidates.batchSetCompany', '批量设置意向企业')}
          </button>
          <button 
            className="btn btn-secondary btn-sm"
            onClick={() => setSelectedIds(new Set())}
            style={{ padding: '7px 14px', borderRadius: 'var(--radius-full)' }}
          >
            {t('candidates.deselect', '取消选择')}
          </button>
        </div>,
        document.body
      )}

      {/* Batch Assign Company Modal (Portalled to body) */}
      {isBatchCompanyModalOpen && mounted && typeof document !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10000, animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)', width: '90%', maxWidth: '480px',
            padding: 'var(--space-6)', boxShadow: '0 24px 60px rgba(0,0,0,0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="ph-bold ph-buildings" style={{ color: 'var(--accent-blue)' }}></i>
                {t('candidates.batchSetCompany', '批量设置意向企业')}
              </h3>
              <button className="btn-icon" onClick={() => setIsBatchCompanyModalOpen(false)}>
                <i className="ph-light ph-x"></i>
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)', lineHeight: 1.5 }}>
              {t('candidates.batchUpdateCompanyPre', '将同时为选中的')} <strong>{selectedIds.size}</strong> {t('candidates.batchUpdateCompanyPost', '位候选人更新应聘的目标企业或客户名称：')}
            </p>

            <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
              <label className="form-label">{t('candidates.targetCompanyLabel', '意向企业名称 (Company / Client)')}</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder={t('candidates.targetCompanyPlaceholder', '输入企业名称，如 IPE, PSA, Santak, EPG, Waveplus...')} 
                value={batchCompanyName}
                onChange={e => setBatchCompanyName(e.target.value)}
                autoFocus
              />
            </div>

            {/* Quick Pick from Existing Companies */}
            {existingCompanies.length > 0 && (
              <div style={{ marginBottom: 'var(--space-5)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px' }}>{t('candidates.quickSelectCompany', '从系统中已有企业快速选择：')}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {existingCompanies.map(comp => (
                    <button
                      key={comp}
                      type="button"
                      onClick={() => setBatchCompanyName(comp)}
                      style={{
                        background: batchCompanyName === comp ? 'var(--accent-blue)' : 'rgba(255,255,255,0.05)',
                        color: batchCompanyName === comp ? '#ffffff' : 'var(--text-secondary)',
                        border: '1px solid var(--border-interactive)',
                        padding: '3px 10px', borderRadius: 'var(--radius-pill)',
                        fontSize: '11px', cursor: 'pointer', transition: 'all 0.15s'
                      }}
                    >
                      {comp}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setIsBatchCompanyModalOpen(false)}
                disabled={isBatchUpdating}
              >
                {t('common.cancel', '取消')}
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={handleExecuteBatchCompany}
                disabled={!batchCompanyName.trim() || isBatchUpdating}
              >
                {isBatchUpdating ? t('common.loading', '更新中...') : `${t('common.confirm', '确认批量设置')} (${selectedIds.size})`}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Merge Candidates Modal */}
      {isMergeModalOpen && mounted && typeof document !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10000, animation: 'fadeIn 0.2s ease-out'
        }}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid rgba(245, 158, 11, 0.35)',
            borderRadius: 'var(--radius-lg)', width: '92%', maxWidth: '680px',
            maxHeight: '90vh', overflowY: 'auto',
            padding: 'var(--space-6)', boxShadow: '0 24px 60px rgba(0,0,0,0.6)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <i className="ph-bold ph-git-merge" style={{ color: '#f59e0b', fontSize: '1.35rem' }}></i>
                {t('candidates.mergeModalTitle', '合并候选人档案')}
              </h3>
              <button className="btn-icon" onClick={() => !isMerging && setIsMergeModalOpen(false)}>
                <i className="ph-light ph-x"></i>
              </button>
            </div>

            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-5)', lineHeight: 1.5 }}>
              {t('candidates.mergeModalDesc', { count: selectedCandidatesList.length }, `将选中的 ${selectedCandidatesList.length} 份分散档案融合为 1 份完整主档案，副档案将被自动吸收并安全清理。`)}
            </p>

            {/* Section 1: Choose Master */}
            <div style={{ marginBottom: 'var(--space-5)' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '10px' }}>
                {t('candidates.masterCandidateLabel', '1. 选定基准主档案 (保留此档案为主体)')}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {selectedCandidatesList.map(cand => {
                  const isMaster = cand.id === masterCandidateId;
                  const hasPhone = cand.phone && cand.phone !== '未留电话';
                  return (
                    <div 
                      key={cand.id}
                      onClick={() => !isMerging && setMasterCandidateId(cand.id)}
                      style={{
                        padding: '12px 16px', borderRadius: 'var(--radius-md)',
                        background: isMaster ? 'rgba(245, 158, 11, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                        border: isMaster ? '1.5px solid #f59e0b' : '1px solid var(--border-subtle)',
                        cursor: isMerging ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '18px', height: '18px', borderRadius: '50%',
                          border: isMaster ? '5px solid #f59e0b' : '2px solid var(--text-muted)',
                          background: isMaster ? '#ffffff' : 'transparent',
                          transition: 'all 0.15s'
                        }} />
                        <div>
                          <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {cand.name}
                            {isMaster && (
                              <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: 'var(--radius-pill)', background: '#f59e0b', color: '#000', fontWeight: 'bold' }}>
                                {t('candidates.recommendedMasterBadge', '⭐️ 主档案')}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '3px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            <span><i className="ph-bold ph-phone" style={{ marginRight: '4px' }}></i>{hasPhone ? cand.phone : t('candidates.noPhone', '未留电话')}</span>
                            <span><i className="ph-bold ph-buildings" style={{ marginRight: '4px' }}></i>{cand.company || t('candidates.noCompanyAssigned', '未指定企业')}</span>
                            <span><i className="ph-bold ph-briefcase" style={{ marginRight: '4px' }}></i>{cand.position || t('candidates.noPositionAssigned', '未指定岗位')}</span>
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        <span className={`badge ${Utils.getStageMeta(cand.stage || 'screening').badgeClass}`} style={{ fontSize: '10px' }}>
                          {Utils.getStageMeta(cand.stage || 'screening').label}
                        </span>
                        <div style={{ marginTop: '4px' }}>{cand.updatedAt ? Utils.formatDate(cand.updatedAt) : ''}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section 2: Fusion Preview */}
            {fusedCandidatePreview && (
              <div style={{
                background: 'rgba(255, 255, 255, 0.02)', border: '1px dashed rgba(255, 255, 255, 0.15)',
                borderRadius: 'var(--radius-md)', padding: '14px 16px', marginBottom: 'var(--space-6)'
              }}>
                <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#f59e0b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="ph-bold ph-sparkle"></i>
                  {t('candidates.mergePreviewTitle', '2. 智能融合预览与补充策略')}
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', fontSize: '0.8rem' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>{t('candidates.mergePreviewName', '最终姓名')}: </span>
                    <strong style={{ color: 'var(--text-primary)' }}>{fusedCandidatePreview.name}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>{t('candidates.mergePreviewPhone', '最终电话')}: </span>
                    <strong style={{ color: fusedCandidatePreview.phone && fusedCandidatePreview.phone !== '未留电话' ? '#10b981' : 'var(--text-muted)' }}>
                      {fusedCandidatePreview.phone || t('candidates.noPhone', '未留电话')}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>{t('candidates.mergePreviewCompany', '目标企业')}: </span>
                    <strong style={{ color: 'var(--text-primary)' }}>{fusedCandidatePreview.company || t('candidates.noCompanyAssigned', '未指定企业')}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>{t('candidates.mergePreviewPosition', '应聘岗位')}: </span>
                    <strong style={{ color: 'var(--text-primary)' }}>{fusedCandidatePreview.position || t('candidates.noPositionAssigned', '未指定岗位')}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>{t('candidates.mergePreviewExp', '工作履历')}: </span>
                    <strong style={{ color: 'var(--text-primary)' }}>{t('extraUi.mergedExpCount', { count: fusedCandidatePreview.workExperience?.length || 0 }, `${fusedCandidatePreview.workExperience?.length || 0} 段经历 (已去重合并)`)}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>{t('extraUi.skillTagsLabel', '技能标签: ')}</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{t('extraUi.skillTagsCount', { count: fusedCandidatePreview.tags?.length || 0 }, `${fusedCandidatePreview.tags?.length || 0} 个标签`)}</strong>
                  </div>
                </div>

                <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  <i className="ph-bold ph-info" style={{ marginRight: '4px' }}></i>
                  {t('candidates.mergeNotesDesc', '所有副档案的历史备注将自动全量拼接保留，并追加系统合并审计日志；主档案缺失的电话、邮箱与企业将自动由副档案互补填充。')}
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setIsMergeModalOpen(false)}
                disabled={isMerging}
              >
                {t('common.cancel', '取消')}
              </button>
              <button 
                type="button" 
                className="btn btn-warning"
                onClick={handleExecuteMerge}
                disabled={isMerging || !masterCandidateId}
                style={{
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  color: '#ffffff', border: 'none', fontWeight: '600',
                  boxShadow: '0 4px 14px rgba(245, 158, 11, 0.35)', cursor: 'pointer'
                }}
              >
                {isMerging ? t('common.loading', '正在合并...') : t('candidates.mergeConfirmBtn', { count: selectedCandidatesList.length }, `确认合并 (${selectedCandidatesList.length} ➔ 1)`)}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <CandidateDrawer 
        isOpen={isDrawerOpen} 
        onClose={closeDrawer} 
        candidate={selectedCandidate} 
      />

      <CvImportModal
        isOpen={isCvModalOpen}
        onClose={() => setIsCvModalOpen(false)}
        onSuccess={(newCandidate) => {
          if (newCandidate) {
            openCandidate(newCandidate);
          }
        }}
      />
    </>
  );
}
