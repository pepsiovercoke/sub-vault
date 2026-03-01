require("dotenv").config();
const db = require("./database");
const bcrypt = require("bcryptjs");

console.log("🌱 Seeding SubVault database...\n");

// ─── Create demo user ───
const hash = bcrypt.hashSync("password123", 10);

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (email, password, name) VALUES (?, ?, ?)
`);
insertUser.run("visionary@subvault.com", hash, "The Visionary");

const user = db.prepare("SELECT id FROM users WHERE email = ?").get("visionary@subvault.com");

// ─── Subscriptions ───
const insertSub = db.prepare(`
  INSERT INTO subscriptions (user_id, name, cost, currency, cycle, category, status, next_bill, notes, url)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const subs = [
  ["OpenAI API",          120,    "USD", "Monthly",   "AI & Tech",       "active", "2026-03-15", "GPT-4 Turbo access",        "https://platform.openai.com"],
  ["AWS",                 2400,   "USD", "Monthly",   "Cloud & Infra",   "active", "2026-03-01", "Production infrastructure",  "https://aws.amazon.com"],
  ["Figma Enterprise",    75,     "USD", "Monthly",   "Productivity",    "active", "2026-03-20", "Design team licenses",       "https://figma.com"],
  ["Bloomberg Terminal",  2083,   "USD", "Monthly",   "Finance",         "active", "2026-03-05", "Market intelligence",        "https://bloomberg.com"],
  ["Netflix Premium",     22.99,  "USD", "Monthly",   "Media & Content", "active", "2026-03-12", "4K streaming",              "https://netflix.com"],
  ["Anthropic API",       500,    "USD", "Monthly",   "AI & Tech",       "active", "2026-03-08", "Claude Opus access",        "https://console.anthropic.com"],
  ["Notion Teams",        10,     "USD", "Monthly",   "Productivity",    "paused", "2026-04-01", "Knowledge base",            "https://notion.so"],
  ["Datadog",             350,    "USD", "Monthly",   "Cloud & Infra",   "active", "2026-03-18", "Monitoring & APM",          "https://datadoghq.com"],
  ["Spotify Premium",     15.99,  "USD", "Monthly",   "Media & Content", "active", "2026-03-22", "Family plan",               "https://spotify.com"],
  ["GitHub Enterprise",   21,     "USD", "Monthly",   "AI & Tech",       "active", "2026-03-28", "Per seat",                  "https://github.com"],
  ["Vercel Pro",          20,     "USD", "Monthly",   "Cloud & Infra",   "active", "2026-03-10", "Frontend deployments",      "https://vercel.com"],
  ["Linear",              8,      "USD", "Monthly",   "Productivity",    "active", "2026-03-14", "Issue tracking",            "https://linear.app"],
  ["Stripe",              0,      "USD", "Monthly",   "Finance",         "active", "2026-03-01", "Transaction-based pricing", "https://stripe.com"],
  ["Slack Business+",     12.50,  "USD", "Monthly",   "Productivity",    "active", "2026-03-25", "Per user per month",        "https://slack.com"],
];

// Clear existing subs for this user
db.prepare("DELETE FROM subscriptions WHERE user_id = ?").run(user.id);
db.prepare("DELETE FROM spend_history WHERE user_id = ?").run(user.id);

const insertMany = db.transaction((items) => {
  for (const s of items) {
    insertSub.run(user.id, ...s);
  }
});
insertMany(subs);

// ─── Spend History (12 months) ───
const insertHistory = db.prepare(`
  INSERT OR REPLACE INTO spend_history (user_id, month, total) VALUES (?, ?, ?)
`);

const history = [
  ["2025-03", 4200],  ["2025-04", 4350],  ["2025-05", 4100],
  ["2025-06", 4500],  ["2025-07", 4800],  ["2025-08", 5100],
  ["2025-09", 5300],  ["2025-10", 5460],  ["2025-11", 5200],
  ["2025-12", 5500],  ["2026-01", 5600],  ["2026-02", 5598],
];

for (const [month, total] of history) {
  insertHistory.run(user.id, month, total);
}

const count = db.prepare("SELECT COUNT(*) as n FROM subscriptions WHERE user_id = ?").get(user.id);
console.log(`✅ Created user: visionary@subvault.com (password: password123)`);
console.log(`✅ Inserted ${count.n} subscriptions`);
console.log(`✅ Inserted ${history.length} months of spend history`);
console.log("\n🚀 Database seeded successfully!");
