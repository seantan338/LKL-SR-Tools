'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../../lib/auth-context';
import { useFeedback } from '../../../lib/feedback-context';
import { useI18n } from '../../../lib/i18n-context';
import { FirestoreStore } from '../../../lib/firestore-store';
import { GoogleSheetsAPI } from '../../../lib/google-sheets';
import { AIService } from '../../../lib/ai-service';
import { collection, onSnapshot, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { SystemLogger } from '../../../lib/logger';
import { Utils } from '../../../lib/utils';
import WhatsAppButton from '../../../components/WhatsAppButton';
import MiniBlackHole from '../../../components/MiniBlackHole';
import { resolveCanonicalPic } from '../../../lib/identity.mjs';
import { authFetch } from '../../../lib/api-client';

export default function SettingsPage() {
  const { teamId, user, isOwner, signInWithGoogleSheets } = useAuth();
  const { showToast, confirm } = useFeedback();
  const { t, lang } = useI18n();
  const isEn = lang === 'en';
  const [importStatus, setImportStatus] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  // Long-Term Google Sheets Webhook Sync States
  const [savedSyncConfig, setSavedSyncConfig] = useState(null);
  const [isBindingSync, setIsBindingSync] = useState(false);
  const [isFullSyncing, setIsFullSyncing] = useState(false);
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedWebhookUrl, setCopiedWebhookUrl] = useState(false);

  // JSON Import Two-Step Warning & 5-Second Countdown States (UAT IMP-02)
  const [mounted, setMounted] = useState(false);
  const [pendingJsonData, setPendingJsonData] = useState(null);
  const [jsonConfirmStep, setJsonConfirmStep] = useState(0); // 0: closed, 1: step 1, 2: step 2
  const [jsonCountdown, setJsonCountdown] = useState(5);
  const jsonFileInputRef = useRef(null);

  // Historical PIC Master Data Cleaner States
  const [isCleaningPic, setIsCleaningPic] = useState(false);
  const [picCleanResult, setPicCleanResult] = useState(null);

  // Global Theme Selection State
  const [currentTheme, setCurrentTheme] = useState('dark');

  useEffect(() => {
    setMounted(true);
    const active = document.documentElement.getAttribute('data-theme') || (typeof window !== 'undefined' ? localStorage.getItem('talent_flow_theme') : null) || 'dark';
    setCurrentTheme(active);

    const onThemeChange = () => {
      const updated = document.documentElement.getAttribute('data-theme') || 'dark';
      setCurrentTheme(updated);
    };
    window.addEventListener('themechange', onThemeChange);
    return () => window.removeEventListener('themechange', onThemeChange);
  }, []);

  const handleSelectTheme = (newTheme) => {
    if (newTheme === 'dark') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', newTheme);
    }
    try {
      localStorage.setItem('talent_flow_theme', newTheme);
    } catch (e) {}
    setCurrentTheme(newTheme);
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: newTheme } }));
  };

  useEffect(() => {
    let timer = null;
    if (jsonConfirmStep === 2 && jsonCountdown > 0) {
      timer = setInterval(() => {
        setJsonCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [jsonConfirmStep, jsonCountdown]);

  // WhatsApp Binding States
  const [waInput, setWaInput] = useState('');
  const [waReminderTemplate, setWaReminderTemplate] = useState('*Talent Flow 跟进提醒*\n\n*候选人:* {{候选人名字}}\n*提醒内容:* {{提醒内容}}\n*时间:* {{时间}}');
  const [isWaSaving, setIsWaSaving] = useState(false);
  const [showWaToast, setShowWaToast] = useState(false);
  const [waError, setWaError] = useState('');

  const [sheetUrl, setSheetUrl] = useState('');
  const [sheetCompany, setSheetCompany] = useState('');
  const [bulkCompany, setBulkCompany] = useState('');
  const [sheetData, setSheetData] = useState(null);
  const [sheetHeaders, setSheetHeaders] = useState([]); // Store headers separately for AI
  const [sheetStatus, setSheetStatus] = useState('');
  const [isFetchingSheet, setIsFetchingSheet] = useState(false);
  const [fieldMapping, setFieldMapping] = useState({});

  // Row Range States
  const [specifyRows, setSpecifyRows] = useState(false);
  const [startRow, setStartRow] = useState(1);
  const [endRow, setEndRow] = useState(50);

  // AI Import States
  const [importTarget, setImportTarget] = useState('candidate'); // 'candidate' or 'jobOrder'
  const [aiPreviewData, setAiPreviewData] = useState(null);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [teamMembers, setTeamMembers] = useState([]);

  useEffect(() => {
    if (!teamId) return;
    const usersRef = collection(db, 'users');
    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      const allUsers = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      const members = allUsers.filter(u => u.role !== 'pending' && u.teamId === (teamId || 'default_team'));
      setTeamMembers(members);
      
      // Auto-fill WhatsApp number & template for current user
      if (user?.uid) {
        const myProfile = members.find(m => m.uid === user.uid);
        if (myProfile) {
          if (myProfile.whatsappNumber) {
            setWaInput(myProfile.whatsappNumber);
          }
          if (myProfile.waReminderTemplate) {
            setWaReminderTemplate(myProfile.waReminderTemplate);
          }
        }
      }
    });
    return () => unsubscribe();
  }, [teamId, user]);

  // Subscribe to long-term Google Sheets sync configuration
  useEffect(() => {
    if (!teamId) return;
    const unsub = FirestoreStore.subscribeToSheetSyncConfig(teamId, (config) => {
      setSavedSyncConfig(config);
      if (config && config.spreadsheetUrl && !sheetUrl) {
        setSheetUrl(config.spreadsheetUrl);
      }
      if (config && config.sheetCompany && !sheetCompany) {
        setSheetCompany(config.sheetCompany);
      }
    });
    return () => unsub();
  }, [teamId]);

  const getBackendWebhookUrl = () => {
    const custom = process.env.NEXT_PUBLIC_PYTHON_API_URL;
    if (custom) return `${custom}/api/sheets/webhook`;
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:8000/api/sheets/webhook';
      }
      return `${window.location.origin}/api/sheets/webhook`;
    }
    return 'http://localhost:8000/api/sheets/webhook';
  };

  const getAppsScriptCode = () => {
    const webhookUrl = getBackendWebhookUrl();
    const safeTeamId = teamId || 'default_team';
    return `/**
 * Omni Recruitment Management - Google Sheets 长期实时自动同步脚本
 * 
 * 启用指南 (只需 3 步):
 * 1. 在当前 Google 表格顶部菜单点击：扩展程序 (Extensions) -> Apps 脚本 (Apps Script)
 * 2. 清空编辑器中的原有代码，粘贴本脚本所有内容
 * 3. 点击顶部工具栏的「保存」图标 (Ctrl+S / Cmd+S)
 * 4. 之后任意协作者在此表格编辑或新增行，系统后台将全自动毫秒级 AI 解析入库！
 */
function onEdit(e) {
  var sheet = e.source.getActiveSheet();
  var sheetName = sheet.getName();
  var range = e.range;
  var row = range.getRow();
  
  // 忽略首行（表头）本身的编辑，只监听数据行
  if (row <= 1) return;
  
  var numCols = sheet.getLastColumn();
  if (numCols < 1) return;
  
  // 提取首行表头与当前被编辑的整行数据
  var headers = sheet.getRange(1, 1, 1, numCols).getValues()[0];
  var rowValues = sheet.getRange(row, 1, 1, numCols).getValues()[0];
  
  // 校验当前行是否含有文字（若整行被清空则跳过）
  var hasContent = rowValues.some(function(cell) {
    return cell !== null && cell !== undefined && String(cell).trim() !== "";
  });
  if (!hasContent) return;
  
  var payload = {
    spreadsheetId: e.source.getId(),
    sheetName: sheetName,
    range: range.getA1Notation(),
    headers: [headers],
    values: [rowValues],
    event_type: "onEdit",
    teamId: "${safeTeamId}",
    uid: "gsheet_" + e.source.getId().substring(0, 8) + "_" + row
  };
  
  var webhookUrl = "${webhookUrl}";
  
  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    UrlFetchApp.fetch(webhookUrl, options);
  } catch (err) {
    Logger.log("Webhook 同步异常: " + err);
  }
}`;
  };

  const handleBindAndStartSync = async () => {
    if (!sheetUrl.trim()) {
      showToast(t('sheetSync.errorInvalidUrl', '请输入有效的 Google 表格链接 (包含 /d/ID/edit)'), 'error');
      return;
    }
    const parsed = GoogleSheetsAPI.parseSheetUrl(sheetUrl);
    if (!parsed || !parsed.spreadsheetId) {
      showToast(t('sheetSync.errorInvalidUrl', '请输入有效的 Google 表格链接 (包含 /d/ID/edit)'), 'error');
      return;
    }

    setIsBindingSync(true);
    try {
      const configPayload = {
        spreadsheetUrl: sheetUrl.trim(),
        spreadsheetId: parsed.spreadsheetId,
        gid: parsed.gid || '0',
        sheetCompany: sheetCompany.trim(),
        isActive: true,
        boundAt: new Date().toISOString(),
        lastSyncAt: savedSyncConfig?.lastSyncAt || (isEn ? 'Initial full sync not yet executed' : '尚未执行全量初始化同步'),
        syncCount: savedSyncConfig?.syncCount || 0
      };

      await FirestoreStore.saveSheetSyncConfig(teamId, configPayload);
      setSavedSyncConfig(configPayload);
      showToast(t('sheetSync.toastBindSuccess', '🎉 Google 表格已成功绑定！长期 Webhook 监听已就绪'), 'success');
      setShowScriptModal(true);
    } catch (err) {
      console.error('Failed to bind sheet sync:', err);
      showToast((isEn ? 'Bind failed: ' : '绑定失败: ') + (err.message || ''), 'error');
    } finally {
      setIsBindingSync(false);
    }
  };

  const handleUnbindSheet = async () => {
    const ok = await confirm(
      t('sheetSync.confirmUnbindMsg', '确定要解除当前 Google 表格的长期 Webhook 同步绑定吗？'),
      {
        title: t('sheetSync.confirmUnbindTitle', '解除表格绑定'),
        danger: true
      }
    );
    if (!ok) return;
    try {
      await FirestoreStore.saveSheetSyncConfig(teamId, {
        isActive: false,
        spreadsheetUrl: '',
        spreadsheetId: ''
      });
      setSavedSyncConfig(null);
      setSheetUrl('');
      setSheetCompany('');
      showToast(t('sheetSync.toastUnbindSuccess', '已解除表格绑定'), 'info');
    } catch (err) {
      console.error('Failed to unbind sheet:', err);
    }
  };

  const handleQuickFullSync = async () => {
    const targetUrl = savedSyncConfig?.spreadsheetUrl || sheetUrl;
    const parsed = GoogleSheetsAPI.parseSheetUrl(targetUrl);
    if (!parsed || !parsed.spreadsheetId) {
      showToast(t('sheetSync.errorInvalidUrl', '无效的表格链接'), 'error');
      return;
    }

    setIsFullSyncing(true);
    setSheetStatus(t('sheetSync.btnSyncingAll', '正在全量拉取并 AI 结构化清洗...'));
    try {
      let rows = null;
      try {
        rows = await GoogleSheetsAPI.fetchPublicSheetCSV(parsed.spreadsheetId, parsed.gid);
      } catch (err) {
        if (err.message === 'PRIVATE_SHEET') {
          setSheetStatus(t('settingsPage.privateSheetStatus', '该表格是私有的，需要授权。'));
          setIsFullSyncing(false);
          return;
        }
        throw err;
      }

      if (!rows || rows.length < 2) {
        throw new Error(isEn ? 'Sheet is empty or contains no valid data rows' : '表格为空或未包含有效数据行');
      }

      const tsvText = rows.map(r => r.join('\t')).join('\n');
      
      const response = await authFetch('/api/parse/sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: tsvText, targetType: 'candidate', sourceTab: savedSyncConfig?.sheetCompany || sheetCompany || '' })
      });

      if (!response.ok) {
        throw new Error(isEn ? `AI service error (${response.status})` : `AI 服务异常 (${response.status})`);
      }

      const resJson = await response.json();
      if (resJson.status === 'error') {
        throw new Error(resJson.message);
      }

      const parsedItems = Array.isArray(resJson.data) ? resJson.data : [];
      if (parsedItems.length === 0) {
        throw new Error(isEn ? 'AI could not extract valid candidate data from sheet' : 'AI 未能从表格内容中提取出有效候选人数据');
      }

      const safeTeamId = teamId || 'default_team';
      const defaultUserId = user?.uid || 'system';
      let successCount = 0;

      for (let item of parsedItems) {
        const candidateName = String(item.name || item.candidateName || '').trim();
        if (!candidateName) continue;

        let matchedUid = defaultUserId;
        let canonicalName = item.picName || '';
        if (item.picName) {
          const canonical = resolveCanonicalPic(item.picName, null, teamMembers);
          if (canonical.displayName && canonical.displayName !== '未分配顾问') {
            canonicalName = canonical.displayName;
          }
          if (canonical.uid) {
            matchedUid = canonical.uid;
          }
        }

        const candidatePayload = {
          name: candidateName,
          position: item.position || '',
          interviewDate: item.interviewDate || '',
          interviewTime: item.interviewTime || '',
          icNo: item.icNo || '',
          age: item.age || '',
          degree: item.degree || item.qualification || '',
          experience: item.experience || '',
          location: item.location || '',
          phone: item.phone || '',
          picName: canonicalName,
          remarks: item.remarks || item.rawStatus || '',
          offered: item.offered || '',
          salary: item.offered || '',
          company: item.company || savedSyncConfig?.sheetCompany || sheetCompany || '',
          stage: item.interviewDate ? 'interview' : 'screening',
          source: 'Google Sheets Webhook Sync'
        };

        await FirestoreStore.addCandidate(safeTeamId, matchedUid, candidatePayload);
        successCount++;
      }

      const nowStr = new Date().toLocaleString('zh-CN', { hour12: false });
      const updatedConfig = {
        ...(savedSyncConfig || {}),
        spreadsheetUrl: targetUrl,
        spreadsheetId: parsed.spreadsheetId,
        sheetCompany: savedSyncConfig?.sheetCompany || sheetCompany || '',
        isActive: true,
        lastSyncAt: `${nowStr} (${isEn ? 'Full sync' : '全量同步'} ${successCount} ${isEn ? 'records' : '条'})`,
        syncCount: successCount
      };
      await FirestoreStore.saveSheetSyncConfig(teamId, updatedConfig);
      setSavedSyncConfig(updatedConfig);
      showToast(t('sheetSync.toastSyncSuccess', '✨ 全量同步完成！共导入/更新 {count} 条候选人记录').replace('{count}', successCount), 'success');
      setSheetStatus('');
    } catch (err) {
      console.error('Quick full sync error:', err);
      showToast(t('sheetSync.toastSyncFailed', '全量同步失败: ') + (err.message || ''), 'error');
      setSheetStatus((isEn ? 'Full sync failed: ' : '全量同步失败: ') + err.message);
    } finally {
      setIsFullSyncing(false);
    }
  };

  const handleSaveWhatsApp = async () => {
    if (!user?.uid) return;
    try {
      setIsWaSaving(true);
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { 
        whatsappNumber: waInput,
        waReminderTemplate: waReminderTemplate
      });
      setShowWaToast(true);
      setTimeout(() => setShowWaToast(false), 3000);
    } catch (e) {
      console.error(e);
      setWaError((t('settingsPage.waSaveFailed') || '保存失败: ') + e.message);
      setTimeout(() => setWaError(''), 4000);
    } finally {
      setIsWaSaving(false);
    }
  };

  const handleSelectJsonFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const rawText = evt.target.result;
        // Layer 1: Malicious JSON inspection, prototype pollution defense & whitelist filtering (UAT IMP-03)
        const parseResult = Utils.sanitizeJsonImport(rawText);
        if (!parseResult.valid) {
          throw new Error(parseResult.error || t('settingsPage.jsonParseInvalid') || '无效的数据格式，未找到 candidates 数组');
        }

        if (parseResult.isPureProbe) {
          setImportStatus(parseResult.message || '🛡️ 第一层安全防御已生效：已成功拦截并清除原型链污染攻击，系统安全无污染。');
          if (jsonFileInputRef.current) jsonFileInputRef.current.value = '';
          return;
        }

        setPendingJsonData({
          candidates: parseResult.candidates,
          jobOrders: parseResult.jobOrders,
          filename: file.name,
          sanitizedCount: parseResult.sanitizedCount,
          hasPollutionAttempt: parseResult.hasPollutionAttempt
        });
        setJsonConfirmStep(1);
        setImportStatus('');
      } catch (error) {
        setImportStatus((t('settingsPage.jsonFailed') || '导入失败: ') + error.message);
        if (jsonFileInputRef.current) jsonFileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleCancelJsonImport = () => {
    setJsonConfirmStep(0);
    setPendingJsonData(null);
    setJsonCountdown(5);
    if (jsonFileInputRef.current) jsonFileInputRef.current.value = '';
  };

  const handleGoToStep2 = () => {
    setJsonConfirmStep(2);
    setJsonCountdown(5);
  };

  const handleExecuteJsonImport = async () => {
    if (!pendingJsonData) return;
    const data = pendingJsonData;
    setJsonConfirmStep(0);

    try {
      setIsImporting(true);
      const parseSuccessMsg = (t('settingsPage.jsonParseSuccess') || '解析成功，发现 {count} 条候选人记录。开始写入云端...').replace('{count}', data.candidates.length);
      setImportStatus(parseSuccessMsg);
      
      let successCount = 0;
      let errorCount = 0;

      for (const candidate of data.candidates) {
        try {
          await FirestoreStore.addCandidate(teamId, user.uid, candidate);
          successCount++;
          const progressMsg = (t('settingsPage.jsonProgress') || '进度: {current}/{total}').replace('{current}', successCount).replace('{total}', data.candidates.length);
          setImportStatus(progressMsg);
        } catch (err) {
          console.error(err);
          errorCount++;
        }
      }

      if (data.jobOrders && data.jobOrders.length > 0) {
        for (const order of data.jobOrders) {
          try {
            await FirestoreStore.addJobOrder(teamId, user.uid, order);
          } catch(e) {}
        }
      }

      const completeMsg = (t('settingsPage.jsonComplete') || '迁移完成！成功: {success}, 失败: {failed}').replace('{success}', successCount).replace('{failed}', errorCount);
      setImportStatus(completeMsg);
    } catch (error) {
      setImportStatus((t('settingsPage.jsonFailed') || '导入失败: ') + error.message);
    } finally {
      setIsImporting(false);
      setPendingJsonData(null);
      setJsonCountdown(5);
      if (jsonFileInputRef.current) jsonFileInputRef.current.value = '';
    }
  };

  const handleFetchSheet = async () => {
    if (!sheetUrl) return;
    setIsFetchingSheet(true);
    setSheetStatus(t('settingsPage.fetchingStatus') || '解析链接...');
    setSheetData(null);
    setFieldMapping({});

    const sheetInfo = GoogleSheetsAPI.parseSheetUrl(sheetUrl);
    if (!sheetInfo) {
      setSheetStatus(t('settingsPage.invalidUrlStatus') || '无效的 Google Sheet 链接');
      setIsFetchingSheet(false);
      return;
    }

    try {
      setSheetStatus(t('settingsPage.fetchingPublicStatus') || '尝试拉取公开数据...');
      const data = await GoogleSheetsAPI.fetchPublicSheetCSV(sheetInfo.spreadsheetId, sheetInfo.gid);
      handleSheetDataLoaded(data);
    } catch (err) {
      if (err.message === 'PRIVATE_SHEET') {
        setSheetStatus(t('settingsPage.privateSheetStatus') || '该表格是私有的，需要授权。');
      } else {
        setSheetStatus(err.message);
      }
    } finally {
      setIsFetchingSheet(false);
    }
  };

  const handleAuthAndFetchSheet = async () => {
    if (!sheetUrl) return;
    setIsFetchingSheet(true);
    setSheetStatus(t('settingsPage.requestingAuthStatus') || '请求授权...');

    try {
      const { token } = await signInWithGoogleSheets();
      if (!token) throw new Error(isEn ? 'Failed to obtain Access Token' : '未获取到 Access Token');
      
      const sheetInfo = GoogleSheetsAPI.parseSheetUrl(sheetUrl);
      setSheetStatus(t('settingsPage.fetchingPrivateStatus') || '拉取私有数据与工作表信息...');
      
      // Auto detect tab name from spreadsheet metadata
      try {
        const tabsMeta = await GoogleSheetsAPI.fetchSpreadsheetMetadata(sheetInfo.spreadsheetId, token);
        if (tabsMeta && tabsMeta.length > 0) {
          const matchedTab = tabsMeta.find(t => t.sheetId === String(sheetInfo.gid)) || tabsMeta[0];
          if (matchedTab && matchedTab.title) {
            const detectedComp = GoogleSheetsAPI.extractCompanyFromTab(matchedTab.title);
            if (!sheetCompany) {
              setSheetCompany(detectedComp || matchedTab.title);
            }
          }
        }
      } catch (metaErr) {
        console.warn('Metadata tab detection fallback:', metaErr);
      }

      const data = await GoogleSheetsAPI.fetchPrivateSheetData(sheetInfo.spreadsheetId, token);
      handleSheetDataLoaded(data);
    } catch (err) {
      setSheetStatus((t('settingsPage.authOrFetchFailed') || '授权或拉取失败: ') + err.message);
    } finally {
      setIsFetchingSheet(false);
    }
  };

  const handleSheetDataLoaded = (data) => {
    if (!data || data.length === 0) {
      setSheetStatus(t('settingsPage.emptyDataStatus') || '拉取到空数据');
      return;
    }
    setSheetData(data);
    const loadedMsg = (t('settingsPage.loadedStatus') || '成功拉取 {count} 行数据。您可以配置字段映射，或使用✨AI智能清洗。').replace('{count}', data.length);
    setSheetStatus(loadedMsg);
    setEndRow(data.length - 1); // Select all rows by default
    
    // Auto map 12 standard columns if headers match
    const headers = data[0];
    setSheetHeaders(headers);
    const newMapping = {};
    headers.forEach((h, i) => {
      const text = String(h || '').toLowerCase().trim();
      const norm = text.replace(/[\(\)\[\]:：\-_/]/g, ' ');
      
      if (norm.includes('interview') || norm.includes('date') || norm.includes('日期') || norm.includes('面试')) newMapping[i] = 'interviewDate';
      else if (norm.includes('position') || norm.includes('role') || norm.includes('岗位') || norm.includes('职位')) newMapping[i] = 'position';
      else if (norm.includes('name') || norm.includes('candidate') || norm.includes('姓名') || norm.includes('候选人')) newMapping[i] = 'name';
      else if (norm.includes('ic') || norm.includes('age') || norm.includes('身份证') || norm.includes('年龄')) newMapping[i] = 'icNoAge';
      else if (norm.includes('education') || norm.includes('certificate') || norm.includes('degree') || norm.includes('qualification') || norm.includes('学历') || norm.includes('证书')) newMapping[i] = 'degree';
      else if (norm.includes('experience') || norm.includes('exp') || norm.includes('经验')) newMapping[i] = 'experience';
      else if (norm.includes('staying') || norm.includes('area') || norm.includes('location') || norm.includes('地点') || norm.includes('地区') || norm.includes('住址')) newMapping[i] = 'location';
      else if (norm.includes('contact') || norm.includes('phone') || norm.includes('tel') || norm.includes('mobile') || norm.includes('电话') || norm.includes('手机')) newMapping[i] = 'phone';
      else if (norm.includes('pic') || norm.includes('recruiter') || norm.includes('负责人') || norm.includes('顾问')) newMapping[i] = 'picName';
      else if (norm.includes('remark') || norm.includes('remarks') || norm.includes('status') || norm.includes('备注') || norm.includes('说明') || norm.includes('状态')) newMapping[i] = 'remarks';
      else if (norm.includes('offer') || norm.includes('offered') || norm.includes('salary') || norm.includes('薪资') || norm.includes('待遇')) newMapping[i] = 'offered';
      else if (norm.includes('department') || norm.includes('dept') || norm.includes('部门') || norm.includes('工种')) newMapping[i] = 'department';
      else if (norm.includes('school') || norm.includes('学校') || norm.includes('院校')) newMapping[i] = 'school';
      else if (norm.includes('company') || norm.includes('client') || norm.includes('employer') || norm.includes('企业') || norm.includes('公司') || norm.includes('客户') || norm.includes('雇主')) newMapping[i] = 'company';
    });
    setFieldMapping(newMapping);
  };

  const handleAiProcess = async () => {
    if (!sheetData || sheetData.length < 2) return;
    setIsAiProcessing(true);
    setSheetStatus(isEn ? 'AI smart cleaning and parsing in progress, this may take a few moments...' : '正在使用 AI 智能清洗与解析，这可能需要几十秒时间...');
    
    try {
      const s = specifyRows ? Math.max(1, parseInt(startRow) || 1) : 1;
      const e = specifyRows ? Math.min(sheetData.length - 1, parseInt(endRow) || 50) : sheetData.length - 1;
      const targetRows = sheetData.slice(s, e + 1);

      if (targetRows.length === 0) {
        setSheetStatus(isEn ? 'Selected row range is invalid or empty.' : '选定的行数范围无效或无数据。');
        setIsAiProcessing(false);
        return;
      }

      setSheetStatus(isEn ? 'Checking existing system records for deduplication...' : '正在检查系统数据以防重复导入 (Deduplication)...');
      const collName = importTarget === 'candidate' ? 'candidates' : 'job_orders';
      const existingRef = collection(db, 'teams', teamId, collName);
      const snapshot = await getDocs(existingRef);
      const existingData = snapshot.docs.map(d => d.data());

      let newRows = [];
      let skippedCount = 0;

      for (const row of targetRows) {
        const rowStr = row.join(' ').toLowerCase();
        let isDuplicate = false;
        
        if (importTarget === 'candidate') {
          for (const ex of existingData) {
            if (ex.name && rowStr.includes(String(ex.name).toLowerCase()) && 
                (ex.phone && rowStr.includes(String(ex.phone).toLowerCase()))) {
              isDuplicate = true; break;
            }
          }
        } else {
          for (const ex of existingData) {
             if (ex.company && rowStr.includes(String(ex.company).toLowerCase()) &&
                 ex.position && rowStr.includes(String(ex.position).toLowerCase())) {
               isDuplicate = true; break;
             }
          }
        }

        if (isDuplicate) {
          skippedCount++;
        } else {
          newRows.push(row);
        }
      }

      if (newRows.length === 0) {
        setSheetStatus(isEn ? `Deduplication complete: All ${targetRows.length} row(s) already exist in system, skipped AI parsing to save tokens.` : `智能去重完成：指定范围内的 ${targetRows.length} 行数据在系统中均已存在，无需重复解析，已为您节省 Token。`);
        setIsAiProcessing(false);
        return;
      }

      // Intelligent Batch Processing
      let allParsedData = [];
      let batches = [];
      let currentBatch = [];
      const batchLimit = (importTarget === 'candidate' || importTarget === 'interview_schedule') ? 30 : 150;
      
      for (let i = 0; i < newRows.length; i++) {
        const row = newRows[i];
        currentBatch.push(row);
        
        const nextRow = i + 1 < newRows.length ? newRows[i + 1] : null;
        const isNextRowNewParent = nextRow && (String(nextRow[0] || '').trim() !== '' || String(nextRow[1] || '').trim() !== '');
        
        if (currentBatch.length >= batchLimit && (importTarget === 'candidate' || importTarget === 'interview_schedule' || isNextRowNewParent)) {
          batches.push(currentBatch);
          currentBatch = [];
        }
      }
      if (currentBatch.length > 0) batches.push(currentBatch);


      let failedBatchIndices = [];

      for (let b = 0; b < batches.length; b++) {
        const batchRows = batches[b];
        setSheetStatus(isEn ? `AI parsing... (${skippedCount} duplicates filtered, processing batch ${b + 1}/${batches.length} with ${batchRows.length} rows)` : `AI 解析中... (去重拦截了 ${skippedCount} 条，正在并发处理批次: ${b + 1} / ${batches.length}, 本批次包含 ${batchRows.length} 行)`);
        
        const serialized = GoogleSheetsAPI.serializeRowsForAI(sheetHeaders, batchRows);

        try {
          const response = await authFetch('/api/parse/sheet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              data: serialized, 
              targetType: (importTarget === 'jobOrder' || importTarget === 'job_order') ? 'job_order' : importTarget,
              sourceTab: sheetCompany?.trim() || ''
            })
          });
          
          if (!response.ok) {
            let errBody = '';
            try { errBody = await response.text(); } catch (e) {}
            if ((response.status === 500 || response.status === 504) && (errBody.includes('Internal Server Error') || errBody.includes('Gateway Timeout'))) {
              const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
              if (isLocal) {
                throw new Error(isEn ? 'Backend connection reset or reloading, please ensure backend (port 8000) is running and retry' : '本地 Python 后端连接重置或正在热重载，请确保后端 (端口 8000) 正常运行并稍后重试');
              }
              throw new Error(isEn ? 'Free server instance is waking up from sleep (~50s cold start), please click again shortly' : '免费服务器正从休眠中唤醒 (冷启动约需 50 秒)，请您稍后再点击一次按钮');
            }
            throw new Error(isEn ? `Batch ${b + 1} failed (${response.status}): ${errBody.substring(0, 300)}` : `批次 ${b + 1} 请求失败 (${response.status}): ${errBody.substring(0, 300)}`);
          }
          
          const resJson = await response.json();
          if (resJson.status === 'error') {
            throw new Error(resJson.message);
          }
          
          if (Array.isArray(resJson.data)) {
            allParsedData = allParsedData.concat(resJson.data);
          }
        } catch (batchErr) {
          console.error(`批次 ${b + 1} 解析异常:`, batchErr);
          failedBatchIndices.push(b + 1);
        }
      }

      if (allParsedData.length === 0 && failedBatchIndices.length > 0) {
        throw new Error(isEn ? 'All batches failed to parse, please check network or backend service' : '所有批次均解析失败，请检查网络或后端状态');
      }
      
      // 去重机制：按岗位 (公司+职位) 或候选人 (姓名+电话/岗位) 去除批次边界可能产生的重复数据
      const isJobOrder = importTarget === 'jobOrder' || importTarget === 'job_order';
      const seenKeys = new Set();
      const dedupedData = [];
      for (const item of allParsedData) {
        let key = null;
        if (isJobOrder) {
          const comp = String(item.company || '').trim().toLowerCase();
          const pos = String(item.position || '').trim().toLowerCase();
          key = comp && pos ? `${comp}::${pos}` : (pos || comp || null);
        } else {
          const name = String(item.name || item.candidateName || '').trim().toLowerCase();
          const phone = String(item.phone || '').replace(/\D/g, '');
          key = name && phone ? `${name}::${phone}` : name ? `${name}::${String(item.currentPosition || item.position || '').trim().toLowerCase()}` : null;
        }
        if (key) {
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
        }
        dedupedData.push(item);
      }

      // Auto match PIC to UID and populate company using canonical PIC resolution
      const mappedData = dedupedData.map(item => {
        let matchedUid = user?.uid || 'system';
        let canonicalName = item.picName || '';
        if (item.picName) {
          const canonical = resolveCanonicalPic(item.picName, null, teamMembers);
          if (canonical.displayName && canonical.displayName !== '未分配顾问') {
            canonicalName = canonical.displayName;
          }
          if (canonical.uid) {
            matchedUid = canonical.uid;
          }
        }
        return { 
          ...item, 
          picName: canonicalName,
          company: item.company || sheetCompany?.trim() || '',
          _assignedTo: matchedUid 
        };
      });

      setAiPreviewData(mappedData);
      const itemNoun = isJobOrder ? t('settingsPage.itemNounJobOrder', '招聘需求岗位') : t('settingsPage.itemNounCandidate', '候选人');
      const failureNote = failedBatchIndices.length > 0 ? (isEn ? ` (⚠️ Batch ${failedBatchIndices.join(', ')} failed due to network fluctuation, isolated & kept successful rows)` : ` (⚠️ 第 ${failedBatchIndices.join(', ')} 批次网络波动失败，已为您隔离并保留成功数据)`) : '';
      setSheetStatus((t('settingsPage.parseCompleteNotice') || 'AI 解析完成：共成功提取 {count} 条有效{noun}记录{failureNote}，请核对后确认导入。')
        .replace('{count}', mappedData.length)
        .replace('{noun}', itemNoun)
        .replace('{failureNote}', failureNote));

    } catch (err) {
      console.error(err);
      setSheetStatus(`${isEn ? 'AI parsing failed: ' : 'AI 解析失败: '}${err.message}`);
      SystemLogger.error(teamId, 'AI_PARSER', 'AI 智能解析失败', err);
    } finally {
      setIsAiProcessing(false);
    }
  };

  const handleImportAiData = async () => {
    if (!aiPreviewData || aiPreviewData.length === 0) return;
    setIsImporting(true);
    setSheetStatus(isEn ? 'Starting import of AI cleaned records...' : '开始导入 AI 清洗数据...');
    
    let successCount = 0;
    let errorCount = 0;
    let lastError = null;

    const safeTeamId = teamId || 'default_team';
    const defaultUserId = user?.uid || 'system';

    for (let item of aiPreviewData) {
      try {
        // 若已匹配内部顾问 UID 则指派；若为外部 Freelance 顾问，留空避免被当前操作员的 UID 劫持误判；若完全未指定 PIC 则指派当前操作员
        const assignedTo = item._assignedTo || (item.picName ? '' : defaultUserId);
        delete item._assignedTo;

        if (importTarget === 'candidate') {
          const candidateName = String(item.name || item.candidateName || '').trim();
          if (!candidateName) continue; // Name is required

          let stage = item.stage || 'screening';
          const normStatus = String(item.normalizedStatus || '').toLowerCase().trim();
          if (normStatus === 'attended') stage = 'interview';
          else if (normStatus === 'no_show') stage = 'interview';
          
          // 智能提取标准化日期 YYYY-MM-DD 与时刻 HH:mm
          const parsedDT = Utils?.parseInterviewDateTime 
            ? Utils.parseInterviewDateTime(item.interviewDate, item.interviewTime)
            : { dateStr: item.interviewDate || '', timeStr: item.interviewTime || '' };
            
          const isDateValid = parsedDT.dateStr && parsedDT.dateStr !== '-' && /^\d{4}-\d{2}-\d{2}$/.test(parsedDT.dateStr);
          const finalDate = isDateValid ? parsedDT.dateStr : '';
          const finalTime = parsedDT.timeStr || item.interviewTime || '';
          
          if (finalDate) stage = 'interview';

          let initialRemarks = item.remarks || item.rawStatus || '';
          if (!isDateValid && item.interviewDate) {
            if (!initialRemarks) initialRemarks = item.interviewDate;
            else if (!initialRemarks.includes(item.interviewDate)) initialRemarks = `${initialRemarks} | ${item.interviewDate}`;
          }

          const candidatePayload = {
            name: candidateName,
            position: item.position || '',
            interviewDate: finalDate,
            interviewTime: finalTime,
            interviewDateRaw: item.interviewDate || '',
            icNo: item.icNo || '',
            age: item.age || '',
            degree: item.degree || item.qualification || '',
            experience: item.experience || '',
            location: item.location || '',
            phone: item.phone || '',
            picName: item.picName || '',
            remarks: initialRemarks,
            normalizedStatus: item.normalizedStatus || 'pending',
            interviewStatus: item.normalizedStatus || 'pending',
            offered: item.offered || '',
            salary: item.offered || '',
            department: item.department || '',
            notes: item.notes || '',
            company: item.company || sheetCompany?.trim() || '',
            stage: stage,
            ...(item.sourceTab ? { sourceTab: item.sourceTab } : {})
          };

          await FirestoreStore.addCandidate(safeTeamId, assignedTo, candidatePayload);
        } else {
          if (!item.company && !item.position) continue;
          await FirestoreStore.addJobOrder(safeTeamId, assignedTo, item);
        }
        successCount++;
      } catch (err) {
        console.error('导入单条记录失败:', err);
        lastError = err;
        errorCount++;
      }
    }
    
    if (errorCount > 0 && successCount === 0) {
      setSheetStatus(isEn ? `Import failed! Succeeded: 0, Failed: ${errorCount}. Reason: ${lastError?.message || 'Unknown error'}` : `导入失败！成功: 0, 失败: ${errorCount}。原因: ${lastError?.message || '未知错误'}`);
      // 保留 aiPreviewData 让用户无需重新花费额度让 AI 解析，可直接排查重试
    } else {
      setSheetStatus(isEn ? `Import complete! Succeeded: ${successCount}, Failed: ${errorCount}${lastError ? ` (Partial failure: ${lastError.message})` : ''}` : `导入完成！成功: ${successCount}, 失败: ${errorCount}${lastError ? ` (部分失败: ${lastError.message})` : ''}`);
      setAiPreviewData(null);
    }
    setIsImporting(false);
  };

  const handleImportSheetData = async () => {
    if (!sheetData || sheetData.length < 2) return;
    setIsImporting(true);
    setSheetStatus(isEn ? 'Starting import...' : '开始导入...');
    
    let successCount = 0;
    let errorCount = 0;
    let lastError = null;

    const safeTeamId = teamId || 'default_team';
    const defaultUserId = user?.uid || 'system';

    for (let i = 1; i < sheetData.length; i++) {
      try {
        const candidateData = GoogleSheetsAPI.mapRowToCandidate(sheetData[i], fieldMapping);
        if (candidateData.name) { 
          if (candidateData.offered && !candidateData.salary) candidateData.salary = candidateData.offered;
          if (candidateData.interviewDate && !candidateData.stage) candidateData.stage = 'interview';
          candidateData.company = candidateData.company || sheetCompany?.trim() || '';
          await FirestoreStore.addCandidate(safeTeamId, defaultUserId, candidateData);
          successCount++;
        }
      } catch (err) {
        console.error('映射导入单条失败:', err);
        lastError = err;
        errorCount++;
      }
    }
    
    setSheetStatus(isEn ? `Import complete! Succeeded: ${successCount}, Skipped/Failed: ${errorCount}${lastError ? ` (Partial failure: ${lastError.message})` : ''}` : `导入完成！成功: ${successCount}, 跳过/失败: ${errorCount}${lastError ? ` (部分失败: ${lastError.message})` : ''}`);
    setIsImporting(false);
  };

  return (
    <div className="page-view active" style={{ position: 'relative' }}>
      {/* Settings-exclusive secret Mini Black Hole background anomaly */}
      <MiniBlackHole />

      <div className="bezel-shell" style={{ maxWidth: '920px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <div className="bezel-core" style={{ background: 'var(--bezel-core-bg, var(--card-bg))', padding: 'var(--space-6)' }}>
          
          <h3 style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)', marginBottom: 'var(--space-6)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="ph-light ph-sliders"></i> {t('settingsPage.title')}
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            
            {/* JSON Import Section */}
            <div className="form-section">
              <h4 style={{ fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 'var(--space-3)' }}>
                {t('settingsPage.jsonSectionTitle')}
              </h4>
              
              <div style={{ padding: 'var(--space-5)', background: 'var(--card-bg, #ffffff)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-hairline)', boxShadow: 'var(--shadow-card)' }}>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-3)', lineHeight: 1.6 }}>
                  {t('settingsPage.jsonSectionDesc')}
                </p>

                {/* 灾备与一次性初始化醒目提示条 (UAT IMP-02) */}
                <div style={{
                  padding: '12px 16px',
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: 'var(--space-4)',
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'flex-start'
                }}>
                  <i className="ph-fill ph-warning-diamond" style={{ color: 'var(--accent-amber)', fontSize: '1.25rem', marginTop: '2px', flexShrink: 0 }}></i>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    <strong style={{ color: 'var(--accent-amber)', display: 'block', marginBottom: '2px' }}>
                      {t('settingsPage.jsonNoticeTitle')}
                    </strong>
                    {t('settingsPage.jsonNoticeDesc')}
                  </div>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                  <label className="btn btn-primary" style={{ cursor: isImporting ? 'not-allowed' : 'pointer', opacity: isImporting ? 0.7 : 1 }}>
                    <i className="ph-light ph-upload-simple"></i>
                    {isImporting ? t('settingsPage.importingBtn') : t('settingsPage.chooseJsonBtn')}
                    <input 
                      ref={jsonFileInputRef}
                      type="file" 
                      accept=".json" 
                      style={{ display: 'none' }} 
                      onChange={handleSelectJsonFile} 
                      disabled={isImporting || !isOwner}
                    />
                  </label>
                  {!isOwner && <span style={{ fontSize: '0.75rem', color: 'var(--accent-amber)' }}>{t('settingsPage.ownerOnlyJsonNotice')}</span>}
                </div>

                {importStatus && (
                  <div style={{ marginTop: 'var(--space-4)', fontSize: '0.75rem', color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)' }}>
                    {importStatus}
                  </div>
                )}
              </div>
            </div>

            {/* Google Sheets Long-Term Webhook Sync Section */}
            <div className="form-section" id="google-sheets-sync-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                <h4 style={{ fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="ph-fill ph-file-csv" style={{ color: '#10B981', fontSize: '1.1rem' }}></i>
                  {t('settingsPage.sheetSyncCardTitle', 'Google Sheets 长期实时 Webhook 自动同步')}
                </h4>
                {savedSyncConfig?.isActive && savedSyncConfig?.spreadsheetId ? (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '3px 10px',
                    borderRadius: '999px',
                    background: 'rgba(16, 185, 129, 0.12)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#10B981',
                    fontSize: '0.75rem',
                    fontWeight: '600'
                  }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981', boxShadow: '0 0 8px #10B981' }}></span>
                    {t('settingsPage.sheetSyncStatusActive', '长期 Webhook 自动监听已激活')}
                  </span>
                ) : (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '3px 10px',
                    borderRadius: '999px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-hairline)',
                    color: 'var(--text-muted)',
                    fontSize: '0.75rem'
                  }}>
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--text-muted)' }}></span>
                    {t('settingsPage.sheetSyncStatusInactive', '尚未绑定同步表格')}
                  </span>
                )}
              </div>
              
              <div style={{
                padding: 'var(--space-5)',
                background: 'var(--card-bg, #ffffff)',
                borderRadius: 'var(--radius-lg)',
                border: savedSyncConfig?.isActive ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid var(--border-hairline)',
                boxShadow: savedSyncConfig?.isActive ? '0 4px 20px -2px rgba(16, 185, 129, 0.08)' : 'var(--shadow-card)',
                transition: 'all 0.2s ease'
              }}>
                {/* Description */}
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: 0, marginBottom: 'var(--space-4)' }}>
                  {t('settingsPage.sheetSyncCardSubtitle', '只需一次性输入表格链接，即可激活长期 Webhook 自动监听。任何人在该表格修改或新增数据，后台将毫秒级 AI 结构化同步至系统！')}
                </p>

                {/* Unified Link & Bind Input Form */}
                <div style={{
                  padding: 'var(--space-4)',
                  background: 'var(--bg-surface-elevated, rgba(255, 255, 255, 0.03))',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-hairline)',
                  marginBottom: 'var(--space-4)'
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 'var(--space-3)', alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                          <i className="ph-bold ph-link" style={{ color: '#10B981' }}></i>
                          {t('settingsPage.sheetSyncInputUrlLabel', 'Google Sheet 表格链接 (只需在此输入一次)')}
                        </label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder={t('settingsPage.sheetSyncInputUrlPlaceholder', '粘贴 Google Sheet 链接，例如: https://docs.google.com/spreadsheets/d/.../edit')}
                          value={sheetUrl}
                          onChange={(e) => setSheetUrl(e.target.value)}
                          disabled={isBindingSync || isFullSyncing}
                          style={{
                            fontSize: '0.82rem',
                            fontFamily: 'var(--font-mono, monospace)',
                            width: '100%',
                            padding: '10px 14px',
                            borderRadius: 'var(--radius-sm)'
                          }}
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 320px) 1fr', gap: 'var(--space-3)' }}>
                        <div>
                          <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                            <i className="ph ph-buildings" style={{ color: 'var(--accent-blue)' }}></i>
                            {t('settingsPage.sheetSyncInputCompanyLabel', '默认归属客户/企业 (选填)')}
                          </label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder={t('settingsPage.sheetSyncInputCompanyPlaceholder', '如 IPE, PSA, Santak (留空则由 AI 自动识别)')}
                            value={sheetCompany}
                            onChange={(e) => setSheetCompany(e.target.value)}
                            disabled={isBindingSync || isFullSyncing}
                            style={{ fontSize: '0.8rem', padding: '8px 12px' }}
                          />
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '180px' }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleBindAndStartSync}
                        disabled={!sheetUrl || isBindingSync || isFullSyncing}
                        style={{
                          height: '42px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          fontWeight: '600',
                          fontSize: '0.85rem',
                          background: savedSyncConfig?.isActive ? 'var(--accent-primary)' : 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                          borderColor: savedSyncConfig?.isActive ? 'var(--accent-primary)' : '#10B981',
                          color: '#fff',
                          boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)'
                        }}
                      >
                        <i className={`ph-bold ${isBindingSync ? 'ph-spinner ph-spin' : (savedSyncConfig?.isActive ? 'ph-check-circle' : 'ph-plug')}`}></i>
                        {isBindingSync 
                          ? t('settingsPage.sheetSyncBindingBtn', '正在绑定...') 
                          : (savedSyncConfig?.isActive 
                              ? (sheetUrl !== savedSyncConfig?.spreadsheetUrl ? t('settingsPage.sheetSyncUpdateBtn', '更新绑定链接') : t('settingsPage.sheetSyncResaveBtn', '重新保存并查看脚本')) 
                              : t('settingsPage.sheetSyncBindBtn', '🔗 绑定并开启长期 Webhook 同步')
                            )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* If Bound: Display Connected Dashboard Details & Webhook Controls */}
                {savedSyncConfig?.isActive && (
                  <div style={{
                    padding: 'var(--space-4)',
                    background: 'rgba(16, 185, 129, 0.04)',
                    border: '1px solid rgba(16, 185, 129, 0.22)',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: 'var(--space-4)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                      <div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          {t('settingsPage.sheetSyncBoundSheetId', 'Spreadsheet ID')}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                            {savedSyncConfig.spreadsheetId || 'Unknown'}
                          </span>
                          {savedSyncConfig.spreadsheetUrl && (
                            <a
                              href={savedSyncConfig.spreadsheetUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{ fontSize: '0.75rem', color: 'var(--accent-blue)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                            >
                              {t('settingsPage.sheetSyncOpenSheet', '打开表格')} <i className="ph-light ph-arrow-square-out"></i>
                            </a>
                          )}
                        </div>
                      </div>

                      {savedSyncConfig.sheetCompany && (
                        <div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                            {t('settingsPage.sheetSyncBoundCompany', '默认归属企业')}
                          </div>
                          <span style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-primary)', background: 'rgba(59, 130, 246, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                            🏢 {savedSyncConfig.sheetCompany}
                          </span>
                        </div>
                      )}

                      <div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          {t('settingsPage.sheetSyncLastSync', '上次同步状态')}
                        </div>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          ⏱ {savedSyncConfig.lastSyncAt || t('settingsPage.sheetSyncNeverSynced', '未执行全量同步')}
                        </span>
                      </div>
                    </div>

                    {/* Dedicated Webhook Receiver Info */}
                    <div style={{
                      padding: '8px 12px',
                      background: 'rgba(0, 0, 0, 0.15)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-hairline)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      flexWrap: 'wrap',
                      marginBottom: 'var(--space-3)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{t('settingsPage.sheetSyncWebhookUrlLabel', '专属 Webhook 接收地址')}:</span>
                        <code style={{ color: 'var(--accent-emerald)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                          {getBackendWebhookUrl()}
                        </code>
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '2px 8px', fontSize: '0.72rem', height: 'auto' }}
                        onClick={() => {
                          navigator.clipboard.writeText(getBackendWebhookUrl());
                          setCopiedWebhookUrl(true);
                          setTimeout(() => setCopiedWebhookUrl(false), 2000);
                        }}
                      >
                        <i className={`ph-light ${copiedWebhookUrl ? 'ph-check' : 'ph-copy'}`}></i>
                        {copiedWebhookUrl ? t('settingsPage.sheetSyncCopiedWebhookBtn', '已复制链接') : t('settingsPage.sheetSyncCopyWebhookBtn', '复制 Webhook 链接')}
                      </button>
                    </div>

                    {/* Action Buttons: Sync All Now + Get Script + Unbind */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleQuickFullSync}
                        disabled={isFullSyncing}
                        style={{
                          fontSize: '0.8rem',
                          padding: '7px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
                          borderColor: '#3B82F6'
                        }}
                      >
                        <i className={`ph-bold ${isFullSyncing ? 'ph-spinner ph-spin' : 'ph-rocket-launch'}`}></i>
                        {isFullSyncing ? t('settingsPage.sheetSyncBtnFullSyncing', '正在执行全量同步...') : t('settingsPage.sheetSyncBtnFullSync', '🚀 立即全量同步一次')}
                      </button>

                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setShowScriptModal(true)}
                        style={{ fontSize: '0.8rem', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <i className="ph-bold ph-code"></i>
                        {t('settingsPage.sheetSyncBtnGetScript', '📋 获取 Google Apps Script 自动化脚本')}
                      </button>

                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={handleUnbindSheet}
                        style={{
                          fontSize: '0.78rem',
                          padding: '7px 12px',
                          marginLeft: 'auto',
                          color: 'var(--accent-rose)',
                          borderColor: 'rgba(225, 29, 72, 0.25)',
                          background: 'rgba(225, 29, 72, 0.05)'
                        }}
                      >
                        <i className="ph-light ph-trash"></i>
                        {t('settingsPage.sheetSyncBtnUnbind', '解除绑定')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Status Message if any */}
                {sheetStatus && (
                  <div style={{ marginBottom: 'var(--space-3)', padding: '8px 12px', background: 'rgba(59, 130, 246, 0.08)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(59, 130, 246, 0.2)', fontSize: '0.78rem', color: 'var(--accent-blue)', fontFamily: 'var(--font-mono)' }}>
                    {sheetStatus}
                  </div>
                )}

                {/* Legacy Advanced Section Folded Inside <details> */}
                <details style={{ marginTop: 'var(--space-3)', borderTop: '1px solid var(--border-hairline)', paddingTop: 'var(--space-3)' }}>
                  <summary style={{ cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text-muted)', userSelect: 'none', padding: '4px 0' }}>
                    {t('settingsPage.sheetSyncManualToggle', '⚙️ 高级调试与手动字段映射 (按列导入、行范围筛选、AI 字段对比预览)')}
                  </summary>

                  <div style={{ marginTop: 'var(--space-4)', padding: 'var(--space-4)', background: 'var(--bg-surface-elevated, rgba(255, 255, 255, 0.02))', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-4)', paddingBottom: 'var(--space-3)', borderBottom: '1px solid var(--border-hairline)' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                        <input type="radio" value="candidate" checked={importTarget === 'candidate'} onChange={() => setImportTarget('candidate')} disabled={isFetchingSheet || isAiProcessing || isImporting} />
                        {t('settingsPage.targetCandidates')}
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.875rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                        <input type="radio" value="jobOrder" checked={importTarget === 'jobOrder'} onChange={() => setImportTarget('jobOrder')} disabled={isFetchingSheet || isAiProcessing || isImporting} />
                        {t('settingsPage.targetJobOrders')}
                      </label>
                      
                      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
                         <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                           <input type="checkbox" checked={specifyRows} onChange={(e) => setSpecifyRows(e.target.checked)} disabled={isFetchingSheet || isAiProcessing || isImporting} />
                           {t('settingsPage.specifyRows')}
                         </label>
                         {specifyRows && (
                           <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                             <input type="number" className="form-input" value={startRow} onChange={e => setStartRow(e.target.value)} style={{ width: '64px', padding: '4px 6px', fontSize: '0.75rem' }} min="1" disabled={isFetchingSheet || isAiProcessing || isImporting} />
                             <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('settingsPage.rowTo')}</span>
                             <input type="number" className="form-input" value={endRow} onChange={e => setEndRow(e.target.value)} style={{ width: '64px', padding: '4px 6px', fontSize: '0.75rem' }} min="1" disabled={isFetchingSheet || isAiProcessing || isImporting} />
                           </div>
                         )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                      <button className="btn btn-secondary btn-sm" onClick={handleFetchSheet} disabled={!sheetUrl || isFetchingSheet || isImporting}>
                        <i className={`ph-light ${isFetchingSheet ? 'ph-spinner ph-spin' : 'ph-download-simple'}`}></i> {t('settingsPage.fetchBtn', '拉取并预览数据')}
                      </button>
                      {(sheetStatus === '该表格是私有的，需要授权。' || sheetStatus === t('settingsPage.privateSheetStatus')) && (
                        <button className="btn btn-secondary btn-sm" onClick={handleAuthAndFetchSheet} disabled={isFetchingSheet}>
                          <i className="ph-light ph-google-logo"></i> {t('settingsPage.authBtn')}
                        </button>
                      )}
                    </div>

                    {/* Table manual mapping & AI preview data */}
                    {sheetData && sheetData.length > 0 && (
                      <div style={{ overflowX: 'auto', background: 'var(--card-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-hairline)', marginBottom: 'var(--space-4)' }}>
                        <table style={{ width: '100%', fontSize: '0.75rem', textAlign: 'left', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr>
                              {sheetData[0].map((header, idx) => (
                                <th key={idx} style={{ padding: '8px', borderBottom: '1px solid var(--border-hairline)', background: 'var(--bg-surface-elevated)' }}>
                                  <div style={{ marginBottom: '4px', color: 'var(--text-primary)' }}>{header}</div>
                                  <select 
                                    className="form-select" 
                                    style={{ padding: '2px 4px', fontSize: '11px', height: 'auto' }}
                                    value={fieldMapping[idx] || 'skip'}
                                    onChange={(e) => setFieldMapping({...fieldMapping, [idx]: e.target.value})}
                                  >
                                    <option value="skip">{t('settingsPage.mappingSkip')}</option>
                                    <option value="interviewDate">{t('settingsPage.mappingInterviewDate')}</option>
                                    <option value="position">{t('settingsPage.mappingPosition')}</option>
                                    <option value="name">{t('settingsPage.mappingName')}</option>
                                    <option value="icNoAge">{t('settingsPage.mappingIcNoAge')}</option>
                                    <option value="degree">{t('settingsPage.mappingDegree')}</option>
                                    <option value="experience">{t('settingsPage.mappingExperience')}</option>
                                    <option value="location">{t('settingsPage.mappingLocation')}</option>
                                    <option value="phone">{t('settingsPage.mappingPhone')}</option>
                                    <option value="picName">{t('settingsPage.mappingPicName')}</option>
                                    <option value="remarks">{t('settingsPage.mappingRemarks')}</option>
                                    <option value="offered">{t('settingsPage.mappingOffered')}</option>
                                    <option value="department">{t('settingsPage.mappingDepartment')}</option>
                                    <option value="school">{t('settingsPage.mappingSchool')}</option>
                                    <option value="company">{t('settingsPage.mappingCompany')}</option>
                                    <option value="notes">{t('settingsPage.mappingNotes')}</option>
                                  </select>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {sheetData.slice(1, 6).map((row, rIdx) => (
                              <tr key={rIdx}>
                                {sheetData[0].map((_, cIdx) => (
                                  <td key={cIdx} style={{ padding: '8px', borderBottom: '1px solid var(--border-hairline)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px', color: 'var(--text-primary)' }}>
                                    {row[cIdx] || ''}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div style={{ padding: '8px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {(t('settingsPage.moreRowsCount') || '... 还有 {count} 行数据').replace('{count}', sheetData.length - 6)}
                        </div>
                      </div>
                    )}
                    
                    {sheetData && sheetData.length > 0 && !aiPreviewData && (
                      <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
                        <button className="btn btn-secondary" onClick={handleImportSheetData} disabled={isImporting}>
                          {isImporting ? t('settingsPage.importingBtn') : (t('settingsPage.forceImportBtn') || `按上述映射强制导入 (${sheetData.length - 1}行)`).replace('{count}', sheetData.length - 1)}
                        </button>
                        <button className="btn btn-primary" onClick={handleAiProcess} disabled={isAiProcessing}>
                          <i className={`ph-light ${isAiProcessing ? 'ph-spinner ph-spin' : 'ph-magic-wand'}`}></i> 
                          {t('settingsPage.aiCleanBtn')}
                        </button>
                      </div>
                    )}

                    {/* AI Diff Review Panel */}
                    {aiPreviewData && (
                      <div style={{ marginTop: 'var(--space-6)', padding: 'var(--space-4)', background: 'var(--card-bg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--accent-blue)', boxShadow: 'var(--shadow-card)' }}>
                        <h5 style={{ fontSize: '0.875rem', color: 'var(--accent-blue)', marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <i className="ph-fill ph-check-circle"></i> {t('settingsPage.aiPreviewTitle')}
                        </h5>
                        
                        {importTarget === 'candidate' && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)', padding: '8px 12px', background: 'rgba(59, 130, 246, 0.08)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: '500' }}>
                                {t('settingsPage.batchSetCompanyLabel')}
                              </span>
                              <input 
                                type="text" 
                                className="form-input" 
                                style={{ width: '180px', padding: '3px 8px', fontSize: '12px', minHeight: 'auto' }} 
                                placeholder={sheetCompany || t('settingsPage.batchSetCompanyPlaceholder')} 
                                value={bulkCompany} 
                                onChange={e => setBulkCompany(e.target.value)} 
                              />
                              <button 
                                type="button"
                                className="btn btn-secondary btn-sm" 
                                style={{ padding: '3px 10px', fontSize: '11px', height: 'auto' }}
                                onClick={() => {
                                  const val = (bulkCompany || sheetCompany).trim();
                                  if (!val) return;
                                  setAiPreviewData(prev => prev.map(p => ({ ...p, company: val })));
                                }}
                              >
                                {t('settingsPage.applyAllBtn')}
                              </button>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {(t('settingsPage.candidateCountText') || '共 {count} 位候选人').replace('{count}', aiPreviewData.length)}
                            </div>
                          </div>
                        )}

                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', fontSize: '0.75rem', textAlign: 'left', borderCollapse: 'collapse', minWidth: '850px' }}>
                            <thead>
                              <tr>
                                <th style={{ padding: '8px', borderBottom: '1px solid var(--border-hairline)', width: '130px', background: 'var(--bg-surface-elevated)', color: 'var(--text-primary)' }}>{t('settingsPage.colAssignPic')}</th>
                                {importTarget === 'candidate' ? (
                                  <>
                                    <th style={{ padding: '8px', borderBottom: '1px solid var(--border-hairline)', width: '140px', background: 'var(--bg-surface-elevated)', color: 'var(--text-primary)' }}>{t('settingsPage.colNameAgeIc')}</th>
                                    <th style={{ padding: '8px', borderBottom: '1px solid var(--border-hairline)', width: '160px', background: 'var(--bg-surface-elevated)', color: 'var(--text-primary)' }}>{t('settingsPage.colTargetCompanyPos')}</th>
                                    <th style={{ padding: '8px', borderBottom: '1px solid var(--border-hairline)', width: '130px', background: 'var(--bg-surface-elevated)', color: 'var(--text-primary)' }}>{t('settingsPage.colInterviewDateStatus')}</th>
                                    <th style={{ padding: '8px', borderBottom: '1px solid var(--border-hairline)', width: '130px', background: 'var(--bg-surface-elevated)', color: 'var(--text-primary)' }}>{t('settingsPage.colPhoneLocation')}</th>
                                    <th style={{ padding: '8px', borderBottom: '1px solid var(--border-hairline)', width: '150px', background: 'var(--bg-surface-elevated)', color: 'var(--text-primary)' }}>{t('settingsPage.colDegreeExp')}</th>
                                    <th style={{ padding: '8px', borderBottom: '1px solid var(--border-hairline)', width: '140px', background: 'var(--bg-surface-elevated)', color: 'var(--text-primary)' }}>{t('settingsPage.colSalaryRemarks')}</th>
                                  </>
                                ) : (
                                  <>
                                    <th style={{ padding: '8px', borderBottom: '1px solid var(--border-hairline)', background: 'var(--bg-surface-elevated)', color: 'var(--text-primary)' }}>{t('settingsPage.colCompanyPos')}</th>
                                    <th style={{ padding: '8px', borderBottom: '1px solid var(--border-hairline)', background: 'var(--bg-surface-elevated)', color: 'var(--text-primary)' }}>{t('settingsPage.colSalaryLocation')}</th>
                                    <th style={{ padding: '8px', borderBottom: '1px solid var(--border-hairline)', background: 'var(--bg-surface-elevated)', color: 'var(--text-primary)' }}>{t('settingsPage.colReqBenefits')}</th>
                                  </>
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {aiPreviewData.map((item, idx) => (
                                <tr key={idx}>
                                  <td style={{ padding: '8px', borderBottom: '1px solid var(--border-hairline)', verticalAlign: 'top' }}>
                                    <select 
                                      className="form-select" 
                                      value={item._assignedTo || ''} 
                                      onChange={(e) => {
                                        const newData = [...aiPreviewData];
                                        newData[idx]._assignedTo = e.target.value;
                                        setAiPreviewData(newData);
                                      }}
                                      style={{ padding: '2px 4px', fontSize: '11px', marginBottom: '4px' }}
                                    >
                                      <option value="">{item.picName ? (t('settingsPage.externalAdvisorOption') || '外部/Freelance ({pic})').replace('{pic}', item.picName) : t('settingsPage.noInternalAccountOption', '-- 外部/无内部账号 --')}</option>
                                      {teamMembers.map(m => (
                                        <option key={m.id} value={m.id}>{m.name || m.email}</option>
                                      ))}
                                    </select>
                                    <input 
                                      className="form-input" 
                                      value={item.picName || ''} 
                                      onChange={(e) => { const n = [...aiPreviewData]; n[idx].picName = e.target.value; setAiPreviewData(n); }} 
                                      style={{ padding: '2px 4px', fontSize: '10px', minHeight: 'auto' }} 
                                      placeholder={t('settingsPage.placeholderAdvisorPic')} 
                                    />
                                  </td>
                                  
                                  {importTarget === 'candidate' ? (
                                    <>
                                      <td style={{ padding: '8px', borderBottom: '1px solid var(--border-hairline)', verticalAlign: 'top' }}>
                                        <input className="form-input" value={item.name || item.candidateName || ''} onChange={(e) => { const n = [...aiPreviewData]; n[idx].name = e.target.value; setAiPreviewData(n); }} style={{ padding: '2px 4px', fontSize: '12px', fontWeight: '600', minHeight: 'auto', marginBottom: '4px' }} placeholder={t('settingsPage.placeholderName')} />
                                        <div style={{ display: 'flex', gap: '2px' }}>
                                          <input className="form-input" value={item.age || ''} onChange={(e) => { const n = [...aiPreviewData]; n[idx].age = e.target.value; setAiPreviewData(n); }} style={{ padding: '2px 4px', fontSize: '11px', minHeight: 'auto', width: '45%' }} placeholder={t('settingsPage.placeholderAge')} />
                                          <input className="form-input" value={item.icNo || ''} onChange={(e) => { const n = [...aiPreviewData]; n[idx].icNo = e.target.value; setAiPreviewData(n); }} style={{ padding: '2px 4px', fontSize: '10px', minHeight: 'auto', width: '55%' }} placeholder={t('settingsPage.placeholderIc')} />
                                        </div>
                                      </td>
                                      <td style={{ padding: '8px', borderBottom: '1px solid var(--border-hairline)', verticalAlign: 'top' }}>
                                        <input 
                                          className="form-input" 
                                          value={item.company || ''} 
                                          onChange={(e) => { const n = [...aiPreviewData]; n[idx].company = e.target.value; setAiPreviewData(n); }} 
                                          style={{ padding: '2px 4px', fontSize: '11px', fontWeight: '600', minHeight: 'auto', marginBottom: '4px', color: 'var(--accent-blue)', background: 'rgba(59, 130, 246, 0.05)' }} 
                                          placeholder={t('settingsPage.placeholderTargetCompany')} 
                                        />
                                        <input className="form-input" value={item.position || ''} onChange={(e) => { const n = [...aiPreviewData]; n[idx].position = e.target.value; setAiPreviewData(n); }} style={{ padding: '2px 4px', fontSize: '11px', minHeight: 'auto', marginBottom: '4px' }} placeholder={t('settingsPage.placeholderPosition')} />
                                        <input className="form-input" value={item.department || ''} onChange={(e) => { const n = [...aiPreviewData]; n[idx].department = e.target.value; setAiPreviewData(n); }} style={{ padding: '2px 4px', fontSize: '10px', minHeight: 'auto', color: 'var(--text-secondary)' }} placeholder={t('settingsPage.placeholderDept')} />
                                      </td>
                                      <td style={{ padding: '8px', borderBottom: '1px solid var(--border-hairline)', verticalAlign: 'top' }}>
                                        <input className="form-input" value={item.interviewDate || ''} onChange={(e) => { const n = [...aiPreviewData]; n[idx].interviewDate = e.target.value; setAiPreviewData(n); }} style={{ padding: '2px 4px', fontSize: '11px', minHeight: 'auto', marginBottom: '4px' }} placeholder={t('settingsPage.placeholderInterviewDate')} />
                                        <select 
                                          className="form-select"
                                          value={item.normalizedStatus || 'pending'}
                                          onChange={(e) => { const n = [...aiPreviewData]; n[idx].normalizedStatus = e.target.value; setAiPreviewData(n); }}
                                          style={{ padding: '2px 4px', fontSize: '10px', height: 'auto' }}
                                        >
                                          <option value="attended">{t('settingsPage.statusAttended')}</option>
                                          <option value="no_show">{t('settingsPage.statusNoShow')}</option>
                                          <option value="unable_to_attend">{t('settingsPage.statusCancel')}</option>
                                          <option value="pending">{t('settingsPage.statusPending')}</option>
                                        </select>
                                      </td>
                                      <td style={{ padding: '8px', borderBottom: '1px solid var(--border-hairline)', verticalAlign: 'top' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                                          <input className="form-input" value={item.phone || ''} onChange={(e) => { const n = [...aiPreviewData]; n[idx].phone = e.target.value; setAiPreviewData(n); }} style={{ padding: '2px 4px', fontSize: '11px', minHeight: 'auto', flex: 1 }} placeholder={t('settingsPage.placeholderPhone')} />
                                          {item.phone && <WhatsAppButton phone={item.phone} candidateName={item.name} variant="icon" style={{ padding: 0 }} />}
                                        </div>
                                        <input className="form-input" value={item.location || ''} onChange={(e) => { const n = [...aiPreviewData]; n[idx].location = e.target.value; setAiPreviewData(n); }} style={{ padding: '2px 4px', fontSize: '11px', minHeight: 'auto' }} placeholder={t('settingsPage.placeholderLocation')} />
                                      </td>
                                      <td style={{ padding: '8px', borderBottom: '1px solid var(--border-hairline)', verticalAlign: 'top' }}>
                                        <input className="form-input" value={item.degree || item.qualification || ''} onChange={(e) => { const n = [...aiPreviewData]; n[idx].degree = e.target.value; setAiPreviewData(n); }} style={{ padding: '2px 4px', fontSize: '11px', minHeight: 'auto', marginBottom: '4px' }} placeholder={t('settingsPage.placeholderDegree')} />
                                        <input className="form-input" value={item.experience || ''} onChange={(e) => { const n = [...aiPreviewData]; n[idx].experience = e.target.value; setAiPreviewData(n); }} style={{ padding: '2px 4px', fontSize: '10px', minHeight: 'auto' }} placeholder={t('settingsPage.placeholderExp')} />
                                      </td>
                                      <td style={{ padding: '8px', borderBottom: '1px solid var(--border-hairline)', verticalAlign: 'top' }}>
                                        <input className="form-input" value={item.offered || item.salary || ''} onChange={(e) => { const n = [...aiPreviewData]; n[idx].offered = e.target.value; setAiPreviewData(n); }} style={{ padding: '2px 4px', fontSize: '11px', minHeight: 'auto', marginBottom: '4px' }} placeholder={t('settingsPage.placeholderOfferedSalary')} />
                                        <input className="form-input" value={item.remarks || item.rawStatus || item.notes || ''} onChange={(e) => { const n = [...aiPreviewData]; n[idx].remarks = e.target.value; setAiPreviewData(n); }} style={{ padding: '2px 4px', fontSize: '11px', minHeight: 'auto' }} placeholder={t('settingsPage.placeholderRemarks')} />
                                      </td>
                                    </>
                                  ) : (
                                    <>
                                      <td style={{ padding: '8px', borderBottom: '1px solid var(--border-hairline)', verticalAlign: 'top' }}>
                                        <input className="form-input" value={item.company || ''} onChange={(e) => { const n = [...aiPreviewData]; n[idx].company = e.target.value; setAiPreviewData(n); }} style={{ padding: '2px 4px', fontSize: '12px', minHeight: 'auto', marginBottom: '4px' }} placeholder={t('settingsPage.placeholderCompanyName')} />
                                        <input className="form-input" value={item.position || ''} onChange={(e) => { const n = [...aiPreviewData]; n[idx].position = e.target.value; setAiPreviewData(n); }} style={{ padding: '2px 4px', fontSize: '11px', minHeight: 'auto', color: 'var(--text-secondary)' }} placeholder={t('settingsPage.placeholderJobTitle')} />
                                      </td>
                                      <td style={{ padding: '8px', borderBottom: '1px solid var(--border-hairline)', verticalAlign: 'top' }}>
                                        <input className="form-input" value={item.salary || ''} onChange={(e) => { const n = [...aiPreviewData]; n[idx].salary = e.target.value; setAiPreviewData(n); }} style={{ padding: '2px 4px', fontSize: '11px', minHeight: 'auto', marginBottom: '4px' }} placeholder={t('settingsPage.placeholderSalary')} />
                                        <input className="form-input" value={item.location || ''} onChange={(e) => { const n = [...aiPreviewData]; n[idx].location = e.target.value; setAiPreviewData(n); }} style={{ padding: '2px 4px', fontSize: '11px', minHeight: 'auto' }} placeholder={t('settingsPage.placeholderJobLocation')} />
                                      </td>
                                      <td style={{ padding: '8px', borderBottom: '1px solid var(--border-hairline)', verticalAlign: 'top' }}>
                                        <input className="form-input" value={item.requirements || ''} onChange={(e) => { const n = [...aiPreviewData]; n[idx].requirements = e.target.value; setAiPreviewData(n); }} style={{ padding: '2px 4px', fontSize: '11px', minHeight: 'auto', marginBottom: '4px' }} placeholder={t('settingsPage.placeholderReqs')} />
                                        <input className="form-input" value={item.benefits || ''} onChange={(e) => { const n = [...aiPreviewData]; n[idx].benefits = e.target.value; setAiPreviewData(n); }} style={{ padding: '2px 4px', fontSize: '11px', minHeight: 'auto' }} placeholder={t('settingsPage.placeholderBenefits')} />
                                      </td>
                                    </>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        
                        <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
                          <button className="btn btn-primary" onClick={handleImportAiData} disabled={isImporting}>
                            {isImporting ? t('settingsPage.batchImportingBtn') : (t('settingsPage.confirmImportAllBtn') || `确认导入全部 ${aiPreviewData.length} 条记录`).replace('{count}', aiPreviewData.length)}
                          </button>
                          <button className="btn btn-secondary" onClick={() => setAiPreviewData(null)} disabled={isImporting}>
                            {t('settingsPage.cancelAndBackBtn')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </details>
              </div>
            </div>

            {/* Notification Binding & Message Template Engine (Hidden from UI per user request, logic preserved) */}
            {false && (
              <>
                {/* Notification Binding Section */}
                <div className="form-section">
                  <h4 style={{ fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 'var(--space-3)' }}>
                    {t('settingsPage.waSectionTitle')}
                  </h4>
                  
                  <div style={{ padding: 'var(--space-5)', background: 'var(--card-bg, #ffffff)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-hairline)', boxShadow: 'var(--shadow-card)' }}>
                    <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)', lineHeight: 1.6 }}>
                      {t('settingsPage.waDesc')}
                    </p>
                    
                    <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder={t('settingsPage.waPlaceholder')} 
                        value={waInput}
                        onChange={(e) => setWaInput(e.target.value)}
                        style={{ maxWidth: '320px', fontFamily: 'var(--font-mono)' }}
                      />
                      <button className="btn btn-primary" onClick={handleSaveWhatsApp} disabled={isWaSaving}>
                        <i className={isWaSaving ? "ph-light ph-spinner ph-spin" : "ph-light ph-whatsapp-logo"}></i> 
                        {waInput ? t('settingsPage.waUpdateBtn') : t('settingsPage.waBindBtn')}
                      </button>
                      {waInput && (
                        <button className="btn btn-secondary" onClick={() => setWaInput('')}>
                          {t('settingsPage.waClearBtn')}
                        </button>
                      )}
                    </div>
                    {showWaToast && (
                      <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--accent-emerald)' }}>
                        <i className="ph-fill ph-check-circle"></i> {t('settingsPage.waSavedToast')}
                      </div>
                    )}
                    {waError && (
                      <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--accent-rose)' }}>
                        <i className="ph-fill ph-warning-circle"></i> {waError}
                      </div>
                    )}
                  </div>
                </div>

                {/* Notification Templates Section */}
                <div className="form-section">
                  <h4 style={{ fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 'var(--space-3)' }}>
                    {t('settingsPage.templateSectionTitle')}
                  </h4>
                  
                  <div style={{ padding: 'var(--space-5)', background: 'var(--card-bg, #ffffff)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-hairline)', boxShadow: 'var(--shadow-card)' }}>
                    <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-4)', lineHeight: 1.6 }}>
                      {t('settingsPage.templateDesc')}
                      <br />
                      <span style={{ color: 'var(--text-muted)' }}>{t('settingsPage.templateVars')}</span>
                    </p>
                    
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ color: 'var(--text-primary)', fontWeight: '500' }}>
                        {t('settingsPage.templateLabel')}
                      </label>
                      <textarea 
                        className="form-textarea" 
                        rows="6"
                        value={waReminderTemplate}
                        onChange={(e) => setWaReminderTemplate(e.target.value)}
                        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
                      ></textarea>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
                      <button className="btn btn-primary" onClick={handleSaveWhatsApp} disabled={isWaSaving}>
                        <i className={isWaSaving ? "ph-light ph-spinner ph-spin" : "ph-light ph-floppy-disk"}></i> 
                        {t('settingsPage.saveTemplateBtn')}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Data Governance & Canonical PIC Cleaning (Owner Only) */}
            {isOwner && (
              <div className="form-section">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 'var(--space-3)' }}>
                  <h4 style={{ fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', margin: 0 }}>
                    {t('settingsPage.dataGovSectionTitle', '数据治理与顾问主数据规整')}
                  </h4>
                  <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-rose)', border: '1px solid rgba(239, 68, 68, 0.25)', fontWeight: 600 }}>
                    {t('settingsPage.ownerOnlyBadge', 'Owner 专享')}
                  </span>
                </div>
                <div style={{ padding: 'var(--space-5)', background: 'var(--card-bg, #ffffff)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-hairline)', boxShadow: 'var(--shadow-card)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: 'var(--space-4)' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)', flexShrink: 0 }}>
                      <i className="ph-bold ph-identification-badge" style={{ fontSize: '1.4rem' }}></i>
                    </div>
                    <div>
                      <h5 style={{ margin: '0 0 6px 0', fontSize: '0.95rem', fontWeight: 600 }}>{t('settingsPage.dataGovCardTitle', '顾问历史名称一键归一清洗')}</h5>
                      <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        {t('settingsPage.dataGovCardDesc', '自动扫描当前团队全部历史候选人档案，识别 YeeYuan / yeeyuan / Kalap 等大小写与多变体别名，基于团队官方在册花名册一键纠偏为主数据标准全名，并补齐人员 UID 关联。')}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button 
                      className="btn btn-primary" 
                      onClick={async () => {
                        if (!teamId || !isOwner) return;
                        setIsCleaningPic(true);
                        setPicCleanResult(null);
                        try {
                          const candidatesRef = collection(db, 'teams', teamId || 'default_team', 'candidates');
                          const snap = await getDocs(candidatesRef);
                          let totalChecked = 0;
                          const updates = [];

                          for (const d of snap.docs) {
                            totalChecked++;
                            const c = d.data();
                            const rawPic = c.picName || c.pic || '';
                            const rawAssigned = c.assignedTo || '';
                            
                            const canonical = resolveCanonicalPic(rawPic, rawAssigned, teamMembers);
                            
                            const needsNameFix = rawPic && canonical.displayName !== '未分配顾问' && canonical.displayName !== rawPic;
                            const needsUidFix = canonical.uid ? (rawAssigned !== canonical.uid) : (rawPic && rawAssigned ? true : false);
                            
                            if (needsNameFix || needsUidFix) {
                              const payload = {};
                              if (needsNameFix) payload.picName = canonical.displayName;
                              if (needsUidFix) payload.assignedTo = canonical.uid || '';
                              
                              updates.push({ id: d.id, candidateName: c.name || '候选人', from: rawPic, to: canonical.displayName, payload });
                            }
                          }

                          for (const item of updates) {
                            const docRef = doc(db, 'teams', teamId || 'default_team', 'candidates', item.id);
                            await updateDoc(docRef, item.payload);
                          }

                          setPicCleanResult({
                            totalChecked,
                            totalUpdated: updates.length,
                            sampleUpdates: updates.slice(0, 5)
                          });
                          SystemLogger.audit(teamId, user, 'UPDATE', 'SYSTEM', '一键清洗历史顾问数据', {
                            totalChecked,
                            totalUpdated: updates.length
                          });
                        } catch (err) {
                          console.error('Error cleaning historical PICs:', err);
                          setPicCleanResult({ error: err.message });
                        } finally {
                          setIsCleaningPic(false);
                        }
                      }} 
                      disabled={isCleaningPic || !isOwner}
                    >
                      <i className={isCleaningPic ? "ph-light ph-spinner ph-spin" : "ph-bold ph-broom"}></i>
                      {isCleaningPic ? t('settingsPage.dataGovBtnScanning', '正在扫描并清洗历史档案...') : t('settingsPage.dataGovBtnScan', '一键扫描并规整历史顾问名称')}
                    </button>
                  </div>

                  {picCleanResult && (
                    <div style={{
                      marginTop: 'var(--space-4)',
                      padding: '12px 16px',
                      borderRadius: 'var(--radius-md)',
                      background: picCleanResult.error ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                      border: `1px solid ${picCleanResult.error ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                      fontSize: '0.85rem'
                    }}>
                      {picCleanResult.error ? (
                        <div style={{ color: 'var(--accent-rose)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <i className="ph-fill ph-warning-circle"></i>
                          <span>{t('settingsPage.dataGovScanFail', '清洗失败: ')}{picCleanResult.error}</span>
                        </div>
                      ) : (
                        <div>
                          <div style={{ color: 'var(--accent-emerald)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: picCleanResult.sampleUpdates?.length ? '8px' : '0' }}>
                            <i className="ph-fill ph-check-circle"></i>
                            <span>
                              {(t('settingsPage.dataGovScanSuccess') || '规整完成！共扫描 {total} 份档案，成功统一纠偏 {updated} 条历史顾问记录。')
                                .replace('{total}', picCleanResult.totalChecked)
                                .replace('{updated}', picCleanResult.totalUpdated)}
                            </span>
                          </div>
                          {picCleanResult.sampleUpdates && picCleanResult.sampleUpdates.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                              {picCleanResult.sampleUpdates.map((s, idx) => (
                                <span key={idx} style={{ fontSize: '0.75rem', background: 'rgba(255, 255, 255, 0.06)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                                  <span style={{ color: 'var(--text-muted)' }}>{s.from || t('settingsPage.picCleanEmpty', '(空)')}</span> ➔ <strong style={{ color: 'var(--accent-blue)' }}>{s.to}</strong>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Global Preferences / Theme Selection */}
            <div className="form-section">
              <h4 style={{ fontSize: '0.8rem', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: 'var(--space-3)' }}>
                {t('settingsPage.globalSectionTitle', '全局偏好配置')}
              </h4>
              <div style={{ padding: 'var(--space-5)', background: 'var(--card-bg, #ffffff)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-hairline)', boxShadow: 'var(--shadow-card)' }}>
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <label className="form-label" style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '0.95rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="ph-bold ph-palette" style={{ color: 'var(--accent-blue)' }}></i>
                    {t('settingsPage.themeModeLabel', '全局系统主题外观')}
                  </label>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                    {t('settingsPage.themeModeDesc', 'TALENT FLOW 支持 3 大精致主题：纯粹黑曜石深空、Google Gemini 宇宙星云与日间清爽高光，可在下方直观点击切换或随时通过右上角顶栏按钮循环切换。')}
                  </p>
                </div>

                {/* 3 Interactive Visual Theme Cards */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: '16px'
                }}>
                  {/* Card 1: OLED Dark */}
                  <div
                    onClick={() => handleSelectTheme('dark')}
                    style={{
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-md)',
                      border: currentTheme === 'dark' ? '2px solid var(--accent-blue)' : '1px solid var(--border-hairline)',
                      background: '#090a10',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      position: 'relative',
                      boxShadow: currentTheme === 'dark' ? '0 0 20px rgba(59, 130, 246, 0.35)' : 'none',
                      transition: 'all 0.2s cubic-bezier(0.32, 0.72, 0, 1)'
                    }}
                  >
                    {/* Visual Preview Box */}
                    <div style={{
                      height: '70px',
                      borderRadius: '8px',
                      background: '#050508',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      padding: '10px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      position: 'relative',
                      overflow: 'hidden'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ff5f56' }}></span>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ffbd2e' }}></span>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#27c93f' }}></span>
                        </div>
                        <i className="ph-fill ph-moon" style={{ color: '#94a3b8', fontSize: '13px' }}></i>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <div style={{ height: '6px', width: '35%', background: '#3b82f6', borderRadius: '3px' }}></div>
                        <div style={{ height: '6px', width: '25%', background: 'rgba(255,255,255,0.15)', borderRadius: '3px' }}></div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="ph-bold ph-moon" style={{ color: '#94a3b8', fontSize: '1.1rem' }}></i>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#f8fafc' }}>
                          {t('settingsPage.themeDarkTitle', 'OLED 深空 (OLED Void)')}
                        </span>
                      </div>
                      {currentTheme === 'dark' && (
                        <span style={{
                          fontSize: '0.72rem',
                          background: 'rgba(59, 130, 246, 0.15)',
                          color: 'var(--accent-blue)',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          fontWeight: 600,
                          border: '1px solid rgba(59, 130, 246, 0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <i className="ph-fill ph-check-circle"></i> {t('settingsPage.themeCurrentActive', '当前生效')}
                        </span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: '0.76rem', color: '#9497ab', lineHeight: 1.5 }}>
                      {t('settingsPage.themeDarkDesc', '纯粹深邃的黑曜石基底与极简夜间配色，适合专注沉浸与低光环境')}
                    </p>
                  </div>

                  {/* Card 2: Gemini Cosmos */}
                  <div
                    onClick={() => handleSelectTheme('gemini')}
                    style={{
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-md)',
                      border: currentTheme === 'gemini' ? '2px solid #c084fc' : '1px solid rgba(168, 85, 247, 0.25)',
                      background: 'linear-gradient(145deg, #0a0e27 0%, #11173d 100%)',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      position: 'relative',
                      boxShadow: currentTheme === 'gemini' ? '0 0 24px rgba(168, 85, 247, 0.45)' : 'none',
                      transition: 'all 0.2s cubic-bezier(0.32, 0.72, 0, 1)'
                    }}
                  >
                    {/* Visual Preview Box */}
                    <div style={{
                      height: '70px',
                      borderRadius: '8px',
                      background: 'radial-gradient(ellipse at 80% 20%, rgba(168, 85, 247, 0.35) 0%, rgba(59, 130, 246, 0.25) 50%, #050716 100%)',
                      border: '1px solid rgba(168, 85, 247, 0.3)',
                      padding: '10px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      position: 'relative',
                      overflow: 'hidden'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ec4899' }}></span>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#a855f7' }}></span>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#38bdf8' }}></span>
                        </div>
                        <i className="ph-fill ph-sparkle" style={{ color: '#c084fc', fontSize: '14px', filter: 'drop-shadow(0 0 6px rgba(192, 132, 252, 0.9))' }}></i>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <div style={{ height: '6px', width: '45%', background: 'linear-gradient(90deg, #3b82f6, #a855f7, #ec4899)', borderRadius: '3px' }}></div>
                        <div style={{ height: '6px', width: '20%', background: 'rgba(255,255,255,0.2)', borderRadius: '3px' }}></div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="ph-fill ph-sparkle" style={{ color: '#c084fc', fontSize: '1.1rem' }}></i>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#f8fafc' }}>
                          {t('settingsPage.themeGeminiTitle', 'Gemini 宇宙 (Cosmic Nebula)')}
                        </span>
                      </div>
                      {currentTheme === 'gemini' && (
                        <span style={{
                          fontSize: '0.72rem',
                          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.25), rgba(168, 85, 247, 0.25))',
                          color: '#e9d5ff',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          fontWeight: 600,
                          border: '1px solid rgba(168, 85, 247, 0.45)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <i className="ph-fill ph-check-circle"></i> {t('settingsPage.themeCurrentActive', '当前生效')}
                        </span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: '0.76rem', color: '#cbd5e1', lineHeight: 1.5 }}>
                      {t('settingsPage.themeGeminiDesc', '灵感源自 Google Gemini 与浩瀚星空，搭载星云渐变、微光玻璃与紫粉极光')}
                    </p>
                  </div>

                  {/* Card 3: Clean Daylight */}
                  <div
                    onClick={() => handleSelectTheme('light')}
                    style={{
                      cursor: 'pointer',
                      borderRadius: 'var(--radius-md)',
                      border: currentTheme === 'light' ? '2px solid #f59e0b' : '1px solid var(--border-hairline)',
                      background: '#ffffff',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      position: 'relative',
                      boxShadow: currentTheme === 'light' ? '0 0 20px rgba(245, 158, 11, 0.35)' : 'none',
                      transition: 'all 0.2s cubic-bezier(0.32, 0.72, 0, 1)'
                    }}
                  >
                    {/* Visual Preview Box */}
                    <div style={{
                      height: '70px',
                      borderRadius: '8px',
                      background: '#f8fafc',
                      border: '1px solid rgba(0, 0, 0, 0.08)',
                      padding: '10px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      position: 'relative',
                      overflow: 'hidden'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#cbd5e1' }}></span>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#cbd5e1' }}></span>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#cbd5e1' }}></span>
                        </div>
                        <i className="ph-fill ph-sun" style={{ color: '#f59e0b', fontSize: '14px' }}></i>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <div style={{ height: '6px', width: '40%', background: '#3b82f6', borderRadius: '3px' }}></div>
                        <div style={{ height: '6px', width: '25%', background: '#e2e8f0', borderRadius: '3px' }}></div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="ph-bold ph-sun" style={{ color: '#d97706', fontSize: '1.1rem' }}></i>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#0f172a' }}>
                          {t('settingsPage.themeLightTitle', '日间清爽 (Clean Daylight)')}
                        </span>
                      </div>
                      {currentTheme === 'light' && (
                        <span style={{
                          fontSize: '0.72rem',
                          background: 'rgba(245, 158, 11, 0.15)',
                          color: '#b45309',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          fontWeight: 600,
                          border: '1px solid rgba(245, 158, 11, 0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <i className="ph-fill ph-check-circle"></i> {t('settingsPage.themeCurrentActive', '当前生效')}
                        </span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: '0.76rem', color: '#475569', lineHeight: 1.5 }}>
                      {t('settingsPage.themeLightDesc', '高对比日光白净基底与柔和边界，白天明亮办公环境阅读清晰护眼')}
                    </p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* JSON Import Two-Step Warning Modal with 5s Countdown (UAT IMP-02) */}
      {mounted && jsonConfirmStep > 0 && pendingJsonData && typeof document !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(5px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10050
        }}>
          <div className="bezel-shell modal-bezel" style={{ width: '560px', maxWidth: '94vw', animation: 'modalEnter 0.25s cubic-bezier(0.32, 0.72, 0, 1)' }}>
            <div className="bezel-core modal-core" style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {jsonConfirmStep === 1 ? (
                <>
                  {/* Step 1 Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <i className="ph-fill ph-warning-diamond" style={{ color: 'var(--accent-amber)', fontSize: '1.4rem' }}></i>
                      <h3 style={{ fontSize: '1rem', margin: 0, color: 'var(--text-primary)', fontWeight: 600 }}>
                        {t('settingsPage.jsonModalStep1Title')}
                      </h3>
                    </div>
                    <button className="btn-icon" onClick={handleCancelJsonImport}>
                      <i className="ph-light ph-x"></i>
                    </button>
                  </div>

                  <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                    {t('settingsPage.jsonModalStep1Desc')}
                  </p>

                  {/* Summary Card */}
                  <div style={{
                    padding: '12px 14px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-hairline)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {t('settingsPage.jsonModalBackupFileLabel', '备份文件：')}<span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{pendingJsonData.filename}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent-blue)', background: 'rgba(59, 130, 246, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                        <i className="ph-light ph-users" style={{ marginRight: '4px' }}></i>
                        {t('settingsPage.jsonModalCandCount', '{count} 位候选人').replace('{count}', pendingJsonData.candidates.length)}
                      </span>
                      {pendingJsonData.jobOrders?.length > 0 && (
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent-emerald)', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                          <i className="ph-light ph-briefcase" style={{ marginRight: '4px' }}></i>
                          {t('settingsPage.jsonModalOrderCount', '{count} 条招聘需求').replace('{count}', pendingJsonData.jobOrders.length)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Layer 1 Security Sanitization Notice (UAT IMP-03) */}
                  {pendingJsonData.sanitizedCount > 0 && (
                    <div style={{
                      padding: '10px 12px',
                      background: 'rgba(16, 185, 129, 0.08)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '0.8rem',
                      color: 'var(--accent-emerald)'
                    }}>
                      <i className="ph-fill ph-shield-check" style={{ fontSize: '1.2rem', flexShrink: 0 }}></i>
                      <span>
                        {t('settingsPage.jsonModalSanitizedNotice', '🛡️ 第一层安全防御已生效：已自动拦截并过滤 {count} 个危险/非标准字段（含原型链防污染与非法属性剥离）')
                          .replace('{count}', pendingJsonData.sanitizedCount)}
                      </span>
                    </div>
                  )}

                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                    {t('settingsPage.jsonModalTargetNotice')}
                  </p>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: 'var(--space-2)' }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={handleCancelJsonImport}>
                      {t('settingsPage.jsonModalCancelBtn', '取消')}
                    </button>
                    <button type="button" className="btn btn-primary btn-sm" onClick={handleGoToStep2}>
                      {t('settingsPage.jsonModalNextBtn', '继续下一步 ➔')}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* Step 2 Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <i className="ph-fill ph-shield-warning" style={{ color: 'var(--accent-rose)', fontSize: '1.4rem' }}></i>
                      <h3 style={{ fontSize: '1rem', margin: 0, color: 'var(--accent-rose)', fontWeight: 600 }}>
                        {t('settingsPage.jsonModalStep2Title')}
                      </h3>
                    </div>
                    <button className="btn-icon" onClick={handleCancelJsonImport}>
                      <i className="ph-light ph-x"></i>
                    </button>
                  </div>

                  {/* Danger Warning Box */}
                  <div style={{
                    padding: '14px 16px',
                    background: 'rgba(225, 29, 72, 0.08)',
                    border: '1px solid rgba(225, 29, 72, 0.3)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    <div style={{ color: 'var(--accent-rose)', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <i className="ph-fill ph-warning-octagon"></i>
                      {t('settingsPage.jsonModalStep2Warning')}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.6 }}>
                      {t('settingsPage.jsonModalStep2Detail')}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: 'var(--space-2)' }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={handleCancelJsonImport}>
                      {t('settingsPage.jsonModalCancelBtn', '放弃导入')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={jsonCountdown > 0}
                      onClick={handleExecuteJsonImport}
                      style={{
                        background: jsonCountdown > 0 ? 'rgba(255, 255, 255, 0.08)' : 'var(--accent-rose)',
                        color: jsonCountdown > 0 ? 'var(--text-muted)' : '#fff',
                        borderColor: jsonCountdown > 0 ? 'rgba(255, 255, 255, 0.1)' : 'var(--accent-rose)',
                        cursor: jsonCountdown > 0 ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s ease',
                        fontWeight: 600
                      }}
                    >
                      {jsonCountdown > 0 
                        ? t('settingsPage.jsonModalCountdownBtn', '确认全量写入 ({seconds}s)').replace('{seconds}', jsonCountdown)
                        : t('settingsPage.jsonModalConfirmBtn', '我已完全了解风险，立即全量导入')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Apps Script Guide & Code Modal */}
      {showScriptModal && typeof document !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(6px)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: 'var(--card-bg, #1e293b)',
            border: '1px solid var(--border-hairline, rgba(255, 255, 255, 0.1))',
            borderRadius: 'var(--radius-lg, 12px)',
            maxWidth: '680px',
            width: '100%',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-hairline)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(255, 255, 255, 0.02)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.25rem' }}>📋</span>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                  {t('settingsPage.sheetSyncModalTitle', 'Google Sheets 长期自动化 Webhook 脚本配置')}
                </h3>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setShowScriptModal(false)}
                style={{ cursor: 'pointer', background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem' }}
              >
                <i className="ph-light ph-x"></i>
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* 3 Step Instruction */}
              <div style={{
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: 'var(--radius-md)',
                padding: '14px 16px',
                fontSize: '0.85rem',
                lineHeight: 1.7,
                color: 'var(--text-primary)'
              }}>
                <div style={{ fontWeight: 600, color: 'var(--accent-blue)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="ph-fill ph-info"></i> {t('settingsPage.sheetSyncModal3StepsTitle', '只需 3 步，开启永久自动化同步：')}
                </div>
                <div style={{ paddingLeft: '4px' }}>
                  <div>{t('settingsPage.sheetSyncModalStep1', '1. 打开您的 Google 表格，点击顶部菜单：扩展程序 (Extensions) ➔ Apps 脚本 (Apps Script)')}</div>
                  <div>{t('settingsPage.sheetSyncModalStep2', '2. 清空编辑器中的原有代码，点击下方按钮一键复制全部脚本，并粘贴进去')}</div>
                  <div>{t('settingsPage.sheetSyncModalStep3', '3. 点击 Apps 脚本顶部工具栏的「保存」图标 (Ctrl+S / Cmd+S)，大功告成！')}</div>
                </div>
              </div>

              {/* Code Box */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    {t('settingsPage.sheetSyncModalScriptSubtitle', '专属 Google Apps Script 自动化代码 (已注入当前团队 ID 与 Webhook 接口):')}
                  </span>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{
                      padding: '4px 12px',
                      fontSize: '0.78rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: copiedScript ? '#10B981' : 'var(--accent-primary)',
                      borderColor: copiedScript ? '#10B981' : 'var(--accent-primary)'
                    }}
                    onClick={() => {
                      navigator.clipboard.writeText(getAppsScriptCode());
                      setCopiedScript(true);
                      setTimeout(() => setCopiedScript(false), 2500);
                    }}
                  >
                    <i className={`ph-bold ${copiedScript ? 'ph-check' : 'ph-copy'}`}></i>
                    {copiedScript ? t('settingsPage.sheetSyncModalCopiedScript', '✅ 已复制脚本代码！') : t('settingsPage.sheetSyncModalCopyScript', '📋 一键复制代码')}
                  </button>
                </div>

                <div style={{
                  position: 'relative',
                  background: '#0d1117',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '12px 14px',
                  maxHeight: '260px',
                  overflowY: 'auto'
                }}>
                  <pre style={{ margin: 0, fontFamily: 'var(--font-mono, monospace)', fontSize: '0.75rem', color: '#e6edf3', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {getAppsScriptCode()}
                  </pre>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '14px 20px',
              borderTop: '1px solid var(--border-hairline)',
              display: 'flex',
              justifyContent: 'flex-end',
              background: 'rgba(255, 255, 255, 0.02)'
            }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowScriptModal(false)}
                style={{ padding: '6px 16px', fontSize: '0.82rem' }}
              >
                {t('settingsPage.sheetSyncModalClose', '完成并关闭')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
