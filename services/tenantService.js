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
             webhook_verify_token = COALESCE($12, webhook_verify_token),
             token = COALESCE($13, token),
             phone_number_id = COALESCE($14, phone_number_id)
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
            settings.webhook_verify_token ?? null,
            settings.token ?? null,
            settings.phone_number_id ?? null
        ]
    );

    return res.rows[0];
}

// ── Week-offs (separate table) ──
async function getWeekOffs(tenantId) {
    const res = await db.query(
        "SELECT day_of_week FROM tenant_week_offs WHERE tenant_id=$1 ORDER BY day_of_week",
        [String(tenantId)]
    );
    return res.rows.map(r => r.day_of_week);
}

async function setWeekOffs(tenantId, days) {
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        await client.query("DELETE FROM tenant_week_offs WHERE tenant_id=$1", [String(tenantId)]);
        for (const day of (days || [])) {
            const d = Number(day);
            if (d >= 0 && d <= 6) {
                await client.query(
                    "INSERT INTO tenant_week_offs (tenant_id, day_of_week) VALUES ($1,$2) ON CONFLICT DO NOTHING",
                    [String(tenantId), d]
                );
            }
        }
        await client.query("COMMIT");
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
}

// ── Holidays (separate table) ──
async function getHolidays(tenantId) {
    const res = await db.query(
        "SELECT to_char(holiday_date, 'YYYY-MM-DD') AS holiday_date FROM tenant_holidays WHERE tenant_id=$1 ORDER BY holiday_date",
        [String(tenantId)]
    );
    return res.rows.map(r => r.holiday_date);
}

async function setHolidays(tenantId, dates) {
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        await client.query("DELETE FROM tenant_holidays WHERE tenant_id=$1", [String(tenantId)]);
        for (const dateStr of (dates || [])) {
            if (dateStr) {
                await client.query(
                    "INSERT INTO tenant_holidays (tenant_id, holiday_date) VALUES ($1,$2::date) ON CONFLICT DO NOTHING",
                    [String(tenantId), dateStr]
                );
            }
        }
        await client.query("COMMIT");
    } catch (err) {
        await client.query("ROLLBACK");
        throw err;
    } finally {
        client.release();
    }
}

module.exports = {
    getAllTenants,
    getTenantById,
    getTenantByBusinessName,
    getTenantByPhoneNumberId,
    getTenantByAdminToken,
    updateTenantSettings,
    getWeekOffs,
    setWeekOffs,
    getHolidays,
    setHolidays
};
