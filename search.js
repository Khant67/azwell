// Inline search dropdown only — no full-screen overlay.
// Type into the top-bar search input → matching products appear right below.
(function(){
  'use strict';
  const API = window.AZWELL_API_BASE ||
    ((location.protocol === 'file:' || location.hostname === '') ? 'http://localhost:3000/api' : '/api');

  const css = document.createElement('style');
  css.textContent = `
    .searchbox { position:relative; overflow:visible !important; }
    .search-dd {
      position:absolute; top:calc(100% + 6px); left:0; right:0;
      background:#fff; border-radius:12px; box-shadow:0 8px 32px rgba(20,40,80,.18);
      max-height:520px; overflow-y:auto; z-index:500; display:none;
    }
    .search-dd.open { display:block; }
    .search-dd .sdd-empty,
    .search-dd .sdd-loading { padding:18px; text-align:center; color:#888; font-size:13px; }
    .search-dd .sdd-row {
      display:flex; align-items:center; gap:14px; padding:12px 16px; cursor:pointer;
      border-bottom:1px solid #f0f3f5; transition:background .15s;
    }
    .search-dd .sdd-row:last-child { border-bottom:none; }
    .search-dd .sdd-row:hover { background:#f5f9fa; }
    .search-dd .sdd-row .img {
      width:56px; height:56px; flex:0 0 56px; display:flex; align-items:center; justify-content:center;
      background:#fafafa; border-radius:8px; padding:4px; overflow:hidden;
    }
    .search-dd .sdd-row .img img { max-width:100%; max-height:100%; object-fit:contain; }
    .search-dd .sdd-row .info { flex:1; min-width:0; }
    .search-dd .sdd-row .info .brand { font-size:10px; color:#888; font-weight:700; text-transform:uppercase; }
    .search-dd .sdd-row .info .name  { font-size:13px; font-weight:600; line-height:1.3; margin:2px 0 3px;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .search-dd .sdd-row .info .cat   { font-size:11px; color:#1a9eab; }
    .search-dd .sdd-row .price { font-weight:800; color:#1a3540; font-size:14px; white-space:nowrap; text-align:right; }
    .search-dd .sdd-row .price .oldp { display:block; font-size:10px; color:#aaa; text-decoration:line-through; font-weight:500; }
    .search-dd .sdd-row.sold .img img { filter:grayscale(0.8); opacity:.5; }
    .search-dd .sdd-row.sold .price::after { content:' (Дууссан)'; color:#999; font-size:11px; font-weight:500; }
    .search-dd .sdd-more {
      text-align:center; padding:10px; color:#888; font-size:12px;
      background:#fafbfc; border-top:1px solid #f0f3f5;
    }
  `;
  document.head.appendChild(css);

  function escapeHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

  const dd = document.createElement('div');
  dd.className = 'search-dd';

  let timer = null;

  function renderDropdown(products, q) {
    if (products.length === 0) {
      dd.innerHTML = '<div class="sdd-empty">😔 "' + escapeHtml(q) + '" хайлтад тохирох бараа алга.</div>';
      return;
    }
    const top = products.slice(0, 12);
    let html = top.map(p => {
      const sold = p.stock <= 0;
      const img = p.image_path
        ? '<img src="' + escapeHtml(p.image_path) + '" alt="">'
        : '<div style="font-size:36px">' + (p.emoji || '📦') + '</div>';
      const oldp = p.old_price > 0
        ? '<span class="oldp">' + p.old_price.toLocaleString() + '₮</span>'
        : '';
      return '<div class="sdd-row ' + (sold?'sold':'') + '" data-id="' + p.id + '">' +
        '<div class="img">' + img + '</div>' +
        '<div class="info">' +
          '<div class="brand">' + escapeHtml(p.brand) + '</div>' +
          '<div class="name">' + escapeHtml(p.name) + '</div>' +
          '<div class="cat">' + escapeHtml(p.category||'') + '</div>' +
        '</div>' +
        '<div class="price">' + p.price.toLocaleString() + '₮' + oldp + '</div>' +
      '</div>';
    }).join('');
    if (products.length > 12) {
      html += '<div class="sdd-more">+' + (products.length - 12) + ' бусад үр дүн…</div>';
    }
    dd.innerHTML = html;
  }

  function showDropdown() { dd.classList.add('open'); }
  function hideDropdown() { dd.classList.remove('open'); }

  async function runSearch(q) {
    if (!q || q.trim().length < 1) { hideDropdown(); return; }
    dd.innerHTML = '<div class="sdd-loading">Хайж байна...</div>';
    showDropdown();
    try {
      const r = await fetch(API + '/products?search=' + encodeURIComponent(q.trim()) + '&limit=30');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      renderDropdown(data.products, q.trim());
    } catch (e) {
      dd.innerHTML = '<div class="sdd-empty">⚠️ Алдаа: ' + e.message + '</div>';
    }
  }

  function openProduct(id) {
    const card = document.querySelector('.pcard[data-product-id="'+id+'"]');
    if (card && window.showPdModal) {
      window.showPdModal(card);
    } else if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const sb   = document.querySelector('.searchbox input');
    const sbtn = document.querySelector('.searchbox button');
    const box  = document.querySelector('.searchbox');
    if (!box) return;
    box.appendChild(dd);

    if (sb) {
      sb.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => runSearch(sb.value), 200);
      });
      sb.addEventListener('focus', () => {
        if (sb.value.trim()) runSearch(sb.value);
      });
      sb.addEventListener('keydown', e => {
        if (e.key === 'Escape') { hideDropdown(); sb.blur(); }
        // Enter just triggers search, no overlay
        if (e.key === 'Enter') { e.preventDefault(); runSearch(sb.value); }
      });
    }
    if (sbtn) {
      sbtn.addEventListener('click', e => {
        e.preventDefault();
        if (sb) runSearch(sb.value);
      });
    }

    dd.addEventListener('click', e => {
      const row = e.target.closest('.sdd-row');
      if (!row || row.classList.contains('sold')) return;
      hideDropdown();
      if (sb) { sb.value = ''; sb.blur(); }
      setTimeout(() => openProduct(row.dataset.id), 80);
    });

    // Click outside → close dropdown
    document.addEventListener('click', e => {
      if (!e.target.closest('.searchbox') && !e.target.closest('.search-dd')) {
        hideDropdown();
      }
    });
  });
})();
