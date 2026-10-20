require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../src/config/db");
const Tenant = require("../src/models/Tenant");
const User = require("../src/models/User");
const Service = require("../src/models/Service");
const Appointment = require("../src/models/Appointment");
const CustomerTenant = require("../src/models/CustomerTenant");
const StaffLock = require("../src/models/StaffLock");
const { localToDate, nextDate, dayNameOf } = require("../src/utils/time");

const SLUG = "demo-salon";
const PASSWORD = "password123";

const OWNER = { name: "Omar (Owner)", email: "owner@demo.com", phone: "0590000001" };
const STAFF = [
  { name: "Sara", email: "sara@demo.com", phone: "0590000002" },
  { name: "Ahmad", email: "ahmad@demo.com", phone: "0590000003" },
];
const CUSTOMER = { name: "Lina (Customer)", email: "customer@demo.com", phone: "0590000004" };
const OTHER_CUSTOMERS = [
  { name: "Khaled", email: "khaled@demo.com", phone: "0590000005" },
  { name: "Maya", email: "maya@demo.com", phone: "0590000006" },
];
const SERVICES = [
  { name: "Haircut", description: "Wash, cut and style", price: 50, duration: 30 },
  { name: "Beard trim", description: "Shape and trim", price: 25, duration: 15 },
  { name: "Hair coloring", description: "Full color with a professional product", price: 150, duration: 90 },
];

const DEMO_EMAILS = [OWNER, ...STAFF, CUSTOMER, ...OTHER_CUSTOMERS].map((u) => u.email);

const DAY_PLAN = [
  [0, 0, 1, "09:00"],
  [0, 2, 0, "11:30"],
  [0, 1, 2, "14:30"],
  [1, 0, 2, "10:00"],
  [1, 1, 0, "13:00"],
  [1, 0, 1, "16:00"],
];

async function reset() {
  const tenant = await Tenant.findOne({ slug: SLUG });
  if (tenant) {
    const staffIds = (await User.find({ tenantId: tenant._id }).select("_id")).map((u) => u._id);
    await Promise.all([
      Appointment.deleteMany({ tenantId: tenant._id }),
      Service.deleteMany({ tenantId: tenant._id }),
      CustomerTenant.deleteMany({ tenantId: tenant._id }),
      StaffLock.deleteMany({ staffId: { $in: staffIds } }),
    ]);
    await Tenant.deleteOne({ _id: tenant._id });
  }
  const users = await User.find({ email: { $in: DEMO_EMAILS } }).select("_id");
  await Appointment.deleteMany({ customerId: { $in: users.map((u) => u._id) } });
  await User.deleteMany({ email: { $in: DEMO_EMAILS } });
  console.log("Old demo data deleted.");
}

async function seed() {
  if (await Tenant.exists({ slug: SLUG })) {
    console.log(`"${SLUG}" already exists - nothing to do. Use "npm run seed -- --reset" to recreate it.`);
    return;
  }
  const taken = await User.find({ email: { $in: DEMO_EMAILS } }).select("email");
  if (taken.length) {
    console.log(`These emails already exist: ${taken.map((u) => u.email).join(", ")}`);
    console.log('Run "npm run seed -- --reset" to recreate the demo data.');
    return;
  }

  const tenant = await Tenant.create({ name: "Demo Salon", slug: SLUG });

  await User.create({ ...OWNER, password: PASSWORD, role: "owner", tenantId: tenant._id });
  for (const s of STAFF) {
    await User.create({ ...s, password: PASSWORD, role: "staff", tenantId: tenant._id });
  }
  const customers = [];
  for (const c of [CUSTOMER, ...OTHER_CUSTOMERS]) {
    customers.push(await User.create({ ...c, password: PASSWORD, role: "customer" }));
  }
  const staff = await User.find({ tenantId: tenant._id, role: "staff" }).sort({ name: -1 });

  const services = await Service.insertMany(SERVICES.map((s) => ({ ...s, tenantId: tenant._id })));

  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tenant.timezone }).format(now);
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const days = [];
  for (let d = yesterday.toISOString().slice(0, 10); days.length < 5; d = nextDate(d)) {
    if (dayNameOf(d) !== "friday") days.push(d);
  }

  const appointments = [];
  days.forEach((date, dayIndex) => {
    DAY_PLAN.forEach(([staffI, serviceI, customerI, time], i) => {
      const service = services[serviceI];
      const startTime = localToDate(date, time, tenant.timezone);
      const endTime = new Date(startTime.getTime() + service.duration * 60 * 1000);

      let status;
      if (startTime <= now) status = i === 2 ? "no-show" : "completed";
      else status = (i + dayIndex) % 2 === 0 ? "confirmed" : "pending";
      if (dayIndex === 0 && i === 5) status = "cancelled";

      appointments.push({
        tenantId: tenant._id,
        ...(i === 3
          ? { guest: { name: "Khaled Mansour", phone: "0599000111" } }
          : { customerId: customers[customerI]._id }),
        staffId: staff[staffI]._id,
        serviceId: service._id,
        serviceName: service.name,
        price: service.price,
        duration: service.duration,
        startTime,
        endTime,
        status,
        notes: i === 1 ? "First time coloring - please call me before" : undefined,
      });
    });
  });
  await Appointment.insertMany(appointments);
  await CustomerTenant.insertMany(customers.map((c) => ({ userId: c._id, tenantId: tenant._id })));

  console.log(`\nDemo data created ✅  (${appointments.length} sample appointments)\n`);
  console.log(`  Booking page:  http://localhost:3000/book/${SLUG}\n`);
  console.log(`  Password for every account: ${PASSWORD}`);
  console.log(`    customer  ${CUSTOMER.email}`);
  console.log(`    owner     ${OWNER.email}`);
  STAFF.forEach((s) => console.log(`    staff     ${s.email}`));
  console.log("");
}

(async () => {
  await connectDB();
  try {
    if (process.argv.includes("--reset")) await reset();
    await seed();
  } catch (err) {
    console.error("Seed failed:", err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
