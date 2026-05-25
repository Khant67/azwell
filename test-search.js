// Security headers middleware — replaces helmet without npm dependency.
//
// Sets standard security headers to mitigate common web vulnerabilities:
//   • Clickjacking (X-Frame-Options)
//   • MIME sniffing (X-Content-Type-Options)
//   • XSS (X-XSS-Protection, CSP)
//   • Information leakage (Referrer-Policy)
//   • Forced HTTPS (HSTS - only in production)
//   • Permissions / Feature Policy

function securityHeaders(opts = {}) {
  const isProduction = process.env.NODE_ENV === 'production';
  const enableCSP    = opts.enableCSP !== false; // default true

  return function (req, res, next) {
    // Prevent embedding of this site in iframes from other origins (clickjacking)
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

    // Prevent browsers from MIME-sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Legacy XSS protection (modern browsers ignore this, but harmless)
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Referrer policy — don't leak full URL to other origins
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions Policy — disable powerful features we don't use
    res.setHeader('Permissions-Policy',
      'geolocation=(), microphone=(), camera=(), payment=(self), usb=(), magnetometer=(), gyroscope=()');

    // Force HTTPS for 1 year (only in production)
    if (isProduction) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    // Hide tech stack
    res.removeHeader('X-Powered-By');

    // Content Security Policy — restricts what resources can load
    if (enableCSP) {
      const csp = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob: https:",
        "media-src 'self'",
        "connect-src 'self' https:",
        "frame-ancestors 'self'",
        "base-uri 'self'",
        "form-action 'self'"
      ].join('; ');
      res.setHeader('Content-Security-Policy', csp);
    }

    next();
  };
}

module.exports = securityHeaders;
