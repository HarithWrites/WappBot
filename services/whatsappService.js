const axios = require("axios");

async function sendMessage({ tenant, to, text }) {
    try {
        await axios.post(
            `https://graph.facebook.com/v19.0/${tenant.phone_number_id}/messages`,
            {
                messaging_product: "whatsapp",
                to,
                text: { body: text }
            },
            {
                headers: {
                    Authorization: `Bearer ${tenant.token}`,
                    "Content-Type": "application/json"
                }
            }
        );
    } catch (err) {
        console.error("WhatsApp error:", err.response?.data || err.message);
    }
}

module.exports = { sendMessage };