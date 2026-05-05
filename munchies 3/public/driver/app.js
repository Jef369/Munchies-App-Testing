// Munchies Driver app
const API = '/api';
const VP = document.getElementById('viewport');
const state = { user: null, view: 'queue', queue: { available: [], mine: [] }, online: true, error: null, deliveringOrderId: null };

async function api(path, opts={}) {
  const r = await fetch(API+path, { method:opts.method||'GET', headers:{'Content-Type':'application/json'}, credentials:'include', body:opts.body?JSON.stringify(opts.body):undefined });
  if (!r.ok) { const e = await r.json().catch(()=>({error:'failed'})); throw new Error(e.error); }
  return r.json();
}
const $$ = c => `$${(c/100).toFixed(2)}`;

function tickClock(){ const d=new Date(),h=d.getHours()%12||12,m=String(d.getMinutes()).padStart(2,'0'); document.getElementById('clock').textContent=`${h}:${m}`; }
setInterval(tickClock,30000);tickClock();

function toast(t,b){ document.getElementById('toast-title').textContent=t; document.getElementById('toast-body').textContent=b||''; const el=document.getElementById('toast'); el.classList.add('show'); clearTimeout(window._tt); window._tt=setTimeout(()=>el.classList.remove('show'),2500); }

async function init() {
  try {
    const { user } = await api('/me');
    if (user.role !== 'driver') { state.error='Driver access required'; renderLogin(); return; }
    state.user = user;
    await loadQueue();
    render();
    setInterval(loadQueue, 8000);
  } catch { renderLogin(); }
}

function renderLogin() {
  VP.innerHTML = `
  <div class="login">
    <div class="lm">🚚</div>
    <h2 style="text-align:center;font-size:22px">Munchies Driver</h2>
    <p style="text-align:center;font-size:13px;color:var(--text-dim)">Sign in to start your shift</p>
    <div class="field" style="margin-top:14px"><label>Email</label><input id="li-email" type="email" value="driver@munchies.test"/></div>
    <div class="field"><label>Password</label><input id="li-pw" type="password" value="driver123"/></div>
    ${state.error?`<div class="error">${state.error}</div>`:''}
    <button class="btn btn-primary" style="margin-top:6px" onclick="driverLogin()">Sign in</button>
    <p style="font-size:11px;color:var(--text-mute);margin-top:14px;text-align:center">Demo: driver@munchies.test / driver123</p>
  </div>`;
}
window.driverLogin = async () => {
  state.error = null;
  try {
    const r = await api('/auth/login', { method:'POST', body:{ email:document.getElementById('li-email').value, password:document.getElementById('li-pw').value }});
    if (r.user.role !== 'driver') throw new Error('Driver account required');
    state.user = r.user;
    await loadQueue();
    render();
  } catch (e) { state.error = e.message; renderLogin(); }
};
window.driverLogout = async () => { await api('/auth/logout',{method:'POST'}); state.user=null; renderLogin(); };

async function loadQueue() {
  if (!state.user) return;
  try { state.queue = await api('/driver/queue'); if (state.view==='queue') render(); } catch {}
}

