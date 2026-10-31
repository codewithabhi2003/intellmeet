import { useId } from 'react';
// Options always come from GET /api/languages (verified languages only).
export default function LanguageSelect({ label, value, onChange, languages, emptyLabel, hint }) {
  const id = useId();
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <select id={id} className="field" value={value || ''} onChange={(e) => onChange(e.target.value)} aria-describedby={hint ? `${id}-h` : undefined}>
        {emptyLabel && <option value="">{emptyLabel}</option>}
        {languages.map((l) => <option key={l.code} value={l.code}>{l.name} ({l.native})</option>)}
      </select>
      {hint && <p id={`${id}-h`} className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
