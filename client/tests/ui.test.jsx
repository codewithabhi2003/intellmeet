import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, THEME_KEY } from '../src/context/ThemeContext';
import { useTheme } from '../src/hooks/useTheme';
import { AuthContext } from '../src/context/AuthContext';
import Login from '../src/pages/Login';
import StatusBadge from '../src/components/common/StatusBadge';
import NotConfigured from '../src/components/common/NotConfigured';

beforeEach(() => { cleanup(); localStorage.clear(); document.documentElement.setAttribute('data-theme', 'dark'); window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }); });

describe('theme', () => {
  const Probe = () => { const { theme, setTheme } = useTheme(); return <><span data-testid="t">{theme}</span><button onClick={() => setTheme('light')}>day</button><button onClick={() => setTheme('dark')}>night</button></>; };
  it('starts in night mode, and setTheme switches the page and persists the choice', async () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId('t').textContent).toBe('dark'); expect(localStorage.getItem(THEME_KEY)).toBeNull();     // nothing saved until the user chooses
    fireEvent.click(screen.getByText('day'));
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('light'));
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
    fireEvent.click(screen.getByText('night')); await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('dark'));
  });
  it('reads the theme that the no-flash script already applied', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId('t').textContent).toBe('light');
  });
  it('does not follow OS theme changes (night stays night unless you choose Day)', async () => {
    let handler; window.matchMedia = () => ({ matches: true, addEventListener: (_, f) => { handler = f; }, removeEventListener() {}, addListener() {}, removeListener() {} });
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(handler).toBeUndefined();
    expect(screen.getByTestId('t').textContent).toBe('dark');
  });
});

describe('Login form', () => {
  const setup = (login) => render(<AuthContext.Provider value={{ login }}><MemoryRouter><Login /></MemoryRouter></AuthContext.Provider>);
  it('is labeled, disabled until filled, and submits credentials', async () => {
    const login = vi.fn().mockResolvedValue({});
    setup(login);
    const btn = screen.getByRole('button', { name: /^sign in$/i });
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.dev' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    await waitFor(() => expect(login).toHaveBeenCalledWith({ email: 'a@b.dev', password: 'password123' }));
  });
  it('shows the server error in an alert region', async () => {
    setup(vi.fn().mockRejectedValue({ response: { data: { message: 'Invalid email or password.' } } }));
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.dev' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/invalid email or password/i);
  });
});

describe('shared components', () => {
  it('NotConfigured names the env var and never claims success', () => {
    render(<NotConfigured feature="Meeting transcription" envVar="GROQ_API_KEY" />);
    expect(screen.getByRole('status').textContent).toMatch(/Not configured/); expect(screen.getByText('GROQ_API_KEY')).toBeTruthy();
  });
  it('StatusBadge renders the spec labels', () => {
    render(<><StatusBadge status="processing" /><StatusBadge status="completed" /><StatusBadge status="failed" /><StatusBadge status="translated" /></>);
    for (const t of ['Processing', 'Completed', 'Failed', 'Translated']) expect(screen.getByText(t)).toBeTruthy();
  });
});
