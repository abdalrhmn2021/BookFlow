// ============================================================
// اختبارات الحجز: أهم شي بالمشروع - مستحيل يصير حجزين بنفس الوقت
// ============================================================
const request = require("supertest");
const h = require("./helpers");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(h.disconnect);

// بيبعث طلب حجز باسم زبون معيّن
const book = (customer, biz, time, date) =>
  request(h.app)
    .post("/api/appointments")
    .set("Authorization", `Bearer ${h.tokenFor(customer)}`)
    .send({
      slug: biz.tenant.slug,
      serviceId: biz.service._id,
      staffId: biz.staff[0]._id,
      date,
      time,
    });

describe("Booking", () => {
  test("10 customers book the SAME slot at the same moment -> exactly 1 succeeds", async () => {
    const biz = await h.makeBusiness("race-salon");
    const date = h.nextOpenDate();

    const customers = [];
    for (let i = 0; i < 10; i++) customers.push(await h.makeCustomer(`racer${i}`));

    // Promise.all = كل الطلبات بتنبعث مع بعض، مش ورا بعض
    const responses = await Promise.all(
      customers.map((c) => book(c, biz, "10:00", date)),
    );
    const codes = responses.map((r) => r.status);

    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(9);
  });

  test("back-to-back appointments (10:00-10:30 then 10:30-11:00) are allowed", async () => {
    const biz = await h.makeBusiness("b2b-salon");
    const date = h.nextOpenDate();
    const [a, b] = [await h.makeCustomer("ahmad"), await h.makeCustomer("sara")];

    expect((await book(a, biz, "10:00", date)).status).toBe(201);
    expect((await book(b, biz, "10:30", date)).status).toBe(201);
  });

  test("an overlapping appointment (10:15 inside 10:00-10:30) is rejected with 409", async () => {
    const biz = await h.makeBusiness("overlap-salon");
    const date = h.nextOpenDate();
    const [a, b] = [await h.makeCustomer("ahmad"), await h.makeCustomer("sara")];

    expect((await book(a, biz, "10:00", date)).status).toBe(201);
    expect((await book(b, biz, "10:15", date)).status).toBe(409);
  });

  test("a cancelled appointment frees the slot again", async () => {
    const biz = await h.makeBusiness("free-salon");
    const date = h.nextOpenDate();
    const [a, b] = [await h.makeCustomer("ahmad"), await h.makeCustomer("sara")];

    const first = await book(a, biz, "10:00", date);
    await request(h.app)
      .patch(`/api/appointments/${first.body.appointment._id}/cancel`)
      .set("Authorization", `Bearer ${h.tokenFor(a)}`)
      .send({ reason: "I have an exam that day" })
      .expect(200);

    expect((await book(b, biz, "10:00", date)).status).toBe(201);
  });

  test("outside working hours (08:00, business opens 09:00) is rejected with 400", async () => {
    const biz = await h.makeBusiness("hours-salon");
    const a = await h.makeCustomer("ahmad");
    expect((await book(a, biz, "08:00", h.nextOpenDate())).status).toBe(400);
  });
});
