const { Pool } = require('pg');

const railwayUrl = 'postgresql://postgres:iOUBtLQjdtnqcVbjttKIbzBKfmFGdpJv@caboose.proxy.rlwy.net:40715/railway';
const neonUrl = 'postgresql://neondb_owner:npg_4ikH9vVMWdfj@ep-broad-dream-aogtrx2z.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

async function getDbSchema(url, name) {
    const pool = new Pool({
        connectionString: url,
        ssl: { rejectUnauthorized: false }
    });
    try {
        console.log(`\n--- Fetching schema for ${name} ---`);
        
        // 1. Tables
        const tablesRes = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
        `);
        const tables = tablesRes.rows.map(r => r.table_name).sort();

        const schema = {};

        for (const table of tables) {
            // 2. Columns
            const colsRes = await pool.query(`
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_name = $1
                ORDER BY column_name
            `, [table]);
            
            // 3. Indices
            const indexRes = await pool.query(`
                SELECT indexname, indexdef
                FROM pg_indexes
                WHERE tablename = $1
                ORDER BY indexname
            `, [table]);

            // 4. Row Counts
            const countRes = await pool.query(`SELECT COUNT(*) FROM "${table}"`);

            schema[table] = {
                columns: colsRes.rows,
                indices: indexRes.rows,
                count: parseInt(countRes.rows[0].count)
            };
        }
        return schema;
    } catch (err) {
        console.error(`Error inspecting ${name}:`, err.message);
        return null;
    } finally {
        await pool.end();
    }
}

async function compare() {
    const railwaySchema = await getDbSchema(railwayUrl, 'Railway');
    const neonSchema = await getDbSchema(neonUrl, 'Neon');

    if (!railwaySchema || !neonSchema) {
        console.error("Failed to fetch one or both schemas.");
        return;
    }

    console.log("\n\n=== COMPARISON RESULTS ===");
    
    const railwayTables = Object.keys(railwaySchema).sort();
    const neonTables = Object.keys(neonSchema).sort();

    // 1. Check Missing Tables
    const missingInNeon = railwayTables.filter(t => !neonTables.includes(t));
    const extraInNeon = neonTables.filter(t => !railwayTables.includes(t));

    if (missingInNeon.length > 0) console.log("!! Missing tables in Neon:", missingInNeon.join(', '));
    if (extraInNeon.length > 0) console.log("?? Extra tables in Neon:", extraInNeon.join(', '));

    // 2. Compare existing tables
    const commonTables = railwayTables.filter(t => neonTables.includes(t));
    
    for (const table of commonTables) {
        console.log(`\nTable: [${table}]`);
        const rCount = railwaySchema[table].count;
        const nCount = neonSchema[table].count;
        if (rCount !== nCount) {
            console.log(`   !! Row Count Mismatch: Railway=${rCount}, Neon=${nCount}`);
        } else {
            console.log(`   -> Row Count Match: ${rCount}`);
        }

        // Compare Columns
        const rCols = railwaySchema[table].columns;
        const nCols = neonSchema[table].columns;
        
        if (JSON.stringify(rCols) !== JSON.stringify(nCols)) {
            console.log("   !! Column mismatch detected!");
            // Detailed column diff
            const rColNames = rCols.map(c => c.column_name);
            const nColNames = nCols.map(c => c.column_name);
            
            const missingCols = rColNames.filter(c => !nColNames.includes(c));
            const extraCols = nColNames.filter(c => !rColNames.includes(c));
            
            if (missingCols.length > 0) console.log("      - Missing columns in Neon:", missingCols.join(', '));
            if (extraCols.length > 0) console.log("      + Extra columns in Neon:", extraCols.join(', '));
            
            // Check type mismatches for common columns
            rCols.forEach(rc => {
                const nc = nCols.find(c => c.column_name === rc.column_name);
                if (nc && (rc.data_type !== nc.data_type || rc.is_nullable !== nc.is_nullable)) {
                    console.log(`      Mismatch in ${rc.column_name}: Railway=${rc.data_type}(null=${rc.is_nullable}), Neon=${nc.data_type}(null=${nc.is_nullable})`);
                }
            });
        } else {
            console.log("   -> Columns Match.");
        }

        // Compare Indices
        const rIdx = railwaySchema[table].indices.map(i => i.indexname).sort();
        const nIdx = neonSchema[table].indices.map(i => i.indexname).sort();
        
        if (JSON.stringify(rIdx) !== JSON.stringify(nIdx)) {
            console.log("   !! Index mismatch detected!");
            const missingIdx = rIdx.filter(i => !nIdx.includes(i));
            const extraIdx = nIdx.filter(i => !rIdx.includes(i));
            if (missingIdx.length > 0) console.log("      - Missing indices in Neon:", missingIdx.join(', '));
            if (extraIdx.length > 0) console.log("      + Extra indices in Neon:", extraIdx.join(', '));
        } else {
            console.log("   -> Indices Match.");
        }
    }
}

compare();
