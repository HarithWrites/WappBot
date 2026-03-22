const {
    getAllBookings,
    updateBookingStatus
} = require("../services/bookingService");

const { sendMessage } = require("../services/whatsappService");
const db = require("../db");

// ===============================
exports.getBookings = async (req, res) => {
    try {
        const { tenant_id, date, time } = req.query;

        if (!tenant_id) {
            return res.status(400).json({ error: "tenant_id required" });
        }

        const data = await getAllBookings(tenant_id, { date, time });

        res.json(data);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ===============================
exports.approveBooking = async (req, res) => {
    try {
        const { bookingId } = req.body;

        const booking = await updateBookingStatus(bookingId, "confirmed");

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

        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ===============================
exports.rejectBooking = async (req, res) => {
    try {
        const { bookingId } = req.body;

        const booking = await updateBookingStatus(bookingId, "rejected");

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

        res.json({ success: true });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};