const db = require("../db");

async function getServices(tenant_id) {
    const res = await db.query(
        "SELECT * FROM services WHERE tenant_id=$1 ORDER BY id",
        [tenant_id]
    );
    return res.rows;
}

module.exports = { getServices };