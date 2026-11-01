import { useEffect, useState } from 'react';

/**
 * Read-only observer of the app's EXISTING theme — it never sets or stores a theme itself.
 * Used only to pick which hero video (dark UI / light UI) to show.
 *
 * Detection order, so it works with whichever mechanism ThemeToggle uses:
 *   1. data-theme / data-color-mode / data-bs-theme attribute on <html>
 *   2. "dark" / "light" class on <html>
 *   3. the painted background luminance of <body> (or <html>)
 *   4. prefers-color-scheme
 */
function luminanceOf(color) {
  const m = color.match(/[\d.]+/g);
  if (!m || m.length < 3) return null;
  if (m.length >= 4 && Number(m[3]) === 0) return null; // transparent
  const [r, g, b] = m.slice(0, 3).map(Number);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function detect() {
  if (typeof document === 'undefined') return 'dark';
  const root = document.documentElement;
  const attr =
    root.getAttribute('data-theme') || root.getAttribute('data-color-mode') || root.getAttribute('data-bs-theme');
  if (attr === 'dark' || attr === 'light') return attr;
  if (root.classList.contains('dark')) return 'dark';
  if (root.classList.contains('light')) return 'light';

  for (const el of [document.body, root]) {
    const lum = luminanceOf(getComputedStyle(el).backgroundColor);
    if (lum !== null) return lum < 0.5 ? 'dark' : 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function useThemeMode() {
  const [mode, setMode] = useState(detect);

  useEffect(() => {
    const update = () => setMode(detect());
    update();
    const mo = new MutationObserver(update);
    const opts = { attributes: true, attributeFilter: ['class', 'data-theme', 'data-color-mode', 'data-bs-theme', 'style'] };
    mo.observe(document.documentElement, opts);
    mo.observe(document.body, opts);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', update);
    return () => {
      mo.disconnect();
      mq.removeEventListener('change', update);
    };
  }, []);

  return mode;
}
