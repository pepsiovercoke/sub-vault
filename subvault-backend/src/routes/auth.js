const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db/database");
const { authenticate, generateToken } = require("../middleware/auth");

const router = express.Router();

// ─── POST /api/auth/register ───
router.post("/register", (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: "Email, password, and name are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (exists) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const hash = bcrypt.hashSync(password, 12);
    const result = db.prepare(
      "INSERT INTO users (email, password, name) VALUES (?, ?, ?)"
    ).run(email, hash, name);

    const user = { id: result.lastInsertRowid, email, name };
    const token = generateToken(user);

    res.status(201).json({
      message: "Account created",
      token,
      user: { id: user.id, email: user.email, name: user.name }
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/auth/login ───
router.post("/login", (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = generateToken(user);

    res.json({
      message: "Logged in",
      token,
      user: { id: user.id, email: user.email, name: user.name }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/auth/me ───
router.get("/me", authenticate, (req, res) => {
  const user = db.prepare("SELECT id, email, name, created_at FROM users WHERE id = ?").get(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user });
});

// ─── PUT /api/auth/me ───
router.put("/me", authenticate, (req, res) => {
  try {
    const { name, email } = req.body;
    const updates = [];
    const params = [];

    if (name) { updates.push("name = ?"); params.push(name); }
    if (email) { updates.push("email = ?"); params.push(email); }

    if (!updates.length) return res.status(400).json({ error: "Nothing to update" });

    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(req.user.id);

    db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...params);

    const user = db.prepare("SELECT id, email, name FROM users WHERE id = ?").get(req.user.id);
    res.json({ message: "Profile updated", user });
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ error: "Email already taken" });
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
