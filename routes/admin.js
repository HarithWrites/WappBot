const express = require("express");
const router = express.Router();
const controller = require("../controllers/adminController");

router.post("/approve", controller.approveBooking);
router.post("/reject", controller.rejectBooking);

module.exports = router;