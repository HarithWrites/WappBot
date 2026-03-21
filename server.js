const express = require("express");
const webhookRoutes = require("./routes/webhook");
const db = require("./db");

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
    res.send("Enterprise Bot Running 🚀");
});

app.use("/webhook", webhookRoutes);

// Create tables (simple bootstrap)
db.query(`
CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY,
    phone TEXT,
    service_id INT,
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
    service_id INT,
    date TEXT,
    time TEXT
);
`);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Server running on " + PORT);
});