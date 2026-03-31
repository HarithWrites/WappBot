const {
    bookingEvents,
    getAllBookings,
    updateBookingStatus
} = require("../services/bookingService");

const { sendMessage } = require("../services/whatsappService");
const db = require("../db");

// ===============================
// GET BOOKINGS
// ===============================
exports.getBookings = async (req, res) => {
    try {
        const { tenant_id, date, time, range } = req.query;

        const data = await getAllBookings(tenant_id, { date, time, range });

        return res.json(data);

    } catch (err) {
        console.error("getBookings error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

exports.streamBookings = async (req, res) => {
    const { tenant_id } = req.query;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const sendEvent = (payload) => {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    sendEvent({ type: "connected", tenant_id: tenant_id || null });

    const heartbeat = setInterval(() => {
        res.write(": keep-alive\n\n");
    }, 15000);

    const listener = (event) => {
        if (tenant_id && String(event.tenant_id) !== String(tenant_id)) {
            return;
        }

        sendEvent({
            type: event.type,
            bookingId: event.bookingId,
            tenant_id: tenant_id || null
        });
    };

    bookingEvents.on("changed", listener);

    req.on("close", () => {
        clearInterval(heartbeat);
        bookingEvents.off("changed", listener);
        res.end();
    });
};

// ===============================
// APPROVE BOOKING
// ===============================
exports.approveBooking = async (req, res) => {
    try {
        const { bookingId } = req.body;

        if (!bookingId) {
            return res.status(400).json({ error: "bookingId required" });
        }

        const booking = await updateBookingStatus(bookingId, "confirmed");

        if (!booking) {
            return res.status(404).json({ error: "Booking not found" });
        }

        const tenantRes = await db.query(
            "SELECT * FROM tenants WHERE id=$1",
            [booking.tenant_id]
        );

        const tenant = tenantRes.rows[0];

        if (tenant) {
            await sendMessage({
                tenant,
                to: booking.phone,
                text: `Booking CONFIRMED ✅
Service: ${booking.service_name}
Date: ${booking.booking_date}
Time: ${booking.booking_time}`
            });
        }

        return res.json({ success: true });

    } catch (err) {
        console.error("approveBooking error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

// ===============================
// REJECT BOOKING
// ===============================
exports.rejectBooking = async (req, res) => {
    try {
        const { bookingId } = req.body;

        if (!bookingId) {
            return res.status(400).json({ error: "bookingId required" });
        }

        const booking = await updateBookingStatus(bookingId, "rejected");

        if (!booking) {
            return res.status(404).json({ error: "Booking not found" });
        }

        const tenantRes = await db.query(
            "SELECT * FROM tenants WHERE id=$1",
            [booking.tenant_id]
        );

        const tenant = tenantRes.rows[0];

        if (tenant) {
            await sendMessage({
                tenant,
                to: booking.phone,
                text: `Booking REJECTED ❌
Service: ${booking.service_name}`
            });
        }

        return res.json({ success: true });

    } catch (err) {
        console.error("rejectBooking error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};
