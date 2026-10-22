'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Utils } from '../lib/utils';
import { FirestoreStore } from '../lib/firestore-store';
import { useAuth } from '../lib/auth-context';
import { useFeedback } from '../lib/feedback-context';
import { SystemLogger } from '../lib/logger';
import WhatsAppButton from './WhatsAppButton';
import { useI18n } from '../lib/i18n-context';
import { resolveCanonicalPic } from '../lib/identity.mjs';
import { authFetch } from '../lib/api-client';
import {
  buildInterviewReminder,
  isIsoDate,
  isHhMm,
  DEFAULT_INTERVIEW_REMINDER_LEAD,
  INTERVIEW_REMINDER_LEADS,
} from '../lib/interview-reminder.mjs';

// 旧数据的面试时间可能是 "10am"、"2:30pm" 这类文字：能解析的转成 HH:mm，解析不了的保留原文
const normalizeInterviewTime = (time) => {
  if (!time) return '';
  if (isHhMm(time)) return time;
  const parsed = Utils.parseInterviewDateTime(`01/01/2000 ${time}`);
  return isHhMm(parsed.timeStr) ? parsed.timeStr : String(time);
};

// 旧数据的面试日期可能是 "18/8/2026 10am" 这类文字：能解析的转成日期 / 时间选择器格式，解析不了的保留原文
const normalizeInterviewFields = (candidate) => {
  const rawDate = candidate?.interviewDate || '';
  const rawTime = normalizeInterviewTime(candidate?.interviewTime);
  if (!rawDate) return { interviewDate: '', interviewTime: rawTime };
  const parsed = Utils.parseInterviewDateTime(rawDate, rawTime);
  if (!isIsoDate(parsed.dateStr)) return { interviewDate: rawDate, interviewTime: rawTime };
  return { interviewDate: parsed.dateStr, interviewTime: rawTime || normalizeInterviewTime(parsed.timeStr) };
};

// 等抽屉滑入动画结束后，滚动到面试安排区块并聚焦日期选择器
const scrollToInterviewSection = (sectionRef, inputRef) => setTimeout(() => {
  sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  inputRef.current?.focus({ preventScroll: true });
}, 350);


const getInitialCandidateFormData = () => ({
  name: '', phone: '', email: '', school: '', major: '', 
  graduationYear: new Date().getFullYear().toString(),
  company: '', position: '', stage: 'screening',
  source: '', notes: '',
  nationality: '', race: '', gender: '', maritalStatus: '',
  lastDrawnSalary: '', expectedSalary: '', availability: '',
  languages: [], workExperience: []
});

