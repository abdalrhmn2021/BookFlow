// One server for every sold copy: each client site's proxy says which business it is.
const SECRET = "test-proxy-secret-".padEnd(48, "s");
process.env.SHARED_SERVER = "true";
process.env.SITE_PROXY_SECRET = SECRET;

const request = require("supertest");
const h = require("./helpers");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(async () => {
  delete process.env.SHARED_SERVER;
  delete process.env.SITE_PROXY_SECRET;
  await h.disconnect();
});

// What client/src/proxy.ts adds to every /api request of a site.
const fromSite = (slug, ip = "203.0.113.10") => ({
  "x-bookflow-proxy-secret": SECRET,
  "x-bookflow-site": slug,
  "x-bookflow-client-ip": ip,
});
const auth = (user) => ({ Authorization: `Bearer ${h.tokenFor(user)}` });

const slot = (biz, time, date) => ({
  serviceId: biz.service._id,
  staffId: biz.staff[0]._id,
  date,
  time,
});

describe("Shared server - each site sees only its own business", () => {
  test("the directory lists only the site's business, and nothing for strangers", async () => {
    await h.makeBusiness("salon-a");
    await h.makeBusiness("salon-b");

    const onA = await request(h.app).get("/api/public/businesses").set(fromSite("salon-a")).expect(200);
    expect(onA.body.businesses.map((b) => b.slug)).toEqual(["salon-a"]);

    // Straight to the server, no proxy: no list of the agency's clients.
    const direct = await request(h.app).get("/api/public/businesses").expect(200);
    expect(direct.body.businesses).toEqual([]);

    // Faking the site header without the secret changes nothing.
    const fake = await request(h.app)
      .get("/api/public/businesses")
      .set({ ...fromSite("salon-a"), "x-bookflow-proxy-secret": "wrong" })
      .expect(200);
    expect(fake.body.businesses).toEqual([]);
  });

  test("another business's booking page, slots and booking are 'not found' on this site", async () => {
    await h.makeBusiness("salon-a");
    const B = await h.makeBusiness("salon-b");
    const date = h.nextOpenDate();

    await request(h.app).get("/api/public/businesses/salon-a").set(fromSite("salon-a")).expect(200);
    await request(h.app).get("/api/public/businesses/salon-b").set(fromSite("salon-a")).expect(404);
    await request(h.app)
      .get(
        `/api/public/businesses/salon-b/availability?serviceId=${B.service._id}&staffId=${B.staff[0]._id}&date=${date}`,
      )
      .set(fromSite("salon-a"))
      .expect(404);
    await request(h.app)
      .post("/api/public/businesses/salon-b/appointments")
      .set(fromSite("salon-a"))
      .send({ ...slot(B, "10:00", date), name: "Guest", phone: "0599123456" })
      .expect(404);
  });

  test("a guest's manage link works on its own site only", async () => {
    const A = await h.makeBusiness("salon-a");
    await h.makeBusiness("salon-b");

    const booked = await request(h.app)
      .post("/api/public/businesses/salon-a/appointments")
      .set(fromSite("salon-a"))
      .send({ ...slot(A, "10:00", h.nextOpenDate()), name: "Guest", phone: "0599123456" })
      .expect(201);
    const token = booked.body.manageToken;

    await request(h.app).get(`/api/public/bookings/${token}`).set(fromSite("salon-a")).expect(200);
    await request(h.app).get(`/api/public/bookings/${token}`).set(fromSite("salon-b")).expect(404);
    await request(h.app)
      .patch(`/api/public/bookings/${token}/cancel`)
      .set(fromSite("salon-b"))
      .send({ reason: "Changed my plans today" })
      .expect(404);
  });

  test("nobody can sign up a new business from the web", async () => {
    await request(h.app)
      .post("/api/auth/register-business")
      .set(fromSite("new-salon"))
      .send({ businessName: "New", slug: "new-salon", ownerName: "X", email: "x@test.com", password: "password123" })
      .expect(403);
  });
});

describe("Shared server - owners and staff stay on their own site", () => {
  const login = (user, headers) =>
    request(h.app).post("/api/auth/login").set(headers).send({ email: user.email, password: "password123" });

  test("salon A's owner can log in on A's site, not on B's", async () => {
    const A = await h.makeBusiness("salon-a");
    await h.makeBusiness("salon-b");

    await login(A.owner, fromSite("salon-a", "203.0.113.1")).expect(200);
    const onB = await login(A.owner, fromSite("salon-b", "203.0.113.2")).expect(403);
    expect(onB.body.message).toBe("This account belongs to another business");
    await login(A.staff[0], fromSite("salon-b", "203.0.113.3")).expect(403);
  });

  test("salon A's token doesn't open a dashboard on B's site", async () => {
    const A = await h.makeBusiness("salon-a");
    await h.makeBusiness("salon-b");

    await request(h.app).get("/api/services").set(auth(A.owner)).set(fromSite("salon-a")).expect(200);
    await request(h.app).get("/api/services").set(auth(A.owner)).set(fromSite("salon-b")).expect(403);
    await request(h.app).get("/api/appointments/business").set(auth(A.staff[0])).set(fromSite("salon-b")).expect(403);
  });
});

describe("Shared server - customer accounts", () => {
  test("one account works on both sites, but each site shows and books only its own business", async () => {
    const A = await h.makeBusiness("salon-a");
    const B = await h.makeBusiness("salon-b");
    const customer = await h.makeCustomer("sara");
    const date = h.nextOpenDate();

    const atA = await request(h.app)
      .post("/api/appointments")
      .set(auth(customer))
      .set(fromSite("salon-a"))
      .send({ slug: "salon-a", ...slot(A, "10:00", date) })
      .expect(201);
    await request(h.app)
      .post("/api/appointments")
      .set(auth(customer))
      .set(fromSite("salon-b"))
      .send({ slug: "salon-b", ...slot(B, "11:00", date) })
      .expect(201);

    // Booking salon B from salon A's site is not possible.
    await request(h.app)
      .post("/api/appointments")
      .set(auth(customer))
      .set(fromSite("salon-a"))
      .send({ slug: "salon-b", ...slot(B, "12:00", date) })
      .expect(404);

    const mine = await request(h.app)
      .get("/api/appointments/me")
      .set(auth(customer))
      .set(fromSite("salon-a"))
      .expect(200);
    expect(mine.body.appointments.map((a) => a.tenantId.slug)).toEqual(["salon-a"]);

    // ...and salon A's appointment can't be cancelled from B's site.
    await request(h.app)
      .patch(`/api/appointments/${atA.body.appointment._id}/cancel`)
      .set(auth(customer))
      .set(fromSite("salon-b"))
      .send({ reason: "Changed my plans today" })
      .expect(404);
  });
});

describe("Shared server - rate limits count each visitor, not the proxy", () => {
  test("5 wrong passwords block that visitor only", async () => {
    const A = await h.makeBusiness("salon-a");
    const wrong = (ip) =>
      request(h.app)
        .post("/api/auth/login")
        .set(fromSite("salon-a", ip))
        .send({ email: A.owner.email, password: "nope-nope" });

    for (let i = 0; i < 5; i++) await wrong("198.51.100.7").expect(401);
    await wrong("198.51.100.7").expect(429);

    // Another visitor behind the same Vercel proxy is not affected.
    await wrong("198.51.100.8").expect(401);
  });
});
