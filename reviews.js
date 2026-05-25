// /api/orders — place an order, list current user's orders
// Now with stock checking + decrement.
const express = require('express');
const db      = require('../db');
const { requireAuth } = require('./auth');
const mailer = require('../mailer');

const router = express.Router();

function softAuth(req, _res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (token) {
    const row = db.prepare(
      `SELECT users.* FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token = ?`
    ).get(token);
    if (row) req.user = row;
  }
  next();
}

const couponsRoute = require('./coupons');

// SMS notification module
let sms;
try { sms = require('../sms'); } catch (_) { sms = null; }

router.post('/', requireAuth, (req, res) => {
  const { customer, items, delivery_zone_id, coupon_code } = req.body || {};

  if (!customer || typeof customer !== 'object') {
    return res.status(400).json({ error: 'customer info required' });
  }
  const { name, phone, address, notes, email } = customer;
  if (!name || !phone || !address) {
    return res.status(400).json({ error: 'customer.name, phone, address required' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items must be a non-empty array' });
  }

  const cleanItems = [];
  let subtotal = 0;
  for (const it of items) {
    const price = parseInt(it.price, 10);
    const qty   = parseInt(it.quantity, 10);
    if (!it.brand || !it.name || !Number.isFinite(price) || price < 0 || !Number.isFinite(qty) || qty < 1) {
      return res.status(400).json({ error: 'invalid item: ' + JSON.stringify(it) });
    }
    subtotal += price * qty;
    cleanItems.push({ brand: it.brand, name: it.name, price, quantity: qty, variant: it.variant ? String(it.variant).slice(0, 100) : null });
  }

  // Compute delivery fee from zone (server-side authoritative)
  let deliveryFee  = 0;
  let deliveryZone = null;
  if (delivery_zone_id) {
    const zone = db.prepare(
      'SELECT * FROM delivery_zones WHERE id = ? AND active = 1'
    ).get(delivery_zone_id);
    if (!zone) return res.status(400).json({ error: 'Invalid delivery zone' });
    deliveryFee  = subtotal >= zone.free_above ? 0 : zone.fee;
    deliveryZone = zone.name;
  }

  // Apply coupon (server-side authoritative)
  let discount    = 0;
  let couponCode  = null;
  let appliedCoupon = null;
  if (coupon_code) {
    const c = db.prepare('SELECT * FROM coupons WHERE code = ? COLLATE NOCASE').get(coupon_code);
    if (c && c.active &&
        (!c.expires_at || new Date(c.expires_at).getTime() >= Date.now()) &&
        (c.max_uses === 0 || c.used_count < c.max_uses) &&
        subtotal >= c.min_order) {
      discount = couponsRoute.computeDiscount(c, subtotal);
      couponCode = c.code;
      appliedCoupon = c;
    } else {
      return res.status(400).json({ error: 'Купон код буруу эсвэл хүчингүй байна' });
    }
  }

  const total = subtotal + deliveryFee - discount;

  // Look up products by (brand, name) — case-insensitive on brand
  const productLookup = db.prepare(
    "SELECT id, brand, name, stock FROM products WHERE LOWER(brand) = LOWER(?) AND name = ? AND active = 1"
  );

  // Stock check (before transaction)
  for (const it of cleanItems) {
    const prod = productLookup.get(it.brand, it.name);
    if (prod) {
      if (prod.stock < it.quantity) {
        return res.status(409).json({
          error: `Үлдэгдэл хүрэлцэхгүй: "${it.name}" — үлдсэн ${prod.stock}, захиалсан ${it.quantity}`,
          product_name: it.name,
          available: prod.stock,
          requested: it.quantity
        });
      }
      it._productId = prod.id;
    }
    // If product not found in DB (legacy / manual order), allow it without stock tracking
  }

  const insertOrder = db.prepare(`
    INSERT INTO orders (user_id, customer_name, customer_phone, customer_address, notes, total, delivery_fee, delivery_zone, coupon_code, discount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertItem  = db.prepare(`
    INSERT INTO order_items (order_id, brand, product_name, price, quantity, variant)
    VALUES (?, ?, ?, ?, ?, ?)`);
  const decrementStock = db.prepare(
    "UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?"
  );

  const tx = db.transaction(() => {
    if (appliedCoupon) {
      db.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?').run(appliedCoupon.id);
    }
    const info = insertOrder.run(
      req.user ? req.user.id : null,
      name, phone, address, notes || null, total, deliveryFee, deliveryZone, couponCode, discount
    );
    const orderId = Number(info.lastInsertRowid);
    for (const it of cleanItems) {
      insertItem.run(orderId, it.brand, it.name, it.price, it.quantity, it.variant || null);
      if (it._productId) {
        const r = decrementStock.run(it.quantity, it._productId, it.quantity);
        if (r.changes === 0) {
          throw new Error(`Stock race: ${it.name} not enough`);
        }
      }
    }
    return orderId;
  });

  try {
    const orderId = tx();
    res.status(201).json({ orderId, total, status: 'pending' });

    // Fire-and-forget SMS notifications (do not block the response)
    if (sms && sms.enabled()) {
      // SMS to customer
      const customerMsg = 'Azwell.mn: Захиалга #' + orderId + ' амжилттай үүсэв. Нийт: ' + total.toLocaleString() + 'төг. Бид удахгүй холбогдоно. 9700-3939';
      sms.send(phone, customerMsg).catch(()=>{});

      // SMS to admin
      const adminPhone = process.env.ADMIN_PHONE;
      if (adminPhone) {
        const itemsStr = cleanItems.map(i => i.name + ' x' + i.quantity).join(', ');
        const adminMsg = '🔔 Шинэ захиалга #' + orderId + ' - ' + name + ' (' + phone + '), ' + total.toLocaleString() + 'төг. ' + itemsStr.slice(0, 100);
        sms.send(adminPhone, adminMsg).catch(()=>{});
      }
    }

    // Fire-and-forget emails (optional, only if configured)
    if (mailer.enabled()) {
      const orderForEmail = {
        id: orderId,
        customer_name: name,
        customer_phone: phone,
        customer_address: address,
        notes: notes || null,
        total,
        items: cleanItems
      };
      mailer.notifyAdmin(orderForEmail).catch(()=>{});
      // Use email from request if provided; otherwise from logged-in user
      const customerEmail = email || (req.user ? req.user.email : null);
      if (customerEmail) mailer.notifyCustomer(orderForEmail, customerEmail).catch(()=>{});
    }
  } catch (e) {
    res.status(409).json({ error: e.message });
  }
});

router.get('/me', requireAuth, (req, res) => {
  const orders = db.prepare(
    'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.user.id);

  let withItems;
  if (orders.length === 0) {
    withItems = [];
  } else {
    const placeholders = orders.map(() => '?').join(',');
    const all = db.prepare(
      `SELECT * FROM order_items WHERE order_id IN (${placeholders})`
    ).all(...orders.map(o => o.id));
    const map = new Map(orders.map(o => [o.id, { ...o, items: [] }]));
    for (const it of all) map.get(it.order_id).items.push(it);
    withItems = Array.from(map.values());
  }

  res.json({ orders: withItems });
});

router.get('/:id', requireAuth, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  res.json({ order });
});

// POST /api/orders/:id/cancel — user can cancel their own pending order
//   Restocks the products that were decremented.
router.post('/:id/cancel', requireAuth, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status !== 'pending') {
    return res.status(409).json({ error: 'Зөвхөн "Хүлээгдэж байгаа" төлөвт байгаа захиалгыг цуцлах боломжтой' });
  }

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  try {
    const tx = db.transaction(() => {
      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('cancelled', order.id);
      // Try to restock products
      for (const it of items) {
        const prod = db.prepare(
          "SELECT id FROM products WHERE LOWER(brand) = LOWER(?) AND name = ? AND active = 1"
        ).get(it.brand, it.product_name);
        if (prod) {
          db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(it.quantity, prod.id);
        }
      }
    });
    tx();
    res.json({ ok: true, order: db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
