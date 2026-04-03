const db = require("../db");

async function getTenantByPhoneNumberId(phoneNumberId) {
    const res = await db.query(
        "SELECT * FROM tenants WHERE phone_number_id=$1",
        [phoneNumberId]
    );
    return res.rows[0];
}

async function getTenantByAdminToken(adminToken) {
    const res = await db.query(
        "SELECT * FROM tenants WHERE admin_token=$1",
        [adminToken]
    );
    return res.rows[0];
}

async function updateTenantSettings(tenantId, settings) {
    const res = await db.query(
        `UPDATE tenants
         SET timezone = $2,
             max_parallel_appointments = $3,
             workflow_config = $4
         WHERE id = $1
         RETURNING *`,
        [
            tenantId,
            settings.timezone,
            settings.max_parallel_appointments,
            settings.workflow_config || null
        ]
    );

    return res.rows[0];
}

module.exports = {
    getTenantByPhoneNumberId,
    getTenantByAdminToken,
    updateTenantSettings
};
