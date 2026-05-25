// /api/admin/* — admin-only endpoints
const express = require('express');
const db      = require('../db');
const { requireAdmin } = require('./auth');

const router = express.Router();

router.use(requireAdmin);

// ── orders ──────────────────────────────────────────────────────────────
const VALID_STATUSES = ['pending','confirmed','shipped','delivered','cancelled'];

router.get('/orders', (req, res) => {
  const where = [];
  const params = [];
  if (req.query.status) { where.push('status = ?'); params.push(String(req.query.status)); }
  if (req.query.from)   { where.push("DATE(created_at) >= DATE(?)"); params.push(String(req.query.from)); }
  if (req.query.to)     { where.push("DATE(created_at) <= DATE(?)"); params.push(String(req.query.to)); }
  const sql = `SELECT * FROM orders ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`;
  const orders = db.prepare(sql).all(...params);

  if (orders.length > 0) {
    const placeholders = orders.map(() => '?').join(',');
    const items = db.prepare(`SELECT * FROM order_items WHERE order_id IN (${placeholders})`).all(...orders.map(o => o.id));
    const map = new Map(orders.map(o => [o.id, { ...o, items: [] }]));
    for (const it of items) map.get(it.order_id).items.push(it);
    return res.json({ orders: Array.from(map.values()), count: orders.length });
  }
  res.json({ orders: [], count: 0 });
});

router.put('/orders/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const { status, notes } = req.body || {};
  const updates = []; const params = [];
  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    updates.push('status = ?'); params.push(status);
  }
  if (notes !== undefined) { updates.push('notes = ?'); params.push(notes || null); }
  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });
  params.push(req.params.id);
  db.prepare(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ order: db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id) });
});

// ── products ───────────────────────────────────────────────────────────
function validateProduct(b) {
  if (!b.brand || !b.name) return 'brand and name are required';
  const price = parseInt(b.price, 10);
  if (!Number.isFinite(price) || price < 0) return 'price must be a non-negative integer';
  return null;
}

function normalizeVariants(v) {
  if (v === null || v === undefined || v === '') return null;
  try {
    const parsed = typeof v === 'string' ? JSON.parse(v) : v;
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.options) && parsed.options.length > 0) {
      return JSON.stringify(parsed);
    }
  } catch (_) {}
  return null;
}

router.post('/products', (req, res) => {
  const err = validateProduct(req.body || {});
  if (err) return res.status(400).json({ error: err });
  const b = req.body;
  const variantsJson = normalizeVariants(b.variants);
  const info = db.prepare(`
    INSERT INTO products
      (brand, section, name, emoji, class, price, old_price, category, image_path, description, stock, active, sort_order, variants)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    b.brand, b.section || null, b.name, b.emoji || null, b.class || null,
    parseInt(b.price, 10), parseInt(b.old_price, 10) || 0,
    b.category || null, b.image_path || null, b.description || null,
    parseInt(b.stock, 10) || 100,
    b.active === false ? 0 : 1,
    parseInt(b.sort_order, 10) || 0,
    variantsJson
  );
  const id = Number(info.lastInsertRowid);
  res.status(201).json({ product: db.prepare('SELECT * FROM products WHERE id = ?').get(id) });
});

router.put('/products/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const fields = ['brand','section','name','emoji','class','price','old_price','category','image_path','description','stock','active','sort_order','variants'];
  const updates = []; const params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      let v = req.body[f];
      if (['price','old_price','stock','sort_order'].includes(f)) v = parseInt(v, 10) || 0;
      if (f === 'active') v = v ? 1 : 0;
      if (f === 'variants') v = normalizeVariants(v);
      updates.push(`${f} = ?`); params.push(v);
    }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });
  updates.push("updated_at = CURRENT_TIMESTAMP");
  params.push(req.params.id);
  db.prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ product: db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id) });
});

router.delete('/products/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (req.query.hard === '1') {
    db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    res.json({ ok: true, deleted: 'hard' });
  } else {
    db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(req.params.id);
    res.json({ ok: true, deleted: 'soft' });
  }
});

router.get('/products', (_req, res) => {
  const rows = db.prepare('SELECT * FROM products ORDER BY brand, sort_order, id').all();
  res.json({ products: rows, count: rows.length });
});

// ── users ───────────────────────────────────────────────────────────────
router.get('/users', (_req, res) => {
  const rows = db.prepare(
    `SELECT id, email, name, phone, is_admin, created_at,
            (SELECT COUNT(*) FROM orders WHERE user_id = users.id) order_count
     FROM users ORDER BY created_at DESC`
  ).all();
  res.json({ users: rows, count: rows.length });
});

// GET /api/admin/coupons/:code/orders — list orders that used this coupon
router.get('/coupons/:code/orders', (req, res) => {
  const code = String(req.params.code);
  const orders = db.prepare(
    `SELECT * FROM orders WHERE coupon_code = ? AND status != 'cancelled' ORDER BY created_at DESC`
  ).all(code);
  if (orders.length > 0) {
    const placeholders = orders.map(() => '?').join(',');
    const items = db.prepare(
      `SELECT * FROM order_items WHERE order_id IN (${placeholders})`
    ).all(...orders.map(o => o.id));
    const map = new Map(orders.map(o => [o.id, { ...o, items: [] }]));
    for (const it of items) map.get(it.order_id).items.push(it);
    return res.json({ orders: Array.from(map.values()), count: orders.length });
  }
  res.json({ orders: [], count: 0 });
});

// ── coupons ─────────────────────────────────────────────────────────────
router.get('/coupons', (_req, res) => {
  const rows = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM orders o WHERE o.coupon_code = c.code AND o.status != 'cancelled') AS orders_count,
      (SELECT COALESCE(SUM(oi.quantity),0) FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         WHERE o.coupon_code = c.code AND o.status != 'cancelled') AS items_sold,
      (SELECT COALESCE(SUM(o.total),0) FROM orders o WHERE o.coupon_code = c.code AND o.status != 'cancelled') AS total_revenue,
      (SELECT COALESCE(SUM(o.discount),0) FROM orders o WHERE o.coupon_code = c.code AND o.status != 'cancelled') AS total_discount
    FROM coupons c
    ORDER BY c.created_at DESC
  `).all();
  res.json({ coupons: rows, count: rows.length });
});

