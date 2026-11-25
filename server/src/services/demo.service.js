const Tenant = require("../models/Tenant");
const User = require("../models/User");
const Service = require("../models/Service");
const Appointment = require("../models/Appointment");
const CustomerTenant = require("../models/CustomerTenant");
const StaffLock = require("../models/StaffLock");
const { localToDate, nextDate, dayNameOf } = require("../utils/time");

// The public demo ("demo-salon"): created by `npm run seed`, and put back as new automatically
// (security review B-02). Its password is public, so any visitor can log in as the owner and
// rename the business, delete the services or deactivate the staff - for everyone after them.
// The maintenance job resets it every DEMO_RESET_HOURS. Off unless it's set (review Q-01): only the
// demo platform's server sets it (24), so a client's copy never runs it, even by mistake.

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

async function reset({ log = () => {} } = {}) {
  const tenant = await Tenant.findOne({ slug: SLUG });
  if (tenant) {
    const staffIds = (await User.find({ tenantId: tenant._id }).select("_id")).map((u) => u._id);
    await Promise.all([
      Appointment.deleteMany({ tenantId: tenant._id }),
      Service.deleteMany({ tenantId: tenant._id }),
      CustomerTenant.deleteMany({ tenantId: tenant._id }),
      StaffLock.deleteMany({ staffId: { $in: staffIds } }),
      // staff a visitor added to the demo (only @demo.com emails are allowed there)
      User.deleteMany({ tenantId: tenant._id, email: { $nin: DEMO_EMAILS } }),
    ]);
    await Tenant.deleteOne({ _id: tenant._id });
  }
  const users = await User.find({ email: { $in: DEMO_EMAILS } }).select("_id");
  await Appointment.deleteMany({ customerId: { $in: users.map((u) => u._id) } });
  await User.deleteMany({ email: { $in: DEMO_EMAILS } });
  log("Old demo data deleted.");
}

// Lina is the account behind the login page's "Customer" button: every visitor who tries booking
// as a customer books as her. A customer may have at most CUSTOMER_MAX_UPCOMING (5) active upcoming
// bookings at one business, and the day plan gave her 6-8 - so every visitor's booking was refused.
// She keeps her past bookings (her history) and her first LINA_UPCOMING upcoming ones; the rest go
// to another demo customer, so the calendar itself stays exactly the same.
const LINA_UPCOMING = 2;
const ACTIVE = ["pending", "confirmed"];

function keepRoomForVisitors(appointments, linaId, otherId, now) {
  let kept = 0;
  for (const a of [...appointments].sort((x, y) => x.startTime - y.startTime)) {
    if (!a.customerId?.equals(linaId) || a.startTime <= now || !ACTIVE.includes(a.status)) continue;
    if (kept < LINA_UPCOMING) kept += 1;
    else a.customerId = otherId;
  }
}

async function seed({ log = console.log } = {}) {
  if (await Tenant.exists({ slug: SLUG })) {
    log(`"${SLUG}" already exists - nothing to do. Use "npm run seed -- --reset" to recreate it.`);
    return;
  }
  const taken = await User.find({ email: { $in: DEMO_EMAILS } }).select("email");
  if (taken.length) {
    log(`These emails already exist: ${taken.map((u) => u.email).join(", ")}`);
    log('Run "npm run seed -- --reset" to recreate the demo data.');
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
  keepRoomForVisitors(appointments, customers[0]._id, customers[1]._id, now);
  await Appointment.insertMany(appointments);
  await CustomerTenant.insertMany(customers.map((c) => ({ userId: c._id, tenantId: tenant._id })));

  log(`\nDemo data created ✅  (${appointments.length} sample appointments)\n`);
  log(`  Booking page:  http://localhost:3000/book/${SLUG}\n`);
  log(`  Password for every account: ${PASSWORD}`);
  log(`    customer  ${CUSTOMER.email}`);
  log(`    owner     ${OWNER.email}`);
  STAFF.forEach((s) => log(`    staff     ${s.email}`));
  log("");
}

const resetHours = () => {
  const raw = process.env.DEMO_RESET_HOURS;
  if (raw === undefined || raw.trim() === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// Deletes the demo and creates it again. Returns true if it ran.
async function resetDemo({ log = () => {} } = {}) {
  await reset({ log });
  await seed({ log });
  return true;
}

// Resets the demo when it's older than DEMO_RESET_HOURS. Only the demo business exists on the
// demo platform; on a client's copy there is no "demo-salon", so this does nothing.
async function resetDemoIfDue({ now = new Date() } = {}) {
  const hours = resetHours();
  if (!hours) return false;
  const demo = await Tenant.findOne({ slug: SLUG }).select("createdAt").lean();
  if (!demo) {
    // A reset that broke halfway leaves the demo users without their business: build it again.
    if (await User.exists({ email: OWNER.email })) return resetDemo();
    return false;
  }
  if (now - demo.createdAt < hours * 60 * 60 * 1000) return false;
  return resetDemo();
}

module.exports = { seed, reset, resetDemo, resetDemoIfDue, DEMO_SLUG: SLUG, DEMO_EMAILS, DEMO_PASSWORD: PASSWORD };
