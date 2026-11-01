require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Workspace = require('../models/Workspace');
(async () => {
  await connectDB();
  const email = (process.env.ADMIN_EMAIL || 'admin@intellmeet.local').toLowerCase();
  let u = await User.findOne({ email });
  if (u) console.log('Admin already exists:', email);
  else {
    u = await User.create({ name: 'Admin', email, password: process.env.ADMIN_PASSWORD || 'change_me_now', role: 'admin' });
    await Workspace.create({ name: 'Admin workspace', ownerId: u._id, members: [{ userId: u._id, role: 'owner' }] });
    console.log('Admin created:', email);
  }
  await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
