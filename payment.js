// /api/auth — register, login, current-user, logout
const express = require('express');
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const db      = require('../db');

const router = express.Router();

function genToken() {
  return crypto.randomBytes(24).toString('hex');
}
function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, phone: u.phone, is_admin: !!u.is_admin };
}

function requireAuth(req, res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token' });
  const row = db.prepare(
    `SELECT users.* FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token = ?`
  ).get(token);
  if (!row) return res.status(401).json({ error: 'Invalid token' });
  req.user  = row;
  req.token = token;
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, function(){
    if (!req.user || !req.user.is_admin) {
      return res.status(403).json({ error: 'Admin only' });
    }
    next();
  });
}

// SMS module
let sms;
try { sms = require('../sms'); } catch (_) { sms = null; }

const totp = require('../totp');

// Generate 4-digit OTP code
function genOtp() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// POST /api/auth/send-otp — generate + send OTP to phone
router.post('/send-otp', async (req, res) => {
  let { phone } = req.body || {};
  phone = normalizePhone(phone);
  if (!phone) return res.status(400).json({ error: 'phone required' });
  if (phone.length < 7) return res.status(400).json({ error: 'invalid phone number' });

  // Rate limit: max 1 OTP per phone per 60 seconds
  const recent = db.prepare(
    "SELECT created_at FROM phone_otp WHERE phone = ? ORDER BY created_at DESC LIMIT 1"
  ).get(phone);
  if (recent) {
    const ageMs = Date.now() - new Date(recent.created_at.replace(' ', 'T') + 'Z').getTime();
    if (ageMs < 60 * 1000) {
      const wait = Math.ceil((60 * 1000 - ageMs) / 1000);
      return res.status(429).json({ error: wait + ' секундын дараа дахин оролдоно уу' });
    }
  }

  const code = genOtp();
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min
  db.prepare(
    'INSERT INTO phone_otp (phone, code, expires_at) VALUES (?, ?, ?)'
  ).run(phone, code, expires);

  // Send via SMS
  const message = 'Azwell.mn — Танай баталгаажуулах код: ' + code + ' (10 минутын дотор хэрэглэнэ үү)';
  try {
    if (sms && sms.send) await sms.send(phone, message);
  } catch (e) {
    console.warn('[otp] SMS send failed:', e.message);
  }

  const debug = !sms || !sms.enabled() ? { dev_code: code } : {};
  res.json({ ok: true, ...debug });
});

