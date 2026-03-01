require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const path = require("path");

// Routes
const authRoutes = require("./routes/auth");
const oauthRoutes = require("./routes/oauth");
const subscriptionRoutes = require("./routes/subscriptions");
const analyticsRoutes = require("./routes/analytics");

const app = express();
const PORT = process.env.PORT || 3001;
const isProd = process.env.NODE_ENV === "production";

// ─── Security ───
app.use(helmet());
app.use(cors(
  isProd && process.env.CORS_ORIGIN
    ? {
        origin: process.env.CORS_ORIGIN.split(","),
        credentials: true,
      }
    : {
        // In development, allow any origin (localhost, 127.0.0.1, etc.)
        // so the Next.js frontend can talk to the API without CORS issues.
        origin: true,
        credentials: true,
      }
));

// ─── Rate Limiting ───
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, slow down" },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many auth attempts, try again later" },
});

// ─── Parsing & Logging ───
app.use(express.json({ limit: "1mb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// ─── Static files (for serving frontend build) ───
app.use(express.static(path.join(__dirname, "../public")));

// ─── Health Check ───
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "SubVault API",
    version: "1.0.0",
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// ─── API Routes ───
if (isProd) {
  app.use(limiter);
  app.use("/api/auth", authLimiter, authRoutes);
  app.use("/api/oauth", authLimiter, oauthRoutes);
} else {
  // In development, disable strict rate limiting to make debugging easier
  app.use("/api/auth", authRoutes);
  app.use("/api/oauth", oauthRoutes);
}
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/analytics", analyticsRoutes);

// ─── 404 Handler ───
app.use("/api/*", (req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// ─── SPA Fallback (serve frontend for non-API routes) ───
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// ─── Global Error Handler ───
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message,
  });
});

// ─── Start ───
app.listen(PORT, () => {
  console.log(`
  ┌──────────────────────────────────────┐
  │                                      │
  │   ✦  SubVault API — Running         │
  │                                      │
  │   Port:    ${String(PORT).padEnd(25)}│
  │   Mode:    ${(process.env.NODE_ENV || "development").padEnd(25)}│
  │   Health:  http://localhost:${PORT}/api/health  │
  │                                      │
  └──────────────────────────────────────┘
  `);
});

module.exports = app;
