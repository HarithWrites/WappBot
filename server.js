const express = require("express");
require("dotenv").config();
const { ensureDatabaseSchema } = require("./utils/dbInit");

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Immediately Bind Port to pass Railway health checks
const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`>>> SERVER START: Port ${PORT} <<<`);
});

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

async function boot() {
    try {
        console.log("Lazy-loading schema check...");
        // await ensureDatabaseSchema(); // DISABLE ON EVERY BOOT TO SAVE MEMORY
        console.log("Boot sequence reached idle");
    } catch (err) {
        console.error("Schema init failed:", err);
    }
}

// Memory Monitor for Railway debugging
setInterval(() => {
    const used = process.memoryUsage();
    console.log(`MEMORY: RSS=${Math.round(used.rss / 1024 / 1024)}MB, Heap=${Math.round(used.heapUsed / 1024 / 1024)}MB`);
}, 30000);

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
