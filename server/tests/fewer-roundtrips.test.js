// Fewer trips to the database per request (perf/fewer-db-roundtrips). The answers must stay exactly
// what they were: same checks, same business's data - only fetched with fewer trips.
const request = require("supertest");
const jwt = require("jsonwebtoken");
const h = require("./helpers");
const RevokedToken = require("../src/models/RevokedToken");
const Tenant = require("../src/models/Tenant");
const Service = require("../src/models/Service");
const User = require("../src/models/User");
const Appointment = require("../src/models/Appointment");
const {
  closeStalePending,
  closeStalePendingForDashboard,
  DASHBOARD_CLOSE_EVERY_MS,
} = require("../src/services/maintenance.service");

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

describe("the dashboard closes stale pending bookings at most once per 5 minutes per business", () => {
  function pending(biz, startTime) {
    return Appointment.create({
      tenantId: biz.tenant._id,
      guest: { name: "Guest", phone: "0590000000" },
      staffId: biz.staff[0]._id,
      serviceId: biz.service._id,
      serviceName: "Haircut",
      price: 20,
      duration: 30,
      startTime,
      endTime: new Date(startTime.getTime() + 30 * 60 * 1000),
      status: "pending",
    });
  }
  const threeDaysAgo = () => new Date(Date.now() - 3 * 24 * HOUR);

  afterEach(() => jest.restoreAllMocks());

  test("three dashboard requests close it, with one write to the database", async () => {
    const biz = await h.makeBusiness("roundtrips-once");
    const stale = await pending(biz, threeDaysAgo());
    const writes = jest.spyOn(Appointment, "updateMany");
    const owner = bearer(h.tokenFor(biz.owner));
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: biz.tenant.timezone }).format(stale.startTime);

    // The schedule tab asks for the day and upcoming at the same moment: both must see it closed.
    const [day] = await Promise.all([
      request(h.app).get(`/api/appointments/business?date=${date}`).set(owner),
      request(h.app).get("/api/appointments/business/upcoming").set(owner),
    ]);
    await request(h.app).get("/api/appointments/business/stats").set(owner).expect(200);

    expect(writes).toHaveBeenCalledTimes(1);
    expect(day.body.appointments.find((a) => a._id === String(stale._id)).status).toBe("cancelled");
  });

  test("after 5 minutes it runs again; another business is not held back", async () => {
    const [a, b] = [await h.makeBusiness("roundtrips-later-a"), await h.makeBusiness("roundtrips-later-b")];
    const start = Date.now();
    await closeStalePendingForDashboard(a.tenant._id, start);

    const late = await pending(a, threeDaysAgo());
    expect(await closeStalePendingForDashboard(a.tenant._id, start + 60 * 1000)).toBe(0); // within 5 min
    expect((await Appointment.findById(late._id)).status).toBe("pending");

    expect(await closeStalePendingForDashboard(a.tenant._id, start + DASHBOARD_CLOSE_EVERY_MS + 1)).toBe(1);
    expect((await Appointment.findById(late._id)).status).toBe("cancelled");

    const other = await pending(b, threeDaysAgo());
    expect(await closeStalePendingForDashboard(b.tenant._id, start + 60 * 1000)).toBe(1);
    expect((await Appointment.findById(other._id)).status).toBe("cancelled");
  });

  test("a failed run is forgotten, so the next request tries again", async () => {
    const biz = await h.makeBusiness("roundtrips-retry");
    const start = Date.now();
    jest.spyOn(Appointment, "updateMany").mockRejectedValueOnce(new Error("db down"));
    await expect(closeStalePendingForDashboard(biz.tenant._id, start)).rejects.toThrow("db down");

    const stale = await pending(biz, threeDaysAgo());
    expect(await closeStalePendingForDashboard(biz.tenant._id, start + 1000)).toBe(1);
    expect((await Appointment.findById(stale._id)).status).toBe("cancelled");
  });
});

