// Quick test: send a sample admin notification
// Usage:  npm run test:email
const mailer = require('../mailer');

if (!mailer.enabled()) {
  console.error('Mailer is disabled. Check .env file in backend/ has SMTP_USER and SMTP_PASS.');
  process.exit(1);
}

const sampleOrder = {
  id: 999,
  customer_name: 'Туршилтын Хэрэглэгч',
  customer_phone: '99001122',
  customer_address: 'УБ, СБД, 1-р хороо',
  notes: 'Имэйл туршилт',
  total: 95800,
  items: [
    { brand: 'Doublewood', name: 'Magnesium Glycinate 400мг', price: 38900, quantity: 2 },
    { brand: 'Nutrex', name: 'Outrage Pre-workout', price: 18000, quantity: 1 }
  ]
};

(async () => {
  console.log('Sending test admin notification...');
  const r = await mailer.notifyAdmin(sampleOrder);
  console.log('Result:', r);

  const custEmail = process.argv[2];
  if (custEmail) {
    console.log('Sending test customer confirmation to', custEmail, '...');
    const r2 = await mailer.notifyCustomer(sampleOrder, custEmail);
    console.log('Result:', r2);
  } else {
    console.log('\nTo also test customer email: npm run test:email -- your@email.com');
  }
})();
