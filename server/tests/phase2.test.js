// Integration tests: need a MongoDB. Set TEST_MONGO_URI to run; otherwise skipped (clearly reported).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import http from 'http';
import mongoose from 'mongoose';
import { io as ioc } from 'socket.io-client';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const URI = process.env.TEST_MONGO_URI;
const run = URI ? describe : describe.skip;

run('phase 2 gate (real MongoDB)', () => {
  let app, server, port, tokens = {}, ids = {}, meeting;
  const clients = [];
  const sfx = Date.now();
  const auth = (k) => ({ Authorization: `Bearer ${tokens[k]}` });
  const connect = (token) => new Promise((resolve, reject) => {
    const s = ioc(`http://127.0.0.1:${port}`, { auth: { token }, transports: ['websocket'], reconnection: false });
    clients.push(s); s.on('connect', () => resolve(s)); s.on('connect_error', reject);
  });
  const emit = (s, ev, p) => new Promise((r) => s.emit(ev, p, r));
  const once = (s, ev) => new Promise((r) => s.once(ev, r));

  beforeAll(async () => {
    process.env.JWT_SECRET = 'x'.repeat(40);
    process.env.STORAGE_DIR = '/tmp/intellmeet-test-storage';
    await mongoose.connect(URI, { dbName: `intellmeet_test_${sfx}` });
    app = require('../app');
    server = http.createServer(app); require('../sockets').init(server);
    await new Promise((r) => server.listen(0, r)); port = server.address().port;
    for (const k of ['alice', 'bob', 'eve']) {
      const r = await request(app).post('/api/auth/register').send({ name: k, email: `${k}${sfx}@t.dev`, password: 'password123' });
      expect(r.status).toBe(201); tokens[k] = r.body.token; ids[k] = r.body.user.id;
    }
  });
  afterAll(async () => {
    clients.forEach((c) => c.close()); server?.close();
    await mongoose.connection.dropDatabase().catch(() => {}); await mongoose.disconnect();
  });

  it('login works and /me returns the user', async () => {
    const l = await request(app).post('/api/auth/login').send({ email: `alice${sfx}@t.dev`, password: 'password123' });
    expect(l.status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(auth('alice'))).body.user.name).toBe('alice');
    expect((await request(app).post('/api/auth/login').send({ email: `alice${sfx}@t.dev`, password: 'wrongpass1' })).status).toBe(401);
  });

  it('workspace membership + meeting create (instant, invites bob)', async () => {
    const r = await request(app).post('/api/meetings').set(auth('alice')).send({ title: 'Standup', instant: true, invitedEmails: [`bob${sfx}@t.dev`, 'nobody@x.dev'] });
    expect(r.status).toBe(201); meeting = r.body.meeting;
    expect(r.body.unknownEmails).toEqual(['nobody@x.dev']); expect(meeting.status).toBe('live');
  });

  it('outsider gets 403; invitee can read; list is scoped', async () => {
    expect((await request(app).get(`/api/meetings/${meeting.id}`).set(auth('eve'))).status).toBe(403);
    expect((await request(app).get(`/api/meetings/${meeting.id}`).set(auth('bob'))).status).toBe(200);
    expect((await request(app).get('/api/meetings').set(auth('eve'))).body.total).toBe(0);
    expect((await request(app).post('/api/meetings/join').set(auth('eve')).send({ roomCode: meeting.roomCode })).status).toBe(403);
  });

  it('workspace member management is role-checked', async () => {
    const ws = (await request(app).get('/api/workspaces').set(auth('alice'))).body.workspaces[0];
    expect((await request(app).post(`/api/workspaces/${ws.id}/members`).set(auth('eve')).send({ email: `eve${sfx}@t.dev` })).status).toBe(403);
    expect((await request(app).post(`/api/workspaces/${ws.id}/members`).set(auth('alice')).send({ email: `bob${sfx}@t.dev` })).status).toBe(201);
  });

  it('socket: unauthenticated and outsider joins are rejected', async () => {
    await expect(new Promise((res, rej) => { const s = ioc(`http://127.0.0.1:${port}`, { transports: ['websocket'], reconnection: false }); clients.push(s); s.on('connect', res); s.on('connect_error', rej); })).rejects.toBeTruthy();
    const e = await connect(tokens.eve);
    expect((await emit(e, 'room:join', { roomCode: meeting.roomCode })).ok).toBe(false);
  });

  it('two sockets join a room, exchange signaling, and chat (persisted)', async () => {
    const a = await connect(tokens.alice), b = await connect(tokens.bob);
    const ja = await emit(a, 'room:join', { roomCode: meeting.roomCode });
    expect(ja.ok).toBe(true); expect(ja.peers).toHaveLength(0);
    const joined = once(a, 'peer:joined');
    const jb = await emit(b, 'room:join', { roomCode: meeting.roomCode });
    expect(jb.ok).toBe(true); expect(jb.peers).toHaveLength(1);
    const peer = (await joined).peer; expect(peer.socketId).toBe(b.id);

    const off = once(b, 'rtc:offer');
    a.emit('rtc:offer', { to: b.id, data: { sdp: 'fake-sdp' } });
    const got = await off; expect(got.from).toBe(a.id); expect(got.data.sdp).toBe('fake-sdp');
    const ans = once(a, 'rtc:answer'); b.emit('rtc:answer', { to: a.id, data: { sdp: 'ans' } });
    expect((await ans).data.sdp).toBe('ans');

    const msg = once(b, 'chat:message');
    expect((await emit(a, 'chat:send', { text: 'hello team' })).ok).toBe(true);
    expect((await msg).text).toBe('hello team');
    const hist = await request(app).get(`/api/meetings/${meeting.id}/messages`).set(auth('bob'));
    expect(hist.body.messages.map((m) => m.text)).toEqual(['hello team']);
    expect((await request(app).get(`/api/meetings/${meeting.id}/messages`).set(auth('eve'))).status).toBe(403);

    // relay refuses a target outside the room
    const e = await connect(tokens.eve); let leaked = false; e.on('rtc:offer', () => { leaked = true; });
    a.emit('rtc:offer', { to: e.id, data: {} }); await new Promise((r) => setTimeout(r, 200)); expect(leaked).toBe(false);
  });

  it('recording: consent required, type allow-list, filePath never exposed', async () => {
    const buf = Buffer.from('fake-audio-bytes');
    const no = await request(app).post(`/api/meetings/${meeting.id}/recording`).set(auth('alice')).attach('audio', buf, { filename: 'x.webm', contentType: 'audio/webm' });
    expect(no.status).toBe(403); expect(no.body.code).toBe('CONSENT_REQUIRED');
    await request(app).post(`/api/meetings/${meeting.id}/consent`).set(auth('alice'));
    const bad = await request(app).post(`/api/meetings/${meeting.id}/recording`).set(auth('alice')).attach('audio', buf, { filename: 'x.exe', contentType: 'application/x-msdownload' });
    expect(bad.status).toBe(400);
    const ok = await request(app).post(`/api/meetings/${meeting.id}/recording`).set(auth('alice')).attach('audio', buf, { filename: 'x.webm', contentType: 'audio/webm;codecs=opus' });
    expect(ok.status).toBe(201); expect(JSON.stringify(ok.body)).not.toMatch(/filePath|storage/);
  });

  it('tasks are workspace-scoped; rtc-config comes from env', async () => {
    const ws = (await request(app).get('/api/workspaces').set(auth('alice'))).body.workspaces[0];
    const t = await request(app).post('/api/tasks').set(auth('alice')).send({ title: 'Ship it', workspaceId: ws.id, meetingId: meeting.id });
    expect(t.status).toBe(201);
    expect((await request(app).get(`/api/tasks/${t.body.task.id}`).set(auth('eve'))).status).toBe(403);
    expect((await request(app).get('/api/tasks').set(auth('eve'))).body.tasks).toHaveLength(0);
    expect((await request(app).get('/api/meetings/rtc-config').set(auth('bob'))).body.iceServers.length).toBeGreaterThan(0);
  });

  it('host ends meeting; soft delete hides it from everyone', async () => {
    expect((await request(app).post(`/api/meetings/${meeting.id}/end`).set(auth('bob'))).status).toBe(403);
    expect((await request(app).post(`/api/meetings/${meeting.id}/end`).set(auth('alice'))).body.meeting.status).toBe('ended');
    expect((await request(app).delete(`/api/meetings/${meeting.id}`).set(auth('alice'))).status).toBe(200);
    expect((await request(app).get(`/api/meetings/${meeting.id}`).set(auth('alice'))).status).toBe(403);
  });
});
