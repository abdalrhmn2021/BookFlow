const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../middlewares/auth.middleware");
const { requireTenant } = require("../middlewares/tenant.middleware");
const { getMyTenant, updateWorkingHours } = require("../controllers/tenant.controller");

router.use(protect, requireTenant);

router.get("/me", restrictTo("owner", "staff"), getMyTenant);
router.put("/me/working-hours", restrictTo("owner"), updateWorkingHours);

module.exports = router;
