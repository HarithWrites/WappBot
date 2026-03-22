const express = require("express");
const router = express.Router();

const controller = require("../controllers/adminController");

// ===============================
// GET BOOKINGS
// ===============================
router.get("/bookings", controller.getBookings);

// ===============================
// APPROVE (POST ONLY)
// ===============================
router.post("/approve", controller.approveBooking);

// ===============================
// REJECT (POST ONLY)
// ===============================
router.post("/reject", controller.rejectBooking);

// ===============================
// OPTIONAL SAFETY (PREVENT CONFUSION)
// ===============================
router.get("/approve", (req, res) => {
    return res.status(405).send("Use POST method for approve");
});

router.get("/reject", (req, res) => {
    return res.status(405).send("Use POST method for reject");
});

module.exports = router;