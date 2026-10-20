const request = require("supertest");
const h = require("./helpers");
const Appointment = require("../src/models/Appointment");
const { normalizePhone } = require("../src/controllers/public.controller");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(h.disconnect);

const guestBook = (biz, time, date, who = {}) =>
  request(h.app)
    .post(`/api/public/businesses/${biz.tenant.slug}/appointments`)
    .send({
      serviceId: biz.service._id,
      staffId: biz.staff[0]._id,
      date,
      time,
      name: "Ahmad Guest",
      phone: "0599123456",
      ...who,
    });

describe("Guest booking", () => {
  test("a guest books without an account, and the owner sees the guest's name + phone", async () => {
    const biz = await h.makeBusiness("guest-salon");
    const date = h.nextOpenDate();

    const res = await guestBook(biz, "10:00", date);
    expect(res.status).toBe(201);
    expect(res.body.appointment.staffName).toBe("Staff 1");
    expect(res.body.appointment.guest).toBeUndefined();

    const saved = await Appointment.findById(res.body.appointment.id).lean();
    expect(saved.customerId).toBeUndefined();
    expect(saved.guest).toEqual({ name: "Ahmad Guest", phone: "0599123456" });

    const list = await request(h.app)
      .get(`/api/appointments/business?date=${date}`)
      .set("Authorization", `Bearer ${h.tokenFor(biz.owner)}`)
      .expect(200);
    expect(list.body.appointments).toHaveLength(1);
    expect(list.body.appointments[0].guest.name).toBe("Ahmad Guest");
  });

  test("guests and logged-in customers share the same calendar: no double booking", async () => {
    const biz = await h.makeBusiness("shared-salon");
    const date = h.nextOpenDate();
    const customer = await h.makeCustomer("sara");

    await request(h.app)
      .post("/api/appointments")
      .set("Authorization", `Bearer ${h.tokenFor(customer)}`)
      .send({ slug: biz.tenant.slug, serviceId: biz.service._id, staffId: biz.staff[0]._id, date, time: "10:00" })
      .expect(201);

    expect((await guestBook(biz, "10:15", date)).status).toBe(409);
  });

  test("bad name or phone is rejected with 400 (and nothing is saved)", async () => {
    const biz = await h.makeBusiness("valid-salon");
    const date = h.nextOpenDate();

    expect((await guestBook(biz, "10:00", date, { phone: "12" })).status).toBe(400);
    expect((await guestBook(biz, "10:00", date, { name: " a " })).status).toBe(400);
    expect(await Appointment.countDocuments()).toBe(0);
  });

  test("one phone can't hold more than 3 upcoming bookings at the same business", async () => {
    const biz = await h.makeBusiness("spam-salon");
    const date = h.nextOpenDate();

    for (const time of ["10:00", "11:00", "12:00"]) {
      expect((await guestBook(biz, time, date)).status).toBe(201);
    }
    const fourth = await guestBook(biz, "13:00", date, { phone: "٠٥٩٩ ١٢٣-٤٥٦" });
    expect(fourth.status).toBe(429);
  });

  test("an unknown business is 404", async () => {
    const biz = await h.makeBusiness("real-salon");
    biz.tenant.slug = "no-such-salon";
    expect((await guestBook(biz, "10:00", h.nextOpenDate())).status).toBe(404);
  });
});

describe("normalizePhone", () => {
  test.each([
    ["٠٥٩٩ ١٢٣-٤٥٦", "0599123456"],
    ["00970 599 123 456", "+970599123456"],
    ["(059) 912.3456", "0599123456"],
    [12345678, ""],
  ])("%p -> %p", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
});
