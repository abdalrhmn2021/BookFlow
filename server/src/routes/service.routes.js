const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../middlewares/auth.middleware");
const { requireTenant } = require("../middlewares/tenant.middleware");
const { BUSINESS_ROLES } = require("../utils/bookingDesk");
const {
  createService,
  getServices,
  getService,
  updateService,
  deleteService,
} = require("../controllers/service.controller");

router.use(protect, requireTenant);

router.get("/", restrictTo(...BUSINESS_ROLES), getServices);
router.post("/", restrictTo("owner"), createService);
router.get("/:id", restrictTo(...BUSINESS_ROLES), getService);
router.patch("/:id", restrictTo("owner"), updateService);
router.delete("/:id", restrictTo("owner"), deleteService);

module.exports = router;
