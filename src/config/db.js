const dns = require('dns');
const mongoose = require('mongoose');

async function connectDB(uri) {
  // Some networks/routers refuse the SRV lookup that mongodb+srv:// needs.
  // Set DNS_SERVERS=8.8.8.8,1.1.1.1 in .env to resolve it through public DNS instead.
  if (process.env.DNS_SERVERS) dns.setServers(process.env.DNS_SERVERS.split(',').map((s) => s.trim()));

  await mongoose.connect(uri);
  console.log('MongoDB connected');
}

module.exports = connectDB;
