const mongoose = require("mongoose");

// One document per staff member, written inside every booking transaction (see booking.service).
const staffLockSchema = new mongoose.Schema({
  staffId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
  version: { type: Number, default: 0 },
});

module.exports = mongoose.model("StaffLock", staffLockSchema);
