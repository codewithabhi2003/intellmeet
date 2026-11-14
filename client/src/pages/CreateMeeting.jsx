import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CalendarClock, Presentation, Users, Video, Zap } from 'lucide-react';
import LanguageSettingsPanel from '../components/language/LanguageSettingsPanel';
import MeetingLinkBox from '../components/meeting/MeetingLinkBox';
import { Skeleton } from '../components/common/Skeleton';
import * as aiService from '../services/aiService';
import * as meetingService from '../services/meetingService';
import * as workspaceService from '../services/workspaceService';
import { errorCode, errorMessage } from '../services/api';
import { generateRoomCode, meetingLink } from '../lib/meetingLink';
import { DEFAULT_LANGUAGE_SETTINGS, buildCreatePayload, isEmail, parseEmails } from '../lib/meetingForm';

// ---- small building blocks (this page only) ----

// A numbered card. The numbers show the order: basics -> time -> type -> people -> share -> language.
function Section({ n, title, hint, children }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4 sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold" style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }} aria-hidden>{n}</span>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-ink">{title}</h2>
          {hint && <p className="mt-0.5 text-sm text-ink-muted">{hint}</p>}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

// An on/off switch that is still a real checkbox (keyboard and screen readers work as before).
function Switch({ id, checked, onChange, label, hint }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface p-3 focus-within:ring-2 focus-within:ring-[var(--accent)]">
      <input id={id} type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors" style={{ background: checked ? 'var(--btn-bg)' : 'rgba(148,163,184,.35)' }}>
        <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: checked ? 22 : 2 }} />
      </span>
      <span className="min-w-0 text-sm font-medium text-ink">{label}<span className="block text-xs font-normal text-ink-muted">{hint}</span></span>
    </label>
  );
}

const card = (on) => `flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border p-3 transition focus-within:ring-2 focus-within:ring-[var(--accent)] ${on ? 'border-[var(--accent)] bg-accent-soft' : 'border-line hover:border-line-strong'}`;

