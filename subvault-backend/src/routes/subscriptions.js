const express = require("express");
const db = require("../db/database");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

// All routes require auth
router.use(authenticate);

const VALID_CATEGORIES = ["AI & Tech", "Cloud & Infra", "Media & Content", "Finance", "Productivity", "Health", "Other"];
const VALID_CYCLES = ["Monthly", "Quarterly", "Yearly"];
const VALID_STATUSES = ["active", "paused", "cancelled"];
const VALID_CURRENCIES = ["USD", "EUR", "GBP", "INR", "JPY"];

// ─── GET /api/subscriptions ───
// Query params: ?category=&status=&search=&sort=cost&order=desc&page=1&limit=20
router.get("/", (req, res) => {
  try {
    const { category, status, search, sort, order, page, limit } = req.query;

    let sql = "SELECT * FROM subscriptions WHERE user_id = ?";
    const params = [req.user.id];

    // Filters
    if (category && VALID_CATEGORIES.includes(category)) {
      sql += " AND category = ?";
      params.push(category);
    }
    if (status && VALID_STATUSES.includes(status)) {
      sql += " AND status = ?";
      params.push(status);
    }
    if (search) {
      sql += " AND (name LIKE ? OR notes LIKE ? OR category LIKE ?)";
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    // Sorting
    const sortMap = {
      cost: "cost",
      name: "name",
      "next-bill": "next_bill",
      created: "created_at",
      category: "category",
    };
    const sortCol = sortMap[sort] || "cost";
    const sortDir = order === "asc" ? "ASC" : "DESC";
    sql += ` ORDER BY ${sortCol} ${sortDir}`;

    // Pagination
    const p = Math.max(1, parseInt(page) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit) || 50));
    const offset = (p - 1) * l;

    // Get total count
    const countSql = sql.replace("SELECT *", "SELECT COUNT(*) as total");
    const { total } = db.prepare(countSql).get(...params);

    sql += " LIMIT ? OFFSET ?";
    params.push(l, offset);

    const subscriptions = db.prepare(sql).all(...params);

    res.json({
      subscriptions,
      pagination: {
        page: p,
        limit: l,
        total,
        pages: Math.ceil(total / l),
      },
    });
  } catch (err) {
    console.error("List subs error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/subscriptions/:id ───
router.get("/:id", (req, res) => {
  const sub = db.prepare(
    "SELECT * FROM subscriptions WHERE id = ? AND user_id = ?"
  ).get(req.params.id, req.user.id);

  if (!sub) return res.status(404).json({ error: "Subscription not found" });
  res.json({ subscription: sub });
});

// ─── POST /api/subscriptions ───
router.post("/", (req, res) => {
  try {
    const { name, cost, currency, cycle, category, status, next_bill, notes, url } = req.body;

    // Validation
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: "Name is required" });
    }
    if (cost === undefined || cost === null || isNaN(cost) || cost < 0) {
      return res.status(400).json({ error: "Valid cost is required" });
    }
    if (currency && !VALID_CURRENCIES.includes(currency)) {
      return res.status(400).json({ error: `Currency must be one of: ${VALID_CURRENCIES.join(", ")}` });
    }
    if (cycle && !VALID_CYCLES.includes(cycle)) {
      return res.status(400).json({ error: `Cycle must be one of: ${VALID_CYCLES.join(", ")}` });
    }
    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `Category must be one of: ${VALID_CATEGORIES.join(", ")}` });
    }

    const result = db.prepare(`
      INSERT INTO subscriptions (user_id, name, cost, currency, cycle, category, status, next_bill, notes, url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      name.trim(),
      parseFloat(cost),
      currency || "USD",
      cycle || "Monthly",
      category || "Other",
      status || "active",
      next_bill || null,
      notes || "",
      url || ""
    );

    const sub = db.prepare("SELECT * FROM subscriptions WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json({ message: "Subscription created", subscription: sub });
  } catch (err) {
    console.error("Create sub error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PUT /api/subscriptions/:id ───
router.put("/:id", (req, res) => {
  try {
    const existing = db.prepare(
      "SELECT * FROM subscriptions WHERE id = ? AND user_id = ?"
    ).get(req.params.id, req.user.id);

    if (!existing) return res.status(404).json({ error: "Subscription not found" });

    const { name, cost, currency, cycle, category, status, next_bill, notes, url } = req.body;

    // Validate provided fields
    if (currency && !VALID_CURRENCIES.includes(currency)) {
      return res.status(400).json({ error: `Currency must be one of: ${VALID_CURRENCIES.join(", ")}` });
    }
    if (cycle && !VALID_CYCLES.includes(cycle)) {
      return res.status(400).json({ error: `Cycle must be one of: ${VALID_CYCLES.join(", ")}` });
    }
    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `Category must be one of: ${VALID_CATEGORIES.join(", ")}` });
    }
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${VALID_STATUSES.join(", ")}` });
    }

    db.prepare(`
      UPDATE subscriptions SET
        name = ?, cost = ?, currency = ?, cycle = ?, category = ?,
        status = ?, next_bill = ?, notes = ?, url = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).run(
      name ?? existing.name,
      cost !== undefined ? parseFloat(cost) : existing.cost,
      currency || existing.currency,
      cycle || existing.cycle,
      category || existing.category,
      status || existing.status,
      next_bill ?? existing.next_bill,
      notes ?? existing.notes,
      url ?? existing.url,
      req.params.id,
      req.user.id
    );

    const updated = db.prepare("SELECT * FROM subscriptions WHERE id = ?").get(req.params.id);
    res.json({ message: "Subscription updated", subscription: updated });
  } catch (err) {
    console.error("Update sub error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PATCH /api/subscriptions/:id/toggle ───
router.patch("/:id/toggle", (req, res) => {
  const sub = db.prepare(
    "SELECT * FROM subscriptions WHERE id = ? AND user_id = ?"
  ).get(req.params.id, req.user.id);

  if (!sub) return res.status(404).json({ error: "Subscription not found" });

  const newStatus = sub.status === "active" ? "paused" : "active";
  db.prepare(
    "UPDATE subscriptions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(newStatus, sub.id);

  const updated = db.prepare("SELECT * FROM subscriptions WHERE id = ?").get(sub.id);
  res.json({ message: `Subscription ${newStatus}`, subscription: updated });
});

// ─── DELETE /api/subscriptions/:id ───
router.delete("/:id", (req, res) => {
  const sub = db.prepare(
    "SELECT id FROM subscriptions WHERE id = ? AND user_id = ?"
  ).get(req.params.id, req.user.id);

  if (!sub) return res.status(404).json({ error: "Subscription not found" });

  db.prepare("DELETE FROM subscriptions WHERE id = ?").run(sub.id);
  res.json({ message: "Subscription deleted" });
});

// ─── POST /api/subscriptions/bulk-delete ───
router.post("/bulk-delete", (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Provide an array of subscription IDs" });
  }

  const placeholders = ids.map(() => "?").join(",");
  const result = db.prepare(
    `DELETE FROM subscriptions WHERE id IN (${placeholders}) AND user_id = ?`
  ).run(...ids, req.user.id);

  res.json({ message: `Deleted ${result.changes} subscription(s)` });
});

module.exports = router;
