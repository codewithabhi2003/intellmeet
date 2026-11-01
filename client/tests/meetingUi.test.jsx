import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SocketContext } from '../src/context/SocketContext';
import { AuthContext } from '../src/context/AuthContext';
import ChatPanel from '../src/components/meeting/ChatPanel';
import ConsentBanner from '../src/components/meeting/ConsentBanner';
import MeetingControls from '../src/components/meeting/MeetingControls';
import CreateMeeting from '../src/pages/CreateMeeting';
import Workspaces from '../src/pages/Workspaces';
import * as meetingService from '../src/services/meetingService';
import * as workspaceService from '../src/services/workspaceService';
import * as aiService from '../src/services/aiService';

vi.mock('../src/services/meetingService', () => ({ messages: vi.fn(), create: vi.fn(), rtcConfig: vi.fn() }));
vi.mock('../src/services/workspaceService', () => ({ list: vi.fn(), create: vi.fn(), addMember: vi.fn(), removeMember: vi.fn() }));
vi.mock('../src/services/aiService', () => ({ languages: vi.fn(), status: vi.fn() }));
const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => navigate }));
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const LANGS = [{ code: 'en', name: 'English', native: 'English' }, { code: 'hi', name: 'Hindi', native: 'हिन्दी' }];
beforeEach(() => { cleanup(); vi.clearAllMocks(); });

describe('ChatPanel', () => {
  const mkSocket = () => { const h = {}; return { on: (e, f) => { h[e] = f; }, off: () => {}, emit: vi.fn((ev, p, cb) => cb?.({ ok: true })), fire: (e, p) => h[e](p) }; };
  const renderChat = (socket) => render(<SocketContext.Provider value={{ getSocket: () => socket }}><ChatPanel meetingId="m1" selfUserId="me" joined /></SocketContext.Provider>);

  it('loads history, appends live messages once, and renders content as plain text (no markup injection)', async () => {
    meetingService.messages.mockResolvedValue([{ id: '1', sender: { id: 'u2', name: 'Ana' }, text: 'earlier' }]);
    const socket = mkSocket(); renderChat(socket);
    expect(await screen.findByText('earlier')).toBeTruthy();
    const evil = '<img src=x onerror="alert(1)"> **bold**';
    socket.fire('chat:message', { id: '2', sender: { id: 'u2', name: 'Ana' }, text: evil });
    socket.fire('chat:message', { id: '2', sender: { id: 'u2', name: 'Ana' }, text: evil });   // duplicate id ignored
    const log = screen.getByRole('log');
    await waitFor(() => expect(within(log).getAllByText(evil)).toHaveLength(1));
    expect(log.querySelector('img')).toBeNull();
  });

  it('sends on Enter (Shift+Enter does not), clears the box, and shows a server refusal', async () => {
    meetingService.messages.mockResolvedValue([]);
    const socket = mkSocket(); renderChat(socket);
    const box = await screen.findByLabelText('Message');
    fireEvent.change(box, { target: { value: 'hello' } });
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
    expect(socket.emit).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(socket.emit).toHaveBeenCalledWith('chat:send', { text: 'hello' }, expect.any(Function)); expect(box.value).toBe('');
    socket.emit.mockImplementation((ev, p, cb) => cb({ ok: false, message: 'You are sending messages too quickly.' }));
    fireEvent.change(box, { target: { value: 'again' } }); fireEvent.keyDown(box, { key: 'Enter' });
    expect((await screen.findByRole('alert')).textContent).toMatch(/too quickly/);
  });
});

