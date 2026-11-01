// Mocked-provider integration tests (real MongoDB + real ffmpeg chunking). Set TEST_MONGO_URI to run.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { execFileSync } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const URI = process.env.TEST_MONGO_URI;
const run = URI ? describe : describe.skip;

run('phase 3 gate (mocked AI providers, real DB + ffmpeg)', () => {
  const sfx = Date.now();
  const calls = { groq: [], translate: 0, summary: 0, embed: 0 };
  const flags = { groqFail: false, translateFail: false, groqDelay: 0 };
  let app, T = {}, meeting, TS, Task, Translation, wav;
  const auth = (k) => ({ Authorization: `Bearer ${T[k]}` });
  const waitFor = async (fn, ms = 15000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 100)); } };
  const tstatus = async () => (await request(app).get(`/api/meetings/${meeting.id}/transcript/status`).set(auth('alice'))).body.transcript.status;
  const base = () => `/api/meetings/${meeting.id}`;

  beforeAll(async () => {
    Object.assign(process.env, { JWT_SECRET: 'x'.repeat(40), STORAGE_DIR: '/tmp/intellmeet-test-storage', GROQ_API_KEY: 'test-groq', GEMINI_API_KEY: 'test-gemini',
      MAX_AUDIO_MB: '0.5', EMBEDDING_DIMENSIONS: '4', AI_RATE_LIMIT_PER_MIN: '1000' });
    mongoose.set('autoIndex', false);
    await mongoose.connect(URI, { dbName: `intellmeet_p3_${sfx}` });
    app = require('../app'); TS = require('../models/TranscriptSegment'); Task = require('../models/Task'); Translation = require('../models/Translation');
    await require('../scripts/ensureIndexes').run();

    const { AIError } = require('../utils/aiErrors');
    const groq = require('../services/ai/providers/groqProvider');
    const gemini = require('../services/ai/providers/geminiProvider');
    groq.transcribe = async ({ filePath, language }) => {
      calls.groq.push({ filePath, language });
      if (flags.groqDelay) await new Promise((r) => setTimeout(r, flags.groqDelay));
      if (flags.groqFail) throw new AIError('PROVIDER_ERROR');
      return { language: 'hindi', durationSec: 52, segments: [{ start: 0, end: 2, text: ' नमस्ते टीम ' }, { start: 2, end: 5, text: 'We need to finish the dashboard by Friday' }] };
    };
    gemini.generateJSON = async ({ label, system, user, schema }) => {
      const lang = /Hindi/.test(system) && /Write every field in Hindi/.test(system) ? 'Hindi' : 'English';
      if (label === 'translate') {
        calls.translate++; if (flags.translateFail) throw new AIError('PROVIDER_ERROR');
        return schema.parse({ translations: JSON.parse(user.split('items:\n')[1]).map((i) => ({ idx: i.idx, text: `EN:${i.text}` })) });
      }
      calls.summary++;
      if (label === 'summary-existing') {
        const canon = JSON.parse(user.split('CANONICAL ACTION ITEMS:\n')[1].split('\n\nTRANSCRIPT')[0]);
        return schema.parse({ overview: `OV-${lang}`, discussionPoints: [], decisions: [], openQuestions: [], risks: [], actionItems: canon.map((c) => ({ n: c.n, title: `T:${c.title}`, description: null })) });
      }
      return schema.parse({ overview: `OV-${lang}`, discussionPoints: ['d'], decisions: [], openQuestions: [], risks: [],
        actionItems: [{ title: 'Finish dashboard', description: null, ownerName: null, deadlineText: 'by Friday', deadlineISO: null, sourceSegmentIdx: 1 }] });
    };
    gemini.embed = async (texts) => { calls.embed++; return texts.map(() => [1, 0, 0, 0]); };

    for (const k of ['alice', 'eve']) T[k] = (await request(app).post('/api/auth/register').send({ name: k, email: `${k}${sfx}@t.dev`, password: 'password123' })).body.token;
    meeting = (await request(app).post('/api/meetings').set(auth('alice')).send({ title: 'Dashboard sync', instant: true, languageSettings: { primaryLanguage: 'hi' } })).body.meeting;
    await request(app).post(`${base()}/consent`).set(auth('alice'));
    wav = '/tmp/p3-test.wav';   // 130s mono 16k wav = ~4MB -> must be chunked at MAX_AUDIO_MB=0.5
    execFileSync(require('ffmpeg-static'), ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=130', '-ar', '16000', '-ac', '1', wav], { stdio: 'ignore' });
    const up = await request(app).post(`${base()}/recording`).set(auth('alice')).attach('audio', fs.readFileSync(wav), { filename: 'a.wav', contentType: 'audio/wav' });
    expect(up.status).toBe(201);
  });
  afterAll(async () => { await mongoose.connection.dropDatabase().catch(() => {}); await mongoose.disconnect(); });

  it('unsupported language -> 400 UNSUPPORTED_LANGUAGE (no provider call)', async () => {
    const r = await request(app).post(`${base()}/transcription`).set(auth('alice')).send({ language: 'xx' });
    expect(r.status).toBe(400); expect(r.body.code).toBe('UNSUPPORTED_LANGUAGE'); expect(calls.groq).toHaveLength(0);
    expect((await request(app).get('/api/languages')).body.languages.map((l) => l.code)).toEqual(['en', 'hi']);
  });

  it('unauthorized user gets 403 on every AI route', async () => {
    for (const [m, p, b] of [['post', '/transcription', {}], ['get', '/transcript'], ['get', '/transcript/status'], ['post', '/translations', { targetLanguage: 'en' }], ['get', '/translations'], ['post', '/summary', { language: 'en' }], ['get', '/summary']])
      expect((await request(app)[m](base() + p).set(auth('eve')).send(b)).status, `${m} ${p}`).toBe(403);
    expect((await request(app).post(`${base()}/transcription`).send({})).status).toBe(401);
  });

  let original;
  it('one active job only; chunked audio -> offset timestamps; saved to the right meeting', async () => {
    flags.groqDelay = 400;
    const rs = await Promise.all([1, 2].map(() => request(app).post(`${base()}/transcription`).set(auth('alice')).send({})));
    expect(rs.map((r) => r.status).sort()).toEqual([202, 409]);
    await waitFor(async () => (await tstatus()) === 'completed'); flags.groqDelay = 0;
    const r = await request(app).get(`${base()}/transcript`).set(auth('alice'));
    expect(r.body.transcript.sourceLanguage).toBe('hi'); expect(r.body.transcript.hasSpeakerLabels).toBe(false);
    expect(calls.groq.length).toBeGreaterThanOrEqual(3);                         // ffmpeg split the 4MB file into >1 chunk
    expect(calls.groq.every((c) => c.language === 'hi')).toBe(true);             // meeting primary language was applied
    original = r.body.segments; const n = calls.groq.length;
    expect(original).toHaveLength(n * 2);
    expect(original[2].start).toBeGreaterThan(45); expect(original[2].start).toBeLessThan(60);   // chunk 2 offset ≈ 52s
    expect(original.every((s, i) => s.idx === i && s.speakerLabel === null)).toBe(true);
    expect(JSON.stringify(r.body)).not.toMatch(/embedding|filePath/);
  });

  it('embeddings are stored (select:false) for search', async () => {
    await waitFor(async () => (await TS.find({ meetingId: meeting.id }).select('+embedding').lean()).every((s) => s.embedding?.length === 4));
  });

  it('translation: failed batch retried once then marked failed, no partial save', async () => {
    flags.translateFail = true;
    expect((await request(app).post(`${base()}/translations`).set(auth('alice')).send({ targetLanguage: 'en' })).status).toBe(202);
    await waitFor(async () => (await Translation.findOne({ meetingId: meeting.id }))?.status === 'failed');
    const doc = await Translation.findOne({ meetingId: meeting.id });
    expect(doc.segments).toHaveLength(0); expect(calls.translate).toBe(2);       // first attempt + exactly one retry
  });

  it('translation: completes, original untouched, keyed by language, repeat = no provider call', async () => {
    flags.translateFail = false; const before = calls.translate;
    expect((await request(app).post(`${base()}/translations`).set(auth('alice')).send({ targetLanguage: 'en' })).status).toBe(202);
    await waitFor(async () => (await Translation.findOne({ meetingId: meeting.id }))?.status === 'completed');
    const used = calls.translate; expect(used).toBeGreaterThan(before);
    const again = await request(app).post(`${base()}/translations`).set(auth('alice')).send({ targetLanguage: 'en' });
    expect(again.status).toBe(200); expect(again.body.translation.label).toBe('Translated'); expect(calls.translate).toBe(used);
    const g = await request(app).get(`${base()}/translations/en`).set(auth('alice'));
    expect(g.body.translation.segments).toHaveLength(original.length); expect(g.body.translation.segments[0].text).toBe(`EN:${original[0].text}`);
    const after = (await request(app).get(`${base()}/transcript`).set(auth('alice'))).body.segments;
    expect(after.map((s) => s.text)).toEqual(original.map((s) => s.text));      // originals never modified
    expect((await request(app).post(`${base()}/translations`).set(auth('alice')).send({ targetLanguage: 'hi' })).status).toBe(400);   // already Hindi
  });

  it('summary: language respected; AI tasks need review with null owner/deadline; no duplicate tasks per language', async () => {
    expect((await request(app).post(`${base()}/summary`).set(auth('alice')).send({ language: 'hi' })).status).toBe(202);
    const s = await waitFor(async () => { const r = await request(app).get(`${base()}/summary?language=hi`).set(auth('alice')); return r.body.status === 'completed' && r.body; });
    expect(s.summary.language).toBe('hi'); expect(s.summary.overview).toBe('OV-Hindi');
    const tasks = (await request(app).get(`/api/tasks?meetingId=${meeting.id}`).set(auth('alice'))).body.tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ source: 'ai', needsReview: true, assigneeId: null, ownerText: null, deadline: null, deadlineText: 'by Friday', sourceSegmentIdx: 1 });
    // second language reuses tasks (display titles come from the summary; canonical task untouched)
    expect((await request(app).post(`${base()}/summary`).set(auth('alice')).send({ language: 'en' })).status).toBe(202);
    const en = await waitFor(async () => { const r = await request(app).get(`${base()}/summary?language=en`).set(auth('alice')); return r.body.status === 'completed' && r.body; });
    expect(en.summary.actionItems[0].title).toBe('T:Finish dashboard');
    const t2 = (await request(app).get(`/api/tasks?meetingId=${meeting.id}`).set(auth('alice'))).body.tasks;
    expect(t2).toHaveLength(1); expect(t2[0].title).toBe('Finish dashboard');
    const used = calls.summary;
    expect((await request(app).post(`${base()}/summary`).set(auth('alice')).send({ language: 'en' })).status).toBe(200);   // cached
    expect(calls.summary).toBe(used);
  });

  it('provider failure keeps the existing transcript; retry re-runs safely and clears stale derived data', async () => {
    flags.groqFail = true;
    expect((await request(app).post(`${base()}/transcription`).set(auth('alice')).send({})).status).toBe(202);
    await waitFor(async () => (await tstatus()) === 'failed');
    const kept = await request(app).get(`${base()}/transcript`).set(auth('alice'));
    expect(kept.body.transcript.failureCode).toBe('PROVIDER_ERROR'); expect(kept.body.segments).toHaveLength(original.length);
    expect((await request(app).get(`${base()}/translations/en`).set(auth('alice'))).status).toBe(200);   // derived data intact too
    flags.groqFail = false;
    expect((await request(app).post(`${base()}/transcription/retry`).set(auth('alice')).send({})).status).toBe(202);
    await waitFor(async () => (await tstatus()) === 'completed');
    expect((await request(app).post(`${base()}/transcription/retry`).set(auth('alice')).send({})).status).toBe(409);   // only failed can retry
    expect((await request(app).get(`${base()}/translations`).set(auth('alice'))).body.translations).toHaveLength(0);   // stale translation dropped
  });
});
