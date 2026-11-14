const { z } = require('zod');
const mongoose = require('mongoose');
const Meeting = require('../models/Meeting');
const { canJoinLive } = require('../services/access/authorizedMeetings');
const svc = require('../services/meetingService');

// roomCode -> Map(socketId -> peer). In-memory: fine for one server process (see README for scaling notes).
const rooms = new Map();
// roomCode -> Map(socketId -> { socketId, userId, name }): people waiting for the host to let them in.
const lobbies = new Map();
exports.rooms = rooms;
exports.lobbies = lobbies;
const MAX = () => parseInt(process.env.MAX_ROOM_PEERS, 10) || 6;
const MAX_ATTENDEES = () => parseInt(process.env.MAX_SEMINAR_ATTENDEES, 10) || 15;   // a seminar is a star: the host sends a separate video to each attendee
const joinSchema = z.object({ roomCode: z.string().min(6).max(64) });
const mediaSchema = z.object({ audio: z.boolean().optional(), video: z.boolean().optional(), screen: z.boolean().optional(), recording: z.boolean().optional() }).strict();

const hostSocketIds = (roomCode, hostId) => [...(rooms.get(roomCode)?.values() || [])].filter((p) => p.userId === String(hostId)).map((p) => p.socketId);
// Sends the current waiting list to the host (every tab the host has in the room).
const hostSockets = (roomCode) => [...(rooms.get(roomCode)?.values() || [])].filter((p) => p.isHost).map((p) => p.socketId);
const pushLobby = (io, roomCode, hostId) => {
  const waiting = [...(lobbies.get(roomCode)?.values() || [])];
  hostSocketIds(roomCode, hostId).forEach((id) => io.to(id).emit('lobby:update', { waiting }));
};
exports.pushLobby = pushLobby;

const leaveLobby = (io, socket) => {
  const { lobbyRoom, lobbyHostId } = socket.data;
  if (!lobbyRoom) return;
  const lobby = lobbies.get(lobbyRoom);
  lobby?.delete(socket.id);
  if (lobby && !lobby.size) lobbies.delete(lobbyRoom);
  socket.data.lobbyRoom = null; socket.data.lobbyHostId = null;
  pushLobby(io, lobbyRoom, lobbyHostId);
};

const leave = async (io, socket) => {
  const { roomCode, meetingId, isHost, seminar } = socket.data;
  if (!roomCode) return;
  const room = rooms.get(roomCode);
  const attendee = seminar && !isHost;
  socket.leave(`meeting:${roomCode}`);
  socket.data.roomCode = null; socket.data.meetingId = null; socket.data.isHost = false; socket.data.seminar = false;
  if (!room) return;
  room.delete(socket.id);
  const gone = { socketId: socket.id, userId: String(socket.user._id) };
  if (!room.size) rooms.delete(roomCode);
  // in a seminar, attendees are invisible to each other: only the host is told that an attendee left
  if (attendee) hostSockets(roomCode).forEach((id) => io.to(id).emit('peer:left', gone));
  else io.to(`meeting:${roomCode}`).emit('peer:left', gone);
  const sameUserStillHere = [...room.values()].some((p) => p.userId === String(socket.user._id));
  if (!sameUserStillHere && !attendee) await svc.markLeft(meetingId, socket.user._id).catch(() => {});
};
exports.leave = leave;

