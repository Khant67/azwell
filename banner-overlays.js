// Make banners clickable — keep ORIGINAL size + image, no overlay
(function(){
  'use strict';

  var BRAND_IDS = ['doublewood','glasshouse','perfectsports','swisse','nutrex','musashi'];

  var style = document.createElement('style');
  style.textContent = `
    .brand-banner-wrap {
      cursor: pointer;
      transition: box-shadow .3s;
    }
    .brand-banner-wrap:hover {
      box-shadow: 0 12px 32px rgba(20,30,40,.18);
    }
    .brand-banner-wrap img {
      transition: transform .4s;
    }
    .brand-banner-wrap:hover img { transform: scale(1.03); }
  `;
  document.head.appendChild(style);

  function findBanner(section) {
    for (var i = 0; i < section.children.length; i++) {
      var ch = section.children[i];
      if (ch.tagName === 'DIV' && ch.querySelector('img') &&
          !ch.classList.contains('sec-hdr') &&
          !ch.classList.contains('pgrid') &&
          !ch.classList.contains('preview-grid') &&
          !ch.classList.contains('view-all-wrap') &&
          !ch.classList.contains('preview-title')) {
        return ch;
      }
    }
    return null;
  }

  function enhanceBanner(section) {
    var brandId = section.id;
    if (BRAND_IDS.indexOf(brandId) < 0) return;
    var banner = findBanner(section);
    if (!banner || banner.classList.contains('brand-banner-wrap')) return;

    // Clean up any leftovers from older versions
    banner.querySelectorAll('.bb-go, .bb-overlay, .cbb-content, .cbb-glow, .cbb-product, .brand-banner-text').forEach(function(el){
      el.remove();
    });
    banner.removeAttribute('data-brand-name');

    banner.classList.add('brand-banner-wrap');
    banner.addEventListener('click', function(){
      if (typeof window.expandBrand === 'function') {
        window.expandBrand(brandId);
      } else {
        section.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function(){
    setTimeout(function(){
      document.querySelectorAll('.brand-section').forEach(enhanceBanner);
    }, 100);
    setTimeout(function(){
      document.querySelectorAll('.brand-section').forEach(enhanceBanner);
    }, 600);
  });
})();
