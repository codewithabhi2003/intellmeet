import { useId } from 'react';
import LanguageSelect from './LanguageSelect';

export default function LanguageSettingsPanel({ value, onChange, languages }) {
  const id = useId();
  const set = (k) => (v) => onChange({ ...value, [k]: v });
  return (
    <fieldset className="space-y-4 rounded-2xl border border-line bg-surface p-4">
      <legend className="px-1 text-sm font-bold text-ink">Language</legend>
      <LanguageSelect label="Primary language" value={value.primaryLanguage} onChange={set('primaryLanguage')} languages={languages} hint="The language mostly spoken in this meeting." />
      <div className="flex items-start gap-3">
        <input id={`${id}-auto`} type="checkbox" className="mt-1 h-5 w-5 accent-[var(--btn-bg)]" checked={value.autoDetect} onChange={(e) => onChange({ ...value, autoDetect: e.target.checked })} />
        <label htmlFor={`${id}-auto`} className="text-sm text-ink">
          Detect the spoken language automatically
          <span className="block text-xs text-ink-muted">The speech model identifies the language from the audio when the transcript is generated.</span>
        </label>
      </div>
      <LanguageSelect label="Transcript language" value={value.transcriptLanguage} onChange={set('transcriptLanguage')} languages={languages}
        emptyLabel="Not set (use my preference, then the primary language)" />
      <LanguageSelect label="Summary language" value={value.summaryLanguage} onChange={set('summaryLanguage')} languages={languages}
        emptyLabel="Not set (use my preference, then the primary language)" />
    </fieldset>
  );
}
