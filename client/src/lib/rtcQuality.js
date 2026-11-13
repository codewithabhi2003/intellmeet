// client/src/lib/rtcQuality.js
// Adaptive-quality helpers for the mesh WebRTC hook (useWebRTC.js).
//
// Why this exists: in a mesh call every browser encodes and uploads ONE VIDEO PER OTHER PERSON. Upload bandwidth and CPU are the real
// limits, not the code. So the ladder below gives each connection a smaller share as more people join, and the hook steps a
// connection down (or back up) from live stats, so video stays smooth instead of freezing.

// Quality ladder, best (0) to worst (4). `scale` is how much the camera picture is shrunk before sending.
export const LADDER = [
  { name: '720p60', scale: 1, fps: 60, bitrate: 3_000_000 },
  { name: '720p30', scale: 1, fps: 30, bitrate: 1_500_000 },
  { name: '540p30', scale: 1.33, fps: 30, bitrate: 900_000 },
  { name: '360p30', scale: 2, fps: 30, bitrate: 450_000 },
  { name: '240p24', scale: 3, fps: 24, bitrate: 200_000 },
];
export const WORST = LADDER.length - 1;

export const AUDIO_MAX_BITRATE = 40_000;          // clear full-band mono voice (speech is already transparent at 32-40 kbps). With RED (below), at most about 82 kbps per person goes on the wire (less while the person is quiet)

// What the microphone should do before the voice is encoded: cancel echo, suppress steady background noise (fans, AC, hum) and
// even out the volume, as mono 48 kHz, which is what the Opus voice codec is built for. These are requests ("ideal"): a browser or
// microphone that cannot do one of them keeps its own behaviour. Use the same object in getUserMedia({ audio: AUDIO_CONSTRAINTS }).
export const AUDIO_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
  sampleRate: 48000,
  sampleSize: 16,
};
export const VIDEO_JITTER_TARGET_MS = 150;        // small extra receive buffer: smoother playback on jittery links (tune 0-300)
export const SCREEN = { bitrate: 2_500_000, fps: 15 };   // screen share: sharp text matters more than motion
export const FALLBACK_ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];

// Best level a connection may use, from how many other people this browser is uploading to.
//   1 other person  -> 720p up to 60 fps      2 -> 720p30      3 (a 4-person call) -> 540p30
//   4-7 -> 360p30                             8+ (seminar host) -> 240p24
export const ceilingLevel = (remotePeers) => {
  if (remotePeers <= 1) return 0;
  if (remotePeers === 2) return 1;
  if (remotePeers === 3) return 2;
  return remotePeers < 8 ? 3 : WORST;
};

// ---- Audio redundancy (RED, RFC 2198) ---------------------------------------------------------------------------------------
// With RED every audio packet also carries a copy of the one before it, so a lost packet is rebuilt instead of leaving a gap or a robotic
// glitch. Measured in Chromium with real speech and random packet loss (one run each, same voice, same link): at 12% loss about
// 4.2% of the audio was concealed (patched over) with Chrome's default Opus and 0.8% with RED; at 25% loss 7.2% versus 2.6%. The price is about
// twice the audio bytes, which is why AUDIO_MAX_BITRATE is 40 kbps (at most about 82 kbps on the wire, measured with non-stop speech). If the other browser does not support RED,
// plain Opus is used automatically.
export const AUDIO_RED = true;
export function preferAudioRed(pc) {
  try {
    if (!AUDIO_RED || typeof RTCRtpReceiver === 'undefined' || !RTCRtpReceiver.getCapabilities) return;
    const caps = RTCRtpReceiver.getCapabilities('audio');
    if (!caps || !caps.codecs.some((c) => c.mimeType.toLowerCase() === 'audio/red')) return;
    const rank = (c) => { const m = c.mimeType.toLowerCase(); return m === 'audio/red' ? 0 : m === 'audio/opus' ? 1 : 2; };
    const codecs = [...caps.codecs].sort((a, b) => rank(a) - rank(b));          // RED, then Opus, then the rest in their own order
    pc.getTransceivers().forEach((tr) => { if (tr.receiver?.track?.kind === 'audio' && tr.setCodecPreferences) tr.setCodecPreferences(codecs); });
  } catch { /* not supported here: plain Opus */ }
}

