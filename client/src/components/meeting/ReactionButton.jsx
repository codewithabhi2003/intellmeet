import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Smile } from 'lucide-react';
import { REACTIONS } from '../../lib/reactions';
import '../../styles/reactions.css';

const CELL = 44;      // emoji button size (also the minimum touch target)
const GAP = 2;
const PAD = 6;
const EDGE = 8;       // minimum distance from the screen edge
const LIFT = 14;      // space between the tray and the button

// One row when it fits (Meet / Teams style), otherwise as many equal rows as needed (8 emoji on a phone → 2 rows of 4).
function trayLayout(viewport, count) {
  const room = viewport - 2 * EDGE - 2 * PAD - 2;
  const fit = Math.max(1, Math.floor((room + GAP) / (CELL + GAP)));
  const rows = Math.ceil(count / Math.min(count, fit));
  const cols = Math.ceil(count / rows);
  return { cols, width: cols * CELL + (cols - 1) * GAP + 2 * PAD + 2 };
}

// Where the tray goes: centred above the button, pushed back inside the screen if the button is near an edge.
// `caret` keeps the little pointer aimed at the button either way.
function place(button, count) {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const rect = button.getBoundingClientRect();
  const { cols, width } = trayLayout(vw, count);
  const mid = rect.left + rect.width / 2;
  const left = Math.min(Math.max(mid - width / 2, EDGE), Math.max(EDGE, vw - EDGE - width));
  return { cols, width, left, bottom: vh - rect.top + LIFT, caret: Math.min(Math.max(mid - left, 22), width - 22) };
}

// Control-bar button that opens a reaction tray above it. Stays open so you can send several; Escape, a click outside or
// Tab closes it. The tray is drawn in a portal with position: fixed, so a scrolling / clipping control bar can't cut it off.
export default function ReactionButton({ onReact, disabled = false }) {
  const [pos, setPos] = useState(null);          // null = closed
  if (disabled && pos !== null) setPos(null);    // closes the tray the moment the button is disabled (React's supported way to reset state when a prop changes)
  const open = pos !== null;
  const wrap = useRef(null);
  const trigger = useRef(null);
  const tray = useRef(null);
  const picks = useRef([]);

  const close = (refocus = false) => { setPos(null); if (refocus) trigger.current?.focus(); };
  const toggle = () => (open ? close() : setPos(place(trigger.current, REACTIONS.length)));

  useEffect(() => {
    if (!open) return undefined;
    picks.current[0]?.focus();
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(true); } };   // preventDefault: tells the side panel not to close as well
    const onDown = (e) => { if (!wrap.current?.contains(e.target) && !tray.current?.contains(e.target)) close(); };
    const reposition = () => { if (trigger.current) setPos(place(trigger.current, REACTIONS.length)); };
    document.addEventListener('keydown', onKey, true);       // capture phase: runs before other Escape handlers
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);     // capture: also fires when the control bar itself scrolls
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps -- close/reposition only touch refs and the setter

  // Arrow keys move between emoji, like a toolbar; Tab leaves the tray (it lives at the end of <body>) and carries on from the button.
  const onTrayKey = (e) => {
    const i = picks.current.indexOf(document.activeElement);
    const last = REACTIONS.length - 1;
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: pos.cols, ArrowUp: -pos.cols }[e.key];
    if (e.key === 'Tab') { close(true); return; }
    if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); picks.current[e.key === 'Home' ? 0 : last]?.focus(); return; }
    if (step === undefined) return;
    e.preventDefault();
    const next = i + step;
    if (next >= 0 && next <= last) picks.current[next]?.focus();
  };

  return (
    <div ref={wrap} className="relative">
      <button ref={trigger} type="button" className="btn-icon" disabled={disabled} aria-haspopup="true" aria-expanded={open} aria-controls={open ? 'reaction-picker' : undefined} aria-label="Reactions"
        onClick={toggle} style={open ? { background: 'var(--accent-soft)', color: 'var(--accent-text)' } : undefined}><Smile size={20} aria-hidden /></button>
      {open && createPortal(
        <div ref={tray} id="reaction-picker" role="group" aria-label="Send a reaction" className="rx-tray" onKeyDown={onTrayKey}
          style={{ left: pos.left, bottom: pos.bottom, width: pos.width, '--rx-origin': `${pos.caret}px 100%` }}>
          <div className="rx-tray__grid" style={{ gridTemplateColumns: `repeat(${pos.cols}, ${CELL}px)` }}>
            {REACTIONS.map(({ emoji, label }, i) => (
              <button key={emoji} ref={(el) => { picks.current[i] = el; }} type="button" className="rx-pick" aria-label={`Send ${label} reaction`} onClick={() => onReact(emoji)}>{emoji}</button>
            ))}
          </div>
          <span className="rx-tray__caret" style={{ left: pos.caret }} aria-hidden="true" />
        </div>,
        document.body,
      )}
    </div>
  );
}