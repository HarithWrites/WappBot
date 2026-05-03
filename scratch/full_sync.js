const { Pool } = require('pg');

const railwayUrl = 'postgresql://postgres:iOUBtLQjdtnqcVbjttKIbzBKfmFGdpJv@caboose.proxy.rlwy.net:40715/railway';
const neonUrl = 'postgresql://neondb_owner:npg_4ikH9vVMWdfj@ep-broad-dream-aogtrx2z.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

async function fullSync() {
    const railwayPool = new Pool({ connectionString: railwayUrl, ssl: { rejectUnauthorized: false } });
    const neonPool = new Pool({ connectionString: neonUrl, ssl: { rejectUnauthorized: false } });

    try {
        console.log("=== FULL DATABASE SYNC: Railway → Neon ===\n");

        // Step 1: Drop ALL existing tables in Neon (clean slate)
        console.log("Step 1: Dropping all existing tables in Neon...");
        const neonTablesRes = await neonPool.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        `);
        for (const row of neonTablesRes.rows) {
            await neonPool.query(`DROP TABLE IF EXISTS "${row.table_name}" CASCADE`);
            console.log(`   Dropped: ${row.table_name}`);
        }

        // Also drop any orphaned sequences
        const neonSeqRes = await neonPool.query(`
            SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'
        `);
        for (const row of neonSeqRes.rows) {
            await neonPool.query(`DROP SEQUENCE IF EXISTS "${row.sequence_name}" CASCADE`);
            console.log(`   Dropped sequence: ${row.sequence_name}`);
        }

        // Step 2: Get sequences from Railway
        console.log("\nStep 2: Creating sequences from Railway...");
        const seqRes = await railwayPool.query(`
            SELECT sequence_name, start_value, increment, minimum_value, maximum_value, data_type
            FROM information_schema.sequences WHERE sequence_schema = 'public'
        `);
        for (const seq of seqRes.rows) {
            // Get current value of the sequence
            const currValRes = await railwayPool.query(`SELECT last_value, is_called FROM "${seq.sequence_name}"`);
            const lastVal = currValRes.rows[0].last_value;
            const isCalled = currValRes.rows[0].is_called;
            
            await neonPool.query(`CREATE SEQUENCE "${seq.sequence_name}" START WITH ${lastVal}`);
            if (isCalled) {
                await neonPool.query(`SELECT setval('${seq.sequence_name}', ${lastVal}, true)`);
            }
            console.log(`   Created sequence: ${seq.sequence_name} (current: ${lastVal})`);
        }

        // Step 3: Get full table DDL from Railway (using information_schema)
        console.log("\nStep 3: Creating tables in Neon...");
        const tablesRes = await railwayPool.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        `);
        const tables = tablesRes.rows.map(r => r.table_name);

        // For each table, build CREATE TABLE from column info
        for (const table of tables) {
            const colsRes = await railwayPool.query(`
                SELECT column_name, data_type, is_nullable, column_default, 
                       character_maximum_length, udt_name
                FROM information_schema.columns 
                WHERE table_name = $1 AND table_schema = 'public'
                ORDER BY ordinal_position
            `, [table]);

            let colDefs = [];
            for (const col of colsRes.rows) {
                let typeName;
                // Map data types properly
                switch (col.data_type) {
                    case 'integer': typeName = 'integer'; break;
                    case 'bigint': typeName = 'bigint'; break;
                    case 'text': typeName = 'text'; break;
                    case 'boolean': typeName = 'boolean'; break;
                    case 'date': typeName = 'date'; break;
                    case 'jsonb': typeName = 'jsonb'; break;
                    case 'json': typeName = 'json'; break;
                    case 'character varying':
                        typeName = col.character_maximum_length 
                            ? `character varying(${col.character_maximum_length})` 
                            : 'character varying';
                        break;
                    case 'timestamp with time zone': typeName = 'timestamp with time zone'; break;
                    case 'timestamp without time zone': typeName = 'timestamp without time zone'; break;
                    case 'time without time zone': typeName = 'time without time zone'; break;
                    case 'ARRAY': typeName = col.udt_name.replace(/^_/, '') + '[]'; break;
                    default: typeName = col.data_type;
                }

                let def = `"${col.column_name}" ${typeName}`;
                if (col.is_nullable === 'NO') def += ' NOT NULL';
                if (col.column_default !== null) def += ` DEFAULT ${col.column_default}`;
                colDefs.push(def);
            }

            const createSQL = `CREATE TABLE "${table}" (\n  ${colDefs.join(',\n  ')}\n)`;
            try {
                await neonPool.query(createSQL);
                console.log(`   ✅ Created table: ${table}`);
            } catch (err) {
                console.error(`   ❌ Error creating ${table}: ${err.message}`);
                console.error(`      SQL: ${createSQL.substring(0, 200)}...`);
            }
        }

        // Step 4: Copy data
        console.log("\nStep 4: Copying data...");
        for (const table of tables) {
            // Skip processed_webhooks (user said to ignore)
            if (table === 'processed_webhooks') {
                console.log(`   ⏭️ Skipping processed_webhooks (per user request)`);
                continue;
            }

            const dataRes = await railwayPool.query(`SELECT * FROM "${table}"`);
            if (dataRes.rows.length === 0) {
                console.log(`   ⏭️ ${table}: 0 rows, skipping`);
                continue;
            }

            const columns = Object.keys(dataRes.rows[0]);
            const colList = columns.map(c => `"${c}"`).join(', ');

            let insertedCount = 0;
            for (const row of dataRes.rows) {
                const values = columns.map((_, i) => `$${i + 1}`).join(', ');
                const vals = columns.map(c => row[c]);
                try {
                    await neonPool.query(
                        `INSERT INTO "${table}" (${colList}) VALUES (${values})`,
                        vals
                    );
                    insertedCount++;
                } catch (err) {
                    console.error(`   ❌ Error inserting into ${table}: ${err.message}`);
                }
            }
            console.log(`   ✅ ${table}: ${insertedCount}/${dataRes.rows.length} rows`);
        }

        // Step 5: Create Primary Keys and Unique Constraints
        console.log("\nStep 5: Creating constraints...");
        const constraintsRes = await railwayPool.query(`
            SELECT 
                cl.relname as table_name,
                con.conname as constraint_name,
                con.contype as constraint_type,
                pg_get_constraintdef(con.oid) as constraint_def
            FROM pg_constraint con
            JOIN pg_class cl ON cl.oid = con.conrelid
            JOIN pg_namespace ns ON ns.oid = con.connamespace
            WHERE ns.nspname = 'public'
            AND con.contype IN ('p', 'u', 'f')
            ORDER BY 
                CASE con.contype 
                    WHEN 'p' THEN 1  -- primary keys first
                    WHEN 'u' THEN 2  -- then unique
                    WHEN 'f' THEN 3  -- then foreign keys
                END
        `);

        for (const con of constraintsRes.rows) {
            const sql = `ALTER TABLE "${con.table_name}" ADD CONSTRAINT "${con.constraint_name}" ${con.constraint_def}`;
            try {
                await neonPool.query(sql);
                console.log(`   ✅ ${con.table_name}: ${con.constraint_name} (${con.constraint_type})`);
            } catch (err) {
                if (err.message.includes('already exists')) {
                    console.log(`   ℹ️ ${con.constraint_name}: already exists`);
                } else {
                    console.error(`   ❌ ${con.constraint_name}: ${err.message}`);
                }
            }
        }

        // Step 6: Create Indices (non-constraint ones)
        console.log("\nStep 6: Creating indices...");
        const indexRes = await railwayPool.query(`
            SELECT indexname, indexdef 
            FROM pg_indexes 
            WHERE schemaname = 'public'
            AND indexname NOT IN (
                SELECT conname FROM pg_constraint 
                JOIN pg_namespace ON pg_namespace.oid = connamespace 
                WHERE nspname = 'public'
            )
        `);

        for (const idx of indexRes.rows) {
            try {
                await neonPool.query(idx.indexdef);
                console.log(`   ✅ ${idx.indexname}`);
            } catch (err) {
                if (err.message.includes('already exists')) {
                    console.log(`   ℹ️ ${idx.indexname}: already exists`);
                } else {
                    console.error(`   ❌ ${idx.indexname}: ${err.message}`);
                }
            }
        }

        // Step 7: Sync sequence values
        console.log("\nStep 7: Syncing sequence values...");
        for (const seq of seqRes.rows) {
            const currValRes = await railwayPool.query(`SELECT last_value, is_called FROM "${seq.sequence_name}"`);
            const lastVal = currValRes.rows[0].last_value;
            const isCalled = currValRes.rows[0].is_called;
            await neonPool.query(`SELECT setval('${seq.sequence_name}', ${lastVal}, ${isCalled})`);
            console.log(`   ✅ ${seq.sequence_name} → ${lastVal}`);
        }

        console.log("\n=== SYNC COMPLETE ===");

    } catch (err) {
        console.error("FATAL ERROR:", err);
    } finally {
        await railwayPool.end();
        await neonPool.end();
    }
}

fullSync();
