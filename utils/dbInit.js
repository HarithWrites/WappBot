const db = require("../db");

async function ensureDatabaseSchema() {
    await db.query(`
        ALTER TABLE tenants
        ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC'
    `);

    await db.query(`
        ALTER TABLE tenants
        ADD COLUMN IF NOT EXISTS business_name TEXT
    `);

    await db.query(`
        ALTER TABLE tenants
        ADD COLUMN IF NOT EXISTS max_parallel_appointments INTEGER NOT NULL DEFAULT 1
    `);

    await db.query(`
        ALTER TABLE tenants
        ADD COLUMN IF NOT EXISTS workflow_config JSONB
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
        ALTER TABLE bookings
        ADD COLUMN IF NOT EXISTS workflow_answers JSONB DEFAULT '{}'::jsonb
    `);

    await db.query(`
        ALTER TABLE bookings
        ADD COLUMN IF NOT EXISTS provider_id INTEGER
    `);

    await db.query(`
        ALTER TABLE bookings
        ADD COLUMN IF NOT EXISTS provider_name TEXT
    `);

    await db.query(`
        ALTER TABLE conversation_state
        ADD COLUMN IF NOT EXISTS workflow_step TEXT
    `);

    await db.query(`
        ALTER TABLE conversation_state
        ADD COLUMN IF NOT EXISTS workflow_context JSONB DEFAULT '{}'::jsonb
    `);

    await db.query(`
        UPDATE tenants
        SET max_parallel_appointments = 1
        WHERE max_parallel_appointments IS NULL
           OR max_parallel_appointments < 1
    `);

    await db.query(`
        UPDATE tenants
        SET business_name = CONCAT('Tenant ', id::text)
        WHERE business_name IS NULL
           OR btrim(business_name) = ''
    `);

    await db.query(`
        UPDATE conversation_state
        SET workflow_step = state
        WHERE workflow_step IS NULL
          AND state IS NOT NULL
    `);

    await db.query(`
        UPDATE conversation_state
        SET workflow_context = jsonb_strip_nulls(
            jsonb_build_object(
                'service_name', service_name,
                'date', date,
                'time', time
            )
        )
        WHERE workflow_context IS NULL
           OR workflow_context = '{}'::jsonb
    `);

    await db.query(`
        UPDATE bookings
        SET workflow_answers = '{}'::jsonb
        WHERE workflow_answers IS NULL
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
        CREATE TABLE IF NOT EXISTS service_providers (
            id SERIAL PRIMARY KEY,
            tenant_id INTEGER NOT NULL,
            service_id INTEGER,
            name TEXT NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await db.query(`
        CREATE INDEX IF NOT EXISTS service_providers_tenant_service_idx
        ON service_providers (tenant_id, service_id, is_active, name)
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
