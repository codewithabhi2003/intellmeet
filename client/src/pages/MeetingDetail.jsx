import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Globe2, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { BentoGrid, BentoTile } from '../components/common/BentoGrid';
import { Skeleton } from '../components/common/Skeleton';
import StatusBadge from '../components/common/StatusBadge';
import LanguageIndicator from '../components/language/LanguageIndicator';
import TranslationToggle from '../components/language/TranslationToggle';
import ActionItemList from '../components/summary/ActionItemList';
import SummaryPanel from '../components/summary/SummaryPanel';
import ProcessingState from '../components/transcript/ProcessingState';
import TranscriptViewer from '../components/transcript/TranscriptViewer';
import TranscriptionControls from '../components/transcript/TranscriptionControls';
import { useAIStatus } from '../hooks/useAIStatus';
import { useAuth } from '../hooks/useAuth';
import { usePoll } from '../hooks/usePoll';
import { useTranscript } from '../hooks/useTranscript';
import { fmtTime } from '../lib/aiHelpers';
import { formatWhen } from '../lib/meetingForm';
import * as aiService from '../services/aiService';
import * as ai from '../services/meetingAiService';
import * as meetingService from '../services/meetingService';
import * as taskService from '../services/taskService';
import * as workspaceService from '../services/workspaceService';
import { errorMessage } from '../services/api';

