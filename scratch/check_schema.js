require("dotenv").config();
const db = require("../db");
async function main() {
    const r = await db.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='tenants' ORDER BY ordinal_position");
    r.rows.forEach(c => console.log(c.column_name, "-", c.data_type));
    await db.end();
}
main().catch(e => { console.error(e); process.exit(1); });
