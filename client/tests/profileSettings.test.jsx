import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import fs from 'node:fs';
import path from 'node:path';
import { AuthContext } from '../src/context/AuthContext';
import { ThemeProvider, THEME_KEY } from '../src/context/ThemeContext';
import Sidebar from '../src/components/common/Sidebar';
import Navbar from '../src/components/common/Navbar';
import LandingNav from '../src/components/landing/LandingNav';
import AuthLayout from '../src/components/common/AuthLayout';
import Avatar from '../src/components/common/Avatar';
import Settings from '../src/pages/Settings';
import { avatarSrc, checkAvatarFile } from '../src/lib/avatar';
import * as userService from '../src/services/userService';
import * as aiService from '../src/services/aiService';

vi.mock('../src/services/userService', () => ({ updateMe: vi.fn(), uploadAvatar: vi.fn(), removeAvatar: vi.fn(), putLanguagePreferences: vi.fn() }));
vi.mock('../src/services/aiService', () => ({ languages: vi.fn(), status: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => navigate }));

const USER = { id: 'u1', name: 'Ana Rao', email: 'ana@x.dev', avatarUrl: '', languagePreferences: {} };
beforeEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear(); document.documentElement.setAttribute('data-theme', 'dark'); aiService.languages.mockResolvedValue([]); });
const auth = (over = {}) => ({ user: USER, setUser: vi.fn(), logout: vi.fn().mockResolvedValue(), ...over });
const wrap = (ui, a = auth()) => render(<ThemeProvider><AuthContext.Provider value={a}><MemoryRouter>{ui}</MemoryRouter></AuthContext.Provider></ThemeProvider>);
// Behaves like the real AuthContext: setUser replaces the user and re-renders consumers.
function StatefulAuth({ initial, spy, children }) {
  const [user, setUserState] = useState(initial);
  const setUser = (u) => { spy(u); setUserState(u); };
  return <ThemeProvider><AuthContext.Provider value={{ user, setUser, logout: vi.fn() }}><MemoryRouter>{children}</MemoryRouter></AuthContext.Provider></ThemeProvider>;
}
const file = (name, type, bytes = 100) => new File([new Uint8Array(bytes)], name, { type });

describe('avatar helpers + component', () => {
  it('validates type and size in the browser (the server re-checks the real bytes)', () => {
    expect(checkAvatarFile(null)).toMatch(/choose/i);
    expect(checkAvatarFile(file('a.gif', 'image/gif'))).toMatch(/PNG, JPEG or WebP/);
    expect(checkAvatarFile(file('a.svg', 'image/svg+xml'))).toMatch(/PNG, JPEG or WebP/);
    expect(checkAvatarFile(file('big.png', 'image/png', 2 * 1024 * 1024 + 1))).toMatch(/2 MB or smaller/);
    for (const t of ['image/png', 'image/jpeg', 'image/webp']) expect(checkAvatarFile(file('ok', t))).toBeNull();
  });
  it('builds the picture URL from the API origin, or nothing when there is no picture', () => {
    expect(avatarSrc('')).toBe(''); expect(avatarSrc('/api/users/u1/avatar?v=1')).toBe('http://localhost:5000/api/users/u1/avatar?v=1');
  });
  it('shows the picture, falls back to the initial without one, and falls back again if the image fails', () => {
    const { container, rerender } = render(<Avatar user={{ name: 'Ana', avatarUrl: '/api/users/u1/avatar?v=1' }} />);
    const img = container.querySelector('img'); expect(img.getAttribute('src')).toBe('http://localhost:5000/api/users/u1/avatar?v=1');
    fireEvent.error(img); expect(container.querySelector('img')).toBeNull(); expect(container.textContent).toBe('A');
    rerender(<Avatar user={{ name: 'raj', avatarUrl: '' }} />); expect(container.textContent).toBe('R');
  });
});

