import { useEffect, useRef } from 'react';
// Calls fn every `ms` while `active`; fn may be async. Stops on unmount or when active turns false.
export function usePoll(fn, active, ms = 2500) {
  const ref = useRef(fn); ref.current = fn;
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => { ref.current(); }, ms);
    return () => clearInterval(id);
  }, [active, ms]);
}
