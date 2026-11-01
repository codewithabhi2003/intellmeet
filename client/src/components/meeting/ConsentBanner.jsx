import { useState } from 'react';
import { ShieldAlert, Circle } from 'lucide-react';

// host: asks for confirmation before recording starts. viewer: tells everyone else that a recording is running.
export default function ConsentBanner({ variant, onConfirm, onCancel, busy }) {
  const [ok, setOk] = useState(false);
  if (variant === 'viewer') {
    return (
      <div role="status" className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--accent-red)', color: 'var(--red-text)' }}>
        <Circle size={10} fill="currentColor" aria-hidden /> The host is recording the audio of this meeting. A transcript is generated after the meeting.
      </div>
    );
  }
  return (
    <div role="group" aria-label="Recording consent" className="rounded-2xl border border-line-strong bg-elevated p-4 shadow-md">
      <p className="mb-2 flex items-center gap-2 text-sm font-bold text-ink"><ShieldAlert size={18} style={{ color: 'var(--yellow-text)' }} aria-hidden />Before you record</p>
      <p className="mb-3 text-sm text-ink-soft">Recording captures the audio of everyone in this meeting. Participants will see a recording notice. The transcript is generated after the meeting, not live.</p>
      <label className="mb-3 flex items-start gap-2 text-sm text-ink"><input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--btn-bg)]" checked={ok} onChange={(e) => setOk(e.target.checked)} />I have told the participants that this meeting will be recorded.</label>
      <div className="flex gap-2">
        <button type="button" className="btn-primary" disabled={!ok || busy} onClick={onConfirm}>{busy ? 'Starting…' : 'Start recording'}</button>
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
