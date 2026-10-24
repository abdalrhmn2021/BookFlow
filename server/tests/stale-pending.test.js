// services/maintenance.service.js: pending bookings nobody confirmed are closed a day after they end.
const request = require("supertest");
const h = require("./helpers");
const Appointment = require("../src/models/Appointment");
const { closeStalePending } = require("../src/services/maintenance.service");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(h.disconnect);

const HOUR = 60 * 60 * 1000;

function booking(biz, endedHoursAgo, status = "pending") {
  const endTime = new Date(Date.now() - endedHoursAgo * HOUR);
  return Appointment.create({
    tenantId: biz.tenant._id,
    staffId: biz.staff[0]._id,
    serviceId: biz.service._id,
    serviceName: "Haircut",
    price: 20,
    duration: 30,
    startTime: new Date(endTime.getTime() - 30 * 60 * 1000),
    endTime,
    status,
    guest: { name: "Sara", phone: "0599123456" },
  });
}

describe("Closing stale pending bookings", () => {
  test("only pending bookings that ended more than 24h ago are closed, and they say so", async () => {
    const biz = await h.makeBusiness("salon-a");
    const stale = await booking(biz, 30);
    const recent = await booking(biz, 2); // the owner still has time to close it by hand
    const confirmed = await booking(biz, 30, "confirmed");
    const upcoming = await booking(biz, -48);

    expect(await closeStalePending()).toBe(1);

    const after = Object.fromEntries((await Appointment.find().lean()).map((a) => [String(a._id), a]));
    expect(after[String(stale._id)]).toMatchObject({ status: "cancelled", cancellation: { auto: true } });
    expect(after[String(recent._id)].status).toBe("pending");
    expect(after[String(confirmed._id)].status).toBe("confirmed");
    expect(after[String(upcoming._id)].status).toBe("pending");
  });

  test("the dashboard closes its own business's stale bookings when it loads", async () => {
    const a = await h.makeBusiness("salon-a");
    const b = await h.makeBusiness("salon-b");
    const mine = await booking(a, 30);
    const theirs = await booking(b, 30);

    await request(h.app)
      .get("/api/appointments/business/stats")
      .set("Authorization", `Bearer ${h.tokenFor(a.owner)}`)
      .expect(200);

    expect((await Appointment.findById(mine._id)).status).toBe("cancelled");
    expect((await Appointment.findById(theirs._id)).status).toBe("pending"); // not its business
  });
});
