// Per-staff working hours, services and days off: the API and how bookings follow them.
const request = require("supertest");
const h = require("./helpers");
const Service = require("../src/models/Service");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(h.disconnect);

const auth = (user) => ({ Authorization: `Bearer ${h.tokenFor(user)}` });
const WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const allWeek = (open, close) => WEEK.map((day) => ({ day, isOpen: true, open, close }));

const setSchedule = (biz, staff, body) =>
  request(h.app).put(`/api/staff/${staff._id}/schedule`).set(auth(biz.owner)).send(body);

const slotsFor = (biz, staff, date, service = biz.service) =>
  request(h.app).get(
    `/api/public/businesses/${biz.tenant.slug}/availability?serviceId=${service._id}&staffId=${staff._id}&date=${date}`,
  );

const guestBook = (biz, staff, date, time, service = biz.service) =>
  request(h.app)
    .post(`/api/public/businesses/${biz.tenant.slug}/appointments`)
    .send({ serviceId: service._id, staffId: staff._id, date, time, name: "Guest", phone: "0599123456" });

describe("Staff schedule API", () => {
  test("the owner saves own hours, services and days off; null/[] resets them", async () => {
    const biz = await h.makeBusiness("salon-a");
    const staff = biz.staff[0];
    const date = h.nextOpenDate();

    const res = await setSchedule(biz, staff, {
      workingHours: allWeek("12:00", "15:00"),
      services: [String(biz.service._id)],
      daysOff: [date, date],
    }).expect(200);
    expect(res.body.staff.workingHours).toHaveLength(7);
    expect(res.body.staff.services).toEqual([String(biz.service._id)]);
    expect(res.body.staff.daysOff).toEqual([date]);

    const reset = await setSchedule(biz, staff, { workingHours: null, services: [], daysOff: [] }).expect(200);
    expect(reset.body.staff).toMatchObject({ workingHours: null, services: [], daysOff: [] });
  });

  test("bad input is refused", async () => {
    const biz = await h.makeBusiness("salon-a");
    const other = await h.makeBusiness("salon-b");
    const staff = biz.staff[0];

    await setSchedule(biz, staff, { services: [String(other.service._id)] }).expect(400); // another business's
    await setSchedule(biz, staff, { daysOff: ["2026-02-30"] }).expect(400);
    await setSchedule(biz, staff, {
      workingHours: [{ day: "monday", isOpen: true, open: "10:00", close: "11:00" }],
    }).expect(400); // not 7 days
    await setSchedule(biz, staff, { workingHours: allWeek("15:00", "12:00") }).expect(400); // closes before it opens
  });

  test("only the owner of the same business can change it", async () => {
    const biz = await h.makeBusiness("salon-a");
    const other = await h.makeBusiness("salon-b");
    await request(h.app)
      .put(`/api/staff/${biz.staff[0]._id}/schedule`)
      .set(auth(biz.staff[0]))
      .send({ daysOff: [] })
      .expect(403);
    await request(h.app)
      .put(`/api/staff/${biz.staff[0]._id}/schedule`)
      .set(auth(other.owner))
      .send({ daysOff: [] })
      .expect(404);
  });
});

describe("Bookings follow the staff schedule", () => {
  test("free slots and bookings stay inside the staff member's own hours", async () => {
    const biz = await h.makeBusiness("salon-a");
    const staff = biz.staff[0];
    const date = h.nextOpenDate();
    await setSchedule(biz, staff, { workingHours: allWeek("12:00", "14:00") }).expect(200);

    const res = await slotsFor(biz, staff, date).expect(200);
    expect(res.body.slots[0]).toBe("12:00");
    expect(res.body.slots.at(-1)).toBe("13:30"); // 30-min service ends by 14:00

    const outside = await guestBook(biz, staff, date, "10:00").expect(400);
    expect(outside.body.message).toBe("This staff member isn't working at that time");
    await guestBook(biz, staff, date, "12:30").expect(201);
  });

  test("a day off: no slots, no booking", async () => {
    const biz = await h.makeBusiness("salon-a");
    const staff = biz.staff[0];
    const date = h.nextOpenDate();
    await setSchedule(biz, staff, { daysOff: [date] }).expect(200);

    const res = await slotsFor(biz, staff, date).expect(200);
    expect(res.body).toMatchObject({ isOpen: false, slots: [] });
    await guestBook(biz, staff, date, "10:00").expect(400);
  });

  test("a service the staff member doesn't do can't be booked with them", async () => {
    const biz = await h.makeBusiness("salon-a", { staffCount: 2 });
    const color = await Service.create({ tenantId: biz.tenant._id, name: "Color", price: 50, duration: 60 });
    const [onlyCuts, both] = biz.staff;
    await setSchedule(biz, onlyCuts, { services: [String(biz.service._id)] }).expect(200);
    const date = h.nextOpenDate();

    const page = await request(h.app).get(`/api/public/businesses/${biz.tenant.slug}`).expect(200);
    const listed = Object.fromEntries(page.body.staff.map((s) => [s.id, s.serviceIds]));
    expect(listed[String(onlyCuts._id)]).toEqual([String(biz.service._id)]);
    expect(listed[String(both._id)]).toEqual([]);

    await slotsFor(biz, onlyCuts, date, color).expect(400);
    const refused = await guestBook(biz, onlyCuts, date, "10:00", color).expect(400);
    expect(refused.body.message).toBe("This staff member doesn't offer this service");
    await guestBook(biz, both, date, "10:00", color).expect(201);
  });
});
