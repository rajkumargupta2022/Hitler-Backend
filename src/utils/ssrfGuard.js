// SSRF guard: stops users from making YOUR server call internal addresses
// (localhost, your database, cloud metadata at 169.254.169.254, office network...).
const dns = require('dns').promises;
const net = require('net');
const AppError = require('./AppError');

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  const lower = ip.toLowerCase();
  if (lower.startsWith('::ffff:')) return isPrivateIp(lower.slice(7)); // IPv4 written as IPv6
  return lower === '::1' || lower === '::' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80');
}

// Returns a URL object if the address is safe to call, otherwise throws AppError.
async function assertSafeUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl).trim());
  } catch {
    throw new AppError(400, 'Enter a full URL starting with http:// or https://');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new AppError(400, 'Only http:// and https:// URLs are supported');
  }

  if (process.env.ALLOW_PRIVATE_URLS === 'true') return url;

  const host = url.hostname.replace(/^\[|\]$/g, ''); // strip [ ] from IPv6 hosts
  let addresses;
  try {
    addresses = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((r) => r.address);
  } catch {
    throw new AppError(400, `Could not find the host "${host}". Check the URL for typos.`);
  }

  if (addresses.some(isPrivateIp)) {
    throw new AppError(400, 'Requests to localhost or private network addresses are blocked on this server');
  }
  return url;
}

module.exports = { assertSafeUrl };
