const db = require("../db");

async function createBooking({ phone, service_id, date, time }) {
    const result = await db.query(
        `INSERT INTO bookings (phone, service_id, date, time, status)
         VALUES ($1,$2,$3,$4,'pending') RETURNING *`,
        [phone, service_id, date, time]
    );

    return result.rows[0];
}

module.exports = { createBooking };