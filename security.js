// One-shot script: create or fix admin user with known password
// Usage: node scripts/make-admin.js
const bcrypt = require('bcryptjs');
const db     = require('../db');

const EMAIL    = 'admin@az.mn';
const PASSWORD = 'admin123';
const NAME     = 'Admin';

const hash = bcrypt.hashSync(PASSWORD, 10);

const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(EMAIL);

if (existing) {
  db.prepare('UPDATE users SET password_hash = ?, is_admin = 1 WHERE email = ?')
    .run(hash, EMAIL);
  console.log('\n✅ Updated existing user');
} else {
  db.prepare(
    'INSERT INTO users (email, password_hash, name, is_admin) VALUES (?, ?, ?, 1)'
  ).run(EMAIL, hash, NAME);
  console.log('\n✅ Created new admin user');
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('   Имэйл:    ' + EMAIL);
console.log('   Нууц үг:  ' + PASSWORD);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('\nОдоо http://localhost:3000/admin.html ор\n');

// Show all users to confirm
const all = db.prepare('SELECT id, email, is_admin FROM users').all();
console.log('Бүх хэрэглэгчид:');
all.forEach(u => console.log('  #' + u.id, u.email, '(admin:', u.is_admin === 1 ? 'тийм' : 'үгүй', ')'));
