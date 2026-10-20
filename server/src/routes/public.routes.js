const express = require("express");
const router = express.Router();
const {
  publicLimiter,
  guestBookingLimiter,
  manageBookingLimiter,
} = require("../middlewares/rateLimit.middleware");
const {
  listBusinesses,
  getBusinessBySlug,
  getAvailability,
  createGuestAppointment,
  getGuestBooking,
  cancelGuestBooking,
} = require("../controllers/public.controller");

// No protect() here on purpose - anyone can open a business page.
// Because it's open to everyone, we limit how fast one IP can hit it
// (stops bots from scraping every business in a loop).
router.use(publicLimiter);

router.get("/businesses", listBusinesses);
router.get("/businesses/:slug", getBusinessBySlug);
router.get("/businesses/:slug/availability", getAvailability);

// Booking WITHOUT an account (guest). Writing to the database with no login
// needs a much tighter limit than just reading.
router.post("/businesses/:slug/appointments", guestBookingLimiter, createGuestAppointment);

// Guest "manage my booking" link: whoever has the secret link owns the booking.
router.get("/bookings/:token", manageBookingLimiter, getGuestBooking);
router.patch("/bookings/:token/cancel", manageBookingLimiter, cancelGuestBooking);

module.exports = router;
