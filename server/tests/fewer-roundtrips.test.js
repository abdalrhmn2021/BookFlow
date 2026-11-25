// Fewer trips to the database per request (perf/fewer-db-roundtrips). The answers must stay exactly
// what they were: same checks, same business's data - only fetched with fewer trips.
const request = require("supertest");
const jwt = require("jsonwebtoken");
const h = require("./helpers");
const RevokedToken = require("../src/models/RevokedToken");
const Tenant = require("../src/models/Tenant");
const Appointment = require("../src/models/Appointment");
const { closeStalePending } = require("../src/services/maintenance.service");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(h.disconnect);

const HOUR = 60 * 60 * 1000;
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

describe("protect: both lookups at once, every check kept", () => {
  test("a token that was logged out is still refused, with the same message", async () => {
    const biz = await h.makeBusiness("roundtrips-revoked");
    const token = jwt.sign({ id: biz.owner._id, jti: "logged-out" }, process.env.JWT_SECRET, { expiresIn: "1h" });
    await RevokedToken.create({ jti: "logged-out", expiresAt: new Date(Date.now() + HOUR) });

    const res = await request(h.app).get("/api/auth/me").set(bearer(token)).expect(401);
    expect(res.body.message).toBe("You logged out, please log in again");
  });

  test("a token for a user that no longer exists is still refused", async () => {
    const biz = await h.makeBusiness("roundtrips-gone");
    const token = h.tokenFor(biz.owner);
    await biz.owner.deleteOne();

    const res = await request(h.app).get("/api/auth/me").set(bearer(token)).expect(401);
    expect(res.body.message).toBe("User no longer exists");
  });

  test("a valid token still works", async () => {
    const biz = await h.makeBusiness("roundtrips-ok");
    const res = await request(h.app)
      .get("/api/auth/me")
      .set(bearer(h.tokenFor(biz.owner)))
      .expect(200);
    expect(res.body.user.role).toBe("owner");
  });
});

describe("GET /auth/me reuses the user protect loaded", () => {
  test("an owner gets their business, a customer gets none, and no password is sent", async () => {
    const biz = await h.makeBusiness("roundtrips-me-owner");
    const owner = await request(h.app)
      .get("/api/auth/me")
      .set(bearer(h.tokenFor(biz.owner)))
      .expect(200);
    expect(owner.body.user).toMatchObject({ id: String(biz.owner._id), role: "owner", email: biz.owner.email });
    expect(owner.body.user.business).toEqual({
      id: String(biz.tenant._id),
      name: biz.tenant.name,
      slug: "roundtrips-me-owner",
    });
    expect(owner.body.user.password).toBeUndefined();

    const customer = await h.makeCustomer("roundtrips-customer");
    const me = await request(h.app)
      .get("/api/auth/me")
      .set(bearer(h.tokenFor(customer)))
      .expect(200);
    expect(me.body.user).toMatchObject({ role: "customer", business: null });
    expect(me.body.user.password).toBeUndefined();
  });
});

describe("dashboard routes read the time zone from requireTenant", () => {
  test("stats and the day list use the business's own time zone", async () => {
    const biz = await h.makeBusiness("roundtrips-tz");
    // UTC+14: a wrong zone would give another date for most of the day.
    await Tenant.updateOne({ _id: biz.tenant._id }, { timezone: "Pacific/Kiritimati" });
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Kiritimati" }).format(new Date());
    const owner = bearer(h.tokenFor(biz.owner));

    const stats = await request(h.app).get("/api/appointments/business/stats").set(owner).expect(200);
    expect(stats.body.date).toBe(today);
    expect(stats.body.week[0].date).toBe(today);

    const day = await request(h.app).get("/api/appointments/business").set(owner).expect(200);
    expect(day.body.date).toBe(today);

    await request(h.app).get("/api/appointments/business/upcoming").set(owner).expect(200);
  });

  test("a disabled business is still refused on all three", async () => {
    const biz = await h.makeBusiness("roundtrips-off");
    await Tenant.updateOne({ _id: biz.tenant._id }, { isActive: false });
    for (const path of ["/business", "/business/stats", "/business/upcoming"]) {
      await request(h.app)
        .get(`/api/appointments${path}`)
        .set(bearer(h.tokenFor(biz.owner)))
        .expect(403);
    }
  });
});

