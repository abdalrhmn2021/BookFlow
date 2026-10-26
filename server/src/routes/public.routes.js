const express = require("express");
const router = express.Router();
const {
  publicLimiter,
  guestBookingLimiter,
  manageBookingLimiter,
  assistantLimiter,
} = require("../middlewares/rateLimit.middleware");
const {
  listBusinesses,
  getBusinessBySlug,
  getAvailability,
  createGuestAppointment,
  getGuestBooking,
  cancelGuestBooking,
  askBookingAssistant,
} = require("../controllers/public.controller");
const { requireSiteBusiness } = require("../middlewares/site.middleware");

router.use(publicLimiter);

// Every /businesses/:slug route: on a one-business site, other businesses don't exist.
router.param("slug", requireSiteBusiness);

router.get("/businesses", listBusinesses);
router.get("/businesses/:slug", getBusinessBySlug);
router.get("/businesses/:slug/availability", getAvailability);

router.post("/businesses/:slug/appointments", guestBookingLimiter, createGuestAppointment);
router.post("/businesses/:slug/assistant", assistantLimiter, askBookingAssistant);

router.get("/bookings/:token", manageBookingLimiter, getGuestBooking);
router.patch("/bookings/:token/cancel", manageBookingLimiter, cancelGuestBooking);

module.exports = router;
