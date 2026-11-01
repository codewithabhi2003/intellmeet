import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../src/context/ThemeContext';
import { AuthContext } from '../src/context/AuthContext';
import Landing from '../src/pages/Landing';
import Home from '../src/pages/Home';

vi.mock('../src/pages/Dashboard', () => ({ default: () => <h1>Dashboard stub</h1> }));
beforeEach(() => cleanup());
const wrap = (ui, auth) => render(<ThemeProvider><AuthContext.Provider value={auth}><MemoryRouter>{ui}</MemoryRouter></AuthContext.Provider></ThemeProvider>);

describe('Landing page (redesigned)', () => {
  it('has one h1, the calls to action go to the real routes, and "see how it works" goes to features', () => {
    const { container } = wrap(<Landing />, {});
    const h1 = screen.getAllByRole('heading', { level: 1 }); expect(h1).toHaveLength(1);
    expect(h1[0].textContent).toMatch(/Every Meeting\.\s*Every Insight\.\s*One Intelligent Workspace\./);
    const register = [...container.querySelectorAll('a')].filter((a) => /get started/i.test(a.textContent));
    expect(register.length).toBeGreaterThanOrEqual(3);
    expect(register.every((a) => a.getAttribute('href') === '/register')).toBe(true);
    expect([...container.querySelectorAll('a')].filter((a) => /^sign in$/i.test(a.textContent.trim())).every((a) => a.getAttribute('href') === '/login')).toBe(true);
  });
  it('EVERY in-page link lands on a section that exists (no dead anchors), and the sections have headings', () => {
    const { container } = wrap(<Landing />, {});
    const anchors = [...container.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute('href')).filter((h) => h.length > 1);
    expect(anchors.length).toBeGreaterThan(4);
    for (const href of new Set(anchors)) expect(container.querySelector(href), `dead anchor ${href}`).toBeTruthy();
    for (const id of ['top', 'features', 'how', 'trust', 'main']) expect(container.querySelector(`#${id}`), id).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThanOrEqual(4);
  });
  it('has the landmarks, a skip link, and the product video is described for assistive tech', () => {
    const { container } = wrap(<Landing />, {});
    expect(screen.getByRole('banner')).toBeTruthy(); expect(screen.getByRole('main')).toBeTruthy(); expect(screen.getByRole('contentinfo')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Skip to content' }).getAttribute('href')).toBe('#main');
    expect(container.querySelector('[aria-label*="video meeting"]')).toBeTruthy();
  });
  it('the scrolling highlights can be paused (WCAG 2.2.2), and the control says what it will do next', () => {
    wrap(<Landing />, {});
    fireEvent.click(screen.getByRole('button', { name: /pause scrolling highlights/i }));
    expect(screen.getByRole('button', { name: /play scrolling highlights/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /play scrolling highlights/i }));
    expect(screen.getByRole('button', { name: /pause scrolling highlights/i })).toBeTruthy();
  });
  it('has no day/night button (the theme is chosen in Settings)', () => {
    wrap(<Landing />, {});
    expect(screen.queryByRole('button', { name: /theme|\bday\b|\bnight\b|\bdark\b|\blight\b/i })).toBeNull();
    expect(within(screen.getByRole('banner')).queryAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Open menu']);   // only the mobile menu
  });
  it('makes no invented claims: no statistics, customer logos or compliance badges', () => {
    const { container } = wrap(<Landing />, {});
    expect(container.textContent).not.toMatch(/\d+\s?(%|\+|x\b)|trusted by|million|SOC ?2|ISO ?27001|HIPAA|GDPR|99\.\d|#1 /i);
  });
});

describe('Home ("/") gating', () => {
  it('visitors see the landing page', () => { wrap(<Home />, { user: null, loading: false }); expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Every Insight/); expect(screen.queryByText('Dashboard stub')).toBeNull(); });
  it('signed-in users see the dashboard inside the app shell, not the landing page', () => {
    wrap(<Home />, { user: { id: 'u1', name: 'Ana', email: 'a@x.dev' }, loading: false, logout: vi.fn() });
    expect(screen.getByText('Dashboard stub')).toBeTruthy(); expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy(); expect(screen.queryByText(/Every Insight/)).toBeNull();
  });
  it('while the session loads, neither page flashes', () => {
    wrap(<Home />, { user: null, loading: true });
    expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy(); expect(screen.queryByText(/Every Insight/)).toBeNull(); expect(screen.queryByText('Dashboard stub')).toBeNull();
  });
});
