import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import '../../styles/reactions.css';

const FALLBACK = { w: 640, h: 420 };   // used only until the layer has been measured
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const lane = (fraction, w) => clamp(fraction * w, 56, Math.max(56, w - 56));   // keep the name pill inside the layer

// Six stable pseudo-random numbers in [0, 1) derived from the reaction id: the same reaction always gets the same
// path (no Math.random() during render), and two reactions never share one.
function seeds(id) {
  let h = 2166136261;
  for (const ch of String(id)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return Array.from({ length: 6 }, () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1000) / 1000; });
}

// Everything about one flight, sized from the layer itself (not the window): a small tile or a phone gets a smaller
// emoji, a shorter climb and a narrower sway, a big gallery gets the full effect.
// Still honours the fields the app already sends (lane = % from the left, wobble = px of sway, dur = seconds).
function plan(r, { w, h }) {
  const [s1, s2, s3, s4, s5, s6] = seeds(r.id);
  const small = w < 480;
  const size = clamp(w * 0.07, 30, 50);
  const rise = clamp(h * (0.56 + 0.14 * s1), 150, 560);
  return {
    size,
    rise,
    dur: clamp(num(r.dur, rise / 125 + s2), 2.8, 5.6),
    amp: clamp(Math.abs(num(r.wobble, 9 + s3 * 13)), 6, 22) * (small ? 0.7 : 1),
    swayDur: 2.3 + s4 * 1.3,
    phase: -(s5 * 3),                                                   // negative delay = each one starts mid-sway
    x: lane(num(r.lane, 12 + s6 * 76) / 100, w),
    alt: [0, 1, 2, 3, 4, 5].map((k) => lane((0.08 + 0.84 * (((s6 + k / 6) % 1))), w)),   // other lanes to try if the first one is busy
    bottom: small ? 16 : 22,
  };
}

function Floating({ r, box, onDone }) {
  const [p] = useState(() => plan(r, box));   // frozen at mount, so resizing mid-flight can never make it jump
  const latest = useRef(onDone);
  const finished = useRef(false);
  const node = useRef(null);
  useEffect(() => { latest.current = onDone; });

  // Don't launch on top of a reaction that has only just left the bottom: if the lane we were given is crowded, take the
  // emptiest of a few alternatives. Runs before the first paint, so nobody ever sees it move.
  useLayoutEffect(() => {
    const el = node.current;
    const layer = el?.parentElement;
    if (!el || !layer) return;
    const base = layer.getBoundingClientRect();
    const launch = base.bottom - p.bottom;
    const busy = [...layer.children]
      .filter((n) => n !== el)
      .map((n) => n.querySelector('.rx__sway')?.getBoundingClientRect())
      .filter((b) => b && b.bottom > launch - 150)                       // still near the launch point
      .map((b) => b.left + b.width / 2 - base.left);
    const room = (x) => Math.min(...busy.map((c) => Math.abs(c - x)));   // Infinity when nothing is nearby
    if (room(p.x) >= Math.min(76, box.w * 0.2)) return;
    const best = p.alt.reduce((a, b) => (room(b) > room(a) ? b : a), p.alt[0]);
    el.style.left = `${best}px`;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, at mount

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    latest.current(r.id);
  }, [r.id]);

  // Normal exit is the CSS animation ending. This timer is the safety net for browsers/settings that skip animations,
  // so a reaction can never get stuck in the list.
  useEffect(() => {
    const t = setTimeout(finish, (Math.max(p.dur, 1.8) + 0.8) * 1000);
    return () => clearTimeout(t);
  }, [finish, p.dur]);

  return (
    <div
      ref={node}
      className="rx"
      style={{
        left: p.x,
        bottom: p.bottom,
        '--rx-rise': `${p.rise}px`,
        '--rx-dur': `${p.dur}s`,
        '--rx-amp': `${p.amp}px`,
        '--rx-sway': `${p.swayDur}s`,
        '--rx-phase': `${p.phase}s`,
        '--rx-size': `${p.size}px`,
      }}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget && (e.animationName === 'rx-fade' || e.animationName === 'rx-still')) finish();
      }}
    >
      <div className="rx__sway">
        <span className="rx__pop"><span className="rx__emoji">{r.emoji}</span></span>
        {r.name ? <span className="rx__name">{r.name}</span> : null}
      </div>
    </div>
  );
}

// Purely decorative overlay (aria-hidden, ignores the mouse). Reactions are announced separately in a live region.
// Motion lives in reactions.css; with reduced motion the emoji doesn't travel, it just fades in and out where it appears.
export default function ReactionLayer({ items, onDone }) {
  const ref = useRef(null);
  const [box, setBox] = useState(FALLBACK);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const read = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) setBox((b) => (Math.abs(b.w - width) < 1 && Math.abs(b.h - height) < 1 ? b : { w: width, h: height }));
    };
    read();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} aria-hidden="true" data-testid="reaction-layer" className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {items.map((r) => <Floating key={r.id} r={r} box={box} onDone={onDone} />)}
    </div>
  );
}