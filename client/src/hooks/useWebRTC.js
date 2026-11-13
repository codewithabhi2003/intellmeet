// client/src/hooks/useWebRTC.js
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from './useSocket';
import * as meetingService from '../services/meetingService';
import {
  FALLBACK_ICE, LADDER, WORST, VIDEO_JITTER_TARGET_MS,
  ceilingLevel, isScreenTrack, tuneCaptureTrack, checkMicTrack, applySenderQuality, prioritiseAudio, preferAudioRed, canDenoise, pickDenoiseModel, sampleLink, classify,
} from '../lib/rtcQuality';

// Mesh WebRTC over the Socket.io signaling channel.
// A NEW connection avoids offer glare with one rule: the NEW joiner sends offers to everyone already in the room; existing peers only answer.
// Renegotiating a LIVE connection (ICE restart after a network drop) can start from either side, so it uses "perfect negotiation":
// the side that originally offered is impolite and wins a collision, the side that answered is polite and yields.
const DEFAULT_MEDIA = { audio: true, video: true, screen: false, recording: false };
const mk = (p) => ({ socketId: p.socketId, userId: p.userId, name: p.name || 'Participant', media: { ...DEFAULT_MEDIA, ...(p.media || {}) }, stream: null, state: 'new', quality: 'good' });
const desc = (d) => ({ type: d.type, sdp: d.sdp });
// The DTLS fingerprint identifies one RTCPeerConnection: an ICE restart keeps it, a brand-new connection always has a new one.
// That is how an incoming offer is told apart (renegotiation vs. new connection) without adding anything to the signaling messages.
const fingerprint = (sdp) => (String(sdp || '').match(/^a=fingerprint:(\S+ \S+)/m) || [])[1] || null;

const TICK_MS = 2500;     // how often every connection's link quality is sampled
const BLIP_MS = 2500;     // 'disconnected' often heals on its own: wait this long before restarting ICE
const RETRY_MS = 6000;    // while a connection stays down, try again this often
const MAX_TRIES = 8;      // then stop; the peer has most likely left (the server will tell us with peer:left)

function closePc(pc) {
  if (!pc) return;
  clearTimeout(pc._t);
  pc.onicecandidate = null; pc.ontrack = null; pc.onconnectionstatechange = null;
  try { pc.close(); } catch { /* already closed */ }
}

// First quality settings for a connection that just came up (later steps come from the adaptive tick).
async function prime(pc, level) {
  if (pc._level === undefined) pc._level = level;
  await prioritiseAudio(pc);
  if (await applySenderQuality(pc, pc._level)) pc._applied = pc._level;
}

