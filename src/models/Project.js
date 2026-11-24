const mongoose = require('mongoose');

// One environment variable, used in requests as {{key}}
const variableSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, maxlength: 100 },
    value: { type: String, default: '', maxlength: 5000 },
    enabled: { type: Boolean, default: true },
  },
  { _id: false }
);

// Default auth for the whole project: every request set to "inherit" uses it
const projectAuthSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['none', 'bearer', 'basic'], default: 'none' },
    token: { type: String, default: '' },
    username: { type: String, default: '' },
    password: { type: String, default: '' },
  },
  { _id: false }
);

const projectSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: [true, 'Project name is required'], trim: true, maxlength: 100 },
    description: { type: String, default: '', maxlength: 500 },
    variables: { type: [variableSchema], default: [] },
    auth: { type: projectAuthSchema, default: () => ({}) },
    viewers: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [], index: true }, // read-only members added by the owner
    editors: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [], index: true }, // members who can edit, added by the owner
  },
  { timestamps: true }
);

module.exports = mongoose.model('Project', projectSchema);
