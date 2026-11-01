import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
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
import { meetingLink } from '../lib/meetingLink';
import * as aiService from '../services/aiService';
import * as meetingService from '../services/meetingService';
import { errorMessage } from '../services/api';

const mediaErrorText = (e) => (e?.name === 'NotAllowedError' ? 'Camera and microphone access was blocked. Allow access in your browser, or join without devices.'
  : e?.name === 'NotFoundError' ? 'No camera or microphone was found.' : 'Could not start your camera or microphone.');
const canShare = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;

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
      const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: { ideal: 1280 }, height: { ideal: 720 } } });
      setStream(s); setAudioOn(true); setVideoOn(true);
    } catch (e) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        setStream(s); setAudioOn(true); setVideoOn(false); setNotice('Your camera is unavailable. You can still join with audio.');
      } catch (e2) { setMediaError(mediaErrorText(e2 || e)); }
    }
  }, []);
  useEffect(() => { if (phase === 'prejoin') acquire('full'); }, [phase, acquire]);
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
  const rtc = useWebRTC({ roomCode, localStream: stream, enabled: phase === 'inroom', onHostMute: (kind) => hostMuteRef.current?.(kind) });
  const peersRef = useRef([]); peersRef.current = rtc.peers;
  // announce the initial mic/camera state once, when the join completes (not on every toggle)
  useEffect(() => { if (rtc.status === 'joined') rtc.sendMedia({ audio: audioOn, video: videoOn && !!stream?.getVideoTracks().length }); },
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
  const isHost = meeting && user && String(meeting.hostId) === String(user.id);
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
  const tiles = [
    { key: 'self', stream: selfStream, name: user?.name || 'You', isSelf: true, media: { audio: audioOn, video: videoOn && hasCam, screen: !!screen, recording }, userId: user?.id, isHost: !!isHost },
    ...rtc.peers.map((p) => ({ key: p.socketId, stream: p.stream, name: p.name, isSelf: false, media: p.media, connection: p.state, userId: p.userId, isHost: String(p.userId) === String(meeting?.hostId) })),
  ];
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
    <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
      <h1 className="mr-1 truncate text-base font-bold text-ink">{meeting.title}</h1>
      <StatusBadge status="live" />
      <LanguageIndicator settings={meeting.languageSettings} languages={languages} />
      <div className="flex-1" />
      {isHost && <span className="rounded-full border border-line-strong px-3 py-1 text-xs font-bold text-accent-text">You are the host</span>}
    </header>
  );
  const hasNotices = rtc.status === 'joining' || rtc.status === 'disconnected' || notice || someoneRecording || recorder.state === 'error' || (isHost && consent && !recording);
  const notices = hasNotices ? (
    <div className="space-y-2 px-4 pt-2" aria-live="polite">
      {rtc.status === 'joining' && <p role="status" className="text-sm text-ink-soft">Connecting…</p>}
      {rtc.status === 'disconnected' && <p role="alert" className="text-sm" style={{ color: 'var(--red-text)' }}>Connection lost. <button type="button" className="underline" onClick={() => window.location.reload()}>Reload to rejoin</button></p>}
      {notice && <p className="text-sm text-ink-soft">{notice}</p>}
      {someoneRecording && <ConsentBanner variant="viewer" />}
      {recorder.state === 'error' && <p role="alert" className="text-sm" style={{ color: 'var(--red-text)' }}>{recorder.error} Your recording is kept in this tab — retry before leaving.</p>}
      {isHost && consent && !recording && <ConsentBanner onConfirm={confirmRecording} onCancel={() => setConsent(false)} busy={busy === 'starting'} />}
    </div>
  ) : null;

  return (
    <>
      <RoomLayout header={header} notices={notices} stage={<VideoGrid tiles={tiles} />}
        overlay={<ReactionLayer items={reactions.floating} onDone={reactions.remove} />}
        panel={panel} onPanel={setPanel} onClose={closePanel}
        chat={<ChatPanel meetingId={meeting.id} selfUserId={user.id} joined={rtc.status === 'joined'} draft={draft} onDraftChange={setDraft} />}
        people={(
          <ParticipantList people={tiles.map((t) => ({ key: t.key, name: t.name, isSelf: t.isSelf, media: t.media, userId: t.userId }))} hostId={String(meeting.hostId)}
            isHost={!!isHost} waiting={isHost ? rtc.waiting : []} invite={{ link: meetingLink(meeting.roomCode), code: meeting.roomCode }}
            onAdmit={(id) => hostAct(rtc.admit(id))} onDeny={(id) => hostAct(rtc.deny(id))}
            onMute={(id, kind) => hostAct(rtc.muteUser(id, kind))} onMuteAll={() => hostAct(rtc.muteAll(), 'Everyone else was muted')}
            onRemove={(id) => hostAct(rtc.removeUser(id), 'Removed from the meeting')} />
        )}
        controls={(
          <MeetingControls audio={audioOn} video={videoOn} canVideo={hasCam} onToggleAudio={onToggleAudio} onToggleVideo={onToggleVideo}
            panel={panel} onPanel={togglePanel} unread={unread} waiting={isHost ? rtc.waiting.length : 0} onLeave={() => leave(false)}
            endButton={isHost ? <button type="button" className="btn-secondary" onClick={() => leave(true)} disabled={busy === 'leaving'}>End for all</button> : null}>
            <ScreenShareButton supported={canShare} sharing={!!screen} onStart={startShare} onStop={stopShare} />
            <ReactionButton onReact={reactions.send} disabled={rtc.status !== 'joined'} />
            {isHost && <RecorderControl state={recorder.state} error={recorder.error} onRequestStart={() => setConsent(true)} onStop={stopRecording} onRetry={recorder.retryUpload} />}
          </MeetingControls>
        )} />
      <p className="sr-only" role="status" aria-live="polite">{reactions.latest ? `${reactions.latest.name} reacted: ${labelFor(reactions.latest.emoji)}` : ''}</p>
      {busy === 'leaving' && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 text-white" role="status"><Loader2 className="mr-2 animate-spin" aria-hidden />Saving and leaving…</div>}
    </>
  );
}