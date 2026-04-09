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

// Connections are established on demand by the pool
module.exports = pool;
