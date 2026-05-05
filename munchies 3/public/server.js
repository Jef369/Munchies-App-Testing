// Munchies backend — Express + SQLite + JWT auth + Stripe (test mode)
// Single-file server. Serves customer, admin, driver web apps from /public.

import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import Stripe from 'stripe';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Env ----
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
const stripe = STRIPE_KEY ? new Stripe(STRIPE_KEY) : null;

// ---- DB ----
const dbFile = process.env.DB_PATH || path.join(__dirname, 'data', 'munchies.db');
fs.mkdirSync(path.dirname(dbFile), { recursive: true });
const db = new DatabaseSync(dbFile);
try { db.exec('PRAGMA journal_mode = WAL'); } catch { /* fallback to default journal on filesystems that don't support WAL */ }
db.exec('PRAGMA foreign_keys = ON');

// safe column additions for existing databases (idempotent — no-op if column exists)
function safeAddColumn(table, column, definition) {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`); }
  catch (e) { /* column already exists, ignore */ }
}

// schema
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer', -- customer | admin | driver
  age_verified INTEGER DEFAULT 0,
  loyalty_points INTEGER DEFAULT 0,
  loyalty_tier TEXT DEFAULT 'Bronze',
  phone TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sub TEXT,
  emoji TEXT,
  image_url TEXT,
  category_id TEXT NOT NULL,
  type TEXT,           -- Hybrid/Indica/Sativa/CBD
  thc TEXT,
  cbd TEXT,
  description TEXT,
  rating REAL DEFAULT 4.8,
  review_count INTEGER DEFAULT 0,
  tag TEXT,
  active INTEGER DEFAULT 1,
  FOREIGN KEY (category_id) REFERENCES categories(id)
);
CREATE TABLE IF NOT EXISTS product_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  size TEXT NOT NULL,         -- e.g., "3.5g"
  price_cents INTEGER NOT NULL,
  stock INTEGER DEFAULT 0,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS cart_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  variant_id INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (variant_id) REFERENCES product_variants(id),
  UNIQUE(user_id, variant_id)
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT UNIQUE NOT NULL,
  user_id INTEGER NOT NULL,
  fulfillment TEXT NOT NULL,   -- delivery|pickup
  address TEXT,
  status TEXT NOT NULL DEFAULT 'placed', -- placed|packed|out_for_delivery|delivered|cancelled
  subtotal_cents INTEGER,
  discount_cents INTEGER DEFAULT 0,
  delivery_cents INTEGER DEFAULT 0,
  tax_cents INTEGER,
  total_cents INTEGER,
  promo_code TEXT,
  driver_id INTEGER,
  stripe_pi TEXT,
  payment_status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  delivered_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (driver_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  variant_id INTEGER NOT NULL,
  product_name TEXT,
  size TEXT,
  qty INTEGER,
  price_cents INTEGER,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (variant_id) REFERENCES product_variants(id)
);
CREATE TABLE IF NOT EXISTS promos (
  code TEXT PRIMARY KEY,
  percent_off INTEGER,
  active INTEGER DEFAULT 1
);
`);

// run safe column migrations for existing databases
safeAddColumn('products', 'image_url', 'TEXT');
// ID verification columns on users
safeAddColumn('users', 'id_front_url', 'TEXT');
safeAddColumn('users', 'id_back_url', 'TEXT');
safeAddColumn('users', 'selfie_url', 'TEXT');
safeAddColumn('users', 'verification_status', "TEXT DEFAULT 'unverified'"); // unverified | pending | approved | rejected
safeAddColumn('users', 'verification_submitted_at', 'TEXT');
safeAddColumn('users', 'verification_reviewed_at', 'TEXT');
safeAddColumn('users', 'verification_reviewer_id', 'INTEGER');
safeAddColumn('users', 'verification_notes', 'TEXT');
// Delivery proof columns on orders
safeAddColumn('orders', 'delivery_id_photo_url', 'TEXT');
safeAddColumn('orders', 'delivery_proof_photo_url', 'TEXT');

// seed defaults if empty
import('./seed.js').then(m => m.seedIfEmpty(db)).catch(()=>{});

