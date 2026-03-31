const { EventEmitter } = require("events");
const db = require("../db");

const bookingEvents = new EventEmitter();

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

    const booking = res.rows[0];
    bookingEvents.emit("changed", {
        tenant_id,
        bookingId: booking.id,
        type: "created"
    });
    return booking;
}

async function getAllBookings(tenant_id, filters = {}) {
    let query = "SELECT * FROM bookings WHERE 1=1";
    let values = [];

    if (tenant_id) {
        values.push(tenant_id);
        query += ` AND tenant_id=$${values.length}`;
    }

    if (filters.range === "upcoming_30_days") {
        query += " AND booking_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '29 days'";
    }

    if (filters.date) {
        values.push(filters.date);
        query += ` AND booking_date=$${values.length}`;
    }

    if (filters.time) {
        values.push(filters.time);
        query += ` AND booking_time=$${values.length}`;
    }

    query += " ORDER BY booking_date ASC, booking_time ASC, created_at DESC";

    const res = await db.query(query, values);
    return res.rows;
}

async function updateBookingStatus(id, status) {
    const res = await db.query(
        `UPDATE bookings SET status=$1 WHERE id=$2 RETURNING *`,
        [status, id]
    );

    const booking = res.rows[0];

    if (booking) {
        bookingEvents.emit("changed", {
            tenant_id: booking.tenant_id,
            bookingId: booking.id,
            type: "updated"
        });
    }

    return booking;
}

module.exports = {
    bookingEvents,
    createBooking,
    getAllBookings,
    updateBookingStatus
};
