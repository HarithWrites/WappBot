const axios = require("axios");

async function sendPayload({ tenant, payload }) {
    console.log("WhatsApp sendPayload", {
        tenantId: tenant?.id,
        phoneNumberId: tenant?.phone_number_id,
        to: payload?.to,
        type: payload?.type,
        payloadSummary: JSON.stringify(payload).slice(0, 1000)
    });

    try {
        const response = await axios.post(
            `https://graph.facebook.com/v19.0/${tenant.phone_number_id}/messages`,
            payload,
            {
                headers: {
                    Authorization: `Bearer ${tenant.token}`,
                    "Content-Type": "application/json"
                }
            }
        );

        console.log("WhatsApp sendPayload success", {
            status: response.status,
            data: response.data
        });
        return response.data;
    } catch (err) {
        console.error("WhatsApp error:", err.response?.data || err.message);
        throw err;
    }
}

async function sendMessage({ tenant, to, text }) {
    return sendPayload({
        tenant,
        payload: {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to,
            type: "text",
            text: { body: text }
        }
    });
}

async function sendButtonsMessage({ tenant, to, body, buttons, header, footer }) {
    return sendPayload({
        tenant,
        payload: {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to,
            type: "interactive",
            interactive: {
                type: "button",
                header: header ? { type: "text", text: header } : undefined,
                body: { text: body },
                footer: footer ? { text: footer } : undefined,
                action: {
                    buttons: buttons.map((button) => ({
                        type: "reply",
                        reply: {
                            id: button.id,
                            title: button.title
                        }
                    }))
                }
            }
        }
    });
}

async function sendListMessage({ tenant, to, body, buttonText, sections, header, footer }) {
    return sendPayload({
        tenant,
        payload: {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to,
            type: "interactive",
            interactive: {
                type: "list",
                header: header ? { type: "text", text: header } : undefined,
                body: { text: body },
                footer: footer ? { text: footer } : undefined,
                action: {
                    button: buttonText,
                    sections
                }
            }
        }
    });
}

module.exports = {
    sendMessage,
    sendButtonsMessage,
    sendListMessage
};
