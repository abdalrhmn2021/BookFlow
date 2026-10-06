// ============================================================
// اختبارات الجلسة: التوكن بـ httpOnly cookie
// ============================================================
const request = require("supertest");
const h = require("./helpers");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(h.disconnect);

describe("Session cookie", () => {
  test("login sets an httpOnly, SameSite=Lax cookie with the token", async () => {
    await h.makeCustomer("ahmad");
    const res = await request(h.app)
      .post("/api/auth/login")
      .send({ email: "ahmad@customer.test", password: "password123" })
      .expect(200);

    const cookie = res.headers["set-cookie"].find((c) => c.startsWith("bookflow_token="));
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i); //   JavaScript ما بيقدر يقرأها
    expect(cookie).toMatch(/SameSite=Lax/i); // حماية من CSRF
  });

  test("the cookie alone (no Authorization header) is enough for /auth/me, until logout", async () => {
    await h.makeCustomer("ahmad");
    // agent = متصفح صغير: بيحفظ الكوكيز وبيرجع يبعثها مع كل طلب
    const browser = request.agent(h.app);

    await browser
      .post("/api/auth/login")
      .send({ email: "ahmad@customer.test", password: "password123" })
      .expect(200);

    const me = await browser.get("/api/auth/me").expect(200);
    expect(me.body.user.email).toBe("ahmad@customer.test");

    await browser.post("/api/auth/logout").expect(200);
    await browser.get("/api/auth/me").expect(401); // الكوكي انمسحت
  });

  test("register also logs the user in with the cookie", async () => {
    const browser = request.agent(h.app);
    await browser
      .post("/api/auth/register")
      .send({ name: "Sara", email: "sara@test.com", password: "password123" })
      .expect(201);
    await browser.get("/api/auth/me").expect(200);
  });

  test("a fake cookie is rejected (401)", async () => {
    await request(h.app)
      .get("/api/auth/me")
      .set("Cookie", "bookflow_token=not-a-real-jwt")
      .expect(401);
  });
});
