import { Search } from 'lucide-react';
// Enter submits, Shift+Enter inserts a newline.
export default function SearchBar({ value, onChange, onSubmit, busy, max = 500 }) {
  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (value.trim() && !busy) onSubmit(); } };
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (value.trim() && !busy) onSubmit(); }} className="flex items-end gap-2" role="search">
      <div className="flex-1">
        <label htmlFor="q" className="sr-only">Ask anything about your previous meetings</label>
        <div className="relative"><Search size={18} className="pointer-events-none absolute left-3 top-3.5 text-ink-muted" aria-hidden />
          <textarea id="q" rows={1} maxLength={max} className="field resize-none !pl-10" placeholder="Ask anything about your previous meetings..." value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey} /></div>
      </div>
      <button type="submit" className="btn-primary" disabled={!value.trim() || busy}>{busy ? 'Searching…' : 'Search'}</button>
    </form>
  );
}
