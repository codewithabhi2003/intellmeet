import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, cleanup, renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SocketContext } from '../src/context/SocketContext';
import ParticipantList from '../src/components/meeting/ParticipantList';
import MeetingControls from '../src/components/meeting/MeetingControls';
import CreateMeeting from '../src/pages/CreateMeeting';
import { useWebRTC } from '../src/hooks/useWebRTC';
import { generateRoomCode, isRoomCode, meetingLink } from '../src/lib/meetingLink';
import * as meetingService from '../src/services/meetingService';
import * as workspaceService from '../src/services/workspaceService';
import * as aiService from '../src/services/aiService';

vi.mock('../src/services/meetingService', () => ({ create: vi.fn(), rtcConfig: vi.fn().mockResolvedValue([]) }));
vi.mock('../src/services/workspaceService', () => ({ list: vi.fn() }));
vi.mock('../src/services/aiService', () => ({ languages: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => navigate }));

const writeText = vi.fn().mockResolvedValue();
beforeEach(() => { cleanup(); vi.clearAllMocks(); Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true }); });

describe('meeting link + code', () => {
  it('codes are 12 URL-safe characters, random, and the link points at the room', () => {
    const codes = new Set(Array.from({ length: 200 }, generateRoomCode));
    expect(codes.size).toBe(200); expect([...codes].every(isRoomCode)).toBe(true);
    expect(isRoomCode('short')).toBe(false); expect(isRoomCode('has spaces!!')).toBe(false); expect(isRoomCode('../../../etc')).toBe(false);
    expect(meetingLink('abcDEF123_-x')).toBe(`${window.location.origin}/room/abcDEF123_-x`);
  });
});

describe('Create meeting shows the link and code BEFORE the meeting exists', () => {
  const setup = async () => { workspaceService.list.mockResolvedValue([{ id: 'w1', name: 'Team' }]); aiService.languages.mockResolvedValue([{ code: 'en', name: 'English', native: 'English' }]); render(<MemoryRouter><CreateMeeting /></MemoryRouter>); return screen.findByLabelText('Meeting code'); };
  it('shows a ready link and code, with copy buttons, and sends that same code (and the waiting-room choice) when you create the meeting', async () => {
    const codeBox = await setup(); const code = codeBox.value; const link = screen.getByLabelText('Meeting link').value;
    expect(isRoomCode(code)).toBe(true); expect(link).toBe(`${window.location.origin}/room/${code}`);
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' })); await waitFor(() => expect(writeText).toHaveBeenCalledWith(link));
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' })); await waitFor(() => expect(writeText).toHaveBeenCalledWith(code));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Planning' } }); fireEvent.click(screen.getByLabelText(/waiting room/i));
    meetingService.create.mockResolvedValue({ meeting: { id: 'm1', roomCode: code }, unknownEmails: [] });
    fireEvent.click(screen.getByRole('button', { name: /start meeting/i }));
    await waitFor(() => expect(meetingService.create).toHaveBeenCalled());
    expect(meetingService.create.mock.calls[0][0]).toMatchObject({ roomCode: code, waitingRoom: true, instant: true });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(`/room/${code}`));
  });
  it('is also there for a scheduled meeting, and waiting room is off unless ticked', async () => {
    const codeBox = await setup();
    fireEvent.click(screen.getByLabelText('Schedule')); expect(screen.getByLabelText('Meeting code').value).toBe(codeBox.value); expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
    expect(screen.getByLabelText(/waiting room/i).checked).toBe(false);
  });
});

