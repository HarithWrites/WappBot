const { EventEmitter } = require("events");
const db = require("../db");

const bookingEvents = new EventEmitter();

class SlotAlreadyBookedError extends Error {
    constructor() {
        super("This slot has already been booked");
        this.name = "SlotAlreadyBookedError";
    }
}

function getSlotCapacity(tenant) {
    return Math.max(1, Number(tenant?.max_parallel_appointments) || 1);
}

async function getBookedSlotCounts(tenant_id, booking_date) {
    const res = await db.query(
        `SELECT booking_time, COUNT(*)::int AS booking_count
         FROM bookings
         WHERE tenant_id = $1
           AND booking_date = $2
           AND status IN ('pending', 'confirmed')
         GROUP BY booking_time`,
        [tenant_id, booking_date]
    );

    return new Map(
        res.rows.map((row) => [row.booking_time, row.booking_count])
    );
}

async function createBooking({
    tenant,
    tenant_id,
    phone,
    service_name,
    booking_date,
    booking_time
}) {
    const client = await db.connect();
    const slotKey = `${tenant_id}:${booking_date}:${booking_time}`;
    const capacity = getSlotCapacity(tenant);

    try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [slotKey]);

        const existing = await client.query(
            `SELECT COUNT(*)::int AS booking_count
             FROM bookings
             WHERE tenant_id = $1
               AND booking_date = $2
               AND booking_time = $3
               AND status IN ('pending', 'confirmed')`,
            [tenant_id, booking_date, booking_time]
        );

        const bookingCount = existing.rows[0]?.booking_count || 0;

        if (bookingCount >= capacity) {
            throw new SlotAlreadyBookedError();
        }

        const res = await client.query(
            `INSERT INTO bookings
            (tenant_id, phone, service_name, booking_date, booking_time, status)
            VALUES ($1, $2, $3, $4, $5, 'pending')
            RETURNING *`,
            [tenant_id, phone, service_name, booking_date, booking_time]
        );

        await client.query("COMMIT");

        const booking = res.rows[0];
        bookingEvents.emit("changed", {
            tenant_id,
            bookingId: booking.id,
            type: "created"
        });
        return booking;
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});

        if (err instanceof SlotAlreadyBookedError) {
            throw err;
        }

        throw err;
    } finally {
        client.release();
    }
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

async function updateBookingStatus(id, status, tenant_id) {
    const res = await db.query(
        `UPDATE bookings SET status=$1 WHERE id=$2 AND tenant_id=$3 RETURNING *`,
        [status, id, tenant_id]
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
    getBookedSlotCounts,
    getSlotCapacity,
    SlotAlreadyBookedError,
    updateBookingStatus
};
