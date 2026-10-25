// Privacy features: WhatsApp opt-in, deleting your account, the retention cleanup, data export.
const request = require("supertest");
const h = require("./helpers");
const User = require("../src/models/User");
const Appointment = require("../src/models/Appointment");
const CustomerTenant = require("../src/models/CustomerTenant");
const { removeOldGuestData, REMOVED_NAME } = require("../src/services/maintenance.service");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(h.disconnect);

const auth = (user) => ({ Authorization: `Bearer ${h.tokenFor(user)}` });
const DAY = 24 * 60 * 60 * 1000;

const guestBook = (biz, extra = {}) =>
  request(h.app)
    .post(`/api/public/businesses/${biz.tenant.slug}/appointments`)
    .send({
      serviceId: biz.service._id,
      staffId: biz.staff[0]._id,
      date: h.nextOpenDate(),
      time: "10:00",
      name: "Guest",
      phone: "0599123456",
      ...extra,
    });

const customerBook = (biz, customer, time, extra = {}) =>
  request(h.app)
    .post("/api/appointments")
    .set(auth(customer))
    .send({
      slug: biz.tenant.slug,
      serviceId: biz.service._id,
      staffId: biz.staff[0]._id,
      date: h.nextOpenDate(),
      time,
      ...extra,
    });

// A booking that ended `daysAgo` days ago, written straight to the database.
const pastBooking = (biz, daysAgo, who) => {
  const start = new Date(Date.now() - daysAgo * DAY);
  return Appointment.create({
    tenantId: biz.tenant._id,
    staffId: biz.staff[0]._id,
    serviceId: biz.service._id,
    serviceName: "Haircut",
    price: 20,
    duration: 30,
    startTime: start,
    endTime: new Date(start.getTime() + 30 * 60 * 1000),
    status: "completed",
    notes: "allergic to some dye",
    ...who,
  });
};

describe("WhatsApp opt-in", () => {
  test("off unless the guest ticks it (a real true, not the text 'true')", async () => {
    const biz = await h.makeBusiness("optin-a");
    const off = await guestBook(biz).expect(201);
    const text = await guestBook(biz, { time: "11:00", whatsappConsent: "true" }).expect(201);
    const on = await guestBook(biz, { time: "12:00", whatsappConsent: true }).expect(201);

    const saved = async (res) => (await Appointment.findById(res.body.appointment.id)).whatsappConsent;
    expect(await saved(off)).toBe(false);
    expect(await saved(text)).toBe(false);
    expect(await saved(on)).toBe(true);
  });

  test("customers and the dashboard's walk-in form can give it too", async () => {
    const biz = await h.makeBusiness("optin-b");
    const customer = await h.makeCustomer("sara");
    const mine = await customerBook(biz, customer, "10:00", { whatsappConsent: true }).expect(201);
    expect((await Appointment.findById(mine.body.appointment._id)).whatsappConsent).toBe(true);

    const walkIn = await request(h.app)
      .post("/api/appointments/business")
      .set(auth(biz.owner))
      .send({
        serviceId: biz.service._id,
        staffId: biz.staff[0]._id,
        date: h.nextOpenDate(),
        time: "11:00",
        name: "Walk-in",
        phone: "0599000111",
        whatsappConsent: true,
      })
      .expect(201);
    expect((await Appointment.findById(walkIn.body.appointment._id)).whatsappConsent).toBe(true);
  });
});

