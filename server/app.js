const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const corsOptions = require('./config/cors');
require('./models');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors(corsOptions()));
app.use(express.json({ limit: '100kb' }));   // every API body is tiny; a small cap also bounds validation work on hostile input
app.use(cookieParser());
app.use(mongoSanitize());
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

app.get('/api/health', (req, res) => res.json({ success: true }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/users', require('./routes/users'));
app.use('/api/workspaces', require('./routes/workspaces'));
app.use('/api/meetings', require('./routes/meetings'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/meetings', require('./routes/transcription'));
app.use('/api/meetings', require('./routes/translation'));
app.use('/api/meetings', require('./routes/summary'));
app.use('/api/languages', require('./routes/languages'));
app.use('/api/meeting-search', require('./routes/meetingSearch'));
// Phase 5+ is the client.

app.use(notFound);
app.use(errorHandler);
module.exports = app;
