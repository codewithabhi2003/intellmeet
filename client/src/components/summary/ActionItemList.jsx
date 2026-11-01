import { useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { STATUS_COLUMNS, formatDate } from '../../lib/aiHelpers';

// AI-created items start as "Needs review". Owner/deadline are shown exactly as stated; unknowns stay empty, never guessed.
export default function ActionItemList({ tasks, titles, memberName, onUpdate, onJump }) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');
  if (!tasks.length) return <p className="text-sm text-ink-muted">No action items for this meeting.</p>;
  const save = async (t) => { if (draft.trim() && draft.trim() !== t.title) await onUpdate(t.id, { title: draft.trim() }); setEditing(null); };

  return (
    <ul className="space-y-3">
      {tasks.map((t) => {
        const shown = titles?.get(t.id) || t.title;
        return (
          <li key={t.id} className="rounded-2xl border border-line bg-input p-3">
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1">
                {editing === t.id ? (
                  <div className="flex gap-2"><label className="sr-only" htmlFor={`t-${t.id}`}>Action item title</label><input id={`t-${t.id}`} className="field" value={draft} maxLength={300} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(t); if (e.key === 'Escape') setEditing(null); }} autoFocus />
                    <button type="button" className="btn-icon" onClick={() => save(t)} aria-label="Save title"><Check size={18} aria-hidden /></button><button type="button" className="btn-icon" onClick={() => setEditing(null)} aria-label="Cancel edit"><X size={18} aria-hidden /></button></div>
                ) : (
                  <p className="break-words text-sm font-medium text-ink">{shown}</p>
                )}
                {shown !== t.title && editing !== t.id && <p className="mt-0.5 break-words text-xs text-ink-muted">Original: {t.title}</p>}
                <p className="mt-1 text-xs text-ink-soft">
                  {t.assigneeId ? `Assigned to ${memberName(t.assigneeId)}` : t.ownerText ? `Owner as stated: ${t.ownerText} (not assigned)` : 'No owner stated'}
                  {' · '}{t.deadline ? `Due ${formatDate(t.deadline)}` : t.deadlineText ? `Deadline as stated: ${t.deadlineText}` : 'No deadline stated'}
                </p>
              </div>
              {t.needsReview && <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ color: 'var(--yellow-text)', background: 'color-mix(in srgb, var(--accent-yellow) 16%, transparent)' }}>Needs review</span>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor={`s-${t.id}`}>Status</label>
              <select id={`s-${t.id}`} className="field !w-auto !min-h-[40px]" value={t.status} onChange={(e) => onUpdate(t.id, { status: e.target.value })}>{STATUS_COLUMNS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              {t.needsReview && <button type="button" className="btn-secondary !min-h-[40px] !px-4" onClick={() => onUpdate(t.id, { needsReview: false })}>Confirm</button>}
              {editing !== t.id && <button type="button" className="btn-icon" onClick={() => { setEditing(t.id); setDraft(t.title); }} aria-label={`Edit ${t.title}`}><Pencil size={16} aria-hidden /></button>}
              {t.sourceSegmentIdx != null && <button type="button" className="text-xs font-medium underline" style={{ color: 'var(--accent-text)' }} onClick={() => onJump(t.sourceSegmentIdx)}>Jump to transcript</button>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
