const db = require("../db");

async function getTenantByPhoneNumberId(phoneNumberId) {
    const res = await db.query(
        "SELECT * FROM tenants WHERE phone_number_id=$1",
        [phoneNumberId]
    );
    return res.rows[0];
}

module.exports = { getTenantByPhoneNumberId };