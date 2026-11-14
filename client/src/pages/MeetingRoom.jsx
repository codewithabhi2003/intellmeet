import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import ChatPanel from '../components/meeting/ChatPanel';
import ConsentBanner from '../components/meeting/ConsentBanner';
import MeetingControls from '../components/meeting/MeetingControls';
import ParticipantList from '../components/meeting/ParticipantList';
import PreJoin from '../components/meeting/PreJoin';
import ReactionButton from '../components/meeting/ReactionButton';
import ReactionLayer from '../components/meeting/ReactionLayer';
import RecorderControl from '../components/meeting/RecorderControl';
import RoomLayout from '../components/meeting/RoomLayout';
import ScreenShareButton from '../components/meeting/ScreenShareButton';
import VideoGrid from '../components/meeting/VideoGrid';
import LanguageIndicator from '../components/language/LanguageIndicator';
import StatusBadge from '../components/common/StatusBadge';
import { useAuth } from '../hooks/useAuth';
import { useReactions } from '../hooks/useReactions';
import { useRecorder } from '../hooks/useRecorder';
import { useSocket } from '../hooks/useSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import { labelFor } from '../lib/reactions';
import { AUDIO_CONSTRAINTS } from '../lib/rtcQuality';
import { meetingLink } from '../lib/meetingLink';
import * as aiService from '../services/aiService';
import * as meetingService from '../services/meetingService';
import { errorMessage } from '../services/api';

const mediaErrorText = (e) => (e?.name === 'NotAllowedError' ? 'Camera and microphone access was blocked. Allow access in your browser, or join without devices.'
  : e?.name === 'NotFoundError' ? 'No camera or microphone was found.' : 'Could not start your camera or microphone.');
const canShare = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;

// The page itself goes full screen (not a wrapper element), so the Leave menu and the toasts, which render on <body>, stay visible.
// Where the browser has no Fullscreen API (iPhone Safari) the room still goes "full screen" inside the page: only the browser's own bars stay.
const browserFullscreen = () => (typeof document !== 'undefined' ? document.fullscreenElement || document.webkitFullscreenElement : null);
const enterBrowserFullscreen = () => {
  const el = document.documentElement;
  try { return Promise.resolve(el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.()).catch(() => {}); } catch { return Promise.resolve(); }
};
const exitBrowserFullscreen = () => {
  if (!browserFullscreen()) return Promise.resolve();
  try { return Promise.resolve(document.exitFullscreen?.() ?? document.webkitExitFullscreen?.()).catch(() => {}); } catch { return Promise.resolve(); }
};

// While `enabled`, the header and control bar fade away after a few idle seconds; any movement, tap or key press brings them back.
// `hold(true)` keeps them up (pointer resting on the bar, keyboard focus inside it, Leave menu open).
function useAutoHide(enabled, delay = 3000) {
  const [awake, setAwake] = useState(true);
  const held = useRef(false);
  const live = useRef(enabled); live.current = enabled;
  const timer = useRef(0);
  const wake = useCallback(() => {
    if (!live.current) return;
    setAwake(true);
    clearTimeout(timer.current);
    if (!held.current) timer.current = setTimeout(() => setAwake(false), delay);
  }, [delay]);
  const hold = useCallback((on) => { held.current = on; wake(); }, [wake]);
  useEffect(() => {
    if (!enabled) { clearTimeout(timer.current); setAwake(true); return undefined; }
    wake();
    const events = ['pointermove', 'pointerdown', 'keydown'];
    events.forEach((n) => window.addEventListener(n, wake, { passive: true }));
    return () => { events.forEach((n) => window.removeEventListener(n, wake)); clearTimeout(timer.current); };
  }, [enabled, wake]);
  return { awake: !enabled || awake, hold };
}

// How long the meeting has been running. It keeps its own clock, so only this tiny piece re-renders every second.
function RoomTimer({ since }) {
  const [start] = useState(() => { const t = since ? new Date(since).getTime() : NaN; return Number.isFinite(t) && t <= Date.now() ? t : Date.now(); });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  const s = Math.max(0, Math.floor((now - start) / 1000));
  const pad = (x) => String(x).padStart(2, '0');
  return <span className="mono text-xs text-ink-muted" role="timer" aria-label="Meeting time">{s >= 3600 ? `${Math.floor(s / 3600)}:` : ''}{pad(Math.floor((s % 3600) / 60))}:{pad(s % 60)}</span>;
}

