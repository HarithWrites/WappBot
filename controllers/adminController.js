const {
    updateBookingStatus,
    getAllBookings
} = require("../services/bookingService");

const { sendMessage } = require("../services/whatsappService");

// ===============================
// GET ALL BOOKINGS (FOR DASHBOARD)
// ===============================
exports.getBookings = async (req, res) => {
    try {
        const bookings = await getAllBookings();
        res.json(bookings);
    } catch (err) {
        res.status(500).json({
            error: "Failed to fetch bookings",
            details: err.message
        });
    }
};

// ===============================
// APPROVE BOOKING
// ===============================
exports.approveBooking = async (req, res) => {
    try {
        const { bookingId } = req.body;

        if (!bookingId) {
            return res.status(400).json({
                error: "bookingId is required"
            });
        }

        const booking = await updateBookingStatus(bookingId, "confirmed");

        if (!booking) {
            return res.status(404).json({
                error: "Booking not found"
            });
        }

        // Notify customer
        await sendMessage(
            booking.phone,
            `Your booking is CONFIRMED ✅

Date: ${booking.date}
Time: ${booking.time}`
        );

        res.json({
            success: true,
            booking
        });

    } catch (err) {
        res.status(500).json({
            error: "Failed to approve booking",
            details: err.message
        });
    }
};

// ===============================
// REJECT BOOKING
// ===============================
exports.rejectBooking = async (req, res) => {
    try {
        const { bookingId } = req.body;

        if (!bookingId) {
            return res.status(400).json({
                error: "bookingId is required"
            });
        }

        const booking = await updateBookingStatus(bookingId, "rejected");

        if (!booking) {
            return res.status(404).json({
                error: "Booking not found"
            });
        }

        // Notify customer
        await sendMessage(
            booking.phone,
            `Your booking is REJECTED ❌

Please try another slot`
        );

        res.json({
            success: true,
            booking
        });

    } catch (err) {
        res.status(500).json({
            error: "Failed to reject booking",
            details: err.message
        });
    }
};