const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../middlewares/auth.middleware");
const { requireTenant } = require("../middlewares/tenant.middleware");
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

router.post("/", protect, restrictTo("customer"), createAppointment);
router.get("/me", protect, restrictTo("customer"), getMyAppointments);
router.patch("/:id/cancel", protect, restrictTo("customer"), cancelMyAppointment);

router.get("/business", protect, requireTenant, restrictTo("owner", "staff"), getBusinessAppointments);
router.get("/business/stats", protect, requireTenant, restrictTo("owner", "staff"), getBusinessStats);
router.get("/business/new", protect, requireTenant, restrictTo("owner", "staff"), getNewBusinessAppointments);
router.get("/business/upcoming", protect, requireTenant, restrictTo("owner", "staff"), getUpcomingBusinessAppointments);
router.get("/business/availability", protect, requireTenant, restrictTo("owner", "staff"), getBusinessAvailability);
router.post("/business", protect, requireTenant, restrictTo("owner", "staff"), createBusinessAppointment);
router.patch("/:id/status", protect, requireTenant, restrictTo("owner", "staff"), updateAppointmentStatus);
router.patch("/:id/reminded", protect, requireTenant, restrictTo("owner", "staff"), markReminded);
router.patch("/:id/reschedule", protect, requireTenant, restrictTo("owner", "staff"), rescheduleBusinessAppointment);

module.exports = router;
