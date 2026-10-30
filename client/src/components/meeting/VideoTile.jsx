import { useEffect, useRef } from 'react';
import { MicOff, MonitorUp, Circle } from 'lucide-react';

export default function VideoTile({ stream, name, isSelf, media, connection, featured = false, isHost = false, className = 'h-full w-full min-h-[120px]' }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream || null; }, [stream]);
  const hasVideo = !!stream?.getVideoTracks().some((t) => t.readyState === 'live') && (media.video || media.screen);
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-line-strong bg-input ${featured ? 'h-full w-full min-h-[240px]' : className}`}>
      {/* muted for your own tile only (prevents echo); remote audio plays through this element */}
      <video ref={ref} autoPlay playsInline muted={isSelf} className={`h-full w-full ${media.screen ? 'object-contain' : 'object-cover'} ${hasVideo ? '' : 'invisible'}`}
        style={isSelf && !media.screen ? { transform: 'scaleX(-1)' } : undefined} aria-label={`${name}'s video`} />
      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full text-3xl font-bold" style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }} aria-hidden>{name?.[0]?.toUpperCase() || '?'}</span>
        </div>
      )}
      {!isSelf && (connection === 'failed' || connection === 'disconnected') && <p role="status" className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-1 text-xs text-white">Connection problem</p>}
      {!isSelf && !stream && connection !== 'failed' && <p role="status" className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-1 text-xs text-white">Connecting…</p>}
      <div className="absolute bottom-2 left-2 flex max-w-[90%] items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-white">
        {!media.audio && <MicOff size={13} aria-label="Muted" />}
        {media.screen && <MonitorUp size={13} aria-label="Sharing screen" />}
        {media.recording && <Circle size={10} fill="currentColor" className="text-red-400" aria-label="Recording" />}
        <span className="truncate">{isSelf ? `${name} (You)` : name}</span>
        {isHost && <span className="rounded-full bg-white/25 px-1.5 text-[10px] font-bold uppercase tracking-wide">Host</span>}
      </div>
    </div>
  );
}