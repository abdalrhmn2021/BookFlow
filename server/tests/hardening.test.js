// Small fixes: the login token in JSON, DNS override, admin counts, reminder reset, name length.
const request = require("supertest");
const h = require("./helpers");
const User = require("../src/models/User");
const Appointment = require("../src/models/Appointment");
const { chooseDnsServers } = require("../src/config/db");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(h.disconnect);

const auth = (user) => ({ Authorization: `Bearer ${h.tokenFor(user)}` });

// Runs fn with these env values, then puts the old ones back.
async function withEnv(values, fn) {
  const old = Object.fromEntries(Object.keys(values).map((k) => [k, process.env[k]]));
  Object.assign(process.env, values);
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(old)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe("Login token in the JSON answer", () => {
  test("production: only the httpOnly cookie, no token in the body", async () => {
    await h.makeCustomer("sara");
    const res = await withEnv({ NODE_ENV: "production" }, () =>
      request(h.app).post("/api/auth/login").send({ email: "sara@customer.test", password: "password123" }).expect(200),
    );
    expect(res.body.token).toBeUndefined();
    expect(res.headers["set-cookie"].join(";")).toMatch(/bookflow_token=.+HttpOnly/i);
  });

  test("production: sign-up doesn't return it either", async () => {
    const res = await withEnv({ NODE_ENV: "production" }, () =>
      request(h.app)
        .post("/api/auth/register")
        .send({ name: "New", email: "new@customer.test", password: "password123" })
        .expect(201),
    );
    expect(res.body.token).toBeUndefined();
    expect(res.headers["set-cookie"].join(";")).toMatch(/bookflow_token=/);
  });

  test("development keeps it for api-tests.http", async () => {
    await h.makeCustomer("sara");
    const res = await request(h.app)
      .post("/api/auth/login")
      .send({ email: "sara@customer.test", password: "password123" })
      .expect(200);
    expect(res.body.token).toEqual(expect.any(String));
  });
});

describe("DNS override", () => {
  test("only when asked, or for a mongodb+srv address outside production", async () => {
    const srv = "mongodb+srv://user:pass@cluster0.example.mongodb.net/app";
    await withEnv({ DNS_SERVERS: "", MONGO_URI: srv, NODE_ENV: "production" }, async () =>
      expect(chooseDnsServers()).toBeNull(),
    );
    await withEnv({ DNS_SERVERS: "", MONGO_URI: srv, NODE_ENV: "development" }, async () =>
      expect(chooseDnsServers()).toEqual(["8.8.8.8", "8.8.4.4"]),
    );
    await withEnv({ DNS_SERVERS: "", MONGO_URI: "mongodb://127.0.0.1:27017/app", NODE_ENV: "development" }, async () =>
      expect(chooseDnsServers()).toBeNull(),
    );
    await withEnv({ DNS_SERVERS: " 1.1.1.1 , 9.9.9.9 ", MONGO_URI: srv, NODE_ENV: "production" }, async () =>
      expect(chooseDnsServers()).toEqual(["1.1.1.1", "9.9.9.9"]),
    );
  });
});

describe("Admin panel counts", () => {
  test("an owner who takes bookings counts as someone customers can book", async () => {
    const biz = await h.makeBusiness("count-a", { staffCount: 1 });
    await User.updateOne({ _id: biz.owner._id }, { bookable: true });
    const admin = await User.create({
      name: "Me",
      email: "admin@seller.test",
      password: "password123",
      role: "superadmin",
    });

    const res = await request(h.app).get("/api/admin/businesses").set(auth(admin)).expect(200);
    expect(res.body.businesses.find((b) => b.slug === "count-a").staffCount).toBe(2);
  });
});

describe("Rescheduling and the automatic reminder", () => {
  test("a moved booking starts its reminder from scratch (sent flag and failed attempts)", async () => {
    const biz = await h.makeBusiness("move-a");
    const date = h.nextOpenDate();
    const created = await request(h.app)
      .post("/api/appointments/business")
      .set(auth(biz.owner))
      .send({ serviceId: biz.service._id, staffId: biz.staff[0]._id, date, time: "10:00", name: "Walk-in" })
      .expect(201);
    const id = created.body.appointment._id;
    await Appointment.updateOne(
      { _id: id },
      { $set: { reminderSentAt: new Date(), reminderChannel: "whatsapp", "autoReminder.attempts": 3 } },
    );

    await request(h.app)
      .patch(`/api/appointments/${id}/reschedule`)
      .set(auth(biz.owner))
      .send({ date, time: "14:00", staffId: biz.staff[0]._id })
      .expect(200);

    const moved = await Appointment.findById(id).lean();
    expect(moved.reminderSentAt).toBeUndefined();
    expect(moved.reminderChannel).toBeUndefined();
    expect(moved.autoReminder).toBeUndefined();
  });
});

describe("Name length", () => {
  test("a 61-character name is refused at sign-up", async () => {
    const res = await request(h.app)
      .post("/api/auth/register")
      .send({ name: "x".repeat(61), email: "long@customer.test", password: "password123" })
      .expect(400);
    expect(res.body.errors).toContain("Name is too long");
  });
});
