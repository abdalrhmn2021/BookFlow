const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../middlewares/auth.middleware");
const { createAppointment ,getMyAppointments} = require("../controllers/appointment.controller");


router.post("/", protect, restrictTo("customer"), createAppointment);
router.get("/me", protect, restrictTo("customer"), getMyAppointments);


module.exports = router;
