'use client';

import { useState, useRef } from 'react';
import { useAuth } from '../lib/auth-context';
import { useI18n } from '../lib/i18n-context';
import { useFeedback } from '../lib/feedback-context';
import { FirestoreStore } from '../lib/firestore-store';
import { authFetch } from '../lib/api-client';
import { 
  DEFAULT_CLAIMS_CONFIG,
  calculateMileageClaim,
  generateReceiptFingerprint,
  detectClaimAnomalies,
  roundCurrency
} from '../lib/claims-engine';

export default function ExpenseClaimModal({ isOpen, onClose, existingClaims = [] }) {
  const { user, teamId } = useAuth();
  const { t } = useI18n();
  const { showToast } = useFeedback();

  const fileInputRef = useRef(null);
  const [activeItemIndexForOcr, setActiveItemIndexForOcr] = useState(null);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [claimMonth, setClaimMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [title, setTitle] = useState('');
  const [payoutChannel, setPayoutChannel] = useState('PAYROLL'); // 'PAYROLL' | 'BATCH_PAYOUT'

  // Items State (包裹制费用明细)
  const [items, setItems] = useState([
    {
      itemId: `item_${Date.now()}_0`,
      category: 'MEAL',
      receiptDate: new Date().toISOString().slice(0, 10),
      merchantName: '',
      invoiceNo: '',
      amount: '',
      taxAmount: '',
      mileageMeta: {
        vehicleType: 'CAR',
        origin: '',
        destination: '',
        distanceKm: 0,
        appliedRate: 0.80,
        tollAmount: 0,
        parkingAmount: 0
      },
      ocrExtracted: false,
      notes: ''
    }
  ]);

  if (!isOpen) return null;

  const handleAddItem = () => {
    setItems(prev => [
      ...prev,
      {
        itemId: `item_${Date.now()}_${prev.length}`,
        category: 'TRANSPORT',
        receiptDate: new Date().toISOString().slice(0, 10),
        merchantName: '',
        invoiceNo: '',
        amount: '',
        taxAmount: '',
        mileageMeta: {
          vehicleType: 'CAR',
          origin: '',
          destination: '',
          distanceKm: 0,
          appliedRate: 0.80,
          tollAmount: 0,
          parkingAmount: 0
        },
        ocrExtracted: false,
        notes: ''
      }
    ]);
  };

  const handleRemoveItem = (index) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, idx) => idx !== index));
  };

  const updateItem = (index, field, value) => {
    setItems(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const updateMileage = (index, field, value) => {
    setItems(prev => {
      const copy = [...prev];
      const curItem = copy[index];
      const newMeta = { ...curItem.mileageMeta, [field]: value };

      // 实时计算里程小计
      const calc = calculateMileageClaim({
        vehicleType: newMeta.vehicleType,
        distanceKm: newMeta.distanceKm,
        tollAmount: newMeta.tollAmount,
        parkingAmount: newMeta.parkingAmount
      });

      newMeta.appliedRate = calc.appliedRate;
      copy[index] = {
        ...curItem,
        mileageMeta: newMeta,
        amount: calc.totalAmount > 0 ? String(calc.totalAmount) : ''
      };
      return copy;
    });
  };

  const handleRemoveReceiptAttachment = (index) => {
    setItems(prev => {
      const copy = [...prev];
      if (copy[index]) {
        copy[index] = {
          ...copy[index],
          receiptPreviewUrl: null,
          receiptFileName: '',
          ocrExtracted: false
        };
      }
      return copy;
    });
  };

  // 触发 OCR 文件选择
  const triggerOcrUpload = (itemIndex) => {
    setActiveItemIndexForOcr(itemIndex);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || activeItemIndexForOcr === null) return;

    if (file.size > 10 * 1024 * 1024) {
      showToast('文件过大，请上传 10MB 以内图片或 PDF / File exceeds 10MB limit', 'error');
      return;
    }

    // 生成本地预览
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (loadEvt) => {
        const previewUrl = loadEvt.target.result;
        setItems(prev => {
          const copy = [...prev];
          if (copy[activeItemIndexForOcr]) {
            copy[activeItemIndexForOcr] = {
              ...copy[activeItemIndexForOcr],
              receiptPreviewUrl: previewUrl,
              receiptFileName: file.name
            };
          }
          return copy;
        });
      };
      reader.readAsDataURL(file);
    } else {
      setItems(prev => {
        const copy = [...prev];
        if (copy[activeItemIndexForOcr]) {
          copy[activeItemIndexForOcr] = {
            ...copy[activeItemIndexForOcr],
            receiptPreviewUrl: null,
            receiptFileName: file.name
          };
        }
        return copy;
      });
    }

    setIsOcrLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await authFetch('/api/claims/ocr', {
        method: 'POST',
        body: formData
      });

      const resJson = await res.json().catch(() => ({}));
      if (!res.ok || !resJson || !resJson.success || !resJson.data) {
        throw new Error(resJson?.error || resJson?.detail || `HTTP ${res.status}: OCR Extraction failed`);
      }

      const ocrData = resJson.data;
      setItems(prev => {
        const copy = [...prev];
        const target = copy[activeItemIndexForOcr];
        if (!target) return prev;

        const updated = {
          ...target,
          merchantName: ocrData.merchantName || target.merchantName,
          receiptDate: ocrData.receiptDate || target.receiptDate,
          invoiceNo: ocrData.invoiceNo || target.invoiceNo,
          amount: ocrData.totalAmount ? String(ocrData.totalAmount) : target.amount,
          taxAmount: ocrData.taxAmount ? String(ocrData.taxAmount) : target.taxAmount,
          category: ocrData.category && DEFAULT_CLAIMS_CONFIG.categoryLimits[ocrData.category] ? ocrData.category : target.category,
          ocrExtracted: true,
          notes: ocrData.summary ? (target.notes ? `${target.notes} (${ocrData.summary})` : ocrData.summary) : target.notes
        };
        copy[activeItemIndexForOcr] = updated;
        return copy;
      });

      showToast(t('claims.ocrSuccess', '票据识别成功，已自动反填'), 'success');
    } catch (err) {
      console.warn('OCR error:', err);
      showToast(`OCR 识别异常: ${err.message}`, 'warning');
    } finally {
      setIsOcrLoading(false);
      setActiveItemIndexForOcr(null);
    }
  };

  // 汇总总金额
  const totalAmount = items.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const roundedTotal = roundCurrency(totalAmount);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      showToast('请填写报销单标题 / Please enter claim title', 'error');
      return;
    }

    // 校验每个 item 的必填项
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.merchantName.trim()) {
        showToast(`第 ${i + 1} 项未填写商户或路线 / Merchant/Route required for item ${i + 1}`, 'error');
        return;
      }
      if (!it.amount || Number(it.amount) <= 0) {
        showToast(`第 ${i + 1} 项金额不合法 / Valid amount required for item ${i + 1}`, 'error');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // 计算每一行的 fingerprint 与 warnings
      const finalItems = items.map(it => {
        const fp = generateReceiptFingerprint({
          invoiceNo: it.invoiceNo,
          receiptDate: it.receiptDate,
          totalAmount: it.amount,
          merchantName: it.merchantName
        });
        const warnings = detectClaimAnomalies(
          { ...it, fingerprint: fp },
          existingClaims,
          DEFAULT_CLAIMS_CONFIG
        );
        // 剥离大体积 base64 预览图以符合 Firestore 1MB 单文档存储上限
        const { receiptPreviewUrl, ...cleanItem } = it;
        return {
          ...cleanItem,
          receiptFileName: it.receiptFileName || '',
          fingerprint: fp,
          warnings
        };
      });

      await FirestoreStore.createExpenseClaim(teamId, user, {
        title: title.trim(),
        claimMonth,
        payoutChannel,
        currency: 'MYR',
        items: finalItems
      });

      showToast(t('claims.toastCreateSuccess', '报销单已成功提交'), 'success');
      onClose();
    } catch (err) {
      console.error('Submit claim error:', err);
      showToast(`提交失败: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="modal-overlay" 
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <input
        type="file"
        ref={fileInputRef}
        accept="image/jpeg,image/png,image/webp,application/pdf"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <div
        className="bezel-shell"
        style={{
          width: '100%',
          maxWidth: '840px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--card-bg, #111827)',
          border: '1px solid var(--card-border, #374151)',
          borderRadius: '12px',
          boxShadow: 'var(--shadow-xl)',
          overflow: 'hidden'
        }}
      >
        <div 
          className="bezel-core"
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            overflow: 'hidden',
            background: 'inherit'
          }}
        >
          {/* Modal Header */}
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--card-border, #374151)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-card-header, rgba(255,255,255,0.03))'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'rgba(59, 130, 246, 0.15)',
                color: 'var(--accent-blue, #3b82f6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px'
              }}>
                <i className="ph-bold ph-receipt"></i>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>
                  {t('claims.modalTitle', '提交报销与费用申请')}
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {user?.displayName || user?.email} · HQ Company Base
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost btn-sm"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '18px', color: 'var(--text-muted)' }}
            >
              <i className="ph-bold ph-x"></i>
            </button>
          </div>

          {/* Modal Body */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Top Controls: Title, Month, Payout Channel */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                    {t('claims.titleField', '报销单标题')} <span style={{ color: 'var(--accent-red, #ef4444)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t('claims.titlePlaceholder', '如：2026-10 吉隆坡客户拜访差旅报销')}
                    className="input"
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                    {t('claims.monthField', '归属月份')}
                  </label>
                  <input
                    type="month"
                    value={claimMonth}
                    onChange={(e) => setClaimMonth(e.target.value)}
                    className="input"
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: 'var(--text-secondary)' }}>
                    {t('claims.payoutChannelField', '期望放款方式')}
                  </label>
                  <select
                    value={payoutChannel}
                    onChange={(e) => setPayoutChannel(e.target.value)}
                    className="select"
                    style={{ width: '100%' }}
                  >
                    <option value="PAYROLL">{t('claims.channelPayroll', '随当月薪资发放 (Payroll)')}</option>
                    <option value="BATCH_PAYOUT">{t('claims.channelBatch', '独立批次打款 (Batch Payout)')}</option>
                  </select>
                </div>
              </div>

              {/* Items Section Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--card-border)', paddingBottom: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="ph-bold ph-cards"></i>
                  {t('claims.itemsSection', '费用明细包裹 (Line Items)')} ({items.length})
                </span>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="btn btn-sm btn-ghost"
                  style={{ border: '1px dashed var(--accent-blue)', color: 'var(--accent-blue)', gap: '4px' }}
                >
                  <i className="ph-bold ph-plus"></i>
                  {t('claims.addItemBtn', '添加费用明细')}
                </button>
              </div>

              {/* Items Cards List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {items.map((item, idx) => {
                  const fp = generateReceiptFingerprint({
                    invoiceNo: item.invoiceNo,
                    receiptDate: item.receiptDate,
                    totalAmount: item.amount,
                    merchantName: item.merchantName
                  });
                  const warnings = detectClaimAnomalies(
                    { ...item, fingerprint: fp },
                    existingClaims,
                    DEFAULT_CLAIMS_CONFIG
                  );

                  return (
                    <div
                      key={item.itemId || idx}
                      style={{
                        padding: '16px',
                        borderRadius: '10px',
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid var(--card-border, #374151)',
                        position: 'relative'
                      }}
                    >
                      {/* Item Top Bar */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: '700',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            background: 'var(--bg-badge, rgba(255,255,255,0.08))',
                            color: 'var(--text-secondary)'
                          }}>
                            #{idx + 1}
                          </span>
                          {item.ocrExtracted && (
                            <span style={{
                              fontSize: '11px',
                              fontWeight: '600',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: 'rgba(16, 185, 129, 0.15)',
                              color: 'var(--accent-emerald, #10b981)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              <i className="ph-bold ph-check"></i>
                              AI OCR
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => triggerOcrUpload(idx)}
                            disabled={isOcrLoading}
                            className="btn btn-xs btn-primary"
                            style={{ gap: '4px', fontSize: '11px', padding: '3px 8px' }}
                            title="上传发票或收据照片，AI 自动填写金额、日期与商户"
                          >
                            <i className={isOcrLoading && activeItemIndexForOcr === idx ? "ph-bold ph-spinner ph-spin" : "ph-bold ph-scan"}></i>
                            {isOcrLoading && activeItemIndexForOcr === idx ? t('claims.ocrUploading', '识别中...') : t('claims.ocrUploadBtn', '票据识别')}
                          </button>

                          {items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="btn btn-xs btn-ghost"
                              style={{ color: 'var(--accent-red, #ef4444)', border: 'none' }}
                            >
                              <i className="ph-bold ph-trash"></i>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Receipt Attached Card or Upload Dropzone */}
                      <div style={{ marginBottom: '14px' }}>
                        {item.receiptPreviewUrl || item.receiptFileName ? (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            background: 'rgba(59, 130, 246, 0.08)',
                            border: '1px solid rgba(59, 130, 246, 0.25)'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                              {item.receiptPreviewUrl ? (
                                <img
                                  src={item.receiptPreviewUrl}
                                  alt="Receipt preview"
                                  style={{
                                    width: '38px',
                                    height: '38px',
                                    objectFit: 'cover',
                                    borderRadius: '6px',
                                    border: '1px solid rgba(255, 255, 255, 0.2)',
                                    flexShrink: 0
                                  }}
                                />
                              ) : (
                                <div style={{
                                  width: '38px',
                                  height: '38px',
                                  borderRadius: '6px',
                                  background: 'rgba(255, 255, 255, 0.08)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: 'var(--text-secondary)',
                                  flexShrink: 0
                                }}>
                                  <i className="ph-bold ph-file-text" style={{ fontSize: '20px' }}></i>
                                </div>
                              )}
                              <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                  {item.receiptFileName || '已关联发票图片 / Receipt attached'}
                                </span>
                                <span style={{ fontSize: '11px', color: 'var(--accent-emerald, #10b981)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <i className="ph-bold ph-check-circle"></i>
                                  {t('claims.ocrSuccessBadge', '发票凭证已就绪 · AI 已提取字段')}
                                </span>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                              <button
                                type="button"
                                onClick={() => triggerOcrUpload(idx)}
                                className="btn btn-xs btn-ghost"
                                style={{ fontSize: '11px', color: 'var(--accent-blue)' }}
                              >
                                {t('claims.reuploadBtn', '重新上传')}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveReceiptAttachment(idx)}
                                className="btn btn-xs btn-ghost"
                                style={{ fontSize: '11px', color: 'var(--accent-red, #ef4444)' }}
                              >
                                {t('claims.removeAttachmentBtn', '移除')}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            onClick={() => triggerOcrUpload(idx)}
                            style={{
                              padding: '10px 14px',
                              borderRadius: '8px',
                              border: '1px dashed rgba(255, 255, 255, 0.18)',
                              background: 'rgba(255, 255, 255, 0.015)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <i className="ph-bold ph-receipt" style={{ color: 'var(--accent-blue)', fontSize: '16px' }}></i>
                              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                {t('claims.uploadReceiptPrompt', '📷 点击上传发票或收据照片 · AI 自动识别并反填金额商户')}
                              </span>
                            </div>
                            <span style={{ fontSize: '11px', color: 'var(--accent-blue)', fontWeight: '600' }}>
                              {t('claims.selectFileAction', '选择文件 →')}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Item Main Form Fields */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', marginBottom: '4px', color: 'var(--text-secondary)' }}>
                            {t('claims.categoryField', '费用类别')}
                          </label>
                          <select
                            value={item.category}
                            onChange={(e) => updateItem(idx, 'category', e.target.value)}
                            className="select"
                            style={{ width: '100%', fontSize: '13px' }}
                          >
                            <option value="MEAL">{t('claims.catMeal', '餐饮补贴 (Meal)')}</option>
                            <option value="TRANSPORT">{t('claims.catTransport', '交通/打车 (Transport)')}</option>
                            <option value="MILEAGE">{t('claims.catMileage', '自驾里程补贴 (Mileage)')}</option>
                            <option value="ACCOMMODATION">{t('claims.catAccommodation', '差旅住宿 (Hotel)')}</option>
                            <option value="OFFICE">{t('claims.catOffice', '办公用品 (Office)')}</option>
                            <option value="ENTERTAINMENT">{t('claims.catEntertainment', '商务招待 (Entertainment)')}</option>
                            <option value="OTHER">{t('claims.catOther', '其他杂项 (Other)')}</option>
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', marginBottom: '4px', color: 'var(--text-secondary)' }}>
                            {t('claims.receiptDateField', '开票/发生日期')}
                          </label>
                          <input
                            type="date"
                            value={item.receiptDate}
                            onChange={(e) => updateItem(idx, 'receiptDate', e.target.value)}
                            className="input"
                            style={{ width: '100%', fontSize: '13px' }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', marginBottom: '4px', color: 'var(--text-secondary)' }}>
                            {t('claims.merchantField', '商户名称 / 路线')} <span style={{ color: 'var(--accent-red)' }}>*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={item.merchantName}
                            onChange={(e) => updateItem(idx, 'merchantName', e.target.value)}
                            placeholder={t('claims.merchantPlaceholder', '如：Shell 或 新山->吉隆坡')}
                            className="input"
                            style={{ width: '100%', fontSize: '13px' }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', marginBottom: '4px', color: 'var(--text-secondary)' }}>
                            {t('claims.invoiceNoField', '发票号 / 收据号')}
                          </label>
                          <input
                            type="text"
                            value={item.invoiceNo}
                            onChange={(e) => updateItem(idx, 'invoiceNo', e.target.value)}
                            placeholder={t('claims.invoiceNoExample', '如：INV-98231')}
                            className="input"
                            style={{ width: '100%', fontSize: '13px' }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', marginBottom: '4px', color: 'var(--text-secondary)' }}>
                            {t('claims.amountField', '报销金额 (MYR)')} <span style={{ color: 'var(--accent-red)' }}>*</span>
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            required
                            value={item.amount}
                            onChange={(e) => updateItem(idx, 'amount', e.target.value)}
                            placeholder="0.00"
                            className="input"
                            style={{ width: '100%', fontSize: '13px', fontWeight: '700' }}
                          />
                        </div>
                      </div>

                      {/* Mileage Claim Calculator Sub-Form */}
                      {item.category === 'MILEAGE' && (
                        <div style={{
                          marginTop: '12px',
                          padding: '12px',
                          borderRadius: '8px',
                          background: 'rgba(59, 130, 246, 0.05)',
                          border: '1px dashed rgba(59, 130, 246, 0.3)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '700', color: 'var(--accent-blue)' }}>
                            <i className="ph-bold ph-car-profile"></i>
                            <span>{t('claims.mileageCalculated', '里程补贴计算器')}</span>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                                {t('claims.mileageVehicleField', '出行车型')}
                              </label>
                              <select
                                value={item.mileageMeta?.vehicleType || 'CAR'}
                                onChange={(e) => updateMileage(idx, 'vehicleType', e.target.value)}
                                className="select"
                                style={{ width: '100%', fontSize: '12px' }}
                              >
                                <option value="CAR">{t('claims.vehicleCar', '轿车 (RM 0.80/km)')}</option>
                                <option value="MOTORCYCLE">{t('claims.vehicleMotorcycle', '摩托车 (RM 0.40/km)')}</option>
                              </select>
                            </div>

                            <div>
                              <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                                {t('claims.mileageDistance', '行驶里程 (KM)')}
                              </label>
                              <input
                                type="number"
                                step="1"
                                min="0"
                                value={item.mileageMeta?.distanceKm || ''}
                                onChange={(e) => updateMileage(idx, 'distanceKm', e.target.value)}
                                placeholder="0"
                                className="input"
                                style={{ width: '100%', fontSize: '12px' }}
                              />
                            </div>

                            <div>
                              <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                                {t('claims.mileageToll', '过路费 (Toll)')}
                              </label>
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                value={item.mileageMeta?.tollAmount || ''}
                                onChange={(e) => updateMileage(idx, 'tollAmount', e.target.value)}
                                placeholder="0.00"
                                className="input"
                                style={{ width: '100%', fontSize: '12px' }}
                              />
                            </div>

                            <div>
                              <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                                {t('claims.mileageParking', '停车费 (Parking)')}
                              </label>
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                value={item.mileageMeta?.parkingAmount || ''}
                                onChange={(e) => updateMileage(idx, 'parkingAmount', e.target.value)}
                                placeholder="0.00"
                                className="input"
                                style={{ width: '100%', fontSize: '12px' }}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Notes / Justification Field */}
                      <div style={{ marginTop: '10px' }}>
                        <input
                          type="text"
                          value={item.notes || ''}
                          onChange={(e) => updateItem(idx, 'notes', e.target.value)}
                          placeholder={t('claims.notesField', '备注说明 / 超额特批原因...')}
                          className="input"
                          style={{ width: '100%', fontSize: '12px' }}
                        />
                      </div>

                      {/* Warnings Alert Banner */}
                      {warnings.length > 0 && (
                        <div style={{
                          marginTop: '10px',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          background: 'rgba(245, 158, 11, 0.1)',
                          border: '1px solid rgba(245, 158, 11, 0.3)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                          fontSize: '11px',
                          color: 'var(--accent-amber, #f59e0b)'
                        }}>
                          {warnings.includes('DUPLICATE_SUSPECTED') && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <i className="ph-bold ph-warning"></i>
                              <span>{t('claims.warningDuplicate', '疑似重复报销 (与历史票据高度吻合)')}</span>
                            </div>
                          )}
                          {warnings.includes('OVER_LIMIT') && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <i className="ph-bold ph-shield-warning"></i>
                              <span>{t('claims.warningOverLimit', '超出类别单笔限额标准')}</span>
                            </div>
                          )}
                          {warnings.includes('EXPIRED_RECEIPT') && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <i className="ph-bold ph-calendar-x"></i>
                              <span>{t('claims.warningExpired', '票据开具距今超过 60 天')}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '16px 20px',
              borderTop: '1px solid var(--card-border, #374151)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--bg-card-header, rgba(255,255,255,0.03))'
            }}>
              <div>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {t('claims.totalSummary', '报销总计金额')}:
                </span>
                <span style={{ marginLeft: '8px', fontSize: '18px', fontWeight: '800', color: 'var(--accent-emerald, #10b981)' }}>
                  MYR {roundedTotal.toFixed(2)}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-ghost"
                  disabled={isSubmitting}
                >
                  {t('claims.cancelBtn', '取消')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn btn-primary"
                  style={{ gap: '6px' }}
                >
                  {isSubmitting ? (
                    <i className="ph-bold ph-spinner ph-spin"></i>
                  ) : (
                    <i className="ph-bold ph-check"></i>
                  )}
                  {t('claims.submitClaimBtn', '确认提交报销单')}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
