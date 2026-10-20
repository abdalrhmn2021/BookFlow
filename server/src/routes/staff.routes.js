const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../middlewares/auth.middleware");
const { requireTenant } = require("../middlewares/tenant.middleware");
const { createStaff, getStaff, updateStaff, deactivateStaff } = require("../controllers/staff.controller");

router.use(protect, requireTenant, restrictTo("owner"));

router.post("/", createStaff);
router.get("/", getStaff);
router.patch("/:id", updateStaff);
router.delete("/:id", deactivateStaff);

module.exports = router;
