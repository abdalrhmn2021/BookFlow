const request = require("supertest");
const h = require("./helpers");
const Appointment = require("../src/models/Appointment");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(h.disconnect);

const auth = (user) => ({ Authorization: `Bearer ${h.tokenFor(user)}` });

async function makeAppointment(biz, { staffIndex = 0, startsInMinutes = 24 * 60, status = "pending" } = {}) {
  const startTime = new Date(Date.now() + startsInMinutes * 60000);
  return Appointment.create({
    tenantId: biz.tenant._id,
    guest: { name: "Ahmad Guest", phone: "0599123456" },
    staffId: biz.staff[staffIndex]._id,
    serviceId: biz.service._id,
    serviceName: "Haircut",
    price: 20,
    duration: 30,
    startTime,
    endTime: new Date(startTime.getTime() + 30 * 60000),
    status,
  });
}

const remind = (user, appt) => request(h.app).patch(`/api/appointments/${appt._id}/reminded`).set(auth(user));

describe("Mark appointment as reminded", () => {
  test("the owner marks an upcoming appointment as reminded, and the schedule shows it", async () => {
    const biz = await h.makeBusiness("remind-salon");
    const appt = await makeAppointment(biz);

    const res = await remind(biz.owner, appt);
    expect(res.status).toBe(200);
    expect(new Date(res.body.reminderSentAt).getTime()).toBeLessThanOrEqual(Date.now());

    const saved = await Appointment.findById(appt._id);
    expect(saved.reminderSentAt).toBeInstanceOf(Date);
  });

  test("a staff member can't mark a colleague's appointment (404, it doesn't exist for him)", async () => {
    const biz = await h.makeBusiness("colleague-salon", { staffCount: 2 });
    const appt = await makeAppointment(biz, { staffIndex: 1 });

    expect((await remind(biz.staff[0], appt)).status).toBe(404);
    expect((await remind(biz.staff[1], appt)).status).toBe(200);
  });

  test("another business can't touch it (404)", async () => {
    const biz = await h.makeBusiness("mine-salon");
    const other = await h.makeBusiness("other-salon");
    const appt = await makeAppointment(biz);

    expect((await remind(other.owner, appt)).status).toBe(404);
  });

  test("cancelled or past appointments can't be reminded (409)", async () => {
    const biz = await h.makeBusiness("late-salon");
    const cancelled = await makeAppointment(biz, { status: "cancelled" });
    const past = await makeAppointment(biz, { startsInMinutes: -60, status: "confirmed" });

    expect((await remind(biz.owner, cancelled)).status).toBe(409);
    expect((await remind(biz.owner, past)).status).toBe(409);
  });

  test("a customer account can't use it (403)", async () => {
    const biz = await h.makeBusiness("customer-salon");
    const customer = await h.makeCustomer("sara");
    const appt = await makeAppointment(biz);

    expect((await remind(customer, appt)).status).toBe(403);
  });
});
