// LIVE provider tests — real API calls, real keys. Run: npm run test:live
// Needs GROQ_API_KEY and GEMINI_API_KEY (skipped per-section when absent). Provide LIVE_AUDIO_PATH=<a real spoken sample, ideally Hindi or English>.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import 'dotenv/config';
const require = createRequire(import.meta.url);
const { features, env } = require('../config/aiConfig');
const AUDIO = process.env.LIVE_AUDIO_PATH;

describe.skipIf(!features.transcription || !AUDIO)('LIVE Groq transcription', () => {
  it('transcribes a real sample with segment timestamps', async () => {
    const r = await require('../services/ai/providers/groqProvider').transcribe({ filePath: AUDIO });
    console.log('detected language:', r.language, '| segments:', r.segments.length, '| first:', r.segments[0]?.text);
    expect(r.segments.length).toBeGreaterThan(0);
    expect(r.segments[0].end).toBeGreaterThan(r.segments[0].start);
  });
});

describe.skipIf(!features.language)('LIVE Gemini language + embeddings', () => {
  const g = () => require('../services/ai/providers/geminiProvider');
  it('translates English -> Hindi keeping numbers/names/terms exact', async () => {
    const { z } = require('zod'); const P = require('../services/ai/promptTemplates');
    const out = await g().generateJSON({ system: P.TRANSLATE_SYSTEM('en', 'hi'), schema: z.object({ translations: z.array(z.object({ idx: z.number(), text: z.string() })) }),
      user: `Translate these items:\n${JSON.stringify([{ idx: 0, text: 'Priya will ship the React dashboard by 15 March.' }])}` });
    console.log(out.translations[0].text);
    expect(out.translations[0].text).toMatch(/[\u0900-\u097F]/); expect(out.translations[0].text).toMatch(/Priya|प्रिया/); expect(out.translations[0].text).toMatch(/15/);
  });
  it('summary leaves owner/deadline null when not stated', async () => {
    const { summarySchema } = require('../services/ai/summaryService'); const P = require('../services/ai/promptTemplates');
    const s = await g().generateJSON({ system: P.SUMMARY_SYSTEM('en', '2026-01-10'), schema: summarySchema, retry: 1,
      user: 'TRANSCRIPT:\n[0] We should probably look at the dashboard performance at some point.\n[1] Yes, someone needs to investigate.' });
    for (const a of s.actionItems) { expect(a.ownerName).toBeNull(); expect(a.deadlineText).toBeNull(); }
  });
  it('Hindi query is closer to its English segment than to an unrelated one (multilingual embeddings)', async () => {
    const [q] = await g().embed(['डैशबोर्ड के बारे में हमने क्या तय किया?'], 'RETRIEVAL_QUERY');
    const [a, b] = await g().embed(['We decided to launch the new dashboard next week.', 'The cafeteria menu changes on Tuesdays.'], 'RETRIEVAL_DOCUMENT');
    const dot = (x, y) => x.reduce((s, v, i) => s + v * y[i], 0);
    console.log('dims:', q.length, '| related:', dot(q, a).toFixed(3), '| unrelated:', dot(q, b).toFixed(3));
    expect(q.length).toBe(env.EMBEDDING_DIMENSIONS); expect(dot(q, a)).toBeGreaterThan(dot(q, b));
  });
});
