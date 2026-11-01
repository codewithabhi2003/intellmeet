import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import LanguageSettingsPanel from '../components/language/LanguageSettingsPanel';
import MeetingLinkBox from '../components/meeting/MeetingLinkBox';
import { Skeleton } from '../components/common/Skeleton';
import * as aiService from '../services/aiService';
import * as meetingService from '../services/meetingService';
import * as workspaceService from '../services/workspaceService';
import { errorCode, errorMessage } from '../services/api';
import { generateRoomCode, meetingLink } from '../lib/meetingLink';
import { DEFAULT_LANGUAGE_SETTINGS, buildCreatePayload, isEmail, parseEmails } from '../lib/meetingForm';

export default function CreateMeeting() {
  const navigate = useNavigate();
  const [ref, setRef] = useState({ workspaces: null, languages: null, error: '' });
  const [form, setForm] = useState({ title: '', description: '', mode: 'now', scheduledAt: '', workspaceId: '', emails: '', waitingRoom: false, languageSettings: DEFAULT_LANGUAGE_SETTINGS });
  const [roomCode] = useState(generateRoomCode);          // made now, so the link and code can be copied before the meeting exists
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const load = () => {
    setRef({ workspaces: null, languages: null, error: '' });
    Promise.all([workspaceService.list(), aiService.languages()])
      .then(([workspaces, languages]) => { setRef({ workspaces, languages, error: '' }); setForm((f) => ({ ...f, workspaceId: f.workspaceId || workspaces[0]?.id || '' })); })
      .catch((e) => setRef({ workspaces: null, languages: null, error: errorMessage(e) }));
  };
  useEffect(load, []);

  const emails = parseEmails(form.emails);
  const badEmails = emails.filter((e) => !isEmail(e));
  const whenValid = form.mode === 'now' || (form.scheduledAt && new Date(form.scheduledAt) > new Date());
  const valid = form.title.trim() && form.workspaceId && !badEmails.length && whenValid;

  const submit = async (e) => {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const { meeting, unknownEmails } = await meetingService.create(buildCreatePayload({ ...form, emails, roomCode }));
      if (unknownEmails?.length) toast(`No account found for: ${unknownEmails.join(', ')}`, { icon: '⚠️' });
      if (form.mode === 'now') navigate(`/room/${meeting.roomCode}`);
      else { toast.success('Meeting scheduled'); navigate('/meetings'); }
    } catch (err) { setError(errorCode(err) === 'DUPLICATE' ? 'That meeting code is already taken. Reload this page to get a new one.' : errorMessage(err, 'Could not create the meeting.')); setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-extrabold text-ink">New meeting</h1>
      <p className="mb-6 text-ink-soft">Start right away or schedule it for later.</p>
      {ref.error && <div role="alert" className="mb-4 space-y-2 text-sm"><p style={{ color: 'var(--red-text)' }}>{ref.error}</p><button type="button" className="btn-secondary" onClick={load}>Retry</button></div>}
      {!ref.error && !ref.languages && <div className="space-y-3"><Skeleton height={48} /><Skeleton height={48} /><Skeleton height={200} /></div>}
      {ref.languages && (
        <form onSubmit={submit} className="space-y-5" noValidate>
          <div><label className="label" htmlFor="title">Title</label><input id="title" className="field" maxLength={140} required value={form.title} onChange={set('title')} /></div>
          <div><label className="label" htmlFor="desc">Description (optional)</label><textarea id="desc" rows={2} maxLength={2000} className="field" value={form.description} onChange={set('description')} /></div>

          <fieldset className="space-y-3">
            <legend className="label">When</legend>
            <div className="flex gap-3">
              {[['now', 'Start now'], ['later', 'Schedule']].map(([v, l]) => (
                <label key={v} className={`flex min-h-[44px] flex-1 cursor-pointer items-center justify-center rounded-xl border px-4 text-sm font-medium ${form.mode === v ? 'border-[var(--accent)] bg-accent-soft text-accent-text' : 'border-line text-ink-soft'}`}>
                  <input type="radio" name="mode" className="sr-only" checked={form.mode === v} onChange={() => setForm((f) => ({ ...f, mode: v }))} />{l}
                </label>
              ))}
            </div>
            {form.mode === 'later' && (
              <div><label className="label" htmlFor="when">Date and time</label><input id="when" type="datetime-local" className="field" value={form.scheduledAt} onChange={set('scheduledAt')} aria-invalid={!!form.scheduledAt && !whenValid} />
                {form.scheduledAt && !whenValid && <p className="mt-1 text-xs" style={{ color: 'var(--red-text)' }}>Pick a time in the future.</p>}</div>
            )}
          </fieldset>

          <div>
            <label className="label" htmlFor="ws">Workspace</label>
            <select id="ws" className="field" value={form.workspaceId} onChange={set('workspaceId')}>{ref.workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
            <p className="mt-1 text-xs text-ink-muted">Everyone in the workspace can see this meeting and its records.</p>
          </div>
          <div>
            <label className="label" htmlFor="inv">Invite by email (optional)</label>
            <textarea id="inv" rows={2} className="field" placeholder="name@company.com, other@company.com" value={form.emails} onChange={set('emails')} aria-invalid={!!badEmails.length} aria-describedby="inv-h" />
            <p id="inv-h" className="mt-1 text-xs" style={{ color: badEmails.length ? 'var(--red-text)' : 'var(--text-muted)' }}>{badEmails.length ? `Not a valid email: ${badEmails.join(', ')}` : 'People must already have an IntellMeet account.'}</p>
          </div>

          <fieldset className="space-y-3 rounded-2xl border border-line bg-surface p-4">
            <legend className="px-1 text-sm font-bold text-ink">Meeting link and code</legend>
            <p className="text-xs text-ink-muted">Ready now, even for a scheduled meeting. Copy and share them before it starts; the link opens the meeting once the host starts it.</p>
            <MeetingLinkBox link={meetingLink(roomCode)} code={roomCode} />
          </fieldset>

          <div className="flex items-start gap-3">
            <input id="waiting-room" type="checkbox" className="mt-1 h-5 w-5 accent-[var(--btn-bg)]" checked={form.waitingRoom} onChange={(e) => setForm((f) => ({ ...f, waitingRoom: e.target.checked }))} />
            <label htmlFor="waiting-room" className="text-sm text-ink">Waiting room
              <span className="block text-xs text-ink-muted">People wait outside until you, the host, let them in one by one.</span></label>
          </div>

          <LanguageSettingsPanel value={form.languageSettings} onChange={(languageSettings) => setForm((f) => ({ ...f, languageSettings }))} languages={ref.languages} />

          <p role="alert" aria-live="polite" className="min-h-[1.25rem] text-sm" style={{ color: 'var(--red-text)' }}>{error}</p>
          <button type="submit" className="btn-primary" disabled={!valid || busy}>{busy ? 'Creating…' : form.mode === 'now' ? 'Start meeting' : 'Schedule meeting'}</button>
        </form>
      )}
    </div>
  );
}