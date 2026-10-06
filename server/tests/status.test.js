// ============================================================
// اختبارات حالات الموعد (state machine) وقواعد الإلغاء
// ============================================================
const request = require("supertest");
const h = require("./helpers");
const Appointment = require("../src/models/Appointment");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(h.disconnect);

const auth = (user) => ({ Authorization: `Bearer ${h.tokenFor(user)}` });

// موعد مباشرة بالداتابيس - بيخلينا نحط أي وقت (حتى قريب أو ماضي)
async function makeAppointment(biz, customer, { startsInMinutes, status = "pending" }) {
  const startTime = new Date(Date.now() + startsInMinutes * 60000);
  return Appointment.create({
    tenantId: biz.tenant._id,
    customerId: customer._id,
    staffId: biz.staff[0]._id,
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

const cancelAsCustomer = (user, appt, reason) =>
  request(h.app).patch(`/api/appointments/${appt._id}/cancel`).set(auth(user)).send({ reason });

const ONE_DAY = 24 * 60;

describe("Status transitions (owner/staff)", () => {
  let biz, customer;
  beforeEach(async () => {
    biz = await h.makeBusiness("status-salon");
    customer = await h.makeCustomer("ahmad");
  });

  test("pending -> confirmed is allowed", async () => {
    const appt = await makeAppointment(biz, customer, { startsInMinutes: ONE_DAY });
    const res = await setStatus(biz.owner, appt, { status: "confirmed" }).expect(200);
    expect(res.body.appointment.status).toBe("confirmed"); // returnDocument: "after"
  });

  test("pending -> completed is NOT in the map (409)", async () => {
    const appt = await makeAppointment(biz, customer, { startsInMinutes: ONE_DAY });
    await setStatus(biz.owner, appt, { status: "completed" }).expect(409);
  });

  test("completed is final - can't go back to confirmed (409)", async () => {
    const appt = await makeAppointment(biz, customer, { startsInMinutes: -60, status: "completed" });
    await setStatus(biz.owner, appt, { status: "confirmed" }).expect(409);
  });

  test("can't mark confirmed as completed before it starts (400)", async () => {
    const appt = await makeAppointment(biz, customer, { startsInMinutes: ONE_DAY, status: "confirmed" });
    await setStatus(biz.owner, appt, { status: "completed" }).expect(400);
  });

  test("cancelling without a reason is rejected (400)", async () => {
    const appt = await makeAppointment(biz, customer, { startsInMinutes: ONE_DAY });
    await setStatus(biz.owner, appt, { status: "cancelled" }).expect(400);
  });
});

describe("Customer cancellation", () => {
  let biz, customer;
  beforeEach(async () => {
    biz = await h.makeBusiness("cancel-salon");
    customer = await h.makeCustomer("ahmad");
  });

  test("cancels with a reason, and a second cancel gets 409", async () => {
    const appt = await makeAppointment(biz, customer, { startsInMinutes: ONE_DAY });

    const res = await cancelAsCustomer(customer, appt, "I have an exam that day").expect(200);
    expect(res.body.appointment.status).toBe("cancelled");
    expect(res.body.appointment.cancellation.reason).toBe("I have an exam that day");

    await cancelAsCustomer(customer, appt, "I have an exam that day").expect(409);
  });

  test("a too-short reason is rejected (400)", async () => {
    const appt = await makeAppointment(biz, customer, { startsInMinutes: ONE_DAY });
    await cancelAsCustomer(customer, appt, "busy").expect(400);
  });

  test("less than 2 hours before the start is rejected (400)", async () => {
    const appt = await makeAppointment(biz, customer, { startsInMinutes: 60 });
    await cancelAsCustomer(customer, appt, "Something came up at work").expect(400);
  });

  test("the owner's cancellation is never overwritten by the customer (409)", async () => {
    // الموظف لغى أول وكتب سببه -> الزبون ما لازم يكتب فوقه
    const appt = await makeAppointment(biz, customer, { startsInMinutes: ONE_DAY });
    await setStatus(biz.owner, appt, { status: "cancelled", reason: "The barber is sick today" }).expect(200);

    await cancelAsCustomer(customer, appt, "I have an exam that day").expect(409);
    const fresh = await Appointment.findById(appt._id);
    expect(fresh.cancellation.reason).toBe("The barber is sick today");
  });
});
