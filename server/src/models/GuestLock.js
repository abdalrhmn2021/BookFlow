const mongoose = require("mongoose");

// One document per guest phone number at a business ("<tenantId>:<phone>"), written inside the
// guest's booking transaction (see booking.service). Two bookings from the same phone at the same
// moment then conflict, so the "max upcoming bookings per phone" limit can't be raced past -
// even when they are for two different staff members (who have two different staff locks).
const guestLockSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  version: { type: Number, default: 0 },
});

module.exports = mongoose.model("GuestLock", guestLockSchema);
