import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type DynamicTextScale = 'standard' | 'large' | 'xlarge';

interface ThemeContextValue {
  themeMode: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  textScale: DynamicTextScale;
  setTextScale: (scale: DynamicTextScale) => void;
}

const THEME_STORAGE_KEY = 'propledger_theme_mode_v1';
const TEXT_SCALE_STORAGE_KEY = 'propledger_text_scale_v1';

const TEXT_SCALE_PERCENT: Record<DynamicTextScale, string> = {
  standard: '100%',
  large: '112.5%',
  xlarge: '125%',
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        return saved;
      }
    } catch {
      // Ignore storage errors in sandboxed iframes
    }
    return 'light';
  });

  const [textScale, setTextScaleState] = useState<DynamicTextScale>(() => {
    try {
      const saved = localStorage.getItem(TEXT_SCALE_STORAGE_KEY);
      if (saved === 'standard' || saved === 'large' || saved === 'xlarge') {
        return saved;
      }
    } catch {
      // Ignore storage errors
    }
    return 'standard';
  });

  const [systemDark, setSystemDark] = useState<boolean>(() => getSystemPrefersDark());

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    setSystemDark(mq.matches);
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  const resolvedTheme: 'light' | 'dark' =
    themeMode === 'system' ? (systemDark ? 'dark' : 'light') : themeMode;

  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }
  }, [resolvedTheme]);

  useEffect(() => {
    document.documentElement.style.fontSize = TEXT_SCALE_PERCENT[textScale];
  }, [textScale]);

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // Ignore storage errors
    }
  };

  const setTextScale = (scale: DynamicTextScale) => {
    setTextScaleState(scale);
    try {
      localStorage.setItem(TEXT_SCALE_STORAGE_KEY, scale);
    } catch {
      // Ignore storage errors
    }
  };

  const toggleTheme = () => {
    setThemeMode(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeMode,
      resolvedTheme,
      setThemeMode,
      toggleTheme,
      textScale,
      setTextScale,
    }),
    [themeMode, resolvedTheme, textScale]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }
  return ctx;
}
