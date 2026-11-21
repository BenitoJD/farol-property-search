/**
 * Sliding-window limiter. One instance per concern (search, writes).
 */
export class SlidingWindowLimiter {
  constructor(limit, windowMs) {
    this.limit = Math.max(1, Number(limit) || 1);
    this.windowMs = Math.max(1000, Number(windowMs) || 60_000);
    this.hits = new Map();
  }

  take(key) {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const bucket = (this.hits.get(key) || []).filter((ts) => ts > cutoff);
    if (bucket.length >= this.limit) {
      const retryAfterMs = Math.max(0, bucket[0] + this.windowMs - now);
      this.hits.set(key, bucket);
      return { allowed: false, retryAfterMs };
    }
    bucket.push(now);
    this.hits.set(key, bucket);
    if (this.hits.size > 5000) {
      for (const [entryKey, entries] of this.hits) {
        if (!entries.some((ts) => ts > cutoff)) this.hits.delete(entryKey);
      }
    }
    return { allowed: true, retryAfterMs: 0 };
  }
}
