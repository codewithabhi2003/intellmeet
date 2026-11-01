const mongoose = require('mongoose');
const workspaceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{
    _id: false,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
    joinedAt: { type: Date, default: Date.now },
  }],
}, { timestamps: { createdAt: true, updatedAt: false } });
workspaceSchema.index({ 'members.userId': 1 });
module.exports = mongoose.model('Workspace', workspaceSchema);