// ---- AI noise removal (lib/micProcessing.js) --------------------------------------------------------------------------------
// canDenoise: this browser can run the model at all (AudioWorklet + WebAssembly). pickDenoiseModel: which model to use, or null for none.
// Override without a rebuild: localStorage.setItem('intellmeet.denoise', 'off' | 'gtcrn' | 'rnnoise' | 'auto'), or set VITE_ML_DENOISE.
// Default ('auto'): the stronger model (gtcrn) on computers with 4+ cores, the lighter one (rnnoise) on 2-3 cores, and none on phones and
// tablets, where the browser's own noise suppression is used.
export const canDenoise = () => typeof window !== 'undefined' && typeof WebAssembly === 'object' && typeof AudioWorkletNode !== 'undefined' && typeof window.AudioContext === 'function';
export function pickDenoiseModel() {
  let pref = 'auto';
  try { pref = String((typeof localStorage !== 'undefined' && localStorage.getItem('intellmeet.denoise')) || import.meta.env.VITE_ML_DENOISE || 'auto').toLowerCase(); } catch { /* storage blocked: use the default */ }
  if (pref === 'off' || pref === 'false' || pref === '0') return null;
  if (pref === 'gtcrn' || pref === 'rnnoise') return pref;
  const ua = globalThis.navigator?.userAgent || '';
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && (globalThis.navigator?.maxTouchPoints || 0) > 1)) return null;
  return (globalThis.navigator?.hardwareConcurrency || 2) >= 4 ? 'gtcrn' : 'rnnoise';
}

export const isScreenTrack = (track) => !!track && (track.contentHint === 'detail' || !!track.getSettings?.().displaySurface);

// Ask the camera for 720p at the frame rate we can actually send, and tell the browser that motion matters more than sharpness
// (so under pressure it lowers resolution before it lowers fps). Safe to call repeatedly.
export async function tuneCaptureTrack(track, fps) {
  if (!track || track.kind !== 'video' || track.readyState !== 'live' || isScreenTrack(track)) return;
  try {
    track.contentHint = 'motion';
    await track.applyConstraints({ width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: fps, max: fps } });
  } catch { /* the camera cannot do that: keep what it gives */ }
}

// For the microphone the hook sends: marks it as voice (the encoder can then tune for speech) and says whether the browser reports
// echo cancellation, noise suppression and automatic gain as ON for it. Those three are chosen when the microphone is OPENED
// (getUserMedia); a test in Chromium showed they cannot be switched on afterwards with applyConstraints, so when this returns false
// the fix is in the code that opens the microphone: pass AUDIO_CONSTRAINTS there.
export function checkMicTrack(track) {
  if (!track || track.kind !== 'audio') return true;
  try { track.contentHint = 'speech'; } catch { /* read-only in some browsers */ }
  const s = track.getSettings?.() || {};
  return s.echoCancellation !== false && s.noiseSuppression !== false && s.autoGainControl !== false;
}

// Cap bitrate / fps / size of the outgoing video on one connection. Returns true when at least one sender accepted it.
export async function applySenderQuality(pc, level) {
  const L = LADDER[level];
  let applied = false;
  for (const sender of pc.getSenders()) {
    const track = sender.track;
    if (!track || track.kind !== 'video') continue;
    try {
      const params = sender.getParameters();
      if (!params.encodings || !params.encodings.length) continue;       // not negotiated yet; the next tick retries
      const enc = params.encodings[0];
      if (isScreenTrack(track)) { enc.maxBitrate = SCREEN.bitrate; enc.maxFramerate = SCREEN.fps; enc.scaleResolutionDownBy = 1; }
      else { enc.maxBitrate = L.bitrate; enc.maxFramerate = L.fps; enc.scaleResolutionDownBy = L.scale; }
      await sender.setParameters(params);
      applied = true;
    } catch { /* the browser refused: it keeps its own defaults */ }
  }
  return applied;
}

// Audio first: if the network is tight, a clear voice matters more than a sharp picture.
export async function prioritiseAudio(pc) {
  for (const sender of pc.getSenders()) {
    if (sender.track?.kind !== 'audio') continue;
    try {
      const params = sender.getParameters();
      if (!params.encodings || !params.encodings.length) continue;
      const enc = params.encodings[0];
      enc.maxBitrate = AUDIO_MAX_BITRATE; enc.priority = 'high'; enc.networkPriority = 'high';
      await sender.setParameters(params);
    } catch { /* not supported: ignore */ }
  }
}

// One snapshot of how the link to this peer is doing: round-trip time (seconds), packet loss (0-1), and why the encoder is limited.
export async function sampleLink(pc) {
  const report = await pc.getStats();
  let outbound = null, remote = null, pair = null;
  report.forEach((r) => {
    const kind = r.kind || r.mediaType;
    if (r.type === 'outbound-rtp' && kind === 'video') outbound = r;
    else if (r.type === 'remote-inbound-rtp' && kind === 'video') remote = r;
    else if (r.type === 'candidate-pair' && (r.selected || (r.nominated && r.state === 'succeeded'))) pair = pair || r;
  });
  return {
    rtt: remote?.roundTripTime ?? pair?.currentRoundTripTime ?? null,
    loss: remote?.fractionLost ?? null,
    limit: outbound?.qualityLimitationReason || 'none',       // 'none' | 'bandwidth' | 'cpu' | 'other'
  };
}

// Simple label the UI can show next to a participant.
export const classify = ({ rtt, loss }) => {
  const l = loss ?? 0, r = rtt ?? 0;
  if (l > 0.1 || r > 0.6) return 'poor';
  if (l > 0.03 || r > 0.3) return 'fair';
  return 'good';
};