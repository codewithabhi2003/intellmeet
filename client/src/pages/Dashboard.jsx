import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock, CheckCircle2, ClipboardCheck, Languages, Search, ShieldCheck } from 'lucide-react';
import { BentoGrid, BentoTile } from '../components/common/BentoGrid';
import EmptyState from '../components/common/EmptyState';
import NotConfigured from '../components/common/NotConfigured';
import { Skeleton, SkeletonText } from '../components/common/Skeleton';
import StatusBadge from '../components/common/StatusBadge';
import ExampleQuestions from '../components/search/ExampleQuestions';
import { useAIStatus } from '../hooks/useAIStatus';
import { useAuth } from '../hooks/useAuth';
import { formatWhen } from '../lib/meetingForm';
import * as aiService from '../services/aiService';
import * as meetingService from '../services/meetingService';
import * as searchService from '../services/searchService';
import * as taskService from '../services/taskService';
import { errorMessage } from '../services/api';

const FEATURES = [
  { key: 'transcription', label: 'Meeting transcription', env: 'GROQ_API_KEY' },
  { key: 'language', label: 'Translation and summaries', env: 'GEMINI_API_KEY' },
  { key: 'search', label: 'AI answers in meeting search', env: 'GEMINI_API_KEY' },
];

function ErrorRetry({ message, onRetry }) {
  return <div role="alert" className="space-y-3 text-sm"><p style={{ color: 'var(--red-text)' }}>{message}</p><button type="button" className="btn-secondary" onClick={onRetry}>Retry</button></div>;
}
// small hook: load once, expose {data, loading, error, reload}
function useLoad(fn) {
  const [s, setS] = useState({ data: null, loading: true, error: '' });
  const load = useCallback(() => { setS({ data: null, loading: true, error: '' }); fn().then((data) => setS({ data, loading: false, error: '' })).catch((e) => setS({ data: null, loading: false, error: errorMessage(e) })); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load]);
  return { ...s, reload: load };
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { features, loading: fl, error: fe, retry } = useAIStatus();
  const [q, setQ] = useState('');
  const langs = useLoad(aiService.languages);
  const up = useLoad(() => Promise.all([meetingService.list({ status: 'live', limit: 5 }), meetingService.list({ status: 'scheduled', limit: 5 })]).then(([l, s]) => [...l.meetings, ...s.meetings].slice(0, 5)));
  const review = useLoad(() => taskService.list({ needsReview: 'true', limit: 5 }));
  const [suggestions, setSuggestions] = useState([]);
  useEffect(() => { searchService.suggestions().then(setSuggestions).catch(() => {}); }, []);
  const chips = (suggestions.find((s) => s.language === (user?.languagePreferences?.searchAnswerLanguage || 'en')) || suggestions[0])?.questions?.slice(0, 3);
  const ask = (text) => navigate(`/search?q=${encodeURIComponent(text)}`);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-extrabold text-ink sm:text-3xl">Hello, {user?.name?.split(' ')[0]}</h1>
      <p className="mb-6 text-ink-soft">Your meetings, understood in every language.</p>
      <BentoGrid>
        <BentoTile size="hero" aria-labelledby="t-ask">
          <h2 id="t-ask" className="mb-1 flex items-center gap-2 text-lg font-bold text-ink"><Search size={18} className="text-accent-text" aria-hidden />Ask your meetings</h2>
          <p className="mb-4 text-sm text-ink-soft">Get answers with sources from meetings you can access.</p>
          <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) ask(q.trim()); }} className="mb-4 space-y-3" role="search">
            <label htmlFor="dash-q" className="sr-only">Ask anything about your previous meetings</label>
            <textarea id="dash-q" rows={3} maxLength={500} className="field resize-none" placeholder="Ask anything about your previous meetings..." value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (q.trim()) ask(q.trim()); } }} />
            <button type="submit" className="btn-primary" disabled={!q.trim()}>Search</button>
          </form>
          <ExampleQuestions questions={chips} onPick={ask} />
          {features && !features.search && <div className="mt-4"><NotConfigured feature="AI answers" envVar="GEMINI_API_KEY" compact /></div>}
        </BentoTile>

        <BentoTile size="wide" aria-labelledby="t-up">
          <h2 id="t-up" className="mb-3 flex items-center gap-2 text-base font-bold text-ink"><CalendarClock size={18} className="text-accent-text" aria-hidden />Live and upcoming</h2>
          {up.loading && <SkeletonText lines={3} />}
          {up.error && <ErrorRetry message={up.error} onRetry={up.reload} />}
          {up.data?.length === 0 && <EmptyState title="Nothing scheduled" text="Start or schedule a meeting." action={<Link to="/meetings/new" className="btn-secondary">New meeting</Link>} />}
          {up.data?.length > 0 && (
            <ul className="space-y-2">{up.data.map((m) => (
              <li key={m.id} className="flex items-center gap-3 rounded-xl border border-line bg-input px-3 py-2 text-sm">
                <span className="min-w-0 flex-1"><span className="block truncate font-medium text-ink">{m.title}</span><span className="mono block text-xs text-ink-muted">{formatWhen(m)}</span></span>
                <StatusBadge status={m.status} /><Link to={`/room/${m.roomCode}`} className="btn-secondary !min-h-[44px] !px-4">{m.status === 'live' ? 'Join' : 'Open'}</Link>
              </li>))}</ul>
          )}
        </BentoTile>

        <BentoTile size="wide" aria-labelledby="t-lang">
          <h2 id="t-lang" className="mb-3 flex items-center gap-2 text-base font-bold text-ink"><Languages size={18} className="text-accent-text" aria-hidden />Language coverage</h2>
          {langs.loading && <div className="flex gap-2"><Skeleton width={110} height={36} /><Skeleton width={110} height={36} /></div>}
          {langs.error && <ErrorRetry message={langs.error} onRetry={langs.reload} />}
          {langs.data && <ul className="flex flex-wrap gap-2">{langs.data.map((l) => <li key={l.code} className="flex items-center gap-2 rounded-xl border border-line bg-input px-3 py-2 text-sm"><span className="mono text-xs uppercase text-ink-muted">{l.code}</span><span className="font-medium text-ink">{l.name}</span><span className="text-ink-soft">{l.native}</span></li>)}</ul>}
        </BentoTile>

        <BentoTile size="wide" aria-labelledby="t-review">
          <h2 id="t-review" className="mb-3 flex items-center gap-2 text-base font-bold text-ink"><ClipboardCheck size={18} className="text-accent-text" aria-hidden />Action items to review</h2>
          {review.loading && <SkeletonText lines={3} />}
          {review.error && <ErrorRetry message={review.error} onRetry={review.reload} />}
          {review.data?.length === 0 && <EmptyState title="All caught up" text="AI-extracted action items waiting for your review appear here." />}
          {review.data?.length > 0 && (
            <>
              <ul className="space-y-2">{review.data.map((t) => <li key={t.id} className="flex items-center gap-2 rounded-xl border border-line bg-input px-3 py-2 text-sm"><span className="min-w-0 flex-1 truncate text-ink">{t.title}</span>{t.meetingId && <Link className="text-xs font-medium underline" style={{ color: 'var(--accent-text)' }} to={`/meetings/${t.meetingId}`}>Meeting</Link>}</li>)}</ul>
              <Link to="/tasks?review=1" className="mt-3 inline-block text-sm font-semibold underline" style={{ color: 'var(--accent-text)' }}>Review all</Link>
            </>
          )}
        </BentoTile>

        <BentoTile size="wide" aria-labelledby="t-features">
          <h2 id="t-features" className="mb-3 text-base font-bold text-ink">AI features on this server</h2>
          {fl && <SkeletonText lines={3} />}
          {fe && <ErrorRetry message="Could not load the feature status." onRetry={retry} />}
          {features && <ul className="space-y-2" aria-live="polite">{FEATURES.map((f) => (
            <li key={f.key}>{features[f.key]
              ? <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-input px-3 py-2"><span className="flex items-center gap-2 text-sm font-medium text-ink"><CheckCircle2 size={16} style={{ color: 'var(--green-text)' }} aria-hidden />{f.label}</span><StatusBadge status="completed" label="Ready" /></div>
              : <NotConfigured feature={f.label} envVar={f.env} compact />}</li>))}</ul>}
        </BentoTile>

        <BentoTile size="wide" aria-labelledby="t-privacy">
          <h2 id="t-privacy" className="mb-2 flex items-center gap-2 text-base font-bold text-ink"><ShieldCheck size={18} className="text-accent-text" aria-hidden />Recording and privacy</h2>
          <p className="text-sm text-ink-soft">Recording and transcription start only after the host confirms participants were told. Transcripts are generated after the meeting, not live.</p>
        </BentoTile>
      </BentoGrid>
    </div>
  );
}
