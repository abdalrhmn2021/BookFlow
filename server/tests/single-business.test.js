process.env.SINGLE_BUSINESS_SLUG = "my-salon";

const request = require("supertest");
const h = require("./helpers");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(async () => {
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
    await registerBusiness("my-salon", "c@test.com").expect(409);
  });

  test("the public directory lists only the configured business", async () => {
    await h.makeBusiness("my-salon");
    await h.makeBusiness("sneaky-salon");

    const res = await request(h.app).get("/api/public/businesses").expect(200);
    expect(res.body.businesses.map((b) => b.slug)).toEqual(["my-salon"]);
  });
});
