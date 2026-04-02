const {
    bookingEvents,
    getAllBookings,
    getSlotCapacity,
    updateBookingStatus
} = require("../services/bookingService");
const { updateTenantSettings } = require("../services/tenantService");
const { sendMessage } = require("../services/whatsappService");
const { formatDisplayDate } = require("../utils/validators");
const db = require("../db");

exports.getBookings = async (req, res) => {
    try {
        const tenant_id = req.tenant.id;
        const { date, time, range } = req.query;
        const data = await getAllBookings(tenant_id, { date, time, range });
        return res.json(data);
    } catch (err) {
        console.error("getBookings error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

exports.getSettings = async (req, res) => {
    return res.json({
        id: req.tenant.id,
        business_name: req.tenant.business_name || `Tenant ${req.tenant.id}`,
        timezone: req.tenant.timezone || "UTC",
        max_parallel_appointments: getSlotCapacity(req.tenant)
    });
};

exports.updateSettings = async (req, res) => {
    try {
        const timezone = String(req.body.timezone || "UTC").trim() || "UTC";
        const maxParallelAppointments = Math.max(
            1,
            Number.parseInt(req.body.max_parallel_appointments, 10) || 1
        );

        const tenant = await updateTenantSettings(req.tenant.id, {
            timezone,
            max_parallel_appointments: maxParallelAppointments
        });

        return res.json({
            success: true,
            tenant: {
                id: tenant.id,
                business_name: tenant.business_name || `Tenant ${tenant.id}`,
                timezone: tenant.timezone || "UTC",
                max_parallel_appointments: getSlotCapacity(tenant)
            }
        });
    } catch (err) {
        console.error("updateSettings error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

exports.streamBookings = async (req, res) => {
    const tenant_id = req.tenant.id;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const sendEvent = (payload) => {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    sendEvent({ type: "connected", tenant_id });

    const heartbeat = setInterval(() => {
        res.write(": keep-alive\n\n");
    }, 15000);

    const listener = (event) => {
        if (String(event.tenant_id) !== String(tenant_id)) {
            return;
        }

        sendEvent({
            type: event.type,
            bookingId: event.bookingId,
            tenant_id
        });
    };

    bookingEvents.on("changed", listener);

    req.on("close", () => {
        clearInterval(heartbeat);
        bookingEvents.off("changed", listener);
        res.end();
    });
};

async function getTenantByBooking(booking) {
    const tenantRes = await db.query(
        "SELECT * FROM tenants WHERE id=$1",
        [booking.tenant_id]
    );

    return tenantRes.rows[0];
}

function buildStatusMessage(status, booking, comment) {
    const commentLine = comment ? `\nComment: ${comment}` : "";
    const dateText = formatDisplayDate(booking.booking_date) || booking.booking_date;

    if (status === "confirmed") {
        return `Booking CONFIRMED.
Service: ${booking.service_name}
Date: ${dateText}
Time: ${booking.booking_time}${commentLine}`;
    }

    if (status === "rejected") {
        return `Booking REJECTED.
Service: ${booking.service_name}
Date: ${dateText}
Time: ${booking.booking_time}${commentLine}`;
    }

    return `Booking is still PENDING.
Service: ${booking.service_name}
Date: ${dateText}
Time: ${booking.booking_time}${commentLine}`;
}

async function handleStatusUpdate(req, res, status, logLabel) {
    try {
        const { bookingId, comment } = req.body;

        if (!bookingId) {
            return res.status(400).json({ error: "bookingId required" });
        }

        const booking = await updateBookingStatus(bookingId, status, req.tenant.id);

        if (!booking) {
            return res.status(404).json({ error: "Booking not found" });
        }

        const tenant = await getTenantByBooking(booking);

        if (tenant) {
            await sendMessage({
                tenant,
                to: booking.phone,
                text: buildStatusMessage(status, booking, comment)
            });
        }

        return res.json({ success: true });
    } catch (err) {
        console.error(`${logLabel} error:`, err);
        return res.status(500).json({ error: "Internal server error" });
    }
}

exports.approveBooking = (req, res) => {
    return handleStatusUpdate(req, res, "confirmed", "approveBooking");
};

exports.rejectBooking = (req, res) => {
    return handleStatusUpdate(req, res, "rejected", "rejectBooking");
};

exports.markPendingBooking = (req, res) => {
    return handleStatusUpdate(req, res, "pending", "markPendingBooking");
};
