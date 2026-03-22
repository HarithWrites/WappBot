const { processMessage } = require("../services/conversationService");
const { getTenantByPhoneNumberId } = require("../services/tenantService");

const processed = new Set();

exports.handleWebhook = async (req, res) => {
    try {
        const value = req.body?.entry?.[0]?.changes?.[0]?.value;

        if (!value || value.statuses || !value.messages) {
            return res.sendStatus(200);
        }

        const msg = value.messages[0];

        if (!msg.from || msg.type !== "text") {
            return res.sendStatus(200);
        }

        if (processed.has(msg.id)) return res.sendStatus(200);
        processed.add(msg.id);

        setTimeout(() => processed.delete(msg.id), 300000);

        const tenant = await getTenantByPhoneNumberId(
            value.metadata.phone_number_id
        );

        if (!tenant) return res.sendStatus(200);

        await processMessage({
            tenant,
            phone: msg.from,
            text: msg.text.body.toLowerCase()
        });

        res.sendStatus(200);

    } catch (err) {
        console.error(err);
        res.sendStatus(500);
    }
};