// POST /api/auth/verify-otp — check code, marks phone as verified
router.post('/verify-otp', (req, res) => {
  let { phone, code } = req.body || {};
  phone = normalizePhone(phone);
  if (!phone || !code) return res.status(400).json({ error: 'phone and code required' });

  const row = db.prepare(
    'SELECT * FROM phone_otp WHERE phone = ? ORDER BY created_at DESC LIMIT 1'
  ).get(phone);
  if (!row) return res.status(404).json({ error: 'OTP not found. Please request again.' });
  if (row.verified) return res.status(400).json({ error: 'OTP already used' });
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: 'OTP expired' });
  }
  if (row.attempts >= 5) {
    return res.status(429).json({ error: 'Хэт олон оролдлого. Шинэ код хүсээрэй.' });
  }
  if (String(row.code) !== String(code).trim()) {
    db.prepare('UPDATE phone_otp SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    return res.status(401).json({ error: 'Код буруу байна' });
  }
  db.prepare('UPDATE phone_otp SET verified = 1 WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

// Helper: check whether a phone has a recently-verified OTP (within last 30 min)
function hasVerifiedOtp(phone) {
  const row = db.prepare(
    "SELECT id FROM phone_otp WHERE phone = ? AND verified = 1 AND created_at >= datetime('now', '-30 minutes') LIMIT 1"
  ).get(phone);
  return Boolean(row);
}

// Normalize phone: strip everything except digits and leading +
function normalizePhone(p) {
  if (!p) return null;
  let s = String(p).replace(/[^\d+]/g, '');
  // If +976xxxxxxxx → take last 8 digits as local
  if (s.startsWith('+976')) s = s.slice(4);
  if (s.startsWith('976') && s.length > 8) s = s.slice(3);
  return s || null;
}

router.post('/register', (req, res) => {
  let { email, password, name, phone } = req.body || {};
  phone = normalizePhone(phone);
  email = email ? String(email).trim().toLowerCase() : null;

  if (!password) return res.status(400).json({ error: 'Password required' });
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 chars' });
  }
  if (!email && !phone) {
    return res.status(400).json({ error: 'Имэйл эсвэл утас аль нэгийг оруулна уу' });
  }

  if (email) {
    const ex1 = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (ex1) return res.status(409).json({ error: 'Энэ имэйл аль хэдийн бүртгэлтэй байна' });
  }
  if (phone) {
    const ex2 = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
    if (ex2) return res.status(409).json({ error: 'Энэ утас аль хэдийн бүртгэлтэй байна' });
    // If phone provided, require verified OTP
    if (!hasVerifiedOtp(phone)) {
      return res.status(400).json({ error: 'Утсаа SMS кодоор баталгаажуулна уу', phone_verification_required: true });
    }
  }

  // Auto-promote first user to admin
  const userCount = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  const isAdmin   = userCount === 0 ? 1 : 0;

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(
    'INSERT INTO users (email, password_hash, name, phone, is_admin) VALUES (?, ?, ?, ?, ?)'
  ).run(email, hash, name || null, phone, isAdmin);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(info.lastInsertRowid));
  // Allow multiple sessions per user — only clean very old (>30 days) sessions
  db.prepare("DELETE FROM sessions WHERE user_id = ? AND created_at < datetime('now', '-30 days')").run(user.id);
  const token = genToken();
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, user.id);

  res.status(201).json({ token, user: publicUser(user) });
});

router.post('/login', (req, res) => {
  // Accept either email OR phone OR a generic "identifier"
  let { email, phone, identifier, password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Password required' });

  // If identifier is set, detect if it's a phone or email
  if (identifier) {
    const looksLikePhone = /\d{6,}/.test(String(identifier).replace(/[^\d+]/g, ''));
    if (looksLikePhone) phone = identifier;
    else email = identifier;
  }
  phone = normalizePhone(phone);
  email = email ? String(email).trim().toLowerCase() : null;

  if (!email && !phone) {
    return res.status(400).json({ error: 'Имэйл эсвэл утас аль нэгийг оруулна уу' });
  }

  let user;
  if (email) {
    user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  }
  if (!user && phone) {
    user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  }
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Имэйл/утас эсвэл нууц үг буруу байна' });
  }
  // 2FA check
  if (user.totp_enabled) {
    const code = req.body.totp;
    if (!code) {
      return res.status(401).json({ error: '2FA код шаардлагатай', totp_required: true });
    }
    if (!totp.verify(user.totp_secret, code)) {
      return res.status(401).json({ error: '2FA код буруу байна', totp_required: true });
    }
  }
  // Allow multiple sessions per user — only clean very old (>30 days) sessions
  db.prepare("DELETE FROM sessions WHERE user_id = ? AND created_at < datetime('now', '-30 days')").run(user.id);
  const token = genToken();
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, user.id);
  res.json({ token, user: publicUser(user) });
});

// ── 2FA endpoints (TOTP) ──────────────────────────────────────────────
// POST /api/auth/2fa/setup — generate secret + return QR URL (not yet enabled)
router.post('/2fa/setup', requireAuth, (req, res) => {
  const secret = totp.generateSecret();
  // Store temporarily — only confirmed on /2fa/enable
  db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(secret, req.user.id);
  const account = req.user.email || req.user.phone || ('user' + req.user.id);
  const url = totp.otpauthURL(secret, account, 'Azwell.mn');
  res.json({ secret, otpauth_url: url });
});

