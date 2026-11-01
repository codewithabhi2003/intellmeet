import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p) => fs.readFileSync(path.resolve(process.cwd(), 'tests', p), 'utf8');
const tokens = read('../src/styles/tokens.css');
const block = (name) => Object.fromEntries([...tokens.match(new RegExp(`data-theme="${name}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`))[1].matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const dark = block('dark'), light = block('light');
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe('true-black night theme', () => {
  it('body background is exactly #000000', () => {
    expect(dark['bg-base']).toBe('#000000');
    expect(read('../src/index.css')).toMatch(/body\{[^}]*background:var\(--bg-base\)/);
  });
  it('every night surface is a neutral grey (no navy / slate / blue tint)', () => {
    for (const k of ['bg-base', 'bg-surface', 'bg-card', 'bg-input', 'bg-elevated']) {
      const h = dark[k]; expect(h[1] === h[3] && h[3] === h[5] && h[2] === h[4] && h[4] === h[6], `${k}=${h}`).toBe(true);
    }
  });
  it('components never use dark: prefixes (colors come from CSS variables)', () => {
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    const offenders = walk(path.resolve(process.cwd(), 'src')).filter((f) => /\.(jsx?|css)$/.test(f) && /(^|[\s"'`])dark:[a-zA-Z[!-]/.test(fs.readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});

describe('WCAG AA (>= 4.5:1) for text tokens on every surface', () => {
  const surfaces = (t) => ['bg-base', 'bg-surface', 'bg-card', 'bg-input', 'bg-elevated'].map((k) => t[k]);
  for (const [name, t] of [['dark', dark], ['light', light]]) {
    for (const fg of ['text-primary', 'text-secondary', 'text-muted', 'accent-text', 'cyan-text', 'green-text', 'yellow-text', 'red-text']) {
      it(`${name}: ${fg}`, () => { for (const bg of surfaces(t)) expect(ratio(t[fg], bg), `${fg} ${t[fg]} on ${bg}`).toBeGreaterThanOrEqual(4.5); });
    }
    it(`${name}: button text on button background`, () => { expect(ratio(t['on-accent'], t['btn-bg'])).toBeGreaterThanOrEqual(4.5); expect(ratio(t['on-accent'], t['btn-bg-hover'])).toBeGreaterThanOrEqual(4.5); });
  }
});

describe('responsive + motion rules', () => {
  const bento = read('../src/styles/bento.css'), motion = read('../src/styles/motion.css');
  it('bento collapses at 1024px (2 columns) and 640px (1 column)', () => {
    expect(bento).toMatch(/max-width:1024px\)\{\.bento\{grid-template-columns:repeat\(2/);
    expect(bento).toMatch(/max-width:640px\)\{\.bento\{grid-template-columns:1fr/);
  });
  it('honors prefers-reduced-motion globally', () => { expect(motion).toMatch(/prefers-reduced-motion: reduce/); expect(motion).toMatch(/animation-duration:\.01ms !important/); });
  it('animations only touch transform/opacity', () => { expect(motion).not.toMatch(/@keyframes[^}]*\b(width|height|top|left)\s*:/); });
  it('Devanagari fallback is in the base font stack', () => { expect(read('../src/index.css')).toMatch(/'Inter','Noto Sans Devanagari'/); });
});
