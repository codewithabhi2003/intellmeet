import { useCallback, useEffect, useState } from 'react';
import * as ai from '../services/meetingAiService';
import { errorMessage } from '../services/api';
import { usePoll } from './usePoll';

const PAGE = 500;
// Loads transcript metadata + every segment (paged), and polls while a job is queued/processing.
export function useTranscript(meetingId) {
  const [meta, setMeta] = useState(null);
  const [segments, setSegments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const first = await ai.getTranscript(meetingId, { page: 1, limit: PAGE });
      let all = first.segments;
      for (let p = 2; all.length < first.total && p < 200; p += 1) { all = all.concat((await ai.getTranscript(meetingId, { page: p, limit: PAGE })).segments); }
      setMeta(first.transcript); setSegments(all);
    } catch (e) { setError(errorMessage(e, 'Could not load the transcript.')); }
    finally { setLoading(false); }
  }, [meetingId]);
  useEffect(() => { setLoading(true); load(); }, [load]);

  const active = meta?.status === 'queued' || meta?.status === 'processing';
  usePoll(async () => {
    try {
      const s = await ai.transcriptStatus(meetingId);
      if (s.status !== meta.status) await load(); else setMeta(s);
    } catch { /* keep polling */ }
  }, active, 2500);

  const run = useCallback(async (retry, body) => {
    await (retry ? ai.retryTranscription : ai.startTranscription)(meetingId, body);
    setMeta((m) => ({ ...(m || {}), status: 'queued', failureCode: null }));
  }, [meetingId]);

  return { meta, segments, loading, error, reload: load, start: (body) => run(false, body), retry: (body) => run(true, body) };
}
