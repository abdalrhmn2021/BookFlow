// The receptionist role: the receptionist handles the bookings, the owner watches and manages
// the team, staff close their own appointments (utils/bookingDesk.js).
const request = require("supertest");
const h = require("./helpers");
const User = require("../src/models/User");
const Appointment = require("../src/models/Appointment");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(h.disconnect);

const auth = (user) => ({ Authorization: `Bearer ${h.tokenFor(user)}` });
const ONE_DAY = 24 * 60;

async function addReceptionist(biz, { isActive = true } = {}) {
  return User.create({
    name: "Reem",
    email: `reem@${biz.tenant.slug}.test`,
    password: "password123",
    role: "receptionist",
    tenantId: biz.tenant._id,
    isActive,
  });
}

async function makeAppointment(biz, { staff = biz.staff[0], startsInMinutes = ONE_DAY, status = "pending" } = {}) {
  const startTime = new Date(Date.now() + startsInMinutes * 60000);
  return Appointment.create({
    tenantId: biz.tenant._id,
    guest: { name: "Ahmad" },
    staffId: staff._id,
    serviceId: biz.service._id,
    serviceName: "Haircut",
    price: 20,
    duration: 30,
    startTime,
    endTime: new Date(startTime.getTime() + 30 * 60000),
    status,
  });
}

const setStatus = (user, appt, body) =>
  request(h.app).patch(`/api/appointments/${appt._id}/status`).set(auth(user)).send(body);

const walkIn = (biz, extra = {}) => ({
  serviceId: biz.service._id,
  staffId: biz.staff[0]._id,
  date: h.nextOpenDate(),
  time: "10:00",
  name: "Walk-in Ahmad",
  ...extra,
});
const book = (user, body) => request(h.app).post("/api/appointments/business").set(auth(user)).send(body);
const access = (user) => request(h.app).get("/api/tenants/me").set(auth(user)).expect(200);

describe("Adding a receptionist (Staff tab)", () => {
  test("the owner adds one; it's listed with its role, can log in, and nobody can book it", async () => {
    const biz = await h.makeBusiness("rec-add");

    const res = await request(h.app)
      .post("/api/staff")
      .set(auth(biz.owner))
      .send({ name: "Reem", email: "reem@rec-add.test", password: "password123", role: "receptionist" })
      .expect(201);
    expect(res.body.staff.role).toBe("receptionist");

    const list = await request(h.app).get("/api/staff").set(auth(biz.owner)).expect(200);
    expect(list.body.staff.map((s) => s.role)).toEqual(["owner", "receptionist", "staff"]);

    await request(h.app)
      .post("/api/auth/login")
      .send({ email: "reem@rec-add.test", password: "password123" })
      .expect(200);

    // Not on the public booking page, and no booking schedule to set.
    const page = await request(h.app).get(`/api/public/businesses/${biz.tenant.slug}`).expect(200);
    expect(page.body.staff.map((s) => s.name)).toEqual(["Staff 1"]);
    await request(h.app)
      .put(`/api/staff/${res.body.staff.id}/schedule`)
      .set(auth(biz.owner))
      .send({ daysOff: [] })
      .expect(400);
  });

  test("only staff or receptionist can be added; staff without a role stay staff", async () => {
    const biz = await h.makeBusiness("rec-roles");
    const add = (role, email) =>
      request(h.app)
        .post("/api/staff")
        .set(auth(biz.owner))
        .send({ name: "X Y", email, password: "password123", role });

    await add("owner", "a@rec-roles.test").expect(400);
    await add("superadmin", "b@rec-roles.test").expect(400);
    const plain = await request(h.app)
      .post("/api/staff")
      .set(auth(biz.owner))
      .send({ name: "Sami", email: "c@rec-roles.test", password: "password123" })
      .expect(201);
    expect(plain.body.staff.role).toBe("staff");
  });

  test("a receptionist can't manage the team, the services or the hours", async () => {
    const biz = await h.makeBusiness("rec-limits");
    const reem = await addReceptionist(biz);

    await request(h.app).get("/api/staff").set(auth(reem)).expect(403);
    await request(h.app).post("/api/services").set(auth(reem)).send({ name: "X", price: 1, duration: 15 }).expect(403);
    await request(h.app).put("/api/tenants/me/working-hours").set(auth(reem)).send({ workingHours: [] }).expect(403);
  });
});

