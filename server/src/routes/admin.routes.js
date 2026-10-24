const express = require("express");
const { protect, restrictTo } = require("../middlewares/auth.middleware");
const { listBusinesses, updateBusiness } = require("../controllers/admin.controller");

const router = express.Router();

// Only you (role "superadmin" - created with `npm run create-admin`, never from the web).
router.use(protect, restrictTo("superadmin"));

router.get("/businesses", listBusinesses);
router.patch("/businesses/:id", updateBusiness);

module.exports = router;
