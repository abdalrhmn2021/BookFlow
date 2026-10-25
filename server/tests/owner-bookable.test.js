// "I take bookings too": an owner who works in the shop can be booked like a staff member.
const request = require("supertest");
const h = require("./helpers");
const Appointment = require("../src/models/Appointment");
const { prepare } = require("../scripts/setup-client");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(h.disconnect);

const auth = (user) => ({ Authorization: `Bearer ${h.tokenFor(user)}` });
const WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const allWeek = (open, close) => WEEK.map((day) => ({ day, isOpen: true, open, close }));

const setBookable = (biz, value) =>
  request(h.app).patch(`/api/staff/${biz.owner._id}`).set(auth(biz.owner)).send({ bookable: value });

const publicPage = (biz) => request(h.app).get(`/api/public/businesses/${biz.tenant.slug}`);

const slotsFor = (biz, person, date) =>
  request(h.app).get(
    `/api/public/businesses/${biz.tenant.slug}/availability?serviceId=${biz.service._id}&staffId=${person._id}&date=${date}`,
  );

const guestBook = (biz, person, date, time, phone = "0599123456") =>
  request(h.app)
    .post(`/api/public/businesses/${biz.tenant.slug}/appointments`)
    .send({ serviceId: biz.service._id, staffId: person._id, date, time, name: "Guest", phone });

describe("Owner who takes bookings", () => {
  test("by default the owner is not bookable: not on the public page, booking them is 404", async () => {
    const biz = await h.makeBusiness("solo-a");
    const date = h.nextOpenDate();

    const page = await publicPage(biz).expect(200);
    expect(page.body.staff.map((s) => s.id)).not.toContain(String(biz.owner._id));

    await slotsFor(biz, biz.owner, date).expect(404);
    await guestBook(biz, biz.owner, date, "10:00").expect(404);
  });

  test("switched on: listed for customers, has free slots and can be booked", async () => {
    const biz = await h.makeBusiness("solo-b", { staffCount: 0 });
    const date = h.nextOpenDate();

    const res = await setBookable(biz, true).expect(200);
    expect(res.body.staff).toMatchObject({ role: "owner", bookable: true });

    const page = await publicPage(biz).expect(200);
    expect(page.body.staff).toEqual([{ id: String(biz.owner._id), name: biz.owner.name, serviceIds: [] }]);

    const slots = await slotsFor(biz, biz.owner, date).expect(200);
    expect(slots.body.slots).toContain("10:00");

    const booked = await guestBook(biz, biz.owner, date, "10:00").expect(201);
    expect(booked.body.appointment.staffName).toBe(biz.owner.name);

    const after = await slotsFor(biz, biz.owner, date).expect(200);
    expect(after.body.slots).not.toContain("10:00");
  });

  // Customer accounts, not guests: the guest limit (10 an hour per IP) is shared by this whole file.
  test("the double-booking lock covers the owner too: 5 customers at once, exactly 1 wins", async () => {
    const biz = await h.makeBusiness("solo-c", { staffCount: 0 });
    await setBookable(biz, true).expect(200);
    const date = h.nextOpenDate();
    const customers = await Promise.all([1, 2, 3, 4, 5].map((i) => h.makeCustomer(`c${i}`)));

    const results = await Promise.all(
      customers.map((c) =>
        request(h.app)
          .post("/api/appointments")
          .set(auth(c))
          .send({ slug: biz.tenant.slug, serviceId: biz.service._id, staffId: biz.owner._id, date, time: "11:00" }),
      ),
    );
    const codes = results.map((r) => r.status).sort();
    expect(codes).toEqual([201, 409, 409, 409, 409]);
    expect(await Appointment.countDocuments({ staffId: biz.owner._id })).toBe(1);
  });

  test("the owner's own hours narrow their slots, like a staff member's", async () => {
    const biz = await h.makeBusiness("solo-d", { staffCount: 0 });
    await setBookable(biz, true).expect(200);
    const date = h.nextOpenDate();

    await request(h.app)
      .put(`/api/staff/${biz.owner._id}/schedule`)
      .set(auth(biz.owner))
      .send({ workingHours: allWeek("13:00", "15:00") })
      .expect(200);

    const slots = await slotsFor(biz, biz.owner, date).expect(200);
    expect(slots.body.slots[0]).toBe("13:00");
    expect(slots.body.slots).not.toContain("10:00");
    await guestBook(biz, biz.owner, date, "10:00").expect(400);
  });

  test("the owner can enter a walk-in booking for themself from the dashboard", async () => {
    const biz = await h.makeBusiness("solo-e", { staffCount: 0 });
    await setBookable(biz, true).expect(200);

    const res = await request(h.app)
      .post("/api/appointments/business")
      .set(auth(biz.owner))
      .send({
        serviceId: biz.service._id,
        staffId: biz.owner._id,
        date: h.nextOpenDate(),
        time: "12:00",
        name: "Walk-in",
      })
      .expect(201);
    expect(res.body.appointment.staffId.name).toBe(biz.owner.name);
  });

  test("switched off again: gone from the public page and can't be booked", async () => {
    const biz = await h.makeBusiness("solo-f");
    await setBookable(biz, true).expect(200);
    await setBookable(biz, false).expect(200);

    const page = await publicPage(biz).expect(200);
    expect(page.body.staff.map((s) => s.id)).toEqual([String(biz.staff[0]._id)]);
    await guestBook(biz, biz.owner, h.nextOpenDate(), "10:00").expect(404);
  });
});