router.post('/coupons', (req, res) => {
  const { code, description, discount_type, discount_value, min_order, max_uses, expires_at } = req.body || {};
  if (!code || !discount_value) return res.status(400).json({ error: 'code and discount_value required' });
  const type = discount_type === 'fixed' ? 'fixed' : 'percent';
  if (type === 'percent' && (discount_value < 0 || discount_value > 100)) {
    return res.status(400).json({ error: 'percent discount must be 0-100' });
  }
  const exists = db.prepare('SELECT id FROM coupons WHERE code = ? COLLATE NOCASE').get(code);
  if (exists) return res.status(409).json({ error: 'Code already exists' });
  const info = db.prepare(
    'INSERT INTO coupons (code, description, discount_type, discount_value, min_order, max_uses, expires_at) VALUES (?,?,?,?,?,?,?)'
  ).run(String(code).toUpperCase(), description || null, type, parseInt(discount_value, 10), parseInt(min_order || 0, 10), parseInt(max_uses || 0, 10), expires_at || null);
  res.status(201).json({ coupon: db.prepare('SELECT * FROM coupons WHERE id = ?').get(Number(info.lastInsertRowid)) });
});

router.put('/coupons/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM coupons WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  const fields = ['description','discount_type','discount_value','min_order','max_uses','expires_at','active'];
  const updates = []; const params = [];
  for (const f of fields) {
    if (req.body && req.body[f] !== undefined) { updates.push(f + ' = ?'); params.push(req.body[f]); }
  }
  if (updates.length === 0) return res.json({ coupon: c });
  params.push(c.id);
  db.prepare(`UPDATE coupons SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ coupon: db.prepare('SELECT * FROM coupons WHERE id = ?').get(c.id) });
});

router.delete('/coupons/:id', (req, res) => {
  db.prepare('DELETE FROM coupons WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/orders/export.csv', (req, res) => {
  const where = []; const params = [];
  if (req.query.status) { where.push('status = ?'); params.push(req.query.status); }
  if (req.query.from)   { where.push("created_at >= ?"); params.push(req.query.from); }
  if (req.query.to)     { where.push("created_at <= ?"); params.push(req.query.to + ' 23:59:59'); }
  const sql = `SELECT * FROM orders ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id ASC`;
  const orders = db.prepare(sql).all(...params);
  let itemsByOrder = new Map();
  if (orders.length > 0) {
    const placeholders = orders.map(() => '?').join(',');
    const items = db.prepare(`SELECT * FROM order_items WHERE order_id IN (${placeholders})`).all(...orders.map(o => o.id));
    for (const it of items) {
      if (!itemsByOrder.has(it.order_id)) itemsByOrder.set(it.order_id, []);
      itemsByOrder.get(it.order_id).push(it);
    }
  }
  function csvCell(v) {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  const STATUS_MN = { pending:'Хүлээгдэж байгаа', confirmed:'Баталгаажсан', shipped:'Хүргэлтэнд гарсан', delivered:'Хүргэгдсэн', cancelled:'Цуцлагдсан' };
  const header = ['ID','Огноо','Захиалагч','Утас','Хаяг','Бараа','Тоо','Нийт ₮','Хүргэлт ₮','Бүс','Тэмдэглэл','Статус'];
  const lines = [header.map(csvCell).join(',')];
  for (const o of orders) {
    const items = itemsByOrder.get(o.id) || [];
    const itemsStr = items.map(i => i.brand + ' — ' + i.product_name + ' ×' + i.quantity).join(' | ');
    const totalQty = items.reduce((s, i) => s + i.quantity, 0);
    lines.push([o.id, o.created_at, o.customer_name, o.customer_phone, o.customer_address, itemsStr, totalQty, o.total, o.delivery_fee || 0, o.delivery_zone || '', o.notes || '', STATUS_MN[o.status] || o.status].map(csvCell).join(','));
  }
  const csv = '﻿' + lines.join('\r\n');
  const filename = 'azwell-orders-' + new Date().toISOString().slice(0,10) + '.csv';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
  res.send(csv);
});

// ── reports ─────────────────────────────────────────────────────────────
router.get('/reports/summary', (_req, res) => {
  const today = db.prepare("SELECT COUNT(*) c, COALESCE(SUM(total),0) s FROM orders WHERE status != 'cancelled' AND DATE(created_at) = DATE('now')").get();
  const week  = db.prepare("SELECT COUNT(*) c, COALESCE(SUM(total),0) s FROM orders WHERE status != 'cancelled' AND created_at >= datetime('now', '-7 days')").get();
  const month = db.prepare("SELECT COUNT(*) c, COALESCE(SUM(total),0) s FROM orders WHERE status != 'cancelled' AND created_at >= datetime('now', '-30 days')").get();
  const all   = db.prepare("SELECT COUNT(*) c, COALESCE(SUM(total),0) s, COALESCE(AVG(total),0) a FROM orders WHERE status != 'cancelled'").get();
  const pending = db.prepare("SELECT COUNT(*) c FROM orders WHERE status = 'pending'").get().c;
  res.json({
    today:   { orders: today.c, revenue: today.s },
    week:    { orders: week.c,  revenue: week.s },
    month:   { orders: month.c, revenue: month.s },
    all:     { orders: all.c,   revenue: all.s, avg_order: Math.round(all.a) },
    pending_count: pending
  });
});

router.get('/reports/sales', (req, res) => {
  const period = req.query.period || 'day';
  const days   = Math.min(parseInt(req.query.days, 10) || 30, 365);
  let groupBy;
  if (period === 'month') groupBy = "strftime('%Y-%m', created_at)";
  else if (period === 'week') groupBy = "strftime('%Y-W%W', created_at)";
  else groupBy = "strftime('%Y-%m-%d', created_at)";
  const rows = db.prepare(
    `SELECT ${groupBy} period, COUNT(*) orders, COALESCE(SUM(total),0) revenue
     FROM orders WHERE status != 'cancelled' AND created_at >= datetime('now', '-' || ? || ' days')
     GROUP BY ${groupBy} ORDER BY period ASC`
  ).all(days);
  res.json({ data: rows, period, days });
});

router.get('/reports/top-products', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
  const rows = db.prepare(
    `SELECT oi.brand, oi.product_name name, SUM(oi.quantity) qty_sold, SUM(oi.quantity * oi.price) revenue
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.status != 'cancelled'
     GROUP BY oi.brand, oi.product_name ORDER BY qty_sold DESC LIMIT ?`
  ).all(limit);
  res.json({ products: rows });
});

router.get('/reports/export.csv', (req, res) => {
  function csvCell(v) {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function row(arr) { return arr.map(csvCell).join(','); }
  const lines = [];
  lines.push(row(['Azwell.mn — Бизнесийн тайлан']));
  lines.push(row(['Үүсгэсэн', new Date().toISOString().slice(0, 19).replace('T', ' ')]));
  lines.push('');
  const today = db.prepare("SELECT COUNT(*) c, COALESCE(SUM(total),0) s FROM orders WHERE status != 'cancelled' AND DATE(created_at) = DATE('now')").get();
  const week  = db.prepare("SELECT COUNT(*) c, COALESCE(SUM(total),0) s FROM orders WHERE status != 'cancelled' AND created_at >= datetime('now', '-7 days')").get();
  const month = db.prepare("SELECT COUNT(*) c, COALESCE(SUM(total),0) s FROM orders WHERE status != 'cancelled' AND created_at >= datetime('now', '-30 days')").get();
  const all   = db.prepare("SELECT COUNT(*) c, COALESCE(SUM(total),0) s, COALESCE(AVG(total),0) a FROM orders WHERE status != 'cancelled'").get();
  lines.push(row(['=== KPI ===']));
  lines.push(row(['Үзүүлэлт', 'Захиалга', 'Орлого (₮)']));
  lines.push(row(['Өнөөдөр', today.c, today.s]));
  lines.push(row(['Сүүлийн 7 хоног', week.c, week.s]));
  lines.push(row(['Сүүлийн 30 хоног', month.c, month.s]));
  lines.push(row(['Нийт', all.c, all.s]));
  const csv = '﻿' + lines.join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="azwell-report.csv"');
  res.send(csv);
});

router.get('/reports/top-brands', (_req, res) => {
  const rows = db.prepare(
    `SELECT oi.brand, SUM(oi.quantity) qty_sold, SUM(oi.quantity * oi.price) revenue, COUNT(DISTINCT o.id) orders
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.status != 'cancelled'
     GROUP BY oi.brand ORDER BY revenue DESC`
  ).all();
  res.json({ brands: rows });
});

router.get('/stats', (_req, res) => {
  res.json({
    users_total:        db.prepare('SELECT COUNT(*) c FROM users').get().c,
    orders_total:       db.prepare('SELECT COUNT(*) c FROM orders').get().c,
    orders_pending:     db.prepare("SELECT COUNT(*) c FROM orders WHERE status='pending'").get().c,
    revenue_total:      db.prepare("SELECT COALESCE(SUM(total),0) s FROM orders WHERE status NOT IN ('cancelled')").get().s,
    products_total:     db.prepare('SELECT COUNT(*) c FROM products').get().c,
    products_active:    db.prepare('SELECT COUNT(*) c FROM products WHERE active = 1').get().c
  });
});

router.post('/upload-image', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const { brand, filename, dataUrl } = req.body || {};
  if (!brand || !filename || !dataUrl) return res.status(400).json({ error: 'brand, filename, dataUrl required' });
  const safeName = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
  const brandRow = db.prepare('SELECT slug FROM brands WHERE slug = ?').get(brand);
  if (!brandRow) return res.status(400).json({ error: 'unknown brand' });
  const m = String(dataUrl).match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
  if (!m) return res.status(400).json({ error: 'invalid dataUrl' });
  const ext = m[1].split('/')[1].replace('+xml','').replace(/^jpeg$/,'jpg').toLowerCase();
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 5 * 1024 * 1024) return res.status(413).json({ error: 'image too large (max 5MB)' });
  let final = safeName;
  if (!/\.[a-zA-Z0-9]+$/.test(final)) final = final + '.' + ext;
  const dir = path.join(__dirname, '..', '..', 'brands', brand, 'products');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, final), buf);
  res.status(201).json({ ok: true, image_path: '../brands/' + brand + '/products/' + final, size: buf.length });
});

router.get('/categories', (_req, res) => {
  const rows = db.prepare(
    `SELECT category, COUNT(*) c FROM products
     WHERE category IS NOT NULL AND category != ''
     GROUP BY category ORDER BY category`
  ).all();
  res.json({ categories: rows, count: rows.length });
});

router.delete('/categories/:name', (req, res) => {
  const name = String(req.params.name || '');
  if (!name) return res.status(400).json({ error: 'name required' });
  const info = db.prepare("UPDATE products SET category = NULL WHERE category = ?").run(name);
  res.json({ ok: true, affected: info.changes });
});

// ── brands ──────────────────────────────────────────────────────────────
router.get('/brands', (_req, res) => {
  const rows = db.prepare('SELECT id, slug, display_name, class, color, sort_order, active FROM brands ORDER BY sort_order, id').all();
  res.json({ brands: rows, count: rows.length });
});

router.post('/brands', (req, res) => {
  const { slug, display_name, class: cls, color, sort_order } = req.body || {};
  if (!slug || !display_name) return res.status(400).json({ error: 'slug and display_name required' });
  const safeSlug = String(slug).toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!safeSlug) return res.status(400).json({ error: 'invalid slug' });
  const existing = db.prepare('SELECT id FROM brands WHERE slug = ?').get(safeSlug);
  if (existing) return res.status(409).json({ error: 'slug already exists' });
  const nextSort = (db.prepare('SELECT MAX(sort_order) m FROM brands').get().m || 0) + 1;
  const info = db.prepare(
    'INSERT INTO brands (slug, display_name, class, color, sort_order) VALUES (?,?,?,?,?)'
  ).run(safeSlug, display_name, cls || safeSlug.slice(0,2), color || '#1a6e8a', sort_order || nextSort);
  const created = db.prepare('SELECT * FROM brands WHERE id = ?').get(Number(info.lastInsertRowid));
  try {
    const fs = require('fs');
    const path = require('path');
    fs.mkdirSync(path.join(__dirname, '..', '..', 'brands', safeSlug, 'products'), { recursive: true });
  } catch (_) {}
  res.status(201).json({ brand: created });
});

router.put('/brands/:id', (req, res) => {
  const brand = db.prepare('SELECT * FROM brands WHERE id = ?').get(req.params.id);
  if (!brand) return res.status(404).json({ error: 'brand not found' });
  const fields = ['display_name','class','color','sort_order','active'];
  const updates = []; const params = [];
  for (const f of fields) {
    if (req.body && req.body[f] !== undefined) { updates.push(f + ' = ?'); params.push(req.body[f]); }
  }
  if (updates.length === 0) return res.json({ brand });
  params.push(brand.id);
  db.prepare(`UPDATE brands SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ brand: db.prepare('SELECT * FROM brands WHERE id = ?').get(brand.id) });
});

