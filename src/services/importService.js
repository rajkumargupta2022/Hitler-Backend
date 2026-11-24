// Reads a project exported from this app, Postman (collection v2.x), Hoppscotch or Insomnia (v4 JSON)
// and turns it into one common shape:
//   { name, description, variables: [{key,value,enabled}], items: [ folder | request, ... ] }
//   folder  = { type: 'folder', name, items }
//   request = { type: 'request', name, method, url, description, params, headers, body, auth, samples? }
const AppError = require('../utils/AppError');

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const str = (v) => (v === undefined || v === null ? '' : typeof v === 'string' ? v : String(v));
const arr = (v) => (Array.isArray(v) ? v : []);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const kv = (key, value, enabled = true) => ({ key: str(key), value: str(value), enabled: enabled !== false });

const emptyBody = () => ({ type: 'none', content: '', fields: [] });
const emptyAuth = () => ({ type: 'none', token: '', username: '', password: '' });

function safeDecode(s) {
  try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return s; }
}

// "https://x.com/a?b=1&c={{d}}" -> { url: "https://x.com/a", params: [b, c] }
// (the app keeps query params in the Params table and adds them when sending)
function splitUrl(raw) {
  const text = str(raw).trim();
  const hashless = text.split('#')[0];
  const q = hashless.indexOf('?');
  if (q === -1) return { url: hashless, params: [] };
  const params = hashless.slice(q + 1).split('&').filter(Boolean).map((pair) => {
    const eq = pair.indexOf('=');
    return kv(safeDecode(eq === -1 ? pair : pair.slice(0, eq)), eq === -1 ? '' : safeDecode(pair.slice(eq + 1)));
  });
  return { url: hashless.slice(0, q), params };
}

function looksLikeJson(text) {
  try { JSON.parse(text); return true; } catch { return false; }
}

// Builds the body shape from raw text + a hint about the content type
function textBody(content, contentType = '') {
  const text = str(content);
  if (!text.trim()) return emptyBody();
  const json = /json/i.test(contentType) || looksLikeJson(text);
  return { type: json ? 'json' : 'text', content: text, fields: [] };
}

function hasHeader(headers, name) {
  return headers.some((h) => h.key.toLowerCase() === name.toLowerCase());
}

// ---------------------------------------------------------------- Postman
function postmanAuth(auth) {
  if (!isObj(auth)) return emptyAuth();
  const get = (list, key) => str(arr(list).find((e) => e.key === key)?.value);
  if (auth.type === 'bearer') return { ...emptyAuth(), type: 'bearer', token: get(auth.bearer, 'token') };
  if (auth.type === 'basic') return { ...emptyAuth(), type: 'basic', username: get(auth.basic, 'username'), password: get(auth.basic, 'password') };
  return emptyAuth();
}

