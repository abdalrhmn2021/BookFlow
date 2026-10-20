const request = require("supertest");
const h = require("./helpers");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(h.disconnect);

describe("NoSQL injection", () => {
  test("login with an object as email is rejected (400) and returns no token", async () => {
    await h.makeCustomer("victim");

    const res = await request(h.app)
      .post("/api/auth/login")
      .send({ email: { $gt: "" }, password: "password123" });

    expect(res.status).toBe(400);
    expect(res.body.token).toBeUndefined();
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  test("login with an object as password is rejected (400), not a 500", async () => {
    await h.makeCustomer("victim");

    const res = await request(h.app)
      .post("/api/auth/login")
      .send({ email: "victim@customer.test", password: { $ne: "" } });

    expect(res.status).toBe(400);
    expect(res.body.token).toBeUndefined();
  });

  test("register with an object as email is rejected (400)", async () => {
    await h.makeCustomer("victim");

    const res = await request(h.app)
      .post("/api/auth/register")
      .send({ name: "Attacker", email: { $gt: "" }, password: "password123" });

    expect(res.status).toBe(400);
  });

  test("normal login still works (200)", async () => {
    await h.makeCustomer("victim");

    const res = await request(h.app)
      .post("/api/auth/login")
      .send({ email: "victim@customer.test", password: "password123" })
      .expect(200);

    expect(res.body.token).toBeDefined();
  });
});
