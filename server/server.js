require('dotenv').config();
const http = require('http');
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('❌ JWT_SECRET must be set in .env and be at least 32 characters.');
  process.exit(1);
}
const { banner } = require('./config/aiConfig');
const connectDB = require('./config/db');
const app = require('./app');

(async () => {
  try {
    await connectDB();
    await require('./scripts/ensureIndexes').run();
    await require('./services/ai/transcriptionService').recoverInterrupted();
    const server = http.createServer(app);
    require('./sockets').init(server);
    const port = process.env.PORT || 5000;
    server.listen(port, () => { console.log(`🚀 IntellMeet API on :${port}`); banner(); });
  } catch (e) {
    console.error('❌ Startup failed:', e.message);
    process.exit(1);
  }
})();
