import { useState } from 'react';

export type Theme = 'dark' | 'light';
export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem('lichess-bot-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* Storage can be disabled by the browser. */
  }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#14201c' : '#f4f6f2');
}
export function useTheme() {
  const [theme, setTheme] = useState(readTheme);
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
    try {
      localStorage.setItem('lichess-bot-theme', next);
    } catch {
      /* The theme still works without persistent storage. */
    }
  };
  return { theme, toggleTheme };
}