describe('sidebar: Settings and Log out at the bottom', () => {
  it('has the main links, then an account block ending in Settings and Log out', () => {
    wrap(<Sidebar />);
    const main = screen.getByRole('navigation', { name: 'Main' }), account = screen.getByRole('navigation', { name: 'Account' });
    expect(within(main).getByRole('link', { name: /dashboard/i })).toBeTruthy(); expect(within(main).queryByRole('link', { name: /settings/i })).toBeNull();
    expect(within(account).getByRole('link', { name: /settings/i }).getAttribute('href')).toBe('/settings');
    expect(within(account).getByText('Ana Rao')).toBeTruthy(); expect(within(account).getByText('ana@x.dev')).toBeTruthy();
    const logout = within(account).getByRole('button', { name: /log out/i });
    expect(main.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();                       // account block is below the main nav
    expect(within(account).getByRole('link', { name: /settings/i }).compareDocumentPosition(logout) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();   // Log out is the last item
  });
  it('Log out signs out, closes the mobile drawer, and goes to the landing page', async () => {
    const a = auth(); const onNavigate = vi.fn(); wrap(<Sidebar onNavigate={onNavigate} />, a);
    fireEvent.click(screen.getByRole('button', { name: /log out/i }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
    expect(a.logout).toHaveBeenCalledOnce(); expect(onNavigate).toHaveBeenCalled();
  });
});

describe('Settings: profile', () => {
  const renderProfile = (a = auth()) => { wrap(<Settings />, a); return a; };
  it('shows current details; Save stays disabled until something changes', () => {
    renderProfile();
    expect(screen.getByLabelText('Name').value).toBe('Ana Rao'); expect(screen.getByLabelText('Email').value).toBe('ana@x.dev');
    expect(screen.getByRole('button', { name: 'Save changes' }).disabled).toBe(true); expect(screen.queryByLabelText('Current password')).toBeNull();
  });
  it('changing only the name sends only the name (no password needed)', async () => {
    const a = renderProfile(); userService.updateMe.mockResolvedValue({ ...USER, name: 'Ana R' });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' Ana R ' } }); fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(userService.updateMe).toHaveBeenCalledWith({ name: 'Ana R' }));
    await waitFor(() => expect(a.setUser).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ana R' })));
  });
  it('changing the email asks for the current password and sends both; a wrong password shows the server message and clears the field', async () => {
    renderProfile();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'New@x.dev' } });
    const pw = screen.getByLabelText('Current password'); const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save.disabled).toBe(true);
    fireEvent.change(pw, { target: { value: 'wrong-pass' } }); expect(save.disabled).toBe(false);
    userService.updateMe.mockRejectedValueOnce({ response: { data: { code: 'WRONG_PASSWORD', message: 'Your current password is incorrect.' } } });
    fireEvent.click(save);
    await waitFor(() => expect(screen.getAllByRole('alert').map((x) => x.textContent).join(' ')).toMatch(/current password is incorrect/i));
    expect(userService.updateMe).toHaveBeenCalledWith({ email: 'New@x.dev', currentPassword: 'wrong-pass' });
    expect(screen.getByLabelText('Current password').value).toBe('');
  });
  it('a successful email change updates the user and hides the password field again', async () => {
    const spy = vi.fn(); userService.updateMe.mockResolvedValue({ ...USER, email: 'new@x.dev' });
    render(<StatefulAuth initial={USER} spy={spy}><Settings /></StatefulAuth>);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@x.dev' } }); fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(expect.objectContaining({ email: 'new@x.dev' })));
    await waitFor(() => expect(screen.queryByLabelText('Current password')).toBeNull());
    expect(screen.getByLabelText('Email').value).toBe('new@x.dev'); expect(screen.getByRole('button', { name: 'Save changes' }).disabled).toBe(true);   // nothing left to save
  });
  it('photo: rejects wrong types and oversize files before uploading; uploads a valid one and updates the user', async () => {
    const a = renderProfile(); const input = screen.getByLabelText(/upload photo/i);
    fireEvent.change(input, { target: { files: [file('a.gif', 'image/gif')] } });
    expect((await screen.findAllByRole('alert')).map((x) => x.textContent).join(' ')).toMatch(/PNG, JPEG or WebP/);
    fireEvent.change(input, { target: { files: [file('big.png', 'image/png', 3 * 1024 * 1024)] } });
    await waitFor(() => expect(screen.getAllByRole('alert').map((x) => x.textContent).join(' ')).toMatch(/2 MB or smaller/));
    expect(userService.uploadAvatar).not.toHaveBeenCalled();
    const good = file('me.png', 'image/png'); userService.uploadAvatar.mockResolvedValue({ ...USER, avatarUrl: '/api/users/u1/avatar?v=9' });
    fireEvent.change(input, { target: { files: [good] } });
    await waitFor(() => expect(userService.uploadAvatar).toHaveBeenCalledWith(good));
    await waitFor(() => expect(a.setUser).toHaveBeenCalledWith(expect.objectContaining({ avatarUrl: '/api/users/u1/avatar?v=9' })));
  });
  it('photo: a server refusal is shown; Remove appears only when there is a picture and removes it', async () => {
    renderProfile(); expect(screen.queryByRole('button', { name: /remove/i })).toBeNull();
    userService.uploadAvatar.mockRejectedValueOnce({ response: { data: { message: 'That file is not a valid PNG, JPEG or WebP image.' } } });
    fireEvent.change(screen.getByLabelText(/upload photo/i), { target: { files: [file('x.png', 'image/png')] } });
    expect(await screen.findByText(/not a valid PNG, JPEG or WebP/)).toBeTruthy();
    cleanup();
    const a = auth({ user: { ...USER, avatarUrl: '/api/users/u1/avatar?v=1' } }); wrap(<Settings />, a); userService.removeAvatar.mockResolvedValue(USER);
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    await waitFor(() => expect(userService.removeAvatar).toHaveBeenCalled()); await waitFor(() => expect(a.setUser).toHaveBeenCalledWith(USER));
  });
  it('Settings has its own Log out, which signs out and goes to the landing page', async () => {
    const a = renderProfile();
    fireEvent.click(screen.getByRole('button', { name: /log out/i }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true })); expect(a.logout).toHaveBeenCalledOnce();
  });
});

