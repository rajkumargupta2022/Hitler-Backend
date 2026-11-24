const asyncHandler = require('../utils/asyncHandler');
const { sendHttpRequest } = require('../services/proxyService');

// POST /api/execute  { method, url, headers: {}, body: "...", formData?: [{ key, type, value, filename, contentType, data(base64) }] }
// The frontend has already merged params into the URL and auth into headers.
const executeRequest = asyncHandler(async (req, res) => {
  const { method, url, headers, body, formData } = req.body;
  const result = await sendHttpRequest({ method, url, headers, body, formData });
  res.json(result);
});

module.exports = { executeRequest };
