// ⚠️ DEVELOPMENT ONLY — creates clearly labeled SAMPLE data so you can explore the UI without recording audio.
// Refuses to run when NODE_ENV=production. Production behavior never contains fake data.
// Creates: a demo user, a workspace, and two ended meetings titled "[SAMPLE] ..." with transcripts (English + Hindi).
// It does NOT create summaries, translations or action items: generate those in the UI with your real API keys.
require('dotenv').config();
const mongoose = require('mongoose');
require('../models');

const EMAIL = 'demo@intellmeet.local';
const PASSWORD = process.env.DEMO_PASSWORD || 'demo-password-123';

const MEETINGS = [
  { title: '[SAMPLE] Dashboard launch planning', lang: 'en', days: 3, lines: [
    'Welcome everyone. Today we plan the launch of the new analytics dashboard.',
    'We decided to launch the dashboard on March 15, after the security review is done.',
    'Priya will own the performance testing, and she said she can finish it by Friday.',
    'The main risk is the slow loading time of the reports page on large accounts.',
    'We still need to decide whether the mobile layout ships in the first release.',
    'Marketing asked for a final screenshot set by next Wednesday.',
    'Let us review the open questions again at the next weekly meeting.' ] },
  { title: '[SAMPLE] साप्ताहिक समीक्षा', lang: 'hi', days: 1, lines: [
    'सभी का स्वागत है। आज हम पिछले सप्ताह के काम की समीक्षा करेंगे।',
    'डैशबोर्ड का काम लगभग पूरा हो गया है, बस परीक्षण बाकी है।',
    'हमने तय किया कि अगले सोमवार से ग्राहकों को नया संस्करण दिखाया जाएगा।',
    'बजट के बारे में अभी कोई अंतिम फैसला नहीं हुआ है।',
    'रिपोर्ट पेज की गति को लेकर चिंता जताई गई।' ] },
];

(async () => {
  if (process.env.NODE_ENV === 'production') { console.error('Refusing to seed sample data in production.'); process.exit(1); }
  await require('../config/db')();
  const { features } = require('../config/aiConfig');
  const User = require('../models/User'), Workspace = require('../models/Workspace'), Meeting = require('../models/Meeting');
  const Transcript = require('../models/Transcript'), Segment = require('../models/TranscriptSegment');

  let user = await User.findOne({ email: EMAIL });
  if (!user) user = await User.create({ name: 'Demo User', email: EMAIL, password: PASSWORD });
  let ws = await Workspace.findOne({ ownerId: user._id });
  if (!ws) ws = await Workspace.create({ name: 'Demo workspace (sample data)', ownerId: user._id, members: [{ userId: user._id, role: 'owner' }] });

  for (const m of MEETINGS) {
    if (await Meeting.exists({ title: m.title, hostId: user._id, isDeleted: false })) { console.log('exists:', m.title); continue; }
    const start = new Date(Date.now() - m.days * 24 * 3600 * 1000);
    const meeting = await Meeting.create({ title: m.title, hostId: user._id, workspaceId: ws._id, status: 'ended', startedAt: start, endedAt: new Date(+start + 20 * 60000),
      participants: [{ userId: user._id, joinedAt: start, leftAt: new Date(+start + 20 * 60000) }], languageSettings: { primaryLanguage: m.lang } });
    await Transcript.create({ meetingId: meeting._id, workspaceId: ws._id, status: 'completed', sourceLanguage: m.lang, languageDetected: false, provider: 'seed', model: 'sample', durationSec: m.lines.length * 12, segmentCount: m.lines.length });
    await Segment.insertMany(m.lines.map((text, idx) => ({ meetingId: meeting._id, workspaceId: ws._id, idx, start: idx * 12, end: idx * 12 + 11, text, language: m.lang })));
    console.log('created:', m.title);
    if (features.search) { try { await require('../services/ai/embeddingService').embedMeeting(meeting._id); console.log('  embedded for search'); } catch (e) { console.warn('  embeddings skipped:', e.message); } }
  }
  console.log(`\nSample data ready. Sign in as ${EMAIL} / ${PASSWORD}`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
