const logger = require("../utils/logger");
const { processMessage } = require("../services/conversationService");

// ===============================
// IN-MEMORY DEDUP STORE
// ===============================
const processedMessages = new Set();

// Optional: periodic cleanup safety (prevents memory growth)
setInterval(() => {
    if (processedMessages.size > 10000) {
        processedMessages.clear();
        logger.info("Processed message cache cleared");
    }
}, 10 * 60 * 1000); // every 10 mins

// ===============================
// MAIN WEBHOOK HANDLER
// ===============================
exports.handleWebhook = async (req, res) => {
    try {
        const value = req.body?.entry?.[0]?.changes?.[0]?.value;

        // ===============================
        // BASIC VALIDATION
        // ===============================
        if (!value) {
            return res.sendStatus(200);
        }

        // ===============================
        // IGNORE STATUS EVENTS (delivery/read)
        // ===============================
        if (value.statuses) {
            return res.sendStatus(200);
        }

        // ===============================
        // IGNORE IF NO MESSAGES
        // ===============================
        if (!value.messages || !Array.isArray(value.messages)) {
            return res.sendStatus(200);
        }

        const message = value.messages[0];

        // ===============================
        // EXTRA HARDENING
        // ===============================

        // ❌ Ignore if no sender
        if (!message.from) {
            return res.sendStatus(200);
        }

        // ❌ Ignore non-text messages (images, audio, etc.)
        if (message.type !== "text") {
            return res.sendStatus(200);
        }

        const messageId = message.id;
        const phone = message.from;
        const text = message.text?.body?.trim().toLowerCase();

        // ❌ Ignore empty text
        if (!text) {
            return res.sendStatus(200);
        }

        // ===============================
        // DEDUPLICATION (CRITICAL)
        // ===============================
        if (processedMessages.has(messageId)) {
            logger.info("Duplicate message ignored", { messageId });
            return res.sendStatus(200);
        }

        processedMessages.add(messageId);

        // Auto remove after 5 mins
        setTimeout(() => {
            processedMessages.delete(messageId);
        }, 5 * 60 * 1000);

        // ===============================
        // LOG VALID MESSAGE
        // ===============================
        logger.info("Valid user message received", {
            phone,
            text,
            messageId
        });

        // ===============================
        // PROCESS MESSAGE
        // ===============================
        await processMessage(phone, text);

        res.sendStatus(200);

    } catch (err) {
        logger.error("Webhook error", err);
        res.sendStatus(500);
    }
};