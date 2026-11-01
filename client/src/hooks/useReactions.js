import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from './useSocket';
import { SEND_COOLDOWN_MS, addFloating, durationFor, isKnownEmoji, laneFor, wobbleFor } from '../lib/reactions';

// Sends and receives meeting reactions. The server echoes every reaction to the whole room (sender included),
// so a reaction only appears once it has been validated there.
export function useReactions({ enabled = true, now = () => Date.now(), rnd = Math.random } = {}) {
  const { getSocket } = useSocket();
  const [floating, setFloating] = useState([]);
  const [latest, setLatest] = useState(null);
  const lastSent = useRef(0);

  useEffect(() => {
    if (!enabled) return undefined;
    const socket = getSocket();
    const onReaction = (r) => {
      if (!r?.id || !isKnownEmoji(r.emoji)) return;                                   // ignore anything we don't recognize
      setFloating((l) => addFloating(l, { id: r.id, emoji: r.emoji, name: String(r.name || ''), lane: laneFor(rnd), wobble: wobbleFor(rnd), dur: durationFor(rnd) }));
      setLatest({ id: r.id, emoji: r.emoji, name: String(r.name || '') });
    };
    socket.on('reaction:received', onReaction);
    return () => socket.off('reaction:received', onReaction);
  }, [enabled, getSocket, rnd]);

  const send = useCallback((emoji) => {
    if (!isKnownEmoji(emoji)) return false;
    const t = now();
    if (t - lastSent.current < SEND_COOLDOWN_MS) return false;                          // gentle client-side throttle
    lastSent.current = t;
    getSocket().emit('reaction:send', { emoji }, () => {});
    return true;
  }, [getSocket, now]);

  const remove = useCallback((id) => setFloating((l) => l.filter((x) => x.id !== id)), []);
  return { floating, latest, send, remove };
}
