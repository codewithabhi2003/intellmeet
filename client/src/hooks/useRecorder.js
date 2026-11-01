import { useCallback, useEffect, useRef, useState } from 'react';
import * as meetingService from '../services/meetingService';

const MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
export const pickMime = (isSupported) => MIMES.find((m) => isSupported(m)) || '';
export const extFor = (mime) => (mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'webm');

// Records ONE mixed audio track (local mic + every remote participant) with Web Audio + MediaRecorder.
// getStreams() returns the streams to mix; it is re-polled while recording so late joiners are captured.
export function useRecorder({ meetingId, getStreams }) {
  const [state, setState] = useState('idle');   // idle | recording | uploading | error | done
  const [error, setError] = useState(null);
  const ref = useRef({});

  const sync = useCallback(() => {
    const r = ref.current; if (!r.ctx) return;
    const live = new Set();
    getStreams().filter(Boolean).forEach((s) => s.getAudioTracks().forEach((t) => {
      if (t.readyState === 'ended') return;
      live.add(t.id);
      if (!r.nodes.has(t.id)) { const n = r.ctx.createMediaStreamSource(new MediaStream([t])); n.connect(r.dest); r.nodes.set(t.id, n); }
    }));
    r.nodes.forEach((n, id) => { if (!live.has(id)) { n.disconnect(); r.nodes.delete(id); } });
  }, [getStreams]);

  useEffect(() => {
    if (state !== 'recording') return undefined;
    const id = setInterval(sync, 1500);
    return () => clearInterval(id);
  }, [state, sync]);

  const upload = useCallback(async () => {
    const r = ref.current;
    setState('uploading'); setError(null);
    try {
      await meetingService.uploadRecording(meetingId, r.blob, r.duration, `recording.${extFor(r.mime)}`);
      r.blob = null; setState('done');
      return true;
    } catch (e) { setError(e?.response?.data?.message || 'Upload failed.'); setState('error'); return false; }
  }, [meetingId]);

  const start = useCallback(async () => {
    const mime = pickMime((m) => window.MediaRecorder?.isTypeSupported?.(m));
    if (!window.MediaRecorder) throw new Error('Recording is not supported in this browser.');
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx(); const dest = ctx.createMediaStreamDestination();
    const rec = new MediaRecorder(dest.stream, mime ? { mimeType: mime } : undefined);
    const r = { ctx, dest, nodes: new Map(), chunks: [], mime: rec.mimeType || mime || 'audio/webm', startedAt: Date.now(), rec };
    ref.current = r;
    rec.ondataavailable = (e) => { if (e.data?.size) r.chunks.push(e.data); };
    sync();
    rec.start(1000);
    setState('recording');
  }, [sync]);

  // Stops, closes the audio graph, and uploads. Resolves true when the upload succeeded.
  const stop = useCallback(() => new Promise((resolve) => {
    const r = ref.current;
    if (!r.rec || r.rec.state === 'inactive') { resolve(false); return; }
    r.rec.onstop = async () => {
      r.duration = (Date.now() - r.startedAt) / 1000;
      r.blob = new Blob(r.chunks, { type: r.mime });
      r.nodes.forEach((n) => n.disconnect()); r.ctx.close().catch(() => {});
      resolve(await upload());
    };
    r.rec.stop();
  }), [upload]);

  return { state, error, start, stop, retryUpload: upload };
}
