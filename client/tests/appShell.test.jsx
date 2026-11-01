import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../src/context/AuthContext';
import { ThemeProvider } from '../src/context/ThemeContext';
import AppShell from '../src/components/common/AppShell';

beforeEach(() => cleanup());
const renderShell = () => render(<ThemeProvider><AuthContext.Provider value={{ user: { id: 'u1', name: 'Abhishek Vishwakarma', email: 'abhishekvishwakarma@x.dev' }, logout: vi.fn() }}><MemoryRouter><AppShell><h1>Page</h1></AppShell></MemoryRouter></AuthContext.Provider></ThemeProvider>);
const ancestors = (el) => { const out = []; for (let n = el.parentElement; n; n = n.parentElement) out.push(n); return out; };

describe('AppShell layout', () => {
  it('the sidebar is attached to the left edge of the window (not inside a centered, width-capped box)', () => {
    const { container } = renderShell();
    const aside = container.querySelector('aside');
    for (const a of ancestors(aside)) { expect(a.className, `ancestor <${a.tagName.toLowerCase()}>`).not.toMatch(/\bmx-auto\b/); expect(a.className).not.toMatch(/max-w-/); }
    expect(aside.className).toMatch(/\bw-64\b/);            // roomy enough for a full name and email
  });
  it('only the page content is centered, with a readable maximum width', () => {
    const { container } = renderShell();
    const wrapper = container.querySelector('main#main > div');
    expect(wrapper.className).toMatch(/\bmx-auto\b/); expect(wrapper.className).toMatch(/max-w-\[1200px\]/);
    expect(wrapper.textContent).toBe('Page');
  });
  it('still has the main nav and the account block (Settings, Log out) in the sidebar', () => {
    renderShell();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy(); expect(screen.getByRole('navigation', { name: 'Account' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /log out/i })).toBeTruthy();
  });
});
