// SQLite using Node 22+ built-in node:sqlite (no native build step needed).
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs   = require('fs');

const DATA_DIR = process.env.AZWELL_DB_DIR || path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));
// db.exec('PRAGMA journal_mode = WAL;'); // skipped — some filesystems don't support shared-memory
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    UNIQUE NOT NULL COLLATE NOCASE,
    name          TEXT,
    phone         TEXT,
    password_hash TEXT    NOT NULL,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS orders (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER,
    customer_name    TEXT    NOT NULL,
    customer_phone   TEXT    NOT NULL,
    customer_address TEXT    NOT NULL,
    notes            TEXT,
    total            INTEGER NOT NULL,
    status           TEXT    NOT NULL DEFAULT 'pending',
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id     INTEGER NOT NULL,
    brand        TEXT    NOT NULL,
    product_name TEXT    NOT NULL,
    price        INTEGER NOT NULL,
    quantity     INTEGER NOT NULL CHECK (quantity > 0),
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_orders_user    ON orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

  CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    brand       TEXT    NOT NULL,
    section     TEXT,
    name        TEXT    NOT NULL,
    emoji       TEXT,
    class       TEXT,
    price       INTEGER NOT NULL,
    old_price   INTEGER NOT NULL DEFAULT 0,
    category    TEXT,
    image_path  TEXT,
    description TEXT,
    stock       INTEGER NOT NULL DEFAULT 100,
    active      INTEGER NOT NULL DEFAULT 1,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_products_brand    ON products(brand, active, sort_order);
  CREATE INDEX IF NOT EXISTS idx_products_active   ON products(active, sort_order);
  
  CREATE TABLE IF NOT EXISTS wishlist (
    user_id    INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, product_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_wishlist_user ON wishlist(user_id);

  CREATE INDEX IF NOT EXISTS idx_items_order    ON order_items(order_id);

  CREATE TABLE IF NOT EXISTS reviews (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER,
    name         TEXT    NOT NULL,
    rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    product_name TEXT,
    comment      TEXT    NOT NULL,
    approved     INTEGER NOT NULL DEFAULT 1,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_reviews_approved ON reviews(approved, created_at DESC);

  CREATE TABLE IF NOT EXISTS coupons (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    code            TEXT    UNIQUE NOT NULL COLLATE NOCASE,
    description     TEXT,
    discount_type   TEXT    NOT NULL DEFAULT 'percent', -- 'percent' or 'fixed'
    discount_value  INTEGER NOT NULL,
    min_order       INTEGER NOT NULL DEFAULT 0,
    max_uses        INTEGER NOT NULL DEFAULT 0, -- 0 = unlimited
    used_count      INTEGER NOT NULL DEFAULT 0,
    expires_at      DATETIME,
    active          INTEGER NOT NULL DEFAULT 1,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);

  CREATE TABLE IF NOT EXISTS delivery_zones (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL,
    region       TEXT    NOT NULL DEFAULT 'ub',
    fee          INTEGER NOT NULL,
    free_above   INTEGER NOT NULL DEFAULT 150000,
    estimated_h  INTEGER NOT NULL DEFAULT 24,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    active       INTEGER NOT NULL DEFAULT 1,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_delivery_zones_active ON delivery_zones(active, sort_order);

  CREATE TABLE IF NOT EXISTS phone_otp (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    phone      TEXT    NOT NULL,
    code       TEXT    NOT NULL,
    expires_at DATETIME NOT NULL,
    attempts   INTEGER NOT NULL DEFAULT 0,
    verified   INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_phone_otp_phone ON phone_otp(phone, created_at DESC);

  CREATE TABLE IF NOT EXISTS password_resets (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL,
    expires_at DATETIME NOT NULL,
    used       INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);

  CREATE TABLE IF NOT EXISTS brands (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    slug         TEXT    UNIQUE NOT NULL,
    display_name TEXT    NOT NULL,
    class        TEXT,
    color        TEXT,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    active       INTEGER NOT NULL DEFAULT 1,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_brands_active ON brands(active, sort_order);
`);

// Seed default delivery zones if empty
try {
  const dcount = db.prepare('SELECT COUNT(*) c FROM delivery_zones').get().c;
  if (dcount === 0) {
    const ins = db.prepare('INSERT INTO delivery_zones (name, region, fee, free_above, estimated_h, sort_order) VALUES (?,?,?,?,?,?)');
    [
      ['Сүхбаатар',         'ub',       4000,  150000, 24,  1],
      ['Чингэлтэй',         'ub',       4000,  150000, 24,  2],
      ['Баянгол',           'ub',       4000,  150000, 24,  3],
      ['Хан-Уул',           'ub',       5000,  150000, 24,  4],
      ['Баянзүрх',          'ub',       5000,  150000, 24,  5],
      ['Сонгино хайрхан',   'ub',       6000,  150000, 48,  6],
      ['Налайх',            'ub-far',   10000, 200000, 48,  7],
      ['Багануур',          'ub-far',   15000, 200000, 72,  8],
      ['Багахангай',        'ub-far',   12000, 200000, 72,  9],
      ['Орон нутаг',        'province', 25000, 300000, 168, 10]
    ].forEach(z => ins.run(...z));
    console.log('[db] Seeded 10 delivery zones');
  }
} catch (e) { console.warn('[db] delivery zone seed failed:', e.message); }

// Migration: add payment columns to orders
try {
  const cols = db.prepare("PRAGMA table_info(orders)").all();
  if (!cols.some(c => c.name === 'payment_method')) {
    db.exec("ALTER TABLE orders ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash'");
    console.log('[db] Migrated: added payment_method to orders');
  }
  if (!cols.some(c => c.name === 'payment_status')) {
    db.exec("ALTER TABLE orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'unpaid'");
    console.log('[db] Migrated: added payment_status to orders');
  }
  if (!cols.some(c => c.name === 'payment_invoice_id')) {
    db.exec("ALTER TABLE orders ADD COLUMN payment_invoice_id TEXT");
    console.log('[db] Migrated: added payment_invoice_id to orders');
  }
  if (!cols.some(c => c.name === 'paid_at')) {
    db.exec("ALTER TABLE orders ADD COLUMN paid_at DATETIME");
    console.log('[db] Migrated: added paid_at to orders');
  }
} catch (e) { console.warn('[db] payment migration failed:', e.message); }

// Migration: add coupon columns to orders
try {
  const cols = db.prepare("PRAGMA table_info(orders)").all();
  if (!cols.some(c => c.name === 'coupon_code')) {
    db.exec("ALTER TABLE orders ADD COLUMN coupon_code TEXT");
    console.log('[db] Migrated: added coupon_code to orders');
  }
  if (!cols.some(c => c.name === 'discount')) {
    db.exec("ALTER TABLE orders ADD COLUMN discount INTEGER NOT NULL DEFAULT 0");
    console.log('[db] Migrated: added discount to orders');
  }
} catch (e) { console.warn('[db] coupon migration failed:', e.message); }

// Migration: add delivery_fee + delivery_zone columns to orders
try {
  const cols = db.prepare("PRAGMA table_info(orders)").all();
  if (!cols.some(c => c.name === 'delivery_fee')) {
    db.exec("ALTER TABLE orders ADD COLUMN delivery_fee INTEGER NOT NULL DEFAULT 0");
    console.log('[db] Migrated: added delivery_fee to orders');
  }
  if (!cols.some(c => c.name === 'delivery_zone')) {
    db.exec("ALTER TABLE orders ADD COLUMN delivery_zone TEXT");
    console.log('[db] Migrated: added delivery_zone to orders');
  }
} catch (e) { console.warn('[db] orders migration failed:', e.message); }

// Seed default brands if empty
try {
  const count = db.prepare('SELECT COUNT(*) c FROM brands').get().c;
  if (count === 0) {
    const insert = db.prepare('INSERT INTO brands (slug, display_name, class, color, sort_order) VALUES (?,?,?,?,?)');
    [
      ['doublewood',    'Doublewood',     'dw', '#1a7a3e', 1],
      ['glasshouse',    'Glasshouse',     'gh', '#9a5c28', 2],
      ['perfectsports', 'Perfect Sports', 'ps', '#3a4048', 3],
      ['swisse',        'Swisse',         'sw', '#1566a0', 4],
      ['nutrix',        'Nutrex',         'nt', '#1aaba0', 5],
      ['musashi',       'Musashi',        'ms', '#2b8fa8', 6]
    ].forEach(b => insert.run(...b));
    console.log('[db] Seeded 6 default brands');
  }
} catch (e) { console.warn('[db] brands seed failed:', e.message); }


// Migration: add is_admin column to existing users tables
try {
  const cols = db.prepare("PRAGMA table_info(users)").all();
  if (!cols.some(c => c.name === 'is_admin')) {
    db.exec("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0");
    console.log('[db] Migrated: added is_admin to users table');
  }
} catch (e) { console.warn('[db] is_admin migration failed:', e.message); }

// transaction(fn) shim mimicking better-sqlite3
db.transaction = function(fn) {
  return (...args) => {
    db.exec('BEGIN');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };
};

module.exports = db;
