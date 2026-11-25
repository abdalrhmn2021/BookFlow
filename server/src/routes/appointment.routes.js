const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../middlewares/auth.middleware");
const { requireTenant } = require("../middlewares/tenant.middleware");
const { customerBookingLimiter } = require("../middlewares/rateLimit.middleware");
const { BUSINESS_ROLES, requireBookingDesk } = require("../utils/bookingDesk");
const {
  createAppointment,
  getMyAppointments,
  cancelMyAppointment,
  getBusinessAppointments,
  getBusinessStats,
  updateAppointmentStatus,
  markReminded,
  getNewBusinessAppointments,
  getUpcomingBusinessAppointments,
  createBusinessAppointment,
  rescheduleBusinessAppointment,
  getBusinessAvailability,
} = require("../controllers/appointment.controller");

router.post("/", protect, restrictTo("customer"), customerBookingLimiter, createAppointment);
router.get("/me", protect, restrictTo("customer"), getMyAppointments);
router.patch("/:id/cancel", protect, restrictTo("customer"), cancelMyAppointment);

// Everyone in the business can look (staff see only their own appointments).
const business = [protect, requireTenant, restrictTo(...BUSINESS_ROLES)];
router.get("/business", ...business, getBusinessAppointments);
router.get("/business/stats", ...business, getBusinessStats);
router.get("/business/new", ...business, getNewBusinessAppointments);
router.get("/business/upcoming", ...business, getUpcomingBusinessAppointments);
// Status: the desk changes any; others only close their own (checked in the controller).
router.patch("/:id/status", ...business, updateAppointmentStatus);

// Only the booking desk - the receptionist, or the owner when there is none (utils/bookingDesk.js).
router.get("/business/availability", ...business, requireBookingDesk, getBusinessAvailability);
router.post("/business", ...business, requireBookingDesk, createBusinessAppointment);
router.patch("/:id/reminded", ...business, requireBookingDesk, markReminded);
router.patch("/:id/reschedule", ...business, requireBookingDesk, rescheduleBusinessAppointment);

module.exports = router;
