import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext, AuthProvider } from '../src/context/AuthContext';
import { ThemeProvider } from '../src/context/ThemeContext';
import { useAuth } from '../src/hooks/useAuth';
import Settings from '../src/pages/Settings';
import CreateMeeting from '../src/pages/CreateMeeting';
import { deviceLabel, eventLabel, isSuspicious } from '../src/lib/securityEvents';
import * as userService from '../src/services/userService';
import * as authService from '../src/services/authService';
import * as meetingService from '../src/services/meetingService';
import * as workspaceService from '../src/services/workspaceService';
import * as aiService from '../src/services/aiService';

vi.mock('../src/services/userService', () => ({ updateMe: vi.fn(), uploadAvatar: vi.fn(), removeAvatar: vi.fn(), putLanguagePreferences: vi.fn(), changePassword: vi.fn(), securityEvents: vi.fn() }));
vi.mock('../src/services/authService', () => ({ me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn(), logoutAll: vi.fn() }));
vi.mock('../src/services/meetingService', () => ({ create: vi.fn() }));
vi.mock('../src/services/workspaceService', () => ({ list: vi.fn() }));
vi.mock('../src/services/aiService', () => ({ languages: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => navigate }));

const USER = { id: 'u1', name: 'Ana', email: 'ana@x.dev', avatarUrl: '', languagePreferences: {} };
const EVENTS = [
  { id: 'e1', type: 'login_success', ip: '10.0.0.1', userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537', createdAt: '2026-10-27T10:00:00Z' },
  { id: 'e2', type: 'login_failed', ip: '203.0.113.9', userAgent: 'curl/8.0', createdAt: '2026-10-27T09:00:00Z' },
  { id: 'e3', type: 'account_locked', ip: '203.0.113.9', userAgent: 'curl/8.0', createdAt: '2026-10-27T09:01:00Z' },
];
beforeEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear(); aiService.languages.mockResolvedValue([]); userService.securityEvents.mockResolvedValue(EVENTS); });

const openSecurity = async (auth = {}) => {
  const value = { user: USER, setUser: vi.fn(), logout: vi.fn(), logoutAll: vi.fn().mockResolvedValue(), ...auth };
  render(<ThemeProvider><AuthContext.Provider value={value}><MemoryRouter><Settings /></MemoryRouter></AuthContext.Provider></ThemeProvider>);
  fireEvent.click(screen.getByRole('tab', { name: 'Security' }));
  await screen.findByRole('heading', { name: 'Change password' });
  return value;
};
const fill = (cur, next, confirm = next) => { fireEvent.change(screen.getByLabelText('Current password'), { target: { value: cur } }); fireEvent.change(screen.getByLabelText('New password'), { target: { value: next } }); fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirm } }); };

describe('Settings > Security: change password', () => {
  it('the button stays disabled until the form is valid, and says why', async () => {
    await openSecurity(); const btn = screen.getByRole('button', { name: 'Change password' });
    expect(btn.disabled).toBe(true);
    fill('oldpass123', 'short'); expect(btn.disabled).toBe(true);
    fill('oldpass123', 'longenough1', 'different1'); expect(btn.disabled).toBe(true); expect(screen.getByText('The passwords do not match.')).toBeTruthy();
    fill('samepass123', 'samepass123'); expect(btn.disabled).toBe(true); expect(screen.getByText(/different from the current one/i)).toBeTruthy();
    fill('oldpass123', 'longenough1'); expect(btn.disabled).toBe(false);
  });
  it('sends the passwords, updates the user, clears the fields and refreshes recent activity', async () => {
    const v = await openSecurity(); userService.changePassword.mockResolvedValue({ ...USER, name: 'Ana R' });
    fill('oldpass123', 'longenough1'); fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    await waitFor(() => expect(userService.changePassword).toHaveBeenCalledWith({ currentPassword: 'oldpass123', newPassword: 'longenough1' }));
    await waitFor(() => expect(v.setUser).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ana R' })));
    await waitFor(() => expect(screen.getByLabelText('Current password').value).toBe(''));
    expect(screen.getByLabelText('New password').value).toBe(''); expect(userService.securityEvents).toHaveBeenCalledTimes(2);
  });
  it('a wrong current password shows the server message, clears that field, and keeps the new one', async () => {
    await openSecurity(); userService.changePassword.mockRejectedValue({ response: { data: { code: 'WRONG_PASSWORD', message: 'Your current password is incorrect.' } } });
    fill('wrong-one-1', 'longenough1'); fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    await waitFor(() => expect(screen.getAllByRole('alert').map((a) => a.textContent).join(' ')).toMatch(/current password is incorrect/i));
    expect(screen.getByLabelText('Current password').value).toBe(''); expect(screen.getByLabelText('New password').value).toBe('longenough1');
  });
});

describe('Settings > Security: log out of all devices', () => {
  it('asks first; Cancel does nothing; confirming signs out everywhere and goes to the landing page', async () => {
    const v = await openSecurity();
    fireEvent.click(screen.getByRole('button', { name: 'Log out of all devices' }));
    const dlg = await screen.findByRole('dialog'); expect(v.logoutAll).not.toHaveBeenCalled();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancel' })); expect(v.logoutAll).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Log out of all devices' })); fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Log out everywhere' }));
    await waitFor(() => expect(v.logoutAll).toHaveBeenCalledOnce()); await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
  });
  it('if the request fails it says so, and you are NOT treated as signed out', async () => {
    const v = await openSecurity({ logoutAll: vi.fn().mockRejectedValue({ response: { data: { message: 'Server unreachable.' } } }) });
    fireEvent.click(screen.getByRole('button', { name: 'Log out of all devices' })); fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Log out everywhere' }));
    expect(await within(await screen.findByRole('dialog')).findByText('Server unreachable.')).toBeTruthy(); expect(v.logoutAll).toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
  });
  it('AuthProvider.logoutAll clears the user only when the server confirmed', async () => {
    authService.me.mockResolvedValue(USER); let api;
    const Probe = () => { api = useAuth(); return <span data-testid="who">{api.user?.name || 'nobody'}</span>; };
    render(<AuthProvider><Probe /></AuthProvider>); await waitFor(() => expect(screen.getByTestId('who').textContent).toBe('Ana'));
    authService.logoutAll.mockRejectedValueOnce(new Error('network'));
    await expect(api.logoutAll()).rejects.toThrow('network'); expect(screen.getByTestId('who').textContent).toBe('Ana');            // still signed in
    authService.logoutAll.mockResolvedValueOnce({ success: true });
    await waitFor(async () => { await api.logoutAll(); }); await waitFor(() => expect(screen.getByTestId('who').textContent).toBe('nobody'));
  });
});

