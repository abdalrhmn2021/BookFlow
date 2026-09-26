const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../middlewares/auth.middleware");
const { requireTenant } = require("../middlewares/tenant.middleware");
const {
  createAppointment,
  getMyAppointments,
  cancelMyAppointment,
  getBusinessAppointments,
  updateAppointmentStatus,
} = require("../controllers/appointment.controller");


router.post("/", protect, restrictTo("customer"), createAppointment);
router.get("/me", protect, restrictTo("customer"), getMyAppointments);
router.patch("/:id/cancel", protect, restrictTo("customer"), cancelMyAppointment);

// ---- Business side (owner + staff) ----
// requireTenant: the user must belong to an ACTIVE business -> gives us req.tenantId
router.get("/business", protect, requireTenant, restrictTo("owner", "staff"), getBusinessAppointments);
router.patch("/:id/status", protect, requireTenant, restrictTo("owner", "staff"), updateAppointmentStatus);


module.exports = router;
