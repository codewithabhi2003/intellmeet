// Reaction events over real sockets (real DB). Set TEST_MONGO_URI to run.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import http from 'http';
import mongoose from 'mongoose';
import { io as ioc } from 'socket.io-client';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const URI = process.env.TEST_MONGO_URI;
const run = URI ? describe : describe.skip;

run('meeting reactions', () => {
  const sfx = Date.now();
  let app, server, port, T = {}, A, B;
  const clients = [];
  const connect = (token) => new Promise((resolve, reject) => {
    const s = ioc(`http://127.0.0.1:${port}`, { auth: { token }, transports: ['websocket'], reconnection: false });
    clients.push(s); s.on('connect', () => resolve(s)); s.on('connect_error', reject);
  });
  const emit = (s, ev, p) => new Promise((r) => s.emit(ev, p, r));
  const next = (s, ev, ms = 2000) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error(`no ${ev}`)), ms); s.once(ev, (p) => { clearTimeout(t); res(p); }); });
  const collect = (s) => { const got = []; s.on('reaction:received', (r) => got.push(r)); return got; };
  const quiet = (ms = 250) => new Promise((r) => setTimeout(r, ms));
  const mkMeeting = async (token, title) => (await request(app).post('/api/meetings').set({ Authorization: `Bearer ${token}` }).send({ title, instant: true })).body.meeting;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'x'.repeat(40); process.env.STORAGE_DIR = '/tmp/intellmeet-react-storage';
    mongoose.set('autoIndex', false);
    await mongoose.connect(URI, { dbName: `intellmeet_react_${sfx}` });
    app = require('../app'); server = http.createServer(app); require('../sockets').init(server);
    await new Promise((r) => server.listen(0, r)); port = server.address().port;
    for (const k of ['ana', 'raj', 'eve']) T[k] = (await request(app).post('/api/auth/register').send({ name: k, email: `${k}${sfx}@t.dev`, password: 'password123' })).body.token;
    A = await mkMeeting(T.ana, 'Room A'); B = await mkMeeting(T.ana, 'Room B');
    await request(app).patch(`/api/meetings/${A.id}`).set({ Authorization: `Bearer ${T.ana}` }).send({ invitedEmails: [`raj${sfx}@t.dev`] });
  });
  // each test cleans up its own sockets: a room holds at most MAX_ROOM_PEERS (6), so leftovers would block later joins
  afterEach(async () => { clients.splice(0).forEach((c) => c.close()); await new Promise((r) => setTimeout(r, 150)); });
  afterAll(async () => { clients.forEach((c) => c.close()); server?.close(); await mongoose.connection.dropDatabase().catch(() => {}); await mongoose.disconnect(); });

  it('a reaction reaches everyone in the room (including the sender) with the sender\'s name', async () => {
    const a = await connect(T.ana), r = await connect(T.raj);
    expect((await emit(a, 'room:join', { roomCode: A.roomCode })).ok).toBe(true); expect((await emit(r, 'room:join', { roomCode: A.roomCode })).ok).toBe(true);
    const toA = next(a, 'reaction:received'), toR = next(r, 'reaction:received');
    expect(await emit(a, 'reaction:send', { emoji: '🎉' })).toEqual({ ok: true });
    for (const m of [await toA, await toR]) expect(m).toMatchObject({ emoji: '🎉', name: 'ana', socketId: a.id });
    const m = await toR; expect(m.id).toMatch(/^[0-9a-f-]{36}$/); expect(m.userId).toBeTruthy();
  });

  it('only the allowed emojis are accepted (each of them works)', async () => {
    const { ALLOWED_REACTIONS } = require('../sockets/reactions');
    expect(ALLOWED_REACTIONS).toEqual(['👍', '👏', '❤️', '😂', '😮', '🎉', '🙏', '🔥']);   // the client list must match this literal
    const a = await connect(T.ana); await emit(a, 'room:join', { roomCode: A.roomCode });
    const got = collect(a);
    for (const emoji of ALLOWED_REACTIONS) expect((await emit(a, 'reaction:send', { emoji })).ok, emoji).toBe(true);
    await quiet(); expect(got.map((g) => g.emoji)).toEqual(ALLOWED_REACTIONS);
  });

  it('anything else is refused and never relayed (free text, other emoji, extra keys, wrong types)', async () => {
    const a = await connect(T.ana), r = await connect(T.raj);
    await emit(a, 'room:join', { roomCode: A.roomCode }); await emit(r, 'room:join', { roomCode: A.roomCode });
    const got = collect(r);
    for (const bad of [{ emoji: '💩' }, { emoji: 'hello' }, { emoji: '<img src=x onerror=alert(1)>' }, { emoji: '🎉🎉' }, { emoji: '🎉', text: 'extra' }, { emoji: 5 }, {}, null])      // 8 attempts: invalid ones count toward the rate limit too
      expect((await emit(a, 'reaction:send', bad)).code, JSON.stringify(bad)).toBe('VALIDATION_ERROR');
    await quiet(); expect(got).toEqual([]);
  });

  it('you must be in the room: a connected socket that has not joined cannot react, and nobody hears it', async () => {
    const a = await connect(T.ana), lurker = await connect(T.ana);
    await emit(a, 'room:join', { roomCode: A.roomCode }); const got = collect(a);
    expect((await emit(lurker, 'reaction:send', { emoji: '👍' })).code).toBe('FORBIDDEN');
    await quiet(); expect(got).toEqual([]);
  });

  it('an outsider cannot join (so cannot react)', async () => {
    const e = await connect(T.eve);
    expect((await emit(e, 'room:join', { roomCode: A.roomCode })).ok).toBe(false);
    expect((await emit(e, 'reaction:send', { emoji: '👍' })).code).toBe('FORBIDDEN');
  });

  it('reactions stay inside their own meeting', async () => {
    const a = await connect(T.ana), other = await connect(T.ana);
    await emit(a, 'room:join', { roomCode: A.roomCode }); await emit(other, 'room:join', { roomCode: B.roomCode });
    const inB = collect(other);
    await emit(a, 'reaction:send', { emoji: '🔥' }); await quiet();
    expect(inB).toEqual([]);
  });

  it('is rate limited per socket (429-style RATE_LIMITED), without affecting other people', async () => {
    const a = await connect(T.ana), r = await connect(T.raj);
    await emit(a, 'room:join', { roomCode: A.roomCode }); await emit(r, 'room:join', { roomCode: A.roomCode });
    const got = collect(r); const acks = [];
    for (let i = 0; i < 10; i += 1) acks.push(await emit(a, 'reaction:send', { emoji: '👏' }));
    expect(acks.filter((x) => x.ok)).toHaveLength(8); expect(acks.slice(8).map((x) => x.code)).toEqual(['RATE_LIMITED', 'RATE_LIMITED']);
    expect((await emit(r, 'reaction:send', { emoji: '👍' })).ok).toBe(true);
    await quiet(); expect(got.filter((g) => g.name === 'ana')).toHaveLength(8);
  });
});
