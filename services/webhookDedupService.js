const db = require("../db");

async function claimWebhookMessage({
    messageId,
    tenantId,
    phone,
    phoneNumberId
}) {
    const res = await db.query(
        `INSERT INTO processed_webhooks (message_id, tenant_id, phone, phone_number_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (message_id) DO NOTHING
         RETURNING message_id`,
        [messageId, tenantId, phone, phoneNumberId]
    );

    return Boolean(res.rows[0]);
}

module.exports = {
    claimWebhookMessage
};
