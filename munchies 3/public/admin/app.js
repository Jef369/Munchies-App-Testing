// Munchies Admin dashboard
const API = '/api';
const ROOT = document.getElementById('root');

const state = { user: null, view: 'overview', error: null, categories: [] };

async function api(path, opts={}) {
  const r = await fetch(API+path, { method:opts.method||'GET', headers:{'Content-Type':'application/json'}, credentials:'include', body:opts.body?JSON.stringify(opts.body):undefined });
  if (!r.ok) { const e = await r.json().catch(()=>({error:'failed'})); throw new Error(e.error); }
  return r.json();
}
const $$ = c => `$${(c/100).toFixed(2)}`;
const fmtDate = s => new Date(s).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
const esc = (s) => { if (s == null) return ''; return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); };

async function init() {
  try {
    const { user } = await api('/me');
    if (user.role !== 'admin') { state.error='Admin access required'; renderLogin(); return; }
    state.user = user;
    // preload categories for product form
    try { const c = await api('/categories'); state.categories = c.categories; } catch {}
    renderApp();
  } catch { renderLogin(); }
}

function renderLogin() {
  ROOT.innerHTML = `
  <div class="login-wrap">
    <div class="login-card">
      <h2>Munchies Admin</h2>
      <div class="sub">Sign in to manage your store</div>
      <div class="field"><label>Email</label><input id="li-email" type="email" value="admin@munchies.test"/></div>
      <div class="field"><label>Password</label><input id="li-pw" type="password" value="admin123"/></div>
      ${state.error?`<div class="error">${state.error}</div>`:''}
      <button class="btn btn-primary" onclick="adminLogin()">Sign in</button>
      <p style="font-size:11px;color:var(--text-mute);margin-top:14px;text-align:center">Demo: admin@munchies.test / admin123</p>
    </div>
  </div>`;
}
window.adminLogin = async () => {
  state.error = null;
  try {
    const r = await api('/auth/login', { method:'POST', body:{ email:document.getElementById('li-email').value, password:document.getElementById('li-pw').value }});
    if (r.user.role !== 'admin') throw new Error('Admin access required');
    state.user = r.user;
    try { const c = await api('/categories'); state.categories = c.categories; } catch {}
    renderApp();
  } catch (e) { state.error = e.message; renderLogin(); }
};
window.adminLogout = async () => { await api('/auth/logout',{method:'POST'}); state.user=null; renderLogin(); };

function navTo(view) { state.view = view; renderApp(); }
window.navTo = navTo;

function renderApp() {
  ROOT.innerHTML = `
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <div class="lm">🌿</div>
        <div><div class="nm">Munchies</div><div class="sub">Admin</div></div>
      </div>
      <div class="nav-section">Operations</div>
      ${navItem('overview','📊','Overview')}
      ${navItem('orders','📦','Orders')}
      ${navItem('verifications','🪪','Verifications')}
      ${navItem('drivers','🚚','Drivers')}
      <div class="nav-section">Catalog</div>
      ${navItem('products','🌿','Products')}
      ${navItem('inventory','📋','Inventory')}
      <div class="nav-section">Growth</div>
      ${navItem('customers','👥','Customers')}
      ${navItem('promos','🎯','Promos')}
      <div class="user-card">
        <div class="av">${state.user.name.split(' ').map(s=>s[0]).join('').slice(0,2).toUpperCase()}</div>
        <div><div class="nm">${state.user.name}</div><div class="em">${state.user.email}</div></div>
        <span class="lo" onclick="adminLogout()" title="Sign out">↪</span>
      </div>
    </aside>
    <main class="main">
      <div id="view"><div class="spinner"></div></div>
    </main>
  </div>
  <div id="modal-host"></div>`;
  loadView();
}

function navItem(key,em,label) {
  return `<div class="nav-item ${state.view===key?'active':''}" onclick="navTo('${key}')"><span style="font-size:16px">${em}</span>${label}</div>`;
}

async function loadView() {
  const v = document.getElementById('view');
  if (!v) return;
  try {
    if (state.view==='overview') return renderOverview(v);
    if (state.view==='orders') return renderOrders(v);
    if (state.view==='verifications') return renderVerifications(v);
    if (state.view==='drivers') return renderDrivers(v);
    if (state.view==='products') return renderProducts(v);
    if (state.view==='inventory') return renderInventory(v);
    if (state.view==='customers') return renderCustomers(v);
    if (state.view==='promos') return renderPromos(v);
  } catch (e) { v.innerHTML=`<div class="content"><p class="empty">Error: ${e.message}</p></div>`; }
}

// ===== Verifications panel =====
async function renderVerifications(v) {
  const status = state.verifFilter || 'pending';
  const { verifications } = await api('/admin/verifications?status=' + status);
  v.innerHTML = `
    <div class="topbar"><div><h1>ID Verifications</h1><div class="sub">Review and approve customer ID submissions</div></div>
      <select onchange="state.verifFilter=this.value;loadView()" style="background:var(--surface-3);border:1px solid var(--line);color:var(--text);padding:8px 12px;border-radius:8px;font-family:inherit;font-size:13px">
        <option value="pending" ${status==='pending'?'selected':''}>Pending review</option>
        <option value="approved" ${status==='approved'?'selected':''}>Approved</option>
        <option value="rejected" ${status==='rejected'?'selected':''}>Rejected</option>
        <option value="unverified" ${status==='unverified'?'selected':''}>Not yet submitted</option>
      </select>
    </div>
    <div class="content">
      <div class="panel">
        ${verifications.length ? `<table>
          <thead><tr><th>Customer</th><th>Email</th><th>Phone</th><th>Status</th><th>Submitted</th><th>Reviewed</th><th></th></tr></thead>
          <tbody>
            ${verifications.map(v=>`<tr>
              <td><b>${v.name}</b></td>
              <td>${v.email}</td>
              <td>${v.phone||'—'}</td>
              <td><span class="status s-${v.verification_status==='approved'?'delivered':v.verification_status==='rejected'?'cancelled':v.verification_status==='pending'?'placed':'packed'}">${v.verification_status}</span></td>
              <td>${v.verification_submitted_at ? new Date(v.verification_submitted_at).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'}</td>
              <td>${v.verification_reviewed_at ? new Date(v.verification_reviewed_at).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'}</td>
              <td><button class="btn btn-primary btn-sm" onclick="openVerification(${v.id})">Review →</button></td>
            </tr>`).join('')}
          </tbody>
        </table>` : `<p class="empty">No ${status} verifications.</p>`}
      </div>
    </div>`;
}

