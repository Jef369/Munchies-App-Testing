// Munchies customer app — talks to real backend API
const API = '/api';
const VP = document.getElementById('viewport');
const TABBAR = document.getElementById('tabbar');

// ===== Live clock =====
function tickClock(){
  const d=new Date(),h=d.getHours(),m=String(d.getMinutes()).padStart(2,'0'),hh=h%12||12;
  document.getElementById('clock').textContent=`${hh}:${m}`;
}
setInterval(tickClock,30000);tickClock();

// ===== State =====
const state = {
  user: null,
  screen: 'splash',
  prevScreen: null,
  products: [],
  categories: [],
  cart: { items: [], subtotal_cents: 0 },
  selectedProduct: null,
  selectedVariant: null,
  qty: 1,
  fulfillment: 'delivery',
  category: null,
  promo: null,
  promoDiscount: 0,
  currentOrder: null,
  loading: false,
  error: null,
};

// ===== API helper (with 60s timeout — Render free tier can take ~50s to wake from sleep) =====
async function api(path, opts = {}) {
  const controller = new AbortController();
  const timeoutMs = opts.timeout || 60000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(API + path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!r.ok) {
      const e = await r.json().catch(()=>({error:`request failed (${r.status})`}));
      throw new Error(e.error || `request failed (${r.status})`);
    }
    return r.json();
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') throw new Error('Server is taking too long to respond. It may be waking up — please try again in a moment.');
    throw e;
  }
}

// Pre-warm server on app load so first user request is fast (Render free tier sleeps after 15min idle)
fetch(API + '/categories', { credentials: 'include' }).catch(()=>{});

// ===== Toast =====
function toast(title, body) {
  document.getElementById('toast-title').textContent = title;
  document.getElementById('toast-body').textContent = body || '';
  const t = document.getElementById('toast');
  t.classList.add('show');
  clearTimeout(window._tt);
  window._tt = setTimeout(()=>t.classList.remove('show'), 2600);
}

// ===== Money =====
const $$ = c => `$${(c/100).toFixed(2)}`;

// ===== XSS-safe rendering — escape any user/product data before rendering as HTML =====
const esc = (s) => {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
};

// ===== Address (persisted in browser localStorage) =====
function getAddress() {
  return localStorage.getItem('munchies_address') || '';
}
function getAddressShort() {
  const a = getAddress();
  if (!a) return 'Add address';
  // Return the first part before the first comma (street) or first 22 chars
  const first = a.split(',')[0].trim();
  return first.length > 22 ? first.slice(0,20) + '…' : first;
}
// Inject autocomplete modal styles once
(function injectAddrCSS(){
  if (document.getElementById('addr-css')) return;
  const s = document.createElement('style');
  s.id = 'addr-css';
  s.textContent = `
    .addr-modal{position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(10px);z-index:9999;display:flex;flex-direction:column;animation:fadeIn .2s ease}
    .addr-head{padding:18px 22px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:12px;background:var(--bg)}
    .addr-head .b{width:40px;height:40px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line);display:grid;place-items:center;cursor:pointer;color:var(--text)}
    .addr-head .b svg{width:18px;height:18px}
    .addr-head .t{font-family:'Syne';font-size:18px;font-weight:700;flex:1}
    .addr-search{padding:14px 22px;background:var(--bg);border-bottom:1px solid var(--line)}
    .addr-search input{width:100%;background:var(--surface-2);border:1px solid var(--line);border-radius:14px;padding:16px 18px;color:var(--text);font-family:inherit;font-size:15px;outline:none}
    .addr-search input:focus{border-color:var(--neon)}
    .addr-results{flex:1;overflow-y:auto;background:var(--bg);padding:10px 0}
    .addr-result{display:flex;gap:14px;padding:14px 22px;cursor:pointer;border-bottom:1px solid var(--surface-2);align-items:flex-start}
    .addr-result:hover,.addr-result:active{background:var(--surface-2)}
    .addr-result .pin{width:36px;height:36px;border-radius:10px;background:var(--surface-3);display:grid;place-items:center;flex-shrink:0;color:var(--neon);font-size:16px}
    .addr-result .info{flex:1;min-width:0}
    .addr-result .line1{font-size:14px;font-weight:600;line-height:1.3;color:var(--text)}
    .addr-result .line2{font-size:12px;color:var(--text-mute);margin-top:3px}
    .addr-empty{text-align:center;padding:50px 30px;color:var(--text-mute);font-size:13px}
    .addr-empty .em{font-size:42px;margin-bottom:10px;opacity:.6}
    .addr-loading{text-align:center;padding:30px}
    .addr-loading .spinner{margin:0 auto;width:24px;height:24px;border:2px solid var(--line);border-top-color:var(--neon);border-radius:50%;animation:spin .8s linear infinite}
    .addr-foot{padding:14px 22px 22px;border-top:1px solid var(--line);background:var(--bg)}
    .addr-manual{font-size:12px;color:var(--text-mute);text-align:center;line-height:1.5}
    .addr-manual a{color:var(--neon);cursor:pointer;font-weight:600}
  `;
  document.head.appendChild(s);
})();

window.editAddress = () => {
  const cur = getAddress();
  const host = document.createElement('div');
  host.id = 'addr-modal-host';
  host.innerHTML = `
    <div class="addr-modal">
      <div class="addr-head">
        <div class="b" onclick="closeAddrModal()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></div>
        <div class="t">Delivery address</div>
      </div>
      <div class="addr-search">
        <input id="addr-input" type="text" placeholder="Start typing your address..." value="${cur.replace(/"/g,'&quot;')}" autocomplete="off" autocorrect="off" spellcheck="false" />
      </div>
      <div class="addr-results" id="addr-results">
        <div class="addr-empty"><div class="em">📍</div>Type at least 3 letters to search<br/>for your address</div>
      </div>
      <div class="addr-foot">
        <div class="addr-manual">Can't find your address? <a onclick="useTypedAddress()">Use what I typed</a></div>
      </div>
    </div>`;
  document.body.appendChild(host);
  const inp = document.getElementById('addr-input');
  setTimeout(() => { inp.focus(); inp.select(); }, 100);
  inp.addEventListener('input', onAddrInput);
  inp.addEventListener('keydown', e => { if (e.key === 'Escape') closeAddrModal(); });
  // If pre-filled, run a search to show suggestions
  if (cur.length >= 3) onAddrInput();
};