export default function CandidateDrawer({ isOpen, onClose, candidate, focusInterview = false }) {
  const { teamId, user, userProfile, isReadOnlyView } = useAuth();
  const { confirm, showToast: showGlobalToast } = useFeedback();
  const { t, lang } = useI18n();
  
  const [currentCandidate, setCurrentCandidate] = useState(candidate);
  const lastCandidateIdRef = useRef(candidate?.id);
  const [formData, setFormData] = useState(getInitialCandidateFormData);
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  const [pencilHint, setPencilHint] = useState('');
  const [reminderError, setReminderError] = useState('');
  
  // Storage States
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Reminder State
  const [isAddingReminder, setIsAddingReminder] = useState(false);
  const [isSavingReminder, setIsSavingReminder] = useState(false);
  const [newReminder, setNewReminder] = useState({ date: '', time: '', content: '' });

  // Drop / Rejection States
  const [isDropModalOpen, setIsDropModalOpen] = useState(false);
  const [dropReason, setDropReason] = useState('offer_accepted_elsewhere');
  const [dropNote, setDropNote] = useState('');
  const [isDropping, setIsDropping] = useState(false);

  // Team & PIC States
  const [teamMembers, setTeamMembers] = useState([]);
  const [isCustomPic, setIsCustomPic] = useState(false);

  // AI CV Auto-Fill States
  const [showDrawerAiParser, setShowDrawerAiParser] = useState(false);
  const [aiParseTab, setAiParseTab] = useState('file'); // 'file' | 'text'
  const [aiFile, setAiFile] = useState(null);
  const [aiText, setAiText] = useState('');
  const [isAiParsing, setIsAiParsing] = useState(false);
  const [aiParseError, setAiParseError] = useState('');
  const drawerFileInputRef = useRef(null);
  const interviewSectionRef = useRef(null);
  const interviewDateInputRef = useRef(null);

  const showToast = (msg, tone = 'info') => {
    if (showGlobalToast) {
      showGlobalToast(msg, tone);
    }
  };

  const showPencilHint = (msg) => {
    setPencilHint(msg);
    setTimeout(() => setPencilHint(''), 3000);
  };

  const handleFieldClickHint = (isStage = false) => {
    if (isReadOnlyView) {
      showToast(t('pipeline.readOnlyTip', '当前为只读视察模式，无法修改其他团队的数据'), 'warning');
      return;
    }
    if (!isEditing) {
      showPencilHint(isStage ? t('candidates.drawer.clickPencilStageHint') : t('candidates.drawer.clickPencilHint'));
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    try {
      const usersRef = collection(db, 'users');
      const unsub = onSnapshot(usersRef, (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setTeamMembers(list);
      }, (err) => {
        console.warn("Failed to subscribe to team members in CandidateDrawer:", err);
      });
      return () => unsub();
    } catch (err) {
      console.warn("Error setting up team members listener:", err);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setIsCustomPic(false);

    if (candidate) {
      setCurrentCandidate(candidate);
      const personal = candidate.parsedCvData?.parsed_cv?.personal_information || {};
      const cv = candidate.parsedCvData?.parsed_cv || {};
      setFormData({
        ...candidate,
        picName: candidate.picName || candidate.pic || '',
        assignedTo: candidate.assignedTo || candidate.userId || '',
        nationality: candidate.nationality ?? personal.nationality ?? '',
        race: candidate.race ?? personal.race ?? '',
        gender: candidate.gender ?? personal.gender ?? '',
        maritalStatus: candidate.maritalStatus ?? personal.marital_status ?? '',
        lastDrawnSalary: candidate.lastDrawnSalary ?? personal.last_drawn_salary ?? '',
        expectedSalary: candidate.expectedSalary ?? personal.expected_salary ?? candidate.offered ?? candidate.salary ?? '',
        availability: candidate.availability ?? personal.availability ?? '',
        languages: (candidate.languages && candidate.languages.length > 0) ? candidate.languages : (cv.languages || []),
        workExperience: (candidate.workExperience && candidate.workExperience.length > 0) ? candidate.workExperience : (cv.professional_history || []),
        ...normalizeInterviewFields(candidate),
        interviewReminderLead: candidate.interviewReminderLead || DEFAULT_INTERVIEW_REMINDER_LEAD
      });
      if (candidate.id !== lastCandidateIdRef.current) {
        lastCandidateIdRef.current = candidate.id;
        setIsEditing(false); // Reset to view mode when opening new candidate
        setActiveTab('profile');
        setShowDrawerAiParser(false);
      }
      // 看板拖入「面试考核」时：直接进入编辑模式并滚动到面试日期 / 时间
      if (focusInterview && !isReadOnlyView) {
        setIsEditing(true);
        setActiveTab('profile');
        const timer = scrollToInterviewSection(interviewSectionRef, interviewDateInputRef);
        return () => clearTimeout(timer);
      }
    } else {
      lastCandidateIdRef.current = null;
      setCurrentCandidate(null);
      // New Candidate Defaults: Auto expand AI parser to prompt recruiter if not read-only
      const defaultPic = userProfile?.displayName || user?.displayName || '';
      const defaultAssignedTo = user?.uid || '';
      setFormData({
        ...getInitialCandidateFormData(),
        picName: defaultPic,
        assignedTo: defaultAssignedTo
      });
      setIsEditing(!isReadOnlyView); // Auto enter edit mode for new candidate only if writable
      setShowDrawerAiParser(!isReadOnlyView); // Default open for new candidate!
      setAiFile(null);
      setAiText('');
      setAiParseError('');
      setActiveTab('profile');
    }
  }, [candidate, isOpen, isReadOnlyView, userProfile, user, focusInterview]);

  const handleDrawerAiParse = async () => {
    if (isReadOnlyView) return;
    setAiParseError('');
    setIsAiParsing(true);
    try {
      let res;
      if (aiParseTab === 'file') {
        if (!aiFile) {
          setAiParseError(t('candidates.drawer.aiSelectFilePrompt'));
          setIsAiParsing(false);
          return;
        }
        const formDataPayload = new FormData();
        formDataPayload.append('file', aiFile);
        res = await authFetch('/api/parse/file/cv', {
          method: 'POST',
          body: formDataPayload
        });
      } else {
        if (!aiText.trim()) {
          setAiParseError(t('candidates.drawer.aiPastePlaceholder'));
          setIsAiParsing(false);
          return;
        }
        res = await authFetch('/api/parse/cv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: aiText })
        });
      }

      let json = null;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        json = await res.json().catch(() => null);
      } else {
        const textErr = await res.text().catch(() => '');
        throw new Error(`AI 服务异常 (HTTP ${res.status}): ${textErr.slice(0, 150) || '未返回有效结果'}`);
      }

      if (!res.ok || !json || json.status === 'error') {
        throw new Error(json?.message || t('candidates.drawer.aiParseErrorFallback'));
      }

      const raw = json.data || {};
      
      // Clean up legacy poisoned TALENT_FLOW_MY_PIC in localStorage if present
      if (typeof window !== 'undefined' && localStorage.getItem('TALENT_FLOW_MY_PIC')) {
        try { localStorage.removeItem('TALENT_FLOW_MY_PIC'); } catch (e) {}
      }

      // Prioritize logged-in user displayName
      const defaultPic = 
        userProfile?.displayName || 
        user?.displayName || 
        '';

      const parsedCv = raw.parsed_cv || {};
      const personal = parsedCv.personal_information || {};
      const prof = parsedCv.professional_history?.[0] || {};
      const edu = parsedCv.education?.[0] || {};
      
      const rawQual = edu.qualification || raw.education?.[0]?.qualification || '';
      let extractedDegree = edu.degree || raw.education?.[0]?.degree || '';
      let extractedMajor = edu.major || raw.education?.[0]?.major || '';
      if (!extractedDegree && rawQual) {
        if (rawQual.toLowerCase().includes(' in ')) {
          const parts = rawQual.split(/ in /i);
          extractedDegree = parts[0].trim();
          extractedMajor = parts[1].trim();
        } else if (rawQual.toLowerCase().includes(' of ')) {
          const parts = rawQual.split(/ of /i);
          extractedDegree = parts[0].trim();
          extractedMajor = parts[1].trim();
        } else {
          extractedDegree = rawQual;
        }
      }

      let finalQual = rawQual;
      if (!finalQual) {
        if (extractedDegree && extractedMajor) {
          const dLower = extractedDegree.toLowerCase();
          if (dLower.includes('bachelor') && !dLower.includes('of')) finalQual = `Bachelor of ${extractedMajor}`;
          else if (dLower.includes('diploma') && !dLower.includes('in')) finalQual = `Diploma in ${extractedMajor}`;
          else if (dLower.includes('master') && !dLower.includes('of')) finalQual = `Master of ${extractedMajor}`;
          else finalQual = `${extractedDegree} ${extractedMajor}`;
        } else {
          finalQual = extractedDegree || extractedMajor || '';
        }
      }

      const notesParts = [
        raw.summary || '',
        parsedCv.skills?.length ? `【技能】: ${parsedCv.skills.join(', ')}` : '',
        parsedCv.languages?.length ? `【语言】: ${parsedCv.languages.join(', ')}` : '',
        personal.expected_salary ? `【期望薪资】: ${personal.expected_salary}` : '',
        personal.availability ? `【到岗时间】: ${personal.availability}` : ''
      ].filter(Boolean).join('\n');

      setFormData(prev => ({
        ...prev,
        name: personal.name || raw.name || prev.name || '',
        phone: personal.phone || raw.phone || prev.phone || '',
        email: personal.email || raw.email || prev.email || '',
        location: personal.address || raw.location || prev.location || '',
        company: prev.company || '',
        position: prof.position || parsedCv.position_applied || raw.currentPosition || raw.workExperience?.[0]?.position || prev.position || '',
        school: edu.school || raw.education?.[0]?.school || prev.school || '',
        degree: extractedDegree || prev.degree || '',
        major: extractedMajor || prev.major || '',
        qualification: finalQual || prev.qualification || '',
        experience: parsedCv.total_years_experience || raw.totalYearsExperience || prev.experience || '',
        // Sunrise CV fields
        nationality: personal.nationality || prev.nationality || '',
        race: personal.race || prev.race || '',
        gender: personal.gender || prev.gender || '',
        maritalStatus: personal.marital_status || prev.maritalStatus || '',
        lastDrawnSalary: personal.last_drawn_salary || prev.lastDrawnSalary || '',
        expectedSalary: personal.expected_salary || prev.expectedSalary || '',
        availability: personal.availability || prev.availability || '',
        languages: parsedCv.languages?.length ? parsedCv.languages : (prev.languages || []),
        workExperience: parsedCv.professional_history?.length ? parsedCv.professional_history : (prev.workExperience || []),
        notes: notesParts || prev.notes || '',
        picName: prev.picName || defaultPic,
        source: prev.source || 'AI 简历解析录入'
      }));

      setShowDrawerAiParser(false);
      setAiFile(null);
      setAiText('');
      showToast(t('candidates.drawer.aiParseDone'));
    } catch (err) {
      console.warn('Drawer AI parse failed:', err);
      setAiParseError(err.message || t('candidates.drawer.aiParseErrorFallback'));
    } finally {
      setIsAiParsing(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // 在抽屉里手动把阶段改成「面试考核」时，同样滚动到面试日期 / 时间
    if (name === 'stage' && value === 'interview') {
      scrollToInterviewSection(interviewSectionRef, interviewDateInputRef);
    }
  };

  const handleLanguagesChange = (e) => {
    const val = e.target.value;
    const arr = val.split(/[,，、]/).map(s => s.trim()).filter(Boolean);
    setFormData(prev => ({
      ...prev,
      languages: arr,
      languagesRaw: val
    }));
  };

  const handleWorkExpChange = (index, field, value) => {
    setFormData(prev => {
      const updated = [...(prev.workExperience || [])];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, workExperience: updated };
    });
  };

  const handleAddWorkExp = () => {
    if (isReadOnlyView) return;
    setFormData(prev => ({
      ...prev,
      workExperience: [
        ...(prev.workExperience || []),
        { period: '', company: '', position: '', last_drawn_salary: '', reason_for_leaving: '', responsibilities: [] }
      ]
    }));
  };

  const handleRemoveWorkExp = (index) => {
    if (isReadOnlyView) return;
    setFormData(prev => {
      const updated = [...(prev.workExperience || [])];
      updated.splice(index, 1);
      return { ...prev, workExperience: updated };
    });
  };

  // 保存面试日期 / 时间后自动设定提醒：替换旧的自动提醒；清空日期或面试已过则移除
  const syncInterviewReminder = async (candidateId, data) => {
    const isEn = lang === 'en';
    const timeLabel = isHhMm(data.interviewTime) ? ` ${data.interviewTime}` : '';
    const target = [data.company, data.position].filter(Boolean).join(' / ');
    const content = `${t('candidates.drawer.interviewReminderPrefix', '面试提醒')}: ${data.name || ''} · ${data.interviewDate}${timeLabel}${target ? ` · ${target}` : ''}`;
    const reminder = buildInterviewReminder({
      interviewDate: data.interviewDate,
      interviewTime: data.interviewTime,
      leadMinutes: data.interviewReminderLead || DEFAULT_INTERVIEW_REMINDER_LEAD,
      content,
    });
    try {
      const creatorName = userProfile?.displayName || user?.displayName || user?.email?.split('@')[0] || (isEn ? 'Advisor' : '顾问');
      const result = await FirestoreStore.setInterviewReminder(teamId, candidateId, reminder ? {
        ...reminder,
        creatorId: user?.uid || '',
        creatorName,
        creatorEmail: user?.email || '',
      } : null);
      if (result.changed && result.reminder) {
        showToast(t('candidates.drawer.toastInterviewReminderSet', { when: `${result.reminder.date} ${result.reminder.time}` }, '已自动设定面试提醒：{when}'), 'success');
      }
    } catch (e) {
      console.warn('Failed to set interview reminder:', e);
      showToast(t('candidates.drawer.toastInterviewReminderFailed', '档案已保存，但面试提醒设定失败：') + e.message, 'warning');
    }
  };

  const handleSave = async () => {
    if (isReadOnlyView) {
      showToast(t('pipeline.readOnlyTip', '当前为只读视察模式，无法修改其他团队的候选人档案'), 'warning');
      return;
    }
    try {
      const payload = { ...formData };
      // 提醒由专门的方法读写；表单里的 reminders 是打开抽屉时的旧快照，写回会覆盖期间新增 / 自动设定的提醒
      delete payload.reminders;
      if (payload.picName || payload.assignedTo) {
        const canonical = resolveCanonicalPic(payload.picName, payload.assignedTo, teamMembers);
        payload.picName = canonical.displayName !== '未分配顾问' ? canonical.displayName : (payload.picName || '');
        if (canonical.uid) {
          payload.assignedTo = canonical.uid;
        } else if (canonical.isExternal) {
          payload.assignedTo = '';
        }
      }
      if (currentCandidate) {
        if (currentCandidate.company !== payload.company && payload.company) {
          payload.companySource = 'manual';
        }

        const isStageChanged = formData.stage && currentCandidate.stage !== formData.stage;
        if (isStageChanged) {
          const now = new Date().toISOString();
          payload.stageHistory = [
            ...(currentCandidate.stageHistory || []),
            { stage: formData.stage, movedAt: now }
          ];
        }

        await FirestoreStore.updateCandidate(teamId, currentCandidate.id, payload);
        setCurrentCandidate(prev => ({ ...prev, ...payload }));
        
        // Detailed audit log for stage change vs simple update
        if (isStageChanged) {
          const fromStageLabel = Utils.getStageMeta(currentCandidate.stage || 'screening').label;
          const toStageLabel = Utils.getStageMeta(formData.stage).label;
          SystemLogger.audit(teamId, user, 'UPDATE', 'CANDIDATE', formData.name, {
            actionDetail: `流转候选人阶段: ${fromStageLabel} -> ${toStageLabel}`,
            fromStage: currentCandidate.stage || 'screening',
            toStage: formData.stage
          });
        } else {
          SystemLogger.audit(teamId, user, 'UPDATE', 'CANDIDATE', formData.name);
        }

        await syncInterviewReminder(currentCandidate.id, payload);
      } else {
        // Validate required fields for new candidate
        if (!formData.name || !formData.name.trim()) {
          showToast(t('candidates.drawer.placeholderName'));
          return;
        }
        if (payload.company) {
          payload.companySource = 'manual';
        }
        const saveResult = await FirestoreStore.upsertCandidate(teamId, user.uid, payload, aiFile?.name);
        if (saveResult.isMerged) {
          SystemLogger.audit(teamId, user, 'UPDATE', 'CANDIDATE', formData.name, {
            actionDetail: `抽屉录入检测到同电话候选人 (${formData.phone})，已自动合并更新档案并追加重新投递记录`
          });
          showToast(`🎉 检测到已存在同电话候选人 (${formData.phone})，已智能合并档案并追加重投记录！`);
        } else {
          SystemLogger.audit(teamId, user, 'CREATE', 'CANDIDATE', formData.name);
          showToast(t('candidates.drawer.saveSuccess', '候选人录入成功'));
        }
        setFormData(getInitialCandidateFormData());
        setAiFile(null);
        setAiText('');
        setAiParseError('');
      }
      setIsEditing(false);
      onClose();
    } catch (error) {
      console.error("Error saving candidate:", error);
      showToast(t('candidates.drawer.saveFailed') + error.message);
    }
  };

  const handleDeleteCandidate = async () => {
    if (isReadOnlyView) {
      showToast(t('pipeline.readOnlyTip', '当前为只读视察模式，无法删除其他团队的候选人档案'), 'warning');
      return;
    }
    if (!currentCandidate || !currentCandidate.id) return;
    const ok = await confirm(`${t('candidates.drawer.confirmDeletePre')}${currentCandidate.name}${t('candidates.drawer.confirmDeletePost')}`, {
      title: t('candidates.drawer.deleteConfirmTitle'),
      danger: true,
      confirmLabel: t('candidates.drawer.confirmDeleteBtn')
    });
    if (!ok) return;

    try {
      await FirestoreStore.deleteCandidate(teamId, currentCandidate.id);
      SystemLogger.audit(teamId, user, 'DELETE', 'CANDIDATE', currentCandidate.name, {
        actionDetail: `删除了候选人档案: ${currentCandidate.name}`
      });
      showToast(t('candidates.drawer.deleteSuccess'), "info");
      onClose();
    } catch (error) {
      console.error("Error deleting candidate:", error);
      showToast(t('candidates.drawer.deleteFailed') + error.message, "error");
    }
  };

  const handleAddReminder = async (syncToGoogle = false) => {
    if (isReadOnlyView) return;
    if (!newReminder.date) {
      setReminderError('date');
      showToast(t('candidates.drawer.toastFillReminderDateAndContent'), "warning");
      return;
    }
    if (!newReminder.content) {
      setReminderError('content');
      showToast(t('candidates.drawer.toastFillReminderDateAndContent'), "warning");
      return;
    }
    setReminderError('');
    if (!currentCandidate || !currentCandidate.id) return;
    if (isSavingReminder) return; // Guard against double-click
    setIsSavingReminder(true);

    // Prompt desktop notification permission if supported
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    try {
      const creatorName = userProfile?.displayName || user?.displayName || user?.email?.split('@')[0] || (lang === 'en' ? 'Advisor' : '顾问');
      const reminderData = {
        ...newReminder,
        dateTime: newReminder.time ? `${newReminder.date}T${newReminder.time}` : `${newReminder.date}T09:00`,
        creatorId: user?.uid || '',
        creatorName,
        creatorEmail: user?.email || '',
      };
      const createdReminder = await FirestoreStore.addReminder(teamId, currentCandidate.id, reminderData);
      if (createdReminder) {
        setCurrentCandidate(prev => ({
          ...prev,
          reminders: [...(prev?.reminders || []), createdReminder]
        }));
      }

      if (syncToGoogle) {
        handleSyncReminderToGCal(newReminder);
      }

      setIsAddingReminder(false);
      setNewReminder({ date: '', time: '', content: '' });
      showToast(syncToGoogle ? t('candidates.drawer.toastReminderSavedGCal') : t('candidates.drawer.toastReminderAdded'), "success");
    } catch (e) {
      showToast(t('candidates.drawer.toastAddReminderFailed') + e.message, "error");
    } finally {
      setIsSavingReminder(false);
    }
  };

  const handleDeleteReminder = async (reminderId) => {
    if (isReadOnlyView) return;
    if (!currentCandidate || !currentCandidate.id) return;
    try {
      await FirestoreStore.deleteReminder(teamId, currentCandidate.id, reminderId);
      setCurrentCandidate(prev => ({
        ...prev,
        reminders: (prev?.reminders || []).filter(r => r.id !== reminderId)
      }));
      showToast(t('candidates.drawer.toastReminderDeleted'), "info");
    } catch (e) {
      showToast(t('candidates.drawer.toastDeleteReminderFailed') + e.message, "error");
    }
  };

  const handleToggleReminderFired = async (reminderId, currentFired) => {
    if (isReadOnlyView) return;
    if (!currentCandidate || !currentCandidate.id) return;
    try {
      if (!currentFired) {
        await FirestoreStore.markReminderFired(teamId, currentCandidate.id, reminderId);
      } else {
        const reminders = (currentCandidate.reminders || []).map(r => 
          r.id === reminderId ? { ...r, fired: false } : r
        );
        await FirestoreStore.updateCandidate(teamId, currentCandidate.id, { reminders });
      }
      setCurrentCandidate(prev => ({
        ...prev,
        reminders: (prev?.reminders || []).map(r => 
          r.id === reminderId ? { ...r, fired: !currentFired } : r
        )
      }));
      showToast(currentFired ? t('candidates.drawer.toastReminderReverted') : t('candidates.drawer.toastReminderCompleted'), "success");
    } catch (e) {
      showToast(t('candidates.drawer.toastActionFailed') + e.message, "error");
    }
  };

  const handleSyncInterviewToGCal = () => {
    const parsed = Utils.parseInterviewDateTime(formData.interviewDate, formData.interviewTime);
    const dateStr = parsed.dateStr !== '-' ? parsed.dateStr : Utils.formatDate(new Date());
    const timeStr = parsed.timeStr || '10:00';

    const isEn = lang === 'en';
    const notProvided = isEn ? 'Not provided' : '未提供';
    const notSpecified = isEn ? 'Not specified' : '未指定';
    const details = [
      `${isEn ? 'Candidate: ' : '候选人：'}${formData.name || notProvided}`,
      `${isEn ? 'Phone: ' : '联系电话：'}${formData.phone || notProvided}`,
      `${isEn ? 'Email: ' : '电子邮箱：'}${formData.email || notProvided}`,
      `${isEn ? 'Company: ' : '应聘企业：'}${formData.company || notSpecified}`,
      `${isEn ? 'Position: ' : '应聘岗位：'}${formData.position || notSpecified}${formData.department ? ` (${formData.department})` : ''}`,
      `${isEn ? 'Salary/Offered: ' : '薪资待遇：'}${formData.salary || formData.offered || notSpecified}`,
      `${isEn ? 'Location: ' : '面试地点：'}${formData.interviewLocation || formData.location || notSpecified}`,
      `${isEn ? 'PIC: ' : '经办顾问：'}${formData.picName || notSpecified}`,
      `${isEn ? 'Attendance Status: ' : '出席状态：'}${formData.normalizedStatus || formData.interviewStatus || (isEn ? 'Pending' : '待出席')}`,
      formData.remarks ? `${isEn ? 'Remarks: ' : '出席说明：'}${formData.remarks}` : '',
      formData.notes ? `${isEn ? 'Notes: ' : '面评备注：'}${formData.notes}` : ''
    ].filter(Boolean).join('\n');

    Utils.openGoogleCalendar({
      title: `${isEn ? 'Interview: ' : '面试：'}${formData.name || (isEn ? 'Candidate' : '候选人')} - ${formData.position || (isEn ? 'Role' : '岗位')} (${formData.company || (isEn ? 'Company' : '用人企业')})`,
      date: dateStr,
      time: timeStr,
      durationMinutes: 60,
      location: formData.interviewLocation || formData.location || formData.company || '',
      details
    });
  };

  const handleSyncReminderToGCal = (r) => {
    const isEn = lang === 'en';
    const notSpecified = isEn ? 'Not specified' : '未指定';
    const notProvided = isEn ? 'Not provided' : '未提供';
    const details = [
      `${isEn ? 'Candidate: ' : '候选人：'}${formData.name || currentCandidate?.name || notSpecified}`,
      `${isEn ? 'Phone: ' : '联系电话：'}${formData.phone || currentCandidate?.phone || notProvided}`,
      `${isEn ? 'Reminder: ' : '提醒内容：'}${r.content || (isEn ? 'Follow-up Reminder' : '跟进提醒')}`,
      `${isEn ? 'Company: ' : '关联企业：'}${formData.company || currentCandidate?.company || notSpecified}`,
      `${isEn ? 'Position: ' : '关联岗位：'}${formData.position || currentCandidate?.position || notSpecified}`
    ].filter(Boolean).join('\n');

    Utils.openGoogleCalendar({
      title: `${isEn ? 'Follow-up Reminder: ' : '跟进提醒：'}${formData.name || currentCandidate?.name || (isEn ? 'Candidate' : '候选人')} - ${r.content}`,
      date: r.date || Utils.formatDate(new Date()),
      time: r.time || '10:00',
      durationMinutes: 30,
      details
    });
  };

  const handleConfirmDrop = async () => {
    if (isReadOnlyView) return;
    if (!currentCandidate || !currentCandidate.id) return;
    setIsDropping(true);
    try {
      const now = new Date().toISOString();
      const reasonObj = Utils.DROP_REASONS.find(r => r.key === dropReason);
      const reasonLabel = reasonObj ? Utils.getDropReasonLabel(reasonObj.key, t) : dropReason;
      const combinedReason = dropNote.trim() ? `${reasonLabel} · ${dropNote.trim()}` : reasonLabel;

      const newHistory = [...(currentCandidate.stageHistory || []), {
        stage: 'rejected',
        reason: combinedReason,
        movedAt: now
      }];

      const updatePayload = {
        status: 'rejected',
        rejectReason: combinedReason,
        rejectNote: dropNote.trim(),
        rejectedAt: now,
        stageHistory: newHistory
      };

      await FirestoreStore.updateCandidate(teamId, currentCandidate.id, updatePayload);
      SystemLogger.audit(teamId, user, 'REJECT', 'CANDIDATE', currentCandidate.name, {
        actionDetail: `淘汰/放弃候选人: ${combinedReason}`
      });

      setCurrentCandidate(prev => ({
        ...prev,
        ...updatePayload
      }));

      setIsDropModalOpen(false);
      setDropNote('');
      showToast(t('candidates.drawer.dropSuccess'));
    } catch (e) {
      showToast(t('candidates.drawer.saveFailed') + e.message, 'error');
    } finally {
      setIsDropping(false);
    }
  };

  const handleRestoreCandidate = async () => {
    if (isReadOnlyView) return;
    if (!currentCandidate || !currentCandidate.id) return;
    const ok = await confirm(`${t('candidates.drawer.confirmRestorePre')}${currentCandidate.name}${t('candidates.drawer.confirmRestorePost')}`, {
      title: t('candidates.drawer.confirmRestoreTitle'),
      confirmLabel: t('candidates.drawer.confirmRestoreBtn')
    });
    if (!ok) return;

    try {
      const now = new Date().toISOString();
      const newHistory = [...(currentCandidate.stageHistory || []), {
        stage: 'screening',
        movedAt: now,
        note: '从淘汰状态重新激活'
      }];

      const updatePayload = {
        status: 'active',
        stage: 'screening',
        rejectReason: '',
        rejectNote: '',
        rejectedAt: null,
        stageHistory: newHistory
      };

      await FirestoreStore.updateCandidate(teamId, currentCandidate.id, updatePayload);
      SystemLogger.audit(teamId, user, 'RESTORE', 'CANDIDATE', currentCandidate.name, {
        actionDetail: '重新激活已淘汰候选人'
      });

      setCurrentCandidate(prev => ({
        ...prev,
        ...updatePayload
      }));

      setFormData(prev => ({
        ...prev,
        stage: 'screening'
      }));

      showToast(t('candidates.drawer.restoreSuccess'), 'success');
    } catch (e) {
      showToast(t('candidates.drawer.saveFailed') + e.message, 'error');
    }
  };

  const handleFileUpload = (e) => {
    if (isReadOnlyView) return;
    const file = e.target.files[0];
    if (!file || !currentCandidate) return;
    
    if (file.size > 700 * 1024) {
      showToast(t('candidates.drawer.toastFileTooLarge'), "warning");
      return;
    }

    setIsUploading(true);
    setUploadProgress(30); // Fake progress for UX

    const reader = new FileReader();
    reader.onload = async (event) => {
      setUploadProgress(70);
      try {
        const base64Data = event.target.result;
        const newResume = {
          dataUrl: base64Data,
          filename: file.name,
          fileSize: file.size,
          uploadedAt: new Date().toISOString()
        };
        const updatedResumes = [...(currentCandidate.resumes || []), newResume];
        await FirestoreStore.updateCandidate(teamId, currentCandidate.id, { resumes: updatedResumes });
        setCurrentCandidate(prev => ({
          ...prev,
          resumes: updatedResumes
        }));
        setUploadProgress(100);
        setTimeout(() => {
          setIsUploading(false);
          setUploadProgress(0);
          showToast(t('candidates.drawer.toastResumeUploaded'), "success");
        }, 500);
      } catch (error) {
        console.error(error);
        showToast(t('candidates.drawer.toastResumeUploadFailed') + error.message, "error");
        setIsUploading(false);
      }
    };
    reader.onerror = () => {
      showToast(t('candidates.drawer.toastReadFileFailed'), "error");
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteResume = async (index) => {
    if (isReadOnlyView) return;
    const ok = await confirm(t('candidates.drawer.confirmDeleteResumeText'), {
      title: t('candidates.drawer.confirmDeleteResumeTitle'),
      danger: true,
      confirmLabel: t('candidates.drawer.confirmDeleteResumeBtn')
    });
    if (!ok) return;
    if (!currentCandidate || !currentCandidate.id) return;
    try {
      const updatedResumes = [...(currentCandidate.resumes || [])];
      updatedResumes.splice(index, 1);
      await FirestoreStore.updateCandidate(teamId, currentCandidate.id, { resumes: updatedResumes });
      setCurrentCandidate(prev => ({
        ...prev,
        resumes: updatedResumes
      }));
      showToast(t('candidates.drawer.toastResumeDeleted'), "info");
    } catch (e) {
      showToast(t('candidates.drawer.toastDeleteResumeFailed') + e.message, "error");
    }
  };

  // Combine timeline events
  const timelineEvents = [];
  if (currentCandidate) {
    (currentCandidate.stageHistory || []).forEach(h => {
      timelineEvents.push({ type: 'stage', date: h.movedAt, data: h });
    });
    (currentCandidate.stageRemarks || []).forEach(r => {
      timelineEvents.push({ type: 'remark', date: r.createdAt, data: r });
    });
    timelineEvents.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  return createPortal(
    <>
      <div className={`drawer-overlay ${isOpen ? 'active' : ''}`} onClick={onClose}></div>
      <div className={`drawer-container ${isOpen ? 'open' : ''}`}>
        
        <div className="drawer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '600', fontSize: '1.25rem' }}>
              {formData.name ? formData.name.charAt(0) : '?'}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)', margin: 0, lineHeight: 1 }}>
                  {currentCandidate ? formData.name : t('candidates.drawer.newCandidate')}
                </h3>
                {formData.company && (
                  <span className="tag-pill" style={{ fontSize: '11px', padding: '2px 8px', background: 'rgba(59, 130, 246, 0.12)', color: 'var(--accent-blue)', border: '1px solid rgba(59, 130, 246, 0.3)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <i className="ph ph-buildings"></i> {formData.company}
                  </span>
                )}
              </div>
              {currentCandidate && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {formData.position || t('candidates.drawer.unsetRole')}{formData.department ? ` · ${formData.department}` : ''} · ID: {currentCandidate.id?.split('-')?.[1] || currentCandidate.id?.slice(0, 6)} · {Utils.formatRelativeTime(currentCandidate.createdAt, t, currentCandidate)} {t('candidates.drawer.inputRecord')}
                </div>
              )}
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            {isReadOnlyView && (
              <span 
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.75rem',
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-full)',
                  background: 'rgba(245, 158, 11, 0.12)',
                  color: 'var(--accent-amber)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  fontWeight: '600'
                }}
              >
                <i className="ph-bold ph-lock-key"></i> {t('team.readOnlyBadge', '单向只读')}
              </span>
            )}
            {currentCandidate && !isEditing && !isReadOnlyView && (
              <>
                {currentCandidate.status === 'rejected' ? (
                  <button 
                    className="btn btn-sm btn-secondary" 
                    onClick={handleRestoreCandidate}
                    title={t('candidates.drawer.reactivateTooltip')}
                    style={{ 
                      color: 'var(--accent-emerald)', 
                      borderColor: 'rgba(16, 185, 129, 0.4)', 
                      background: 'rgba(16, 185, 129, 0.08)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <i className="ph-bold ph-arrow-counter-clockwise"></i> {t('candidates.drawer.reactivateBtn')}
                  </button>
                ) : (
                  <button 
                    className="btn btn-sm btn-secondary" 
                    onClick={() => setIsDropModalOpen(true)}
                    title={t('candidates.drawer.dropTooltip')}
                    style={{ 
                      color: 'var(--accent-rose)', 
                      borderColor: 'rgba(244, 63, 94, 0.3)', 
                      background: 'rgba(244, 63, 94, 0.06)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <i className="ph-bold ph-x"></i> {t('candidates.drawer.dropBtn')}
                  </button>
                )}

                <div style={{ position: 'relative' }}>
                  {pencilHint && (
                    <div style={{
                      position: 'absolute',
                      right: 'calc(100% + 12px)',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'var(--accent-rose)',
                      color: '#fff',
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: '500',
                      whiteSpace: 'nowrap',
                      boxShadow: '0 4px 16px rgba(225, 29, 72, 0.4)',
                      animation: 'toastSlideIn 0.2s var(--ease-spring) forwards',
                      pointerEvents: 'none',
                      zIndex: 10
                    }}>
                      {pencilHint}
                      <div style={{
                        position: 'absolute',
                        right: '-5px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        borderTop: '5px solid transparent',
                        borderBottom: '5px solid transparent',
                        borderLeft: '5px solid var(--accent-rose)'
                      }}></div>
                    </div>
                  )}
                  <button className={`btn-icon ${pencilHint ? 'pulse-border' : ''}`} onClick={() => setIsEditing(true)} title={t('candidates.drawer.editBtnTitle')}>
                    <i className="ph-light ph-pencil-simple"></i>
                  </button>
                </div>
              </>
            )}
            {isEditing && !isReadOnlyView && (
              <button className="btn btn-primary btn-sm" onClick={handleSave} title={t('candidates.drawer.saveBtnTitle')}>
                <i className="ph-light ph-floppy-disk"></i> {t('candidates.drawer.saveBtn')}
              </button>
            )}
            {currentCandidate && !isReadOnlyView && (
              <button 
                className="btn-icon" 
                title={t('candidates.drawer.deleteBtnTitle')} 
                style={{ color: 'var(--accent-rose)' }} 
                onClick={handleDeleteCandidate}
              >
                <i className="ph-light ph-trash"></i>
              </button>
            )}
            <button className="btn-icon" onClick={onClose} title={t('candidates.drawer.closeBtnTitle')}>
              <i className="ph-light ph-x"></i>
            </button>
          </div>
        </div>

        {/* Tabs */}
        {currentCandidate && (
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-hairline)', padding: '0 var(--space-6)', gap: 'var(--space-2)' }}>
            {['profile', 'dossier', 'timeline', 'reminders'].map(tab => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: 'var(--space-3) var(--space-2)',
                  color: activeTab === tab ? 'var(--accent-blue)' : 'var(--text-muted)',
                  borderBottom: `2px solid ${activeTab === tab ? 'var(--accent-blue)' : 'transparent'}`,
                  fontSize: 'var(--text-sm)',
                  fontWeight: activeTab === tab ? '600' : '500'
                }}
              >
                {tab === 'profile' ? t('candidates.drawer.tabProfile') : tab === 'dossier' ? t('candidates.drawer.tabDossier') : tab === 'timeline' ? t('candidates.drawer.tabTimeline') : t('candidates.drawer.tabReminders')}
              </button>
            ))}
          </div>
        )}

        <div className="drawer-body">
          {currentCandidate?.status === 'rejected' && (
            <div style={{
              background: 'rgba(244, 63, 94, 0.08)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-3) var(--space-4)',
              marginBottom: 'var(--space-4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="ph-fill ph-x-circle" style={{ color: 'var(--accent-rose)', fontSize: '1.25rem' }}></i>
                <div>
                  <div style={{ color: 'var(--accent-rose)', fontWeight: '600', fontSize: 'var(--text-sm)' }}>
                    {t('candidates.drawer.rejectedBannerTitle')}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>
                    {t('candidates.drawer.rejectedReasonLabel')}{Utils.getDropReasonLabel(currentCandidate.rejectReason, t) || t('candidates.drawer.unspecifiedReason')}
                    {currentCandidate.rejectedAt && ` · ${Utils.formatRelativeTime(currentCandidate.rejectedAt)}`}
                  </div>
                </div>
              </div>
              {!isReadOnlyView && (
                <button 
                  className="btn btn-sm btn-secondary" 
                  onClick={handleRestoreCandidate}
                  style={{ borderColor: 'rgba(16, 185, 129, 0.4)', color: 'var(--accent-emerald)', background: 'rgba(16, 185, 129, 0.08)' }}
                >
                  <i className="ph-bold ph-arrow-counter-clockwise"></i> {t('candidates.drawer.reactivateFlowBtn')}
                </button>
              )}
            </div>
          )}
          
          {activeTab === 'profile' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              
              {/* AI Auto-Fill Widget */}
              {isEditing && (
                <div style={{
                  background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(139, 92, 246, 0.08))',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-3) var(--space-4)',
                  transition: 'all 0.2s ease'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '28px', height: '28px', borderRadius: '8px',
                        background: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent-blue)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px'
                      }}>
                        <i className="ph-fill ph-sparkle"></i>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {t('candidates.drawer.aiWidgetTitle')}
                          <span style={{ fontSize: '10px', background: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent-blue)', padding: '1px 6px', borderRadius: '10px', fontWeight: '500' }}>{t('candidates.drawer.aiWidgetBadge')}</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {t('candidates.drawer.aiWidgetSubtitle')}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => setShowDrawerAiParser(!showDrawerAiParser)}
                      style={{ fontSize: '11px', padding: '3px 10px', color: 'var(--accent-blue)', borderColor: 'rgba(59, 130, 246, 0.3)' }}
                    >
                      {showDrawerAiParser ? t('candidates.drawer.aiCollapse') : t('candidates.drawer.aiExpand')}
                    </button>
                  </div>

                  {showDrawerAiParser && (
                    <div style={{ marginTop: 'var(--space-3)', paddingTop: 'var(--space-3)', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                      {aiParseError && (
                        <div style={{ color: 'var(--accent-rose)', fontSize: '0.75rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <i className="ph-bold ph-warning-circle"></i> {aiParseError}
                        </div>
                      )}

                      {/* Mode buttons */}
                      <div style={{ display: 'flex', gap: '8px', marginBottom: 'var(--space-3)' }}>
                        <button
                          type="button"
                          onClick={() => { setAiParseTab('file'); setAiParseError(''); }}
                          style={{
                            padding: '4px 10px', borderRadius: 'var(--radius-pill)', border: 'none',
                            background: aiParseTab === 'file' ? 'var(--accent-blue)' : 'rgba(255,255,255,0.05)',
                            color: aiParseTab === 'file' ? '#fff' : 'var(--text-muted)',
                            fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                          }}
                        >
                          <i className="ph-light ph-file-pdf"></i> {t('candidates.drawer.aiUploadFileTab')}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setAiParseTab('text'); setAiParseError(''); }}
                          style={{
                            padding: '4px 10px', borderRadius: 'var(--radius-pill)', border: 'none',
                            background: aiParseTab === 'text' ? 'var(--accent-blue)' : 'rgba(255,255,255,0.05)',
                            color: aiParseTab === 'text' ? '#fff' : 'var(--text-muted)',
                            fontSize: '11px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                          }}
                        >
                          <i className="ph-light ph-textbox"></i> {t('candidates.drawer.aiPasteTextTab')}
                        </button>
                      </div>

                      {aiParseTab === 'file' ? (
                        <div>
                          <input
                            ref={drawerFileInputRef}
                            type="file"
                            accept=".pdf,.docx,.doc,.txt"
                            onChange={(e) => {
                              if (e.target.files && e.target.files[0]) {
                                setAiFile(e.target.files[0]);
                                setAiParseError('');
                              }
                            }}
                            style={{ display: 'none' }}
                          />
                          <div
                            onClick={() => drawerFileInputRef.current?.click()}
                            style={{
                              border: '1px dashed var(--border-interactive)',
                              borderRadius: 'var(--radius-md)',
                              padding: 'var(--space-3)',
                              textAlign: 'center',
                              background: aiFile ? 'rgba(59, 130, 246, 0.05)' : 'rgba(0,0,0,0.15)',
                              cursor: 'pointer'
                            }}
                          >
                            <span style={{ fontSize: '0.8rem', color: aiFile ? 'var(--accent-blue)' : 'var(--text-muted)' }}>
                              {aiFile ? `${t('candidates.drawer.aiSelectedPrefix')}${aiFile.name} (${(aiFile.size/1024).toFixed(1)} KB)` : t('candidates.drawer.aiSelectFilePrompt')}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <textarea
                          className="form-input"
                          rows="4"
                          placeholder={t('candidates.drawer.aiPastePlaceholder')}
                          value={aiText}
                          onChange={(e) => setAiText(e.target.value)}
                          style={{ width: '100%', fontSize: '0.8rem', lineHeight: '1.5', background: 'rgba(0,0,0,0.2)' }}
                        ></textarea>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-3)' }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={handleDrawerAiParse}
                          disabled={isAiParsing || (aiParseTab === 'file' ? !aiFile : !aiText.trim())}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px' }}
                        >
                          {isAiParsing ? (
                            <><i className="ph-light ph-spinner ph-spin"></i> {t('candidates.drawer.aiExtracting')}</>
                          ) : (
                            <><i className="ph-light ph-magic-wand"></i> {t('candidates.drawer.aiStartParseBtn')}</>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="form-section">
                <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-faint)', letterSpacing: '0.05em', marginBottom: 'var(--space-3)' }}>{t('candidates.drawer.sectionBasic')}</h4>
                
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">{t('candidates.drawer.labelName')} <span className="required">*</span></label>
                    <input type="text" className="form-input" name="name" value={formData.name || ''} onChange={handleChange} readOnly={!isEditing} onClick={() => handleFieldClickHint()} placeholder={t('candidates.drawer.placeholderName')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{t('candidates.drawer.labelPhone')}</span>
                      {!isEditing && formData.phone && (
                        <WhatsAppButton phone={formData.phone} candidateName={formData.name} variant="icon" />
                      )}
                    </label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <input 
                        type="tel" 
                        className="form-input" 
                        name="phone" 
                        value={formData.phone || ''} 
                        onChange={handleChange} 
                        readOnly={!isEditing} 
                        onClick={() => handleFieldClickHint()}
                        placeholder={t('candidates.drawer.placeholderPhone')}
                        style={{ paddingRight: isEditing && formData.phone ? '36px' : undefined }}
                      />
                      {isEditing && formData.phone && (
                        <div style={{ position: 'absolute', right: '4px' }}>
                          <WhatsAppButton phone={formData.phone} candidateName={formData.name} variant="icon" />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('candidates.drawer.labelIc')}</label>
                    <input type="text" className="form-input" name="icNo" value={formData.icNo || ''} onChange={handleChange} readOnly={!isEditing} onClick={() => handleFieldClickHint()} placeholder={t('candidates.drawer.placeholderIc')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('candidates.drawer.labelAge')}</label>
                    <input type="text" className="form-input" name="age" value={formData.age || ''} onChange={handleChange} readOnly={!isEditing} onClick={() => handleFieldClickHint()} placeholder={t('candidates.drawer.placeholderAge')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('candidates.drawer.labelDegree')}</label>
                    <input type="text" className="form-input" name="degree" value={formData.degree || formData.school || ''} onChange={handleChange} readOnly={!isEditing} onClick={() => handleFieldClickHint()} placeholder={t('candidates.drawer.placeholderDegree')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('candidates.drawer.labelLocation')}</label>
                    <input type="text" className="form-input" name="location" value={formData.location || ''} onChange={handleChange} readOnly={!isEditing} onClick={() => handleFieldClickHint()} placeholder={t('candidates.drawer.placeholderLocation')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('candidates.drawer.labelNationality')}</label>
                    <input type="text" className="form-input" name="nationality" value={formData.nationality || ''} onChange={handleChange} readOnly={!isEditing} onClick={() => handleFieldClickHint()} placeholder={t('candidates.drawer.placeholderNationality')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('candidates.drawer.labelRace')}</label>
                    <input type="text" className="form-input" name="race" value={formData.race || ''} onChange={handleChange} readOnly={!isEditing} onClick={() => handleFieldClickHint()} placeholder={t('candidates.drawer.placeholderRace')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('candidates.drawer.labelGender')}</label>
                    <input type="text" className="form-input" name="gender" value={formData.gender || ''} onChange={handleChange} readOnly={!isEditing} onClick={() => handleFieldClickHint()} placeholder={t('candidates.drawer.placeholderGender')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('candidates.drawer.labelMaritalStatus')}</label>
                    <input type="text" className="form-input" name="maritalStatus" value={formData.maritalStatus || ''} onChange={handleChange} readOnly={!isEditing} onClick={() => handleFieldClickHint()} placeholder={t('candidates.drawer.placeholderMaritalStatus')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('candidates.drawer.labelAvailability')}</label>
                    <input type="text" className="form-input" name="availability" value={formData.availability || ''} onChange={handleChange} readOnly={!isEditing} onClick={() => handleFieldClickHint()} placeholder={t('candidates.drawer.placeholderAvailability')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('candidates.drawer.labelLanguages')}</label>
                    {isEditing ? (
                      <input 
                        type="text" 
                        className="form-input" 
                        name="languages" 
                        value={formData.languagesRaw !== undefined ? formData.languagesRaw : (Array.isArray(formData.languages) ? formData.languages.join(', ') : (formData.languages || ''))} 
                        onChange={handleLanguagesChange} 
                        placeholder={t('candidates.drawer.placeholderLanguages')} 
                      />
                    ) : (
                      <div 
                        onClick={() => handleFieldClickHint()} 
                        style={{ minHeight: '38px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', cursor: 'pointer', padding: '4px 0' }}
                      >
                        {Array.isArray(formData.languages) && formData.languages.length > 0 ? (
                          formData.languages.map((lang, lIdx) => (
                            <span key={lIdx} className="tag-pill" style={{ background: 'rgba(59, 130, 246, 0.12)', color: 'var(--accent-blue)', border: '1px solid rgba(59, 130, 246, 0.3)', fontSize: '11px', padding: '2px 8px' }}>
                              {lang}
                            </span>
                          ))
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>-</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="form-section">
                <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-faint)', letterSpacing: '0.05em', marginBottom: 'var(--space-3)' }}>{t('candidates.drawer.sectionJob')}</h4>
                
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <i className="ph ph-buildings" style={{ color: 'var(--accent-blue)' }}></i> {t('candidates.drawer.labelCompany')}
                    </label>
                    <input 
                      type="text" 
                      className="form-input" 
                      name="company" 
                      value={formData.company || ''} 
                      onChange={handleChange} 
                      readOnly={!isEditing} 
                      onClick={() => handleFieldClickHint()} 
                      placeholder={t('candidates.drawer.placeholderCompany')} 
                      style={{ fontWeight: formData.company ? '600' : 'normal', color: formData.company ? 'var(--text-primary)' : 'inherit' }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('candidates.drawer.labelPosition')}</label>
                    <input type="text" className="form-input" name="position" value={formData.position || ''} onChange={handleChange} readOnly={!isEditing} onClick={() => handleFieldClickHint()} placeholder={t('candidates.drawer.placeholderPosition')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('candidates.drawer.labelDepartment')}</label>
                    <input type="text" className="form-input" name="department" value={formData.department || ''} onChange={handleChange} readOnly={!isEditing} onClick={() => handleFieldClickHint()} placeholder={t('candidates.drawer.placeholderDepartment')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('candidates.drawer.labelOffered')}</label>
                    <input type="text" className="form-input" name="offered" value={formData.offered || formData.salary || ''} onChange={handleChange} readOnly={!isEditing} onClick={() => handleFieldClickHint()} placeholder={t('candidates.drawer.placeholderOffered')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('candidates.drawer.labelLastDrawnSalary')}</label>
                    <input type="text" className="form-input" name="lastDrawnSalary" value={formData.lastDrawnSalary || ''} onChange={handleChange} readOnly={!isEditing} onClick={() => handleFieldClickHint()} placeholder={t('candidates.drawer.placeholderLastDrawnSalary')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('candidates.drawer.labelExpectedSalary')}</label>
                    <input type="text" className="form-input" name="expectedSalary" value={formData.expectedSalary || ''} onChange={handleChange} readOnly={!isEditing} onClick={() => handleFieldClickHint()} placeholder={t('candidates.drawer.placeholderExpectedSalary')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('candidates.drawer.labelExperience')}</label>
                    <input type="text" className="form-input" name="experience" value={formData.experience || ''} onChange={handleChange} readOnly={!isEditing} onClick={() => handleFieldClickHint()} placeholder={t('candidates.drawer.placeholderExperience')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('candidates.drawer.labelPic')}</label>
                    {!isEditing ? (
                      <div 
                        className="form-input" 
                        onClick={() => handleFieldClickHint()} 
                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.03)' }}
                      >
                        <i className="ph-bold ph-user-circle" style={{ color: 'var(--accent-blue)', fontSize: '1.1rem' }}></i>
                        <span style={{ fontWeight: formData.picName ? 500 : 400, color: formData.picName ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                          {formData.picName || t('common.unassigned', '未分配顾问')}
                        </span>
                      </div>
                    ) : isCustomPic ? (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input 
                          type="text" 
                          className="form-input" 
                          name="picName" 
                          value={formData.picName || ''} 
                          onChange={handleChange} 
                          placeholder={t('candidates.drawer.placeholderPic')} 
                        />
                        <button 
                          type="button" 
                          className="btn btn-secondary btn-sm" 
                          onClick={() => setIsCustomPic(false)}
                          title="从在册团队成员中选择"
                          style={{ padding: '0 10px', whiteSpace: 'nowrap', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <i className="ph-bold ph-list"></i>
                          <span>列表</span>
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <select 
                          className="form-select" 
                          value={formData.picName || ''} 
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '__custom__') {
                              setIsCustomPic(true);
                              return;
                            }
                            const matched = teamMembers.find(m => (m.displayName || m.name || m.email?.split('@')[0]) === val);
                            setFormData(prev => ({
                              ...prev,
                              picName: val,
                              assignedTo: matched ? matched.id : ''
                            }));
                          }}
                        >
                          <option value="">{t('common.selectPic', '-- 请选择经办顾问 (PIC) --')}</option>
                          {teamMembers.map(m => {
                            const name = m.displayName || m.name || m.email?.split('@')[0];
                            return (
                              <option key={m.id} value={name}>
                                {name} {m.role ? `(${m.role})` : ''}
                              </option>
                            );
                          })}
                          {formData.picName && !teamMembers.some(m => (m.displayName || m.name || m.email?.split('@')[0]) === formData.picName) && (
                            <option value={formData.picName}>
                              {formData.picName} (现有/历史)
                            </option>
                          )}
                          <option value="__custom__">➕ 手动输入其他顾问...</option>
                        </select>
                      </div>
                    )}
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">{t('candidates.drawer.labelStage')}</label>
                    <div style={{ position: 'relative' }} onClick={() => handleFieldClickHint(true)}>
                      {!isEditing && <div style={{ position: 'absolute', inset: 0, zIndex: 5, cursor: 'pointer' }}></div>}
                      <select className="form-select" name="stage" value={formData.stage || 'screening'} onChange={handleChange} disabled={!isEditing}>
                        {Object.values(Utils.STAGES).map(stage => {
                          const meta = Utils.getStageMeta(stage.key, t);
                          return <option key={stage.key} value={stage.key}>{meta.label}</option>;
                        })}
                      </select>
                    </div>
                  </div>

                  {(formData.stage === 'interview' || formData.interviewDate) && (
                    <>
                      <div className="form-group" style={{ gridColumn: '1 / -1' }} ref={interviewSectionRef}>
                        <div className="form-grid-2" style={{ padding: 'var(--space-4)', background: 'rgba(59, 130, 246, 0.05)', borderRadius: 'var(--radius-md)', border: '1px dashed rgba(59, 130, 246, 0.3)' }}>
                          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h5 style={{ margin: 0, fontSize: '0.85rem', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <i className="ph-fill ph-calendar-check"></i> {t('candidates.drawer.sectionInterview')}
                            </h5>
                            {formData.interviewDate && (
                              <button
                                type="button"
                                className="btn btn-secondary btn-xs"
                                style={{
                                  fontSize: '11px',
                                  padding: '2px 8px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  color: 'var(--accent-blue)',
                                  borderColor: 'rgba(59, 130, 246, 0.3)'
                                }}
                                onClick={handleSyncInterviewToGCal}
                                title={t('candidates.drawer.gcalTooltip')}
                              >
                                <i className="ph-light ph-calendar-plus" style={{ fontSize: '13px' }}></i>
                                <span>{t('candidates.drawer.gcalBtn')}</span>
                              </button>
                            )}
                          </div>
                          
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">{t('candidates.drawer.labelInterviewDate')}</label>
                            <input
                              ref={interviewDateInputRef}
                              type="date"
                              className="form-input"
                              name="interviewDate"
                              value={isIsoDate(formData.interviewDate) ? formData.interviewDate : ''}
                              onChange={handleChange}
                              disabled={!isEditing}
                            />
                            {formData.interviewDate && !isIsoDate(formData.interviewDate) && (
                              <div style={{ fontSize: '11px', color: 'var(--accent-amber)', marginTop: '4px' }}>
                                {t('candidates.drawer.legacyInterviewDateHint', { value: String(formData.interviewDate) }, '原始记录「{value}」无法识别为日期，请重新选择')}
                              </div>
                            )}
                          </div>

                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">{t('candidates.drawer.labelInterviewTime', '面试时间')}</label>
                            <input
                              type="time"
                              className="form-input"
                              name="interviewTime"
                              value={isHhMm(formData.interviewTime) ? formData.interviewTime : ''}
                              onChange={handleChange}
                              disabled={!isEditing}
                            />
                          </div>

                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">{t('candidates.drawer.labelReminderLead', '自动提醒')}</label>
                            <select
                              className="form-select"
                              name="interviewReminderLead"
                              value={formData.interviewReminderLead || DEFAULT_INTERVIEW_REMINDER_LEAD}
                              onChange={handleChange}
                              disabled={!isEditing}
                            >
                              {INTERVIEW_REMINDER_LEADS.map(lead => (
                                <option key={lead} value={lead}>{t(`candidates.drawer.reminderLead_${lead}`)}</option>
                              ))}
                            </select>
                          </div>

                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">{t('candidates.drawer.labelStatus')}</label>
                            <select 
                              className="form-select" 
                              name="normalizedStatus" 
                              value={formData.normalizedStatus || formData.interviewStatus || 'pending'} 
                              onChange={handleChange} 
                              disabled={!isEditing}
                            >
                              <option value="attended">{t('candidates.drawer.statusAttended')}</option>
                              <option value="no_show">{t('candidates.drawer.statusNoShow')}</option>
                              <option value="unable_to_attend">{t('candidates.drawer.statusUnable')}</option>
                              <option value="pending">{t('candidates.drawer.statusPending')}</option>
                            </select>
                          </div>
                          
                          <div className="form-group" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
                            <label className="form-label">{t('candidates.drawer.labelInterviewLocation')}</label>
                            <input type="text" className="form-input" name="interviewLocation" value={formData.interviewLocation || ''} onChange={handleChange} readOnly={!isEditing} placeholder={t('candidates.drawer.placeholderInterviewLocation')} />
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Sunrise CV Professional History Section */}
              <div className="form-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                  <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-faint)', letterSpacing: '0.05em', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="ph ph-briefcase" style={{ color: 'var(--accent-purple)' }}></i>
                    {t('candidates.drawer.sectionWorkHistory')}
                  </h4>
                  {isEditing && (
                    <button
                      type="button"
                      className="btn btn-xs btn-secondary"
                      onClick={handleAddWorkExp}
                      style={{ fontSize: '11px', padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--accent-purple)', borderColor: 'rgba(168, 85, 247, 0.3)' }}
                    >
                      <i className="ph ph-plus"></i> {t('candidates.drawer.addWorkHistoryBtn')}
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {Array.isArray(formData.workExperience) && formData.workExperience.length > 0 ? (
                    formData.workExperience.map((job, jIdx) => (
                      <div
                        key={jIdx}
                        style={{
                          background: 'var(--card-bg, rgba(255, 255, 255, 0.02))',
                          border: '1px solid var(--border-hairline, rgba(255, 255, 255, 0.08))',
                          borderRadius: 'var(--radius-md)',
                          padding: 'var(--space-4)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 'var(--space-3)',
                          position: 'relative'
                        }}
                      >
                        {isEditing && (
                          <button
                            type="button"
                            onClick={() => handleRemoveWorkExp(jIdx)}
                            className="btn-icon"
                            style={{ position: 'absolute', top: '10px', right: '10px', color: 'var(--accent-rose)', width: '24px', height: '24px' }}
                            title="删除此段履历"
                          >
                            <i className="ph ph-trash" style={{ fontSize: '13px' }}></i>
                          </button>
                        )}

                        {/* Top row: Company, Position, Period */}
                        <div style={{ display: 'grid', gridTemplateColumns: isEditing ? '1fr 1fr 1fr' : '1fr 1fr auto', gap: 'var(--space-3)', alignItems: 'center', paddingRight: isEditing ? '28px' : 0 }}>
                          {isEditing ? (
                            <>
                              <div>
                                <label className="form-label" style={{ fontSize: '11px' }}>公司名称</label>
                                <input type="text" className="form-input" value={job.company || ''} onChange={(e) => handleWorkExpChange(jIdx, 'company', e.target.value)} placeholder="如 Company Name" />
                              </div>
                              <div>
                                <label className="form-label" style={{ fontSize: '11px' }}>任职岗位</label>
                                <input type="text" className="form-input" value={job.position || ''} onChange={(e) => handleWorkExpChange(jIdx, 'position', e.target.value)} placeholder="如 Position" />
                              </div>
                              <div>
                                <label className="form-label" style={{ fontSize: '11px' }}>{t('candidates.drawer.labelPeriod')}</label>
                                <input type="text" className="form-input" value={job.period || ''} onChange={(e) => handleWorkExpChange(jIdx, 'period', e.target.value)} placeholder={t('candidates.drawer.placeholderPeriod')} />
                              </div>
                            </>
                          ) : (
                            <>
                              <div>
                                <span style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '0.9rem' }}>{job.company || '未注明公司'}</span>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '2px' }}>{job.position || '未注明岗位'}</div>
                              </div>
                              <div style={{ textAlign: 'left' }}>
                                {job.last_drawn_salary && (
                                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>薪资: {job.last_drawn_salary}</span>
                                )}
                              </div>
                              <span className="tag-pill" style={{ background: 'rgba(255, 255, 255, 0.06)', color: 'var(--text-muted)', fontSize: '11px', padding: '2px 8px' }}>
                                {job.period || '时间待补充'}
                              </span>
                            </>
                          )}
                        </div>

                        {/* Reason for leaving (Sunrise CV Core Highlight) */}
                        <div>
                          {isEditing ? (
                            <div>
                              <label className="form-label" style={{ fontSize: '11px', color: 'var(--accent-amber)' }}>
                                <i className="ph ph-door-open"></i> {t('candidates.drawer.labelReasonForLeaving')}
                              </label>
                              <input
                                type="text"
                                className="form-input"
                                value={job.reason_for_leaving || ''}
                                onChange={(e) => handleWorkExpChange(jIdx, 'reason_for_leaving', e.target.value)}
                                placeholder={t('candidates.drawer.placeholderReasonForLeaving')}
                                style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}
                              />
                            </div>
                          ) : (
                            job.reason_for_leaving ? (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', padding: '3px 10px', borderRadius: 'var(--radius-sm)', fontSize: '12px', color: 'var(--accent-amber)' }}>
                                <i className="ph-bold ph-door-open"></i>
                                <span><strong>{t('candidates.drawer.labelReasonForLeaving')}:</strong> {job.reason_for_leaving}</span>
                              </div>
                            ) : null
                          )}
                        </div>

                        {/* Responsibilities */}
                        <div>
                          {isEditing ? (
                            <div>
                              <label className="form-label" style={{ fontSize: '11px' }}>{t('candidates.drawer.labelResponsibilities')}</label>
                              <textarea
                                className="form-textarea"
                                rows="3"
                                value={Array.isArray(job.responsibilities) ? job.responsibilities.join('\n') : (job.responsibilities || '')}
                                onChange={(e) => {
                                  const lines = e.target.value.split('\n');
                                  handleWorkExpChange(jIdx, 'responsibilities', lines);
                                }}
                                placeholder={t('candidates.drawer.placeholderResponsibilities')}
                                style={{ fontSize: '12px' }}
                              ></textarea>
                            </div>
                          ) : (
                            Array.isArray(job.responsibilities) && job.responsibilities.length > 0 ? (
                              <ul style={{ margin: '4px 0 0 16px', padding: 0, color: 'var(--text-secondary)', fontSize: '12px', lineHeight: '1.6' }}>
                                {job.responsibilities.map((resp, rIdx) => (
                                  <li key={rIdx}>{resp}</li>
                                ))}
                              </ul>
                            ) : (
                              typeof job.responsibilities === 'string' && job.responsibilities ? (
                                <div style={{ color: 'var(--text-secondary)', fontSize: '12px', whiteSpace: 'pre-wrap' }}>{job.responsibilities}</div>
                              ) : null
                            )
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div
                      onClick={() => !isEditing && showPencilHint(t('candidates.drawer.clickPencilHint'))}
                      style={{
                        padding: 'var(--space-4)',
                        textAlign: 'center',
                        color: 'var(--text-muted)',
                        background: 'rgba(255, 255, 255, 0.02)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '12px',
                        cursor: !isEditing ? 'pointer' : 'default',
                        border: '1px dashed var(--border-hairline)'
                      }}
                    >
                      {t('candidates.drawer.noWorkHistory')}
                    </div>
                  )}
                </div>
              </div>

              <div className="form-section">
                <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-faint)', letterSpacing: '0.05em', marginBottom: 'var(--space-3)' }}>{t('candidates.drawer.sectionRemarks')}</h4>
                <div className="form-group" style={{ marginBottom: 'var(--space-3)' }}>
                  <label className="form-label">{t('candidates.drawer.labelRemarks')}</label>
                  <input type="text" className="form-input" name="remarks" value={formData.remarks || formData.rawStatus || ''} onChange={handleChange} readOnly={!isEditing} onClick={() => handleFieldClickHint()} placeholder={t('candidates.drawer.placeholderRemarks')} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('candidates.drawer.labelNotes')}</label>
                  <textarea className="form-textarea" name="notes" value={formData.notes || ''} onChange={handleChange} readOnly={!isEditing} onClick={() => handleFieldClickHint()} placeholder={t('candidates.drawer.placeholderNotes')}></textarea>
                </div>
              </div>

            </div>
          )}
          {activeTab === 'dossier' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
              
              {/* Remarks Section */}
              <div>
                <h4 style={{ color: 'var(--text-primary)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="ph-light ph-notebook" style={{ color: 'var(--accent-purple)' }}></i> {t('candidates.drawer.dossierDeepRemarks')}
                </h4>
                <textarea 
                  className="form-textarea" 
                  name="remarks" 
                  value={formData.remarks || ''} 
                  onChange={handleChange} 
                  readOnly={!isEditing} 
                  onClick={() => handleFieldClickHint()} 
                  placeholder={t('candidates.drawer.placeholderDossierRemarks')}
                  style={{ minHeight: '120px' }}
                ></textarea>
                {isEditing && (
                  <div style={{ color: 'var(--text-faint)', fontSize: '11px', marginTop: '6px' }}>
                    {t('candidates.drawer.saveReminderHint')}
                  </div>
                )}
              </div>

              <div style={{ width: '100%', height: '1px', background: 'var(--border-hairline)' }}></div>

              {/* Resumes Section */}
              <div>
                <h4 style={{ color: 'var(--text-primary)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="ph-light ph-file-pdf" style={{ color: 'var(--accent-rose)' }}></i> {t('candidates.drawer.dossierResumes')} ({currentCandidate?.resumes?.length || 0})
                </h4>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                  {(currentCandidate?.resumes || []).map((resume, idx) => (
                    <div key={idx} style={{ 
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                      background: 'var(--bg-card)', padding: 'var(--space-3)', 
                      borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' 
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                        <i className="ph-fill ph-file-text" style={{ fontSize: '1.5rem', color: 'var(--accent-rose)', flexShrink: 0 }}></i>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div 
                            title={resume.filename}
                            style={{ 
                              color: 'var(--text-primary)', 
                              fontSize: 'var(--text-sm)', 
                              fontWeight: '500',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}
                          >
                            {resume.filename}
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {resume.fileSize && `${Math.round(resume.fileSize / 1024)} KB · `}{t('candidates.drawer.uploadedAtPrefix')}{Utils.formatDateTime(resume.uploadedAt)}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexShrink: 0, marginLeft: '12px' }}>
                        <a href={resume.dataUrl || resume.url} download={resume.filename} className="btn btn-sm btn-secondary" style={{ color: 'var(--accent-blue)', borderColor: 'rgba(59,130,246,0.3)' }}>
                          {t('candidates.drawer.downloadResumeBtn')}
                        </a>
                        {!isReadOnlyView && (
                          <button className="btn-icon" onClick={() => handleDeleteResume(idx)} title={t('candidates.drawer.deleteResumeBtnTitle')} style={{ color: 'var(--accent-rose)' }}>
                            <i className="ph-light ph-trash"></i>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {(!currentCandidate?.resumes || currentCandidate.resumes.length === 0) && (
                    <div style={{ textAlign: 'center', padding: 'var(--space-4)', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)' }}>
                      {t('candidates.drawer.emptyResumes')}
                    </div>
                  )}
                </div>

                {!isReadOnlyView && (
                  <>
                    <div style={{ position: 'relative', overflow: 'hidden', display: 'inline-block' }}>
                      <button className="btn btn-secondary" disabled={isUploading} style={{ background: 'var(--bg-card)' }}>
                        <i className={`ph-light ${isUploading ? 'ph-spinner ph-spin' : 'ph-upload-simple'}`}></i> 
                        {isUploading ? `${t('candidates.drawer.uploadingResume')} ${Math.round(uploadProgress)}%` : t('candidates.drawer.dossierUploadResume')}
                      </button>
                      <input 
                        type="file" 
                        onChange={handleFileUpload} 
                        disabled={isUploading}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          opacity: 0,
                          width: '100%',
                          height: '100%',
                          cursor: 'pointer'
                        }}
                      />
                    </div>
                    <div style={{ color: 'var(--text-faint)', fontSize: '11px', marginTop: '6px' }}>
                      {t('candidates.drawer.uploadResumeHint')}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {activeTab === 'timeline' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {timelineEvents.map((evt, idx) => {
                if (evt.type === 'stage') {
                  const isRejectEvent = evt.data.stage === 'rejected';
                  const stageMeta = Utils.getStageMeta(evt.data.stage, t);
                  const dotColor = isRejectEvent ? 'var(--accent-rose)' : stageMeta.color;
                  return (
                    <div key={`stage-${idx}`} style={{ display: 'flex', gap: 'var(--space-3)', position: 'relative' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: dotColor, boxShadow: `0 0 8px ${dotColor}88`, zIndex: 2 }}></div>
                        {idx !== timelineEvents.length - 1 && (
                          <div style={{ width: '2px', flex: 1, background: 'var(--border-interactive)', marginTop: '4px' }}></div>
                        )}
                      </div>
                      <div style={{ paddingBottom: 'var(--space-4)' }}>
                        <div style={{ color: isRejectEvent ? 'var(--accent-rose)' : 'var(--text-primary)', fontSize: 'var(--text-sm)', fontWeight: isRejectEvent ? '600' : '500' }}>
                          {isRejectEvent ? t('candidates.drawer.timelineTerminated') : `${t('candidates.drawer.timelineChangedTo')}${stageMeta.label}`}
                        </div>
                        {evt.data.reason && (
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '2px' }}>
                            {t('candidates.drawer.rejectedReasonLabel')}{Utils.getDropReasonLabel(evt.data.reason, t)}
                          </div>
                        )}
                        {evt.data.note && (
                          <div style={{ color: 'var(--text-faint)', fontSize: '0.75rem', marginTop: '2px' }}>
                            {evt.data.note}
                          </div>
                        )}
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '2px' }}>{Utils.formatDateTime(evt.date)}</div>
                      </div>
                    </div>
                  );
                } else if (evt.type === 'remark') {
                  return (
                    <div key={`remark-${idx}`} style={{ display: 'flex', gap: 'var(--space-3)', position: 'relative' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'transparent', border: '2px solid var(--accent-amber)', zIndex: 2 }}></div>
                        {idx !== timelineEvents.length - 1 && (
                          <div style={{ width: '2px', flex: 1, background: 'var(--border-interactive)', marginTop: '4px' }}></div>
                        )}
                      </div>
                      <div style={{ paddingBottom: 'var(--space-4)', flex: 1 }}>
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                          <div style={{ color: 'var(--accent-amber)', fontSize: '0.75rem', fontWeight: '600', marginBottom: 'var(--space-1)' }}>
                            <i className="ph-light ph-note-pencil"></i> {t('candidates.drawer.timelineSnoozeTitle')}
                          </div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>{t('candidates.drawer.rejectedReasonLabel')}{evt.data.reason}</div>
                          <div style={{ color: 'var(--text-faint)', fontSize: '0.7rem', marginTop: 'var(--space-2)' }}>{t('candidates.drawer.timelineSnoozeUntil')}{evt.data.snoozeUntil}</div>
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '4px' }}>{Utils.formatDateTime(evt.date)}</div>
                      </div>
                    </div>
                  );
                }
                return null;
              })}
              {timelineEvents.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 'var(--space-6) 0' }}>{t('candidates.drawer.timelineEmpty')}</div>
              )}
            </div>
          )}

          {activeTab === 'reminders' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {!isReadOnlyView && (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setIsAddingReminder(!isAddingReminder); setReminderError(''); }}>
                    <i className={`ph-light ${isAddingReminder ? 'ph-x' : 'ph-plus'}`}></i> {isAddingReminder ? t('candidates.drawer.dropModalCancel') : t('candidates.drawer.addReminderBtn')}
                  </button>
                </div>
              )}

              {isAddingReminder && (
                <div style={{ background: 'var(--bg-card)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-interactive)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <div className="form-grid-2">
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">{t('candidates.drawer.labelReminderDate')} <span className="required">*</span></label>
                      <input 
                        type="date" 
                        className="form-input" 
                        style={reminderError === 'date' ? { borderColor: 'var(--accent-rose)', boxShadow: '0 0 0 1px var(--accent-rose)' } : undefined}
                        value={newReminder.date} 
                        onChange={e => { setNewReminder({...newReminder, date: e.target.value}); if (reminderError === 'date') setReminderError(''); }} 
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">{t('candidates.drawer.labelReminderTime')}</label>
                      <input 
                        type="time" 
                        className="form-input" 
                        value={newReminder.time} 
                        onChange={e => setNewReminder({...newReminder, time: e.target.value})} 
                      />
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">{t('candidates.candidateDrawer.lblReminder', '提醒内容')} <span className="required">*</span></label>
                    <input 
                      type="text" 
                      className="form-input" 
                      style={reminderError === 'content' ? { borderColor: 'var(--accent-rose)', boxShadow: '0 0 0 1px var(--accent-rose)' } : undefined}
                      placeholder={t('candidates.candidateDrawer.phReminder', '例如: 询问候选人是否收到Offer...')} 
                      value={newReminder.content} 
                      onChange={e => { setNewReminder({...newReminder, content: e.target.value}); if (reminderError === 'content') setReminderError(''); }} 
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignSelf: 'flex-end', marginTop: 'var(--space-2)' }}>
                    <button 
                      type="button" 
                      className="btn btn-secondary btn-sm" 
                      onClick={() => handleAddReminder(false)} 
                      disabled={isSavingReminder}
                    >
                      {isSavingReminder ? t('candidates.candidateDrawer.savingReminder', '保存中...') : t('candidates.drawer.onlySave')}
                    </button>
                    <button 
                      type="button" 
                      className="btn btn-primary btn-sm" 
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      onClick={() => handleAddReminder(true)} 
                      disabled={isSavingReminder}
                      title={t('candidates.drawer.saveGcalTooltip')}
                    >
                      <i className="ph-light ph-calendar-plus" style={{ fontSize: '13px' }}></i>
                      <span>{t('candidates.drawer.saveGcalBtn')}</span>
                    </button>
                  </div>
                </div>
              )}

              {(() => {
                const myReminders = (currentCandidate?.reminders || []).filter(r => !r.creatorId || r.creatorId === user?.uid || r.creatorId === 'system_bot');
                return (
                  <>
                    {myReminders.length === 0 ? (
                      !isAddingReminder && (
                        <div className="empty-state">
                          <div className="empty-state-icon"><i className="ph-light ph-bell-ringing"></i></div>
                          <div className="empty-state-title">{t('candidates.candidateDrawer.noReminderTitle', '暂无专属跟进提醒')}</div>
                          <div className="empty-state-desc">{t('candidates.candidateDrawer.noReminderDesc', '提醒为您个人私有备忘，设置后仅在您的账号下到期提醒与显示。')}</div>
                        </div>
                      )
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                        {myReminders.slice().sort((a, b) => {
                          if (Boolean(a.fired) !== Boolean(b.fired)) {
                            return a.fired ? 1 : -1;
                          }
                          const timeA = new Date(a.dateTime || a.date).getTime() || 0;
                          const timeB = new Date(b.dateTime || b.date).getTime() || 0;
                          return timeB - timeA;
                        }).map((r, idx) => (
                          <div key={`${r.id ?? 'rem'}-${idx}`} style={{ 
                            padding: 'var(--space-3)', background: 'rgba(255,255,255,0.02)', 
                            border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-sm)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            opacity: r.fired ? 0.5 : 1
                          }}>
                      <div>
                        <div style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)', fontWeight: '500', textDecoration: r.fired ? 'line-through' : 'none' }}>
                          {r.content}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <i className="ph-light ph-calendar"></i> {r.date}
                          {r.time && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', color: 'var(--accent-blue)', fontWeight: '500' }}>
                              <i className="ph-light ph-clock"></i> {r.time}
                            </span>
                          )}
                          {r.fired && <span style={{ marginLeft: '6px', color: 'var(--accent-emerald)', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>{t('candidates.candidateDrawer.fired', '已触发')}</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <button 
                          className="btn-icon btn-sm" 
                          title={t('candidates.drawer.gcalBtn')}
                          style={{ color: 'var(--text-muted)' }}
                          onClick={() => handleSyncReminderToGCal(r)}
                        >
                          <i className="ph-light ph-calendar-plus"></i>
                        </button>
                        {!isReadOnlyView && (
                          <>
                            <button 
                              className="btn-icon btn-sm" 
                              title={r.fired ? t('candidates.candidateDrawer.revertTodo', '重新标记为待办') : t('candidates.candidateDrawer.markDone', '标记为已完成')}
                              style={{ color: r.fired ? 'var(--accent-emerald)' : 'var(--text-muted)' }}
                              onClick={() => handleToggleReminderFired(r.id, r.fired)}
                            >
                              <i className={`ph-bold ${r.fired ? 'ph-check-circle' : 'ph-circle'}`}></i>
                            </button>
                            <button 
                              className="btn-icon btn-sm" 
                              title={t('candidates.candidateDrawer.deleteReminder', '删除此提醒')}
                              style={{ color: 'var(--text-muted)', opacity: 0.8 }}
                              onClick={() => handleDeleteReminder(r.id)}
                            >
                              <i className="ph-light ph-trash"></i>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

        </div>
      </div>

      {/* Drop / Reject Modal */}
      {isDropModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 11000,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)'
        }}>
          <div style={{
            background: 'var(--bg-elevated)', borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-interactive)', width: '100%', maxWidth: '480px',
            padding: 'var(--space-6)', boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <h3 style={{ margin: 0, fontSize: 'var(--text-base)', color: 'var(--accent-rose)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="ph-fill ph-x-circle"></i> {t('candidates.drawer.dropModalTitle')}
              </h3>
              <button className="btn-icon btn-sm" onClick={() => setIsDropModalOpen(false)} title={t('candidates.drawer.closeBtnTitle')}>
                <i className="ph-light ph-x"></i>
              </button>
            </div>

            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
              {t('candidates.drawer.dropModalDesc')}
            </p>

            <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
              <label className="form-label">{t('candidates.drawer.dropModalReasonLabel')} <span className="required">*</span></label>
              <select 
                className="form-select" 
                value={dropReason} 
                onChange={e => setDropReason(e.target.value)}
              >
                <optgroup label={t('candidates.drawer.dropModalCandidateGroup')}>
                  {Utils.DROP_REASONS.filter(r => r.category === 'candidate').map(r => (
                    <option key={r.key} value={r.key}>{Utils.getDropReasonLabel(r.key, t)}</option>
                  ))}
                </optgroup>
                <optgroup label={t('candidates.drawer.dropModalCompanyGroup')}>
                  {Utils.DROP_REASONS.filter(r => r.category === 'company' || r.category === 'process').map(r => (
                    <option key={r.key} value={r.key}>{Utils.getDropReasonLabel(r.key, t)}</option>
                  ))}
                </optgroup>
                <optgroup label={t('candidates.drawer.dropModalOtherGroup')}>
                  {Utils.DROP_REASONS.filter(r => r.category === 'other').map(r => (
                    <option key={r.key} value={r.key}>{Utils.getDropReasonLabel(r.key, t)}</option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 'var(--space-5)' }}>
              <label className="form-label">{t('candidates.drawer.dropModalNoteLabel')}</label>
              <textarea 
                className="form-textarea" 
                placeholder={t('candidates.drawer.dropModalNotePlaceholder')} 
                value={dropNote} 
                onChange={e => setDropNote(e.target.value)}
                style={{ minHeight: '80px' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setIsDropModalOpen(false)}
                disabled={isDropping}
              >
                {t('candidates.drawer.dropModalCancel')}
              </button>
              <button 
                className="btn btn-primary" 
                style={{ background: 'var(--accent-rose)', borderColor: 'var(--accent-rose)' }}
                onClick={handleConfirmDrop}
                disabled={isDropping}
              >
                {isDropping ? t('candidates.drawer.dropModalProcessing') : t('candidates.drawer.dropModalConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
