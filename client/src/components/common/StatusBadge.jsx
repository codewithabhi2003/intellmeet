const MAP = {
  processing: { label: 'Processing', color: 'var(--yellow-text)', bg: 'var(--accent-yellow)', pulse: true },
  queued: { label: 'Queued', color: 'var(--yellow-text)', bg: 'var(--accent-yellow)', pulse: true },
  completed: { label: 'Completed', color: 'var(--green-text)', bg: 'var(--accent-green)' },
  failed: { label: 'Failed', color: 'var(--red-text)', bg: 'var(--accent-red)' },
  live: { label: 'Live', color: 'var(--green-text)', bg: 'var(--accent-green)', pulse: true },
  scheduled: { label: 'Scheduled', color: 'var(--accent-text)', bg: 'var(--accent)' },
  ended: { label: 'Ended', color: 'var(--text-secondary)', bg: 'var(--text-muted)' },
  cancelled: { label: 'Cancelled', color: 'var(--red-text)', bg: 'var(--accent-red)' },
  translated: { label: 'Translated', color: 'var(--cyan-text)', bg: 'var(--accent-cyan)' },
};
export default function StatusBadge({ status, label }) {
  const s = MAP[status] || { label: status, color: 'var(--text-secondary)', bg: 'var(--text-muted)' };
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ color: s.color, background: `color-mix(in srgb, ${s.bg} 16%, transparent)` }}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.pulse ? 'dot-pulse' : ''}`} style={{ background: s.color }} aria-hidden />
      {label || s.label}
    </span>
  );
}
