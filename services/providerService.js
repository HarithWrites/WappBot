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

async function getAllProvidersByTenant(tenantId) {
    const res = await db.query(
        `SELECT *
         FROM service_providers
         WHERE tenant_id = $1
         ORDER BY name ASC, id ASC`,
        [tenantId]
    );
    return res.rows;
}

async function upsertProvider(tenant_id, providerData) {
    if (providerData.id) {
        const res = await db.query(
            `UPDATE service_providers SET name=$2, is_active=$3, service_id=$4 WHERE id=$1 AND tenant_id=$5 RETURNING *`,
            [providerData.id, providerData.name, providerData.is_active, providerData.service_id || null, tenant_id]
        );
        return res.rows[0];
    } else {
        const res = await db.query(
            `INSERT INTO service_providers (tenant_id, name, is_active, service_id) VALUES ($1, $2, $3, $4) RETURNING *`,
            [tenant_id, providerData.name, providerData.is_active !== false, providerData.service_id || null]
        );
        return res.rows[0];
    }
}

module.exports = {
    getProvidersByTenant,
    getProvidersByTenantAndService,
    getAllProvidersByTenant,
    upsertProvider
};
