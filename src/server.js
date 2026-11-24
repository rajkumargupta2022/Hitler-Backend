// Entry point: load env vars, connect to MongoDB, then start the HTTP server.
require('dotenv').config();

const app = require('./app');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const ApiRequest = require('./models/ApiRequest');

// One-time: requests saved before "Inherit from project" existed say "No auth"; switch them to inherit so the project's default token applies.
// A marker document makes sure it never runs twice (so later deliberate "No auth" choices are kept).
async function migrateAuthToInherit() {
  const markers = mongoose.connection.collection('migrations');
  if (await markers.findOne({ _id: 'auth-inherit' })) return;
  const result = await ApiRequest.updateMany({ 'auth.type': 'none' }, { $set: { 'auth.type': 'inherit' } });
  await markers.insertOne({ _id: 'auth-inherit', at: new Date() });
  console.log(`Migration: ${result.modifiedCount} request(s) now inherit the project's auth`);
}

const PORT = process.env.PORT || 5000;

// Fail early with a clear message if required settings are missing
['MONGO_URI', 'JWT_SECRET'].forEach((name) => {
  if (!process.env[name]) {
    console.error(`Missing ${name} in .env (see .env.example)`);
    process.exit(1);
  }
});

connectDB(process.env.MONGO_URI)
  .then(migrateAuthToInherit)
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('Could not connect to MongoDB:', err.message);
    process.exit(1);
  });
