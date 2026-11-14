import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LogOut, Maximize, MessageSquare, Mic, MicOff, Minimize, Users, Video, VideoOff } from 'lucide-react';

const RED = '#e5484d';

// True only for keyboard focus, so a button you just clicked with the mouse does not keep the bar on screen.
const keyboardFocus = (el) => { try { return el.matches(':focus-visible'); } catch { return true; } };

// One round control button. `off` = the thing it controls is switched off (muted camera, ...): shown in red.
function Ctrl({ id, label, hint, off = false, active = false, disabled = false, badge = 0, onClick, expanded, pressed, children }) {
  const style = off ? { background: 'rgba(229,72,77,.16)', color: '#f87171' } : active ? { background: 'var(--accent-soft)', color: 'var(--accent-text)' } : undefined;
  return (
    <button type="button" id={id} className="btn-icon relative" style={style} onClick={onClick} disabled={disabled} aria-label={label} title={hint ? `${label} (${hint})` : label} aria-expanded={expanded} aria-pressed={pressed}>
      {children}
      {badge > 0 && (
        <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full px-1 text-center text-[10px] font-bold leading-[18px] text-white" style={{ background: RED }} aria-hidden>{badge > 9 ? '9+' : badge}</span>
      )}
    </button>
  );
}

// Bottom bar of the meeting room. Three zones: [ spacer ] [ controls, centred ] [ Leave, at the far right ].
//   Host:        the red "Leave" button opens a small menu: "End meeting for all" / "Leave meeting" / "Cancel".
//   Participant: a plain red "Leave" button.
//   Full screen: `floating` turns the bar into a rounded pill that hovers over the video; `visible` slides it away when idle.
//                `onHold(true)` is reported while the pointer or keyboard focus is on the bar (or the Leave menu is open) so the room does not hide it.
// `endButton` is the older way of showing an "End for all" button next to Leave; it still works when `isHost`/`onEndForAll` are not given.
export default function MeetingControls({
  locked = false, hidePeople = false, audio, video, canVideo = true, onToggleAudio, onToggleVideo,
  panel, onPanel, unread = 0, waiting = 0, onLeave, onEndForAll, isHost = false, leaving = false, endButton = null,
  fullscreen = false, onToggleFullscreen, floating = false, visible = true, onHold, children,
}) {
  const hostMenu = !!(isHost && onEndForAll);
  const [menu, setMenu] = useState(null);                       // null, or where the menu sits: { right, bottom } (pixels from the screen edge)
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const leaveRef = useRef(null);
  const menuRef = useRef(null);
  const closeMenu = (refocus = true) => { setMenu(null); if (refocus) leaveRef.current?.focus(); };
  const shown = visible || !!menu;                              // never slide the bar away while its Leave menu is open

  useEffect(() => { onHold?.(hover || focus || !!menu); }, [hover, focus, menu, floating, onHold]);

  useEffect(() => {
    if (!menu) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeMenu(); };
    const onDown = (e) => { if (!menuRef.current?.contains(e.target) && !leaveRef.current?.contains(e.target)) closeMenu(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    menuRef.current?.querySelector('[data-first]')?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
  }, [menu]);

  const openMenu = () => {
    if (menu) return closeMenu();
    const r = leaveRef.current?.getBoundingClientRect();
    setMenu(r ? { right: Math.max(12, window.innerWidth - r.right), bottom: window.innerHeight - r.top + 12 } : { right: 12, bottom: 80 });
  };

  const outer = floating
    ? `pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] transition-[transform,opacity,visibility] duration-200 ease-out motion-reduce:transition-none ${shown ? 'translate-y-0 opacity-100' : 'invisible translate-y-6 opacity-0'}`
    : 'border-t border-line pb-[max(0.5rem,env(safe-area-inset-bottom))]';
  const inner = floating
    ? 'pointer-events-auto w-full max-w-5xl rounded-2xl border border-line-strong bg-card/90 p-2 shadow-2xl backdrop-blur-md sm:px-4 sm:py-3'
    : 'px-3 pt-2 sm:px-4 sm:pt-3';

  return (
    <div className={outer}>
      <div
        role="toolbar" aria-label="Meeting controls" className={`flex items-center gap-2 sm:gap-3 ${inner}`}
        onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}
        onFocus={(e) => { if (keyboardFocus(e.target)) setFocus(true); }}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setFocus(false); }}
      >
        {/* left: empty on purpose, it balances the Leave zone so the controls stay centred */}
        <div className="hidden min-w-0 md:block md:flex-1" aria-hidden />

        {/* centre: everything except Leave */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-2 sm:gap-3 md:flex-none">
          <Ctrl label={audio ? 'Mute microphone' : 'Unmute microphone'} off={!audio} disabled={locked} onClick={onToggleAudio}>{audio ? <Mic size={20} aria-hidden /> : <MicOff size={20} aria-hidden />}</Ctrl>
          <Ctrl label={!canVideo ? 'No camera found' : video ? 'Turn camera off' : 'Turn camera on'} off={!video} disabled={locked || !canVideo} onClick={onToggleVideo}>{video ? <Video size={20} aria-hidden /> : <VideoOff size={20} aria-hidden />}</Ctrl>

          {children}

          <span className="mx-0.5 hidden h-7 w-px bg-line sm:block" aria-hidden />

          <Ctrl id="toggle-chat" label={unread ? `Chat, ${unread} unread` : 'Chat'} active={panel === 'chat'} badge={unread} expanded={panel === 'chat'} onClick={() => onPanel('chat')}><MessageSquare size={20} aria-hidden /></Ctrl>
          {!hidePeople && <Ctrl id="toggle-people" label={waiting ? `Participants, ${waiting} waiting` : 'Participants'} active={panel === 'people'} badge={waiting} expanded={panel === 'people'} onClick={() => onPanel('people')}><Users size={20} aria-hidden /></Ctrl>}
          {onToggleFullscreen && (
            <Ctrl id="toggle-fullscreen" label={fullscreen ? 'Exit full screen' : 'Full screen'} hint="F" active={fullscreen} pressed={fullscreen} onClick={onToggleFullscreen}>
              {fullscreen ? <Minimize size={20} aria-hidden /> : <Maximize size={20} aria-hidden />}
            </Ctrl>
          )}
        </div>

        {/* right: Leave sits alone at the far right end of the bar */}
        <div className="flex shrink-0 items-center justify-end gap-2 md:flex-1">
          {!hostMenu && endButton}
          <button
            ref={leaveRef} type="button" disabled={leaving}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full px-3.5 text-sm font-bold text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 sm:px-5"
            style={{ background: RED }}
            onClick={hostMenu ? openMenu : onLeave}
            aria-label={hostMenu ? 'Leave or end meeting' : 'Leave meeting'} title={hostMenu ? 'Leave or end meeting' : 'Leave meeting'}
            aria-haspopup={hostMenu ? 'dialog' : undefined} aria-expanded={hostMenu ? !!menu : undefined}
          >
            <LogOut size={18} aria-hidden /><span className="hidden sm:inline">Leave</span>
          </button>
        </div>
      </div>

      {hostMenu && menu && createPortal(
        <>
          <div className="fixed inset-0 z-[60] bg-black/50 sm:bg-transparent" aria-hidden />
          <div
            ref={menuRef} role="dialog" aria-label="Leave meeting options"
            className="fixed inset-x-3 bottom-3 z-[70] rounded-2xl border border-line-strong bg-card p-3 shadow-2xl sm:inset-x-auto sm:w-80"
            style={window.innerWidth >= 640 ? { right: menu.right, bottom: menu.bottom } : undefined}
          >
            <button type="button" className="flex min-h-[44px] w-full items-center justify-center rounded-xl px-4 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-60" style={{ background: RED }} disabled={leaving} onClick={() => { closeMenu(false); onEndForAll(); }}>
              End meeting for all
            </button>
            <p className="mb-3 mt-1.5 px-1 text-center text-xs text-ink-muted">Everyone is disconnected and the meeting is closed.</p>
            <button type="button" data-first className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-line-strong bg-surface px-4 text-sm font-semibold text-ink transition hover:bg-elevated disabled:opacity-60" disabled={leaving} onClick={() => { closeMenu(false); onLeave(); }}>
              Leave meeting
            </button>
            <p className="mb-3 mt-1.5 px-1 text-center text-xs text-ink-muted">The meeting keeps going for everyone else.</p>
            <button type="button" className="flex min-h-[44px] w-full items-center justify-center rounded-xl px-4 text-sm font-semibold text-ink-soft transition hover:bg-surface" onClick={() => closeMenu()}>
              Cancel
            </button>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}