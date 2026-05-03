const express = require("express");
const router = express.Router();

const controller = require("../controllers/adminController");
const { getTenantByAdminToken } = require("../services/tenantService");

function isGlobalAdminToken(token) {
    const masterToken = String(
        process.env.MASTER_ADMIN_TOKEN
        || process.env.GLOBAL_ADMIN_TOKEN
        || ""
    ).trim();

    return Boolean(masterToken) && token === masterToken;
}

router.use(async (req, res, next) => {
    try {
        // SECURITY: Authorization header is preferred, but query params are supported for compatibility (e.g. EventSource)
        const token = String(
            req.headers.authorization?.replace('Bearer ', '') 
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

router.get("/portal-data", controller.getPortalData);
router.get("/bookings", controller.getBookings);
router.get("/bookings/stream", controller.streamBookings);
router.post("/approve", controller.approveBooking);
router.post("/waiting", controller.setWaitingBooking);
router.post("/close", controller.closeBooking);
router.post("/reject", controller.rejectBooking);

// Analytics & Communications
router.get("/analytics", controller.getAnalytics);
router.get("/messages", controller.getMessages);
router.get("/users", controller.getUsers);

// Workflow Management
router.get("/workflow", controller.getWorkflow);
router.get("/workflow/:tenantId", controller.getWorkflow);
router.post("/workflow/step", controller.upsertWorkflowStep);
router.delete("/workflow/step", controller.deleteWorkflowStep);
router.post("/workflow/reorder", controller.reorderWorkflowSteps);
router.post("/workflow/option", controller.upsertWorkflowOption);
router.delete("/workflow/option", controller.deleteWorkflowOption);

router.get("/approve", (req, res) => res.status(405).send("Use POST method for approve"));
router.get("/reject", (req, res) => res.status(405).send("Use POST method for reject"));

router.get("/settings", controller.getSettings);
router.put("/settings/config", controller.updateSettingsConfig);
router.post("/settings/services", controller.upsertService);
router.post("/settings/providers", controller.upsertProvider);

module.exports = router;
