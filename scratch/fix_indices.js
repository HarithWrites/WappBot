const { Pool } = require('pg');

const railwayUrl = 'postgresql://postgres:iOUBtLQjdtnqcVbjttKIbzBKfmFGdpJv@caboose.proxy.rlwy.net:40715/railway';
const neonUrl = 'postgresql://neondb_owner:npg_4ikH9vVMWdfj@ep-broad-dream-aogtrx2z.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

async function fixIndices() {
    const railwayPool = new Pool({ connectionString: railwayUrl, ssl: { rejectUnauthorized: false } });
    const neonPool = new Pool({ connectionString: neonUrl, ssl: { rejectUnauthorized: false } });

    try {
        console.log("--- Starting Index & Constraint Migration ---");

        // 1. Get all base tables
        const tablesRes = await railwayPool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
        `);
        const tables = tablesRes.rows.map(r => r.table_name);

        for (const table of tables) {
            console.log(`\nProcessing table: [${table}]`);

            // 2. Get Index Definitions
            const indexRes = await railwayPool.query(`
                SELECT indexdef
                FROM pg_indexes
                WHERE tablename = $1
                AND schemaname = 'public'
            `, [table]);

            for (const row of indexRes.rows) {
                const sql = row.indexdef;
                console.log(`Applying Index: ${sql}`);
                try {
                    await neonPool.query(sql);
                    console.log("   ✅ Success");
                } catch (e) {
                    if (e.message.includes("already exists")) {
                        console.log("   ℹ️ Already exists, skipping.");
                    } else {
                        console.error(`   ❌ Error: ${e.message}`);
                    }
                }
            }

            // 3. Get Foreign Key Constraints (Railway -> Neon)
            // Note: pg_indexes doesn't include FKs usually. They are in information_schema.table_constraints
            const constraintRes = await railwayPool.query(`
                SELECT 
                    conname, 
                    pg_get_constraintdef(c.oid) as condef
                FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                JOIN pg_class cl ON cl.oid = c.conrelid
                WHERE n.nspname = 'public'
                AND cl.relname = $1
                AND c.contype != 'p' -- skip primary keys since they are handled by indexdef usually, but let's check
            `, [table]);

            for (const row of constraintRes.rows) {
                const sql = `ALTER TABLE "${table}" ADD CONSTRAINT "${row.conname}" ${row.condef}`;
                console.log(`Applying Constraint: ${row.conname}`);
                try {
                    await neonPool.query(sql);
                    console.log("   ✅ Success");
                } catch (e) {
                    if (e.message.includes("already exists")) {
                        console.log("   ℹ️ Already exists, skipping.");
                    } else {
                        console.error(`   ❌ Error: ${e.message}`);
                    }
                }
            }
        }

        console.log("\n--- Migration Complete ---");

    } catch (err) {
        console.error("Fatal Error:", err);
    } finally {
        await railwayPool.end();
        await neonPool.end();
    }
}

fixIndices();
