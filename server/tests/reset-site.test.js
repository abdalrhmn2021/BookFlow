// Security review L-2: the "forgot password" code only works on a site where the account may sign in.
// Shared server: each client site's proxy says which business it is (middlewares/site.middleware.js).
const SECRET = "test-proxy-secret-".padEnd(48, "s");
process.env.SHARED_SERVER = "true";
process.env.SITE_PROXY_SECRET = SECRET;

const request = require("supertest");
const h = require("./helpers");
const User = require("../src/models/User");
const { setSenderForTests } = require("../src/services/notify.service");

let sent = [];
let visitor = 0;

beforeAll(h.connect);
beforeEach(() => {
  sent = [];
  setSenderForTests(async (message) => {
    sent.push(message);
  });
  process.env.BREVO_API_KEY = "test-key";
  process.env.MAIL_FROM = "accounts@bookflow.test";
});
afterEach(h.clear);
afterAll(async () => {
  setSenderForTests(null);
  delete process.env.BREVO_API_KEY;
  delete process.env.MAIL_FROM;
  delete process.env.SHARED_SERVER;
  delete process.env.SITE_PROXY_SECRET;
  await h.disconnect();
});

// What client/src/proxy.ts adds to every /api request of a site (a new visitor IP each time,
// so the per-IP limits don't get in the way).
const fromSite = (slug) => ({
  "x-bookflow-proxy-secret": SECRET,
  "x-bookflow-site": slug,
  "x-bookflow-client-ip": `10.1.${Math.floor(++visitor / 250)}.${visitor % 250}`,
});

async function waitForEmail() {
  for (let i = 0; i < 50 && !sent.length; i++) await new Promise((r) => setTimeout(r, 20));
  return sent[0];
}
const codeFromEmail = (email) => email.subject.match(/\b(\d{6})\b/)[1];

const reset = (site, email, code, password) =>
  request(h.app).post("/api/auth/reset-password").set(fromSite(site)).send({ email, code, password });

describe("Reset password - only on a site where the account may sign in (review L-2)", () => {
  test("salon A's owner can't use their code on salon B's site, and the code still works on A", async () => {
    const { owner } = await h.makeBusiness("salon-a");
    await h.makeBusiness("salon-b");

    await request(h.app)
      .post("/api/auth/forgot-password")
      .set(fromSite("salon-a"))
      .send({ email: owner.email })
      .expect(200);
    const code = codeFromEmail(await waitForEmail());

    // On salon B's site: refused like a wrong code - no password change, no login cookie.
    const onB = await reset("salon-b", owner.email, code, "newpassword123").expect(400);
    expect(onB.headers["set-cookie"]?.some((c) => c.startsWith("bookflow_token="))).toBeFalsy();

    const afterB = await User.findById(owner._id).select("+password +resetAttempts");
    expect(await afterB.comparePassword("password123")).toBe(true);
    // The refused try on B didn't use up one of the code's tries.
    expect(afterB.resetAttempts).toBe(0);

    // On the owner's own site the same code works.
    const onA = await reset("salon-a", owner.email, code, "newpassword123").expect(200);
    expect(onA.headers["set-cookie"].some((c) => c.startsWith("bookflow_token="))).toBe(true);
    const afterA = await User.findById(owner._id).select("+password");
    expect(await afterA.comparePassword("newpassword123")).toBe(true);
  });
});