export default function CreateMeeting() {
  const navigate = useNavigate();
  const [ref, setRef] = useState({ workspaces: null, languages: null, error: '' });
  const [form, setForm] = useState({ title: '', description: '', mode: 'now', scheduledAt: '', workspaceId: '', emails: '', waitingRoom: false, visibility: 'private', seminar: false, openLink: true, languageSettings: DEFAULT_LANGUAGE_SETTINGS });
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
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-2xl font-extrabold text-ink sm:text-3xl">New meeting</h1>
      <p className="mb-6 text-ink-soft">Start right away or schedule it for later.</p>
      {ref.error && <div role="alert" className="mb-4 space-y-2 text-sm"><p style={{ color: 'var(--red-text)' }}>{ref.error}</p><button type="button" className="btn-secondary" onClick={load}>Retry</button></div>}
      {!ref.error && !ref.languages && <div className="space-y-3"><Skeleton height={48} /><Skeleton height={48} /><Skeleton height={200} /></div>}
      {ref.languages && (
        <form onSubmit={submit} className="space-y-4" noValidate>

          {/* 1. the basics */}
          <Section n={1} title="Basics" hint="Only the title is required. Everything else has a sensible default.">
            <div><label className="label" htmlFor="title">Title</label><input id="title" className="field" maxLength={140} required value={form.title} onChange={set('title')} placeholder="For example: Weekly team sync" /></div>
            <div><label className="label" htmlFor="desc">Description (optional)</label><textarea id="desc" rows={2} maxLength={2000} className="field" value={form.description} onChange={set('description')} placeholder="What will you talk about?" /></div>
          </Section>

          {/* 2. when */}
          <Section n={2} title="Timing" hint="Begin straight away, or pick a date and time.">
            <fieldset className="space-y-3">
              <legend className="sr-only">When</legend>
              <div className="grid grid-cols-2 gap-3">
                {[['now', 'Start now', Zap], ['later', 'Schedule', CalendarClock]].map(([v, l, Icon]) => (
                  <label key={v} className={`flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition focus-within:ring-2 focus-within:ring-[var(--accent)] ${form.mode === v ? 'border-[var(--accent)] bg-accent-soft text-accent-text' : 'border-line text-ink-soft hover:border-line-strong'}`}>
                    <input type="radio" name="mode" className="sr-only" checked={form.mode === v} onChange={() => setForm((f) => ({ ...f, mode: v }))} /><Icon size={16} aria-hidden />{l}
                  </label>
                ))}
              </div>
              {form.mode === 'now'
                ? <p className="text-xs text-ink-muted">You join the room as soon as you press the button at the bottom.</p>
                : (
                  <div><label className="label" htmlFor="when">Date and time</label><input id="when" type="datetime-local" className="field" value={form.scheduledAt} onChange={set('scheduledAt')} aria-invalid={!!form.scheduledAt && !whenValid} />
                    {form.scheduledAt && !whenValid && <p className="mt-1 text-xs" style={{ color: 'var(--red-text)' }}>Pick a time in the future.</p>}</div>
                )}
            </fieldset>
          </Section>

          {/* 3. type */}
          <Section n={3} title="Format" hint="A normal meeting, or a presentation where only you speak.">
            <fieldset className="space-y-3">
              <legend className="sr-only">Meeting type</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {[[false, 'Meeting', 'Everyone can use their camera and microphone.', Video], [true, 'Seminar', 'Only you present. Attendees watch, chat and react; their camera and microphone are disabled.', Presentation]].map(([v, title, hint, Icon]) => (
                  <label key={String(v)} className={card(form.seminar === v)}>
                    <input type="radio" name="kind" className="sr-only" checked={form.seminar === v} onChange={() => setForm((f) => ({ ...f, seminar: v }))} />
                    <Icon size={20} className="mt-0.5 shrink-0 text-accent-text" aria-hidden />
                    <span><span className="block text-sm font-medium text-ink">{title}</span><span className="block text-xs text-ink-muted">{hint}</span></span>
                  </label>
                ))}
              </div>
              {form.seminar && (
                <div className="space-y-3 rounded-xl border border-line bg-surface p-3">
                  <Switch id="open-link" checked={form.openLink} onChange={(openLink) => setForm((f) => ({ ...f, openLink }))} label="Anyone with the link can attend"
                    hint="They need an IntellMeet account, but not a workspace or an invite. Turn it off to allow only people you invite or your workspace." />
                  <p className="text-xs text-ink-muted">Only you can see a seminar’s transcript, summary and recording. Each attendee is a separate video connection from your browser, so seminars suit small audiences.</p>
                </div>
              )}
            </fieldset>
          </Section>

          {/* 4. people and privacy */}
          <Section n={4} title="People and privacy" hint="Choose the workspace, who can open the records, and who you invite.">
            <div>
              <label className="label" htmlFor="ws">Workspace</label>
              <select id="ws" className="field" value={form.workspaceId} onChange={set('workspaceId')}>{ref.workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
            </div>

            {!form.seminar && (
              <fieldset className="space-y-2">
                <legend className="label">Who can see this meeting's transcript and summary?</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[['private', 'Only me and the people I invite', 'Other workspace members cannot open it, search it, or see its action items.'], ['workspace', 'Everyone in the workspace', 'Every member of the workspace can open the meeting and its records.']].map(([v, title, hint]) => (
                    <label key={v} className={card(form.visibility === v)}>
                      <input type="radio" name="visibility" value={v} className="mt-1 h-4 w-4 accent-[var(--btn-bg)]" checked={form.visibility === v} onChange={() => setForm((f) => ({ ...f, visibility: v }))} />
                      <span><span className="block text-sm font-medium text-ink">{title}</span><span className="block text-xs text-ink-muted">{hint}</span></span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <div>
              <label className="label" htmlFor="inv">Invite by email (optional)</label>
              <textarea id="inv" rows={2} className="field" placeholder="name@company.com, other@company.com" value={form.emails} onChange={set('emails')} aria-invalid={!!badEmails.length} aria-describedby="inv-h" />
              <p id="inv-h" className="mt-1 text-xs" style={{ color: badEmails.length ? 'var(--red-text)' : 'var(--text-muted)' }}>{badEmails.length ? `Not a valid email: ${badEmails.join(', ')}` : 'People must already have an IntellMeet account.'}</p>
            </div>

            <Switch id="waiting-room" checked={form.waitingRoom} onChange={(waitingRoom) => setForm((f) => ({ ...f, waitingRoom }))} label="Waiting room"
              hint="People wait outside until you, the host, let them in one by one." />
          </Section>

          {/* 5. share */}
          <Section n={5} title="Share" hint="Copy the link or the code and send it to your guests.">
            <fieldset className="space-y-3">
              <legend className="sr-only">Meeting link and code</legend>
              <p className="text-xs text-ink-muted">Ready now, even for a scheduled meeting. Copy and share them before it starts; the link opens the meeting once the host starts it.</p>
              <MeetingLinkBox link={meetingLink(roomCode)} code={roomCode} />
            </fieldset>
          </Section>

          {/* 6. language */}
          <Section n={6} title="Language and transcript" hint="Used for the transcript, the summary and translations after the meeting.">
            <LanguageSettingsPanel value={form.languageSettings} onChange={(languageSettings) => setForm((f) => ({ ...f, languageSettings }))} languages={ref.languages} />
          </Section>

          <p role="alert" aria-live="polite" className="min-h-[1.25rem] text-sm" style={{ color: 'var(--red-text)' }}>{error}</p>
          <div className="sticky bottom-3 z-10 flex items-center justify-end gap-3 rounded-2xl border border-line bg-card p-3 shadow-lg sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
            <p className="mr-auto hidden items-center gap-2 text-xs text-ink-muted sm:flex"><Users size={14} aria-hidden />{form.mode === 'now' ? 'You will be the host.' : 'Guests get the link now; you start it when it is time.'}</p>
            <button type="button" className="btn-secondary" onClick={() => navigate('/meetings')} disabled={busy}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!valid || busy}>{busy ? 'Creating…' : form.mode === 'now' ? 'Start meeting' : 'Schedule meeting'}</button>
          </div>
        </form>
      )}
    </div>
  );
}