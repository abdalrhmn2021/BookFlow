const express = require("express");
const { protect, restrictTo } = require("../middlewares/auth.middleware");
const { listBusinesses, updateBusiness, exportBusiness } = require("../controllers/admin.controller");

const router = express.Router();

// Only you (role "superadmin" - created with `npm run create-admin`, never from the web).
router.use(protect, restrictTo("superadmin"));

router.get("/businesses", listBusinesses);
router.patch("/businesses/:id", updateBusiness);
router.get("/businesses/:id/export", exportBusiness);

module.exports = router;
