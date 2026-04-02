const { processMessage } = require("../services/conversationService");
const { getTenantByPhoneNumberId } = require("../services/tenantService");
const { claimWebhookMessage } = require("../services/webhookDedupService");

// ===============================
// MAIN WEBHOOK HANDLER
// ===============================
function extractIncomingContent(message) {
    if (!message) {
        return null;
    }

    if (message.type === "text") {
        const text = message.text?.body;
        return text ? { text: text.trim(), payload: null } : null;
    }

    if (message.type === "button") {
        const payload = message.button?.payload || message.button?.text;
        const text = message.button?.text || payload;
        return payload ? { text: (text || "").trim(), payload: payload.trim() } : null;
    }

    if (message.type === "interactive") {
        const interactive = message.interactive || {};
        const reply = interactive.button_reply || interactive.list_reply;

        if (!reply?.id) {
            return null;
        }

        return {
            text: (reply.title || reply.id).trim(),
            payload: reply.id.trim()
        };
    }

    return null;
}

exports.handleWebhook = async (req, res) => {
    try {
        const value = req.body?.entry?.[0]?.changes?.[0]?.value;

        // ===============================
        // IGNORE INVALID EVENTS
        // ===============================
        if (!value) {
            return res.sendStatus(200);
        }

        // Ignore delivery/read receipts
        if (value.statuses) {
            return res.sendStatus(200);
        }

        // Ignore if no messages
        if (!value.messages || !Array.isArray(value.messages)) {
            return res.sendStatus(200);
        }

        const message = value.messages[0];

        // ===============================
        // HARD VALIDATION (CRITICAL)
        // ===============================
        if (!message) return res.sendStatus(200);

        // Ignore system/invalid messages
        if (!message.from) return res.sendStatus(200);

        const messageContent = extractIncomingContent(message);

        if (!messageContent) {
            return res.sendStatus(200);
        }

        const text = messageContent.text.trim().toLowerCase();
        const payload = messageContent.payload?.trim().toLowerCase() || null;

        if (!text) {
            return res.sendStatus(200);
        }

        const messageId = message.id;
        const phone = message.from;

        // ===============================
        // TENANT RESOLUTION (DYNAMIC)
        // ===============================
        const phoneNumberId = value.metadata?.phone_number_id;

        if (!phoneNumberId) {
            console.error("Missing phone_number_id");
            return res.sendStatus(200);
        }

        const tenant = await getTenantByPhoneNumberId(phoneNumberId);

        if (!tenant) {
            console.error("Tenant not found for:", phoneNumberId);
            return res.sendStatus(200);
        }

        // ===============================
        // DEDUPLICATION (DATABASE-BACKED)
        // ===============================
        const claimed = await claimWebhookMessage({
            messageId,
            tenantId: tenant.id,
            phone,
            phoneNumberId
        });

        if (!claimed) {
            console.log("Duplicate ignored:", messageId);
            return res.sendStatus(200);
        }

        // ===============================
        // LOG VALID MESSAGE
        // ===============================
        console.log("Incoming message", {
            tenant: tenant.id,
            phone,
            text,
            payload
        });

        // ===============================
        // PROCESS BUSINESS LOGIC
        // ===============================
        await processMessage({
            tenant,
            phone,
            text,
            payload
        });

        // ===============================
        // SUCCESS RESPONSE
        // ===============================
        res.sendStatus(200);

    } catch (err) {
        console.error("Webhook error:", err);

        // NEVER crash webhook
        res.sendStatus(500);
    }
};
