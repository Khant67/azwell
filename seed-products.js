// /api/reviews — customer reviews (public read, auth write)
const express = require('express');
const db      = require('../db');
const { requireAuth } = require('./auth');

const router = express.Router();

// GET /api/reviews — list approved reviews (newest first)
//   ?limit=20  (default 20, max 100)
router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const rows = db.prepare(
    'SELECT id, name, rating, product_name, comment, created_at FROM reviews WHERE approved = 1 ORDER BY created_at DESC LIMIT ?'
  ).all(limit);

  // Compute aggregate stats
  const stats = db.prepare(
    `SELECT
       COUNT(*) total,
       COALESCE(AVG(rating), 0) avg_rating,
       SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) r5,
       SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) r4,
       SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) r3,
       SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) r2,
       SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) r1
     FROM reviews WHERE approved = 1`
  ).get();

  res.json({
    reviews: rows,
    stats: {
      total:      stats.total,
      avg_rating: Math.round((stats.avg_rating || 0) * 10) / 10,
      breakdown:  { 5: stats.r5, 4: stats.r4, 3: stats.r3, 2: stats.r2, 1: stats.r1 }
    }
  });
});

// POST /api/reviews — create a review (auth required)
//   body: { rating, comment, product_name (optional) }
router.post('/', requireAuth, (req, res) => {
  const { rating, comment, product_name } = req.body || {};
  const r = parseInt(rating, 10);
  if (!r || r < 1 || r > 5) return res.status(400).json({ error: 'rating must be 1-5' });
  if (!comment || comment.length < 5) {
    return res.status(400).json({ error: 'Сэтгэгдэл хамгийн багадаа 5 тэмдэгт байх ёстой' });
  }
  if (comment.length > 1000) {
    return res.status(400).json({ error: 'Сэтгэгдэл хамгийн ихдээ 1000 тэмдэгт' });
  }

  // Rate limit: 1 review per user per 1 hour
  const recent = db.prepare(
    "SELECT id FROM reviews WHERE user_id = ? AND created_at >= datetime('now', '-1 hour') LIMIT 1"
  ).get(req.user.id);
  if (recent) return res.status(429).json({ error: 'Дараагийн сэтгэгдлийг 1 цагийн дараа бичих боломжтой' });

  const displayName = req.user.name || (req.user.email ? req.user.email.split('@')[0] : 'Хэрэглэгч');
  const info = db.prepare(
    'INSERT INTO reviews (user_id, name, rating, product_name, comment) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.id, displayName, r, product_name || null, comment.trim());

  res.status(201).json({
    review: db.prepare('SELECT * FROM reviews WHERE id = ?').get(Number(info.lastInsertRowid))
  });
});

// DELETE /api/reviews/:id — user can delete their own review
router.delete('/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT user_id FROM reviews WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.user_id !== req.user.id && !req.user.is_admin) {
    return res.status(403).json({ error: 'Та зөвхөн өөрийн сэтгэгдлээ устгах боломжтой' });
  }
  db.prepare('DELETE FROM reviews WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
