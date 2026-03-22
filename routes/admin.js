const express = require("express");
const router = express.Router();
const controller = require("../controllers/adminController");

// ===============================
// GET BOOKINGS (Dashboard)
// ===============================
router.get("/bookings", controller.getBookings);

// ===============================
// APPROVE BOOKING
// ===============================
router.post("/approve", controller.approveBooking);

// ===============================
// REJECT BOOKING
// ===============================
router.post("/reject", controller.rejectBooking);

module.exports = router;