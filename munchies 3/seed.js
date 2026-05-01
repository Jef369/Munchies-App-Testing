// Initial seed data for Munchies. Idempotent — only runs if DB is empty.
import bcrypt from 'bcryptjs';

export function seedIfEmpty(db) {
  const has = db.prepare('SELECT COUNT(*) c FROM products').get().c;
  if (has > 0) return;

  const cats = [
    ['thca','THCA Flower','🌿'],
    ['gummies','Gummies','🍬'],
    ['vapes','Vapes','💨'],
    ['prerolls','Pre-Rolls','🚬'],
    ['wellness','Wellness','🧘'],
    ['drinks','Drinks','🥤'],
  ];
  const ic = db.prepare('INSERT INTO categories (id,name,emoji) VALUES (?,?,?)');
  for (const c of cats) ic.run(...c);

  const products = [
    {n:'Gelato 41', s:'THCA Flower • Hybrid', e:'🌿', cat:'thca', t:'Hybrid', thc:'28.4%', cbd:'<1%',
      d:'Premium indoor-grown THCA flower with a sweet dessert profile and notes of citrus. Hand-trimmed and slow-cured for peak terpene preservation.', tag:'New',
      v:[['3.5g',4500,42],['7g',8000,28],['14g',15000,12]]},
    {n:'Watermelon Z', s:'THCA Flower • Sativa', e:'🍉', cat:'thca', t:'Sativa', thc:'31.2%', cbd:'<1%',
      d:'Energizing daytime strain with vibrant melon and gas notes. Greenhouse-grown, slow-cured, lab tested.', tag:'Top',
      v:[['3.5g',5000,30],['7g',9000,18],['14g',17000,8]]},
    {n:'Sour Peach Gummies', s:'25mg Delta-9 • 10pk', e:'🍑', cat:'gummies', t:'Hybrid', thc:'25mg', cbd:'—',
      d:'Vegan sour peach gummies dosed at 25mg per piece. Made with real fruit juice and pectin.', tag:'Hot',
      v:[['10pk',2800,84],['20pk',5200,40]]},
    {n:'Live Rosin Vape', s:'2g Disposable • Wedding Cake', e:'💨', cat:'vapes', t:'Indica', thc:'92%', cbd:'<1%',
      d:'Solventless live rosin in a 2g rechargeable disposable. Pure flavor, no fillers, no cuts.', tag:'New',
      v:[['1g',3500,52],['2g',5500,30]]},
    {n:'Infused Pre-Roll Pack', s:'5pk • 1g each', e:'🚬', cat:'prerolls', t:'Hybrid', thc:'35%', cbd:'—',
      d:'Five 1g infused pre-rolls dipped in distillate and rolled in kief. Perfect for sessions.', tag:'Bundle',
      v:[['5pk',4200,38],['10pk',7800,16]]},
    {n:'CBD Recovery Balm', s:'1000mg • Topical', e:'🧴', cat:'wellness', t:'CBD', thc:'—', cbd:'1000mg',
      d:'Cooling menthol & arnica balm with full-spectrum hemp extract. For sore muscles and joints.', tag:'Wellness',
      v:[['2oz',3200,60],['4oz',5400,32]]},
    {n:'THC Seltzer 4-pack', s:'5mg per can • Citrus', e:'🥤', cat:'drinks', t:'Hybrid', thc:'5mg', cbd:'—',
      d:'Crisp citrus seltzer infused with 5mg of hemp-derived Delta-9. Zero sugar, fast onset.', tag:'New',
      v:[['4pk',2400,90],['12pk',6000,40]]},
    {n:'Sleep Tincture', s:'1500mg CBN+CBD', e:'🌙', cat:'wellness', t:'CBN', thc:'—', cbd:'1500mg',
      d:'Nightly sleep formula with CBN, CBD, and chamomile. Vanilla mint flavor.', tag:'Bestseller',
      v:[['30ml',4800,55],['60ml',8400,25]]},
    {n:'Apple Fritter Pre-Rolls', s:'3pk • 0.7g each', e:'🍎', cat:'prerolls', t:'Hybrid', thc:'27%', cbd:'<1%',
      d:'Hand-rolled with whole flower, no shake. Smooth burn, sweet apple finish.', tag:'',
      v:[['3pk',2400,48]]},
    {n:'Mango Live Resin Vape', s:'1g Cart • Sativa', e:'🥭', cat:'vapes', t:'Sativa', thc:'88%', cbd:'<1%',
      d:'Single-strain live resin cart with bright tropical mango flavor.', tag:'',
      v:[['1g',3800,42]]},
    {n:'Mixed Berry Gummies', s:'10mg Delta-9 • 20pk', e:'🫐', cat:'gummies', t:'Hybrid', thc:'10mg', cbd:'—',
      d:'Lower-dose gummies for microdosing or new users. Pectin-based, vegan.', tag:'',
      v:[['20pk',3000,75]]},
    {n:'Focus Tincture', s:'1000mg CBD + Lions Mane', e:'☀️', cat:'wellness', t:'CBD', thc:'—', cbd:'1000mg',
      d:'Daytime focus blend. Pair with morning coffee for clean energy.', tag:'',
      v:[['30ml',4400,38]]},
  ];

  const ip = db.prepare(`INSERT INTO products (name,sub,emoji,category_id,type,thc,cbd,description,tag) VALUES (?,?,?,?,?,?,?,?,?)`);
  const iv = db.prepare(`INSERT INTO product_variants (product_id,size,price_cents,stock) VALUES (?,?,?,?)`);
  for (const p of products) {
    const r = ip.run(p.n, p.s, p.e, p.cat, p.t, p.thc, p.cbd, p.d, p.tag);
    for (const v of p.v) iv.run(r.lastInsertRowid, v[0], v[1], v[2]);
  }

  // promos
  const ipr = db.prepare('INSERT INTO promos (code,percent_off,active) VALUES (?,?,1)');
  ipr.run('FIRST20', 20);
  ipr.run('MUNCH10', 10);

  // users
  const iu = db.prepare(`INSERT INTO users (email,password_hash,name,role,age_verified,phone,loyalty_points,loyalty_tier) VALUES (?,?,?,?,1,?,?,?)`);
  iu.run('admin@munchies.test', bcrypt.hashSync('admin123',10), 'Admin', 'admin', '+15555550100', 0, 'Bronze');
  iu.run('driver@munchies.test', bcrypt.hashSync('driver123',10), 'Daniel J.', 'driver', '+15555550101', 0, 'Bronze');
  iu.run('shop@munchies.test', bcrypt.hashSync('shop123',10), 'Xinyan Xu', 'customer', '+15555550102', 1240, 'Gold');

  console.log('✅ Database seeded');
}