// ---- App ----
const app = express();
app.use(express.json({ limit: '20mb' })); // bumped to allow up to 4 ID photos at once (resized client-side first)
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ---- Request logging (so you can see API calls in Render Logs) ----
app.use((req, _res, next) => {
  if (req.url.startsWith('/api/')) {
    const t = new Date().toISOString().slice(11,19);
    console.log(`[${t}] ${req.method} ${req.url}`);
  }
  next();
});

// ---- Helpers ----
function makeToken(user) {
  return jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
}
function authOptional(req, _res, next) {
  const tok = req.cookies?.token;
  if (tok) {
    try { req.user = jwt.verify(tok, JWT_SECRET); } catch {}
  }
  next();
}
function requireAuth(roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'auth required' });
    if (roles && !roles.includes(req.user.role)) return res.status(403).json({ error: 'forbidden' });
    next();
  };
}
function genOrderNo() {
  return 'M-' + String(Math.floor(1000 + Math.random() * 9000)) + Date.now().toString().slice(-3);
}
function tierFor(points) {
  if (points >= 2000) return 'Platinum';
  if (points >= 1000) return 'Gold';
  if (points >= 500) return 'Silver';
  return 'Bronze';
}

app.use(authOptional);

// ---- Auth ----
app.post('/api/auth/signup', (req, res) => {
  const { email, password, name, phone, age_ok } = req.body || {};
  if (!email || !password || !name) return res.status(400).json({ error: 'missing fields' });
  if (!age_ok) return res.status(400).json({ error: 'age verification required (21+)' });
  const exists = db.prepare('SELECT id FROM users WHERE email=?').get(email.toLowerCase());
  if (exists) return res.status(409).json({ error: 'email already registered' });
  const hash = bcrypt.hashSync(password, 10);
  const r = db.prepare(`INSERT INTO users (email,password_hash,name,phone,age_verified,role) VALUES (?,?,?,?,1,'customer')`)
    .run(email.toLowerCase(), hash, name, phone || null);
  const user = db.prepare('SELECT id,email,name,role,loyalty_points,loyalty_tier FROM users WHERE id=?').get(r.lastInsertRowid);
  res.cookie('token', makeToken(user), { httpOnly: true, sameSite: 'lax', maxAge: 30*24*60*60*1000 });
  res.json({ user });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'missing fields' });
  const row = db.prepare('SELECT * FROM users WHERE email=?').get(email.toLowerCase());
  if (!row || !bcrypt.compareSync(password, row.password_hash)) return res.status(401).json({ error: 'invalid credentials' });
  res.cookie('token', makeToken(row), { httpOnly: true, sameSite: 'lax', maxAge: 30*24*60*60*1000 });
  res.json({ user: { id: row.id, email: row.email, name: row.name, role: row.role, loyalty_points: row.loyalty_points, loyalty_tier: row.loyalty_tier } });
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('token').json({ ok: true });
});

app.get('/api/me', requireAuth(), (req, res) => {
  const u = db.prepare(`SELECT id,email,name,role,loyalty_points,loyalty_tier,phone,age_verified,created_at,
                        verification_status, verification_submitted_at, verification_reviewed_at, verification_notes
                        FROM users WHERE id=?`).get(req.user.id);
  res.json({ user: u });
});

// ---- ID Verification (customer) ----
app.post('/api/me/verification', requireAuth(['customer']), (req, res) => {
  const { id_front_url, id_back_url, selfie_url } = req.body || {};
  if (!id_front_url || !id_back_url) return res.status(400).json({ error: 'ID front and back photos are required' });
  // Note: in production, swap base64 storage for Persona/Veriff SDK call.
  db.prepare(`UPDATE users SET
    id_front_url=?, id_back_url=?, selfie_url=?,
    verification_status='pending',
    verification_submitted_at=CURRENT_TIMESTAMP,
    verification_reviewed_at=NULL,
    verification_notes=NULL
    WHERE id=?`).run(id_front_url, id_back_url, selfie_url || null, req.user.id);
  res.json({ ok: true, status: 'pending' });
});