function render() {
  const todayDelivered = 0; // would come from API in production
  const earnings = state.queue.mine.reduce((s,o)=>s+Math.round(o.delivery_cents*0.7),0); // est driver share

  VP.innerHTML = `
  <div class="scroll">
    <div class="head">
      <div><div class="greet">${state.online?'You\'re online':'Offline'} 👋</div><div class="name">${state.user.name}</div></div>
      <span class="online" onclick="driverLogout()" style="cursor:pointer">${state.online?'Online':'Offline'}</span>
    </div>
    <div class="toggle-online">
      <div><div class="lbl">Available for deliveries</div><div style="font-size:11px;color:var(--text-mute);margin-top:2px">Toggle off to stop receiving orders</div></div>
      <div class="switch ${state.online?'':'off'}" onclick="state.online=!state.online;render()"></div>
    </div>
    <div class="stats">
      <div class="stat"><div class="v">${state.queue.mine.length}</div><div class="l">Active</div></div>
      <div class="stat"><div class="v">${state.queue.available.length}</div><div class="l">Available</div></div>
      <div class="stat"><div class="v">${$$(earnings)}</div><div class="l">Today est.</div></div>
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
  const eta = mine ? '8 min' : '~5 min';
  return `
    <div class="order-card ${mine?'active':''}">
      <div class="row1">
        <div>
          <div class="order-no">#${o.order_no}</div>
          <div class="customer">${o.customer_name||''} ${o.customer_phone?`· ${o.customer_phone}`:''}</div>
        </div>
        <div class="total">${$$(o.total_cents)}</div>
      </div>
      <div class="address-row">
        <div class="ic">🏪</div>
        <div class="lbl"><div class="t">Pickup</div><div class="s">Munchies Downtown · 412 Market Ave</div></div>
        <span style="font-size:11px;color:var(--text-mute)">2 min</span>
      </div>
      <div class="address-row">
        <div class="ic">📍</div>
        <div class="lbl"><div class="t">${mine?'Drop off':'Drop off'}</div><div class="s">${o.address||'123 Main St, Apt 4B'}</div></div>
        <span style="font-size:11px;color:var(--neon);font-weight:700">${eta}</span>
      </div>
      <div class="action-row">
        ${mine?`
          <button class="btn btn-ghost" onclick="callCustomer('${o.customer_phone||''}')">📞 Call</button>
          <button class="btn btn-primary" onclick="openIdModal(${o.id})">🪪 Verify ID & deliver</button>
        `:`
          <button class="btn btn-primary" onclick="acceptOrder(${o.id})">Accept · ${$$(Math.round((o.delivery_cents||499)*0.7))} earnings</button>
        `}
      </div>
    </div>`;
}

window.acceptOrder = async (id) => {
  try { await api(`/driver/orders/${id}/accept`,{method:'POST'}); toast('Order accepted','Head to the store'); await loadQueue(); render(); }
  catch (e) { toast('Failed', e.message); }
};
// ===== Delivery photo capture =====
const deliverPhotos = { id: null, proof: null };

window.openIdModal = (id) => {
  state.deliveringOrderId = id;
  state.deliverStep = 'id';
  deliverPhotos.id = null; deliverPhotos.proof = null;
  renderIdModal();
  document.getElementById('id-modal').classList.add('show');
};
window.closeIdModal = () => {
  state.deliveringOrderId = null;
  state.deliverStep = null;
  document.getElementById('id-modal').classList.remove('show');
};

function renderIdModal() {
  const step = state.deliverStep;
  const card = document.querySelector('#id-modal .id-card');
  if (!card) return;
  if (step === 'id') {
    card.innerHTML = `
      <h2>Step 1 of 2 · Customer ID</h2>
      <p>Capture a clear photo of the customer's ID at the door. Confirm name matches order, photo matches person, and DOB shows 21+.</p>
      ${deliverPhotos.id ? `
        <div style="background:var(--surface-2);border:1px solid var(--neon);border-radius:14px;padding:10px;margin-bottom:14px">
          <img src="${deliverPhotos.id}" style="max-width:100%;max-height:240px;border-radius:8px;display:block;margin:0 auto" />
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost" onclick="retakeDeliverPhoto('id')">📷 Retake</button>
          <button class="btn btn-primary" onclick="state.deliverStep='proof';renderIdModal()">Next →</button>
        </div>
      ` : `
        <div class="scan-frame" onclick="document.getElementById('deliver-cam').click()" style="cursor:pointer">
          <div>
            <div class="em">📷</div>
            <div class="ph">Tap to open camera</div>
          </div>
        </div>
        <input id="deliver-cam" type="file" accept="image/*" capture="environment" onchange="handleDeliverPhoto(event,'id')" style="display:none" />
        <div style="background:rgba(255,181,71,.08);border:1px solid rgba(255,181,71,.3);border-radius:10px;padding:10px;margin-bottom:14px;font-size:11px;color:var(--warn);text-align:left;line-height:1.5">⚠️ <b>Required:</b> Refuse delivery and tap Cancel if customer is under 21, intoxicated, or won't show ID.</div>
        <button class="btn btn-ghost" onclick="closeIdModal()">Cancel delivery</button>
      `}
    `;
  } else if (step === 'proof') {
    card.innerHTML = `
      <h2>Step 2 of 2 · Delivery proof</h2>
      <p>Photo of the order at the door (optional but recommended for dispute protection).</p>
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

window.confirmDelivery = async () => {
  const id = state.deliveringOrderId;
  if (!id) return;
  if (!deliverPhotos.id) { toast('ID photo required','Capture customer ID first'); return; }
  toast('Submitting…','Uploading photos');
  try {
    await api(`/driver/orders/${id}/deliver`,{method:'POST',body:{
      id_verified: true,
      delivery_id_photo_url: deliverPhotos.id,
      delivery_proof_photo_url: deliverPhotos.proof,
    }});
    closeIdModal();
    toast('🎉 Delivered','Great job!');
    await loadQueue(); render();
  } catch (e) { toast('Failed', e.message); }
};
window.callCustomer = (phone) => toast('Calling customer','In-app calling masks your number'+(phone?` · ${phone}`:''));

init();