export default function MeetingDetail() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const { user } = useAuth();
  const { features } = useAIStatus();
  const tr = useTranscript(id);

  const [meeting, setMeeting] = useState({ data: null, error: '' });
  const [languages, setLanguages] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');

  const loadMeeting = useCallback(() => { setMeeting({ data: null, error: '' }); meetingService.get(id).then((data) => setMeeting({ data, error: '' })).catch((e) => setMeeting({ data: null, error: errorMessage(e, 'Could not open this meeting.') })); }, [id]);
  useEffect(loadMeeting, [loadMeeting]);
  useEffect(() => { aiService.languages().then(setLanguages).catch(() => {}); workspaceService.list().then(setWorkspaces).catch(() => {}); }, []);
  const loadTasks = useCallback(() => taskService.list({ meetingId: id, limit: 200 }).then(setTasks).catch(() => {}), [id]);
  useEffect(() => { loadTasks(); }, [loadTasks]);

  const m = meeting.data;
  const ws = workspaces.find((w) => w.id === m?.workspaceId);
  const myRole = ws?.members.find((x) => x.userId?._id === user.id)?.role;
  const canManage = !!m && (String(m.hostId) === String(user.id) || ['owner', 'admin'].includes(myRole));
  const memberName = (uid) => ws?.members.find((x) => x.userId?._id === uid)?.userId?.name || 'a workspace member';
  const status = tr.meta?.status || 'none';
  const ready = (status === 'completed' || status === 'failed') && tr.segments.length > 0;

  // ---- translation (on demand, cached per language) ----
  const [mode, setMode] = useState('original');
  const [target, setTarget] = useState('');
  const [trn, setTrn] = useState({ status: 'none', map: null });
  const targets = useMemo(() => languages.filter((l) => l.translation && l.code !== tr.meta?.sourceLanguage), [languages, tr.meta?.sourceLanguage]);
  useEffect(() => { if (!targets.find((l) => l.code === target)) setTarget(targets[0]?.code || ''); }, [targets, target]);
  const loadTranslation = useCallback(async () => {
    if (!target || !ready) return;
    try {
      const rows = await ai.listTranslations(id);
      const row = rows.find((r) => r.targetLanguage === target);
      if (!row) setTrn({ status: 'none', map: null });
      else if (row.status === 'completed') { const t = await ai.getTranslation(id, target); setTrn({ status: 'completed', map: new Map(t.segments.map((s) => [s.idx, s.text])) }); }
      else setTrn({ status: row.status, map: null });
    } catch { setTrn({ status: 'failed', map: null }); }
  }, [id, target, ready]);
  useEffect(() => { setTrn({ status: 'none', map: null }); if (mode === 'translated') loadTranslation(); }, [mode, target, status, loadTranslation]);
  usePoll(loadTranslation, mode === 'translated' && trn.status === 'processing', 2500);
  const requestTranslation = async () => {
    try { const r = await ai.requestTranslation(id, target); if (r.status === 'completed') setTrn({ status: 'completed', map: new Map(r.translation.segments.map((s) => [s.idx, s.text])) }); else setTrn({ status: 'processing', map: null }); }
    catch (e) { toast.error(errorMessage(e, 'Could not start the translation.')); }
  };

  // ---- summary ----
  const [sum, setSum] = useState({ loading: true, status: 'none', summary: null, failureCode: null, language: '' });
  const loadSummary = useCallback(async (lang) => {
    try {
      const r = await ai.getSummary(id, lang);
      setSum({ loading: false, status: r.status, summary: r.summary || null, failureCode: r.failureCode || null, language: r.summary?.language || r.language || lang || '' });
    } catch { setSum((s) => ({ ...s, loading: false, status: 'failed' })); }
  }, [id]);
  useEffect(() => { loadSummary(); }, [loadSummary, status]);
  usePoll(async () => { await loadSummary(sum.language); }, sum.status === 'processing', 2500);
  useEffect(() => { if (sum.status === 'completed') loadTasks(); }, [sum.status, loadTasks]);
  const generate = async (regenerate) => {
    setBusy(true);
    try { const r = await ai.requestSummary(id, { language: sum.language || undefined, regenerate: regenerate || undefined }); if (r.status === 'completed') setSum({ loading: false, status: 'completed', summary: r.summary, failureCode: null, language: r.summary.language }); else setSum((s) => ({ ...s, status: 'processing', language: r.language || s.language })); }
    catch (e) { toast.error(errorMessage(e, 'Could not generate the summary.')); }
    finally { setBusy(false); }
  };
  const titles = useMemo(() => new Map((sum.summary?.actionItems || []).map((a) => [String(a.taskId), a.title])), [sum.summary]);

  const startTranscription = async (body, retry) => {
    setBusy(true);
    try { await (retry ? tr.retry : tr.start)(body); } catch (e) { toast.error(errorMessage(e, 'Could not start the transcription.')); } finally { setBusy(false); }
  };

  const updateTask = async (taskId, patch) => {
    const prev = tasks;
    setTasks((l) => l.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));
    try { const t = await taskService.update(taskId, patch); setTasks((l) => l.map((x) => (x.id === taskId ? t : x))); }
    catch (e) { setTasks(prev); toast.error(errorMessage(e, 'Could not update the action item.')); }
  };

  if (meeting.error) return <div role="alert" className="space-y-3"><p style={{ color: 'var(--red-text)' }}>{meeting.error}</p><div className="flex gap-2"><button type="button" className="btn-secondary" onClick={loadMeeting}>Retry</button><Link to="/meetings" className="btn-secondary">Back to meetings</Link></div></div>;
  if (!m) return <div className="space-y-4"><Skeleton height={40} width="50%" /><Skeleton height={320} /></div>;

  const srcName = languages.find((l) => l.code === tr.meta?.sourceLanguage)?.name || tr.meta?.sourceLanguage;
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1"><h1 className="truncate text-2xl font-extrabold text-ink">{m.title}</h1><p className="mono text-xs text-ink-muted">{formatWhen(m)}</p></div>
        <StatusBadge status={m.status} /><LanguageIndicator settings={m.languageSettings} languages={languages} />
        {m.status === 'live' && <Link to={`/room/${m.roomCode}`} className="btn-primary">Join</Link>}
      </div>

      <BentoGrid>
        <BentoTile size="hero" aria-label="Summary">
          <SummaryPanel loading={sum.loading} status={sum.status} summary={sum.summary} failureCode={sum.failureCode} language={sum.language} languages={languages.filter((l) => l.translation)}
            onLanguage={(l) => { setSum((s) => ({ ...s, loading: true, language: l })); loadSummary(l); }} configured={!!features?.language} transcriptReady={ready} onGenerate={generate} busy={busy} />
        </BentoTile>
        <BentoTile aria-label="Language">
          <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-ink"><Globe2 size={16} className="text-accent-text" aria-hidden />Language</h2>
          {srcName ? <><p className="text-lg font-bold text-ink">{srcName}</p><p className="text-xs text-ink-muted">{tr.meta.languageDetected ? 'Auto-detected from the audio' : 'Set for this meeting'}</p>
            <p className="mono mt-3 text-xs text-ink-soft">{tr.meta.segmentCount} segments{tr.meta.durationSec ? ` · ${fmtTime(tr.meta.durationSec)}` : ''}</p></> : <p className="text-sm text-ink-muted">Known once the transcript is ready.</p>}
        </BentoTile>
        <BentoTile aria-label="Processing">
          <h2 className="mb-3 text-base font-bold text-ink">Transcript status</h2>
          {tr.loading ? <Skeleton height={32} /> : <ProcessingState status={status} failureCode={tr.meta?.failureCode} />}
          <div className="mt-3"><TranscriptionControls status={status} configured={!!features?.transcription} canManage={canManage} languages={languages.filter((l) => l.transcription)} busy={busy}
            onStart={(b) => startTranscription(b, false)} onRetry={(b) => startTranscription(b, true)} /></div>
        </BentoTile>
        <BentoTile size="wide" aria-label="Action items">
          <h2 className="mb-3 text-base font-bold text-ink">Action items</h2>
          <ActionItemList tasks={tasks} titles={titles} memberName={memberName} onUpdate={updateTask} onJump={(idx) => setSp({ segment: String(idx) })} />
        </BentoTile>
        <BentoTile size="full" aria-label="Transcript">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2 className="text-base font-bold text-ink">Transcript</h2>
            <TranslationToggle mode={mode} onMode={setMode} languages={targets} target={target} onTarget={setTarget} status={trn.status} onRequest={requestTranslation} configured={!!features?.language} />
            <div className="ml-auto flex items-center gap-2"><Search size={16} className="text-ink-muted" aria-hidden /><label htmlFor="tq" className="sr-only">Search this transcript</label><input id="tq" className="field !w-48" placeholder="Search transcript" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
          </div>
          {tr.loading && <div className="space-y-2"><Skeleton height={48} /><Skeleton height={48} /><Skeleton height={48} /></div>}
          {tr.error && <div role="alert" className="space-y-2 text-sm"><p style={{ color: 'var(--red-text)' }}>{tr.error}</p><button type="button" className="btn-secondary" onClick={tr.reload}>Retry</button></div>}
          {!tr.loading && !tr.error && !tr.segments.length && <p className="py-6 text-center text-sm text-ink-muted">{status === 'queued' || status === 'processing' ? 'The transcript will appear here when it is ready.' : 'No transcript yet.'}</p>}
          {tr.segments.length > 0 && <TranscriptViewer segments={tr.segments} hasSpeakerLabels={tr.meta?.hasSpeakerLabels} translations={mode === 'translated' && trn.status === 'completed' ? trn.map : null} query={query} focusIdx={sp.get('segment')} />}
        </BentoTile>
      </BentoGrid>
    </div>
  );
}
