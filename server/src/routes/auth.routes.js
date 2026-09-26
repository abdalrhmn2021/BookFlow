const express = require("express");
const router = express.Router();
const { register, login, registerBusiness, getMe } = require("../controllers/auth.controller");
const { protect } = require("../middlewares/auth.middleware");
const { loginLimiter, registerLimiter } = require("../middlewares/rateLimit.middleware");

router.post("/register", registerLimiter, register);
router.post("/login", loginLimiter, login);
router.post("/register-business", registerLimiter, registerBusiness);

// Who am I? The frontend calls this on page load to know who is logged in
// (and where to send them: customer -> my bookings, owner/staff -> dashboard).
router.get("/me", protect, getMe);

module.exports = router;
