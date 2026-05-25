// Simple in-memory rate limiter — no external dependency required
// Usage: app.use('/api/auth', rateLimit({ windowMs: 60_000, max: 10 }))
//
// Stores counters per IP+key. Cleans expired entries every 60s.

const buckets = new Map();

function rateLimit(opts = {}) {
  const windowMs = opts.windowMs || 60 * 1000;     // default 1 minute
  const max      = opts.max      || 30;            // default 30 requests
  const message  = opts.message  || 'Хэт олон хүсэлт. Хэсэг хүлээгээрэй.';
  const keyFn    = opts.keyGenerator || ((req) => {
    return req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  });

  return function (req, res, next) {
    const key = String(keyFn(req)) + ':' + req.method + req.path.split('?')[0];
    const now = Date.now();
    const b = buckets.get(key);

    if (!b || now > b.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', max - 1);
      return next();
    }

    if (b.count >= max) {
      const retry = Math.ceil((b.resetAt - now) / 1000);
      res.setHeader('Retry-After', retry);
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', 0);
      return res.status(429).json({ error: message, retry_after_seconds: retry });
    }

    b.count++;
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', max - b.count);
    next();
  };
}

// Periodic cleanup of expired buckets
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) {
    if (now > b.resetAt) buckets.delete(k);
  }
}, 60 * 1000);

module.exports = rateLimit;
