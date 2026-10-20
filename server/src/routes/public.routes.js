const express = require("express");
const router = express.Router();
const { publicLimiter, guestBookingLimiter, manageBookingLimiter } = require("../middlewares/rateLimit.middleware");
const {
  listBusinesses,
  getBusinessBySlug,
  getAvailability,
  createGuestAppointment,
  getGuestBooking,
  cancelGuestBooking,
} = require("../controllers/public.controller");

router.use(publicLimiter);

router.get("/businesses", listBusinesses);
router.get("/businesses/:slug", getBusinessBySlug);
router.get("/businesses/:slug/availability", getAvailability);

router.post("/businesses/:slug/appointments", guestBookingLimiter, createGuestAppointment);

router.get("/bookings/:token", manageBookingLimiter, getGuestBooking);
router.patch("/bookings/:token/cancel", manageBookingLimiter, cancelGuestBooking);

module.exports = router;
