const express = require("express");
const router = express.Router();
const { register, login, registerBusiness } = require("../controllers/auth.controller");
const { protect } = require("../middlewares/auth.middleware");
const { loginLimiter, registerLimiter } = require("../middlewares/rateLimit.middleware");

router.post("/register", registerLimiter, register);
router.post("/login", loginLimiter, login);
router.post("/register-business", registerLimiter, registerBusiness);

// Temporary test route to try out `protect` — send a request with
// Authorization: Bearer <token> and see what comes back.
router.get("/me", protect, (req, res) => {
  res.status(200).json({ user: req.user });
});

module.exports = router;
