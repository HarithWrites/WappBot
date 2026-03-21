const logger = require("../utils/logger");
const { processMessage } = require("../services/conversationService");

exports.handleWebhook = async (req, res) => {
    try {
        const value = req.body.entry?.[0]?.changes?.[0]?.value;

        if (!value?.messages) return res.sendStatus(200);

        const message = value.messages[0];

        if (message.type !== "text") return res.sendStatus(200);

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