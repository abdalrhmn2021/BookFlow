const express = require("express");
const router = express.Router();
const { register, login, registerBusiness, getMe, logout } = require("../controllers/auth.controller");
const { protect } = require("../middlewares/auth.middleware");
const { loginLimiter, registerLimiter } = require("../middlewares/rateLimit.middleware");

router.post("/register", registerLimiter, register);
router.post("/login", loginLimiter, login);
router.post("/register-business", registerLimiter, registerBusiness);
router.post("/logout", logout);

router.get("/me", protect, getMe);

module.exports = router;
