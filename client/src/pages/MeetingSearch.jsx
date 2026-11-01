import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AnswerCard from '../components/search/AnswerCard';
import ExampleQuestions from '../components/search/ExampleQuestions';
import InsufficientEvidence from '../components/search/InsufficientEvidence';
import SearchBar from '../components/search/SearchBar';
import SearchFilters from '../components/search/SearchFilters';
import SourceCard from '../components/search/SourceCard';
import NotConfigured from '../components/common/NotConfigured';
import { Skeleton } from '../components/common/Skeleton';
import { useAuth } from '../hooks/useAuth';
import { useMeetingSearch } from '../hooks/useMeetingSearch';
import { buildSearchBody } from '../lib/aiHelpers';
import * as aiService from '../services/aiService';
import * as meetingService from '../services/meetingService';
import * as searchService from '../services/searchService';
import * as workspaceService from '../services/workspaceService';

export default function MeetingSearch() {
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const search = useMeetingSearch();
  const [question, setQuestion] = useState(sp.get('q') || '');
  const [filters, setFilters] = useState({ from: '', to: '', workspaceId: '', meetingId: '', answerLanguage: user?.languagePreferences?.searchAnswerLanguage || 'en' });
  const [ref, setRef] = useState({ languages: [], workspaces: [], meetings: [], suggestions: [] });
  const resultRef = useRef(null);

  useEffect(() => {
    Promise.allSettled([aiService.languages(), workspaceService.list(), meetingService.list({ limit: 50 }), searchService.suggestions()])
      .then(([l, w, m, s]) => setRef({ languages: l.value || [], workspaces: w.value || [], meetings: m.value?.meetings || [], suggestions: s.value || [] }));
  }, []);

  const go = (q = question, f = filters) => {
    setSp(q ? { q } : {}, { replace: true });
    search.run(buildSearchBody({ question: q, ...f }));
  };
  useEffect(() => { if (sp.get('q')) go(sp.get('q')); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (search.status === 'done') resultRef.current?.focus?.(); }, [search.status]);

  const chips = useMemo(() => (ref.suggestions.find((s) => s.language === filters.answerLanguage) || ref.suggestions.find((s) => s.language === 'en'))?.questions, [ref.suggestions, filters.answerLanguage]);
  const langName = (c) => ref.languages.find((l) => l.code === c)?.name || c;
  const r = search.result;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 text-2xl font-extrabold text-ink">Ask your meetings</h1>
      <p className="mb-5 text-ink-soft">Answers come only from meetings you can access, with sources you can open.</p>
      <div className="space-y-4 rounded-3xl border border-line bg-card p-4 sm:p-5">
        <SearchBar value={question} onChange={setQuestion} onSubmit={() => go()} busy={search.status === 'loading'} />
        <SearchFilters value={filters} onChange={setFilters} workspaces={ref.workspaces} meetings={ref.meetings} languages={ref.languages.length ? ref.languages : [{ code: 'en', name: 'English' }]} />
        {search.status === 'idle' && <ExampleQuestions questions={chips} onPick={(q) => { setQuestion(q); go(q); }} />}
      </div>

      <div ref={resultRef} tabIndex={-1} className="mt-6 outline-none" aria-live="polite" aria-busy={search.status === 'loading'}>
        {search.status === 'loading' && <div className="grid gap-4 lg:grid-cols-[2fr_1fr]" role="status" aria-label="Searching"><Skeleton height={220} className="!rounded-3xl" /><div className="space-y-3"><Skeleton height={100} /><Skeleton height={100} /></div></div>}
        {search.status === 'error' && <div role="alert" className="space-y-3 rounded-3xl border border-line bg-card p-6"><p style={{ color: 'var(--red-text)' }}>{search.error}</p><button type="button" className="btn-secondary" onClick={() => go()}>Retry</button></div>}
        {search.status === 'done' && r.mode === 'insufficient' && <InsufficientEvidence message={r.message} />}
        {search.status === 'done' && r.mode === 'keyword_only' && (
          <div className="space-y-4">
            {r.notConfigured ? <NotConfigured feature="AI answers" envVar="GEMINI_API_KEY" /> : <p role="status" className="rounded-2xl border p-4 text-sm text-ink" style={{ borderColor: 'var(--accent-yellow)' }}>{r.banner}</p>}
            <p className="text-sm text-ink-soft">Matching excerpts from your meetings (keyword search):</p>
            <div className="grid gap-3 md:grid-cols-2">{r.sources.map((s) => <SourceCard key={s.sourceId} source={s} langName={langName} />)}</div>
          </div>
        )}
        {search.status === 'done' && r.mode === 'answer' && (
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <AnswerCard answer={r.answer} conflicts={r.conflicts} limitations={r.limitations} sourceCount={r.sources.length} />
            <aside aria-label={`Sources (${r.sources.length})`} className="space-y-3"><h2 className="text-sm font-bold uppercase tracking-wide text-ink-muted">Sources ({r.sources.length})</h2>{r.sources.map((s) => <SourceCard key={s.sourceId} source={s} langName={langName} />)}</aside>
          </div>
        )}
      </div>
    </div>
  );
}