app.get('/api/me/verification', requireAuth(), (req, res) => {
  const u = db.prepare(`SELECT verification_status, verification_submitted_at, verification_reviewed_at, verification_notes,
                        id_front_url, id_back_url, selfie_url FROM users WHERE id=?`).get(req.user.id);
  res.json({ verification: u });
});

// ---- Catalog (public) ----
app.get('/api/categories', (_req, res) => {
  const rows = db.prepare('SELECT * FROM categories ORDER BY name').all();
  const counts = db.prepare('SELECT category_id, COUNT(*) c FROM products WHERE active=1 GROUP BY category_id').all();
  const cmap = Object.fromEntries(counts.map(r => [r.category_id, r.c]));
  res.json({ categories: rows.map(r => ({ ...r, count: cmap[r.id] || 0 })) });
});

app.get('/api/products', (req, res) => {
  const { category, search } = req.query;
  let sql = `SELECT p.*, c.name as category_name FROM products p JOIN categories c ON c.id=p.category_id WHERE p.active=1`;
  const params = [];
  if (category) { sql += ` AND p.category_id=?`; params.push(category); }
  if (search) { sql += ` AND (p.name LIKE ? OR p.sub LIKE ?)`; params.push(`%${search}%`,`%${search}%`); }
  sql += ` ORDER BY p.id DESC`;
  const rows = db.prepare(sql).all(...params);
  let variants = [];
  if (rows.length) {
    variants = db.prepare('SELECT * FROM product_variants WHERE product_id IN (' + rows.map(()=>'?').join(',') + ')')
      .all(...rows.map(r => r.id));
  }
  const vmap = {};
  for (const v of variants) (vmap[v.product_id] = vmap[v.product_id] || []).push(v);
  res.json({ products: rows.map(p => ({ ...p, variants: vmap[p.id] || [] })) });
});

app.get('/api/products/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  const variants = db.prepare('SELECT * FROM product_variants WHERE product_id=? ORDER BY price_cents').all(p.id);
  res.json({ product: { ...p, variants } });
});

// ---- Cart (auth) ----
function cartView(userId) {
  const rows = db.prepare(`
    SELECT ci.id as item_id, ci.qty, v.id as variant_id, v.size, v.price_cents,
           p.id as product_id, p.name, p.emoji, p.image_url, p.sub, p.type
    FROM cart_items ci
    JOIN product_variants v ON v.id = ci.variant_id
    JOIN products p ON p.id = v.product_id
    WHERE ci.user_id=?
  `).all(userId);
  const subtotal = rows.reduce((s, r) => s + r.qty * r.price_cents, 0);
  return { items: rows, subtotal_cents: subtotal };
}

app.get('/api/cart', requireAuth(), (req, res) => res.json(cartView(req.user.id)));

app.post('/api/cart/add', requireAuth(), (req, res) => {
  const { variant_id, qty = 1 } = req.body || {};
  if (!variant_id) return res.status(400).json({ error: 'variant_id required' });
  const v = db.prepare('SELECT * FROM product_variants WHERE id=?').get(variant_id);
  if (!v) return res.status(404).json({ error: 'variant not found' });
  const existing = db.prepare('SELECT * FROM cart_items WHERE user_id=? AND variant_id=?').get(req.user.id, variant_id);
  if (existing) {
    db.prepare('UPDATE cart_items SET qty = qty + ? WHERE id=?').run(qty, existing.id);
  } else {
    db.prepare('INSERT INTO cart_items (user_id,variant_id,qty) VALUES (?,?,?)').run(req.user.id, variant_id, qty);
  }
  res.json(cartView(req.user.id));
});

app.patch('/api/cart/:itemId', requireAuth(), (req, res) => {
  const { qty } = req.body || {};
  if (qty <= 0) {
    db.prepare('DELETE FROM cart_items WHERE id=? AND user_id=?').run(req.params.itemId, req.user.id);
  } else {
    db.prepare('UPDATE cart_items SET qty=? WHERE id=? AND user_id=?').run(qty, req.params.itemId, req.user.id);
  }
  res.json(cartView(req.user.id));
});

