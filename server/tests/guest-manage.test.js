const request = require("supertest");
const h = require("./helpers");
const Appointment = require("../src/models/Appointment");
const { hashToken, createManageToken } = require("../src/utils/manageToken");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(h.disconnect);

const guestBook = (biz, time, date) =>
  request(h.app).post(`/api/public/businesses/${biz.tenant.slug}/appointments`).send({
    serviceId: biz.service._id,
    staffId: biz.staff[0]._id,
    date,
    time,
    name: "Ahmad Guest",
    phone: "0599123456",
  });

const view = (token) => request(h.app).get(`/api/public/bookings/${token}`);
const cancel = (token, reason) => request(h.app).patch(`/api/public/bookings/${token}/cancel`).send({ reason });

async function makeGuestAppointment(biz, { startsInMinutes, status = "pending" }) {
  const { token, hash } = createManageToken();
  const startTime = new Date(Date.now() + startsInMinutes * 60000);
  const appt = await Appointment.create({
    tenantId: biz.tenant._id,
    guest: { name: "Ahmad Guest", phone: "0599123456" },
    manageTokenHash: hash,
    staffId: biz.staff[0]._id,
    serviceId: biz.service._id,
    serviceName: "Haircut",
    price: 20,
    duration: 30,
    startTime,
    endTime: new Date(startTime.getTime() + 30 * 60000),
    status,
  });
  return { appt, token };
}

describe("Guest manage-booking link", () => {
  test("booking returns a secret token once; only its hash is stored", async () => {
    const biz = await h.makeBusiness("link-salon");
    const res = await guestBook(biz, "10:00", h.nextOpenDate()).expect(201);

    const token = res.body.manageToken;
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);

    const saved = await Appointment.findById(res.body.appointment.id).select("+manageTokenHash").lean();
    expect(saved.manageTokenHash).toBe(hashToken(token));
    expect(saved.manageTokenHash).not.toBe(token);
    const normal = await Appointment.findById(res.body.appointment.id).lean();
    expect(normal.manageTokenHash).toBeUndefined();
  });

  test("the link shows the booking - with the phone masked and no internal ids", async () => {
    const biz = await h.makeBusiness("view-salon");
    const { body } = await guestBook(biz, "10:00", h.nextOpenDate()).expect(201);

    const res = await view(body.manageToken).expect(200);
    const b = res.body.booking;
    expect(b.business.name).toBe("Business view-salon");
    expect(b.serviceName).toBe("Haircut");
    expect(b.staffName).toBe("Staff 1");
    expect(b.status).toBe("pending");
    expect(b.canCancel).toBe(true);
    expect(b.guestPhone).toBe("*******456");
    expect(JSON.stringify(b)).not.toContain("0599123456");
    expect(b._id).toBeUndefined();
    expect(b.manageTokenHash).toBeUndefined();
  });

  test("a wrong or broken token is a plain 404", async () => {
    const biz = await h.makeBusiness("wrong-salon");
    await guestBook(biz, "10:00", h.nextOpenDate()).expect(201);

    await view(createManageToken().token).expect(404);
    await view("not-a-real-token").expect(404);
  });

  test("the guest cancels with a reason; the slot is free again; a 2nd cancel is 409", async () => {
    const biz = await h.makeBusiness("gcancel-salon");
    const date = h.nextOpenDate();
    const { body } = await guestBook(biz, "10:00", date).expect(201);

    await cancel(body.manageToken, "busy").expect(400);
    await cancel(body.manageToken, { $ne: "" }).expect(400);

    const res = await cancel(body.manageToken, "I have an exam that day").expect(200);
    expect(res.body.booking.status).toBe("cancelled");
    expect(res.body.booking.canCancel).toBe(false);
    expect(res.body.booking.cancellation).toMatchObject({ reason: "I have an exam that day", byGuest: true });

    await cancel(body.manageToken, "I have an exam that day").expect(409);

    await guestBook(biz, "10:00", date).expect(201);
  });

  test("less than 2 hours before the start -> 400, and the link says canCancel: false", async () => {
    const biz = await h.makeBusiness("late-salon");
    const { appt, token } = await makeGuestAppointment(biz, { startsInMinutes: 60 });

    expect((await view(token).expect(200)).body.booking.canCancel).toBe(false);
    await cancel(token, "Something came up at work").expect(400);
    expect((await Appointment.findById(appt._id)).status).toBe("pending");
  });

  test("the owner's cancellation is shown to the guest and never overwritten", async () => {
    const biz = await h.makeBusiness("owner-salon");
    const { appt, token } = await makeGuestAppointment(biz, { startsInMinutes: 24 * 60 });

    await request(h.app)
      .patch(`/api/appointments/${appt._id}/status`)
      .set("Authorization", `Bearer ${h.tokenFor(biz.owner)}`)
      .send({ status: "cancelled", reason: "The barber is sick today" })
      .expect(200);

    await cancel(token, "I have an exam that day").expect(409);
    const b = (await view(token).expect(200)).body.booking;
    expect(b.status).toBe("cancelled");
    expect(b.cancellation).toMatchObject({ reason: "The barber is sick today", byGuest: false });
  });
});
