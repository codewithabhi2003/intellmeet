const { z } = require('zod');
const Meeting = require('../models/Meeting');
const { getAccessibleMeeting } = require('../services/access/authorizedMeetings');
const svc = require('../services/meetingService');

// roomCode -> Map(socketId -> peer). In-memory: fine for one server process (see README for scaling notes).
const rooms = new Map();
// roomCode -> Map(socketId -> { socketId, userId, name }): people waiting for the host to let them in.
const lobbies = new Map();
exports.rooms = rooms;
exports.lobbies = lobbies;
const MAX = () => parseInt(process.env.MAX_ROOM_PEERS, 10) || 6;
const joinSchema = z.object({ roomCode: z.string().min(6).max(64) });
const mediaSchema = z.object({ audio: z.boolean().optional(), video: z.boolean().optional(), screen: z.boolean().optional(), recording: z.boolean().optional() }).strict();

const hostSocketIds = (roomCode, hostId) => [...(rooms.get(roomCode)?.values() || [])].filter((p) => p.userId === String(hostId)).map((p) => p.socketId);
// Sends the current waiting list to the host (every tab the host has in the room).
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
  const { roomCode, meetingId } = socket.data;
  if (!roomCode) return;
  const room = rooms.get(roomCode);
  socket.leave(`meeting:${roomCode}`);
  socket.data.roomCode = null; socket.data.meetingId = null;
  if (!room) return;
  room.delete(socket.id);
  if (!room.size) rooms.delete(roomCode);
  io.to(`meeting:${roomCode}`).emit('peer:left', { socketId: socket.id, userId: String(socket.user._id) });
  const sameUserStillHere = [...room.values()].some((p) => p.userId === String(socket.user._id));
  if (!sameUserStillHere) await svc.markLeft(meetingId, socket.user._id).catch(() => {});
};
exports.leave = leave;

exports.register = (io, socket) => {
  socket.on('room:join', async (payload, ack = () => {}) => {
    try {
      const { roomCode } = joinSchema.parse(payload || {});
      const meeting = await Meeting.findOne({ roomCode, isDeleted: false });
      const allowed = meeting && (await getAccessibleMeeting(socket.user, meeting._id));   // access recomputed, never cached
      if (!allowed) return ack({ ok: false, code: 'FORBIDDEN', message: 'You do not have access to this meeting.' });
      const c = svc.canJoin(meeting, socket.user._id);                                      // also refuses people the host removed
      if (!c.ok) return ack({ ok: false, code: c.code, message: c.message });
      await leave(io, socket);
      leaveLobby(io, socket);

      const isHost = meeting.hostId.equals(socket.user._id);
      const admitted = meeting.admittedUserIds.some((i) => i.equals(socket.user._id));
      if (meeting.waitingRoom && !isHost && !admitted) {
        // Waiting room: park this socket in the lobby. It is NOT in the meeting room, so it can't hear, signal, chat or react.
        const lobby = lobbies.get(roomCode) || new Map();
        lobby.set(socket.id, { socketId: socket.id, userId: String(socket.user._id), name: socket.user.name });
        lobbies.set(roomCode, lobby);
        socket.data.lobbyRoom = roomCode; socket.data.lobbyHostId = String(meeting.hostId);
        pushLobby(io, roomCode, meeting.hostId);
        return ack({ ok: true, waiting: true });
      }

      const room = rooms.get(roomCode) || new Map();
      if (room.size >= MAX()) return ack({ ok: false, code: 'ROOM_FULL', message: `Mesh calls support up to ${MAX()} participants.` });
      const peer = { socketId: socket.id, userId: String(socket.user._id), name: socket.user.name, media: { audio: true, video: true, screen: false, recording: false } };
      room.set(socket.id, peer); rooms.set(roomCode, room);
      socket.data.roomCode = roomCode; socket.data.meetingId = meeting._id;
      socket.join(`meeting:${roomCode}`);
      await svc.markJoined(meeting, socket.user._id);
      const peers = [...room.values()].filter((p) => p.socketId !== socket.id);
      socket.emit('room:peers', { peers });
      socket.to(`meeting:${roomCode}`).emit('peer:joined', { peer });
      if (isHost) pushLobby(io, roomCode, meeting.hostId);                                   // show the host anyone who was already waiting
      ack({ ok: true, selfId: socket.id, peers });
    } catch (e) {
      ack({ ok: false, code: e.name === 'ZodError' ? 'VALIDATION_ERROR' : 'SERVER_ERROR', message: 'Could not join the room.' });
    }
  });

  socket.on('room:leave', async (_p, ack = () => {}) => { await leave(io, socket); leaveLobby(io, socket); ack({ ok: true }); });

  socket.on('media:state', (payload) => {
    const r = mediaSchema.safeParse(payload || {});
    const room = rooms.get(socket.data.roomCode);
    const peer = room?.get(socket.id);
    if (!r.success || !peer) return;
    Object.assign(peer.media, r.data);
    socket.to(`meeting:${socket.data.roomCode}`).emit('media:state', { socketId: socket.id, media: peer.media });
  });

  socket.on('disconnect', () => { leave(io, socket); leaveLobby(io, socket); });
};