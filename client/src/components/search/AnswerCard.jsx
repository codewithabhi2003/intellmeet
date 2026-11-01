import { motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, Info } from 'lucide-react';
import { splitAnswer } from '../../lib/aiHelpers';

const jump = (n) => { const el = document.getElementById(`source-${n}`); el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); el?.focus?.(); };

// The answer is plain text; [n] markers become buttons that jump to the matching source card.
export default function AnswerCard({ answer, conflicts = [], limitations = [], sourceCount }) {
  const reduce = useReducedMotion();
  return (
    <motion.section initial={{ opacity: 0, y: reduce ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-3xl border border-line bg-card p-6 shadow-md" aria-label="Answer">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-muted">Answer</h2>
      <p className="whitespace-pre-wrap break-words text-base leading-relaxed text-ink">
        {splitAnswer(answer).map((p, i) => p.type === 'cite'
          ? <button key={i} type="button" className="mono mx-0.5 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full px-1.5 align-baseline text-xs font-semibold" style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
              aria-label={`Go to source ${p.n}${sourceCount ? ` of ${sourceCount}` : ''}`} onClick={() => jump(p.n)}>{p.n}</button>
          : <span key={i}>{p.value}</span>)}
      </p>
      {conflicts.length > 0 && <div className="mt-4 rounded-xl border p-3" style={{ borderColor: 'var(--accent-yellow)' }} role="note"><p className="mb-1 flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--yellow-text)' }}><AlertTriangle size={16} aria-hidden />Sources disagree</p><ul className="list-disc space-y-1 pl-5 text-sm text-ink">{conflicts.map((c, i) => <li key={i}>{c}</li>)}</ul></div>}
      {limitations.length > 0 && <div className="mt-3 rounded-xl bg-input p-3" role="note"><p className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink-soft"><Info size={16} aria-hidden />Limitations</p><ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">{limitations.map((c, i) => <li key={i}>{c}</li>)}</ul></div>}
    </motion.section>
  );
}
