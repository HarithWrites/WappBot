const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const controller = require("../controllers/webhookController");
const { getTenantByBusinessName } = require("../services/tenantService");

async function verifySignature(req, res, next) {
    const signature = req.headers["x-hub-signature-256"];
    const businessName = req.params.businessName;

    console.log("Webhook verify request", {
        method: req.method,
        path: req.originalUrl,
        businessName,
        signaturePresent: Boolean(signature),
        rawBodyLength: req.rawBody?.length || 0
    });

    if (!businessName) {
        console.warn("Webhook verify request missing businessName", { path: req.originalUrl });
        return res.sendStatus(400);
    }

    const tenant = await getTenantByBusinessName(businessName);
    if (!tenant) {
        console.error(`Tenant "${businessName}" not found in database`);
        return res.sendStatus(404);
    }

    console.log(`Found tenant "${businessName}" with ID ${tenant.id}, app_secret present: ${Boolean(tenant.app_secret)}`);

    const appSecret = tenant.app_secret;
    if (!appSecret) {
        console.error(`Tenant "${businessName}" missing app_secret! Please set it in the admin panel.`);
        return res.sendStatus(403);
    }

    if (!signature || !req.rawBody) {
        console.error("Missing signature or rawBody", {
            signaturePresent: Boolean(signature),
            rawBodyPresent: Boolean(req.rawBody)
        });
        return res.sendStatus(403);
    }

    const expectedSignature = "sha256=" + crypto.createHmac("sha256", appSecret).update(req.rawBody).digest("hex");

    console.log("Signature verification", {
        receivedSignature: signature,
        expectedSignature: expectedSignature,
        signaturesMatch: signature === expectedSignature
    });

    try {
        const expectedBuffer = Buffer.from(expectedSignature);
        const signatureBuffer = Buffer.from(signature);
        if (expectedBuffer.length === signatureBuffer.length && crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
            req.tenant = tenant;
            console.log("Signature verification passed, proceeding to webhook handler");
            return next();
        }
    } catch (err) {
        console.error("Signature validation error:", err);
    }

    console.error(`Signature mismatch for tenant: ${businessName}`);
    return res.sendStatus(403);
}

router.post("/:businessName", verifySignature, controller.handleWebhook);

router.post("/", (req, res) => {
    console.warn("Webhook POST hit without businessName path segment", {
        path: req.originalUrl,
        bodySummary: JSON.stringify(req.body || {}).slice(0, 500)
    });
    return res.status(400).send("Webhook URL must include tenant businessName, e.g. /webhook/:businessName");
});

router.get("/:businessName", async (req, res) => {
    const businessName = req.params.businessName;
    if (!businessName) return res.sendStatus(400);

    const mode = req.query["hub.mode"];

    // 1. Meta Webhook Verification Flow
    if (mode) {
        const tenant = await getTenantByBusinessName(businessName);
        if (!tenant) return res.sendStatus(404);

        const VERIFY_TOKEN = tenant.webhook_verify_token;
        if (!VERIFY_TOKEN) {
            console.warn(`Tenant "${businessName}" missing webhook_verify_token!`);
            return res.sendStatus(403);
        }

        const token = req.query["hub.verify_token"];
        const challenge = req.query["hub.challenge"];

        if (mode === "subscribe" && token === VERIFY_TOKEN) {
            return res.status(200).send(challenge);
        }
        return res.sendStatus(403);
    }

    // 2. Browser Dashboard Access Flow
    // Serve the tenant portal UI instead of returning 403
    const path = require("path");
    return res.sendFile(path.join(__dirname, "../public/index.html"));
});

module.exports = router;