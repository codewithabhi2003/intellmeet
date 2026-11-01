const TranscriptSegment = require('../../models/TranscriptSegment');
const { features, env } = require('../../config/aiConfig');
const gemini = require('./providers/geminiProvider');
const BATCH = 50;

// Embeds segments that lack an embedding. Silently skipped when GEMINI_API_KEY is absent (search stays keyword-only).
exports.embedMeeting = async (meetingId) => {
  if (!features.search) return { embedded: 0, skipped: true };
  const segs = await TranscriptSegment.find({ meetingId, $or: [{ embedding: { $exists: false } }, { embedding: { $size: 0 } }] }).select('_id text').lean();
  let embedded = 0;
  for (let i = 0; i < segs.length; i += BATCH) {
    const batch = segs.slice(i, i + BATCH);
    const vecs = await gemini.embed(batch.map((s) => s.text), 'RETRIEVAL_DOCUMENT');
    if (vecs.some((v) => v.length !== env.EMBEDDING_DIMENSIONS)) throw new Error('unexpected embedding size');
    await TranscriptSegment.bulkWrite(batch.map((s, j) => ({ updateOne: { filter: { _id: s._id }, update: { $set: { embedding: vecs[j] } } } })));
    embedded += batch.length;
  }
  return { embedded, skipped: false };
};
