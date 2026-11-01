import { createContext, useCallback, useEffect, useMemo, useState } from 'react';

export const THEME_KEY = 'intellmeet-theme';
export const ThemeContext = createContext({ theme: 'dark', setTheme: () => {} });
const current = () => document.documentElement.getAttribute('data-theme') || 'dark';   // already set by the no-flash script

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(current);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#000000' : '#FFFFFF');
  }, [theme]);

  const setTheme = useCallback((t) => {
    setThemeState(t);
    try { localStorage.setItem(THEME_KEY, t); } catch { /* storage blocked */ }
  }, []);
  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
