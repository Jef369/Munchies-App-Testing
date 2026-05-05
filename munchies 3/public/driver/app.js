// Munchies Driver app — audited & hardened version
const API = '/api';
const VP = document.getElementById('viewport');
const state = { user: null, view: 'queue', queue: { available: [], mine: [], completed: [] }, online: true, error: null, deliveringOrderId: null, currentOrder: null };
const acceptingIds = new Set(); // prevent double-tap on Accept

// XSS-safe rendering
const esc = (s) => { if (s == null) return ''; return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); };
const $$ = c => `$${(c/100).toFixed(2)}`;

async function api(path, opts={}) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), opts.timeout || 60000);
  try {
    const r = await fetch(API+path, { method:opts.method||'GET', headers:{'Content-Type':'application/json'}, credentials:'include', body:opts.body?JSON.stringify(opts.body):undefined, signal: ctrl.signal });
    clearTimeout(tid);
    if (!r.ok) { const e = await r.json().catch(()=>({error:`request failed (${r.status})`})); throw new Error(e.error || `request failed (${r.status})`); }
    return r.json();
  } catch (e) {
    clearTimeout(tid);
    if (e.name === 'AbortError') throw new Error('Server is taking too long — try again in a moment');
    throw e;
  }
}

function tickClock(){ const d=new Date(),h=d.getHours()%12||12,m=String(d.getMinutes()).padStart(2,'0'); const el=document.getElementById('clock'); if (el) el.textContent=`${h}:${m}`; }
setInterval(tickClock,60000);tickClock();

function toast(t,b,timeout){ document.getElementById('toast-title').textContent=t; document.getElementById('toast-body').textContent=b||''; const el=document.getElementById('toast'); el.classList.add('show'); clearTimeout(window._tt); window._tt=setTimeout(()=>el.classList.remove('show'),timeout||2500); }

// Pre-warm server on load to avoid cold-start surprise
fetch(API + '/categories', { credentials: 'include' }).catch(()=>{});

async function init() {
  try {
    const { user } = await api('/me');
    if (user.role !== 'driver') { state.error='Driver access required'; renderLogin(); return; }
    state.user = user;
    await loadQueue();
    render();
    setInterval(loadQueue, 8000);
    // Detect new orders for notification
    document.addEventListener('keydown', (e) => { if (e.key==='Escape' && state.deliveringOrderId) closeIdModal(); });
  } catch { renderLogin(); }
}

function renderLogin() {
  VP.innerHTML = `
  <div class="login">
    <div class="lm">🚚</div>
    <h2 style="text-align:center;font-size:22px">Munchies Driver</h2>
    <p style="text-align:center;font-size:13px;color:var(--text-dim)">Sign in to start your shift</p>
    <div class="field" style="margin-top:14px"><label>Email</label><input id="li-email" type="email" value="driver@munchies.test" autocapitalize="none" autocorrect="off"/></div>
    <div class="field"><label>Password</label><input id="li-pw" type="password" value="driver123"/></div>
    ${state.error?`<div class="error">${esc(state.error)}</div>`:''}
    <button class="btn btn-primary" style="margin-top:6px" onclick="driverLogin()">Sign in</button>
    <p style="font-size:11px;color:var(--text-mute);margin-top:14px;text-align:center">Demo: driver@munchies.test / driver123</p>
  </div>`;
}

window.driverLogin = async () => {
  state.error = null;
  try {
    const r = await api('/auth/login', { method:'POST', body:{ email:document.getElementById('li-email').value, password:document.getElementById('li-pw').value }});
    if (r.user.role !== 'driver') throw new Error('This is the driver app — you need a driver account.');
    state.user = r.user;
    await loadQueue();
    render();
  } catch (e) { state.error = e.message; renderLogin(); }
};

window.driverLogout = async () => {
  if (state.queue.mine && state.queue.mine.length > 0) {
    if (!confirm('You have active deliveries. Sign out anyway?')) return;
  }
  try { await api('/auth/logout',{method:'POST'}); } catch {}
  state.user=null;
  renderLogin();
};