app.delete('/api/cart/:itemId', requireAuth(), (req, res) => {
  db.prepare('DELETE FROM cart_items WHERE id=? AND user_id=?').run(req.params.itemId, req.user.id);
  res.json(cartView(req.user.id));
});

// ---- Promo ----
app.get('/api/promo/:code', (req, res) => {
  const p = db.prepare('SELECT * FROM promos WHERE code=? AND active=1').get(req.params.code.toUpperCase());
  if (!p) return res.status(404).json({ error: 'invalid code' });
  res.json({ code: p.code, percent_off: p.percent_off });
});

// ---- Checkout / Orders ----
app.post('/api/orders', requireAuth(['customer']), (req, res) => {
  const { fulfillment = 'delivery', address, promo_code } = req.body || {};
  const cart = cartView(req.user.id);
  if (cart.items.length === 0) return res.status(400).json({ error: 'cart is empty' });
  let discount_cents = 0;
  if (promo_code) {
    const p = db.prepare('SELECT * FROM promos WHERE code=? AND active=1').get(promo_code.toUpperCase());
    if (p) discount_cents = Math.round(cart.subtotal_cents * p.percent_off / 100);
  }
  const delivery_cents = fulfillment === 'delivery' ? 499 : 0;
  const tax_cents = Math.round((cart.subtotal_cents - discount_cents) * 0.08);
  const total_cents = cart.subtotal_cents - discount_cents + delivery_cents + tax_cents;
  const order_no = genOrderNo();

  let result;
  db.exec('BEGIN');
  try {
    const r = db.prepare(`INSERT INTO orders (order_no,user_id,fulfillment,address,status,subtotal_cents,discount_cents,delivery_cents,tax_cents,total_cents,promo_code,payment_status)
                          VALUES (?,?,?,?, 'placed', ?,?,?,?,?,?,'paid_test')`).run(
      order_no, req.user.id, fulfillment, address || null,
      cart.subtotal_cents, discount_cents, delivery_cents, tax_cents, total_cents, promo_code || null
    );
    const oid = Number(r.lastInsertRowid);
    const ins = db.prepare(`INSERT INTO order_items (order_id,variant_id,product_name,size,qty,price_cents) VALUES (?,?,?,?,?,?)`);
    const dec = db.prepare('UPDATE product_variants SET stock = MAX(stock - ?, 0) WHERE id=?');
    for (const it of cart.items) {
      ins.run(oid, it.variant_id, it.name, it.size, it.qty, it.price_cents);
      dec.run(it.qty, it.variant_id);
    }
    db.prepare('DELETE FROM cart_items WHERE user_id=?').run(req.user.id);
    const pts = Math.floor(total_cents / 10);
    db.prepare('UPDATE users SET loyalty_points = loyalty_points + ? WHERE id=?').run(pts, req.user.id);
    const u = db.prepare('SELECT loyalty_points FROM users WHERE id=?').get(req.user.id);
    db.prepare('UPDATE users SET loyalty_tier=? WHERE id=?').run(tierFor(u.loyalty_points), req.user.id);
    db.exec('COMMIT');
    result = { id: oid, order_no, points_earned: pts };
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: e.message });
  }
  res.json({ order_id: result.id, order_no: result.order_no, points_earned: result.points_earned, total_cents });
});

app.get('/api/orders', requireAuth(), (req, res) => {
  const rows = db.prepare(`SELECT * FROM orders WHERE user_id=? ORDER BY id DESC`).all(req.user.id);
  res.json({ orders: rows });
});

app.get('/api/orders/:id', requireAuth(), (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'not found' });
  if (o.user_id !== req.user.id && req.user.role !== 'admin' && req.user.id !== o.driver_id) return res.status(403).json({});
  const items = db.prepare('SELECT * FROM order_items WHERE order_id=?').all(o.id);
  const driver = o.driver_id ? db.prepare('SELECT id,name FROM users WHERE id=?').get(o.driver_id) : null;
  const customer = db.prepare('SELECT id,name,phone FROM users WHERE id=?').get(o.user_id);
  res.json({ order: { ...o, items, driver, customer } });
});

