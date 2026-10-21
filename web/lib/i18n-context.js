'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { zh, en } from './i18n';

const dictionaries = { zh, en };

const I18nContext = createContext({
  lang: 'zh',
  setLang: () => {},
  toggleLang: () => {},
  t: (key, fallback) => key,
});

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState('zh');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('talent_flow_lang');
      if (stored === 'en' || stored === 'zh') {
        setLangState(stored);
      }
    } catch (e) {}

    const onLangChange = (evt) => {
      if (evt?.detail?.lang) {
        setLangState(evt.detail.lang);
      }
    };
    window.addEventListener('langchange', onLangChange);
    return () => window.removeEventListener('langchange', onLangChange);
  }, []);

  const setLang = useCallback((newLang) => {
    if (newLang !== 'zh' && newLang !== 'en') return;
    setLangState(newLang);
    try {
      localStorage.setItem('talent_flow_lang', newLang);
    } catch (e) {}
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('langchange', { detail: { lang: newLang } }));
    }
  }, []);

  const toggleLang = useCallback(() => {
    const nextLang = lang === 'zh' ? 'en' : 'zh';
    setLang(nextLang);
  }, [lang, setLang]);

  const t = useCallback((path, paramsOrFallback = '', defaultFallback = '') => {
    let params = null;
    let fallback = '';
    if (paramsOrFallback && typeof paramsOrFallback === 'object' && !Array.isArray(paramsOrFallback)) {
      params = paramsOrFallback;
      fallback = defaultFallback;
    } else if (typeof paramsOrFallback === 'string') {
      fallback = paramsOrFallback;
    }

    const dict = dictionaries[lang] || dictionaries.zh;
    const parts = path.split('.');
    let cur = dict;
    for (const p of parts) {
      if (cur && typeof cur === 'object' && p in cur) {
        cur = cur[p];
      } else {
        cur = null;
        break;
      }
    }

    // Fallback to zh if en is missing key
    if ((cur === null || cur === undefined) && lang !== 'zh') {
      let zhCur = dictionaries.zh;
      for (const p of parts) {
        if (zhCur && typeof zhCur === 'object' && p in zhCur) {
          zhCur = zhCur[p];
        } else {
          zhCur = null;
          break;
        }
      }
      if (zhCur !== null && zhCur !== undefined) cur = zhCur;
    }

    let result = cur !== null && cur !== undefined ? cur : (fallback || path);

    if (typeof result === 'string' && params) {
      Object.keys(params).forEach(k => {
        result = result.replace(new RegExp(`\\{${k}\\}`, 'g'), params[k]);
      });
    }

    return result;
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, toggleLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
