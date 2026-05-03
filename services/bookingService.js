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
           AND booking_date::date = $2
           AND status IN ('pending', 'waiting', 'confirmed')
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
    booking_time,
    workflow_answers = {},
    provider_id = null,
    provider_name = null,
    customer_name = null
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
               AND booking_date::date = $2
               AND booking_time = $3
               AND status IN ('pending', 'waiting', 'confirmed')`,
            [tenant_id, booking_date, booking_time]
        );

        const bookingCount = existing.rows[0]?.booking_count || 0;

        if (bookingCount >= capacity) {
            throw new SlotAlreadyBookedError();
        }

        const res = await client.query(
            `INSERT INTO bookings
            (tenant_id, phone, service_name, booking_date, booking_time, status, workflow_answers, provider_id, provider_name, customer_name)
            VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9)
            RETURNING *`,
            [
                tenant_id,
                phone,
                service_name,
                booking_date,
                booking_time,
                JSON.stringify(workflow_answers || {}),
                provider_id,
                provider_name,
                customer_name || null
            ]
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
    const values = [];
    let where = "WHERE 1=1";

    if (tenant_id) {
        values.push(tenant_id);
        where += ` AND b.tenant_id=$${values.length}`;
    }

    const localDate = "(CURRENT_TIMESTAMP AT TIME ZONE COALESCE(t.timezone, 'UTC'))::date";

    if (filters.range === "upcoming_30_days") {
        where += ` AND b.booking_date::date BETWEEN ${localDate} AND ${localDate} + INTERVAL '29 days'`;
    } else if (filters.range === "today") {
        where += ` AND b.booking_date::date = ${localDate}`;
    } else if (filters.range === "tomorrow") {
        where += ` AND b.booking_date::date = ${localDate} + INTERVAL '1 day'`;
    } else if (filters.range === "future") {
        where += ` AND b.booking_date::date > ${localDate} + INTERVAL '1 day'`;
    } else if (filters.range === "past") {
        where += ` AND b.booking_date::date < ${localDate}`;
    } else if (filters.range === "this_week") {
        where += ` AND b.booking_date::date >= date_trunc('week', ${localDate}) AND b.booking_date::date < date_trunc('week', ${localDate}) + INTERVAL '1 week'`;
    } else if (filters.range === "this_month") {
        where += ` AND b.booking_date::date >= date_trunc('month', ${localDate}) AND b.booking_date::date < date_trunc('month', ${localDate}) + INTERVAL '1 month'`;
    }

    if (filters.date) {
        values.push(filters.date);
        where += ` AND b.booking_date::date=$${values.length}`;
    }

    if (filters.time) {
        values.push(filters.time);
        where += ` AND b.booking_time=$${values.length}`;
    }

    if (filters.status && filters.status !== "all") {
        values.push(filters.status);
        where += ` AND b.status=$${values.length}`;
    }

    if (filters.tenantId) {
        values.push(filters.tenantId);
        where += ` AND b.tenant_id=$${values.length}`;
    }

    if (filters.search) {
        values.push(`%${String(filters.search).trim().toLowerCase()}%`);
        where += ` AND (
            LOWER(COALESCE(t.business_name, '')) LIKE $${values.length}
            OR LOWER(COALESCE(b.service_name, '')) LIKE $${values.length}
            OR LOWER(COALESCE(b.phone, '')) LIKE $${values.length}
            OR LOWER(COALESCE(b.status, '')) LIKE $${values.length}
            OR LOWER(COALESCE(b.provider_name, '')) LIKE $${values.length}
            OR LOWER(COALESCE(b.close_remarks, '')) LIKE $${values.length}
            OR LOWER(COALESCE(b.customer_name, '')) LIKE $${values.length}
        )`;
    }

    const page = Math.max(1, Number.parseInt(filters.page, 10) || 1);
    const pageSize = Math.max(1, Math.min(100, Number.parseInt(filters.pageSize, 10) || 20));
    const offset = (page - 1) * pageSize;

    values.push(pageSize);
    const limitParam = `$${values.length}`;
    values.push(offset);
    const offsetParam = `$${values.length}`;

    const baseFrom = `
        FROM bookings b
        LEFT JOIN tenants t ON t.id = b.tenant_id
        ${where}
    `;

    const rowsQuery = `
        SELECT
            b.*,
            COALESCE(t.business_name, CONCAT('Tenant ', b.tenant_id::text)) AS tenant_name
        ${baseFrom}
        ORDER BY
            CASE b.status
                WHEN 'pending' THEN 0
                WHEN 'waiting' THEN 1
                WHEN 'confirmed' THEN 2
                WHEN 'rejected' THEN 3
                WHEN 'closed' THEN 4
                ELSE 5
            END,
            b.booking_date ASC,
            b.booking_time ASC,
            b.created_at DESC
        LIMIT ${limitParam}
        OFFSET ${offsetParam}
    `;

    const countQuery = `
        SELECT COUNT(*)::int AS total
        ${baseFrom}
    `;

    const [rowsRes, countRes] = await Promise.all([
        db.query(rowsQuery, values),
        db.query(countQuery, values.slice(0, values.length - 2))
    ]);

    return {
        rows: rowsRes.rows,
        total: countRes.rows[0]?.total || 0,
        page,
        pageSize
    };
}

async function updateBookingStatus(id, status, tenant_id, options = {}) {
    const remarks = options.remarks ? String(options.remarks).trim() : "";
    const closedAt = status === "closed" ? new Date().toISOString() : null;
    const res = await db.query(
        `UPDATE bookings
         SET status = $1,
             close_remarks = CASE WHEN $1 = 'closed' THEN $4 ELSE close_remarks END,
             closed_at = CASE WHEN $1 = 'closed' THEN $5 ELSE closed_at END
         WHERE id = $2 AND tenant_id = $3
         RETURNING *`,
        [status, id, tenant_id, remarks || null, closedAt]
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
