import { MonitorUp, MonitorOff } from 'lucide-react';
export default function ScreenShareButton({ sharing, onStart, onStop, supported }) {
  if (!supported) return null;
  return (
    <button type="button" className="btn-icon" onClick={sharing ? onStop : onStart} aria-pressed={sharing} aria-label={sharing ? 'Stop sharing screen' : 'Share screen'}
      style={sharing ? { background: 'var(--accent-soft)', color: 'var(--accent-text)' } : undefined}>
      {sharing ? <MonitorOff size={20} aria-hidden /> : <MonitorUp size={20} aria-hidden />}
    </button>
  );
}
