// A saved API request. Named "ApiRequest" so it doesn't clash with Node's built-in Request.
const mongoose = require('mongoose');

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

// One row in the Params or Headers table
const keyValueSchema = new mongoose.Schema(
  {
    key: { type: String, default: '' },
    value: { type: String, default: '' },
    enabled: { type: Boolean, default: true },
  },
  { _id: false }
);

// One row of a form-data body. File rows only keep the file NAME here; the file itself is never stored.
const formFieldSchema = new mongoose.Schema(
  {
    key: { type: String, default: '' },
    type: { type: String, enum: ['text', 'file'], default: 'text' },
    value: { type: String, default: '' },
    enabled: { type: Boolean, default: true },
  },
  { _id: false }
);

const bodySchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['none', 'json', 'text', 'formdata'], default: 'none' },
    content: { type: String, default: '' },
    fields: { type: [formFieldSchema], default: [] },
  },
  { _id: false }
);

const authSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['inherit', 'none', 'bearer', 'basic'], default: 'inherit' }, // inherit = use the project's default auth
    token: { type: String, default: '' },
    username: { type: String, default: '' },
    password: { type: String, default: '' },
  },
  { _id: false }
);

const apiRequestSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    folder: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null }, // null = project root
    name: { type: String, required: [true, 'Request name is required'], trim: true, maxlength: 150 },
    method: { type: String, enum: METHODS, default: 'GET' },
    url: { type: String, default: '' },
    order: { type: Number, default: 0 }, // position among its siblings (set by drag & drop)
    description: { type: String, default: '', maxlength: 20000 }, // markdown notes shown beside the request
    params: { type: [keyValueSchema], default: [] },
    headers: { type: [keyValueSchema], default: [] },
    body: { type: bodySchema, default: () => ({}) },
    auth: { type: authSchema, default: () => ({}) },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ApiRequest', apiRequestSchema);
module.exports.METHODS = METHODS;
