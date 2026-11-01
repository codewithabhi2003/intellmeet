// Creates all indexes (autoIndex is off). Runs automatically at startup; also `npm run db:ensure-indexes`.
const mongoose = require('mongoose');
require('../models');
exports.run = async () => {
  for (const [name, Model] of Object.entries(mongoose.models)) {
    try { await Model.createIndexes(); }
    catch (e) { console.warn(`⚠️ index creation failed for ${name}: ${e.message}`); }
  }
  console.log('✅ Indexes ensured');
};
if (require.main === module) {
  require('dotenv').config();
  require('../config/db')().then(exports.run).then(() => mongoose.disconnect()).catch((e) => { console.error(e.message); process.exit(1); });
}
