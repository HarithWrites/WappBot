const db = require("../db");

async function getAllTenants() {
    const res = await db.query(
        "SELECT * FROM tenants ORDER BY business_name ASC, id ASC"
    );
    return res.rows;
}

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
         SET business_name = $2,
             timezone = $3,
             max_parallel_appointments = $4,
             workflow_config = $5
         WHERE id = $1
         RETURNING *`,
        [
            tenantId,
            settings.business_name,
            settings.timezone,
            settings.max_parallel_appointments,
            settings.workflow_config || null
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