function postmanRequest(item, inheritedAuth) {
  const r = isObj(item.request) ? item.request : { url: item.request }; // old collections allow a bare URL string
  const rawUrl = isObj(r.url) ? r.url.raw ?? '' : r.url;
  const { url, params: fromRaw } = splitUrl(rawUrl);
  const params = isObj(r.url) && arr(r.url.query).length
    ? arr(r.url.query).map((q) => kv(q.key, q.value, !q.disabled))
    : fromRaw;
  const headers = arr(r.header).map((h) => kv(h.key, h.value, !h.disabled));

  let body = emptyBody();
  const b = r.body;
  if (isObj(b)) {
    if (b.mode === 'raw') body = textBody(b.raw, b.options?.raw?.language === 'json' ? 'json' : (headers.find((h) => h.key.toLowerCase() === 'content-type')?.value || ''));
    else if (b.mode === 'formdata') {
      body = {
        type: 'formdata', content: '',
        fields: arr(b.formdata).map((f) => ({ key: str(f.key), type: f.type === 'file' ? 'file' : 'text', value: f.type === 'file' ? str(f.src) : str(f.value), enabled: !f.disabled })),
      };
    } else if (b.mode === 'urlencoded') {
      const pairs = arr(b.urlencoded).filter((f) => !f.disabled).map((f) => `${encodeURIComponent(str(f.key))}=${encodeURIComponent(str(f.value))}`);
      body = { type: 'text', content: pairs.join('&'), fields: [] };
      if (!hasHeader(headers, 'content-type')) headers.push(kv('Content-Type', 'application/x-www-form-urlencoded'));
    } else if (b.mode === 'graphql') {
      const gql = b.graphql || {};
      let variables = {};
      try { variables = gql.variables ? JSON.parse(gql.variables) : {}; } catch { /* keep empty */ }
      body = { type: 'json', content: JSON.stringify({ query: str(gql.query), variables }, null, 2), fields: [] };
    }
  }

  const ownAuth = postmanAuth(r.auth);
  return {
    type: 'request',
    name: str(item.name) || 'Request',
    method: str(r.method).toUpperCase(),
    url, params, headers, body,
    auth: ownAuth.type !== 'none' ? ownAuth : inheritedAuth,
    description: typeof r.description === 'string' ? r.description : str(r.description?.content),
    samples: arr(item.response).map((s) => ({ name: str(s.name) || `${s.code} example`, status: Number(s.code) || 200, statusText: str(s.status), headers: Object.fromEntries(arr(s.header).map((h) => [str(h.key), str(h.value)])), body: str(s.body) })),
  };
}

function postmanItems(list, inheritedAuth) {
  return arr(list).map((item) => {
    if (Array.isArray(item.item)) {
      const auth = isObj(item.auth) ? postmanAuth(item.auth) : inheritedAuth;
      return { type: 'folder', name: str(item.name) || 'Folder', items: postmanItems(item.item, auth) };
    }
    return postmanRequest(item, inheritedAuth);
  });
}

function fromPostman(json) {
  return {
    name: str(json.info?.name) || 'Postman import',
    description: typeof json.info?.description === 'string' ? json.info.description : '',
    variables: arr(json.variable).map((v) => kv(v.key, v.value, !v.disabled)),
    items: postmanItems(json.item, postmanAuth(json.auth)),
  };
}

// ------------------------------------------------------------- Hoppscotch
function hoppAuth(auth) {
  if (!isObj(auth) || auth.authActive === false) return emptyAuth();
  if (auth.authType === 'bearer') return { ...emptyAuth(), type: 'bearer', token: str(auth.token) };
  if (auth.authType === 'basic') return { ...emptyAuth(), type: 'basic', username: str(auth.username), password: str(auth.password) };
  return emptyAuth();
}

