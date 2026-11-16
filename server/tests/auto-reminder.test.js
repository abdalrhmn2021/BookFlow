// The automatic WhatsApp reminder job (services/reminder.service.js), with a fake sender.
process.env.WHATSAPP_TOKEN = "test-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
process.env.WHATSAPP_TEMPLATE = "booking_reminder";
process.env.JOBS_SECRET = "j".repeat(40);

const request = require("supertest");
const h = require("./helpers");
const Appointment = require("../src/models/Appointment");
const Tenant = require("../src/models/Tenant");
const { setWhatsAppSenderForTests } = require("../src/services/whatsapp.service");
const { sendDueReminders, MAX_ATTEMPTS } = require("../src/services/reminder.service");

const HOUR = 60 * 60 * 1000;
let sent;
let failNext;

beforeAll(h.connect);
beforeEach(() => {
  sent = [];
  failNext = 0;
  setWhatsAppSenderForTests(async (message) => {
    if (failNext > 0) {
      failNext--;
      throw new Error("WhatsApp answered 400: bad number");
    }
    sent.push(message);
  });
});
afterEach(h.clear);
afterAll(async () => {
  setWhatsAppSenderForTests(null);
  for (const k of ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_TEMPLATE", "JOBS_SECRET"]) {
    delete process.env[k];
  }
  await h.disconnect();
});

// The job runs "an hour from now", so bookings created just now count as old enough.
const later = () => new Date(Date.now() + HOUR);

async function business(slug, { reminders = true } = {}) {
  const biz = await h.makeBusiness(slug);
  await Tenant.updateOne({ _id: biz.tenant._id }, { whatsappReminders: reminders });
  return biz;
}

function booking(biz, hoursFromJobRun, extra = {}) {
  const start = new Date(later().getTime() + hoursFromJobRun * HOUR);
  return Appointment.create({
    tenantId: biz.tenant._id,
    staffId: biz.staff[0]._id,
    serviceId: biz.service._id,
    serviceName: "Haircut",
    price: 20,
    duration: 30,
    startTime: start,
    endTime: new Date(start.getTime() + 30 * 60 * 1000),
    guest: { name: "Sara", phone: "0599123456" },
    whatsappConsent: true, // the customer ticked "remind me on WhatsApp"
    status: "confirmed", // guests get automatic reminders only once the business confirmed
    ...extra,
  });
}

describe("Automatic WhatsApp reminders", () => {
  test("a booking tomorrow gets exactly one reminder, with the right details", async () => {
    const biz = await business("salon-a");
    const appt = await booking(biz, 20);

    const first = await sendDueReminders({ now: later() });
    expect(first).toMatchObject({ checked: 1, sent: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("970599123456");
    const params = sent[0].template.components[0].parameters.map((p) => p.text);
    expect(params.slice(0, 3)).toEqual(["Sara", "Business salon-a", "Haircut"]);

    const saved = await Appointment.findById(appt._id).lean();
    expect(saved.reminderSentAt).toBeInstanceOf(Date);
    expect(saved.reminderChannel).toBe("whatsapp");

    // Next run: nothing more.
    await sendDueReminders({ now: later() });
    expect(sent).toHaveLength(1);
  });

  test("too early, too late, cancelled, reminded by hand, or reminders off: no message", async () => {
    const biz = await business("salon-a");
    const off = await business("salon-off", { reminders: false });
    await booking(biz, 30); // more than 24h away
    await booking(biz, 0.5); // starts in 30 minutes
    await booking(biz, 20, { status: "cancelled" });
    await booking(biz, 20, { reminderSentAt: new Date(), reminderChannel: "manual" });
    await booking(off, 20);
    await booking(biz, 20, { whatsappConsent: false }); // didn't tick "remind me on WhatsApp"

    const r = await sendDueReminders({ now: later() });
    expect(r.sent).toBe(0);
    expect(sent).toHaveLength(0);
  });

  test("a failed send is retried, but not forever", async () => {
    const biz = await business("salon-a");
    const appt = await booking(biz, 20);

    failNext = MAX_ATTEMPTS + 5;
    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) await sendDueReminders({ now: later() });

    const saved = await Appointment.findById(appt._id).lean();
    expect(saved.autoReminder.attempts).toBe(MAX_ATTEMPTS);
    expect(saved.autoReminder.lastError).toMatch(/bad number/);
    expect(saved.reminderSentAt).toBeUndefined();
    expect(sent).toHaveLength(0);
  });

  test("no usable phone: skipped and not retried", async () => {
    const biz = await business("salon-a");
    const customer = await h.makeCustomer("nophone");
    const appt = await booking(biz, 20, { guest: undefined, customerId: customer._id });

    expect(await sendDueReminders({ now: later() })).toMatchObject({ sent: 0, skipped: 1 });
    const saved = await Appointment.findById(appt._id).lean();
    expect(saved.autoReminder.attempts).toBe(MAX_ATTEMPTS);
  });

  test("two runs at the same time still send one message", async () => {
    const biz = await business("salon-a");
    await booking(biz, 20);
    await Promise.all([sendDueReminders({ now: later() }), sendDueReminders({ now: later() })]);
    expect(sent).toHaveLength(1);
  });

  test("the cron endpoint runs the job with the right secret", async () => {
    const biz = await business("salon-a");
    await booking(biz, 3); // within 24h of the real "now" too
    const res = await request(h.app).post("/api/jobs/reminders").set("x-jobs-secret", process.env.JOBS_SECRET);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("checked");
  });
});

// Security review L-02: the business's WhatsApp number must not become a free messenger.
describe("Automatic reminders can't be abused", () => {
  test("a guest booking nobody at the business confirmed (pending) gets no reminder", async () => {
    const biz = await business("abuse-a");
    await booking(biz, 20, { status: "pending" });
    const r = await sendDueReminders({ now: later() });
    expect(r.sent).toBe(0);
    expect(sent).toHaveLength(0);
  });

  test("a signed-in customer's pending booking still gets its reminder", async () => {
    const biz = await business("abuse-b");
    const customer = await h.makeCustomer("lina");
    await require("../src/models/User").updateOne({ _id: customer._id }, { phone: "0599000111" });
    await booking(biz, 20, { status: "pending", guest: undefined, customerId: customer._id });
    const r = await sendDueReminders({ now: later() });
    expect(r.sent).toBe(1);
  });

  test("links, web addresses, @handles and long numbers are taken out of the name", async () => {
    const biz = await business("abuse-c");
    await booking(biz, 20, {
      guest: { name: "Sara visit evil.example http://x.co/a @me 0599123456", phone: "0599123456" },
    });
    await sendDueReminders({ now: later() });
    const name = sent[0].template.components[0].parameters[0].text;
    expect(name).toBe("Sara visit");
  });

  test("no more than WHATSAPP_REMINDERS_PER_DAY reminders a day for one business", async () => {
    process.env.WHATSAPP_REMINDERS_PER_DAY = "2";
    try {
      const biz = await business("abuse-d");
      for (const h2 of [20, 21, 22]) await booking(biz, h2);
      const r = await sendDueReminders({ now: later() });
      expect(r.sent).toBe(2);
      expect(r.skipped).toBe(1);
    } finally {
      delete process.env.WHATSAPP_REMINDERS_PER_DAY;
    }
  });
});
