// Security checklist verification (real DB-backed requests). Set TEST_MONGO_URI to run.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import fs from 'fs';
import os from 'os';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const URI = process.env.TEST_MONGO_URI;
const run = URI ? describe : describe.skip;

const KEY_GROQ = 'gsk_TESTSECRETKEYVALUE123', KEY_GEMINI = 'AIzaTESTSECRETKEYVALUE456';
const SECRET_Q = 'ZXQ-SECRET-QUESTION-123', SECRET_SEG = 'ZXQ-SEGMENT-TEXT-456';

run('security checklist', () => {
  const sfx = Date.now();
  let app, T = {}, M, WS, TASK, Task;
  const auth = (k) => ({ Authorization: `Bearer ${T[k]}` });
  const logs = [];
  const spies = [];

  beforeAll(async () => {
    Object.assign(process.env, { JWT_SECRET: 'x'.repeat(40), STORAGE_DIR: '/tmp/intellmeet-sec-storage', GROQ_API_KEY: KEY_GROQ, GEMINI_API_KEY: KEY_GEMINI,
      MAX_UPLOAD_MB: '0.001', MAX_AUDIO_MB: '0.5', AI_RATE_LIMIT_PER_MIN: '12', CLIENT_URL: 'http://localhost:5173', STUN_URLS: 'stun:stun.l.google.com:19302' });
    mongoose.set('autoIndex', false);
    await mongoose.connect(URI, { dbName: `intellmeet_sec_${sfx}` });
    app = require('../app'); Task = require('../models/Task');
    await require('../scripts/ensureIndexes').run();
    for (const k of ['alice', 'eve', 'carol', 'dave']) T[k] = (await request(app).post('/api/auth/register').send({ name: k, email: `${k}${sfx}@t.dev`, password: 'password123' })).body.token;
    M = (await request(app).post('/api/meetings').set(auth('alice')).send({ title: 'Private', instant: true })).body.meeting;
    WS = (await request(app).get('/api/workspaces').set(auth('alice'))).body.workspaces[0];
    TASK = (await request(app).post('/api/tasks').set(auth('alice')).send({ title: 'secret task', workspaceId: WS.id })).body.task;
    await require('../models/Transcript').create({ meetingId: M.id, workspaceId: M.workspaceId, status: 'completed', sourceLanguage: 'en', segmentCount: 1 });
    await require('../models/TranscriptSegment').create({ meetingId: M.id, workspaceId: M.workspaceId, idx: 0, start: 0, end: 1, text: SECRET_SEG, language: 'en' });
    for (const m of ['log', 'info', 'warn', 'error', 'debug']) spies.push(vi.spyOn(console, m).mockImplementation((...a) => { logs.push(a.map(String).join(' ')); }));
  });
  afterAll(async () => { spies.forEach((s) => s.mockRestore()); await mongoose.connection.dropDatabase().catch(() => {}); await mongoose.disconnect(); });

  // ---- route discovery ----
  const walk = (stack, prefix = '') => stack.flatMap((l) => {
    if (l.route) return Object.keys(l.route.methods).map((m) => ({ method: m, path: prefix + l.route.path }));
    if (l.name === 'router') return walk(l.handle.stack, prefix + l.regexp.source.replace(/^\^/, '').replace(/\\\/\?\(\?=\\\/\|\$\)$/, '').replace(/\\\//g, '/'));
    return [];
  });
  const fill = (p) => p.replace(/:(id|meetingId|userId)/g, M?.id || '507f1f77bcf86cd799439011').replace(':lang', 'en').replace(':roomCode', 'abcdef123456').replace(/\/$/, '');
  const PUBLIC = new Set(['get /api/health', 'get /api/ai/status', 'get /api/languages', 'post /api/auth/register', 'post /api/auth/login', 'post /api/auth/logout']);

  it('1a. EVERY non-public route rejects unauthenticated requests with 401', async () => {
    const routes = walk(app._router.stack).filter((r) => !PUBLIC.has(`${r.method} ${r.path.replace(/\/$/, '')}`));
    expect(routes.length).toBeGreaterThanOrEqual(38);                            // the walker really found the API surface (38 at the time of writing)
    const bad = [];
    for (const r of routes) { const res = await request(app)[r.method](fill(r.path)).send({}); if (res.status !== 401) bad.push(`${r.method.toUpperCase()} ${r.path} -> ${res.status}`); }
    expect(bad).toEqual([]);
  });

  it('1b. EVERY /meetings/:id route denies a signed-in outsider with 403 (never data, never 500)', async () => {
    const bodies = { 'patch /api/meetings/:id': { title: 'x' }, 'put /api/meetings/:id/language-settings': { primaryLanguage: 'en' },
      'post /api/meetings/:id/transcription': {}, 'post /api/meetings/:id/transcription/retry': {}, 'post /api/meetings/:id/translations': { targetLanguage: 'hi' }, 'post /api/meetings/:id/summary': { language: 'en' } };
    const routes = walk(app._router.stack).filter((r) => /^\/api\/meetings\/:id/.test(r.path));
    expect(routes.length).toBeGreaterThan(14);
    const bad = [];
    for (const r of routes) {
      const res = await request(app)[r.method](fill(r.path)).set(auth('eve')).send(bodies[`${r.method} ${r.path}`] || {});
      if (res.status !== 403) bad.push(`${r.method.toUpperCase()} ${r.path} -> ${res.status}`);
      expect(JSON.stringify(res.body)).not.toMatch(/Private|ZXQ/);
    }
    expect(bad).toEqual([]);
    expect((await request(app).get(`/api/meetings/${M.id}`).set(auth('alice'))).status).toBe(200);   // sanity: the owner is not locked out
  });

  it('1c. tasks and workspace management are scoped too', async () => {
    expect((await request(app).get(`/api/tasks/${TASK.id}`).set(auth('eve'))).status).toBe(403);
    expect((await request(app).patch(`/api/tasks/${TASK.id}`).set(auth('eve')).send({ title: 'hijack' })).status).toBe(403);
    expect((await request(app).delete(`/api/tasks/${TASK.id}`).set(auth('eve'))).status).toBe(403);
    expect((await request(app).post(`/api/workspaces/${WS.id}/members`).set(auth('eve')).send({ email: `eve${sfx}@t.dev` })).status).toBe(403);
    expect((await request(app).get(`/api/tasks/${TASK.id}`).set(auth('alice'))).body.task.title).toBe('secret task');
  });

  // ---- 3 ----
  it('3. $ operators are rejected in body, query string and params', async () => {
    for (const [fn, url, body] of [['get', '/api/meetings?status[$ne]=live', null], ['get', '/api/tasks?status[$gt]=', null], ['post', '/api/meeting-search/query', { question: { $ne: 'x' } }], ['post', '/api/meetings', { title: { $regex: '.*' } }]]) {
      const r = await request(app)[fn](url).set(auth('alice')).send(body || undefined);
      expect(r.status, url).toBe(400);
    }
  });

  it('3b. oversized JSON and huge arrays are rejected cheaply (413 / 400), not processed', async () => {
    const huge = await request(app).post('/api/meeting-search/query').set(auth('alice')).send({ question: 'x'.repeat(300000) });
    expect(huge.status).toBe(413); expect(huge.body.code).toBe('PAYLOAD_TOO_LARGE');
    const bigArray = await request(app).post('/api/meeting-search/query').set(auth('alice')).send({ question: 'q', meetingIds: Array.from({ length: 40000 }, () => 'a') });
    expect(bigArray.status).toBe(413);                                                         // over the 100 KB body cap, never reaches validation
    const t0 = Date.now();
    const many = await request(app).post('/api/meetings').set(auth('alice')).send({ title: 'x', invitedEmails: Array.from({ length: 5000 }, () => 'not-an-email') });
    expect(many.status).toBe(400); expect(Date.now() - t0).toBeLessThan(3000);                // under the cap but over the schema's max(50)
    expect(JSON.stringify(many.body)).not.toMatch(/not-an-email/);
  });

  // ---- 4 ----
  it('4. audio uploads: type allow-list, size cap, random server filenames, no path exposure', async () => {
    await request(app).post(`/api/meetings/${M.id}/consent`).set(auth('alice'));
    const small = Buffer.alloc(500, 1);
    const ok = await request(app).post(`/api/meetings/${M.id}/recording`).set(auth('alice')).attach('audio', small, { filename: '../../etc/evil name.webm', contentType: 'audio/webm' });
    expect(ok.status).toBe(201); expect(JSON.stringify(ok.body)).not.toMatch(/evil|storage|filePath|\/tmp/);
    const rec = await require('../models/Recording').findById(ok.body.recording.id).select('+filePath');
    expect(rec.filePath).toMatch(/\/recordings\/[0-9a-f]{32}\.webm$/); expect(fs.existsSync(rec.filePath)).toBe(true);   // never the client's name
    expect((await request(app).post(`/api/meetings/${M.id}/recording`).set(auth('alice')).attach('audio', Buffer.alloc(5000), { filename: 'big.webm', contentType: 'audio/webm' })).status).toBe(413);   // MAX_UPLOAD_MB=0.001 is fractional in bytes: regression test for the busboy === bug
    expect((await request(app).post(`/api/meetings/${M.id}/recording`).set(auth('alice')).attach('audio', small, { filename: 'a.exe', contentType: 'application/x-msdownload' })).status).toBe(400);
    expect((await request(app).post(`/api/meetings/${M.id}/recording`).set(auth('alice')).attach('audio', small, { filename: 'a.exe', contentType: 'audio/webm' })).status).toBe(400);   // type spoofing
    expect((await request(app).post(`/api/meetings/${M.id}/recording`).set(auth('alice')).field('x', '1')).status).toBe(400);   // no file
  });

  it('4b. chunking works on temp files and removes them; the original upload is untouched', async () => {
    const wav = '/tmp/sec-test.wav';
    execFileSync(require('ffmpeg-static'), ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=130', '-ar', '16000', '-ac', '1', wav], { stdio: 'ignore' });
    const tmp = () => fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('intellmeet-'));
    const before = tmp().length;
    const prepared = await require('../services/ai/audioService').prepare(wav);
    expect(prepared.chunks.length).toBeGreaterThan(1); expect(prepared.chunks.every((c) => c.path !== wav && fs.existsSync(c.path))).toBe(true);
    expect(tmp().length).toBe(before + 1);
    await prepared.cleanup();
    expect(tmp().length).toBe(before); expect(fs.existsSync(wav)).toBe(true);
  });

  // ---- 5 ----
  it('5. AI routes are rate limited PER USER (429 RATE_LIMITED); the bucket is shared by all AI routes; other users unaffected', async () => {
    const q = (who) => request(app).post('/api/meeting-search/query').set(auth(who)).send({ question: 'anything' });
    for (let i = 0; i < 12; i += 1) expect((await q('carol')).status, `request ${i + 1}`).toBe(200);
    const limited = await q('carol'); expect(limited.status).toBe(429); expect(limited.body.code).toBe('RATE_LIMITED');
    expect(limited.headers['ratelimit-limit'] || limited.headers['ratelimit']).toBeTruthy();
    expect((await q('dave')).status).toBe(200);                                                       // someone else is not throttled
  });

  // ---- 7 + 8 ----
  it('7. no transcripts, questions, or keys in logs (including the unexpected-error path)', async () => {
    logs.length = 0;
    // (a) a normal search on a meeting that contains the secret segment, asked with a secret question
    const TS = require('../models/TranscriptSegment');
    expect(await TS.countDocuments({ text: SECRET_SEG })).toBe(1);
    await request(app).post('/api/meeting-search/query').set(auth('eve')).send({ question: SECRET_Q });          // eve (separate rate bucket)
    // (b) an unexpected server error whose message contains user data
    const orig = Task.find; Task.find = () => { throw new Error(`driver failure with ${SECRET_Q} ${SECRET_SEG} ${KEY_GEMINI}`); };
    const res = await request(app).get('/api/tasks').set(auth('alice'));
    Task.find = orig;
    expect(res.status).toBe(500); expect(JSON.stringify(res.body)).not.toMatch(/ZXQ|AIza|gsk_|stack|driver/);     // safe client message
    expect(logs.some((l) => l.includes('[error]'))).toBe(true);                                                  // it WAS logged ...
    const all = logs.join('\n');
    expect(all).not.toContain(SECRET_Q); expect(all).not.toContain(SECRET_SEG); expect(all).not.toContain(KEY_GEMINI); expect(all).not.toContain(KEY_GROQ);   // ... without the data
  });

  it('8. API keys never appear in any response, including error responses', async () => {
    const samples = [await request(app).get('/api/ai/status'), await request(app).get('/api/languages'), await request(app).get('/api/meetings/rtc-config').set(auth('alice')),
      await request(app).get('/api/auth/me').set(auth('alice')), await request(app).get('/api/nope'), await request(app).post('/api/auth/login').send({ email: 'x' }),
      await request(app).post(`/api/meetings/${M.id}/translations`).set(auth('alice')).send({ targetLanguage: 'xx' })];
    for (const r of samples) expect(JSON.stringify([r.body, r.headers])).not.toMatch(/gsk_|AIza|TESTSECRETKEY/);
    expect(Object.keys((await request(app).get('/api/ai/status')).body.features).sort()).toEqual(['language', 'search', 'transcription']);
  });

  it('8b. helmet headers, strict CORS (only CLIENT_URL), and hardened auth cookie', async () => {
    const h = await request(app).get('/api/health');
    expect(h.headers['x-content-type-options']).toBe('nosniff'); expect(h.headers['x-powered-by']).toBeUndefined(); expect(h.headers['content-security-policy']).toBeTruthy();
    expect((await request(app).get('/api/health').set('Origin', 'http://evil.example')).headers['access-control-allow-origin']).toBeUndefined();
    const good = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(good.headers['access-control-allow-origin']).toBe('http://localhost:5173'); expect(good.headers['access-control-allow-credentials']).toBe('true');
    const login = () => request(app).post('/api/auth/login').send({ email: `alice${sfx}@t.dev`, password: 'password123' });
    const dev = (await login()).headers['set-cookie'][0]; expect(dev).toMatch(/HttpOnly/); expect(dev).toMatch(/SameSite=Lax/);
    process.env.NODE_ENV = 'production';
    try { expect((await login()).headers['set-cookie'][0]).toMatch(/Secure/); } finally { process.env.NODE_ENV = 'test'; }
  });

  it('no password hash ever leaves the server', async () => {
    const bodies = [await request(app).post('/api/auth/login').send({ email: `alice${sfx}@t.dev`, password: 'password123' }), await request(app).get('/api/auth/me').set(auth('alice')), await request(app).get('/api/workspaces').set(auth('alice'))];
    for (const r of bodies) expect(JSON.stringify(r.body)).not.toMatch(/password|\$2[aby]\$/i);
    expect((await request(app).post('/api/auth/login').send({ email: `alice${sfx}@t.dev`, password: 'wrongpass99' })).body.message).toBe('Invalid email or password.');   // same message for unknown users (no enumeration)
    expect((await request(app).post('/api/auth/login').send({ email: 'nobody@t.dev', password: 'wrongpass99' })).body.message).toBe('Invalid email or password.');
  });
});
