// Security review L-01: fake guest bookings that fill a calendar (and burn the shared email quota).
// Each request comes "from" a different visitor (the site proxy's IP header), so the per-IP limit
// doesn't hide what these tests check.
const PROXY = "p".repeat(64);
process.env.SITE_PROXY_SECRET = PROXY;

const request = require("supertest");
const h = require("./helpers");
const Appointment = require("../src/models/Appointment");
const { setTurnstileVerifierForTests } = require("../src/utils/turnstile");
const { setSenderForTests } = require("../src/services/notify.service");
const { dayNameOf } = require("../src/utils/time");
const { HEADERS } = require("../src/middlewares/site.middleware");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(async () => {
  delete process.env.SITE_PROXY_SECRET;
  await h.disconnect();
});

let visitor = 0;
const guestBook = (biz, date, time, extra = {}) =>
  request(h.app)
    .post(`/api/public/businesses/${biz.tenant.slug}/appointments`)
    .set(HEADERS.SECRET_HEADER, PROXY)
    .set(HEADERS.CLIENT_IP_HEADER, `10.9.${Math.floor(++visitor / 250)}.${visitor % 250}`)
    .send({
      serviceId: biz.service._id,
      staffId: biz.staff[0]._id,
      date,
      time,
      name: "Guest",
      phone: "0599111222",
      ...extra,
    });

// An open day (not Friday) at least `days` days from now.
function openDayAhead(days) {
  for (let d = days; d < days + 7; d++) {
    const date = new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
    if (dayNameOf(date) !== "friday") return date;
  }
}

describe("Guest booking limits", () => {
  test("the same phone typed 4 different ways counts as ONE guest (max 3 upcoming)", async () => {
    const biz = await h.makeBusiness("abuse-phone");
    const date = h.nextOpenDate();
    const phones = ["0599111222", "+970599111222", "00970 599 111 222", "970599111222"];
    const statuses = [];
    for (const [i, phone] of phones.entries()) {
      statuses.push((await guestBook(biz, date, `${10 + i}:00`, { phone })).status);
    }
    expect(statuses).toEqual([201, 201, 201, 429]);
    const keys = await Appointment.distinct("guest.phoneKey");
    expect(keys).toEqual(["970599111222"]);
  });

  test("guests can't book more than 60 days ahead; the business itself can", async () => {
    const biz = await h.makeBusiness("abuse-ahead");
    const far = openDayAhead(62);
    const res = await guestBook(biz, far, "10:00");
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("You can only book up to 60 days ahead");

    await request(h.app)
      .post("/api/appointments/business")
      .set("Authorization", `Bearer ${h.tokenFor(biz.owner)}`)
      .send({ serviceId: biz.service._id, staffId: biz.staff[0]._id, date: far, time: "10:00", name: "Walk-in" })
      .expect(201);
  });

  test("a business takes at most GUEST_BOOKINGS_PER_DAY new guest bookings a day", async () => {
    process.env.GUEST_BOOKINGS_PER_DAY = "2";
    try {
      const biz = await h.makeBusiness("abuse-daily");
      const date = h.nextOpenDate();
      expect((await guestBook(biz, date, "10:00", { phone: "0599000001" })).status).toBe(201);
      expect((await guestBook(biz, date, "11:00", { phone: "0599000002" })).status).toBe(201);
      const third = await guestBook(biz, date, "12:00", { phone: "0599000003" });
      expect(third.status).toBe(429);
      expect(third.body.message).toBe("Too many online bookings here today, please sign in or contact the business");
      // Bookings the business enters itself don't count and aren't limited.
      await request(h.app)
        .post("/api/appointments/business")
        .set("Authorization", `Bearer ${h.tokenFor(biz.owner)}`)
        .send({ serviceId: biz.service._id, staffId: biz.staff[0]._id, date, time: "13:00", name: "Walk-in" })
        .expect(201);
    } finally {
      delete process.env.GUEST_BOOKINGS_PER_DAY;
    }
  });
});

describe("Turnstile (when TURNSTILE_SECRET_KEY is set)", () => {
  afterEach(() => {
    delete process.env.TURNSTILE_SECRET_KEY;
    setTurnstileVerifierForTests(null);
  });

  test("off by default: no token needed", async () => {
    const biz = await h.makeBusiness("ts-off");
    expect((await guestBook(biz, h.nextOpenDate(), "10:00")).status).toBe(201);
  });

  test("on: no token or a wrong one is refused, a good one goes through", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    setTurnstileVerifierForTests(async (token) => token === "good-token");
    const biz = await h.makeBusiness("ts-on");
    const date = h.nextOpenDate();

    const none = await guestBook(biz, date, "10:00");
    expect(none.status).toBe(400);
    expect(none.body.message).toBe("Please confirm you're not a robot");
    expect((await guestBook(biz, date, "10:00", { captchaToken: "bad-token" })).status).toBe(400);
    expect((await guestBook(biz, date, "10:00", { captchaToken: "good-token" })).status).toBe(201);
  });

  test("on, and Cloudflare can't be reached: refused (never fails open)", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    setTurnstileVerifierForTests(async () => {
      throw new Error("network down");
    });
    const biz = await h.makeBusiness("ts-down");
    expect((await guestBook(biz, h.nextOpenDate(), "10:00", { captchaToken: "x" })).status).toBe(400);
  });
});

describe("New-booking emails per business per day", () => {
  test("past NEW_BOOKING_EMAILS_PER_DAY the emails stop (the bookings don't)", async () => {
    const sent = [];
    setSenderForTests(async (m) => {
      sent.push(m);
    });
    process.env.BREVO_API_KEY = "test-key";
    process.env.MAIL_FROM = "bookings@bookflow.test";
    process.env.NEW_BOOKING_EMAILS_PER_DAY = "1";
    try {
      const biz = await h.makeBusiness("mail-cap");
      const date = h.nextOpenDate();
      await guestBook(biz, date, "10:00", { phone: "0599000011" }).expect(201);
      for (let i = 0; i < 50 && sent.length < 2; i++) await new Promise((r) => setTimeout(r, 20));
      expect(sent).toHaveLength(2); // the owner + the staff member

      await guestBook(biz, date, "11:00", { phone: "0599000012" }).expect(201);
      await new Promise((r) => setTimeout(r, 300));
      expect(sent).toHaveLength(2); // no new emails for the second booking
      expect(await Appointment.countDocuments({ tenantId: biz.tenant._id })).toBe(2);
    } finally {
      setSenderForTests(null);
      delete process.env.BREVO_API_KEY;
      delete process.env.MAIL_FROM;
      delete process.env.NEW_BOOKING_EMAILS_PER_DAY;
    }
  });
});
