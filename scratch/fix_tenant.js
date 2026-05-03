const { Pool } = require('pg');

const railwayUrl = 'postgresql://postgres:iOUBtLQjdtnqcVbjttKIbzBKfmFGdpJv@caboose.proxy.rlwy.net:40715/railway';
const neonUrl = 'postgresql://neondb_owner:npg_4ikH9vVMWdfj@ep-broad-dream-aogtrx2z.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

async function fixMissingTenant() {
    const rPool = new Pool({ connectionString: railwayUrl, ssl: { rejectUnauthorized: false } });
    const nPool = new Pool({ connectionString: neonUrl, ssl: { rejectUnauthorized: false } });

    try {
        // Find which tenant is missing
        const railwayTenants = await rPool.query('SELECT * FROM tenants');
        const neonTenants = await nPool.query('SELECT id FROM tenants');
        const neonIds = neonTenants.rows.map(r => r.id);

        const missing = railwayTenants.rows.filter(r => !neonIds.includes(r.id));
        console.log('Missing tenant IDs:', missing.map(t => t.id));

        for (const row of missing) {
            const cols = Object.keys(row);
            const colList = cols.map(c => `"${c}"`).join(', ');
            const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
            
            // Stringify any object/array values (jsonb columns)
            const vals = cols.map(c => {
                const v = row[c];
                if (v !== null && typeof v === 'object') {
                    return JSON.stringify(v);
                }
                return v;
            });

            try {
                await nPool.query(`INSERT INTO "tenants" (${colList}) VALUES (${placeholders})`, vals);
                console.log(`✅ Inserted tenant ID: ${row.id} (${row.business_name})`);
            } catch (err) {
                console.error(`❌ Error inserting tenant ${row.id}:`, err.message);
            }
        }

        // Verify final count
        const finalCount = await nPool.query('SELECT COUNT(*) FROM tenants');
        console.log(`\nFinal tenant count in Neon: ${finalCount.rows[0].count}`);

    } catch (err) {
        console.error('FATAL:', err);
    } finally {
        await rPool.end();
        await nPool.end();
    }
}

fixMissingTenant();
