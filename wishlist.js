// ============================================================================
// Wishlist (❤️ Дуртай бүтээгдэхүүн)
//   - Heart button on each product card
//   - Click → toggle add/remove from user's wishlist (auth required)
//   - User menu has "❤️ Дуртай" → opens modal with all favorites
// ============================================================================
(function(){
  'use strict';

  const API = (location.protocol === 'file:' || location.hostname === '') ? 'http://localhost:3000/api' : '/api';
  const TOKEN_KEY = 'azwell.token';

  // In-memory cache of product ids that are in the user's wishlist
  let wishlistIds = new Set();
  let loaded = false;

  function token() { return localStorage.getItem(TOKEN_KEY); }
  function isLoggedIn() { return !!token(); }

  async function api(path, opts) {
    opts = opts || {};
    const h = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (token()) h.Authorization = 'Bearer ' + token();
    const r = await fetch(API + path, { method: opts.method || 'GET', headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let data = null;
    try { data = await r.json(); } catch (_) {}
    if (!r.ok) throw Object.assign(new Error((data && data.error) || r.statusText), { status: r.status });
    return data;
  }

  // ── styles ────────────────────────────────────────────────────────────────
  const css = document.createElement('style');
  css.textContent = `
    .pcard .wish-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 32px;
      height: 32px;
      background: rgba(255,255,255,.92);
      border: none;
      border-radius: 50%;
      font-size: 16px;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0,0,0,.12);
      backdrop-filter: blur(4px);
      transition: transform .15s, background .15s;
      z-index: 5;
      display: flex; align-items: center; justify-content: center;
      padding: 0;
      line-height: 1;
    }
    .pcard .wish-btn:hover { transform: scale(1.12); background: #fff; }
    .pcard .wish-btn.on { color: #e05a5a; }
    .pcard .wish-btn:not(.on) { color: #cccccc; filter: grayscale(1); }

    /* Heart button inside product detail modal */
    .pdmodal-wish {
      width: 48px; height: 48px;
      border-radius: 12px;
      background: #f5f9fa;
      border: 2px solid #eee;
      font-size: 22px;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background .2s, border-color .2s, transform .15s;
      flex-shrink: 0;
    }
    .pdmodal-wish:hover { background: #fff; border-color: #1aaba0; transform: scale(1.05); }
    .pdmodal-wish.on { background: #fff5f5; border-color: #e05a5a; color: #e05a5a; }
    .pcard .wish-btn.on:hover { color: #d04444; }
    .pcard { position: relative; }

    /* My wishlist modal */
    .wish-overlay { position:fixed; inset:0; background:rgba(10,20,30,.55); z-index:5500;
      display:none; align-items:center; justify-content:center; backdrop-filter:blur(3px); }
    .wish-overlay.open { display:flex; }
    .wish-modal { background:#fff; border-radius:16px; padding:28px; width:92%; max-width:720px;
      max-height:88vh; overflow-y:auto; position:relative; }
    .wish-modal h2 { font-size:22px; margin-bottom:6px; }
    .wish-modal .sub { color:#666; font-size:13px; margin-bottom:18px; }
    .wish-modal .cls { position:absolute; top:14px; right:18px; background:none; border:none; font-size:22px; cursor:pointer; }
    .wish-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:14px; }
    .wish-card {
      background:#fff; border:1px solid #eee; border-radius:10px; padding:10px; cursor:pointer;
      transition: box-shadow .2s, transform .2s; position:relative;
    }
    .wish-card:hover { box-shadow: 0 6px 18px rgba(0,0,0,.10); transform:translateY(-2px); }
    .wish-card .wimg { height:120px; background:#fafafa; border-radius:8px; display:flex; align-items:center; justify-content:center; padding:6px; }
    .wish-card .wimg img { max-width:100%; max-height:100%; object-fit:contain; }
    .wish-card .wbrand { font-size:9px; color:#888; font-weight:700; text-transform:uppercase; margin-top:8px; }
    .wish-card .wname  { font-size:12px; font-weight:600; line-height:1.3; margin:3px 0; max-height:32px; overflow:hidden; }
    .wish-card .wprice { font-size:14px; font-weight:800; color:#1a3540; }
    .wish-card .wremove {
      position:absolute; top:6px; right:6px; background:rgba(255,255,255,.92); border:none;
      width:24px; height:24px; border-radius:50%; cursor:pointer; font-size:12px; color:#e05a5a;
      box-shadow:0 1px 4px rgba(0,0,0,.12);
    }
    .wish-empty { text-align:center; padding:40px 20px; color:#888; }
  `;
  document.head.appendChild(css);

  // ── Modal element ─────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.className = 'wish-overlay';
  overlay.innerHTML = `
    <div class="wish-modal">
      <button class="cls" data-close>✕</button>
      <h2>❤️ Дуртай бүтээгдэхүүн</h2>
      <p class="sub">Та хадгалсан барааны жагсаалт.</p>
      <div id="wishGrid">Уншиж байна…</div>
    </div>
  `;
  document.body.appendChild(overlay);

  function openModal() { overlay.classList.add('open'); loadAndRender(); }
  function closeModal() { overlay.classList.remove('open'); }

  overlay.addEventListener('click', e => {
    if (e.target.matches('[data-close]') || e.target === overlay) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal();
  });

  async function loadAndRender() {
    const grid = document.getElementById('wishGrid');
    if (!isLoggedIn()) {
      grid.innerHTML = '<div class="wish-empty">Эхлээд нэвтрэнэ үү.</div>';
      return;
    }
    grid.innerHTML = '<div class="wish-empty">Уншиж байна…</div>';
    try {
      const r = await api('/wishlist');
      if (r.products.length === 0) {
        grid.innerHTML = '<div class="wish-empty">❤️ хараахан бараа хадгалаагүй байна.<br>Бүтээгдэхүүн дээр ❤️ дарж хадгалаарай.</div>';
        return;
      }
      grid.innerHTML = '<div class="wish-grid">' + r.products.map(p => {
        const img = p.image_path ? `<img src="${p.image_path}">` : `<div style="font-size:48px">${p.emoji||'📦'}</div>`;
        return `<div class="wish-card" data-id="${p.id}">
          <button class="wremove" data-remove="${p.id}" title="Хасах">✕</button>
          <div class="wimg">${img}</div>
          <div class="wbrand">${escapeHtml(p.brand)}</div>
          <div class="wname">${escapeHtml(p.name)}</div>
          <div class="wprice">${p.price.toLocaleString()}₮</div>
        </div>`;
      }).join('') + '</div>';
    } catch (e) {
      grid.innerHTML = '<div class="wish-empty">Алдаа: ' + e.message + '</div>';
    }
  }
  function escapeHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

  // Click on card → open product modal
  overlay.addEventListener('click', async e => {
    const rem = e.target.closest('[data-remove]');
    if (rem) {
      e.stopPropagation();
      const pid = parseInt(rem.dataset.remove, 10);
      try {
        await api('/wishlist/' + pid, { method:'DELETE' });
        wishlistIds.delete(pid);
        syncHearts();
        loadAndRender();
      } catch(err) { alert('Алдаа: ' + err.message); }
      return;
    }
    const card = e.target.closest('.wish-card');
    if (card) {
      closeModal();
      const pid = card.dataset.id;
      setTimeout(() => {
        const real = document.querySelector('.pcard[data-product-id="' + pid + '"]');
        if (real && window.showPdModal) window.showPdModal(real);
      }, 100);
    }
  });

  // ── Heart button on each pcard ────────────────────────────────────────────
  function ensureHeartButton(card) {
    if (!card || card.querySelector('.wish-btn')) return;
    const pid = parseInt(card.dataset.productId || '0', 10);
    if (!pid) return;

    const btn = document.createElement('button');
    btn.className = 'wish-btn';
    btn.innerHTML = '♥';
    btn.title = 'Дуртай';
    if (wishlistIds.has(pid)) btn.classList.add('on');

    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!isLoggedIn()) {
        // Trigger login modal if available
        const loginBtn = document.querySelector('.btn-login');
        if (loginBtn) loginBtn.click();
        else alert('Эхлээд нэвтрэнэ үү.');
        return;
      }
      const wasOn = btn.classList.contains('on');
      try {
        if (wasOn) {
          await api('/wishlist/' + pid, { method:'DELETE' });
          wishlistIds.delete(pid);
          btn.classList.remove('on');
        } else {
          await api('/wishlist/' + pid, { method:'POST' });
          wishlistIds.add(pid);
          btn.classList.add('on');
        }
        // Update all instances of this product (preview + main)
        syncHearts();
      } catch(err) {
        alert('Алдаа: ' + err.message);
      }
    });

    card.appendChild(btn);
  }

  function syncHearts() {
    document.querySelectorAll('.pcard').forEach(card => {
      const pid = parseInt(card.dataset.productId || '0', 10);
      if (!pid) return;
      const btn = card.querySelector('.wish-btn');
      if (!btn) { ensureHeartButton(card); return; }
      btn.classList.toggle('on', wishlistIds.has(pid));
    });
  }

  function applyHeartsToAll() {
    document.querySelectorAll('.pcard').forEach(ensureHeartButton);
  }

  // ── Load wishlist on auth, refresh hearts ────────────────────────────────
  async function loadWishlistIds() {
    if (!isLoggedIn()) { wishlistIds = new Set(); loaded = true; syncHearts(); return; }
    try {
      const r = await api('/wishlist/ids');
      wishlistIds = new Set(r.ids);
      loaded = true;
      syncHearts();
    } catch (_) {
      wishlistIds = new Set();
    }
  }

  // Expose modal-opener globally so api.js's user menu can use it
  window.azOpenWishlist = openModal;

  // ── boot ─────────────────────────────────────────────────────────────────
  // Hook product detail modal heart button
  function wireModalHeart() {
    var btn = document.querySelector('.pdmodal-wish');
    if (!btn || btn.dataset.wired) return;
    btn.dataset.wired = '1';

    function getCurrentProductId() {
      // Find the pcard whose data-addcart matches the modal's current product
      var modalName = document.getElementById('pdModalName');
      if (!modalName) return null;
      var name = modalName.textContent;
      var card = Array.from(document.querySelectorAll('.pcard')).find(function(c){
        var pname = c.querySelector('.pname');
        return pname && pname.textContent === name && c.dataset.productId;
      });
      return card ? parseInt(card.dataset.productId, 10) : null;
    }

    function syncBtn() {
      var pid = getCurrentProductId();
      if (!pid) { btn.classList.remove('on'); btn.innerHTML = '🤍'; return; }
      var on = wishlistIds.has(pid);
      btn.classList.toggle('on', on);
      btn.innerHTML = on ? '❤️' : '🤍';
    }

    btn.addEventListener('click', async function(e){
      e.stopPropagation();
      var pid = getCurrentProductId();
      if (!pid) return;
      if (!isLoggedIn()) {
        var loginBtn = document.querySelector('.btn-login');
        if (loginBtn) loginBtn.click();
        else alert('Эхлээд нэвтэрнэ үү.');
        return;
      }
      try {
        if (wishlistIds.has(pid)) {
          await api('/wishlist/' + pid, { method:'DELETE' });
          wishlistIds.delete(pid);
        } else {
          await api('/wishlist/' + pid, { method:'POST' });
          wishlistIds.add(pid);
        }
        syncBtn();
        syncHearts();
      } catch(err) { alert('Алдаа: ' + err.message); }
    });

    // Re-sync when modal opens
    var pdModal = document.getElementById('pdModal');
    if (pdModal) {
      new MutationObserver(function(muts){
        muts.forEach(function(m){
          if (m.attributeName === 'class' && pdModal.classList.contains('open')) {
            setTimeout(syncBtn, 50);
          }
        });
      }).observe(pdModal, { attributes: true });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      loadWishlistIds().then(function(){ applyHeartsToAll(); wireModalHeart(); });
    }, 300);
    // Re-apply after products-loader builds new cards (gives it 1s buffer)
    setTimeout(applyHeartsToAll, 1500);
    setTimeout(applyHeartsToAll, 3000);
  });

  // Refresh when auth changes (login/logout)
  window.addEventListener('storage', e => {
    if (e.key === TOKEN_KEY) loadWishlistIds().then(applyHeartsToAll);
  });
})();