// ---- stale sessions ---------------------------------------------------------------------------------------------------------------
// Every time a phone or a laptop loses its signal and reconnects, it gets a NEW socket id, while the OLD socket can stay in the room for
// up to ~45 s (until Socket.IO notices that the connection is dead). Everybody else then sees the same person two or three times as
// "Connecting…" tiles, and those leftovers also use up places in the room.
// So when a person joins, their OLDER sessions are asked "are you still there?". A session that does not answer is removed on the spot.
// A second tab or device that still answers is left alone. Only sessions that said "presence:hello" are ever judged (the client sends it
// after joining), so an older client that cannot answer is never thrown out by mistake.
const PROBE_MS = 1500;
const socketOf = (io, id) => io.sockets?.sockets?.get?.(id) || io.sockets?.connected?.[id] || null;
const isAlive = (io, id) => new Promise((resolve) => {
  const s = socketOf(io, id);
  if (!s || s.connected === false) return resolve(false);          // the socket is already gone
  if (!s.data?.canPing) return resolve(true);                      // cannot be asked: never judged
  let done = false, timer = null;
  const finish = (v) => { if (done) return; done = true; clearTimeout(timer); resolve(v); };
  timer = setTimeout(() => finish(false), PROBE_MS);
  try { s.emit('presence:ping', () => finish(true)); } catch { finish(false); }
});

const evictSession = (io, roomCode, id, seminar) => {
  const room = rooms.get(roomCode);
  const peer = room?.get(id);
  if (!peer) return;
  room.delete(id);
  if (!room.size) rooms.delete(roomCode);
  const s = socketOf(io, id);
  if (s) {
    s.leave(`meeting:${roomCode}`);
    s.data.roomCode = null; s.data.meetingId = null; s.data.isHost = false; s.data.seminar = false;
    s.emit('presence:evicted');                                    // if that tab was only frozen and wakes up, it joins again by itself
  }
  const gone = { socketId: id, userId: peer.userId };
  if (seminar && !peer.isHost) hostSockets(roomCode).forEach((h) => io.to(h).emit('peer:left', gone));
  else io.to(`meeting:${roomCode}`).emit('peer:left', gone);
};

const dropDeadSessions = async (io, roomCode, userId, exceptId, seminar) => {
  const room = rooms.get(roomCode);
  if (!room) return;
  const mine = [...room.values()].filter((p) => p.userId === userId && p.socketId !== exceptId);
  if (!mine.length) return;
  const alive = await Promise.all(mine.map((p) => isAlive(io, p.socketId)));
  mine.forEach((p, i) => { if (!alive[i]) evictSession(io, roomCode, p.socketId, seminar); });
};

// The same for the waiting room: one person must not appear twice in the host's "waiting" list.
const dropDeadWaiting = async (io, roomCode, userId, exceptId) => {
  const lobby = lobbies.get(roomCode);
  if (!lobby) return;
  const mine = [...lobby.values()].filter((w) => w.userId === userId && w.socketId !== exceptId);
  if (!mine.length) return;
  const alive = await Promise.all(mine.map((w) => isAlive(io, w.socketId)));
  mine.forEach((w, i) => {
    if (alive[i]) return;
    lobby.delete(w.socketId);
    const s = socketOf(io, w.socketId);
    if (s) { s.data.lobbyRoom = null; s.data.lobbyHostId = null; }
  });
};

// The profile picture shown in a tile while someone's camera is off. Read fresh on every join, so a new picture is used right away.
const avatarOf = async (socket) => {
  try {
    const u = await mongoose.models.User?.findById(socket.user._id).select('avatarUrl').lean();
    if (u) return u.avatarUrl || null;
  } catch { /* fall back to what the handshake loaded */ }
  return socket.user.avatarUrl || null;
};