// POST /api/auth/2fa/enable — confirm code and enable 2FA
router.post('/2fa/enable', requireAuth, (req, res) => {
  const code = req.body && req.body.code;
  if (!code) return res.status(400).json({ error: 'code required' });
  if (!req.user.totp_secret) {
    return res.status(400).json({ error: 'Setup эхэлсэнгүй' });
  }
  if (!totp.verify(req.user.totp_secret, code)) {
    return res.status(401).json({ error: 'Код буруу байна' });
  }
  db.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
});

// POST /api/auth/2fa/disable — disable 2FA (requires current password)
router.post('/2fa/disable', requireAuth, (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'password required' });
  if (!bcrypt.compareSync(password, req.user.password_hash)) {
    return res.status(401).json({ error: 'Нууц үг буруу байна' });
  }
  db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
});

// GET /api/auth/2fa/status — is 2FA enabled?
router.get('/2fa/status', requireAuth, (req, res) => {
  res.json({ enabled: Boolean(req.user.totp_enabled) });
});

router.post('/logout', requireAuth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// PUT /api/auth/profile — update profile (name, phone, email)
router.put('/profile', requireAuth, (req, res) => {
  const { name, phone, email } = req.body || {};
  const updates = [];
  const params  = [];
  if (name  !== undefined) { updates.push('name = ?');  params.push(name); }
  if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
  if (email !== undefined && email !== req.user.email) {
    const ex = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, req.user.id);
    if (ex) return res.status(409).json({ error: 'Email already in use' });
    updates.push('email = ?');
    params.push(email);
  }
  if (updates.length === 0) return res.json({ user: publicUser(req.user) });
  params.push(req.user.id);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: publicUser(updated) });
});

// POST /api/auth/change-password — change password (requires current password)
router.post('/change-password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'current_password and new_password required' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'new password must be at least 6 chars' });
  }
  if (!bcrypt.compareSync(current_password, req.user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
  // Invalidate other sessions (keep current one)
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(req.user.id, req.token);
  res.json({ ok: true });
});

// POST /api/auth/forgot-password — request a reset token by email
router.post('/forgot-password', (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });
  const user = db.prepare('SELECT id, email, name FROM users WHERE email = ?').get(email);
  // Always respond OK (don't reveal whether email is registered)
  if (!user) return res.json({ ok: true });

  const token = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
  db.prepare(
    'INSERT INTO password_resets (token, user_id, expires_at) VALUES (?, ?, ?)'
  ).run(token, user.id, expires);

  const resetUrl = (process.env.PUBLIC_URL || ('http://localhost:' + (process.env.PORT || 3000))) +
                   '/reset-password.html?token=' + token;

  // Try to send via mailer (fire and forget)
  try {
    const mailer = require('../mailer');
    if (mailer && mailer.send) {
      mailer.send({
        to: user.email,
        subject: 'Azwell.mn — Нууц үг сэргээх',
        html: '<p>Сайн уу ' + (user.name || '') + ',</p>' +
              '<p>Та нууц үгээ сэргээхээр хүсэлт илгээсэн байна. Доорх линкэр дарж шинэ нууц үг үүсгэнэ үү (1 цагийн дотор хүчинтэй):</p>' +
              '<p><a href="' + resetUrl + '" style="background:#1aaba0;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;">Нууц үг шинэчлэх</a></p>' +
              '<p style="font-size:11px;color:#888;">Хэрэв та энэ хүсэлт илгээгээгүй бол энэ имэйлийг үл тоомсорло.</p>'
      }).catch(() => {});
    }
  } catch (_) {}

  // For dev environments, return the URL directly
  const debug = process.env.NODE_ENV !== 'production' ? { reset_url: resetUrl } : {};
  res.json({ ok: true, ...debug });
});

