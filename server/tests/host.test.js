// Host controls, waiting room and pre-created meeting codes (real sockets, real DB). Set TEST_MONGO_URI to run.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import http from 'http';
import mongoose from 'mongoose';
import { io as ioc } from 'socket.io-client';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const URI = process.env.TEST_MONGO_URI;
const run = URI ? describe : describe.skip;

run('host controls + waiting room', () => {
  const sfx = Date.now();
  let app, server, port, T = {}, A, W;
  const clients = [];
  const A_CODE = 'host-test-A1', W_CODE = 'host-test-W1';
  const H = (k) => ({ Authorization: `Bearer ${T[k]}` });
  const connect = (k) => new Promise((resolve, reject) => { const s = ioc(`http://127.0.0.1:${port}`, { auth: { token: T[k] }, transports: ['websocket'], reconnection: false }); clients.push(s); s.on('connect', () => resolve(s)); s.on('connect_error', reject); });
  const emit = (s, ev, p) => new Promise((r) => s.emit(ev, p, r));
  const join = (s, code) => emit(s, 'room:join', { roomCode: code });
  const collect = (s, ev) => { const got = []; s.on(ev, (p) => got.push(p)); return got; };
  const next = (s, ev, ms = 2500) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error(`no ${ev}`)), ms); s.once(ev, (p) => { clearTimeout(t); res(p); }); });
  const quiet = (ms = 250) => new Promise((r) => setTimeout(r, ms));

  beforeAll(async () => {
    process.env.JWT_SECRET = 'x'.repeat(40); process.env.STORAGE_DIR = '/tmp/intellmeet-host-storage';
    mongoose.set('autoIndex', false);
    await mongoose.connect(URI, { dbName: `intellmeet_host_${sfx}` });
    app = require('../app'); server = http.createServer(app); require('../sockets').init(server);
    await new Promise((r) => server.listen(0, r)); port = server.address().port;
    await require('../scripts/ensureIndexes').run();
    for (const k of ['ana', 'raj', 'zed', 'eve']) T[k] = (await request(app).post('/api/auth/register').send({ name: k, email: `${k}${sfx}@t.dev`, password: 'password123' })).body.token;
    const mk = (body) => request(app).post('/api/meetings').set(H('ana')).send({ instant: true, ...body });
    A = (await mk({ title: 'A', roomCode: A_CODE })).body.meeting; W = (await mk({ title: 'W', roomCode: W_CODE, waitingRoom: true })).body.meeting;
    for (const m of [A, W]) await request(app).patch(`/api/meetings/${m.id}`).set(H('ana')).send({ invitedEmails: [`raj${sfx}@t.dev`, `zed${sfx}@t.dev`] });
  });
  afterEach(async () => { clients.splice(0).forEach((c) => c.close()); await quiet(150); });
  afterAll(async () => { server?.close(); await mongoose.connection.dropDatabase().catch(() => {}); await mongoose.disconnect(); });

  it('a meeting code made BEFORE the meeting is accepted (and the waiting-room flag kept); bad or duplicate codes are refused', async () => {
    expect(A.roomCode).toBe(A_CODE); expect(W.roomCode).toBe(W_CODE); expect(A.waitingRoom).toBe(false); expect(W.waitingRoom).toBe(true);
    const mk = (roomCode) => request(app).post('/api/meetings').set(H('ana')).send({ title: 'x', instant: true, roomCode });
    for (const bad of ['short', 'has spaces!!', '0123456789abc', '../../etc/pw1', '']) expect((await mk(bad)).status, bad).toBe(400);
    expect((await mk(A_CODE)).status).toBe(409);                                              // already taken
    const made = await request(app).post('/api/meetings').set(H('ana')).send({ title: 'auto', instant: true });
    expect(made.body.meeting.roomCode).toMatch(/^[A-Za-z0-9_-]{12}$/);                        // still generated when none is given
  });

  it('only the host can mute, mute all, remove or admit; everyone else gets FORBIDDEN and nothing is delivered', async () => {
    const ana = await connect('ana'), raj = await connect('raj'), zed = await connect('zed');
    for (const s of [ana, raj, zed]) expect((await join(s, A_CODE)).ok).toBe(true);
    const heard = collect(zed, 'host:force-mute'); const removed = collect(zed, 'host:removed');
    for (const [ev, p] of [['host:mute', { socketId: zed.id, kind: 'audio' }], ['host:mute-all', { kind: 'audio' }], ['host:remove', { socketId: zed.id }], ['lobby:admit', { socketId: zed.id }], ['lobby:deny', { socketId: zed.id }]])
      expect((await emit(raj, ev, p)).code, ev).toBe('FORBIDDEN');
    await quiet(); expect(heard).toEqual([]); expect(removed).toEqual([]);
    const lurker = await connect('ana');                                                      // the host's account, but a socket that is not in the room
    expect((await emit(lurker, 'host:mute', { socketId: zed.id, kind: 'audio' })).code).toBe('FORBIDDEN');
  });

  it('host mutes one person (mic or camera) or everyone else; the targets, and only they, are told', async () => {
    const ana = await connect('ana'), raj = await connect('raj'), zed = await connect('zed');
    for (const s of [ana, raj, zed]) await join(s, A_CODE);
    const toRaj = collect(raj, 'host:force-mute'), toZed = collect(zed, 'host:force-mute'), toAna = collect(ana, 'host:force-mute');
    expect((await emit(ana, 'host:mute', { socketId: raj.id, kind: 'audio' })).ok).toBe(true); expect((await emit(ana, 'host:mute', { socketId: raj.id, kind: 'video' })).ok).toBe(true);
    await quiet(); expect(toRaj).toEqual([{ kind: 'audio' }, { kind: 'video' }]); expect(toZed).toEqual([]);
    expect((await emit(ana, 'host:mute', { socketId: raj.id, kind: 'screen' })).code).toBe('VALIDATION_ERROR');
    expect((await emit(ana, 'host:mute', { socketId: ana.id, kind: 'audio' })).code).toBe('NOT_FOUND');          // not yourself
    expect((await emit(ana, 'host:mute', { socketId: 'nope', kind: 'audio' })).code).toBe('NOT_FOUND');
    expect(await emit(ana, 'host:mute-all', { kind: 'audio' })).toEqual({ ok: true, count: 2 });
    await quiet(); expect(toRaj.at(-1)).toEqual({ kind: 'audio' }); expect(toZed).toEqual([{ kind: 'audio' }]); expect(toAna).toEqual([]);   // never the host
  });

  it('remove: the person is told and dropped, the others see them leave, and they cannot come back (sockets or HTTP)', async () => {
    const ana = await connect('ana'), raj = await connect('raj'), zed = await connect('zed');
    for (const s of [ana, raj, zed]) await join(s, A_CODE);
    const wasRemoved = next(raj, 'host:removed'); const zedSees = collect(zed, 'peer:left');
    expect((await emit(ana, 'host:remove', { socketId: ana.id })).code).toBe('NOT_FOUND');                      // the host can't remove themselves
    expect((await emit(ana, 'host:remove', { socketId: raj.id })).ok).toBe(true);
    await wasRemoved; await quiet(); expect(zedSees.map((x) => x.socketId)).toEqual([raj.id]);
    expect((await emit(raj, 'chat:send', { text: 'still here?' })).code).toBe('FORBIDDEN');                       // no longer in the room
    const again = await connect('raj'); const ack = await join(again, A_CODE);
    expect(ack.ok).toBe(false); expect(ack.code).toBe('REMOVED');
    const viaHttp = await request(app).post('/api/meetings/join').set(H('raj')).send({ roomCode: A_CODE });
    expect(viaHttp.status).toBe(403); expect(viaHttp.body.code).toBe('REMOVED');
    expect((await join(await connect('zed'), A_CODE)).ok).toBe(true);                                             // others unaffected
  });

  it('waiting room: people wait outside, the host sees them and admits or denies; admitted people join and stay admitted', async () => {
    const ana = await connect('ana'); expect((await join(ana, W_CODE)).ok).toBe(true);
    const updates = collect(ana, 'lobby:update');
    const raj = await connect('raj'); const rajAck = await join(raj, W_CODE);
    expect(rajAck).toEqual({ ok: true, waiting: true });
    expect((await emit(raj, 'reaction:send', { emoji: '👍' })).code).toBe('FORBIDDEN');                           // waiting people are not in the meeting
    const peerEvents = collect(ana, 'peer:joined'); await quiet();
    expect(peerEvents).toEqual([]); expect(updates.at(-1).waiting.map((w) => [w.name, w.socketId])).toEqual([['raj', raj.id]]);
    const zed = await connect('zed'); await join(zed, W_CODE); await quiet(); expect(updates.at(-1).waiting.map((w) => w.name)).toEqual(['raj', 'zed']);

    const admitted = next(raj, 'lobby:admitted');
    expect((await emit(ana, 'lobby:admit', { socketId: raj.id })).ok).toBe(true); await admitted;
    const inAck = await join(raj, W_CODE); expect(inAck.ok).toBe(true); expect(inAck.waiting).toBeUndefined(); expect(inAck.peers.map((p) => p.name)).toEqual(['ana']);
    await quiet(); expect(updates.at(-1).waiting.map((w) => w.name)).toEqual(['zed']);

    const denied = next(zed, 'lobby:denied');
    expect((await emit(ana, 'lobby:deny', { socketId: zed.id })).ok).toBe(true); await denied; await quiet();
    expect(updates.at(-1).waiting).toEqual([]); expect((await emit(ana, 'lobby:admit', { socketId: zed.id })).code).toBe('NOT_FOUND');

    const rajAgain = await connect('raj'); const direct = await join(rajAgain, W_CODE);                            // admitted once => joins directly next time
    expect(direct.ok).toBe(true); expect(direct.waiting).toBeUndefined();
  });

  it('the host arriving later still sees who is already waiting; when the meeting ends, waiting people are told', async () => {
    const zed = await connect('zed'); expect(await join(zed, W_CODE)).toEqual({ ok: true, waiting: true });
    const ana = await connect('ana'); const first = next(ana, 'lobby:update'); await join(ana, W_CODE);
    expect((await first).waiting.map((w) => w.name)).toEqual(['zed']);
    const over = next(zed, 'meeting:ended');
    expect((await request(app).post(`/api/meetings/${W.id}/end`).set(H('ana'))).status).toBe(200);
    expect((await over).meetingId).toBe(String(W.id));
  });
});