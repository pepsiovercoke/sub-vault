const express = require("express");
const db = require("../db/database");
const { authenticate } = require("../middleware/auth");

const router = express.Router();
router.use(authenticate);

// Helper: calculate monthly equivalent
function monthize(cost, cycle) {
  if (cycle === "Yearly") return cost / 12;
  if (cycle === "Quarterly") return cost / 3;
  return cost;
}

// ─── GET /api/analytics/summary ───
// Returns top-level KPIs
router.get("/summary", (req, res) => {
  try {
    const subs = db.prepare(
      "SELECT * FROM subscriptions WHERE user_id = ?"
    ).all(req.user.id);

    const active = subs.filter((s) => s.status === "active");
    const paused = subs.filter((s) => s.status === "paused");

    const totalMonthly = active.reduce((sum, s) => sum + monthize(s.cost, s.cycle), 0);
    const totalAnnual = totalMonthly * 12;
    const avgPerService = active.length > 0 ? totalMonthly / active.length : 0;
    const pausedSavings = paused.reduce((sum, s) => sum + monthize(s.cost, s.cycle), 0);
    const dailyBurn = totalMonthly / 30;

    // Highest & lowest
    let highest = null, lowest = null;
    if (active.length) {
      highest = active.reduce((a, b) => monthize(a.cost, a.cycle) > monthize(b.cost, b.cycle) ? a : b);
      lowest = active.reduce((a, b) => monthize(a.cost, a.cycle) < monthize(b.cost, b.cycle) ? a : b);
    }

    res.json({
      summary: {
        total_subscriptions: subs.length,
        active_count: active.length,
        paused_count: paused.length,
        total_monthly: Math.round(totalMonthly * 100) / 100,
        total_annual: Math.round(totalAnnual * 100) / 100,
        avg_per_service: Math.round(avgPerService * 100) / 100,
        daily_burn: Math.round(dailyBurn * 100) / 100,
        paused_savings: Math.round(pausedSavings * 100) / 100,
        highest_cost: highest ? { name: highest.name, monthly: Math.round(monthize(highest.cost, highest.cycle) * 100) / 100 } : null,
        lowest_cost: lowest ? { name: lowest.name, monthly: Math.round(monthize(lowest.cost, lowest.cycle) * 100) / 100 } : null,
      },
    });
  } catch (err) {
    console.error("Summary error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/analytics/categories ───
// Returns spend breakdown by category
router.get("/categories", (req, res) => {
  try {
    const subs = db.prepare(
      "SELECT * FROM subscriptions WHERE user_id = ? AND status = 'active'"
    ).all(req.user.id);

    const catMap = {};
    let total = 0;

    for (const s of subs) {
      const mo = monthize(s.cost, s.cycle);
      total += mo;
      if (!catMap[s.category]) catMap[s.category] = { category: s.category, monthly: 0, count: 0, subscriptions: [] };
      catMap[s.category].monthly += mo;
      catMap[s.category].count++;
      catMap[s.category].subscriptions.push({ id: s.id, name: s.name, monthly: Math.round(mo * 100) / 100 });
    }

    const categories = Object.values(catMap)
      .map((c) => ({
        ...c,
        monthly: Math.round(c.monthly * 100) / 100,
        percentage: total > 0 ? Math.round((c.monthly / total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.monthly - a.monthly);

    res.json({ categories, total_monthly: Math.round(total * 100) / 100 });
  } catch (err) {
    console.error("Categories error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/analytics/trends ───
// Returns monthly spend history
router.get("/trends", (req, res) => {
  try {
    const history = db.prepare(
      "SELECT month, total FROM spend_history WHERE user_id = ? ORDER BY month ASC"
    ).all(req.user.id);

    // Also compute current month from active subs
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const active = db.prepare(
      "SELECT cost, cycle FROM subscriptions WHERE user_id = ? AND status = 'active'"
    ).all(req.user.id);

    const currentTotal = active.reduce((sum, s) => sum + monthize(s.cost, s.cycle), 0);

    // Merge or add current month
    const existing = history.find((h) => h.month === currentMonth);
    if (existing) {
      existing.total = Math.round(currentTotal * 100) / 100;
    } else {
      history.push({ month: currentMonth, total: Math.round(currentTotal * 100) / 100 });
    }

    // Calculate month-over-month change
    const trends = history.map((h, i) => {
      const prev = i > 0 ? history[i - 1].total : h.total;
      const change = prev > 0 ? ((h.total - prev) / prev) * 100 : 0;
      return {
        ...h,
        change_pct: Math.round(change * 10) / 10,
      };
    });

    res.json({ trends });
  } catch (err) {
    console.error("Trends error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/analytics/upcoming ───
// Returns upcoming renewals sorted by next_bill date
router.get("/upcoming", (req, res) => {
  try {
    const limit = Math.min(20, parseInt(req.query.limit) || 10);
    const days = parseInt(req.query.days) || 30;

    const today = new Date().toISOString().split("T")[0];
    const futureDate = new Date(Date.now() + days * 864e5).toISOString().split("T")[0];

    const upcoming = db.prepare(`
      SELECT id, name, cost, currency, cycle, category, next_bill, notes
      FROM subscriptions
      WHERE user_id = ? AND status = 'active'
        AND next_bill IS NOT NULL
        AND next_bill >= ? AND next_bill <= ?
      ORDER BY next_bill ASC
      LIMIT ?
    `).all(req.user.id, today, futureDate, limit);

    // Add days_until field
    const results = upcoming.map((s) => {
      const diff = Math.ceil((new Date(s.next_bill) - new Date()) / 864e5);
      return { ...s, days_until: diff };
    });

    res.json({ upcoming: results });
  } catch (err) {
    console.error("Upcoming error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/analytics/insights ───
// Returns smart insights and optimization suggestions
router.get("/insights", (req, res) => {
  try {
    const subs = db.prepare(
      "SELECT * FROM subscriptions WHERE user_id = ?"
    ).all(req.user.id);

    const active = subs.filter((s) => s.status === "active");
    const insights = [];

    // 1. Duplicate category warning
    const catCounts = {};
    for (const s of active) {
      catCounts[s.category] = (catCounts[s.category] || 0) + 1;
    }
    for (const [cat, count] of Object.entries(catCounts)) {
      if (count >= 3) {
        insights.push({
          type: "optimization",
          severity: "medium",
          title: `${count} subscriptions in ${cat}`,
          message: `You have ${count} active subscriptions in the ${cat} category. Consider consolidating to reduce overlap.`,
        });
      }
    }

    // 2. High-cost alerts
    const highCost = active.filter((s) => monthize(s.cost, s.cycle) > 500);
    for (const s of highCost) {
      insights.push({
        type: "cost_alert",
        severity: "high",
        title: `High-cost: ${s.name}`,
        message: `${s.name} costs $${monthize(s.cost, s.cycle).toFixed(0)}/month. Review if this provides adequate value.`,
        subscription_id: s.id,
      });
    }

    // 3. Annual savings opportunity
    const monthlySubs = active.filter((s) => s.cycle === "Monthly" && s.cost > 20);
    if (monthlySubs.length > 0) {
      const potentialSavings = monthlySubs.length * 0.15; // ~15% annual discount assumption
      insights.push({
        type: "savings",
        severity: "low",
        title: "Switch to annual billing",
        message: `${monthlySubs.length} service(s) are billed monthly. Switching to annual could save ~15% on average.`,
      });
    }

    // 4. Upcoming billing cluster
    const next7 = active.filter((s) => {
      if (!s.next_bill) return false;
      const d = Math.ceil((new Date(s.next_bill) - new Date()) / 864e5);
      return d >= 0 && d <= 7;
    });
    if (next7.length >= 3) {
      const totalDue = next7.reduce((sum, s) => sum + s.cost, 0);
      insights.push({
        type: "cashflow",
        severity: "medium",
        title: `${next7.length} renewals this week`,
        message: `$${totalDue.toFixed(0)} due across ${next7.length} subscriptions in the next 7 days.`,
      });
    }

    // Optimization score (0-100)
    let score = 80;
    if (highCost.length > 2) score -= 10;
    if (monthlySubs.length > 5) score -= 8;
    if (subs.filter((s) => s.status === "paused").length > 3) score -= 5;
    score = Math.max(0, Math.min(100, score));

    res.json({
      insights,
      optimization_score: score,
      total_insights: insights.length,
    });
  } catch (err) {
    console.error("Insights error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
