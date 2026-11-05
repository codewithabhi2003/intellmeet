import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, cleanup, renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SocketContext } from '../src/context/SocketContext';
import MeetingControls from '../src/components/meeting/MeetingControls';
import ParticipantList from '../src/components/meeting/ParticipantList';
import CreateMeeting from '../src/pages/CreateMeeting';
import { useWebRTC } from '../src/hooks/useWebRTC';
import * as meetingService from '../src/services/meetingService';
import * as workspaceService from '../src/services/workspaceService';
import * as aiService from '../src/services/aiService';

vi.mock('../src/services/meetingService', () => ({ create: vi.fn(), rtcConfig: vi.fn().mockResolvedValue([]) }));
vi.mock('../src/services/workspaceService', () => ({ list: vi.fn() }));
vi.mock('../src/services/aiService', () => ({ languages: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => navigate }));
beforeEach(() => { cleanup(); vi.clearAllMocks(); });

describe('controls for a seminar attendee', () => {
  const base = { audio: false, video: false, canVideo: false, onToggleAudio: vi.fn(), onToggleVideo: vi.fn(), onLeave: vi.fn(), panel: null, onPanel: vi.fn() };
  it('microphone and camera are shown but DISABLED, with a reason, and cannot be switched on', () => {
    render(<MeetingControls {...base} locked hidePeople />);
    const mic = screen.getByRole('button', { name: /microphone is off\. only the host speaks/i }), cam = screen.getByRole('button', { name: /camera is off\. only the host shows video/i });
    expect(mic.disabled).toBe(true); expect(cam.disabled).toBe(true);
    fireEvent.click(mic); fireEvent.click(cam); expect(base.onToggleAudio).not.toHaveBeenCalled(); expect(base.onToggleVideo).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /^(un)?mute microphone$|turn camera/i })).toBeNull();
  });
  it('chat and leave stay available; the participants button is hidden for attendees but present for everyone else', () => {
    const { rerender } = render(<MeetingControls {...base} locked hidePeople />);
    expect(screen.getByRole('button', { name: 'Chat' }).disabled).toBe(false); expect(screen.getByRole('button', { name: /leave/i }).disabled).toBe(false);
    expect(screen.queryByRole('button', { name: /participants/i })).toBeNull();
    rerender(<MeetingControls {...base} audio video canVideo />);
    expect(screen.getByRole('button', { name: 'Mute microphone' }).disabled).toBe(false); expect(screen.getByRole('button', { name: /participants/i })).toBeTruthy();
  });
});

