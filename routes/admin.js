const express = require("express");
const router = express.Router();

const controller = require("../controllers/adminController");

// ===============================
// GET BOOKINGS
// ===============================
router.get("/bookings", controller.getBookings);

// ===============================
// APPROVE (POST)
// ===============================
router.post("/approve", controller.approveBooking);

// ===============================
// REJECT (POST)
// ===============================
router.post("/reject", controller.rejectBooking);

// ===============================
// OPTIONAL: Prevent GET error
// ===============================
router.get("/reject", (req, res) => {
    res.send("Use POST method for reject");
});

router.get("/approve", (req, res) => {
    res.send("Use POST method for approve");
});

module.exports = router;