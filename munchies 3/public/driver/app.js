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
window.openIdModal = (id) => { state.deliveringOrderId = id; document.getElementById('id-modal').classList.add('show'); };
window.closeIdModal = () => { state.deliveringOrderId = null; document.getElementById('id-modal').classList.remove('show'); };
window.confirmDelivery = async () => {
  const id = state.deliveringOrderId;
  if (!id) return;
  try {
    await api(`/driver/orders/${id}/deliver`,{method:'POST',body:{id_verified:true}});
    closeIdModal();
    toast('🎉 Delivered','Great job!');
    await loadQueue(); render();
  } catch (e) { toast('Failed', e.message); }
};
window.callCustomer = (phone) => toast('Calling customer','In-app calling masks your number'+(phone?` · ${phone}`:''));

init();
