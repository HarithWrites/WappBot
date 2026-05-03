const express = require("express");
require("dotenv").config();
const { ensureDatabaseSchema } = require("./utils/dbInit");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Security Headers ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    // Allow SSE and admin portal — not a public API requiring strict CSP
    next();
});

// ── Body Parsing (with raw body for webhook HMAC verification) ────────────────
app.use(express.json({
    limit: "1mb",
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));

// ── Static Assets ─────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.sendFile("landing.html", { root: "public" }));
app.get("/dashboard", (req, res) => res.sendFile("index.html", { root: "public" }));
app.use(express.static("public"));

// 1. Bind port immediately so Railway health checks pass
const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(JSON.stringify({ level: "INFO", event: "server_start", port: PORT, time: new Date().toISOString() }));
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/webhook", require("./routes/webhook"));
app.use("/admin", require("./routes/admin"));

app.get("/health", (req, res) => {
    res.json({ status: "ok", uptime: Math.round(process.uptime()), ts: new Date().toISOString() });
});


// ── Global Error Handlers ─────────────────────────────────────────────────────
process.on("uncaughtException", (err) => {
    console.error(JSON.stringify({ level: "ERROR", event: "uncaught_exception", error: err.message, stack: err.stack?.slice(0, 500) }));
});

process.on("unhandledRejection", (err) => {
    console.error(JSON.stringify({ level: "ERROR", event: "unhandled_rejection", error: err?.message || String(err) }));
});

// ── Boot: Schema Init ─────────────────────────────────────────────────────────
async function boot() {
    try {
        console.log(JSON.stringify({ level: "INFO", event: "schema_check_start" }));
        await ensureDatabaseSchema();
        console.log(JSON.stringify({ level: "INFO", event: "schema_check_done" }));
    } catch (err) {
        console.error(JSON.stringify({ level: "ERROR", event: "schema_check_failed", error: err.message }));
    }
}

boot();

// ── Memory Monitor (every 5 minutes — not spammy) ────────────────────────────
setInterval(() => {
    const used = process.memoryUsage();
    console.log(JSON.stringify({
        level: "INFO",
        event: "memory_snapshot",
        rss_mb: Math.round(used.rss / 1024 / 1024),
        heap_mb: Math.round(used.heapUsed / 1024 / 1024),
        external_mb: Math.round(used.external / 1024 / 1024)
    }));
}, 5 * 60 * 1000); // every 5 minutes

// ── Graceful Shutdown ─────────────────────────────────────────────────────────
process.on("SIGTERM", () => {
    console.log(JSON.stringify({ level: "INFO", event: "sigterm_received" }));
    server.close(() => {
        const db = require("./db");
        db.end().then(() => {
            console.log(JSON.stringify({ level: "INFO", event: "shutdown_complete" }));
            process.exit(0);
        });
    });
});

process.on("SIGINT", () => {
    console.log(JSON.stringify({ level: "INFO", event: "sigint_received" }));
    process.exit(0);
});
