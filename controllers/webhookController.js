const { processMessage } = require("../services/conversationService");
const { getTenantByPhoneNumberId } = require("../services/tenantService");

// ===============================
// DEDUP STORE (PREVENT DUPLICATES)
// ===============================
const processedMessages = new Set();

// Cleanup to avoid memory growth
setInterval(() => {
    if (processedMessages.size > 10000) {
        processedMessages.clear();
        console.log("Dedup cache cleared");
    }
}, 10 * 60 * 1000); // every 10 mins

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
        // DEDUPLICATION (IMPORTANT)
        // ===============================
        if (processedMessages.has(messageId)) {
            console.log("Duplicate ignored:", messageId);
            return res.sendStatus(200);
        }

        processedMessages.add(messageId);

        // Remove after 5 minutes
        setTimeout(() => {
            processedMessages.delete(messageId);
        }, 5 * 60 * 1000);

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
