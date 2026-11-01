// Embeds transcript segments that have no embedding yet. `npm run db:backfill-embeddings`
require('dotenv').config();
const mongoose = require('mongoose');
const { features } = require('../config/aiConfig');
const TranscriptSegment = require('../models/TranscriptSegment');
const { embedMeeting } = require('../services/ai/embeddingService');
(async () => {
  if (!features.search) { console.error('GEMINI_API_KEY is not configured; nothing to do.'); process.exit(1); }
  await require('../config/db')();
  const ids = await TranscriptSegment.find({ $or: [{ embedding: { $exists: false } }, { embedding: { $size: 0 } }] }).distinct('meetingId');
  let total = 0;
  for (const id of ids) { const r = await embedMeeting(id); total += r.embedded; console.log(`meeting ${id}: ${r.embedded}`); }
  console.log(`Done. Embedded ${total} segments.`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
