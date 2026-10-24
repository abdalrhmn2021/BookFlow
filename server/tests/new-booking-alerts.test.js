const request = require("supertest");
const h = require("./helpers");
const { setSenderForTests } = require("../src/services/notify.service");

let sent = [];

beforeAll(h.connect);
beforeEach(() => {
  sent = [];
  setSenderForTests(async (message) => {
    sent.push(message);
  });
  process.env.BREVO_API_KEY = "test-key";
  process.env.MAIL_FROM = "bookings@bookflow.test";
});
afterEach(h.clear);
afterAll(async () => {
  setSenderForTests(null);
  delete process.env.BREVO_API_KEY;
  delete process.env.MAIL_FROM;
  await h.disconnect();
});

// The email goes out after the response (fire and forget), so wait for it a little.
async function waitForEmails(count) {
  for (let i = 0; i < 50 && sent.length < count; i++) await new Promise((r) => setTimeout(r, 20));
  return sent;
}

const guestBook = (biz, time, date) =>
  request(h.app)
    .post(`/api/public/businesses/${biz.tenant.slug}/appointments`)
    .send({ serviceId: biz.service._id, staffId: biz.staff[0]._id, date, time, name: "Ahmad", phone: "0599123456" });

describe("New booking email", () => {
  test("a guest booking emails the owner and the booked staff member, one email each", async () => {
    const biz = await h.makeBusiness("mail-salon", { staffCount: 2 });
    await guestBook(biz, "10:00", h.nextOpenDate()).expect(201);

    const emails = await waitForEmails(2);
    const to = emails.map((m) => m.to[0].email).sort();
    expect(to).toEqual(["owner@mail-salon.test", "staff1@mail-salon.test"]);
    expect(emails[0].subject).toContain("Haircut");
    expect(emails[0].htmlContent).toContain("0599123456");
    expect(emails[0].sender.email).toBe("bookings@bookflow.test");
  });

  test("a logged-in customer's booking is emailed too, with their name and phone", async () => {
    const biz = await h.makeBusiness("mail-customer");
    const customer = await h.makeCustomer("sara");
    await customer.updateOne({ phone: "0598765432" });

    await request(h.app)
      .post("/api/appointments")
      .set("Authorization", `Bearer ${h.tokenFor(customer)}`)
      .send({
        slug: biz.tenant.slug,
        serviceId: biz.service._id,
        staffId: biz.staff[0]._id,
        date: h.nextOpenDate(),
        time: "11:00",
      })
      .expect(201);

    const emails = await waitForEmails(2);
    expect(emails[0].htmlContent).toContain("sara");
    expect(emails[0].htmlContent).toContain("0598765432");
  });

  test("a failing email service never breaks the booking", async () => {
    setSenderForTests(async () => {
      throw new Error("Brevo is down");
    });
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const biz = await h.makeBusiness("mail-down");

    await guestBook(biz, "12:00", h.nextOpenDate()).expect(201);
    for (let i = 0; i < 50 && !spy.mock.calls.length; i++) await new Promise((r) => setTimeout(r, 20));
    expect(spy.mock.calls[0][0]).toContain("[notify]");
    spy.mockRestore();
  });

  test("no email when it isn't configured", async () => {
    delete process.env.BREVO_API_KEY;
    const biz = await h.makeBusiness("mail-off");
    await guestBook(biz, "10:00", h.nextOpenDate()).expect(201);
    await new Promise((r) => setTimeout(r, 200));
    expect(sent).toHaveLength(0);
  });
});

describe("Dashboard new-booking alerts", () => {
  const poll = (user, since) =>
    request(h.app)
      .get(`/api/appointments/business/new${since ? `?since=${encodeURIComponent(since)}` : ""}`)
      .set("Authorization", `Bearer ${h.tokenFor(user)}`);

  test("first call only returns the server clock; the next returns bookings made since", async () => {
    const biz = await h.makeBusiness("alert-salon");
    const first = await poll(biz.owner).expect(200);
    expect(first.body.appointments).toEqual([]);

    await guestBook(biz, "10:00", h.nextOpenDate()).expect(201);

    const second = await poll(biz.owner, first.body.now).expect(200);
    expect(second.body.appointments).toHaveLength(1);
    expect(second.body.appointments[0].guest.name).toBe("Ahmad");
    expect(second.body.appointments[0].staffId.name).toBe("Staff 1");

    const third = await poll(biz.owner, second.body.now).expect(200);
    expect(third.body.appointments).toHaveLength(0);
  });

  test("staff only hear about their own bookings, and other businesses see nothing", async () => {
    const biz = await h.makeBusiness("alert-staff", { staffCount: 2 });
    const other = await h.makeBusiness("alert-other");
    const since = (await poll(biz.owner).expect(200)).body.now;

    await guestBook(biz, "10:00", h.nextOpenDate()).expect(201); // with Staff 1

    expect((await poll(biz.staff[0], since)).body.appointments).toHaveLength(1);
    expect((await poll(biz.staff[1], since)).body.appointments).toHaveLength(0);
    expect((await poll(other.owner, since)).body.appointments).toHaveLength(0);
  });

  test("a bad since is a 400, and customers can't use it", async () => {
    const biz = await h.makeBusiness("alert-bad");
    const customer = await h.makeCustomer("omar");
    await poll(biz.owner, "yesterday-ish").expect(400);
    await poll(customer, new Date().toISOString()).expect(403);
  });
});
