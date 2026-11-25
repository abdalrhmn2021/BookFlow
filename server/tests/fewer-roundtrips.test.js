// Fewer trips to the database per request (perf/fewer-db-roundtrips). The answers must stay exactly
// what they were: same checks, same business's data - only fetched with fewer trips.
const request = require("supertest");
const jwt = require("jsonwebtoken");
const h = require("./helpers");
const RevokedToken = require("../src/models/RevokedToken");

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
