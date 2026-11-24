const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true },
    email: { type: String, required: [true, 'Email is required'], unique: true, lowercase: true, trim: true },
    role: { type: String, enum: ['viewer', 'editor', 'admin'], default: 'editor' }, // viewer = read-only, admin = approves viewers and grants project access
    approved: { type: Boolean, default: true }, // new viewers start unapproved until an admin approves them
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