describe("Deleting my account", () => {
  test("cancels upcoming bookings, keeps the bookings without the person, and the login stops working", async () => {
    const biz = await h.makeBusiness("delete-a");
    const sara = await h.makeCustomer("sara");
    const upcoming = await customerBook(biz, sara, "10:00").expect(201);
    const past = await pastBooking(biz, 30, { customerId: sara._id });
    expect(await CustomerTenant.countDocuments({ userId: sara._id })).toBe(1); // made by the booking

    const res = await request(h.app)
      .delete("/api/auth/me")
      .set(auth(sara))
      .send({ password: "password123" })
      .expect(200);
    expect(res.headers["set-cookie"].join(";")).toMatch(/bookflow_token=;/);

    expect(await User.exists({ _id: sara._id })).toBeNull();
    expect(await CustomerTenant.countDocuments({ userId: sara._id })).toBe(0);

    const was = await Appointment.findById(upcoming.body.appointment._id).lean();
    expect(was.status).toBe("cancelled");
    expect(was.cancellation.reason).toBe("The customer deleted their account");
    expect(was.customerId).toBeUndefined();
    expect(was.guest).toEqual({ name: REMOVED_NAME });

    const old = await Appointment.findById(past._id).lean();
    expect(old).toMatchObject({ status: "completed", price: 20, guest: { name: REMOVED_NAME } });
    expect(old.notes).toBeUndefined();
    expect(old.personalDataRemovedAt).toBeInstanceOf(Date);

    await request(h.app)
      .post("/api/auth/login")
      .send({ email: "sara@customer.test", password: "password123" })
      .expect(401);
  });

  test("needs the right password", async () => {
    const sara = await h.makeCustomer("sara");
    await request(h.app).delete("/api/auth/me").set(auth(sara)).send({}).expect(400);
    await request(h.app).delete("/api/auth/me").set(auth(sara)).send({ password: "wrong-password" }).expect(400);
    expect(await User.exists({ _id: sara._id })).not.toBeNull();
  });

  test("owners, staff and demo accounts can't delete themselves here", async () => {
    const biz = await h.makeBusiness("delete-b");
    for (const person of [biz.owner, biz.staff[0]]) {
      await request(h.app).delete("/api/auth/me").set(auth(person)).send({ password: "password123" }).expect(403);
    }
    const demo = await User.create({
      name: "Demo",
      email: "customer@demo.com",
      password: "password123",
      role: "customer",
    });
    await request(h.app).delete("/api/auth/me").set(auth(demo)).send({ password: "password123" }).expect(403);
  });
});

describe("Removing old guest details (retention)", () => {
  test("guests' name, phone and notes go after 12 months; recent ones and registered customers stay", async () => {
    const biz = await h.makeBusiness("retain-a");
    const customer = await h.makeCustomer("sara");
    const old = await pastBooking(biz, 400, {
      guest: { name: "Old Guest", phone: "0599000222" },
      manageTokenHash: "a".repeat(64),
    });
    const recent = await pastBooking(biz, 100, { guest: { name: "Recent Guest", phone: "0599000333" } });
    const registered = await pastBooking(biz, 400, { customerId: customer._id });

    expect(await removeOldGuestData()).toBe(1);

    const cleaned = await Appointment.findById(old._id).select("+manageTokenHash").lean();
    expect(cleaned.guest).toEqual({ name: REMOVED_NAME });
    expect(cleaned.notes).toBeUndefined();
    expect(cleaned.manageTokenHash).toBeUndefined();
    expect(cleaned).toMatchObject({ status: "completed", price: 20, serviceName: "Haircut" });

    expect((await Appointment.findById(recent._id)).guest.phone).toBe("0599000333");
    expect(String((await Appointment.findById(registered._id)).customerId)).toBe(String(customer._id));

    expect(await removeOldGuestData()).toBe(0); // already done
  });

  test("DATA_RETENTION_MONTHS changes the period", async () => {
    const biz = await h.makeBusiness("retain-b");
    await pastBooking(biz, 100, { guest: { name: "Guest", phone: "0599000444" } });
    process.env.DATA_RETENTION_MONTHS = "3";
    try {
      expect(await removeOldGuestData()).toBe(1);
    } finally {
      delete process.env.DATA_RETENTION_MONTHS;
    }
  });
});

describe("Exporting a business's data", () => {
  test("the admin gets one business's services, staff, customers and bookings - no secrets", async () => {
    const biz = await h.makeBusiness("export-a");
    const other = await h.makeBusiness("export-b");
    const sara = await h.makeCustomer("sara");
    await customerBook(biz, sara, "10:00").expect(201); // links Sara to this business
    await guestBook(biz, { time: "11:00" }).expect(201);
    await guestBook(other, { time: "11:00", phone: "0599777888" }).expect(201);
    const admin = await User.create({
      name: "Me",
      email: "admin@seller.test",
      password: "password123",
      role: "superadmin",
    });

    await request(h.app).get(`/api/admin/businesses/${biz.tenant._id}/export`).set(auth(biz.owner)).expect(403);
    const res = await request(h.app).get(`/api/admin/businesses/${biz.tenant._id}/export`).set(auth(admin)).expect(200);

    expect(res.headers["content-disposition"]).toMatch(
      /attachment; filename="export-a-export-\d{4}-\d{2}-\d{2}\.json"/,
    );
    expect(res.body.business.slug).toBe("export-a");
    expect(res.body.services).toHaveLength(1);
    expect(res.body.staff.map((p) => p.role).sort()).toEqual(["owner", "staff"]);
    expect(res.body.customers.map((c) => c.email)).toEqual(["sara@customer.test"]);
    expect(res.body.appointments).toHaveLength(2);

    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/password|manageTokenHash|resetToken/);
    expect(text).not.toContain("0599777888"); // the other business's guest
  });
});
