const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../middlewares/auth.middleware");
const { requireTenant } = require("../middlewares/tenant.middleware");
const {
  createService,
  getServices,
  getService,
  updateService,
  deleteService,
} = require("../controllers/service.controller");

// Every route below needs: a valid token + a user that belongs to a business
router.use(protect, requireTenant);

router.get("/", restrictTo("owner", "staff"), getServices);
router.post("/", restrictTo("owner"), createService);
router.get("/:id", restrictTo("owner", "staff"), getService);
router.patch("/:id", restrictTo("owner"), updateService);
router.delete("/:id", restrictTo("owner"), deleteService);

module.exports = router;
