// Demo businesses for the live site: an English multi-business demo and an Arabic client-edition demo.
// Every account uses DEMO_PASSWORD. Appointments are placed around "today", so the data is rebuilt daily
// (see refreshDemos) to keep the dashboards current.

const Tenant = require("../models/Tenant");
const User = require("../models/User");
const Service = require("../models/Service");
const Appointment = require("../models/Appointment");
const CustomerTenant = require("../models/CustomerTenant");
const StaffLock = require("../models/StaffLock");
const { localToDate, nextDate, dayNameOf } = require("../utils/time");

const DEMO_PASSWORD = "password123";

const DEMOS = [
  {
    slug: "demo-salon",
    name: "Demo Salon",
    owner: { name: "Omar (Owner)", email: "owner@demo.com", phone: "0590000001" },
    staff: [
      { name: "Sara", email: "sara@demo.com", phone: "0590000002" },
      { name: "Ahmad", email: "ahmad@demo.com", phone: "0590000003" },
    ],
    customers: [
      { name: "Lina (Customer)", email: "customer@demo.com", phone: "0590000004" },
      { name: "Khaled", email: "khaled@demo.com", phone: "0590000005" },
      { name: "Maya", email: "maya@demo.com", phone: "0590000006" },
    ],
    services: [
      { name: "Haircut", description: "Wash, cut and style", price: 50, duration: 30 },
      { name: "Beard trim", description: "Shape and trim", price: 25, duration: 15 },
      { name: "Hair coloring", description: "Full color with a professional product", price: 150, duration: 90 },
    ],
    guest: { name: "Khaled Mansour", phone: "0599000111" },
    note: "First time coloring - please call me before",
  },
  {
    // Client-edition demo: accounts follow <role>@<slug>.demo, which the client's demo buttons expect.
    slug: "al-ward",
    name: "صالون الورد",
    owner: { name: "أحمد", email: "owner@al-ward.demo", phone: "0591000001" },
    staff: [
      { name: "سارة", email: "staff@al-ward.demo", phone: "0591000002" },
      { name: "لينا", email: "lina@al-ward.demo", phone: "0591000003" },
    ],
    customers: [
      { name: "ريم خليل", email: "customer@al-ward.demo", phone: "0591000004" },
      { name: "نور حسن", email: "nour@al-ward.demo", phone: "0591000005" },
      { name: "هبة سعيد", email: "hiba@al-ward.demo", phone: "0591000006" },
    ],
    services: [
      { name: "قص شعر", description: "غسيل وقص وتسريح", price: 40, duration: 30 },
      { name: "سشوار", description: "سشوار وتمويج", price: 30, duration: 30 },
      { name: "صبغة كاملة", description: "صبغة كاملة بمنتجات احترافية", price: 150, duration: 90 },
      { name: "تنظيف بشرة", description: "تنظيف عميق وترطيب", price: 80, duration: 60 },
    ],
    guest: { name: "دانا يوسف", phone: "0599000222" },
    note: "أول مرة بعمل صبغة، اتصلوا فيّ قبل الموعد",
  },
];

// [staff index, service index, customer index, local start time] - repeated on each demo day
const DAY_PLAN = [
  [0, 0, 1, "09:00"],
  [0, 2, 0, "11:30"],
  [0, 1, 2, "14:30"],
  [1, 0, 2, "10:00"],
  [1, 1, 0, "13:00"],
  [1, 0, 1, "16:00"],
];

const emailsOf = (demo) => [demo.owner, ...demo.staff, ...demo.customers].map((u) => u.email);

const localDate = (date, timeZone) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);