export default function MeetingRoom() {
  const { roomCode } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [phase, setPhase] = useState('loading');          // loading | error | prejoin | inroom
  const [meeting, setMeeting] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [languages, setLanguages] = useState([]);
  const [stream, setStream] = useState(null);
  const [mediaError, setMediaError] = useState('');
  const [notice, setNotice] = useState('');
  const [audioOn, setAudioOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [screen, setScreen] = useState(null);
  const [panel, setPanel] = useState(null);                 // closed by default: the video fills the page until you open chat
  const [unread, setUnread] = useState(0);
  const [draft, setDraft] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState('');                  // '', 'starting', 'leaving'
  const [immersive, setImmersive] = useState(false);       // full screen: video fills the page, header and controls float over it
  const screenRef = useRef(null); screenRef.current = screen;
  const streamRef = useRef(null); streamRef.current = stream;

  // 1. Join through the API first: it enforces access and tells us if the meeting has not started / has ended.
  useEffect(() => {
    let alive = true;
    meetingService.join(roomCode).then((m) => { if (alive) { setMeeting(m); setPhase('prejoin'); } })
      .catch((e) => { if (alive) { setLoadError(errorMessage(e, 'Could not open this meeting.')); setPhase('error'); } });
    aiService.languages().then((l) => alive && setLanguages(l)).catch(() => {});
    return () => { alive = false; };
  }, [roomCode]);

  // 2. Local media (camera + mic -> mic only -> explain)
  const acquire = useCallback(async (mode = 'full') => {
    setMediaError(''); setNotice('');
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (mode === 'none') { setStream(new MediaStream()); setAudioOn(false); setVideoOn(false); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS, video: { width: { ideal: 1280 }, height: { ideal: 720 } } });
      setStream(s); setAudioOn(true); setVideoOn(true);
    } catch (e) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
        setStream(s); setAudioOn(true); setVideoOn(false); setNotice('Your camera is unavailable. You can still join with audio.');
      } catch (e2) { setMediaError(mediaErrorText(e2 || e)); }
    }
  }, []);
  const isHost = !!(meeting && user && String(meeting.hostId) === String(user.id));
  const seminar = !!meeting?.seminar;
  const attendee = seminar && !isHost;                    // a seminar attendee only watches, chats and reacts
  useEffect(() => { if (phase === 'prejoin' && !attendee) acquire('full'); }, [phase, acquire, attendee]);   // attendees are never asked for the camera or microphone
  useEffect(() => () => { streamRef.current?.getTracks().forEach((t) => t.stop()); screenRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  const toggleTrack = (kind) => {
    const tracks = kind === 'audio' ? stream?.getAudioTracks() : stream?.getVideoTracks();
    if (!tracks?.length) return;
    const next = !tracks[0].enabled;
    tracks.forEach((t) => { t.enabled = next; });
    return next;
  };
  const onToggleAudio = () => { const n = toggleTrack('audio'); if (n !== undefined) { setAudioOn(n); if (phase === 'inroom') rtc.sendMedia({ audio: n }); } };
  const onToggleVideo = () => { const n = toggleTrack('video'); if (n !== undefined) { setVideoOn(n); if (phase === 'inroom') rtc.sendMedia({ video: n }); } };

  // 3. Mesh WebRTC
  const hostMuteRef = useRef(null);
  const rtc = useWebRTC({ roomCode, localStream: stream, enabled: phase === 'inroom', onHostMute: (kind) => hostMuteRef.current?.(kind), seminar, isHost });
  const peersRef = useRef([]); peersRef.current = rtc.peers;
  // announce the initial mic/camera state once, when the join completes (not on every toggle)
  useEffect(() => { if (rtc.status === 'joined' && !attendee) rtc.sendMedia({ audio: audioOn, video: videoOn && !!stream?.getVideoTracks().length }); },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [rtc.status]);

  // 4. Screen share (replaceTrack, no renegotiation)
  const stopShare = useCallback(() => {
    screenRef.current?.getTracks().forEach((t) => t.stop());
    setScreen(null);
    rtc.replaceVideoTrack(streamRef.current?.getVideoTracks()[0] || null);
    rtc.sendMedia({ screen: false });
  }, [rtc]);
  const startShare = async () => {
    try {
      const ds = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = ds.getVideoTracks()[0];
      track.onended = stopShare;                         // the browser's own "Stop sharing" button
      setScreen(ds); rtc.replaceVideoTrack(track); rtc.sendMedia({ screen: true });
    } catch (e) { if (e?.name !== 'NotAllowedError') toast.error('Could not start screen sharing.'); }
  };

  // 5. Recording (host only), mixed audio, consent first
  const getStreams = useCallback(() => [streamRef.current, ...peersRef.current.map((p) => p.stream)], []);
  const recorder = useRecorder({ meetingId: meeting?.id, getStreams });
  const recording = recorder.state === 'recording';

  // 6. Side panel (chat / participants), unread badge and reactions
  const { getSocket } = useSocket();
  const reactions = useReactions({ enabled: phase === 'inroom' });
  const panelRef = useRef(null); panelRef.current = panel;
  useEffect(() => {
    if (phase !== 'inroom') return undefined;
    const socket = getSocket();
    const onMsg = (m) => { if (m?.sender?.id !== user?.id && panelRef.current !== 'chat') setUnread((n) => n + 1); };
    socket.on('chat:message', onMsg);
    return () => socket.off('chat:message', onMsg);
  }, [phase, getSocket, user?.id]);
  useEffect(() => { if (panel === 'chat') setUnread(0); }, [panel]);
  const togglePanel = (p) => setPanel((cur) => (cur === p ? null : p));
  const closePanel = useCallback((from) => { setPanel(null); setTimeout(() => document.getElementById(`toggle-${from}`)?.focus(), 0); }, []);
  const confirmRecording = async () => {
    setBusy('starting');
    try { await meetingService.consent(meeting.id); await recorder.start(); rtc.sendMedia({ recording: true }); setConsent(false); }
    catch (e) { toast.error(e?.message || errorMessage(e, 'Could not start recording.')); }
    finally { setBusy(''); }
  };
  const stopRecording = async () => { const ok = await recorder.stop(); rtc.sendMedia({ recording: false }); if (!ok) toast.error('The recording could not be uploaded. Use Retry upload.'); return ok; };
  useEffect(() => {
    if (!recording && recorder.state !== 'uploading') return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [recording, recorder.state]);

  // 7. Full screen. `immersive` is the source of truth; the browser's own full screen is requested on top of it where it exists.
  //    The header and control bar float over the video and fade after a few idle seconds. While chat or participants is open they dock
  //    back into the layout instead, so they never cover the side panel or the chat box.
  const enterFullscreen = useCallback(() => { setImmersive(true); enterBrowserFullscreen(); }, []);
  const exitFullscreen = useCallback(() => { setImmersive(false); exitBrowserFullscreen(); }, []);
  const toggleFullscreen = useCallback(() => (immersive ? exitFullscreen() : enterFullscreen()), [immersive, enterFullscreen, exitFullscreen]);
  const floating = immersive && !panel;
  const chrome = useAutoHide(floating);
  useEffect(() => {                                       // Esc or the browser's own exit button leaves full screen: follow it
    const sync = () => { if (!browserFullscreen()) setImmersive(false); };
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => { document.removeEventListener('fullscreenchange', sync); document.removeEventListener('webkitfullscreenchange', sync); };
  }, []);
  useEffect(() => () => { exitBrowserFullscreen(); }, []);   // leaving the page never leaves the browser stuck in full screen
  useEffect(() => { if (['ended', 'denied', 'removed', 'error'].includes(rtc.status)) exitFullscreen(); }, [rtc.status, exitFullscreen]);
  useEffect(() => {                                       // "F" toggles full screen, except while typing
    if (phase !== 'inroom') return undefined;
    const onKey = (e) => {
      if (e.key?.toLowerCase() !== 'f' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName || '')) return;
      e.preventDefault();
      toggleFullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, toggleFullscreen]);
  useEffect(() => {                                       // hide the mouse pointer together with the controls
    if (!floating || chrome.awake) return undefined;
    const prev = document.body.style.cursor;
    document.body.style.cursor = 'none';
    return () => { document.body.style.cursor = prev; };
  }, [floating, chrome.awake]);

  const leave = async (endForAll = false) => {
    setBusy('leaving');
    if (recording) await stopRecording();
    if (recorder.state === 'error') { setBusy(''); toast.error('Retry the recording upload before leaving, or it will be lost.'); return; }
    if (endForAll) { try { await meetingService.end(meeting.id); } catch (e) { toast.error(errorMessage(e, 'Could not end the meeting.')); } }
    screenRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setPhase('left');
    navigate('/meetings', { replace: true });
  };


  const selfStream = useMemo(() => (screen && stream ? new MediaStream([...screen.getVideoTracks(), ...stream.getAudioTracks()]) : stream), [screen, stream]);
  const hasCam = !!stream?.getVideoTracks().length;
  // Everybody in the room. `mine` = another tab or device of yours. `stale` = never managed to connect (see useWebRTC): usually a leftover
  // of an old connection that the server has not cleaned up yet.
  const myId = String(user?.id ?? '');
  const allTiles = [
    { key: 'self', stream: selfStream, name: user?.name || 'You', isSelf: true, media: { audio: audioOn, video: videoOn && hasCam, screen: !!screen, recording }, userId: user?.id, isHost: !!isHost, avatarUser: user },
    ...rtc.peers.map((p) => {
      const mine = !!myId && String(p.userId) === myId;
      return { key: p.socketId, stream: p.stream, name: mine ? `${p.name} (other device)` : p.name, isSelf: false, media: p.media, connection: p.state, quality: p.quality, userId: p.userId, mine, stale: !!p.stale,
        isHost: String(p.userId) === String(meeting?.hostId), avatarUser: { id: p.userId, _id: p.userId, name: p.name, avatarUrl: p.avatarUrl } };
    }),
  ];
  // What is drawn on screen: never an extra "Connecting…" copy of yourself, and nobody who has been stuck for a long time.
  const onScreen = allTiles.filter((t) => t.isSelf || (!t.stale && !(t.mine && !t.stream)));
  const peopleTiles = allTiles.filter((t) => !(t.mine && !t.stream && t.stale));        // the host can still see and manage everyone in the list
  const stuck = allTiles.filter((t) => !t.isSelf && t.stale && !t.mine);
  // Seminar: the host's stage shows only the host; an attendee's stage shows only the host. Attendees are listed in the Participants panel.
  const hostPeer = rtc.peers.find((p) => String(p.userId) === String(meeting?.hostId));
  const tiles = attendee
    ? [{ key: 'host', stream: hostPeer?.stream || null, name: hostPeer?.name || 'Host', isSelf: false, media: hostPeer?.media || { audio: true, video: true, screen: false, recording: false }, connection: hostPeer?.state, quality: hostPeer?.quality, userId: meeting?.hostId, isHost: true,
      avatarUser: { id: meeting?.hostId, _id: meeting?.hostId, name: hostPeer?.name || 'Host', avatarUrl: hostPeer?.avatarUrl } }]
    : seminar ? allTiles.slice(0, 1) : onScreen;
  const someoneRecording = !recording && rtc.peers.some((p) => p.media.recording);

  // The host asked us to mute: switch the track off and tell the others. We may switch it back on ourselves.
  hostMuteRef.current = (kind) => {
    const tracks = kind === 'audio' ? streamRef.current?.getAudioTracks() : streamRef.current?.getVideoTracks();
    tracks?.forEach((t) => { t.enabled = false; });
    if (kind === 'audio') setAudioOn(false); else setVideoOn(false);
    rtc.sendMedia(kind === 'audio' ? { audio: false } : { video: false });
    toast(kind === 'audio' ? 'The host muted your microphone. You can unmute yourself.' : 'The host turned your camera off. You can turn it back on.');
  };
  // Host: a small notice whenever someone new is waiting to be let in
  const seenWaiting = useRef(new Set());
  useEffect(() => {
    if (!isHost) return;
    rtc.waiting.forEach((w) => { if (!seenWaiting.current.has(w.socketId)) { seenWaiting.current.add(w.socketId); toast(`${w.name} is waiting to be let in`, { icon: '🚪' }); } });
  }, [rtc.waiting, isHost]);
  // Host actions: the server answers { ok, message }; show a message only when something went wrong
  const hostAct = async (promise, okMessage) => { const r = await promise; if (r.ok) { if (okMessage) toast.success(okMessage); } else toast.error(r.message || 'That did not work.'); };

  if (phase === 'loading') return <div className="flex min-h-screen items-center justify-center" role="status"><Loader2 className="animate-spin text-ink-soft" aria-label="Loading meeting" /></div>;
  if (phase === 'error') return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-extrabold text-ink">Can’t open this meeting</h1>
      <p role="alert" className="text-ink-soft">{loadError}</p>
      <button type="button" className="btn-primary" onClick={() => navigate('/meetings')}>Back to meetings</button>
    </div>
  );
  if (phase === 'prejoin' && attendee) return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 px-4 py-8">
      <div><p className="mb-2 text-xs font-bold uppercase tracking-wider text-accent-text">Seminar</p><h1 className="text-2xl font-extrabold text-ink">{meeting.title}</h1></div>
      <ul className="space-y-2 rounded-2xl border border-line bg-card p-4 text-sm text-ink-soft">
        <li>You will see and hear the host’s video and screen.</li>
        <li>Your camera and microphone stay off and cannot be turned on. Nothing is requested from your browser.</li>
        <li>You can chat and send reactions.</li>
        <li>Only the host can see the transcript and summary.</li>
      </ul>
      <button type="button" className="btn-primary self-start" onClick={() => setPhase('inroom')}>Join seminar</button>
    </div>
  );
  if (phase === 'prejoin') return (
    <PreJoin title={meeting.title} stream={stream} audio={audioOn} video={videoOn} onToggleAudio={onToggleAudio} onToggleVideo={onToggleVideo}
      mediaError={mediaError || null} onRetryMedia={() => acquire('full')} onJoinWithout={() => { acquire('none'); }}
      onJoin={() => setPhase('inroom')} busy={!stream && !mediaError} />
  );
  if (rtc.status === 'ended') return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-extrabold text-ink">The host ended this meeting</h1>
      <button type="button" className="btn-primary" onClick={() => { streamRef.current?.getTracks().forEach((t) => t.stop()); navigate('/meetings', { replace: true }); }}>Back to meetings</button>
    </div>
  );
  if (rtc.status === 'waiting') return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <Loader2 className="animate-spin text-ink-soft" aria-hidden />
      <h1 className="text-2xl font-extrabold text-ink">Waiting for the host</h1>
      <p role="status" className="text-ink-soft">“{meeting.title}” has a waiting room. The host will let you in shortly. Please stay on this page.</p>
      <button type="button" className="btn-secondary" onClick={() => navigate('/meetings', { replace: true })}>Leave</button>
    </div>
  );
  if (rtc.status === 'denied' || rtc.status === 'removed') return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-extrabold text-ink">{rtc.status === 'denied' ? 'The host did not let you in' : 'You were removed from this meeting'}</h1>
      <p role="alert" className="text-ink-soft">{rtc.status === 'denied' ? 'You can ask the host to try again.' : 'You can’t rejoin this meeting.'}</p>
      <button type="button" className="btn-primary" onClick={() => navigate('/meetings', { replace: true })}>Back to meetings</button>
    </div>
  );
  if (rtc.status === 'error') return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-extrabold text-ink">Couldn’t join the room</h1>
      <p role="alert" className="text-ink-soft">{rtc.error?.message}</p>
      <button type="button" className="btn-primary" onClick={() => navigate('/meetings')}>Back to meetings</button>
    </div>
  );

  const header = (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-2 sm:px-4">
      <h1 className="min-w-0 max-w-[65%] truncate text-base font-bold text-ink sm:max-w-md sm:text-lg">{meeting.title}</h1>
      <StatusBadge status="live" />
      <RoomTimer since={meeting.startedAt} />
      <LanguageIndicator settings={meeting.languageSettings} languages={languages} />
      <div className="flex-1" />
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink-soft" title="People in this meeting"><Users size={13} aria-hidden /><span aria-label={`${peopleTiles.length} in this meeting`}>{peopleTiles.length}</span></span>
      {isHost && <span className="rounded-full border border-line-strong px-3 py-1 text-xs font-bold text-accent-text">You are the host</span>}
      {seminar && <span className="rounded-full border border-line-strong px-3 py-1 text-xs font-bold text-ink-soft">{attendee ? 'Seminar: watching' : 'Seminar'}</span>}
    </header>
  );
  const showAttendeeNote = attendee && !floating;         // the standing "you can only watch" line would sit on top of the video in full screen
  const hasNotices = showAttendeeNote || rtc.status === 'joining' || rtc.status === 'disconnected' || stuck.length > 0 || notice || someoneRecording || recorder.state === 'error' || (isHost && consent && !recording);
  const notices = hasNotices ? (
    <div className="space-y-2 px-4 pt-2" aria-live="polite">
      {showAttendeeNote && <p className="text-sm text-ink-soft">Seminar: only the host can speak or share video. You can chat and send reactions.</p>}
      {rtc.status === 'joining' && <p role="status" className="text-sm text-ink-soft">Connecting…</p>}
      {rtc.status === 'disconnected' && <p role="alert" className="text-sm" style={{ color: 'var(--red-text)' }}>Connection lost. Reconnecting… If it does not come back, <button type="button" className="underline" onClick={() => window.location.reload()}>reload to rejoin</button>.</p>}
      {stuck.length > 0 && <p className="text-sm text-ink-soft">{stuck.map((t) => t.name).join(', ')} {stuck.length > 1 ? 'are' : 'is'} still trying to connect. If this keeps happening, ask them to reload the page.</p>}
      {notice && <p className="text-sm text-ink-soft">{notice}</p>}
      {someoneRecording && <ConsentBanner variant="viewer" />}
      {recorder.state === 'error' && <p role="alert" className="text-sm" style={{ color: 'var(--red-text)' }}>{recorder.error} Your recording is kept in this tab — retry before leaving.</p>}
      {isHost && consent && !recording && <ConsentBanner onConfirm={confirmRecording} onCancel={() => setConsent(false)} busy={busy === 'starting'} />}
    </div>
  ) : null;

  // Full screen: the header (fades with the controls) and the notices (always visible, they can need an answer) float over the video.
  const headerSlot = (
    <div className={floating ? 'pointer-events-none fixed inset-x-0 top-0 z-30 flex flex-col items-center gap-2 p-2 pt-[max(0.5rem,env(safe-area-inset-top))]' : undefined}>
      <div className={floating ? `pointer-events-auto grid w-full max-w-5xl transition-[grid-template-rows,opacity,visibility] duration-200 motion-reduce:transition-none ${chrome.awake ? 'grid-rows-[1fr] opacity-100' : 'invisible grid-rows-[0fr] opacity-0'}` : undefined}>
        <div className={floating ? 'min-h-0 overflow-hidden rounded-2xl border border-line-strong bg-card/90 shadow-2xl backdrop-blur-md [&>header]:border-b-0' : undefined}>{header}</div>
      </div>
      {floating && notices && <div className="pointer-events-auto w-full max-w-2xl rounded-2xl border border-line-strong bg-card/95 pb-2 shadow-2xl backdrop-blur-md">{notices}</div>}
    </div>
  );

  return (
    <>
      <RoomLayout immersive={floating} header={headerSlot} notices={floating ? null : notices} stage={<VideoGrid tiles={tiles} />}
        overlay={<ReactionLayer items={reactions.floating} onDone={reactions.remove} />}
        panel={panel} onPanel={setPanel} onClose={closePanel}
        chat={<ChatPanel meetingId={meeting.id} selfUserId={user.id} joined={rtc.status === 'joined'} draft={draft} onDraftChange={setDraft} />}
        people={(
          <ParticipantList seminar={seminar} people={peopleTiles.map((t) => ({ key: t.key, name: t.name, isSelf: t.isSelf, media: t.media, userId: t.userId }))} hostId={String(meeting.hostId)}
            isHost={!!isHost} waiting={isHost ? rtc.waiting : []} invite={{ link: meetingLink(meeting.roomCode), code: meeting.roomCode }}
            onAdmit={(id) => hostAct(rtc.admit(id))} onDeny={(id) => hostAct(rtc.deny(id))}
            onMute={(id, kind) => hostAct(rtc.muteUser(id, kind))} onMuteAll={() => hostAct(rtc.muteAll(), 'Everyone else was muted')}
            onRemove={(id) => hostAct(rtc.removeUser(id), 'Removed from the meeting')} />
        )}
        controls={(
          <MeetingControls locked={attendee} hidePeople={attendee} audio={audioOn} video={videoOn} canVideo={hasCam} onToggleAudio={onToggleAudio} onToggleVideo={onToggleVideo}
            panel={panel} onPanel={togglePanel} unread={unread} waiting={isHost ? rtc.waiting.length : 0}
            onLeave={() => leave(false)} isHost={!!isHost} onEndForAll={() => leave(true)} leaving={busy === 'leaving'}
            fullscreen={immersive} onToggleFullscreen={toggleFullscreen} floating={floating} visible={chrome.awake} onHold={chrome.hold}>
            {!attendee && <ScreenShareButton supported={canShare} sharing={!!screen} onStart={startShare} onStop={stopShare} />}
            <ReactionButton onReact={reactions.send} disabled={rtc.status !== 'joined'} />
            {isHost && <RecorderControl state={recorder.state} error={recorder.error} onRequestStart={() => setConsent(true)} onStop={stopRecording} onRetry={recorder.retryUpload} />}
          </MeetingControls>
        )} />
      <p className="sr-only" role="status" aria-live="polite">{reactions.latest ? `${reactions.latest.name} reacted: ${labelFor(reactions.latest.emoji)}` : ''}</p>
      {busy === 'leaving' && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 text-white" role="status"><Loader2 className="mr-2 animate-spin" aria-hidden />Saving and leaving…</div>}
    </>
  );
}