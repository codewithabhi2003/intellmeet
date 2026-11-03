
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

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: 'cross-origin',
    },
  })
);
app.use(cors(corsOptions()));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(mongoSanitize());

// Prevent browser and proxy caching of sensitive API responses.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.use(
  '/api',
  rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Root health endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'IntellMeet API is running',
    status: 'healthy',
  });
});

// API health endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API is healthy',
    status: 'healthy',
  });
});

// API routes
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

// Handle unknown routes and errors
app.use(notFound);
app.use(errorHandler);

module.exports = app;
