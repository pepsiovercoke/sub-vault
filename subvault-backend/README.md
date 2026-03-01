# SubVault — Backend API

A production-grade REST API for the SubVault subscription management platform.
Built with Express, SQLite (better-sqlite3), and JWT authentication.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Seed the database with demo data
npm run seed

# 3. Start the server
npm run dev
```

The API will be running at `http://localhost:3001`.

**Demo credentials:**
- Email: `visionary@subvault.com`
- Password: `password123`

---

## Project Structure

```
subvault-backend/
├── .env                        # Environment variables
├── package.json
├── src/
│   ├── server.js               # Express app + middleware
│   ├── db/
│   │   ├── database.js         # SQLite schema + connection
│   │   └── seed.js             # Demo data seeder
│   ├── middleware/
│   │   └── auth.js             # JWT auth middleware
│   └── routes/
│       ├── auth.js             # Register, login, profile
│       ├── subscriptions.js    # Full CRUD + bulk ops
│       └── analytics.js        # Stats, trends, insights
└── public/                     # Static frontend build (optional)
```

---

## API Reference

All endpoints return JSON. Protected routes require:
```
Authorization: Bearer <token>
```

### Authentication

| Method | Endpoint              | Body                              | Description      |
|--------|-----------------------|-----------------------------------|------------------|
| POST   | `/api/auth/register`  | `{ email, password, name }`       | Create account   |
| POST   | `/api/auth/login`     | `{ email, password }`             | Get JWT token    |
| GET    | `/api/auth/me`        | —                                 | Get profile      |
| PUT    | `/api/auth/me`        | `{ name?, email? }`               | Update profile   |

### Subscriptions (all require auth)

| Method | Endpoint                             | Description                    |
|--------|--------------------------------------|--------------------------------|
| GET    | `/api/subscriptions`                 | List all (filterable, sortable)|
| GET    | `/api/subscriptions/:id`             | Get one                        |
| POST   | `/api/subscriptions`                 | Create                         |
| PUT    | `/api/subscriptions/:id`             | Update                         |
| PATCH  | `/api/subscriptions/:id/toggle`      | Toggle active/paused           |
| DELETE | `/api/subscriptions/:id`             | Delete one                     |
| POST   | `/api/subscriptions/bulk-delete`     | Delete multiple `{ ids: [] }`  |

**Query parameters for GET /api/subscriptions:**

| Param      | Values                                          | Default    |
|------------|-------------------------------------------------|------------|
| `category` | AI & Tech, Cloud & Infra, Finance, etc.         | all        |
| `status`   | active, paused, cancelled                       | all        |
| `search`   | any string (searches name, notes, category)     | —          |
| `sort`     | cost, name, next-bill, created, category        | cost       |
| `order`    | asc, desc                                       | desc       |
| `page`     | 1+                                              | 1          |
| `limit`    | 1–100                                           | 50         |

**POST/PUT body:**
```json
{
  "name": "OpenAI API",
  "cost": 120,
  "currency": "USD",
  "cycle": "Monthly",
  "category": "AI & Tech",
  "status": "active",
  "next_bill": "2026-03-15",
  "notes": "GPT-4 Turbo access",
  "url": "https://platform.openai.com"
}
```

### Analytics (all require auth)

| Method | Endpoint                    | Description                        |
|--------|-----------------------------|------------------------------------|
| GET    | `/api/analytics/summary`    | KPIs: totals, averages, extremes   |
| GET    | `/api/analytics/categories` | Spend by category with %           |
| GET    | `/api/analytics/trends`     | Monthly spend history + MoM change |
| GET    | `/api/analytics/upcoming`   | Upcoming renewals (sortable)       |
| GET    | `/api/analytics/insights`   | Smart optimization suggestions     |

**Upcoming query params:** `?limit=10&days=30`

### Utility

| Method | Endpoint        | Description              |
|--------|-----------------|--------------------------|
| GET    | `/api/health`   | Server health check      |

---

## Response Formats

**Success:**
```json
{
  "subscriptions": [...],
  "pagination": { "page": 1, "limit": 50, "total": 14, "pages": 1 }
}
```

**Error:**
```json
{
  "error": "Descriptive error message"
}
```

---

## Security

- **Helmet** — HTTP security headers
- **CORS** — Configurable origin whitelist
- **Rate limiting** — 200 req/15min general, 20 req/15min for auth
- **bcrypt** — Password hashing (12 rounds)
- **JWT** — 7-day token expiry
- **Parameterized queries** — SQL injection protection

---

## Environment Variables

| Variable        | Default                          | Description              |
|-----------------|----------------------------------|--------------------------|
| `PORT`          | `3001`                           | Server port              |
| `NODE_ENV`      | `development`                    | Environment              |
| `JWT_SECRET`    | *(required)*                     | Token signing key        |
| `JWT_EXPIRES_IN`| `7d`                             | Token lifetime           |
| `DB_PATH`       | `./data/subvault.db`             | SQLite file path         |
| `CORS_ORIGIN`   | `http://localhost:5173`          | Allowed frontend origin  |

---

## Connecting the Frontend

Update your React app's API calls to point to `http://localhost:3001/api`. Example:

```js
const API = "http://localhost:3001/api";

// Login
const res = await fetch(`${API}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const { token } = await res.json();

// Fetch subscriptions
const subs = await fetch(`${API}/subscriptions`, {
  headers: { Authorization: `Bearer ${token}` },
});
```
