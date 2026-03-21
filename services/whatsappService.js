const axios = require("axios");
const logger = require("../utils/logger");

async function sendMessage(to, text) {
    try {
        await axios.post(
            `https://graph.facebook.com/v19.0/${process.env.PHONE_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to,
                text: { body: text }
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.TOKEN}`
                }
            }
        );

        logger.info("Message sent", { to });

    } catch (err) {
        logger.error("WhatsApp send failed", err);
    }
}

module.exports = { sendMessage };