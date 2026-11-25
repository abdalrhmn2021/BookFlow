// Fewer trips to the database per request (perf/fewer-db-roundtrips). The answers must stay exactly
// what they were: same checks, same business's data - only fetched with fewer trips.
const request = require("supertest");
const jwt = require("jsonwebtoken");
const h = require("./helpers");
const RevokedToken = require("../src/models/RevokedToken");
const Tenant = require("../src/models/Tenant");

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
