const logger = require("../utils/logger");
const { processMessage } = require("../services/conversationService");

const processedMessages = new Set();

exports.handleWebhook = async (req, res) => {
    try {
        const value = req.body.entry?.[0]?.changes?.[0]?.value;

        // ❌ Ignore status updates
        if (value?.statuses) {
            return res.sendStatus(200);
        }

        // ❌ Ignore non-message events
        if (!value?.messages) {
            return res.sendStatus(200);
        }

        const message = value.messages[0];

        // ❌ Ignore non-text
        if (message.type !== "text") {
            return res.sendStatus(200);
        }

        const messageId = message.id;

        // ❌ Prevent duplicates
        if (processedMessages.has(messageId)) {
            return res.sendStatus(200);
        }
        processedMessages.add(messageId);

        const phone = message.from;
        const text = message.text.body.toLowerCase();

        logger.info("Incoming message", { phone, text });

        await processMessage(phone, text);

        res.sendStatus(200);

    } catch (err) {
        logger.error("Webhook error", err);
        res.sendStatus(500);
    }
};