let _prevAvailableCount = 0;
async function loadQueue() {
  if (!state.user) return;
  try {
    const newQueue = await api('/driver/queue');
    // Notify on new available orders
    if (newQueue.available.length > _prevAvailableCount && _prevAvailableCount >= 0 && state.online) {
      const diff = newQueue.available.length - _prevAvailableCount;
      if (_prevAvailableCount > 0 || newQueue.available.length > 0) toast('🔔 New order!', `${diff} new available`, 4000);
    }
    _prevAvailableCount = newQueue.available.length;
    state.queue = newQueue;
    if (typeof newQueue.online === 'boolean') state.online = newQueue.online;
    if (state.view==='queue' && !state.deliveringOrderId) render();
  } catch (e) {
    console.error('Queue load failed:', e);
    if (state.view==='queue') toast('Connection issue', 'Could not refresh queue');
  }
}

window.toggleOnline = async () => {
  const newVal = !state.online;
  state.online = newVal;
  render();
  try { await api('/driver/online', { method:'POST', body: { online: newVal }}); }
  catch (e) { state.online = !newVal; render(); toast('Failed', e.message); }
};

function render() {
  const earnings = state.queue.completed.reduce((s,o)=>s+Math.round((o.delivery_cents||0)*0.7),0)
                 + state.queue.mine.reduce((s,o)=>s+Math.round((o.delivery_cents||0)*0.7),0);
  const todayCompleted = state.queue.completed.length;

  VP.innerHTML = `
  <div class="scroll">
    <div class="head">
      <div><div class="greet">${state.online?'You\'re online':'Offline'} 👋</div><div class="name">${esc(state.user.name)}</div></div>
      <span class="online" style="cursor:pointer;background:${state.online?'var(--ok,#3ddc84)':'var(--surface-3)'};color:${state.online?'#0a0a0b':'var(--text)'}" onclick="driverLogout()" title="Sign out">${state.online?'Online':'Offline'} · Sign out</span>
    </div>
    <div class="toggle-online">
      <div><div class="lbl">Available for deliveries</div><div style="font-size:11px;color:var(--text-mute);margin-top:2px">Toggle off to stop receiving orders</div></div>
      <div class="switch ${state.online?'':'off'}" onclick="toggleOnline()"></div>
    </div>
    <div class="stats">
      <div class="stat"><div class="v">${state.queue.mine.length}</div><div class="l">Active</div></div>
      <div class="stat"><div class="v">${todayCompleted}</div><div class="l">Done today</div></div>
      <div class="stat"><div class="v">${$$(earnings)}</div><div class="l">Today</div></div>
    </div>

    <div class="section-title"><h3>My deliveries</h3><span class="count">${state.queue.mine.length}</span></div>
    ${state.queue.mine.length?state.queue.mine.map(o=>orderCardHTML(o,true)).join(''):`
      <div class="empty"><div class="em">📭</div><div style="font-weight:600;margin-bottom:4px">No active deliveries</div><div style="font-size:12px">Accept an available order below</div></div>
    `}

    <div class="section-title"><h3>Available now</h3><span class="count">${state.queue.available.length}</span></div>
    ${state.queue.available.length?state.queue.available.map(o=>orderCardHTML(o,false)).join(''):`
      <div class="empty"><div class="em">🌙</div><div style="font-weight:600;margin-bottom:4px">All caught up</div><div style="font-size:12px">New orders will appear here</div></div>
    `}
  </div>`;
}

