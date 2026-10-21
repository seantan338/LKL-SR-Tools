'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from './i18n-context';

const FeedbackContext = createContext(null);

export function FeedbackProvider({ children }) {
  const { t } = useI18n();
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const [confirmState, setConfirmState] = useState(null);
  const [promptState, setPromptState] = useState(null);

  const showToast = useCallback((message, tone = 'info') => {
    if (!message) return;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message: String(message), tone });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const confirm = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      setConfirmState({
        title: options.title || t('common.confirm', '请确认'),
        message: String(message || ''),
        confirmLabel: options.confirmLabel || t('common.confirm', '确认'),
        cancelLabel: options.cancelLabel || t('common.cancel', '取消'),
        danger: Boolean(options.danger),
        resolve,
      });
    });
  }, [t]);

  const prompt = useCallback((message, defaultValue = '', options = {}) => {
    return new Promise((resolve) => {
      setPromptState({
        title: options.title || t('common.prompt', '请输入'),
        message: String(message || ''),
        value: String(defaultValue || ''),
        confirmLabel: options.confirmLabel || t('common.confirm', '确定'),
        cancelLabel: options.cancelLabel || t('common.cancel', '取消'),
        resolve,
      });
    });
  }, [t]);

  const value = useMemo(
    () => ({ showToast, confirm, prompt }),
    [showToast, confirm, prompt]
  );

  const toastColor = toast?.tone === 'error'
    ? 'var(--accent-rose)'
    : toast?.tone === 'success'
      ? 'var(--accent-emerald)'
      : 'var(--accent-blue)';

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined' && toast && createPortal(
        <div style={{
          position: 'fixed', top: '24px', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-elevated)', color: 'var(--text-primary)',
          padding: '10px 20px', borderRadius: 'var(--radius-md)',
          border: `1px solid ${toastColor}`,
          zIndex: 10050,
          display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem',
          maxWidth: 'min(520px, 90vw)'
        }}>
          <i className="ph-fill ph-info" style={{ color: toastColor, fontSize: '1.2rem' }}></i>
          <span>{toast.message}</span>
        </div>,
        document.body
      )}
      {typeof document !== 'undefined' && confirmState && createPortal(
        <div className="modal-overlay active" style={{ zIndex: 10040 }} onClick={() => {
          confirmState.resolve(false);
          setConfirmState(null);
        }}>
          <div className="modal-bezel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className="bezel-shell">
              <div className="bezel-core" style={{ padding: 'var(--space-5)' }}>
                <h3 style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--text-md)' }}>{confirmState.title}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', lineHeight: 1.5, marginBottom: 'var(--space-5)' }}>
                  {confirmState.message}
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
                  <button className="btn btn-secondary" onClick={() => { confirmState.resolve(false); setConfirmState(null); }}>
                    {confirmState.cancelLabel || t('common.cancel', '取消')}
                  </button>
                  <button
                    className="btn btn-primary"
                    style={confirmState.danger ? { background: 'var(--accent-rose)', borderColor: 'var(--accent-rose)' } : undefined}
                    onClick={() => { confirmState.resolve(true); setConfirmState(null); }}
                  >
                    {confirmState.confirmLabel || t('common.confirm', '确认')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
      {typeof document !== 'undefined' && promptState && createPortal(
        <PromptDialog
          state={promptState}
          onClose={(value) => {
            promptState.resolve(value);
            setPromptState(null);
          }}
        />,
        document.body
      )}
    </FeedbackContext.Provider>
  );
}

function PromptDialog({ state, onClose }) {
  const { t } = useI18n();
  const [value, setValue] = useState(state.value || '');
  return (
    <div className="modal-overlay active" style={{ zIndex: 10040 }} onClick={() => onClose(null)}>
      <div className="modal-bezel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
        <div className="bezel-shell">
          <div className="bezel-core" style={{ padding: 'var(--space-5)' }}>
            <h3 style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--text-md)' }}>{state.title || t('common.prompt', '请输入')}</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>{state.message}</p>
            <input
              className="form-input"
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onClose(value);
                if (e.key === 'Escape') onClose(null);
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
              <button className="btn btn-secondary" onClick={() => onClose(null)}>
                {state.cancelLabel || t('common.cancel', '取消')}
              </button>
              <button className="btn btn-primary" onClick={() => onClose(value)}>
                {state.confirmLabel || t('common.confirm', '确定')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error('useFeedback must be used within a FeedbackProvider');
  }
  return context;
}