// ---- Stripe (test mode optional) ----
app.post('/api/checkout/create-intent', requireAuth(['customer']), async (req, res) => {
  if (!stripe) return res.json({ skipped: true, message: 'Stripe key not configured — using test-mode mock' });
  const cart = cartView(req.user.id);
  if (cart.items.length === 0) return res.status(400).json({ error: 'cart empty' });
  try {
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(cart.subtotal_cents * 1.08) + 499,
      currency: 'usd',
      metadata: { user_id: String(req.user.id) },
      automatic_payment_methods: { enabled: true }
    });
    res.json({ clientSecret: intent.client_secret });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Admin ----
app.get('/api/admin/overview', requireAuth(['admin']), (_req, res) => {
  const today = new Date().toISOString().slice(0,10);
  const totals = db.prepare(`SELECT COUNT(*) as orders, COALESCE(SUM(total_cents),0) as revenue_cents FROM orders`).get();
  const todayRow = db.prepare(`SELECT COUNT(*) as orders, COALESCE(SUM(total_cents),0) as revenue_cents FROM orders WHERE DATE(created_at)=DATE(?)`).get(today);
  const customers = db.prepare(`SELECT COUNT(*) c FROM users WHERE role='customer'`).get();
  const lowStock = db.prepare(`SELECT p.id, p.name, p.emoji, v.size, v.stock FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.stock < 10 ORDER BY v.stock ASC LIMIT 8`).all();
  const recent = db.prepare(`SELECT o.*, u.name as customer_name FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC LIMIT 10`).all();
  // last 7 days revenue
  const series = db.prepare(`
    SELECT DATE(created_at) d, COUNT(*) orders, COALESCE(SUM(total_cents),0) revenue_cents
    FROM orders WHERE created_at >= date('now','-7 day') GROUP BY DATE(created_at)
  `).all();
  res.json({ totals, today: todayRow, customers: customers.c, low_stock: lowStock, recent_orders: recent, last7: series });
});

app.get('/api/admin/orders', requireAuth(['admin']), (req, res) => {
  const status = req.query.status;
  let sql = `SELECT o.*, u.name as customer_name, u.phone as customer_phone, d.name as driver_name FROM orders o JOIN users u ON u.id=o.user_id LEFT JOIN users d ON d.id=o.driver_id`;
  const params = [];
  if (status) { sql += ` WHERE o.status=?`; params.push(status); }
  sql += ` ORDER BY o.id DESC LIMIT 100`;
  res.json({ orders: db.prepare(sql).all(...params) });
});

app.patch('/api/admin/orders/:id', requireAuth(['admin']), (req, res) => {
  const { status, driver_id } = req.body || {};
  const sets = []; const vals = [];
  if (status) { sets.push('status=?'); vals.push(status); }
  if (driver_id !== undefined) { sets.push('driver_id=?'); vals.push(driver_id); }
  if (status === 'delivered') { sets.push('delivered_at=CURRENT_TIMESTAMP'); }
  if (sets.length === 0) return res.status(400).json({ error: 'nothing to update' });
  vals.push(req.params.id);
  db.prepare(`UPDATE orders SET ${sets.join(',')} WHERE id=?`).run(...vals);
  res.json({ ok: true });
});

app.get('/api/admin/products', requireAuth(['admin']), (_req, res) => {
  const products = db.prepare(`SELECT p.*, c.name as category_name FROM products p JOIN categories c ON c.id=p.category_id ORDER BY p.id DESC`).all();
  const variants = db.prepare(`SELECT * FROM product_variants`).all();
  const vmap = {};
  for (const v of variants) (vmap[v.product_id] = vmap[v.product_id] || []).push(v);
  res.json({ products: products.map(p => ({ ...p, variants: vmap[p.id] || [] })) });
});

app.post('/api/admin/products', requireAuth(['admin']), (req, res) => {
  const { name, sub, emoji, image_url, category_id, type, thc, cbd, description, tag, variants } = req.body || {};
  if (!name || !category_id) return res.status(400).json({ error: 'name & category required' });
  const r = db.prepare(`INSERT INTO products (name,sub,emoji,image_url,category_id,type,thc,cbd,description,tag) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(name, sub||'', emoji||'🌿', image_url||null, category_id, type||'Hybrid', thc||'', cbd||'', description||'', tag||'New');
  const pid = Number(r.lastInsertRowid);
  if (variants?.length) {
    const ins = db.prepare(`INSERT INTO product_variants (product_id,size,price_cents,stock) VALUES (?,?,?,?)`);
    for (const v of variants) ins.run(pid, v.size, v.price_cents, v.stock || 0);
  }
  res.json({ id: pid });
});

app.patch('/api/admin/products/:id', requireAuth(['admin']), (req, res) => {
  const { name, sub, emoji, image_url, category_id, type, thc, cbd, description, tag } = req.body || {};
  const sets = []; const vals = [];
  if (name !== undefined) { sets.push('name=?'); vals.push(name); }
  if (sub !== undefined) { sets.push('sub=?'); vals.push(sub); }
  if (emoji !== undefined) { sets.push('emoji=?'); vals.push(emoji); }
  if (image_url !== undefined) { sets.push('image_url=?'); vals.push(image_url || null); }
  if (category_id !== undefined) { sets.push('category_id=?'); vals.push(category_id); }
  if (type !== undefined) { sets.push('type=?'); vals.push(type); }
  if (thc !== undefined) { sets.push('thc=?'); vals.push(thc); }
  if (cbd !== undefined) { sets.push('cbd=?'); vals.push(cbd); }
  if (description !== undefined) { sets.push('description=?'); vals.push(description); }
  if (tag !== undefined) { sets.push('tag=?'); vals.push(tag); }
  if (sets.length === 0) return res.status(400).json({ error: 'nothing to update' });
  vals.push(req.params.id);
  db.prepare(`UPDATE products SET ${sets.join(',')} WHERE id=?`).run(...vals);
  res.json({ ok: true });
});

app.patch('/api/admin/variants/:id', requireAuth(['admin']), (req, res) => {
  const { stock, price_cents } = req.body || {};
  const sets = []; const vals = [];
  if (stock !== undefined) { sets.push('stock=?'); vals.push(stock); }
  if (price_cents !== undefined) { sets.push('price_cents=?'); vals.push(price_cents); }
  if (sets.length === 0) return res.status(400).json({});
  vals.push(req.params.id);
  db.prepare(`UPDATE product_variants SET ${sets.join(',')} WHERE id=?`).run(...vals);
  res.json({ ok: true });
});

app.delete('/api/admin/products/:id', requireAuth(['admin']), (req, res) => {
  db.prepare('UPDATE products SET active=0 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/admin/customers', requireAuth(['admin']), (_req, res) => {
  const rows = db.prepare(`
    SELECT u.id,u.name,u.email,u.phone,u.loyalty_points,u.loyalty_tier,u.created_at,
      (SELECT COUNT(*) FROM orders WHERE user_id=u.id) as order_count,
      (SELECT COALESCE(SUM(total_cents),0) FROM orders WHERE user_id=u.id) as ltv_cents
    FROM users u WHERE role='customer' ORDER BY ltv_cents DESC LIMIT 200
  `).all();
  res.json({ customers: rows });
});

app.get('/api/admin/drivers', requireAuth(['admin']), (_req, res) => {
  const rows = db.prepare(`SELECT id,name,email,phone FROM users WHERE role='driver' ORDER BY name`).all();
  res.json({ drivers: rows });
});

// ---- Admin: ID Verification review ----
app.get('/api/admin/verifications', requireAuth(['admin']), (req, res) => {
  const status = req.query.status || 'pending';
  const rows = db.prepare(`SELECT id,name,email,phone,verification_status,verification_submitted_at,verification_reviewed_at,verification_notes,created_at
                           FROM users WHERE role='customer' AND verification_status=? ORDER BY verification_submitted_at DESC LIMIT 100`).all(status);
  res.json({ verifications: rows });
});

app.get('/api/admin/verifications/:user_id', requireAuth(['admin']), (req, res) => {
  const u = db.prepare(`SELECT id,name,email,phone,verification_status,verification_submitted_at,verification_reviewed_at,verification_notes,
                        id_front_url,id_back_url,selfie_url,created_at
                        FROM users WHERE id=? AND role='customer'`).get(req.params.user_id);
  if (!u) return res.status(404).json({ error: 'not found' });
  res.json({ verification: u });
});

app.post('/api/admin/verifications/:user_id/approve', requireAuth(['admin']), (req, res) => {
  db.prepare(`UPDATE users SET verification_status='approved', verification_reviewed_at=CURRENT_TIMESTAMP, verification_reviewer_id=?, verification_notes=?
              WHERE id=? AND role='customer'`).run(req.user.id, req.body?.notes || null, req.params.user_id);
  res.json({ ok: true });
});

app.post('/api/admin/verifications/:user_id/reject', requireAuth(['admin']), (req, res) => {
  const { notes } = req.body || {};
  if (!notes || !notes.trim()) return res.status(400).json({ error: 'rejection reason is required' });
  db.prepare(`UPDATE users SET verification_status='rejected', verification_reviewed_at=CURRENT_TIMESTAMP, verification_reviewer_id=?, verification_notes=?
              WHERE id=? AND role='customer'`).run(req.user.id, notes.trim(), req.params.user_id);
  res.json({ ok: true });
});

// ---- Driver ----
app.get('/api/driver/queue', requireAuth(['driver']), (req, res) => {
  // available pickups (placed/packed, no driver) + my active deliveries
  const available = db.prepare(`SELECT o.*, u.name as customer_name FROM orders o JOIN users u ON u.id=o.user_id
    WHERE o.fulfillment='delivery' AND o.driver_id IS NULL AND o.status IN ('placed','packed') ORDER BY o.id`).all();
  const mine = db.prepare(`SELECT o.*, u.name as customer_name, u.phone as customer_phone FROM orders o JOIN users u ON u.id=o.user_id
    WHERE o.driver_id=? AND o.status IN ('out_for_delivery','packed') ORDER BY o.id`).all(req.user.id);
  res.json({ available, mine });
});

app.post('/api/driver/orders/:id/accept', requireAuth(['driver']), (req, res) => {
  db.prepare(`UPDATE orders SET driver_id=?, status='out_for_delivery' WHERE id=? AND driver_id IS NULL`).run(req.user.id, req.params.id);
  res.json({ ok: true });
});

app.post('/api/driver/orders/:id/deliver', requireAuth(['driver']), (req, res) => {
  const { id_verified, delivery_id_photo_url, delivery_proof_photo_url } = req.body || {};
  if (!id_verified) return res.status(400).json({ error: 'must confirm ID verification at door' });
  if (!delivery_id_photo_url) return res.status(400).json({ error: 'must capture customer ID photo at delivery' });
  db.prepare(`UPDATE orders SET status='delivered', delivered_at=CURRENT_TIMESTAMP,
              delivery_id_photo_url=?, delivery_proof_photo_url=?
              WHERE id=? AND driver_id=?`).run(delivery_id_photo_url, delivery_proof_photo_url || null, req.params.id, req.user.id);
  res.json({ ok: true });
});

// ---- Page routes ----
app.get('/', (_req, res) => res.redirect('/customer/'));
app.get('/admin', (_req, res) => res.redirect('/admin/'));
app.get('/driver', (_req, res) => res.redirect('/driver/'));

app.listen(PORT, () => {
  console.log(`\n🌿 Munchies running on http://localhost:${PORT}`);
  console.log(`   • Customer  → http://localhost:${PORT}/customer/`);
  console.log(`   • Admin     → http://localhost:${PORT}/admin/  (admin@munchies.test / admin123)`);
  console.log(`   • Driver    → http://localhost:${PORT}/driver/ (driver@munchies.test / driver123)`);
  console.log(`   • Demo customer: shop@munchies.test / shop123\n`);
});
