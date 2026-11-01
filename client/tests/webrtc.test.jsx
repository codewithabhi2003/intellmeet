import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { SocketContext } from '../src/context/SocketContext';
import { useWebRTC } from '../src/hooks/useWebRTC';

vi.mock('../src/services/meetingService', () => ({ rtcConfig: vi.fn().mockResolvedValue([{ urls: ['stun:test'] }]) }));

class FakePC {
  static all = [];
  constructor(cfg) { this.cfg = cfg; this.remoteDescription = null; this.localDescription = null; this.transceivers = []; this.closed = false; this.addIceCandidate = vi.fn().mockResolvedValue(); FakePC.all.push(this); }
  addTrack(t) { const tr = { sender: { track: t, replaceTrack: vi.fn().mockResolvedValue() }, receiver: { track: { kind: t.kind } }, direction: 'sendrecv' }; this.transceivers.push(tr); return tr.sender; }
  addTransceiver(kind, { direction }) { const tr = { sender: { track: null, replaceTrack: vi.fn().mockResolvedValue() }, receiver: { track: { kind } }, direction }; this.transceivers.push(tr); return tr; }
  getTransceivers() { return this.transceivers; }
  async createOffer() { return { type: 'offer', sdp: 'o' }; }
  async createAnswer() { return { type: 'answer', sdp: 'a' }; }
  async setLocalDescription(d) { this.localDescription = d; }
  async setRemoteDescription(d) { this.remoteDescription = d; }
  close() { this.closed = true; }
}
const track = (kind) => ({ kind, id: `${kind}1`, enabled: true });
const localStream = { getTracks: () => [track('audio'), track('video')], getAudioTracks: () => [track('audio')], getVideoTracks: () => [track('video')] };

function fakeSocket(joinAck) {
  const h = {};
  const s = { emitted: [], on: (e, f) => { (h[e] ||= []).push(f); }, off: (e, f) => { h[e] = (h[e] || []).filter((x) => x !== f); },
    trigger: (e, p) => act(async () => { await Promise.all((h[e] || []).map((f) => f(p))); }),
    emit: vi.fn((ev, payload, cb) => { s.emitted.push([ev, payload]); if (ev === 'room:join' && cb) cb(joinAck); }) };
  return s;
}
const setup = (socket) => renderHook(() => useWebRTC({ roomCode: 'room-abc123', localStream, enabled: true }),
  { wrapper: ({ children }) => <SocketContext.Provider value={{ getSocket: () => socket }}>{children}</SocketContext.Provider> });
const sent = (s, ev) => s.emitted.filter(([e]) => e === ev).map(([, p]) => p);

beforeEach(() => { FakePC.all = []; globalThis.RTCPeerConnection = FakePC; });

