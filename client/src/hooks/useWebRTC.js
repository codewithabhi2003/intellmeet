import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from './useSocket';
import * as meetingService from '../services/meetingService';

// Mesh WebRTC over the Socket.io signaling channel.
// Rule that avoids offer glare: the NEW joiner sends offers to everyone already in the room; existing peers only answer.
const DEFAULT_MEDIA = { audio: true, video: true, screen: false, recording: false };
const mk = (p) => ({ socketId: p.socketId, userId: p.userId, name: p.name || 'Participant', media: { ...DEFAULT_MEDIA, ...(p.media || {}) }, stream: null, state: 'new' });
const desc = (d) => ({ type: d.type, sdp: d.sdp });

export function useWebRTC({ roomCode, localStream, enabled, onHostMute }) {
  const { getSocket } = useSocket();
  const [status, setStatus] = useState('idle');           // idle | joining | waiting | joined | denied | removed | error | ended | disconnected
  const [error, setError] = useState(null);
  const [peers, setPeers] = useState([]);
  const [selfId, setSelfId] = useState(null);
  const [waiting, setWaiting] = useState([]);           // host only: people waiting to be let in
  const muteRef = useRef(onHostMute); muteRef.current = onHostMute;
  const pcs = useRef(new Map());
  const pending = useRef(new Map());                       // ICE candidates that arrived before the remote description
  const ice = useRef([]);
  const local = useRef(localStream);
  local.current = localStream;

  const addPeer = useCallback((p) => setPeers((l) => (l.some((x) => x.socketId === p.socketId) ? l.map((x) => (x.socketId === p.socketId && p.name ? { ...x, name: p.name, userId: p.userId, media: { ...x.media, ...(p.media || {}) } } : x)) : [...l, mk(p)])), []);
  const patchPeer = useCallback((id, patch) => setPeers((l) => l.map((p) => (p.socketId === id ? { ...p, ...patch } : p))), []);
  const dropPeer = useCallback((id) => { pcs.current.get(id)?.close(); pcs.current.delete(id); pending.current.delete(id); setPeers((l) => l.filter((p) => p.socketId !== id)); }, []);

  const createPc = useCallback((id, { withLocal }) => {
    const socket = getSocket();
    const pc = new RTCPeerConnection({ iceServers: ice.current });
    pcs.current.set(id, pc);
    pc.onicecandidate = (e) => { if (e.candidate) socket.emit('rtc:ice', { to: id, data: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate }); };
    pc.ontrack = (e) => patchPeer(id, { stream: e.streams[0] });
    pc.onconnectionstatechange = () => patchPeer(id, { state: pc.connectionState });
    if (withLocal) {
      const ls = local.current;
      ls?.getTracks().forEach((t) => pc.addTrack(t, ls));
      // make sure a send-capable video transceiver exists, so screen share can use replaceTrack (no renegotiation)
      if (!ls?.getAudioTracks().length) pc.addTransceiver('audio', { direction: 'recvonly' });
      if (!ls?.getVideoTracks().length) pc.addTransceiver('video', { direction: 'sendrecv' });
    }
    return pc;
  }, [getSocket, patchPeer]);

  const flushIce = useCallback(async (id, pc) => {
    for (const c of pending.current.get(id) || []) { try { await pc.addIceCandidate(c); } catch { /* stale candidate */ } }
    pending.current.delete(id);
  }, []);

  const makeOffer = useCallback(async (id) => {
    const pc = createPc(id, { withLocal: true });
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    getSocket().emit('rtc:offer', { to: id, data: desc(pc.localDescription || offer) });
  }, [createPc, getSocket]);

  const onOffer = useCallback(async ({ from, userId, data }) => {
    addPeer({ socketId: from, userId });
    pcs.current.get(from)?.close();
    const pc = createPc(from, { withLocal: false });
    await pc.setRemoteDescription(data);
    const ls = local.current;
    ls?.getTracks().forEach((t) => pc.addTrack(t, ls));
    pc.getTransceivers?.().forEach((t) => { if (!t.sender.track && t.direction === 'recvonly' && t.receiver.track?.kind === 'video') t.direction = 'sendrecv'; });
    await flushIce(from, pc);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    getSocket().emit('rtc:answer', { to: from, data: desc(pc.localDescription || answer) });
  }, [addPeer, createPc, flushIce, getSocket]);

  const onAnswer = useCallback(async ({ from, data }) => {
    const pc = pcs.current.get(from); if (!pc) return;
    await pc.setRemoteDescription(data);
    await flushIce(from, pc);
  }, [flushIce]);

  const onIce = useCallback(async ({ from, data }) => {
    const pc = pcs.current.get(from);
    if (pc?.remoteDescription) { try { await pc.addIceCandidate(data); } catch { /* ignore */ } }
    else pending.current.set(from, [...(pending.current.get(from) || []), data]);
  }, []);

  useEffect(() => {
    if (!enabled || !roomCode) return undefined;
    const socket = getSocket();
    const connections = pcs.current, queued = pending.current;   // stable Map instances, captured for the cleanup
    let cancelled = false;
    const handlers = {
      'peer:joined': ({ peer }) => addPeer(peer),
      'peer:left': ({ socketId }) => dropPeer(socketId),
      'rtc:offer': (m) => onOffer(m).catch(() => {}),
      'rtc:answer': (m) => onAnswer(m).catch(() => {}),
      'rtc:ice': (m) => onIce(m),
      'media:state': ({ socketId, media }) => patchPeer(socketId, { media }),
      'meeting:ended': () => setStatus('ended'),
      'lobby:update': ({ waiting: w }) => setWaiting(Array.isArray(w) ? w : []),
      'lobby:admitted': () => { setStatus('joining'); join(); },       // the host let us in: join the room for real
      'lobby:denied': () => setStatus('denied'),
      'host:removed': () => { connections.forEach((pc) => pc.close()); connections.clear(); queued.clear(); setPeers([]); setStatus('removed'); },
      'host:force-mute': ({ kind }) => muteRef.current?.(kind),         // the page turns the track off; the person can switch it back on
      disconnect: () => { if (!cancelled) setStatus((s) => (s === 'ended' ? s : 'disconnected')); },
    };
    const join = async () => {
      try {
        ice.current = await meetingService.rtcConfig();
        const ack = await new Promise((res) => socket.emit('room:join', { roomCode }, res));
        if (cancelled) return;
        if (!ack?.ok) { setError(ack || { message: 'Could not join the room.' }); setStatus('error'); return; }
        if (ack.waiting) { setStatus('waiting'); return; }               // waiting room: the host has to let us in
        setSelfId(ack.selfId);
        ack.peers.forEach(addPeer);
        setStatus('joined');
        for (const p of ack.peers) await makeOffer(p.socketId);     // new joiner offers to existing peers
      } catch (e) {
        if (!cancelled) { setError({ message: e?.response?.data?.message || 'Could not join the room.' }); setStatus('error'); }
      }
    };
    Object.entries(handlers).forEach(([ev, fn]) => socket.on(ev, fn));
    setStatus('joining'); setError(null);
    join();

    return () => {
      cancelled = true;
      Object.entries(handlers).forEach(([ev, fn]) => socket.off(ev, fn));
      socket.emit('room:leave');
      connections.forEach((pc) => pc.close()); connections.clear(); queued.clear();
      setPeers([]); setSelfId(null); setWaiting([]);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, roomCode]);

  const sendMedia = useCallback((media) => getSocket().emit('media:state', media), [getSocket]);
  // Swap the outgoing video (camera <-> screen) on every connection without renegotiating.
  const replaceVideoTrack = useCallback((track) => {
    pcs.current.forEach((pc) => pc.getTransceivers().filter((t) => t.receiver.track?.kind === 'video').forEach((t) => { t.sender.replaceTrack(track).catch(() => {}); }));
  }, []);

  // Host actions. Each resolves with the server's answer ({ ok, code, message }); the server checks the host on every one.
  const act = useCallback((ev, payload) => new Promise((res) => getSocket().emit(ev, payload, (a) => res(a || { ok: false, message: 'No answer from the server.' }))), [getSocket]);
  const admit = useCallback((socketId) => act('lobby:admit', { socketId }), [act]);
  const deny = useCallback((socketId) => act('lobby:deny', { socketId }), [act]);
  const muteUser = useCallback((socketId, kind) => act('host:mute', { socketId, kind }), [act]);
  const muteAll = useCallback(() => act('host:mute-all', { kind: 'audio' }), [act]);
  const removeUser = useCallback((socketId) => act('host:remove', { socketId }), [act]);

  return { status, error, peers, selfId, waiting, sendMedia, replaceVideoTrack, admit, deny, muteUser, muteAll, removeUser };
}