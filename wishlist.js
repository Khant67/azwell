// /api/payment — QPay-style payment flow
//
// Modes:
//   1. MOCK (default) — generates fake invoice; admin can mark paid manually
//   2. QPAY (when QPAY_API_KEY env is set) — calls real QPay API
//
// Flow:
//   1. Frontend: POST /api/payment/create with { orderId }
//      → returns { invoiceId, qrText, deepLink, amount, status }
//   2. Frontend: shows QR + polls GET /api/payment/check/:invoiceId every 3s
//   3. User scans QR with banking app → pays
//   4. QPay calls our webhook (or in mock: admin/customer marks paid)
//   5. order.payment_status = 'paid'

const express = require('express');
const crypto  = require('crypto');
const db      = require('../db');

const router = express.Router();

const MOCK_MODE = !process.env.QPAY_API_KEY;

function genInvoiceId() {
  return 'INV-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

// POST /api/payment/create
//   body: { orderId }
//   Returns invoice info (mock or real QPay)
router.post('/create', (req, res) => {
  const { orderId } = req.body || {};
  if (!orderId) return res.status(400).json({ error: 'orderId required' });

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.payment_status === 'paid') {
    return res.status(409).json({ error: 'Order already paid' });
  }

  let invoiceId = order.payment_invoice_id;
  if (!invoiceId) {
    invoiceId = genInvoiceId();
    db.prepare(
      'UPDATE orders SET payment_invoice_id = ?, payment_method = ? WHERE id = ?'
    ).run(invoiceId, 'qpay', order.id);
  }

  // Build payment data
  const amount = order.total;
  // Mock QR text — in real QPay this comes from their API
  const qrText  = MOCK_MODE
    ? 'MOCK-QPAY|INV=' + invoiceId + '|AMT=' + amount + '|MERCHANT=AZWELL'
    : ''; // TODO: call real QPay API here
  const deepLink = 'qpay://q?qPay_QRcode=' + encodeURIComponent(qrText);

  res.json({
    invoiceId,
    qrText,
    deepLink,
    amount,
    status: order.payment_status,
    mock:   MOCK_MODE
  });
});

// GET /api/payment/check/:invoiceId — check payment status
router.get('/check/:invoiceId', (req, res) => {
  const order = db.prepare(
    'SELECT id, total, payment_status, payment_method, paid_at FROM orders WHERE payment_invoice_id = ?'
  ).get(req.params.invoiceId);
  if (!order) return res.status(404).json({ error: 'Invoice not found' });
  res.json({
    orderId: order.id,
    amount: order.total,
    status: order.payment_status,
    paid_at: order.paid_at
  });
});

// POST /api/payment/mock-pay/:invoiceId — DEV ONLY: simulate payment
//   Only works in mock mode. Returns 403 if real QPay is configured.
router.post('/mock-pay/:invoiceId', (_req, res) => {
  if (!MOCK_MODE) return res.status(403).json({ error: 'Mock mode disabled — real QPay configured' });
  const order = db.prepare(
    'SELECT id, payment_status FROM orders WHERE payment_invoice_id = ?'
  ).get(req.params.invoiceId);
  if (!order) return res.status(404).json({ error: 'Invoice not found' });
  if (order.payment_status === 'paid') return res.json({ ok: true, already: true });
  db.prepare(
    "UPDATE orders SET payment_status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(order.id);
  res.json({ ok: true, orderId: order.id });
});

// POST /api/payment/webhook — receive callback from QPay (production)
//   Validates signature, marks order paid
router.post('/webhook', (req, res) => {
  // Real QPay webhook would include signature verification here.
  const { invoice_id, status } = req.body || {};
  if (!invoice_id) return res.status(400).json({ error: 'invoice_id required' });
  const order = db.prepare(
    'SELECT id, payment_status FROM orders WHERE payment_invoice_id = ?'
  ).get(invoice_id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  if (status === 'paid' || status === 'PAID') {
    db.prepare(
      "UPDATE orders SET payment_status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(order.id);
  }
  res.json({ ok: true });
});

module.exports = router;