let addrDebounce;
function onAddrInput() {
  clearTimeout(addrDebounce);
  const q = document.getElementById('addr-input').value.trim();
  const results = document.getElementById('addr-results');
  if (q.length < 3) {
    results.innerHTML = `<div class="addr-empty"><div class="em">📍</div>Type at least 3 letters to search<br/>for your address</div>`;
    return;
  }
  results.innerHTML = `<div class="addr-loading"><div class="spinner"></div></div>`;
  addrDebounce = setTimeout(async () => {
    try {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en`;
      const r = await fetch(url);
      const d = await r.json();
      renderAddrResults(d.features || [], q);
    } catch (e) {
      results.innerHTML = `<div class="addr-empty"><div class="em">⚠️</div>Search failed. Tap "Use what I typed" below to enter manually.</div>`;
    }
  }, 350);
}

function renderAddrResults(features, q) {
  const results = document.getElementById('addr-results');
  if (!features.length) {
    results.innerHTML = `<div class="addr-empty"><div class="em">🔍</div>No matches for "${q}"<br/><span style="font-size:11px">Try adding a city or zip code, or tap "Use what I typed" below.</span></div>`;
    return;
  }
  results.innerHTML = features.map((f, i) => {
    const p = f.properties || {};
    const housenumber = p.housenumber || '';
    const street = p.street || p.name || '';
    const line1Parts = [housenumber, street].filter(Boolean).join(' ') || p.name || 'Unnamed location';
    const line2Parts = [p.city, p.state, p.postcode, p.country].filter(Boolean).join(', ');
    const fullAddress = [line1Parts, line2Parts].filter(Boolean).join(', ');
    return `
      <div class="addr-result" onclick="pickAddress(${i})">
        <div class="pin">📍</div>
        <div class="info">
          <div class="line1">${escapeHtml(line1Parts)}</div>
          <div class="line2">${escapeHtml(line2Parts || '—')}</div>
        </div>
      </div>`;
  }).join('');
  // Stash features so click handler can read them
  window._addrFeatures = features.map((f) => {
    const p = f.properties || {};
    const housenumber = p.housenumber || '';
    const street = p.street || p.name || '';
    const line1 = [housenumber, street].filter(Boolean).join(' ') || p.name || '';
    const line2 = [p.city, p.state, p.postcode, p.country].filter(Boolean).join(', ');
    return [line1, line2].filter(Boolean).join(', ');
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

window.pickAddress = (i) => {
  const addr = (window._addrFeatures || [])[i];
  if (!addr) return;
  localStorage.setItem('munchies_address', addr);
  toast('Address saved', addr);
  closeAddrModal();
  render();
};

window.useTypedAddress = () => {
  const v = document.getElementById('addr-input').value.trim();
  if (!v) { toast('Empty address', 'Please type something first'); return; }
  if (v.length < 6) { toast('Address too short', 'Please type a complete address'); return; }
  localStorage.setItem('munchies_address', v);
  toast('Address saved', v);
  closeAddrModal();
  render();
};

window.closeAddrModal = () => {
  const h = document.getElementById('addr-modal-host');
  if (h) h.remove();
};

// ===== Navigation =====
function nav(name) {
  state.prevScreen = state.screen;
  state.screen = name;
  render();
  const tabbed = ['home','browse','orders','rewards','profile'];
  TABBAR.classList.toggle('hidden', !tabbed.includes(name));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
}
window.nav = nav;
window.back = () => nav(state.prevScreen || 'home');

// ===== Init =====
async function init() {
  // try to get current user
  try {
    const { user } = await api('/me');
    state.user = user;
  } catch {}
  // load catalog
  try {
    const [cats, prods] = await Promise.all([api('/categories'), api('/products')]);
    state.categories = cats.categories;
    state.products = prods.products;
  } catch (e) { console.error(e); }

  // refresh cart if logged in
  if (state.user) await refreshCart();

  if (state.user) nav('home');
  else render();
}

async function refreshCart() {
  try { state.cart = await api('/cart'); } catch {}
}

// ===== Screens =====
const screens = {};

screens.splash = () => `
  <div class="screen">
    <div class="center-screen">
      <div class="logo-mark"><span class="leaf">🌿</span></div>
      <h1 style="font-size:34px" class="glow-text">Munchies</h1>
      <p class="muted" style="font-size:14px;max-width:280px">Premium hemp, THCA & wellness — delivered fast.</p>
      <div style="background:var(--surface);border:1px solid var(--line);border-radius:24px;padding:28px;width:100%;margin-top:8px">
        <h2 style="font-size:20px;margin-bottom:8px;text-align:center">Are you 21 or older?</h2>
        <p class="muted tiny" style="text-align:center;margin-bottom:18px;line-height:1.5">You must be of legal age to enter. Munchies sells federally legal hemp-derived products.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
          <button class="btn btn-ghost" onclick="alert('Sorry — you must be 21+ to use Munchies.')">No</button>
          <button class="btn btn-primary" onclick="nav('login')">Yes, I'm 21+</button>
        </div>
        <p class="tiny muted" style="text-align:center">By tapping Yes, you agree to our Terms & Privacy Policy. We'll verify your ID at delivery.</p>
      </div>
    </div>
  </div>`;

screens.login = () => `
  <div class="screen">
    <div class="simple-header">
      <div class="b" onclick="nav('splash')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></div>
      <div class="t">Sign in</div>
    </div>
    <div style="padding:8px 28px;flex:1;display:flex;flex-direction:column;gap:14px">
      <div class="logo-mark" style="margin:20px auto 8px"><span class="leaf">🌿</span></div>
      <h2 style="font-size:22px;text-align:center">Welcome back</h2>
      <div class="field"><label>Email</label><input id="li-email" type="email" placeholder="you@example.com" value="shop@munchies.test" autocomplete="email"/></div>
      <div class="field"><label>Password</label><input id="li-pw" type="password" placeholder="••••••••" value="shop123" autocomplete="current-password"/></div>
      ${state.error ? `<div class="error">${esc(state.error)}</div>`:''}
      <button class="btn btn-primary" onclick="doLogin()">Sign in</button>
      <button class="btn btn-ghost" onclick="nav('signup')">Create account</button>
      <a style="text-align:center;color:var(--neon);font-size:13px;cursor:pointer;margin-top:6px" onclick="forgotPassword()">Forgot password?</a>
      <p class="tiny muted" style="text-align:center;margin-top:auto;padding-bottom:20px">Demo: shop@munchies.test / shop123</p>
    </div>
  </div>`;

screens.signup = () => `
  <div class="screen">
    <div class="simple-header">
      <div class="b" onclick="nav('login')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></div>
      <div class="t">Create account</div>
    </div>
    <div class="scroll" style="padding:8px 28px 40px;display:flex;flex-direction:column;gap:10px">
      <h2 style="font-size:22px;margin:14px 0 8px">Get started</h2>

      <div class="field"><label>Full name *</label><input id="su-name" placeholder="Your full name (as on ID)" autocapitalize="words"/></div>

      <div class="field"><label>Email *</label><input id="su-email" type="email" placeholder="you@example.com" autocapitalize="none" autocorrect="off"/></div>

      <div class="field"><label>Mobile phone *</label><input id="su-phone" type="tel" placeholder="+1 (555) 123-4567"/></div>

      <div class="field">
        <label>Date of birth * <span style="text-transform:none;letter-spacing:0;font-weight:400;color:var(--text-mute)">(must be 21+)</span></label>
        <div style="display:grid;grid-template-columns:1fr 1fr 1.3fr;gap:8px">
          <input id="su-dob-m" type="number" min="1" max="12" placeholder="MM" inputmode="numeric"/>
          <input id="su-dob-d" type="number" min="1" max="31" placeholder="DD" inputmode="numeric"/>
          <input id="su-dob-y" type="number" min="1900" max="2010" placeholder="YYYY" inputmode="numeric"/>
        </div>
      </div>

      <div class="field">
        <label>Password * <span style="text-transform:none;letter-spacing:0;font-weight:400;color:var(--text-mute)">(min 8 characters)</span></label>
        <input id="su-pw" type="password" placeholder="At least 8 characters" oninput="updatePwStrength()"/>
        <div style="height:4px;background:var(--surface-3);border-radius:99px;margin-top:6px;overflow:hidden"><div id="su-pw-strength-bar" style="height:100%;width:0%;background:var(--danger);transition:all .2s"></div></div>
        <div id="su-pw-hint" class="muted tiny" style="margin-top:4px">Use 8+ characters with letters and numbers</div>
      </div>

      <div class="field">
        <label>Confirm password *</label>
        <input id="su-pw2" type="password" placeholder="Re-enter your password" oninput="checkPwMatch()"/>
        <div id="su-pw-match" class="tiny" style="margin-top:4px;color:var(--text-mute)">Passwords must match</div>
      </div>

      <label style="display:flex;gap:10px;align-items:flex-start;font-size:12px;color:var(--text-dim);line-height:1.5;margin-top:8px"><input id="su-age" type="checkbox" checked style="margin-top:3px"/> I certify the date of birth above is accurate and I am 21+ years old.</label>

      ${state.error ? `<div style="background:rgba(255,91,110,.08);border:1px solid rgba(255,91,110,.3);padding:12px;border-radius:10px;margin-top:8px;font-size:12px;color:var(--danger);line-height:1.5">${esc(state.error)}${(state.error.includes('failed')||state.error.includes('Network')||state.error.includes('fetch'))?'<div style="margin-top:8px;color:var(--text-dim)">💡 Free hosting may take ~30 seconds to wake up. Try again in a moment.</div>':''}</div>`:''}

      <button class="btn btn-primary" style="margin-top:14px" id="su-btn" onclick="doSignup()">Create account</button>

      <p class="tiny muted" style="text-align:center;padding:10px 0 0">By signing up you agree to our <a style="color:var(--neon);cursor:pointer" onclick="nav('support')">Terms & Privacy Policy</a>.</p>
    </div>
  </div>`;

window.updatePwStrength = () => {
  const pw = document.getElementById('su-pw').value;
  const bar = document.getElementById('su-pw-strength-bar');
  const hint = document.getElementById('su-pw-hint');
  if (!bar) return;
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length >= 12) score++;
  const colors = ['var(--danger)','var(--danger)','#ffb547','#ffb547','var(--neon)','var(--neon)'];
  const widths = [0, 25, 45, 65, 85, 100];
  const labels = ['Too short','Weak','Fair','Good','Strong','Excellent'];
  bar.style.width = widths[score] + '%';
  bar.style.background = colors[score];
  if (hint) {
    hint.textContent = pw.length === 0 ? 'Use 8+ characters with letters and numbers' : 'Strength: ' + labels[score];
    hint.style.color = score >= 3 ? 'var(--neon)' : score >= 2 ? '#ffb547' : 'var(--text-mute)';
  }
  const pw2 = document.getElementById('su-pw2');
  if (pw2 && pw2.value) checkPwMatch();
};

window.checkPwMatch = () => {
  const pw = document.getElementById('su-pw').value;
  const pw2 = document.getElementById('su-pw2').value;
  const el = document.getElementById('su-pw-match');
  if (!el) return;
  if (!pw2) { el.textContent = 'Passwords must match'; el.style.color = 'var(--text-mute)'; return; }
  if (pw === pw2) { el.textContent = '✓ Passwords match'; el.style.color = 'var(--neon)'; }
  else { el.textContent = "✗ Passwords don't match"; el.style.color = 'var(--danger)'; }
};

function calculateAge(month, day, year) {
  const today = new Date();
  const birth = new Date(year, month - 1, day);
  if (isNaN(birth.getTime()) || birth.getMonth() !== month - 1) return -1;
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

window.doLogin = async () => {
  const email = document.getElementById('li-email').value.trim();
  const password = document.getElementById('li-pw').value;
  state.error = null;
  try {
    const { user } = await api('/auth/login', { method: 'POST', body: { email, password } });
    state.user = user;
    await refreshCart();
    toast('Welcome back', user.name);
    nav('home');
  } catch (e) { state.error = e.message; render(); }
};

window.doSignup = async () => {
  state.error = null;
  const name = document.getElementById('su-name').value.trim();
  const email = document.getElementById('su-email').value.trim().toLowerCase();
  const phone = document.getElementById('su-phone').value.trim();
  const password = document.getElementById('su-pw').value;
  const password2 = document.getElementById('su-pw2').value;
  const dobM = parseInt(document.getElementById('su-dob-m').value, 10);
  const dobD = parseInt(document.getElementById('su-dob-d').value, 10);
  const dobY = parseInt(document.getElementById('su-dob-y').value, 10);
  const ageOk = document.getElementById('su-age').checked;

  // Client-side validation — fail fast with specific error messages
  if (!name || name.length < 2) { state.error = 'Please enter your full name.'; render(); return; }
  if (!isValidEmail(email)) { state.error = 'Please enter a valid email address.'; render(); return; }
  if (!phone || phone.replace(/\D/g,'').length < 10) { state.error = 'Please enter a valid mobile phone number.'; render(); return; }
  if (!dobM || !dobD || !dobY) { state.error = 'Please enter your full date of birth (month, day, year).'; render(); return; }
  const age = calculateAge(dobM, dobD, dobY);
  if (age < 0) { state.error = 'Please enter a valid date of birth.'; render(); return; }
  if (age < 21) { state.error = `You must be 21 or older to use Munchies. You entered an age of ${age}.`; render(); return; }
  if (age > 120) { state.error = 'Please enter a valid year of birth.'; render(); return; }
  if (!password || password.length < 8) { state.error = 'Password must be at least 8 characters.'; render(); return; }
  if (password !== password2) { state.error = "Passwords don't match. Please re-enter."; render(); return; }
  if (!ageOk) { state.error = 'Please confirm you are 21+ years old.'; render(); return; }

  // Set loading state
  const btn = document.getElementById('su-btn');
  if (btn) { btn.textContent = 'Creating your account…'; btn.disabled = true; btn.style.opacity = '0.7'; }

  const body = {
    name,
    email,
    phone,
    password,
    age_ok: true,
    dob: `${dobY}-${String(dobM).padStart(2,'0')}-${String(dobD).padStart(2,'0')}`,
  };

  try {
    const { user } = await api('/auth/signup', { method: 'POST', body });
    state.user = user;
    await refreshCart();
    toast('Welcome to Munchies', '🎁 You unlocked FIRST20 — 20% off');
    nav('home');
  } catch (e) {
    let msg = e.message || 'Sign up failed.';
    // Translate common errors into friendlier text
    if (msg.includes('already registered')) msg = 'That email is already registered. Try signing in instead.';
    else if (msg === 'Failed to fetch' || msg === 'Load failed' || msg.includes('Network')) {
      msg = "Couldn't reach the server. The app may be waking up — please try again in 30 seconds.";
    }
    state.error = msg;
    // Reset button so user can retry (render() rebuilds the button anyway, but be explicit)
    if (btn) { btn.textContent = 'Create account'; btn.disabled = false; btn.style.opacity = '1'; }
    render();
  }
};

window.doLogout = async () => {
  await api('/auth/logout', { method: 'POST' });
  state.user = null;
  state.cart = { items: [], subtotal_cents: 0 };
  TABBAR.classList.add('hidden');
  nav('splash');
};

screens.home = () => {
  const top = state.products.slice(0, 4);
  const fresh = state.products.slice(4, 8);
  return `
  <div class="screen">
    <div class="scroll">
      <div class="app-header">
        <div>
          <div class="greet">Good evening 👋</div>
          <div class="name">Deliver to <span style="color:var(--neon);cursor:pointer" onclick="editAddress()">${getAddressShort()} ▾</span></div>
        </div>
        <div style="display:flex;gap:8px">
          <div class="icon-btn" onclick="toast('🎁 Welcome offer','Use code FIRST20')">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6V11a6 6 0 1 0-12 0v5l-2 2v1h16v-1z"/></svg>
            <span class="ping"></span>
          </div>
          <div class="icon-btn" onclick="nav('cart')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7h18l-2 13H5z"/><path d="M8 7V5a4 4 0 0 1 8 0v2"/></svg>
            ${cartCount()>0?`<span class="ping" style="background:var(--gold)"></span>`:''}
          </div>
        </div>
      </div>
      <div class="search" onclick="nav('browse')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input placeholder="Search THCA, gummies, vapes..." readonly />
      </div>
      <div class="hero" onclick="nav('browse')">
        <div class="badge neon" style="margin-bottom:10px">🔥 Limited drop</div>
        <h2>20% off your<br/>first delivery</h2>
        <p>Code <b style="color:var(--neon)">FIRST20</b> at checkout. Min $30.</p>
        <span class="pill-cta">Shop now →</span>
      </div>
      <div class="section"><div class="section-title"><h3>Categories</h3><a onclick="nav('browse')">See all</a></div></div>
      <div class="cats">
        ${state.categories.map(c=>`
          <div class="cat" onclick="state.category='${c.id}';nav('browse')">
            <div class="emoji">${c.emoji}</div>
            <div><div class="label">${c.name}</div><div class="count">${c.count} items</div></div>
          </div>`).join('')}
      </div>
      <div class="section"><div class="section-title"><h3>Top sellers 🔥</h3><a onclick="nav('browse')">See all</a></div></div>
      <div class="hscroll">${top.map(productCardHTML).join('')}</div>
      <div class="section"><div class="section-title"><h3>New arrivals</h3><a onclick="nav('browse')">See all</a></div></div>
      <div class="products">${fresh.map(productCardHTML).join('')}</div>
    </div>
  </div>`;
};

function cartCount() { return state.cart.items.reduce((s,i)=>s+i.qty,0); }

function productCardHTML(p) {
  const minPrice = p.variants && p.variants.length ? Math.min(...p.variants.map(v=>v.price_cents)) : 0;
  // image_url is validated server-side; emoji also escaped via dataset to avoid XSS in onerror
  const imageHtml = p.image_url
    ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}" data-emoji="${esc(p.emoji||'🌿')}" style="width:100%;height:100%;object-fit:cover" onerror="this.replaceWith(Object.assign(document.createElement('span'),{style:'font-size:60px',textContent:this.dataset.emoji}))" />`
    : `<span style="font-size:60px">${esc(p.emoji)}</span>`;
  return `
    <div class="pcard" onclick="openProduct(${p.id})">
      <div class="img" style="overflow:hidden">
        ${p.tag?`<span class="tag">${esc(p.tag)}</span>`:''}
        ${imageHtml}
      </div>
      <div class="meta">
        <div class="title">${esc(p.name)}</div>
        <div class="sub">${esc(p.sub||'')}</div>
        <div class="priceRow">
          <div class="price">${$$(minPrice)}</div>
          <button class="add" onclick="event.stopPropagation();quickAdd(${p.id})">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"/></svg>
          </button>
        </div>
      </div>
    </div>`;
}

window.openProduct = async (id) => {
  state.loading = true;
  state.screen = 'product';
  state.selectedProduct = null;
  TABBAR.classList.add('hidden');
  render();
  try {
    const { product } = await api('/products/' + id);
    state.selectedProduct = product;
    state.selectedVariant = product.variants[0];
    state.qty = 1;
    state.loading = false;
    render();
  } catch (e) { toast('Error', e.message); }
};

window.quickAdd = async (id) => {
  const p = state.products.find(x => x.id === id);
  if (!p || !p.variants.length) return;
  try {
    state.cart = await api('/cart/add', { method:'POST', body: { variant_id: p.variants[0].id, qty: 1 }});
    toast('Added to cart', `${p.name} • ${p.variants[0].size}`);
    render();
  } catch (e) { toast('Error', e.message); }
};

screens.browse = () => {
  let filtered = state.category ? state.products.filter(p=>p.category_id===state.category) : state.products;
  if (state.searchQuery && state.searchQuery.trim()) {
    const q = state.searchQuery.trim().toLowerCase();
    filtered = filtered.filter(p => (p.name||'').toLowerCase().includes(q) || (p.sub||'').toLowerCase().includes(q) || (p.type||'').toLowerCase().includes(q));
  }
  const cat = state.categories.find(c=>c.id===state.category);
  return `
  <div class="screen">
    <div class="scroll">
      <div class="app-header">
        <div>
          <div class="greet">Browse</div>
          <div class="name">${cat ? cat.name : 'All products'}</div>
        </div>
        <div class="icon-btn" onclick="nav('cart')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7h18l-2 13H5z"/><path d="M8 7V5a4 4 0 0 1 8 0v2"/></svg>
          ${cartCount()>0?`<span class="ping" style="background:var(--gold)"></span>`:''}
        </div>
      </div>
      <div class="search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input id="browse-search" placeholder="Search products..." value="${esc(state.searchQuery||'')}" oninput="state.searchQuery=this.value;runSearch()" />
        ${state.searchQuery?`<span style="cursor:pointer;color:var(--text-mute);padding:0 6px" onclick="state.searchQuery='';render()">×</span>`:''}
      </div>
      <div class="filter-row">
        <div class="chip ${!state.category?'active':''}" onclick="state.category=null;render()">All</div>
        ${state.categories.map(c=>`<div class="chip ${state.category===c.id?'active':''}" onclick="state.category='${c.id}';render()">${c.emoji} ${c.name}</div>`).join('')}
      </div>
      <div class="products">${filtered.map(productCardHTML).join('') || '<p class="muted tiny" style="padding:40px;text-align:center;grid-column:1/-1">No products in this category yet.</p>'}</div>
    </div>
  </div>`;
};

screens.product = () => {
  if (state.loading || !state.selectedProduct) return `<div class="screen"><div class="center-loading"><div class="spinner"></div></div></div>`;
  const p = state.selectedProduct;
  const v = state.selectedVariant;
  return `
  <div class="screen">
    <div class="scroll" style="padding-bottom:120px">
      <div class="pd-hero" style="overflow:hidden">
        <div class="pd-back" onclick="back()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></div>
        ${p.image_url
          ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}" data-emoji="${esc(p.emoji||'🌿')}" style="width:100%;height:100%;object-fit:cover;position:absolute;top:0;left:0" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'emoji',textContent:this.dataset.emoji}))" />`
          : `<div class="emoji">${esc(p.emoji)}</div>`
        }
      </div>
      <div class="pd-body">
        <div class="pd-strain-row">
          <span class="badge neon">${esc(p.type)}</span>
          <span class="badge">Lab tested</span>
          <span class="badge gold">⚡ 45min delivery</span>
        </div>
        <h1 class="pd-title">${esc(p.name)}</h1>
        <div class="pd-rating"><span class="stars">★★★★★</span><span>${esc(p.rating)} · ${esc(p.review_count)} reviews</span></div>
        <div class="pd-stat-row">
          <div class="pd-stat"><div class="v">${esc(p.thc||'—')}</div><div class="l">THCA</div></div>
          <div class="pd-stat"><div class="v">${esc(p.cbd||'—')}</div><div class="l">CBD</div></div>
          <div class="pd-stat"><div class="v">${esc(p.type)}</div><div class="l">Strain</div></div>
        </div>
        <div class="pd-section-title">Description</div>
        <p class="pd-desc">${esc(p.description||'')}</p>
        <div class="pd-section-title">Choose size</div>
        <div class="pd-options">
          ${p.variants.map((vv,i)=>`<div class="pd-opt ${vv.id===v.id?'active':''}" onclick="state.selectedVariant=state.selectedProduct.variants[${i}];render()">
            <div class="w">${esc(vv.size)}</div><div class="p">${$$(vv.price_cents)}</div>
          </div>`).join('')}
        </div>
        <div class="pd-section-title">Subscribe & save</div>
        <div class="prof-row" onclick="toast('Subscription added','Save 15% on every recurring order')">
          <div class="ic">🔁</div>
          <div class="lbl"><div style="font-weight:600;font-size:13px">Deliver every 2 weeks</div><div class="muted tiny" style="margin-top:2px">Save 15% — pause anytime</div></div>
          <div class="badge neon">−15%</div>
        </div>
      </div>
    </div>
    <div class="pd-cta">
      <div class="pd-qty">
        <button onclick="if(state.qty>1){state.qty--;render()}">−</button>
        <span style="font-weight:700">${state.qty}</span>
        <button onclick="state.qty++;render()">+</button>
      </div>
      <button class="btn btn-primary" style="flex:1;width:auto" onclick="addSelectedToCart()">Add to cart · ${$$(v.price_cents*state.qty)}</button>
    </div>
  </div>`;
};

window.addSelectedToCart = async () => {
  try {
    state.cart = await api('/cart/add', { method:'POST', body: { variant_id: state.selectedVariant.id, qty: state.qty }});
    toast('Added to cart', `${state.selectedProduct.name} • ${state.selectedVariant.size}`);
    render();
  } catch (e) { toast('Error', e.message); }
};

screens.cart = () => {
  const items = state.cart.items;
  const sub = state.cart.subtotal_cents;
  const discount = state.promoDiscount;
  const delivery = state.fulfillment === 'delivery' ? 499 : 0;
  const tax = Math.round((sub - discount) * 0.08);
  const total = sub - discount + delivery + tax;
  return `
  <div class="screen">
    <div class="simple-header">
      <div class="b" onclick="back()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></div>
      <div class="t">Your cart</div>
      <div class="badge neon">${cartCount()} items</div>
    </div>
    <div class="scroll" style="padding:14px 22px 200px">
      ${items.length === 0 ? `
        <div style="text-align:center;padding:60px 20px">
          <div style="font-size:64px;margin-bottom:14px">🛒</div>
          <h3 style="font-family:'Syne';font-size:20px;margin-bottom:6px">Cart is empty</h3>
          <p class="muted tiny">Add something tasty to get started.</p>
          <button class="btn btn-primary" style="margin-top:20px" onclick="nav('browse')">Browse products</button>
        </div>` : `
        <div class="fulfillment">
          <div class="ff-opt ${state.fulfillment==='delivery'?'active':''}" onclick="state.fulfillment='delivery';render()">🚀 Delivery · 45 min</div>
          <div class="ff-opt ${state.fulfillment==='pickup'?'active':''}" onclick="state.fulfillment='pickup';render()">🏪 Pickup · 15 min</div>
        </div>
        ${items.map(it=>`
          <div class="cart-item">
            <div class="ci-img" style="overflow:hidden">${it.image_url?`<img src="${it.image_url}" style="width:100%;height:100%;object-fit:cover" alt=""/>`:`<span style="font-size:30px">${it.emoji}</span>`}</div>
            <div class="ci-meta">
              <div class="ci-title">${esc(it.name)}</div>
              <div class="ci-sub">${it.size} · ${it.type}</div>
              <div class="ci-price">${$$(it.price_cents*it.qty)}</div>
            </div>
            <div class="ci-qty">
              <div class="controls">
                <button onclick="changeQty(${it.item_id},${it.qty-1})">−</button>
                <span style="font-weight:600;color:var(--text)">${it.qty}</span>
                <button onclick="changeQty(${it.item_id},${it.qty+1})">+</button>
              </div>
            </div>
          </div>
        `).join('')}
        <div class="promo">
          <input id="promo-input" placeholder="Promo code (try FIRST20)" value="${state.promo||''}"/>
          <button onclick="applyPromo()">Apply</button>
        </div>
        <div class="totals">
          <div class="row"><span>Subtotal</span><span>${$$(sub)}</span></div>
          ${discount>0?`<div class="row" style="color:var(--neon)"><span>Discount (${state.promo})</span><span>−${$$(discount)}</span></div>`:''}
          <div class="row"><span>${state.fulfillment==='delivery'?'Delivery fee':'Pickup'}</span><span>${state.fulfillment==='delivery'?$$(delivery):'Free'}</span></div>
          <div class="row"><span>Tax (8%)</span><span>${$$(tax)}</span></div>
          <div class="row total"><span>Total</span><span class="v">${$$(total)}</span></div>
        </div>
        <div class="prof-row" style="background:rgba(198,255,61,.06);border-color:rgba(198,255,61,.3)">
          <div class="ic">⭐</div>
          <div class="lbl">
            <div style="font-weight:600;font-size:13px">You'll earn ${Math.floor(total/10)} points</div>
            <div class="muted tiny" style="margin-top:2px">10 points per $1 spent</div>
          </div>
        </div>
      `}
    </div>
    ${items.length>0?`<div class="bottom-cta"><button class="btn btn-primary" onclick="goCheckout()">Continue to checkout · ${$$(total)}</button></div>`:''}
  </div>`;
};

window.changeQty = async (itemId, newQty) => {
  try {
    if (newQty <= 0) state.cart = await api('/cart/'+itemId, { method:'DELETE' });
    else state.cart = await api('/cart/'+itemId, { method:'PATCH', body: { qty: newQty }});
    render();
  } catch(e){ toast('Error', e.message); }
};

window.applyPromo = async () => {
  const code = document.getElementById('promo-input').value.trim().toUpperCase();
  if (!code) return;
  try {
    const p = await api('/promo/' + code);
    state.promo = p.code;
    state.promoDiscount = Math.round(state.cart.subtotal_cents * p.percent_off / 100);
    toast('Promo applied', `${p.percent_off}% off`);
    render();
  } catch (e) {
    state.promo = null; state.promoDiscount = 0;
    toast('Invalid code', 'Try FIRST20 or MUNCH10');
    render();
  }
};

window.goCheckout = () => nav('checkout');

screens.checkout = () => {
  const sub = state.cart.subtotal_cents;
  const discount = state.promoDiscount;
  const delivery = state.fulfillment === 'delivery' ? 499 : 0;
  const tax = Math.round((sub - discount) * 0.08);
  const total = sub - discount + delivery + tax;
  const addr = getAddress();
  return `
  <div class="screen">
    <div class="simple-header">
      <div class="b" onclick="nav('cart')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></div>
      <div class="t">Checkout</div>
    </div>
    <div class="scroll" style="padding:0 22px 160px">
      <div class="pd-section-title" style="margin-top:8px">Fulfillment</div>
      <div class="fulfillment">
        <div class="ff-opt ${state.fulfillment==='delivery'?'active':''}" onclick="state.fulfillment='delivery';render()">🚀 Delivery</div>
        <div class="ff-opt ${state.fulfillment==='pickup'?'active':''}" onclick="state.fulfillment='pickup';render()">🏪 Pickup</div>
      </div>
      <div class="pd-section-title">${state.fulfillment==='delivery'?'Delivery address':'Pickup location'}</div>
      ${state.fulfillment==='delivery' ? `
        <div class="prof-row" style="border-color:${addr?'var(--neon)':'var(--gold)'};cursor:pointer" onclick="editAddress()">
          <div class="ic">📍</div>
          <div style="flex:1">
            <div style="font-weight:600;font-size:13px">${addr || '📝 Tap to add your address'}</div>
            <div class="muted tiny" style="margin-top:2px">${addr ? 'Tap to change address' : 'Required for delivery'}</div>
          </div>
          <div style="color:var(--text-mute);font-size:18px">›</div>
        </div>
      ` : `
        <div class="prof-row" style="border-color:var(--neon)">
          <div class="ic">🏪</div>
          <div style="flex:1">
            <div style="font-weight:600;font-size:13px">Munchies Downtown</div>
            <div class="muted tiny" style="margin-top:2px">412 Market Ave · 0.8 mi away</div>
          </div>
        </div>
      `}
      <div class="pd-section-title" style="margin-top:18px">Payment (Stripe test mode)</div>
      <div class="prof-row" style="border-color:var(--neon)">
        <div class="ic">💳</div>
        <div style="flex:1">
          <div style="font-weight:600;font-size:13px">Visa · 4242 (test)</div>
          <div class="muted tiny" style="margin-top:2px">Test mode — no real charge</div>
        </div>
      </div>
      <div class="pd-section-title" style="margin-top:18px">ID verification</div>
      <div class="prof-row" style="background:rgba(212,175,55,.06);border-color:rgba(212,175,55,.3)">
        <div class="ic" style="color:var(--gold)">🪪</div>
        <div style="flex:1">
          <div style="font-weight:600;font-size:13px">ID verified ✓</div>
          <div class="muted tiny" style="margin-top:2px">Driver will scan again on delivery</div>
        </div>
      </div>
      <div class="totals" style="margin-top:18px">
        <div class="row"><span>Subtotal</span><span>${$$(sub)}</span></div>
        ${discount>0?`<div class="row" style="color:var(--neon)"><span>Discount</span><span>−${$$(discount)}</span></div>`:''}
        <div class="row"><span>${state.fulfillment==='delivery'?'Delivery':'Pickup'}</span><span>${state.fulfillment==='delivery'?$$(delivery):'Free'}</span></div>
        <div class="row"><span>Tax</span><span>${$$(tax)}</span></div>
        <div class="row total"><span>Total</span><span class="v">${$$(total)}</span></div>
      </div>
    </div>
    <div class="bottom-cta"><button class="btn btn-primary" onclick="placeOrder()">Place order · ${$$(total)}</button></div>
  </div>`;
};

window.placeOrder = async () => {
  if (state.fulfillment === 'delivery' && !getAddress()) {
    toast('Address required', 'Tap the address card to add one');
    return;
  }
  try {
    const r = await api('/orders', { method:'POST', body: {
      fulfillment: state.fulfillment,
      address: state.fulfillment==='delivery' ? getAddress() : null,
      promo_code: state.promo,
    }});
    state.cart = { items: [], subtotal_cents: 0 };
    state.promo = null; state.promoDiscount = 0;
    state.currentOrder = r.order_id;
    // refresh user for new points
    try { const { user } = await api('/me'); state.user = user; } catch {}
    nav('tracking');
    toast('🎉 Order placed!', `+${r.points_earned} points earned`);
  } catch (e) { toast('Order failed', e.message); }
};

screens.tracking = () => {
  return `
  <div class="screen">
    <div class="simple-header">
      <div class="b" onclick="nav('home')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="m12 5-7 7 7 7"/></svg></div>
      <div class="t">Order tracking</div>
      <div class="badge neon" id="track-status">Loading...</div>
    </div>
    <div class="scroll" id="track-content" style="padding-bottom:120px">
      <div class="center-loading" style="height:200px"><div class="spinner"></div></div>
    </div>
  </div>`;
};

async function refreshTracking() {
  if (state.screen !== 'tracking' || !state.currentOrder) return;
  try {
    const { order } = await api('/orders/' + state.currentOrder);
    const statusMap = {placed:'Placed', packed:'Packed', out_for_delivery:'On the way', delivered:'Delivered'};
    const stEl = document.getElementById('track-status');
    if (stEl) stEl.textContent = statusMap[order.status]||order.status;
    const c = document.getElementById('track-content');
    if (!c) return;
    c.innerHTML = `
      <div class="section" style="padding:0 22px;margin-bottom:14px">
        <div class="hero" style="padding:18px;background:var(--surface-2);cursor:default">
          <div class="row" style="margin-bottom:10px">
            <div style="width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,var(--neon),var(--gold));display:grid;place-items:center;font-family:'Syne';font-weight:700;color:#0a0a0b">${order.driver?esc(order.driver.name.split(' ').map(s=>s[0]).join('')):'—'}</div>
            <div style="flex:1">
              <div style="font-weight:700">${order.driver?esc(order.driver.name):'Awaiting driver'}</div>
              <div class="muted tiny">Order #${esc(order.order_no)}</div>
            </div>
          </div>
          ${order.address?`<div class="muted tiny" style="margin-bottom:6px">📍 ${order.address}</div>`:''}
          <div class="between">
            <div>
              <div class="tiny muted">Status</div>
              <div style="font-family:'Syne';font-size:24px;font-weight:700">${statusMap[order.status]||order.status}</div>
            </div>
            <div class="badge neon">${order.fulfillment==='delivery'?'🚚 Delivery':'🏪 Pickup'}</div>
          </div>
        </div>
      </div>
      <div class="timeline">
        ${[
          {k:'placed',t:'Order confirmed',i:'✓'},
          {k:'packed',t:'Packed by store',i:'📦'},
          {k:'out_for_delivery',t:'On the way',i:'🚚'},
          {k:'delivered',t:'Delivered',i:'🎉'}
        ].map((s,i,arr)=>{
          const idx = arr.findIndex(x=>x.k===order.status);
          const cls = i<idx?'done':i===idx?'active':'';
          return `<div class="tl-step ${cls}"><div class="tl-icon">${s.i}</div><div><div class="tl-title">${s.t}</div></div></div>`;
        }).join('')}
      </div>
      <div class="section" style="padding:0 22px;margin-top:8px">
        <h3 style="font-size:14px;margin-bottom:10px">Items</h3>
        ${order.items.map(it=>`<div class="cart-item"><div class="ci-img">📦</div><div class="ci-meta"><div class="ci-title">${esc(it.product_name)}</div><div class="ci-sub">${esc(it.size)} × ${it.qty}</div><div class="ci-price">${$$(it.price_cents*it.qty)}</div></div></div>`).join('')}
      </div>
      <div class="section" style="padding:0 22px">
        <div class="totals">
          <div class="row"><span>Subtotal</span><span>${$$(order.subtotal_cents)}</span></div>
          ${order.discount_cents>0?`<div class="row" style="color:var(--neon)"><span>Discount</span><span>−${$$(order.discount_cents)}</span></div>`:''}
          <div class="row"><span>Delivery</span><span>${$$(order.delivery_cents)}</span></div>
          <div class="row"><span>Tax</span><span>${$$(order.tax_cents)}</span></div>
          <div class="row total"><span>Total</span><span class="v">${$$(order.total_cents)}</span></div>
        </div>
      </div>
    `;
  } catch (e) {}
}
setInterval(refreshTracking, 5000);

screens.orders = () => {
  return `
  <div class="screen">
    <div class="scroll">
      <div class="app-header">
        <div><div class="greet">Activity</div><div class="name">Your orders</div></div>
      </div>
      <div id="orders-list" style="padding:0 22px"><div class="center-loading" style="height:200px"><div class="spinner"></div></div></div>
    </div>
  </div>`;
};

async function loadOrders() {
  if (state.screen !== 'orders') return;
  try {
    const { orders } = await api('/orders');
    const c = document.getElementById('orders-list');
    if (!c) return;
    if (orders.length === 0) {
      c.innerHTML = `<p class="muted tiny" style="text-align:center;padding:40px">No orders yet. <a style="color:var(--neon);cursor:pointer" onclick="nav('browse')">Start shopping →</a></p>`;
      return;
    }
    c.innerHTML = orders.map(o=>`
      <div class="cart-item" onclick="state.currentOrder=${o.id};nav('orderdetail')" style="cursor:pointer">
        <div class="ci-img">${o.status==='delivered'?'✅':o.status==='cancelled'?'❌':'🚚'}</div>
        <div class="ci-meta">
          <div class="ci-title">Order #${esc(o.order_no)} · ${esc(o.status.replace(/_/g,' '))}</div>
          <div class="ci-sub">${new Date(o.created_at).toLocaleDateString()} · ${esc(o.fulfillment)}</div>
          <div class="ci-price">${$$(o.total_cents)}</div>
        </div>
        <div style="font-size:24px;color:var(--text-mute)">→</div>
      </div>
    `).join('');
  } catch (e) {}
}

screens.rewards = () => {
  const pts = state.user?.loyalty_points || 0;
  const tier = state.user?.loyalty_tier || 'Bronze';
  const nextTier = {Bronze:{n:'Silver',need:500},Silver:{n:'Gold',need:1000},Gold:{n:'Platinum',need:2000},Platinum:{n:'Platinum',need:2000}}[tier];
  const remaining = Math.max(0, nextTier.need - pts);
  const pct = Math.min(100, (pts / nextTier.need) * 100);
  return `
  <div class="screen">
    <div class="scroll">
      <div class="app-header"><div><div class="greet">Munchies Rewards</div><div class="name">Earn. Unlock. Save.</div></div></div>
      <div class="tier-card">
        <div class="tier-name">★ ${tier} member</div>
        <div class="pts">${pts.toLocaleString()} pts</div>
        <div class="next">${remaining>0?`${remaining} points to <b style="color:var(--neon)">${nextTier.n}</b>`:'Top tier reached!'}</div>
        <div class="bar"><div class="fill" style="width:${pct}%"></div></div>
      </div>
      <div class="section"><div class="section-title"><h3>Redeem</h3></div></div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;padding:0 22px">
        ${[{em:'🎁',t:'Free 3.5g flower',p:2500},{em:'🚀',t:'Free delivery',p:500},{em:'🍬',t:'Free gummy pack',p:1200},{em:'💨',t:'$10 off vape',p:1000}].map(r=>`
          <div style="background:var(--surface-2);border:1px solid var(--line);border-radius:16px;padding:14px;cursor:pointer" onclick="${pts>=r.p?`toast('Reward unlocked','Apply at next checkout')`:`toast('Need more points','Keep earning!')`}">
            <div style="font-size:32px;margin-bottom:6px">${r.em}</div>
            <div style="font-size:13px;font-weight:600">${r.t}</div>
            <div style="font-size:11px;color:${pts>=r.p?'var(--neon)':'var(--text-mute)'};margin-top:6px;font-weight:700">${r.p.toLocaleString()} pts</div>
          </div>`).join('')}
      </div>
      <div class="section" style="margin-top:18px"><div class="section-title"><h3>Refer & earn</h3></div></div>
      <div class="hero" style="margin-bottom:24px">
        <div class="badge neon" style="margin-bottom:10px">$15 for you, $15 for them</div>
        <h2 style="font-size:20px">Invite a friend</h2>
        <p>Share code <b style="color:var(--neon)">${(state.user?.email||'X').split('@')[0].toUpperCase().slice(0,8)}15</b></p>
        <span class="pill-cta" onclick="navigator.clipboard?.writeText('FRIEND15');toast('Code copied','Share with friends')">Share invite →</span>
      </div>
    </div>
  </div>`;
};

screens.profile = () => {
  if (!state.user) { nav('login'); return ''; }
  const u = state.user;
  const addr = getAddress();
  return `
  <div class="screen">
    <div class="scroll">
      <div class="app-header">
        <div><div class="greet">Account</div><div class="name">Profile</div></div>
        <div class="icon-btn" onclick="doLogout()" title="Sign out"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></div>
      </div>
      <div class="avatar-block">
        <div class="avatar">${esc(u.name.split(' ').map(s=>s[0]).join('').slice(0,2).toUpperCase())}</div>
        <div>
          <div style="font-family:'Syne';font-size:20px;font-weight:700">${esc(u.name)}</div>
          <div class="muted tiny">★ ${esc(u.loyalty_tier)} · ${u.loyalty_points} pts</div>
        </div>
      </div>
      <div style="padding:0 22px">
        <div class="prof-row" onclick="nav('editprofile')"><div class="ic">✏️</div><div class="lbl">Edit profile</div><div style="color:var(--text-mute);font-size:18px">›</div></div>
        <div class="prof-row" onclick="nav('changepassword')"><div class="ic">🔑</div><div class="lbl">Change password</div><div style="color:var(--text-mute);font-size:18px">›</div></div>
        <div class="prof-row" onclick="nav('orders')"><div class="ic">📦</div><div class="lbl">Order history</div><div style="color:var(--text-mute);font-size:18px">›</div></div>
        <div class="prof-row" onclick="nav('rewards')"><div class="ic">⭐</div><div class="lbl">Rewards & points</div><div class="badge gold">${u.loyalty_points} pts</div><div style="color:var(--text-mute);font-size:18px">›</div></div>
        <div class="prof-row" onclick="editAddress()" style="cursor:pointer">
          <div class="ic">📍</div>
          <div class="lbl">
            <div style="font-weight:600;font-size:14px">Delivery address</div>
            <div class="muted tiny" style="margin-top:2px">${addr || 'Tap to add your address'}</div>
          </div>
          <div style="color:var(--text-mute);font-size:18px">›</div>
        </div>
        <div class="prof-row" onclick="nav('payments')"><div class="ic">💳</div><div class="lbl">Payment methods</div><div style="color:var(--text-mute);font-size:18px">›</div></div>
        <div class="prof-row" onclick="nav('idverify')"><div class="ic">🪪</div><div class="lbl">ID verification</div>${(()=>{const s=state.user?.verification_status||'unverified';const m={unverified:{l:'Not verified',c:'rgba(255,181,71,.12)',cc:'#ffb547'},pending:{l:'Pending',c:'rgba(255,181,71,.12)',cc:'#ffb547'},approved:{l:'Verified',c:'rgba(198,255,61,.12)',cc:'var(--neon)'},rejected:{l:'Rejected',c:'rgba(255,91,110,.12)',cc:'var(--danger)'}};const t=m[s];return `<div class="badge" style="background:${t.c};color:${t.cc};border-color:${t.cc}">${t.l}</div>`;})()}<div style="color:var(--text-mute);font-size:18px">›</div></div>
        <div class="prof-row" onclick="nav('notifications')"><div class="ic">🔔</div><div class="lbl">Notifications</div><div style="color:var(--text-mute);font-size:18px">›</div></div>
        <div class="prof-row" onclick="nav('support')"><div class="ic">❓</div><div class="lbl">Help & support</div><div style="color:var(--text-mute);font-size:18px">›</div></div>
        <div class="prof-row" onclick="doLogout()" style="margin-top:14px;color:var(--danger)"><div class="ic">↪</div><div class="lbl" style="color:var(--danger)">Sign out</div></div>
      </div>
    </div>
  </div>`;
};

// ===== Payment methods =====
screens.payments = () => `
  <div class="screen">
    <div class="simple-header">
      <div class="b" onclick="back()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></div>
      <div class="t">Payment methods</div>
    </div>
    <div class="scroll" style="padding:12px 22px 40px">
      <div class="prof-row" style="border-color:var(--neon)">
        <div class="ic">💳</div>
        <div style="flex:1">
          <div style="font-weight:600;font-size:13px">Visa · 4242 (test)</div>
          <div class="muted tiny" style="margin-top:2px">Expires 09/28 · Default</div>
        </div>
        <div class="badge neon">Default</div>
      </div>
      <div class="prof-row" onclick="toast('Coming soon','Real card adding requires Stripe live keys')" style="cursor:pointer">
        <div class="ic">+</div>
        <div class="lbl">Add new card</div>
        <div style="color:var(--text-mute);font-size:18px">›</div>
      </div>
      <div class="prof-row" onclick="toast('Apple Pay','Available once Stripe is connected')" style="cursor:pointer">
        <div class="ic">🍎</div>
        <div class="lbl">Apple Pay</div>
        <div class="badge">Coming soon</div>
      </div>
      <div class="prof-row" onclick="toast('Google Pay','Available once Stripe is connected')" style="cursor:pointer">
        <div class="ic">G</div>
        <div class="lbl">Google Pay</div>
        <div class="badge">Coming soon</div>
      </div>
      <div style="background:rgba(212,175,55,.06);border:1px solid rgba(212,175,55,.3);border-radius:14px;padding:14px;margin-top:18px">
        <div style="font-size:11px;color:var(--gold);font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">⚡ Stripe test mode</div>
        <div style="font-size:13px;color:var(--text-dim);line-height:1.5">Currently in test mode — no real charges. Connect live Stripe keys to accept real payments.</div>
      </div>
      <div style="background:var(--surface-2);border:1px solid var(--line);border-radius:14px;padding:14px;margin-top:10px">
        <div style="font-size:11px;color:var(--text-dim);font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">🔒 Your privacy</div>
        <div style="font-size:13px;color:var(--text-dim);line-height:1.5">Card details are encrypted and stored by Stripe, never on our servers. PCI-DSS compliant.</div>
      </div>
    </div>
  </div>`;

// ===== ID Verification =====
// ===== ID Verification — real flow =====
// Photos are stored in browser memory until the user submits. Resized client-side first.
// In-progress verification photos persist in sessionStorage so user can refresh without losing work
const verifPhotos = new Proxy({}, {
  get(_, k) { return sessionStorage.getItem('munchies_verif_' + k) || null; },
  set(_, k, v) { if (v) sessionStorage.setItem('munchies_verif_' + k, v); else sessionStorage.removeItem('munchies_verif_' + k); return true; }
});

screens.idverify = () => {
  const status = state.user?.verification_status || 'unverified';
  const themes = {
    unverified: { color: 'var(--text-mute)', bg: 'rgba(154,154,166,.1)', em: '🪪', title: 'Verify your ID', sub: "We need to confirm you're 21+ before you can place orders." },
    pending:    { color: 'var(--warn,#ffb547)', bg: 'rgba(255,181,71,.1)', em: '⏳', title: 'Verification pending', sub: 'Your ID is being reviewed. This usually takes a few hours.' },
    approved:   { color: 'var(--neon)', bg: 'rgba(198,255,61,.1)', em: '✓', title: 'Verified', sub: "You're cleared to order hemp & THCA products." },
    rejected:   { color: 'var(--danger)', bg: 'rgba(255,91,110,.1)', em: '✗', title: 'Verification rejected', sub: state.user?.verification_notes || 'Please re-submit clearer photos.' },
  };
  const t = themes[status] || themes.unverified;
  const canSubmit = status === 'unverified' || status === 'rejected';
  return `
  <div class="screen">
    <div class="simple-header">
      <div class="b" onclick="back()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></div>
      <div class="t">ID verification</div>
    </div>
    <div class="scroll" style="padding:20px 22px 40px">
      <div style="text-align:center;padding:24px 0 18px">
        <div style="width:84px;height:84px;border-radius:24px;background:${t.bg};border:1px solid ${t.color};display:grid;place-items:center;margin:0 auto 16px;color:${t.color}">
          <span style="font-size:42px">${t.em}</span>
        </div>
        <h2 style="font-family:'Syne';font-size:22px;font-weight:700;margin-bottom:6px">${t.title}</h2>
        <p class="muted tiny" style="line-height:1.5;max-width:300px;margin:0 auto">${t.sub}</p>
      </div>

      <div class="prof-row" style="border-color:${t.color}">
        <div class="ic" style="color:${t.color}">${t.em}</div>
        <div style="flex:1">
          <div style="font-weight:600;font-size:13px">Status</div>
          <div class="muted tiny" style="margin-top:2px;text-transform:capitalize">${status}</div>
        </div>
      </div>
      ${state.user?.verification_submitted_at ? `
        <div class="prof-row">
          <div class="ic">📅</div>
          <div style="flex:1">
            <div style="font-weight:600;font-size:13px">Submitted</div>
            <div class="muted tiny" style="margin-top:2px">${new Date(state.user.verification_submitted_at).toLocaleString()}</div>
          </div>
        </div>` : ''}
      ${state.user?.verification_reviewed_at ? `
        <div class="prof-row">
          <div class="ic">👁</div>
          <div style="flex:1">
            <div style="font-weight:600;font-size:13px">Reviewed</div>
            <div class="muted tiny" style="margin-top:2px">${new Date(state.user.verification_reviewed_at).toLocaleString()}</div>
          </div>
        </div>` : ''}

      ${canSubmit ? `
        <button class="btn btn-primary" style="margin-top:18px" onclick="startVerification()">${status==='rejected'?'Re-submit ID':'Verify my ID now'}</button>
      ` : ''}

      <div style="background:rgba(212,175,55,.06);border:1px solid rgba(212,175,55,.3);border-radius:14px;padding:14px;margin-top:18px">
        <div style="font-size:11px;color:var(--gold);font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">🔒 Privacy</div>
        <div style="font-size:13px;color:var(--text-dim);line-height:1.5">Your ID photos are stored securely and only viewed by our verification team. In production this routes through Persona/Veriff for automated, encrypted checks. Driver also re-checks your ID at delivery.</div>
      </div>
    </div>
  </div>`;
};

window.startVerification = () => {
  verifPhotos.front = null; verifPhotos.back = null; verifPhotos.selfie = null;
  state.verifStep = 'front';
  nav('idcapture');
};

screens.idcapture = () => {
  const step = state.verifStep || 'front';
  const stepInfo = {
    front:  { title: 'Front of your ID',  sub: 'Driver\'s license, state ID, or passport. Make sure all text is clear and readable.', em: '🪪', facing: 'environment' },
    back:   { title: 'Back of your ID',   sub: 'Same ID — flip it over and capture the back.', em: '🪪', facing: 'environment' },
    selfie: { title: 'Selfie holding ID', sub: 'Hold your ID next to your face. Helps us match it to you.', em: '🤳', facing: 'user' },
  }[step];
  const order = ['front', 'back', 'selfie'];
  const stepNum = order.indexOf(step) + 1;
  const captured = !!verifPhotos[step];
  return `
  <div class="screen">
    <div class="simple-header">
      <div class="b" onclick="if(confirm('Cancel ID verification?'))nav('idverify')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></div>
      <div class="t">Step ${stepNum} of 3</div>
    </div>
    <div class="scroll" style="padding:14px 22px 40px">
      <div style="display:flex;gap:6px;margin-bottom:18px">
        ${order.map((s, i) => `<div style="flex:1;height:4px;border-radius:99px;background:${i < stepNum ? 'var(--neon)' : 'var(--surface-3)'}"></div>`).join('')}
      </div>

      <h2 style="font-family:'Syne';font-size:22px;font-weight:700;margin-bottom:6px">${stepInfo.title}</h2>
      <p class="muted tiny" style="line-height:1.5;margin-bottom:18px">${stepInfo.sub}</p>

      ${captured ? `
        <div style="background:var(--surface-2);border:1px solid var(--neon);border-radius:16px;padding:10px;text-align:center">
          <img src="${verifPhotos[step]}" style="max-width:100%;max-height:280px;border-radius:10px;display:block;margin:0 auto" alt="" />
          <div style="display:flex;gap:8px;margin-top:12px">
            <button class="btn btn-ghost" onclick="retakeVerifPhoto()">📷 Retake</button>
            <button class="btn btn-primary" onclick="nextVerifStep()">${step === 'selfie' ? 'Submit ID' : 'Next →'}</button>
          </div>
        </div>
      ` : `
        <input id="verif-cam" type="file" accept="image/*" capture="${stepInfo.facing}" onchange="handleVerifPhoto(event)" style="display:none" />
        <button type="button" class="btn btn-primary" style="height:auto;padding:30px;flex-direction:column;gap:10px" onclick="document.getElementById('verif-cam').click()">
          <span style="font-size:48px">${stepInfo.em}</span>
          <span style="font-size:15px;font-weight:700">Open camera</span>
          <span style="font-size:11px;color:#0a0a0b;opacity:.7;font-weight:500">Or pick from photo library</span>
        </button>

        ${step === 'selfie' ? `
          <button class="btn btn-ghost" style="margin-top:10px" onclick="skipSelfie()">Skip selfie (optional)</button>
        ` : ''}
      `}

      <div style="background:var(--surface-2);border:1px solid var(--line);border-radius:14px;padding:14px;margin-top:18px">
        <div style="font-size:11px;color:var(--text-dim);font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">📸 Photo tips</div>
        <ul style="font-size:12px;color:var(--text-dim);line-height:1.7;padding-left:16px;margin:0">
          <li>Make sure the photo is well-lit and in focus</li>
          <li>All four corners of the ID visible</li>
          <li>No glare on the photo or hologram</li>
          <li>Photos are auto-resized — they won't take long to upload</li>
        </ul>
      </div>
    </div>
  </div>`;
};

window.handleVerifPhoto = (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { alert('Please choose an image file.'); return; }
  if (file.size > 15 * 1024 * 1024) { alert('Image too large. Please choose one under 15MB.'); return; }
  const reader = new FileReader();
  reader.onload = (e) => resizeImage(e.target.result, 1400, 0.85, (resized) => {
    verifPhotos[state.verifStep] = resized;
    render();
  });
  reader.readAsDataURL(file);
};

function resizeImage(dataUrl, maxWidth, quality, callback) {
  const img = new Image();
  img.onload = () => {
    const ratio = img.width > maxWidth ? maxWidth / img.width : 1;
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    callback(canvas.toDataURL('image/jpeg', quality));
  };
  img.src = dataUrl;
}

window.retakeVerifPhoto = () => {
  verifPhotos[state.verifStep] = null;
  render();
};

window.skipSelfie = () => {
  verifPhotos.selfie = null;
  submitVerification();
};

window.nextVerifStep = async () => {
  if (state.verifStep === 'front') { state.verifStep = 'back'; render(); }
  else if (state.verifStep === 'back') { state.verifStep = 'selfie'; render(); }
  else if (state.verifStep === 'selfie') { await submitVerification(); }
};

async function submitVerification() {
  if (!verifPhotos.front || !verifPhotos.back) { toast('Missing photos','Please capture both sides of your ID'); return; }
  toast('Submitting…', 'Uploading your photos');
  try {
    await api('/me/verification', { method: 'POST', body: {
      id_front_url: verifPhotos.front,
      id_back_url: verifPhotos.back,
      selfie_url: verifPhotos.selfie,
    }});
    // refresh user to get new status
    try { const { user } = await api('/me'); state.user = user; } catch {}
    verifPhotos.front = null; verifPhotos.back = null; verifPhotos.selfie = null;
    nav('idverify');
    toast('Submitted ✓', 'Your ID is being reviewed');
  } catch (e) {
    toast('Submission failed', e.message);
  }
}

// ===== Notification settings =====
function getNotifPref(key, def = true) {
  const v = localStorage.getItem('munchies_notif_' + key);
  return v === null ? def : v === '1';
}
window.toggleNotif = (key) => {
  const cur = getNotifPref(key);
  localStorage.setItem('munchies_notif_' + key, cur ? '0' : '1');
  toast(cur ? 'Off' : 'On', `${key.replace(/_/g,' ')} notifications ${cur ? 'disabled' : 'enabled'}`);
  render();
};
function notifRow(key, em, title, desc) {
  const on = getNotifPref(key);
  return `
    <div class="prof-row" onclick="toggleNotif('${key}')" style="cursor:pointer">
      <div class="ic">${em}</div>
      <div style="flex:1">
        <div style="font-weight:600;font-size:13px">${title}</div>
        <div class="muted tiny" style="margin-top:2px">${desc}</div>
      </div>
      <div style="width:42px;height:24px;border-radius:99px;background:${on?'var(--ok,#3ddc84)':'var(--surface-3)'};position:relative;transition:background .2s">
        <div style="position:absolute;top:2px;${on?'right:2px':'left:2px'};width:20px;height:20px;border-radius:50%;background:#fff;transition:all .2s;box-shadow:0 1px 3px rgba(0,0,0,.3)"></div>
      </div>
    </div>`;
}
screens.notifications = () => `
  <div class="screen">
    <div class="simple-header">
      <div class="b" onclick="back()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></div>
      <div class="t">Notifications</div>
    </div>
    <div class="scroll" style="padding:12px 22px 40px">
      <div class="pd-section-title" style="margin-top:8px">Order updates</div>
      ${notifRow('order_confirmed', '📦', 'Order confirmed', 'When your order is placed and accepted')}
      ${notifRow('order_dispatched', '🚚', 'On the way', 'When a driver picks up your order')}
      ${notifRow('order_delivered', '✅', 'Delivered', 'When your order is dropped off')}

      <div class="pd-section-title" style="margin-top:18px">Marketing</div>
      ${notifRow('promos', '🔥', 'Promos & deals', 'Discounts, flash sales, weekly drops')}
      ${notifRow('new_products', '🌿', 'New products', 'When fresh strains and new items hit')}
      ${notifRow('rewards', '⭐', 'Rewards updates', 'Tier upgrades and earned points')}

      <div class="pd-section-title" style="margin-top:18px">Channels</div>
      ${notifRow('channel_push', '📱', 'Push notifications', 'On your phone via this app')}
      ${notifRow('channel_email', '📧', 'Email', 'Sent to your registered email')}
      ${notifRow('channel_sms', '💬', 'SMS / Text', 'Text messages to your phone')}

      <div style="background:var(--surface-2);border:1px solid var(--line);border-radius:14px;padding:14px;margin-top:18px">
        <div style="font-size:11px;color:var(--text-dim);font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px">ℹ️ Note</div>
        <div style="font-size:13px;color:var(--text-dim);line-height:1.5">Preferences save instantly. Push and SMS delivery require browser permission and Twilio integration (admin setup).</div>
      </div>
    </div>
  </div>`;

// ===== Help & Support =====
screens.support = () => `
  <div class="screen">
    <div class="simple-header">
      <div class="b" onclick="back()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></div>
      <div class="t">Help & support</div>
    </div>
    <div class="scroll" style="padding:12px 22px 40px">
      <div class="hero" style="margin:0 0 18px;cursor:default">
        <div class="badge neon" style="margin-bottom:10px">⚡ We respond fast</div>
        <h2 style="font-size:20px;line-height:1.2">Need a hand?</h2>
        <p>Real humans, real answers. We're here 7 days a week, 9am–10pm.</p>
      </div>

      <div class="pd-section-title">Contact us</div>
      <div class="prof-row" onclick="window.location.href='mailto:support@munchies.test'" style="cursor:pointer">
        <div class="ic">📧</div>
        <div style="flex:1">
          <div style="font-weight:600;font-size:13px">Email support</div>
          <div class="muted tiny" style="margin-top:2px">support@munchies.test</div>
        </div>
        <div style="color:var(--text-mute);font-size:18px">›</div>
      </div>
      <div class="prof-row" onclick="window.location.href='tel:+15555550100'" style="cursor:pointer">
        <div class="ic">📞</div>
        <div style="flex:1">
          <div style="font-weight:600;font-size:13px">Call us</div>
          <div class="muted tiny" style="margin-top:2px">(555) 555-0100 · 9am–10pm</div>
        </div>
        <div style="color:var(--text-mute);font-size:18px">›</div>
      </div>
      <div class="prof-row" onclick="window.location.href='sms:+15555550100'" style="cursor:pointer">
        <div class="ic">💬</div>
        <div style="flex:1">
          <div style="font-weight:600;font-size:13px">Text us</div>
          <div class="muted tiny" style="margin-top:2px">Fastest for quick questions</div>
        </div>
        <div style="color:var(--text-mute);font-size:18px">›</div>
      </div>

      <div class="pd-section-title" style="margin-top:18px">FAQ</div>
      <div class="prof-row" onclick="toggleFaq('delivery')" style="cursor:pointer;flex-direction:column;align-items:stretch">
        <div style="display:flex;gap:14px;align-items:center;width:100%">
          <div class="ic">🚀</div>
          <div style="flex:1;font-weight:600;font-size:13px">How fast is delivery?</div>
          <div style="color:var(--text-mute);font-size:18px" id="faq-arrow-delivery">›</div>
        </div>
        <div id="faq-delivery" style="display:none;padding:10px 0 0 50px;font-size:12px;color:var(--text-dim);line-height:1.6">Most orders arrive within 45 minutes. ASAP delivery is our default — we also offer scheduled delivery in 1-hour windows.</div>
      </div>
      <div class="prof-row" onclick="toggleFaq('age')" style="cursor:pointer;flex-direction:column;align-items:stretch">
        <div style="display:flex;gap:14px;align-items:center;width:100%">
          <div class="ic">🪪</div>
          <div style="flex:1;font-weight:600;font-size:13px">Why do you check ID?</div>
          <div style="color:var(--text-mute);font-size:18px" id="faq-arrow-age">›</div>
        </div>
        <div id="faq-age" style="display:none;padding:10px 0 0 50px;font-size:12px;color:var(--text-dim);line-height:1.6">Federal & state law requires us to verify all customers are 21+. Your driver will scan your ID at delivery — no exceptions.</div>
      </div>
      <div class="prof-row" onclick="toggleFaq('legal')" style="cursor:pointer;flex-direction:column;align-items:stretch">
        <div style="display:flex;gap:14px;align-items:center;width:100%">
          <div class="ic">⚖️</div>
          <div style="flex:1;font-weight:600;font-size:13px">Are these products legal?</div>
          <div style="color:var(--text-mute);font-size:18px" id="faq-arrow-legal">›</div>
        </div>
        <div id="faq-legal" style="display:none;padding:10px 0 0 50px;font-size:12px;color:var(--text-dim);line-height:1.6">All Munchies products are derived from federally legal hemp containing less than 0.3% Delta-9 THC by dry weight per the 2018 Farm Bill. Lab-tested, COA available on request.</div>
      </div>
      <div class="prof-row" onclick="toggleFaq('refund')" style="cursor:pointer;flex-direction:column;align-items:stretch">
        <div style="display:flex;gap:14px;align-items:center;width:100%">
          <div class="ic">💸</div>
          <div style="flex:1;font-weight:600;font-size:13px">Refund policy</div>
          <div style="color:var(--text-mute);font-size:18px" id="faq-arrow-refund">›</div>
        </div>
        <div id="faq-refund" style="display:none;padding:10px 0 0 50px;font-size:12px;color:var(--text-dim);line-height:1.6">If your order arrives damaged, missing, or wrong, contact us within 24 hours for a full refund or replacement. Unopened products only.</div>
      </div>
      <div class="prof-row" onclick="toggleFaq('zones')" style="cursor:pointer;flex-direction:column;align-items:stretch">
        <div style="display:flex;gap:14px;align-items:center;width:100%">
          <div class="ic">📍</div>
          <div style="flex:1;font-weight:600;font-size:13px">Where do you deliver?</div>
          <div style="color:var(--text-mute);font-size:18px" id="faq-arrow-zones">›</div>
        </div>
        <div id="faq-zones" style="display:none;padding:10px 0 0 50px;font-size:12px;color:var(--text-dim);line-height:1.6">We currently deliver within a 15-mile radius of our store. Enter your address at checkout to confirm coverage.</div>
      </div>

      <div class="pd-section-title" style="margin-top:18px">Legal</div>
      <div class="prof-row" onclick="toast('Terms','Opening Terms of Service')" style="cursor:pointer">
        <div class="ic">📄</div>
        <div class="lbl">Terms of Service</div>
        <div style="color:var(--text-mute);font-size:18px">›</div>
      </div>
      <div class="prof-row" onclick="toast('Privacy','Opening Privacy Policy')" style="cursor:pointer">
        <div class="ic">🔒</div>
        <div class="lbl">Privacy Policy</div>
        <div style="color:var(--text-mute);font-size:18px">›</div>
      </div>

      <p class="muted tiny" style="text-align:center;margin-top:24px">Munchies v0.1.0 · Made with 🌿</p>
    </div>
  </div>`;

window.toggleFaq = (key) => {
  const el = document.getElementById('faq-' + key);
  const arrow = document.getElementById('faq-arrow-' + key);
  if (!el) return;
  const isOpen = el.style.display !== 'none';
  el.style.display = isOpen ? 'none' : 'block';
  if (arrow) arrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';
};

// ===== Search debounce =====
let _searchTimer;
window.runSearch = () => {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => {
    const v = document.getElementById('browse-search')?.value || '';
    state.searchQuery = v;
    // Re-render only the products grid for performance
    render();
    // Restore focus + cursor position
    const inp = document.getElementById('browse-search');
    if (inp) { inp.focus(); inp.setSelectionRange(v.length, v.length); }
  }, 200);
};

// ===== Edit profile screen =====
screens.editprofile = () => {
  const u = state.user || {};
  return `
  <div class="screen">
    <div class="simple-header">
      <div class="b" onclick="back()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></div>
      <div class="t">Edit profile</div>
    </div>
    <div class="scroll" style="padding:8px 28px 40px">
      <div class="field" style="margin-top:14px"><label>Full name</label><input id="ep-name" value="${esc(u.name||'')}" autocapitalize="words"/></div>
      <div class="field"><label>Email</label><input value="${esc(u.email||'')}" disabled style="opacity:0.6"/><div class="muted tiny" style="margin-top:4px">Email cannot be changed</div></div>
      <div class="field"><label>Phone</label><input id="ep-phone" type="tel" value="${esc(u.phone||'')}" placeholder="+1 (555) 123-4567"/></div>
      ${state.error ? `<div class="error">${esc(state.error)}</div>`:''}
      <button class="btn btn-primary" style="margin-top:14px" onclick="saveProfile()">Save changes</button>
      <button class="btn btn-ghost" style="margin-top:8px" onclick="nav('changepassword')">Change password →</button>
    </div>
  </div>`;
};
window.saveProfile = async () => {
  state.error = null;
  const name = document.getElementById('ep-name').value.trim();
  const phone = document.getElementById('ep-phone').value.trim();
  if (!name) { state.error = 'Name is required.'; render(); return; }
  try {
    await api('/me', { method:'PATCH', body: { name, phone }});
    const { user } = await api('/me'); state.user = user;
    toast('Saved', 'Profile updated');
    nav('profile');
  } catch (e) { state.error = e.message; render(); }
};

// ===== Change password screen =====
screens.changepassword = () => `
  <div class="screen">
    <div class="simple-header">
      <div class="b" onclick="back()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></div>
      <div class="t">Change password</div>
    </div>
    <div class="scroll" style="padding:8px 28px 40px">
      <div class="field" style="margin-top:14px"><label>Current password</label><input id="cp-current" type="password" autocomplete="current-password"/></div>
      <div class="field"><label>New password</label><input id="cp-new" type="password" autocomplete="new-password" placeholder="At least 8 characters"/></div>
      <div class="field"><label>Confirm new password</label><input id="cp-new2" type="password" autocomplete="new-password"/></div>
      ${state.error ? `<div class="error">${esc(state.error)}</div>`:''}
      <button class="btn btn-primary" style="margin-top:14px" onclick="changePassword()">Update password</button>
    </div>
  </div>`;
window.changePassword = async () => {
  state.error = null;
  const current_password = document.getElementById('cp-current').value;
  const new_password = document.getElementById('cp-new').value;
  const confirm = document.getElementById('cp-new2').value;
  if (!current_password || !new_password) { state.error = 'Please fill all fields.'; render(); return; }
  if (new_password.length < 8) { state.error = 'New password must be at least 8 characters.'; render(); return; }
  if (new_password !== confirm) { state.error = "Passwords don't match."; render(); return; }
  try {
    await api('/me/change-password', { method:'POST', body: { current_password, new_password }});
    toast('Updated', 'Your password was changed');
    nav('profile');
  } catch (e) { state.error = e.message; render(); }
};

// ===== Forgot password (login screen helper) =====
window.forgotPassword = async () => {
  const email = prompt('Enter your account email — we\'ll send a password reset link if it exists.');
  if (!email) return;
  try {
    const r = await api('/auth/forgot-password', { method:'POST', body: { email }});
    toast('Sent', r.message || 'Check your email');
  } catch (e) { toast('Error', e.message); }
};

// ===== Order detail screen with cancel/reorder =====
screens.orderdetail = () => {
  if (!state.currentOrder) { nav('orders'); return ''; }
  return `
  <div class="screen">
    <div class="simple-header">
      <div class="b" onclick="nav('orders')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></div>
      <div class="t">Order details</div>
    </div>
    <div class="scroll" id="orderdetail-content" style="padding-bottom:40px">
      <div class="center-loading" style="height:200px"><div class="spinner"></div></div>
    </div>
  </div>`;
};
async function loadOrderDetail() {
  if (state.screen !== 'orderdetail' || !state.currentOrder) return;
  try {
    const { order } = await api('/orders/' + state.currentOrder);
    const c = document.getElementById('orderdetail-content');
    if (!c) return;
    const canCancel = ['placed','packed'].includes(order.status);
    const isDelivered = order.status === 'delivered';
    c.innerHTML = `
      <div class="section" style="padding:18px 22px 14px">
        <div class="between">
          <div>
            <div style="font-family:'Syne';font-size:20px;font-weight:700">Order #${esc(order.order_no)}</div>
            <div class="muted tiny" style="margin-top:4px">${new Date(order.created_at).toLocaleString()}</div>
          </div>
          <div class="badge ${order.status==='delivered'?'neon':order.status==='cancelled'?'':order.status==='out_for_delivery'?'gold':''}">${esc(order.status.replace(/_/g,' '))}</div>
        </div>
      </div>
      ${order.address ? `<div class="prof-row" style="margin:0 22px 10px">
        <div class="ic">📍</div>
        <div style="flex:1"><div style="font-weight:600;font-size:13px">Delivery address</div><div class="muted tiny" style="margin-top:2px">${esc(order.address)}</div></div>
      </div>` : ''}
      <div class="pd-section-title" style="padding:0 22px;margin-top:8px">Items</div>
      <div style="padding:0 22px">
        ${order.items.map(it=>`
          <div class="cart-item">
            <div class="ci-img">📦</div>
            <div class="ci-meta">
              <div class="ci-title">${esc(it.product_name)}</div>
              <div class="ci-sub">${esc(it.size)} × ${it.qty}</div>
              <div class="ci-price">${$$(it.price_cents*it.qty)}</div>
            </div>
          </div>`).join('')}
      </div>
      <div class="section" style="padding:0 22px;margin-top:8px">
        <div class="totals">
          <div class="row"><span>Subtotal</span><span>${$$(order.subtotal_cents)}</span></div>
          ${order.discount_cents>0?`<div class="row" style="color:var(--neon)"><span>Discount</span><span>−${$$(order.discount_cents)}</span></div>`:''}
          <div class="row"><span>${order.fulfillment==='delivery'?'Delivery':'Pickup'}</span><span>${$$(order.delivery_cents)}</span></div>
          <div class="row"><span>Tax</span><span>${$$(order.tax_cents)}</span></div>
          <div class="row total"><span>Total</span><span class="v">${$$(order.total_cents)}</span></div>
        </div>
      </div>
      ${order.cancel_reason?`<div class="prof-row" style="margin:0 22px 10px;background:rgba(255,91,110,.06);border-color:rgba(255,91,110,.3)">
        <div class="ic" style="color:var(--danger)">⚠️</div>
        <div style="flex:1"><div style="font-weight:600;font-size:13px">Cancellation reason</div><div class="muted tiny" style="margin-top:2px">${esc(order.cancel_reason)}</div></div>
      </div>`:''}
      <div style="padding:0 22px;margin-top:14px;display:flex;flex-direction:column;gap:8px">
        ${canCancel?`<button class="btn btn-ghost" style="border-color:var(--danger);color:var(--danger)" onclick="cancelOrder(${order.id})">Cancel order</button>`:''}
        ${isDelivered?`<button class="btn btn-primary" onclick="reorderPast(${order.id})">🔁 Reorder these items</button>`:''}
        <button class="btn btn-ghost" onclick="state.currentOrder=${order.id};nav('tracking')">View tracking →</button>
      </div>
    `;
  } catch (e) {
    document.getElementById('orderdetail-content').innerHTML = `<p class="muted tiny" style="text-align:center;padding:40px">Failed to load order: ${esc(e.message)}</p>`;
  }
}

window.cancelOrder = async (id) => {
  const reason = prompt('Why are you cancelling this order? (optional)') ?? '';
  if (reason === null) return;
  if (!confirm('Cancel this order? Inventory and points will be restored.')) return;
  try {
    await api('/orders/' + id + '/cancel', { method:'POST', body: { reason: reason || null }});
    toast('Cancelled', 'Order cancelled, points refunded');
    loadOrderDetail();
  } catch (e) { toast('Failed', e.message); }
};

window.reorderPast = async (id) => {
  try {
    const r = await api('/orders/' + id + '/reorder', { method:'POST' });
    state.cart = await api('/cart');
    toast(`Added ${r.added} items`, r.skipped > 0 ? `${r.skipped} item(s) unavailable and skipped` : 'Cart updated');
    nav('cart');
  } catch (e) { toast('Failed', e.message); }
};

// ===== Render =====
function render() {
  const fn = screens[state.screen] || screens.splash;
  VP.innerHTML = fn();
  // hooks
  if (state.screen === 'tracking') refreshTracking();
  if (state.screen === 'orders') loadOrders();
  if (state.screen === 'orderdetail') loadOrderDetail();
}
window.render = render;
window.state = state;

init();
