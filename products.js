// /api/coupons — public coupon validation
const express = require('express');
const db      = require('../db');

const router = express.Router();

// Helper to compute discount for a coupon given subtotal
function computeDiscount(coupon, subtotal) {
  if (coupon.discount_type === 'percent') {
    return Math.round(subtotal * coupon.discount_value / 100);
  }
  return Math.min(coupon.discount_value, subtotal);
}

// Validate a coupon for a given subtotal
//   POST /api/coupons/validate { code, subtotal }
//   Returns { valid, discount, message }
router.post('/validate', (req, res) => {
  const { code, subtotal } = req.body || {};
  if (!code) return res.status(400).json({ error: 'code required' });
  const sub = parseInt(subtotal, 10) || 0;

  const c = db.prepare('SELECT * FROM coupons WHERE code = ? COLLATE NOCASE').get(code);
  if (!c) return res.status(404).json({ valid: false, error: 'Купон код олдсонгүй' });
  if (!c.active) return res.status(400).json({ valid: false, error: 'Купон идэвхгүй байна' });
  if (c.expires_at && new Date(c.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ valid: false, error: 'Купон хугацаа дууссан' });
  }
  if (c.max_uses > 0 && c.used_count >= c.max_uses) {
    return res.status(400).json({ valid: false, error: 'Купон ашиглах эрх дууссан' });
  }
  if (c.min_order > 0 && sub < c.min_order) {
    return res.status(400).json({
      valid: false,
      error: 'Захиалгын дүн дор хаяж ' + c.min_order.toLocaleString() + '₮ байх ёстой'
    });
  }
  const discount = computeDiscount(c, sub);
  res.json({
    valid: true,
    code: c.code,
    description: c.description,
    discount_type: c.discount_type,
    discount_value: c.discount_value,
    discount,
    new_total: sub - discount
  });
});

module.exports = router;
module.exports.computeDiscount = computeDiscount;
