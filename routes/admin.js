const express = require("express");
const router = express.Router();

const controller = require("../controllers/adminController");

const { getTenantByAdminToken } = require("../services/tenantService");

// ===============================
// ADMIN AUTHENTICATION (SECURITY)
// ===============================
router.use(async (req, res, next) => {
    try {
        const token = req.query.token || req.body?.token;

        if (!token) {
            return res.status(401).json({ error: "Missing admin token" });
        }

        const tenant = await getTenantByAdminToken(token);

        if (!tenant) {
            return res.status(403).json({ error: "Invalid admin token" });
        }

        req.tenant = tenant;
        next();
    } catch (err) {
        console.error("admin auth error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

// ===============================


// ===============================
// GET BOOKINGS
// ===============================
router.get("/bookings", controller.getBookings);
router.get("/bookings/stream", controller.streamBookings);
router.get("/settings", controller.getSettings);
router.post("/settings", controller.updateSettings);

// ===============================
// APPROVE (POST ONLY)
// ===============================
router.post("/approve", controller.approveBooking);
router.post("/pending", controller.markPendingBooking);

// ===============================
// REJECT (POST ONLY)
// ===============================
router.post("/reject", controller.rejectBooking);

// ===============================
// OPTIONAL SAFETY (PREVENT CONFUSION)
// ===============================
router.get("/approve", (req, res) => {
    return res.status(405).send("Use POST method for approve");
});

router.get("/reject", (req, res) => {
    return res.status(405).send("Use POST method for reject");
});

module.exports = router;
