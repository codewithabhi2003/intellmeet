import { useCallback, useEffect, useRef, useState } from 'react';
import { Circle, Loader2, MicOff, MonitorUp, SignalLow, Volume2 } from 'lucide-react';
import Avatar from '../common/Avatar';

// Size of the box a tile is drawn in, so the profile picture can grow and shrink with the tile (phone grid cell vs. a big desktop tile).
function useBox(ref) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setBox({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return box;
}
const avatarSize = ({ w, h }) => {
  const m = w && h ? Math.min(w, h) : 0;
  return !m ? 88 : m < 110 ? 40 : m < 170 ? 56 : m < 250 ? 76 : m < 360 ? 96 : 128;
};

// One person's video. When the camera is off the tile shows their profile picture (same <Avatar> as the top bar), or their initial.
//   avatarUser: { id, name, avatarUrl }  (for your own tile, pass the signed-in user)
export default function VideoTile({ stream, name, isSelf, media, connection, quality, featured = false, isHost = false, avatarUser = null, className = 'h-full w-full min-h-[120px]' }) {
  const ref = useRef(null);
  const boxRef = useRef(null);
  const box = useBox(boxRef);
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
  const size = avatarSize(box);
  const small = box.w > 0 && box.w < 190;                 // a thumbnail: keep only the essentials
  const problem = !isSelf && (connection === 'failed' || connection === 'disconnected');
  const connecting = !isSelf && !stream && connection !== 'failed';

  return (
    <div ref={boxRef} className={`relative overflow-hidden rounded-2xl border border-line-strong bg-input shadow-sm ${featured ? 'h-full w-full min-h-[240px]' : className}`}>
      {/* muted for your own tile only (prevents echo); remote audio plays through this element */}
      <video ref={ref} autoPlay playsInline muted={isSelf} onLoadedMetadata={play} className={`h-full w-full ${media.screen ? 'object-contain' : 'object-cover'} ${hasVideo ? '' : 'invisible'}`}
        style={isSelf && !media.screen ? { transform: 'scaleX(-1)' } : undefined} aria-label={`${name}'s video`} />

      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.07), transparent 70%)' }}>
          {avatarUser ? (
            <span className="flex items-center justify-center overflow-hidden rounded-full shadow-xl ring-2 ring-white/15" style={{ width: size, height: size }} aria-hidden>
              <Avatar user={avatarUser} size={size} />
            </span>
          ) : (
            <span className="flex items-center justify-center rounded-full font-bold shadow-xl ring-2 ring-white/15" style={{ width: size, height: size, fontSize: size * 0.4, background: 'var(--accent-soft)', color: 'var(--accent-text)' }} aria-hidden>{name?.[0]?.toUpperCase() || '?'}</span>
          )}
        </div>
      )}

      {!isSelf && blocked && (
        <button type="button" onClick={play} className="absolute inset-x-0 top-1/2 mx-auto flex w-fit -translate-y-1/2 items-center gap-2 rounded-full bg-black/80 px-4 py-2 text-sm font-medium text-white">
          <Volume2 size={16} aria-hidden /> Tap to hear {name}
        </button>
      )}

      {problem && <p role="status" className="absolute left-2 top-2 rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-white">Connection problem</p>}
      {connecting && (
        <p role="status" className="absolute right-2 top-2 flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-white">
          <Loader2 size={12} className="animate-spin" aria-hidden />Connecting…
        </p>
      )}
      {!isSelf && !problem && stream && quality === 'poor' && (
        <p role="status" className="absolute right-2 top-2 flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 text-xs font-medium text-red-300" title="Their connection is weak, so their video may be blurry or choppy">
          <SignalLow size={14} aria-hidden />{small ? <span className="sr-only">Weak connection</span> : 'Weak connection'}
        </p>
      )}

      <div className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-full bg-black/65 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
        {!media.audio && <MicOff size={13} className="shrink-0 text-red-400" aria-label="Muted" />}
        {media.screen && <MonitorUp size={13} className="shrink-0" aria-label="Sharing screen" />}
        {media.recording && <Circle size={10} fill="currentColor" className="shrink-0 text-red-400" aria-label="Recording" />}
        <span className="truncate">{isSelf ? `${name} (You)` : name}</span>
        {isHost && !small && <span className="shrink-0 rounded-full bg-white/25 px-1.5 text-[10px] font-bold uppercase tracking-wide">Host</span>}
      </div>
    </div>
  );
}