// POST /api/auth/forgot-password-sms — request a 4-digit SMS code by phone
router.post('/forgot-password-sms', async (req, res) => {
  let { phone } = req.body || {};
  phone = normalizePhone(phone);
  if (!phone) return res.status(400).json({ error: 'phone required' });

  const user = db.prepare('SELECT id, name, phone FROM users WHERE phone = ?').get(phone);
  // Always respond OK (don't reveal whether phone is registered)
  if (!user) return res.json({ ok: true });

  // Rate limit: max 1 OTP per phone per 60s
  const recent = db.prepare(
    "SELECT created_at FROM phone_otp WHERE phone = ? ORDER BY created_at DESC LIMIT 1"
  ).get(phone);
  if (recent) {
    const ageMs = Date.now() - new Date(recent.created_at.replace(' ', 'T') + 'Z').getTime();
    if (ageMs < 60 * 1000) {
      return res.status(429).json({ error: Math.ceil((60 * 1000 - ageMs) / 1000) + ' секундын дараа дахин оролдоно уу' });
    }
  }

  // Generate 4-digit code (use phone_otp table)
  const code = String(Math.floor(1000 + Math.random() * 9000));
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  db.prepare(
    'INSERT INTO phone_otp (phone, code, expires_at) VALUES (?, ?, ?)'
  ).run(phone, code, expires);

  // Send SMS
  const message = 'Azwell.mn: Нууц үг сэргээх код: ' + code + ' (10 минутын дотор)';
  try {
    if (sms && sms.send) await sms.send(phone, message);
  } catch (e) { console.warn('[forgot-pw-sms] failed:', e.message); }

  const debug = !sms || !sms.enabled() ? { dev_code: code } : {};
  res.json({ ok: true, ...debug });
});

// POST /api/auth/reset-password-sms — use phone + SMS code to set new password
router.post('/reset-password-sms', (req, res) => {
  let { phone, code, new_password } = req.body || {};
  phone = normalizePhone(phone);
  if (!phone || !code || !new_password) {
    return res.status(400).json({ error: 'phone, code and new_password required' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'new password must be at least 6 chars' });
  }
  const user = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
  if (!user) return res.status(404).json({ error: 'Хэрэглэгч олдсонгүй' });

  const row = db.prepare(
    'SELECT * FROM phone_otp WHERE phone = ? ORDER BY created_at DESC LIMIT 1'
  ).get(phone);
  if (!row) return res.status(404).json({ error: 'Код олдсонгүй' });
  if (row.verified) return res.status(400).json({ error: 'Код аль хэдийн ашиглагдсан' });
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: 'Кодны хугацаа дууссан' });
  }
  if (String(row.code) !== String(code).trim()) {
    db.prepare('UPDATE phone_otp SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    return res.status(401).json({ error: 'Код буруу байна' });
  }

  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
  db.prepare('UPDATE phone_otp SET verified = 1 WHERE id = ?').run(row.id);
  // Invalidate all sessions for security
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  res.json({ ok: true });
});

// POST /api/auth/reset-password — use token to set new password
router.post('/reset-password', (req, res) => {
  const { token, new_password } = req.body || {};
  if (!token || !new_password) {
    return res.status(400).json({ error: 'token and new_password required' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'new password must be at least 6 chars' });
  }
  const row = db.prepare('SELECT * FROM password_resets WHERE token = ?').get(token);
  if (!row || row.used) return res.status(400).json({ error: 'Invalid or used token' });
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: 'Token expired' });
  }
  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, row.user_id);
  db.prepare('UPDATE password_resets SET used = 1 WHERE token = ?').run(token);
  // Invalidate all sessions for security
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);
  res.json({ ok: true });
});

// Module exports
module.exports = router;
module.exports.requireAuth = router.requireAuth || requireAuth;
module.exports.requireAdmin = router.requireAdmin || requireAdmin;
