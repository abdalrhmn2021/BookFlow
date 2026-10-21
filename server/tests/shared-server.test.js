// A shared server for sold copies: one API, many clients.
process.env.ALLOW_BUSINESS_SIGNUP = "false";
process.env.PUBLIC_DIRECTORY = "false";

const request = require("supertest");
const h = require("./helpers");
const { createBusinessWithOwner } = require("../src/services/business.service");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(async () => {
  delete process.env.ALLOW_BUSINESS_SIGNUP;
  delete process.env.PUBLIC_DIRECTORY;
  await h.disconnect();
});

describe("Shared server (ALLOW_BUSINESS_SIGNUP=false, PUBLIC_DIRECTORY=false)", () => {
  test("nobody can create a business through the API", async () => {
    const res = await request(h.app).post("/api/auth/register-business").send({
      businessName: "Sneaky Salon",
      slug: "sneaky-salon",
      ownerName: "X",
      email: "x@test.com",
      password: "password123",
    });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Business registration is disabled");
  });

  test("the list of businesses is hidden, but each booking page still works", async () => {
    await h.makeBusiness("laila-salon");
    await h.makeBusiness("reem-salon");

    await request(h.app).get("/api/public/businesses").expect(404);
    await request(h.app).get("/api/public/businesses/laila-salon").expect(200);
    await request(h.app).get("/api/public/businesses/reem-salon").expect(200);
  });

  test("two clients added by setup-client each log in to their own business only", async () => {
    const owner = (slug, email) =>
      createBusinessWithOwner({ businessName: slug, slug, ownerName: "Owner", email, password: "password123" });
    await owner("laila-salon", "laila@test.com");
    await owner("reem-salon", "reem@test.com");

    const agent = request.agent(h.app);
    await agent.post("/api/auth/login").send({ email: "laila@test.com", password: "password123" }).expect(200);
    const me = await agent.get("/api/auth/me").expect(200);
    expect(me.body.user.business.slug).toBe("laila-salon");
  });
});
