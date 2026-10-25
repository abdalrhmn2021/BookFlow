// The "max 3 upcoming bookings per phone" limit holds even when the bookings arrive at once.
const request = require("supertest");
const h = require("./helpers");
const Appointment = require("../src/models/Appointment");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(h.disconnect);

const guestBook = (biz, staff, date, time) =>
  request(h.app)
    .post(`/api/public/businesses/${biz.tenant.slug}/appointments`)
    .send({ serviceId: biz.service._id, staffId: staff._id, date, time, name: "Guest", phone: "0599 111 222" });

test("6 bookings from one phone at the same moment, on 2 staff members: exactly 3 get through", async () => {
  const biz = await h.makeBusiness("limit-a", { staffCount: 2 });
  const date = h.nextOpenDate();

  // Different staff and times, so the staff locks alone would let them all through.
  const results = await Promise.all([
    guestBook(biz, biz.staff[0], date, "09:00"),
    guestBook(biz, biz.staff[1], date, "09:00"),
    guestBook(biz, biz.staff[0], date, "10:00"),
    guestBook(biz, biz.staff[1], date, "10:00"),
    guestBook(biz, biz.staff[0], date, "11:00"),
    guestBook(biz, biz.staff[1], date, "11:00"),
  ]);

  expect(results.map((r) => r.status).sort()).toEqual([201, 201, 201, 429, 429, 429]);
  expect(await Appointment.countDocuments({ "guest.phone": "0599111222" })).toBe(3);
});