exports.register = (io, socket) => {
  socket.on('room:join', async (payload, ack = () => {}) => {
    try {
      const { roomCode } = joinSchema.parse(payload || {});
      const meeting = await Meeting.findOne({ roomCode, isDeleted: false });
      const allowed = meeting && (await canJoinLive(socket.user, meeting));                 // LIVE access, recomputed, never cached (it grants no records)
      if (!allowed) return ack({ ok: false, code: 'FORBIDDEN', message: 'You do not have access to this meeting.' });
      const c = svc.canJoin(meeting, socket.user._id);                                      // also refuses people the host removed
      if (!c.ok) return ack({ ok: false, code: c.code, message: c.message });
      await leave(io, socket);
      leaveLobby(io, socket);

      const isHost = meeting.hostId.equals(socket.user._id);
      const seminar = !!meeting.seminar;
      const attendee = seminar && !isHost;
      const admitted = meeting.admittedUserIds.some((i) => i.equals(socket.user._id));
      const userId = String(socket.user._id);
      if (meeting.waitingRoom && !isHost && !admitted) {
        // Waiting room: park this socket in the lobby. It is NOT in the meeting room, so it can't hear, signal, chat or react.
        await dropDeadWaiting(io, roomCode, userId, socket.id);
        const lobby = lobbies.get(roomCode) || new Map();
        lobby.set(socket.id, { socketId: socket.id, userId, name: socket.user.name });
        lobbies.set(roomCode, lobby);
        socket.data.lobbyRoom = roomCode; socket.data.lobbyHostId = String(meeting.hostId);
        pushLobby(io, roomCode, meeting.hostId);
        return ack({ ok: true, waiting: true });
      }

      await dropDeadSessions(io, roomCode, userId, socket.id, seminar);                       // leftovers of this person's old connections
      const avatarUrl = await avatarOf(socket);
      // no "await" between the capacity check and room.set below, so two people joining at the same moment cannot both squeeze in
      const room = rooms.get(roomCode) || new Map();
      if (seminar ? room.size >= 1 + MAX_ATTENDEES() : room.size >= MAX())
        return ack({ ok: false, code: 'ROOM_FULL', message: seminar ? `This seminar is full (${MAX_ATTENDEES()} attendees).` : `Mesh calls support up to ${MAX()} participants.` });
      const peer = { socketId: socket.id, userId, name: socket.user.name, isHost,
        media: { audio: !attendee, video: !attendee, screen: false, recording: false },        // seminar attendees never have camera or microphone
        ...(avatarUrl ? { avatarUrl } : {}) };
      room.set(socket.id, peer); rooms.set(roomCode, room);
      socket.data.roomCode = roomCode; socket.data.meetingId = meeting._id; socket.data.isHost = isHost; socket.data.seminar = seminar;
      socket.join(`meeting:${roomCode}`);
      if (!attendee) await svc.markJoined(meeting, socket.user._id);                          // seminar attendees are not recorded as participants
      // a seminar attendee only ever learns about the host; attendees are hidden from each other and visible to the host alone
      const peers = [...room.values()].filter((p) => p.socketId !== socket.id && (!attendee || p.isHost));
      socket.emit('room:peers', { peers });
      if (attendee) hostSockets(roomCode).forEach((id) => io.to(id).emit('peer:joined', { peer }));
      else socket.to(`meeting:${roomCode}`).emit('peer:joined', { peer });
      if (isHost) pushLobby(io, roomCode, meeting.hostId);                                   // show the host anyone who was already waiting
      ack({ ok: true, selfId: socket.id, peers });
    } catch (e) {
      ack({ ok: false, code: e.name === 'ZodError' ? 'VALIDATION_ERROR' : 'SERVER_ERROR', message: 'Could not join the room.' });
    }
  });

  // The client says it can answer "presence:ping" (see useWebRTC). Only such sessions can be told apart from a dead connection.
  socket.on('presence:hello', () => { socket.data.canPing = true; });

  socket.on('room:leave', async (_p, ack = () => {}) => { await leave(io, socket); leaveLobby(io, socket); ack({ ok: true }); });

  socket.on('media:state', (payload) => {
    if (socket.data.seminar && !socket.data.isHost) return;                                   // attendees have no media to report
    const r = mediaSchema.safeParse(payload || {});
    const room = rooms.get(socket.data.roomCode);
    const peer = room?.get(socket.id);
    if (!r.success || !peer) return;
    Object.assign(peer.media, r.data);
    socket.to(`meeting:${socket.data.roomCode}`).emit('media:state', { socketId: socket.id, media: peer.media });
  });

  socket.on('disconnect', () => { leave(io, socket); leaveLobby(io, socket); });
};