describe("public availability: business, service and staff looked up together, checked after", () => {
  const slots = (slug, serviceId, staffId, date = h.nextOpenDate()) =>
    request(h.app)
      .get(`/api/public/businesses/${slug}/availability`)
      .query({ serviceId: String(serviceId), staffId: String(staffId), date });

  test("same free times as before, for one staff member and for 'any'", async () => {
    const biz = await h.makeBusiness("roundtrips-slots", { staffCount: 2 });
    const one = await slots("roundtrips-slots", biz.service._id, biz.staff[0]._id).expect(200);
    expect(one.body.isOpen).toBe(true);
    expect(one.body.slots).toContain("09:00");
    expect(one.body.staff).toEqual({ id: String(biz.staff[0]._id), name: "Staff 1" });

    const any = await slots("roundtrips-slots", biz.service._id, "any").expect(200);
    expect(any.body.slots).toEqual(one.body.slots); // both staff work the business's hours
    expect(any.body.service.id).toBe(String(biz.service._id));
  });

  test("another business's service or staff member: the same 404s, nothing of theirs in the answer", async () => {
    const mine = await h.makeBusiness("roundtrips-mine-slots");
    const theirs = await h.makeBusiness("roundtrips-their-slots");

    for (const staffId of [mine.staff[0]._id, "any"]) {
      const res = await slots("roundtrips-mine-slots", theirs.service._id, staffId).expect(404);
      expect(res.body).toEqual({ message: "Service not found" });
    }
    const res = await slots("roundtrips-mine-slots", mine.service._id, theirs.staff[0]._id).expect(404);
    expect(res.body).toEqual({ message: "Staff member not found" });
  });

  test("an inactive service or staff member, or an unknown business, is still not found", async () => {
    const biz = await h.makeBusiness("roundtrips-inactive");
    await Service.updateOne({ _id: biz.service._id }, { isActive: false });
    for (const staffId of [biz.staff[0]._id, "any"]) {
      expect((await slots("roundtrips-inactive", biz.service._id, staffId).expect(404)).body.message).toBe(
        "Service not found",
      );
    }

    const other = await h.makeBusiness("roundtrips-inactive-staff");
    await User.updateOne({ _id: other.staff[0]._id }, { isActive: false });
    expect(
      (await slots("roundtrips-inactive-staff", other.service._id, other.staff[0]._id).expect(404)).body.message,
    ).toBe("Staff member not found");

    // A real service, but on a business that doesn't exist: the business is reported first.
    for (const staffId of [other.staff[0]._id, "any"]) {
      expect((await slots("no-such-business", other.service._id, staffId).expect(404)).body.message).toBe(
        "Business not found",
      );
    }
  });
});

describe("free times and the conflict check read only the bookings around that time", () => {
  const { staffBusyFilter } = require("../src/services/booking.service");
  const book = (customer, biz, staff, date, time, serviceId = biz.service._id) =>
    request(h.app)
      .post("/api/appointments")
      .set(bearer(h.tokenFor(customer)))
      .send({ slug: biz.tenant.slug, serviceId, staffId: staff._id, date, time });

  test("the query uses the {tenantId, staffId, startTime} index", async () => {
    await Appointment.createIndexes();
    const biz = await h.makeBusiness("roundtrips-busy-index", { staffCount: 2 });
    const from = new Date();
    // Bookings the other indexes would have to read but this one skips: the other staff member's
    // bookings in the same hours, and this staff member's old ones (still "confirmed").
    const at = (staff, startTime) => ({
      tenantId: biz.tenant._id,
      guest: { name: "Guest", phone: "0590000000" },
      staffId: staff._id,
      serviceId: biz.service._id,
      serviceName: "Haircut",
      price: 20,
      duration: 30,
      startTime,
      endTime: new Date(startTime.getTime() + 30 * 60 * 1000),
      status: "confirmed",
    });
    await Appointment.insertMany([
      ...Array.from({ length: 30 }, (_, i) => at(biz.staff[1], new Date(from.getTime() + (i % 8) * HOUR))),
      ...Array.from({ length: 30 }, (_, i) => at(biz.staff[0], new Date(from.getTime() - (i + 3) * 24 * HOUR))),
    ]);
    const plan = await Appointment.find(
      staffBusyFilter(biz.staff[0], from, new Date(from.getTime() + 8 * HOUR)),
    ).explain("queryPlanner");
    expect(JSON.stringify(plan.queryPlanner.winningPlan)).toContain("tenantId_1_staffId_1_startTime_1");
  });

  test("an 8-hour booking still blocks every time it covers; another staff member stays free", async () => {
    const biz = await h.makeBusiness("roundtrips-long", { staffCount: 2 });
    const long = await Service.create({ tenantId: biz.tenant._id, name: "All day", price: 100, duration: 480 });
    const customer = await h.makeCustomer("longbooker");
    const date = h.nextOpenDate();
    expect((await book(customer, biz, biz.staff[0], date, "09:00", long._id)).status).toBe(201);

    const free = (staff) =>
      request(h.app)
        .get("/api/public/businesses/roundtrips-long/availability")
        .query({ serviceId: String(biz.service._id), staffId: String(staff._id), date });
    const busy = (await free(biz.staff[0]).expect(200)).body.slots;
    expect(busy).not.toContain("09:00");
    expect(busy).not.toContain("16:30"); // 09:00 + 8h = 17:00
    expect((await free(biz.staff[1]).expect(200)).body.slots).toContain("16:30");

    // The conflict check inside the booking transaction agrees.
    const second = await h.makeCustomer("second");
    expect((await book(second, biz, biz.staff[0], date, "16:00")).status).toBe(409);
    expect((await book(second, biz, biz.staff[1], date, "16:00")).status).toBe(201);
  });
});
