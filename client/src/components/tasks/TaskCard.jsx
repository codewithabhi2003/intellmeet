import { Link } from 'react-router-dom';
import { Sparkles, Trash2 } from 'lucide-react';
import { STATUS_COLUMNS, formatDate } from '../../lib/aiHelpers';

export default function TaskCard({ task, members, onUpdate, onDelete }) {
  return (
    <article className="rounded-2xl border border-line bg-card p-3" aria-label={task.title}>
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 break-words text-sm font-medium text-ink">{task.title}</p>
        <button type="button" className="btn-icon !h-9 !w-9" onClick={() => onDelete(task)} aria-label={`Delete ${task.title}`}><Trash2 size={15} aria-hidden /></button>
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {task.source === 'ai' && <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color: 'var(--accent-text)', background: 'var(--accent-soft)' }}><Sparkles size={11} aria-hidden />AI</span>}
        {task.needsReview && <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color: 'var(--yellow-text)', background: 'color-mix(in srgb, var(--accent-yellow) 16%, transparent)' }}>Needs review</span>}
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        {task.deadline ? `Due ${formatDate(task.deadline)}` : task.deadlineText ? `Deadline as stated: ${task.deadlineText}` : 'No deadline'}
        {!task.assigneeId && task.ownerText ? ` · Owner as stated: ${task.ownerText}` : ''}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div><label className="sr-only" htmlFor={`st-${task.id}`}>Status</label>
          <select id={`st-${task.id}`} className="field !min-h-[40px] !py-1 text-sm" value={task.status} onChange={(e) => onUpdate(task.id, { status: e.target.value })}>{STATUS_COLUMNS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div><label className="sr-only" htmlFor={`as-${task.id}`}>Assignee</label>
          <select id={`as-${task.id}`} className="field !min-h-[40px] !py-1 text-sm" value={task.assigneeId || ''} onChange={(e) => onUpdate(task.id, { assigneeId: e.target.value || null })}>
            <option value="">Unassigned</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {task.needsReview && <button type="button" className="btn-secondary !min-h-[40px] !px-4 text-sm" onClick={() => onUpdate(task.id, { needsReview: false })}>Confirm</button>}
        {task.meetingId && <Link className="text-xs font-medium underline" style={{ color: 'var(--accent-text)' }} to={`/meetings/${task.meetingId}${task.sourceSegmentIdx != null ? `?segment=${task.sourceSegmentIdx}` : ''}`}>View in meeting</Link>}
      </div>
    </article>
  );
}
