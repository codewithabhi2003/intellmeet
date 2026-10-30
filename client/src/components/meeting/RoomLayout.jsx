import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

const TABS = [['chat', 'Chat'], ['people', 'Participants']];
const ease = [0.22, 1, 0.36, 1];

// The meeting screen: top bar, a video stage that fills ALL remaining space, and a bottom bar.
// With the side panel closed the video takes the whole page between the two bars. Opening chat (or the participant list)
// slides a panel in from the right: beside the video on large screens, over it (with a backdrop) on small ones.
export default function RoomLayout({ header, notices, stage, overlay, panel, onPanel, onClose, chat, people, controls }) {
  useEffect(() => {
    if (!panel) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) onClose?.(panel); };   // the reaction picker handles its own Escape first
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [panel, onClose]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-base">
      {header}
      {notices}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <main className="relative min-w-0 flex-1 p-2 sm:p-3">
          <div className="h-full min-h-0">{stage}</div>
          {overlay}
        </main>
        <AnimatePresence>
          {panel && <motion.div key="backdrop" data-testid="panel-backdrop" className="fixed inset-0 z-30 bg-black/50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={() => onClose?.(panel)} />}
          {panel && (
            <motion.aside key="panel" id="room-panel" aria-label={panel === 'people' ? 'Participants' : 'Chat'}
              className="fixed inset-y-0 right-0 z-40 flex w-[min(92vw,380px)] flex-col border-l border-line-strong bg-base shadow-lg lg:static lg:z-auto lg:w-[360px] lg:shadow-none"
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ duration: 0.28, ease }}>
              <div className="flex items-center gap-1 border-b border-line px-2 py-2">
                <div role="group" aria-label="Side panel" className="flex flex-1 gap-1">
                  {TABS.map(([k, label]) => (
                    <button key={k} type="button" aria-pressed={panel === k} onClick={() => onPanel(k)}
                      className={`min-h-[44px] rounded-xl px-3 text-sm font-semibold ${panel === k ? 'bg-accent-soft text-accent-text' : 'text-ink-soft hover:bg-input hover:text-ink'}`}>{label}</button>
                  ))}
                </div>
                <button type="button" className="btn-icon" aria-label="Close panel" onClick={() => onClose?.(panel)}><X size={20} aria-hidden /></button>
              </div>
              <div className={`${panel === 'chat' ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col`}>{chat}</div>
              {panel === 'people' && <div className="min-h-0 flex-1 overflow-y-auto">{people}</div>}
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
      {controls}
    </div>
  );
}
