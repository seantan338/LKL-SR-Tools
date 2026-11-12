/**
 * Theme preference for TALENT FLOW.
 *
 * No stored choice follows prefers-color-scheme (light or dark).
 * A stored choice — light, dark, gemini, or tactical — always wins.
 * Gemini and Tactical stay in the cycle; they are optional themes, not the default.
 */

export const THEME_STORAGE_KEY = 'talent_flow_theme';
export const THEMES = ['light', 'dark', 'gemini', 'tactical'];
/** Existing cycle order, preserved so the header / sidebar / settings controls stay familiar. */
export const THEME_CYCLE = ['dark', 'gemini', 'tactical', 'light'];

export function readStoredTheme() {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return THEMES.includes(stored) ? stored : null;
  } catch (e) {
    return null;
  }
}

export function systemColorScheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function activeTheme() {
  if (typeof document === 'undefined') return 'light';
  const attr = document.documentElement.getAttribute('data-theme');
  if (THEMES.includes(attr)) return attr;
  return readStoredTheme() || systemColorScheme();
}

export function applyTheme(theme, { persist = true } = {}) {
  const next = THEMES.includes(theme) ? theme : systemColorScheme();
  const root = document.documentElement;
  root.setAttribute('data-theme', next);
  if (persist) {
    root.removeAttribute('data-theme-source');
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch (e) {}
  } else {
    root.setAttribute('data-theme-source', 'system');
  }
  window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: next, source: persist ? 'manual' : 'system' } }));
  return next;
}

export function cycleTheme(current) {
  const idx = THEME_CYCLE.indexOf(current);
  const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
  return applyTheme(next, { persist: true });
}
