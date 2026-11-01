const mongoose = require('mongoose');
module.exports = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri || /^your_/.test(uri)) throw new Error('MONGO_URI is not set in .env');
  mongoose.set('strictQuery', true);
  mongoose.set('autoIndex', false); // indexes are created explicitly by scripts/ensureIndexes.js at startup
  await mongoose.connect(uri);
  console.log('✅ MongoDB connected');
};
