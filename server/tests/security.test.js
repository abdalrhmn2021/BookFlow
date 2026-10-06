// ============================================================
// اختبارات الأمان: كلمة سر قوية + headers الحماية (helmet)
// ============================================================
const request = require("supertest");
const h = require("./helpers");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(h.disconnect);

describe("Security", () => {
  test("a password shorter than 8 characters is rejected (400)", async () => {
    const res = await request(h.app)
      .post("/api/auth/register")
      .send({ name: "Ahmad", email: "ahmad@test.com", password: "1234567" })
      .expect(400);
    expect(res.body.errors).toContain("Password must be at least 8 characters");
  });

  test("an 8-character password is accepted (201)", async () => {
    await request(h.app)
      .post("/api/auth/register")
      .send({ name: "Sara", email: "sara@test.com", password: "12345678" })
      .expect(201);
  });

  test("security headers are set and Express is hidden", async () => {
    const res = await request(h.app).get("/").expect(200);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});
