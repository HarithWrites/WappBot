const db = require("../db");

// ===============================
// CREATE BOOKING
// ===============================
async function createBooking({ phone, service_id, date, time }) {
    const res = await db.query(
        `INSERT INTO bookings (phone, service_id, date, time, status)
         VALUES ($1,$2,$3,$4,'pending') RETURNING *`,
        [phone, service_id, date, time]
    );

    return res.rows[0];
}

// ===============================
// UPDATE STATUS
// ===============================
async function updateBookingStatus(id, status) {
    const res = await db.query(
        `UPDATE bookings
         SET status=$1
         WHERE id=$2
         RETURNING *`,
        [status, id]
    );

    return res.rows[0];
}

// ===============================
// GET SINGLE BOOKING
// ===============================
async function getBooking(id) {
    const res = await db.query(
        "SELECT * FROM bookings WHERE id=$1",
        [id]
    );

    return res.rows[0];
}

// ===============================
// GET ALL BOOKINGS (NEW)
// ===============================
async function getAllBookings() {
    const res = await db.query(
        "SELECT * FROM bookings ORDER BY created_at DESC"
    );

    return res.rows;
}

module.exports = {
    createBooking,
    updateBookingStatus,
    getBooking,
    getAllBookings
};