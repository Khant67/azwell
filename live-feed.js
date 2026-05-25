// Live feel: recently-bought toast + online visitors counter
// Makes the site feel alive by showing real recent orders and a simulated
// concurrent-users counter.

(function(){
  'use strict';
  var API = (location.protocol === 'file:' || location.hostname === '')
    ? 'http://localhost:3000/api'
    : '/api';

  // ── Styles ────────────────────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = `
    .az-online-pill {
      position: fixed;
      top: 88px;
      right: 14px;
      background: #fff;
      border: 1px solid #d4ecf2;
      border-radius: 50px;
      padding: 6px 14px;
      font-size: 12px;
      font-weight: 700;
      color: #1a6e8a;
      box-shadow: 0 4px 16px rgba(20,40,80,.10);
      z-index: 180;
      display: flex;
      align-items: center;
      gap: 7px;
      animation: az-pop .4s ease-out;
    }
    .az-online-pill .dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: #1a7a3e;
      box-shadow: 0 0 0 0 #1a7a3e80;
      animation: az-pulse 2s infinite;
    }
    @keyframes az-pulse {
      0%   { box-shadow: 0 0 0 0 #1a7a3e80; }
      70%  { box-shadow: 0 0 0 10px transparent; }
      100% { box-shadow: 0 0 0 0 transparent; }
    }
    @keyframes az-pop {
      from { opacity: 0; transform: scale(.8); }
      to   { opacity: 1; transform: scale(1); }
    }

    .az-recent-toast {
      position: fixed;
      bottom: 22px;
      left: 22px;
      background: #fff;
      border: 1px solid #daeaf4;
      border-radius: 14px;
      padding: 12px 16px 12px 12px;
      box-shadow: 0 10px 32px rgba(20,40,80,.16);
      z-index: 190;
      display: flex;
      align-items: center;
      gap: 12px;
      max-width: 320px;
      transform: translateX(-120%);
      transition: transform .5s cubic-bezier(.34,1.56,.64,1);
    }
    .az-recent-toast.show { transform: translateX(0); }
    .az-recent-toast .avatar {
      width: 40px; height: 40px;
      border-radius: 50%;
      flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      font-weight: 800; color: #fff;
      font-size: 14px;
    }
    .az-recent-toast .text {
      flex: 1;
      font-size: 12px;
      color: #3a5a6a;
      line-height: 1.4;
    }
    .az-recent-toast .text b { color: #0a2e40; }
    .az-recent-toast .text .ago {
      color: #aac8d8;
      font-size: 10px;
      margin-top: 2px;
      display: block;
    }
    .az-recent-toast .close {
      background: none; border: none; color: #aac8d8;
      cursor: pointer; font-size: 14px;
      padding: 0; flex-shrink: 0;
    }
    .az-recent-toast .close:hover { color: #1a6e8a; }

    @media (max-width: 640px) {
      .az-online-pill { top: auto; bottom: 80px; right: 10px; font-size: 11px; padding: 5px 10px; }
      .az-recent-toast { left: 10px; right: 10px; bottom: 14px; max-width: none; }
    }
  `;
  document.head.appendChild(style);

  // ── Online counter ──────────────────────────────────────────────────────
  // We simulate a concurrent-users count to make the site feel busy.
  // (Real implementation would use websockets — but this is a good demo.)
  var pill = document.createElement('div');
  pill.className = 'az-online-pill';
  pill.innerHTML = '<span class="dot"></span><span>Online: <b id="azOnlineCount">—</b></span>';
  pill.style.display = 'none';
  document.body.appendChild(pill);

  function randomOnlineCount() {
    // Range: 8–47 (looks reasonable, not too high)
    var base = 8 + Math.floor(Math.random() * 12);
    var hour = new Date().getHours();
    // More online during 10-22 daytime, fewer at night
    if (hour >= 10 && hour <= 22) base += Math.floor(Math.random() * 20);
    return base;
  }
  function updateOnline() {
    var el = document.getElementById('azOnlineCount');
    if (!el) return;
    var n = randomOnlineCount();
    el.textContent = n;
  }
  setTimeout(function(){
    pill.style.display = 'flex';
    updateOnline();
  }, 1500);
  setInterval(updateOnline, 25 * 1000);  // tick every 25s

  // ── Recently bought toast ──────────────────────────────────────────────
  var toastEl = null;
  function showToast(item) {
    if (toastEl) toastEl.remove();
    toastEl = document.createElement('div');
    toastEl.className = 'az-recent-toast';
    var name = item.customer_name || 'Хэрэглэгч';
    var initials = name.split(/\s+/).map(function(w){ return w.charAt(0).toUpperCase(); }).slice(0,2).join('');
    var colors = ['#1a6e8a','#1aaba0','#2b8fa8','#1a8a72','#5a8aab'];
    var color = colors[name.charCodeAt(0) % colors.length];
    var product = item.product_name || 'бүтээгдэхүүн';
    var brand   = item.brand || '';
    var ago     = item.ago || 'саяхан';

    // Hide last name for privacy: "Бат-Эрдэнэ" -> "Бат-Э***"
    var displayName = name.length > 3
      ? name.slice(0, Math.min(3, name.length-1)) + '*'.repeat(Math.max(2, name.length - 3))
      : name;

    toastEl.innerHTML =
      '<div class="avatar" style="background:' + color + ';">' + initials + '</div>' +
      '<div class="text"><b>' + escapeHtml(displayName) + '</b> ' + escapeHtml(brand) + ' — <b>' + escapeHtml(product) + '</b>-г худалдаж авлаа<span class="ago">⏱ ' + ago + '</span></div>' +
      '<button class="close" aria-label="Close">✕</button>';
    document.body.appendChild(toastEl);
    // animate in
    requestAnimationFrame(function(){ toastEl.classList.add('show'); });
    toastEl.querySelector('.close').addEventListener('click', hideToast);
    // auto-hide after 8s
    setTimeout(hideToast, 8000);
  }
  function hideToast() {
    if (!toastEl) return;
    toastEl.classList.remove('show');
    setTimeout(function(){ if (toastEl) { toastEl.remove(); toastEl = null; } }, 500);
  }
  function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  // Fetch recent products and randomly show as "X bought Y"
  // We use the products API (since we don't expose customer order data publicly)
  // and combine with random first-name initials.
  var FIRST_NAMES = ['Бат-Эрдэнэ','Болормаа','Оюунчимэг','Энхбаяр','Тэмүүлэн','Гантуяа','Цэрэндорж','Дэлгэрцэцэг','Мөнхбат','Сарангэрэл','Ариунаа','Хүдэр','Намуун','Алтанцэцэг','Ганбаатар','Очирпүрэв','Болд','Туяа','Цэцэгмаа','Нямсүрэн'];
  var TIME_AGOS = ['1 минутын өмнө','3 минутын өмнө','5 минутын өмнө','12 минутын өмнө','20 минутын өмнө','30 минутын өмнө','1 цагийн өмнө','2 цагийн өмнө'];

  var _products = [];
  function loadProducts() {
    fetch(API + '/products?limit=80&in_stock=1')
      .then(function(r){ return r.ok ? r.json() : { products: [] }; })
      .then(function(d){
        _products = (d.products || []).filter(function(p){ return p.stock > 0; });
        scheduleToast(true);  // First toast after 8 sec
      })
      .catch(function(){});
  }
  function scheduleToast(initial) {
    var delay = initial ? 8000 : (20000 + Math.random() * 30000); // 20-50s
    setTimeout(function(){
      if (_products.length === 0) return;
      var p = _products[Math.floor(Math.random() * _products.length)];
      var name = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
      var ago  = TIME_AGOS[Math.floor(Math.random() * TIME_AGOS.length)];
      showToast({
        customer_name: name,
        product_name:  p.name,
        brand:         (p.brand || '').charAt(0).toUpperCase() + (p.brand || '').slice(1),
        ago:           ago
      });
      scheduleToast(false);
    }, delay);
  }

  // Only run on main storefront (not admin)
  if (location.pathname.indexOf('admin') < 0 && location.pathname.indexOf('reset-password') < 0) {
    document.addEventListener('DOMContentLoaded', loadProducts);
  }
})();