async function resetDemo(demo) {
  const tenant = await Tenant.findOne({ slug: demo.slug });
  if (tenant) {
    const staffIds = (await User.find({ tenantId: tenant._id }).select("_id")).map((u) => u._id);
    await Promise.all([
      Appointment.deleteMany({ tenantId: tenant._id }),
      Service.deleteMany({ tenantId: tenant._id }),
      CustomerTenant.deleteMany({ tenantId: tenant._id }),
      StaffLock.deleteMany({ staffId: { $in: staffIds } }),
      // staff added by visitors on the demo dashboard
      User.deleteMany({ tenantId: tenant._id }),
    ]);
    await Tenant.deleteOne({ _id: tenant._id });
  }
  const users = await User.find({ email: { $in: emailsOf(demo) } }).select("_id");
  await Appointment.deleteMany({ customerId: { $in: users.map((u) => u._id) } });
  await User.deleteMany({ email: { $in: emailsOf(demo) } });
}

// Returns false (and changes nothing) if the business or one of its emails already exists.
async function seedDemo(demo) {
  if (await Tenant.exists({ slug: demo.slug })) return false;
  if (await User.exists({ email: { $in: emailsOf(demo) } })) return false;

  const tenant = await Tenant.create({ name: demo.name, slug: demo.slug });
  await User.create({ ...demo.owner, password: DEMO_PASSWORD, role: "owner", tenantId: tenant._id });
  const staff = [];
  for (const s of demo.staff) {
    staff.push(await User.create({ ...s, password: DEMO_PASSWORD, role: "staff", tenantId: tenant._id }));
  }
  const customers = [];
  for (const c of demo.customers) {
    customers.push(await User.create({ ...c, password: DEMO_PASSWORD, role: "customer" }));
  }
  const services = await Service.insertMany(demo.services.map((s) => ({ ...s, tenantId: tenant._id })));

  // yesterday + the next 4 open days (Friday is closed by default)
  const now = new Date();
  const yesterday = new Date(`${localDate(now, tenant.timezone)}T00:00:00Z`);
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

      let status;
      if (startTime <= now) status = i === 2 ? "no-show" : "completed";
      else status = (i + dayIndex) % 2 === 0 ? "confirmed" : "pending";
      if (dayIndex === 0 && i === 5) status = "cancelled";

      appointments.push({
        tenantId: tenant._id,
        ...(i === 3 ? { guest: demo.guest } : { customerId: customers[customerI]._id }),
        staffId: staff[staffI]._id,
        serviceId: service._id,
        serviceName: service.name,
        price: service.price,
        duration: service.duration,
        startTime,
        endTime: new Date(startTime.getTime() + service.duration * 60 * 1000),
        status,
        notes: i === 1 ? demo.note : undefined,
      });
    });
  });
  await Appointment.insertMany(appointments);
  await CustomerTenant.insertMany(customers.map((c) => ({ userId: c._id, tenantId: tenant._id })));
  return true;
}

// A demo is fresh if it was (re)built today in its own timezone.
async function isFresh(demo) {
  const tenant = await Tenant.findOne({ slug: demo.slug }).select("createdAt timezone").lean();
  return Boolean(tenant) && localDate(tenant.createdAt, tenant.timezone) === localDate(new Date(), tenant.timezone);
}

// Rebuilds every demo that is missing or out of date (or all of them with force). Returns the rebuilt slugs.
async function refreshDemos({ force = false, only } = {}) {
  const rebuilt = [];
  for (const demo of DEMOS.filter((d) => !only || d.slug === only)) {
    if (!force && (await isFresh(demo))) continue;
    await resetDemo(demo);
    if (await seedDemo(demo)) rebuilt.push(demo.slug);
  }
  return rebuilt;
}

let running = false;

// DEMO_REFRESH=true on the server: rebuild the demos at start-up and check again every few hours.
function startDemoRefresh({ everyMs = 3 * 60 * 60 * 1000 } = {}) {
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const rebuilt = await refreshDemos();
      if (rebuilt.length) console.log(`Demo data rebuilt: ${rebuilt.join(", ")}`);
    } catch (err) {
      console.error("Demo refresh failed:", err.message);
    } finally {
      running = false;
    }
  };
  run();
  setInterval(run, everyMs).unref();
}

module.exports = { DEMOS, DEMO_PASSWORD, resetDemo, seedDemo, refreshDemos, startDemoRefresh };
