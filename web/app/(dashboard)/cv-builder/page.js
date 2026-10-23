'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../../lib/auth-context';
import { useNotifications } from '../../../lib/notification-context';
import { useFeedback } from '../../../lib/feedback-context';
import { useI18n } from '../../../lib/i18n-context';
import { FirestoreStore } from '../../../lib/firestore-store';
import { AIService } from '../../../lib/ai-service';
import { PDFParser } from '../../../lib/pdf-parser';
import { CVGenerator } from '../../../lib/cv-generator';

export default function CVBuilderPage() {
  const { teamId, role, user } = useAuth();
  const { candidates, candidatesLoading: loading } = useNotifications();
  const { showToast } = useFeedback();
  const { t } = useI18n();
// AI Config
  const [aiProvider, setAiProvider] = useState('gemini');
  const [apiKey, setApiKey] = useState('');
  
  // Builder State
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  
  const [structuredData, setStructuredData] = useState({
    name: '', email: '', phone: '', summary: '', skills: [], education: [], experience: []
  });
  
  const previewRef = useRef(null);

  useEffect(() => {
    // Load saved API key
    const savedKey = sessionStorage.getItem(`CV_API_KEY_${aiProvider}`);
    if (savedKey) setApiKey(savedKey);
    else setApiKey('');
  }, [aiProvider]);
// Update preview whenever structured data changes
  useEffect(() => {
    if (previewRef.current && structuredData.name) {
      CVGenerator.renderCVPreview(structuredData, previewRef.current);
    }
  }, [structuredData]);

  const handleApiKeyChange = (e) => {
    const val = e.target.value;
    setApiKey(val);
    sessionStorage.setItem(`CV_API_KEY_${aiProvider}`, val);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setUploadedFile(file);
      setSelectedCandidateId(''); // Clear candidate selection if uploading file
    }
  };

  const handleProcess = async () => {
    if (!apiKey) {
      showToast(t('cvBuilder.toastEnterKey', '请输入 API Key'), 'warning');
      return;
    }
    if (!uploadedFile && !selectedCandidateId) {
      showToast(t('cvBuilder.toastSelectSource', '请选择候选人或上传简历 PDF'), 'warning');
      return;
    }

    setIsProcessing(true);
    setStatusMessage(t('cvBuilder.statusPreparing', '准备中...'));

    try {
      let rawText = '';
      
      if (uploadedFile) {
        setStatusMessage(t('cvBuilder.statusParsingPdf', '解析 PDF 文件...'));
        rawText = await PDFParser.extractTextFromPDF(uploadedFile);
      } else {
        const candidate = candidates.find(c => c.id === selectedCandidateId);
        // Build a raw text representation from existing candidate data
        rawText = `Name: ${candidate.name}\nPhone: ${candidate.phone}\nEmail: ${candidate.email}\nSchool: ${candidate.school}\nMajor: ${candidate.major}\nGraduation: ${candidate.graduationYear}\nCompany: ${candidate.company}\nPosition: ${candidate.position}\nNotes: ${candidate.notes || ''}\nRemarks: ${candidate.remarks || ''}`;
      }

      setStatusMessage(t('cvBuilder.statusExtracting', 'AI 结构化提取中 (可能需要几秒钟)...'));
      const aiService = new AIService(aiProvider, apiKey);
      const data = await aiService.extractResumeData(rawText);
      
      setStructuredData(data);
      setStatusMessage(t('cvBuilder.statusDone', '提取完成'));
    } catch (error) {
      console.error(error);
      setStatusMessage(`${t('cvBuilder.statusFailed', '处理失败: ')}${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDataChange = (field, value) => {
    setStructuredData(prev => ({ ...prev, [field]: value }));
  };

  const handleExportPDF = () => {
    if (previewRef.current && structuredData.name) {
      CVGenerator.exportToPDF(previewRef.current, `${structuredData.name}_CV.pdf`);
    }
  };

  const handleExportWord = () => {
    if (structuredData.name) {
      CVGenerator.exportToWord(structuredData, `${structuredData.name}_CV.docx`);
    }
  };

  return (
    <div className="page-view active" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', gap: 'var(--space-4)' }}>
      
      <div className="bezel-shell" style={{ flexShrink: 0 }}>
        <div className="bezel-core" style={{ padding: 'var(--space-3)', display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          
          <div className="form-group" style={{ marginBottom: 0, minWidth: '150px' }}>
            <label className="form-label">{t('cvBuilder.aiEngine', 'AI 引擎')}</label>
            <select className="form-select" value={aiProvider} onChange={(e) => setAiProvider(e.target.value)}>
              <option value="gemini">Google Gemini</option>
              <option value="openai">OpenAI GPT</option>
            </select>
          </div>
          
          <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: '200px' }}>
            <label className="form-label">API Key</label>
            <input type="password" className="form-input" placeholder="Enter API Key" value={apiKey} onChange={handleApiKeyChange} />
          </div>

          <div style={{ width: '1px', height: '36px', background: 'var(--border-hairline)', margin: '0 8px' }}></div>

          <div className="form-group" style={{ marginBottom: 0, minWidth: '200px' }}>
            <label className="form-label">{t('cvBuilder.candidateSource', '输入源：候选人')}</label>
            <select className="form-select" value={selectedCandidateId} onChange={(e) => { setSelectedCandidateId(e.target.value); setUploadedFile(null); }}>
              <option value="">{t('cvBuilder.selectCandidate', '-- 选择候选人 --')}</option>
              {candidates.map(c => (
                <option key={c.id} value={c.id}>{c.name} - {c.position || t('common.pending', '未定')}</option>
              ))}
            </select>
          </div>

          <div style={{ color: 'var(--text-faint)', fontSize: '0.8rem', paddingBottom: '8px' }}>{t('cvBuilder.or', '或')}</div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">{t('cvBuilder.uploadPdfSource', '输入源：上传简历 (PDF)')}</label>
            <input type="file" accept=".pdf" className="form-input" style={{ padding: '6px' }} onChange={handleFileChange} />
          </div>

          <button className="btn btn-primary" onClick={handleProcess} disabled={isProcessing}>
            <i className={`ph-light ${isProcessing ? 'ph-spinner ph-spin' : 'ph-magic-wand'}`}></i> {isProcessing ? t('cvBuilder.generating', '处理中...') : t('cvBuilder.generateBtn', '生成 CV')}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-4)', flex: 1, minHeight: 0 }}>
        
        {/* Editor Panel */}
        <div className="bezel-shell" style={{ flex: '1', display: 'flex', flexDirection: 'column', minWidth: '300px' }}>
          <div className="bezel-core" style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4)' }}>
            <h3 style={{ fontSize: 'var(--text-md)', marginBottom: 'var(--space-4)', color: 'var(--text-primary)' }}>{t('cvBuilder.dataAdjustment', '数据调整')}</h3>
            
            {statusMessage && (
              <div style={{ marginBottom: 'var(--space-4)', fontSize: '0.8rem', color: 'var(--accent-blue)', background: 'rgba(59, 130, 246, 0.1)', padding: '8px', borderRadius: '4px' }}>
                {statusMessage}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">{t('cvBuilder.name', '姓名')}</label>
              <input type="text" className="form-input" value={structuredData.name} onChange={e => handleDataChange('name', e.target.value)} />
            </div>
            
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">{t('cvBuilder.phone', '手机号')}</label>
                <input type="text" className="form-input" value={structuredData.phone} onChange={e => handleDataChange('phone', e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">{t('cvBuilder.email', '邮箱')}</label>
                <input type="text" className="form-input" value={structuredData.email} onChange={e => handleDataChange('email', e.target.value)} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">{t('cvBuilder.summary', '个人总结 (Summary)')}</label>
              <textarea className="form-textarea" rows={3} value={structuredData.summary} onChange={e => handleDataChange('summary', e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">{t('cvBuilder.skills', '技能 (以逗号分隔)')}</label>
              <input type="text" className="form-input" value={(structuredData.skills || []).join(', ')} onChange={e => handleDataChange('skills', e.target.value.split(',').map(s => s.trim()))} />
            </div>
            
            <div style={{ color: 'var(--text-faint)', fontSize: '0.8rem', marginTop: 'var(--space-4)' }}>
              {t('cvBuilder.demoNotice', '* 教育经历和工作经历暂通过左侧或JSON修改，当前 UI 仅作演示')}
            </div>

          </div>
        </div>

        {/* Preview Panel */}
        <div className="bezel-shell" style={{ flex: '1.5', display: 'flex', flexDirection: 'column', minWidth: '400px' }}>
          <div className="bezel-core" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3)', borderBottom: '1px solid var(--border-hairline)' }}>
              <h3 style={{ fontSize: 'var(--text-md)', margin: 0, color: 'var(--text-primary)' }}>{t('cvBuilder.livePreview', '实时预览')}</h3>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button className="btn btn-secondary btn-sm" onClick={handleExportWord} disabled={!structuredData.name}>
                  <i className="ph-light ph-file-doc"></i> {t('cvBuilder.exportWord', '导出 Word')}
                </button>
                <button className="btn btn-primary btn-sm" onClick={handleExportPDF} disabled={!structuredData.name}>
                  <i className="ph-light ph-file-pdf"></i> {t('cvBuilder.exportPdf', '导出 PDF')}
                </button>
              </div>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', background: '#d1d5db', padding: '20px' }}>
              {/* Scale down to fit depending on screen width */}
              <div style={{ transformOrigin: 'top center' }}>
                <div ref={previewRef} style={{ background: '#fff', minHeight: '1056px', width: '816px', margin: '0 auto', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                  {!structuredData.name && (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
                      {t('cvBuilder.previewPlaceholder', '提取数据后在此预览')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}
