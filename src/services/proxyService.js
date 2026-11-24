// The heart of the app: sends the user's request from the SERVER and measures it.
// Why the server? Browsers block most cross-site calls (CORS). Servers don't.
const { assertSafeUrl } = require('../utils/ssrfGuard');
const AppError = require('../utils/AppError');
const { METHODS } = require('../models/ApiRequest');

const TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_FORM_FIELDS = 50;
const MAX_FORM_FILE_BYTES = 4 * 1024 * 1024; // all uploaded files together

// Keep only valid string headers; let fetch calculate Host and Content-Length itself
function cleanHeaders(headers = {}) {
  const result = {};
  for (const [key, value] of Object.entries(headers)) {
    const name = String(key).trim();
    if (!name || ['host', 'content-length'].includes(name.toLowerCase())) continue;
    result[name] = String(value ?? '');
  }
  return result;
}

// Read the response body chunk by chunk and stop if it gets too big
async function readBodyWithLimit(response, maxBytes) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new AppError(413, 'The response is larger than 5 MB, so it was not loaded');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// Turns the form-data rows sent by the client into a multipart body (files arrive base64-encoded)
function buildFormData(rows) {
  if (rows.length > MAX_FORM_FIELDS) throw new AppError(400, `Form-data can have at most ${MAX_FORM_FIELDS} fields`);
  const form = new FormData();
  let fileBytes = 0;
  for (const row of rows) {
    const key = String(row?.key ?? '').trim();
    if (!key) continue;
    if (row.type === 'file') {
      const buffer = Buffer.from(String(row.data || ''), 'base64');
      fileBytes += buffer.length;
      if (fileBytes > MAX_FORM_FILE_BYTES) throw new AppError(413, 'Uploaded files are larger than 4 MB in total');
      form.append(key, new Blob([buffer], { type: row.contentType || 'application/octet-stream' }), String(row.filename || 'file'));
    } else {
      form.append(key, String(row.value ?? ''));
    }
  }
  return form;
}

async function sendHttpRequest({ method = 'GET', url, headers, body, formData }) {
  const httpMethod = String(method).toUpperCase();
  if (!METHODS.includes(httpMethod)) {
    throw new AppError(400, `Unsupported method: ${method}`);
  }

  // 1. Validate the URL (and block internal addresses)
  const safeUrl = await assertSafeUrl(url);
  const canHaveBody = !['GET', 'HEAD'].includes(httpMethod);

  // Form-data: fetch writes Content-Type with the multipart boundary itself, so drop any other one
  const requestHeaders = cleanHeaders(headers);
  let requestBody = canHaveBody && body ? String(body) : undefined;
  if (canHaveBody && Array.isArray(formData)) {
    requestBody = buildFormData(formData);
    Object.keys(requestHeaders).filter((k) => k.toLowerCase() === 'content-type').forEach((k) => delete requestHeaders[k]);
  }

  // 2. Send it and time it
  const startedAt = performance.now();
  let response;
  try {
    response = await fetch(safeUrl, {
      method: httpMethod,
      headers: requestHeaders,
      body: requestBody,
      redirect: 'manual', // don't silently follow redirects to other (possibly internal) hosts
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err.name === 'TimeoutError') {
      throw new AppError(504, `No response after ${TIMEOUT_MS / 1000} seconds`);
    }
    const reason = err.cause?.code || err.cause?.message || err.message;
    throw new AppError(502, `Could not reach ${safeUrl.host} (${reason})`);
  }

  // 3. Read the body and package everything for the UI
  const responseBody = await readBodyWithLimit(response, MAX_RESPONSE_BYTES);
  const timeMs = Math.round(performance.now() - startedAt);

  return {
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    body: responseBody,
    timeMs,
    sizeBytes: Buffer.byteLength(responseBody),
  };
}

module.exports = { sendHttpRequest };
