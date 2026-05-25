// /api/products — read-only public endpoints with search/filter
const express = require('express');
const db      = require('../db');

const router = express.Router();

// GET /api/products
router.get('/', (req, res) => {
  const where  = ['active = 1'];
  const params = [];

  if (req.query.brand) {
    where.push('brand = ?');
    params.push(String(req.query.brand).toLowerCase());
  }
  if (req.query.section) {
    where.push('section = ?');
    params.push(String(req.query.section));
  }
  if (req.query.search) {
    const q = '%' + String(req.query.search).toLowerCase() + '%';
    where.push('(LOWER(name) LIKE ? OR LOWER(category) LIKE ? OR LOWER(brand) LIKE ?)');
    params.push(q, q, q);
  }
  const minP = parseInt(req.query.min_price, 10);
  if (Number.isFinite(minP)) { where.push('price >= ?'); params.push(minP); }
  const maxP = parseInt(req.query.max_price, 10);
  if (Number.isFinite(maxP)) { where.push('price <= ?'); params.push(maxP); }

  if (req.query.sale === '1') where.push('old_price > price');
  if (req.query.in_stock === '1') where.push('stock > 0');

  let orderBy = 'brand, sort_order, id';
  switch (req.query.sort) {
    case 'price_asc':  orderBy = 'price ASC, id'; break;
    case 'price_desc': orderBy = 'price DESC, id'; break;
    case 'newest':     orderBy = 'created_at DESC, id DESC'; break;
    case 'name':       orderBy = 'name ASC'; break;
  }

  const limit = Math.min(parseInt(req.query.limit, 10) || 500, 500);

  const rows = db.prepare(
    `SELECT id, brand, section, name, emoji, class, price, old_price, category,
            image_path, description, stock, sort_order, variants
     FROM products
     WHERE ${where.join(' AND ')}
     ORDER BY ${orderBy}
     LIMIT ?`
  ).all(...params, limit);

  res.json({ products: rows, count: rows.length });
});

router.get('/delivery-zones', (_req, res) => {
  const rows = db.prepare(
    'SELECT id, name, region, fee, free_above, estimated_h FROM delivery_zones WHERE active = 1 ORDER BY sort_order, id'
  ).all();
  res.json({ zones: rows, count: rows.length });
});

router.get('/brands', (_req, res) => {
  const rows = db.prepare(
    'SELECT id, slug, display_name, class, color, sort_order FROM brands WHERE active = 1 ORDER BY sort_order, id'
  ).all();
  res.json({ brands: rows, count: rows.length });
});

router.get('/categories', (_req, res) => {
  const rows = db.prepare(
    `SELECT DISTINCT category FROM products
     WHERE active = 1 AND category IS NOT NULL AND category != ''
     ORDER BY category`
  ).all();
  res.json({ categories: rows.map(r => r.category) });
});

router.get('/:id', (req, res) => {
  const row = db.prepare(
    `SELECT id, brand, section, name, emoji, class, price, old_price, category,
            image_path, description, stock, active, sort_order, variants
     FROM products WHERE id = ?`
  ).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json({ product: row });
});

module.exports = router;