describe('Settings > Security: recent activity', () => {
  it('lists your events with the device, time and address, and flags the suspicious ones', async () => {
    await openSecurity(); const list = await screen.findByRole('list');
    expect(within(list).getByText('Signed in')).toBeTruthy(); expect(within(list).getByText(/Chrome on Windows/)).toBeTruthy(); expect(within(list).getByText(/10\.0\.0\.1/)).toBeTruthy();
    expect(within(list).getByText('Failed sign-in attempt')).toBeTruthy(); expect(within(list).getByText(/Sign-in locked after too many failed attempts/)).toBeTruthy();
  });
  it('has an empty state and an error state with Retry', async () => {
    userService.securityEvents.mockResolvedValueOnce([]); await openSecurity(); expect(await screen.findByText('No activity recorded yet.')).toBeTruthy(); cleanup();
    userService.securityEvents.mockRejectedValueOnce({ response: { data: { message: 'Could not load.' } } }).mockResolvedValueOnce(EVENTS);
    await openSecurity(); expect((await screen.findAllByRole('alert')).map((a) => a.textContent).join(' ')).toMatch(/could not load/i);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' })); expect(await screen.findByText('Signed in')).toBeTruthy();
  });
  it('helpers: device names, event labels, which events are suspicious', () => {
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0) AppleWebKit Chrome/120 Safari/537')).toBe('Chrome on Windows');
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537 Edg/120')).toBe('Edge on Windows');
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17) AppleWebKit Version/17 Safari/604')).toBe('Safari on iOS');
    expect(deviceLabel('')).toBe('Unknown device'); expect(deviceLabel('curl/8.0')).toBe('curl/8.0');
    expect(eventLabel('password_changed')).toBe('Password changed'); expect(eventLabel('something_new')).toBe('something_new');
    expect(['login_failed', 'account_locked', 'password_change_failed'].every(isSuspicious)).toBe(true); expect(isSuspicious('login_success')).toBe(false);
  });
});

describe('Create meeting: who can see it', () => {
  const setup = async () => { workspaceService.list.mockResolvedValue([{ id: 'w1', name: 'Team' }]); aiService.languages.mockResolvedValue([{ code: 'en', name: 'English', native: 'English' }]); meetingService.create.mockResolvedValue({ meeting: { id: 'm1', roomCode: 'CODE12345678' }, unknownEmails: [] }); render(<MemoryRouter><CreateMeeting /></MemoryRouter>); await screen.findByLabelText('Title'); };
  it('is PRIVATE by default (only me and invited people) and sends that', async () => {
    await setup(); const priv = screen.getByRole('radio', { name: /only me and the people i invite/i }); expect(priv.checked).toBe(true); expect(screen.getByRole('radio', { name: /everyone in the workspace/i }).checked).toBe(false);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Board' } }); fireEvent.click(screen.getByRole('button', { name: /start meeting/i }));
    await waitFor(() => expect(meetingService.create).toHaveBeenCalled()); expect(meetingService.create.mock.calls[0][0].visibility).toBe('private');
  });
  it('can be shared with the whole workspace on purpose', async () => {
    await setup(); fireEvent.click(screen.getByRole('radio', { name: /everyone in the workspace/i }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'All-hands' } }); fireEvent.click(screen.getByRole('button', { name: /start meeting/i }));
    await waitFor(() => expect(meetingService.create).toHaveBeenCalled()); expect(meetingService.create.mock.calls[0][0].visibility).toBe('workspace');
  });
});