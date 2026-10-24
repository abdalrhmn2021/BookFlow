const request = require("supertest");
const h = require("./helpers");
const Appointment = require("../src/models/Appointment");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(h.disconnect);

const as = (user) => `Bearer ${h.tokenFor(user)}`;

const bookAs = (user, body) =>
  request(h.app).post("/api/appointments/business").set("Authorization", as(user)).send(body);

const moveAs = (user, id, body) =>
  request(h.app).patch(`/api/appointments/${id}/reschedule`).set("Authorization", as(user)).send(body);

const walkIn = (biz, extra = {}) => ({
  serviceId: biz.service._id,
  staffId: biz.staff[0]._id,
  date: h.nextOpenDate(),
  time: "10:00",
  name: "Walk-in Ahmad",
  ...extra,
});

describe("Booking from the dashboard", () => {
  test("the owner books a walk-in: confirmed, phone optional, with a manage link", async () => {
    const biz = await h.makeBusiness("manual-salon");

    const res = await bookAs(biz.owner, walkIn(biz)).expect(201);
    expect(res.body.appointment.status).toBe("confirmed");
    expect(res.body.appointment.staffId.name).toBe("Staff 1");
    expect(res.body.manageToken).toMatch(/^[A-Za-z0-9_-]{32}$/);

    const saved = await Appointment.findById(res.body.appointment._id).lean();
    expect(saved.guest).toEqual({ name: "Walk-in Ahmad" });
    expect(String(saved.createdBy)).toBe(String(biz.owner._id));

    // The manage link works like a guest's.
    await request(h.app).get(`/api/public/bookings/${res.body.manageToken}`).expect(200);
  });

  test("the same rules as online bookings: no double booking, no past, a valid phone", async () => {
    const biz = await h.makeBusiness("manual-rules");
    await bookAs(biz.owner, walkIn(biz)).expect(201);
    await bookAs(biz.owner, walkIn(biz, { time: "10:15" })).expect(409);
    await bookAs(biz.owner, walkIn(biz, { date: "2020-01-01" })).expect(400);
    await bookAs(biz.owner, walkIn(biz, { time: "11:00", phone: "abc" })).expect(400);
    await bookAs(biz.owner, walkIn(biz, { time: "11:00", name: "A" })).expect(400);
  });

  test("staff can book themselves only; customers and other businesses can't book here", async () => {
    const biz = await h.makeBusiness("manual-staff", { staffCount: 2 });
    const other = await h.makeBusiness("manual-other");
    const customer = await h.makeCustomer("lina");

    await bookAs(biz.staff[0], walkIn(biz)).expect(201);
    await bookAs(biz.staff[0], walkIn(biz, { staffId: biz.staff[1]._id, time: "11:00" })).expect(403);
    // Without staffId, a staff member books themselves.
    const own = await bookAs(biz.staff[1], walkIn(biz, { staffId: undefined, time: "12:00" })).expect(201);
    expect(own.body.appointment.staffId.name).toBe("Staff 2");

    await bookAs(customer, walkIn(biz, { time: "13:00" })).expect(403);
    await bookAs(other.owner, walkIn(biz, { time: "13:00" })).expect(404); // biz's staff isn't theirs
  });

  test("no 'new booking' alert for the person who entered it, but the booked staff member gets one", async () => {
    const biz = await h.makeBusiness("manual-alert");
    const poll = (user, since) =>
      request(h.app)
        .get(`/api/appointments/business/new?since=${encodeURIComponent(since)}`)
        .set("Authorization", as(user));
    const since = new Date(Date.now() - 1000).toISOString();

    await bookAs(biz.owner, walkIn(biz)).expect(201);
    expect((await poll(biz.owner, since)).body.appointments).toHaveLength(0);
    expect((await poll(biz.staff[0], since)).body.appointments).toHaveLength(1);
  });
});

describe("Rescheduling", () => {
  test("moves the appointment, clears the old reminder, and frees the old time", async () => {
    const biz = await h.makeBusiness("move-salon");
    const date = h.nextOpenDate();
    const { body } = await bookAs(biz.owner, walkIn(biz, { date })).expect(201);
    await Appointment.updateOne({ _id: body.appointment._id }, { reminderSentAt: new Date() });

    const moved = await moveAs(biz.owner, body.appointment._id, { date, time: "14:00" }).expect(200);
    expect(moved.body.appointment.reminderSentAt).toBeUndefined();
    expect(moved.body.appointment.rescheduled.from).toBeDefined();

    // 10:00 is free again for someone else.
    await bookAs(biz.owner, walkIn(biz, { date, name: "Sara" })).expect(201);
  });

  test("can overlap its own old slot (10:00 -> 10:15 for a 30-minute service)", async () => {
    const biz = await h.makeBusiness("move-overlap");
    const date = h.nextOpenDate();
    const { body } = await bookAs(biz.owner, walkIn(biz, { date })).expect(201);

    const slots = await request(h.app)
      .get(
        `/api/appointments/business/availability?serviceId=${biz.service._id}&staffId=${biz.staff[0]._id}&date=${date}&exclude=${body.appointment._id}`,
      )
      .set("Authorization", as(biz.owner))
      .expect(200);
    expect(slots.body.slots).toContain("10:15");

    await moveAs(biz.owner, body.appointment._id, { date, time: "10:15" }).expect(200);
  });

  test("won't move onto another booking, a finished one, or another staff member's calendar (staff)", async () => {
    const biz = await h.makeBusiness("move-rules", { staffCount: 2 });
    const date = h.nextOpenDate();
    const a = (await bookAs(biz.owner, walkIn(biz, { date }))).body.appointment;
    await bookAs(biz.owner, walkIn(biz, { date, time: "11:00", name: "Sara" })).expect(201);

    await moveAs(biz.owner, a._id, { date, time: "11:00" }).expect(409);
    await moveAs(biz.staff[0], a._id, { date, time: "12:00", staffId: biz.staff[1]._id }).expect(403);
    await moveAs(biz.staff[1], a._id, { date, time: "12:00" }).expect(404); // not Staff 2's booking

    // The owner can move it to another staff member.
    const toStaff2 = await moveAs(biz.owner, a._id, { date, time: "11:00", staffId: biz.staff[1]._id }).expect(200);
    expect(toStaff2.body.appointment.staffId.name).toBe("Staff 2");

    await Appointment.updateOne({ _id: a._id }, { status: "cancelled" });
    await moveAs(biz.owner, a._id, { date, time: "15:00" }).expect(409);
  });
});
