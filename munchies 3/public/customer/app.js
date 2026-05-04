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

// ===== API helper =====
async function api(path, opts = {}) {
  const r = await fetch(API + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!r.ok) {
    const e = await r.json().catch(()=>({error:'request failed'}));
    throw new Error(e.error || 'request failed');
  }
  return r.json();
}

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
      ${state.error ? `<div class="error">${state.error}</div>`:''}
      <button class="btn btn-primary" onclick="doLogin()">Sign in</button>
      <button class="btn btn-ghost" onclick="nav('signup')">Create account</button>
      <p class="tiny muted" style="text-align:center;margin-top:auto;padding-bottom:20px">Demo: shop@munchies.test / shop123</p>
    </div>
  </div>`;

screens.signup = () => `
  <div class="screen">
    <div class="simple-header">
      <div class="b" onclick="nav('login')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></div>
      <div class="t">Create account</div>
    </div>
    <div style="padding:8px 28px;flex:1;display:flex;flex-direction:column;gap:10px;overflow-y:auto">
      <h2 style="font-size:22px;margin:14px 0 8px">Get started</h2>
      <div class="field"><label>Name</label><input id="su-name" placeholder="Your name"/></div>
      <div class="field"><label>Email</label><input id="su-email" type="email" placeholder="you@example.com"/></div>
      <div class="field"><label>Phone</label><input id="su-phone" type="tel" placeholder="+1 (555) 123-4567"/></div>
      <div class="field"><label>Password</label><input id="su-pw" type="password" placeholder="At least 8 characters"/></div>
      <label style="display:flex;gap:10px;align-items:flex-start;font-size:12px;color:var(--text-dim);line-height:1.5"><input id="su-age" type="checkbox" checked style="margin-top:3px"/> I confirm I am 21+ years old</label>
      ${state.error ? `<div class="error">${state.error}</div>`:''}
      <button class="btn btn-primary" style="margin-top:14px" onclick="doSignup()">Create account</button>
      <p class="tiny muted" style="text-align:center;padding:10px 0 20px">By signing up you agree to our Terms & Privacy Policy.</p>
    </div>
  </div>`;

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
  const body = {
    name: document.getElementById('su-name').value.trim(),
    email: document.getElementById('su-email').value.trim(),
    phone: document.getElementById('su-phone').value.trim(),
    password: document.getElementById('su-pw').value,
    age_ok: document.getElementById('su-age').checked,
  };
  try {
    const { user } = await api('/auth/signup', { method: 'POST', body });
    state.user = user;
    await refreshCart();
    toast('Welcome to Munchies', '🎁 You unlocked FIRST20 — 20% off');
    nav('home');
  } catch (e) { state.error = e.message; render(); }
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
  return `
    <div class="pcard" onclick="openProduct(${p.id})">
      <div class="img">
        ${p.tag?`<span class="tag">${p.tag}</span>`:''}
        <span style="font-size:60px">${p.emoji}</span>
      </div>
      <div class="meta">
        <div class="title">${p.name}</div>
        <div class="sub">${p.sub||''}</div>
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
  const filtered = state.category ? state.products.filter(p=>p.category_id===state.category) : state.products;
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
        <input placeholder="Search products..." />
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
      <div class="pd-hero">
        <div class="pd-back" onclick="back()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></div>
        <div class="emoji">${p.emoji}</div>
      </div>
      <div class="pd-body">
        <div class="pd-strain-row">
          <span class="badge neon">${p.type}</span>
          <span class="badge">Lab tested</span>
          <span class="badge gold">⚡ 45min delivery</span>
        </div>
        <h1 class="pd-title">${p.name}</h1>
        <div class="pd-rating"><span class="stars">★★★★★</span><span>${p.rating} · ${p.review_count} reviews</span></div>
        <div class="pd-stat-row">
          <div class="pd-stat"><div class="v">${p.thc||'—'}</div><div class="l">THCA</div></div>
          <div class="pd-stat"><div class="v">${p.cbd||'—'}</div><div class="l">CBD</div></div>
          <div class="pd-stat"><div class="v">${p.type}</div><div class="l">Strain</div></div>
        </div>
        <div class="pd-section-title">Description</div>
        <p class="pd-desc">${p.description||''}</p>
        <div class="pd-section-title">Choose size</div>
        <div class="pd-options">
          ${p.variants.map((vv,i)=>`<div class="pd-opt ${vv.id===v.id?'active':''}" onclick="state.selectedVariant=state.selectedProduct.variants[${i}];render()">
            <div class="w">${vv.size}</div><div class="p">${$$(vv.price_cents)}</div>
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
            <div class="ci-img">${it.emoji}</div>
            <div class="ci-meta">
              <div class="ci-title">${it.name}</div>
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
            <div style="width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,var(--neon),var(--gold));display:grid;place-items:center;font-family:'Syne';font-weight:700;color:#0a0a0b">${order.driver?order.driver.name.split(' ').map(s=>s[0]).join(''):'—'}</div>
            <div style="flex:1">
              <div style="font-weight:700">${order.driver?order.driver.name:'Awaiting driver'}</div>
              <div class="muted tiny">Order #${order.order_no}</div>
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
        ${order.items.map(it=>`<div class="cart-item"><div class="ci-img">📦</div><div class="ci-meta"><div class="ci-title">${it.product_name}</div><div class="ci-sub">${it.size} × ${it.qty}</div><div class="ci-price">${$$(it.price_cents*it.qty)}</div></div></div>`).join('')}
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
      <div class="cart-item" onclick="state.currentOrder=${o.id};nav('tracking')" style="cursor:pointer">
        <div class="ci-img">${o.status==='delivered'?'✅':'🚚'}</div>
        <div class="ci-meta">
          <div class="ci-title">Order #${o.order_no} · ${o.status.replace(/_/g,' ')}</div>
          <div class="ci-sub">${new Date(o.created_at).toLocaleDateString()} · ${o.fulfillment}</div>
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
        <div class="avatar">${u.name.split(' ').map(s=>s[0]).join('').slice(0,2).toUpperCase()}</div>
        <div>
          <div style="font-family:'Syne';font-size:20px;font-weight:700">${u.name}</div>
          <div class="muted tiny">★ ${u.loyalty_tier} · ${u.loyalty_points} pts</div>
        </div>
      </div>
      <div style="padding:0 22px">
        <div class="prof-row" onclick="nav('orders')"><div class="ic">📦</div><div class="lbl">Order history</div></div>
        <div class="prof-row" onclick="nav('rewards')"><div class="ic">⭐</div><div class="lbl">Rewards & points</div><div class="badge gold">${u.loyalty_points} pts</div></div>
        <div class="prof-row" onclick="editAddress()" style="cursor:pointer">
          <div class="ic">📍</div>
          <div class="lbl">
            <div style="font-weight:600;font-size:14px">Delivery address</div>
            <div class="muted tiny" style="margin-top:2px">${addr || 'Tap to add your address'}</div>
          </div>
          <div style="color:var(--text-mute);font-size:18px">›</div>
        </div>
        <div class="prof-row"><div class="ic">💳</div><div class="lbl">Payment methods</div></div>
        <div class="prof-row"><div class="ic">🪪</div><div class="lbl">ID verification</div><div class="badge neon">Verified</div></div>
        <div class="prof-row"><div class="ic">🔔</div><div class="lbl">Notifications</div></div>
        <div class="prof-row"><div class="ic">❓</div><div class="lbl">Help & support</div></div>
        <div class="prof-row" onclick="doLogout()" style="margin-top:14px;color:var(--danger)"><div class="ic">↪</div><div class="lbl" style="color:var(--danger)">Sign out</div></div>
      </div>
    </div>
  </div>`;
};

// ===== Render =====
function render() {
  const fn = screens[state.screen] || screens.splash;
  VP.innerHTML = fn();
  // hooks
  if (state.screen === 'tracking') refreshTracking();
  if (state.screen === 'orders') loadOrders();
}
window.render = render;
window.state = state;

init();
