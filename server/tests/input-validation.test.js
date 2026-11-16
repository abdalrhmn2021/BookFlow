// Security review day 5 (C-01 .. C-03): input checks. (C-04, the CSRF guard, lives in client/src/proxy.ts.)
const request = require("supertest");
const h = require("./helpers");
const User = require("../src/models/User");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(h.disconnect);

const auth = (user) => ({ Authorization: `Bearer ${h.tokenFor(user)}` });

describe("C-01: ids must be ids, not query operators", () => {
  test("a guest booking with serviceId or staffId as an object is refused (400)", async () => {
    const biz = await h.makeBusiness("ids-a");
    const base = { date: h.nextOpenDate(), time: "10:00", name: "Guest", phone: "0599123456" };
    const url = `/api/public/businesses/${biz.tenant.slug}/appointments`;

    const r1 = await request(h.app)
      .post(url)
      .send({ ...base, serviceId: { $ne: null }, staffId: biz.staff[0]._id });
    expect(r1.status).toBe(400);
    expect(r1.body.message).toBe("Invalid serviceId");

    const r2 = await request(h.app)
      .post(url)
      .send({ ...base, serviceId: biz.service._id, staffId: { $gt: "" } });
    expect(r2.status).toBe(400);
    expect(r2.body.message).toBe("Invalid staffId");

    // "any staff member" and real ids still work
    await request(h.app)
      .post(url)
      .send({ ...base, serviceId: biz.service._id, staffId: "any" })
      .expect(201);
  });

  test("a customer booking with an operator as serviceId is refused", async () => {
    const biz = await h.makeBusiness("ids-b");
    const customer = await h.makeCustomer("noor");
    await request(h.app)
      .post("/api/appointments")
      .set(auth(customer))
      .send({
        slug: biz.tenant.slug,
        serviceId: { $exists: true },
        staffId: biz.staff[0]._id,
        date: h.nextOpenDate(),
        time: "10:00",
      })
      .expect(400);
  });

  test("availability with a list instead of one id is refused (public and dashboard)", async () => {
    const biz = await h.makeBusiness("ids-c");
    const date = h.nextOpenDate();
    const s = String(biz.service._id);
    await request(h.app)
      .get(
        `/api/public/businesses/${biz.tenant.slug}/availability?serviceId=${s}&serviceId=${s}&staffId=any&date=${date}`,
      )
      .expect(400);
    await request(h.app)
      .get(`/api/appointments/business/availability?serviceId=${s}&staffId=x&staffId=y&date=${date}`)
      .set(auth(biz.owner))
      .expect(400);
  });
});

describe("C-02: lengths and formats", () => {
  test("a customer's phone is cleaned like a guest's, and a made-up one is refused", async () => {
    const ok = await request(h.app)
      .post("/api/auth/register")
      .send({ name: "Sara", email: "sara@test.com", password: "password123", phone: "0599 123-456" })
      .expect(201);
    expect((await User.findById(ok.body.user.id)).phone).toBe("0599123456");

    const bad = await request(h.app)
      .post("/api/auth/register")
      .send({ name: "Hala", email: "hala@test.com", password: "password123", phone: "call me maybe" })
      .expect(400);
    expect(bad.body.errors).toContain("Please provide a valid phone number");
  });

  test("an older account with an odd phone can still change its password (only new phones are checked)", async () => {
    const user = await h.makeCustomer("old");
    await User.collection.updateOne({ _id: user._id }, { $set: { phone: "home phone" } });
    await request(h.app)
      .patch("/api/auth/password")
      .set(auth(user))
      .send({ currentPassword: "password123", newPassword: "newpassword1" })
      .expect(200);
  });

  test("a business name over 80 characters and an email over 254 are refused", async () => {
    const res = await request(h.app)
      .post("/api/auth/register-business")
      .send({
        businessName: "x".repeat(81),
        slug: "long-name",
        ownerName: "Owner",
        email: "own@test.com",
        password: "password123",
      })
      .expect(400);
    expect(res.body.errors).toContain("Business name is too long");

    await request(h.app)
      .post("/api/auth/register")
      .send({ name: "Long", email: `${"a".repeat(250)}@test.com`, password: "password123" })
      .expect(400);
  });

  test("a staff member's phone is checked on create and on update", async () => {
    const biz = await h.makeBusiness("staff-phone");
    await request(h.app)
      .post("/api/staff")
      .set(auth(biz.owner))
      .send({ name: "New", email: "new@staff.test", password: "password123", phone: "nope" })
      .expect(400);
    await request(h.app)
      .patch(`/api/staff/${biz.staff[0]._id}`)
      .set(auth(biz.owner))
      .send({ phone: "nope" })
      .expect(400);
    await request(h.app)
      .patch(`/api/staff/${biz.staff[0]._id}`)
      .set(auth(biz.owner))
      .send({ phone: "+970 599 000 111" })
      .expect(200);
  });
});

describe("C-03: working hours with a null day", () => {
  test("business and staff hours with a null/number in the list get 400, not 500", async () => {
    const biz = await h.makeBusiness("hours");
    await request(h.app)
      .put("/api/tenants/me/working-hours")
      .set(auth(biz.owner))
      .send({ workingHours: [null] })
      .expect(400);
    await request(h.app)
      .put(`/api/staff/${biz.staff[0]._id}/schedule`)
      .set(auth(biz.owner))
      .send({ workingHours: [1, 2, 3] })
      .expect(400);
  });
});