describe("With a receptionist, the receptionist handles the bookings", () => {
  test("the receptionist confirms, enters bookings for anyone, moves them and sends reminders", async () => {
    const biz = await h.makeBusiness("rec-desk", { staffCount: 2 });
    const reem = await addReceptionist(biz);
    const date = h.nextOpenDate();

    const appt = await makeAppointment(biz);
    await setStatus(reem, appt, { status: "confirmed" }).expect(200);

    const created = await book(reem, walkIn(biz, { staffId: biz.staff[1]._id, date })).expect(201);
    expect(created.body.appointment.staffId.name).toBe("Staff 2");

    await request(h.app)
      .get(
        `/api/appointments/business/availability?serviceId=${biz.service._id}&staffId=${biz.staff[1]._id}&date=${date}`,
      )
      .set(auth(reem))
      .expect(200);
    await request(h.app)
      .patch(`/api/appointments/${created.body.appointment._id}/reschedule`)
      .set(auth(reem))
      .send({ date, time: "12:00" })
      .expect(200);
    await request(h.app).patch(`/api/appointments/${appt._id}/reminded`).set(auth(reem)).expect(200);

    // ...and sees the whole business.
    const day = await request(h.app).get(`/api/appointments/business?date=${date}`).set(auth(reem)).expect(200);
    expect(day.body.count).toBe(1);
  });

  test("the owner only watches: sees everything, but can't confirm, cancel, book, move or remind", async () => {
    const biz = await h.makeBusiness("rec-owner");
    await addReceptionist(biz);
    const appt = await makeAppointment(biz);

    await request(h.app).get("/api/appointments/business/stats").set(auth(biz.owner)).expect(200);
    await setStatus(biz.owner, appt, { status: "confirmed" }).expect(403);
    await setStatus(biz.owner, appt, { status: "cancelled", reason: "The barber is sick today" }).expect(403);
    await book(biz.owner, walkIn(biz)).expect(403);
    await request(h.app)
      .patch(`/api/appointments/${appt._id}/reschedule`)
      .set(auth(biz.owner))
      .send({ date: h.nextOpenDate(), time: "12:00" })
      .expect(403);
    await request(h.app).patch(`/api/appointments/${appt._id}/reminded`).set(auth(biz.owner)).expect(403);

    expect((await Appointment.findById(appt._id)).status).toBe("pending");
  });

  test("an owner who takes bookings too can still close their own appointment", async () => {
    const biz = await h.makeBusiness("rec-owner-books");
    await User.updateOne({ _id: biz.owner._id }, { bookable: true });
    await addReceptionist(biz);

    const own = await makeAppointment(biz, { staff: biz.owner, startsInMinutes: -60, status: "confirmed" });
    await setStatus(biz.owner, own, { status: "completed" }).expect(200);

    const staffs = await makeAppointment(biz, { startsInMinutes: -60, status: "confirmed" });
    await setStatus(biz.owner, staffs, { status: "no-show" }).expect(403);
  });

  test("deactivating the receptionist gives the bookings back to the owner", async () => {
    const biz = await h.makeBusiness("rec-off");
    const reem = await addReceptionist(biz);
    expect((await access(biz.owner)).body.access).toEqual({ manageBookings: false, hasReceptionist: true });

    await request(h.app).delete(`/api/staff/${reem._id}`).set(auth(biz.owner)).expect(200);

    expect((await access(biz.owner)).body.access).toEqual({ manageBookings: true, hasReceptionist: false });
    await book(biz.owner, walkIn(biz)).expect(201);
  });
});

describe("Without a receptionist nothing changes for the owner", () => {
  test("the owner confirms and books as before; an inactive receptionist doesn't count", async () => {
    const biz = await h.makeBusiness("rec-none");
    await addReceptionist(biz, { isActive: false });
    expect((await access(biz.owner)).body.access).toEqual({ manageBookings: true, hasReceptionist: false });

    const appt = await makeAppointment(biz);
    await setStatus(biz.owner, appt, { status: "confirmed" }).expect(200);
    await book(biz.owner, walkIn(biz)).expect(201);
  });
});

describe("Staff see their schedule and close their own appointments", () => {
  test("completed / no-show on their own started appointment only", async () => {
    const biz = await h.makeBusiness("rec-staff", { staffCount: 2 });
    const [sami, omar] = biz.staff;
    expect((await access(sami)).body.access.manageBookings).toBe(false);

    const done = await makeAppointment(biz, { startsInMinutes: -60, status: "confirmed" });
    const missed = await makeAppointment(biz, { startsInMinutes: -180 });
    await setStatus(sami, done, { status: "completed" }).expect(200);
    await setStatus(sami, missed, { status: "no-show" }).expect(200);

    // Not confirming or cancelling, even their own...
    const upcoming = await makeAppointment(biz);
    await setStatus(sami, upcoming, { status: "confirmed" }).expect(403);
    await setStatus(sami, upcoming, { status: "cancelled", reason: "I can't come that day" }).expect(403);
    // ...and a colleague's doesn't exist for them.
    const omars = await makeAppointment(biz, { staff: omar, startsInMinutes: -60, status: "confirmed" });
    await setStatus(sami, omars, { status: "completed" }).expect(404);
  });

  test("the receptionist's /tenants/me says they manage bookings", async () => {
    const biz = await h.makeBusiness("rec-access");
    const reem = await addReceptionist(biz);
    expect((await access(reem)).body.access).toEqual({ manageBookings: true, hasReceptionist: true });
  });
});
