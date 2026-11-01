module.exports = () => ({
  origin: (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((s) => s.trim()),
  credentials: true,
});
