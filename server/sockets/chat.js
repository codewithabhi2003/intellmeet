const { z } = require('zod');
const ChatMessage = require('../models/ChatMessage');
const { getAccessibleMeeting } = require('../services/access/authorizedMeetings');
const schema = z.object({ text: z.string().trim().min(1).max(2000) });

exports.register = (io, socket) => {
  let stamps = [];
  socket.on('chat:send', async (payload, ack = () => {}) => {
    try {
      const { roomCode, meetingId } = socket.data;
      if (!roomCode) return ack({ ok: false, code: 'FORBIDDEN', message: 'Join the meeting first.' });
      const now = Date.now();
      stamps = stamps.filter((t) => now - t < 5000);
      if (stamps.length >= 10) return ack({ ok: false, code: 'RATE_LIMITED', message: 'You are sending messages too quickly.' });
      stamps.push(now);
      const { text } = schema.parse(payload || {});
      if (!(await getAccessibleMeeting(socket.user, meetingId))) return ack({ ok: false, code: 'FORBIDDEN', message: 'Access revoked.' });
      const m = await ChatMessage.create({ meetingId, senderId: socket.user._id, text });
      const msg = { id: m._id, meetingId, sender: { id: socket.user._id, name: socket.user.name }, text: m.text, createdAt: m.createdAt };
      io.to(`meeting:${roomCode}`).emit('chat:message', msg);
      ack({ ok: true, id: m._id });
    } catch (e) {
      ack({ ok: false, code: e.name === 'ZodError' ? 'VALIDATION_ERROR' : 'SERVER_ERROR', message: 'Message not sent.' });
    }
  });
};