function orderCardHTML(o, mine) {
  const eta = mine ? '~8 min' : '~5 min';
  const fullAddr = mine ? (o.address || '') : (o.address_short || 'Address shown after accept');
  const hasPhone = mine && o.customer_phone;
  const items = (mine && o.items && o.items.length) ? o.items.map(i => `${i.qty}× ${esc(i.product_name)} (${esc(i.size)})`).join(', ') : null;
  const accepting = acceptingIds.has(o.id);
  return `
    <div class="order-card ${mine?'active':''}">
      <div class="row1">
        <div>
          <div class="order-no">#${esc(o.order_no)}</div>
          <div class="customer">${mine ? esc(o.customer_name||'') : 'Customer revealed on accept'}${mine && o.customer_age ? ` · DOB ${esc(o.customer_dob)} (age ${o.customer_age})` : ''}</div>
        </div>
        <div class="total">${$$(o.total_cents)}</div>
      </div>
      ${items ? `<div style="background:var(--surface-3);border-radius:10px;padding:10px;margin:10px 0;font-size:12px;color:var(--text-dim);line-height:1.5">📦 ${items}</div>` : ''}
      <div class="address-row">
        <div class="ic">🏪</div>
        <div class="lbl"><div class="t">Pickup</div><div class="s">Munchies Downtown · 412 Market Ave</div></div>
        <span style="font-size:11px;color:var(--text-mute)">2 min</span>
      </div>
      <div class="address-row">
        <div class="ic">📍</div>
        <div class="lbl"><div class="t">Drop off</div><div class="s">${esc(fullAddr)}</div></div>
        <span style="font-size:11px;color:var(--neon);font-weight:700">${eta}</span>
      </div>
      <div class="action-row">
        ${mine?`
          ${o.address ? `<a class="btn btn-ghost" href="https://maps.apple.com/?q=${encodeURIComponent(o.address)}" target="_blank">🗺 Navigate</a>` : ''}
          ${hasPhone ? `<a class="btn btn-ghost" href="tel:${esc(o.customer_phone)}">📞 Call</a>` : ''}
        ` : ''}
      </div>
      <div class="action-row">
        ${mine?`
          <button class="btn btn-ghost" style="color:var(--danger);border-color:rgba(255,91,110,.3);flex:1" onclick="openRefusalModal(${o.id})">⚠️ Refuse</button>
          <button class="btn btn-primary" style="flex:2" onclick="openIdModal(${o.id})">🪪 Verify ID & deliver</button>
        `:`
          <button class="btn btn-primary" ${accepting?'disabled style="opacity:0.6"':''} onclick="acceptOrder(${o.id})">${accepting?'Accepting…':`Accept · ${$$(Math.round((o.delivery_cents||499)*0.7))} earnings`}</button>
        `}
      </div>
    </div>`;
}

window.acceptOrder = async (id) => {
  if (acceptingIds.has(id)) return;
  acceptingIds.add(id);
  render();
  try {
    await api(`/driver/orders/${id}/accept`,{method:'POST'});
    toast('Order accepted','Head to the store');
    await loadQueue();
  } catch (e) {
    toast('Failed', e.message);
  } finally {
    acceptingIds.delete(id);
    render();
  }
};

// ===== Refusal flow =====
window.openRefusalModal = (orderId) => {
  state.refusingOrderId = orderId;
  const card = document.querySelector('#id-modal .id-card');
  if (!card) return;
  card.innerHTML = `
    <h2 style="color:var(--danger)">Refuse delivery</h2>
    <p>Required by law if customer is under 21, intoxicated, or won't show ID. The order will be cancelled and inventory restored. This is logged for compliance.</p>
    <div class="field" style="margin:14px 0;text-align:left">
      <label style="display:block;font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.6px;font-weight:600;margin-bottom:6px">Reason</label>
      <select id="ref-reason" style="width:100%;background:var(--surface-2);border:1px solid var(--line);color:var(--text);font-family:inherit;font-size:14px;border-radius:12px;padding:14px 16px;outline:none" onchange="document.getElementById('ref-other').style.display=this.value==='other'?'block':'none'">
        <option value="">Select a reason…</option>
        <option value="customer under 21">Customer is under 21</option>
        <option value="customer appears intoxicated">Customer appears intoxicated</option>
        <option value="customer refused to show ID">Customer refused to show ID</option>
        <option value="ID appears fake or expired">ID appears fake or expired</option>
        <option value="name on ID does not match order">Name on ID doesn't match order</option>
        <option value="customer not present at address">Customer not present at address</option>
        <option value="other">Other</option>
      </select>
      <textarea id="ref-other" rows="2" style="display:none;width:100%;margin-top:8px;background:var(--surface-2);border:1px solid var(--line);color:var(--text);font-family:inherit;font-size:14px;border-radius:12px;padding:14px 16px;outline:none;resize:vertical" placeholder="Describe what happened..."></textarea>
    </div>
    <button class="btn" style="background:var(--danger);color:#fff" onclick="submitRefusal()">Confirm refusal</button>
    <button class="btn btn-ghost" style="margin-top:8px" onclick="closeIdModal()">← Back</button>
  `;
  document.getElementById('id-modal').classList.add('show');
};

