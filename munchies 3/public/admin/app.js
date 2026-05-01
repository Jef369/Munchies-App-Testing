// Munchies Admin dashboard
const API = '/api';
const ROOT = document.getElementById('root');

const state = { user: null, view: 'overview', error: null };

async function api(path, opts={}) {
  const r = await fetch(API+path, { method:opts.method||'GET', headers:{'Content-Type':'application/json'}, credentials:'include', body:opts.body?JSON.stringify(opts.body):undefined });
  if (!r.ok) { const e = await r.json().catch(()=>({error:'failed'})); throw new Error(e.error); }
  return r.json();
}
const $$ = c => `$${(c/100).toFixed(2)}`;
const fmtDate = s => new Date(s).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});

async function init() {
  try {
    const { user } = await api('/me');
    if (user.role !== 'admin') { state.error='Admin access required'; renderLogin(); return; }
    state.user = user;
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
  </div>`;
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
    if (state.view==='drivers') return renderDrivers(v);
    if (state.view==='products') return renderProducts(v);
    if (state.view==='inventory') return renderInventory(v);
    if (state.view==='customers') return renderCustomers(v);
    if (state.view==='promos') return renderPromos(v);
  } catch (e) { v.innerHTML=`<div class="content"><p class="empty">Error: ${e.message}</p></div>`; }
}

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
  v.innerHTML = `
    <div class="topbar"><div><h1>Orders</h1><div class="sub">${orders.length} orders</div></div>
      <select onchange="filterOrders(this.value)">
        <option value="">All statuses</option>
        <option value="placed">Placed</option>
        <option value="packed">Packed</option>
        <option value="out_for_delivery">Out for delivery</option>
        <option value="delivered">Delivered</option>
      </select>
    </div>
    <div class="content">
      <div class="panel">
        ${orders.length?`<table>
          <thead><tr><th>Order</th><th>Customer</th><th>Type</th><th>Status</th><th>Driver</th><th>Total</th><th>Placed</th><th></th></tr></thead>
          <tbody id="orders-tbody">
            ${orders.map(o=>`<tr>
              <td><b>#${o.order_no}</b></td>
              <td>${o.customer_name}<div style="font-size:11px;color:var(--text-mute)">${o.customer_phone||''}</div></td>
              <td>${o.fulfillment==='delivery'?'🚚':'🏪'} ${o.fulfillment}</td>
              <td><span class="status s-${o.status}">${o.status.replace(/_/g,' ')}</span></td>
              <td>${o.driver_name||'<span style="color:var(--text-mute)">unassigned</span>'}</td>
              <td><b>${$$(o.total_cents)}</b></td>
              <td>${fmtDate(o.created_at)}</td>
              <td>
                <div class="row-actions">
                  <select onchange="updateOrder(${o.id},{status:this.value})" style="font-size:11px">
                    ${['placed','packed','out_for_delivery','delivered','cancelled'].map(s=>`<option value="${s}" ${o.status===s?'selected':''}>${s.replace(/_/g,' ')}</option>`).join('')}
                  </select>
                  ${o.fulfillment==='delivery'?`<select onchange="updateOrder(${o.id},{driver_id:this.value?+this.value:null})" style="font-size:11px">
                    <option value="">No driver</option>
                    ${drivers.map(dr=>`<option value="${dr.id}" ${o.driver_id===dr.id?'selected':''}>${dr.name}</option>`).join('')}
                  </select>`:''}
                </div>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>`:'<p class="empty">No orders match this filter.</p>'}
      </div>
    </div>`;
}
window.filterOrders = async (status) => {
  const url = status?`/admin/orders?status=${status}`:'/admin/orders';
  const {orders} = await api(url);
  const [{drivers}] = [await api('/admin/drivers')];
  document.getElementById('orders-tbody').innerHTML = orders.length?orders.map(o=>`<tr>
    <td><b>#${o.order_no}</b></td><td>${o.customer_name}</td>
    <td>${o.fulfillment==='delivery'?'🚚':'🏪'} ${o.fulfillment}</td>
    <td><span class="status s-${o.status}">${o.status.replace(/_/g,' ')}</span></td>
    <td>${o.driver_name||'unassigned'}</td><td><b>${$$(o.total_cents)}</b></td><td>${fmtDate(o.created_at)}</td><td></td>
  </tr>`).join(''):'<tr><td colspan="8"><p class="empty">No orders.</p></td></tr>';
};
window.updateOrder = async (id, body) => {
  await api('/admin/orders/'+id, { method:'PATCH', body });
  loadView();
};

async function renderDrivers(v) {
  const {drivers} = await api('/admin/drivers');
  v.innerHTML = `
    <div class="topbar"><div><h1>Drivers</h1><div class="sub">${drivers.length} active drivers</div></div></div>
    <div class="content">
      <div class="cards">
        ${drivers.map(d=>`<div class="card"><div class="lbl">Driver</div><div class="val" style="font-size:18px">${d.name}</div><div class="delta" style="color:var(--text-mute)">${d.email}</div><div style="margin-top:10px"><span class="status s-out_for_delivery">● Available</span></div></div>`).join('')}
        <div class="card" style="border-style:dashed;display:grid;place-items:center;cursor:pointer" onclick="alert('Go to /driver to test driver login. Add new drivers via SQL or extend the API with POST /api/admin/drivers')">
          <div style="text-align:center"><div style="font-size:32px;margin-bottom:8px">+</div><div style="font-size:13px;color:var(--text-dim)">Add driver</div></div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-title">Driver login info</div>
        <p style="font-size:13px;color:var(--text-dim);line-height:1.6">Drivers sign in at <b style="color:var(--neon)">/driver/</b> using their email and password. Demo driver: <code style="background:var(--surface-3);padding:2px 6px;border-radius:4px">driver@munchies.test / driver123</code></p>
      </div>
    </div>`;
}

async function renderProducts(v) {
  const {products} = await api('/admin/products');
  v.innerHTML = `
    <div class="topbar"><div><h1>Products</h1><div class="sub">${products.length} products in catalog</div></div>
      <button class="btn btn-primary" onclick="alert('Add product UI: extend with a modal form posting to POST /api/admin/products')">+ Add product</button>
    </div>
    <div class="content">
      <div class="panel">
        <table>
          <thead><tr><th></th><th>Product</th><th>Category</th><th>Type</th><th>THC/CBD</th><th>Variants</th><th>Total stock</th><th></th></tr></thead>
          <tbody>
            ${products.map(p=>{
              const totalStock = p.variants.reduce((s,v)=>s+v.stock,0);
              return `<tr>
                <td style="font-size:32px">${p.emoji}</td>
                <td><b>${p.name}</b><div style="font-size:11px;color:var(--text-mute)">${p.sub||''}</div></td>
                <td><span class="tag">${p.category_name}</span></td>
                <td>${p.type}</td>
                <td>${p.thc||'—'} / ${p.cbd||'—'}</td>
                <td>${p.variants.map(va=>`<span class="tag" style="margin-right:4px">${va.size} · ${$$(va.price_cents)}</span>`).join('')}</td>
                <td><span class="${totalStock<10?'stock-low':'stock-ok'}"><b>${totalStock}</b></span></td>
                <td><button class="btn btn-ghost btn-sm" onclick="navTo('inventory')">Manage</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

async function renderInventory(v) {
  const {products} = await api('/admin/products');
  v.innerHTML = `
    <div class="topbar"><div><h1>Inventory</h1><div class="sub">Adjust stock & pricing per variant</div></div></div>
    <div class="content">
      <div class="panel">
        <table>
          <thead><tr><th>Product</th><th>Size</th><th>Price</th><th>Stock</th><th></th></tr></thead>
          <tbody>
            ${products.flatMap(p=>p.variants.map(v=>`<tr data-vid="${v.id}">
              <td><span style="font-size:22px;margin-right:8px">${p.emoji}</span><b>${p.name}</b></td>
              <td>${v.size}</td>
              <td><input type="number" step="0.01" value="${(v.price_cents/100).toFixed(2)}" onchange="updateVariant(${v.id},{price_cents:Math.round(this.value*100)})" style="width:90px"/></td>
              <td><input type="number" value="${v.stock}" onchange="updateVariant(${v.id},{stock:+this.value})" style="width:80px"/> ${v.stock<10?'<span class="status s-cancelled" style="margin-left:8px">LOW</span>':''}</td>
              <td><button class="btn btn-ghost btn-sm" onclick="updateVariant(${v.id},{stock:${v.stock}+50})">+50 stock</button></td>
            </tr>`)).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}
window.updateVariant = async (id, body) => {
  await api('/admin/variants/'+id, { method:'PATCH', body });
  // re-render inventory to reflect changes
  if (state.view==='inventory') loadView();
};

async function renderCustomers(v) {
  const {customers} = await api('/admin/customers');
  v.innerHTML = `
    <div class="topbar"><div><h1>Customers</h1><div class="sub">${customers.length} customers · sorted by lifetime value</div></div></div>
    <div class="content">
      <div class="panel">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Tier</th><th>Points</th><th>Orders</th><th>LTV</th><th>Joined</th></tr></thead>
          <tbody>
            ${customers.length?customers.map(c=>`<tr>
              <td><b>${c.name}</b></td>
              <td>${c.email}</td>
              <td><span class="tag" style="background:${c.loyalty_tier==='Platinum'?'rgba(212,175,55,.2)':c.loyalty_tier==='Gold'?'rgba(212,175,55,.15)':'var(--surface-3)'};color:${c.loyalty_tier==='Gold'||c.loyalty_tier==='Platinum'?'var(--gold)':'var(--text-dim)'}">${c.loyalty_tier}</span></td>
              <td><b>${c.loyalty_points}</b></td>
              <td>${c.order_count}</td>
              <td><b style="color:var(--neon)">${$$(c.ltv_cents)}</b></td>
              <td>${new Date(c.created_at).toLocaleDateString()}</td>
            </tr>`).join(''):'<tr><td colspan="7"><p class="empty">No customers yet.</p></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
}

async function renderPromos(v) {
  v.innerHTML = `
    <div class="topbar"><div><h1>Promo codes</h1><div class="sub">Active discount codes</div></div></div>
    <div class="content">
      <div class="cards">
        <div class="card neon"><div class="lbl">Code</div><div class="val" style="font-family:monospace">FIRST20</div><div class="delta">20% off · welcome offer</div></div>
        <div class="card"><div class="lbl">Code</div><div class="val" style="font-family:monospace">MUNCH10</div><div class="delta">10% off · returning customers</div></div>
      </div>
      <div class="panel">
        <p style="color:var(--text-dim);font-size:13px;line-height:1.6">Promo codes are stored in the <code style="background:var(--surface-3);padding:2px 6px;border-radius:4px">promos</code> table. Add new ones via SQL or extend the admin API with a CRUD endpoint. The customer app validates codes via <code style="background:var(--surface-3);padding:2px 6px;border-radius:4px">GET /api/promo/:code</code>.</p>
      </div>
    </div>`;
}

init();
