// The business-wide daily limit on guest bookings (GUEST_BOOKINGS_PER_DAY) holds when the bookings
// arrive at the same moment - from different phones, different visitors and different time slots,
// so no other limit (per phone, per IP, the staff lock) stops them first.
const PROXY = "q".repeat(64);
process.env.SITE_PROXY_SECRET = PROXY;

const request = require("supertest");
const h = require("./helpers");
const Appointment = require("../src/models/Appointment");
const { HEADERS } = require("../src/middlewares/site.middleware");

const LIMIT_MESSAGE = "Too many online bookings here today, please sign in or contact the business";

beforeAll(h.connect);
beforeEach(() => {
  // Low, so the test stays fast; the rule is the same as with the default 30.
  process.env.GUEST_BOOKINGS_PER_DAY = "3";
});
afterEach(async () => {
  delete process.env.GUEST_BOOKINGS_PER_DAY;
  await h.clear();
});
afterAll(async () => {
  delete process.env.SITE_PROXY_SECRET;
  await h.disconnect();
});

let visitor = 0;
const guestBook = (biz, staffId, date, time, phone) => {
  visitor += 1;
  return request(h.app)
    .post(`/api/public/businesses/${biz.tenant.slug}/appointments`)
    .set(HEADERS.SECRET_HEADER, PROXY)
    .set(HEADERS.CLIENT_IP_HEADER, `10.77.${Math.floor(visitor / 250)}.${visitor % 250}`)
    .send({ serviceId: biz.service._id, staffId, date, time, name: "Guest", phone });
};

// 09:00, 09:30, ... - one free half-hour slot each.
const slot = (i) => `${String(9 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`;
const phone = (i) => `05990000${String(i).padStart(2, "0")}`;

test("10 guest bookings at once with a limit of 3: exactly 3 get in, 7 get 429", async () => {
  const biz = await h.makeBusiness("daily-race");
  const date = h.nextOpenDate();

  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) => guestBook(biz, biz.staff[0]._id, date, slot(i), phone(i))),
  );

  const statuses = results.map((r) => r.status).sort();
  expect(statuses).toEqual([201, 201, 201, ...Array(7).fill(429)]);
  for (const r of results.filter((x) => x.status === 429)) {
    expect(r.body.message).toBe(LIMIT_MESSAGE);
  }
  expect(await Appointment.countDocuments({ tenantId: biz.tenant._id })).toBe(3);
});

test('the same holds for "any staff member", which tries several people', async () => {
  const biz = await h.makeBusiness("daily-race-any", { staffCount: 3 });
  const date = h.nextOpenDate();

  const results = await Promise.all(
    Array.from({ length: 8 }, (_, i) => guestBook(biz, "any", date, slot(i), phone(i))),
  );

  expect(results.filter((r) => r.status === 201)).toHaveLength(3);
  expect(results.filter((r) => r.status === 429)).toHaveLength(5);
  expect(await Appointment.countDocuments({ tenantId: biz.tenant._id })).toBe(3);
});

test("the limit is per business: a full day at one business doesn't block another", async () => {
  const a = await h.makeBusiness("daily-race-a");
  const b = await h.makeBusiness("daily-race-b");
  const date = h.nextOpenDate();

  const results = await Promise.all([
    ...Array.from({ length: 5 }, (_, i) => guestBook(a, a.staff[0]._id, date, slot(i), phone(i))),
    ...Array.from({ length: 3 }, (_, i) => guestBook(b, b.staff[0]._id, date, slot(i), phone(20 + i))),
  ]);

  expect(results.slice(0, 5).filter((r) => r.status === 201)).toHaveLength(3);
  expect(results.slice(5).map((r) => r.status)).toEqual([201, 201, 201]);
});

test("cancelled guest bookings still count (the 24-hour rule counts every new online booking)", async () => {
  const biz = await h.makeBusiness("daily-race-cancel");
  const date = h.nextOpenDate();
  for (let i = 0; i < 3; i++) {
    expect((await guestBook(biz, biz.staff[0]._id, date, slot(i), phone(i))).status).toBe(201);
  }
  await Appointment.updateMany({ tenantId: biz.tenant._id }, { status: "cancelled" });

  const res = await guestBook(biz, biz.staff[0]._id, date, slot(5), phone(5));
  expect(res.status).toBe(429);
  expect(res.body.message).toBe(LIMIT_MESSAGE);
});
