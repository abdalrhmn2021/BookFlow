const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../middlewares/auth.middleware");
const { createAppointment } = require("../controllers/appointment.controller");

// A customer books an appointment at a business (the business is chosen by slug)
router.post("/", protect, restrictTo("customer"), createAppointment);

module.exports = router;
