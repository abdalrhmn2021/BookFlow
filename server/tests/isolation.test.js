// ============================================================
// اختبارات العزل (multi-tenancy): بزنس ما بيشوف داتا بزنس ثاني،
// زبون ما بيلمس موعد زبون ثاني، وموظف بيشوف مواعيده بس
// ============================================================
const request = require("supertest");
const h = require("./helpers");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(h.disconnect);

const auth = (user) => ({ Authorization: `Bearer ${h.tokenFor(user)}` });

async function bookAt(customer, biz, staffIndex, time, date) {
  const res = await request(h.app)
    .post("/api/appointments")
    .set(auth(customer))
    .send({
      slug: biz.tenant.slug,
      serviceId: biz.service._id,
      staffId: biz.staff[staffIndex]._id,
      date,
      time,
    });
  expect(res.status).toBe(201);
  return res.body.appointment;
}

describe("Tenant isolation", () => {
  test("owner of business B gets 404 (not 403) on business A's appointment", async () => {
    const [A, B] = [await h.makeBusiness("salon-a"), await h.makeBusiness("salon-b")];
    const customer = await h.makeCustomer("ahmad");
    const appt = await bookAt(customer, A, 0, "10:00", h.nextOpenDate());

    // 404: ما بنأكد حتى إنه الموعد موجود (حماية من IDOR)
    await request(h.app)
      .patch(`/api/appointments/${appt._id}/status`)
      .set(auth(B.owner))
      .send({ status: "confirmed" })
      .expect(404);
  });

  test("business B's daily schedule never contains business A's appointments", async () => {
    const [A, B] = [await h.makeBusiness("salon-a"), await h.makeBusiness("salon-b")];
    const date = h.nextOpenDate();
    await bookAt(await h.makeCustomer("ahmad"), A, 0, "10:00", date);

    const res = await request(h.app)
      .get(`/api/appointments/business?date=${date}`)
      .set(auth(B.owner))
      .expect(200);
    expect(res.body.count).toBe(0);
  });

  test("a customer cannot cancel another customer's appointment (404)", async () => {
    const A = await h.makeBusiness("salon-a");
    const [ahmad, sara] = [await h.makeCustomer("ahmad"), await h.makeCustomer("sara")];
    const appt = await bookAt(ahmad, A, 0, "10:00", h.nextOpenDate());

    await request(h.app)
      .patch(`/api/appointments/${appt._id}/cancel`)
      .set(auth(sara))
      .send({ reason: "trying to cancel someone else's booking" })
      .expect(404);
  });

  test("a staff member sees only HIS appointments, the owner sees all", async () => {
    const A = await h.makeBusiness("salon-a", { staffCount: 2 });
    const date = h.nextOpenDate();
    await bookAt(await h.makeCustomer("ahmad"), A, 0, "10:00", date); // عند الموظف 1
    await bookAt(await h.makeCustomer("sara"), A, 1, "10:00", date); //  عند الموظف 2

    const asStaff = await request(h.app)
      .get(`/api/appointments/business?date=${date}`)
      .set(auth(A.staff[0]))
      .expect(200);
    expect(asStaff.body.count).toBe(1);

    const asOwner = await request(h.app)
      .get(`/api/appointments/business?date=${date}`)
      .set(auth(A.owner))
      .expect(200);
    expect(asOwner.body.count).toBe(2);
  });

  test("a customer cannot open business routes (403)", async () => {
    await h.makeBusiness("salon-a");
    const customer = await h.makeCustomer("ahmad");
    await request(h.app).get("/api/appointments/business").set(auth(customer)).expect(403);
  });
});
