// The login page's "Customer" demo button logs in as Lina. Every visitor who tries booking as a
// customer books as her, so the demo must leave her room under the per-customer limit (5 upcoming).
const request = require("supertest");
const h = require("./helpers");
const Appointment = require("../src/models/Appointment");
const Service = require("../src/models/Service");
const User = require("../src/models/User");
const { seed, DEMO_SLUG } = require("../src/services/demo.service");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(h.disconnect);

const ACTIVE = ["pending", "confirmed"];

describe("demo customer (Lina)", () => {
  test("has only 2 upcoming bookings; the calendar keeps every booking", async () => {
    await seed({ log: () => {} });
    const lina = await User.findOne({ email: "customer@demo.com" });
    const now = new Date();

    const upcoming = await Appointment.countDocuments({
      customerId: lina._id,
      status: { $in: ACTIVE },
      startTime: { $gt: now },
    });
    expect(upcoming).toBe(2);
    // The rest of her upcoming bookings went to Khaled, not away from the calendar.
    const khaled = await User.findOne({ email: "khaled@demo.com" });
    expect(await Appointment.countDocuments({ customerId: khaled._id, startTime: { $gt: now } })).toBeGreaterThan(0);
    expect(await Appointment.countDocuments({})).toBe(5 * 6); // 5 days x 6 bookings, as before
  });

  test("a visitor using the Customer button can book", async () => {
    await seed({ log: () => {} });
    const lina = await User.findOne({ email: "customer@demo.com" });
    const sara = await User.findOne({ email: "sara@demo.com" });
    const haircut = await Service.findOne({ name: "قص شعر" });

    const res = await request(h.app)
      .post("/api/appointments")
      .set("Authorization", `Bearer ${h.tokenFor(lina)}`)
      .send({ slug: DEMO_SLUG, serviceId: haircut._id, staffId: sara._id, date: h.nextOpenDate(), time: "15:30" });
    expect(res.status).toBe(201);
  });
});
