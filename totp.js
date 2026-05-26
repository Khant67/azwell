// TOTP (Time-based One-Time Password) module — RFC 6238 implementation
// Uses Node built-in crypto module (no external dependency).
// Used for admin 2FA login.

const crypto = require('crypto');

const DIGITS = 6;
const STEP = 30;
const ALGO = 'sha1';

const B32_ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHA[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHA[(value << (5 - bits)) & 0x1f];
  return out;
}

function base32Decode(str) {
  str = str.replace(/=+$/, '').toUpperCase().replace(/\s+/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const c of str) {
    const idx = B32_ALPHA.indexOf(c);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secretBuf, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac(ALGO, secretBuf).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin = ((hmac[offset] & 0x7f) << 24) |
              ((hmac[offset + 1] & 0xff) << 16) |
              ((hmac[offset + 2] & 0xff) << 8)  |
              (hmac[offset + 3] & 0xff);
  return String(bin % (10 ** DIGITS)).padStart(DIGITS, '0');
}

function generate(secretB32, time = Date.now()) {
  const counter = Math.floor(time / 1000 / STEP);
  return hotp(base32Decode(secretB32), counter);
}

function verify(token, secretB32, time = Date.now()) {
  if (!token || !secretB32) return false;
  token = String(token).trim();
  const counter = Math.floor(time / 1000 / STEP);
  const buf = base32Decode(secretB32);
  for (let w = -1; w <= 1; w++) {
    if (hotp(buf, counter + w) === token) return true;
  }
  return false;
}

function otpAuthUrl(secret, label, issuer = 'Azwellness') {
  const enc = encodeURIComponent;
  return `otpauth://totp/${enc(issuer)}:${enc(label)}?secret=${secret}&issuer=${enc(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP}`;
}

module.exports = {
  generateSecret,
  generate,
  verify,
  otpAuthUrl
};
