const db = require("../db");

async function getProvidersByTenant(tenantId) {
    const res = await db.query(
        `SELECT *
         FROM service_providers
         WHERE tenant_id = $1
           AND is_active = TRUE
         ORDER BY name ASC, id ASC`,
        [tenantId]
    );

    return res.rows;
}

async function getProvidersByTenantAndService(tenantId, serviceId) {
    const res = await db.query(
        `SELECT *
         FROM service_providers
         WHERE tenant_id = $1
           AND is_active = TRUE
           AND (service_id IS NULL OR service_id = $2)
         ORDER BY
             CASE WHEN service_id = $2 THEN 0 ELSE 1 END,
             name ASC,
             id ASC`,
        [tenantId, serviceId || null]
    );

    return res.rows;
}

module.exports = {
    getProvidersByTenant,
    getProvidersByTenantAndService
};
