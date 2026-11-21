/** Sliding-window rate limiter for a single-process deployment. */
export class SlidingWindowLimiter {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.hits = new Map();
    this.maxKeys = 5000;
  }

  take(key, now = Date.now()) {
    let bucket = this.hits.get(key);
    if (!bucket) {
      if (this.hits.size >= this.maxKeys) this.sweep(now);
      bucket = [];
      this.hits.set(key, bucket);
    }
    const cutoff = now - this.windowMs;
    while (bucket.length && bucket[0] <= cutoff) bucket.shift();
    if (bucket.length >= this.limit) {
      const retryAfterMs = Math.max(1, bucket[0] + this.windowMs - now);
      return { allowed: false, retryAfterMs, remaining: 0 };
    }
    bucket.push(now);
    return { allowed: true, retryAfterMs: 0, remaining: this.limit - bucket.length };
  }

  sweep(now = Date.now()) {
    const cutoff = now - this.windowMs;
    for (const [key, bucket] of this.hits) {
      while (bucket.length && bucket[0] <= cutoff) bucket.shift();
      if (!bucket.length) this.hits.delete(key);
    }
  }
}
