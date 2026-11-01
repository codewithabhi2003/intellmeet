import { Circle, Loader2, Square } from 'lucide-react';

// Compact status/control shown in the controls bar for the host.
export default function RecorderControl({ state, error, onRequestStart, onStop, onRetry }) {
  if (state === 'recording') return <button type="button" className="btn-secondary !min-h-[44px] !px-4" onClick={onStop} aria-label="Stop recording"><Square size={16} fill="currentColor" aria-hidden /> Stop</button>;
  if (state === 'uploading') return <span className="inline-flex items-center gap-2 px-3 text-sm text-ink-soft" role="status"><Loader2 size={16} className="animate-spin" aria-hidden />Uploading…</span>;
  if (state === 'error') return <button type="button" className="btn-secondary !px-4" onClick={onRetry} title={error}>Retry upload</button>;
  if (state === 'done') return <span className="px-3 text-sm" role="status" style={{ color: 'var(--green-text)' }}>Recording saved</span>;
  return <button type="button" className="btn-icon" onClick={onRequestStart} aria-label="Start recording"><Circle size={20} aria-hidden style={{ color: 'var(--red-text)' }} /></button>;
}
