const db = require("../db");

async function ensureDatabaseSchema() {
    await db.query(`
        ALTER TABLE tenants
        ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC'
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS processed_webhooks (
            message_id TEXT PRIMARY KEY,
            tenant_id INTEGER,
            phone TEXT,
            phone_number_id TEXT,
            processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS bookings_active_slot_unique
        ON bookings (tenant_id, booking_date, booking_time)
        WHERE status IN ('pending', 'confirmed')
    `);

    await db.query(`
        CREATE INDEX IF NOT EXISTS processed_webhooks_processed_at_idx
        ON processed_webhooks (processed_at DESC)
    `);

    await db.query(`
        DELETE FROM processed_webhooks
        WHERE processed_at < NOW() - INTERVAL '30 days'
    `);
}

module.exports = {
    ensureDatabaseSchema
};
