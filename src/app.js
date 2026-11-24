// Builds the Express app: global middleware -> routes -> error handler.
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const projectRoutes = require('./routes/projectRoutes');
const folderRoutes = require('./routes/folderRoutes');
const requestRoutes = require('./routes/requestRoutes');
const executeRoutes = require('./routes/executeRoutes');
const adminRoutes = require('./routes/adminRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// CLIENT_URL = address(es) of the separately hosted client, comma separated (no trailing slash)
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '5mb' })); // request bodies can be large

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/execute', executeRoutes);
app.use('/api/admin', adminRoutes);

// Unknown API route
app.use((req, res) => res.status(404).json({ message: `Route not found: ${req.method} ${req.path}` }));

// Must be last: turns thrown errors into JSON responses
app.use(errorHandler);

module.exports = app;
