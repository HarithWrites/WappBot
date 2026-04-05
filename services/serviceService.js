const db = require("../db");

async function getServices(tenant_id) {
    const res = await db.query(
        "SELECT * FROM services WHERE tenant_id=$1 AND is_active = TRUE ORDER BY id",
        [tenant_id]
    );
    return res.rows;
}

async function getAllServices(tenant_id) {
    const res = await db.query(
        "SELECT * FROM services WHERE tenant_id=$1 ORDER BY id",
        [tenant_id]
    );
    return res.rows;
}

async function upsertService(tenant_id, serviceData) {
    if (serviceData.id) {
        const res = await db.query(
            `UPDATE services SET name=$2, is_active=$3 WHERE id=$1 AND tenant_id=$4 RETURNING *`,
            [serviceData.id, serviceData.name, serviceData.is_active, tenant_id]
        );
        return res.rows[0];
    } else {
        const res = await db.query(
            `INSERT INTO services (tenant_id, name, is_active) VALUES ($1, $2, $3) RETURNING *`,
            [tenant_id, serviceData.name, serviceData.is_active !== false]
        );
        return res.rows[0];
    }
}

module.exports = { getServices, getAllServices, upsertService };