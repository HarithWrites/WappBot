const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");

const controller = require("../controllers/adminController");
const { getTenantByAdminToken } = require("../services/tenantService");

// ── Rate Limiters ──────────────────────────────────────────────────────────────
// Dashboard API: 120 requests per 15 minutes per IP (relaxed for active admin use)
const adminApiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please wait a moment and try again." },
    skip: (req) => req.path === "/bookings/stream" // SSE stream must not be rate-limited
});

// Broadcast is sensitive: 10 broadcast calls per 15 minutes per IP
const broadcastLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Broadcast rate limit reached. Max 10 broadcasts per 15 minutes." }
});

// Auth write operations: 30 per 15 minutes per IP
const authWriteLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please slow down." }
});

// ── Helper ─────────────────────────────────────────────────────────────────────
function isGlobalAdminToken(token) {
    const masterToken = String(
        process.env.MASTER_ADMIN_TOKEN
        || process.env.GLOBAL_ADMIN_TOKEN
        || ""
    ).trim();

    return Boolean(masterToken) && token === masterToken;
}

// ── Auth Middleware ─────────────────────────────────────────────────────────────
router.use(async (req, res, next) => {
    try {
        // SECURITY: Authorization header is preferred; query param only for SSE (EventSource)
        const token = String(
            req.headers.authorization?.replace("Bearer ", "")
            || req.body?.token
            || req.query?.token
            || ""
        ).trim();

        if (!token) {
            return res.status(401).json({ error: "Missing admin token. Use Authorization header or POST body." });
        }

        if (isGlobalAdminToken(token)) {
            req.adminScope = "global";
            req.adminToken = token;
            return next();
        }

        const tenant = await getTenantByAdminToken(token);

        if (!tenant) {
            return res.status(403).json({ error: "Invalid admin token" });
        }

        req.adminScope = "tenant";
        req.adminToken = token;
        req.tenant = tenant;
        return next();
    } catch (err) {
        console.error("admin auth error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

// ── Apply general rate limiter to all admin routes ─────────────────────────────
router.use(adminApiLimiter);

// ── Portal & Bookings ──────────────────────────────────────────────────────────
router.get("/portal-data", controller.getPortalData);
router.get("/bookings", controller.getBookings);
router.get("/bookings/stream", controller.streamBookings);

// ── Booking Actions (limited write operations) ─────────────────────────────────
router.post("/approve", authWriteLimiter, controller.approveBooking);
router.post("/waiting", authWriteLimiter, controller.setWaitingBooking);
router.post("/close", authWriteLimiter, controller.closeBooking);
router.post("/reject", authWriteLimiter, controller.rejectBooking);

// Method guard helpers
router.get("/approve", (req, res) => res.status(405).send("Use POST method for approve"));
router.get("/reject", (req, res) => res.status(405).send("Use POST method for reject"));

// ── Analytics & Communications ─────────────────────────────────────────────────
router.get("/analytics", controller.getAnalytics);
router.get("/messages", controller.getMessages);
router.get("/users", controller.getUsers);

// ── Broadcast ─────────────────────────────────────────────────────────────────
router.post("/broadcast", broadcastLimiter, controller.broadcast);

// ── Workflow Management ────────────────────────────────────────────────────────
router.get("/workflow", controller.getWorkflow);
router.get("/workflow/:tenantId", controller.getWorkflow);
router.post("/workflow/step", authWriteLimiter, controller.upsertWorkflowStep);
router.delete("/workflow/step", authWriteLimiter, controller.deleteWorkflowStep);
router.post("/workflow/reorder", authWriteLimiter, controller.reorderWorkflowSteps);
router.post("/workflow/option", authWriteLimiter, controller.upsertWorkflowOption);
router.delete("/workflow/option", authWriteLimiter, controller.deleteWorkflowOption);

// ── Settings ───────────────────────────────────────────────────────────────────
router.get("/settings", controller.getSettings);
router.put("/settings/config", authWriteLimiter, controller.updateSettingsConfig);
router.post("/settings/services", authWriteLimiter, controller.upsertService);
router.post("/settings/providers", authWriteLimiter, controller.upsertProvider);

module.exports = router;
