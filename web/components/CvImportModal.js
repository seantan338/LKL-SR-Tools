'use client';

import { useState, useRef } from 'react';
import { useAuth } from '../lib/auth-context';
import { useFeedback } from '../lib/feedback-context';
import { useI18n } from '../lib/i18n-context';
import { FirestoreStore } from '../lib/firestore-store';
import { SystemLogger } from '../lib/logger';
import WhatsAppButton from './WhatsAppButton';
import { authFetch } from '../lib/api-client';

/**
 * 智能逆向推断文件名中的线索
 * 兼容: 'Sunrise CV - Position - Candidate Name.docx'
 * 或:   'Company - Position - Candidate Name.docx'
 */
function extractFilenameHints(filename) {
  if (!filename) return {};
  const clean = filename.replace(/\.[^/.]+$/, "");
  const parts = clean
    .replace(/ - /g, "-")
    .replace(/ -/g, "-")
    .replace(/- /g, "-")
    .split("-")
    .map(s => s.trim())
    .filter(Boolean);

  if (parts.length >= 3) {
    return {
      company: parts[0],
      position: parts[1],
      name: parts[2]
    };
  } else if (parts.length === 2) {
    return {
      company: '',
      position: parts[0],
      name: parts[1]
    };
  }
  return {};
}

/**
 * 将大模型提取出的简历原始 JSON 归一化为标准的候选人数据对象
 * 深度对齐 Sunrise 猎头全量画像（国籍、种族、现薪、期薪、到岗时间、离职原因履历等）
 */
function normalizeExtractedCv(raw, filename = '', defaultPicName = '', isEn = false) {
  const parsedCv = raw.parsed_cv || {};
  const personal = parsedCv.personal_information || {};
  const prof = parsedCv.professional_history?.[0] || {};
  const edu = parsedCv.education?.[0] || {};
  const hints = extractFilenameHints(filename);

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

  const allSkills = Array.isArray(raw.skills) ? raw.skills : (Array.isArray(parsedCv.skills) ? parsedCv.skills : []);
  const allLanguages = Array.isArray(parsedCv.languages) ? parsedCv.languages : [];
  const workHistory = Array.isArray(parsedCv.professional_history) ? parsedCv.professional_history : [];

  const skillsLabel = isEn ? '[Skills]: ' : '【技能专长】: ';
  const langsLabel = isEn ? '[Languages]: ' : '【熟练语言】: ';
  const salaryLabel = isEn ? '[Expected Salary]: ' : '【期望薪资】: ';
  const availLabel = isEn ? '[Availability]: ' : '【到岗时间】: ';

  const notesParts = [
    raw.summary || '',
    allSkills.length ? `${skillsLabel}${allSkills.join(', ')}` : '',
    allLanguages.length ? `${langsLabel}${allLanguages.join(', ')}` : '',
    personal.expected_salary ? `${salaryLabel}${personal.expected_salary}` : '',
    personal.availability ? `${availLabel}${personal.availability}` : ''
  ].filter(Boolean).join('\n');

  // 公司与职位推断：仅当文件名明确包含规范企业前缀时提取，普通简历绝不拿前雇主或 AI 揣测冒充意向客户
  const resolvedCompany = (hints.company && !hints.company.toLowerCase().includes('sunrise'))
    ? hints.company 
    : '';

  const resolvedPosition = parsedCv.position_applied || hints.position || prof.position || raw.currentPosition || (raw.workExperience?.[0]?.position) || '';
  const resolvedName = personal.name || hints.name || raw.name || '';

  return {
    _id: Math.random().toString(36).substring(2, 9),
    name: resolvedName,
    phone: personal.phone || raw.phone || '',
    email: personal.email || raw.email || '',
    location: personal.address || raw.location || '',
    company: resolvedCompany,
    position: resolvedPosition,
    school: edu.school || raw.education?.[0]?.school || '',
    degree: extractedDegree || '',
    major: extractedMajor || '',
    qualification: finalQual || '',
    experience: parsedCv.total_years_experience || raw.totalYearsExperience || '',
    tags: allSkills,
    skillsText: allSkills.join(', '),
    
    // Sunrise CV 专属全量画像
    nationality: personal.nationality || 'Malaysian',
    race: personal.race || '',
    gender: personal.gender || 'Male',
    maritalStatus: personal.marital_status || 'Single',
    lastDrawnSalary: personal.last_drawn_salary || '',
    expectedSalary: personal.expected_salary || '',
    salary: personal.expected_salary || personal.last_drawn_salary || '',
    offered: personal.expected_salary || '',
    availability: personal.availability || 'Immediate',
    languages: allLanguages,
    languagesText: allLanguages.join(', '),
    workExperience: workHistory,
    
    notes: notesParts,
    picName: defaultPicName,
    stage: 'screening',
    status: 'active',
    source: isEn ? 'AI CV Parser Import' : 'AI 简历解析导入',
    rawResumeFilename: filename
  };
}

