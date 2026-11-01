import { useId } from 'react';
import { Loader2 } from 'lucide-react';

// [Original | Translated: Hindi ▾]. Translations are generated on demand and cached per language.
export default function TranslationToggle({ mode, onMode, languages, target, onTarget, status, onRequest, configured }) {
  const id = useId();
  const seg = (active) => ({ background: active ? 'var(--accent-soft)' : 'transparent', color: active ? 'var(--accent-text)' : 'var(--text-secondary)' });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Transcript version" className="inline-flex rounded-full border border-line p-1">
        <button type="button" className="min-h-[36px] rounded-full px-4 text-sm font-medium" style={seg(mode === 'original')} aria-pressed={mode === 'original'} onClick={() => onMode('original')}>Original</button>
        <button type="button" className="min-h-[36px] rounded-full px-4 text-sm font-medium" style={seg(mode === 'translated')} aria-pressed={mode === 'translated'} onClick={() => onMode('translated')} disabled={!languages.length}>Translated</button>
      </div>
      {mode === 'translated' && (
        <>
          <label htmlFor={id} className="sr-only">Translate to</label>
          <select id={id} className="field !w-auto !min-h-[40px]" value={target} onChange={(e) => onTarget(e.target.value)}>{languages.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select>
          {status === 'processing' && <span role="status" className="inline-flex items-center gap-1.5 text-sm text-ink-soft"><Loader2 size={14} className="animate-spin" aria-hidden />Translating…</span>}
          {(status === 'none' || status === 'failed') && (configured
            ? <button type="button" className="btn-secondary !min-h-[40px] !px-4" onClick={onRequest}>{status === 'failed' ? 'Retry translation' : 'Translate'}</button>
            : <span className="text-sm text-ink-muted">Translation needs GEMINI_API_KEY on the server.</span>)}
        </>
      )}
    </div>
  );
}
