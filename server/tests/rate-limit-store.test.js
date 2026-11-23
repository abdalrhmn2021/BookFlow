// Security review L-1: the rate limit counters live in MongoDB, so a restart doesn't reset them.
const request = require("supertest");
const h = require("./helpers");
const RateLimit = require("../src/models/RateLimit");
const { MongoRateLimitStore } = require("../src/utils/rateLimitStore");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(h.disconnect);

const storeFor = (name, windowMs = 60 * 1000) => {
  const store = new MongoRateLimitStore(name);
  store.init({ windowMs });
  return store;
};

describe("Rate limit counters in MongoDB (review L-1)", () => {
  test("the count goes on after a restart (a new store with the same name)", async () => {
    const before = storeFor("login");
    await before.increment("10.0.0.1");
    await before.increment("10.0.0.1");
    expect((await before.increment("10.0.0.1")).totalHits).toBe(3);

    // A new server process = a new store object; the counter is still there.
    const afterRestart = storeFor("login");
    expect((await afterRestart.increment("10.0.0.1")).totalHits).toBe(4);
    expect((await afterRestart.get("10.0.0.1")).totalHits).toBe(4);
  });

  test("each limiter and each key counts on its own", async () => {
    const login = storeFor("login");
    const register = storeFor("register");
    await login.increment("10.0.0.1");
    await login.increment("10.0.0.1");

    expect((await register.increment("10.0.0.1")).totalHits).toBe(1);
    expect((await login.increment("10.0.0.2")).totalHits).toBe(1);
  });

  test("a new window starts at 1 when the last one is over", async () => {
    const store = storeFor("short", 100);
    await store.increment("k");
    const first = await store.increment("k");
    expect(first.totalHits).toBe(2);

    await new Promise((r) => setTimeout(r, 150));
    const next = await store.increment("k");
    expect(next.totalHits).toBe(1);
    expect(next.resetTime.getTime()).toBeGreaterThan(first.resetTime.getTime());
    expect(await storeFor("short", 100).get("missing")).toBeUndefined();
  });

  test("decrement gives a hit back (never below 0) and resetKey forgets the key", async () => {
    const store = storeFor("login");
    await store.increment("k");
    await store.increment("k");
    await store.decrement("k");
    expect((await store.get("k")).totalHits).toBe(1);
    await store.decrement("k");
    await store.decrement("k");
    expect((await store.get("k")).totalHits).toBe(0);

    await store.resetKey("k");
    expect(await store.get("k")).toBeUndefined();
  });

  test("parallel hits are all counted", async () => {
    const store = storeFor("login");
    await Promise.all(Array.from({ length: 10 }, () => store.increment("k")));
    expect((await store.get("k")).totalHits).toBe(10);
  });

  test("no IP or email is stored as it is", async () => {
    await storeFor("loginEmailLimiter").increment("email:lina@customer.test");
    const docs = await RateLimit.find().lean();
    expect(docs).toHaveLength(1);
    expect(JSON.stringify(docs)).not.toContain("lina");
    expect(docs[0]._id).toMatch(/^[a-f\d]{64}$/);
  });

  test("the real login limiter counts in the database", async () => {
    const user = await h.makeCustomer("lina");
    for (let i = 0; i < 5; i++) {
      await request(h.app).post("/api/auth/login").send({ email: user.email, password: "wrong-password" }).expect(401);
    }
    await request(h.app).post("/api/auth/login").send({ email: user.email, password: "wrong-password" }).expect(429);
    expect(await RateLimit.countDocuments()).toBeGreaterThan(0);
  });
});
