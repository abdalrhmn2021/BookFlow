// The seller's admin panel API (/api/admin), role "superadmin".
const request = require("supertest");
const h = require("./helpers");
const User = require("../src/models/User");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(h.disconnect);

const auth = (user) => ({ Authorization: `Bearer ${h.tokenFor(user)}` });
const makeAdmin = () =>
  User.create({ name: "Me", email: "admin@seller.test", password: "password123", role: "superadmin" });

describe("Admin panel API", () => {
  test("only the superadmin gets in", async () => {
    const biz = await h.makeBusiness("salon-a");
    const customer = await h.makeCustomer("sara");
    await request(h.app).get("/api/admin/businesses").expect(401);
    await request(h.app).get("/api/admin/businesses").set(auth(biz.owner)).expect(403);
    await request(h.app).get("/api/admin/businesses").set(auth(customer)).expect(403);
    await request(h.app)
      .get("/api/admin/businesses")
      .set(auth(await makeAdmin()))
      .expect(200);
  });

  test("lists every business with its owner and usage", async () => {
    const biz = await h.makeBusiness("salon-a", { staffCount: 2 });
    await h.makeBusiness("salon-b");
    const date = h.nextOpenDate();
    await request(h.app)
      .post("/api/public/businesses/salon-a/appointments")
      .send({
        serviceId: biz.service._id,
        staffId: biz.staff[0]._id,
        date,
        time: "10:00",
        name: "Guest",
        phone: "0599123456",
      })
      .expect(201);

    const res = await request(h.app)
      .get("/api/admin/businesses")
      .set(auth(await makeAdmin()))
      .expect(200);
    expect(res.body.businesses).toHaveLength(2);
    const a = res.body.businesses.find((b) => b.slug === "salon-a");
    expect(a).toMatchObject({
      isActive: true,
      staffCount: 2,
      bookingsLast30Days: 1,
      upcomingBookings: 1,
      overdue: false,
    });
    expect(a.owners[0].email).toBe("owner@salon-a.test");
    expect(res.body.plans).toContain("free");
  });

  test("switching a business off hides its page and blocks its owner", async () => {
    const biz = await h.makeBusiness("salon-a");
    const admin = await makeAdmin();
    await request(h.app)
      .patch(`/api/admin/businesses/${biz.tenant._id}`)
      .set(auth(admin))
      .send({ isActive: false })
      .expect(200);

    await request(h.app).get("/api/public/businesses/salon-a").expect(404);
    await request(h.app).post("/api/auth/login").send({ email: biz.owner.email, password: "password123" }).expect(403);

    await request(h.app)
      .patch(`/api/admin/businesses/${biz.tenant._id}`)
      .set(auth(admin))
      .send({ isActive: true })
      .expect(200);
    await request(h.app).get("/api/public/businesses/salon-a").expect(200);
  });

  test("subscription bookkeeping, WhatsApp switch and validation", async () => {
    const biz = await h.makeBusiness("salon-a");
    const admin = await makeAdmin();
    const url = `/api/admin/businesses/${biz.tenant._id}`;

    await request(h.app)
      .patch(url)
      .set(auth(admin))
      .send({ paidUntil: "2020-01-31", plan: "basic", note: "pays cash", whatsappReminders: true })
      .expect(200);
    const listed = (await request(h.app).get("/api/admin/businesses").set(auth(admin))).body.businesses[0];
    expect(listed).toMatchObject({ plan: "basic", note: "pays cash", whatsappReminders: true, overdue: true });

    await request(h.app).patch(url).set(auth(admin)).send({ paidUntil: null }).expect(200);
    await request(h.app).patch(url).set(auth(admin)).send({ paidUntil: "tomorrow" }).expect(400);
    await request(h.app).patch(url).set(auth(admin)).send({ plan: "gold" }).expect(400);
    await request(h.app).patch(url).set(auth(admin)).send({ isActive: "no" }).expect(400);
    await request(h.app).patch(url).set(auth(admin)).send({}).expect(400);
    await request(h.app)
      .patch("/api/admin/businesses/64b000000000000000000000")
      .set(auth(admin))
      .send({ isActive: true })
      .expect(404);
  });
});