describe('recording consent + controls', () => {
  it('host cannot start until they confirm participants were told', () => {
    const onConfirm = vi.fn();
    render(<ConsentBanner onConfirm={onConfirm} onCancel={() => {}} />);
    const start = screen.getByRole('button', { name: /start recording/i });
    expect(start.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox')); expect(start.disabled).toBe(false);
    fireEvent.click(start); expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.getByRole('group', { name: /recording consent/i }).textContent).toMatch(/not live/i);   // honest copy
  });
  it('participants get a visible recording notice', () => {
    render(<ConsentBanner variant="viewer" />);
    expect(screen.getByRole('status').textContent).toMatch(/host is recording/i);
  });
  it('controls expose pressed state and labels; camera toggle disabled without a camera', () => {
    const p = { audio: false, video: true, canVideo: false, onToggleAudio: vi.fn(), onToggleVideo: vi.fn(), panel: 'chat', onPanel: vi.fn(), onLeave: vi.fn() };
    render(<MeetingControls {...p} />);
    expect(screen.getByRole('button', { name: /unmute microphone/i }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /turn camera off/i }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Chat' }).getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /leave/i })); expect(p.onLeave).toHaveBeenCalled();
  });
});

describe('CreateMeeting', () => {
  it('submits the language settings and starts an instant meeting in the room', async () => {
    workspaceService.list.mockResolvedValue([{ id: 'w1', name: 'Team' }]); aiService.languages.mockResolvedValue(LANGS);
    meetingService.create.mockResolvedValue({ meeting: { id: 'm1', roomCode: 'CODE123' }, unknownEmails: [] });
    render(<MemoryRouter><CreateMeeting /></MemoryRouter>);
    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Planning' } });
    fireEvent.change(screen.getByLabelText('Primary language'), { target: { value: 'hi' } });
    fireEvent.click(screen.getByLabelText(/detect the spoken language/i));
    fireEvent.change(screen.getByLabelText('Summary language'), { target: { value: 'en' } });
    fireEvent.click(screen.getByRole('button', { name: /start meeting/i }));
    await waitFor(() => expect(meetingService.create).toHaveBeenCalled());
    expect(meetingService.create.mock.calls[0][0]).toEqual({ title: 'Planning', workspaceId: 'w1', instant: true,
      languageSettings: { primaryLanguage: 'hi', autoDetect: true, transcriptLanguage: null, summaryLanguage: 'en' } });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/room/CODE123'));
  });
  it('language options come from the API list; invalid invitee emails block submit', async () => {
    workspaceService.list.mockResolvedValue([{ id: 'w1', name: 'Team' }]); aiService.languages.mockResolvedValue(LANGS);
    render(<MemoryRouter><CreateMeeting /></MemoryRouter>);
    const primary = await screen.findByLabelText('Primary language');
    expect([...primary.querySelectorAll('option')].map((o) => o.value)).toEqual(['en', 'hi']);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText(/invite by email/i), { target: { value: 'not-an-email' } });
    expect(screen.getByRole('button', { name: /start meeting/i }).disabled).toBe(true);
    expect(screen.getByText(/not a valid email/i)).toBeTruthy();
  });
  it('shows an error with Retry when reference data fails to load', async () => {
    workspaceService.list.mockRejectedValue({ response: { data: { message: 'Server down' } } }); aiService.languages.mockResolvedValue(LANGS);
    render(<MemoryRouter><CreateMeeting /></MemoryRouter>);
    expect((await screen.findByRole('alert')).textContent).toMatch(/server down/i);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});

describe('Workspaces', () => {
  const ws = (myRole) => [{ id: 'w1', name: 'Acme', members: [
    { userId: { _id: 'owner1', name: 'Olive', email: 'o@x.dev' }, role: 'owner' },
    { userId: { _id: 'me', name: 'Me', email: 'm@x.dev' }, role: myRole }, { userId: { _id: 'u3', name: 'Tom', email: 't@x.dev' }, role: 'member' }] }];
  const renderPage = () => render(<AuthContext.Provider value={{ user: { id: 'me' } }}><Workspaces /></AuthContext.Provider>);
  it('admins can add/remove members but never see a remove button for the owner', async () => {
    workspaceService.list.mockResolvedValue(ws('admin')); renderPage();
    expect(await screen.findByLabelText('Add by email')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove Tom' })).toBeTruthy(); expect(screen.queryByRole('button', { name: 'Remove Olive' })).toBeNull();
    expect(screen.queryByLabelText('Role')).toBeNull();                                         // only owners choose roles
  });
  it('plain members get a read-only roster', async () => {
    workspaceService.list.mockResolvedValue(ws('member')); renderPage();
    expect(await screen.findByText('Olive')).toBeTruthy();
    expect(screen.queryByLabelText('Add by email')).toBeNull(); expect(screen.queryByRole('button', { name: /remove/i })).toBeNull();
  });
  it('removal asks for confirmation first', async () => {
    workspaceService.list.mockResolvedValue(ws('owner')); workspaceService.removeMember.mockResolvedValue({}); renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Tom' }));
    const dlg = await screen.findByRole('dialog'); expect(workspaceService.removeMember).not.toHaveBeenCalled();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(workspaceService.removeMember).toHaveBeenCalledWith('w1', 'u3'));
  });
});
