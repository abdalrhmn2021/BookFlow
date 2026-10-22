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
} = require("../controllers/appointment.controller");

router.post("/", protect, restrictTo("customer"), createAppointment);
router.get("/me", protect, restrictTo("customer"), getMyAppointments);
router.patch("/:id/cancel", protect, restrictTo("customer"), cancelMyAppointment);

router.get("/business", protect, requireTenant, restrictTo("owner", "staff"), getBusinessAppointments);
router.get("/business/stats", protect, requireTenant, restrictTo("owner", "staff"), getBusinessStats);
router.get("/business/new", protect, requireTenant, restrictTo("owner", "staff"), getNewBusinessAppointments);
router.patch("/:id/status", protect, requireTenant, restrictTo("owner", "staff"), updateAppointmentStatus);
router.patch("/:id/reminded", protect, requireTenant, restrictTo("owner", "staff"), markReminded);

module.exports = router;
