const express = require("express");
const router = express.Router();
const { protect, restrictTo } = require("../middlewares/auth.middleware");
const { requireTenant } = require("../middlewares/tenant.middleware");
const { getMyTenant, updateWorkingHours } = require("../controllers/tenant.controller");

// "/me" = the business of the logged-in user. There is no "/:id" route on purpose:
// a user can never ask for another business's private settings.
router.use(protect, requireTenant);

router.get("/me", restrictTo("owner", "staff"), getMyTenant);
router.put("/me/working-hours", restrictTo("owner"), updateWorkingHours);

module.exports = router;
