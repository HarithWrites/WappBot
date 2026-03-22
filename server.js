const express = require("express");
const app = express();
require("dotenv").config();

// ===============================
// START LOG
// ===============================
console.log("🚀 SERVER BOOT STARTED");

// ===============================
// MIDDLEWARE
// ===============================
app.use(express.json());

// ===============================
// STATIC FILES (IMPORTANT FIX)
// ===============================
app.use(express.static("public"));

// ===============================
// DB
// ===============================
const db = require("./db");

db.connect()
    .then(() => console.log("✅ DB Connected"))
    .catch(err => console.error("DB Error:", err.message));

// ===============================
// ROUTES
// ===============================
app.use("/webhook", require("./routes/webhook"));
app.use("/admin", require("./routes/admin"));

// ===============================
// HEALTH CHECK (MOVE FROM "/")
// ===============================
app.get("/health", (req, res) => {
    res.send("OK");
});

// ===============================
// GLOBAL ERRORS
// ===============================
process.on("uncaughtException", (err) => {
    console.error("UNCAUGHT:", err);
});

process.on("unhandledRejection", (err) => {
    console.error("UNHANDLED:", err);
});

// ===============================
// START SERVER
// ===============================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`✅ SERVER RUNNING ON PORT ${PORT}`);
});