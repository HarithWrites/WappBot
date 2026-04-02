const db = require("../db");

async function ensureDatabaseSchema() {
    await db.query(`
        ALTER TABLE tenants
        ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC'
    `);

    await db.query(`
        ALTER TABLE tenants
        ADD COLUMN IF NOT EXISTS max_parallel_appointments INTEGER NOT NULL DEFAULT 1
    `);

    await db.query(`
        ALTER TABLE bookings
        ADD COLUMN IF NOT EXISTS close_remarks TEXT
    `);

    await db.query(`
        ALTER TABLE bookings
        ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ
    `);

    await db.query(`
        UPDATE tenants
        SET max_parallel_appointments = 1
        WHERE max_parallel_appointments IS NULL
           OR max_parallel_appointments < 1
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
        CREATE INDEX IF NOT EXISTS processed_webhooks_processed_at_idx
        ON processed_webhooks (processed_at DESC)
    `);

    await db.query(`
        CREATE INDEX IF NOT EXISTS bookings_slot_lookup_idx
        ON bookings (tenant_id, booking_date, booking_time, status)
    `);

    await db.query(`
        DROP INDEX IF EXISTS bookings_active_slot_unique
    `);

    await db.query(`
        DELETE FROM processed_webhooks
        WHERE processed_at < NOW() - INTERVAL '30 days'
    `);
}

module.exports = {
    ensureDatabaseSchema
};
