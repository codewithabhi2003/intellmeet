import { useCallback, useEffect, useRef, useState } from 'react';
import { MicOff, MonitorUp, Circle, Volume2 } from 'lucide-react';

export default function VideoTile({ stream, name, isSelf, media, connection, featured = false, isHost = false, className = 'h-full w-full min-h-[120px]' }) {
  const ref = useRef(null);
  const [blocked, setBlocked] = useState(false);          // the browser refused to start the sound until the person taps
  // autoPlay alone fails silently when the browser blocks sound (common on phones/Safari), so start playback explicitly and notice a refusal
  const play = useCallback(() => {
    const v = ref.current; if (!v || !v.srcObject) return;
    v.play().then(() => setBlocked(false)).catch((e) => { if (e?.name === 'NotAllowedError') setBlocked(true); });
  }, []);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream || null;
    if (stream) play();
  }, [stream, play]);
  // while blocked, the person's next tap or key press anywhere on the page counts as the permission the browser wants
  useEffect(() => {
    if (!blocked) return undefined;
    window.addEventListener('pointerdown', play, { once: true });
    window.addEventListener('keydown', play, { once: true });
    return () => { window.removeEventListener('pointerdown', play); window.removeEventListener('keydown', play); };
  }, [blocked, play]);
  const hasVideo = !!stream?.getVideoTracks().some((t) => t.readyState === 'live') && (media.video || media.screen);
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-line-strong bg-input ${featured ? 'h-full w-full min-h-[240px]' : className}`}>
      {/* muted for your own tile only (prevents echo); remote audio plays through this element */}
      <video ref={ref} autoPlay playsInline muted={isSelf} onLoadedMetadata={play} className={`h-full w-full ${media.screen ? 'object-contain' : 'object-cover'} ${hasVideo ? '' : 'invisible'}`}
        style={isSelf && !media.screen ? { transform: 'scaleX(-1)' } : undefined} aria-label={`${name}'s video`} />
      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full text-3xl font-bold" style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }} aria-hidden>{name?.[0]?.toUpperCase() || '?'}</span>
        </div>
      )}
      {!isSelf && blocked && (
        <button type="button" onClick={play} className="absolute inset-x-0 top-1/2 mx-auto flex w-fit -translate-y-1/2 items-center gap-2 rounded-full bg-black/80 px-4 py-2 text-sm font-medium text-white">
          <Volume2 size={16} aria-hidden /> Tap to hear {name}
        </button>
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