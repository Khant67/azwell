// ============================================================================
// Azwellness frontend config
//
// ❗ ВАЖНО: Railway-д backend deploy хийсний дараа доорхи URL-г өөрчилнө!
//    Жишээ нь: 'https://azwell-backend-production.up.railway.app/api'
// ============================================================================
(function () {
  'use strict';

  // ⬇⬇⬇  ЭНИЙГ ӨӨРЧЛӨХ  ⬇⬇⬇
  var PRODUCTION_API = 'https://CHANGE-ME-AFTER-RAILWAY-DEPLOY.up.railway.app/api';
  // ⬆⬆⬆  ЭНИЙГ ӨӨРЧЛӨХ  ⬆⬆⬆

  var h = location.hostname;
  var proto = location.protocol;

  // 1) Локал файлаар онгойлгосон бол localhost backend-руу
  if (proto === 'file:' || h === '') {
    window.AZWELL_API_BASE = 'http://localhost:3000/api';
    return;
  }

  // 2) Localhost / LAN IP / Railway domain → backend нь frontend-г тооцоолж байгаа
  if (h === 'localhost' ||
      h === '127.0.0.1' ||
      h.startsWith('192.168.') ||
      h.startsWith('10.') ||
      h.endsWith('.up.railway.app') ||
      h.endsWith('.railway.app')) {
    window.AZWELL_API_BASE = '/api';
    return;
  }

  // 3) Vercel дээр (эсвэл хувийн домэйн) → Railway backend руу
  window.AZWELL_API_BASE = PRODUCTION_API;
})();
