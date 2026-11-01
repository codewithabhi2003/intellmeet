import { Loader2 } from 'lucide-react';
import StatusBadge from '../common/StatusBadge';

const FAILURES = {
  NO_RECORDING: 'No recording was uploaded for this meeting.',
  NO_SPEECH: 'No speech was detected in the recording.',
  RATE_LIMITED: 'The speech provider is rate limiting requests. Try again shortly.',
  PROVIDER_ERROR: 'The speech provider returned an error.',
  AUDIO_TOO_LARGE: 'The recording is longer or larger than the configured limit.',
  INTERRUPTED: 'The server restarted while this was processing.',
};
export const failureText = (code) => FAILURES[code] || 'Processing failed.';

export default function ProcessingState({ status, failureCode }) {
  return (
    <div aria-live="polite" className="space-y-2">
      <StatusBadge status={status === 'none' ? 'scheduled' : status} label={status === 'none' ? 'Not transcribed' : undefined} />
      {(status === 'queued' || status === 'processing') && <p className="flex items-center gap-2 text-sm text-ink-soft"><Loader2 size={14} className="animate-spin" aria-hidden />Transcribing. This can take a few minutes for long meetings.</p>}
      {status === 'failed' && <p role="alert" className="text-sm" style={{ color: 'var(--red-text)' }}>{failureText(failureCode)}</p>}
    </div>
  );
}
