// Host-only actions: mute someone's microphone/camera, mute everyone, remove someone, and let people in from the waiting room.
// The host is re-read from the database on EVERY action (rights are never cached or taken from the client), and the host
// must currently be in the room.
//
// Honest limit: audio and video travel directly between browsers (WebRTC mesh), so "mute" is a command each participant's browser
// obeys; the server cannot cut a stream. A person can switch their mic back on themselves, as in most meeting apps.
const { z } = require('zod');
const Meeting = require('../models/Meeting');
const presence = require('./presence');

const target = z.object({ socketId: z.string().min(1).max(64) }).strict();
const muteSchema = z.object({ socketId: z.string().min(1).max(64), kind: z.enum(['audio', 'video']) }).strict();
const muteAllSchema = z.object({ kind: z.literal('audio') }).strict();

const asHost = async (socket) => {
  const { meetingId, roomCode } = socket.data;
  if (!meetingId || !roomCode || !presence.rooms.get(roomCode)?.has(socket.id)) return null;
  const m = await Meeting.findById(meetingId).select('hostId isDeleted status roomCode');
  return m && !m.isDeleted && m.status === 'live' && m.hostId.equals(socket.user._id) ? m : null;
};
const fail = (ack, code, message) => ack({ ok: false, code, message });
const guard = (fn) => async (payload, ack = () => {}) => {
  try { await fn(payload || {}, ack); } catch (e) { ack({ ok: false, code: e.name === 'ZodError' ? 'VALIDATION_ERROR' : 'SERVER_ERROR', message: 'That action failed.' }); }
};
const NOT_HOST = 'Only the host can do that.';

exports.register = (io, socket) => {
  socket.on('host:mute', guard(async (p, ack) => {
    const { socketId, kind } = muteSchema.parse(p);
    const m = await asHost(socket); if (!m) return fail(ack, 'FORBIDDEN', NOT_HOST);
    if (socketId === socket.id || !presence.rooms.get(m.roomCode)?.has(socketId)) return fail(ack, 'NOT_FOUND', 'That participant is not in the meeting.');
    io.to(socketId).emit('host:force-mute', { kind });
    ack({ ok: true });
  }));

  socket.on('host:mute-all', guard(async (p, ack) => {
    const { kind } = muteAllSchema.parse(p);
    const m = await asHost(socket); if (!m) return fail(ack, 'FORBIDDEN', NOT_HOST);
    let count = 0;
    presence.rooms.get(m.roomCode).forEach((peer) => { if (peer.userId !== String(m.hostId)) { io.to(peer.socketId).emit('host:force-mute', { kind }); count += 1; } });
    ack({ ok: true, count });
  }));

  socket.on('host:remove', guard(async (p, ack) => {
    const { socketId } = target.parse(p);
    const m = await asHost(socket); if (!m) return fail(ack, 'FORBIDDEN', NOT_HOST);
    const room = presence.rooms.get(m.roomCode);
    const peer = room?.get(socketId);
    if (!peer || peer.userId === String(m.hostId)) return fail(ack, 'NOT_FOUND', 'That participant is not in the meeting.');
    // blocked from rejoining this meeting (canJoin refuses removed users, over HTTP and sockets)
    await Meeting.updateOne({ _id: m._id }, { $addToSet: { removedUserIds: peer.userId }, $pull: { admittedUserIds: peer.userId } });
    const theirs = [...room.values()].filter((x) => x.userId === peer.userId);                // every tab that person has in the room
    for (const t of theirs) {
      const s = io.sockets.sockets.get(t.socketId);
      if (s) { s.emit('host:removed'); await presence.leave(io, s); }
    }
    ack({ ok: true });
  }));

  socket.on('lobby:admit', guard(async (p, ack) => {
    const { socketId } = target.parse(p);
    const m = await asHost(socket); if (!m) return fail(ack, 'FORBIDDEN', NOT_HOST);
    const lobby = presence.lobbies.get(m.roomCode);
    const w = lobby?.get(socketId);
    if (!w) return fail(ack, 'NOT_FOUND', 'That person is no longer waiting.');
    await Meeting.updateOne({ _id: m._id }, { $addToSet: { admittedUserIds: w.userId } });   // stays admitted if they refresh or reconnect
    lobby.delete(socketId); if (!lobby.size) presence.lobbies.delete(m.roomCode);
    const s = io.sockets.sockets.get(socketId); if (s) { s.data.lobbyRoom = null; s.data.lobbyHostId = null; }
    io.to(socketId).emit('lobby:admitted');                                                  // their browser then joins the room normally
    presence.pushLobby(io, m.roomCode, m.hostId);
    ack({ ok: true });
  }));

  socket.on('lobby:deny', guard(async (p, ack) => {
    const { socketId } = target.parse(p);
    const m = await asHost(socket); if (!m) return fail(ack, 'FORBIDDEN', NOT_HOST);
    const lobby = presence.lobbies.get(m.roomCode);
    if (!lobby?.has(socketId)) return fail(ack, 'NOT_FOUND', 'That person is no longer waiting.');
    lobby.delete(socketId); if (!lobby.size) presence.lobbies.delete(m.roomCode);
    const s = io.sockets.sockets.get(socketId); if (s) { s.data.lobbyRoom = null; s.data.lobbyHostId = null; }
    io.to(socketId).emit('lobby:denied');
    presence.pushLobby(io, m.roomCode, m.hostId);
    ack({ ok: true });
  }));
};