export function useWebRTC({ roomCode, localStream, enabled, onHostMute, seminar = false, isHost = false }) {
  const { getSocket } = useSocket();
  const [status, setStatus] = useState('idle');           // idle | joining | waiting | joined | denied | removed | error | ended | disconnected
  const [error, setError] = useState(null);
  const [peers, setPeers] = useState([]);                 // each peer also carries `quality`: 'good' | 'fair' | 'poor'
  const [selfId, setSelfId] = useState(null);
  const [waiting, setWaiting] = useState([]);           // host only: people waiting to be let in
  const muteRef = useRef(onHostMute); muteRef.current = onHostMute;
  // Seminar: a STAR. The host sends to each attendee (send-only); attendees only receive and never offer or send media.
  const roleRef = useRef({}); roleRef.current = { attendee: seminar && !isHost, seminarHost: seminar && isHost };
  const pcs = useRef(new Map());
  const pending = useRef(new Map());                       // ICE candidates that arrived before the remote description
  const chains = useRef(new Map());                        // per-peer queue: offers, answers and candidates are handled strictly in order
  const ice = useRef([]);
  const local = useRef(localStream);
  local.current = localStream;
  const capture = useRef({ track: null, fps: 0 });
  const busy = useRef(false);
  const recoverRef = useRef(null);

  // The microphone we send is marked as voice. If it was opened WITHOUT echo cancellation / noise suppression / automatic gain, say so in
  // the console: those can only be chosen when the microphone is opened, so open it with AUDIO_CONSTRAINTS (lib/rtcQuality.js).
  const micTrack = localStream?.getAudioTracks?.()[0] || null;
  useEffect(() => {
    if (micTrack && !checkMicTrack(micTrack)) console.warn('[webrtc] the microphone was opened without noise suppression / echo cancellation. Open it with getUserMedia({ audio: AUDIO_CONSTRAINTS }).');
  }, [micTrack]);

  // AI noise removal (lib/micProcessing.js). While it is running, `micOut` holds the cleaned voice and that is what every connection sends
  // instead of the raw microphone; the page still owns the raw microphone (mute buttons keep working on it, and a muted microphone gives
  // a silent cleaned track). Anything unsupported or going wrong hands the plain microphone back: the call never depends on this.
  const micOut = useRef(null);
  const outTrack = useCallback((t) => (t.kind === 'audio' && micOut.current && micOut.current.readyState === 'live' ? micOut.current : t), []);
  useEffect(() => {                                             // download the model while the person is still in the lobby
    if (!micTrack || !canDenoise()) return;
    const model = pickDenoiseModel();
    if (model) import('../lib/micProcessing').then((m) => m.preloadMicModel(model)).catch(() => {});
  }, [micTrack]);
  useEffect(() => {
    if (!enabled || !micTrack || micTrack.readyState !== 'live' || roleRef.current.attendee || !canDenoise()) return undefined;
    let model = pickDenoiseModel();
    if (!model) return undefined;
    let cancelled = false, handle = null;
    const send = (track) => {                                   // `track` is the cleaned voice, or micTrack to go back to the plain microphone
      micOut.current = track === micTrack ? null : track;
      try { pcs.current.forEach((pc) => pc.getSenders().forEach((s) => { if (s.track?.kind === 'audio' && s.track !== track) s.replaceTrack(track).catch(() => {}); })); } catch { /* connections already closed */ }
    };
    const start = async () => {
      try {
        const mod = await import('../lib/micProcessing');
        if (cancelled) return;
        const h = await mod.startMicDenoise(micTrack, {
          model,
          onLost: (reason) => {                                 // it stopped working: back to the plain microphone
            handle = null; send(micTrack);
            if (reason === 'overload' && model === 'gtcrn' && !cancelled) { model = 'rnnoise'; start(); }   // slower computer: try the lighter model once
          },
        });
        if (cancelled) { h.stop(); return; }
        handle = h; send(h.track);
      } catch { /* not possible on this browser or computer: keep the plain microphone */ }
    };
    start();
    return () => { cancelled = true; if (handle) { handle.stop(); handle = null; } send(micTrack); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, micTrack]);

  // Keep the screen awake during the call: a phone that dims and locks pauses the camera and often drops the connection.
  // The browser releases the lock whenever the page is hidden, so it is asked for again each time the page is shown.
  useEffect(() => {
    if (!enabled || !roomCode || typeof navigator === 'undefined' || !navigator.wakeLock?.request) return undefined;
    let lock = null, off = false;
    const take = () => {
      if (off || document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      navigator.wakeLock.request('screen').then((l) => { if (off) l.release().catch(() => {}); else lock = l; }).catch(() => { /* not allowed right now (battery saver, ...): the call still works */ });
    };
    take();
    document.addEventListener('visibilitychange', take);
    return () => { off = true; document.removeEventListener('visibilitychange', take); lock?.release().catch(() => {}); };
  }, [enabled, roomCode]);

  const addPeer = useCallback((p) => setPeers((l) => (l.some((x) => x.socketId === p.socketId) ? l.map((x) => (x.socketId === p.socketId && p.name ? { ...x, name: p.name, userId: p.userId, media: { ...x.media, ...(p.media || {}) } } : x)) : [...l, mk(p)])), []);
  const patchPeer = useCallback((id, patch) => setPeers((l) => l.map((p) => (p.socketId === id ? { ...p, ...patch } : p))), []);
  const dropPeer = useCallback((id) => { closePc(pcs.current.get(id)); pcs.current.delete(id); pending.current.delete(id); chains.current.delete(id); setPeers((l) => l.filter((p) => p.socketId !== id)); }, []);

  // Runs fn after everything already queued for this peer. Without it, an ICE candidate can overtake the offer it belongs to.
  const enqueue = useCallback((id, fn) => {
    const run = (chains.current.get(id) || Promise.resolve()).then(fn);
    chains.current.set(id, run.catch(() => {}));
    return run;
  }, []);

  const createPc = useCallback((id, { withLocal, offerer }) => {
    const socket = getSocket();
    closePc(pcs.current.get(id));                          // a fresh connection always replaces the old one
    const pc = new RTCPeerConnection({ iceServers: ice.current, bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require' });
    pc._offerer = offerer; pc._tries = 0;
    pcs.current.set(id, pc);
    const schedule = (ms) => { clearTimeout(pc._t); pc._t = setTimeout(() => recoverRef.current?.(id, pc), ms); };
    pc.onicecandidate = (e) => { if (e.candidate) socket.emit('rtc:ice', { to: id, data: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate }); };
    pc.ontrack = (e) => {
      if (pcs.current.get(id) !== pc) return;
      try { if (e.track.kind === 'video' && 'jitterBufferTarget' in e.receiver) e.receiver.jitterBufferTarget = VIDEO_JITTER_TARGET_MS; } catch { /* not supported */ }
      let stream = e.streams[0];
      if (!stream) { stream = pc._ms || (pc._ms = new MediaStream()); stream.addTrack(e.track); }
      patchPeer(id, { stream });
    };
    pc.onconnectionstatechange = () => {
      if (pcs.current.get(id) !== pc) return;              // an old connection that was already replaced
      const s = pc.connectionState;
      patchPeer(id, { state: s });
      if (s === 'connected') { clearTimeout(pc._t); pc._tries = 0; prime(pc, ceilingLevel(pcs.current.size)).catch(() => {}); }
      else if (s === 'disconnected') schedule(BLIP_MS);    // probably a blip: give it a moment, then restart ICE
      else if (s === 'failed') schedule(0);
    };
    if (withLocal) {
      const ls = local.current;
      if (roleRef.current.seminarHost) {
        // send-only: the offer itself forbids attendees from sending anything back
        ls?.getTracks().forEach((t) => pc.addTransceiver(outTrack(t), { direction: 'sendonly', streams: [ls] }));
        if (!ls?.getVideoTracks().length) pc.addTransceiver('video', { direction: 'sendonly' });   // so a screen share can still use replaceTrack
      } else {
        ls?.getTracks().forEach((t) => pc.addTrack(outTrack(t), ls));
        // make sure a send-capable video transceiver exists, so screen share can use replaceTrack (no renegotiation)
        if (!ls?.getAudioTracks().length) pc.addTransceiver('audio', { direction: 'recvonly' });
        if (!ls?.getVideoTracks().length) pc.addTransceiver('video', { direction: 'sendrecv' });
      }
    }
    return pc;
  }, [getSocket, patchPeer, outTrack]);

  const flushIce = useCallback(async (id, pc) => {
    for (const c of pending.current.get(id) || []) { try { await pc.addIceCandidate(c); } catch { /* stale candidate */ } }
    pending.current.delete(id);
  }, []);

  // A brand-new connection to `id` (we are the offerer). The other side sees a new DTLS fingerprint and builds a new connection too.
  const makeOffer = useCallback((id) => enqueue(id, async () => {
    const pc = createPc(id, { withLocal: true, offerer: true });
    pc._making = true;
    try {
      preferAudioRed(pc);                                  // voice with a backup copy of each packet: survives lost packets
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      getSocket().emit('rtc:offer', { to: id, data: desc(pc.localDescription || offer) });
    } finally { pc._making = false; }
  }), [createPc, enqueue, getSocket]);

  // ICE restart on the SAME connection: finds a new network path (Wi-Fi -> mobile, router hiccup) without dropping the call.
  const restartIce = useCallback((id, pc) => enqueue(id, async () => {
    if (pcs.current.get(id) !== pc || pc.signalingState !== 'stable') return;
    pc._making = true;
    try {
      const offer = await pc.createOffer({ iceRestart: true });
      if (pc.signalingState !== 'stable') return;          // the other side's offer got in first; we answer that one instead
      await pc.setLocalDescription(offer);
      getSocket().emit('rtc:offer', { to: id, data: desc(pc.localDescription || offer) });
    } finally { pc._making = false; }
  }).catch(() => {}), [enqueue, getSocket]);

  // Called when a connection has been down for a while. A seminar attendee never offers; the host recovers its side.
  recoverRef.current = async (id, pc) => {
    if (pcs.current.get(id) !== pc || pc.connectionState === 'connected' || pc.connectionState === 'closed') return;
    if (roleRef.current.attendee || pc._tries >= MAX_TRIES) return;
    pc._tries += 1;
    if (pc._offerer && pc._tries > 2) await makeOffer(id).catch(() => {});   // restarts did not help: rebuild the connection from scratch
    else await restartIce(id, pc);
    if (pcs.current.get(id) === pc) pc._t = setTimeout(() => recoverRef.current?.(id, pc), RETRY_MS);
  };

  const onOffer = useCallback(({ from, userId, data }) => enqueue(from, async () => {
    addPeer({ socketId: from, userId });
    const sdp = desc(data || {});
    let pc = pcs.current.get(from);
    const known = pc && pc.signalingState !== 'closed' && fingerprint(pc.remoteDescription?.sdp);
    if (!known || fingerprint(sdp.sdp) !== known) {
      // a brand-new connection from the other side (first contact, or they rebuilt it): replace ours
      pc = createPc(from, { withLocal: false, offerer: false });
      await pc.setRemoteDescription(sdp);
      const ls = local.current;
      ls?.getTracks().forEach((t) => pc.addTrack(outTrack(t), ls));
      if (!roleRef.current.attendee)                                         // a seminar attendee stays receive-only
        pc.getTransceivers?.().forEach((t) => { if (!t.sender.track && t.direction === 'recvonly' && t.receiver.track?.kind === 'video') t.direction = 'sendrecv'; });
    } else {
      // renegotiating a live connection (ICE restart). If both sides offered at once, the original offerer wins.
      const collision = pc._making || pc.signalingState !== 'stable';
      if (collision && pc._offerer) return;
      if (collision) await pc.setLocalDescription({ type: 'rollback' }).catch(() => {});
      await pc.setRemoteDescription(sdp);
    }
    await flushIce(from, pc);
    preferAudioRed(pc);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    getSocket().emit('rtc:answer', { to: from, data: desc(pc.localDescription || answer) });
  }), [addPeer, createPc, enqueue, flushIce, getSocket, outTrack]);

  const onAnswer = useCallback(({ from, data }) => enqueue(from, async () => {
    const pc = pcs.current.get(from);
    if (!pc || (pc.signalingState && pc.signalingState !== 'have-local-offer')) return;   // a duplicate or outdated answer
    await pc.setRemoteDescription(desc(data || {}));
    await flushIce(from, pc);
  }), [enqueue, flushIce]);

  const onIce = useCallback(({ from, data }) => enqueue(from, async () => {
    const pc = pcs.current.get(from);
    if (pc?.remoteDescription) { try { await pc.addIceCandidate(data); } catch { /* ignore */ } }
    else pending.current.set(from, [...(pending.current.get(from) || []), data]);
  }), [enqueue]);

  // Every few seconds: read each connection's stats, show a quality label, and move it up or down the quality ladder.
  const tick = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const ceiling = ceilingLevel(pcs.current.size);
      let wantFps = 0;
      for (const [id, pc] of [...pcs.current]) {
        if (pc.connectionState !== 'connected' || !pc.getSenders().some((s) => s.track?.kind === 'video')) continue;
        const m = await sampleLink(pc).catch(() => null);
        if (!m || pcs.current.get(id) !== pc) continue;
        const q = classify(m);
        if (pc._q !== q) { pc._q = q; patchPeer(id, { quality: q }); }
        if (pc._level === undefined) pc._level = ceiling;
        pc._level = Math.max(pc._level, ceiling);                              // someone joined: never better than the new ceiling
        const loss = m.loss ?? 0, rtt = m.rtt ?? 0, now = Date.now();
        const struggling = loss > 0.08 || rtt > 0.6 || m.limit === 'cpu';
        const clean = loss < 0.02 && rtt < 0.25 && m.limit === 'none';
        if (struggling) {                                                      // step down quickly (at most one step every 4 s)
          pc._good = 0;
          if (pc._level < WORST && now - (pc._changed || 0) > 4000) { pc._level += 1; pc._changed = now; }
        } else if (clean) {                                                    // step back up slowly: 6 clean checks = about 15 s
          pc._good = (pc._good || 0) + 1;
          if (pc._good >= 6 && pc._level > ceiling) { pc._level -= 1; pc._good = 0; pc._changed = now; }
        } else pc._good = 0;
        if (pc._applied !== pc._level && await applySenderQuality(pc, pc._level)) pc._applied = pc._level;
        wantFps = Math.max(wantFps, LADDER[pc._level].fps);
      }
      const cam = local.current?.getVideoTracks()[0];
      const fps = wantFps || 30;
      if (cam && (capture.current.track !== cam || capture.current.fps !== fps)) { capture.current = { track: cam, fps }; tuneCaptureTrack(cam, fps); }
    } finally { busy.current = false; }
  }, [patchPeer]);

  useEffect(() => {
    if (!enabled || !roomCode) return undefined;
    const socket = getSocket();
    const connections = pcs.current, queued = pending.current, chainMap = chains.current;   // stable Map instances, captured for the cleanup
    let cancelled = false;
    let joined = false;                                                      // true after the first answer from the server
    const resetConnections = () => { connections.forEach(closePc); connections.clear(); queued.clear(); chainMap.clear(); setPeers([]); };
    // network came back or changed type: restart ICE on every live connection so media finds the new path
    const kick = () => { if (!roleRef.current.attendee) connections.forEach((pc, id) => restartIce(id, pc)); };
    let lastType = navigator.connection?.type;
    const onNetChange = () => { const t = navigator.connection?.type; if (t !== lastType) { lastType = t; kick(); } };
    const handlers = {
      'peer:joined': ({ peer }) => { addPeer(peer); if (roleRef.current.seminarHost) makeOffer(peer.socketId).catch(() => {}); },   // the host offers to each new attendee
      'peer:left': ({ socketId }) => dropPeer(socketId),
      'rtc:offer': (m) => onOffer(m).catch(() => {}),
      'rtc:answer': (m) => onAnswer(m).catch(() => {}),
      'rtc:ice': (m) => onIce(m).catch(() => {}),
      'media:state': ({ socketId, media }) => patchPeer(socketId, { media }),
      'meeting:ended': () => setStatus('ended'),
      'lobby:update': ({ waiting: w }) => setWaiting(Array.isArray(w) ? w : []),
      'lobby:admitted': () => { setStatus('joining'); join(); },       // the host let us in: join the room for real
      'lobby:denied': () => setStatus('denied'),
      'host:removed': () => { resetConnections(); setStatus('removed'); },
      'host:force-mute': ({ kind }) => muteRef.current?.(kind),         // the page turns the track off; the person can switch it back on
      disconnect: () => { if (!cancelled) setStatus((s) => (s === 'ended' ? s : 'disconnected')); },
      // Socket.IO reconnected on its own. The server dropped us from the room when the socket died and we have a new socket id,
      // so everyone's connection to us is gone: rejoin and rebuild, exactly like a first join.
      connect: () => { if (joined && !cancelled) { resetConnections(); join(); } },
    };
    const join = async () => {
      try {
        try { const cfg = await meetingService.rtcConfig(); if (Array.isArray(cfg) && cfg.length) ice.current = cfg; } catch { /* keep the last good list */ }
        if (!ice.current.length) ice.current = FALLBACK_ICE;               // STUN only: better than failing to start
        const ack = await new Promise((res) => {
          const t = setTimeout(() => res(null), 10000);                    // never hang forever if the socket dies mid-join
          socket.emit('room:join', { roomCode }, (a) => { clearTimeout(t); res(a); });
        });
        if (cancelled) return;
        if (!ack?.ok) { setError(ack || { message: 'Could not join the room.' }); setStatus('error'); return; }
        joined = true;
        if (ack.waiting) { setStatus('waiting'); return; }               // waiting room: the host has to let us in
        setSelfId(ack.selfId);
        ack.peers.forEach(addPeer);
        setStatus('joined');
        if (!roleRef.current.attendee) for (const p of ack.peers) await makeOffer(p.socketId);     // new joiner offers to existing peers (a seminar attendee waits for the host's offer)
      } catch (e) {
        if (!cancelled) { setError({ message: e?.response?.data?.message || 'Could not join the room.' }); setStatus('error'); }
      }
    };
    Object.entries(handlers).forEach(([ev, fn]) => socket.on(ev, fn));
    window.addEventListener('online', kick);
    navigator.connection?.addEventListener?.('change', onNetChange);
    const timer = setInterval(() => { tick(); }, TICK_MS);
    setStatus('joining'); setError(null);
    join();

    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('online', kick);
      navigator.connection?.removeEventListener?.('change', onNetChange);
      Object.entries(handlers).forEach(([ev, fn]) => socket.off(ev, fn));
      socket.emit('room:leave');
      connections.forEach(closePc); connections.clear(); queued.clear(); chainMap.clear();
      setPeers([]); setSelfId(null); setWaiting([]);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, roomCode]);

  const sendMedia = useCallback((media) => getSocket().emit('media:state', media), [getSocket]);
  // Swap the outgoing video (camera <-> screen) on every connection without renegotiating.
  const replaceVideoTrack = useCallback((track) => {
    if (track) { try { track.contentHint = isScreenTrack(track) ? 'detail' : 'motion'; } catch { /* read-only in some browsers */ } }
    pcs.current.forEach((pc) => pc.getTransceivers().filter((t) => t.receiver.track?.kind === 'video').forEach((t) => {
      t.sender.replaceTrack(track).then(() => { pc._applied = undefined; }).catch(() => {});   // re-apply bitrate/fps for the new kind of video
    }));
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