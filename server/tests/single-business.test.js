// ============================================================
// وضع "البزنس الواحد": SINGLE_BUSINESS_SLUG بيسكّر المنصة على بزنس واحد
// ============================================================
// لازم نحط المتغير قبل ما نحمّل التطبيق (mode.js بيقرأه مرة وحدة وقت التحميل).
// Jest بيشغّل كل ملف اختبار بعزلة، فهاد ما بيأثر على باقي الملفات.
process.env.SINGLE_BUSINESS_SLUG = "my-salon";

const request = require("supertest");
const h = require("./helpers");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(async () => {
  // process.env مشترك بين ملفات الاختبار (--runInBand) -> نرجّعه زي ما كان
  delete process.env.SINGLE_BUSINESS_SLUG;
  await h.disconnect();
});

const registerBusiness = (slug, email) =>
  request(h.app).post("/api/auth/register-business").send({
    businessName: "Salon",
    slug,
    ownerName: "Owner",
    email,
    password: "password123",
  });

describe("Single-business mode", () => {
  test("only the configured slug can register; a second business is impossible", async () => {
    await registerBusiness("other-salon", "a@test.com").expect(403);
    await registerBusiness("my-salon", "b@test.com").expect(201);
    // نفس الـ slug مرة ثانية -> unique index بيمنعه
    await registerBusiness("my-salon", "c@test.com").expect(409);
  });

  test("the public directory lists only the configured business", async () => {
    await h.makeBusiness("my-salon");
    await h.makeBusiness("sneaky-salon"); // انضاف للداتابيس بطريقة ثانية

    const res = await request(h.app).get("/api/public/businesses").expect(200);
    expect(res.body.businesses.map((b) => b.slug)).toEqual(["my-salon"]);
  });
});
