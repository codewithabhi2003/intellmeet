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
      if (socket.data.seminar) {
        const me = room.get(socket.id), to = room.get(r.data.to);
        if (!me.isHost && !to.isHost) return;                                                    // a seminar is a star: attendees cannot signal each other
        // An attendee may only RECEIVE. Any SDP of theirs that offers to send audio/video is dropped (the host's own offers are send-only,
        // so a modified client could not send media anyway; this is a second lock).
        if (!me.isHost && ev !== 'rtc:ice' && /a=(sendrecv|sendonly)/i.test(String(r.data.data?.sdp || ''))) return;
      }
      io.to(r.data.to).emit(ev, { from: socket.id, userId: String(socket.user._id), data: r.data.data });
    });
  });
};