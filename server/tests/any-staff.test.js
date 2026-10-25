// "Any staff member" on the booking page: merged free times, and the server picks who is free.
const request = require("supertest");
const h = require("./helpers");
const Appointment = require("../src/models/Appointment");
const Service = require("../src/models/Service");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(h.disconnect);

const auth = (user) => ({ Authorization: `Bearer ${h.tokenFor(user)}` });
const WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const allWeek = (open, close) => WEEK.map((day) => ({ day, isOpen: true, open, close }));

const setSchedule = (biz, staff, body) =>
  request(h.app).put(`/api/staff/${staff._id}/schedule`).set(auth(biz.owner)).send(body).expect(200);

const anySlots = (biz, date, service = biz.service) =>
  request(h.app).get(
    `/api/public/businesses/${biz.tenant.slug}/availability?serviceId=${service._id}&staffId=any&date=${date}`,
  );

// Customer accounts (not guests): the guest limit (10 an hour per IP) is shared by the whole file.
let n = 0;
async function customerBook(biz, staffId, date, time, service = biz.service) {
  const customer = await h.makeCustomer(`any${++n}`);
  return request(h.app)
    .post("/api/appointments")
    .set(auth(customer))
    .send({ slug: biz.tenant.slug, serviceId: service._id, staffId, date, time });
}

// customerBook is async (it creates the customer first), so the status is checked here.
const expectStatus = async (pending, status) => {
  const res = await pending;
  expect(res.status).toBe(status);
  return res;
};

const staffOf = async (res) => String((await Appointment.findById(res.body.appointment._id)).staffId);

describe("Free times for any staff member", () => {
  test("merges everyone's free times (each in their own hours)", async () => {
    const biz = await h.makeBusiness("any-a", { staffCount: 2 });
    const [s1, s2] = biz.staff;
    const date = h.nextOpenDate();
    await setSchedule(biz, s1, { workingHours: allWeek("09:00", "12:00") });
    await setSchedule(biz, s2, { workingHours: allWeek("13:00", "17:00") });

    const res = await anySlots(biz, date).expect(200);
    expect(res.body.isOpen).toBe(true);
    expect(res.body.slots).toEqual(expect.arrayContaining(["09:00", "11:30", "13:00", "16:30"]));
    expect(res.body.slots).not.toContain("12:00"); // nobody works 12:00-13:00
    expect([...res.body.slots].sort()).toEqual(res.body.slots); // sorted, no duplicates
    expect(new Set(res.body.slots).size).toBe(res.body.slots.length);
  });

  test("a time stays free while at least one person is free there", async () => {
    const biz = await h.makeBusiness("any-b", { staffCount: 2 });
    const date = h.nextOpenDate();

    await customerBook(biz, biz.staff[0]._id, date, "10:00").then((r) => expect(r.status).toBe(201));
    expect((await anySlots(biz, date)).body.slots).toContain("10:00");

    await customerBook(biz, biz.staff[1]._id, date, "10:00").then((r) => expect(r.status).toBe(201));
    expect((await anySlots(biz, date)).body.slots).not.toContain("10:00");
  });

  test("only people who do the service count", async () => {
    const biz = await h.makeBusiness("any-c", { staffCount: 2 });
    const color = await Service.create({ tenantId: biz.tenant._id, name: "Color", price: 50, duration: 60 });
    await setSchedule(biz, biz.staff[1], { services: [String(biz.service._id)] }); // staff 2: haircuts only
    const date = h.nextOpenDate();

    await customerBook(biz, biz.staff[0]._id, date, "10:00", color).then((r) => expect(r.status).toBe(201));
    // Staff 2 is free at 10:00 but doesn't do color -> 10:00 is gone for color.
    expect((await anySlots(biz, date, color)).body.slots).not.toContain("10:00");
    expect((await anySlots(biz, date)).body.slots).toContain("10:00"); // still free for a haircut
  });
});

