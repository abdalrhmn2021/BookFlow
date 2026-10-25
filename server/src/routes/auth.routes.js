const express = require("express");
const router = express.Router();
const {
  register,
  login,
  registerBusiness,
  getMe,
  logout,
  changePassword,
  forgotPassword,
  resetPassword,
  deleteMyAccount,
} = require("../controllers/auth.controller");
const { protect, restrictTo } = require("../middlewares/auth.middleware");
const {
  loginLimiter,
  registerLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
} = require("../middlewares/rateLimit.middleware");

router.post("/register", registerLimiter, register);
router.post("/login", loginLimiter, login);
router.post("/register-business", registerLimiter, registerBusiness);
router.post("/logout", logout);

router.post("/forgot-password", forgotPasswordLimiter, forgotPassword);
router.post("/reset-password", resetPasswordLimiter, resetPassword);
// Same limiter as login: guessing the current password is guessing a password.
router.patch("/password", protect, loginLimiter, changePassword);

router.get("/me", protect, getMe);
// Customers only (owners / staff are refused before the limiter, so they don't use up the
// attempts); then the same limiter as login, because it checks a password.
router.delete("/me", protect, restrictTo("customer"), loginLimiter, deleteMyAccount);

module.exports = router;
