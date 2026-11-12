'use client';

import { useEffect, useState } from 'react';
import { activeTheme, cycleTheme } from '../lib/theme-preference';
import { useI18n } from '../lib/i18n-context';

export function useThemePreference() {
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    setTheme(activeTheme());
    const onThemeChange = (event) => {
      setTheme(event?.detail?.theme || activeTheme());
    };
    window.addEventListener('themechange', onThemeChange);
    return () => window.removeEventListener('themechange', onThemeChange);
  }, []);

  const toggleTheme = () => setTheme(cycleTheme(theme));
  return { theme, toggleTheme };
}

function themeTitleKey(theme) {
  if (theme === 'gemini') return 'extraUi.themeTitleGemini';
  if (theme === 'tactical') return 'extraUi.themeTitleTactical';
  if (theme === 'light') return 'extraUi.themeTitleLight';
  return 'extraUi.themeTitleDark';
}

export function ThemeGlyph({ theme }) {
  if (theme === 'gemini') return <i className="ph-fill ph-sparkle" style={{ color: 'var(--accent-purple)' }}></i>;
  if (theme === 'tactical') return <i className="ph-bold ph-crosshair" style={{ color: 'var(--color-success)' }}></i>;
  if (theme === 'light') return <i className="ph-light ph-sun" style={{ color: 'var(--color-warning)' }}></i>;
  return <i className="ph-light ph-moon"></i>;
}

export function ThemeToggle({ variant = 'icon', className = '', style }) {
  const { theme, toggleTheme } = useThemePreference();
  const { t } = useI18n();
  const title = t(themeTitleKey(theme), t('extraUi.switchTheme', '切换主题'));
  const label = theme === 'gemini'
    ? t('extraUi.themeGemini', '宇宙')
    : theme === 'tactical'
      ? t('extraUi.themeTactical', '战术')
      : theme === 'light'
        ? t('extraUi.themeLight', '浅色')
        : t('extraUi.themeDark', '深色');

  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={toggleTheme}
      title={title}
      aria-label={t('extraUi.switchTheme', '切换主题')}
    >
      <ThemeGlyph theme={theme} />
      {variant === 'labeled' ? <span>{label}</span> : null}
    </button>
  );
}

export function LanguageToggle({ variant = 'icon', className = '', style }) {
  const { lang, toggleLang, t } = useI18n();
  const title = lang === 'zh' ? 'Switch to English' : '切换为中文';
  const aria = t('header.switchLang', lang === 'zh' ? '切换为英文' : 'Switch to Chinese');
  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={toggleLang}
      title={title}
      aria-label={aria}
    >
      {variant === 'labeled' ? (
        <>
          <i className="ph-light ph-translate"></i>
          <span>{lang === 'zh' ? 'EN / 英文' : '中 / 中文'}</span>
        </>
      ) : (
        <>
          <span className="lang-code">{lang === 'zh' ? 'EN' : '中'}</span>
          <i className="ph-light ph-translate"></i>
        </>
      )}
    </button>
  );
}
