import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata',
]);

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_BYTES = 2 * 1024 * 1024;

function isPrivateIpv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIpv6(address) {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fe80') || normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    if (isIP(mapped) === 4) return isPrivateIpv4(mapped);
  }
  return false;
}

function isPrivateAddress(address) {
  const version = isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true;
}

/**
 * SSRF guard for pages Scout fetches from the open web. Resolves every host and
 * rejects loopback, link-local, private and metadata addresses.
 */
export async function assertPublicUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl));
  } catch {
    throw new Error('Invalid URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP(S) URLs are allowed');
  if (url.username || url.password) throw new Error('URLs with credentials are not allowed');
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!hostname || BLOCKED_HOSTNAMES.has(hostname)) throw new Error('Host is not allowed');
  if (hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.localhost')) {
    throw new Error('Host is not allowed');
  }

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error('Private network addresses are not allowed');
    return url;
  }

  const results = await lookup(hostname, { all: true, verbatim: true });
  if (!results.length) throw new Error('Host did not resolve');
  for (const result of results) {
    if (isPrivateAddress(result.address)) {
      throw new Error('Host resolves to a private network address');
    }
  }
  return url;
}

async function readLimitedBody(response, maxBytes) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('Page exceeds the maximum allowed size');
    }
    chunks.push(value);
  }
  const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  return buffer.toString('utf8');
}

/**
 * Fetch a public page with redirect validation, a byte cap and a timeout.
 * Returns the decoded body and the final URL.
 */
export async function fetchPublicPage(rawUrl, {
  signal,
  userAgent = 'ScoutPriceBot/1.0',
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBytes = MAX_BYTES,
  contentTypeIncludes = ['text/html', 'application/xhtml+xml', 'text/plain'],
} = {}) {
  let url = await assertPublicUrl(rawUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
    let response;
    try {
      response = await fetch(url, {
        redirect: 'manual',
        signal: combined,
        headers: {
          'User-Agent': userAgent,
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
          'Accept-Language': 'en-GB,en;q=0.8,pt;q=0.7',
        },
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('Page request timed out or was cancelled');
      throw new Error(`Page fetch failed: ${error.message}`);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirect without a location');
      const next = new URL(location, url).toString();
      url = await assertPublicUrl(next);
      continue;
    }

    if (!response.ok) {
      throw new Error(`Page returned HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentTypeIncludes.length && !contentTypeIncludes.some((type) => contentType.toLowerCase().includes(type))) {
      throw new Error(`Unsupported content type: ${contentType || 'unknown'}`);
    }

    const text = await readLimitedBody(response, maxBytes);
    return { text, finalUrl: url.toString(), status: response.status, contentType };
  }

  throw new Error('Too many redirects');
}
