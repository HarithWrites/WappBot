const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function checkTenants() {
    try {
        const res = await pool.query("SELECT id, business_name, app_secret, webhook_verify_token, phone_number_id FROM tenants");
        console.log("Tenants:");
        res.rows.forEach(tenant => {
            console.log(`ID: ${tenant.id}, Name: ${tenant.business_name}, App Secret: ${tenant.app_secret ? 'SET' : 'NOT SET'}, Webhook Token: ${tenant.webhook_verify_token ? 'SET' : 'NOT SET'}, Phone ID: ${tenant.phone_number_id}`);
        });
    } catch (err) {
        console.error("Error:", err);
    } finally {
        await pool.end();
    }
}

checkTenants();