window.openVerification = async (userId) => {
  const host = document.getElementById('modal-host');
  host.innerHTML = '<div class="modal-overlay"><div class="modal" style="max-height:92vh"><div class="modal-body" style="padding:60px;text-align:center"><div class="spinner"></div></div></div></div>';
  try {
    const { verification: u } = await api('/admin/verifications/' + userId);
    const photoBlock = (label, src) => src
      ? `<div style="background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:10px"><div style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.5px;font-weight:600;margin-bottom:6px">${label}</div><img src="${src}" style="width:100%;max-height:200px;border-radius:6px;object-fit:contain;cursor:zoom-in" onclick="window.open(this.src,'_blank')" /></div>`
      : `<div style="background:var(--surface-2);border:1px dashed var(--line);border-radius:10px;padding:30px;text-align:center;color:var(--text-mute);font-size:12px">${label}<br><i>(not provided)</i></div>`;
    host.innerHTML = `
      <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="modal">
          <div class="modal-head">
            <h2>Review: ${u.name}</h2>
            <button class="modal-close" onclick="closeModal()">×</button>
          </div>
          <div class="modal-body">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
              <div><div style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.5px;font-weight:600">Email</div><div style="font-size:14px;font-weight:600">${u.email}</div></div>
              <div><div style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.5px;font-weight:600">Phone</div><div style="font-size:14px;font-weight:600">${u.phone||'—'}</div></div>
              <div><div style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.5px;font-weight:600">Account created</div><div style="font-size:14px;font-weight:600">${new Date(u.created_at).toLocaleDateString()}</div></div>
              <div><div style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.5px;font-weight:600">Submitted</div><div style="font-size:14px;font-weight:600">${u.verification_submitted_at ? new Date(u.verification_submitted_at).toLocaleString() : '—'}</div></div>
            </div>
            <div style="background:rgba(255,181,71,.06);border:1px solid rgba(255,181,71,.3);border-radius:10px;padding:12px;margin-bottom:18px;font-size:12px;color:var(--text-dim);line-height:1.5">
              <b style="color:var(--warn,#ffb547)">Verify:</b> ID is real (not a photo of a printout), DOB shows 21+, name matches account name, photo on ID matches selfie face.
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:18px">
              ${photoBlock('Front of ID', u.id_front_url)}
              ${photoBlock('Back of ID', u.id_back_url)}
              ${photoBlock('Selfie', u.selfie_url)}
            </div>
            ${u.verification_notes ? `<div style="background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:14px"><div style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.5px;font-weight:600;margin-bottom:4px">Notes</div><div style="font-size:13px">${u.verification_notes}</div></div>` : ''}
            <div class="field full" style="margin-top:14px">
              <label style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.6px;font-weight:600">Reviewer notes (required if rejecting)</label>
              <textarea id="verif-notes" rows="2" placeholder="e.g. Photo too blurry, ID expired, DOB shows under 21..." style="width:100%;background:var(--surface-2);border:1px solid var(--line);color:var(--text);font-family:inherit;font-size:13px;border-radius:8px;padding:10px 12px;outline:none;resize:vertical;margin-top:6px"></textarea>
            </div>
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" onclick="closeModal()">Close</button>
            <button class="btn" style="background:var(--danger);color:#fff;width:auto;padding:10px 20px" onclick="rejectVerif(${u.id})">✗ Reject</button>
            <button class="btn btn-primary" style="width:auto;padding:10px 20px" onclick="approveVerif(${u.id})">✓ Approve</button>
          </div>
        </div>
      </div>`;
  } catch (e) { closeModal(); alert('Failed to load verification: ' + e.message); }
};

window.approveVerif = async (userId) => {
  const notes = document.getElementById('verif-notes')?.value?.trim() || null;
  try {
    await api('/admin/verifications/' + userId + '/approve', { method:'POST', body: { notes }});
    closeModal();
    loadView();
  } catch (e) { alert('Failed: ' + e.message); }
};

window.rejectVerif = async (userId) => {
  const notes = document.getElementById('verif-notes')?.value?.trim();
  if (!notes) { alert('Please add a reason for rejection in the notes field — the customer will see this.'); return; }
  if (!confirm('Reject this verification? The customer will be asked to re-submit.')) return;
  try {
    await api('/admin/verifications/' + userId + '/reject', { method:'POST', body: { notes }});
    closeModal();
    loadView();
  } catch (e) { alert('Failed: ' + e.message); }
};

async function renderOverview(v) {
  const d = await api('/admin/overview');
  const max = Math.max(1, ...d.last7.map(s=>s.revenue_cents));
  v.innerHTML = `
    <div class="topbar"><div><h1>Overview</h1><div class="sub">Real-time business metrics</div></div>
      <button class="btn btn-primary" onclick="navTo('orders')">View orders →</button>
    </div>
    <div class="content">
      <div class="cards">
        <div class="card neon"><div class="lbl">Today's revenue</div><div class="val">${$$(d.today.revenue_cents)}</div><div class="delta">${d.today.orders} orders</div></div>
        <div class="card"><div class="lbl">Total revenue</div><div class="val">${$$(d.totals.revenue_cents)}</div><div class="delta">${d.totals.orders} all-time orders</div></div>
        <div class="card gold"><div class="lbl">Customers</div><div class="val">${d.customers}</div><div class="delta">across all tiers</div></div>
        <div class="card"><div class="lbl">Avg order value</div><div class="val">${d.totals.orders>0?$$(Math.round(d.totals.revenue_cents/d.totals.orders)):'$0.00'}</div><div class="delta">last 30 days</div></div>
      </div>
      <div class="grid-2">
        <div class="panel">
          <div class="panel-title"><span>Revenue · Last 7 days</span></div>
          <div class="chart">
            ${d.last7.length?d.last7.map(s=>`<div class="bar" style="height:${(s.revenue_cents/max)*100}%" data-v="${$$(s.revenue_cents)} · ${s.orders} orders"><div class="lab">${new Date(s.d).toLocaleDateString([],{month:'short',day:'numeric'})}</div></div>`).join(''):'<p class="empty">No orders yet — place a test order from the customer app to see data here.</p>'}
          </div>
        </div>
        <div class="panel">
          <div class="panel-title"><span>Low stock alerts</span><a class="tag" style="cursor:pointer" onclick="navTo('inventory')">Manage →</a></div>
          ${d.low_stock.length?d.low_stock.map(s=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)">
            <span style="font-size:22px">${s.emoji}</span>
            <div style="flex:1"><div style="font-size:13px;font-weight:600">${s.name}</div><div style="font-size:11px;color:var(--text-mute)">${s.size}</div></div>
            <span class="${s.stock<5?'stock-low':'stock-ok'}" style="font-weight:700">${s.stock}</span>
          </div>`).join(''):'<p class="empty" style="padding:20px">All stock levels healthy ✓</p>'}
        </div>
      </div>
      <div class="panel">
        <div class="panel-title"><span>Recent orders</span><a class="tag" style="cursor:pointer" onclick="navTo('orders')">View all →</a></div>
        ${d.recent_orders.length?`<table>
          <thead><tr><th>Order</th><th>Customer</th><th>Type</th><th>Status</th><th>Total</th><th>Time</th></tr></thead>
          <tbody>
            ${d.recent_orders.map(o=>`<tr>
              <td><b>#${o.order_no}</b></td>
              <td>${o.customer_name}</td>
              <td>${o.fulfillment==='delivery'?'🚚 Delivery':'🏪 Pickup'}</td>
              <td><span class="status s-${o.status}">${o.status.replace(/_/g,' ')}</span></td>
              <td><b>${$$(o.total_cents)}</b></td>
              <td>${fmtDate(o.created_at)}</td>
            </tr>`).join('')}
          </tbody>
        </table>`:'<p class="empty">No orders yet.</p>'}
      </div>
    </div>`;
}

async function renderOrders(v) {
  const [{orders},{drivers}] = await Promise.all([api('/admin/orders'),api('/admin/drivers')]);
  state.adminOrders = orders;
  state.adminDrivers = drivers;
  v.innerHTML = `
    <div class="topbar"><div><h1>Orders</h1><div class="sub">${orders.length} orders</div></div>
      <div style="display:flex;gap:8px">
        <input id="orders-search" placeholder="Search order # or customer..." value="${esc(state.ordersSearch||'')}" oninput="state.ordersSearch=this.value;renderOrdersTable()" style="background:var(--surface-3);border:1px solid var(--line);color:var(--text);padding:8px 12px;border-radius:8px;font-family:inherit;font-size:13px;width:240px"/>
        <select onchange="filterOrders(this.value)" style="background:var(--surface-3);border:1px solid var(--line);color:var(--text);padding:8px 12px;border-radius:8px;font-family:inherit;font-size:13px">
          <option value="" ${!state.ordersStatus?'selected':''}>All statuses</option>
          <option value="placed" ${state.ordersStatus==='placed'?'selected':''}>Placed</option>
          <option value="packed" ${state.ordersStatus==='packed'?'selected':''}>Packed</option>
          <option value="out_for_delivery" ${state.ordersStatus==='out_for_delivery'?'selected':''}>Out for delivery</option>
          <option value="delivered" ${state.ordersStatus==='delivered'?'selected':''}>Delivered</option>
          <option value="cancelled" ${state.ordersStatus==='cancelled'?'selected':''}>Cancelled</option>
        </select>
      </div>
    </div>
    <div class="content">
      <div class="panel">
        <div id="orders-table-host"></div>
      </div>
    </div>`;
  renderOrdersTable();
}

window.renderOrdersTable = () => {
  const host = document.getElementById('orders-table-host');
  if (!host) return;
  const orders = state.adminOrders || [];
  const drivers = state.adminDrivers || [];
  const q = (state.ordersSearch || '').toLowerCase().trim();
  const filtered = q ? orders.filter(o => (o.order_no||'').toLowerCase().includes(q) || (o.customer_name||'').toLowerCase().includes(q) || (o.customer_phone||'').toLowerCase().includes(q)) : orders;
  if (filtered.length === 0) { host.innerHTML = '<p class="empty">No orders match this filter.</p>'; return; }
  host.innerHTML = `<table>
    <thead><tr><th>Order</th><th>Customer</th><th>Address</th><th>Type</th><th>Status</th><th>Driver</th><th>Total</th><th>Placed</th><th></th></tr></thead>
    <tbody>
      ${filtered.map(o=>`<tr>
        <td><b>#${esc(o.order_no)}</b></td>
        <td>${esc(o.customer_name)}<div style="font-size:11px;color:var(--text-mute)">${esc(o.customer_phone||'')}</div></td>
        <td style="max-width:200px;font-size:11px;color:var(--text-dim)">${esc(o.address||'—')}</td>
        <td>${o.fulfillment==='delivery'?'🚚':'🏪'} ${esc(o.fulfillment)}</td>
        <td><span class="status s-${esc(o.status)}">${esc(o.status.replace(/_/g,' '))}</span></td>
        <td>${o.driver_name?esc(o.driver_name):'<span style="color:var(--text-mute)">unassigned</span>'}</td>
        <td><b>${$$(o.total_cents)}</b></td>
        <td>${fmtDate(o.created_at)}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-primary btn-sm" onclick="openOrderDetail(${o.id})">View</button>
            <select onchange="confirmStatusChange(${o.id},this.value,'${esc(o.status)}')" style="font-size:11px">
              ${['placed','packed','out_for_delivery','delivered','cancelled'].map(s=>`<option value="${s}" ${o.status===s?'selected':''}>${s.replace(/_/g,' ')}</option>`).join('')}
            </select>
            ${o.fulfillment==='delivery'?`<select onchange="updateOrder(${o.id},{driver_id:this.value?+this.value:null})" style="font-size:11px">
              <option value="">No driver</option>
              ${drivers.map(dr=>`<option value="${dr.id}" ${o.driver_id===dr.id?'selected':''}>${esc(dr.name)}</option>`).join('')}
            </select>`:''}
          </div>
        </td>
      </tr>`).join('')}
    </tbody>
  </table>`;
};

window.confirmStatusChange = (id, newStatus, oldStatus) => {
  if (newStatus === oldStatus) return;
  if (newStatus === 'cancelled' && !confirm('Cancel this order? Inventory will be restored and the customer will be refunded their loyalty points.')) {
    renderOrdersTable(); return;
  }
  updateOrder(id, { status: newStatus });
};

window.openOrderDetail = async (orderId) => {
  const host = document.getElementById('modal-host');
  host.innerHTML = '<div class="modal-overlay"><div class="modal" style="max-height:92vh"><div class="modal-body" style="padding:60px;text-align:center"><div class="spinner"></div></div></div></div>';
  try {
    const { order } = await api('/orders/' + orderId);
    const photoBlock = (label, src) => src
      ? `<div style="background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:10px"><div style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.5px;font-weight:600;margin-bottom:6px">${esc(label)}</div><img src="${esc(src)}" style="width:100%;max-height:240px;border-radius:6px;object-fit:contain;cursor:zoom-in" onclick="window.open(this.src,'_blank')" /></div>`
      : '';
    host.innerHTML = `
      <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="modal">
          <div class="modal-head">
            <h2>Order #${esc(order.order_no)}</h2>
            <button class="modal-close" onclick="closeModal()">×</button>
          </div>
          <div class="modal-body">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
              <div><div style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.5px;font-weight:600">Status</div><div style="font-size:14px;font-weight:600"><span class="status s-${esc(order.status)}">${esc(order.status.replace(/_/g,' '))}</span></div></div>
              <div><div style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.5px;font-weight:600">Type</div><div style="font-size:14px;font-weight:600">${order.fulfillment==='delivery'?'🚚 Delivery':'🏪 Pickup'}</div></div>
              <div><div style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.5px;font-weight:600">Placed</div><div style="font-size:14px;font-weight:600">${new Date(order.created_at).toLocaleString()}</div></div>
              ${order.delivered_at?`<div><div style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.5px;font-weight:600">Delivered</div><div style="font-size:14px;font-weight:600">${new Date(order.delivered_at).toLocaleString()}</div></div>`:''}
            </div>
            <div class="panel" style="margin:0 0 14px 0;padding:12px">
              <div style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.5px;font-weight:600;margin-bottom:6px">Customer</div>
              <div style="font-size:14px;font-weight:600">${esc(order.customer?.name||'')} <span style="color:var(--text-mute);font-weight:400">${esc(order.customer?.email||'')}</span></div>
              <div style="font-size:13px;color:var(--text-dim);margin-top:4px">${esc(order.customer?.phone||'—')} ${order.customer?.dob?` · DOB ${esc(order.customer.dob)} (age ${order.customer.age})`:''}</div>
              ${order.customer?.verification_status?`<div style="margin-top:6px"><span class="status s-${order.customer.verification_status==='approved'?'delivered':order.customer.verification_status==='rejected'?'cancelled':'placed'}">ID ${esc(order.customer.verification_status)}</span></div>`:''}
            </div>
            ${order.address?`<div class="panel" style="margin:0 0 14px 0;padding:12px"><div style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.5px;font-weight:600;margin-bottom:6px">Address</div><div style="font-size:13px">${esc(order.address)}</div></div>`:''}
            ${order.driver?`<div class="panel" style="margin:0 0 14px 0;padding:12px"><div style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.5px;font-weight:600;margin-bottom:6px">Driver</div><div style="font-size:14px;font-weight:600">${esc(order.driver.name)} <span style="color:var(--text-mute);font-weight:400">${esc(order.driver.phone||'')}</span></div></div>`:''}
            ${order.refusal_reason?`<div class="panel" style="margin:0 0 14px 0;padding:12px;background:rgba(255,91,110,.05);border-color:rgba(255,91,110,.3)"><div style="font-size:11px;color:var(--danger);text-transform:uppercase;letter-spacing:.5px;font-weight:700;margin-bottom:6px">Refused at delivery</div><div style="font-size:13px">${esc(order.refusal_reason)}</div></div>`:''}
            ${order.cancel_reason?`<div class="panel" style="margin:0 0 14px 0;padding:12px;background:rgba(255,91,110,.05);border-color:rgba(255,91,110,.3)"><div style="font-size:11px;color:var(--danger);text-transform:uppercase;letter-spacing:.5px;font-weight:700;margin-bottom:6px">Cancelled by ${esc(order.cancelled_by||'')}</div><div style="font-size:13px">${esc(order.cancel_reason)}</div></div>`:''}
            <div style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.5px;font-weight:600;margin:14px 0 6px">Items</div>
            <table style="margin-bottom:14px"><thead><tr><th>Product</th><th>Size</th><th>Qty</th><th>Price</th></tr></thead><tbody>
              ${(order.items||[]).map(it=>`<tr><td>${esc(it.product_name)}</td><td>${esc(it.size)}</td><td>${it.qty}</td><td>${$$(it.price_cents*it.qty)}</td></tr>`).join('')}
            </tbody></table>
            <div class="totals" style="margin-bottom:14px;background:var(--surface-2);padding:14px;border-radius:10px;border:1px solid var(--line)">
              <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px"><span>Subtotal</span><span>${$$(order.subtotal_cents)}</span></div>
              ${order.discount_cents>0?`<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;color:var(--neon)"><span>Discount</span><span>−${$$(order.discount_cents)}</span></div>`:''}
              <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px"><span>Delivery</span><span>${$$(order.delivery_cents)}</span></div>
              <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px"><span>Tax</span><span>${$$(order.tax_cents)}</span></div>
              <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:700;padding-top:6px;border-top:1px solid var(--line)"><span>Total</span><span style="color:var(--neon)">${$$(order.total_cents)}</span></div>
            </div>
            ${(order.delivery_id_photo_url || order.delivery_proof_photo_url) ? `
              <div style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.5px;font-weight:600;margin:14px 0 6px">Delivery photos</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                ${photoBlock('Customer ID at delivery', order.delivery_id_photo_url)}
                ${photoBlock('Delivery proof', order.delivery_proof_photo_url)}
              </div>` : ''}
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" onclick="closeModal()">Close</button>
            ${order.status==='delivered' && order.payment_status!=='refunded' ? `<button class="btn" style="background:var(--warn,#ffb547);color:#0a0a0b;width:auto;padding:10px 20px" onclick="refundOrder(${order.id})">Issue refund</button>` : ''}
          </div>
        </div>
      </div>`;
  } catch (e) { closeModal(); alert('Failed to load order: ' + e.message); }
};

window.refundOrder = async (id) => {
  if (!confirm('Issue a refund for this order? In production this would trigger a Stripe refund automatically.')) return;
  try {
    await api('/admin/orders/' + id + '/refund', { method:'POST' });
    closeModal();
    loadView();
    alert('Refund processed (test mode — no real money moved)');
  } catch (e) { alert('Failed: ' + e.message); }
};

window.filterOrders = async (status) => {
  state.ordersStatus = status;
  const url = status?`/admin/orders?status=${status}`:'/admin/orders';
  try {
    const {orders} = await api(url);
    state.adminOrders = orders;
    renderOrdersTable();
  } catch (e) { alert('Failed: ' + e.message); }
};

window.updateOrder = async (id, body) => {
  try {
    await api('/admin/orders/'+id, { method:'PATCH', body });
    loadView();
  } catch (e) { alert('Failed: ' + e.message); loadView(); }
};

async function renderDrivers(v) {
  const {drivers} = await api('/admin/drivers');
  v.innerHTML = `
    <div class="topbar"><div><h1>Drivers</h1><div class="sub">${drivers.length} active drivers</div></div>
      <button class="btn btn-primary" onclick="openAddUser('driver')">+ Add driver</button>
    </div>
    <div class="content">
      <div class="cards">
        ${drivers.map(d=>`<div class="card">
          <div class="lbl">Driver</div>
          <div class="val" style="font-size:18px">${esc(d.name)}</div>
          <div class="delta" style="color:var(--text-mute)">${esc(d.email)}</div>
          <div class="delta" style="color:var(--text-mute);font-size:11px;margin-top:4px">${esc(d.phone||'no phone')}</div>
          <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center">
            <span class="status ${d.driver_online?'s-out_for_delivery':'s-cancelled'}">● ${d.driver_online?'Online':'Offline'}</span>
            <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="removeUser(${d.id},'${esc(d.name)}')">Remove</button>
          </div>
        </div>`).join('')}
      </div>
      <div class="panel">
        <div class="panel-title">Driver access</div>
        <p style="font-size:13px;color:var(--text-dim);line-height:1.6">Drivers sign in at <b style="color:var(--neon)">${window.location.origin}/driver/</b> using their email and password. Click "+ Add driver" to create a new driver account; share their credentials securely (do not email passwords).</p>
      </div>
    </div>`;
}

window.openAddUser = (defaultRole) => {
  const host = document.getElementById('modal-host');
  host.innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal" style="width:480px">
        <div class="modal-head">
          <h2>Add team member</h2>
          <button class="modal-close" onclick="closeModal()">×</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="field full"><label>Full name *</label><input id="au-name" placeholder="Jane Doe"/></div>
            <div class="field full"><label>Email *</label><input id="au-email" type="email" placeholder="jane@yourbiz.com"/></div>
            <div class="field"><label>Phone</label><input id="au-phone" type="tel" placeholder="+1 (555) 123-4567"/></div>
            <div class="field"><label>Role *</label><select id="au-role">
              <option value="driver" ${defaultRole==='driver'?'selected':''}>Driver</option>
              <option value="admin" ${defaultRole==='admin'?'selected':''}>Admin</option>
            </select></div>
            <div class="field full"><label>Initial password *</label><input id="au-pass" type="text" placeholder="At least 8 characters" value="${Math.random().toString(36).slice(2,10)}A!"/><div style="font-size:11px;color:var(--text-mute);margin-top:4px">They can change this later</div></div>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="saveUser()">Create account</button>
        </div>
      </div>
    </div>`;
};

window.saveUser = async () => {
  const body = {
    name: document.getElementById('au-name').value.trim(),
    email: document.getElementById('au-email').value.trim(),
    phone: document.getElementById('au-phone').value.trim(),
    role: document.getElementById('au-role').value,
    password: document.getElementById('au-pass').value,
  };
  if (!body.name || !body.email || !body.password) { alert('Name, email, and password are required.'); return; }
  try {
    await api('/admin/users', { method:'POST', body });
    alert(`Account created.\n\nEmail: ${body.email}\nPassword: ${body.password}\n\nSave these credentials and share them with ${body.name} securely.`);
    closeModal();
    loadView();
  } catch (e) { alert('Failed: ' + e.message); }
};

window.removeUser = async (id, name) => {
  if (!confirm(`Remove ${name}? Their account will be blocked but order history is preserved.`)) return;
  try { await api('/admin/users/' + id, { method:'DELETE' }); loadView(); }
  catch (e) { alert('Failed: ' + e.message); }
};

async function renderProducts(v) {
  const {products} = await api('/admin/products');
  state.adminProducts = products;
  v.innerHTML = `
    <div class="topbar"><div><h1>Products</h1><div class="sub">${products.length} products in catalog</div></div>
      <button class="btn btn-primary" onclick="openAddProduct()">+ Add product</button>
    </div>
    <div class="content">
      <div class="panel">
        <table>
          <thead><tr><th></th><th>Product</th><th>Category</th><th>Type</th><th>THC/CBD</th><th>Variants</th><th>Total stock</th><th></th></tr></thead>
          <tbody>
            ${products.length?products.map(p=>{
              const totalStock = p.variants.reduce((s,v)=>s+v.stock,0);
              return `<tr>
                <td>${p.image_url ? `<img class="product-thumb" src="${esc(p.image_url)}" alt=""/>` : `<span style="font-size:32px">${esc(p.emoji)}</span>`}</td>
                <td><b>${esc(p.name)}</b><div style="font-size:11px;color:var(--text-mute)">${esc(p.sub||'')}</div></td>
                <td><span class="tag">${esc(p.category_name)}</span></td>
                <td>${esc(p.type)}</td>
                <td>${esc(p.thc||'—')} / ${esc(p.cbd||'—')}</td>
                <td>${p.variants.map(va=>`<span class="tag" style="margin-right:4px">${esc(va.size)} · ${$$(va.price_cents)}</span>`).join('')}</td>
                <td><span class="${totalStock<10?'stock-low':'stock-ok'}"><b>${totalStock}</b></span></td>
                <td>
                  <div class="row-actions">
                    <button class="btn btn-primary btn-sm" onclick="openEditProduct(${p.id})">Edit</button>
                    <button class="btn btn-ghost btn-sm" onclick="navTo('inventory')">Stock</button>
                    <button class="btn btn-ghost btn-sm" style="color:var(--danger);border-color:rgba(255,91,110,.3)" data-id="${p.id}" data-name="${esc(p.name)}" onclick="deleteProduct(this.dataset.id, this.dataset.name)">Delete</button>
                  </div>
                </td>
              </tr>`;
            }).join(''):'<tr><td colspan="8"><p class="empty">No products yet. Click <b>+ Add product</b> to add your first one.</p></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

window.openEditProduct = (productId) => {
  const p = (state.adminProducts || []).find(x => x.id === productId);
  if (!p) return;
  // Reuse the add product modal but pre-fill with this product
  state.editingProductId = productId;
  openAddProduct();
  // Fill values after the modal renders
  setTimeout(() => {
    document.getElementById('np-name').value = p.name || '';
    document.getElementById('np-sub').value = p.sub || '';
    document.getElementById('np-cat').value = p.category_id || '';
    document.getElementById('np-type').value = p.type || 'Hybrid';
    document.getElementById('np-thc').value = p.thc || '';
    document.getElementById('np-cbd').value = p.cbd || '';
    document.getElementById('np-emoji').value = p.emoji || '🌿';
    document.getElementById('np-tag').value = p.tag || '';
    document.getElementById('np-desc').value = p.description || '';
    if (p.image_url) {
      document.getElementById('np-image-data').value = p.image_url;
      const img = document.getElementById('img-preview-img');
      img.src = p.image_url;
      document.getElementById('img-preview').style.display = 'block';
    }
    document.querySelector('.modal-head h2').textContent = 'Edit product';
  }, 50);
};

window.openAddProduct = () => {
  const cats = state.categories;
  const host = document.getElementById('modal-host');
  host.innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal">
        <div class="modal-head">
          <h2>Add new product</h2>
          <button class="modal-close" onclick="closeModal()">×</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="field full">
              <label>Product name *</label>
              <input id="np-name" placeholder="e.g. Gelato 41" />
            </div>
            <div class="field full">
              <label>Subtitle</label>
              <input id="np-sub" placeholder="e.g. THCA Flower • Hybrid" />
            </div>
            <div class="field">
              <label>Category *</label>
              <select id="np-cat">
                ${cats.map(c=>`<option value="${c.id}">${c.emoji} ${c.name}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label>Strain type</label>
              <select id="np-type">
                <option value="Hybrid">Hybrid</option>
                <option value="Indica">Indica</option>
                <option value="Sativa">Sativa</option>
                <option value="CBD">CBD</option>
                <option value="CBN">CBN</option>
              </select>
            </div>
            <div class="field">
              <label>THC content</label>
              <input id="np-thc" placeholder="e.g. 28.4% or 25mg" />
            </div>
            <div class="field">
              <label>CBD content</label>
              <input id="np-cbd" placeholder="e.g. <1% or 1000mg" />
            </div>
            <div class="field">
              <label>Emoji</label>
              <input id="np-emoji" placeholder="🌿" maxlength="4" value="🌿" />
            </div>
            <div class="field">
              <label>Tag (optional)</label>
              <input id="np-tag" placeholder="New / Hot / Bestseller" />
            </div>
            <div class="field full">
              <label>Description</label>
              <textarea id="np-desc" rows="3" placeholder="Brief product description shown on the product page..."></textarea>
            </div>
          </div>

          <div class="image-section">
            <div class="variants-head">
              <h3>Product photo</h3>
              <span style="font-size:11px;color:var(--text-mute)">Optional — falls back to emoji if blank</span>
            </div>
            <div class="image-tabs">
              <button class="image-tab active" id="img-tab-upload" onclick="switchImageTab('upload')">📁 Upload from device</button>
              <button class="image-tab" id="img-tab-url" onclick="switchImageTab('url')">🔗 Paste image URL</button>
            </div>
            <div id="img-upload-pane">
              <input id="np-image-file" type="file" accept="image/*" onchange="handleImageUpload(event)" style="display:none" />
              <button type="button" class="img-upload-btn" onclick="document.getElementById('np-image-file').click()">
                <span style="font-size:32px">📷</span>
                <span style="font-size:13px;font-weight:600">Choose photo from your device</span>
                <span style="font-size:11px;color:var(--text-mute)">Auto-resized to max 1200px • JPEG • Under 200KB</span>
              </button>
            </div>
            <div id="img-url-pane" style="display:none">
              <input id="np-image-url" type="url" placeholder="https://example.com/photo.jpg" oninput="previewUrlImage()" />
              <p class="img-help">Paste a direct link to an image (Imgur, your website, ImgBB, etc.)</p>
            </div>
            <input type="hidden" id="np-image-data" />
            <div id="img-preview" style="display:none">
              <img id="img-preview-img" />
              <button type="button" class="img-remove" onclick="clearImage()">× Remove image</button>
            </div>
          </div>

          <div class="variants-section">
            <div class="variants-head">
              <h3>Sizes & pricing</h3>
              <button class="btn btn-ghost btn-sm" onclick="addVariantRow()">+ Add size</button>
            </div>
            <div id="variants-list">
              <div class="variant-row">
                <input class="v-size" placeholder="Size (e.g. 3.5g)" />
                <input class="v-price" type="number" step="0.01" placeholder="Price ($)" />
                <input class="v-stock" type="number" placeholder="Stock" value="50" />
                <button class="v-remove" onclick="this.parentElement.remove()">×</button>
              </div>
            </div>
          </div>

          ${state.formError?`<div class="error">${state.formError}</div>`:''}
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="saveProduct()">Save product</button>
        </div>
      </div>
    </div>`;
};

window.addVariantRow = () => {
  const list = document.getElementById('variants-list');
  const row = document.createElement('div');
  row.className = 'variant-row';
  row.innerHTML = `
    <input class="v-size" placeholder="Size (e.g. 7g)" />
    <input class="v-price" type="number" step="0.01" placeholder="Price ($)" />
    <input class="v-stock" type="number" placeholder="Stock" value="50" />
    <button class="v-remove" onclick="this.parentElement.remove()">×</button>`;
  list.appendChild(row);
};

// ===== Image upload (with client-side resize so we don't upload huge files) =====
window.switchImageTab = (tab) => {
  document.getElementById('img-tab-upload').classList.toggle('active', tab === 'upload');
  document.getElementById('img-tab-url').classList.toggle('active', tab === 'url');
  document.getElementById('img-upload-pane').style.display = tab === 'upload' ? 'block' : 'none';
  document.getElementById('img-url-pane').style.display = tab === 'url' ? 'block' : 'none';
};

window.handleImageUpload = (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { alert('Please choose an image file (jpg, png, webp).'); return; }
  if (file.size > 10 * 1024 * 1024) { alert('Image too large. Please choose one under 10MB.'); return; }
  const reader = new FileReader();
  reader.onload = (e) => resizeImage(e.target.result, 1200, 0.85, (resized) => {
    document.getElementById('np-image-data').value = resized;
    showPreview(resized);
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
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    callback(canvas.toDataURL('image/jpeg', quality));
  };
  img.src = dataUrl;
}

window.previewUrlImage = () => {
  const url = document.getElementById('np-image-url').value.trim();
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    document.getElementById('np-image-data').value = url;
    showPreview(url);
  } else if (!url) {
    clearImage();
  }
};

function showPreview(src) {
  const preview = document.getElementById('img-preview');
  const img = document.getElementById('img-preview-img');
  img.src = src;
  preview.style.display = 'block';
}

window.clearImage = () => {
  document.getElementById('np-image-data').value = '';
  const fileInput = document.getElementById('np-image-file');
  if (fileInput) fileInput.value = '';
  const urlInput = document.getElementById('np-image-url');
  if (urlInput) urlInput.value = '';
  document.getElementById('img-preview').style.display = 'none';
};

window.saveProduct = async () => {
  state.formError = null;
  const name = document.getElementById('np-name').value.trim();
  if (!name) { state.formError = 'Product name is required'; renderApp(); openAddProduct(); return; }
  const variants = [];
  document.querySelectorAll('.variant-row').forEach(r => {
    const size = r.querySelector('.v-size').value.trim();
    const price = parseFloat(r.querySelector('.v-price').value);
    const stock = parseInt(r.querySelector('.v-stock').value, 10);
    if (size && price > 0) variants.push({ size, price_cents: Math.round(price*100), stock: stock || 0 });
  });
  if (variants.length === 0) { alert('Add at least one size with a price.'); return; }
  const body = {
    name,
    sub: document.getElementById('np-sub').value.trim(),
    emoji: document.getElementById('np-emoji').value.trim() || '🌿',
    image_url: document.getElementById('np-image-data').value || null,
    category_id: document.getElementById('np-cat').value,
    type: document.getElementById('np-type').value,
    thc: document.getElementById('np-thc').value.trim(),
    cbd: document.getElementById('np-cbd').value.trim(),
    description: document.getElementById('np-desc').value.trim(),
    tag: document.getElementById('np-tag').value.trim(),
    variants
  };
  try {
    const saveBtn = document.querySelector('.modal-foot .btn-primary');
    if (saveBtn) { saveBtn.textContent = 'Saving…'; saveBtn.disabled = true; }
    if (state.editingProductId) {
      // Edit existing — only update product fields (not variants — those have their own endpoint)
      const { variants: _v, ...rest } = body;
      await api('/admin/products/' + state.editingProductId, { method:'PATCH', body: rest });
      state.editingProductId = null;
    } else {
      await api('/admin/products', { method:'POST', body });
    }
    closeModal();
    loadView();
  } catch (e) { alert('Failed to save: ' + e.message); }
};

window.deleteProduct = async (id, name) => {
  if (!confirm(`Delete "${name}"? This will hide it from the customer app. Existing orders are preserved.`)) return;
  try {
    await api('/admin/products/' + id, { method:'DELETE' });
    loadView();
  } catch (e) { alert('Failed to delete: ' + e.message); }
};

window.closeModal = () => { document.getElementById('modal-host').innerHTML = ''; };

async function renderInventory(v) {
  const {products} = await api('/admin/products');
  v.innerHTML = `
    <div class="topbar"><div><h1>Inventory</h1><div class="sub">Adjust stock & pricing per variant</div></div></div>
    <div class="content">
      <div class="panel">
        <table>
          <thead><tr><th>Product</th><th>Size</th><th>Price</th><th>Stock</th><th></th></tr></thead>
          <tbody>
            ${products.length?products.flatMap(p=>p.variants.map(v=>`<tr data-vid="${v.id}">
              <td><span style="font-size:22px;margin-right:8px">${p.emoji}</span><b>${p.name}</b></td>
              <td>${v.size}</td>
              <td><input type="number" step="0.01" value="${(v.price_cents/100).toFixed(2)}" onchange="updateVariant(${v.id},{price_cents:Math.round(this.value*100)})" style="width:90px"/></td>
              <td><input type="number" value="${v.stock}" onchange="updateVariant(${v.id},{stock:+this.value})" style="width:80px"/> ${v.stock<10?'<span class="status s-cancelled" style="margin-left:8px">LOW</span>':''}</td>
              <td><button class="btn btn-ghost btn-sm" onclick="bumpStock(${v.id},${v.stock})">+50 stock</button></td>
            </tr>`)).join(''):'<tr><td colspan="5"><p class="empty">No products yet. Add your first product in the Products tab.</p></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}
window.updateVariant = async (id, body) => {
  await api('/admin/variants/'+id, { method:'PATCH', body });
};
window.bumpStock = async (id, current) => {
  await api('/admin/variants/'+id, { method:'PATCH', body:{stock: current+50} });
  loadView();
};

async function renderCustomers(v) {
  const search = state.customerSearch || '';
  const url = search ? `/admin/customers?search=${encodeURIComponent(search)}` : '/admin/customers';
  const {customers} = await api(url);
  v.innerHTML = `
    <div class="topbar"><div><h1>Customers</h1><div class="sub">${customers.length} customers · sorted by lifetime value</div></div>
      <input id="cust-search" placeholder="Search by name, email, phone..." value="${esc(search)}" oninput="state.customerSearch=this.value;clearTimeout(window._cs);window._cs=setTimeout(loadView,250)" style="background:var(--surface-3);border:1px solid var(--line);color:var(--text);padding:8px 12px;border-radius:8px;font-family:inherit;font-size:13px;width:280px"/>
    </div>
    <div class="content">
      <div class="panel">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Tier</th><th>ID Status</th><th>Points</th><th>Orders</th><th>LTV</th><th></th></tr></thead>
          <tbody>
            ${customers.length?customers.map(c=>`<tr style="${c.is_blocked?'opacity:0.5':''}">
              <td><b>${esc(c.name)}</b>${c.is_blocked?' <span class="status s-cancelled" style="margin-left:6px">BLOCKED</span>':''}</td>
              <td>${esc(c.email)}</td>
              <td>${esc(c.phone||'—')}</td>
              <td><span class="tag" style="background:${c.loyalty_tier==='Platinum'?'rgba(212,175,55,.2)':c.loyalty_tier==='Gold'?'rgba(212,175,55,.15)':'var(--surface-3)'};color:${c.loyalty_tier==='Gold'||c.loyalty_tier==='Platinum'?'var(--gold)':'var(--text-dim)'}">${esc(c.loyalty_tier)}</span></td>
              <td><span class="status s-${c.verification_status==='approved'?'delivered':c.verification_status==='rejected'?'cancelled':c.verification_status==='pending'?'placed':'packed'}">${esc(c.verification_status||'unverified')}</span></td>
              <td><b>${c.loyalty_points}</b></td>
              <td>${c.order_count}</td>
              <td><b style="color:var(--neon)">${$$(c.ltv_cents)}</b></td>
              <td><button class="btn btn-primary btn-sm" onclick="openCustomerDetail(${c.id})">View</button></td>
            </tr>`).join(''):'<tr><td colspan="9"><p class="empty">No customers match your search.</p></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

window.openCustomerDetail = async (id) => {
  const host = document.getElementById('modal-host');
  host.innerHTML = '<div class="modal-overlay"><div class="modal" style="max-height:92vh"><div class="modal-body" style="padding:60px;text-align:center"><div class="spinner"></div></div></div></div>';
  try {
    const { customer: c, orders } = await api('/admin/customers/' + id);
    host.innerHTML = `
      <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
        <div class="modal">
          <div class="modal-head">
            <h2>${esc(c.name)}</h2>
            <button class="modal-close" onclick="closeModal()">×</button>
          </div>
          <div class="modal-body">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
              <div><div style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.5px;font-weight:600">Email</div><div style="font-size:14px;font-weight:600">${esc(c.email)}</div></div>
              <div><div style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.5px;font-weight:600">Phone</div><div style="font-size:14px;font-weight:600">${esc(c.phone||'—')}</div></div>
              <div><div style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.5px;font-weight:600">DOB / Age</div><div style="font-size:14px;font-weight:600">${esc(c.dob||'—')} ${c.age?`(${c.age})`:''}</div></div>
              <div><div style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.5px;font-weight:600">Joined</div><div style="font-size:14px;font-weight:600">${new Date(c.created_at).toLocaleDateString()}</div></div>
              <div><div style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.5px;font-weight:600">Tier · Points</div><div style="font-size:14px;font-weight:600">${esc(c.loyalty_tier)} · ${c.loyalty_points}</div></div>
              <div><div style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.5px;font-weight:600">ID Verification</div><div style="font-size:14px;font-weight:600"><span class="status s-${c.verification_status==='approved'?'delivered':c.verification_status==='rejected'?'cancelled':'placed'}">${esc(c.verification_status||'unverified')}</span></div></div>
            </div>
            ${c.default_address?`<div class="panel" style="margin:0 0 14px 0;padding:12px"><div style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.5px;font-weight:600;margin-bottom:6px">Default address</div><div style="font-size:13px">${esc(c.default_address)}</div></div>`:''}
            <div style="font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.5px;font-weight:600;margin:14px 0 6px">Order history (${orders.length})</div>
            ${orders.length?`<table><thead><tr><th>Order</th><th>Status</th><th>Type</th><th>Total</th><th>Date</th></tr></thead><tbody>
              ${orders.map(o=>`<tr style="cursor:pointer" onclick="closeModal();openOrderDetail(${o.id})"><td><b>#${esc(o.order_no)}</b></td><td><span class="status s-${esc(o.status)}">${esc(o.status.replace(/_/g,' '))}</span></td><td>${esc(o.fulfillment)}</td><td><b>${$$(o.total_cents)}</b></td><td>${fmtDate(o.created_at)}</td></tr>`).join('')}
            </tbody></table>`:'<p class="empty">No orders yet.</p>'}
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" onclick="closeModal()">Close</button>
            <button class="btn btn-ghost" style="color:${c.is_blocked?'var(--neon)':'var(--danger)'};border-color:${c.is_blocked?'var(--neon)':'var(--danger)'};width:auto;padding:10px 20px" onclick="toggleBlock(${c.id},${c.is_blocked?0:1})">${c.is_blocked?'Unblock customer':'Block customer'}</button>
          </div>
        </div>
      </div>`;
  } catch (e) { closeModal(); alert('Failed: ' + e.message); }
};

window.toggleBlock = async (id, blocked) => {
  const action = blocked ? 'block' : 'unblock';
  if (!confirm(`Are you sure you want to ${action} this customer?`)) return;
  try {
    await api('/admin/customers/' + id, { method:'PATCH', body: { is_blocked: blocked }});
    closeModal();
    loadView();
  } catch (e) { alert('Failed: ' + e.message); }
};

async function renderPromos(v) {
  const { promos } = await api('/admin/promos');
  v.innerHTML = `
    <div class="topbar"><div><h1>Promo codes</h1><div class="sub">${promos.length} promo codes</div></div>
      <button class="btn btn-primary" onclick="openAddPromo()">+ Add promo code</button>
    </div>
    <div class="content">
      <div class="panel">
        ${promos.length?`<table>
          <thead><tr><th>Code</th><th>Discount</th><th>Uses</th><th>Limit</th><th>Expires</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${promos.map(p=>`<tr>
              <td><code style="background:var(--surface-3);padding:3px 8px;border-radius:4px;font-family:monospace;font-weight:700">${esc(p.code)}</code></td>
              <td><b>${p.percent_off}% off</b></td>
              <td>${p.uses_count||0}</td>
              <td>${p.max_uses||'unlimited'}</td>
              <td>${p.expires_at?new Date(p.expires_at).toLocaleDateString():'—'}</td>
              <td><span class="status s-${p.active?'delivered':'cancelled'}">${p.active?'active':'inactive'}</span></td>
              <td>
                <div class="row-actions">
                  <button class="btn btn-ghost btn-sm" onclick="togglePromo('${esc(p.code)}',${p.active?0:1})">${p.active?'Disable':'Enable'}</button>
                  <button class="btn btn-ghost btn-sm" style="color:var(--danger);border-color:rgba(255,91,110,.3)" onclick="deletePromo('${esc(p.code)}')">Delete</button>
                </div>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>`:'<p class="empty">No promo codes yet. Click + Add promo code to create one.</p>'}
      </div>
    </div>`;
}

window.openAddPromo = () => {
  const host = document.getElementById('modal-host');
  host.innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal" style="width:480px">
        <div class="modal-head">
          <h2>New promo code</h2>
          <button class="modal-close" onclick="closeModal()">×</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="field full"><label>Code *</label><input id="pr-code" placeholder="e.g. SUMMER20" maxlength="20" oninput="this.value=this.value.toUpperCase().replace(/[^A-Z0-9_-]/g,'')"/></div>
            <div class="field"><label>Percent off *</label><input id="pr-percent" type="number" min="1" max="100" placeholder="20"/></div>
            <div class="field"><label>Max uses (optional)</label><input id="pr-max" type="number" min="1" placeholder="unlimited"/></div>
            <div class="field full"><label>Expires (optional)</label><input id="pr-expires" type="date"/></div>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="savePromo()">Save promo</button>
        </div>
      </div>
    </div>`;
};
window.savePromo = async () => {
  const code = document.getElementById('pr-code').value.trim();
  const percent_off = parseInt(document.getElementById('pr-percent').value, 10);
  const max_uses = document.getElementById('pr-max').value ? parseInt(document.getElementById('pr-max').value, 10) : null;
  const expires_at = document.getElementById('pr-expires').value || null;
  if (!code || !percent_off) { alert('Code and percent off are required.'); return; }
  try {
    await api('/admin/promos', { method:'POST', body: { code, percent_off, max_uses, expires_at, active: 1 }});
    closeModal();
    loadView();
  } catch (e) { alert('Failed: ' + e.message); }
};
window.togglePromo = async (code, active) => {
  try { await api('/admin/promos/' + code, { method:'PATCH', body: { active }}); loadView(); }
  catch (e) { alert('Failed: ' + e.message); }
};
window.deletePromo = async (code) => {
  if (!confirm(`Delete promo code "${code}"?`)) return;
  try { await api('/admin/promos/' + code, { method:'DELETE' }); loadView(); }
  catch (e) { alert('Failed: ' + e.message); }
};

// inject modal styles once
(function injectModalCSS(){
  const s = document.createElement('style');
  s.textContent = `
    .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(8px);display:grid;place-items:center;z-index:1000;animation:fadeIn .2s ease}
    @keyframes fadeIn{from{opacity:0}to{opacity:1}}
    .modal{background:var(--surface);border:1px solid var(--line);border-radius:20px;width:min(640px,92vw);max-height:88vh;display:flex;flex-direction:column;box-shadow:0 30px 80px rgba(0,0,0,.6)}
    .modal-head{padding:22px 24px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between}
    .modal-head h2{font-size:20px}
    .modal-close{background:var(--surface-3);border:1px solid var(--line);color:var(--text);width:32px;height:32px;border-radius:8px;font-size:20px;cursor:pointer;line-height:1}
    .modal-body{padding:18px 24px;overflow-y:auto;flex:1}
    .modal-foot{padding:16px 24px;border-top:1px solid var(--line);display:flex;justify-content:flex-end;gap:10px}
    .modal-foot .btn{width:auto;padding:10px 20px}
    .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px}
    .form-grid .field{display:flex;flex-direction:column;gap:6px}
    .form-grid .field.full{grid-column:1/-1}
    .form-grid label{font-size:11px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.6px;font-weight:600}
    .form-grid input,.form-grid select,.form-grid textarea{background:var(--surface-2);border:1px solid var(--line);color:var(--text);font-family:inherit;font-size:13px;border-radius:8px;padding:10px 12px;outline:none;width:100%}
    .form-grid textarea{resize:vertical;font-family:inherit}
    .form-grid input:focus,.form-grid select:focus,.form-grid textarea:focus{border-color:var(--neon)}
    .variants-section{margin-top:8px;padding-top:18px;border-top:1px solid var(--line)}
    .variants-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
    .variants-head h3{font-size:13px;text-transform:uppercase;letter-spacing:.6px;color:var(--text-dim);font-weight:600}
    .variants-head .btn{width:auto;padding:6px 12px;font-size:12px}
    .variant-row{display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:8px;margin-bottom:8px;align-items:center}
    .variant-row input{background:var(--surface-2);border:1px solid var(--line);color:var(--text);font-family:inherit;font-size:13px;border-radius:8px;padding:10px 12px;outline:none}
    .v-remove{background:var(--surface-3);border:1px solid var(--line);color:var(--danger);width:36px;height:36px;border-radius:8px;font-size:18px;cursor:pointer;line-height:1}
    .v-remove:hover{background:rgba(255,91,110,.1);border-color:var(--danger)}
    .image-section{margin-top:8px;padding-top:18px;border-top:1px solid var(--line)}
    .image-tabs{display:flex;gap:6px;background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:4px;margin-bottom:12px}
    .image-tab{flex:1;background:none;border:none;color:var(--text-dim);font-family:inherit;font-size:12px;font-weight:600;padding:10px;border-radius:7px;cursor:pointer;transition:all .15s}
    .image-tab.active{background:var(--surface-3);color:var(--neon)}
    .img-upload-btn{width:100%;background:var(--surface-2);border:2px dashed var(--line);border-radius:12px;padding:24px 16px;display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;color:var(--text);transition:border-color .15s}
    .img-upload-btn:hover{border-color:var(--neon);background:rgba(198,255,61,.04)}
    #img-url-pane input{width:100%;background:var(--surface-2);border:1px solid var(--line);color:var(--text);font-family:inherit;font-size:13px;border-radius:8px;padding:12px;outline:none}
    #img-url-pane input:focus{border-color:var(--neon)}
    .img-help{font-size:11px;color:var(--text-mute);margin-top:6px;line-height:1.4}
    #img-preview{margin-top:14px;background:var(--surface-2);border:1px solid var(--line);border-radius:12px;padding:14px;display:flex;flex-direction:column;align-items:center;gap:10px}
    #img-preview img{max-width:100%;max-height:200px;border-radius:8px;object-fit:contain}
    .img-remove{background:var(--surface-3);border:1px solid var(--line);color:var(--danger);font-family:inherit;font-size:12px;font-weight:600;padding:6px 12px;border-radius:8px;cursor:pointer}
    .img-remove:hover{background:rgba(255,91,110,.1);border-color:var(--danger)}
    .product-thumb{width:48px;height:48px;border-radius:8px;object-fit:cover;background:var(--surface-3)}
  `;
  document.head.appendChild(s);
})();

init();
