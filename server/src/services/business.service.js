const mongoose = require("mongoose");
const Tenant = require("../models/Tenant");
const User = require("../models/User");

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

// Creates a business AND its owner account together.
// Used by the sign-up endpoint (POST /api/auth/register-business) and by
// scripts/setup-client.js, which sets up a new copy for a client - so both follow the same rules.
//
// It runs in a transaction: if the owner can't be saved (bad email, short password...)
// the business is rolled back too, so we never end up with a business that has no owner.
async function createBusinessWithOwner({
  businessName,
  slug,
  ownerName,
  email,
  password,
  phone,
  timezone,
  whatsappReminders,
  phoneCountryCode,
  ownerBookable,
}) {
  const [emailTaken, slugTaken] = await Promise.all([
    User.exists({ email: String(email).trim().toLowerCase(), scope: null }),
    Tenant.exists({ slug: String(slug).trim().toLowerCase() }),
  ]);
  if (emailTaken) throw httpError(409, "Email already exists");
  if (slugTaken) throw httpError(409, "This business URL is already taken");

  const session = await mongoose.startSession();
  try {
    let tenant, owner;

    await session.withTransaction(async () => {
      tenant = new Tenant({
        name: businessName,
        slug,
        ...(timezone && { timezone }),
        ...(whatsappReminders && { whatsappReminders: true }),
        ...(phoneCountryCode && { phoneCountryCode }),
      });
      await tenant.save({ session });

      owner = new User({
        name: ownerName,
        email,
        password,
        phone,
        role: "owner",
        tenantId: tenant._id,
        ...(ownerBookable && { bookable: true }),
      });
      await owner.save({ session });
    });

    return { tenant, owner };
  } finally {
    await session.endSession();
  }
}

module.exports = { createBusinessWithOwner };
