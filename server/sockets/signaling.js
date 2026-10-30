const { z } = require('zod');
const { rooms } = require('./presence');
const schema = z.object({ to: z.string().min(1).max(64), data: z.any() });

// Relays offer/answer/ice only between sockets that are in the same room as the sender.
exports.register = (io, socket) => {
  ['rtc:offer', 'rtc:answer', 'rtc:ice'].forEach((ev) => {
    socket.on(ev, (payload) => {
      const r = schema.safeParse(payload || {});
      const room = rooms.get(socket.data.roomCode);
      if (!r.success || !room || !room.has(socket.id) || !room.has(r.data.to)) return;
      io.to(r.data.to).emit(ev, { from: socket.id, userId: String(socket.user._id), data: r.data.data });
    });
  });
};
