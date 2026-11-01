// Static security checks over the client source (and the production bundle when it has been built).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const walk = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : []);
const SRC = walk(path.resolve(process.cwd(), 'src')).filter((f) => /\.(jsx?|css)$/.test(f));
const text = (f) => fs.readFileSync(f, 'utf8');
const offenders = (re, files = SRC) => files.filter((f) => re.test(text(f))).map((f) => path.relative(process.cwd(), f));

describe('client source', () => {
  it('has files to scan', () => { expect(SRC.length).toBeGreaterThan(50); });
  it('never renders HTML from data (XSS sinks): no dangerouslySetInnerHTML / innerHTML / document.write', () => {
    expect(offenders(/dangerouslySetInnerHTML|\.innerHTML|outerHTML|insertAdjacentHTML|document\.write/)).toEqual([]);
  });
  it('never evaluates strings as code', () => { expect(offenders(/\beval\s*\(|new Function\s*\(|setTimeout\s*\(\s*['"`]/)).toEqual([]); });
  it('keeps secrets out: no provider key patterns, no secret-looking VITE_ variables', () => {
    expect(offenders(/gsk_[A-Za-z0-9]{10,}|AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9]{20,}/)).toEqual([]);
    expect(offenders(/VITE_[A-Z_]*(KEY|SECRET|TOKEN|PASSWORD)/)).toEqual([]);
    expect(text(path.resolve(process.cwd(), '.env.example'))).not.toMatch(/KEY|SECRET/i);
  });
  it('browser storage holds only the theme choice; the session lives in the httpOnly cookie', () => {
    const using = offenders(/localStorage|sessionStorage/).sort();
    expect(using).toEqual(['src/context/ThemeContext.jsx']);
    expect(offenders(/Authorization|Bearer /)).toEqual([]);
  });
  it('makes no end-to-end-encryption claims (an explicit "not end-to-end encrypted" disclaimer is fine)', () => { expect(offenders(/(?<!not )(?<!no )end-to-end|e2ee|end to end encrypt/i)).toEqual([]); });
  it('talks only to the configured API/socket URLs (no hardcoded third-party hosts besides fonts)', () => {
    const urls = SRC.flatMap((f) => [...text(f).matchAll(/https?:\/\/[^\s'"`)]+/g)].map((m) => m[0])).filter((u) => !/localhost|example\.|w3\.org|fonts\.(googleapis|gstatic)\.com/.test(u));
    expect(urls).toEqual([]);
  });
});

describe('production bundle (if built)', () => {
  const dist = walk(path.resolve(process.cwd(), 'dist')).filter((f) => /\.(js|css|html)$/.test(f));
  it.skipIf(!dist.length)('contains no provider keys or server secrets', () => {
    expect(offenders(/gsk_[A-Za-z0-9]{10,}|AIza[0-9A-Za-z_-]{20,}|JWT_SECRET\s*[:=]\s*['"][^'"]{8,}/, dist)).toEqual([]);
  });
});