describe('Settings: appearance (the only place to change the theme)', () => {
  it('Night is selected initially; choosing Day applies and saves it; Night switches back', async () => {
    wrap(<Settings />);
    fireEvent.click(screen.getByRole('tab', { name: 'Appearance' }));
    const night = screen.getByRole('radio', { name: /night/i }), day = screen.getByRole('radio', { name: /day/i });
    expect(night.checked).toBe(true); expect(day.checked).toBe(false); expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    fireEvent.click(day);
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('light')); expect(localStorage.getItem(THEME_KEY)).toBe('light');
    expect(screen.getByRole('radio', { name: /day/i }).checked).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /night/i }));
    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('dark')); expect(localStorage.getItem(THEME_KEY)).toBe('dark');
  });
});

describe('no day/night button anywhere else', () => {
  const themeButtons = () => screen.queryAllByRole('button').filter((b) => /theme|\bday\b|\bnight\b|\blight\b|\bdark\b/i.test(b.getAttribute('aria-label') || b.textContent));
  it('top bar, sidebar, landing header and sign-in layout have none', () => {
    const { unmount: u1 } = wrap(<Navbar onMenu={() => {}} />); expect(themeButtons()).toHaveLength(0); u1();
    const { unmount: u2 } = wrap(<Sidebar />); expect(themeButtons()).toHaveLength(0); u2();
    const { unmount: u3 } = wrap(<LandingNav />, { user: null }); expect(themeButtons()).toHaveLength(0); u3();
    wrap(<AuthLayout title="t" subtitle="s" footer="f"><span /></AuthLayout>, { user: null }); expect(themeButtons()).toHaveLength(0);
  });
  it('the toggle component and its labels no longer exist in the source', () => {
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    const files = walk(path.resolve(process.cwd(), 'src'));
    expect(files.filter((f) => /ThemeToggle/.test(f))).toEqual([]);
    // comments that merely mention the old component are fine: look for an actual import/usage or the old button labels
    expect(files.filter((f) => /import\s+ThemeToggle|from\s+['"][^'"]*ThemeToggle|<ThemeToggle|Switch to (light|dark) theme/.test(fs.readFileSync(f, 'utf8')))).toEqual([]);
  });
});
