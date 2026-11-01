import { formatWhen } from '../../lib/meetingForm';
export default function SearchFilters({ value, onChange, workspaces, meetings, languages }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div><label className="label" htmlFor="sf-from">From</label><input id="sf-from" type="date" className="field" value={value.from} max={value.to || undefined} onChange={set('from')} /></div>
      <div><label className="label" htmlFor="sf-to">To</label><input id="sf-to" type="date" className="field" value={value.to} min={value.from || undefined} onChange={set('to')} /></div>
      <div><label className="label" htmlFor="sf-ws">Workspace</label><select id="sf-ws" className="field" value={value.workspaceId} onChange={set('workspaceId')}><option value="">All</option>{workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
      <div><label className="label" htmlFor="sf-m">Meeting</label><select id="sf-m" className="field" value={value.meetingId} onChange={set('meetingId')}><option value="">All</option>{meetings.map((m) => <option key={m.id} value={m.id}>{m.title} · {formatWhen(m)}</option>)}</select></div>
      <div><label className="label" htmlFor="sf-l">Answer in</label><select id="sf-l" className="field" value={value.answerLanguage} onChange={set('answerLanguage')}>{languages.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select></div>
    </div>
  );
}
