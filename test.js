// SMS sender module — supports HTTP GET-based gateways (Unitel, Mobicom, etc.)
//
// Configure via .env:
//   SMS_URL       = https://api.unitel.mn/sms/send?user=X&pass=Y&from=AZWELL&to={phone}&text={message}
//                   (use {phone} and {message} placeholders; they will be URL-encoded)
//   SMS_HEADERS   = optional JSON of headers, e.g. {"Authorization":"Bearer xxx"}
//   SMS_METHOD    = GET (default) or POST
//   SMS_BODY      = optional template for POST body (with {phone}, {message})
//
// If SMS_URL is not set, OTP codes are printed to console (dev mode).

const https = require('https');
const http  = require('http');
const { URL } = require('url');

function enabled() {
  return Boolean(process.env.SMS_URL);
}

function fillTemplate(tpl, vars) {
  let out = tpl;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split('{' + k + '}').join(encodeURIComponent(v));
  }
  return out;
}

async function send(phone, message) {
  if (!enabled()) {
    console.log('\n📱 [SMS DEV] phone=' + phone + '\n           text=' + message + '\n');
    return { ok: true, dev: true };
  }

  const url = fillTemplate(process.env.SMS_URL, { phone, message });
  const method = (process.env.SMS_METHOD || 'GET').toUpperCase();
  let headers = {};
  try { if (process.env.SMS_HEADERS) headers = JSON.parse(process.env.SMS_HEADERS); } catch (_) {}
  const body = process.env.SMS_BODY
    ? fillTemplate(process.env.SMS_BODY, { phone, message })
    : null;

  return new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const lib = u.protocol === 'https:' ? https : http;
      const opts = {
        method,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + (u.search || ''),
        headers
      };
      const req = lib.request(opts, res => {
        let chunks = '';
        res.on('data', c => chunks += c);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ ok: true, status: res.statusCode, body: chunks });
          } else {
            reject(new Error('SMS gateway returned ' + res.statusCode + ': ' + chunks));
          }
        });
      });
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    } catch (e) { reject(e); }
  });
}

module.exports = { send, enabled };