describe("Owner's row in the staff list", () => {
  test("the owner comes first, with the bookable flag; staff rows have none", async () => {
    const biz = await h.makeBusiness("list-a", { staffCount: 2 });

    const res = await request(h.app).get("/api/staff").set(auth(biz.owner)).expect(200);
    expect(res.body.count).toBe(3);
    expect(res.body.staff[0]).toMatchObject({ id: String(biz.owner._id), role: "owner", bookable: false });
    expect(res.body.staff.slice(1).every((s) => s.role === "staff" && !("bookable" in s))).toBe(true);
  });

  test("the owner can't deactivate themself, and isActive is ignored on their own row", async () => {
    const biz = await h.makeBusiness("list-b");

    await request(h.app).delete(`/api/staff/${biz.owner._id}`).set(auth(biz.owner)).expect(404);
    const res = await request(h.app)
      .patch(`/api/staff/${biz.owner._id}`)
      .set(auth(biz.owner))
      .send({ isActive: false, name: "Laila" })
      .expect(200);
    expect(res.body.staff).toMatchObject({ name: "Laila", isActive: true });
  });

  test("bookable must be a real boolean, and only the owner's own row has it", async () => {
    const biz = await h.makeBusiness("list-c");

    await setBookable(biz, "yes").expect(400);
    // On a staff row the field is simply not accepted.
    const res = await request(h.app)
      .patch(`/api/staff/${biz.staff[0]._id}`)
      .set(auth(biz.owner))
      .send({ bookable: true })
      .expect(200);
    expect(res.body.staff.bookable).toBeUndefined();
  });

  test("another business's owner can't be switched on or booked", async () => {
    const a = await h.makeBusiness("iso-a");
    const b = await h.makeBusiness("iso-b");

    await request(h.app).patch(`/api/staff/${b.owner._id}`).set(auth(a.owner)).send({ bookable: true }).expect(404);

    await setBookable(b, true).expect(200);
    // B's owner is bookable at B - but not through A's booking page.
    await guestBook(a, b.owner, h.nextOpenDate(), "10:00").expect(404);
  });
});

describe("setup-client --owner-books", () => {
  test("the flag marks the new owner as bookable", () => {
    const base = { name: "Solo Barber", slug: "solo-barber", owner: "Omar", email: "omar@test.com" };
    expect(prepare(base).ownerBookable).toBeUndefined();
    expect(prepare({ ...base, "owner-books": "" }).ownerBookable).toBe(true);
  });
});
