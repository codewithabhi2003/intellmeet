const fs = require('fs');
const Transcript = require('../../models/Transcript');
const TranscriptSegment = require('../../models/TranscriptSegment');
const Translation = require('../../models/Translation');
const Summary = require('../../models/Summary');
const Recording = require('../../models/Recording');
const Meeting = require('../../models/Meeting');
const { env } = require('../../config/aiConfig');
const { AIError } = require('../../utils/aiErrors');
const { emitStatus } = require('../../utils/realtime');
const langs = require('./languages');
const audio = require('./audioService');
const groq = require('./providers/groqProvider');
const embeddings = require('./embeddingService');

const codeOf = (e) => (e instanceof AIError ? e.code : 'PROCESSING_FAILED');

// Claims the job atomically. Returns the Transcript doc, or null if a job is already queued/processing.
exports.enqueue = async (meeting) => {
  try {
    return await Transcript.findOneAndUpdate(
      { meetingId: meeting._id, status: { $nin: ['queued', 'processing'] } },
      { $set: { status: 'queued', failureCode: null, workspaceId: meeting.workspaceId, provider: 'groq', model: env.TRANSCRIPTION_MODEL } },
      { upsert: true, new: true, setDefaultsOnInsert: true });
  } catch (e) {
    if (e.code === 11000) return null;   // unique meetingId index: someone else holds a running job
    throw e;
  }
};

// Background job. Original segments are replaced only AFTER every chunk transcribed successfully,
// so a provider failure never deletes an existing completed transcript.
exports.run = async (meeting, { language }) => {
  const set = (patch) => Transcript.updateOne({ meetingId: meeting._id }, { $set: patch });
  let prepared;
  try {
    const rec = await Recording.findOne({ meetingId: meeting._id }).sort({ createdAt: -1 }).select('+filePath');
    if (!rec || !fs.existsSync(rec.filePath)) throw Object.assign(new AIError('PROVIDER_ERROR'), { code: 'NO_RECORDING' });
    await set({ status: 'processing' }); emitStatus(meeting, 'transcript:status', { status: 'processing' });

    prepared = await audio.prepare(rec.filePath);
    const all = []; let detected = null;
    for (const c of prepared.chunks) {
      const r = await groq.transcribe({ filePath: c.path, language });          // each chunk sent exactly once
      detected = detected || r.language;
      for (const s of r.segments) if (s.text) all.push({ start: s.start + c.offsetSec, end: s.end + c.offsetSec, text: s.text });
    }
    if (!all.length) throw Object.assign(new AIError('PROVIDER_ERROR'), { code: 'NO_SPEECH' });
    all.sort((a, b) => a.start - b.start);

    const sourceLanguage = language || langs.normalize(detected);
    const docs = all.map((s, idx) => ({
      meetingId: meeting._id, workspaceId: meeting.workspaceId, idx, start: s.start, end: s.end,
      text: s.text, speakerLabel: null, language: sourceLanguage,
    }));
    await TranscriptSegment.deleteMany({ meetingId: meeting._id });
    await TranscriptSegment.insertMany(docs);
    // derived data is tied to the old segment indexes -> drop it; originals above are the source of truth
    await Translation.deleteMany({ meetingId: meeting._id });
    await Summary.deleteMany({ meetingId: meeting._id });
    await set({ status: 'completed', failureCode: null, sourceLanguage, languageDetected: !language, durationSec: prepared.durationSec, segmentCount: docs.length, hasSpeakerLabels: false });
    emitStatus(meeting, 'transcript:status', { status: 'completed' });

    try { await embeddings.embedMeeting(meeting._id); }                     // search indexing must not fail the transcript
    catch (e) { console.error('[embeddings] skipped:', e.message); }
  } catch (e) {
    await set({ status: 'failed', failureCode: e.code === 'NO_RECORDING' || e.code === 'NO_SPEECH' ? e.code : codeOf(e) });
    emitStatus(meeting, 'transcript:status', { status: 'failed' });
  } finally {
    if (prepared) await prepared.cleanup().catch(() => {});
  }
};

// Called at startup: jobs that were running when the process died would otherwise stay "processing" forever.
exports.recoverInterrupted = () =>
  Transcript.updateMany({ status: { $in: ['queued', 'processing'] } }, { $set: { status: 'failed', failureCode: 'INTERRUPTED' } });

exports.meetingFor = (id) => Meeting.findById(id);
