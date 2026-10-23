import React from 'react';
import { getWhatsAppUrl, normalizeToWhatsApp } from '../lib/whatsapp';
import { useI18n } from '../lib/i18n-context';

export default function WhatsAppButton({ 
  phone, 
  candidateName = '', 
  variant = 'icon', // 'icon' | 'text' | 'button'
  style = {},
  className = ''
}) {
  const { t } = useI18n();
  const url = getWhatsAppUrl(phone, { name: candidateName });
  const isValid = !!normalizeToWhatsApp(phone);

  const handleClick = (e) => {
    e.stopPropagation(); // 阻止事件冒泡到父元素（如列表行点击）
    if (!isValid) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (!phone && variant !== 'button') return null;

  if (variant === 'text') {
    return (
      <span 
        onClick={handleClick}
        title={isValid ? t('extraUi.whatsappStartChat', '在 WhatsApp 中发起对话') : t('extraUi.whatsappInvalidPhone', '无效的电话号码')}
        style={{ 
          cursor: isValid ? 'pointer' : 'not-allowed', 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: '4px',
          color: isValid ? 'inherit' : 'var(--text-faint)',
          transition: 'all 0.2s ease',
          ...style 
        }}
        className={className}
        onMouseEnter={(e) => {
          if (isValid) {
            e.currentTarget.style.color = '#25D366';
          }
        }}
        onMouseLeave={(e) => {
          if (isValid) {
            e.currentTarget.style.color = 'inherit';
          }
        }}
      >
        {phone}
        {isValid && <i className="ph ph-whatsapp-logo" style={{ color: '#25D366' }}></i>}
      </span>
    );
  }

  if (variant === 'button') {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={!isValid}
        className={`btn ${isValid ? '' : 'btn-disabled'} ${className}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          background: isValid ? '#25D366' : 'var(--bg-tertiary)',
          color: isValid ? '#fff' : 'var(--text-muted)',
          border: 'none',
          padding: '6px 12px',
          borderRadius: '6px',
          fontSize: '0.875rem',
          fontWeight: '500',
          cursor: isValid ? 'pointer' : 'not-allowed',
          ...style
        }}
      >
        <i className="ph ph-whatsapp-logo" style={{ fontSize: '1rem' }}></i>
        {t('extraUi.whatsappContact', 'WhatsApp 联系')}
      </button>
    );
  }

  // Default: 'icon'
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!isValid}
      title={isValid ? t('extraUi.whatsappStartChat', '在 WhatsApp 中发起对话') : t('extraUi.whatsappInvalidPhone', '无效的电话号码')}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: 'none',
        padding: '4px',
        borderRadius: '50%',
        color: isValid ? '#25D366' : 'var(--text-faint)',
        cursor: isValid ? 'pointer' : 'not-allowed',
        transition: 'transform 0.2s ease, filter 0.2s ease',
        ...style
      }}
      onMouseEnter={(e) => {
        if (isValid) {
          e.currentTarget.style.transform = 'scale(1.15)';
          e.currentTarget.style.filter = 'brightness(1.1)';
        }
      }}
      onMouseLeave={(e) => {
        if (isValid) {
          e.currentTarget.style.transform = 'scale(1)';
          e.currentTarget.style.filter = 'none';
        }
      }}
    >
      <i className="ph ph-whatsapp-logo" style={{ fontSize: '1.25rem' }}></i>
    </button>
  );
}
