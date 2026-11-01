import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { fmtTime } from '../../lib/aiHelpers';

// `source.text` is ALWAYS the original excerpt; a translation (if one exists) is shown separately and labeled.
export default function SourceCard({ source, langName }) {
  const [open, setOpen] = useState(false);
  const id = `source-${source.n}`;
  return (
    <article id={id} tabIndex={-1} className="rounded-2xl border border-line bg-card p-4 outline-none focus-visible:ring-2" aria-label={`Source ${source.n}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="mono flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold" style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>{source.n}</span>
        <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{source.meetingTitle}</h3>
      </div>
      <p className="mono mb-2 text-xs text-ink-muted">{source.date} · <span className="rounded-full border border-line px-2 py-0.5" title="Time in the meeting">{fmtTime(source.start)}</span></p>
      <p className={`whitespace-pre-wrap break-words text-sm text-ink ${open ? '' : 'line-clamp-3'}`}><span className="sr-only">Original: </span>{source.text}</p>
      {open && source.translatedText && (
        <div className="mt-3 rounded-xl border-l-2 bg-input p-3" style={{ borderColor: 'var(--accent-cyan)' }}>
          <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--cyan-text)' }}>Translated to {langName(source.translatedLanguage)}</p>
          <p className="whitespace-pre-wrap break-words text-sm text-ink-soft">{source.translatedText}</p>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium" style={{ color: 'var(--accent-text)' }} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <ChevronDown size={16} className={open ? 'rotate-180' : ''} aria-hidden />{open ? 'Show less' : 'Show full excerpt'}</button>
        <Link to={source.openUrl} className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold underline" style={{ color: 'var(--accent-text)' }}><ExternalLink size={14} aria-hidden />Open in meeting</Link>
      </div>
    </article>
  );
}
