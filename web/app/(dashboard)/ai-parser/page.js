'use client';

import { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, limit } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useAuth } from '../../../lib/auth-context';
import { useFeedback } from '../../../lib/feedback-context';
import { FirestoreStore } from '../../../lib/firestore-store';
import { SystemLogger } from '../../../lib/logger';
import { useI18n } from '../../../lib/i18n-context';
import { authFetch } from '../../../lib/api-client';

export default function AIParserPage() {
  const { user, teamId, role } = useAuth();
  const { showToast, confirm, prompt } = useFeedback();
  const { t, lang } = useI18n();
  
  // Input State
  const [inputText, setInputText] = useState('');
  const [file, setFile] = useState(null);
  const [orders, setOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  
  // Processing State
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  
  // Results State
  const [results, setResults] = useState(null); // { internal, cn, en, my }
  const [activeTab, setActiveTab] = useState('internal');
  
  // Versions State
  const [adVersions, setAdVersions] = useState([]);
  const [currentVersion, setCurrentVersion] = useState(null);

  // Load Job Orders
  useEffect(() => {
    if (!teamId || !user?.uid) return;
    const unsubscribe = FirestoreStore.subscribeToJobOrders(teamId, role, user.uid, (data) => {
      setOrders(data);
    });
    return () => unsubscribe();
  }, [teamId, role, user]);

  // Load Ad Versions
  useEffect(() => {
    if (!teamId) return;
    const unsubscribe = FirestoreStore.subscribeToAdVersions(teamId, (data) => {
      setAdVersions(data);
    });
    return () => unsubscribe();
  }, [teamId]);

  const handleOrderSelect = (e) => {
    const orderId = e.target.value;
    setSelectedOrderId(orderId);
    if (!orderId) {
      setInputText('');
      return;
    }
    
    const order = orders.find(o => o.id === orderId);
    if (order) {
      const text = `${t('aiParserPage.tplCompany')}: ${order.company || t('aiParserPage.tplTbd')}\n${t('aiParserPage.tplPosition')}: ${order.position || t('aiParserPage.tplTbd')}\n${t('aiParserPage.tplSalary')}: ${order.salary || t('aiParserPage.tplNegotiable')}\n${t('aiParserPage.tplLocation')}: ${order.location || t('aiParserPage.tplAny')}\n${t('aiParserPage.tplHours')}: ${order.workHours || t('aiParserPage.tplAny')}\n${t('aiParserPage.tplReqs')}:\n${order.requirements || t('aiParserPage.tplNone')}\n${t('aiParserPage.tplBenefits')}: ${order.benefits || t('aiParserPage.tplNone')}`;
      setInputText(text);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleProcess = async () => {
    if (!inputText.trim() && !file) {
      setError(t('aiParserPage.errNoInput'));
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      let response;
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        if (inputText.trim()) {
          formData.append('text', inputText);
        }
        
        response = await authFetch('/api/parse/file', {
          method: 'POST',
          body: formData
        });
      } else {
        response = await authFetch('/api/parse/text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: inputText })
        });
      }

      if (!response.ok) {
        let errBody = '';
        let errMsg = '';
        try {
          const jsonErr = await response.json();
          errMsg = jsonErr.message || jsonErr.detail || '';
        } catch(e) {
          try { errBody = await response.text(); } catch(_) {}
        }
        
        if (errMsg) {
          throw new Error(errMsg);
        }

        if ((response.status === 500 || response.status === 504) && (errBody.includes('Gateway Timeout') || errBody.includes('Bad Gateway'))) {
          throw new Error(t('aiParserPage.errTimeout'));
        }
        throw new Error(`${t('aiParserPage.errRequestFailed')} (${response.status}): ${errBody ? errBody.substring(0, 300) : t('aiParserPage.errUnknown')}`);
      }

      const data = await response.json();
      
      let generatedResults = { internal: t('aiParserPage.notGenerated'), cn: t('aiParserPage.notGenerated'), en: t('aiParserPage.notGenerated'), my: t('aiParserPage.notGenerated') };

      if (data.status === 'success') {
        const formatValue = (val) => {
          if (!val) return t('aiParserPage.notGenerated');
          if (typeof val === 'object') return JSON.stringify(val, null, 2);
          return val;
        };
        
        const hasStandardKeys = data.data.internal || data.data.public_cn || data.data.public_en || data.data.public_my;
        
        generatedResults = {
          internal: hasStandardKeys ? formatValue(data.data.internal) : JSON.stringify(data.data, null, 2),
          cn: hasStandardKeys ? formatValue(data.data.public_cn) : t('aiParserPage.notGenerated'),
          en: hasStandardKeys ? formatValue(data.data.public_en) : t('aiParserPage.notGenerated'),
          my: hasStandardKeys ? formatValue(data.data.public_my) : t('aiParserPage.notGenerated')
        };
      } else {
        if (data.status === 'error' && data.message) {
          throw new Error(data.message);
        }
        
        generatedResults = {
          internal: data.internal ? JSON.stringify(data.internal, null, 2) : t('aiParserPage.noData'),
          cn: data.public_cn ? JSON.stringify(data.public_cn, null, 2) : t('aiParserPage.noData'),
          en: data.public_en ? JSON.stringify(data.public_en, null, 2) : t('aiParserPage.noData'),
          my: data.public_my ? JSON.stringify(data.public_my, null, 2) : t('aiParserPage.noData')
        };
      }

      setResults(generatedResults);

      // Auto-save the freshly parsed AI result as a new version
      if (teamId && user?.uid) {
        const newTitle = t('aiParserPage.aiDraft') + new Date().toLocaleTimeString();
        const savedVersion = await FirestoreStore.addAdVersion(teamId, user.uid, {
          title: newTitle,
          content: generatedResults,
          orderId: selectedOrderId || null
        });
        setCurrentVersion(savedVersion);
        
        SystemLogger.audit(teamId, user, 'AI_PARSE', 'SYSTEM', t('aiParserPage.aiJobGen'), {
          actionDetail: file ? `${t('aiParserPage.parsedViaFile')} (${file.name})` : t('aiParserPage.parsedViaText'),
          textLength: inputText ? inputText.length : 0
        });
      }
      
    } catch (err) {
      console.error(err);
      setError(t('aiParserPage.parseFailed') + err.message + ' ' + t('aiParserPage.checkEngine'));
      SystemLogger.error(teamId, 'AD_GENERATOR', t('aiParserPage.engineError'), err);
    } finally {
      setIsProcessing(false);
    }
  };

  const copyToClipboard = () => {
    if (!results) return;
    const textToCopy = results[activeTab];
    navigator.clipboard.writeText(textToCopy).then(() => {
      showToast(t('aiParserPage.copied'), 'success');
    });
  };

  // --- Version Management Handlers ---

  const handleVersionSelect = (version) => {
    setCurrentVersion(version);
    setResults(version.content);
    if (version.orderId) {
      setSelectedOrderId(version.orderId);
    }
  };

  const handleNewBlankVersion = () => {
    setCurrentVersion(null);
    setResults(null);
    setInputText('');
    setSelectedOrderId('');
    setFile(null);
  };

  const handleRenameVersion = async (version) => {
    const newTitle = await prompt(t('aiParserPage.enterNewName'), version.title);
    if (newTitle && newTitle.trim() !== '' && newTitle !== version.title) {
      try {
        await FirestoreStore.updateAdVersion(teamId, version.id, { title: newTitle.trim() });
        if (currentVersion?.id === version.id) {
          setCurrentVersion(prev => ({ ...prev, title: newTitle.trim() }));
        }
        showToast(t('aiParserPage.nameUpdated'), 'success');
      } catch (e) {
        showToast(t('aiParserPage.renameFailed') + e.message, 'error');
      }
    }
  };

  const handleDeleteVersion = async (versionId) => {
    const ok = await confirm(t('aiParserPage.confirmDelVersion'), {
      title: t('aiParserPage.delVersionTitle'),
      danger: true,
      confirmLabel: t('aiParserPage.confirmDel')
    });
    if (ok) {
      try {
        await FirestoreStore.deleteAdVersion(teamId, versionId);
        if (currentVersion?.id === versionId) {
          handleNewBlankVersion();
        }
        showToast(t('aiParserPage.versionDeleted'), 'info');
      } catch (e) {
        showToast(t('aiParserPage.deleteFailed') + e.message, 'error');
      }
    }
  };

  const handleContentChange = (newText) => {
    setResults(prev => ({
      ...prev,
      [activeTab]: newText
    }));
  };

  const handleUpdateCurrentVersion = async () => {
    if (!currentVersion || !results) return;
    try {
      await FirestoreStore.updateAdVersion(teamId, currentVersion.id, {
        content: results,
        orderId: selectedOrderId || null
      });
      showToast(t('aiParserPage.saveSuccess'), 'success');
    } catch (e) {
      showToast(t('aiParserPage.saveFailed') + e.message, 'error');
    }
  };

  const handleSaveAsNewVersion = async () => {
    if (!results) return;
    const newTitle = await prompt(t('aiParserPage.enterNewName2'), (currentVersion ? currentVersion.title + t('aiParserPage.copySuffix') : t('aiParserPage.customVersion')));
    if (newTitle && newTitle.trim() !== '') {
      try {
        const newVersion = await FirestoreStore.addAdVersion(teamId, user.uid, {
          title: newTitle.trim(),
          content: results,
          orderId: selectedOrderId || null
        });
        setCurrentVersion(newVersion);
        showToast(t('aiParserPage.saveAsSuccess'), 'success');
      } catch (e) {
        showToast(t('aiParserPage.saveAsFailed') + e.message, 'error');
      }
    }
  };

  return (
    <div className="page-view active">
      <div style={{ display: 'flex', gap: 'var(--space-6)', maxWidth: '1400px', margin: '0 auto', width: '100%', height: 'calc(100vh - 100px)' }}>
        
        {/* Left Sidebar: Version History */}
        <div className="bezel-shell" style={{ width: '280px', flexShrink: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="bezel-core" style={{ padding: 'var(--space-4)', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <h3 style={{ fontSize: 'var(--text-md)', margin: 0 }}><i className="ph-light ph-clock-counter-clockwise"></i> {t('aiParserPage.historyTitle')}</h3>
              <button className="btn-icon" title={t('aiParserPage.resetBtn')} onClick={handleNewBlankVersion}>
                <i className="ph-light ph-plus"></i>
              </button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {adVersions.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', textAlign: 'center', marginTop: 'var(--space-6)' }}>
                  {t('aiParserPage.noHistory')}<br/><span style={{ fontSize: '0.7rem' }}>{t('aiParserPage.noHistoryDesc')}</span>
                </div>
              )}
              {adVersions.map(v => (
                <div 
                  key={v.id} 
                  className={`bezel-core ${currentVersion?.id === v.id ? 'active' : ''}`}
                  style={{ 
                    padding: 'var(--space-3)', 
                    cursor: 'pointer',
                    border: currentVersion?.id === v.id ? '1px solid var(--accent-purple)' : '1px solid var(--border-interactive)',
                    background: currentVersion?.id === v.id ? 'var(--accent-purple-glow)' : 'transparent',
                    boxShadow: 'none',
                    flexShrink: 0
                  }}
                  onClick={() => handleVersionSelect(v)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: '600', color: currentVersion?.id === v.id ? 'var(--accent-purple)' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={v.title}>
                      {v.title}
                    </span>
                    <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                      <button className="btn-icon" style={{ padding: '2px', minWidth: 'auto', minHeight: 'auto', width: '24px', height: '24px' }} onClick={(e) => { e.stopPropagation(); handleRenameVersion(v); }} title={t('aiParserPage.rename')}>
                        <i className="ph-light ph-pencil-simple" style={{ fontSize: '14px' }}></i>
                      </button>
                      <button className="btn-icon" style={{ padding: '2px', minWidth: 'auto', minHeight: 'auto', width: '24px', height: '24px', color: 'var(--accent-rose)' }} onClick={(e) => { e.stopPropagation(); handleDeleteVersion(v.id); }} title={t('aiParserPage.delete')}>
                        <i className="ph-light ph-trash" style={{ fontSize: '14px' }}></i>
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      {new Date(v.createdAt?.toDate ? v.createdAt.toDate() : v.createdAt).toLocaleString()}
                    </span>
                    {v.orderId && <span style={{ fontSize: '10px', background: 'var(--badge-neutral-bg, rgba(255,255,255,0.05))', color: 'var(--text-secondary)', padding: '2px 6px', borderRadius: '4px' }}>{t('aiParserPage.boundOrder')}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Main Content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', overflowY: 'auto', paddingRight: '4px', height: '100%' }}>
          
          <div className="page-header" style={{ marginBottom: '0', flexShrink: 0 }}>
            <div>
              <h1 className="page-title"><i className="ph-fill ph-magic-wand"></i> {t('aiParserPage.title')} {currentVersion ? `(${t('aiParserPage.viewing')} ${currentVersion.title})` : ''}</h1>
              <p className="page-subtitle">{t('aiParserPage.subtitle')}</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            
            {/* Input Section */}
            <div className="bezel-shell">
              <div className="bezel-core">
                <div className="bento-header">
                  <h3>{t('aiParserPage.step1Title')}</h3>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                  {error && (
                    <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-rose)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                      <i className="ph-fill ph-warning-circle"></i> {error}
                    </div>
                  )}
                  
                  <div className="form-group">
                    <label className="form-label">{t('aiParserPage.importFromOrder')}</label>
                    <select 
                      className="form-select" 
                      value={selectedOrderId} 
                      onChange={handleOrderSelect}
                    >
                      <option value="">{t('aiParserPage.selectOrderPlaceholder')}</option>
                      {orders.filter(o => o.status === 'open' || o.status === 'urgent').map(o => (
                        <option key={o.id} value={o.id}>{o.company} - {o.position}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div style={{ color: 'var(--text-faint)', fontSize: '0.8rem', paddingBottom: '8px', textAlign: 'center' }}>{t('aiParserPage.dividerOr')}</div>

                  <div className="form-group">
                    <label className="form-label">{t('aiParserPage.uploadFile')}</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <input type="file" id="jd-file" accept=".pdf,.xlsx" onChange={handleFileChange} style={{ display: 'none' }} />
                      <label htmlFor="jd-file" className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                        <i className="ph-light ph-upload-simple"></i> {t('aiParserPage.selectFileBtn')}
                      </label>
                      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                        {file ? file.name : t('aiParserPage.noFile')}
                      </span>
                      {file && (
                        <button className="btn-icon" onClick={() => setFile(null)}><i className="ph-light ph-x"></i></button>
                      )}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">{t('aiParserPage.pasteText')}</label>
                    <textarea 
                      className="form-input" 
                      rows="4" 
                      placeholder={t('aiParserPage.pastePlaceholder')}
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      style={{ resize: 'vertical' }}
                    ></textarea>
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
                    <button className="btn btn-primary" onClick={handleProcess} disabled={isProcessing}>
                      {isProcessing ? (
                        <><i className="ph-light ph-spinner ph-spin"></i> {t('aiParserPage.processingBtn')}</>
                      ) : (
                        <><i className="ph-fill ph-magic-wand"></i> {t('aiParserPage.processBtn')}</>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Results Section */}
            <div className="bezel-shell" style={{ minHeight: '500px', opacity: isProcessing ? 0.6 : 1, transition: 'opacity 0.3s ease' }}>
              <div className="bezel-core" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div className="bento-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-hairline)', paddingBottom: 'var(--space-3)' }}>
                  <h3>{t('aiParserPage.step2Title')}</h3>
                  {results && (
                    <button className="btn btn-secondary" onClick={copyToClipboard} style={{ padding: '4px 12px', fontSize: 'var(--text-xs)' }}>
                      <i className="ph-light ph-copy"></i> {t('aiParserPage.copyBtn')}
                    </button>
                  )}
                </div>
                
                {!results && !isProcessing && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-muted)', minHeight: '300px' }}>
                    <i className="ph-light ph-files" style={{ fontSize: '3rem', marginBottom: 'var(--space-3)', opacity: 0.5 }}></i>
                    <p>{t('aiParserPage.waitingStatus')}</p>
                  </div>
                )}
                
                {isProcessing && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--accent-purple)', minHeight: '300px' }}>
                    <i className="ph-light ph-spinner-gap ph-spin" style={{ fontSize: '3rem', marginBottom: 'var(--space-3)' }}></i>
                    <p className="pulse">{t('aiParserPage.processingStatus')}</p>
                  </div>
                )}
                
                {results && !isProcessing && (
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%', marginTop: 'var(--space-3)' }}>
                    {/* Tabs */}
                    <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                      <button 
                        onClick={() => setActiveTab('internal')}
                        style={{ 
                          padding: '6px 16px', borderRadius: 'var(--radius-pill)', fontSize: 'var(--text-sm)',
                          background: activeTab === 'internal' ? 'var(--accent-purple-glow)' : 'transparent',
                          color: activeTab === 'internal' ? 'var(--accent-purple)' : 'var(--text-secondary)',
                          border: '1px solid', borderColor: activeTab === 'internal' ? 'var(--accent-purple)' : 'transparent',
                          cursor: 'pointer'
                        }}
                      >{t('aiParserPage.tabInternal')}</button>
                      <button 
                        onClick={() => setActiveTab('cn')}
                        style={{ 
                          padding: '6px 16px', borderRadius: 'var(--radius-pill)', fontSize: 'var(--text-sm)',
                          background: activeTab === 'cn' ? 'var(--accent-blue-glow)' : 'transparent',
                          color: activeTab === 'cn' ? 'var(--accent-blue)' : 'var(--text-secondary)',
                          border: '1px solid', borderColor: activeTab === 'cn' ? 'var(--accent-blue)' : 'transparent',
                          cursor: 'pointer'
                        }}
                      >{t('aiParserPage.tabCn')}</button>
                      <button 
                        onClick={() => setActiveTab('en')}
                        style={{ 
                          padding: '6px 16px', borderRadius: 'var(--radius-pill)', fontSize: 'var(--text-sm)',
                          background: activeTab === 'en' ? 'var(--accent-amber-glow)' : 'transparent',
                          color: activeTab === 'en' ? 'var(--accent-amber)' : 'var(--text-secondary)',
                          border: '1px solid', borderColor: activeTab === 'en' ? 'var(--accent-amber)' : 'transparent',
                          cursor: 'pointer'
                        }}
                      >{t('aiParserPage.tabEn')}</button>
                      <button 
                        onClick={() => setActiveTab('my')}
                        style={{ 
                          padding: '6px 16px', borderRadius: 'var(--radius-pill)', fontSize: 'var(--text-sm)',
                          background: activeTab === 'my' ? 'var(--accent-emerald-glow)' : 'transparent',
                          color: activeTab === 'my' ? 'var(--accent-emerald)' : 'var(--text-secondary)',
                          border: '1px solid', borderColor: activeTab === 'my' ? 'var(--accent-emerald)' : 'transparent',
                          cursor: 'pointer'
                        }}
                      >{t('aiParserPage.tabMy')}</button>
                    </div>
                    
                    {/* Edit Area */}
                    <div style={{ 
                      flex: 1, background: 'var(--input-bg, rgba(0,0,0,0.2))', border: '1px solid var(--border-hairline)', 
                      borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column',
                      minHeight: '400px'
                    }}>
                      <textarea 
                        style={{ 
                          flex: 1, width: '100%', height: '100%', background: 'transparent', border: 'none', resize: 'none',
                          fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--text-primary)', lineHeight: 1.6,
                          outline: 'none'
                        }}
                        value={results[activeTab] || ''}
                        onChange={(e) => handleContentChange(e.target.value)}
                        placeholder={t('aiParserPage.editPlaceholder')}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
                      <button className="btn btn-secondary" onClick={handleSaveAsNewVersion}>
                        <i className="ph-light ph-copy"></i> {t('aiParserPage.saveAsNewBtn')}
                      </button>
                      {currentVersion && (
                        <button className="btn btn-primary" onClick={handleUpdateCurrentVersion}>
                          <i className="ph-light ph-floppy-disk"></i> {t('aiParserPage.saveCurrentBtn')}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
          </div>
        </div>

      </div>
    </div>
  );
}
