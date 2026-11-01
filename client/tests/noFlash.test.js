import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const html = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const run = ({ stored, os, throws }) => {
  localStorage.clear(); document.documentElement.removeAttribute('data-theme');
  if (stored) localStorage.setItem('intellmeet-theme', stored);
  window.matchMedia = () => { if (throws) throw new Error('blocked'); return { matches: os === 'light' }; };
  new Function(script)();
  return document.documentElement.getAttribute('data-theme');
};

describe('no-flash theme script (index.html)', () => {
  beforeEach(() => localStorage.clear());
  it('runs inline in <head> before the module bundle', () => {
    expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('type="module"'));
    expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('</head>'));
  });
  it('a choice saved in Settings wins', () => { expect(run({ stored: 'light', os: 'dark' })).toBe('light'); expect(run({ stored: 'dark', os: 'light' })).toBe('dark'); });
  it('night is the initial theme even when the OS prefers light (the OS preference is not consulted)', () => {
    expect(run({ os: 'light' })).toBe('dark'); expect(run({ os: 'dark' })).toBe('dark');
    window.matchMedia = () => { throw new Error('must not be called'); }; localStorage.clear(); new Function(script)();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
  it('ignores junk values and falls back to dark when storage fails', () => {
    expect(run({ stored: 'purple', os: 'light' })).toBe('dark');
    const orig = Storage.prototype.getItem; Storage.prototype.getItem = () => { throw new Error('blocked'); };
    try { document.documentElement.removeAttribute('data-theme'); new Function(script)(); expect(document.documentElement.getAttribute('data-theme')).toBe('dark'); } finally { Storage.prototype.getItem = orig; }
  });
  it('static default is already dark, so the pre-script paint is black', () => { expect(html).toMatch(/<html[^>]*data-theme="dark"/); });
});
