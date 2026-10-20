const request = require("supertest");
const h = require("./helpers");
const Appointment = require("../src/models/Appointment");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(h.disconnect);

const auth = (user) => ({ Authorization: `Bearer ${h.tokenFor(user)}` });
const stats = (user) => request(h.app).get("/api/appointments/business/stats").set(auth(user));

const HOUR = 60 * 60000;

function makeAppointment(biz, { staffIndex = 0, inHours = 1, status = "pending", price = 20 } = {}) {
  const startTime = new Date(Date.now() + inHours * HOUR);
  return Appointment.create({
    tenantId: biz.tenant._id,
    guest: { name: "Guest", phone: "0599123456" },
    staffId: biz.staff[staffIndex]._id,
    serviceId: biz.service._id,
    serviceName: "Haircut",
    price,
    duration: 30,
    startTime,
    endTime: new Date(startTime.getTime() + 30 * 60000),
    status,
  });
}

describe("Business overview stats", () => {
  test("returns 7 days, counts pending work and finds the next appointment", async () => {
    const biz = await h.makeBusiness("stats-salon");
    await makeAppointment(biz, { inHours: 2 * 24, status: "pending" });
    const soonest = await makeAppointment(biz, { inHours: 1, status: "confirmed" });
    await makeAppointment(biz, { inHours: 3 * 24, status: "cancelled" });
    await makeAppointment(biz, { inHours: 30 * 24, status: "pending" });

    const res = await stats(biz.owner);
    expect(res.status).toBe(200);
    expect(res.body.week).toHaveLength(7);
    expect(res.body.week[0].date).toBe(res.body.date);

    const weekTotal = res.body.week.reduce((sum, d) => sum + d.count, 0);
    expect(weekTotal).toBe(2);

    expect(res.body.toConfirm).toBe(2);
    expect(res.body.next._id).toBe(String(soonest._id));
    expect(res.body.next.staffId.name).toBe("Staff 1");
  });

  test("today's revenue skips cancelled and no-show", async () => {
    const biz = await h.makeBusiness("revenue-salon");
    const tz = biz.tenant.timezone;
    const localHour = Number(
      new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(new Date()),
    );
    const safe = localHour < 23 ? 0.25 : -0.5;

    await makeAppointment(biz, { inHours: safe, status: "confirmed", price: 50 });
    await makeAppointment(biz, { inHours: safe, status: "pending", price: 25 });
    await makeAppointment(biz, { inHours: safe, status: "cancelled", price: 100 });

    const res = await stats(biz.owner);
    expect(res.body.today.total).toBe(3);
    expect(res.body.today.byStatus.cancelled).toBe(1);
    expect(res.body.today.revenue).toBe(75);
  });

  test("a staff member only counts his own appointments", async () => {
    const biz = await h.makeBusiness("staff-stats-salon", { staffCount: 2 });
    await makeAppointment(biz, { staffIndex: 0, inHours: 24 });
    await makeAppointment(biz, { staffIndex: 1, inHours: 24 });
    await makeAppointment(biz, { staffIndex: 1, inHours: 48 });

    expect((await stats(biz.staff[0])).body.toConfirm).toBe(1);
    expect((await stats(biz.staff[1])).body.toConfirm).toBe(2);
    expect((await stats(biz.owner)).body.toConfirm).toBe(3);
  });

  test("another business's appointments never show up", async () => {
    const biz = await h.makeBusiness("own-salon");
    const other = await h.makeBusiness("other-stats-salon");
    await makeAppointment(other, { inHours: 24 });

    const res = await stats(biz.owner);
    expect(res.body.toConfirm).toBe(0);
    expect(res.body.next).toBeNull();
  });

  test("customers can't see business stats (403)", async () => {
    const customer = await h.makeCustomer("nosy");
    expect((await stats(customer)).status).toBe(403);
  });
});
