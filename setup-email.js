// /api/wishlist — user's favorite products (auth required)
const express = require('express');
const db      = require('../db');
const { requireAuth } = require('./auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/wishlist  — list of products in user's wishlist (full product data)
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, w.created_at AS added_at
    FROM wishlist w
    JOIN products p ON p.id = w.product_id
    WHERE w.user_id = ? AND p.active = 1
    ORDER BY w.created_at DESC
  `).all(req.user.id);
  res.json({ products: rows, count: rows.length });
});

// GET /api/wishlist/ids — just the product ids (lightweight, for heart-button sync)
router.get('/ids', (req, res) => {
  const rows = db.prepare(
    'SELECT product_id FROM wishlist WHERE user_id = ?'
  ).all(req.user.id);
  res.json({ ids: rows.map(r => r.product_id) });
});

// POST /api/wishlist/:productId — add to wishlist
router.post('/:productId', (req, res) => {
  const pid = parseInt(req.params.productId, 10);
  if (!Number.isFinite(pid)) return res.status(400).json({ error: 'invalid product id' });
  const prod = db.prepare('SELECT id FROM products WHERE id = ? AND active = 1').get(pid);
  if (!prod) return res.status(404).json({ error: 'product not found' });
  db.prepare(
    'INSERT OR IGNORE INTO wishlist (user_id, product_id) VALUES (?, ?)'
  ).run(req.user.id, pid);
  res.status(201).json({ ok: true, product_id: pid });
});

// DELETE /api/wishlist/:productId — remove from wishlist
router.delete('/:productId', (req, res) => {
  const pid = parseInt(req.params.productId, 10);
  db.prepare(
    'DELETE FROM wishlist WHERE user_id = ? AND product_id = ?'
  ).run(req.user.id, pid);
  res.json({ ok: true, product_id: pid });
});

module.exports = router;
