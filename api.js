// ============================================================================
// Azwellness.mn — frontend ↔ backend bridge
//   - Login/Register modal
//   - Checkout form (places order via POST /api/orders)
//   - "My orders" panel
//   - Token persistence in localStorage
// ============================================================================
(function(){
  'use strict';

  // ── config ────────────────────────────────────────────────────────────────
  // When served by Express (backend serves the static site too), API is at /api
  // When opened directly via file:// or a different port, switch to absolute URL.
  var API = (location.protocol === 'file:' || location.hostname === '')
    ? 'http://localhost:3000/api'
    : '/api';

  var TOKEN_KEY = 'azwell.token';
  var USER_KEY  = 'azwell.user';

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setAuth(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    renderAuthState();
  }
  function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    renderAuthState();
  }
  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
    catch (_) { return null; }
  }

  async function api(path, opts) {
    opts = opts || {};
    var token = getToken();
    var headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (token) headers.Authorization = 'Bearer ' + token;
    var r = await fetch(API + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    var data = null;
    try { data = await r.json(); } catch (_) {}
    if (!r.ok) throw Object.assign(new Error((data && data.error) || r.statusText), { status: r.status, data: data });
    return data;
  }

  // ── styles ────────────────────────────────────────────────────────────────
  var STYLE = `
    .az-modal-overlay { position:fixed; inset:0; background:rgba(10,20,30,.55); z-index:5000;
      display:none; align-items:center; justify-content:center; backdrop-filter:blur(3px); }
    .az-modal-overlay.open { display:flex; }
    .az-modal { background:#fff; border-radius:18px; padding:32px; width:92%; max-width:440px;
      box-shadow:0 20px 60px rgba(0,0,0,.25); position:relative; }
    .az-modal h2 { font-size:24px; font-weight:800; color:#1a2e38; margin-bottom:6px; }
    .az-modal .sub { color:#666; font-size:13px; margin-bottom:22px; }
    .az-modal label { display:block; font-size:12px; font-weight:700; color:#555;
      margin-top:14px; margin-bottom:6px; }
    .az-modal input, .az-modal textarea, .az-modal select { width:100%; padding:11px 14px; border:1.5px solid #ddd;
      border-radius:9px; font-size:14px; font-family:inherit; outline:none; transition:border .2s; background:#fff; }
    .az-modal input:focus, .az-modal textarea:focus, .az-modal select:focus { border-color:#1a9eab; }
    /* Override browser autofill background */
    .az-modal input:-webkit-autofill,
    .az-modal input:-webkit-autofill:hover,
    .az-modal input:-webkit-autofill:focus {
      -webkit-box-shadow: 0 0 0 30px #fff inset !important;
      -webkit-text-fill-color: #1a2e38 !important;
      transition: background-color 5000s ease-in-out 0s;
    }
    .az-modal .btn-primary { width:100%; margin-top:22px; background:linear-gradient(135deg,#1a6e8a,#1aaba0);
      color:#fff; border:none; padding:13px; border-radius:9px; font-weight:800; font-size:15px;
      cursor:pointer; font-family:inherit; }
    .az-modal .btn-primary:hover { filter:brightness(1.08); }
    .az-modal .switch { text-align:center; margin-top:14px; font-size:13px; color:#666; }
    .az-modal .switch a { color:#1a6e8a; font-weight:700; cursor:pointer; text-decoration:underline; }
    .az-modal .err { background:#fde8e8; color:#b00020; padding:10px 14px; border-radius:8px;
      font-size:13px; margin-top:14px; display:none; }
    .az-modal .ok  { background:#e7f6ed; color:#1a7a3e; padding:10px 14px; border-radius:8px;
      font-size:13px; margin-top:14px; display:none; }
    .az-modal .cls { position:absolute; top:14px; right:18px; background:none; border:none;
      font-size:22px; cursor:pointer; color:#888; }

    .az-userchip { background:#eaf6f3; border:2px solid #1aaba0; color:#1a6e8a;
      padding:7px 14px; border-radius:7px; font-weight:700; font-size:13px;
      display:inline-flex; align-items:center; gap:8px; cursor:pointer; }
    .az-userchip:hover { background:#dff0ec; }

    .az-menu { position:absolute; top:100%; right:0; margin-top:6px; background:#fff;
      border-radius:10px; box-shadow:0 6px 24px rgba(0,0,0,.15); min-width:200px;
      padding:8px 0; display:none; z-index:300; }
    .az-menu.open { display:block; }
    .az-menu button { display:block; width:100%; text-align:left; padding:10px 16px;
      background:none; border:none; cursor:pointer; font-size:13px; color:#1a2e38;
      font-family:inherit; }
    .az-menu button:hover { background:#f5f9fa; }

    .order-card { background:#fff; border:1px solid #eee; border-radius:10px;
      padding:14px; margin-bottom:12px; }
    .order-card .head { display:flex; justify-content:space-between; font-size:12px;
      color:#888; margin-bottom:8px; }
    .order-card .name { font-size:13px; }
    .order-card .total { font-weight:800; color:#1a6e8a; margin-top:8px; font-size:15px; }
  `;
  var styleEl = document.createElement('style');
  styleEl.textContent = STYLE;
  document.head.appendChild(styleEl);

  // ── modals ────────────────────────────────────────────────────────────────
  var modalRoot = document.createElement('div');
  modalRoot.innerHTML = `
    <!-- LOGIN -->
    <div class="az-modal-overlay" id="azLoginOverlay">
      <div class="az-modal">
        <button class="cls" data-close>✕</button>
        <h2>Нэвтрэх</h2>
        <p class="sub">Имэйл эсвэл утасны дугаараар нэвтэрнэ үү.</p>
        <form id="azLoginForm">
          <label>Имэйл эсвэл утас</label>
          <input name="identifier" type="text" required autocomplete="username" placeholder="user@email.com">
          <label>Нууц үг</label>
          <input name="password" type="password" required autocomplete="current-password">
          <div class="err" id="azLoginErr"></div>
          <button class="btn-primary" type="submit">Нэвтрэх</button>
        </form>
        <div style="text-align:center;margin-top:10px;">
          <a id="azForgotLink" style="font-size:12px;color:#1a6e8a;cursor:pointer;text-decoration:underline;">Нууц үг мартсан уу?</a>
        </div>
        <div class="switch">Шинээр бүртгүүлэх үү? <a data-switch="register">Бүртгүүлэх</a></div>
      </div>
    </div>

    <!-- FORGOT PASSWORD (SMS-based) -->
    <div class="az-modal-overlay" id="azForgotOverlay">
      <div class="az-modal">
        <button class="cls" data-close>✕</button>
        <h2>🔑 Нууц үг сэргээх</h2>
        <p class="sub">Утсаа оруулна уу. SMS код илгээгдэнэ.</p>
        <form id="azForgotForm">
          <label>Утас</label>
          <input name="phone" id="azForgotPhone" type="tel" required placeholder="9999-1234">
          <button type="button" id="azForgotSendBtn" class="btn-primary" style="width:100%;margin-top:10px;">📱 SMS код илгээх</button>

          <div id="azForgotCodeStep" style="display:none;margin-top:14px;padding:12px;background:#f0f8f7;border-radius:8px;">
            <label>SMS-ээр ирсэн 4 оронтой код</label>
            <input name="code" id="azForgotCode" type="text" maxlength="4" inputmode="numeric" placeholder="1 2 3 4" autocomplete="one-time-code" style="font-size:18px;letter-spacing:8px;text-align:center;font-weight:700;">
            <label style="margin-top:10px;">Шинэ нууц үг (6+ тэмдэгт)</label>
            <input name="new_password" id="azForgotNewPwd" type="password" minlength="6">
            <button type="submit" class="btn-primary" style="width:100%;margin-top:10px;">✓ Нууц үг шинэчлэх</button>
          </div>

          <div class="err" id="azForgotErr"></div>
          <div class="ok" id="azForgotOk" style="display:none;background:#e7f6ed;color:#1a7a3e;padding:10px;border-radius:6px;margin-top:14px;font-size:13px;"></div>
        </form>
        <div class="switch">Санасан уу? <a data-switch="login">Нэвтрэх</a></div>
      </div>
    </div>

    <!-- REGISTER -->
    <div class="az-modal-overlay" id="azRegOverlay">
      <div class="az-modal">
        <button class="cls" data-close>✕</button>
        <h2>Бүртгүүлэх</h2>
        <p class="sub">Утсаа SMS кодоор баталгаажуулж бүртгүүлнэ үү.</p>
        <form id="azRegForm">
          <label>Утас <span style="color:#b00020">*</span></label>
          <input name="phone" id="azRegPhone" type="tel" required autocomplete="tel" placeholder="9999-1234" inputmode="tel" style="width:100%;">
          <button type="button" id="azSendOtpBtn" class="btn-primary" style="width:100%;margin-top:8px;padding:10px;font-size:13px;">📱 SMS код илгээх</button>
          <div id="azOtpStatus" style="font-size:11px; margin-top:4px; color:#888;"></div>

          <div id="azOtpStep" style="display:none; margin-top:14px; padding:14px; background:#f0f8f7; border-radius:8px;">
            <label>SMS-ээр ирсэн 4 оронтой код</label>
            <input name="otp" id="azRegOtp" type="text" maxlength="4" placeholder="1 2 3 4" inputmode="numeric" autocomplete="one-time-code" style="width:100%; font-size:22px; letter-spacing:10px; text-align:center; font-weight:700; padding:10px;">
            <button type="button" id="azVerifyOtpBtn" class="btn-primary" style="width:100%;margin-top:10px;padding:10px;font-size:13px;">✓ Шалгах</button>
            <div id="azOtpVerifyStatus" style="font-size:11px; margin-top:6px;"></div>
          </div>

          <div id="azRegStep2" style="display:none; margin-top:14px;">
            <label>Нэр</label>
            <input name="name" type="text" autocomplete="name">
            <label>Имэйл <span style="color:#888;font-weight:400;font-size:11px;">(заавал биш)</span></label>
            <input name="email" type="email" autocomplete="email">
            <label>Нууц үг <span style="color:#888;font-weight:400;font-size:11px;">(6+ тэмдэгт)</span></label>
            <input name="password" type="password" required minlength="6" autocomplete="new-password">
            <div class="err" id="azRegErr"></div>
            <button class="btn-primary" type="submit">Бүртгүүлэх</button>
          </div>
        </form>
        <div class="switch">Хэрэглэгч мөн үү? <a data-switch="login">Нэвтрэх</a></div>
      </div>
    </div>

    <!-- CHECKOUT -->
    <div class="az-modal-overlay" id="azCheckoutOverlay">
      <div class="az-modal">
        <button class="cls" data-close>✕</button>
        <h2>Захиалга баталгаажуулах</h2>
        <p class="sub">Хүргэлтийн мэдээллээ оруулна уу.</p>
        <form id="azCheckoutForm">
          <label>Нэр <span style="color:#b00020">*</span></label>
          <input name="name" type="text" required>
          <label>Утас <span style="color:#b00020">*</span></label>
          <input name="phone" type="tel" required>
          <label>Имэйл (нэмэлт — баталгаажуулах захиа авах)</label>
          <input name="email" type="email">
          <label>Хүргэлтийн хаяг <span style="color:#b00020">*</span></label>
          <input name="address" type="text" required placeholder="Дүүрэг, хороо, гудамж, байр, тоот...">
          <label>Тэмдэглэл (нэмэлт)</label>
          <textarea name="notes" rows="3"></textarea>
          <label>💳 Төлбөрийн арга *</label>
          <div style="display:grid; grid-template-columns:repeat(2,1fr); gap:8px;">
            <label style="display:flex;align-items:center;gap:6px;padding:10px 12px;border:2px solid #ddd;border-radius:9px;cursor:pointer;font-weight:600;font-size:13px;">
              <input type="radio" name="payment_method" value="qpay" checked style="width:auto;margin:0;">
              <span>📱 QPay</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;padding:10px 12px;border:2px solid #ddd;border-radius:9px;cursor:pointer;font-weight:600;font-size:13px;">
              <input type="radio" name="payment_method" value="storepay" style="width:auto;margin:0;">
              <span>🏪 Storepay</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;padding:10px 12px;border:2px solid #ddd;border-radius:9px;cursor:pointer;font-weight:600;font-size:13px;">
              <input type="radio" name="payment_method" value="toki" style="width:auto;margin:0;">
              <span>💼 Toki</span>
            </label>
            <label style="display:flex;align-items:center;gap:6px;padding:10px 12px;border:2px solid #ddd;border-radius:9px;cursor:pointer;font-weight:600;font-size:13px;">
              <input type="radio" name="payment_method" value="pocket" style="width:auto;margin:0;">
              <span>👛 Pocket Zero</span>
            </label>
          </div>

          <label>🎟️ Купон код (нэмэлт)</label>
          <input name="coupon_code" id="azCouponInput" type="text" placeholder="Купон код оруулах" autocomplete="off" style="width:100%;text-transform:uppercase;font-size:14px;letter-spacing:1px;background:#fff;">
          <button type="button" id="azApplyCouponBtn" class="btn-primary" style="width:100%;margin-top:8px;padding:10px;font-size:13px;">🎟️ Купон хэрэглэх</button>
          <div id="azCouponStatus" style="font-size:11px;margin-top:6px;"></div>
          <div id="azCheckoutSummary" style="margin-top:14px; padding:12px; background:#f5f9fa;
            border-radius:8px; font-size:13px;"></div>
          <div class="err" id="azCheckoutErr"></div>
          <div class="ok"  id="azCheckoutOk"></div>
          <button class="btn-primary" type="submit">📦 Захиалга илгээх</button>
        </form>
      </div>
    </div>

    <!-- MY ORDERS -->
    <div class="az-modal-overlay" id="azOrdersOverlay">
      <div class="az-modal" style="max-width:520px;">
        <button class="cls" data-close>✕</button>
        <h2>Миний захиалгууд</h2>
        <p class="sub">Хийсэн бүх захиалгын түүх.</p>
        <div id="azOrdersList" style="max-height:60vh; overflow-y:auto; margin-top:14px;">
          <p style="text-align:center; color:#888; padding:30px;">Уншиж байна…</p>
        </div>
      </div>
    </div>

    <!-- QPay PAYMENT -->
    <div class="az-modal-overlay" id="azQpayOverlay">
      <div class="az-modal" style="max-width:420px;">
        <button class="cls" data-close>✕</button>
        <h2>📱 QPay-ээр төлөх</h2>
        <p class="sub">QR кодыг банкны аппликейшнээр унших</p>
        <div id="azQpayBox" style="text-align:center;padding:20px 0;">
          <div style="background:#fff;padding:16px;border-radius:12px;display:inline-block;border:1.5px solid #eee;">
            <img id="azQpayQr" src="" alt="QR" style="width:200px;height:200px;display:block;">
          </div>
          <div id="azQpayInvoice" style="margin-top:12px;font-size:11px;color:#888;font-family:monospace;"></div>
          <div id="azQpayAmount" style="margin-top:8px;font-size:22px;font-weight:800;color:#1a6e8a;"></div>
          <div id="azQpayStatus" style="margin-top:14px;color:#888;font-size:13px;">⏳ Төлбөр хийгдэхийг хүлээж байна...</div>
          <button id="azQpayMockBtn" class="btn-primary" style="margin-top:16px;display:none;background:#f5a623;">⚙️ Mock төлсөн гэж тэмдэглэх (DEV)</button>
        </div>
      </div>
    </div>

    <!-- PROFILE -->
    <div class="az-modal-overlay" id="azProfileOverlay">
      <div class="az-modal" style="max-width:480px;">
        <button class="cls" data-close>✕</button>
        <h2>👤 Профайл</h2>
        <p class="sub">Хувийн мэдээллээ засах</p>
        <form id="azProfileForm" style="margin-top:10px;">
          <label>Нэр</label>
          <input name="name" placeholder="Бат-Эрдэнэ">
          <label>Имэйл *</label>
          <input name="email" type="email" required>
          <label>Утас</label>
          <input name="phone" placeholder="9999-1234">
          <div class="err" id="azProfileErr" style="display:none;"></div>
          <div class="ok"  id="azProfileOk"  style="display:none;background:#e7f6ed;color:#1a7a3e;padding:10px;border-radius:6px;margin-top:14px;font-size:13px;"></div>
          <button class="btn" type="submit" style="width:100%;margin-top:14px;">Хадгалах</button>
        </form>
        <hr style="margin:22px 0; border:none; border-top:1px solid #eee;">
        <h3 style="font-size:15px; margin-bottom:8px;">🔑 Нууц үг солих</h3>
        <form id="azPasswordForm">
          <label>Одоогийн нууц үг</label>
          <input name="current_password" type="password" required>
          <label>Шинэ нууц үг (6+ тэмдэгт)</label>
          <input name="new_password" type="password" required minlength="6">
          <div class="err" id="azPasswordErr" style="display:none;"></div>
          <div class="ok"  id="azPasswordOk"  style="display:none;background:#e7f6ed;color:#1a7a3e;padding:10px;border-radius:6px;margin-top:14px;font-size:13px;"></div>
          <button class="btn" type="submit" style="width:100%;margin-top:14px;">Нууц үг шинэчлэх</button>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(modalRoot);

  function openModal(id) {
    document.querySelectorAll('.az-modal-overlay').forEach(o => o.classList.remove('open'));
    document.getElementById(id).classList.add('open');
  }
  function closeModals() {
    document.querySelectorAll('.az-modal-overlay').forEach(o => o.classList.remove('open'));
  }

  // Close handlers (X button + clicking overlay)
  document.addEventListener('click', function(e) {
    if (e.target.matches('[data-close]')) closeModals();
    if (e.target.classList.contains('az-modal-overlay')) closeModals();
    if (e.target.matches('[data-switch]')) {
      closeModals();
      openModal('az' + e.target.dataset.switch.charAt(0).toUpperCase() + e.target.dataset.switch.slice(1) + 'Overlay');
    }
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeModals();
  });

  // ── login / register flow ────────────────────────────────────────────────
  document.getElementById('azLoginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    var fd = new FormData(e.target);
    var err = document.getElementById('azLoginErr');
    err.style.display = 'none';
    try {
      var res = await api('/auth/login', {
        method: 'POST',
        body: { identifier: fd.get('identifier'), password: fd.get('password') }
      });
      setAuth(res.token, res.user);
      closeModals();
    } catch (e) {
      err.textContent = e.message || 'Алдаа гарлаа';
      err.style.display = 'block';
    }
  });

  document.getElementById('azRegForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    var fd = new FormData(e.target);
    var err = document.getElementById('azRegErr');
    err.style.display = 'none';
    try {
      var res = await api('/auth/register', {
        method: 'POST',
        body: {
          email: fd.get('email'),
          password: fd.get('password'),
          name: fd.get('name'),
          phone: fd.get('phone')
        }
      });
      setAuth(res.token, res.user);
      closeModals();
    } catch (e) {
      err.textContent = e.message || 'Алдаа гарлаа';
      err.style.display = 'block';
    }
  });

  // ── Forgot password ─────────────────────────────────────────────────────
  document.addEventListener('click', function(e){
    if (e.target.id === 'azForgotLink') {
      e.preventDefault();
      openModal('azForgotOverlay');
    }
  });

  // "SMS код илгээх" товч
  document.addEventListener('click', async function(e){
    if (e.target.id !== 'azForgotSendBtn') return;
    var phoneInp = document.getElementById('azForgotPhone');
    var err = document.getElementById('azForgotErr');
    var ok  = document.getElementById('azForgotOk');
    err.style.display = 'none';
    ok.style.display  = 'none';
    var phone = (phoneInp.value || '').trim();
    if (!phone) {
      err.textContent = '⚠️ Утсаа оруулна уу';
      err.style.display = 'block';
      return;
    }
    e.target.disabled = true;
    e.target.textContent = '⏳ Илгээж байна...';
    try {
      var r = await api('/auth/forgot-password-sms', { method:'POST', body:{ phone: phone } });
      ok.innerHTML = '✅ SMS код илгээгдлээ. Утсаа шалгана уу.' + (r.dev_code ? ' (DEV: ' + r.dev_code + ')' : '');
      ok.style.display = 'block';
      document.getElementById('azForgotCodeStep').style.display = 'block';
      document.getElementById('azForgotCode').focus();
      setTimeout(function(){
        e.target.disabled = false;
        e.target.textContent = '📱 SMS код илгээх';
      }, 60000);
    } catch (ex) {
      err.textContent = '⚠️ ' + ex.message;
      err.style.display = 'block';
      e.target.disabled = false;
      e.target.textContent = '📱 SMS код илгээх';
    }
  });

  // Submit final form (verify + set new password)
  document.addEventListener('submit', async function(e){
    if (e.target && e.target.id === 'azForgotForm') {
      e.preventDefault();
      var fd = new FormData(e.target);
      var err = document.getElementById('azForgotErr');
      var ok  = document.getElementById('azForgotOk');
      err.style.display = 'none';
      var phone = fd.get('phone');
      var code  = fd.get('code');
      var pwd   = fd.get('new_password');
      if (!code || !pwd) {
        err.textContent = '⚠️ Код, шинэ нууц үгээ оруулна уу';
        err.style.display = 'block';
        return;
      }
      try {
        await api('/auth/reset-password-sms', {
          method: 'POST',
          body: { phone: phone, code: code, new_password: pwd }
        });
        ok.innerHTML = '✅ Нууц үг амжилттай шинэчлэгдлээ!<br>Шинэ нууц үгээрээ нэвтэрнэ үү.';
        ok.style.display = 'block';
        document.getElementById('azForgotCodeStep').style.display = 'none';
        e.target.reset();
        setTimeout(function(){
          closeModals();
          openModal('azLoginOverlay');
        }, 2000);
      } catch (ex) {
        err.textContent = '⚠️ ' + ex.message;
        err.style.display = 'block';
      }
    }
  });

  // ── OTP flow (send + verify) ────────────────────────────────────────────
  var _otpVerifiedPhone = null;

  document.addEventListener('click', async function(e){
    if (e.target.id === 'azSendOtpBtn') {
      var phoneInp = document.getElementById('azRegPhone');
      var status   = document.getElementById('azOtpStatus');
      var phone    = (phoneInp.value || '').trim();
      if (!phone) {
        status.style.color = '#b00020';
        status.textContent = '⚠️ Утасны дугаараа оруулна уу';
        return;
      }
      e.target.disabled = true;
      status.style.color = '#888';
      status.textContent = '⏳ Код илгээж байна...';
      try {
        var r = await api('/auth/send-otp', { method:'POST', body:{ phone: phone } });
        status.style.color = '#1a7a3e';
        status.textContent = '✅ SMS код илгээгдлээ. Утсаа шалгана уу.' + (r.dev_code ? ' (DEV код: ' + r.dev_code + ')' : '');
        document.getElementById('azOtpStep').style.display = 'block';
        document.getElementById('azRegOtp').focus();
        // Re-enable button after 60s
        setTimeout(function(){ e.target.disabled = false; }, 60000);
      } catch (ex) {
        status.style.color = '#b00020';
        status.textContent = '⚠️ ' + ex.message;
        e.target.disabled = false;
      }
    }
    if (e.target.id === 'azVerifyOtpBtn') {
      var phoneInp2 = document.getElementById('azRegPhone');
      var otpInp    = document.getElementById('azRegOtp');
      var status2   = document.getElementById('azOtpVerifyStatus');
      var phone2    = (phoneInp2.value || '').trim();
      var code      = (otpInp.value || '').trim();
      if (!code) {
        status2.style.color = '#b00020';
        status2.textContent = '⚠️ Код оруулна уу';
        return;
      }
      e.target.disabled = true;
      status2.style.color = '#888';
      status2.textContent = '⏳ Шалгаж байна...';
      try {
        await api('/auth/verify-otp', { method:'POST', body:{ phone: phone2, code: code } });
        status2.style.color = '#1a7a3e';
        status2.textContent = '✅ Утас баталгаажлаа';
        _otpVerifiedPhone = phone2;
        // Show the rest of the registration form
        document.getElementById('azRegStep2').style.display = 'block';
      } catch (ex) {
        status2.style.color = '#b00020';
        status2.textContent = '⚠️ ' + ex.message;
        e.target.disabled = false;
      }
    }
  });

  // ── wire header login/register buttons ──────────────────────────────────
  function renderAuthState() {
    var user = getUser();
    var loginBtn = document.querySelector('.btn-login');
    var regBtn   = document.querySelector('.btn-reg');
    var hdrBtns  = document.querySelector('.hdr-btns');
    if (!hdrBtns) return;

    var existingChip = hdrBtns.querySelector('.az-userchip-wrap');
    if (existingChip) existingChip.remove();

    if (user) {
      if (loginBtn) loginBtn.style.display = 'none';
      if (regBtn)   regBtn.style.display   = 'none';
      var wrap = document.createElement('div');
      wrap.className = 'az-userchip-wrap';
      wrap.style.position = 'relative';
      wrap.innerHTML =
        '<button class="az-userchip">' +
          '<span>👤</span><span>' + (user.name || user.email) + '</span><span>▾</span>' +
        '</button>' +
        '<div class="az-menu">' +
          '<button data-act="profile">👤 Профайл</button>' +
          '<button data-act="orders">📋 Миний захиалга</button>' +
          '<button data-act="wishlist">❤️ Дуртай</button>' +
          (user.is_admin ? '<button data-act="admin">🛡️ Admin панель</button>' : '') +
          '<button data-act="logout">🚪 Гарах</button>' +
        '</div>';
      hdrBtns.insertBefore(wrap, hdrBtns.firstChild);

      wrap.querySelector('.az-userchip').addEventListener('click', function(ev){
        ev.stopPropagation();
        wrap.querySelector('.az-menu').classList.toggle('open');
      });
      wrap.querySelector('[data-act="logout"]').addEventListener('click', async function(){
        try { await api('/auth/logout', { method:'POST' }); } catch(_) {}
        clearAuth();
      });
      wrap.querySelector('[data-act="profile"]').addEventListener('click', openProfile);
      wrap.querySelector('[data-act="orders"]').addEventListener('click', openOrders);
      var wlBtn = wrap.querySelector('[data-act="wishlist"]');
      if (wlBtn) wlBtn.addEventListener('click', function(){
        if (typeof window.azOpenWishlist === 'function') window.azOpenWishlist();
      });
      var admBtn = wrap.querySelector('[data-act="admin"]');
      if (admBtn) admBtn.addEventListener('click', function(){
        // Sync the storefront token into the admin's token slot, then open admin.html
        localStorage.setItem('azwell.admin.token', localStorage.getItem('azwell.token'));
        localStorage.setItem('azwell.admin.user',  localStorage.getItem('azwell.user'));
        window.open('/admin', '_blank');
      });
      document.addEventListener('click', function closeMenu(){
        wrap.querySelector('.az-menu').classList.remove('open');
      });
    } else {
      if (loginBtn) loginBtn.style.display = '';
      if (regBtn)   regBtn.style.display   = '';
    }
  }

  document.querySelectorAll('.btn-login').forEach(b =>
    b.addEventListener('click', () => openModal('azLoginOverlay')));
  document.querySelectorAll('.btn-reg').forEach(b =>
    b.addEventListener('click', () => openModal('azRegOverlay')));

  // ── checkout ─────────────────────────────────────────────────────────────
  var _appliedCoupon = null; // { code, discount, ... } once validated

  function renderCheckoutTotals() {
    var subtotal = window.cart.reduce(function(s,i){ return s + i.now * i.qty; }, 0);
    var discount = _appliedCoupon ? _appliedCoupon.discount : 0;
    var lines = window.cart.map(function(i){
      return '<div style="display:flex;justify-content:space-between;margin:4px 0;">' +
        '<span>' + i.name + ' × ' + i.qty + '</span>' +
        '<span style="font-weight:700;">' + (i.now*i.qty).toLocaleString() + '₮</span>' +
        '</div>';
    }).join('');
    var discLine = _appliedCoupon ? (
      '<div style="display:flex;justify-content:space-between;margin:4px 0;color:#1a7a3e;">' +
        '<span>🎟️ Купон (' + _appliedCoupon.code + ')</span>' +
        '<span style="font-weight:700;">−' + discount.toLocaleString() + '₮</span>' +
      '</div>'
    ) : '';
    document.getElementById('azCheckoutSummary').innerHTML =
      lines + discLine +
      '<hr style="border:none;border-top:1px solid #ddd;margin:8px 0;">' +
      '<div style="display:flex;justify-content:space-between;font-weight:800;">' +
      '<span>Нийт төлөх:</span><span style="color:#1a6e8a;">' + (subtotal - discount).toLocaleString() + '₮</span></div>';
  }

  // Apply coupon button
  document.addEventListener('click', async function(e){
    if (e.target.id !== 'azApplyCouponBtn') return;
    var input  = document.getElementById('azCouponInput');
    var status = document.getElementById('azCouponStatus');
    var code   = (input.value || '').trim();
    if (!code) {
      status.style.color = '#b00020';
      status.textContent = '⚠️ Купон код оруулна уу';
      return;
    }
    var subtotal = window.cart.reduce(function(s,i){ return s + i.now * i.qty; }, 0);
    e.target.disabled = true;
    e.target.textContent = '...';
    try {
      var r = await fetch(API + '/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code, subtotal: subtotal })
      });
      var data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Алдаа');
      _appliedCoupon = data;
      status.style.color = '#1a7a3e';
      status.textContent = '✅ Купон хэрэглэгдсэн: −' + data.discount.toLocaleString() + '₮';
      renderCheckoutTotals();
    } catch (ex) {
      _appliedCoupon = null;
      status.style.color = '#b00020';
      status.textContent = '⚠️ ' + ex.message;
      renderCheckoutTotals();
    } finally {
      e.target.disabled = false;
      e.target.textContent = 'Хэрэглэх';
    }
  });

  function openCheckout() {
    if (!window.cart || window.cart.length === 0) {
      alert('Сагс хоосон байна');
      return;
    }
    var user = getUser();
    // Require login before checkout
    if (!user) {
      alert('Захиалга хийхийн тулд эхлээд нэвтэрнэ үү');
      openModal('azLoginOverlay');
      return;
    }
    var form = document.getElementById('azCheckoutForm');
    if (user) {
      form.querySelector('[name=name]').value  = user.name  || '';
      form.querySelector('[name=phone]').value = user.phone || '';
      const emailField = form.querySelector('[name=email]');
      if (emailField) emailField.value = user.email || '';
    }
    _appliedCoupon = null;
    var couponInput = document.getElementById('azCouponInput');
    if (couponInput) couponInput.value = '';
    var couponStatus = document.getElementById('azCouponStatus');
    if (couponStatus) couponStatus.textContent = '';
    renderCheckoutTotals();
    document.getElementById('azCheckoutErr').style.display = 'none';
    document.getElementById('azCheckoutOk').style.display  = 'none';
    openModal('azCheckoutOverlay');
  }

  document.getElementById('azCheckoutForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    var fd  = new FormData(e.target);
    var err = document.getElementById('azCheckoutErr');
    var ok  = document.getElementById('azCheckoutOk');
    err.style.display = 'none';
    ok.style.display  = 'none';
    try {
      var paymentMethod = fd.get('payment_method') || 'cash';
      var res = await api('/orders', {
        method: 'POST',
        body: {
          customer: {
            name: fd.get('name'),
            phone: fd.get('phone'),
            address: fd.get('address'),
            notes: fd.get('notes') || undefined,
            email: fd.get('email') || undefined
          },
          items: window.cart.map(function(i){
            return { brand: i.brand, name: i.name, price: i.now, quantity: i.qty, variant: i.variant || null };
          }),
          coupon_code: _appliedCoupon ? _appliedCoupon.code : undefined
        }
      });

      // If online payment selected → open QR/payment modal
      if (['qpay','storepay','toki','pocket'].indexOf(paymentMethod) >= 0) {
        window.cart = [];
        if (typeof window.updateCart === 'function') window.updateCart();
        await openQpayPayment(res.orderId, paymentMethod);
        return;
      }
      ok.innerHTML = '✅ Захиалга #' + res.orderId + ' амжилттай үүсгэгдлээ! Нийт: ' +
                     res.total.toLocaleString() + '₮';
      ok.style.display = 'block';
      window.cart = [];
      if (typeof window.updateCart === 'function') window.updateCart();
      setTimeout(closeModals, 2500);
    } catch (e) {
      err.textContent = e.message || 'Алдаа гарлаа';
      err.style.display = 'block';
    }
  });

  // ── QPay payment ─────────────────────────────────────────────────────
  var _qpayPollTimer = null;

  async function openQpayPayment(orderId, method) {
    method = method || 'qpay';
    var methodLabel = { qpay: '📱 QPay', storepay: '🏪 Storepay', toki: '💼 Toki', pocket: '👛 Pocket Zero' }[method] || '📱 QPay';
    // Update modal title
    var modalTitle = document.querySelector('#azQpayOverlay h2');
    if (modalTitle) modalTitle.textContent = methodLabel + '-ээр төлөх';
    openModal('azQpayOverlay');
    document.getElementById('azQpayStatus').textContent = '⏳ Төлбөр бэлтгэгдэж байна...';
    document.getElementById('azQpayMockBtn').style.display = 'none';
    document.getElementById('azQpayQr').src = '';
    try {
      var r = await api('/payment/create', {
        method: 'POST',
        body: { orderId: orderId }
      });
      // Generate QR code image using public QR service
      document.getElementById('azQpayQr').src =
        'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + encodeURIComponent(r.qrText);
      document.getElementById('azQpayInvoice').textContent = 'INV: ' + r.invoiceId;
      document.getElementById('azQpayAmount').textContent = r.amount.toLocaleString() + '₮';
      document.getElementById('azQpayStatus').textContent = '⏳ Банкны аппликейшнээр уншиж төлнө үү...';
      if (r.mock) {
        document.getElementById('azQpayMockBtn').style.display = 'inline-block';
        document.getElementById('azQpayMockBtn').dataset.invoice = r.invoiceId;
      }
      // Start polling every 3 seconds
      if (_qpayPollTimer) clearInterval(_qpayPollTimer);
      _qpayPollTimer = setInterval(async function(){
        try {
          var c = await fetch(API + '/payment/check/' + r.invoiceId).then(x => x.json());
          if (c.status === 'paid') {
            clearInterval(_qpayPollTimer);
            _qpayPollTimer = null;
            document.getElementById('azQpayStatus').innerHTML =
              '<span style="color:#1a7a3e;font-weight:700;">✅ Төлбөр амжилттай! Захиалга #' + c.orderId + '</span>';
            document.getElementById('azQpayMockBtn').style.display = 'none';
            setTimeout(function(){ closeModals(); }, 2500);
          }
        } catch (_) {}
      }, 3000);
    } catch (e) {
      document.getElementById('azQpayStatus').innerHTML = '<span style="color:#b00020;">⚠️ ' + e.message + '</span>';
    }
  }

  // Mock-pay button (DEV only)
  document.addEventListener('click', async function(e){
    if (e.target.id !== 'azQpayMockBtn') return;
    var invoice = e.target.dataset.invoice;
    if (!invoice) return;
    e.target.disabled = true;
    e.target.textContent = '...';
    try {
      await fetch(API + '/payment/mock-pay/' + invoice, { method: 'POST' });
      // Polling will catch it
    } catch (ex) {
      alert('Алдаа: ' + ex.message);
      e.target.disabled = false;
    }
  });

  // Stop polling when modal closes
  document.addEventListener('click', function(e){
    if (e.target.closest && e.target.closest('#azQpayOverlay [data-close]')) {
      if (_qpayPollTimer) { clearInterval(_qpayPollTimer); _qpayPollTimer = null; }
    }
  });

  // Wire the existing "Захиалга хийх" button
  document.addEventListener('click', function(e){
    if (e.target.classList && e.target.classList.contains('ccheckout')) {
      e.preventDefault();
      openCheckout();
    }
  });

  // ── profile ─────────────────────────────────────────────────────────────
  function openProfile() {
    openModal('azProfileOverlay');
    var u = getUser();
    if (!u) return;
    var form = document.getElementById('azProfileForm');
    form.elements['name'].value  = u.name  || '';
    form.elements['email'].value = u.email || '';
    form.elements['phone'].value = u.phone || '';
    document.getElementById('azProfileErr').style.display = 'none';
    document.getElementById('azProfileOk').style.display  = 'none';
    document.getElementById('azPasswordForm').reset();
    document.getElementById('azPasswordErr').style.display = 'none';
    document.getElementById('azPasswordOk').style.display  = 'none';
  }

  // Profile form submit
  document.addEventListener('submit', async function(e){
    if (e.target && e.target.id === 'azProfileForm') {
      e.preventDefault();
      var fd = new FormData(e.target);
      var err = document.getElementById('azProfileErr');
      var ok  = document.getElementById('azProfileOk');
      err.style.display = 'none';
      ok.style.display  = 'none';
      try {
        var res = await api('/auth/profile', {
          method: 'PUT',
          body: {
            name:  fd.get('name'),
            email: fd.get('email'),
            phone: fd.get('phone')
          }
        });
        // Save updated user
        localStorage.setItem(USER_KEY, JSON.stringify(res.user));
        renderAuthState();
        ok.textContent = '✅ Профайл амжилттай хадгалагдлаа';
        ok.style.display = 'block';
      } catch (ex) {
        err.textContent = '⚠️ ' + ex.message;
        err.style.display = 'block';
      }
    }
    if (e.target && e.target.id === 'azPasswordForm') {
      e.preventDefault();
      var fd2 = new FormData(e.target);
      var err2 = document.getElementById('azPasswordErr');
      var ok2  = document.getElementById('azPasswordOk');
      err2.style.display = 'none';
      ok2.style.display  = 'none';
      try {
        await api('/auth/change-password', {
          method: 'POST',
          body: {
            current_password: fd2.get('current_password'),
            new_password:     fd2.get('new_password')
          }
        });
        ok2.textContent = '✅ Нууц үг амжилттай шинэчлэгдлээ';
        ok2.style.display = 'block';
        e.target.reset();
      } catch (ex) {
        err2.textContent = '⚠️ ' + ex.message;
        err2.style.display = 'block';
      }
    }
  });

  // ── my orders ───────────────────────────────────────────────────────────
  function escHtml(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  // Cancel order button handler
  document.addEventListener('click', async function(e){
    var orderId = e.target.dataset && e.target.dataset.cancelOrder;
    if (!orderId) return;
    if (!confirm('Захиалга #' + orderId + '-ийг цуцлах уу?\nЦуцалснаар бүтээгдэхүүний үлдэгдэлд буцаагдана.')) return;
    e.target.disabled = true;
    e.target.textContent = 'Уншиж байна...';
    try {
      await api('/orders/' + orderId + '/cancel', { method: 'POST' });
      // Re-load orders
      openOrders();
    } catch (ex) {
      alert('⚠️ Алдаа: ' + ex.message);
      e.target.disabled = false;
      e.target.textContent = '❌ Захиалгаа цуцлах';
    }
  });

  var STATUS_MN = {
    pending:   { label: '⏳ Хүлээгдэж байгаа',  color: '#a06b00', bg: '#fff5e1' },
    confirmed: { label: '✅ Баталгаажсан',       color: '#1a4f8a', bg: '#e1efff' },
    shipped:   { label: '🚚 Хүргэлтэнд гарсан',  color: '#1a8a72', bg: '#e6f4f1' },
    delivered: { label: '📬 Хүргэгдсэн',         color: '#1a7a3e', bg: '#e7f6ed' },
    cancelled: { label: '❌ Цуцлагдсан',         color: '#b00020', bg: '#fde8e8' }
  };

  function statusBadge(status) {
    var s = STATUS_MN[status] || { label: status, color: '#666', bg: '#eee' };
    return '<span style="display:inline-block;padding:4px 12px;border-radius:50px;font-size:11px;font-weight:700;background:' + s.bg + ';color:' + s.color + ';">' + s.label + '</span>';
  }

  function formatDate(dt) {
    if (!dt) return '';
    var d = new Date(dt.replace(' ', 'T') + 'Z');
    if (isNaN(d.getTime())) return dt;
    return d.toLocaleString('mn-MN', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' });
  }

  function orderProgress(status) {
    if (status === 'cancelled') return '';
    var steps = [
      { key: 'pending',   label: 'Хүлээж' },
      { key: 'confirmed', label: 'Баталгаажсан' },
      { key: 'shipped',   label: 'Хүргэлтэнд гарсан' },
      { key: 'delivered', label: 'Хүргэгдсэн' }
    ];
    var currentIdx = steps.findIndex(function(s){ return s.key === status; });
    return '<div style="display:flex;gap:6px;margin:10px 0;font-size:10px;color:#666;">' +
      steps.map(function(s, i){
        var active = i <= currentIdx;
        var color  = active ? '#1aaba0' : '#ddd';
        return '<div style="flex:1;text-align:center;min-width:0;">' +
          '<div style="height:4px;background:' + color + ';border-radius:2px;margin-bottom:4px;"></div>' +
          '<span style="color:' + (active ? '#1a6e8a' : '#aaa') + ';font-weight:' + (active ? '700' : '500') + ';line-height:1.2;display:block;">' + s.label + '</span>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  async function openOrders() {
    openModal('azOrdersOverlay');
    var list = document.getElementById('azOrdersList');
    list.innerHTML = '<p style="text-align:center;color:#888;padding:30px;">Уншиж байна…</p>';
    try {
      var res = await api('/orders/me');
      if (!res.orders || res.orders.length === 0) {
        list.innerHTML = '<div style="text-align:center;color:#888;padding:50px 20px;">' +
          '<div style="font-size:48px;">📦</div>' +
          '<p style="margin-top:10px;">Та одоохондоо ямар нэгэн захиалга хийгээгүй байна.</p>' +
        '</div>';
        return;
      }
      list.innerHTML = res.orders.map(function(o){
        var itemsCount = o.items.reduce(function(s, it){ return s + it.quantity; }, 0);
        var items = o.items.map(function(it){
          return '<div style="padding:6px 0;border-bottom:1px dashed #eee;font-size:13px;">' +
            '<strong>' + escHtml(it.product_name) + '</strong>' +
            '<div style="display:flex;justify-content:space-between;color:#888;font-size:11px;margin-top:2px;">' +
              '<span>' + escHtml(it.brand) + ' • ' + it.quantity + ' ширхэг</span>' +
              '<span>' + (it.price * it.quantity).toLocaleString() + '₮</span>' +
            '</div>' +
          '</div>';
        }).join('');
        return '<div style="background:#fff;border:1px solid #eee;border-radius:12px;padding:16px;margin-bottom:14px;box-shadow:0 2px 6px rgba(0,0,0,.04);">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
            '<strong style="font-size:14px;">Захиалга #' + o.id + '</strong>' +
            statusBadge(o.status) +
          '</div>' +
          '<div style="color:#888;font-size:11px;margin-bottom:8px;">📅 ' + formatDate(o.created_at) + '</div>' +
          orderProgress(o.status) +
          '<div style="margin-top:8px;">' + items + '</div>' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:10px;border-top:1px solid #f0f3f5;">' +
            '<span style="color:#888;font-size:11px;">' + itemsCount + ' ширхэг бараа</span>' +
            '<strong style="font-size:16px;color:#1a6e8a;">' + o.total.toLocaleString() + '₮</strong>' +
          '</div>' +
          (o.status === 'pending'
            ? '<button class="btn btn-ghost" style="width:100%;margin-top:10px;padding:8px;font-size:12px;color:#b00020;border-color:#b00020;" data-cancel-order="' + o.id + '">❌ Захиалгаа цуцлах</button>'
            : '') +
        '</div>';
      }).join('');
    } catch (e) {
      list.innerHTML = '<p style="color:#b00020;">Алдаа: ' + (e.message || 'Уншиж чадсангүй') + '</p>';
    }
  }

  // ── on load ──────────────────────────────────────────────────────────────
  renderAuthState();
})();
