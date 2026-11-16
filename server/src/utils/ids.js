const mongoose = require("mongoose");

// An id that came from a request must be just an id: a 24-character hex string (or an ObjectId we
// made ourselves). Not an object like {"$ne": null} or a list, which MongoDB would read as a
// query operator - every id from req.body / req.query goes through this before a query.
const isId = (value) =>
  value instanceof mongoose.Types.ObjectId || (typeof value === "string" && /^[a-f\d]{24}$/i.test(value));

module.exports = { isId };
