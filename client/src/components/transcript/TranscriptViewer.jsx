import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VariableSizeList } from 'react-window';
import { filterSegments, indexOfSegment } from '../../lib/aiHelpers';
import TranscriptSegment from './TranscriptSegment';

const EST = 72;
// Virtualized (react-window) so a 3-hour transcript stays smooth. Row heights are measured, not guessed.
export default function TranscriptViewer({ segments, translations, hasSpeakerLabels, query = '', focusIdx = null, height = 520 }) {
  const listRef = useRef(null);
  const sizes = useRef({});
  const [flash, setFlash] = useState(null);
  const translated = translations || null;
  const items = useMemo(() => filterSegments(segments, query, (s) => `${s.text} ${translated?.get(s.idx) || ''}`), [segments, query, translated]);

  const onHeight = useCallback((idx, h) => {
    if (Math.abs((sizes.current[idx] || 0) - h) < 2) return;
    sizes.current[idx] = h;
    const i = items.findIndex((s) => s.idx === idx);
    if (i >= 0) listRef.current?.resetAfterIndex(i);
  }, [items]);

  useEffect(() => { listRef.current?.resetAfterIndex(0); }, [translated, query]);

  // deep link: ?segment=<idx> scrolls to the segment and pulses a highlight
  useEffect(() => {
    if (focusIdx == null || !segments.length) return undefined;
    const i = indexOfSegment(items, focusIdx);
    if (i < 0) return undefined;
    listRef.current?.scrollToItem(i, 'center');
    setFlash(Number(focusIdx));
    const t = setTimeout(() => setFlash(null), 2200);
    return () => clearTimeout(t);
  }, [focusIdx, segments.length]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!items.length) return <p className="py-8 text-center text-sm text-ink-muted" role="status">{query ? 'No segments match your search.' : 'No transcript segments yet.'}</p>;
  return (
    <div role="log" aria-label="Transcript" aria-live="off">
      <VariableSizeList ref={listRef} height={Math.min(height, Math.max(EST, items.length * EST))} width="100%" itemCount={items.length}
        itemSize={(i) => sizes.current[items[i].idx] || EST} itemKey={(i) => items[i].idx} overscanCount={6}>
        {({ index, style }) => (
          <div style={style}>
            <TranscriptSegment segment={items[index]} translated={translated ? translated.get(items[index].idx) ?? null : null}
              highlighted={flash === items[index].idx} hasSpeakerLabels={hasSpeakerLabels} onHeight={onHeight} />
          </div>
        )}
      </VariableSizeList>
    </div>
  );
}
