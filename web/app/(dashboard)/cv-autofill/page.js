'use client';

import { useState, useRef, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../../lib/auth-context';
import { useNotifications } from '../../../lib/notification-context';
import { useFeedback } from '../../../lib/feedback-context';
import { useI18n } from '../../../lib/i18n-context';
import { FirestoreStore } from '../../../lib/firestore-store';
import { SystemLogger } from '../../../lib/logger';
import { authFetch, getAiBackendUrl } from '../../../lib/api-client';
import { isCandidateOwnedByUser } from '../../../lib/identity.mjs';

const getInitialCvFormData = (defaultPic = '') => ({
  // 基础联络与个人核心信息 (Personal Information)
  name: '',
  phone: '',
  email: '',
  location: '', // Address
  positionApplied: '',
  age: '',
  gender: 'Male',
  nationality: 'Malaysian',
  race: 'Chinese',
  maritalStatus: 'Single',
  lastDrawnSalary: '',
  expectedSalary: '',
  availability: 'Immediate',

  // 动态工作经历列表 (Professional History)
  professionalHistory: [
    {
      company: '',
      position: '',
      period: '',
      lastDrawnSalary: '',
      reasonForLeaving: '',
      responsibilities: ''
    }
  ],

  // 动态教育背景列表 (Education)
  educationList: [
    {
      school: '',
      degree: '',
      major: '',
      graduationYear: new Date().getFullYear().toString(),
      qualification: ''
    }
  ],
  // 兼容根级字段
  school: '',
  degree: '',
  major: '',
  graduationYear: new Date().getFullYear().toString(),
  qualification: '',
  educationHistory: [], // 其他学历列表

  // 技能与语言 (Skills & Languages)
  skills: '',
  languages: '',

  // ATS 归档与备注 (ATS Settings)
  experience: '',
  source: 'AI 简历解析独立录入',
  notes: '',
  stage: 'screening',
  picName: defaultPic
});

function mapCandidateToCvFormData(cand, defaultPic = '') {
  if (!cand) return getInitialCvFormData(defaultPic);
  const sData = cand.sunriseCvData || {};
  const sPersonal = sData.personal || {};
  const pCv = cand.parsedCvData?.parsed_cv || {};
  const pPersonal = pCv.personal_information || {};

  // 1. 工作履历
  let rawProf = [];
  if (Array.isArray(sData.professionalHistory) && sData.professionalHistory.length > 0) {
    rawProf = sData.professionalHistory;
  } else if (Array.isArray(cand.workExperience) && cand.workExperience.length > 0) {
    rawProf = cand.workExperience;
  } else if (Array.isArray(pCv.professional_history) && pCv.professional_history.length > 0) {
    rawProf = pCv.professional_history;
  }

  const profList = rawProf.length > 0 ? rawProf.map(p => ({
    company: p.company || '',
    position: p.position || '',
    period: p.period || '',
    lastDrawnSalary: p.lastDrawnSalary || p.last_drawn_salary || '',
    reasonForLeaving: p.reasonForLeaving || p.reason_for_leaving || '',
    responsibilities: Array.isArray(p.responsibilities) 
      ? p.responsibilities.join('\n') 
      : (p.responsibilities || '')
  })) : [
    { company: '', position: '', period: '', lastDrawnSalary: '', reasonForLeaving: '', responsibilities: '' }
  ];

  // 2. 教育背景
  let rawEdu = [];
  if (Array.isArray(sData.education) && sData.education.length > 0) {
    rawEdu = sData.education;
  } else if (Array.isArray(cand.educationList) && cand.educationList.length > 0) {
    rawEdu = cand.educationList;
  } else if (Array.isArray(pCv.education) && pCv.education.length > 0) {
    rawEdu = pCv.education;
  } else if (cand.school || cand.degree || cand.qualification) {
    rawEdu = [{
      school: cand.school || '',
      degree: cand.degree || '',
      major: cand.major || '',
      graduationYear: cand.graduationYear || cand.year || '',
      qualification: cand.qualification || ''
    }];
  }

  const eduList = rawEdu.length > 0 ? rawEdu.map(e => {
    const d = e.degree || '';
    const m = e.major || '';
    let qual = e.qualification || '';
    if (!qual && (d || m)) {
      if (d && m) {
        const dLower = d.toLowerCase();
        if (dLower.includes('bachelor') && !dLower.includes('of')) qual = `Bachelor of ${m}`;
        else if (dLower.includes('diploma') && !dLower.includes('in')) qual = `Diploma in ${m}`;
        else if (dLower.includes('master') && !dLower.includes('of')) qual = `Master of ${m}`;
        else qual = `${d} ${m}`;
      } else {
        qual = d || m;
      }
    }
    return {
      school: e.school || '',
      degree: d,
      major: m,
      graduationYear: e.graduationYear || e.year || '',
      qualification: qual || ''
    };
  }) : [
    { school: '', degree: '', major: '', graduationYear: new Date().getFullYear().toString(), qualification: '' }
  ];

  const primaryEdu = eduList[0] || {};
  const primaryProf = profList[0] || {};

  // 3. 技能标签
  let skillsStr = '';
  if (typeof cand.skills === 'string') {
    skillsStr = cand.skills;
  } else if (Array.isArray(cand.skills)) {
    skillsStr = cand.skills.join(', ');
  } else if (Array.isArray(cand.tags)) {
    skillsStr = cand.tags.join(', ');
  } else if (Array.isArray(sData.skills)) {
    skillsStr = sData.skills.join(', ');
  } else if (Array.isArray(pCv.skills)) {
    skillsStr = pCv.skills.join(', ');
  }

  // 4. 掌握语言
  let langsStr = '';
  if (typeof cand.languages === 'string') {
    langsStr = cand.languages;
  } else if (Array.isArray(cand.languages)) {
    langsStr = cand.languages.join(', ');
  } else if (Array.isArray(sData.languages)) {
    langsStr = sData.languages.join(', ');
  } else if (Array.isArray(pCv.languages)) {
    langsStr = pCv.languages.join(', ');
  }

  const ageVal = cand.age !== undefined && cand.age !== null 
    ? String(cand.age) 
    : (sPersonal.age ? String(sPersonal.age) : (pPersonal.age ? String(pPersonal.age) : ''));

  return {
    name: cand.name || sPersonal.name || pPersonal.name || '',
    phone: cand.phone || pPersonal.phone || '',
    email: cand.email || pPersonal.email || '',
    location: cand.location || sPersonal.address || pPersonal.address || pPersonal.location || '',
    positionApplied: cand.position || cand.positionApplied || sPersonal.positionApplied || pCv.position_applied || '',
    age: ageVal,
    gender: cand.gender || sPersonal.gender || pPersonal.gender || 'Male',
    nationality: cand.nationality || sPersonal.nationality || pPersonal.nationality || 'Malaysian',
    race: cand.race || sPersonal.race || pPersonal.race || 'Chinese',
    maritalStatus: cand.maritalStatus || sPersonal.maritalStatus || pPersonal.marital_status || 'Single',
    lastDrawnSalary: cand.lastDrawnSalary || sPersonal.lastDrawnSalary || pPersonal.last_drawn_salary || primaryProf.lastDrawnSalary || '',
    expectedSalary: cand.expectedSalary || cand.offered || cand.salary || sPersonal.expectedSalary || pPersonal.expected_salary || '',
    availability: cand.availability || sPersonal.availability || pPersonal.availability || 'Immediate',

    professionalHistory: profList,
    educationList: eduList,

    school: primaryEdu.school || cand.school || '',
    degree: primaryEdu.degree || cand.degree || '',
    major: primaryEdu.major || cand.major || '',
    graduationYear: primaryEdu.graduationYear || cand.graduationYear || '',
    qualification: primaryEdu.qualification || cand.qualification || '',
    educationHistory: eduList.slice(1),

    skills: skillsStr,
    languages: langsStr,

    experience: cand.experience || cand.totalYearsExperience || pCv.total_years_experience || '',
    source: cand.source ? `${cand.source} (人才库载入)` : '人才库档案推入',
    notes: cand.notes || '',
    stage: cand.stage || 'screening',
    picName: cand.picName || cand.pic || defaultPic
  };
}

function CvAutofillContent() {
  const { teamId, user, userProfile, isOwner, isManager } = useAuth();
  const { candidates: scopedCandidates = [], teamMembers = [], candidatesLoading: isLoadingCandidatesList } = useNotifications();
  const { showToast } = useFeedback();
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlCandidateId = searchParams?.get('candidateId');

  const isSupervisor = Boolean(isOwner || isManager || userProfile?.role === 'owner' || userProfile?.role === 'manager');
  const defaultPic = userProfile?.displayName || user?.displayName || '';

  const [aiParseTab, setAiParseTab] = useState('file'); // 'file' | 'text'
  const [aiFile, setAiFile] = useState(null);
  const [aiText, setAiText] = useState('');
  const [isAiParsing, setIsAiParsing] = useState(false);
  const [aiParseError, setAiParseError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [missingAnalysis, setMissingAnalysis] = useState(null);
  const [rawParsedCv, setRawParsedCv] = useState(null);
  const fileInputRef = useRef(null);

  // 人才库联动状态
  const [loadedCandidate, setLoadedCandidate] = useState(null);
  const [isLoadingCandidate, setIsLoadingCandidate] = useState(false);
  const [isCandidatePickerOpen, setIsCandidatePickerOpen] = useState(false);
  const [candidatePickerSearch, setCandidatePickerSearch] = useState('');
  const teamCandidates = scopedCandidates;

  // 100% 对齐 Sunrise CV 模板的完整表单状态
  const [formData, setFormData] = useState(() => getInitialCvFormData(defaultPic));

  const applyCandidate = (cand) => {
    if (!cand) return;
    const mapped = mapCandidateToCvFormData(cand, defaultPic);
    setFormData(mapped);
    setLoadedCandidate(cand);
    setAiFile(null);
    setAiText('');
    setAiParseError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    showToast(t('cvAutofill.toastLoadedCandidateSuccess', { name: cand.name }, `✨ 已成功载入候选人 "${cand.name}" 的档案！您可直接核对或微调，并点击【导出 Sunrise CV (Word)】。`));
  };

  const handleClearLoadedCandidate = () => {
    setLoadedCandidate(null);
    router.replace('/cv-autofill');
    setFormData(getInitialCvFormData(defaultPic));
    showToast(t('cvAutofill.toastClearedCandidate', '已清除当前候选人载入数据，恢复空白表单'));
  };

  // 监听 URL candidateId 参数并自动载入 (带 PDPA 归属权限核验)
  useEffect(() => {
    if (!teamId || !urlCandidateId) return;
    if (loadedCandidate && loadedCandidate.id === urlCandidateId) return;

    let isCancelled = false;
    setIsLoadingCandidate(true);
    FirestoreStore.getCandidate(teamId, urlCandidateId)
      .then((cand) => {
        if (isCancelled) return;
        if (cand) {
          if (!isSupervisor && !isCandidateOwnedByUser(cand, user, userProfile, teamMembers)) {
            showToast(t('cvAutofill.pdpaDenied', '无权访问其他顾问名下的候选人档案 (PDPA 隐私保护)'), 'error');
            router.replace('/cv-autofill');
            return;
          }
          applyCandidate(cand);
        } else {
          showToast(t('cvAutofill.candidateNotFound', '未找到指定候选人档案，可能已被删除'), 'error');
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.error("Failed to load candidate by ID:", err);
          showToast(t('cvAutofill.loadCandidateFailed', '载入候选人失败: ') + err.message, 'error');
        }
      })
      .finally(() => {
        if (!isCancelled) setIsLoadingCandidate(false);
      });

    return () => { isCancelled = true; };
  }, [teamId, urlCandidateId, isSupervisor, user, userProfile, teamMembers]);

  const filteredCandidates = useMemo(() => {
    if (!candidatePickerSearch.trim()) return teamCandidates.slice(0, 50);
    const q = candidatePickerSearch.toLowerCase().trim();
    return teamCandidates.filter(c => 
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q)) ||
      (c.position && c.position.toLowerCase().includes(q)) ||
      (c.company && c.company.toLowerCase().includes(q))
    ).slice(0, 50);
  }, [teamCandidates, candidatePickerSearch]);

  const handleSelectCandidateFromPicker = (cand) => {
    applyCandidate(cand);
    setIsCandidatePickerOpen(false);
    router.replace(`/cv-autofill?candidateId=${cand.id}`);
  };

  const handleDrawerAiParse = async () => {
    setAiParseError('');
    setIsAiParsing(true);
    try {
      let res;
      if (aiParseTab === 'file') {
        if (!aiFile) {
          setAiParseError(t('cvAutofill.errorNoContent', '请先上传简历文件或输入简历文本'));
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
          setAiParseError(t('cvAutofill.errorNoContent', '请先上传简历文件或输入简历文本'));
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
        throw new Error(t('extraUi.aiServiceHttpError', { status: res.status, detail: textErr.slice(0, 160) || t('extraUi.noValidResult', '未返回有效结果') }, `AI 服务异常 (HTTP ${res.status})`));
      }

      if (!res.ok || !json || json.status === 'error') {
        throw new Error(json?.message || t('extraUi.aiServiceHttpError', { status: res.status, detail: 'Failed' }, `AI 解析失败 (HTTP ${res.status})`));
      }

      const raw = json.data?.parsed_cv || {};
      const personal = raw.personal_information || {};
      const rawProfList = Array.isArray(raw.professional_history) 
        ? raw.professional_history 
        : (raw.professional_history && typeof raw.professional_history === 'object' ? [raw.professional_history] : []);
      const profList = rawProfList.length > 0
        ? rawProfList.map(p => ({
            company: p.company || '',
            position: p.position || '',
            period: p.period || '',
            lastDrawnSalary: p.last_drawn_salary || '',
            reasonForLeaving: p.reason_for_leaving || '',
            responsibilities: Array.isArray(p.responsibilities) 
              ? p.responsibilities.join('\n') 
              : (p.responsibilities || '')
          }))
        : [
            {
              company: '',
              position: '',
              period: '',
              lastDrawnSalary: '',
              reasonForLeaving: '',
              responsibilities: ''
            }
          ];

      const primaryProf = profList[0] || {};
      const eduList = Array.isArray(raw.education) 
        ? raw.education 
        : (raw.education && typeof raw.education === 'object' ? [raw.education] : []);

      // 智能全量拆解多段学历与专业
      const parsedEduList = eduList.length > 0 ? eduList.map(edu => {
        let extractedDegree = edu.degree || '';
        let extractedMajor = edu.major || '';
        const rawQual = (edu.qualification || '').trim();
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

        // 优先保留原汁原味 qualification (保留 Honours 荣誉学士及规范学术介词)；若无则智能兜底
        let qualFallback = rawQual;
        if (!qualFallback) {
          if (extractedDegree && extractedMajor) {
            const dLower = extractedDegree.toLowerCase();
            if (dLower.includes('bachelor') && !dLower.includes('of')) {
              qualFallback = `Bachelor of ${extractedMajor}`;
            } else if (dLower.includes('diploma') && !dLower.includes('in')) {
              qualFallback = `Diploma in ${extractedMajor}`;
            } else if (dLower.includes('master') && !dLower.includes('of')) {
              qualFallback = `Master of ${extractedMajor}`;
            } else {
              qualFallback = `${extractedDegree} ${extractedMajor}`;
            }
          } else {
            qualFallback = extractedDegree || extractedMajor || '';
          }
        }

        return {
          school: edu.school || '',
          degree: extractedDegree || '',
          major: extractedMajor || '',
          graduationYear: edu.year || '',
          qualification: qualFallback || ''
        };
      }) : [
        {
          school: '',
          degree: '',
          major: '',
          graduationYear: new Date().getFullYear().toString(),
          qualification: ''
        }
      ];

      const primaryEdu = parsedEduList[0] || {};
      
      const defaultPic = userProfile?.displayName || user?.displayName || '';

      setRawParsedCv(raw); // 留作底层参考

      // 技能与语言提取为逗号分隔字符串
      const skillsStr = Array.isArray(raw.skills) ? raw.skills.join(', ') : (raw.skills || '');
      const langsStr = Array.isArray(raw.languages) ? raw.languages.join(', ') : (raw.languages || '');

      // 智能组装技能、语言与求职意向至经历摘要
      const compiledNotes = [
        skillsStr ? `【专业技能】: ${skillsStr}` : '',
        langsStr ? `【掌握语言】: ${langsStr}` : '',
        personal.expected_salary ? `【期望薪资】: ${personal.expected_salary}` : '',
        personal.last_drawn_salary ? `【上份薪资】: ${personal.last_drawn_salary}` : '',
        personal.availability ? `【到岗时间】: ${personal.availability}` : '',
        personal.age ? `【年龄】: ${personal.age}` : '',
        personal.gender ? `【性别】: ${personal.gender}` : '',
        personal.marital_status ? `【婚姻状况】: ${personal.marital_status}` : '',
        (personal.nationality || personal.race) ? `【国籍/种族】: ${[personal.nationality, personal.race].filter(Boolean).join(' / ')}` : ''
      ].filter(Boolean).join('\n');

      const respStr = Array.isArray(primaryProf.responsibilities) 
        ? primaryProf.responsibilities.join('\n') 
        : (primaryProf.responsibilities || '');

      setFormData(prev => ({
        ...prev,
        // 个人基本信息
        name: personal.name || raw.name || prev.name || '',
        phone: personal.phone || raw.phone || prev.phone || '',
        email: personal.email || raw.email || prev.email || '',
        location: personal.address || raw.location || prev.location || '',
        positionApplied: prev.positionApplied || '',
        age: personal.age !== undefined && personal.age !== null ? String(personal.age) : prev.age || '',
        gender: personal.gender || prev.gender || 'Male',
        nationality: personal.nationality || prev.nationality || 'Malaysian',
        race: personal.race || prev.race || 'Chinese',
        maritalStatus: personal.marital_status || prev.maritalStatus || 'Single',
        lastDrawnSalary: personal.last_drawn_salary || primaryProf.last_drawn_salary || prev.lastDrawnSalary || '',
        expectedSalary: personal.expected_salary || prev.expectedSalary || '',
        availability: personal.availability || prev.availability || 'Immediate',

        // 动态工作履历全量数组
        professionalHistory: profList,

        // 动态教育背景全量数组
        educationList: parsedEduList,

        // 教育背景（兼容根级字段）
        school: primaryEdu.school || prev.school || '',
        degree: primaryEdu.degree || prev.degree || '',
        major: primaryEdu.major || prev.major || '',
        graduationYear: primaryEdu.graduationYear || prev.graduationYear || '',
        qualification: primaryEdu.qualification || prev.qualification || '',
        educationHistory: eduList.slice(1),

        // 技能与语言
        skills: skillsStr || prev.skills || '',
        languages: langsStr || prev.languages || '',

        // ATS 归档
        experience: raw.total_years_experience || raw.totalYearsExperience || prev.experience || '',
        notes: compiledNotes || prev.notes || '',
        picName: prev.picName || defaultPic
      }));
      
      if (json.data?.missing_analysis) {
        setMissingAnalysis(json.data.missing_analysis);
      }

      showToast(t('cvAutofill.toastParseSuccess', '✨ Sunrise CV 解析完成！请核对右侧完整信息'));
    } catch (err) {
      console.warn('Drawer AI parse failed:', err);
      setAiParseError(err.message || t('cvAutofill.errorParseFailed', '解析失败，请检查网络或后端服务'));
    } finally {
      setIsAiParsing(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const isUnspecified = (val) => val === '[Not Specified]' || val === 'Not Specified';

  const getInputStyle = (val, customBorder = null) => {
    if (isUnspecified(val)) {
      return {
        borderColor: 'var(--accent-amber)',
        background: 'rgba(245, 158, 11, 0.08)',
        color: 'var(--accent-amber)'
      };
    }
    return customBorder ? { borderColor: customBorder } : {};
  };

  const handleWorkExpChange = (index, field, value) => {
    setFormData(prev => {
      const updated = [...(prev.professionalHistory || [])];
      updated[index] = { ...updated[index], [field]: value };
      const nextState = { ...prev, professionalHistory: updated };
      if (index === 0) {
        if (field === 'company') nextState.company = value;
        if (field === 'position') nextState.position = value;
        if (field === 'period') nextState.period = value;
        if (field === 'lastDrawnSalary') nextState.lastDrawnSalary = value;
        if (field === 'reasonForLeaving') nextState.reasonForLeaving = value;
        if (field === 'responsibilities') nextState.responsibilities = value;
      }
      return nextState;
    });
  };

  const handleAddWorkExp = () => {
    setFormData(prev => ({
      ...prev,
      professionalHistory: [
        ...(prev.professionalHistory || []),
        {
          company: '',
          position: '',
          period: '',
          lastDrawnSalary: '',
          reasonForLeaving: '',
          responsibilities: ''
        }
      ]
    }));
  };

  const handleRemoveWorkExp = (index) => {
    setFormData(prev => {
      const updated = (prev.professionalHistory || []).filter((_, i) => i !== index);
      return {
        ...prev,
        professionalHistory: updated.length > 0 ? updated : [
          { company: '', position: '', period: '', lastDrawnSalary: '', reasonForLeaving: '', responsibilities: '' }
        ]
      };
    });
  };

  const handleEducationChange = (index, field, value) => {
    setFormData(prev => {
      const updated = [...(prev.educationList || [])];
      updated[index] = { ...updated[index], [field]: value };
      const nextState = { ...prev, educationList: updated };
      if (index === 0) {
        if (field === 'school') nextState.school = value;
        if (field === 'degree') nextState.degree = value;
        if (field === 'major') nextState.major = value;
        if (field === 'graduationYear') nextState.graduationYear = value;
        if (field === 'qualification') nextState.qualification = value;
      }
      return nextState;
    });
  };

  const handleAddEducation = () => {
    setFormData(prev => ({
      ...prev,
      educationList: [
        ...(prev.educationList || []),
        {
          school: '',
          degree: '',
          major: '',
          graduationYear: '',
          qualification: ''
        }
      ]
    }));
  };

  const handleRemoveEducation = (index) => {
    setFormData(prev => {
      const updated = (prev.educationList || []).filter((_, i) => i !== index);
      const fallback = updated.length > 0 ? updated : [
        { school: '', degree: '', major: '', graduationYear: '' }
      ];
      return {
        ...prev,
        educationList: fallback,
        school: fallback[0].school || '',
        degree: fallback[0].degree || '',
        major: fallback[0].major || '',
        graduationYear: fallback[0].graduationYear || ''
      };
    });
  };

  const handleSave = async () => {
    if (!formData.name || !formData.name.trim()) {
      showToast(t('cvAutofill.toastValidateRequired', '请填写候选人姓名与联系电话'));
      return;
    }
    
    setIsSaving(true);
    try {
      const skillsArray = formData.skills 
        ? formData.skills.split(/[,，、]+/).map(s => s.trim()).filter(Boolean) 
        : [];

      const currentProf = (formData.professionalHistory || []).map(p => ({
        company: p.company?.trim() || '',
        position: p.position?.trim() || '',
        period: p.period?.trim() || '',
        last_drawn_salary: p.lastDrawnSalary?.trim() || '',
        reason_for_leaving: p.reasonForLeaving?.trim() || '',
        responsibilities: p.responsibilities 
          ? (Array.isArray(p.responsibilities) ? p.responsibilities : p.responsibilities.split('\n').map(s => s.trim()).filter(Boolean))
          : []
      }));

      const primaryProf = currentProf[0] || {};

      const currentEduList = (formData.educationList && formData.educationList.length > 0)
        ? formData.educationList.map(e => {
            const rawQ = e.qualification?.trim();
            const d = e.degree?.trim() || '';
            const m = e.major?.trim() || '';
            let fallbackQ = rawQ;
            if (!fallbackQ) {
              if (d && m) {
                const dLower = d.toLowerCase();
                if (dLower.includes('bachelor') && !dLower.includes('of')) fallbackQ = `Bachelor of ${m}`;
                else if (dLower.includes('diploma') && !dLower.includes('in')) fallbackQ = `Diploma in ${m}`;
                else if (dLower.includes('master') && !dLower.includes('of')) fallbackQ = `Master of ${m}`;
                else fallbackQ = `${d} ${m}`;
              } else {
                fallbackQ = d || m || '';
              }
            }
            return {
              year: e.graduationYear?.trim() || '',
              school: e.school?.trim() || '',
              degree: d,
              major: m,
              qualification: fallbackQ
            };
          })
        : [
            {
              year: formData.graduationYear?.trim() || '',
              school: formData.school?.trim() || '',
              degree: formData.degree?.trim() || '',
              major: formData.major?.trim() || '',
              qualification: formData.qualification?.trim() || `${formData.degree || ''} ${formData.major || ''}`.trim() || formData.degree || ''
            }
          ];

      const primaryEduItem = currentEduList[0] || {};

      const payload = {
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        location: formData.location.trim(),
        company: '',
        position: (formData.positionApplied || '').trim(),
        school: primaryEduItem.school || formData.school.trim(),
        degree: primaryEduItem.degree || formData.degree.trim(),
        major: primaryEduItem.major || formData.major.trim(),
        experience: formData.experience.trim(),
        age: formData.age,
        gender: formData.gender,
        nationality: formData.nationality,
        race: formData.race,
        maritalStatus: formData.maritalStatus,
        salary: formData.expectedSalary || primaryProf.last_drawn_salary || '',
        offered: formData.expectedSalary || '',
        tags: skillsArray,
        skills: formData.skills,
        languages: formData.languages,
        notes: formData.notes,
        stage: formData.stage,
        source: formData.source,
        picName: formData.picName,
        workExperience: currentProf,
        sunriseCvData: {
          personal: {
            name: formData.name,
            address: formData.location,
            age: formData.age,
            gender: formData.gender,
            nationality: formData.nationality,
            race: formData.race,
            maritalStatus: formData.maritalStatus,
            lastDrawnSalary: primaryProf.last_drawn_salary || formData.lastDrawnSalary,
            expectedSalary: formData.expectedSalary,
            availability: formData.availability,
            positionApplied: formData.positionApplied
          },
          professionalHistory: currentProf,
          education: currentEduList.filter(e => e.school || e.qualification || e.year),
          skills: skillsArray,
          languages: formData.languages ? formData.languages.split(/[,，、]+/).map(s => s.trim()).filter(Boolean) : []
        }
      };

      if (payload.company) {
        payload.companySource = 'manual';
      }
      
      if (loadedCandidate && loadedCandidate.id) {
        await FirestoreStore.updateCandidate(teamId, loadedCandidate.id, payload);
        SystemLogger.audit(teamId, user, 'UPDATE', 'CANDIDATE', formData.name, {
          actionDetail: '通过 CV Auto Fill 完善并回写档案及 Sunrise CV 结构数据'
        });
        showToast(t('cvAutofill.toastSaveUpdateSuccess', '🎉 候选人档案与 Sunrise CV 已成功同步更新至人才库！'));
      } else {
        const saveResult = await FirestoreStore.upsertCandidate(teamId, user.uid, payload, aiFile?.name);
        if (saveResult.isMerged) {
          SystemLogger.audit(teamId, user, 'UPDATE', 'CANDIDATE', formData.name, {
            actionDetail: `检测到同电话候选人 (${formData.phone})，已自动合并更新档案并追加重新投递记录`
          });
          showToast(t('cvAutofill.toastSaveSuccess', '🎉 候选人档案与 Sunrise CV 已成功完整入库！'));
        } else {
          SystemLogger.audit(teamId, user, 'CREATE', 'CANDIDATE', formData.name, {
            actionDetail: '通过完整 Sunrise CV 结构快速录入'
          });
          showToast(t('cvAutofill.toastSaveSuccess', '🎉 候选人档案与 Sunrise CV 已成功完整入库！'));
        }
      }
      
      // 重置表单与载入状态
      setFormData(getInitialCvFormData(defaultPic));
      setLoadedCandidate(null);
      router.replace('/cv-autofill');
      setAiFile(null);
      setAiText('');
      setMissingAnalysis(null);
      setRawParsedCv(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      
    } catch (error) {
      console.error("Error saving candidate:", error);
      showToast(t('cvAutofill.toastSaveFailed', '保存失败: ') + error.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // 严格基于右侧用户最新人工校对的内容导出 DOCX，彻底杜绝数据不同步
  const handleExportDocx = async () => {
    if (!formData.name && !rawParsedCv) {
      showToast(t('cvAutofill.toastExportPrompt', '请先解析或填写简历信息'), 'error');
      return;
    }
    
    setIsExporting(true);
    try {
      const cleanVal = v => {
        if (!v) return null;
        const s = String(v).trim();
        if (!s || s === '[Not Specified]' || s === 'Not Specified' || s.toLowerCase() === 'null') return null;
        return s;
      };

      const currentProf = (formData.professionalHistory || []).map(p => ({
        company: cleanVal(p.company) || '',
        position: cleanVal(p.position) || '',
        period: cleanVal(p.period) || '',
        last_drawn_salary: cleanVal(p.lastDrawnSalary),
        reason_for_leaving: cleanVal(p.reasonForLeaving),
        responsibilities: p.responsibilities 
          ? (Array.isArray(p.responsibilities) 
              ? p.responsibilities.map(r => cleanVal(r)).filter(Boolean) 
              : p.responsibilities.split('\n').map(s => cleanVal(s)).filter(Boolean))
          : []
      }));

      const currentEdu = [];
      if (Array.isArray(formData.educationList) && formData.educationList.length > 0) {
        formData.educationList.forEach(e => {
          const s = cleanVal(e.school);
          const d = cleanVal(e.degree);
          const m = cleanVal(e.major);
          const y = cleanVal(e.graduationYear);
          const rawQ = cleanVal(e.qualification);
          
          let qual = rawQ;
          if (!qual) {
            if (d && m) {
              const dLower = d.toLowerCase();
              if (dLower.includes('bachelor') && !dLower.includes('of')) qual = `Bachelor of ${m}`;
              else if (dLower.includes('diploma') && !dLower.includes('in')) qual = `Diploma in ${m}`;
              else if (dLower.includes('master') && !dLower.includes('of')) qual = `Master of ${m}`;
              else qual = `${d} ${m}`;
            } else {
              qual = d || m || '';
            }
          }
          qual = cleanVal(qual);
          if (s || qual || y) {
            currentEdu.push({
              year: y || '',
              school: s || '',
              degree: d || '',
              major: m || '',
              qualification: qual || ''
            });
          }
        });
      } else {
        if (formData.school || formData.degree || formData.qualification) {
          const rawQ = cleanVal(formData.qualification);
          const d = cleanVal(formData.degree);
          const m = cleanVal(formData.major);
          let qual = rawQ;
          if (!qual) {
            if (d && m) {
              const dLower = d.toLowerCase();
              if (dLower.includes('bachelor') && !dLower.includes('of')) qual = `Bachelor of ${m}`;
              else if (dLower.includes('diploma') && !dLower.includes('in')) qual = `Diploma in ${m}`;
              else if (dLower.includes('master') && !dLower.includes('of')) qual = `Master of ${m}`;
              else qual = `${d} ${m}`;
            } else {
              qual = d || m || '';
            }
          }
          qual = cleanVal(qual);
          currentEdu.push({
            year: cleanVal(formData.graduationYear) || '',
            school: cleanVal(formData.school) || '',
            degree: d || '',
            major: m || '',
            qualification: qual || ''
          });
        }
        if (Array.isArray(formData.educationHistory)) {
          currentEdu.push(...formData.educationHistory);
        }
      }

      const currentSkills = formData.skills 
        ? formData.skills.split(/[,，、]+/).map(s => cleanVal(s)).filter(Boolean) 
        : [];
      const currentLangs = formData.languages 
        ? formData.languages.split(/[,，、]+/).map(s => cleanVal(s)).filter(Boolean) 
        : [];

      const docxPayload = {
        parsed_cv: {
          position_applied: cleanVal(formData.positionApplied) || '',
          personal_information: {
            name: cleanVal(formData.name) || '',
            address: cleanVal(formData.location) || '',
            age: cleanVal(formData.age),
            nationality: cleanVal(formData.nationality) || '',
            race: cleanVal(formData.race) || '',
            gender: cleanVal(formData.gender) || '',
            marital_status: cleanVal(formData.maritalStatus) || '',
            last_drawn_salary: cleanVal(formData.lastDrawnSalary),
            expected_salary: cleanVal(formData.expectedSalary),
            availability: cleanVal(formData.availability)
          },
          professional_history: currentProf,
          education: currentEdu,
          skills: currentSkills,
          languages: currentLangs
        }
      };

      const res = await authFetch('/api/export/cv-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parsed_data: docxPayload })
      });
      
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let errMsg = t('extraUi.exportFailedNetwork', '导出失败，请检查网络或后端服务');
        try {
          const parsed = JSON.parse(text);
          if (parsed?.message) errMsg = parsed.message;
        } catch (_) {
          if (text) errMsg = t('extraUi.exportErrorHttp', { status: res.status, detail: text.slice(0, 150) }, `导出异常 (HTTP ${res.status}): ${text.slice(0, 150)}`);
        }
        throw new Error(errMsg);
      }
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const posPart = (formData.positionApplied || '').trim();
      const namePart = (formData.name || '').trim() || t('cvAutofill.defaultCandidateName', '候选人');
      const a = document.createElement('a');
      a.href = url;
      a.download = posPart 
        ? `Sunrise CV - ${posPart} - ${namePart}.docx` 
        : `Sunrise CV - ${namePart}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      showToast(t('cvAutofill.toastExportSuccess', '📥 Sunrise CV (Word) 已成功导出（无冗余空白块）！'));
    } catch (error) {
      console.error("Error exporting DOCX:", error);
      showToast(error.message, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="page-view active">
      <div style={{ display: 'flex', gap: 'var(--space-6)', maxWidth: '1500px', margin: '0 auto', width: '100%', height: 'calc(100vh - 100px)' }}>
        
        {/* Left Side: Upload & Parse */}
        <div style={{ width: '38%', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', height: '100%' }}>
          <div className="page-header" style={{ marginBottom: '0', flexShrink: 0 }}>
            <div>
              <h1 className="page-title" style={{ color: 'var(--accent-purple)' }}>
                <i className="ph-fill ph-file-text"></i> {t('cvAutofill.pageTitle', 'CV 简历解析与入库 (Sunrise 模板版)')}
              </h1>
              <p className="page-subtitle">{t('cvAutofill.pageSubtitle', '按 Sunrise 猎头标准模版深度提取候选人全量画像与简历，支持结构化校对、一键入库与标准 Word 导出。')}</p>
            </div>
          </div>

          <div className="bezel-shell" style={{ flex: 1 }}>
            <div className="bezel-core" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div className="bento-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>{t('cvAutofill.step1Title', '1. 提供简历内容')}</h3>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => setIsCandidatePickerOpen(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '11px',
                    padding: '3px 8px',
                    color: 'var(--accent-purple)',
                    borderColor: 'rgba(168, 85, 247, 0.4)',
                    background: 'rgba(168, 85, 247, 0.08)'
                  }}
                  title={t('cvAutofill.btnPickCandidateTitle', '从团队人才库中选择已有候选人档案并一键载入')}
                >
                  <i className="ph-bold ph-users"></i>
                  <span>{t('cvAutofill.btnPickCandidate', '从人才库载入候选人')}</span>
                </button>
              </div>
              
              {aiParseError && (
                <div style={{ color: 'var(--accent-rose)', fontSize: '0.8rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(239, 68, 68, 0.1)', padding: '8px', borderRadius: '4px' }}>
                  <i className="ph-bold ph-warning-circle"></i> {aiParseError}
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', marginBottom: 'var(--space-4)' }}>
                <button
                  type="button"
                  onClick={() => { setAiParseTab('file'); setAiParseError(''); }}
                  style={{
                    padding: '6px 14px', borderRadius: 'var(--radius-pill)', border: 'none',
                    background: aiParseTab === 'file' ? 'var(--accent-purple)' : 'rgba(255,255,255,0.05)',
                    color: aiParseTab === 'file' ? '#fff' : 'var(--text-muted)',
                    fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                    transition: 'all 0.2s'
                  }}
                >
                  <i className="ph-light ph-file-pdf"></i> {t('cvAutofill.tabFile', '文件解析 (MarkItDown 支持)')}
                </button>
                <button
                  type="button"
                  onClick={() => { setAiParseTab('text'); setAiParseError(''); }}
                  style={{
                    padding: '6px 14px', borderRadius: 'var(--radius-pill)', border: 'none',
                    background: aiParseTab === 'text' ? 'var(--accent-purple)' : 'rgba(255,255,255,0.05)',
                    color: aiParseTab === 'text' ? '#fff' : 'var(--text-muted)',
                    fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                    transition: 'all 0.2s'
                  }}
                >
                  <i className="ph-light ph-textbox"></i> {t('cvAutofill.tabText', '文本解析')}
                </button>
              </div>

              {aiParseTab === 'file' ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.doc,.txt,.jpg,.jpeg,.png,.xlsx"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setAiFile(e.target.files[0]);
                        setAiParseError('');
                      }
                    }}
                    style={{ display: 'none' }}
                  />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      flex: 1, border: '2px dashed var(--border-interactive)', borderRadius: 'var(--radius-md)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      background: aiFile ? 'rgba(168, 85, 247, 0.05)' : 'rgba(0,0,0,0.15)', cursor: 'pointer',
                      transition: 'all 0.3s', minHeight: '200px'
                    }}
                  >
                    <i className="ph-light ph-upload-simple" style={{ fontSize: '3rem', color: aiFile ? 'var(--accent-purple)' : 'var(--text-muted)', marginBottom: '12px' }}></i>
                    <span style={{ fontSize: '1rem', color: aiFile ? 'var(--accent-purple)' : 'var(--text-secondary)' }}>
                      {aiFile ? t('cvAutofill.uploadSelected', { name: aiFile.name, size: (aiFile.size/1024).toFixed(1) }, `已选择: ${aiFile.name} (${(aiFile.size/1024).toFixed(1)} KB)`) : t('cvAutofill.uploadClickPrompt', '点击上传简历文件 (.docx/.pdf/.xlsx)')}
                    </span>
                  </div>
                </div>
              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <textarea
                    className="form-input"
                    placeholder={t('cvAutofill.textPlaceholder', '在此直接粘贴候选人简历文本、完整履历或沟通记录...')}
                    value={aiText}
                    onChange={(e) => setAiText(e.target.value)}
                    style={{ flex: 1, width: '100%', fontSize: '0.9rem', lineHeight: '1.6', background: 'rgba(0,0,0,0.2)', resize: 'none', minHeight: '200px' }}
                  ></textarea>
                </div>
              )}

              <div style={{ marginTop: 'var(--space-4)' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleDrawerAiParse}
                  disabled={isAiParsing || (aiParseTab === 'file' ? !aiFile : !aiText.trim())}
                  style={{ width: '100%', padding: '12px', fontSize: '1rem', display: 'flex', justifyContent: 'center', gap: '8px', background: 'var(--accent-purple)' }}
                >
                  {isAiParsing ? (
                    <><i className="ph-light ph-spinner ph-spin"></i> {t('cvAutofill.btnParsing', '正在深度提取 Sunrise 全量特征...')}</>
                  ) : (
                    <><i className="ph-light ph-magic-wand"></i> {t('cvAutofill.btnParse', '开始智能解析 (Sunrise 契约)')}</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Form Review & Submission - 1:1 Mirroring Sunrise CV Template */}
        <div style={{ width: '62%', display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="bezel-shell" style={{ flex: 1 }}>
            <div className="bezel-core" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: 'var(--space-5)' }}>
              
              <div className="bento-header" style={{ borderBottom: '1px solid var(--border-hairline)', paddingBottom: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '1.15rem' }}>{t('cvAutofill.step2Title', '2. Sunrise CV 人工核对与精准入库')}</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>{t('cvAutofill.step2Subtitle', '支持全量修改；点击导出将以最新修改生成干净 Word 交付件')}</p>
                </div>
                <span className="badge badge-purple" style={{ fontSize: '0.75rem' }}>
                  <i className="ph-fill ph-file-doc"></i> {t('cvAutofill.badgeVersion', 'Sunrise CV v1.0')}
                </span>
              </div>

              {/* 人才库载入中提示 */}
              {isLoadingCandidate && (
                <div style={{
                  marginBottom: '16px',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(168, 85, 247, 0.08)',
                  border: '1px solid rgba(168, 85, 247, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: 'var(--accent-purple)'
                }}>
                  <i className="ph-light ph-spinner ph-spin" style={{ fontSize: '18px' }}></i>
                  <span style={{ fontSize: '0.85rem' }}>{t('common.loading', '正在从人才库载入候选人档案...')}</span>
                </div>
              )}

              {/* 候选人已载入横幅 (人才库联动) */}
              {loadedCandidate && !isLoadingCandidate && (
                <div style={{
                  marginBottom: '16px',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.12) 0%, rgba(59, 130, 246, 0.12) 100%)',
                  border: '1px solid rgba(168, 85, 247, 0.35)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '10px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '50%',
                      background: 'var(--accent-purple)', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '16px', flexShrink: 0
                    }}>
                      <i className="ph-fill ph-user-check"></i>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{t('cvAutofill.loadedBannerTitle', '已载入人才库档案:')} {loadedCandidate.name}</span>
                        <span className="badge badge-purple" style={{ fontSize: '11px', padding: '1px 6px' }}>{loadedCandidate.phone || t('candidates.noPhone', '未留电话')}</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {t('cvAutofill.loadedBannerDesc', '已为您自动填入右侧 Sunrise 模板结构；您可直接核对微调并导出 Word，或完善后保存更新该档案。')}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={handleExportDocx}
                      disabled={isExporting}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', padding: '6px 14px' }}
                    >
                      <i className="ph-bold ph-download-simple"></i>
                      <span>{isExporting ? t('cvAutofill.btnExporting', '正在生成...') : t('cvAutofill.bannerExportDocx', '立即导出 Word')}</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={handleClearLoadedCandidate}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', padding: '6px 10px', color: 'var(--text-muted)' }}
                      title={t('cvAutofill.bannerClearTitle', '解除与此人才档案的关联并重置表单')}
                    >
                      <i className="ph-light ph-x"></i>
                      <span>{t('cvAutofill.bannerClearBtn', '清除/重置')}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* 模块 A: 个人核心画像 (Personal Information) */}
              <div style={{ marginBottom: '20px', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', color: 'var(--accent-blue)', fontWeight: 600, fontSize: '0.95rem' }}>
                  <i className="ph-bold ph-user-circle"></i> {t('cvAutofill.secPersonalInfo', '个人基本信息 (Personal Information)')}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">{t('cvAutofill.labelName', '姓名 (Name)')} <span style={{ color: 'var(--accent-rose)' }}>*</span></label>
                    <input type="text" name="name" className="form-input" value={formData.name} onChange={handleChange} placeholder={t('cvAutofill.placeholderName', 'Full Name')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('cvAutofill.labelPhone', '联系电话 (Phone)')} <span style={{ color: 'var(--accent-rose)' }}>*</span></label>
                    <input type="text" name="phone" className="form-input" value={formData.phone} onChange={handleChange} placeholder={t('cvAutofill.placeholderPhone', '纯数字手机号')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('cvAutofill.labelEmail', '电子邮箱 (Email)')}</label>
                    <input type="email" name="email" className="form-input" value={formData.email} onChange={handleChange} placeholder={t('cvAutofill.placeholderEmail', 'Email')} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: '12px', marginTop: '10px' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>{t('cvAutofill.labelAddress', '居住地址 (Address)')}</span>
                      {isUnspecified(formData.location) && (
                        <span className="badge" style={{ fontSize: '10px', background: 'rgba(245, 158, 11, 0.2)', color: 'var(--accent-amber)', borderColor: 'rgba(245, 158, 11, 0.4)', padding: '1px 5px' }}>{t('cvAutofill.badgeUnspecified', '⚠️ 未注明')}</span>
                      )}
                    </label>
                    <input 
                      type="text" 
                      name="location" 
                      className="form-input" 
                      value={formData.location} 
                      onFocus={(e) => { if (isUnspecified(e.target.value)) e.target.select(); }}
                      onChange={handleChange} 
                      style={getInputStyle(formData.location)}
                      placeholder={t('cvAutofill.placeholderAddress', '居住城市/详细地址')} 
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('cvAutofill.labelPositionApplied', '申请职位 (Position Applied)')}</label>
                    <input type="text" name="positionApplied" className="form-input" value={formData.positionApplied} onChange={handleChange} placeholder={t('cvAutofill.placeholderPositionApplied', 'Target Position')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>{t('cvAutofill.labelAvailability', '到岗时间 (Availability)')}</span>
                      {isUnspecified(formData.availability) && (
                        <span className="badge" style={{ fontSize: '10px', background: 'rgba(245, 158, 11, 0.2)', color: 'var(--accent-amber)', borderColor: 'rgba(245, 158, 11, 0.4)', padding: '1px 5px' }}>{t('cvAutofill.badgeUnspecified', '⚠️ 未注明')}</span>
                      )}
                    </label>
                    <input 
                      type="text" 
                      name="availability" 
                      className="form-input" 
                      value={formData.availability} 
                      onFocus={(e) => { if (isUnspecified(e.target.value)) e.target.select(); }}
                      onChange={handleChange} 
                      style={getInputStyle(formData.availability)}
                      placeholder={t('cvAutofill.placeholderAvailability', '如: Immediate / 1 month notice')} 
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginTop: '10px' }}>
                  <div className="form-group">
                    <label className="form-label">{t('cvAutofill.labelAge', '年龄 (Age)')}</label>
                    <input type="text" name="age" className="form-input" value={formData.age} onChange={handleChange} placeholder={t('cvAutofill.placeholderAge', '例如: 28')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('cvAutofill.labelGender', '性别 (Gender)')}</label>
                    <input type="text" name="gender" className="form-input" value={formData.gender} onChange={handleChange} placeholder={t('cvAutofill.placeholderGender', 'Male / Female')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('cvAutofill.labelNationality', '国籍 (Nationality)')}</label>
                    <input type="text" name="nationality" className="form-input" value={formData.nationality} onChange={handleChange} placeholder={t('cvAutofill.placeholderNationality', 'Malaysian')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('cvAutofill.labelRace', '种族 (Race)')}</label>
                    <input type="text" name="race" className="form-input" value={formData.race} onChange={handleChange} placeholder={t('cvAutofill.placeholderRace', 'Chinese / Malay / Indian')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>{t('cvAutofill.labelMarital', '婚姻')}</span>
                      {isUnspecified(formData.maritalStatus) && (
                        <span className="badge" style={{ fontSize: '9px', background: 'rgba(245, 158, 11, 0.2)', color: 'var(--accent-amber)', borderColor: 'rgba(245, 158, 11, 0.4)', padding: '0 4px' }}>⚠️</span>
                      )}
                    </label>
                    <input 
                      type="text" 
                      name="maritalStatus" 
                      className="form-input" 
                      value={formData.maritalStatus} 
                      onFocus={(e) => { if (isUnspecified(e.target.value)) e.target.select(); }}
                      onChange={handleChange} 
                      style={getInputStyle(formData.maritalStatus)}
                      placeholder={t('cvAutofill.placeholderMarital', 'Single / Married')} 
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginTop: '10px' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>{t('cvAutofill.labelLastDrawn', '上一份薪水 (Last Drawn)')}</span>
                      {isUnspecified(formData.lastDrawnSalary) && (
                        <span className="badge" style={{ fontSize: '10px', background: 'rgba(245, 158, 11, 0.2)', color: 'var(--accent-amber)', borderColor: 'rgba(245, 158, 11, 0.4)', padding: '1px 5px' }}>{t('cvAutofill.badgeUnspecified', '⚠️ 未注明')}</span>
                      )}
                    </label>
                    <input 
                      type="text" 
                      name="lastDrawnSalary" 
                      className="form-input" 
                      value={formData.lastDrawnSalary} 
                      onFocus={(e) => { if (isUnspecified(e.target.value)) e.target.select(); }}
                      onChange={handleChange} 
                      style={getInputStyle(formData.lastDrawnSalary)}
                      placeholder={t('cvAutofill.placeholderLastDrawn', '例如: RM 3,500')} 
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>{t('cvAutofill.labelExpected', '期望薪资 (Expected)')}</span>
                      {isUnspecified(formData.expectedSalary) && (
                        <span className="badge" style={{ fontSize: '10px', background: 'rgba(245, 158, 11, 0.2)', color: 'var(--accent-amber)', borderColor: 'rgba(245, 158, 11, 0.4)', padding: '1px 5px' }}>{t('cvAutofill.badgeUnspecified', '⚠️ 未注明')}</span>
                      )}
                    </label>
                    <input 
                      type="text" 
                      name="expectedSalary" 
                      className="form-input" 
                      value={formData.expectedSalary} 
                      onFocus={(e) => { if (isUnspecified(e.target.value)) e.target.select(); }}
                      onChange={handleChange} 
                      style={getInputStyle(formData.expectedSalary)}
                      placeholder={t('cvAutofill.placeholderExpected', '例如: RM 4,500')} 
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('cvAutofill.labelTotalExp', '估算总工龄 (Total Experience)')}</label>
                    <input type="text" name="experience" className="form-input" value={formData.experience} onChange={handleChange} placeholder={t('cvAutofill.placeholderTotalExp', '例如: 3年 / 3 Years')} />
                  </div>
                </div>
              </div>

              {/* 模块 B: 工作履历 (Professional History) - 支持动态多段履历 */}
              <div style={{ marginBottom: '20px', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-purple)', fontWeight: 600, fontSize: '0.95rem' }}>
                    <i className="ph-bold ph-briefcase"></i> {t('cvAutofill.secExperience', { count: formData.professionalHistory.length }, `工作经历 (Professional History - 共 ${formData.professionalHistory.length} 段)`)}
                  </div>
                  <button 
                    type="button" 
                    className="btn btn-sm btn-secondary" 
                    onClick={handleAddWorkExp}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '3px 10px' }}
                  >
                    <i className="ph-bold ph-plus"></i> {t('cvAutofill.btnAddExperience', '添加工作经历')}
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {formData.professionalHistory.map((job, jIdx) => (
                    <div 
                      key={jIdx}
                      style={{
                        padding: '14px',
                        background: 'rgba(0,0,0,0.2)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-subtle)',
                        position: 'relative'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span className="badge" style={{ color: 'var(--accent-purple)', background: 'rgba(168, 85, 247, 0.1)', borderColor: 'rgba(168, 85, 247, 0.3)', fontSize: '11px' }}>
                          {t('cvAutofill.badgeExpItem', { num: jIdx + 1 }, `经历 #${jIdx + 1}`)} {jIdx === 0 ? t('cvAutofill.badgePrimaryExp', '(最近一份工作 / Primary)') : ''}
                        </span>
                        {formData.professionalHistory.length > 1 && (
                          <button
                            type="button"
                            className="btn-icon"
                            title={t('cvAutofill.btnDeleteExp', '删除此段经历')}
                            onClick={() => handleRemoveWorkExp(jIdx)}
                            style={{ width: '24px', height: '24px', color: 'var(--text-muted)' }}
                          >
                            <i className="ph-light ph-trash"></i>
                          </button>
                        )}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '10px' }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '11px' }}>{t('cvAutofill.labelCompany', '任职单位 (Company)')} <span style={{ color: 'var(--accent-rose)' }}>*</span></label>
                          <input 
                            type="text" 
                            className="form-input" 
                            value={job.company} 
                            onChange={(e) => handleWorkExpChange(jIdx, 'company', e.target.value)} 
                            placeholder={t('cvAutofill.placeholderCompany', '公司全称')} 
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '11px' }}>{t('cvAutofill.labelPosition', '担任职位 (Position)')} <span style={{ color: 'var(--accent-rose)' }}>*</span></label>
                          <input 
                            type="text" 
                            className="form-input" 
                            value={job.position} 
                            onChange={(e) => handleWorkExpChange(jIdx, 'position', e.target.value)} 
                            placeholder={t('cvAutofill.placeholderPosition', '岗位名称')} 
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '11px' }}>{t('cvAutofill.labelPeriod', '在职时期 (Period)')}</label>
                          <input 
                            type="text" 
                            className="form-input" 
                            value={job.period} 
                            onChange={(e) => handleWorkExpChange(jIdx, 'period', e.target.value)} 
                            placeholder={t('cvAutofill.placeholderPeriod', '如: 2022 - 2024')} 
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px', marginTop: '10px' }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>{t('cvAutofill.labelExpSalary', '薪资 (Last Drawn Salary)')}</span>
                            {isUnspecified(job.lastDrawnSalary) && (
                              <span className="badge" style={{ fontSize: '9px', background: 'rgba(245, 158, 11, 0.2)', color: 'var(--accent-amber)', borderColor: 'rgba(245, 158, 11, 0.4)', padding: '0 4px' }}>{t('cvAutofill.badgeUnspecified', '⚠️ 未注明')}</span>
                            )}
                          </label>
                          <input 
                            type="text" 
                            className="form-input" 
                            value={job.lastDrawnSalary} 
                            onFocus={(e) => { if (isUnspecified(e.target.value)) e.target.select(); }}
                            onChange={(e) => handleWorkExpChange(jIdx, 'lastDrawnSalary', e.target.value)} 
                            style={getInputStyle(job.lastDrawnSalary)}
                            placeholder={t('cvAutofill.placeholderExpSalary', '如: RM 3,500')} 
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '11px', color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span><i className="ph ph-door-open"></i> {t('cvAutofill.labelReasonForLeaving', '离职原因 (Reason for Leaving)')}</span>
                            {isUnspecified(job.reasonForLeaving) && (
                              <span className="badge" style={{ fontSize: '9px', background: 'rgba(245, 158, 11, 0.2)', color: 'var(--accent-amber)', borderColor: 'rgba(245, 158, 11, 0.4)', padding: '0 4px' }}>{t('cvAutofill.badgeVerifyNeeded', '⚠️ 待向候选人核实')}</span>
                            )}
                          </label>
                          <input 
                            type="text" 
                            className="form-input" 
                            value={job.reasonForLeaving} 
                            onFocus={(e) => { if (isUnspecified(e.target.value)) e.target.select(); }}
                            onChange={(e) => handleWorkExpChange(jIdx, 'reasonForLeaving', e.target.value)} 
                            placeholder={t('cvAutofill.placeholderReasonForLeaving', '离职原因（Sunrise 核心标牌）')} 
                            style={getInputStyle(job.reasonForLeaving, 'rgba(245, 158, 11, 0.3)')}
                          />
                        </div>
                      </div>

                      <div className="form-group" style={{ marginTop: '10px', marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '11px' }}>{t('cvAutofill.labelResponsibilities', '工作职责与业绩 (Job Responsibilities - 每行一项)')}</label>
                        <textarea 
                          className="form-input" 
                          value={job.responsibilities} 
                          onChange={(e) => handleWorkExpChange(jIdx, 'responsibilities', e.target.value)} 
                          rows="3"
                          style={{ resize: 'vertical', fontSize: '12px' }}
                          placeholder={t('cvAutofill.placeholderResponsibilities', '输入职责内容，导出 Word 时将自动转为标准圆点列表 (•)...')}
                        ></textarea>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 模块 C: 教育背景 (Education) */}
              <div style={{ marginBottom: '20px', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-emerald)', fontWeight: 600, fontSize: '0.95rem' }}>
                    <i className="ph-bold ph-graduation-cap"></i> {t('cvAutofill.secEducation', '教育背景 (Education)')}
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={handleAddEducation}
                    style={{ fontSize: '12px', padding: '4px 10px', height: '28px', color: 'var(--accent-emerald)' }}
                  >
                    <i className="ph-bold ph-plus"></i> {t('cvAutofill.btnAddEducation', '添加学历背景')}
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {(formData.educationList || [
                    { school: formData.school, degree: formData.degree, major: formData.major, graduationYear: formData.graduationYear }
                  ]).map((edu, eIdx) => (
                    <div 
                      key={eIdx}
                      style={{
                        padding: '14px',
                        background: 'rgba(0,0,0,0.2)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-subtle)',
                        position: 'relative'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span className="badge" style={{ color: 'var(--accent-emerald)', background: 'rgba(168, 85, 247, 0.1)', borderColor: 'rgba(16, 185, 129, 0.3)', fontSize: '11px' }}>
                          {t('cvAutofill.badgeEduItem', { num: eIdx + 1 }, `学历 #${eIdx + 1}`)} {eIdx === 0 ? t('cvAutofill.badgePrimaryEdu', '(最高 / 最近学历)') : ''}
                        </span>
                        {(formData.educationList?.length > 1) && (
                          <button
                            type="button"
                            className="btn-icon"
                            title={t('cvAutofill.btnDeleteEdu', '删除此学历')}
                            onClick={() => handleRemoveEducation(eIdx)}
                            style={{ width: '24px', height: '24px', color: 'var(--text-muted)' }}
                          >
                            <i className="ph-light ph-trash"></i>
                          </button>
                        )}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 0.8fr', gap: '10px' }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>{t('cvAutofill.labelSchool', '毕业院校 (School)')} <span style={{ color: 'var(--accent-rose)' }}>*</span></span>
                            {isUnspecified(edu.school) && (
                              <span className="badge" style={{ fontSize: '9px', background: 'rgba(245, 158, 11, 0.2)', color: 'var(--accent-amber)', borderColor: 'rgba(245, 158, 11, 0.4)', padding: '0 4px' }}>{t('cvAutofill.badgeUnspecified', '⚠️ 未注明')}</span>
                            )}
                          </label>
                          <input 
                            type="text" 
                            className="form-input" 
                            value={edu.school || ''} 
                            onFocus={(e) => { if (isUnspecified(e.target.value)) e.target.select(); }}
                            onChange={(e) => handleEducationChange(eIdx, 'school', e.target.value)} 
                            style={getInputStyle(edu.school)}
                            placeholder={t('cvAutofill.placeholderSchool', '大学或学院全称')} 
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '11px' }}>{t('cvAutofill.labelDegree', '学历等级 (Degree)')}</label>
                          <input 
                            type="text" 
                            className="form-input" 
                            value={edu.degree || ''} 
                            onFocus={(e) => { if (isUnspecified(e.target.value)) e.target.select(); }}
                            onChange={(e) => handleEducationChange(eIdx, 'degree', e.target.value)} 
                            style={getInputStyle(edu.degree)}
                            placeholder={t('cvAutofill.placeholderDegree', 'SPM / Diploma / Degree')} 
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '11px' }}>{t('cvAutofill.labelMajor', '主修专业 (Major)')}</label>
                          <input 
                            type="text" 
                            className="form-input" 
                            value={edu.major || ''} 
                            onFocus={(e) => { if (isUnspecified(e.target.value)) e.target.select(); }}
                            onChange={(e) => handleEducationChange(eIdx, 'major', e.target.value)} 
                            style={getInputStyle(edu.major)}
                            placeholder={t('cvAutofill.placeholderMajor', '如: IT / Accounting')} 
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '11px' }}>{t('cvAutofill.labelGradYear', '毕业年份 (Year)')}</label>
                          <input 
                            type="text" 
                            className="form-input" 
                            value={edu.graduationYear || ''} 
                            onFocus={(e) => { if (isUnspecified(e.target.value)) e.target.select(); }}
                            onChange={(e) => handleEducationChange(eIdx, 'graduationYear', e.target.value)} 
                            style={getInputStyle(edu.graduationYear)}
                            placeholder={t('cvAutofill.placeholderGradYear', '如: 2027')} 
                          />
                        </div>
                      </div>

                      <div style={{ marginTop: '10px' }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label" style={{ fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>{t('cvAutofill.labelQualification', '资质 / 文凭全称 (Qualification - Sunrise Word 报告展示)')}</span>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{t('cvAutofill.qualificationHint', '优先保留原汁原味 (如包含 Honours 荣誉学士或 of/in 等学术格式)')}</span>
                          </label>
                          <input 
                            type="text" 
                            className="form-input" 
                            value={edu.qualification || ''} 
                            onFocus={(e) => { if (isUnspecified(e.target.value)) e.target.select(); }}
                            onChange={(e) => handleEducationChange(eIdx, 'qualification', e.target.value)} 
                            style={getInputStyle(edu.qualification)}
                            placeholder={t('cvAutofill.placeholderQualification', '如: Bachelor of Business Administration (Honours) / Diploma in Business')} 
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 模块 D: 技能与语言 (Skills & Languages) */}
              <div style={{ marginBottom: '20px', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', color: 'var(--accent-amber)', fontWeight: 600, fontSize: '0.95rem' }}>
                  <i className="ph-bold ph-cpu"></i> {t('cvAutofill.secSkillsLanguages', '核心技能与熟练语言 (Skills & Languages)')}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">{t('cvAutofill.labelSkills', '专业技能 (Skills - 逗号分隔)')}</label>
                    <input type="text" name="skills" className="form-input" value={formData.skills} onChange={handleChange} placeholder={t('cvAutofill.placeholderSkills', '如: Python, Java, SQL, Firebase')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('cvAutofill.labelLanguages', '熟练语言 (Languages - 逗号分隔)')}</label>
                    <input type="text" name="languages" className="form-input" value={formData.languages} onChange={handleChange} placeholder={t('cvAutofill.placeholderLanguages', '如: English, Malay, Mandarin')} />
                  </div>
                </div>
              </div>

              {/* 模块 E: 入库阶段与综合备注 (ATS Settings) */}
              <div style={{ marginBottom: '20px', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px', color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.95rem' }}>
                  <i className="ph-bold ph-gear"></i> {t('cvAutofill.secAtsSettings', '系统入库设置 (ATS Pipeline)')}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">{t('cvAutofill.labelStage', '录入后所处阶段 (Candidate Stage)')}</label>
                    <select name="stage" className="form-select" value={formData.stage} onChange={handleChange}>
                      <option value="screening">{t('cvAutofill.stageScreening', '简历筛选 (Screening)')}</option>
                      <option value="phone">{t('cvAutofill.stagePhone', '初筛电话 (Phone Screen)')}</option>
                      <option value="interview">{t('cvAutofill.stageInterview', '面试考核 (Interview)')}</option>
                      <option value="offer">{t('cvAutofill.stageOffer', 'Offer 发放 (Offer)')}</option>
                    </select>
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: '10px' }}>
                  <label className="form-label">{t('cvAutofill.labelNotes', '其他备注 / 经历摘要')}</label>
                  <textarea 
                    name="notes" 
                    className="form-input" 
                    value={formData.notes} 
                    onChange={handleChange} 
                    rows="3"
                    style={{ resize: 'vertical' }}
                    placeholder={t('cvAutofill.placeholderNotes', '汇总的面试备注与综合评语...')}
                  ></textarea>
                </div>
              </div>

              {/* 缺失项预警 */}
              {missingAnalysis && (
                <div style={{ marginBottom: '16px', padding: 'var(--space-4)', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 'var(--radius-md)' }}>
                  <h4 style={{ color: 'var(--accent-amber)', fontSize: '0.9rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="ph-fill ph-warning-circle"></i> {t('cvAutofill.diagTitle', 'Sunrise 简历完整性诊断 (缺失关键字段)')}
                  </h4>
                  {missingAnalysis.missing_critical_fields?.length > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t('cvAutofill.diagMissingFields', '未在简历中检测到的必填项：')}</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                        {missingAnalysis.missing_critical_fields.map((field, idx) => (
                          <span key={idx} style={{ fontSize: '0.75rem', background: 'rgba(245, 158, 11, 0.2)', color: 'var(--accent-amber)', padding: '2px 8px', borderRadius: '4px' }}>
                            {field.split('.').pop()}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {missingAnalysis.suggested_questions_for_hr?.length > 0 && (
                    <div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t('cvAutofill.diagSuggestedQuestions', '建议 HR 进一步追问话术 (English)：')}</span>
                      <ul style={{ margin: '4px 0 0 0', paddingLeft: '20px', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                        {missingAnalysis.suggested_questions_for_hr.map((q, idx) => (
                          <li key={idx} style={{ marginBottom: '4px' }}>{q}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* 操作栏 */}
              <div style={{ marginTop: 'auto', paddingTop: 'var(--space-4)', display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--border-hairline)' }}>
                <button 
                  className="btn btn-secondary" 
                  onClick={handleExportDocx} 
                  disabled={isExporting}
                  style={{ padding: '12px 24px', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-blue)', border: '1px solid rgba(59, 130, 246, 0.3)' }}
                >
                  {isExporting ? (
                    <><i className="ph-light ph-spinner ph-spin"></i> {t('cvAutofill.btnExporting', '正在生成...')}</>
                  ) : (
                    <><i className="ph-bold ph-download-simple"></i> {t('cvAutofill.btnExportDocx', '导出 Sunrise CV (Word)')}</>
                  )}
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={handleSave} 
                  disabled={isSaving}
                  style={{ padding: '12px 32px', fontSize: '1.05rem', background: 'var(--accent-emerald)' }}
                >
                  {isSaving ? (
                    <><i className="ph-light ph-spinner ph-spin"></i> {t('cvAutofill.btnSaving', '正在入库...')}</>
                  ) : (
                    <><i className="ph-bold ph-check"></i> {t('cvAutofill.btnSaveCandidate', '确认信息并录入档案库')}</>
                  )}
                </button>
              </div>

            </div>
          </div>
        </div>

      </div>

      {/* 从人才库选择候选人弹窗 */}
      {isCandidatePickerOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10000, padding: '20px'
        }} onClick={() => setIsCandidatePickerOpen(false)}>
          <div style={{
            background: 'var(--card-bg, #1e2235)',
            border: '1px solid var(--border-hairline, rgba(255, 255, 255, 0.1))',
            borderRadius: 'var(--radius-lg, 12px)',
            width: '100%', maxWidth: '640px', maxHeight: '80vh',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            overflow: 'hidden'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid var(--border-hairline)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="ph-fill ph-users" style={{ color: 'var(--accent-purple)', fontSize: '18px' }}></i>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>{t('cvAutofill.pickerModalTitle', '从人才库选择候选人')}</h3>
              </div>
              <button className="btn-icon" onClick={() => setIsCandidatePickerOpen(false)}>
                <i className="ph-light ph-x"></i>
              </button>
            </div>

            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-hairline)' }}>
              <div style={{ position: 'relative' }}>
                <i className="ph-light ph-magnifying-glass" style={{
                  position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--text-muted)', fontSize: '16px'
                }}></i>
                <input
                  type="text"
                  className="form-input"
                  style={{ paddingLeft: '38px', width: '100%' }}
                  placeholder={t('cvAutofill.pickerSearchPlaceholder', '搜索候选人姓名、电话、应聘职位或公司...')}
                  value={candidatePickerSearch}
                  onChange={(e) => setCandidatePickerSearch(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
              {isLoadingCandidatesList ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <i className="ph-light ph-spinner ph-spin" style={{ fontSize: '24px', marginBottom: '8px' }}></i>
                  <div>{t('common.loading', '正在加载候选人列表...')}</div>
                </div>
              ) : filteredCandidates.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  {t('cvAutofill.pickerEmpty', '未找到匹配的候选人档案')}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {filteredCandidates.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => handleSelectCandidateFromPicker(c)}
                      style={{
                        padding: '12px 14px', borderRadius: 'var(--radius-md)',
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid var(--border-hairline)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        cursor: 'pointer', transition: 'all 0.2s'
                      }}
                      className="hover-card"
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{c.name}</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.phone || t('candidates.noPhone', '未留电话')}</span>
                          {c.gender && (
                            <span className="badge" style={{ fontSize: '10px', padding: '1px 5px' }}>{c.gender}</span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', gap: '10px' }}>
                          <span><i className="ph ph-briefcase" style={{ marginRight: '4px' }}></i>{c.position || t('candidates.noPositionAssigned', '未指定岗位')}</span>
                          {c.company && <span><i className="ph ph-buildings" style={{ marginRight: '4px' }}></i>{c.company}</span>}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary btn-xs"
                        style={{ color: 'var(--accent-purple)', borderColor: 'rgba(168, 85, 247, 0.3)', pointerEvents: 'none' }}
                      >
                        <i className="ph ph-arrow-right"></i> {t('cvAutofill.pickerSelectBtn', '载入并填表')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CvAutofillPage() {
  return (
    <Suspense fallback={
      <div className="page-view active" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="ph-light ph-spinner ph-spin" style={{ fontSize: '20px' }}></i>
          <span>正在准备 CV Auto Fill...</span>
        </div>
      </div>
    }>
      <CvAutofillContent />
    </Suspense>
  );
}
