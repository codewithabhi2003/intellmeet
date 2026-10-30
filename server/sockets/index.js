const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const User = require('../models/User');
const corsOptions = require('../config/cors');

let io = null;
exports.init = (server) => {
  io = new Server(server, { cors: corsOptions(), maxHttpBufferSize: 1e6 });
  // Handshake auth: JWT from auth.token or the httpOnly cookie. Anything else is rejected.
  io.use(async (socket, next) => {
    try {
      const raw = socket.handshake.auth?.token || cookie.parse(socket.handshake.headers.cookie || '').token;
      if (!raw) return next(new Error('unauthorized'));
      const { id } = jwt.verify(raw, process.env.JWT_SECRET);
      const user = await User.findById(id);
      if (!user || !user.isActive) return next(new Error('unauthorized'));
      socket.user = user;
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
exports.getIO = () => io;