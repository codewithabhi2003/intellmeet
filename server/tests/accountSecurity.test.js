// "What if someone logs in as a user?" Private meetings, tasks, revocable sessions, password change, lockout, activity log.
// Real DB + real sockets. Set TEST_MONGO_URI to run.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import http from 'http';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { io as ioc } from 'socket.io-client';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const URI = process.env.TEST_MONGO_URI;
const run = URI ? describe : describe.skip;

const SECRET_SEG = 'ZEBRA-SECRET-PLAN', SECRET_TASK = 'ZEBRA action item';

run('account takeover protections', () => {
  const sfx = Date.now();
  let app, server, port, T = {}, ID = {}, P, S, WS, aiTask, M;
  const H = (t) => ({ Authorization: `Bearer ${t}` });
  const email = (k) => `${k}${sfx}@t.dev`;
  const reg = async (k) => { const r = await request(app).post('/api/auth/register').send({ name: k, email: email(k), password: 'password123' }); T[k] = r.body.token; ID[k] = r.body.user.id; return r; };
  const login = (k, password = 'password123') => request(app).post('/api/auth/login').send({ email: email(k), password });
  const sock = (token) => new Promise((resolve, reject) => { const s = ioc(`http://127.0.0.1:${port}`, { auth: { token }, transports: ['websocket'], reconnection: false }); s.on('connect', () => resolve(s)); s.on('connect_error', reject); });

  beforeAll(async () => {
    process.env.JWT_SECRET = 'x'.repeat(40); process.env.STORAGE_DIR = '/tmp/intellmeet-acct-storage';
    mongoose.set('autoIndex', false);
    await mongoose.connect(URI, { dbName: `intellmeet_acct_${sfx}` });
    app = require('../app'); server = http.createServer(app); require('../sockets').init(server);
    await new Promise((r) => server.listen(0, r)); port = server.address().port;
    await require('../scripts/ensureIndexes').run();
    M = { Transcript: require('../models/Transcript'), Segment: require('../models/TranscriptSegment'), Summary: require('../models/Summary'), Task: require('../models/Task'), User: require('../models/User'), LoginAttempt: require('../models/LoginAttempt') };
    for (const k of ['ana', 'bob', 'carol', 'eve']) await reg(k);
    WS = (await request(app).get('/api/workspaces').set(H(T.ana))).body.workspaces[0];
    expect((await request(app).post(`/api/workspaces/${WS.id}/members`).set(H(T.ana)).send({ email: email('bob') })).status).toBe(201);   // bob: a teammate in ana's workspace
    P = (await request(app).post('/api/meetings').set(H(T.ana)).send({ title: 'Board strategy', instant: true, invitedEmails: [email('carol')] })).body.meeting;                  // visibility omitted
    S = (await request(app).post('/api/meetings').set(H(T.ana)).send({ title: 'All-hands', instant: true, visibility: 'workspace' })).body.meeting;
    await M.Transcript.create({ meetingId: P.id, workspaceId: P.workspaceId, status: 'completed', sourceLanguage: 'en', segmentCount: 1 });
    await M.Segment.create({ meetingId: P.id, workspaceId: P.workspaceId, idx: 0, start: 0, end: 1, text: SECRET_SEG, language: 'en' });
    await M.Summary.create({ meetingId: P.id, language: 'en', overview: 'ZEBRA overview', sourceLanguage: 'en' });
    aiTask = await M.Task.create({ title: SECRET_TASK, workspaceId: P.workspaceId, meetingId: P.id, source: 'ai', needsReview: true, createdBy: ID.ana });
    await M.Task.create({ title: 'Team lunch', workspaceId: P.workspaceId, createdBy: ID.ana });
  });
  afterAll(async () => { server?.close(); await mongoose.connection.dropDatabase().catch(() => {}); await mongoose.disconnect(); });

  it('a new meeting is PRIVATE by default; a teammate in the workspace who was not invited cannot read anything of it', async () => {
    expect(P.visibility).toBe('private'); expect(S.visibility).toBe('workspace');
    const bob = H(T.bob);
    for (const [m, path, body] of [['get', ''], ['get', '/transcript'], ['get', '/transcript/status'], ['get', '/translations'], ['get', '/summary'], ['get', '/messages'], ['post', '/summary', { language: 'en' }], ['post', '/transcription', {}], ['post', '/translations', { targetLanguage: 'hi' }], ['post', '/consent'], ['post', '/end']]) {
      const r = await request(app)[m](`/api/meetings/${P.id}${path}`).set(bob).send(body); expect(r.status, `${m} ${path}`).toBe(403); expect(JSON.stringify(r.body)).not.toMatch(/ZEBRA|Board strategy/);
    }
    const list = (await request(app).get('/api/meetings').set(bob)).body.meetings.map((x) => x.title); expect(list).toContain('All-hands'); expect(list).not.toContain('Board strategy');
    expect((await request(app).get(`/api/meetings/${S.id}`).set(bob)).status).toBe(200);                 // the shared meeting is still open to the workspace
    const search = await request(app).post('/api/meeting-search/query').set(bob).send({ question: SECRET_SEG });
    expect(search.body.mode).toBe('insufficient'); expect(JSON.stringify(search.body)).not.toMatch(/ZEBRA/);
    const s = await sock(T.bob); const ack = await new Promise((r) => s.emit('room:join', { roomCode: P.roomCode }, r)); s.close();
    expect(ack.ok).toBe(false); expect(ack.code).toBe('FORBIDDEN');
  });

  it('the host and the invited person can open it', async () => {
    for (const who of ['ana', 'carol']) {
      expect((await request(app).get(`/api/meetings/${P.id}`).set(H(T[who]))).status, who).toBe(200);
      const t = await request(app).get(`/api/meetings/${P.id}/transcript`).set(H(T[who])); expect(t.body.segments[0].text).toBe(SECRET_SEG);
      expect((await request(app).get(`/api/meetings/${P.id}/summary?language=en`).set(H(T[who]))).body.summary.overview).toBe('ZEBRA overview');
    }
  });

  it('only the host can change who can see a meeting', async () => {
    const patch = (t, visibility) => request(app).patch(`/api/meetings/${P.id}`).set(H(t)).send({ visibility });
    expect((await patch(T.bob, 'workspace')).status).toBe(403); expect((await patch(T.carol, 'workspace')).status).toBe(403);
    expect((await request(app).get(`/api/meetings/${P.id}`).set(H(T.bob))).status).toBe(403);
    expect((await patch(T.ana, 'workspace')).body.meeting.visibility).toBe('workspace');
    expect((await request(app).get(`/api/meetings/${P.id}`).set(H(T.bob))).status).toBe(200);              // shared on purpose
    expect((await patch(T.ana, 'private')).status).toBe(200);
    expect((await request(app).get(`/api/meetings/${P.id}`).set(H(T.bob))).status).toBe(403);              // and private again
    expect((await patch(T.ana, 'everyone')).status).toBe(400);
  });

  it('action items taken from a private meeting do not leak through the task list', async () => {
    const bob = H(T.bob);
    const titles = (await request(app).get('/api/tasks').set(bob)).body.tasks.map((t) => t.title);
    expect(titles).toContain('Team lunch'); expect(titles).not.toContain(SECRET_TASK);
    expect((await request(app).get(`/api/tasks?meetingId=${P.id}`).set(bob)).body.tasks).toEqual([]);
    expect((await request(app).get(`/api/tasks/${aiTask.id}`).set(bob)).status).toBe(403);
    expect((await request(app).patch(`/api/tasks/${aiTask.id}`).set(bob).send({ status: 'done' })).status).toBe(403);
    expect((await request(app).delete(`/api/tasks/${aiTask.id}`).set(bob)).status).toBe(403);
    expect((await request(app).post('/api/tasks').set(bob).send({ title: 'sneaky', workspaceId: WS.id, meetingId: P.id })).status).toBe(403);   // can't attach to a meeting you can't open
    const carol = await request(app).get(`/api/tasks?meetingId=${P.id}`).set(H(T.carol));                  // invited, not even in the workspace: sees that meeting's task
    expect(carol.body.tasks.map((t) => t.title)).toEqual([SECRET_TASK]);
    expect((await request(app).get('/api/tasks').set(H(T.carol))).body.tasks.map((t) => t.title)).not.toContain('Team lunch');   // but not the workspace's other tasks
    expect((await request(app).get(`/api/tasks/${aiTask.id}`).set(H(T.eve))).status).toBe(403);
  });

  it('"log out of all devices" kills every token, including a stolen one, and cuts live sockets', async () => {
    await reg('sam'); const t1 = T.sam; const t2 = (await login('sam')).body.token;
    for (const t of [t1, t2]) expect((await request(app).get('/api/auth/me').set(H(t))).status).toBe(200);
    const live = await sock(t2); const dropped = new Promise((r) => live.once('disconnect', r));
    expect((await request(app).post('/api/auth/logout-all')).status).toBe(401);                          // needs a session
    const out = await request(app).post('/api/auth/logout-all').set(H(t1));
    expect(out.status).toBe(200); expect(out.headers['set-cookie'][0]).toMatch(/token=;/);
    await dropped;                                                                                          // the other device's socket was cut
    for (const t of [t1, t2]) expect((await request(app).get('/api/auth/me').set(H(t))).status, 'old token').toBe(401);
    await expect(sock(t2)).rejects.toBeTruthy();                                                            // and it can't reconnect
    const t3 = (await login('sam')).body.token; expect((await request(app).get('/api/auth/me').set(H(t3))).status).toBe(200);   // a fresh sign-in works
  });

  it('changing the password needs the current one, signs out every other device, and gives this one a fresh session', async () => {
    await reg('pat'); const old = T.pat; const other = (await login('pat')).body.token;
    expect((await request(app).put('/api/users/me/password').send({ currentPassword: 'password123', newPassword: 'brand-new-pass-1' })).status).toBe(401);
    const put = (b) => request(app).put('/api/users/me/password').set(H(old)).send(b);
    const wrong = await put({ currentPassword: 'not-my-password', newPassword: 'brand-new-pass-1' }); expect(wrong.status).toBe(403); expect(wrong.body.code).toBe('WRONG_PASSWORD');
    expect((await put({ currentPassword: 'password123', newPassword: 'password123' })).status).toBe(400);
    expect((await put({ currentPassword: 'password123', newPassword: 'short' })).status).toBe(400);
    expect((await put({ currentPassword: 'password123', newPassword: 'brand-new-pass-1', role: 'admin' })).status).toBe(400);
    const ok = await put({ currentPassword: 'password123', newPassword: 'brand-new-pass-1' });
    expect(ok.status).toBe(200); expect(ok.headers['set-cookie'][0]).toMatch(/token=/); expect(JSON.stringify(ok.body)).not.toMatch(/\$2[aby]\$|"password"/);
    for (const t of [old, other]) expect((await request(app).get('/api/auth/me').set(H(t))).status, 'older session').toBe(401);
    expect((await request(app).get('/api/auth/me').set(H(ok.body.token))).status).toBe(200);
    expect((await login('pat', 'password123')).status).toBe(401); expect((await login('pat', 'brand-new-pass-1')).status).toBe(200);
    T.pat = ok.body.token;
  });

  it('five wrong passwords lock the address, even for the right password, and an unknown address behaves identically', async () => {
    await reg('dan');
    const wrong = () => request(app).post('/api/auth/login').send({ email: email('dan'), password: 'nope-nope-nope' });
    for (let i = 0; i < 5; i += 1) expect((await wrong()).status, `attempt ${i + 1}`).toBe(401);
    const locked = await login('dan'); expect(locked.status).toBe(429); expect(locked.body.code).toBe('TOO_MANY_ATTEMPTS'); expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
    const ghost = () => request(app).post('/api/auth/login').send({ email: `ghost${sfx}@t.dev`, password: 'nope-nope-nope' });
    for (let i = 0; i < 5; i += 1) expect((await ghost()).status).toBe(401);
    const ghostLocked = await ghost(); expect(ghostLocked.status).toBe(429); expect(ghostLocked.body).toEqual(locked.body);   // no way to tell a real address from a fake one
    await M.LoginAttempt.updateMany({}, { $set: { lockedUntil: new Date(Date.now() - 1000) } });                // the lock expires
    expect((await login('dan')).status).toBe(200);
    expect(await M.LoginAttempt.countDocuments()).toBe(1);                                                   // dan's counter was cleared on success (only ghost's remains)
    for (let i = 0; i < 3; i += 1) await wrong(); expect((await login('dan')).status).toBe(200);              // a success in between resets the count
    for (let i = 0; i < 3; i += 1) await wrong(); expect((await wrong()).status).toBe(401);                    // 4th since the reset: still not locked
  });

  it('a stolen password-guessing session cannot brute-force the current password through "change password" either', async () => {
    await reg('kim'); const put = (cur) => request(app).put('/api/users/me/password').set(H(T.kim)).send({ currentPassword: cur, newPassword: 'another-new-pass-1' });
    for (let i = 0; i < 5; i += 1) expect((await put('guess-guess-1')).status).toBe(403);
    const r = await put('password123'); expect(r.status).toBe(429);                                         // locked: even the right password is refused for now
  });

  it('you can see your own security activity (and only yours)', async () => {
    const mine = (await request(app).get('/api/users/me/security-events').set(H(T.pat))).body.events;
    const types = mine.map((e) => e.type); expect(types).toEqual(expect.arrayContaining(['login_success', 'password_change_failed', 'password_changed']));
    expect(mine[0].createdAt >= mine.at(-1).createdAt).toBe(true); expect(mine.every((e) => e.ip && 'userAgent' in e)).toBe(true);
    const sam = (await request(app).get('/api/users/me/security-events').set(H((await login('sam')).body.token))).body.events.map((e) => e.type);
    expect(sam).toContain('sessions_revoked'); expect(sam).not.toContain('password_changed');
    const dan = (await request(app).get('/api/users/me/security-events').set(H((await login('dan')).body.token))).body.events.map((e) => e.type);
    expect(dan).toEqual(expect.arrayContaining(['login_failed', 'account_locked']));
    expect((await request(app).get('/api/users/me/security-events').set(H(T.bob))).body.events).toEqual([]);   // bob has no events and sees none of the others
    expect((await request(app).get('/api/users/me/security-events')).status).toBe(401);
  });

  it('forged, expired-version and deactivated-account tokens are refused', async () => {
    const forged = jwt.sign({ id: ID.ana, tv: 0 }, 'a-different-secret-that-is-long-enough!!');
    expect((await request(app).get('/api/auth/me').set(H(forged))).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set(H(jwt.sign({ id: ID.ana, tv: 5 }, process.env.JWT_SECRET)))).status).toBe(401);   // wrong session version
    expect((await request(app).get('/api/auth/me').set(H('not.a.token'))).status).toBe(401);
    await M.User.updateOne({ _id: ID.eve }, { $set: { isActive: false } });
    expect((await request(app).get('/api/auth/me').set(H(T.eve))).status).toBe(401);
    await expect(sock(T.eve)).rejects.toBeTruthy();
  });

  it('nothing is cached, and recordings cannot be downloaded', async () => {
    const r = await request(app).get(`/api/meetings/${P.id}/transcript`).set(H(T.ana)); expect(r.headers['cache-control']).toBe('no-store');
    expect((await request(app).get('/api/auth/me').set(H(T.ana))).headers['cache-control']).toBe('no-store');
    for (const path of ['/storage/recordings/anything.webm', '/recordings/anything.webm', '/storage/avatars/x.png', `/api/meetings/${P.id}/recording`]) {
      const res = await request(app).get(path).set(H(T.ana)); expect(res.status, path).toBe(404);
    }
  });
});