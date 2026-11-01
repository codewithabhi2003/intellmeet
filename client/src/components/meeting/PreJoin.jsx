import { useEffect, useRef } from 'react';
import { Mic, MicOff, Video, VideoOff } from 'lucide-react';

// Device check before entering. The user chooses what to share; permission failures are explained, never hidden.
export default function PreJoin({ title, stream, audio, video, onToggleAudio, onToggleVideo, mediaError, onRetryMedia, onJoinWithout, onJoin, busy }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream || null; }, [stream]);
  const hasCam = !!stream?.getVideoTracks().length;
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-4 py-8">
      <div><h1 className="text-2xl font-extrabold text-ink">{title}</h1><p className="text-ink-soft">Check your camera and microphone before joining.</p></div>
      <div className="relative aspect-video overflow-hidden rounded-3xl border border-line-strong bg-input">
        <video ref={ref} autoPlay playsInline muted className={`h-full w-full object-cover ${hasCam && video ? '' : 'invisible'}`} style={{ transform: 'scaleX(-1)' }} aria-label="Your camera preview" />
        {!(hasCam && video) && <p className="absolute inset-0 flex items-center justify-center text-sm text-ink-soft">{hasCam ? 'Camera is off' : 'No camera in use'}</p>}
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
          <button type="button" className="btn-icon bg-black/70 text-white" onClick={onToggleAudio} disabled={!stream?.getAudioTracks().length} aria-pressed={!audio} aria-label={audio ? 'Mute microphone' : 'Unmute microphone'}>{audio ? <Mic size={20} aria-hidden /> : <MicOff size={20} aria-hidden />}</button>
          <button type="button" className="btn-icon bg-black/70 text-white" onClick={onToggleVideo} disabled={!hasCam} aria-pressed={!video} aria-label={video ? 'Turn camera off' : 'Turn camera on'}>{video ? <Video size={20} aria-hidden /> : <VideoOff size={20} aria-hidden />}</button>
        </div>
      </div>
      {mediaError && (
        <div role="alert" className="space-y-3 rounded-2xl border p-4 text-sm" style={{ borderColor: 'var(--accent-red)' }}>
          <p style={{ color: 'var(--red-text)' }}>{mediaError}</p>
          <div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" onClick={onRetryMedia}>Try again</button><button type="button" className="btn-secondary" onClick={onJoinWithout}>Join without devices</button></div>
        </div>
      )}
      <button type="button" className="btn-primary self-start" onClick={onJoin} disabled={busy}>{busy ? 'Joining…' : 'Join meeting'}</button>
    </div>
  );
}
