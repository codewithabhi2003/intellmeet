const { z } = require('zod');
const Translation = require('../../models/Translation');
const Transcript = require('../../models/Transcript');
const TranscriptSegment = require('../../models/TranscriptSegment');
const { env } = require('../../config/aiConfig');
const { AIError } = require('../../utils/aiErrors');
const { emitStatus } = require('../../utils/realtime');
const gemini = require('./providers/geminiProvider');
const { TRANSLATE_SYSTEM } = require('./promptTemplates');

const BATCH = 40;
const STALE_MS = 15 * 60 * 1000;
const batchSchema = z.object({ translations: z.array(z.object({ idx: z.number().int(), text: z.string() })) });

// Idempotent. Returns { state: 'completed'|'processing'|'started', translation? }.
exports.request = async (meeting, targetLanguage) => {
  const tr = await Transcript.findOne({ meetingId: meeting._id });
  if (!tr || !tr.segmentCount) return { state: 'no_transcript' };
  if (tr.sourceLanguage === targetLanguage) return { state: 'same_language' };

  const existing = await Translation.findOne({ meetingId: meeting._id, targetLanguage });
  if (existing?.status === 'completed') return { state: 'completed', translation: existing };          // cache: no provider call
  if (existing?.status === 'processing' && Date.now() - existing.updatedAt < STALE_MS) return { state: 'processing' };

  // unique (meetingId,targetLanguage) index blocks duplicate jobs
  try {
    await Translation.findOneAndUpdate({ meetingId: meeting._id, targetLanguage },
      { $set: { status: 'processing', failureCode: null, workspaceId: meeting.workspaceId, sourceLanguage: tr.sourceLanguage, segments: [], model: env.LANGUAGE_MODEL } },
      { upsert: true });
  } catch (e) { if (e.code === 11000) return { state: 'processing' }; throw e; }
  setImmediate(() => exports.run(meeting, tr.sourceLanguage, targetLanguage));
  return { state: 'started' };
};

const translateBatch = async (batch, src, tgt) => {
  const user = `Translate these items:\n${JSON.stringify(batch.map((s) => ({ idx: s.idx, text: s.text })))}`;
  const out = await gemini.generateJSON({ system: TRANSLATE_SYSTEM(src, tgt), user, schema: batchSchema, label: 'translate' });
  const want = new Set(batch.map((s) => s.idx)), got = out.translations;
  const ok = got.length === batch.length && got.every((t) => want.has(t.idx) && t.text.trim()) && new Set(got.map((t) => t.idx)).size === want.size;
  if (!ok) throw new AIError('PROVIDER_ERROR');
  return got;
};

exports.run = async (meeting, src, tgt) => {
  const key = { meetingId: meeting._id, targetLanguage: tgt };
  try {
    const segs = await TranscriptSegment.find({ meetingId: meeting._id }).sort({ idx: 1 }).select('idx text').lean();
    const result = [];
    for (let i = 0; i < segs.length; i += BATCH) {
      const batch = segs.slice(i, i + BATCH);
      let got;
      try { got = await translateBatch(batch, src, tgt); }
      catch (e) { if (e.code === 'RATE_LIMITED') throw e; got = await translateBatch(batch, src, tgt); }   // retry a failed batch ONCE
      result.push(...got);
    }
    result.sort((a, b) => a.idx - b.idx);
    if (result.length !== segs.length) throw new AIError('PROVIDER_ERROR');
    // completed only when EVERY segment is translated; partial results are never saved as completed
    await Translation.updateOne(key, { $set: { status: 'completed', segments: result.map((t) => ({ idx: t.idx, text: t.text })), failureCode: null } });
    emitStatus(meeting, 'translation:status', { status: 'completed', targetLanguage: tgt });
  } catch (e) {
    await Translation.updateOne(key, { $set: { status: 'failed', segments: [], failureCode: e.code || 'PROCESSING_FAILED' } });
    emitStatus(meeting, 'translation:status', { status: 'failed', targetLanguage: tgt });
  }
};
