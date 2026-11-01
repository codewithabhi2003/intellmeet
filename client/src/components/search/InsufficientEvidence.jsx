import { SearchX } from 'lucide-react';
// `message` is the exact server text; the hint is extra guidance, never an answer.
export default function InsufficientEvidence({ message }) {
  return (
    <div role="status" className="flex items-start gap-3 rounded-3xl border border-line bg-card p-6">
      <SearchX size={22} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
      <div><p className="font-semibold text-ink">{message}</p><p className="mt-1 text-sm text-ink-soft">Try widening the date range, workspace or meeting filters, or rephrase your question.</p></div>
    </div>
  );
}
