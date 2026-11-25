const mongoose = require("mongoose");

// One lock document per key, written inside a booking transaction (see booking.service):
//   "<tenantId>:<phone>"        one guest phone at a business (max upcoming bookings per phone)
//   "cust:<tenantId>:<userId>"  one customer account at a business (max upcoming bookings)
//   "guestday:<tenantId>"       the whole business (max new guest bookings in 24 hours)
// Two bookings under the same key at the same moment then conflict, and the second one counts
// again after the first is saved - so these limits can't be raced past, even when the bookings
// are for two different staff members (who have two different staff locks).
const guestLockSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  version: { type: Number, default: 0 },
});

module.exports = mongoose.model("GuestLock", guestLockSchema);
