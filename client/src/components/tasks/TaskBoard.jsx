import EmptyState from '../common/EmptyState';
import TaskCard from './TaskCard';
import { STATUS_COLUMNS, groupTasks } from '../../lib/aiHelpers';

// Status changes use a labeled <select> on each card (keyboard and screen-reader friendly) rather than drag and drop.
export default function TaskBoard({ tasks, membersFor, onUpdate, onDelete }) {
  const g = groupTasks(tasks);
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {STATUS_COLUMNS.map(([key, label]) => (
        <section key={key} aria-labelledby={`col-${key}`} className="rounded-3xl border border-line bg-surface p-3">
          <h2 id={`col-${key}`} className="mb-3 flex items-center justify-between px-1 text-sm font-bold text-ink">{label}<span className="mono rounded-full bg-input px-2 py-0.5 text-xs text-ink-soft">{g[key].length}</span></h2>
          <div className="space-y-3">
            {g[key].length === 0 ? <EmptyState title="Nothing here" /> : g[key].map((t) => <TaskCard key={t.id} task={t} members={membersFor(t.workspaceId)} onUpdate={onUpdate} onDelete={onDelete} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
