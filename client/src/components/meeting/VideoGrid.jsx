import { useEffect, useState } from 'react';
import VideoTile from './VideoTile';

// How the people on screen are laid out:
//   * phone held upright : a real grid that fills the screen. 1 person = full screen, 2 = stacked, 3+ = two columns
//                          (an odd last person gets the full bottom row).
//   * tablet / laptop    : every video keeps a 16:9 shape; the number of columns that makes the videos biggest is chosen
//                          automatically, and the last row is centred (like Meet / Zoom gallery view).
//   * someone shares the screen : the shared screen is big, everybody else is a strip (on the right, or along the bottom on small screens).

const NARROW = '(max-width: 639px)';
const GAP = 8;

function useNarrow() {
  const read = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(NARROW).matches : false);
  const [narrow, setNarrow] = useState(read);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const m = window.matchMedia(NARROW);
    const on = () => setNarrow(m.matches);
    on();
    if (m.addEventListener) m.addEventListener('change', on); else m.addListener?.(on);
    return () => { if (m.removeEventListener) m.removeEventListener('change', on); else m.removeListener?.(on); };
  }, []);
  return narrow;
}

// Returns [ref callback, { w, h }]. A callback ref, so measuring also starts when the element appears later (phone turned sideways, ...).
function useSize() {
  const [el, setEl] = useState(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, size];
}

// The column count that gives the biggest 16:9 videos inside a W x H area.
function bestFit(W, H, n) {
  let best = { cols: 1, w: 0, h: 0 };
  for (let cols = 1; cols <= n; cols += 1) {
    const rows = Math.ceil(n / cols);
    const cw = (W - GAP * (cols - 1)) / cols;
    const ch = (H - GAP * (rows - 1)) / rows;
    if (cw <= 0 || ch <= 0) continue;
    const w = Math.min(cw, (ch * 16) / 9);
    const h = (w * 9) / 16;
    if (w * h > best.w * best.h) best = { cols, w: Math.floor(w), h: Math.floor(h) };
  }
  return best;
}

const props = (t) => ({ stream: t.stream, name: t.name, isSelf: t.isSelf, media: t.media, connection: t.connection, quality: t.quality, isHost: t.isHost, avatarUser: t.avatarUser });

export default function VideoGrid({ tiles }) {
  const narrow = useNarrow();
  const [boxRef, size] = useSize();
  const n = tiles.length;

  // ---- someone is sharing their screen ----
  const shared = tiles.find((t) => t.media?.screen);
  if (shared) {
    const others = tiles.filter((t) => t !== shared);
    return (
      <div className={`grid h-full w-full min-h-0 gap-2 ${others.length ? 'grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_240px] lg:grid-rows-1' : ''}`}>
        <div className="min-h-0 min-w-0"><VideoTile {...props(shared)} featured /></div>
        {others.length > 0 && (
          <div className="flex min-w-0 gap-2 overflow-x-auto lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden">
            {others.map((t) => (
              <div key={t.key} className="h-24 w-36 shrink-0 lg:h-auto lg:w-full lg:aspect-video"><VideoTile {...props(t)} className="h-full w-full min-h-0" /></div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---- phone, held upright: a grid that fills the screen ----
  if (narrow) {
    const cols = n <= 2 ? 1 : 2;
    const rows = n <= 2 ? Math.max(n, 1) : Math.ceil(n / 2);
    return (
      <div className="grid h-full w-full min-h-0 gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
        {tiles.map((t, i) => (
          <div key={t.key} className={`min-h-0 min-w-0 ${cols === 2 && n % 2 === 1 && i === n - 1 ? 'col-span-2' : ''}`}>
            <VideoTile {...props(t)} className="h-full w-full min-h-0" />
          </div>
        ))}
      </div>
    );
  }

  // ---- tablet / laptop: 16:9 videos, best number of columns, last row centred ----
  const fit = size.w > 0 && size.h > 0 && n > 0 ? bestFit(size.w, size.h, n) : null;
  return (
    <div className="relative h-full min-h-[200px] w-full">
      <div ref={boxRef} className="absolute inset-0 flex flex-wrap content-center items-center justify-center overflow-hidden" style={{ gap: GAP }}>
        {tiles.map((t) => (
          <div key={t.key} className={fit ? 'shrink-0' : 'min-h-[160px] flex-1 basis-[45%]'} style={fit ? { width: fit.w, height: fit.h } : undefined}>
            <VideoTile {...props(t)} className="h-full w-full min-h-0" />
          </div>
        ))}
      </div>
    </div>
  );
}