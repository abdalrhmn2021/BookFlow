const mongoose = require("mongoose");

// One tiny document per staff member - the "key" to their calendar.
// Every booking transaction must UPDATE this document first. MongoDB never lets
// two open transactions write the same document, so bookings for the same
// staff member are forced to happen one after the other (see appointment.controller).
const staffLockSchema = new mongoose.Schema({
  staffId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
  version: { type: Number, default: 0 }, // just a counter we bump to "touch" the lock
});

module.exports = mongoose.model("StaffLock", staffLockSchema);
