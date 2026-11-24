// Folders are stored FLAT. Nesting comes from "parent":
//   parent = null       -> folder sits at the project root
//   parent = <folderId> -> folder sits inside that folder
const mongoose = require('mongoose');

const folderSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
    name: { type: String, required: [true, 'Folder name is required'], trim: true, maxlength: 100 },
    order: { type: Number, default: 0 }, // position among its siblings (set by drag & drop)
  },
  { timestamps: true }
);

module.exports = mongoose.model('Folder', folderSchema);
