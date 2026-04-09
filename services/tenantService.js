const db = require("../db");

async function getAllTenants() {
    const res = await db.query(
        "SELECT * FROM tenants ORDER BY business_name ASC, id ASC"
    );
    return res.rows;
}

async function getTenantByPhoneNumberId(phoneNumberId) {
    console.log("Looking up tenant for phone_number_id:", phoneNumberId);
    const res = await db.query(
        "SELECT * FROM tenants WHERE phone_number_id=$1",
        [phoneNumberId]
    );
    if (!res.rows[0]) {
        console.warn("No tenant found for phone_number_id:", phoneNumberId);
    } else {
        console.log("Found tenant:", res.rows[0].id, res.rows[0].business_name);
    }
    return res.rows[0];
}

async function getTenantByAdminToken(adminToken) {
    const res = await db.query(
        "SELECT * FROM tenants WHERE admin_token=$1",
        [adminToken]
    );
    return res.rows[0];
}

async function getTenantById(tenantId) {
    const res = await db.query(
        "SELECT * FROM tenants WHERE id=$1",
        [tenantId]
    );
    return res.rows[0];
}

async function getTenantByBusinessName(businessName) {
    const res = await db.query(
        "SELECT * FROM tenants WHERE business_name=$1",
        [businessName]
    );
    return res.rows[0];
}

async function updateTenantSettings(tenantId, settings) {
    const res = await db.query(
        `UPDATE tenants
         SET business_name = COALESCE($2, business_name),
             timezone = COALESCE($3, timezone),
             max_parallel_appointments = COALESCE($4, max_parallel_appointments),
             workflow_config = COALESCE($5, workflow_config),
             opening_hour = COALESCE($6, opening_hour),
             closing_hour = COALESCE($7, closing_hour),
             slot_duration = COALESCE($8, slot_duration),
             business_holidays = COALESCE($9, business_holidays),
             week_offs = COALESCE($10, week_offs),
             app_secret = COALESCE($11, app_secret),
             webhook_verify_token = COALESCE($12, webhook_verify_token)
         WHERE id = $1
         RETURNING *`,
        [
            tenantId,
            settings.business_name ?? null,
            settings.timezone ?? null,
            settings.max_parallel_appointments ?? null,
            settings.workflow_config ?? null,
            settings.opening_hour ?? null,
            settings.closing_hour ?? null,
            settings.slot_duration ?? null,
            settings.business_holidays ?? null,
            settings.week_offs ?? null,
            settings.app_secret ?? null,
            settings.webhook_verify_token ?? null
        ]
    );

    return res.rows[0];
}

module.exports = {
    getAllTenants,
    getTenantById,
    getTenantByBusinessName,
    getTenantByPhoneNumberId,
    getTenantByAdminToken,
    updateTenantSettings
};
