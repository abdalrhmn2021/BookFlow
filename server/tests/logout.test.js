// Logout ends the login on the server too (security review): a copy of the token taken before
// logout - a stolen cookie or a saved Bearer token - is refused afterwards, not only when it expires.
const request = require("supertest");
const h = require("./helpers");
const RevokedToken = require("../src/models/RevokedToken");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(h.disconnect);

const cookieOf = (res) => (res.headers["set-cookie"] || []).find((c) => c.startsWith("bookflow_token="));

async function loggedIn() {
  await h.makeCustomer("lina");
  const res = await request(h.app)
    .post("/api/auth/login")
    .send({ email: "lina@customer.test", password: "password123" })
    .expect(200);
  return { cookie: cookieOf(res).split(";")[0], token: res.body.token };
}

test("the cookie from before logout no longer works", async () => {
  const { cookie } = await loggedIn();
  await request(h.app).get("/api/auth/me").set("Cookie", cookie).expect(200);

  await request(h.app).post("/api/auth/logout").set("Cookie", cookie).expect(200);
  const res = await request(h.app).get("/api/auth/me").set("Cookie", cookie).expect(401);
  expect(res.body.message).toBe("You logged out, please log in again");
});

test("a Bearer token is revoked by logout too, and other logins stay valid", async () => {
  const first = await loggedIn();
  const second = await request(h.app)
    .post("/api/auth/login")
    .send({ email: "lina@customer.test", password: "password123" })
    .expect(200);

  await request(h.app).post("/api/auth/logout").set("Authorization", `Bearer ${first.token}`).expect(200);
  await request(h.app).get("/api/auth/me").set("Authorization", `Bearer ${first.token}`).expect(401);
  await request(h.app).get("/api/auth/me").set("Authorization", `Bearer ${second.body.token}`).expect(200);
});

test("the revoked entry lives only until the token would have expired", async () => {
  const { cookie } = await loggedIn();
  await request(h.app).post("/api/auth/logout").set("Cookie", cookie).expect(200);
  const entry = await RevokedToken.findOne({});
  expect(entry.expiresAt.getTime()).toBeGreaterThan(Date.now());
  expect(entry.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 8 * 24 * 60 * 60 * 1000);
});

test("logout without a login (or with a bad token) still just answers OK", async () => {
  await request(h.app).post("/api/auth/logout").expect(200);
  await request(h.app).post("/api/auth/logout").set("Authorization", "Bearer not-a-token").expect(200);
  expect(await RevokedToken.countDocuments({})).toBe(0);
});

// GET /auth/session: the site's page-load check. No login -> 200 { user: null } (no console error
// for every logged-out visitor); any token -> exactly what /auth/me does.
describe("GET /auth/session", () => {
  test("no login at all: 200 and user null", async () => {
    const res = await request(h.app).get("/api/auth/session").expect(200);
    expect(res.body).toEqual({ user: null });
  });

  test("logged in: the same user /auth/me returns", async () => {
    const customer = await h.makeCustomer("session");
    const auth = { Authorization: `Bearer ${h.tokenFor(customer)}` };
    const session = await request(h.app).get("/api/auth/session").set(auth).expect(200);
    const me = await request(h.app).get("/api/auth/me").set(auth).expect(200);
    expect(session.body).toEqual(me.body);
    expect(session.body.user.email).toBe("session@customer.test");
  });

  test("a bad or expired token is still refused with 401", async () => {
    await request(h.app).get("/api/auth/session").set("Authorization", "Bearer not-a-real-token").expect(401);
    const customer = await h.makeCustomer("expired");
    const expired = require("jsonwebtoken").sign({ id: customer._id }, process.env.JWT_SECRET, { expiresIn: -10 });
    await request(h.app).get("/api/auth/session").set("Authorization", `Bearer ${expired}`).expect(401);
  });
});
