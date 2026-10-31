import { Loader2 } from 'lucide-react';
import NotConfigured from '../common/NotConfigured';
import { SkeletonText } from '../common/Skeleton';
import SummaryLanguageSelect from './SummaryLanguageSelect';
import { failureText } from '../transcript/ProcessingState';

const Section = ({ title, items }) => (
  <section className="mt-5">
    <h3 className="mb-2 text-sm font-bold text-ink">{title}</h3>
    {items?.length ? <ul className="list-disc space-y-1 pl-5 text-sm text-ink">{items.map((t, i) => <li key={i} className="break-words">{t}</li>)}</ul> : <p className="text-sm text-ink-muted">None stated.</p>}
  </section>
);

export default function SummaryPanel({ loading, status, summary, failureCode, language, onLanguage, languages, configured, transcriptReady, onGenerate, busy }) {
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-bold text-ink">Summary</h2>
        <div className="w-48"><SummaryLanguageSelect value={language} onChange={onLanguage} languages={languages} /></div>
      </div>
      <div aria-live="polite">
        {loading && <SkeletonText lines={6} />}
        {!loading && status === 'completed' && summary && (
          <>
            <p className="whitespace-pre-wrap break-words text-sm text-ink">{summary.overview}</p>
            <Section title="Decisions" items={summary.decisions} />
            <Section title="Discussion points" items={summary.discussionPoints} />
            <Section title="Open questions" items={summary.openQuestions} />
            <Section title="Risks" items={summary.risks} />
            {configured && <button type="button" className="btn-secondary mt-5" disabled={busy} onClick={() => onGenerate(true)}>Regenerate</button>}
          </>
        )}
        {!loading && status === 'processing' && <p role="status" className="flex items-center gap-2 text-sm text-ink-soft"><Loader2 size={16} className="animate-spin" aria-hidden />Writing the summary…</p>}
        {!loading && status === 'failed' && <div role="alert" className="space-y-3 text-sm"><p style={{ color: 'var(--red-text)' }}>{failureText(failureCode)}</p>{configured && <button type="button" className="btn-secondary" onClick={() => onGenerate(false)}>Try again</button>}</div>}
        {!loading && (status === 'none' || !status) && (
          !configured ? <NotConfigured feature="Summaries" envVar="GEMINI_API_KEY" compact />
            : !transcriptReady ? <p className="text-sm text-ink-muted">A summary can be generated once the transcript is ready.</p>
              : <button type="button" className="btn-primary" disabled={busy} onClick={() => onGenerate(false)}>Generate summary</button>
        )}
      </div>
    </div>
  );
}
