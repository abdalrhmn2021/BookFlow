// Delete the leftovers of practice/test-booking.js and practice/test-race.js
//   node scripts/cleanup-test-data.js           -> DRY RUN (only shows)
//   node scripts/cleanup-test-data.js --delete  -> really deletes

require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../src/config/db");
const Tenant = require("../src/models/Tenant");
const User = require("../src/models/User");
const Service = require("../src/models/Service");
const Appointment = require("../src/models/Appointment");
const CustomerTenant = require("../src/models/CustomerTenant");
const StaffLock = require("../src/models/StaffLock");

const REALLY_DELETE = process.argv.includes("--delete");
const TEST_SLUG = /^(salon|race)-\d+$/;
const TEST_EMAIL = /@test\.com$/;

const run = async () => {
  const tenants = await Tenant.find({ slug: TEST_SLUG }).select("name slug");
  const tenantIds = tenants.map((t) => t._id);

  const users = await User.find({
    $or: [{ tenantId: { $in: tenantIds } }, { email: TEST_EMAIL }],
  }).select("email role");
  const userIds = users.map((u) => u._id);

  const filters = {
    appointments: [Appointment, { $or: [{ tenantId: { $in: tenantIds } }, { customerId: { $in: userIds } }] }],
    services: [Service, { tenantId: { $in: tenantIds } }],
    customerTenants: [CustomerTenant, { $or: [{ tenantId: { $in: tenantIds } }, { userId: { $in: userIds } }] }],
    staffLocks: [StaffLock, { staffId: { $in: userIds } }],
    users: [User, { _id: { $in: userIds } }],
    tenants: [Tenant, { _id: { $in: tenantIds } }],
  };

  console.log("Businesses:", tenants.map((t) => `${t.name} (${t.slug})`).join(", ") || "none");
  for (const [name, [Model, filter]] of Object.entries(filters)) {
    console.log(`  ${name}: ${await Model.countDocuments(filter)}`);
  }

  if (!REALLY_DELETE) {
    console.log("\nDry run - nothing deleted. Run again with --delete to delete.");
    return;
  }

  // Children first, the business last
  for (const [name, [Model, filter]] of Object.entries(filters)) {
    const { deletedCount } = await Model.deleteMany(filter);
    console.log(`deleted ${deletedCount} ${name}`);
  }
};

(async () => {
  await connectDB();
  try {
    await run();
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();