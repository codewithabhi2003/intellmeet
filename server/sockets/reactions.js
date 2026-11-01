// Ephemeral meeting reactions (floating emojis). Nothing is stored: the event is validated and relayed to the room.
const crypto = require('crypto');
const { z } = require('zod');
const { rooms } = require('./presence');
const { getAccessibleMeeting } = require('../services/access/authorizedMeetings');

// The ONLY emojis accepted. Clients render just these, and nothing else is ever relayed, so a reaction can never carry free text.
// Keep in sync with client/src/lib/reactions.js.
const ALLOWED = ['👍', '👏', '❤️', '😂', '😮', '🎉', '🙏', '🔥'];
exports.ALLOWED_REACTIONS = ALLOWED;

const schema = z.object({ emoji: z.string().refine((e) => ALLOWED.includes(e)) }).strict();
const WINDOW_MS = 4000, MAX_PER_WINDOW = 8;

exports.register = (io, socket) => {
  let stamps = [];
  socket.on('reaction:send', async (payload, ack = () => {}) => {
    try {
      const { roomCode, meetingId } = socket.data;
      if (!roomCode || !rooms.get(roomCode)?.has(socket.id)) return ack({ ok: false, code: 'FORBIDDEN', message: 'Join the meeting first.' });
      const now = Date.now();
      stamps = stamps.filter((t) => now - t < WINDOW_MS);
      if (stamps.length >= MAX_PER_WINDOW) return ack({ ok: false, code: 'RATE_LIMITED', message: 'You are reacting too quickly.' });
      stamps.push(now);                                    // invalid attempts count too
      const { emoji } = schema.parse(payload || {});
      if (!(await getAccessibleMeeting(socket.user, meetingId))) return ack({ ok: false, code: 'FORBIDDEN', message: 'Access revoked.' });   // permissions are never cached
      io.to(`meeting:${roomCode}`).emit('reaction:received', { id: crypto.randomUUID(), emoji, socketId: socket.id, userId: String(socket.user._id), name: socket.user.name });
      ack({ ok: true });
    } catch (e) {
      ack({ ok: false, code: e.name === 'ZodError' ? 'VALIDATION_ERROR' : 'SERVER_ERROR', message: 'Reaction not sent.' });
    }
  });
};