describe('Create meeting: seminar', () => {
  const setup = async () => { workspaceService.list.mockResolvedValue([{ id: 'w1', name: 'Team' }]); aiService.languages.mockResolvedValue([{ code: 'en', name: 'English', native: 'English' }]); meetingService.create.mockResolvedValue({ meeting: { id: 'm1', roomCode: 'CODE12345678' }, unknownEmails: [] }); render(<MemoryRouter><CreateMeeting /></MemoryRouter>); await screen.findByLabelText('Title'); };
  const submit = async () => { fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Talk' } }); fireEvent.click(screen.getByRole('button', { name: /start meeting/i })); await waitFor(() => expect(meetingService.create).toHaveBeenCalled()); return meetingService.create.mock.calls[0][0]; };

  it('is a normal meeting by default: no seminar fields, and the private/workspace choice is there', async () => {
    await setup(); expect(screen.getByRole('radio', { name: /^meeting/i }).checked).toBe(true); expect(screen.queryByLabelText(/anyone with the link can attend/i)).toBeNull();
    expect(screen.getByText(/who can see this meeting's transcript/i)).toBeTruthy();
    const body = await submit(); expect(body).not.toHaveProperty('seminar'); expect(body).not.toHaveProperty('openLink'); expect(body.visibility).toBe('private');
  });
  it('choosing Seminar offers "anyone with the link can attend" (on by default), explains the host-only records, and sends a seminar', async () => {
    await setup(); fireEvent.click(screen.getByRole('radio', { name: /^seminar/i }));
    expect(screen.getByLabelText(/anyone with the link can attend/i).checked).toBe(true);
    expect(screen.getByText(/only you can see a seminar’s transcript, summary and recording/i)).toBeTruthy();
    expect(screen.queryByText(/who can see this meeting's transcript/i)).toBeNull();                    // not applicable: the records are the host's alone
    const body = await submit(); expect(body).toMatchObject({ seminar: true, openLink: true }); expect(body).not.toHaveProperty('visibility');
  });
  it('the open link can be turned off', async () => {
    await setup(); fireEvent.click(screen.getByRole('radio', { name: /^seminar/i })); fireEvent.click(screen.getByLabelText(/anyone with the link can attend/i));
    expect((await submit())).toMatchObject({ seminar: true, openLink: false });
  });
});

describe('Participants panel in a seminar (host view)', () => {
  const people = [{ key: 'self', name: 'Ana', isSelf: true, userId: 'u1', media: {} }, { key: 's2', name: 'Olga', isSelf: false, userId: 'u2', media: { audio: false, video: false } }];
  it('lists the attendees with Remove, but there is no mute/camera control or Mute all (attendees have neither)', () => {
    const onRemove = vi.fn(); render(<ParticipantList seminar isHost people={people} hostId="u1" invite={{ link: 'l', code: 'c' }} onMute={vi.fn()} onMuteAll={vi.fn()} onRemove={onRemove} onAdmit={vi.fn()} onDeny={vi.fn()} />);
    expect(screen.getByText('Olga')).toBeTruthy(); expect(screen.getByRole('button', { name: 'Remove Olga from the meeting' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /mute|camera|turn off/i })).toBeNull();
  });
});

describe('useWebRTC in a seminar: a star, host sends, attendees only receive', () => {
  class FakePC {
    static all = [];
    constructor() { this.transceivers = []; this.remoteDescription = null; this.addIceCandidate = vi.fn().mockResolvedValue(); FakePC.all.push(this); }
    addTrack(t) { const tr = { sender: { track: t, replaceTrack: vi.fn().mockResolvedValue() }, receiver: { track: { kind: t.kind } }, direction: 'sendrecv' }; this.transceivers.push(tr); return tr.sender; }
    addTransceiver(trackOrKind, o) { const kind = typeof trackOrKind === 'string' ? trackOrKind : trackOrKind.kind; const tr = { sender: { track: typeof trackOrKind === 'string' ? null : trackOrKind, replaceTrack: vi.fn().mockResolvedValue() }, receiver: { track: { kind } }, direction: o.direction }; this.transceivers.push(tr); return tr; }
    getTransceivers() { return this.transceivers; }
    async createOffer() { return { type: 'offer', sdp: 'o' }; } async createAnswer() { return { type: 'answer', sdp: 'a' }; }
    async setLocalDescription(d) { this.localDescription = d; }
    async setRemoteDescription(d) { this.remoteDescription = d; if (d.sdp === 'remote-video') this.transceivers.push({ sender: { track: null }, receiver: { track: { kind: 'video' } }, direction: 'recvonly' }); }
    close() {}
  }
  const track = (kind) => ({ kind, id: `${kind}1` });
  const local = { getTracks: () => [track('audio'), track('video')], getAudioTracks: () => [track('audio')], getVideoTracks: () => [track('video')] };
  const fakeSocket = (acks) => { const h = {}; const s = { emitted: [], on: (e, f) => { (h[e] ||= []).push(f); }, off: (e, f) => { h[e] = (h[e] || []).filter((x) => x !== f); }, trigger: (e, p) => act(async () => { await Promise.all((h[e] || []).map((f) => f(p))); }), emit: vi.fn((ev, payload, cb) => { s.emitted.push([ev, payload]); if (ev === 'room:join') cb?.(acks.shift()); else cb?.({ ok: true }); }) }; return s; };
  const setup = (socket, opts) => renderHook(() => useWebRTC({ roomCode: 'room-abc123', enabled: true, ...opts }), { wrapper: ({ children }) => <SocketContext.Provider value={{ getSocket: () => socket }}>{children}</SocketContext.Provider> });
  const sent = (s, ev) => s.emitted.filter(([e]) => e === ev).map(([, p]) => p);
  beforeEach(() => { FakePC.all = []; globalThis.RTCPeerConnection = FakePC; });

  it('an attendee never offers, never adds local media, and stays receive-only when the host\'s offer arrives', async () => {
    const s = fakeSocket([{ ok: true, selfId: 'me', peers: [{ socketId: 'h1', userId: 'host', name: 'Host' }] }]);
    const { result } = setup(s, { localStream: null, seminar: true, isHost: false });
    await waitFor(() => expect(result.current.status).toBe('joined')); await act(async () => {});
    expect(sent(s, 'rtc:offer')).toEqual([]); expect(FakePC.all).toHaveLength(0);                     // waits for the host
    await s.trigger('rtc:offer', { from: 'h1', userId: 'host', data: { type: 'offer', sdp: 'remote-video' } });
    await waitFor(() => expect(sent(s, 'rtc:answer')).toHaveLength(1)); expect(sent(s, 'rtc:answer')[0].to).toBe('h1');
    const pc = FakePC.all[0]; expect(pc.transceivers.every((t) => t.direction === 'recvonly')).toBe(true); expect(pc.transceivers.every((t) => !t.sender.track)).toBe(true);
  });
  it('control: in a normal meeting the same incoming video transceiver IS upgraded to send (so a seminar really is different)', async () => {
    const s = fakeSocket([{ ok: true, selfId: 'me', peers: [] }]); const { result } = setup(s, { localStream: null, seminar: false, isHost: false });
    await waitFor(() => expect(result.current.status).toBe('joined'));
    await s.trigger('rtc:offer', { from: 'p1', userId: 'u', data: { type: 'offer', sdp: 'remote-video' } }); await waitFor(() => expect(FakePC.all).toHaveLength(1));
    expect(FakePC.all[0].transceivers.some((t) => t.direction === 'sendrecv')).toBe(true);
  });
  it('the seminar host offers SEND-ONLY to every attendee already there, and to each new one', async () => {
    const s = fakeSocket([{ ok: true, selfId: 'me', peers: [{ socketId: 'a1', userId: 'u1', name: 'Olga' }, { socketId: 'a2', userId: 'u2', name: 'Bob' }] }]);
    const { result } = setup(s, { localStream: local, seminar: true, isHost: true });
    await waitFor(() => expect(sent(s, 'rtc:offer').map((o) => o.to).sort()).toEqual(['a1', 'a2']));
    await s.trigger('peer:joined', { peer: { socketId: 'a3', userId: 'u3', name: 'Carol' } });
    await waitFor(() => expect(sent(s, 'rtc:offer').map((o) => o.to)).toContain('a3'));
    expect(FakePC.all).toHaveLength(3);
    for (const pc of FakePC.all) { expect(pc.transceivers.length).toBeGreaterThan(0); expect(pc.transceivers.every((t) => t.direction === 'sendonly')).toBe(true); }   // nothing can come back
    expect(result.current.peers.map((p) => p.name)).toEqual(['Olga', 'Bob', 'Carol']);
  });
  it('a seminar host without a camera still gets a send-only video slot (so a screen share works)', async () => {
    const s = fakeSocket([{ ok: true, selfId: 'me', peers: [{ socketId: 'a1', userId: 'u1', name: 'Olga' }] }]);
    setup(s, { localStream: null, seminar: true, isHost: true });
    await waitFor(() => expect(FakePC.all).toHaveLength(1));
    expect(FakePC.all[0].transceivers.map((t) => [t.receiver.track.kind, t.direction])).toEqual([['video', 'sendonly']]);
  });
});