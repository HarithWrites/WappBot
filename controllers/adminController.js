const { updateBookingStatus } = require("../services/bookingService");
const { sendMessage } = require("../services/whatsappService");

exports.approveBooking = async (req, res) => {
    try {
        const { bookingId } = req.body;

        const booking = await updateBookingStatus(bookingId, "confirmed");

        await sendMessage(
            booking.phone,
            `Your booking is CONFIRMED ✅

Date: ${booking.date}
Time: ${booking.time}`
        );

        res.json({ success: true, booking });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.rejectBooking = async (req, res) => {
    try {
        const { bookingId } = req.body;

        const booking = await updateBookingStatus(bookingId, "rejected");

        await sendMessage(
            booking.phone,
            `Your booking is REJECTED ❌

Please try another slot`
        );

        res.json({ success: true, booking });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};