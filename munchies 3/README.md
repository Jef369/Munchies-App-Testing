# Munchies — Hemp/THCA Delivery Platform

A real, working three-surface app: **customer mobile PWA**, **admin dashboard**, and **driver dispatch app**, sharing one Express + SQLite backend.

This is not a mockup. Every screen is wired to a real API. Sign up creates a real user, the cart persists in SQLite, orders flow from customer → admin → driver → delivered, with loyalty points auto-credited on every purchase.

---

## Quick start

```bash
cd munchies
npm install
npm start
```

Open:

- Customer app  → http://localhost:3000/customer/
- Admin         → http://localhost:3000/admin/   (admin@munchies.test / admin123)
- Driver        → http://localhost:3000/driver/  (driver@munchies.test / driver123)
- Demo customer → shop@munchies.test / shop123

The first run will create `data/munchies.db` and seed it with 12 products, 6 categories, 2 promo codes (`FIRST20`, `MUNCH10`), and 3 demo accounts.

To open the customer app on your phone: find your computer's local IP (e.g. `192.168.1.42`), then visit `http://192.168.1.42:3000/customer/` from your phone on the same Wi-Fi. Tap the share menu → "Add to Home Screen" to install it as a real app icon.

---

## Try the full flow

1. Open Customer app → sign in with `shop@munchies.test / shop123` (or sign up fresh).
2. Browse → tap a product → choose size → add to cart.
3. Cart → apply code `FIRST20` → checkout → place order.
4. You'll land on the live tracking screen.
5. Open Admin in another tab → see the order appear under Orders. Assign driver `Daniel J.` and change status to "packed".
6. Open Driver app in a third tab → sign in as driver → see the order in "Available" → tap **Accept**.
7. Driver app shows your active delivery → tap **Verify ID & deliver** → confirm in the modal.
8. Customer tracking screen auto-refreshes to **Delivered**. Loyalty points are now in the customer's profile.

---

## What's actually built

**Backend (`server.js`, ~400 lines)**

- Express + better-sqlite3 + JWT cookie auth + bcrypt
- Role-based access (`customer | admin | driver`)
- Products & variants with stock tracking
- Persistent cart (per-user)
- Order placement with promo codes, tax, delivery fees, loyalty points
- Driver queue endpoints (accept, deliver, ID verification)
- Admin endpoints: overview, orders, products, inventory, customers, drivers
- Stripe payment-intent endpoint (test mode, optional — works without keys)

**Customer PWA (`/customer/`)**

- Age gate + signup/login + JWT session
- Browse / search / category filter
- Product detail with variants, subscribe-and-save
- Cart with promo codes, fulfillment toggle (delivery vs pickup)
- Checkout with Stripe test-mode placeholder
- Live order tracking with auto-refresh and status timeline
- Order history, loyalty/rewards (Bronze→Platinum), referral, profile
- PWA manifest — installs to home screen

**Admin dashboard (`/admin/`)**

- Real-time overview: today's revenue, AOV, customer count, low-stock alerts, 7-day revenue chart
- Order management with inline status + driver assignment
- Product catalog
- Inventory editor (live stock + price updates)
- Customer table sorted by lifetime value
- Promo code overview

**Driver app (`/driver/`)**

- Online/offline toggle
- Available orders queue (auto-refresh every 8s)
- Active deliveries with pickup + dropoff
- Accept order, verify customer ID at door, mark delivered
- In-app calling placeholder (would integrate Twilio masked numbers)

---

## What needs your input to go live

These are the gaps between this MVP and a launched product. I can build the integration scaffolding; you provide the credentials.

1. **Stripe live mode** — Add `STRIPE_SECRET_KEY` to `.env` (use a `sk_test_` key first). The customer checkout currently shows a Visa placeholder; wire `stripe.js` into the checkout page to actually capture card details.
2. **Twilio SMS** — For real OTP login + delivery notifications. Add Twilio SDK + endpoint `/api/auth/sms/send`.
3. **Real address autocomplete + geocoding** — Mapbox or Google Places. Drop-in for the address input.
4. **GPS routing for drivers** — Mapbox Directions or Google Maps SDK. The driver app has a placeholder map area ready.
5. **Push notifications** — Web Push (built-in) for the PWA, or OneSignal for cross-platform. Subscribe at signup; trigger on order status change.
6. **Real ID scanning** — Jumio, Persona, or Veriff SDK. The driver "scan" modal is wired with the right UX flow; swap the placeholder for a real SDK.
7. **State-level compliance gating** — Add `delivery_zones` + `state_rules` tables. Block checkout for restricted states/zip codes.
8. **iOS/Android wrappers** — This is a PWA today (works great on mobile). For App Store, wrap with Capacitor (~1 day) or rebuild key screens in React Native / Expo.
9. **Hosting** — Deploy `server.js` to Render, Fly.io, or Railway (~5 min). Switch SQLite → Postgres for multi-server scale (better-sqlite3 → pg, schema is portable).

---

## Project structure

```
munchies/
├── package.json
├── .env.example
├── server.js            # Express + SQLite + REST API
├── seed.js              # Seeds DB if empty
├── data/
│   └── munchies.db      # auto-created
└── public/
    ├── customer/        # Mobile PWA
    │   ├── index.html
    │   ├── style.css
    │   ├── app.js
    │   └── manifest.json
    ├── admin/           # Desktop dashboard
    │   ├── index.html
    │   └── app.js
    └── driver/          # Driver mobile app
        ├── index.html
        └── app.js
```

---

## Stack rationale

- **SQLite (better-sqlite3)** — zero-config, file-based, surprisingly performant. Easy to swap for Postgres when you scale. Good for solo MVP.
- **Vanilla JS frontends** — no build step, no framework lock-in. Each app is one HTML + one JS file. Easy to hand off to any developer.
- **Cookie-based JWT** — stateless auth, works across all three surfaces from one server.
- **Single Node process** — runs anywhere. One command to deploy.

This is a real, runnable starting point — not a mockup. Push to GitHub, deploy to Render, and you have a live app within an hour.
