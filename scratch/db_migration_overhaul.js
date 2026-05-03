/**
 * WappBot DB Migration — Overhaul
 * Runs once to:
 * 1. Create tenant_week_offs table
 * 2. Create tenant_holidays table
 * 3. Migrate existing JSONB data from tenants row
 * 4. Add customer_name to bookings + conversation_state
 */
require("dotenv").config();
const db = require("../db");

async function runMigration() {
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        console.log("Running WappBot overhaul migrations...");

        // ─── 1. tenant_week_offs ───
        await client.query(`
            CREATE TABLE IF NOT EXISTS tenant_week_offs (
                id SERIAL PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
                UNIQUE (tenant_id, day_of_week)
            )
        `);
        console.log("✓ tenant_week_offs table ready");

        // ─── 2. tenant_holidays ───
        await client.query(`
            CREATE TABLE IF NOT EXISTS tenant_holidays (
                id SERIAL PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                holiday_date DATE NOT NULL,
                label TEXT,
                UNIQUE (tenant_id, holiday_date)
            )
        `);
        console.log("✓ tenant_holidays table ready");

        // ─── 3. Migrate week_offs from JSONB ───
        const tenantsRes = await client.query("SELECT id, week_offs, business_holidays FROM tenants");
        let weekOffCount = 0, holidayCount = 0;

        for (const row of tenantsRes.rows) {
            // Migrate week_offs
            let weekOffs = [];
            if (row.week_offs) {
                try {
                    const parsed = typeof row.week_offs === "string" ? JSON.parse(row.week_offs) : row.week_offs;
                    if (Array.isArray(parsed)) weekOffs = parsed.map(Number).filter(n => n >= 0 && n <= 6);
                } catch (e) { /* skip */ }
            }
            for (const day of weekOffs) {
                await client.query(
                    `INSERT INTO tenant_week_offs (tenant_id, day_of_week) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                    [row.id, day]
                );
                weekOffCount++;
            }

            // Migrate business_holidays
            let holidays = [];
            if (row.business_holidays) {
                try {
                    const parsed = typeof row.business_holidays === "string" ? JSON.parse(row.business_holidays) : row.business_holidays;
                    if (Array.isArray(parsed)) holidays = parsed.filter(Boolean);
                } catch (e) { /* skip */ }
            }
            for (const date of holidays) {
                try {
                    await client.query(
                        `INSERT INTO tenant_holidays (tenant_id, holiday_date) VALUES ($1, $2::date) ON CONFLICT DO NOTHING`,
                        [row.id, date]
                    );
                    holidayCount++;
                } catch (e) { console.warn(`  Skipped holiday "${date}" for tenant ${row.id}:`, e.message); }
            }
        }
        console.log(`✓ Migrated ${weekOffCount} week-off records, ${holidayCount} holiday records`);

        // ─── 4. customer_name on bookings ───
        await client.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_name TEXT`);
        console.log("✓ bookings.customer_name column ready");

        // ─── 5. customer_name on conversation_state ───
        await client.query(`ALTER TABLE conversation_state ADD COLUMN IF NOT EXISTS customer_name TEXT`);
        console.log("✓ conversation_state.customer_name column ready");

        await client.query("COMMIT");
        console.log("\n✅ All migrations completed successfully.");
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("❌ Migration failed, rolled back:", err);
        process.exit(1);
    } finally {
        client.release();
        await db.end();
    }
}

runMigration();
