import { Globe2 } from 'lucide-react';
export default function LanguageIndicator({ settings, languages = [] }) {
  const name = (c) => languages.find((l) => l.code === c)?.name || c;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-input px-2.5 py-1 text-xs font-medium text-ink-soft" title="Meeting language">
      <Globe2 size={14} aria-hidden /> {name(settings?.primaryLanguage || 'en')}{settings?.autoDetect ? ' · auto-detect' : ''}
    </span>
  );
}
