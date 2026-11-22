const request = require("supertest");
const h = require("./helpers");
const Appointment = require("../src/models/Appointment");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(h.disconnect);

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const auth = (user) => ({ Authorization: `Bearer ${h.tokenFor(user)}` });

// A booking `hoursAhead` from now (negative = in the past), written straight to the database.
const booking = (biz, hoursAhead, { status = "confirmed", staff = biz.staff[0], name = "Guest" } = {}) => {
  const start = new Date(Date.now() + hoursAhead * HOUR);
  return Appointment.create({
    tenantId: biz.tenant._id,
    staffId: staff._id,
    serviceId: biz.service._id,
    serviceName: "Haircut",
    price: 20,
    duration: 30,
    startTime: start,
    endTime: new Date(start.getTime() + 30 * 60 * 1000),
    status,
    guest: { name, phone: "0599123456" },
  });
};

const localDay = (biz, date) => new Intl.DateTimeFormat("en-CA", { timeZone: biz.tenant.timezone }).format(date);

describe("Upcoming bookings (dashboard)", () => {
  test("lists the next active bookings and counts them per day, past and closed ones left out", async () => {
    const biz = await h.makeBusiness("upcoming-a");
    const later = await booking(biz, 5 * 24, { status: "pending", name: "Later" });
    const soon = await booking(biz, 3, { name: "Soon" });
    const sameDay = await booking(biz, 5 * 24 + 1, { name: "Same day" });
    await booking(biz, -2); // already happened
    await booking(biz, 30, { status: "cancelled" });
    await booking(biz, 70 * 24); // further than the window

    const res = await request(h.app).get("/api/appointments/business/upcoming").set(auth(biz.owner)).expect(200);

    expect(res.body.total).toBe(3);
    expect(res.body.appointments.map((a) => a.guest.name)).toEqual(["Soon", "Later", "Same day"]);
    expect(res.body.appointments[0].staffId.name).toBe("Staff 1");
    // Expected counts per local day ("Later" and "Same day" are an hour apart, usually one day).
    const expected = new Map();
    for (const a of [soon, later, sameDay]) {
      const day = localDay(biz, a.startTime);
      expected.set(day, (expected.get(day) || 0) + 1);
    }
    expect(res.body.days).toEqual([...expected].map(([date, count]) => ({ date, count })));
  });

  test("staff see only their own, and other businesses never show", async () => {
    const biz = await h.makeBusiness("upcoming-b", { staffCount: 2 });
    const other = await h.makeBusiness("upcoming-c");
    await booking(biz, 4, { staff: biz.staff[0], name: "Mine" });
    await booking(biz, 6, { staff: biz.staff[1], name: "Theirs" });
    await booking(other, 5, { name: "Other business" });

    const asStaff = await request(h.app).get("/api/appointments/business/upcoming").set(auth(biz.staff[0])).expect(200);
    expect(asStaff.body.appointments.map((a) => a.guest.name)).toEqual(["Mine"]);

    const asOwner = await request(h.app).get("/api/appointments/business/upcoming").set(auth(biz.owner)).expect(200);
    expect(asOwner.body.appointments.map((a) => a.guest.name)).toEqual(["Mine", "Theirs"]);
  });

  test("customers and visitors can't read it", async () => {
    await h.makeBusiness("upcoming-d");
    const customer = await h.makeCustomer("sara");
    await request(h.app).get("/api/appointments/business/upcoming").expect(401);
    await request(h.app).get("/api/appointments/business/upcoming").set(auth(customer)).expect(403);
  });

  test("at most 10 in the list, but every one is counted", async () => {
    const biz = await h.makeBusiness("upcoming-e");
    for (let i = 0; i < 12; i++) await booking(biz, 24 + (i * DAY) / HOUR);
    const res = await request(h.app).get("/api/appointments/business/upcoming").set(auth(biz.owner)).expect(200);
    expect(res.body.appointments).toHaveLength(10);
    expect(res.body.total).toBe(12);
    expect(res.body.days.reduce((sum, d) => sum + d.count, 0)).toBe(12);
  });
});
