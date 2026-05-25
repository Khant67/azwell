// Azwellness.mn — local Express backend (dev only)
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const db       = require('./db');
const rateLimit       = require('./rate-limit');
const securityHeaders = require('./security');
const logger          = require('./logger');
const backup          = require('./backup');
const auth     = require('./routes/auth');
const orders   = require('./routes/orders');
const products = require('./routes/products');
const admin    = require('./routes/admin');
const wishlist = require('./routes/wishlist');
const coupons  = require('./routes/coupons');
const reviews  = require('./routes/reviews');
const payment  = require('./routes/payment');

const PORT = process.env.PORT || 3000;
const app  = express();

// Security: apply HTTP security headers to all responses
app.use(securityHeaders());

// Access logging — write every request to logs/YYYY-MM-DD.log
app.use(logger.accessLog);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Trust X-Forwarded-For so rate-limit works behind reverse proxy (nginx)
app.set('trust proxy', 1);

// Global rate limit — applied to all /api routes
const globalLimit = rateLimit({ windowMs: 60_000, max: 120 });
app.use('/api', globalLimit);

// Stricter rate limits for sensitive endpoints
const authLimit  = rateLimit({ windowMs: 60_000, max: 10, message: 'Хэт олон удаа оролдлоо. 1 минутын дараа дахин оролдоно уу.' });
const otpLimit   = rateLimit({ windowMs: 60_000, max: 3,  message: 'OTP-ийн хязгаар хэтэрсэн. 1 минутын дараа.' });
const orderLimit = rateLimit({ windowMs: 60_000, max: 5,  message: 'Захиалга үүсгэх хязгаар хэтэрсэн. Хэсэг хүлээнэ үү.' });

// API
app.use('/api/auth/login',           authLimit);
app.use('/api/auth/register',        authLimit);
app.use('/api/auth/send-otp',        otpLimit);
app.use('/api/auth/forgot-password', authLimit);
app.use('/api/auth/reset-password',  authLimit);
app.post('/api/orders',              orderLimit);
app.use('/api/auth',     auth);
app.use('/api/orders',   orders);
app.use('/api/products', products);
app.use('/api/admin',    admin);
app.use('/api/wishlist', wishlist);
app.use('/api/coupons',  coupons);
app.use('/api/reviews',  reviews);
app.use('/api/payment',  payment);

// Static site
const SITE_DIR = path.join(__dirname, '..', 'site');
const ROOT_DIR = path.join(__dirname, '..');

// Clean URLs (without .html)
app.get('/admin', (_req, res) => res.sendFile(path.join(SITE_DIR, 'admin.html')));
app.get('/admin/', (_req, res) => res.sendFile(path.join(SITE_DIR, 'admin.html')));

app.use('/',       express.static(SITE_DIR));
app.use('/brands', express.static(path.join(ROOT_DIR, 'brands')));

// Error handler — log every error to file
app.use((err, req, res, _next) => {
  logger.error('Request failed: ' + (req.method + ' ' + req.originalUrl), err);
  res.status(err.status || 500).json({ error: err.message || 'Internal error' });
});

// Catch unhandled rejections / exceptions
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION', err);
});
process.on('unhandledRejection', (reason) => {
  logger.error('UNHANDLED REJECTION', reason instanceof Error ? reason : new Error(String(reason)));
});

// Start automatic DB backups (every 24h)
backup.start();

app.listen(PORT, '0.0.0.0', () => {
  logger.info('Azwell backend started on port ' + PORT);
  console.log('Azwell backend listening on http://localhost:' + PORT);
  console.log('Storefront -> http://localhost:' + PORT + '/');
  // Show LAN IPs so user can open from phone
  const os = require('os');
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log('Phone-aas nevtreh -> http://' + iface.address + ':' + PORT + '/');
      }
    }
  }
});
