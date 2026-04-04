const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const controller = require("../controllers/webhookController");
const { getTenantByBusinessName } = require("../services/tenantService");

async function verifySignature(req, res, next) {
    const signature = req.headers["x-hub-signature-256"];
    const businessName = req.params.businessName;

    if (!businessName) return res.sendStatus(400);

    const tenant = await getTenantByBusinessName(businessName);
    if (!tenant) return res.sendStatus(404);

    const appSecret = tenant.app_secret;
    if (!appSecret) {
        console.warn(`Tenant "${businessName}" missing app_secret! Blocking payload for security.`);
        return res.sendStatus(403);
    }

    if (!signature || !req.rawBody) {
        console.error("Missing signature or rawBody");
        return res.sendStatus(403);
    }

    const expectedSignature = "sha256=" + crypto.createHmac("sha256", appSecret).update(req.rawBody).digest("hex");

    try {
        const expectedBuffer = Buffer.from(expectedSignature);
        const signatureBuffer = Buffer.from(signature);
        if (expectedBuffer.length === signatureBuffer.length && crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
            req.tenant = tenant; 
            return next();
        }
    } catch (err) {
        console.error("Signature validation error:", err);
    }

    console.error("Signature mismatch");
    return res.sendStatus(403);
}

router.post("/:businessName", verifySignature, controller.handleWebhook);

router.get("/:businessName", async (req, res) => {
    const businessName = req.params.businessName;
    if (!businessName) return res.sendStatus(400);

    const tenant = await getTenantByBusinessName(businessName);
    if (!tenant) return res.sendStatus(404);

    const VERIFY_TOKEN = tenant.webhook_verify_token;
    if (!VERIFY_TOKEN) {
        console.warn(`Tenant "${businessName}" missing webhook_verify_token!`);
        return res.sendStatus(403);
    }

    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
        return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
});

module.exports = router;