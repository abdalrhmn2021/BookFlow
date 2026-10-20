const request = require("supertest");
const h = require("./helpers");
const Tenant = require("../src/models/Tenant");
const User = require("../src/models/User");
const Appointment = require("../src/models/Appointment");
const { DEMOS, DEMO_PASSWORD, refreshDemos } = require("../src/demo/demoData");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(h.disconnect);

const login = (email) => request(h.app).post("/api/auth/login").send({ email, password: DEMO_PASSWORD });

describe("Demo data", () => {
  test("builds every demo with working accounts and appointments", async () => {
    expect(await refreshDemos()).toEqual(DEMOS.map((d) => d.slug));

    for (const demo of DEMOS) {
      const tenant = await Tenant.findOne({ slug: demo.slug });
      expect(await Appointment.countDocuments({ tenantId: tenant._id })).toBeGreaterThan(20);
      await login(demo.owner.email).expect(200);
    }
    // the client-edition demo buttons log in as <role>@<slug>.demo
    for (const role of ["owner", "staff", "customer"]) await login(`${role}@al-ward.demo`).expect(200);
  });

  test("leaves fresh demos alone and rebuilds out-of-date ones", async () => {
    await refreshDemos();
    expect(await refreshDemos()).toEqual([]);

    // al-ward was built yesterday, and a visitor booked there since
    const yesterday = new Date(Date.now() - 36 * 60 * 60 * 1000);
    await Tenant.collection.updateOne({ slug: "al-ward" }, { $set: { createdAt: yesterday } });
    const tenant = await Tenant.findOne({ slug: "al-ward" });
    const extraStaff = await User.create({
      name: "Visitor staff",
      email: "visitor@test.com",
      password: "password123",
      role: "staff",
      tenantId: tenant._id,
    });

    expect(await refreshDemos()).toEqual(["al-ward"]);
    expect(await User.exists({ _id: extraStaff._id })).toBeNull();
    expect(await Tenant.countDocuments({ slug: "al-ward" })).toBe(1);
  });

  test("never touches other businesses", async () => {
    const { tenant } = await h.makeBusiness("real-salon");
    await refreshDemos({ force: true });
    expect(await Tenant.exists({ _id: tenant._id })).not.toBeNull();
    expect(await User.countDocuments({ tenantId: tenant._id })).toBe(2);
  });
});
