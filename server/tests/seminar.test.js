// Seminar mode: open-link attendees, host-only records, attendee privacy, receive-only signaling. Real DB + real sockets.
// Set TEST_MONGO_URI to run.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import http from 'http';
import mongoose from 'mongoose';
import { io as ioc } from 'socket.io-client';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const URI = process.env.TEST_MONGO_URI;
const run = URI ? describe : describe.skip;

const SDP = (dir) => `v=0\r\nm=audio 9 RTP/AVP 0\r\na=${dir}\r\n`;

run('seminar mode', () => {
  const sfx = Date.now();
  let app, server, port, T = {}, ID = {}, N, SO, SC, M;
  const clients = [];
  const H = (k) => ({ Authorization: `Bearer ${T[k]}` });
  const email = (k) => `${k}${sfx}@t.dev`;
  const connect = (k) => new Promise((resolve, reject) => { const s = ioc(`http://127.0.0.1:${port}`, { auth: { token: T[k] }, transports: ['websocket'], reconnection: false }); clients.push(s); s.on('connect', () => resolve(s)); s.on('connect_error', reject); });
  const emit = (s, ev, p) => new Promise((r) => s.emit(ev, p, r));
  const join = (s, code) => emit(s, 'room:join', { roomCode: code });
  const collect = (s, ev) => { const got = []; s.on(ev, (p) => got.push(p)); return got; };
  const next = (s, ev, ms = 2500) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error(`no ${ev}`)), ms); s.once(ev, (p) => { clearTimeout(t); res(p); }); });
  const quiet = (ms = 250) => new Promise((r) => setTimeout(r, ms));
  const mk = async (body) => (await request(app).post('/api/meetings').set(H('ana')).send({ instant: true, ...body })).body.meeting;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'x'.repeat(40); process.env.STORAGE_DIR = '/tmp/intellmeet-seminar-storage';
    mongoose.set('autoIndex', false);
    await mongoose.connect(URI, { dbName: `intellmeet_seminar_${sfx}` });
    app = require('../app'); server = http.createServer(app); require('../sockets').init(server);
    await new Promise((r) => server.listen(0, r)); port = server.address().port;
    await require('../scripts/ensureIndexes').run();
    M = { Transcript: require('../models/Transcript'), Segment: require('../models/TranscriptSegment'), Summary: require('../models/Summary'), Task: require('../models/Task'), Meeting: require('../models/Meeting') };
    for (const k of ['ana', 'bob', 'carol', 'olga']) { const r = await request(app).post('/api/auth/register').send({ name: k, email: email(k), password: 'password123' }); T[k] = r.body.token; ID[k] = r.body.user.id; }
    const ws = (await request(app).get('/api/workspaces').set(H('ana'))).body.workspaces[0];
    await request(app).post(`/api/workspaces/${ws.id}/members`).set(H('ana')).send({ email: email('bob') });          // bob: a workspace member; olga: nobody
    N = await mk({ title: 'Normal', invitedEmails: [email('carol')] });
    SO = await mk({ title: 'Open seminar', seminar: true, openLink: true });
    SC = await mk({ title: 'Closed seminar', seminar: true, invitedEmails: [email('carol')] });
    for (const m of [SO, SC]) {
      await M.Transcript.create({ meetingId: m.id, workspaceId: m.workspaceId, status: 'completed', sourceLanguage: 'en', segmentCount: 1 });
      await M.Segment.create({ meetingId: m.id, workspaceId: m.workspaceId, idx: 0, start: 0, end: 1, text: 'ZEBRA-SEMINAR-NOTES', language: 'en' });
      await M.Summary.create({ meetingId: m.id, language: 'en', overview: 'ZEBRA overview', sourceLanguage: 'en' });
      await M.Task.create({ title: `ZEBRA task ${m.title}`, workspaceId: m.workspaceId, meetingId: m.id, source: 'ai', createdBy: ID.ana });
    }
  });
  afterEach(async () => { clients.splice(0).forEach((c) => c.close()); await quiet(150); });
  afterAll(async () => { server?.close(); await mongoose.connection.dropDatabase().catch(() => {}); await mongoose.disconnect(); });

  it('an outsider cannot join a normal meeting or a closed seminar, but CAN attend an open-link seminar (and is not recorded as a participant)', async () => {
    expect(N.seminar).toBe(false); expect(SO).toMatchObject({ seminar: true, openLink: true, visibility: 'private' }); expect(SC).toMatchObject({ seminar: true, openLink: false });
    const viaHttp = (code, k = 'olga') => request(app).post('/api/meetings/join').set(H(k)).send({ roomCode: code });
    const normal = await viaHttp(N.roomCode); expect(normal.status).toBe(403);
    const wrong = await viaHttp('aaaaaaaaaaaa'); expect(wrong.status).toBe(403); expect(wrong.body.message).toBe(normal.body.message);   // a wrong code and "not allowed" look the same
    expect((await viaHttp(SC.roomCode)).status).toBe(403);
    expect((await join(await connect('olga'), N.roomCode)).code).toBe('FORBIDDEN');
    const open = await viaHttp(SO.roomCode); expect(open.status).toBe(200);
    expect(open.body.meeting).toMatchObject({ seminar: true, title: 'Open seminar' });
    for (const field of ['participants', 'invitedUserIds', 'workspaceId', 'recordingConsent']) expect(open.body.meeting, field).not.toHaveProperty(field);   // a minimal view
    expect((await join(await connect('olga'), SO.roomCode)).ok).toBe(true);
    expect((await viaHttp(SC.roomCode, 'carol')).status).toBe(200);                                    // an invited person may attend the closed seminar
    expect((await M.Meeting.findById(SO.id)).participants.map((p) => String(p.userId))).not.toContain(ID.olga);
    expect((await request(app).post('/api/meetings/join').send({ roomCode: SO.roomCode })).status).toBe(401);   // an IntellMeet account is still required
  });

  it('a seminar attendee can read the live chat, but can reach NO record (transcript, summary, tasks, search, details, recording)', async () => {
    const olga = H('olga');
    for (const [m, path, body] of [['get', ''], ['get', '/transcript'], ['get', '/transcript/status'], ['get', '/translations'], ['get', '/summary'], ['post', '/summary', { language: 'en' }], ['post', '/transcription', {}], ['post', '/consent'], ['post', '/end'], ['post', '/recording']]) {
      const r = await request(app)[m](`/api/meetings/${SO.id}${path}`).set(olga).send(body); expect(r.status, `${m} ${path}`).toBe(403); expect(JSON.stringify(r.body)).not.toMatch(/ZEBRA|Open seminar/);
    }
    expect((await request(app).get(`/api/meetings/${SO.id}/messages`).set(olga)).status).toBe(200);        // chat is part of the live room
    expect((await request(app).get('/api/meetings').set(olga)).body.meetings).toEqual([]);
    expect((await request(app).get(`/api/tasks?meetingId=${SO.id}`).set(olga)).body.tasks).toEqual([]);
    const s = await request(app).post('/api/meeting-search/query').set(olga).send({ question: 'ZEBRA-SEMINAR-NOTES' }); expect(s.body.mode).toBe('insufficient'); expect(JSON.stringify(s.body)).not.toMatch(/ZEBRA/);
    expect((await request(app).get(`/api/meetings/${N.id}/messages`).set(olga)).status).toBe(403);       // but chat history of a NORMAL meeting is still closed to outsiders
  });

  it('the transcript, summary and action items of a seminar are the HOST\'s alone: not the invited, not the workspace, not even attendees', async () => {
    for (const [who, m] of [['carol', SC], ['bob', SO], ['bob', SC]]) {
      expect((await request(app).get(`/api/meetings/${m.id}/transcript`).set(H(who))).status, `${who} transcript ${m.title}`).toBe(403);
      expect((await request(app).get(`/api/meetings/${m.id}/summary?language=en`).set(H(who))).status).toBe(403);
    }
    for (const m of [SO, SC]) {
      expect((await request(app).get(`/api/meetings/${m.id}/transcript`).set(H('ana'))).body.segments[0].text).toBe('ZEBRA-SEMINAR-NOTES');
      expect((await request(app).get(`/api/meetings/${m.id}/summary?language=en`).set(H('ana'))).body.summary.overview).toBe('ZEBRA overview');
    }
    expect((await request(app).get('/api/tasks').set(H('ana'))).body.tasks.map((t) => t.title)).toEqual(expect.arrayContaining(['ZEBRA task Open seminar', 'ZEBRA task Closed seminar']));
    for (const who of ['carol', 'bob']) expect((await request(app).get('/api/tasks').set(H(who))).body.tasks.map((t) => t.title).join()).not.toMatch(/ZEBRA/);
    expect((await join(await connect('bob'), SC.roomCode)).code).toBe('FORBIDDEN');                   // a workspace member can't attend a CLOSED (private) seminar...
    expect((await join(await connect('bob'), SO.roomCode)).ok).toBe(true);                            // ...but can attend an open one, as an attendee
  });

  it('attendees are hidden from each other and have no camera or microphone; only the host sees who is there', async () => {
    const olga = await connect('olga'), bob = await connect('bob');
    const a1 = await join(olga, SO.roomCode), a2 = await join(bob, SO.roomCode); expect(a1.peers).toEqual([]); expect(a2.peers).toEqual([]);   // the host has not arrived yet
    const olgaSees = collect(olga, 'peer:joined'), bobSees = collect(bob, 'peer:joined'), bobLeft = collect(bob, 'peer:left');
    const ana = await connect('ana'); const hostJoin = await join(ana, SO.roomCode);
    expect(hostJoin.peers.map((p) => p.name).sort()).toEqual(['bob', 'olga']);                       // the host sees everyone...
    expect(hostJoin.peers.every((p) => !p.media.audio && !p.media.video)).toBe(true);               // ...with their camera and microphone off
    await quiet(); expect(olgaSees.map((e) => e.peer.name)).toEqual(['ana']); expect(bobSees.map((e) => e.peer.name)).toEqual(['ana']); expect(olgaSees[0].peer.isHost).toBe(true);
    const carol = await connect('carol'); const c = await join(carol, SO.roomCode);
    expect(c.peers.map((p) => p.name)).toEqual(['ana']);                                            // a late attendee learns only the host
    await quiet(); expect(bobSees.map((e) => e.peer.name)).toEqual(['ana']);                        // and the others are not told about them
    const leaving = next(ana, 'peer:left'); olga.close(); await leaving; await quiet(); expect(bobLeft).toEqual([]);   // an attendee leaving is only the host's business
    const mediaAtHost = collect(ana, 'media:state'); carol.emit('media:state', { audio: true, video: true }); await quiet();
    expect(mediaAtHost).toEqual([]);                                                               // an attendee cannot announce a microphone or camera
  });

  it('a seminar is a star: attendees can only RECEIVE from the host and can never signal each other', async () => {
    const ana = await connect('ana'), olga = await connect('olga'), bob = await connect('bob');
    for (const s of [ana, olga, bob]) await join(s, SO.roomCode);
    const atAna = collect(ana, 'rtc:offer'), atBob = collect(bob, 'rtc:offer'), atBobIce = collect(bob, 'rtc:ice'), answersAtAna = collect(ana, 'rtc:answer'), iceAtAna = collect(ana, 'rtc:ice'), atOlga = collect(olga, 'rtc:offer');
    olga.emit('rtc:offer', { to: bob.id, data: { type: 'offer', sdp: SDP('recvonly') } }); olga.emit('rtc:ice', { to: bob.id, data: { candidate: 'x' } });   // attendee -> attendee
    olga.emit('rtc:offer', { to: ana.id, data: { type: 'offer', sdp: SDP('sendrecv') } });                       // attendee tries to SEND media
    olga.emit('rtc:offer', { to: ana.id, data: { type: 'offer', sdp: SDP('sendonly') } });
    await quiet(); expect(atBob).toEqual([]); expect(atBobIce).toEqual([]); expect(atAna).toEqual([]);
    olga.emit('rtc:offer', { to: ana.id, data: { type: 'offer', sdp: SDP('recvonly') } }); olga.emit('rtc:ice', { to: ana.id, data: { candidate: 'y' } });   // receive-only is fine
    await quiet(); expect(atAna).toHaveLength(1); expect(atAna[0].from).toBe(olga.id); expect(iceAtAna).toHaveLength(1);
    ana.emit('rtc:offer', { to: olga.id, data: { type: 'offer', sdp: SDP('sendonly') } });                           // host -> attendee
    await quiet(); expect(atOlga).toHaveLength(1);
    olga.emit('rtc:answer', { to: ana.id, data: { type: 'answer', sdp: SDP('sendrecv') } });                         // an answer that would send media is dropped
    await quiet(); expect(answersAtAna).toEqual([]);
    olga.emit('rtc:answer', { to: ana.id, data: { type: 'answer', sdp: SDP('recvonly') } }); await quiet(); expect(answersAtAna).toHaveLength(1);
  });

  it('normal meetings are unchanged: everyone still signals everyone, with media in both directions', async () => {
    const ana = await connect('ana'), carol = await connect('carol');
    await join(ana, N.roomCode); await join(carol, N.roomCode);
    const got = collect(ana, 'rtc:offer'); carol.emit('rtc:offer', { to: ana.id, data: { type: 'offer', sdp: SDP('sendrecv') } }); await quiet();
    expect(got).toHaveLength(1);
  });

  it('attendees can chat and react, everyone hears them, and they have none of the host\'s powers', async () => {
    const ana = await connect('ana'), olga = await connect('olga'); await join(ana, SO.roomCode); await join(olga, SO.roomCode);
    const toAna = next(ana, 'chat:message'), toOlga = next(olga, 'chat:message');
    expect((await emit(olga, 'chat:send', { text: 'great talk' })).ok).toBe(true);
    expect((await toAna).text).toBe('great talk'); expect((await toOlga).text).toBe('great talk');
    const react = next(ana, 'reaction:received'); expect((await emit(olga, 'reaction:send', { emoji: '👏' })).ok).toBe(true); expect((await react).name).toBe('olga');
    const hist = await request(app).get(`/api/meetings/${SO.id}/messages`).set(H('olga')); expect(hist.body.messages.map((m) => m.text)).toContain('great talk');
    for (const [ev, p] of [['host:mute', { socketId: ana.id, kind: 'audio' }], ['host:mute-all', { kind: 'audio' }], ['host:remove', { socketId: ana.id }], ['lobby:admit', { socketId: ana.id }]])
      expect((await emit(olga, ev, p)).code, ev).toBe('FORBIDDEN');
  });

  it('a seminar has an attendee limit (the host sends a separate video to each one)', async () => {
    const old = process.env.MAX_SEMINAR_ATTENDEES; process.env.MAX_SEMINAR_ATTENDEES = '2';
    try {
      const SF = await mk({ title: 'Small', seminar: true, openLink: true });
      const ana = await connect('ana'); expect((await join(ana, SF.roomCode)).ok).toBe(true);
      expect((await join(await connect('olga'), SF.roomCode)).ok).toBe(true); expect((await join(await connect('bob'), SF.roomCode)).ok).toBe(true);
      const full = await join(await connect('carol'), SF.roomCode); expect(full.ok).toBe(false); expect(full.code).toBe('ROOM_FULL'); expect(full.message).toMatch(/seminar is full \(2 attendees\)/);
    } finally { if (old === undefined) delete process.env.MAX_SEMINAR_ATTENDEES; else process.env.MAX_SEMINAR_ATTENDEES = old; }
  });

  it('an open link only counts for seminars, and a seminar is always private (records are the host\'s)', async () => {
    const notSeminar = await mk({ title: 'Plain', openLink: true }); expect(notSeminar).toMatchObject({ seminar: false, openLink: false });
    expect((await request(app).post('/api/meetings/join').set(H('olga')).send({ roomCode: notSeminar.roomCode })).status).toBe(403);
    expect((await mk({ title: 'Shared seminar', seminar: true, visibility: 'workspace' })).visibility).toBe('private');
  });
});