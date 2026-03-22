const express = require("express");
const webhookRoutes = require("./routes/webhook");
const adminRoutes = require("./routes/admin");
const db = require("./db");

const app = express();
app.use(express.json());

// ===============================
// HEALTH CHECK
// ===============================
app.get("/", (req, res) => {
    res.send("Enterprise Bot Running 🚀");
});

// ===============================
// ROUTES
// ===============================
app.use("/webhook", webhookRoutes);
app.use("/admin", adminRoutes);

// ===============================
// SERVE DASHBOARD
// ===============================
app.use(express.static("public"));

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