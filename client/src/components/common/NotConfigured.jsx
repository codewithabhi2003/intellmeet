import { KeyRound } from 'lucide-react';
// Shown wherever a feature flag from /api/ai/status is false. Never a fake success.
export default function NotConfigured({ feature, envVar, compact = false }) {
  return (
    <div role="status" className={`flex items-start gap-3 rounded-2xl border border-line bg-input ${compact ? 'p-3' : 'p-4'}`}>
      <KeyRound size={18} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-ink">Not configured</p>
        <p className="text-ink-soft">
          {feature} needs <code className="mono rounded bg-elevated px-1.5 py-0.5 text-xs text-ink">{envVar}</code> in <code className="mono text-xs">server/.env</code>. Add it and restart the server.
        </p>
      </div>
    </div>
  );
}
