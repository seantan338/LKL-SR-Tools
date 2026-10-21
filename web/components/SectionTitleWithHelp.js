'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useI18n } from '../lib/i18n-context';

export default function SectionTitleWithHelp({ 
  title, 
  helpText, 
  docUrl, 
  docLabel, 
  summaryTitle, 
  style = {}, 
  titleStyle = {} 
}) {
  const [isOpen, setIsOpen] = useState(false);
  const popupRef = useRef(null);
  const iconRef = useRef(null);
  const { t } = useI18n();

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        popupRef.current && !popupRef.current.contains(event.target) &&
        iconRef.current && !iconRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Handle rich text array or string with newlines
  const renderHelpText = () => {
    if (Array.isArray(helpText)) {
      return (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {helpText.map((item, idx) => {
            const hasSeparator = item.includes(':') || item.includes('：');
            if (hasSeparator) {
              const prefix = item.split(/[:：]/)[0];
              const suffix = item.substring(prefix.length + 1).trim();
              return (
                <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.82rem', lineHeight: '1.5' }}>
                  <div style={{
                    width: '5px',
                    height: '5px',
                    borderRadius: '50%',
                    background: 'var(--accent-blue)',
                    marginTop: '7px',
                    flexShrink: 0
                  }} />
                  <div style={{ color: 'var(--text-secondary)', flex: 1 }}>
                    <strong style={{ color: 'var(--text-primary)', fontWeight: '600' }}>
                      {prefix}：
                    </strong>
                    {suffix}
                  </div>
                </li>
              );
            }
            return (
              <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.82rem', lineHeight: '1.5' }}>
                <div style={{
                  width: '5px',
                  height: '5px',
                  borderRadius: '50%',
                  background: 'var(--accent-blue)',
                  marginTop: '7px',
                  flexShrink: 0
                }} />
                <div style={{ color: 'var(--text-secondary)', flex: 1 }}>
                  {item}
                </div>
              </li>
            );
          })}
        </ul>
      );
    }
    if (typeof helpText === 'string') {
      return helpText.split(/\\n|\n/).map((line, i) => (
        <p key={i} style={{ margin: '4px 0', fontSize: '0.82rem', lineHeight: '1.5', color: 'var(--text-secondary)' }}>
          {line}
        </p>
      ));
    }
    return helpText;
  };

  return (
    <div className="section-title-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative', minWidth: 0, ...style }}>
      <h3 className="section-title-heading" style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.25rem', fontWeight: 600, minWidth: 0, ...titleStyle }}>
        {title}
      </h3>
      
      <button 
        ref={iconRef}
        type="button"
        className="section-help-icon-btn"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: isOpen ? 'var(--accent-blue, #3b82f6)' : 'none',
          border: 'none',
          padding: '4px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: isOpen ? '#fff' : 'var(--text-muted)',
          transition: 'all 0.2s ease',
          outline: 'none',
          borderRadius: '50%',
          boxShadow: isOpen ? '0 0 0 2px rgba(59, 130, 246, 0.3)' : 'none'
        }}
        onMouseOver={(e) => {
          if (!isOpen) e.currentTarget.style.color = 'var(--accent-blue, #3b82f6)';
        }}
        onMouseOut={(e) => {
          if (!isOpen) e.currentTarget.style.color = 'var(--text-muted)';
        }}
        title={t('common.helpInfoTooltip', '功能说明与使用教程')}
      >
        <i className="ph ph-info" style={{ fontSize: '1.1rem' }}></i>
      </button>

      {isOpen && (
        <div 
          ref={popupRef}
          style={{
            position: 'absolute',
            top: '100%',
            left: '0', 
            marginTop: '12px',
            background: 'var(--dropdown-bg, var(--card-bg, #1a1d24))',
            border: '1px solid var(--border-hairline)',
            boxShadow: 'var(--shadow-popup, 0 14px 36px rgba(0, 0, 0, 0.35))',
            padding: '16px 18px',
            borderRadius: '12px',
            width: 'max-content',
            maxWidth: '390px',
            minWidth: '280px',
            zIndex: 1000,
            animation: 'fadeIn 0.2s ease',
            backdropFilter: 'blur(16px)'
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '10px',
            paddingBottom: '8px',
            borderBottom: '1px solid var(--border-subtle)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-blue)' }}>
              <i className="ph-bold ph-book-open" style={{ fontSize: '1.1rem' }}></i>
              <span style={{ fontWeight: '700', fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                {summaryTitle || t('common.quickGuide', '功能速览与指引')}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                padding: '2px 4px',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '0.95rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                transition: 'color 0.15s ease'
              }}
              onMouseOver={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseOut={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
              title={t('common.close', '关闭')}
            >
              <i className="ph-bold ph-x"></i>
            </button>
          </div>

          {/* Quick Guidance Content */}
          <div style={{ padding: '2px 0 4px 0' }}>
            {renderHelpText()}
          </div>

          {/* External Full Documentation Link */}
          {docUrl && (
            <div style={{
              marginTop: '12px',
              paddingTop: '10px',
              borderTop: '1px solid var(--border-subtle)'
            }}>
              <a
                href={docUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md, 8px)',
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  color: 'var(--accent-blue)',
                  textDecoration: 'none',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(59, 130, 246, 0.18)';
                  e.currentTarget.style.borderColor = 'var(--accent-blue)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(59, 130, 246, 0.08)';
                  e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.25)';
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="ph-bold ph-compass"></i>
                  <span>{docLabel || t('common.viewFullDocs', '查看完整操作手册与教程')}</span>
                </span>
                <i className="ph-bold ph-arrow-square-out" style={{ fontSize: '0.95rem' }}></i>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
