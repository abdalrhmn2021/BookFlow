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
  verifyEmail,
  resendVerification,
} = require("../controllers/auth.controller");
const { protect, restrictTo } = require("../middlewares/auth.middleware");
const {
  loginLimiter,
  loginEmailLimiter,
  accountPasswordLimiter,
  registerLimiter,
  forgotPasswordLimiter,
  forgotEmailLimiter,
  resetPasswordLimiter,
  verifyEmailLimiter,
  resendVerificationLimiter,
  resendVerificationEmailLimiter,
} = require("../middlewares/rateLimit.middleware");

router.post("/register", registerLimiter, register);
router.post("/login", loginLimiter, loginEmailLimiter, login);
router.post("/register-business", registerLimiter, registerBusiness);
router.post("/logout", logout);

// Email verification after signing up (the code from the email logs the new account in).
router.post("/verify-email", verifyEmailLimiter, verifyEmail);
router.post("/resend-verification", resendVerificationLimiter, resendVerificationEmailLimiter, resendVerification);

router.post("/forgot-password", forgotPasswordLimiter, forgotEmailLimiter, forgotPassword);
router.post("/reset-password", resetPasswordLimiter, resetPassword);
// Same limiter as login: guessing the current password is guessing a password.
router.patch("/password", protect, loginLimiter, accountPasswordLimiter, changePassword);

router.get("/me", protect, getMe);
// Customers only (owners / staff are refused before the limiter, so they don't use up the
// attempts); then the same limiter as login, because it checks a password.
router.delete("/me", protect, restrictTo("customer"), loginLimiter, accountPasswordLimiter, deleteMyAccount);

module.exports = router;
