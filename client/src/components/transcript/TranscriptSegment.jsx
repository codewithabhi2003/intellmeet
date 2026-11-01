import { memo, useEffect, useLayoutEffect, useRef } from 'react';
import { fmtTime } from '../../lib/aiHelpers';

// Text is rendered as plain text (React escapes it), so transcript content can never inject markup.
function TranscriptSegment({ segment, translated, highlighted, hasSpeakerLabels, onHeight }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const measure = () => { const h = el.getBoundingClientRect().height; if (h > 0) onHeight(segment.idx, Math.ceil(h)); };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, [segment.idx, translated, onHeight]);
  useEffect(() => { if (highlighted) ref.current?.scrollIntoView?.({ block: 'nearest' }); }, [highlighted]);

  return (
    <div ref={ref} id={`seg-${segment.idx}`} data-idx={segment.idx} className={`flex gap-3 rounded-xl px-3 py-2 ${highlighted ? 'segment-highlight' : ''}`}>
      <span className="mono mt-0.5 w-14 shrink-0 text-xs text-ink-muted" title={`Segment ${segment.idx}`}>{fmtTime(segment.start)}</span>
      <div className="min-w-0 flex-1">
        {hasSpeakerLabels && segment.speakerLabel && <span className="mr-2 text-xs font-semibold text-ink-soft" title="Automatic label">{segment.speakerLabel}</span>}
        {translated != null ? (
          <>
            <p className="whitespace-pre-wrap break-words text-sm text-ink"><span className="mr-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color: 'var(--cyan-text)', background: 'color-mix(in srgb, var(--accent-cyan) 16%, transparent)' }}>Translated</span>{translated}</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-xs text-ink-muted"><span className="font-semibold">Original: </span>{segment.text}</p>
          </>
        ) : <p className="whitespace-pre-wrap break-words text-sm text-ink">{segment.text}</p>}
      </div>
    </div>
  );
}
export default memo(TranscriptSegment);