export default function CvImportModal({ isOpen, onClose, onSuccess }) {
  const { teamId, user, userProfile } = useAuth();
  const { showToast } = useFeedback();
  const { t, lang } = useI18n();
  const isEn = lang === 'en';
  
  const [activeTab, setActiveTab] = useState('file'); // 'file' | 'text'
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [cvText, setCvText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parsingProgress, setParsingProgress] = useState({ current: 0, total: 0 });
  const [parseError, setParseError] = useState('');
  
  // 批量/单候选人已解析列表
  const [parsedCandidates, setParsedCandidates] = useState([]);
  const [editingCandidateId, setEditingCandidateId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  // 清除历史脏数据
  if (typeof window !== 'undefined' && localStorage.getItem('TALENT_FLOW_MY_PIC')) {
    try { localStorage.removeItem('TALENT_FLOW_MY_PIC'); } catch (e) {}
  }

  const defaultPicName = 
    userProfile?.displayName || 
    user?.displayName || 
    '';

  const validateFiles = (files) => {
    const valid = [];
    const errors = [];
    const validExts = ['pdf', 'docx', 'doc', 'txt', 'jpg', 'jpeg', 'png', 'webp'];

    Array.from(files).forEach(file => {
      const ext = file.name.split('.').pop().toLowerCase();
      if (!validExts.includes(ext)) {
        errors.push(t('cvImportModal.errUnsupportedFormat', { name: file.name }, `${file.name}: 格式不支持 (仅支持 .docx, .doc, .pdf, .txt, 图片)`));
      } else if (file.size > 20 * 1024 * 1024) {
        errors.push(t('cvImportModal.errFileTooLarge', { name: file.name }, `${file.name}: 文件超过 20MB 上限`));
      } else {
        valid.push(file);
      }
    });

    if (errors.length > 0) {
      setParseError(errors.slice(0, 3).join('； '));
    } else {
      setParseError('');
    }
    return valid;
  };

  const handleFileDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const valid = validateFiles(e.dataTransfer.files);
      if (valid.length > 0) {
        setSelectedFiles(prev => [...prev, ...valid]);
      }
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const valid = validateFiles(e.target.files);
      if (valid.length > 0) {
        setSelectedFiles(prev => [...prev, ...valid]);
      }
    }
  };

  const removeSelectedFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // 执行 AI 解析流水线
  const handleStartParse = async () => {
    setParseError('');
    setIsParsing(true);
    const results = [];

    try {
      if (activeTab === 'file') {
        if (selectedFiles.length === 0) {
          setParseError(t('cvImportModal.errSelectFileFirst', '请先选择或拖拽简历 Word (.docx) / PDF 文档'));
          setIsParsing(false);
          return;
        }

        setParsingProgress({ current: 0, total: selectedFiles.length });

        for (let i = 0; i < selectedFiles.length; i++) {
          const file = selectedFiles[i];
          setParsingProgress({ current: i + 1, total: selectedFiles.length });

          try {
            const formData = new FormData();
            formData.append('file', file);

            const res = await authFetch('/api/parse/file/cv', {
              method: 'POST',
              body: formData
            });

            let json = null;
            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
              json = await res.json().catch(() => null);
            } else {
              const textErr = await res.text().catch(() => '');
              throw new Error(`AI 服务异常 (HTTP ${res.status}): ${textErr.slice(0, 150) || '未返回有效结果'}`);
            }

            if (!res.ok || !json || json.status === 'error') {
              throw new Error(json?.message || `文件 ${file.name} 解析失败 (HTTP ${res.status})`);
            }

            const candidate = normalizeExtractedCv(json.data || {}, file.name, defaultPicName, isEn);
            results.push(candidate);
          } catch (fileErr) {
            console.warn(`解析文件 ${file.name} 错误:`, fileErr);
            // 标记解析失败卡片，方便用户知晓
            results.push({
              _id: Math.random().toString(36).substring(2, 9),
              name: file.name.replace(/\.[^/.]+$/, ""),
              company: '',
              position: isEn ? 'Pending' : '待定',
              phone: '',
              tags: [],
              parseFailed: true,
              errorMessage: fileErr.message,
              rawResumeFilename: file.name
            });
          }
        }
      } else {
        // 纯文本解析
        if (!cvText.trim()) {
          setParseError(t('cvImportModal.errPasteTextFirst', '请粘贴简历内容文本'));
          setIsParsing(false);
          return;
        }

        setParsingProgress({ current: 1, total: 1 });

        const res = await authFetch('/api/parse/cv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: cvText })
        });

        let json = null;
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          json = await res.json().catch(() => null);
        } else {
          const textErr = await res.text().catch(() => '');
          throw new Error(`AI 服务异常 (HTTP ${res.status}): ${textErr.slice(0, 150) || '未返回有效结果'}`);
        }

        if (!res.ok || !json || json.status === 'error') {
          throw new Error(json?.message || `AI 文本简历解析失败 (HTTP ${res.status})`);
        }

        const candidate = normalizeExtractedCv(json.data || {}, 'Pasted Text CV', defaultPicName, isEn);
        results.push(candidate);
      }

      setParsedCandidates(results);
      if (results.length === 1 && !results[0].parseFailed) {
        setEditingCandidateId(results[0]._id);
      }
    } catch (err) {
      console.error('Failed to parse CVs:', err);
      setParseError(err.message || t('cvImportModal.errServiceUnavailable', '解析服务暂时不可用，请确认后端微服务正在运行'));
    } finally {
      setIsParsing(false);
    }
  };

  // 保存单个候选人到 Firestore
  const saveCandidateToFirestore = async (item) => {
    const skillsArray = item.skillsText
      ? item.skillsText.split(/[,，、\s]+/).map(s => s.trim()).filter(Boolean)
      : (item.tags || []);

    const languagesArray = item.languagesText
      ? item.languagesText.split(/[,，、\s]+/).map(s => s.trim()).filter(Boolean)
      : (item.languages || []);

    const payload = {
      name: item.name?.trim() || (isEn ? 'Unnamed Candidate' : '未命名候选人'),
      phone: item.phone?.trim() || '',
      email: item.email?.trim() || '',
      location: item.location?.trim() || '',
      company: item.company?.trim() || '',
      position: item.position?.trim() || '',
      school: item.school?.trim() || '',
      degree: item.degree?.trim() || '',
      major: item.major?.trim() || '',
      experience: item.experience?.trim() || '',
      tags: skillsArray,
      notes: item.notes?.trim() || '',
      picName: item.picName?.trim() || defaultPicName,
      stage: item.stage || 'screening',
      status: item.status || 'active',
      source: isEn ? 'AI CV Parser Import' : 'AI 简历解析导入',
      
      // Sunrise CV 字段全量持久化
      nationality: item.nationality || 'Malaysian',
      race: item.race || '',
      gender: item.gender || 'Male',
      maritalStatus: item.maritalStatus || 'Single',
      lastDrawnSalary: item.lastDrawnSalary || '',
      expectedSalary: item.expectedSalary || '',
      salary: item.expectedSalary || item.lastDrawnSalary || '',
      offered: item.expectedSalary || '',
      availability: item.availability || 'Immediate',
      languages: languagesArray,
      workExperience: item.workExperience || [],
      rawResumeFilename: item.rawResumeFilename || '',
      
      interviewDate: '',
      interviewTime: ''
    };

    const saveResult = await FirestoreStore.upsertCandidate(teamId, user.uid, payload, payload.rawResumeFilename);
    if (saveResult.isMerged) {
      SystemLogger.audit(teamId, user, 'UPDATE', 'CANDIDATE', payload.name, {
        actionDetail: `AI 简历解析导入检测到同电话候选人 (${payload.phone})，已合并更新档案并追加重新投递记录`
      });
    } else {
      SystemLogger.audit(teamId, user, 'CREATE', 'CANDIDATE', payload.name, {
        actionDetail: `AI 简历解析导入入库 (Sunrise 标准画像): ${payload.name} (${payload.position})`
      });
    }
    return saveResult;
  };

  // 单个保存
  const handleSaveSingle = async (candidate) => {
    if (!candidate.name?.trim()) {
      setParseError(t('cvImportModal.errNameRequired', '候选人姓名不能为空'));
      return;
    }
    setIsSaving(true);
    try {
      const savedDoc = await saveCandidateToFirestore(candidate);
      if (onSuccess) onSuccess(savedDoc);
      // 从未存列表中移除
      setParsedCandidates(prev => prev.filter(c => c._id !== candidate._id));
      if (savedDoc.isMerged) {
        showToast(t('extraUi.duplicatePhoneMergedToast', { phone: candidate.phone || candidate.name }, `🎉 检测到已存在同电话候选人 (${candidate.phone || candidate.name})，已合并更新档案并追加重投记录！`));
      } else {
        showToast(t('cvImportModal.toastCandidateSaved', { name: candidate.name }, `🎉 候选人 ${candidate.name} 已成功入库！`));
      }
      if (parsedCandidates.length <= 1) {
        handleClose();
      }
    } catch (err) {
      setParseError(t('cvImportModal.errSaveFailed', { msg: err.message }, `保存失败: ${err.message}`));
    } finally {
      setIsSaving(false);
    }
  };

  // 一键全部保存
  const handleSaveAll = async () => {
    const validItems = parsedCandidates.filter(c => !c.parseFailed);
    if (validItems.length === 0) {
      setParseError(t('cvImportModal.errNoValidCandidates', '没有可保存的有效候选人数据'));
      return;
    }

    setIsSaving(true);
    let lastSaved = null;
    let successCount = 0;
    let mergedCount = 0;
    let createdCount = 0;

    try {
      for (const item of validItems) {
        try {
          const doc = await saveCandidateToFirestore(item);
          if (doc.isMerged) {
            mergedCount++;
          } else {
            createdCount++;
          }
          lastSaved = doc;
          successCount++;
        } catch (itemErr) {
          console.error(`保存 ${item.name} 失败:`, itemErr);
        }
      }

      if (onSuccess && lastSaved) {
        onSuccess(lastSaved);
      }
      if (mergedCount > 0) {
        showToast(t('cvImportModal.toastBatchSavedMerged', { created: createdCount, merged: mergedCount }, `🎉 批量入库完成：新建 ${createdCount} 人，合并更新 ${mergedCount} 人并追加重投记录！`));
      } else {
        showToast(t('cvImportModal.toastBatchSavedNew', { created: createdCount }, `🎉 成功录入 ${createdCount} 位候选人！`));
      }
      handleClose();
    } catch (err) {
      setParseError(t('cvImportModal.errBatchSaveInterrupted', { msg: err.message }, `批量保存中断: ${err.message}`));
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setSelectedFiles([]);
    setCvText('');
    setParsedCandidates([]);
    setEditingCandidateId(null);
    setParseError('');
    setIsParsing(false);
    setIsSaving(false);
    onClose();
  };

  const updateCandidateField = (id, field, value) => {
    setParsedCandidates(prev => prev.map(c => {
      if (c._id !== id) return c;
      return { ...c, [field]: value };
    }));
  };

  const activeCandidate = parsedCandidates.find(c => c._id === editingCandidateId) || parsedCandidates[0];

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.78)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: 'var(--space-4)'
    }}>
      <div 
        className="bezel-shell" 
        style={{
          width: '100%',
          maxWidth: parsedCandidates.length > 0 ? (parsedCandidates.length > 1 && !editingCandidateId ? '860px' : '780px') : '580px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-interactive)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
          overflow: 'hidden',
          transition: 'max-width 0.3s ease'
        }}
      >
        {/* Header */}
        <div style={{
          padding: 'var(--space-4) var(--space-6)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(255, 255, 255, 0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <div style={{
              width: '38px', height: '38px', borderRadius: '10px',
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(139, 92, 246, 0.2))',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--accent-blue)', fontSize: '20px'
            }}>
              <i className="ph-fill ph-file-arrow-up"></i>
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {parsedCandidates.length > 0 ? (
                  parsedCandidates.length > 1 && !editingCandidateId ? (
                    <>
                      <span>{t('cvImportModal.batchReviewBadge', '批量核对候选人')}</span>
                      <span className="badge" style={{ color: 'var(--accent-blue)', borderColor: 'rgba(59, 130, 246, 0.3)' }}>
                        {t('cvImportModal.parsedCountBadge', { count: parsedCandidates.filter(c => !c.parseFailed).length }, `已解析 ${parsedCandidates.filter(c => !c.parseFailed).length} 份`)}
                      </span>
                    </>
                  ) : (
                    t('cvImportModal.reviewTitle', '核对并确认候选人 Sunrise 档案')
                  )
                ) : (
                  t('cvImportModal.uploadTitle', 'AI 智能简历导入 (支持 Sunrise DOCX 批量)')
                )}
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {parsedCandidates.length > 0
                  ? t('cvImportModal.reviewSubtitle', '已完整识别个人信息、薪资诉求及离职原因履历，确认无误后一键存入人才库')
                  : t('cvImportModal.uploadSubtitle', '支持拖入 1 份或多份 Word (.docx)、PDF 简历文件，自动解析全量 Sunrise 字段')}
              </p>
            </div>
          </div>
          <button 
            className="btn-icon" 
            onClick={handleClose} 
            title={t('cvImportModal.closeTip', '关闭')}
            style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'transparent' }}
          >
            <i className="ph-light ph-x"></i>
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: 'var(--space-5) var(--space-6)', overflowY: 'auto', flex: 1 }}>
          {parseError && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 14px', borderRadius: 'var(--radius-md)',
              background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.3)',
              color: 'var(--accent-rose)', fontSize: '0.85rem', marginBottom: 'var(--space-4)'
            }}>
              <i className="ph-bold ph-warning-circle" style={{ fontSize: '18px', flexShrink: 0 }}></i>
              <span>{parseError}</span>
            </div>
          )}

          {parsedCandidates.length === 0 ? (
            /* 步骤 1：选择/拖入文件或粘贴文本 */
            <div>
              <div style={{
                display: 'flex',
                background: 'rgba(255, 255, 255, 0.04)',
                borderRadius: 'var(--radius-pill)',
                padding: '3px',
                marginBottom: 'var(--space-5)',
                border: '1px solid var(--border-hairline)'
              }}>
                <button
                  type="button"
                  onClick={() => { setActiveTab('file'); setParseError(''); }}
                  style={{
                    flex: 1, padding: '7px 0', border: 'none', borderRadius: 'var(--radius-pill)',
                    background: activeTab === 'file' ? 'var(--accent-blue)' : 'transparent',
                    color: activeTab === 'file' ? '#ffffff' : 'var(--text-muted)',
                    fontSize: '0.85rem', fontWeight: activeTab === 'file' ? '600' : 'normal',
                    cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                  }}
                >
                  <i className="ph-light ph-files"></i> {t('cvImportModal.tabFileDrop', '文件批量拖拽 (.docx / .pdf)')}
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveTab('text'); setParseError(''); }}
                  style={{
                    flex: 1, padding: '7px 0', border: 'none', borderRadius: 'var(--radius-pill)',
                    background: activeTab === 'text' ? 'var(--accent-blue)' : 'transparent',
                    color: activeTab === 'text' ? '#ffffff' : 'var(--text-muted)',
                    fontSize: '0.85rem', fontWeight: activeTab === 'text' ? '600' : 'normal',
                    cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                  }}
                >
                  <i className="ph-light ph-textbox"></i> {t('cvImportModal.tabTextPaste', '文本直接粘贴')}
                </button>
              </div>

              {activeTab === 'file' ? (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".docx,.doc,.pdf,.txt,.jpg,.jpeg,.png,.webp"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />

                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleFileDrop}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: '2px dashed var(--border-interactive)',
                      borderRadius: 'var(--radius-lg)',
                      padding: 'var(--space-8) var(--space-4)',
                      textAlign: 'center',
                      background: selectedFiles.length > 0 ? 'rgba(59, 130, 246, 0.05)' : 'rgba(255, 255, 255, 0.01)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 'var(--space-3)'
                    }}
                  >
                    <div style={{
                      width: '56px', height: '56px', borderRadius: '50%',
                      background: selectedFiles.length > 0 ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: selectedFiles.length > 0 ? 'var(--accent-blue)' : 'var(--text-muted)',
                      fontSize: '28px'
                    }}>
                      <i className={`ph-light ${selectedFiles.length > 0 ? 'ph-file-doc' : 'ph-upload-simple'}`}></i>
                    </div>

                    <div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '0.98rem' }}>
                        {selectedFiles.length > 0
                          ? t('cvImportModal.selectedFilesHint', { count: selectedFiles.length }, `已选取 ${selectedFiles.length} 份简历文档（点击可继续添加）`)
                          : t('cvImportModal.dropzonePlaceholder', '点击选取或将 Sunrise Word (.docx) / PDF 拖拽至此处')}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '6px' }}>
                        {t('cvImportModal.dropzoneSubhint', '支持同时拖入多份文档批量解析；系统将自动识别离职原因与薪资全景')}
                      </div>
                    </div>
                  </div>

                  {/* 待解析文件列表 */}
                  {selectedFiles.length > 0 && (
                    <div style={{ marginTop: 'var(--space-4)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600' }}>
                          {t('cvImportModal.queueTitle', { count: selectedFiles.length }, `待解析队列 (${selectedFiles.length})`)}
                        </span>
                        <button 
                          className="btn btn-sm" 
                          onClick={(e) => { e.stopPropagation(); setSelectedFiles([]); }}
                          style={{ fontSize: '0.75rem', padding: '2px 8px', background: 'transparent' }}
                        >
                          {t('cvImportModal.clearQueue', '清空列表')}
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
                        {selectedFiles.map((file, idx) => (
                          <div key={idx} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '6px 12px', background: 'rgba(255, 255, 255, 0.02)',
                            borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)',
                            fontSize: '0.82rem'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                              <i className="ph-fill ph-file-doc" style={{ color: 'var(--accent-blue)', flexShrink: 0 }}></i>
                              <span style={{ color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                {file.name}
                              </span>
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', flexShrink: 0 }}>
                                ({(file.size / 1024).toFixed(1)} KB)
                              </span>
                            </div>
                            <button 
                              className="btn-icon" 
                              onClick={() => removeSelectedFile(idx)}
                              style={{ width: '24px', height: '24px', background: 'transparent', color: 'var(--text-muted)' }}
                            >
                              <i className="ph-bold ph-x"></i>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <textarea
                    className="form-input"
                    rows="8"
                    placeholder={t('cvImportModal.pastePlaceholder', '在此直接粘贴候选人简历全文，包含 Sunrise 模板的 Personal Information、Professional History 等内容...')}
                    value={cvText}
                    onChange={(e) => setCvText(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(0, 0, 0, 0.25)',
                      fontFamily: 'inherit',
                      fontSize: '0.85rem',
                      lineHeight: '1.6',
                      resize: 'vertical'
                    }}
                  ></textarea>
                </div>
              )}
            </div>
          ) : parsedCandidates.length > 1 && !editingCandidateId ? (
            /* 步骤 2-A：多文件批量核对列表卡片视图 */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 12px', background: 'rgba(59, 130, 246, 0.06)',
                borderRadius: 'var(--radius-md)', border: '1px solid rgba(59, 130, 246, 0.2)'
              }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                  <i className="ph-bold ph-sparkle" style={{ color: 'var(--accent-blue)', marginRight: '6px' }}></i>
                  {t('cvImportModal.batchExtractedBanner', { count: parsedCandidates.filter(c => !c.parseFailed).length }, `AI 已批量完成 ${parsedCandidates.filter(c => !c.parseFailed).length} 位候选人的 Sunrise 数据抽取`)}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {t('cvImportModal.clickCardToEditHint', '点击卡片可查看与微调详情')}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', maxHeight: '55vh', overflowY: 'auto' }}>
                {parsedCandidates.map((cand, idx) => {
                  if (cand.parseFailed) {
                    return (
                      <div key={cand._id} style={{
                        padding: '12px 14px', borderRadius: 'var(--radius-md)',
                        background: 'rgba(244, 63, 94, 0.04)', border: '1px solid rgba(244, 63, 94, 0.2)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                      }}>
                        <div>
                          <div style={{ color: 'var(--accent-rose)', fontWeight: '600', fontSize: '0.9rem' }}>
                            <i className="ph-bold ph-x-circle" style={{ marginRight: '6px' }}></i>
                            {cand.rawResumeFilename} {t('cvImportModal.parseFailedSuffix', '解析失败')}
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '2px' }}>
                            {cand.errorMessage || t('cvImportModal.noValidTextError', '无法提取有效文本')}
                          </div>
                        </div>
                        <button 
                          className="btn btn-sm btn-secondary"
                          onClick={() => setParsedCandidates(prev => prev.filter(c => c._id !== cand._id))}
                        >
                          {t('cvImportModal.ignoreItem', '忽略此项')}
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div 
                      key={cand._id}
                      onClick={() => setEditingCandidateId(cand._id)}
                      style={{
                        padding: '12px 16px', borderRadius: 'var(--radius-md)',
                        background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-subtle)',
                        cursor: 'pointer', transition: 'all 0.2s',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-blue)'}
                      onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                            {cand.name}
                          </span>
                          <span className="badge" style={{ color: 'var(--accent-blue)', background: 'rgba(59, 130, 246, 0.1)', borderColor: 'rgba(59, 130, 246, 0.2)' }}>
                            {cand.position || t('cvImportModal.unspecifiedPosition', '未定职位')}
                          </span>
                          {cand.company && (
                            <span className="badge" style={{ color: 'var(--text-secondary)' }}>
                              <i className="ph-light ph-buildings" style={{ marginRight: '4px' }}></i>
                              {cand.company}
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: '12px', fontSize: '0.78rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                          {cand.phone && <span>📞 {cand.phone}</span>}
                          {cand.nationality && <span>{t('cvImportModal.nationalityPrefix', '🌐 国籍: ')}{cand.nationality}</span>}
                          {cand.expectedSalary && (
                            <span style={{ color: 'var(--accent-emerald)' }}>
                              {t('cvImportModal.expectedSalaryPrefix', '💰 期望薪资: ')}{cand.expectedSalary}
                            </span>
                          )}
                          {cand.workExperience?.length > 0 && (
                            <span style={{ color: 'var(--accent-amber)' }}>
                              {t('cvImportModal.workExpCountBadge', { count: cand.workExperience.length }, `📜 ${cand.workExperience.length} 段履历 (含离职原因)`)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button 
                          className="btn btn-sm btn-secondary"
                          onClick={(e) => { e.stopPropagation(); setEditingCandidateId(cand._id); }}
                        >
                          <i className="ph-light ph-pencil-simple"></i> {t('cvImportModal.editBtn', '编辑')}
                        </button>
                        <button 
                          className="btn-icon"
                          title={t('cvImportModal.removeTip', '移除')}
                          onClick={(e) => { e.stopPropagation(); setParsedCandidates(prev => prev.filter(c => c._id !== cand._id)); }}
                          style={{ width: '28px', height: '28px', color: 'var(--text-muted)' }}
                        >
                          <i className="ph-light ph-trash"></i>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* 步骤 2-B：单候选人深度核对表单（包含 Sunrise 专属画像与履历） */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {parsedCandidates.length > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <button 
                    type="button" 
                    className="btn btn-sm btn-secondary"
                    onClick={() => setEditingCandidateId(null)}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <i className="ph-bold ph-arrow-left"></i> {t('cvImportModal.backToBatchList', '返回批量列表')}
                  </button>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {t('cvImportModal.editingPrefix', '正在编辑: ')}<strong>{activeCandidate?.name}</strong>
                  </span>
                </div>
              )}

              {/* 核心个人基础信息 */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 'var(--space-3)'
              }}>
                <div>
                  <label className="form-label" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {t('cvImportModal.candidateNameLabel', '候选人姓名')} <span style={{ color: 'var(--accent-rose)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={activeCandidate?.name || ''}
                    onChange={(e) => updateCandidateField(activeCandidate._id, 'name', e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{t('cvImportModal.phoneLabel', '联系电话')}</span>
                    {activeCandidate?.phone && (
                      <WhatsAppButton phone={activeCandidate.phone} candidateName={activeCandidate.name} variant="icon" style={{ padding: 0 }} />
                    )}
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={activeCandidate?.phone || ''}
                    onChange={(e) => updateCandidateField(activeCandidate._id, 'phone', e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {t('cvImportModal.emailLabel', '电子邮箱')}
                  </label>
                  <input
                    type="email"
                    className="form-input"
                    value={activeCandidate?.email || ''}
                    onChange={(e) => updateCandidateField(activeCandidate._id, 'email', e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {t('cvImportModal.locationLabel', '现居地址 / 城市')}
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={activeCandidate?.location || ''}
                    onChange={(e) => updateCandidateField(activeCandidate._id, 'location', e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {t('cvImportModal.positionLabel', '应聘/当前岗位 (Position)')}
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={activeCandidate?.position || ''}
                    onChange={(e) => updateCandidateField(activeCandidate._id, 'position', e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {t('cvImportModal.companyLabel', '意向企业 (Company)')}
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder={t('cvImportModal.companyPlaceholder', '如 IPE, PSA, Santak')}
                    value={activeCandidate?.company || ''}
                    onChange={(e) => updateCandidateField(activeCandidate._id, 'company', e.target.value)}
                  />
                </div>
              </div>

              {/* Sunrise CV 专属核心画像卡片区 */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.02)',
                padding: 'var(--space-3) var(--space-4)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)'
              }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--accent-amber)', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="ph-fill ph-identification-card"></i> {t('cvImportModal.sunriseProfileSection', 'Sunrise 专属背景画像与薪资诉求')}
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '8px'
                }}>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('cvImportModal.nationalityLabel', '国籍 (Nationality)')}</label>
                    <input
                      type="text"
                      className="form-input"
                      value={activeCandidate?.nationality || ''}
                      onChange={(e) => updateCandidateField(activeCandidate._id, 'nationality', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="form-label" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('cvImportModal.raceLabel', '种族 (Race)')}</label>
                    <input
                      type="text"
                      className="form-input"
                      value={activeCandidate?.race || ''}
                      onChange={(e) => updateCandidateField(activeCandidate._id, 'race', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="form-label" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('cvImportModal.genderLabel', '性别 (Gender)')}</label>
                    <select
                      className="form-select"
                      value={activeCandidate?.gender || 'Male'}
                      onChange={(e) => updateCandidateField(activeCandidate._id, 'gender', e.target.value)}
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>

                  <div>
                    <label className="form-label" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('cvImportModal.maritalLabel', '婚姻 (Marital)')}</label>
                    <select
                      className="form-select"
                      value={activeCandidate?.maritalStatus || 'Single'}
                      onChange={(e) => updateCandidateField(activeCandidate._id, 'maritalStatus', e.target.value)}
                    >
                      <option value="Single">Single</option>
                      <option value="Married">Married</option>
                    </select>
                  </div>

                  <div>
                    <label className="form-label" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('cvImportModal.lastDrawnLabel', '现薪 (Last Drawn)')}</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder={t('cvImportModal.lastDrawnPlaceholder', '如: RM 3,500')}
                      value={activeCandidate?.lastDrawnSalary || ''}
                      onChange={(e) => updateCandidateField(activeCandidate._id, 'lastDrawnSalary', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="form-label" style={{ fontSize: '0.72rem', color: 'var(--accent-emerald)' }}>{t('cvImportModal.expectedSalaryLabel', '期望薪资 (Expected)')}</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder={t('cvImportModal.expectedSalaryPlaceholder', '如: RM 4,500')}
                      value={activeCandidate?.expectedSalary || ''}
                      onChange={(e) => updateCandidateField(activeCandidate._id, 'expectedSalary', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="form-label" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('cvImportModal.availabilityLabel', '到岗时间 (Availability)')}</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder={t('cvImportModal.availabilityPlaceholder', '如: Immediate / 1 month')}
                      value={activeCandidate?.availability || ''}
                      onChange={(e) => updateCandidateField(activeCandidate._id, 'availability', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="form-label" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('cvImportModal.languagesLabel', '熟练语言 (Languages)')}</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder={t('cvImportModal.languagesPlaceholder', '如: English, Malay, Chinese')}
                      value={activeCandidate?.languagesText || ''}
                      onChange={(e) => updateCandidateField(activeCandidate._id, 'languagesText', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Sunrise 工作履历摘要（含离职原因） */}
              {activeCandidate?.workExperience?.length > 0 && (
                <div style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  padding: 'var(--space-3) var(--space-4)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)'
                }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--accent-blue)', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="ph-fill ph-briefcase"></i> {t('cvImportModal.workExpSection', { count: activeCandidate.workExperience.length }, `Sunrise 工作履历与离职原因 (${activeCandidate.workExperience.length} 段)`)}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '140px', overflowY: 'auto' }}>
                    {activeCandidate.workExperience.map((exp, expIdx) => (
                      <div key={expIdx} style={{
                        padding: '6px 10px', background: 'rgba(0, 0, 0, 0.2)',
                        borderRadius: 'var(--radius-sm)', fontSize: '0.76rem'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-primary)', fontWeight: '600' }}>
                          <span>{exp.position} · {exp.company}</span>
                          <span style={{ color: 'var(--text-muted)' }}>{exp.period}</span>
                        </div>
                        {exp.reason_for_leaving && (
                          <div style={{ marginTop: '3px', color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span className="badge" style={{ fontSize: '10px', padding: '1px 4px', background: 'rgba(245, 158, 11, 0.1)', color: 'var(--accent-amber)', borderColor: 'rgba(245, 158, 11, 0.2)' }}>
                              {t('cvImportModal.reasonForLeavingLabel', '离职原因:')}
                            </span>
                            <span>{exp.reason_for_leaving}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 教育背景与技能 */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 'var(--space-3)'
              }}>
                <div>
                  <label className="form-label" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {t('cvImportModal.schoolDegreeLabel', '毕业院校 / 学历专业')}
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={`${activeCandidate?.school || ''} ${activeCandidate?.degree || ''} ${activeCandidate?.major || ''}`.trim()}
                    onChange={(e) => updateCandidateField(activeCandidate._id, 'school', e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {t('cvImportModal.skillsLabel', '技能标签 (逗号隔开)')}
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={activeCandidate?.skillsText || ''}
                    onChange={(e) => updateCandidateField(activeCandidate._id, 'skillsText', e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div style={{
          padding: 'var(--space-4) var(--space-6)',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(255, 255, 255, 0.02)'
        }}>
          {parsedCandidates.length === 0 ? (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleClose}
                disabled={isParsing}
              >
                {t('cvImportModal.cancelBtn', '取消')}
              </button>
              
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleStartParse}
                disabled={isParsing || (activeTab === 'file' ? selectedFiles.length === 0 : !cvText.trim())}
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                {isParsing ? (
                  <>
                    <i className="ph-light ph-spinner ph-spin"></i>
                    {t('cvImportModal.aiParsingProgress', { current: parsingProgress.current, total: parsingProgress.total }, `AI 深度解析中 (${parsingProgress.current}/${parsingProgress.total})...`)}
                  </>
                ) : (
                  <>
                    <i className="ph-light ph-magic-wand"></i>
                    {t('cvImportModal.startAiParseBtn', '开始 AI 解析')} {selectedFiles.length > 1 ? `(${selectedFiles.length})` : ''}
                  </>
                )}
              </button>
            </>
          ) : parsedCandidates.length > 1 && !editingCandidateId ? (
            /* 批量核对视图底栏 */
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setParsedCandidates([])}
                disabled={isSaving}
              >
                <i className="ph-light ph-arrow-counter-clockwise"></i> {t('cvImportModal.reuploadBtn', '重新上传')}
              </button>

              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleClose}
                  disabled={isSaving}
                >
                  {t('cvImportModal.cancelBtn', '取消')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSaveAll}
                  disabled={isSaving || parsedCandidates.filter(c => !c.parseFailed).length === 0}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  {isSaving ? (
                    <>
                      <i className="ph-light ph-spinner ph-spin"></i>
                      {t('cvImportModal.batchSavingProgress', '正在批量存入人才库...')}
                    </>
                  ) : (
                    <>
                      <i className="ph-bold ph-check"></i>
                      {t('cvImportModal.saveAllBtn', { count: parsedCandidates.filter(c => !c.parseFailed).length }, `一键全部存入人才库 (${parsedCandidates.filter(c => !c.parseFailed).length})`)}
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            /* 单候选人详情编辑底栏 */
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  if (parsedCandidates.length > 1) {
                    setEditingCandidateId(null);
                  } else {
                    setParsedCandidates([]);
                  }
                }}
                disabled={isSaving}
              >
                {parsedCandidates.length > 1 ? t('cvImportModal.backToListBtn', '返回列表') : t('cvImportModal.reselectBtn', '重新选择')}
              </button>

              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleClose}
                  disabled={isSaving}
                >
                  {t('cvImportModal.cancelBtn', '取消')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleSaveSingle(activeCandidate)}
                  disabled={isSaving || !activeCandidate?.name?.trim()}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  {isSaving ? (
                    <>
                      <i className="ph-light ph-spinner ph-spin"></i>
                      {t('cvImportModal.savingSingleProgress', '正在存入人才库...')}
                    </>
                  ) : (
                    <>
                      <i className="ph-bold ph-check"></i>
                      {t('cvImportModal.confirmSaveBtn', '确认存入人才库')}
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
