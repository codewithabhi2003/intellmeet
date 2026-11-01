const { ZodError } = require('zod');
const { AIError } = require('../utils/aiErrors');
exports.notFound = (req, res) => res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'Route not found.' });
// eslint-disable-next-line no-unused-vars
exports.errorHandler = (err, req, res, next) => {
  if (err instanceof ZodError) return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Invalid request.' });
  if (err instanceof AIError) return res.status(err.status).json({ success: false, code: err.code, message: err.safeMessage });
  if (err.code === 11000) return res.status(409).json({ success: false, code: 'DUPLICATE', message: 'That value is already in use.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ success: false, code: 'PAYLOAD_TOO_LARGE', message: 'The request is too large.' });
  if (err.name === 'CastError') return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Invalid id.' });
  if (err.name === 'MulterError') return res.status(400).json({ success: false, code: 'AUDIO_TOO_LARGE', message: 'Upload rejected.' });
  // Log the error TYPE and where it came from, never err.message: driver/provider messages can echo user data (emails, questions, transcript text).
  console.error('[error]', err.name, err.code || '', (err.stack || '').split('\n')[1]?.trim() || '');
  const status = err.status && err.status < 500 ? err.status : 500;
  res.status(status).json({ success: false, code: status === 500 ? 'SERVER_ERROR' : 'ERROR', message: status === 500 ? 'Something went wrong.' : err.message });
};
