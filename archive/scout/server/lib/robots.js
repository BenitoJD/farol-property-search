import { fetchPublicPage } from './fetch-safe.js';

const cache = new Map();
const TTL_MS = 60 * 60 * 1000;
const MAX_CACHE = 300;

function parseRobots(text, userAgent) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (key === 'allow' || key === 'disallow') {
      if (current) {
        current.rules.push({ type: key, path: value });
      }
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }

  const ua = String(userAgent).toLowerCase();
  const relevant = groups.filter((group) =>
    group.agents.some((agent) => agent === '*' || (agent && ua.includes(agent)))
  );
  return relevant.flatMap((group) => group.rules);
}

function matchesRule(path, pattern) {
  if (!pattern) return false;
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\\\$$/, '$');
  try {
    return new RegExp(`^${escaped}`).test(path);
  } catch {
    return false;
  }
}

/**
 * Conservative robots.txt check. A failed robots fetch allows the page (the
 * live deployment should still respect each portal's terms of service).
 */
export async function robotsAllows(rawUrl, userAgent, signal) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  const key = url.origin;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return evaluate(cached.rules, url.pathname, userAgent);
  }

  let rules = [];
  try {
    const robotsUrl = `${url.origin}/robots.txt`;
    const { text } = await fetchPublicPage(robotsUrl, {
      signal,
      userAgent,
      timeoutMs: 6000,
      maxBytes: 100 * 1024,
      contentTypeIncludes: [],
    });
    rules = parseRobots(text, userAgent);
  } catch {
    rules = [];
  }

  if (cache.size >= MAX_CACHE) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  cache.set(key, { rules, fetchedAt: Date.now() });
  return evaluate(rules, url.pathname + url.search, userAgent);
}

function evaluate(rules, path, userAgent) {
  if (!rules.length) return true;
  let best = null;
  for (const rule of rules) {
    if (!matchesRule(path, rule.path)) continue;
    if (!best || rule.path.length > best.path.length) best = rule;
  }
  if (!best) return true;
  return best.type === 'allow';
}
