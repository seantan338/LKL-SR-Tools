'use client';

import { useEffect } from 'react';
import { applyTheme, readStoredTheme, systemColorScheme } from '../lib/theme-preference';

/** Keeps an unset preference following the OS. A stored theme is left alone. */
export default function ThemeSync() {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      if (readStoredTheme()) return;
      applyTheme(systemColorScheme(), { persist: false });
    };
    sync();
    mq.addEventListener?.('change', sync);
    return () => mq.removeEventListener?.('change', sync);
  }, []);

  return null;
}
