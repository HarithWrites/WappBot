const express = require("express");
const path = require("path");

const webhookRoutes = require("./routes/webhook");
const adminRoutes = require("./routes/admin");
const db = require("./db");

const app = express();
app.use(express.json());

// ===============================
// API ROUTES FIRST (IMPORTANT)
// ===============================
app.use("/webhook", webhookRoutes);
app.use("/admin", adminRoutes);

// ===============================
// STATIC FILES (DASHBOARD)
// ===============================
app.use(express.static(path.join(__dirname, "public")));

// ===============================
// HEALTH CHECK (SAFE)
// ===============================
app.get("/health", (req, res) => {
    res.send("OK");
});

// ===============================
// NO catch-all route for now ❌
// ===============================

// ===============================
// DB TABLES
// ===============================
db.query(`
CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY,
    phone TEXT,
    service_id TEXT,
    date TEXT,
    time TEXT,
    status TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`);

db.query(`
CREATE TABLE IF NOT EXISTS conversation_state (
    phone TEXT PRIMARY KEY,
    state TEXT,
    service_id TEXT,
    date TEXT,
    time TEXT
);
`);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Server running on " + PORT);
});