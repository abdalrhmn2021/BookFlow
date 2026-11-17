// Security review B-01, B-02, B-03: the demo resets itself, adding staff leaks less, and a
// customer gets only their own fields back.
process.env.JOBS_SECRET = "d".repeat(40);

const request = require("supertest");
const h = require("./helpers");
const Tenant = require("../src/models/Tenant");
const User = require("../src/models/User");
const Appointment = require("../src/models/Appointment");
const { seed, resetDemoIfDue, DEMO_SLUG } = require("../src/services/demo.service");

beforeAll(h.connect);
afterEach(async () => {
  delete process.env.DEMO_RESET_HOURS;
  delete process.env.MAX_STAFF;
  await h.clear();
});
afterAll(async () => {
  delete process.env.JOBS_SECRET;
  await h.disconnect();
});

const auth = (user) => ({ Authorization: `Bearer ${h.tokenFor(user)}` });
const quiet = { log: () => {} };
const DAY = 24 * 60 * 60 * 1000;
const makeOld = (hours) =>
  Tenant.collection.updateOne(
    { slug: DEMO_SLUG },
    { $set: { createdAt: new Date(Date.now() - hours * 60 * 60 * 1000) } },
  );

describe("B-02: the demo puts itself back", () => {
  test("a fresh demo is left alone; after 24 hours a visitor's changes are gone", async () => {
    await seed(quiet);
    const demo = await Tenant.findOne({ slug: DEMO_SLUG });
    expect(await resetDemoIfDue()).toBe(false);

    // a visitor logged in as the demo owner and played around
    await Tenant.updateOne({ _id: demo._id }, { name: "Closed forever" });
    await User.updateMany({ tenantId: demo._id, role: "staff" }, { isActive: false });
    await User.create({
      name: "Extra",
      email: "extra@demo.com",
      password: "password123",
      role: "staff",
      tenantId: demo._id,
    });

    await makeOld(25);
    expect(await resetDemoIfDue()).toBe(true);

    const fresh = await Tenant.findOne({ slug: DEMO_SLUG });
    expect(fresh.name).toBe("Demo Salon");
    expect(String(fresh._id)).not.toBe(String(demo._id));
    expect(await User.exists({ email: "extra@demo.com" })).toBeNull();
    const staff = await User.find({ tenantId: fresh._id, role: "staff" });
    expect(staff).toHaveLength(2);
    expect(staff.every((s) => s.isActive)).toBe(true);
    expect(await Appointment.countDocuments({ tenantId: fresh._id })).toBeGreaterThan(0);
    expect(await Appointment.countDocuments({ tenantId: demo._id })).toBe(0);
  });

  test("DEMO_RESET_HOURS sets the period, 0 turns it off", async () => {
    await seed(quiet);
    await makeOld(5);
    process.env.DEMO_RESET_HOURS = "0";
    expect(await resetDemoIfDue()).toBe(false);
    process.env.DEMO_RESET_HOURS = "4";
    expect(await resetDemoIfDue()).toBe(true);
  });

  test("a reset that broke halfway is repaired", async () => {
    await seed(quiet);
    await Tenant.deleteOne({ slug: DEMO_SLUG }); // users left, business gone
    expect(await resetDemoIfDue()).toBe(true);
    expect(await Tenant.exists({ slug: DEMO_SLUG })).toBeTruthy();
  });

  test("a server with no demo (a client's copy) is never touched", async () => {
    const biz = await h.makeBusiness("real-salon");
    await Tenant.collection.updateOne(
      { _id: biz.tenant._id },
      { $set: { createdAt: new Date(Date.now() - 30 * DAY) } },
    );
    expect(await resetDemoIfDue()).toBe(false);
    expect(await Tenant.exists({ _id: biz.tenant._id })).toBeTruthy();
  });

  test("the outside cron can ask for it: POST /api/jobs/demo-reset", async () => {
    await seed(quiet);
    await request(h.app).post("/api/jobs/demo-reset").expect(401);
    const res = await request(h.app).post("/api/jobs/demo-reset").set("x-jobs-secret", process.env.JOBS_SECRET);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reset: false });
  });
});

describe("B-01: adding staff", () => {
  const add = (owner, email) =>
    request(h.app).post("/api/staff").set(auth(owner)).send({ name: "New", email, password: "password123" });

  test("a taken email gets a general message that doesn't say whose it is", async () => {
    const a = await h.makeBusiness("salon-a");
    const b = await h.makeBusiness("salon-b");
    const res = await add(b.owner, a.owner.email).expect(409);
    expect(res.body.message).toBe("This email can't be used for a new staff member");
  });

  test("the demo owner can only add @demo.com staff", async () => {
    const tenant = await Tenant.create({ name: "Demo", slug: "demo-x" });
    const owner = await User.create({
      name: "Owner",
      email: "boss@demo.com",
      password: "password123",
      role: "owner",
      tenantId: tenant._id,
    });
    const res = await add(owner, "real.person@gmail.com").expect(403);
    expect(res.body.message).toBe("In the demo, staff emails must end with @demo.com");
    expect(await User.exists({ email: "real.person@gmail.com" })).toBeNull();
    await add(owner, "helper@demo.com").expect(201);
  });

  test("MAX_STAFF caps the number of staff per business", async () => {
    process.env.MAX_STAFF = "2";
    const biz = await h.makeBusiness("small"); // already has 1 staff member
    await add(biz.owner, "two@small.test").expect(201);
    const res = await add(biz.owner, "three@small.test").expect(400);
    expect(res.body.message).toBe("You have reached the maximum number of staff members");
  });
});

describe("B-03: a customer sees only their own booking's details", () => {
  test("no WhatsApp errors, no staff ids, no internal fields", async () => {
    const biz = await h.makeBusiness("fields");
    const customer = await h.makeCustomer("rana");
    const booked = await request(h.app)
      .post("/api/appointments")
      .set(auth(customer))
      .send({
        slug: biz.tenant.slug,
        serviceId: biz.service._id,
        staffId: biz.staff[0]._id,
        date: h.nextOpenDate(),
        time: "10:00",
      })
      .expect(201);
    const id = booked.body.appointment._id;
    await Appointment.collection.updateOne(
      { _id: new (require("mongoose").Types.ObjectId)(id) },
      { $set: { "autoReminder.lastError": "WhatsApp said: bad number +970599..." } },
    );

    const mine = await request(h.app).get("/api/appointments/me").set(auth(customer)).expect(200);
    const a = mine.body.appointments[0];
    expect(a).toMatchObject({ serviceName: "Haircut", price: 20, duration: 30 });
    expect(a.staffId).toEqual({ _id: String(biz.staff[0]._id), name: "Staff 1" });
    expect(a.tenantId.slug).toBe("fields");
    for (const key of ["autoReminder", "createdBy", "customerId", "rescheduled", "manageTokenHash"]) {
      expect(a).not.toHaveProperty(key);
    }

    const cancelled = await request(h.app)
      .patch(`/api/appointments/${id}/cancel`)
      .set(auth(customer))
      .send({ reason: "Travelling" })
      .expect(200);
    expect(cancelled.body.appointment.cancellation.reason).toBe("Travelling");
    expect(cancelled.body.appointment.cancellation).not.toHaveProperty("cancelledBy");
    expect(cancelled.body.appointment).not.toHaveProperty("autoReminder");
  });
});
