const { Server } = require('socket.io');
const cookie = require('cookie');
const { userFromToken } = require('../utils/session');
const corsOptions = require('../config/cors');

let io = null;
exports.init = (server) => {
  io = new Server(server, { cors: corsOptions(), maxHttpBufferSize: 1e6 });
  // Handshake auth: JWT from auth.token or the httpOnly cookie. Anything else is rejected.
  io.use(async (socket, next) => {
    try {
      const raw = socket.handshake.auth?.token || cookie.parse(socket.handshake.headers.cookie || '').token;
      const user = await userFromToken(raw);                        // same rules as HTTP, including revoked sessions
      if (!user) return next(new Error('unauthorized'));
      socket.user = user;
      socket.join(`user:${user._id}`);                              // lets us cut every live connection of this user when their sessions are revoked
      next();
    } catch { next(new Error('unauthorized')); }
  });
  io.on('connection', (socket) => {
    require('./presence').register(io, socket);
    require('./signaling').register(io, socket);
    require('./chat').register(io, socket);
    require('./reactions').register(io, socket);
    require('./host').register(io, socket);
  });
  return io;
};
// Used by later phases for transcript:status, translation:status, summary:status and meeting:ended.
exports.emitToRoom = (roomCode, event, payload) => { if (io) io.to(`meeting:${roomCode}`).emit(event, payload); };
// Tells everyone still waiting in the lobby that the meeting has ended, and clears the lobby.
exports.closeLobby = (roomCode, meetingId) => {
  const { lobbies } = require('./presence');
  lobbies.get(roomCode)?.forEach((w) => io?.to(w.socketId).emit('meeting:ended', { meetingId: String(meetingId) }));
  lobbies.delete(roomCode);
};
// "Log out of all devices" / password change: drop every live socket of that user right away.
exports.revokeUserSockets = (userId) => { io?.in(`user:${userId}`).disconnectSockets(true); };
exports.getIO = () => io;