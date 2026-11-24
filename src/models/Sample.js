// A saved example response for a request (a snapshot of what the API returned).
const mongoose = require('mongoose');

const sampleSchema = new mongoose.Schema(
  {
    request: { type: mongoose.Schema.Types.ObjectId, ref: 'ApiRequest', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 150 },
    status: { type: Number, required: true },
    statusText: { type: String, default: '' },
    headers: { type: Object, default: {} },
    body: { type: String, default: '' },
    timeMs: { type: Number, default: 0 },
    sizeBytes: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Sample', sampleSchema);