describe("Booking any staff member", () => {
  test("gets someone who is free at that time", async () => {
    const biz = await h.makeBusiness("any-d", { staffCount: 2 });
    const date = h.nextOpenDate();
    await customerBook(biz, biz.staff[0]._id, date, "10:00");

    const res = await expectStatus(customerBook(biz, "any", date, "10:00"), 201);
    expect(await staffOf(res)).toBe(String(biz.staff[1]._id));
    expect(res.body.staffName).toBe(biz.staff[1].name);
  });

  test("the least busy person that day comes first", async () => {
    const biz = await h.makeBusiness("any-e", { staffCount: 2 });
    const date = h.nextOpenDate();
    await customerBook(biz, biz.staff[0]._id, date, "09:00");

    const res = await expectStatus(customerBook(biz, "any", date, "15:00"), 201);
    expect(await staffOf(res)).toBe(String(biz.staff[1]._id));
  });

  test("skips people outside their own hours, on a day off, or who don't do the service", async () => {
    const biz = await h.makeBusiness("any-f", { staffCount: 3 });
    const [s1, s2, s3] = biz.staff;
    const date = h.nextOpenDate();
    await setSchedule(biz, s1, { workingHours: allWeek("13:00", "17:00") });
    await setSchedule(biz, s2, { daysOff: [date] });
    const other = await Service.create({ tenantId: biz.tenant._id, name: "Shave", price: 10, duration: 15 });
    await setSchedule(biz, s3, { services: [String(other._id)] });

    // Nobody can do a haircut at 10:00 that day.
    const none = await expectStatus(customerBook(biz, "any", date, "10:00"), 409);
    expect(none.body.message).toBe("Nobody is free at that time, please pick another time");

    const ok = await expectStatus(customerBook(biz, "any", date, "14:00"), 201);
    expect(await staffOf(ok)).toBe(String(s1._id));
  });

  test("3 customers book 'any' at the same moment with 2 staff: 2 different people, 1 gets 409", async () => {
    const biz = await h.makeBusiness("any-g", { staffCount: 2 });
    const date = h.nextOpenDate();
    const customers = await Promise.all([1, 2, 3].map((i) => h.makeCustomer(`race${i}`)));

    const results = await Promise.all(
      customers.map((c) =>
        request(h.app)
          .post("/api/appointments")
          .set(auth(c))
          .send({ slug: biz.tenant.slug, serviceId: biz.service._id, staffId: "any", date, time: "11:00" }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 201, 409]);

    const booked = await Appointment.find({ tenantId: biz.tenant._id });
    expect(booked).toHaveLength(2);
    expect(new Set(booked.map((a) => String(a.staffId))).size).toBe(2);
  });

  test("business-wide mistakes keep their own message (past time, closed hours)", async () => {
    const biz = await h.makeBusiness("any-h", { staffCount: 2 });
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    const past = await expectStatus(customerBook(biz, "any", yesterday, "10:00"), 400);
    expect(past.body.message).toBe("You can't book a time in the past");

    const early = await expectStatus(customerBook(biz, "any", h.nextOpenDate(), "07:00"), 400);
    expect(early.body.message).toBe("This time is outside working hours");
  });

  test("works for guests too, and tells them who they got", async () => {
    const biz = await h.makeBusiness("any-i", { staffCount: 2 });
    const res = await request(h.app)
      .post(`/api/public/businesses/${biz.tenant.slug}/appointments`)
      .send({
        serviceId: biz.service._id,
        staffId: "any",
        date: h.nextOpenDate(),
        time: "12:00",
        name: "Guest",
        phone: "0599123456",
      })
      .expect(201);
    expect(biz.staff.map((s) => s.name)).toContain(res.body.appointment.staffName);
  });

  test("includes an owner who takes bookings", async () => {
    const biz = await h.makeBusiness("any-j", { staffCount: 0 });
    await request(h.app).patch(`/api/staff/${biz.owner._id}`).set(auth(biz.owner)).send({ bookable: true });

    const res = await expectStatus(customerBook(biz, "any", h.nextOpenDate(), "10:00"), 201);
    expect(await staffOf(res)).toBe(String(biz.owner._id));
  });
});