describe("closeStalePending has an index of its own", () => {
  const STALE_INDEX = "tenantId_1_status_1_endTime_1";

  function booking(biz, startTime, status) {
    return {
      tenantId: biz.tenant._id,
      guest: { name: "Guest", phone: "0590000000" },
      staffId: biz.staff[0]._id,
      serviceId: biz.service._id,
      serviceName: "Haircut",
      price: 20,
      duration: 30,
      startTime,
      endTime: new Date(startTime.getTime() + 30 * 60 * 1000),
      status,
    };
  }

  test("its query uses the {tenantId, status, endTime} index", async () => {
    await Appointment.createIndexes();
    const biz = await h.makeBusiness("roundtrips-index");
    // A business with history, so the planner has a real choice between this index and
    // {tenantId, startTime} (which would read every one of these).
    const day = 24 * HOUR;
    await Appointment.insertMany(
      Array.from({ length: 40 }, (_, i) => booking(biz, new Date(Date.now() - (i + 2) * day), "completed")),
    );
    const plan = await Appointment.find({
      tenantId: biz.tenant._id,
      status: "pending",
      endTime: { $lte: new Date(Date.now() - 24 * HOUR) },
    }).explain("queryPlanner");
    expect(JSON.stringify(plan)).toContain(STALE_INDEX);
  });

  test("it still closes only old pending bookings of that business", async () => {
    const [biz, other] = [await h.makeBusiness("roundtrips-stale"), await h.makeBusiness("roundtrips-other")];
    const old = new Date(Date.now() - 3 * 24 * HOUR);
    const [stale, confirmed, recent, otherStale] = await Appointment.insertMany([
      booking(biz, old, "pending"),
      booking(biz, old, "confirmed"),
      booking(biz, new Date(Date.now() - 2 * HOUR), "pending"),
      booking(other, old, "pending"),
    ]);

    expect(await closeStalePending({ tenantId: biz.tenant._id })).toBe(1);

    const status = async (a) => (await Appointment.findById(a._id)).status;
    expect(await status(stale)).toBe("cancelled");
    expect(await status(confirmed)).toBe("confirmed");
    expect(await status(recent)).toBe("pending");
    expect(await status(otherStale)).toBe("pending"); // another business: not touched
  });
});

describe("GET /appointments/me: every upcoming booking, the latest 50 past ones", () => {
  const DAY = 24 * HOUR;

  function booking(biz, customer, startTime, status = "completed") {
    return {
      tenantId: biz.tenant._id,
      customerId: customer._id,
      staffId: biz.staff[0]._id,
      serviceId: biz.service._id,
      serviceName: "Haircut",
      price: 20,
      duration: 30,
      startTime,
      endTime: new Date(startTime.getTime() + 30 * 60 * 1000),
      status,
    };
  }

  test("55 past + 3 upcoming: 53 sent, oldest first, the 5 oldest left out", async () => {
    const biz = await h.makeBusiness("roundtrips-mine");
    const customer = await h.makeCustomer("historian");
    const now = Date.now();
    await Appointment.insertMany([
      ...Array.from({ length: 55 }, (_, i) => booking(biz, customer, new Date(now - (i + 1) * DAY))),
      ...[1, 2, 3].map((d) => booking(biz, customer, new Date(now + d * DAY), "pending")),
    ]);

    const res = await request(h.app)
      .get("/api/appointments/me")
      .set(bearer(h.tokenFor(customer)))
      .expect(200);
    const times = res.body.appointments.map((a) => new Date(a.startTime).getTime());

    expect(res.body.count).toBe(53);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(times.filter((t) => t > now)).toHaveLength(3);
    expect(Math.min(...times)).toBe(now - 50 * DAY);
    expect(res.body.appointments[0].tenantId.slug).toBe("roundtrips-mine"); // still populated
    expect(res.body.appointments[0].staffId.name).toBe("Staff 1");
  });

  test("?when=past: newest first, capped at 50; ?when=upcoming unchanged", async () => {
    const biz = await h.makeBusiness("roundtrips-when");
    const customer = await h.makeCustomer("when");
    const now = Date.now();
    await Appointment.insertMany([
      ...Array.from({ length: 52 }, (_, i) => booking(biz, customer, new Date(now - (i + 1) * HOUR))),
      booking(biz, customer, new Date(now + 2 * HOUR), "pending"),
    ]);
    const auth = bearer(h.tokenFor(customer));

    const past = await request(h.app).get("/api/appointments/me?when=past").set(auth).expect(200);
    expect(past.body.count).toBe(50);
    expect(new Date(past.body.appointments[0].startTime).getTime()).toBe(now - HOUR);

    const next = await request(h.app).get("/api/appointments/me?when=upcoming").set(auth).expect(200);
    expect(next.body.count).toBe(1);
  });

  test("another customer's bookings never show up", async () => {
    const biz = await h.makeBusiness("roundtrips-iso");
    const [me, other] = [await h.makeCustomer("me"), await h.makeCustomer("other")];
    await Appointment.insertMany([
      booking(biz, other, new Date(Date.now() - HOUR)),
      booking(biz, other, new Date(Date.now() + DAY), "pending"),
    ]);
    const res = await request(h.app)
      .get("/api/appointments/me")
      .set(bearer(h.tokenFor(me)))
      .expect(200);
    expect(res.body.count).toBe(0);
  });
});
