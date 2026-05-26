// =============================================================================
// Azwellness.mn — dynamic product loader
//   Replaces hardcoded product cards with data from GET /api/products on load.
//   Falls back gracefully if API is unreachable.
// =============================================================================
(function(){
  'use strict';

  var API = window.AZWELL_API_BASE ||
    ((location.protocol === 'file:' || location.hostname === '')
      ? 'http://localhost:3000/api'
      : '/api');

  // Map brand id used in API → brand-section element id in DOM
  var BRAND_DOM_ID = {
    doublewood:    'doublewood',
    glasshouse:    'glasshouse',
    perfectsports: 'perfectsports',
    swisse:        'swisse',
    nutrex:        'nutrex',
    musashi:       'musashi'
  };

  // Display name per brand (id → human-readable label)
  var BRAND_LABEL = {
    doublewood:    'Doublewood',
    glasshouse:    'Glasshouse',
    perfectsports: 'Perfect Sports',
    swisse:        'Swisse',
    nutrex:        'Nutrex',
    musashi:       'Musashi'
  };
  function brandLabel(b){
    return BRAND_LABEL[b] || (b ? (b[0].toUpperCase() + b.slice(1)) : '');
  }

  function escAttr(s){ return String(s).replace(/'/g, "\\'").replace(/"/g, '&quot;'); }
  function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // Build an HTML string for a single pcard matching the existing DOM structure.
  function pcardHtml(p) {
    var outOfStock = (p.stock !== undefined && p.stock <= 0);
    var lowStock   = !outOfStock && p.stock !== undefined && p.stock <= 5;

    var imgBlock = p.image_path
      ? '<div class="pimg ' + p.class + ' has-img" style="background:#fff;padding:8px;overflow:hidden;box-sizing:border-box;">' +
        '<img src="' + escAttr(p.image_path) + '" alt="' + escHtml(p.name) + '" style="width:100%;height:100%;object-fit:contain;"></div>'
      : '<div class="pimg ' + p.class + '"><div class="pemoji">' + p.emoji + '</div></div>';

    var discBadge = outOfStock
      ? '<div class="pbadge sold-out">Дууссан</div>'
      : (lowStock
        ? '<div class="pbadge low-stock">Үлдсэн ' + p.stock + '</div>'
        : (p.old_price > 0
          ? '<div class="pbadge disc">SALE</div>'
          : ''));

    var priceRow;
    if (p.old_price > 0) {
      var pct = Math.round((1 - p.price / p.old_price) * 100);
      priceRow =
        '<div class="pprice sale">' +
          '<span class="pnow">' + p.price.toLocaleString() + '₮</span>' +
          '<span class="pold">' + p.old_price.toLocaleString() + '₮</span>' +
          (pct > 0 ? '<span class="pdiscount">−' + pct + '%</span>' : '') +
        '</div>';
    } else {
      priceRow = '<div class="pprice"><span class="pnow">' + p.price.toLocaleString() + '₮</span></div>';
    }

    var bLabel = brandLabel(p.brand);
    var onClick = "addCart(this,'" + escAttr(bLabel) +
                  "','" + escAttr(p.name) + "','" + escAttr(p.emoji || '') +
                  "','" + escAttr(p.class || '') + "'," + p.price + "," + p.old_price +
                  ",'" + escAttr(p.category || '') + "')";

    var addBtn = outOfStock
      ? '<button class="padd disabled" disabled>❌ Дууссан</button>'
      : '<button class="padd">🛒 Сагсанд нэмэх</button>';

    return (
      '<div class="pcard ' + (outOfStock ? 'out-of-stock' : '') + '" data-product-id="' + p.id + '"' +
      (outOfStock ? '' : ' onclick="' + onClick + '"') + '>' +
        imgBlock + discBadge +
        '<div class="pbody">' +
          '<div class="pbrand">' + escHtml(bLabel) + '</div>' +
          '<div class="pname">' + escHtml(p.name) + '</div>' +
          '<div class="pcat ' + p.class + '">' + escHtml(p.category || '') + '</div>' +
          priceRow +
          addBtn +
        '</div>' +
      '</div>'
    );
  }

  // Group products by brand → section
  function groupByBrandSection(products) {
    var out = {};
    products.forEach(function(p){
      if (!out[p.brand]) out[p.brand] = {};
      var sec = p.section || '__nosection__';
      if (!out[p.brand][sec]) out[p.brand][sec] = [];
      out[p.brand][sec].push(p);
    });
    return out;
  }

  // Re-render one brand-section using the grouped data
  function renderBrandSection(section, sectionGroups) {
    // Remove all existing .sec-hdr and .pgrid (keep banner + preview elements
    // — those get cleaned up & re-added by buildPreview anyway)
    Array.from(section.querySelectorAll(
      '.sec-hdr, .pgrid:not(.preview-grid)'
    )).forEach(function(el){ el.remove(); });

    // Also remove any old preview elements; buildPreview will re-add them.
    Array.from(section.querySelectorAll(
      '.preview-title, .preview-grid, .view-all-wrap'
    )).forEach(function(el){ el.remove(); });

    // Append new sec-hdr+pgrid blocks for each section
    var html = '';
    var sectionTitles = Object.keys(sectionGroups);
    sectionTitles.forEach(function(title){
      var products = sectionGroups[title];
      if (title !== '__nosection__') {
        html += '<div class="sec-hdr"><h3>' + escHtml(title) + '</h3>' +
                '<a href="#">Бүгдийг харах →</a></div>';
      }
      html += '<div class="pgrid">';
      products.forEach(function(p){ html += pcardHtml(p); });
      html += '</div>';
    });
    section.insertAdjacentHTML('beforeend', html);
  }

  // Wire a single freshly-rendered pcard with click handlers (image/name → modal,
  // padd button → addCart, body click → addCart via inline onclick).
  function wireFreshCard(card) {
    if (card.classList.contains('out-of-stock')) {
      card.style.cursor = 'not-allowed';
      return; // no clicks on sold-out cards
    }
    // Convert onclick to data-addcart so the modal logic can read it
    var oc = card.getAttribute('onclick') || '';
    if (oc) {
      card.setAttribute('data-addcart', oc);
      card.removeAttribute('onclick');
      card.style.cursor = 'pointer';
    }

    // pimg / pname → open modal
    var pimg  = card.querySelector('.pimg');
    var pname = card.querySelector('.pname');
    if (pimg) {
      pimg.classList.add('clickable');
      pimg.addEventListener('click', function(e){
        e.stopPropagation();
        if (window.showPdModal) window.showPdModal(card);
      });
    }
    if (pname) {
      pname.classList.add('clickable');
      pname.addEventListener('click', function(e){
        e.stopPropagation();
        if (window.showPdModal) window.showPdModal(card);
      });
    }

    // Card body → open modal
    card.addEventListener('click', function(e){
      if (window.showPdModal) window.showPdModal(card);
    });

    // .padd → add to cart
    var padd = card.querySelector('.padd');
    if (padd) {
      padd.addEventListener('click', function(e){
        e.stopPropagation();
        var m = (card.getAttribute('data-addcart')||'').match(
          /addCart\s*\(\s*this\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([^']*)'\s*\)/
        );
        if (m && window.addCart) {
          window.event = window.event || e;
          window.addCart(card, m[1], m[2], m[3], m[4], parseInt(m[5]), parseInt(m[6]), m[7]);
        }
      });
    }
  }

  // ===========================================================================
  // Run after a tick so the existing scripts have already initialized
  // ===========================================================================
  // Create a new brand section in DOM (for brands not hardcoded in HTML)
  function createDynamicBrandSection(brand) {
    var slug = brand.slug;
    var existing = document.getElementById(slug);
    if (existing) return existing;

    // Find a good place to insert — after the last existing brand-section
    var allSections = document.querySelectorAll('.brand-section');
    var insertAfter = allSections.length > 0 ? allSections[allSections.length - 1] : null;
    if (!insertAfter) return null;

    var section = document.createElement('div');
    section.className = 'wrap brand-section';
    section.id = slug;
    section.setAttribute('data-brand', slug);
    // Use uploaded banner if exists, else colored gradient with brand name
    var bannerImg = '../brands/' + slug + '/banner.png';
    var bannerHtml = '<div style="margin-top:36px;border-radius:16px;overflow:hidden;height:240px;margin-bottom:28px;background:linear-gradient(120deg,' + (brand.color||'#1a6e8a') + ',#1aaba0);display:flex;align-items:center;justify-content:center;color:#fff;font-size:42px;font-weight:900;letter-spacing:1px;">' +
      '<img src="' + bannerImg + '" alt="' + brand.display_name + '" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{textContent:\'' + brand.display_name.toUpperCase() + '\'}))" style="width:100%;height:100%;object-fit:cover;object-position:center;display:block;">' +
      '</div>';

    section.innerHTML = bannerHtml + '<div class="divider"></div>';
    insertAfter.parentNode.insertBefore(section, insertAfter.nextSibling);
    return section;
  }

  // Update brand-strip to include all active brands from DB
  function updateBrandStrip(brands) {
    var strip = document.querySelector('.brand-strip');
    if (!strip) return;
    // Replace cells
    strip.innerHTML = brands.map(function(b){
      var logoPath = '../brands/' + b.slug + '/logo.png';
      return '<a href="#' + b.slug + '" class="brand-strip-cell ' + (b.class||'') + '" style="--bc:' + (b.color||'#1a6e8a') + ';">' +
        '<div class="bs-icon">' +
          '<img src="' + logoPath + '" alt="' + b.display_name + '" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'bs-fallback\',textContent:\'' + b.display_name + '\'}))">' +
        '</div>' +
      '</a>';
    }).join('');
  }

  document.addEventListener('DOMContentLoaded', function(){
    setTimeout(async function(){
      var data;
      var brandsData = { brands: [] };
      try {
        var r = await fetch(API + '/products');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        data = await r.json();
        window._loadedProducts = (data && data.products) || [];
        // Fetch brands too (don't fail if endpoint missing — fall through)
        try {
          var rb = await fetch(API + '/products/brands');
          if (rb.ok) brandsData = await rb.json();
        } catch (_) {}
      } catch (err) {
        console.warn('[products-loader] API unreachable, keeping hardcoded HTML:', err.message);
        return;
      }

      // Update brand-strip with all brands (including new ones)
      if (brandsData.brands.length > 0) {
        updateBrandStrip(brandsData.brands);
      }

      // Create dynamic sections for new brands that don't have HTML section
      brandsData.brands.forEach(function(b){
        var domId = BRAND_DOM_ID[b.slug] || b.slug;
        if (!document.getElementById(domId)) {
          createDynamicBrandSection(b);
        }
      });

      // Reorder existing brand sections in DOM according to brand sort_order
      if (brandsData.brands.length > 0) {
        // Find common parent — usually <body> or a wrapper containing all .brand-section
        var allSections = document.querySelectorAll('.brand-section');
        if (allSections.length > 0) {
          var parent = allSections[0].parentNode;
          // After the LAST brand section, there might be footer etc. Use it as anchor.
          var anchor = allSections[allSections.length - 1].nextSibling;
          brandsData.brands.forEach(function(b){
            var domId = BRAND_DOM_ID[b.slug] || b.slug;
            var section = document.getElementById(domId);
            if (section && section.parentNode === parent) {
              parent.insertBefore(section, anchor);
            }
          });
        }
      }

      var grouped = groupByBrandSection(data.products);
      console.log('[products-loader] Loaded ' + data.count + ' products from API. Rebuilding sections…');

      Object.keys(grouped).forEach(function(brandId){
        var domId   = BRAND_DOM_ID[brandId] || brandId;
        var section = document.getElementById(domId);
        if (!section) return;
        renderBrandSection(section, grouped[brandId]);
        section.querySelectorAll('.pcard').forEach(wireFreshCard);
      });

      // Re-run brand-collapse preview building if available
      if (typeof window.azRebuildPreviews === 'function') {
        window.azRebuildPreviews();
      } else {
        // Otherwise dispatch an event the brand-router can listen for
        document.dispatchEvent(new Event('products-rebuilt'));
      }
    }, 50);  // Small delay so brand-router's own setTimeout(0) has a chance to set up
  });

  // ── Related products in pdModal ────────────────────────────────────────
  function loadRelatedProducts(productId) {
    var box  = document.getElementById('pdRelatedBox');
    var list = document.getElementById('pdRelatedList');
    if (!box || !list || !productId) return;
    box.style.display = 'none';
    list.innerHTML = '';

    fetch(API + '/products/' + productId + '/related?limit=6')
      .then(function(r){ return r.ok ? r.json() : { products: [] }; })
      .then(function(data){
        if (!data.products || data.products.length === 0) return;
        list.innerHTML = data.products.map(function(p){
          var imgHtml = p.image_path
            ? '<div style="width:100%;height:100px;background:#fafafa;display:flex;align-items:center;justify-content:center;border-radius:6px;padding:6px;overflow:hidden;"><img src="' + escAttr(p.image_path) + '" alt="' + escHtml(p.name) + '" style="max-width:100%;max-height:100%;object-fit:contain;"></div>'
            : '<div style="width:100%;height:100px;background:linear-gradient(135deg,#eef4f8,#c8dce8);display:flex;align-items:center;justify-content:center;border-radius:6px;font-size:36px;">' + (p.emoji || '📦') + '</div>';
          return '<div class="related-card" data-related-id="' + p.id + '" style="background:#fff;border:1px solid #eee;border-radius:8px;padding:8px;cursor:pointer;transition:.2s;" onmouseover="this.style.boxShadow=\'0 4px 12px rgba(0,0,0,.08)\';this.style.transform=\'translateY(-2px)\'" onmouseout="this.style.boxShadow=\'\';this.style.transform=\'\'">' +
            imgHtml +
            '<div style="font-size:11px;color:#888;margin-top:6px;text-transform:uppercase;font-weight:700;">' + escHtml(p.brand) + '</div>' +
            '<div style="font-size:12px;font-weight:600;margin-top:2px;line-height:1.3;height:32px;overflow:hidden;">' + escHtml(p.name) + '</div>' +
            '<div style="font-size:13px;font-weight:800;color:#1a6e8a;margin-top:4px;">' + p.price.toLocaleString() + '₮</div>' +
          '</div>';
        }).join('');
        box.style.display = 'block';
      })
      .catch(function(){});
  }

  // Patch showPdModal to also load related products
  function tryPatchPdModal() {
    if (window._pdModalRelatedPatched) return;
    if (typeof window.showPdModal !== 'function') return;
    var orig = window.showPdModal;
    window.showPdModal = function(card) {
      var result = orig.apply(this, arguments);
      // Find the product ID from the card's data attribute
      var pid = card && card.getAttribute('data-product-id');
      if (pid) loadRelatedProducts(parseInt(pid, 10));
      return result;
    };
    window._pdModalRelatedPatched = true;
  }
  // Try multiple times because showPdModal is defined later
  setTimeout(tryPatchPdModal, 100);
  setTimeout(tryPatchPdModal, 500);
  setTimeout(tryPatchPdModal, 1500);

  // Click on related card → open that product
  document.addEventListener('click', function(e){
    var relCard = e.target.closest('.related-card');
    if (!relCard) return;
    var pid = relCard.dataset.relatedId;
    if (!pid) return;
    var card = document.querySelector('.pcard[data-product-id="'+pid+'"]');
    if (card && window.showPdModal) {
      // Close current modal first then re-open with new product
      if (typeof window.closePdModal === 'function') window.closePdModal();
      setTimeout(function(){
        if (typeof window.showPdModal === 'function') window.showPdModal(card);
      }, 200);
    }
  });
})();