function hoppRequest(r) {
  const { url, params: fromUrl } = splitUrl(r.endpoint ?? r.url);
  const params = arr(r.params).length ? arr(r.params).map((p) => kv(p.key, p.value, p.active !== false)) : fromUrl;
  const headers = arr(r.headers).map((h) => kv(h.key, h.value, h.active !== false));

  let body = emptyBody();
  const b = r.body;
  if (isObj(b) && b.contentType) {
    if (b.contentType === 'multipart/form-data') {
      body = { type: 'formdata', content: '', fields: arr(b.body).map((f) => ({ key: str(f.key), type: f.isFile ? 'file' : 'text', value: f.isFile ? '' : str(f.value), enabled: f.active !== false })) };
    } else if (b.contentType === 'application/x-www-form-urlencoded') {
      body = { type: 'text', content: str(b.body).split('\n').map((l) => l.replace(/^\s*#?/, '').trim()).filter(Boolean).join('&'), fields: [] };
      if (!hasHeader(headers, 'content-type')) headers.push(kv('Content-Type', b.contentType));
    } else {
      body = textBody(b.body, b.contentType);
      if (body.type !== 'none' && !hasHeader(headers, 'content-type')) headers.push(kv('Content-Type', b.contentType));
    }
  }
  return { type: 'request', name: str(r.name) || 'Request', method: str(r.method).toUpperCase(), url, params, headers, body, auth: hoppAuth(r.auth), description: '' };
}

function hoppCollection(c) {
  return {
    type: 'folder', name: str(c.name) || 'Folder',
    items: [...arr(c.folders).map(hoppCollection), ...arr(c.requests).map(hoppRequest)],
  };
}

function fromHoppscotch(json) {
  const cols = Array.isArray(json) ? json : [json];
  if (cols.length === 1) {
    const only = hoppCollection(cols[0]);
    return { name: only.name, description: '', variables: arr(cols[0].variables).map((v) => kv(v.key, v.value ?? v.initialValue)), items: only.items };
  }
  return { name: 'Hoppscotch import', description: '', variables: [], items: cols.map(hoppCollection) };
}

// --------------------------------------------------------------- Insomnia
function insomniaRequest(r) {
  const { url, params: fromUrl } = splitUrl(r.url);
  const params = arr(r.parameters).length ? arr(r.parameters).map((p) => kv(p.name, p.value, !p.disabled)) : fromUrl;
  const headers = arr(r.headers).map((h) => kv(h.name, h.value, !h.disabled));

  let body = emptyBody();
  const b = r.body;
  if (isObj(b)) {
    if (b.mimeType === 'multipart/form-data') {
      body = { type: 'formdata', content: '', fields: arr(b.params).map((f) => ({ key: str(f.name), type: f.type === 'file' ? 'file' : 'text', value: f.type === 'file' ? str(f.fileName) : str(f.value), enabled: !f.disabled })) };
    } else if (b.mimeType === 'application/x-www-form-urlencoded') {
      const pairs = arr(b.params).filter((f) => !f.disabled).map((f) => `${encodeURIComponent(str(f.name))}=${encodeURIComponent(str(f.value))}`);
      body = { type: 'text', content: pairs.join('&'), fields: [] };
      if (!hasHeader(headers, 'content-type')) headers.push(kv('Content-Type', b.mimeType));
    } else if (b.mimeType === 'application/graphql') {
      body = textBody(b.text, 'json');
    } else {
      body = textBody(b.text, b.mimeType);
    }
  }

  const a = r.authentication;
  let auth = emptyAuth();
  if (isObj(a) && !a.disabled) {
    if (a.type === 'bearer') auth = { ...emptyAuth(), type: 'bearer', token: str(a.token) };
    if (a.type === 'basic') auth = { ...emptyAuth(), type: 'basic', username: str(a.username), password: str(a.password) };
  }
  return { type: 'request', name: str(r.name) || 'Request', method: str(r.method).toUpperCase(), url, params, headers, body, auth, description: str(r.description) };
}

function fromInsomnia(json) {
  const resources = arr(json.resources);
  const workspace = resources.find((r) => r._type === 'workspace');
  const rootId = workspace?._id;
  const bySort = (a, b) => (a.metaSortKey ?? 0) - (b.metaSortKey ?? 0);

  const childrenOf = (parentId) =>
    resources
      .filter((r) => r.parentId === parentId && (r._type === 'request_group' || r._type === 'request'))
      .sort(bySort)
      .map((r) => (r._type === 'request_group' ? { type: 'folder', name: str(r.name) || 'Folder', items: childrenOf(r._id) } : insomniaRequest(r)));

  // The base environment (child of the workspace) holds the variables
  const env = resources.find((r) => r._type === 'environment' && r.parentId === rootId);
  const variables = isObj(env?.data)
    ? Object.entries(env.data).filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v)).map(([k, v]) => kv(k, v))
    : [];

  return { name: str(workspace?.name) || 'Insomnia import', description: str(workspace?.description), variables, items: childrenOf(rootId) };
}

// ------------------------------------------------------------ This app
function fromNative(json) {
  const walk = (list) => arr(list).map((n) => (n.type === 'folder' ? { type: 'folder', name: n.name, items: walk(n.items) } : { ...n, type: 'request' }));
  const pa = isObj(json.auth) && ['bearer', 'basic'].includes(json.auth.type) ? json.auth : null;
  return { auth: pa ? { type: pa.type, token: str(pa.token), username: str(pa.username), password: str(pa.password) } : undefined, name: str(json.name), description: str(json.description), variables: arr(json.variable || json.variables).map((v) => kv(v.key, v.value, v.enabled)), items: walk(json.items) };
}

// ----------------------------------------------------------------- entry
function detect(json) {
  if (Array.isArray(json) || (isObj(json) && (Array.isArray(json.requests) || Array.isArray(json.folders)) && !json.resources)) return 'hoppscotch';
  if (!isObj(json)) return null;
  if (json.format === 'api-tester-project') return 'native';
  if (Array.isArray(json.resources) && (json._type === 'export' || json.__export_format)) return 'insomnia';
  if (isObj(json.info) && Array.isArray(json.item)) return 'postman';
  return null;
}

// Cleans the converted tree so the controller can store it as is
function sanitize(node) {
  if (node.type === 'folder') return { type: 'folder', name: str(node.name).trim().slice(0, 100) || 'Folder', items: arr(node.items).map(sanitize) };
  const method = str(node.method).toUpperCase();
  const keyValues = (list) => arr(list).map((x) => kv(x.key, x.value, x.enabled)).filter((x) => x.key.trim() || x.value);
  const body = isObj(node.body) ? node.body : emptyBody();
  const auth = isObj(node.auth) ? node.auth : emptyAuth();
  return {
    type: 'request',
    name: str(node.name).trim().slice(0, 150) || 'Request',
    method: METHODS.includes(method) ? method : 'GET',
    url: str(node.url),
    description: str(node.description).slice(0, 20000),
    params: keyValues(node.params),
    headers: keyValues(node.headers),
    body: {
      type: ['none', 'json', 'text', 'formdata'].includes(body.type) ? body.type : 'none',
      content: str(body.content),
      fields: arr(body.fields).map((f) => ({ key: str(f.key), type: f.type === 'file' ? 'file' : 'text', value: str(f.value), enabled: f.enabled !== false })),
    },
    auth: { type: ['inherit', 'none', 'bearer', 'basic'].includes(auth.type) ? auth.type : 'none', token: str(auth.token), username: str(auth.username), password: str(auth.password) },
    samples: arr(node.samples).filter((s) => isObj(s) && Number.isFinite(Number(s.status))).slice(0, 50).map((s) => ({
      name: str(s.name).slice(0, 150) || `${s.status} example`, status: Number(s.status), statusText: str(s.statusText),
      headers: isObj(s.headers) ? s.headers : {}, body: str(s.body), timeMs: Number(s.timeMs) || 0, sizeBytes: Number(s.sizeBytes) || 0,
    })),
  };
}

function convert(json) {
  const kind = detect(json);
  if (!kind) throw new AppError(400, 'Unrecognized file. Import a Postman collection (v2.x), Hoppscotch collection, Insomnia export (JSON) or a project exported from this app.');
  const converters = { postman: fromPostman, hoppscotch: fromHoppscotch, insomnia: fromInsomnia, native: fromNative };
  const result = converters[kind](json);

  const seen = new Set();
  const variables = result.variables
    .filter((v) => /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(v.key.trim()) && !seen.has(v.key.trim()) && seen.add(v.key.trim()))
    .map((v) => ({ key: v.key.trim(), value: v.value.slice(0, 5000), enabled: v.enabled }));

  return { kind, name: str(result.name).trim().slice(0, 100) || 'Imported project', description: str(result.description).slice(0, 500), variables, auth: result.auth, items: arr(result.items).map(sanitize) };
}

module.exports = { convert };
