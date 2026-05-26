// Email notifications using nodemailer + Gmail SMTP.
//
// Configuration (env vars or .env file):
//   SMTP_HOST     = smtp.gmail.com         (default)
//   SMTP_PORT     = 587                    (default)
//   SMTP_USER     = your-email@gmail.com   (Gmail account that sends)
//   SMTP_PASS     = app password           (16-char Gmail App Password)
//   ADMIN_EMAIL   = where-to-notify@x.mn   (your business email)
//   FROM_NAME     = "Azwellness.mn"        (display name)

const fs = require('fs');
const path = require('path');

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach(line => {
    if (!line.trim() || line.startsWith('#')) return;
    const idx = line.indexOf('=');
    if (idx < 0) return;
    const k = line.slice(0, idx).trim();
    let v = line.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  });
}
loadEnv(path.join(__dirname, '.env'));

let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch (_) {}

let transporter = null;
let enabled = false;

function init() {
  if (!nodemailer) {
    console.warn('[mailer] nodemailer not installed — emails disabled');
    return;
  }
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    console.warn('[mailer] SMTP_USER/SMTP_PASS not set — emails disabled');
    return;
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: { user, pass }
  });
  enabled = true;
  console.log('[mailer] ready — sending from', user);
}
init();

function fromAddr() {
  const name = process.env.FROM_NAME || 'Azwellness.mn';
  return `"${name}" <${process.env.SMTP_USER}>`;
}

function fmtItems(items) {
  return items.map(it =>
    `  - ${it.brand} - ${it.name || it.product_name} x${it.quantity}    ${(it.price * it.quantity).toLocaleString()} MNT`
  ).join('\n');
}

async function notifyAdmin(order) {
  if (!enabled) return { sent: false, reason: 'disabled' };
  const to = process.env.ADMIN_EMAIL;
  if (!to) return { sent: false, reason: 'no_admin_email' };

  const subject = 'Shine zahialga #' + order.id + ' - ' + order.total.toLocaleString() + ' MNT';
  const text = 'Shine zahialga irlee!\n\n' +
    'Zahialgyn dugaar: #' + order.id + '\n' +
    'Zahialagch: ' + order.customer_name + '\n' +
    'Utas: ' + order.customer_phone + '\n' +
    'Hayag: ' + order.customer_address + '\n' +
    (order.notes ? 'Temdeglel: ' + order.notes + '\n' : '') +
    '\nBaraa:\n' + fmtItems(order.items) + '\n\n' +
    'Niit dun: ' + order.total.toLocaleString() + ' MNT\n';

  try {
    await transporter.sendMail({ from: fromAddr(), to, subject, text });
    console.log('[mailer] Admin notified about order #' + order.id);
    return { sent: true };
  } catch (e) {
    console.error('[mailer] admin notify failed:', e.message);
    return { sent: false, reason: e.message };
  }
}

async function notifyCustomer(order, customerEmail) {
  if (!enabled) return { sent: false, reason: 'disabled' };
  if (!customerEmail) return { sent: false, reason: 'no_customer_email' };

  const subject = 'Tany zahialga #' + order.id + ' batalgaazhlaa';
  const text = 'Sain bain uu ' + order.customer_name + ',\n\n' +
    'Azwellness.mn-d zahialga ogsond bayarlalaa!\n\n' +
    'Zahialgyn dugaar: #' + order.id + '\n' +
    'Niit dun: ' + order.total.toLocaleString() + ' MNT\n' +
    'Hurgelt: ' + order.customer_address + '\n\n' +
    'Baraa:\n' + fmtItems(order.items) + '\n\n' +
    'Ta udahgui holbogdoh bolno.\n' +
    'Azwellness.mn';

  try {
    await transporter.sendMail({ from: fromAddr(), to: customerEmail, subject, text });
    console.log('[mailer] Customer confirmation sent -> ' + customerEmail);
    return { sent: true };
  } catch (e) {
    console.error('[mailer] customer notify failed:', e.message);
    return { sent: false, reason: e.message };
  }
}

module.exports = {
  enabled: () => enabled,
  notifyAdmin,
  notifyCustomer
};
