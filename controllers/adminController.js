const { getAllBookings } = require("../services/bookingService");

exports.getBookings = async (req, res) => {
    const { tenant_id, date, time } = req.query;

    const data = await getAllBookings(tenant_id, { date, time });

    res.json(data);
};