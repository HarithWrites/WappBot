const db = require("../db");

async function createBooking({
    tenant_id,
    phone,
    service_name,
    booking_date,
    booking_time
}) {
    const res = await db.query(
        `INSERT INTO bookings 
        (tenant_id, phone, service_name, booking_date, booking_time, status)
        VALUES ($1,$2,$3,$4,$5,'pending') RETURNING *`,
        [tenant_id, phone, service_name, booking_date, booking_time]
    );

    return res.rows[0];
}

async function getAllBookings(tenant_id, filters = {}) {
    let query = `SELECT * FROM bookings WHERE tenant_id=$1`;
    let values = [tenant_id];

    if (filters.date) {
        values.push(filters.date);
        query += ` AND booking_date=$${values.length}`;
    }

    if (filters.time) {
        values.push(filters.time);
        query += ` AND booking_time=$${values.length}`;
    }

    query += " ORDER BY created_at DESC";

    const res = await db.query(query, values);
    return res.rows;
}

async function updateBookingStatus(id, status) {
    const res = await db.query(
        `UPDATE bookings SET status=$1 WHERE id=$2 RETURNING *`,
        [status, id]
    );

    return res.rows[0];
}

module.exports = {
    createBooking,
    getAllBookings,
    updateBookingStatus
};