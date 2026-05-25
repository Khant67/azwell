// Admin SPA logic
(function(){
  'use strict';
  const API = '/api';
  const TOKEN_KEY = 'azwell.admin.token';
  const USER_KEY  = 'azwell.admin.user';

  const $ = sel => document.querySelector(sel);
  const $$ = sel => document.querySelectorAll(sel);

  function token() { return localStorage.getItem(TOKEN_KEY); }
  function user()  { try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch (_) { return null; } }

  async function api(path, opts) {
    opts = opts || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (token()) headers.Authorization = 'Bearer ' + token();
    const r = await fetch(API + path, {
      method: opts.method || 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    let data = null;
    try { data = await r.json(); } catch (_) {}
    if (!r.ok) {
      // Auto-logout on 401 (invalid/expired token)
      if (r.status === 401) {
        const isInitialAuth = path === '/auth/login' || path === '/auth/register';
        if (!isInitialAuth && token()) {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
          location.reload();
          return;
        }
      }
      throw Object.assign(new Error((data && data.error) || r.statusText), { status: r.status, data: data });
    }
    return data;
  }

  // ── LOGIN ────────────────────────────────────────────────────────────
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const err = $('#loginErr');
    err.style.display = 'none';
    try {
      const res = await api('/auth/login', {
        method: 'POST',
        body: {
          identifier: fd.get('identifier'),
          password: fd.get('password'),
          totp: fd.get('totp') || undefined
        }
      });
      if (!res.user.is_admin) {
        err.textContent = 'Энэ хэрэглэгч admin биш байна.';
        err.style.display = 'block';
        return;
      }
      localStorage.setItem(TOKEN_KEY, res.token);
      localStorage.setItem(USER_KEY, JSON.stringify(res.user));
      enterAdmin();
    } catch (e) {
      // If 2FA required, show the TOTP field
      if (e.data && e.data.totp_required) {
        $('#loginTotpRow').style.display = 'block';
        const totpInput = $('#loginTotpRow input[name="totp"]');
        if (totpInput) totpInput.focus();
      }
      err.textContent = e.message;
      err.style.display = 'block';
    }
  });

  $('#logoutBtn').addEventListener('click', async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch (_) {}
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    location.reload();
  });

  function enterAdmin() {
    $('#loginView').style.display = 'none';
    $('#adminView').style.display = '';
    const u = user();
    $('#userInfo').textContent = '👤 ' + (u.name || u.email) + ' (admin)';
    showTab('dashboard');
  }

  // ── TABS ─────────────────────────────────────────────────────────────
  $$('.tabs button').forEach(btn => {
    btn.addEventListener('click', () => showTab(btn.dataset.tab));
  });
  function showTab(name) {
    $$('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    $$('.tab-content').forEach(c => c.style.display = c.id === 'tab-' + name ? '' : 'none');
    if (name === 'dashboard') { loadDashboard(); loadReports(); }
    if (name === 'orders')    loadOrders();
    if (name === 'products')  loadProducts();
    if (name === 'users')     loadUsers();
    if (name === 'coupons')   loadCoupons();
  }

  // ── DASHBOARD ────────────────────────────────────────────────────────
  async function loadDashboard() {
    try {
      const s = await api('/admin/stats');
      $('#statsGrid').innerHTML = [
        ['Нийт хэрэглэгч',   s.users_total],
        ['Захиалга',         s.orders_total],
        ['Хүлээгдэж буй',    s.orders_pending],
        ['Орлого',           s.revenue_total.toLocaleString() + '₮'],
        ['Идэвхтэй бараа',   s.products_active + ' / ' + s.products_total],
      ].map(([l,v]) =>
        `<div class="stat-card"><div class="label">${l}</div><div class="value">${v}</div></div>`
      ).join('');

      const o = await api('/admin/orders');
      _dashboardAllOrders = o.orders || [];
      _dashboardShowAll = false;
      renderDashboardOrders();
    } catch (e) {
      $('#statsGrid').innerHTML = '<p style="color:#b00020;">Алдаа: '+e.message+'</p>';
    }
  }

  // ── Dashboard recent orders (with "See more" toggle) ─────────────────
  let _dashboardAllOrders = [];
  let _dashboardShowAll = false;

  function renderDashboardOrders() {
    const all = _dashboardAllOrders;
    const wrap = $('#recentOrders');
    if (!wrap) return;
    if (all.length === 0) {
      wrap.innerHTML = '<p class="muted">Захиалга байхгүй.</p>';
      return;
    }
    const visible = _dashboardShowAll ? all : all.slice(0, 5);
    const hidden = all.length - visible.length;
    let html = renderOrdersTable(visible, true);
    if (all.length > 5) {
      if (_dashboardShowAll) {
        html += '<div style="text-align:center;margin-top:14px;">'
              + '<button id="ordersToggleBtn" class="btn btn-ghost" style="background:#f0f4f8;color:#1a6e8a;padding:10px 24px;border-radius:10px;font-weight:700;cursor:pointer;border:none;transition:all .2s;">▲ Багасгах</button>'
              + '</div>';
      } else {
        html += '<div style="text-align:center;margin-top:14px;">'
              + '<button id="ordersToggleBtn" class="btn btn-primary" style="background:linear-gradient(135deg,#1aaba0,#1a6e8a);color:#fff;padding:10px 28px;border-radius:10px;font-weight:700;cursor:pointer;border:none;box-shadow:0 4px 12px rgba(26,171,160,.25);transition:all .2s;">▼ Бүгдийг харах (' + hidden + ' нэмэлт)</button>'
              + '</div>';
      }
    }
    wrap.innerHTML = html;
    const btn = $('#ordersToggleBtn');
    if (btn) {
      btn.addEventListener('click', () => {
        _dashboardShowAll = !_dashboardShowAll;
        renderDashboardOrders();
        if (_dashboardShowAll) {
          // smooth scroll to keep button in view
          setTimeout(() => {
            const newBtn = $('#ordersToggleBtn');
            if (newBtn) newBtn.scrollIntoView({ behavior:'smooth', block:'center' });
          }, 50);
        }
      });
    }
  }

  // ── ORDERS ───────────────────────────────────────────────────────────
  $('#orderStatusFilter').addEventListener('change', loadOrders);

  // CSV export
  $('#exportOrdersBtn').addEventListener('click', async () => {
    const btn = $('#exportOrdersBtn');
    btn.disabled = true;
    btn.textContent = '⏳';
    try {
      const r = await fetch(API + '/admin/orders/export.csv' + buildOrdersQuery(), {
        headers: { Authorization: 'Bearer ' + token() }
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = 'azwell-orders-' + new Date().toISOString().slice(0,10) + '.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Алдаа: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '📁 CSV';
    }
  });

  function buildOrdersQuery() {
    const status = $('#orderStatusFilter').value;
    const from   = $('#orderDateFrom').value;
    const to     = $('#orderDateTo').value;
    const params = [];
    if (status) params.push('status=' + encodeURIComponent(status));
    if (from)   params.push('from='   + encodeURIComponent(from));
    if (to)     params.push('to='     + encodeURIComponent(to));
    return params.length ? '?' + params.join('&') : '';
  }

  async function loadOrders() {
    try {
      const r = await api('/admin/orders' + buildOrdersQuery());
      // Sort by ID ascending so #1 is on top
      const sorted = (r.orders || []).slice().sort((a, b) => a.id - b.id);
      const headerInfo = sorted.length > 0
        ? `<p class="muted" style="margin-bottom:10px;font-size:12px;">Нийт ${sorted.length} захиалга — ${sorted.reduce((s,o)=>s+o.total,0).toLocaleString()}₮</p>`
        : '';
      $('#ordersTable').innerHTML = sorted.length === 0
        ? '<p class="muted">Энэ шүүлтүүрт тохирох захиалга байхгүй.</p>'
        : headerInfo + renderOrdersTable(sorted);
    } catch (e) {
      $('#ordersTable').innerHTML = '<p style="color:#b00020;">Алдаа: '+e.message+'</p>';
    }
  }

  // Date input handlers
  document.addEventListener('change', e => {
    if (e.target.id === 'orderDateFrom' || e.target.id === 'orderDateTo') {
      loadOrders();
    }
  });

  // Clear date button
  document.addEventListener('click', e => {
    if (e.target.id === 'orderClearDate') {
      $('#orderDateFrom').value = '';
      $('#orderDateTo').value   = '';
      loadOrders();
    }
    // Quick date presets
    const qd = e.target.dataset && e.target.dataset.quickDate;
    if (qd) {
      const now = new Date();
      const to  = now.toISOString().slice(0,10);
      let from;
      if (qd === 'today') {
        from = to;
      } else if (qd === 'week') {
        const d = new Date(now); d.setDate(d.getDate() - 6);
        from = d.toISOString().slice(0,10);
      } else if (qd === 'month') {
        const d = new Date(now); d.setDate(d.getDate() - 29);
        from = d.toISOString().slice(0,10);
      }
      if (from) {
        $('#orderDateFrom').value = from;
        $('#orderDateTo').value   = to;
        loadOrders();
      }
    }
  });

  const STATUS_LABEL = {
    pending:   '⏳ Хүлээгдэж байгаа',
    confirmed: '✅ Баталгаажсан',
    shipped:   '🚚 Хүргэлтэнд гарсан',
    delivered: '📬 Хүргэгдсэн',
    cancelled: '❌ Цуцлагдсан'
  };

  function renderOrdersTable(orders, compact) {
    const rows = orders.map(o => {
      const items = o.items.map(it =>
        '<div class="item">• '+it.brand+' — '+it.product_name+(it.variant?' <span style="display:inline-block;padding:1px 7px;background:#e6f7f5;color:#1a6e8a;border-radius:6px;font-size:11px;font-weight:700;">'+it.variant+'</span>':'')+' ×'+it.quantity+'</div>'
      ).join('');
      const statusSelect = compact
        ? `<span class="badge ${o.status}">${STATUS_LABEL[o.status] || o.status}</span>`
        : `<select data-order-id="${o.id}" class="status-select">
            ${['pending','confirmed','shipped','delivered','cancelled'].map(s =>
              `<option value="${s}" ${s===o.status?'selected':''}>${STATUS_LABEL[s]}</option>`).join('')}
          </select>`;
      return `<tr>
        <td>#${o.id}<br><span class="muted">${o.created_at}</span></td>
        <td>${o.customer_name}<br><span class="muted">${o.customer_phone}</span></td>
        <td>${o.customer_address}${o.notes ? '<br><span class="muted">📝 '+o.notes+'</span>' : ''}</td>
        <td><div class="items-list">${items}</div></td>
        <td><strong>${o.total.toLocaleString()}₮</strong></td>
        <td>${statusSelect}</td>
      </tr>`;
    }).join('');
    return `<table>
      <thead><tr><th>ID / Огноо</th><th>Захиалагч</th><th>Хаяг</th><th>Бараа</th><th>Дүн</th><th>Төлөв</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  // Status update via delegated change handler
  document.addEventListener('change', async e => {
    if (e.target.classList.contains('status-select')) {
      const id = e.target.dataset.orderId;
      const newStatus = e.target.value;
      try {
        await api('/admin/orders/'+id, { method:'PUT', body:{ status: newStatus } });
        e.target.closest('tr').style.background = '#e7f6ed';
        setTimeout(() => { e.target.closest('tr').style.background = ''; }, 1500);
      } catch (err) {
        alert('Алдаа: ' + err.message);
      }
    }
  });

  // ── PRODUCTS ─────────────────────────────────────────────────────────
  let _allProducts = [];

  function applyProductFilter() {
    const q      = ($('#productSearch')?.value || '').toLowerCase().trim();
    const brand  = $('#productBrandFilter')?.value || '';
    const active = $('#productActiveFilter')?.value || '';
    let filtered = _allProducts;
    if (q) {
      filtered = filtered.filter(p =>
        (p.name && p.name.toLowerCase().indexOf(q) >= 0) ||
        (p.brand && p.brand.toLowerCase().indexOf(q) >= 0) ||
        (p.category && p.category.toLowerCase().indexOf(q) >= 0)
      );
    }
    if (brand)  filtered = filtered.filter(p => p.brand === brand);
    if (active === 'active')   filtered = filtered.filter(p => p.active);
    if (active === 'inactive') filtered = filtered.filter(p => !p.active);

    const headerInfo = filtered.length > 0
      ? `<p class="muted" style="margin-bottom:10px;font-size:12px;">${filtered.length} бүтээгдэхүүн</p>`
      : '';
    $('#productsTable').innerHTML = filtered.length === 0
      ? '<p class="muted">Тохирох бүтээгдэхүүн алга.</p>'
      : headerInfo + renderProductsTable(filtered);
  }

  async function loadProducts() {
    try {
      const r = await api('/admin/products');
      _allProducts = r.products || [];
      // Populate brand filter dropdown from BRANDS table (includes brands with 0 products)
      const brandSel = $('#productBrandFilter');
      if (brandSel) {
        let allBrands = [];
        try {
          const br = await api('/admin/brands');
          allBrands = (br.brands || []).map(b => b.slug);
        } catch (_) {}
        // Also include brands from products in case some are missing from brands table
        const fromProducts = _allProducts.map(p => p.brand).filter(Boolean);
        const brands = Array.from(new Set([...allBrands, ...fromProducts])).sort();
        const prev = brandSel.value;
        brandSel.innerHTML = '<option value="">Бүх брэнд</option>' +
          brands.map(b => `<option value="${b}">${b}</option>`).join('');
        if (prev) brandSel.value = prev;
      }
      applyProductFilter();
    } catch (e) {
      $('#productsTable').innerHTML = '<p style="color:#b00020;">Алдаа: '+e.message+'</p>';
    }
  }

  // Live filter handlers
  document.addEventListener('input', e => {
    if (e.target.id === 'productSearch') applyProductFilter();
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'productBrandFilter' || e.target.id === 'productActiveFilter') {
      applyProductFilter();
    }
  });

  function renderProductsTable(products) {
    const rows = products.map((p, i) => {
      const actions = p.active
        ? `<button class="btn btn-sm" data-edit-product="${p.id}">Засах</button>
           <button class="btn btn-sm btn-danger" data-delete-product="${p.id}" title="Зөөлөн устгал — буцаах боломжтой">🗑 Нуух</button>`
        : `<button class="btn btn-sm btn-success" data-restore-product="${p.id}" title="Дахин идэвхжүүлэх">♻️ Сэргээх</button>
           <button class="btn btn-sm btn-danger" data-hard-delete-product="${p.id}" title="Бүрэн устгах — буцаах боломжгүй">❌ Бүрэн устгах</button>`;
      return `<tr style="${p.active?'':'opacity:.5;background:#fef0f0;'}">
        <td><strong>${i + 1}</strong><br><span class="muted" style="font-size:9px;">id:${p.id}</span></td>
        <td>${p.brand}</td>
        <td>
          ${p.emoji||''} <strong>${p.name}</strong>
          ${p.section ? `<br><span style="display:inline-block;margin-top:4px;padding:2px 9px;border-radius:12px;background:${sectionBadgeBg(p.section)};color:#fff;font-size:10px;font-weight:700;letter-spacing:.3px;">${p.section}</span>` : ''}
        </td>
        <td>${p.category||'-'}</td>
        <td>
          <strong>${p.price.toLocaleString()}₮</strong>
          ${p.old_price > 0 ? '<br><span class="muted" style="text-decoration:line-through;">'+p.old_price.toLocaleString()+'₮</span>' : ''}
        </td>
        <td>${p.stock}</td>
        <td>${p.active ? '✓' : '✗'}</td>
        <td>${actions}</td>
      </tr>`;
    }).join('');
    return `<table>
      <thead><tr><th>ID</th><th>Брэнд</th><th>Нэр</th><th>Категори</th><th>Үнэ</th><th>Үлд.</th><th>✓</th><th>Үйлдэл</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  // Edit/Delete product handlers
  document.addEventListener('click', async e => {
    if (e.target.dataset.editProduct) {
      openProductModal(parseInt(e.target.dataset.editProduct, 10));
    }
    if (e.target.dataset.deleteProduct) {
      deleteProduct(parseInt(e.target.dataset.deleteProduct, 10));
    }
    if (e.target.dataset.restoreProduct) {
      const id = parseInt(e.target.dataset.restoreProduct, 10);
      try {
        await api('/admin/products/' + id, { method:'PUT', body:{ active: true } });
        loadProducts();
      } catch (err) { alert('Алдаа: ' + err.message); }
    }
    if (e.target.dataset.hardDeleteProduct) {
      const id = parseInt(e.target.dataset.hardDeleteProduct, 10);
      if (!confirm('⚠️ Энэ бүтээгдэхүүнийг БҮРЭН устгах уу?\n\nЭнэ үйлдлийг буцаах БОЛОМЖГҮЙ!')) return;
      try {
        await api('/admin/products/' + id + '?hard=1', { method:'DELETE' });
        loadProducts();
      } catch (err) { alert('Алдаа: ' + err.message); }
    }
    if (e.target.matches('[data-close]') || e.target.classList.contains('modal-overlay')) {
      $$('.modal-overlay').forEach(o => o.classList.remove('open'));
    }
  });

  $('#addProductBtn').addEventListener('click', () => openProductModal(null));

  function refreshImgPreview(path) {
    const prev = $('#imgPreview');
    if (path) {
      prev.innerHTML = '<img src="' + path + '" style="width:100%;height:100%;object-fit:contain;">';
    } else {
      prev.innerHTML = '📷';
    }
  }

  // Auto-upload on file select
  document.addEventListener('change', async e => {
    if (e.target.id !== 'imgFile') return;
    const file = e.target.files[0];
    if (!file) return;
    const form = $('#productForm');
    const brand = form.elements['brand'].value;
    const status = $('#imgStatus');

    if (!brand) {
      status.textContent = '⚠️ Эхлээд брэндээ сонгоно уу';
      status.style.color = '#b00020';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      status.textContent = '⚠️ Зураг 5MB-аас бага байх ёстой';
      status.style.color = '#b00020';
      return;
    }

    status.textContent = '⏳ Upload хийж байна...';
    status.style.color = '#888';

    try {
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload  = () => res(r.result);
        r.onerror = () => rej(r.error);
        r.readAsDataURL(file);
      });
      const r = await api('/admin/upload-image', {
        method: 'POST',
        body: { brand, filename: file.name, dataUrl }
      });
      form.elements['image_path'].value = r.image_path;
      refreshImgPreview(r.image_path);
      status.textContent = '✓ ' + (r.size/1024).toFixed(1) + ' KB upload хийгдсэн';
      status.style.color = '#1a7a3e';
    } catch (err) {
      status.textContent = '⚠️ Алдаа: ' + err.message;
      status.style.color = '#b00020';
    }
  });

  // Reset preview when image_path text is manually edited
  document.addEventListener('input', e => {
    if (e.target.name === 'image_path') {
      refreshImgPreview(e.target.value);
    }
  });

  // ── BRANDS dropdown ──────────────────────────────────────────────────
  let _brandCache = null;
  async function loadBrands(force) {
    if (!force && _brandCache) return _brandCache;
    const r = await api('/admin/brands');
    _brandCache = r.brands;
    return _brandCache;
  }
  async function refreshBrandDropdown(selectedSlug) {
    const sel = $('#brandSelect');
    if (!sel) return;
    const brands = await loadBrands(true);
    sel.innerHTML = brands
      .filter(b => b.active)
      .map(b => `<option value="${b.slug}" data-class="${b.class||''}">${b.display_name}</option>`)
      .join('');
    if (selectedSlug) sel.value = selectedSlug;
  }
  // When brand changes, auto-fill the class field
  document.addEventListener('change', e => {
    if (e.target.id === 'brandSelect') {
      const opt = e.target.selectedOptions[0];
      const cls = opt ? opt.dataset.class : '';
      const form = $('#productForm');
      if (form && form.elements['class'] && !form.elements['class'].value) {
        form.elements['class'].value = cls || '';
      } else if (form && form.elements['class']) {
        form.elements['class'].value = cls || form.elements['class'].value;
      }
    }
  });

  // ── EMOJI picker (searchable) ────────────────────────────────────────
  const EMOJI_DATA = [
    // Brain & Mind
    { e: '🧠', kw: 'тархи brain mind ой ой тогтоолт focus memory' },
    { e: '💭', kw: 'бодол thought ой санах memory' },
    { e: '🧘', kw: 'meditation бясалгал тайвшрал zen calm relax' },
    { e: '😴', kw: 'нойр sleep relax амрах rest' },
    { e: '💤', kw: 'нойр sleep dream zzz' },
    // Body & Strength
    { e: '💪', kw: 'булчин muscle strength хүч уураг protein gym' },
    { e: '🦴', kw: 'яс bone calcium collagen' },
    { e: '❤️', kw: 'зүрх heart love омега omega cardio' },
    { e: '🫀', kw: 'зүрх heart cardio' },
    { e: '👁️', kw: 'нүд eye vision ретин retin' },
    { e: '🦷', kw: 'шүд tooth dental calcium' },
    { e: '🫁', kw: 'уушги lung respiratory' },
    // Supplements & Medicine
    { e: '💊', kw: 'эм pill capsule таблет витамин vitamin' },
    { e: '🧴', kw: 'savan bottle сав шингэн liquid' },
    { e: '💉', kw: 'тариа injection vaccine' },
    { e: '🛡️', kw: 'хамгаалалт shield immune дархлаа immunity' },
    // Energy & Performance
    { e: '⚡', kw: 'эрчим energy power цахилгаан electric pre-workout' },
    { e: '🔥', kw: 'гал fire burn fat-burner hot' },
    { e: '💥', kw: 'тэсрэлт explosion energy boom' },
    { e: '🏃', kw: 'гүйх run cardio running sport' },
    { e: '🏋️', kw: 'жин weight lifting gym workout' },
    { e: '🎯', kw: 'зорилт target focus aim' },
    // Plants & Herbs
    { e: '🌿', kw: 'ургамал herb plant ногоон leaf natural' },
    { e: '🌱', kw: 'нахиа sprout seedling растительный plant' },
    { e: '🍄', kw: 'мөөг mushroom cordyceps reishi' },
    { e: '🌳', kw: 'мод tree wood doublewood' },
    { e: '🪴', kw: 'цэцэг potted plant herb' },
    // Fruits (vitamins)
    { e: '🍋', kw: 'limon lemon vitamin c citrus' },
    { e: '🍊', kw: 'жүрж orange citrus vitamin c' },
    { e: '🍇', kw: 'усан үзэм grape resveratrol' },
    { e: '🍓', kw: 'гүзээлзгэнэ strawberry berry' },
    { e: '🫐', kw: 'нэрс blueberry antioxidant' },
    { e: '🍌', kw: 'гадил banana potassium' },
    { e: '🥝', kw: 'kiwi жимс vitamin' },
    { e: '🍎', kw: 'алим apple жимс' },
    { e: '🥭', kw: 'мангу mango жимс' },
    { e: '🍑', kw: 'хан үзэм cherry жимс' },
    // Veggies & Other Food
    { e: '🥑', kw: 'avocado healthy fat өөх' },
    { e: '🥒', kw: 'өргөст хэмх cucumber' },
    { e: '🥗', kw: 'salad veggies хоол' },
    { e: '🥥', kw: 'кокос coconut mct' },
    { e: '🌰', kw: 'самар nut almond walnut' },
    { e: '🍯', kw: 'зөгийн бал honey natural' },
    // Drinks
    { e: '💧', kw: 'ус water hydration шингэн' },
    { e: '🥤', kw: 'уух drink тортого energy' },
    { e: '🍵', kw: 'цай tea matcha green tea' },
    { e: '☕', kw: 'кофе coffee caffeine' },
    { e: '🧉', kw: 'mate цай herbal' },
    // Cosmetic / Beauty
    { e: '✨', kw: 'гялбаа sparkle glow гоо сайхан beauty skincare' },
    { e: '💎', kw: 'эрдэнэ gem diamond premium luxury' },
    { e: '🌸', kw: 'цэцэг flower sakura гоо сайхан' },
    { e: '🌺', kw: 'цэцэг flower tropical' },
    { e: '🪞', kw: 'толь mirror гоо сайхан' },
    { e: '💅', kw: 'хумс nail manicure' },
    // Nature & Time
    { e: '🌞', kw: 'нар sun vitamin d солнце' },
    { e: '🌙', kw: 'сар moon night нойр' },
    { e: '🌟', kw: 'од star premium top' },
    { e: '⭐', kw: 'од star quality' },
    // Misc
    { e: '🎃', kw: 'pumpkin halloween squash зүсэм' },
    { e: '🦋', kw: 'butterfly эрвээхэй гоо сайхан' },
    { e: '🍫', kw: 'шоколад chocolate flavor cocoa' },
    { e: '🍦', kw: 'зайрмаг icecream vanilla' },
    { e: '🥛', kw: 'сүү milk protein lactose' }
  ];

  function buildEmojiPicker(filter) {
    const picker = $('#emojiPicker');
    if (!picker) return;
    const q = (filter || '').toLowerCase().trim();
    // If input contains an emoji char (single emoji), don't filter — show all
    const isSingleEmoji = /^[\p{Emoji}]{1,2}$/u.test(filter || '');
    const list = (q && !isSingleEmoji)
      ? EMOJI_DATA.filter(d => d.kw.toLowerCase().indexOf(q) >= 0 || d.e === q)
      : EMOJI_DATA;
    picker.innerHTML = list.length === 0
      ? '<span style="color:#888; font-size:12px; padding:8px; display:block;">🤷 Тохирох эможи алга</span>'
      : '<div style="display:flex; flex-wrap:wrap; gap:4px;">' +
          list.map(d =>
            `<button type="button" data-emoji="${d.e}" title="${d.kw.split(' ').slice(0,3).join(', ')}" style="background:#f5f9fa;border:1px solid #e0e6ea;border-radius:6px;padding:6px 8px;cursor:pointer;font-size:18px;line-height:1;transition:.15s;" onmouseover="this.style.background='#e8f4f4'" onmouseout="this.style.background='#f5f9fa'">${d.e}</button>`
          ).join('') +
        '</div>';
  }

  function showEmojiPicker() {
    const picker = $('#emojiPicker');
    if (picker) picker.style.display = 'block';
  }
  function hideEmojiPicker() {
    const picker = $('#emojiPicker');
    if (picker) picker.style.display = 'none';
  }

  // Open on focus, filter on input
  document.addEventListener('focus', e => {
    if (e.target.id !== 'emojiInput') return;
    buildEmojiPicker(e.target.value);
    showEmojiPicker();
  }, true);

  document.addEventListener('input', e => {
    if (e.target.id !== 'emojiInput') return;
    buildEmojiPicker(e.target.value);
    showEmojiPicker();
  });

  // Click an emoji button to fill input and close
  document.addEventListener('click', e => {
    const em = e.target.dataset && e.target.dataset.emoji;
    if (em) {
      const inp = $('#emojiInput');
      if (inp) {
        inp.value = em;
        hideEmojiPicker();
      }
      return;
    }
    // Click outside picker or input → close
    if (!e.target.closest('#emojiPicker') && e.target.id !== 'emojiInput') {
      hideEmojiPicker();
    }
  });

  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && e.target.id === 'emojiInput') {
      hideEmojiPicker();
      e.target.blur();
    }
  });

  // ── CATEGORIES dropdown ──────────────────────────────────────────────
  let _categoryCache = null;
  async function loadCategories(force) {
    if (!force && _categoryCache) return _categoryCache;
    try {
      const r = await fetch(API + '/products/categories');
      const data = await r.json();
      _categoryCache = data.categories || [];
    } catch (_) { _categoryCache = []; }
    return _categoryCache;
  }
  async function refreshCategoryDropdown(selectedCat) {
    const sel = $('#categorySelect');
    if (!sel) return;
    const cats = await loadCategories(true);
    const opts = ['<option value="">-- сонгох --</option>']
      .concat(cats.map(c => `<option value="${c}">${c}</option>`))
      .join('');
    sel.innerHTML = opts;
    if (selectedCat) {
      // If the selected category isn't in the list (e.g. new product with custom cat), add it
      if (cats.indexOf(selectedCat) < 0) {
        sel.insertAdjacentHTML('beforeend', `<option value="${selectedCat}" selected>${selectedCat}</option>`);
      } else {
        sel.value = selectedCat;
      }
    }
  }

  // ── Sections (sub-section) ──
  function sectionBadgeBg(s) {
    if (!s) return '#888';
    if (/SALE|хямдр/i.test(s)) return 'linear-gradient(135deg,#ff1744,#d50000)';
    if (/шинэ|new/i.test(s))   return 'linear-gradient(135deg,#1aaba0,#1a6e8a)';
    if (/хит|hit/i.test(s))    return 'linear-gradient(135deg,#f59e0b,#d97706)';
    if (/шилдэг|premium/i.test(s)) return 'linear-gradient(135deg,#8b5cf6,#7c3aed)';
    if (/бэлэг|gift/i.test(s)) return 'linear-gradient(135deg,#ec4899,#db2777)';
    return 'linear-gradient(135deg,#64748b,#475569)';
  }
  let _sectionsCache = null;
  async function loadSections(force) {
    if (_sectionsCache && !force) return _sectionsCache;
    try {
      const { products } = await api('/admin/products');
      const uniq = new Set();
      products.forEach(p => { if (p.section && p.section.trim()) uniq.add(p.section.trim()); });
      _sectionsCache = Array.from(uniq).sort();
    } catch (_) {
      _sectionsCache = [];
    }
    return _sectionsCache;
  }
  async function refreshSectionsList() {
    const dl = document.getElementById('sectionsList');
    if (!dl) return;
    const sections = await loadSections(true);
    // Add common presets to top
    const presets = [
      '🔥 Хямдарсан бараанууд SALE',
      '🆕 Шинэ бүтээгдэхүүн',
      '⭐ Хит борлуулалт',
      '💎 Шилдэг сонголт',
      '🎁 Бэлэг'
    ];
    const all = Array.from(new Set([...presets, ...sections]));
    dl.innerHTML = all.map(s => `<option value="${s.replace(/"/g,'&quot;')}"></option>`).join('');
  }
  function bindSectionPresets() {
    // One-time binding
    if (window._sectionPresetsBound) return;
    window._sectionPresetsBound = true;
    const input = document.getElementById('sectionInput');
    const clearBtn = document.getElementById('clearSectionBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (input) { input.value = ''; input.focus(); updatePresetActive(); }
      });
    }
    document.querySelectorAll('#sectionPresets .section-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!input) return;
        input.value = btn.dataset.section;
        updatePresetActive();
        input.dispatchEvent(new Event('input'));
      });
    });
    if (input) {
      input.addEventListener('input', updatePresetActive);
    }
    function updatePresetActive() {
      const v = (input && input.value || '').trim();
      document.querySelectorAll('#sectionPresets .section-preset').forEach(b => {
        b.classList.toggle('active', b.dataset.section === v);
      });
    }
  }

  // ⚙️ Категори удирдах — open modal listing categories with delete buttons
  document.addEventListener('click', async e => {
    if (e.target.id !== 'manageCategoryBtn') return;
    const modal = $('#categoryManageModal');
    const list  = $('#categoryManageList');
    list.innerHTML = 'Уншиж байна...';
    modal.classList.add('open');
    try {
      const r = await api('/admin/categories');
      if (r.categories.length === 0) {
        list.innerHTML = '<p class="muted">Категори байхгүй.</p>';
        return;
      }
      list.innerHTML = '<table style="width:100%;">' +
        '<thead><tr><th>Категори</th><th>Бүтээгдэхүүн</th><th></th></tr></thead><tbody>' +
        r.categories.map(c => `<tr>
          <td>${c.category}</td>
          <td>${c.c}</td>
          <td><button class="btn btn-sm btn-danger" data-del-cat="${c.category}">🗑 Устгах</button></td>
        </tr>`).join('') +
        '</tbody></table>';
    } catch (err) {
      list.innerHTML = '<p style="color:#b00020;">Алдаа: '+err.message+'</p>';
    }
  });

  // Delete a category
  document.addEventListener('click', async e => {
    const name = e.target.dataset.delCat;
    if (!name) return;
    if (!confirm('"' + name + '" категорийг устгах уу?\n\nБүх бүтээгдэхүүнээс энэ категори авагдана (бүтээгдэхүүн өөрөө устгагдахгүй).')) return;
    try {
      const r = await api('/admin/categories/' + encodeURIComponent(name), { method: 'DELETE' });
      alert('✅ ' + r.affected + ' бүтээгдэхүүний категори цэвэрлэгдлээ');
      _categoryCache = null;
      // Refresh both the management list and the product modal dropdown
      $('#manageCategoryBtn').click();
      if ($('#productModal').classList.contains('open')) {
        await refreshCategoryDropdown();
      }
    } catch (err) {
      alert('⚠️ Алдаа: ' + err.message);
    }
  });

  // "+ Шинэ категори" товч
  document.addEventListener('click', async e => {
    if (e.target.id !== 'newCategoryBtn') return;
    const name = prompt('Шинэ категорийн нэр:\nЖишээ: Тархи, Уураг, Энерги, BCAA...');
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const sel = $('#categorySelect');
    if (!sel) return;
    // Add to dropdown and select it
    const existing = Array.from(sel.options).find(o => o.value.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      sel.value = existing.value;
      alert('ℹ️ Энэ категори аль хэдийн байна — сонгогдлоо');
      return;
    }
    sel.insertAdjacentHTML('beforeend', `<option value="${trimmed}" selected>${trimmed}</option>`);
    sel.value = trimmed;
    // Invalidate cache so next refresh will pull it
    _categoryCache = null;
  });

  // ⚙️ Брэнд удирдах — open modal listing brands with delete buttons
  document.addEventListener('click', async e => {
    if (e.target.id !== 'manageBrandBtn') return;
    const modal = $('#brandManageModal');
    const list  = $('#brandManageList');
    list.innerHTML = 'Уншиж байна...';
    modal.classList.add('open');
    try {
      const r = await api('/admin/brands');
      // Get product counts per brand
      const prods = (await api('/admin/products')).products;
      const counts = {};
      prods.forEach(p => { counts[p.brand] = (counts[p.brand] || 0) + 1; });

      if (r.brands.length === 0) {
        list.innerHTML = '<p class="muted">Брэнд байхгүй.</p>';
        return;
      }
      // Sort by sort_order ascending
      const sorted = [...r.brands].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id);
      const total = sorted.length;
      list.innerHTML = '<table style="width:100%;">' +
        '<thead><tr><th style="width:60px;">№</th><th>Брэнд</th><th>Slug</th><th>Бараа</th><th style="text-align:center;">Banner / Logo</th><th></th></tr></thead><tbody>' +
        sorted.map((b, idx) => {
          const c = counts[b.slug] || 0;
          const cb = Date.now();
          const bannerPath = `../brands/${b.slug}/banner.png?t=${cb}`;
          return `<tr>
            <td>
              <input type="number" class="brand-pos-input" data-brand-id="${b.id}" value="${idx + 1}" min="1" max="${total}"
                style="width:55px;text-align:center;font-weight:700;padding:5px;border:1.5px solid #ddd;border-radius:6px;font-size:14px;">
            </td>
            <td><strong>${b.display_name}</strong><br><span class="muted" style="font-size:10px;">${b.class||'-'}</span></td>
            <td><span class="muted">${b.slug}</span></td>
            <td>${c}</td>
            <td>
              <div style="display:flex; gap:6px; align-items:center;">
                <div style="width:60px;height:36px;border:1px solid #e0e6ea;border-radius:4px;overflow:hidden;background:#f5f9fa;display:flex;align-items:center;justify-content:center;">
                  <img src="${bannerPath}" onerror="this.style.display='none'" style="width:100%;height:100%;object-fit:cover;">
                </div>
                <div style="display:flex;flex-direction:column;gap:4px;">
                  <button class="btn btn-sm btn-ghost" data-upload-banner="${b.id}" data-brand-slug="${b.slug}" style="padding:3px 8px;font-size:11px;">🖼️ Banner</button>
                  <button class="btn btn-sm btn-ghost" data-upload-logo="${b.id}" data-brand-slug="${b.slug}" style="padding:3px 8px;font-size:11px;">🏷️ Logo</button>
                </div>
              </div>
            </td>
            <td><button class="btn btn-sm btn-danger" data-del-brand="${b.id}" data-brand-name="${b.display_name}" data-brand-count="${c}">🗑</button></td>
          </tr>`;
        }).join('') +
        '</tbody></table>' +
        '<p class="muted" style="margin-top:10px;font-size:11px;">💡 №-ийн талбарт шинэ дугаар оруулж Enter дарвал тэр байранд шилжинэ</p>';
    } catch (err) {
      list.innerHTML = '<p style="color:#b00020;">Алдаа: '+err.message+'</p>';
    }
  });

  // Reorder brand by direct position input
  async function applyBrandReorder(brandId, newPos) {
    const all = (await api('/admin/brands')).brands
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id);
    const idx = all.findIndex(b => b.id === brandId);
    if (idx < 0) return;
    // Clamp newPos to valid range
    let np = Math.max(1, Math.min(all.length, parseInt(newPos, 10) || 1)) - 1;
    if (np === idx) return; // no change
    // Move element in array
    const [moved] = all.splice(idx, 1);
    all.splice(np, 0, moved);
    // Reassign sort_order = 1..N in new order
    for (let i = 0; i < all.length; i++) {
      await api('/admin/brands/' + all[i].id, { method: 'PUT', body: { sort_order: i + 1 } });
    }
    _brandCache = null;
  }

  // Listen for Enter / blur on brand position inputs
  document.addEventListener('change', async e => {
    if (!e.target.classList || !e.target.classList.contains('brand-pos-input')) return;
    const id  = parseInt(e.target.dataset.brandId, 10);
    const pos = parseInt(e.target.value, 10);
    if (!id || !pos) return;
    e.target.disabled = true;
    try {
      await applyBrandReorder(id, pos);
      // Re-render modal with new order
      $('#manageBrandBtn').click();
    } catch (err) {
      alert('⚠️ Алдаа: ' + err.message);
      e.target.disabled = false;
    }
  });

  // Also handle Enter key (browsers fire change only on blur for number inputs)
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (!e.target.classList || !e.target.classList.contains('brand-pos-input')) return;
    e.target.blur();  // triggers change handler
  });

  // Upload banner / logo for a brand
  document.addEventListener('click', e => {
    const brandId = e.target.dataset.uploadBanner || e.target.dataset.uploadLogo;
    if (!brandId) return;
    const kind = e.target.dataset.uploadBanner ? 'banner' : 'logo';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      const maxMb = kind === 'banner' ? 8 : 2;
      if (file.size > maxMb * 1024 * 1024) {
        alert('⚠️ ' + kind + ' файл ' + maxMb + 'MB-аас бага байх ёстой');
        return;
      }
      try {
        const dataUrl = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.onerror = () => rej(r.error);
          r.readAsDataURL(file);
        });
        await api('/admin/brands/' + brandId + '/' + kind, {
          method: 'POST',
          body: { dataUrl }
        });
        alert('✅ ' + (kind === 'banner' ? 'Banner' : 'Logo') + ' амжилттай шинэчлэгдлээ');
        // Refresh the brand manage list
        $('#manageBrandBtn').click();
      } catch (err) {
        alert('⚠️ Алдаа: ' + err.message);
      }
    });
    fileInput.click();
  });

  // Delete a brand
  document.addEventListener('click', async e => {
    const id = e.target.dataset.delBrand;
    if (!id) return;
    const name  = e.target.dataset.brandName;
    const count = parseInt(e.target.dataset.brandCount, 10) || 0;
    if (count > 0) {
      alert('⚠️ "' + name + '" брэндэд ' + count + ' бүтээгдэхүүн бүртгэлтэй байна.\n\nЭхлээд тэдгээр бүтээгдэхүүнийг өөр брэнд рүү шилжүүлэх эсвэл устгах хэрэгтэй.');
      return;
    }
    if (!confirm('"' + name + '" брэндийг устгах уу?')) return;
    try {
      await api('/admin/brands/' + id, { method: 'DELETE' });
      alert('✅ Брэнд устгагдлаа');
      _brandCache = null;
      // Refresh both the management modal and the dropdown
      $('#manageBrandBtn').click();
      if ($('#productModal').classList.contains('open')) {
        await refreshBrandDropdown();
      }
    } catch (err) {
      alert('⚠️ Алдаа: ' + err.message);
    }
  });

  // "+ Шинэ" button — open small brand-creation dialog
  document.addEventListener('click', async e => {
    if (e.target.id !== 'newBrandBtn') return;
    const name = prompt('Шинэ брэндийн нэр (харагдах нэр):\nЖишээ: Redcon1, Optimum Nutrition');
    if (!name) return;
    const slug = prompt('Брэндийн slug (зөвхөн жижиг үсэг, тоо, dash):\nЖишээ: redcon1, optimum-nutrition', name.toLowerCase().replace(/[^a-z0-9]/g, ''));
    if (!slug) return;
    const cls = prompt('Class товчилбор (2-3 үсэг, зураглалд ашиглана):\nЖишээ: rc, on', slug.slice(0, 2));
    if (cls === null) return;
    try {
      const r = await api('/admin/brands', {
        method: 'POST',
        body: { slug, display_name: name, class: cls }
      });
      alert('✅ Шинэ брэнд "' + r.brand.display_name + '" нэмэгдлээ');
      await refreshBrandDropdown(r.brand.slug);
    } catch (err) {
      alert('⚠️ Алдаа: ' + err.message);
    }
  });

  async function openProductModal(id) {
    const form = $('#productForm');
    form.reset();
    $('#productErr').style.display = 'none';
    refreshImgPreview(null);
    $('#imgStatus').textContent = 'Зураг сонгоход автоматаар upload хийгдэнэ';
    $('#imgStatus').style.color = '#888';
    await refreshBrandDropdown();
    await refreshCategoryDropdown();
    await refreshSectionsList();
    buildEmojiPicker();
    bindSectionPresets();
    bindVariantsManager();
    resetVariantsUI();
    if (id) {
      const { product } = await api('/admin/products');
      // Actually we want a single product, but admin/products returns all. Use the all list.
      const all = (await api('/admin/products')).products;
      const p = all.find(x => x.id === id);
      if (!p) return;
      // Pre-populate dropdowns with existing values BEFORE assigning fields
      await refreshBrandDropdown(p.brand);
      await refreshCategoryDropdown(p.category);
      Object.entries(p).forEach(([k,v]) => {
        const el = form.elements[k];
        if (el) {
          if (el.type === 'checkbox') el.checked = !!v;
          else el.value = v == null ? '' : v;
        }
      });
      loadVariantsIntoUI(p.variants);
      $('#productModalTitle').textContent = 'Бүтээгдэхүүн засах #' + id;
      refreshImgPreview(form.elements['image_path'].value);
    } else {
      form.elements['active'].checked = true;
      $('#productModalTitle').textContent = 'Шинэ бүтээгдэхүүн';
    }
    $('#productModal').classList.add('open');
  }

  $('#productForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {};
    fd.forEach((v, k) => { body[k] = v; });
    body.active = e.target.elements['active'].checked;
    if (!body.id) delete body.id;
    const variants = collectVariantsFromUI();
    body.variants = variants ? JSON.stringify(variants) : null;
    const err = $('#productErr');
    err.style.display = 'none';
    try {
      if (body.id) {
        await api('/admin/products/' + body.id, { method:'PUT', body });
      } else {
        delete body.id;
        await api('/admin/products', { method:'POST', body });
      }
      $('#productModal').classList.remove('open');
      loadProducts();
    } catch (e) {
      err.textContent = e.message;
      err.style.display = 'block';
    }
  });

  async function deleteProduct(id) {
    if (!confirm('Энэ бүтээгдэхүүнийг устгах уу? (Soft delete — буцаах боломжтой)')) return;
    try {
      await api('/admin/products/' + id, { method: 'DELETE' });
      loadProducts();
    } catch (e) {
      alert('Алдаа: ' + e.message);
    }
  }

  // ── USERS ────────────────────────────────────────────────────────────
  async function loadUsers() {
    try {
      const r = await api('/admin/users');
      $('#usersTable').innerHTML = r.users.length === 0
        ? '<p class="muted">Хэрэглэгч алга.</p>'
        : renderUsersTable(r.users);
    } catch (e) {
      $('#usersTable').innerHTML = '<p style="color:#b00020;">Алдаа: '+e.message+'</p>';
    }
  }

  function renderUsersTable(users) {
    const rows = users.map(u => `<tr>
      <td>#${u.id}</td>
      <td>${u.email}</td>
      <td>${u.name || '-'}</td>
      <td>${u.phone || '-'}</td>
      <td>${u.is_admin ? '<span class="badge admin">ADMIN</span>' : ''}</td>
      <td><span class="muted">${u.created_at || ''}</span></td>
    </tr>`).join('');
    return `<table>
      <thead><tr><th>ID</th><th>Имэйл</th><th>Нэр</th><th>Утас</th><th>Эрх</th><th>Бүртгэсэн</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  // ── COUPONS ──────────────────────────────────────────────────────────
  async function loadCoupons() {
    try {
      const r = await api('/admin/coupons');
      if (r.coupons.length === 0) {
        $('#couponsTable').innerHTML = '<p class="muted">Купон байхгүй. "+ Шинэ купон" товчоор үүсгэнэ үү.</p>';
        return;
      }
      $('#couponsTable').innerHTML = '<table style="width:100%;"><thead><tr><th>Код</th><th>Тайлбар</th><th>Хямдрал</th><th>Хязгаар</th><th>Захиалга</th><th>Зарагдсан</th><th>Орлого</th><th>Хүчинтэй</th><th>Идэвх</th><th>Үйлдэл</th></tr></thead><tbody>' +
        r.coupons.map(c => {
          const disc = c.discount_type === 'percent'
            ? c.discount_value + '%'
            : c.discount_value.toLocaleString() + '₮';
          const usage = c.max_uses > 0 ? (c.used_count + '/' + c.max_uses) : (c.used_count + ' / ∞');
          const expires = c.expires_at ? new Date(c.expires_at).toLocaleDateString() : '∞';
          const ordersCount = c.orders_count || 0;
          const itemsSold = c.items_sold || 0;
          const revenue = c.total_revenue || 0;
          const discountTotal = c.total_discount || 0;
          const detailsBtn = ordersCount > 0
            ? `<button class="btn btn-sm" data-show-coupon-orders="${c.code}" title="Захиалга харах" style="padding:4px 10px;background:#1aaba0;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:11px;">👁 Үзэх</button>`
            : '';
          return `<tr style="${c.active?'':'opacity:.5;'}" data-coupon-row="${c.code}">
            <td><strong>${c.code}</strong></td>
            <td>${c.description || '-'}</td>
            <td>${disc}${c.min_order > 0 ? '<br><span class="muted" style="font-size:10px;">Мин: ' + c.min_order.toLocaleString() + '₮</span>' : ''}</td>
            <td><span style="display:inline-block;padding:2px 9px;border-radius:10px;background:#e6f7f5;color:#1a6e8a;font-size:11px;font-weight:700;">${ordersCount}</span><br><span class="muted" style="font-size:10px;">Лим: ${usage}</span><br>${detailsBtn}</td>
            <td><strong>${itemsSold}</strong> ширхэг</td>
            <td><strong style="color:#0a8a80;">${revenue.toLocaleString()}₮</strong>${discountTotal > 0 ? '<br><span class="muted" style="font-size:10px;">Хямдр: −' + discountTotal.toLocaleString() + '₮</span>' : ''}</td>
            <td>${expires}</td>
            <td>${c.active ? '✓' : '✗'}</td>
            <td>
              <button class="btn btn-sm" data-edit-coupon="${c.id}">Засах</button>
              <button class="btn btn-sm btn-danger" data-del-coupon="${c.id}">🗑</button>
            </td>
          </tr>`;
        }).join('') +
        '</tbody></table>';
    } catch (e) {
      $('#couponsTable').innerHTML = '<p style="color:#b00020;">Алдаа: '+e.message+'</p>';
    }
  }

  $('#addCouponBtn').addEventListener('click', () => openCouponModal(null));

  async function openCouponModal(id) {
    const form = $('#couponForm');
    form.reset();
    $('#couponErr').style.display = 'none';
    if (id) {
      const all = (await api('/admin/coupons')).coupons;
      const c = all.find(x => x.id === id);
      if (!c) return;
      Object.entries(c).forEach(([k,v]) => {
        const el = form.elements[k];
        if (el) {
          if (el.type === 'checkbox') el.checked = !!v;
          else if (k === 'expires_at' && v) el.value = String(v).slice(0,10);
          else el.value = v == null ? '' : v;
        }
      });
      $('#couponModalTitle').textContent = 'Купон засах: ' + c.code;
    } else {
      form.elements['active'].checked = true;
      form.elements['discount_type'].value = 'percent';
      $('#couponModalTitle').textContent = 'Шинэ купон';
    }
    $('#couponModal').classList.add('open');
  }

  $('#couponForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {};
    fd.forEach((v, k) => { body[k] = v; });
    body.active = e.target.elements['active'].checked;
    if (!body.expires_at) delete body.expires_at;
    const err = $('#couponErr');
    err.style.display = 'none';
    try {
      if (body.id) {
        await api('/admin/coupons/' + body.id, { method:'PUT', body });
      } else {
        delete body.id;
        await api('/admin/coupons', { method:'POST', body });
      }
      $('#couponModal').classList.remove('open');
      loadCoupons();
    } catch (e) {
      err.textContent = e.message;
      err.style.display = 'block';
    }
  });

  document.addEventListener('click', async e => {
    const editId = e.target.dataset.editCoupon;
    const delId  = e.target.dataset.delCoupon;
    const showOrdersCode = e.target.dataset.showCouponOrders;
    if (editId) openCouponModal(parseInt(editId, 10));
    if (delId) {
      if (!confirm('Энэ купоныг устгах уу?')) return;
      try {
        await api('/admin/coupons/' + delId, { method: 'DELETE' });
        loadCoupons();
      } catch (err) { alert('Алдаа: ' + err.message); }
    }
    if (showOrdersCode) {
      const row = document.querySelector('[data-coupon-row="' + showOrdersCode + '"]');
      if (!row) return;
      const existing = row.nextElementSibling;
      // Toggle: if expand already shown, remove
      if (existing && existing.classList && existing.classList.contains('coupon-orders-expand')) {
        existing.remove();
        return;
      }
      try {
        const r = await api('/admin/coupons/' + encodeURIComponent(showOrdersCode) + '/orders');
        const orders = r.orders || [];
        const td = document.createElement('tr');
        td.className = 'coupon-orders-expand';
        const colspan = row.children.length;
        let html = '<td colspan="' + colspan + '" style="background:#f8fafb;padding:14px;">';
        html += '<div style="font-weight:700;font-size:13px;color:#0a2e40;margin-bottom:10px;">📦 "' + showOrdersCode + '" купонтой захиалгууд (' + orders.length + ')</div>';
        if (orders.length === 0) {
          html += '<div class="muted" style="font-size:12px;">Захиалга байхгүй.</div>';
        } else {
          html += '<table style="width:100%;font-size:12px;background:#fff;border-radius:8px;overflow:hidden;"><thead><tr style="background:#e6f7f5;"><th style="padding:8px;text-align:left;">#</th><th style="padding:8px;text-align:left;">Огноо</th><th style="padding:8px;text-align:left;">Захиалагч</th><th style="padding:8px;text-align:left;">Бараа</th><th style="padding:8px;text-align:right;">Дүн</th><th style="padding:8px;">Статус</th></tr></thead><tbody>';
          orders.forEach(o => {
            const itemsList = (o.items || []).map(it =>
              '<div>• ' + it.brand + ' — ' + it.product_name + (it.variant ? ' <span style="display:inline-block;padding:1px 6px;background:#e6f7f5;color:#1a6e8a;border-radius:4px;font-size:10px;font-weight:700;">' + it.variant + '</span>' : '') + ' ×' + it.quantity + '</div>'
            ).join('');
            html += '<tr style="border-bottom:1px solid #f0f0f0;">'
                  + '<td style="padding:8px;"><strong>#' + o.id + '</strong></td>'
                  + '<td style="padding:8px;font-size:11px;color:#666;">' + o.created_at + '</td>'
                  + '<td style="padding:8px;">' + o.customer_name + '<br><span class="muted" style="font-size:10px;">' + o.customer_phone + '</span></td>'
                  + '<td style="padding:8px;">' + itemsList + '</td>'
                  + '<td style="padding:8px;text-align:right;"><strong>' + o.total.toLocaleString() + '₮</strong>'
                  + (o.discount > 0 ? '<br><span class="muted" style="font-size:10px;">Хямдр: −' + o.discount.toLocaleString() + '₮</span>' : '')
                  + '</td>'
                  + '<td style="padding:8px;text-align:center;"><span style="font-size:11px;">' + (STATUS_LABEL[o.status] || o.status) + '</span></td>'
                  + '</tr>';
          });
          html += '</tbody></table>';
        }
        html += '</td>';
        td.innerHTML = html;
        row.insertAdjacentElement('afterend', td);
      } catch (err) { alert('Алдаа: ' + err.message); }
    }
  });

  // ── REPORTS ──────────────────────────────────────────────────────────
  async function loadReports() {
    await Promise.all([
      loadReportSummary(),
      loadReportChart(),
      loadReportTopProducts(),
      loadReportTopBrands()
    ]);
  }

  async function loadReportSummary() {
    try {
      const s = await api('/admin/reports/summary');
      $('#reportSummary').innerHTML = [
        ['Өнөөдрийн орлого',     s.today.revenue.toLocaleString() + '₮', s.today.orders + ' захиалга'],
        ['7 хоногийн орлого',    s.week.revenue.toLocaleString() + '₮',  s.week.orders + ' захиалга'],
        ['30 хоногийн орлого',   s.month.revenue.toLocaleString() + '₮', s.month.orders + ' захиалга'],
        ['Дундаж захиалгын дүн', s.all.avg_order.toLocaleString() + '₮', s.all.orders + ' нийт захиалга'],
        ['Хүлээгдэж буй',        s.pending_count, 'захиалга'],
      ].map(([l,v,sub]) =>
        `<div class="stat-card">
          <div class="label">${l}</div>
          <div class="value">${v}</div>
          <div class="muted" style="font-size:11px;margin-top:4px;">${sub||''}</div>
        </div>`
      ).join('');
    } catch (e) {
      $('#reportSummary').innerHTML = '<p style="color:#b00020;">Алдаа: '+e.message+'</p>';
    }
  }

  async function loadReportChart() {
    const period = $('#reportPeriod').value;
    const days   = $('#reportDays').value;
    try {
      const r = await api('/admin/reports/sales?period='+period+'&days='+days);
      if (!r.data || r.data.length === 0) {
        $('#reportChart').innerHTML = '<p class="muted" style="text-align:center;padding:40px;">Энэ хугацаанд захиалга байхгүй</p>';
        return;
      }
      const maxRev = Math.max(...r.data.map(d => d.revenue));
      const bars = r.data.map(d => {
        const h = maxRev > 0 ? Math.max(2, Math.round((d.revenue / maxRev) * 200)) : 2;
        return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:35px;">
          <div style="font-size:9px;color:#888;">${d.revenue >= 1000 ? Math.round(d.revenue/1000) + 'к' : d.revenue}</div>
          <div title="${d.period}: ${d.revenue.toLocaleString()}₮ • ${d.orders} захиалга"
               style="width:100%;max-width:40px;height:${h}px;background:linear-gradient(180deg,#1aaba0,#1a6e8a);border-radius:4px 4px 0 0;transition:.3s;cursor:pointer;"></div>
          <div style="font-size:9px;color:#888;writing-mode:vertical-rl;transform:rotate(180deg);height:60px;overflow:hidden;">${d.period}</div>
        </div>`;
      }).join('');
      $('#reportChart').innerHTML = `<div style="display:flex;align-items:flex-end;gap:6px;padding:14px 0;border-bottom:2px solid #eee;min-height:280px;">${bars}</div>`;
    } catch (e) {
      $('#reportChart').innerHTML = '<p style="color:#b00020;">Алдаа: '+e.message+'</p>';
    }
  }

  async function loadReportTopProducts() {
    try {
      const r = await api('/admin/reports/top-products?limit=10');
      if (!r.products || r.products.length === 0) {
        $('#reportTopProducts').innerHTML = '<p class="muted">Өгөгдөл алга</p>';
        return;
      }
      $('#reportTopProducts').innerHTML = '<table style="width:100%;"><thead><tr><th>#</th><th>Бүтээгдэхүүн</th><th>Зарагдсан</th><th>Орлого</th></tr></thead><tbody>' +
        r.products.map((p, i) => `<tr>
          <td><strong>${i+1}</strong></td>
          <td>
            <strong>${p.name}</strong><br>
            <span class="muted" style="font-size:10px;">${p.brand}</span>
          </td>
          <td>${p.qty_sold}</td>
          <td>${p.revenue.toLocaleString()}₮</td>
        </tr>`).join('') +
        '</tbody></table>';
    } catch (e) {
      $('#reportTopProducts').innerHTML = '<p style="color:#b00020;">Алдаа: '+e.message+'</p>';
    }
  }

  async function loadReportTopBrands() {
    try {
      const r = await api('/admin/reports/top-brands');
      if (!r.brands || r.brands.length === 0) {
        $('#reportTopBrands').innerHTML = '<p class="muted">Өгөгдөл алга</p>';
        return;
      }
      $('#reportTopBrands').innerHTML = '<table style="width:100%;"><thead><tr><th>#</th><th>Брэнд</th><th>Захиалга</th><th>Орлого</th></tr></thead><tbody>' +
        r.brands.map((b, i) => `<tr>
          <td><strong>${i+1}</strong></td>
          <td><strong>${b.brand}</strong><br><span class="muted" style="font-size:10px;">${b.qty_sold} ширхэг</span></td>
          <td>${b.orders}</td>
          <td>${b.revenue.toLocaleString()}₮</td>
        </tr>`).join('') +
        '</tbody></table>';
    } catch (e) {
      $('#reportTopBrands').innerHTML = '<p style="color:#b00020;">Алдаа: '+e.message+'</p>';
    }
  }

  // Re-load chart when period/days changes
  document.addEventListener('change', e => {
    if (e.target.id === 'reportPeriod' || e.target.id === 'reportDays') {
      loadReportChart();
    }
  });

  // Download report as CSV
  document.addEventListener('click', async e => {
    if (e.target.id !== 'downloadReportBtn') return;
    const period = $('#reportPeriod').value;
    const days   = $('#reportDays').value;
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = '⏳ Татаж байна...';
    try {
      const r = await fetch(API + '/admin/reports/export.csv?period='+period+'&days='+days, {
        headers: { Authorization: 'Bearer ' + token() }
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = 'azwell-report-' + new Date().toISOString().slice(0,10) + '.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Алдаа: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '📁 Тайлан татах';
    }
  });

  // ── VARIANTS MANAGER ─────────────────────────────────────────────────
  function resetVariantsUI() {
    const en = document.getElementById('variantsEnable');
    if (!en) return;
    en.checked = false;
    const body = document.getElementById('variantsBody');
    if (body) body.style.display = 'none';
    const lab = document.getElementById('variantsLabel');
    if (lab) lab.value = '';
    const list = document.getElementById('variantsList');
    if (list) list.innerHTML = '';
  }

  function loadVariantsIntoUI(raw) {
    if (!raw) return;
    let data;
    try { data = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) { return; }
    if (!data || !Array.isArray(data.options) || data.options.length === 0) return;
    document.getElementById('variantsEnable').checked = true;
    document.getElementById('variantsBody').style.display = 'block';
    document.getElementById('variantsLabel').value = data.label || '';
    document.getElementById('variantsList').innerHTML = '';
    data.options.forEach(opt => addVariantRow(opt));
  }

  function addVariantRow(opt) {
    opt = opt || { name:'', img:'', color:'#1aaba0' };
    const row = document.createElement('div');
    row.className = 'variant-row';
    const safe = s => String(s||'').replace(/"/g, '&quot;');
    const thumbContent = opt.img
      ? '<img src="' + safe(opt.img) + '" alt="">'
      : '📷';
    const stockVal = (opt.stock !== undefined && opt.stock !== null) ? opt.stock : 100;
    row.innerHTML =
      '<input type="text" class="v-name" placeholder="Нэр (ж: Vanilla 10lbs)" value="' + safe(opt.name) + '">' +
      '<input type="color" class="v-color" value="' + (opt.color || '#1aaba0') + '">' +
      '<label class="v-thumb" title="Зураг сонгох">' + thumbContent + '<input type="file" class="v-file" accept="image/*"></label>' +
      '<input type="text" class="v-img" placeholder="Зургийн URL (заавал биш)" value="' + safe(opt.img) + '">' +
      '<input type="number" class="v-stock" min="0" placeholder="Үлд." title="Үлдэгдэл" value="' + stockVal + '">' +
      '<button type="button" class="del-btn" title="Устгах">✕</button>';
    const delBtn = row.querySelector('.del-btn');
    const fileInput = row.querySelector('.v-file');
    const thumb = row.querySelector('.v-thumb');
    const urlInput = row.querySelector('.v-img');

    delBtn.addEventListener('click', () => row.remove());

    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const productForm = document.getElementById('productForm');
      const brand = productForm.elements['brand'].value;
      if (!brand) { alert('Эхлээд брэндээ сонгоно уу'); return; }
      try {
        const dataUrl = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.onerror = () => rej(r.error);
          r.readAsDataURL(file);
        });
        thumb.innerHTML = '<img src="' + dataUrl + '" alt="">';
        const resp = await api('/admin/upload-image', {
          method: 'POST',
          body: { brand: brand, filename: file.name, dataUrl: dataUrl }
        });
        if (resp.image_path) {
          urlInput.value = resp.image_path;
          thumb.innerHTML = '<img src="' + resp.image_path + '" alt="">';
        }
      } catch (err) {
        alert('Зураг upload алдаа: ' + err.message);
        thumb.innerHTML = '📷';
      }
    });

    urlInput.addEventListener('input', () => {
      const v = urlInput.value.trim();
      thumb.innerHTML = v ? '<img src="' + v.replace(/"/g, '&quot;') + '" alt="">' : '📷';
    });

    document.getElementById('variantsList').appendChild(row);
  }

  function collectVariantsFromUI() {
    const en = document.getElementById('variantsEnable');
    if (!en || !en.checked) return null;
    const label = (document.getElementById('variantsLabel').value || '').trim();
    const rows = document.querySelectorAll('#variantsList .variant-row');
    const options = [];
    rows.forEach(r => {
      const name = r.querySelector('.v-name').value.trim();
      if (!name) return;
      const stockEl = r.querySelector('.v-stock');
      const stockVal = stockEl ? parseInt(stockEl.value, 10) : 100;
      options.push({
        name: name,
        img: r.querySelector('.v-img').value.trim() || null,
        color: r.querySelector('.v-color').value || '#1aaba0',
        stock: Number.isFinite(stockVal) && stockVal >= 0 ? stockVal : 100
      });
    });
    if (options.length === 0) return null;
    return { label: label || 'Сонгох', options: options };
  }

  function bindVariantsManager() {
    if (window._variantsManagerBound) return;
    window._variantsManagerBound = true;
    const en = document.getElementById('variantsEnable');
    const body = document.getElementById('variantsBody');
    const addBtn = document.getElementById('addVariantBtn');
    if (en) en.addEventListener('change', () => {
      body.style.display = en.checked ? 'block' : 'none';

      if (en.checked && document.querySelectorAll('#variantsList .variant-row').length === 0) {
        addVariantRow();
      }
    });
    if (addBtn) addBtn.addEventListener('click', () => addVariantRow());
  }

  // ── INIT ─────────────────────────────────────────────────────────────
  if (token() && user()) {
    enterAdmin();
  }
})();
