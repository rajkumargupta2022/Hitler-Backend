// Creates (or promotes) the admin account.
// Usage: ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=secret node src/seedAdmin.js
// The password is read from the environment so it is never stored in a file.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const User = require('./models/User');

async function main() {
  const email = (process.env.ADMIN_EMAIL || '').split(',')[0].trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD');

  await connectDB(process.env.MONGO_URI);
  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await User.findOne({ email });

  if (existing) {
    existing.role = 'admin';
    existing.approved = true;
    existing.passwordHash = passwordHash;
    await existing.save();
    console.log(`Updated ${email} to admin`);
  } else {
    await User.create({ name: 'Admin', email, passwordHash, role: 'admin', approved: true });
    console.log(`Created admin ${email}`);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