describe('useWebRTC (fake RTCPeerConnection + fake socket)', () => {
  it('joins, then the NEW joiner sends an offer to every existing peer (no glare)', async () => {
    const socket = fakeSocket({ ok: true, selfId: 'me', peers: [{ socketId: 'p1', userId: 'u1', name: 'Ana' }, { socketId: 'p2', userId: 'u2', name: 'Raj' }] });
    const { result } = setup(socket);
    await waitFor(() => expect(result.current.status).toBe('joined'));
    await waitFor(() => expect(sent(socket, 'rtc:offer')).toHaveLength(2));
    expect(sent(socket, 'room:join')[0]).toEqual({ roomCode: 'room-abc123' });
    expect(sent(socket, 'rtc:offer').map((o) => o.to).sort()).toEqual(['p1', 'p2']);
    expect(sent(socket, 'rtc:offer')[0].data).toEqual({ type: 'offer', sdp: 'o' });
    expect(result.current.peers.map((p) => p.name)).toEqual(['Ana', 'Raj']);
    expect(FakePC.all[0].cfg.iceServers).toEqual([{ urls: ['stun:test'] }]);        // ICE servers come from the API, not hardcoded
  });

  it('an existing peer only answers: offer in -> answer out; ICE that arrives early is queued then applied', async () => {
    const socket = fakeSocket({ ok: true, selfId: 'me', peers: [] });
    const { result } = setup(socket);
    await waitFor(() => expect(result.current.status).toBe('joined'));
    await socket.trigger('peer:joined', { peer: { socketId: 'new1', userId: 'u9', name: 'Mia' } });
    await socket.trigger('rtc:ice', { from: 'new1', data: { candidate: 'early' } });           // before any peer connection exists
    await socket.trigger('rtc:offer', { from: 'new1', userId: 'u9', data: { type: 'offer', sdp: 'remote' } });
    await waitFor(() => expect(sent(socket, 'rtc:answer')).toHaveLength(1));
    expect(sent(socket, 'rtc:answer')[0]).toEqual({ to: 'new1', data: { type: 'answer', sdp: 'a' } });
    expect(sent(socket, 'rtc:offer')).toHaveLength(0);                                          // never offers back
    const pc = FakePC.all[0];
    expect(pc.remoteDescription).toEqual({ type: 'offer', sdp: 'remote' });
    expect(pc.addIceCandidate).toHaveBeenCalledWith({ candidate: 'early' });                    // flushed after the remote description
    await socket.trigger('rtc:ice', { from: 'new1', data: { candidate: 'late' } });
    expect(pc.addIceCandidate).toHaveBeenCalledWith({ candidate: 'late' });                     // applied directly once ready
  });

  it('answer completes the offer; media:state and peer:left update the roster and close connections', async () => {
    const socket = fakeSocket({ ok: true, selfId: 'me', peers: [{ socketId: 'p1', userId: 'u1', name: 'Ana' }] });
    const { result } = setup(socket);
    await waitFor(() => expect(sent(socket, 'rtc:offer')).toHaveLength(1));
    await socket.trigger('rtc:answer', { from: 'p1', data: { type: 'answer', sdp: 'theirs' } });
    expect(FakePC.all[0].remoteDescription).toEqual({ type: 'answer', sdp: 'theirs' });
    await socket.trigger('media:state', { socketId: 'p1', media: { audio: false, video: true, screen: true, recording: true } });
    expect(result.current.peers[0].media).toMatchObject({ audio: false, screen: true, recording: true });
    await socket.trigger('peer:left', { socketId: 'p1' });
    expect(result.current.peers).toHaveLength(0); expect(FakePC.all[0].closed).toBe(true);
  });

  it('screen share swaps the outgoing video on every connection (no renegotiation)', async () => {
    const socket = fakeSocket({ ok: true, selfId: 'me', peers: [{ socketId: 'p1', userId: 'u1', name: 'A' }, { socketId: 'p2', userId: 'u2', name: 'B' }] });
    const { result } = setup(socket);
    await waitFor(() => expect(sent(socket, 'rtc:offer')).toHaveLength(2));
    const screen = { kind: 'video', id: 'screen' };
    act(() => result.current.replaceVideoTrack(screen));
    for (const pc of FakePC.all) {
      const video = pc.transceivers.filter((t) => t.receiver.track.kind === 'video');
      expect(video).toHaveLength(1); expect(video[0].sender.replaceTrack).toHaveBeenCalledWith(screen);
    }
    expect(sent(socket, 'rtc:offer')).toHaveLength(2);
    act(() => result.current.sendMedia({ screen: true }));
    expect(sent(socket, 'media:state')).toEqual([{ screen: true }]);
  });

  it('a refused join surfaces the server message; meeting:ended and disconnect change status', async () => {
    const bad = fakeSocket({ ok: false, code: 'ROOM_FULL', message: 'Mesh calls support up to 6 participants.' });
    const r1 = setup(bad);
    await waitFor(() => expect(r1.result.current.status).toBe('error'));
    expect(r1.result.current.error.message).toMatch(/up to 6/);
    r1.unmount();

    const ok = fakeSocket({ ok: true, selfId: 'me', peers: [] });
    const r2 = setup(ok);
    await waitFor(() => expect(r2.result.current.status).toBe('joined'));
    await ok.trigger('disconnect'); expect(r2.result.current.status).toBe('disconnected');
    await ok.trigger('meeting:ended', { meetingId: 'm' }); expect(r2.result.current.status).toBe('ended');
  });

  it('leaving (unmount) tells the server and closes every connection', async () => {
    const socket = fakeSocket({ ok: true, selfId: 'me', peers: [{ socketId: 'p1', userId: 'u1', name: 'A' }] });
    const { unmount } = setup(socket);
    await waitFor(() => expect(sent(socket, 'rtc:offer')).toHaveLength(1));
    unmount();
    expect(sent(socket, 'room:leave')).toHaveLength(1); expect(FakePC.all.every((p) => p.closed)).toBe(true);
  });
});
