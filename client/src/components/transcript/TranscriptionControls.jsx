import { useState } from 'react';
import NotConfigured from '../common/NotConfigured';
import LanguageSelect from '../language/LanguageSelect';

// Host / workspace admins only (the server enforces this too). Without GROQ_API_KEY it shows Not configured, never a fake success.
export default function TranscriptionControls({ status, configured, canManage, languages, onStart, onRetry, busy }) {
  const [language, setLanguage] = useState('');
  if (!configured) return <NotConfigured feature="Transcription" envVar="GROQ_API_KEY" compact />;
  if (!canManage) return null;
  if (status === 'queued' || status === 'processing') return null;
  const failed = status === 'failed';
  const label = failed ? 'Retry transcription' : status === 'completed' ? 'Re-run transcription' : 'Generate transcript';
  return (
    <div className="space-y-3">
      <LanguageSelect label="Spoken language" value={language} onChange={setLanguage} languages={languages} emptyLabel="Use the meeting setting" />
      <button type="button" className={failed || status === 'none' ? 'btn-primary' : 'btn-secondary'} disabled={busy} onClick={() => (failed ? onRetry : onStart)(language ? { language } : {})}>{busy ? 'Starting…' : label}</button>
      {status === 'completed' && <p className="text-xs text-ink-muted">Re-running replaces the transcript and removes its translations and summaries.</p>}
    </div>
  );
}
