const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    },
    max: 10, // Reduced from 20 for platform stability
    idleTimeoutMillis: 10000, // Faster cleanup
    connectionTimeoutMillis: 5000
});

// Run a cheap query so we do not leak a checked-out client during boot.
pool.query("SELECT 1")
    .then(() => console.log("PostgreSQL connected"))
    .catch((err) => console.error("PostgreSQL error:", err.message));

module.exports = pool;
