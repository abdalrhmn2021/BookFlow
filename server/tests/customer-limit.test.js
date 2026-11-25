// Security review H-1: one customer account must not be able to fill a business's calendar.
//   - at most CUSTOMER_MAX_UPCOMING (default 5) upcoming bookings per account at one business,
//     checked under a per-account lock, so parallel requests can't race past it;
//   - at most 20 booking tries an hour per account (customerBookingLimiter), from any IP.
const request = require("supertest");
const h = require("./helpers");
const Appointment = require("../src/models/Appointment");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(h.disconnect);

const book = (customer, biz, staff, date, time, slug = biz.tenant.slug) =>
  request(h.app)
    .post("/api/appointments")
    .set("Authorization", `Bearer ${h.tokenFor(customer)}`)
    .send({ slug, serviceId: biz.service._id, staffId: staff._id, date, time });

const TIMES = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00"];

describe("Customer booking limits", () => {
  test("one account gets at most 5 upcoming bookings at a business; the 6th is refused with 429", async () => {
    const biz = await h.makeBusiness("cust-limit-a", { staffCount: 2 });
    const customer = await h.makeCustomer("filler");
    const date = h.nextOpenDate();

    for (const time of TIMES.slice(0, 5)) {
      expect((await book(customer, biz, biz.staff[0], date, time)).status).toBe(201);
    }
    const sixth = await book(customer, biz, biz.staff[1], date, "15:00");
    expect(sixth.status).toBe(429);
    expect(sixth.body.message).toBe("You already have too many upcoming bookings here");
    expect(await Appointment.countDocuments({ customerId: customer._id })).toBe(5);
  });

  test("6 bookings from one account at the same moment, on 2 staff members: exactly 5 get through", async () => {
    const biz = await h.makeBusiness("cust-limit-race", { staffCount: 2 });
    const customer = await h.makeCustomer("racer");
    const date = h.nextOpenDate();

    // Different staff and times, so the staff locks alone would let them all through.
    const results = await Promise.all([
      book(customer, biz, biz.staff[0], date, "09:00"),
      book(customer, biz, biz.staff[1], date, "09:00"),
      book(customer, biz, biz.staff[0], date, "10:00"),
      book(customer, biz, biz.staff[1], date, "10:00"),
      book(customer, biz, biz.staff[0], date, "11:00"),
      book(customer, biz, biz.staff[1], date, "11:00"),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 201, 201, 201, 201, 429]);
    expect(await Appointment.countDocuments({ customerId: customer._id })).toBe(5);
  });

  test("the limit is per business: a full account can still book at another business", async () => {
    const [a, b] = [await h.makeBusiness("cust-limit-x"), await h.makeBusiness("cust-limit-y")];
    const customer = await h.makeCustomer("traveler");
    const date = h.nextOpenDate();

    for (const time of TIMES.slice(0, 5)) {
      expect((await book(customer, a, a.staff[0], date, time)).status).toBe(201);
    }
    expect((await book(customer, a, a.staff[0], date, "15:00")).status).toBe(429);
    expect((await book(customer, b, b.staff[0], date, "09:00")).status).toBe(201);
  });

  test("cancelled bookings don't count: after cancelling one, the account can book again", async () => {
    const biz = await h.makeBusiness("cust-limit-cancel");
    const customer = await h.makeCustomer("changer");
    const date = h.nextOpenDate();

    const first = await book(customer, biz, biz.staff[0], date, "09:00");
    for (const time of TIMES.slice(1, 5)) await book(customer, biz, biz.staff[0], date, time);
    expect((await book(customer, biz, biz.staff[0], date, "15:00")).status).toBe(429);

    await Appointment.updateOne({ _id: first.body.appointment._id }, { $set: { status: "cancelled" } });
    expect((await book(customer, biz, biz.staff[0], date, "15:00")).status).toBe(201);
  });

  test("CUSTOMER_MAX_UPCOMING changes the limit", async () => {
    process.env.CUSTOMER_MAX_UPCOMING = "2";
    try {
      const biz = await h.makeBusiness("cust-limit-env");
      const customer = await h.makeCustomer("two");
      const date = h.nextOpenDate();
      expect((await book(customer, biz, biz.staff[0], date, "09:00")).status).toBe(201);
      expect((await book(customer, biz, biz.staff[0], date, "10:00")).status).toBe(201);
      expect((await book(customer, biz, biz.staff[0], date, "11:00")).status).toBe(429);
    } finally {
      delete process.env.CUSTOMER_MAX_UPCOMING;
    }
  });

  test("the business itself is not limited: it can enter more than 5 bookings for walk-ins", async () => {
    const biz = await h.makeBusiness("cust-limit-owner");
    const date = h.nextOpenDate();
    for (const time of TIMES) {
      const res = await request(h.app)
        .post("/api/appointments/business")
        .set("Authorization", `Bearer ${h.tokenFor(biz.owner)}`)
        .send({
          serviceId: biz.service._id,
          staffId: biz.staff[0]._id,
          date,
          time,
          name: "Walk-in",
          phone: "0599111222",
        });
      expect(res.status).toBe(201);
    }
  });

  test("more than 20 booking tries an hour from one account are refused, whatever the IP", async () => {
    const biz = await h.makeBusiness("cust-limit-rate");
    const customer = await h.makeCustomer("script");
    const date = h.nextOpenDate();

    // 20 tries that fail on purpose (a business that doesn't exist) still count.
    for (let i = 0; i < 20; i++) {
      expect((await book(customer, biz, biz.staff[0], date, "09:00", "no-such-business")).status).toBe(404);
    }
    const res = await book(customer, biz, biz.staff[0], date, "09:00");
    expect(res.status).toBe(429);
    expect(res.body.message).toBe("Too many booking attempts, please try again later");
    expect(await Appointment.countDocuments({ customerId: customer._id })).toBe(0);
  });
});