window.submitRefusal = async () => {
  const id = state.refusingOrderId;
  let reason = document.getElementById('ref-reason').value;
  if (!reason) { toast('Reason required', 'Please select a reason'); return; }
  if (reason === 'other') {
    const other = document.getElementById('ref-other').value.trim();
    if (!other) { toast('Description required', 'Please describe what happened'); return; }
    reason = 'other: ' + other;
  }
  try {
    await api(`/driver/orders/${id}/refuse`, { method:'POST', body: { reason }});
    state.refusingOrderId = null;
    closeIdModal();
    toast('Refusal logged', 'Order cancelled');
    await loadQueue();
  } catch (e) { toast('Failed', e.message); }
};

// ===== Delivery photo capture =====
const deliverPhotos = { id: null, proof: null };

window.openIdModal = (id) => {
  state.deliveringOrderId = id;
  state.deliverStep = 'id';
  state.refusingOrderId = null;
  deliverPhotos.id = null; deliverPhotos.proof = null;
  renderIdModal();
  document.getElementById('id-modal').classList.add('show');
};
window.closeIdModal = () => {
  state.deliveringOrderId = null;
  state.deliverStep = null;
  state.refusingOrderId = null;
  document.getElementById('id-modal').classList.remove('show');
};

function renderIdModal() {
  const step = state.deliverStep;
  const card = document.querySelector('#id-modal .id-card');
  if (!card) return;
  // Pull customer DOB info from the active order for verification
  const order = state.queue.mine.find(o => o.id === state.deliveringOrderId) || {};
  const customerInfo = order.customer_name ? `
    <div style="background:rgba(212,175,55,.06);border:1px solid rgba(212,175,55,.3);border-radius:10px;padding:12px;margin-bottom:14px;text-align:left">
      <div style="font-size:11px;color:var(--gold);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Match this against ID:</div>
      <div style="font-size:15px;font-weight:700;color:var(--text)">${esc(order.customer_name)}</div>
      ${order.customer_dob ? `<div style="font-size:13px;color:var(--text-dim);margin-top:4px">DOB: <b>${esc(order.customer_dob)}</b> · Age: <b>${order.customer_age}</b> ${order.customer_age >= 21 ? '✓ (21+)' : '⚠️ UNDER 21'}</div>` : '<div style="font-size:11px;color:var(--warn);margin-top:4px">⚠️ Customer DOB not on file — verify age from physical ID</div>'}
    </div>
  ` : '';
  if (step === 'id') {
    card.innerHTML = `
      <h2>Step 1 of 2 · Customer ID</h2>
      <p>Photograph the customer's ID. Required for compliance.</p>
      ${customerInfo}
      ${deliverPhotos.id ? `
        <div style="background:var(--surface-2);border:1px solid var(--neon);border-radius:14px;padding:10px;margin-bottom:14px">
          <img src="${deliverPhotos.id}" style="max-width:100%;max-height:240px;border-radius:8px;display:block;margin:0 auto" />
        </div>
        <label style="display:flex;gap:10px;align-items:flex-start;font-size:12px;color:var(--text);line-height:1.5;margin-bottom:14px;text-align:left;cursor:pointer">
          <input id="age-confirm" type="checkbox" style="margin-top:3px" onchange="document.getElementById('next-step').disabled=!this.checked;document.getElementById('next-step').style.opacity=this.checked?'1':'0.5'"/>
          <span>I confirm I checked the ID, the photo matches the customer, the name matches the order, and the DOB shows 21+.</span>
        </label>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost" onclick="retakeDeliverPhoto('id')">📷 Retake</button>
          <button class="btn btn-primary" id="next-step" disabled style="opacity:0.5" onclick="state.deliverStep='proof';renderIdModal()">Next →</button>
        </div>
      ` : `
        <div class="scan-frame" onclick="document.getElementById('deliver-cam').click()" style="cursor:pointer">
          <div>
            <div class="em">📷</div>
            <div class="ph">Tap to open camera</div>
          </div>
        </div>
        <input id="deliver-cam" type="file" accept="image/*" capture="environment" onchange="handleDeliverPhoto(event,'id')" style="display:none" />
        <div style="background:rgba(255,181,71,.08);border:1px solid rgba(255,181,71,.3);border-radius:10px;padding:10px;margin-bottom:14px;font-size:11px;color:var(--warn);text-align:left;line-height:1.5">⚠️ <b>Required:</b> If customer is under 21, intoxicated, or won't show ID — go back and tap "Refuse" instead.</div>
        <button class="btn btn-ghost" onclick="if(confirm('Cancel without delivering?'))closeIdModal()">Cancel</button>
      `}
    `;
  } else if (step === 'proof') {
    card.innerHTML = `
      <h2>Step 2 of 2 · Delivery proof</h2>
      <p>Photo of the order at the door (recommended for dispute protection).</p>
      ${deliverPhotos.proof ? `
        <div style="background:var(--surface-2);border:1px solid var(--neon);border-radius:14px;padding:10px;margin-bottom:14px">
          <img src="${deliverPhotos.proof}" style="max-width:100%;max-height:240px;border-radius:8px;display:block;margin:0 auto" />
        </div>
        <button class="btn btn-primary" onclick="confirmDelivery()">✓ Confirm delivery</button>
        <button class="btn btn-ghost" style="margin-top:8px" onclick="retakeDeliverPhoto('proof')">📷 Retake</button>
      ` : `
        <div class="scan-frame" onclick="document.getElementById('proof-cam').click()" style="cursor:pointer">
          <div>
            <div class="em">📦</div>
            <div class="ph">Tap to capture delivery proof</div>
          </div>
        </div>
        <input id="proof-cam" type="file" accept="image/*" capture="environment" onchange="handleDeliverPhoto(event,'proof')" style="display:none" />
        <button class="btn btn-primary" onclick="confirmDelivery()">Skip & confirm delivery</button>
        <button class="btn btn-ghost" style="margin-top:8px" onclick="state.deliverStep='id';renderIdModal()">← Back</button>
      `}
    `;
  }
}

window.handleDeliverPhoto = (event, kind) => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 15 * 1024 * 1024) { alert('Image too large.'); return; }
  const reader = new FileReader();
  reader.onload = (e) => resizeImage(e.target.result, 1400, 0.85, (resized) => {
    deliverPhotos[kind] = resized;
    renderIdModal();
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

window.retakeDeliverPhoto = (kind) => {
  deliverPhotos[kind] = null;
  renderIdModal();
};

let _delivering = false;
window.confirmDelivery = async () => {
  if (_delivering) return;
  const id = state.deliveringOrderId;
  if (!id) return;
  if (!deliverPhotos.id) { toast('ID photo required','Capture customer ID first'); return; }
  _delivering = true;
  toast('Submitting…','Uploading photos', 8000);
  try {
    await api(`/driver/orders/${id}/deliver`,{method:'POST',body:{
      id_verified: true,
      delivery_id_photo_url: deliverPhotos.id,
      delivery_proof_photo_url: deliverPhotos.proof,
    }});
    closeIdModal();
    toast('🎉 Delivered','Great job!');
    await loadQueue();
  } catch (e) { toast('Failed', e.message, 5000); }
  finally { _delivering = false; }
};

init();
