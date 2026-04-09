const express = require("express");
require("dotenv").config();

const { ensureDatabaseSchema } = require("./utils/dbInit");

const app = express();

console.log("Server boot started");

app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(express.static("public"));

app.use("/webhook", require("./routes/webhook"));
app.use("/admin", require("./routes/admin"));

app.get("/health", (req, res) => {
    res.send("OK");
});

process.on("uncaughtException", (err) => {
    console.error("UNCAUGHT:", err);
});

process.on("unhandledRejection", (err) => {
    console.error("UNHANDLED:", err);
});

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});

async function boot() {
    try {
        await ensureDatabaseSchema();
        console.log("Database schema ready");
    } catch (err) {
        console.error("Schema init failed:", err);
    }
}

boot();

process.on("SIGTERM", () => {
    console.log("SIGTERM received, shutting down...");
    server.close(() => {
        const db = require("./db");
        db.end().then(() => {
            console.log("DB pool closed");
            process.exit(0);
        });
    });
});

process.on("SIGINT", () => {
    console.log("SIGINT received");
    process.exit(0);
});
