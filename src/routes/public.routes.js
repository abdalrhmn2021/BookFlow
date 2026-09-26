const express = require("express");
const router = express.Router();
const { publicLimiter } = require("../middlewares/rateLimit.middleware");
const { getBusinessBySlug, getAvailability } = require("../controllers/public.controller");

// No protect() here on purpose - anyone can open a business page.
// Because it's open to everyone, we limit how fast one IP can hit it
// (stops bots from scraping every business in a loop).
router.use(publicLimiter);

router.get("/businesses/:slug", getBusinessBySlug);
router.get("/businesses/:slug/availability", getAvailability);

module.exports = router;
