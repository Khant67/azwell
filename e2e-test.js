// E2E test for admin flow
const { spawn } = require('child_process');
const fs = require('fs'); const path = require('path');

['app.db','app.db-wal','app.db-shm'].forEach(f =>
  { try{ fs.unlinkSync(path.join('/tmp/azwell_db4', f)); }catch(_){} });

const PORT = 3470;
const BASE = 'http://localhost:' + PORT;
const srv = spawn('node', ['--experimental-sqlite', 'server.js'], {
  cwd: __dirname, env: { ...process.env, PORT, AZWELL_DB_DIR: '/tmp/azwell_db4' },
  stdio: ['ignore', 'pipe', 'pipe']
});
srv.stdout.on('data', d => process.stdout.write('[srv] ' + d));
srv.stderr.on('data', d => process.stderr.write('[err] ' + d));

async function req(method, url, body, token) {
  const r = await fetch(BASE + url, {
    method, headers: { 'Content-Type':'application/json',
      ...(token ? { Authorization:'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let data; try { data = await r.json(); } catch (_) { data = null; }
  return { status: r.status, data };
}

let fails = 0;
function ok(label, cond, extra) {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + label + (!cond && extra ? ' -- ' + JSON.stringify(extra) : ''));
  if (!cond) fails++;
}

(async () => {
  for (let i=0;i<30;i++){try{const r=await fetch(BASE+'/api/health');if(r.ok)break;}catch(_){}await new Promise(r=>setTimeout(r,200));}

  console.log('\n[1] First registered user → admin');
  const adm = await req('POST','/api/auth/register',{email:'admin@az.mn',password:'admin123',name:'Эзэн'});
  ok('register 201', adm.status === 201);
  ok('first user is_admin = true', adm.data && adm.data.user && adm.data.user.is_admin === true, adm.data);
  const adminToken = adm.data.token;

  console.log('\n[2] Second user is NOT admin');
  const usr = await req('POST','/api/auth/register',{email:'user@az.mn',password:'user1234',name:'Хэрэглэгч'});
  ok('second user is_admin = false', usr.data && usr.data.user && usr.data.user.is_admin === false);
  const userToken = usr.data.token;

  console.log('\n[3] /api/admin/stats — admin only');
  const stats = await req('GET','/api/admin/stats',null,adminToken);
  ok('stats 200', stats.status === 200);
  ok('stats has users_total', typeof stats.data.users_total === 'number');

  const stats403 = await req('GET','/api/admin/stats',null,userToken);
  ok('non-admin gets 403', stats403.status === 403);

  console.log('\n[4] Create order then list as admin');
  await req('POST','/api/orders',{
    customer:{name:'Тестчин',phone:'99001122',address:'УБ'},
    items:[{brand:'Doublewood',name:'Magnesium',price:38900,quantity:2}]
  }, userToken);
  const orders = await req('GET','/api/admin/orders',null,adminToken);
  ok('admin sees order', orders.data.count === 1);
  ok('order has items array', Array.isArray(orders.data.orders[0].items));

  console.log('\n[5] Update order status');
  const ordId = orders.data.orders[0].id;
  const upd = await req('PUT','/api/admin/orders/'+ordId,{status:'shipped'},adminToken);
  ok('status updated', upd.data.order.status === 'shipped');

  const bad = await req('PUT','/api/admin/orders/'+ordId,{status:'bogus'},adminToken);
  ok('invalid status 400', bad.status === 400);

  console.log('\n[6] Product CRUD');
  const newP = await req('POST','/api/admin/products',{
    brand:'doublewood', name:'Тест бараа', class:'dw', price:50000, category:'Тест'
  }, adminToken);
  ok('create product 201', newP.status === 201, newP.data);
  const pid = newP.data.product.id;

  const updP = await req('PUT','/api/admin/products/'+pid,{price:60000}, adminToken);
  ok('update price', updP.data.product.price === 60000);

  const delP = await req('DELETE','/api/admin/products/'+pid, null, adminToken);
  ok('soft delete', delP.data.deleted === 'soft');

  const inactiveP = await req('GET','/api/products?brand=doublewood');
  const stillSeen = inactiveP.data.products.some(p => p.id === pid);
  ok('soft-deleted not in public list', !stillSeen);

  console.log('\n[7] Users list');
  const users = await req('GET','/api/admin/users',null,adminToken);
  ok('users list 200', users.status === 200);
  ok('contains 2 users', users.data.count === 2);
  ok('admin flagged', users.data.users.find(u => u.email === 'admin@az.mn').is_admin === 1);

  console.log('\n' + (fails === 0 ? 'ALL PASSED' : fails + ' FAILED'));
  srv.kill('SIGTERM');
  setTimeout(() => process.exit(fails === 0 ? 0 : 1), 200);
})().catch(err => { console.error('FATAL', err); srv.kill(); process.exit(1); });
