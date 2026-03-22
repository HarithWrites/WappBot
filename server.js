// ===============================
// IMPORTS
// ===============================
const express = require("express");
const app = express();

require("dotenv").config();

// ===============================
// BASIC START LOG
// ===============================
console.log("🚀 SERVER BOOT STARTED");

// ===============================
// MIDDLEWARE
// ===============================
app.use(express.json());

// ===============================
// DB CONNECTION (SAFE)
// ===============================
const db = require("./db");

db.connect()
    .then(() => console.log("✅ DB Connected"))
    .catch((err) => {
        console.error("❌ DB Connection Failed:", err.message);
    });

// ===============================
// ROUTES
// ===============================
app.use("/webhook", require("./routes/webhook"));
app.use("/admin", require("./routes/admin"));

// ===============================
// HEALTH CHECK (IMPORTANT)
// ===============================
app.get("/", (req, res) => {
    res.send("Enterprise Bot Running 🚀");
});

app.get("/health", (req, res) => {
    res.send("OK");
});

// ===============================
// GLOBAL ERROR HANDLING
// ===============================
process.on("uncaughtException", (err) => {
    console.error("🔥 UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", (err) => {
    console.error("🔥 UNHANDLED REJECTION:", err);
});

// ===============================
// START SERVER
// ===============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`✅ SERVER RUNNING ON PORT ${PORT}`);
});