describe('ParticipantList: the host tag and host-only controls', () => {
  const people = [{ key: 'self', name: 'Ana', isSelf: true, userId: 'u1', media: { audio: true, video: true } }, { key: 's2', name: 'Raj', isSelf: false, userId: 'u2', media: { audio: true, video: false } }, { key: 's3', name: 'Zed', isSelf: false, userId: 'u3', media: { audio: false, video: true } }];
  const props = (o = {}) => ({ people, hostId: 'u1', isHost: true, waiting: [], invite: { link: 'http://x/room/abc', code: 'abc' }, onAdmit: vi.fn(), onDeny: vi.fn(), onMute: vi.fn(), onMuteAll: vi.fn(), onRemove: vi.fn(), ...o });

  it('everyone sees a Host tag on the host; guests get no controls at all', () => {
    render(<ParticipantList {...props({ isHost: false, waiting: [{ socketId: 'w1', name: 'Wendy' }] })} />);
    const list = screen.getByRole('list', { name: 'Participants' });
    expect(within(list).getByText('Host')).toBeTruthy(); expect(within(list).getByText('(You)')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /mute|remove|turn off|admit|let .* in/i })).toBeNull(); expect(screen.queryByText(/waiting to join/i)).toBeNull();
  });
  it('the host can mute a microphone or camera and sees nothing to do for themselves; already-muted buttons are disabled', () => {
    const p = props(); render(<ParticipantList {...p} />);
    expect(screen.queryByRole('button', { name: /mute ana|remove ana/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mute Raj' })); expect(p.onMute).toHaveBeenCalledWith('s2', 'audio');
    fireEvent.click(screen.getByRole('button', { name: "Turn off Zed's camera" })); expect(p.onMute).toHaveBeenCalledWith('s3', 'video');
    expect(screen.getByRole('button', { name: 'Zed is muted' }).disabled).toBe(true); expect(screen.getByRole('button', { name: "Raj's camera is off" }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /mute all/i })); expect(p.onMuteAll).toHaveBeenCalled();
  });
  it('removing someone asks first, and only removes after you confirm', async () => {
    const p = props(); render(<ParticipantList {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Raj from the meeting' }));
    const dlg = await screen.findByRole('dialog'); expect(dlg.textContent).toMatch(/will not be able to rejoin/); expect(p.onRemove).not.toHaveBeenCalled();
    fireEvent.click(within(dlg).getByRole('button', { name: 'Cancel' })); expect(p.onRemove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Raj from the meeting' })); fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remove' }));
    expect(p.onRemove).toHaveBeenCalledWith('s2');
  });
  it('the host sees who is waiting and can admit or deny each person', () => {
    const p = props({ waiting: [{ socketId: 'w1', name: 'Wendy' }, { socketId: 'w2', name: 'Walt' }] }); render(<ParticipantList {...p} />);
    expect(screen.getByText('Waiting to join (2)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Let Wendy in' })); expect(p.onAdmit).toHaveBeenCalledWith('w1');
    fireEvent.click(screen.getByRole('button', { name: 'Do not let Walt in' })); expect(p.onDeny).toHaveBeenCalledWith('w2');
  });
  it('"Add people" opens the meeting link and code (the copy link lives here now), each with its own copy button', async () => {
    render(<ParticipantList {...props({ isHost: false })} />);
    expect(screen.queryByLabelText('Meeting link')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /add people/i })); expect(screen.getByLabelText('Meeting link').value).toBe('http://x/room/abc'); expect(screen.getByLabelText('Meeting code').value).toBe('abc');
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' })); await waitFor(() => expect(writeText).toHaveBeenCalledWith('http://x/room/abc'));
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' })); await waitFor(() => expect(writeText).toHaveBeenCalledWith('abc'));
  });
  it('the Participants button shows how many people are waiting', () => {
    const base = { audio: true, video: true, canVideo: true, onToggleAudio() {}, onToggleVideo() {}, onLeave() {}, panel: null, onPanel() {} };
    const { rerender } = render(<MeetingControls {...base} />); expect(screen.queryByTestId('waiting-badge')).toBeNull();
    rerender(<MeetingControls {...base} waiting={2} />); expect(screen.getByTestId('waiting-badge').textContent).toBe('2'); expect(screen.getByRole('button', { name: 'Participants, 2 waiting' })).toBeTruthy();
  });
});

describe('useWebRTC: waiting room, removal, host mute and host actions', () => {
  function fakeSocket(acks) {
    const h = {}; const s = { emitted: [], on: (e, f) => { (h[e] ||= []).push(f); }, off: (e, f) => { h[e] = (h[e] || []).filter((x) => x !== f); },
      trigger: (e, p) => act(async () => { await Promise.all((h[e] || []).map((f) => f(p))); }),
      emit: vi.fn((ev, payload, cb) => { s.emitted.push([ev, payload]); if (ev === 'room:join') cb?.(acks.shift()); else cb?.({ ok: true }); }) };
    return s;
  }
  const setup = (socket, onHostMute) => renderHook(() => useWebRTC({ roomCode: 'room-abc123', localStream: null, enabled: true, onHostMute }),
    { wrapper: ({ children }) => <SocketContext.Provider value={{ getSocket: () => socket }}>{children}</SocketContext.Provider> });
  const joins = (s) => s.emitted.filter(([e]) => e === 'room:join').length;

  it('waits outside until the host admits, then joins the room for real', async () => {
    const s = fakeSocket([{ ok: true, waiting: true }, { ok: true, selfId: 'me', peers: [] }]); const { result } = setup(s);
    await waitFor(() => expect(result.current.status).toBe('waiting')); expect(joins(s)).toBe(1); expect(result.current.selfId).toBeNull();
    await s.trigger('lobby:admitted'); await waitFor(() => expect(result.current.status).toBe('joined')); expect(joins(s)).toBe(2);
  });
  it('being denied, or removed by the host, ends in a clear status (and removal clears the room)', async () => {
    const s1 = fakeSocket([{ ok: true, waiting: true }]); const a = setup(s1); await waitFor(() => expect(a.result.current.status).toBe('waiting'));
    await s1.trigger('lobby:denied'); expect(a.result.current.status).toBe('denied');
    const s2 = fakeSocket([{ ok: true, selfId: 'me', peers: [] }]); const b = setup(s2); await waitFor(() => expect(b.result.current.status).toBe('joined'));
    await s2.trigger('host:removed'); expect(b.result.current.status).toBe('removed'); expect(b.result.current.peers).toEqual([]);
  });
  it('the host gets the waiting list; a host mute command is passed to the page; host actions send the right events', async () => {
    const s = fakeSocket([{ ok: true, selfId: 'me', peers: [] }]); const onHostMute = vi.fn(); const { result } = setup(s, onHostMute);
    await waitFor(() => expect(result.current.status).toBe('joined'));
    await s.trigger('lobby:update', { waiting: [{ socketId: 'w1', name: 'Wendy' }] }); expect(result.current.waiting).toEqual([{ socketId: 'w1', name: 'Wendy' }]);
    await s.trigger('host:force-mute', { kind: 'audio' }); expect(onHostMute).toHaveBeenCalledWith('audio');
    await act(async () => { await result.current.admit('w1'); await result.current.deny('w2'); await result.current.muteUser('s9', 'video'); await result.current.muteAll(); await result.current.removeUser('s7'); });
    const sent = s.emitted.filter(([e]) => /^(host|lobby):/.test(e));
    expect(sent).toEqual([['lobby:admit', { socketId: 'w1' }], ['lobby:deny', { socketId: 'w2' }], ['host:mute', { socketId: 's9', kind: 'video' }], ['host:mute-all', { kind: 'audio' }], ['host:remove', { socketId: 's7' }]]);
  });
});