router.post('/brands/:id/banner', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const brand = db.prepare('SELECT * FROM brands WHERE id = ?').get(req.params.id);
  if (!brand) return res.status(404).json({ error: 'brand not found' });
  const { dataUrl } = req.body || {};
  if (!dataUrl) return res.status(400).json({ error: 'dataUrl required' });
  const m = String(dataUrl).match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
  if (!m) return res.status(400).json({ error: 'invalid dataUrl' });
  const ext = m[1].split('/')[1].replace('+xml','').replace(/^jpeg$/,'jpg').toLowerCase();
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 8 * 1024 * 1024) return res.status(413).json({ error: 'image too large (max 8MB)' });
  const dir = path.join(__dirname, '..', '..', 'brands', brand.slug);
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.readdirSync(dir).forEach(f => { if (/^banner\.(png|jpg|jpeg|webp|gif|svg)$/i.test(f)) fs.unlinkSync(path.join(dir, f)); });
  } catch (_) {}
  fs.writeFileSync(path.join(dir, 'banner.' + ext), buf);
  res.status(201).json({ ok: true, banner_path: '../brands/' + brand.slug + '/banner.' + ext, size: buf.length });
});

router.post('/brands/:id/logo', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const brand = db.prepare('SELECT * FROM brands WHERE id = ?').get(req.params.id);
  if (!brand) return res.status(404).json({ error: 'brand not found' });
  const { dataUrl } = req.body || {};
  if (!dataUrl) return res.status(400).json({ error: 'dataUrl required' });
  const m = String(dataUrl).match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
  if (!m) return res.status(400).json({ error: 'invalid dataUrl' });
  const ext = m[1].split('/')[1].replace('+xml','').replace(/^jpeg$/,'jpg').toLowerCase();
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 2 * 1024 * 1024) return res.status(413).json({ error: 'logo too large (max 2MB)' });
  const dir = path.join(__dirname, '..', '..', 'brands', brand.slug);
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.readdirSync(dir).forEach(f => { if (/^logo\.(png|jpg|jpeg|webp|gif|svg)$/i.test(f)) fs.unlinkSync(path.join(dir, f)); });
  } catch (_) {}
  fs.writeFileSync(path.join(dir, 'logo.' + ext), buf);
  res.status(201).json({ ok: true, logo_path: '../brands/' + brand.slug + '/logo.' + ext, size: buf.length });
});

router.delete('/brands/:id', (req, res) => {
  const brand = db.prepare('SELECT * FROM brands WHERE id = ?').get(req.params.id);
  if (!brand) return res.status(404).json({ error: 'brand not found' });
  const used = db.prepare('SELECT COUNT(*) c FROM products WHERE brand = ?').get(brand.slug).c;
  if (used > 0) return res.status(409).json({ error: 'brand used by ' + used + ' products' });
  db.prepare('DELETE FROM brands WHERE id = ?').run(brand.id);
  res.json({ ok: true });
});

// ── backups ──────────────────────────────────────────────────────────────
const backup = require('../backup');

router.get('/backups', (_req, res) => {
  res.json({ backups: backup.list(), dir: backup.BACKUP_DIR });
});

router.post('/backups/run', (_req, res) => {
  const file = backup.runNow();
  if (!file) return res.status(500).json({ error: 'Backup failed' });
  res.json({ ok: true, file });
});

module.exports = router;
