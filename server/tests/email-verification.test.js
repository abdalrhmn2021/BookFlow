// Security review M-01 (email verification) and M-02 (safe settings without NODE_ENV).
// Set before the app loads: each request below comes from its own visitor IP, so the sign-ups and
// wrong codes these tests make on purpose don't add up against the rate limits.
const PROXY = "v".repeat(64);
process.env.SITE_PROXY_SECRET = PROXY;

const request = require("supertest");
const h = require("./helpers");
const User = require("../src/models/User");
const Tenant = require("../src/models/Tenant");
const { setSenderForTests } = require("../src/services/notify.service");
const { removeStaleUnverified } = require("../src/services/emailVerification.service");
const { HEADERS } = require("../src/middlewares/site.middleware");
const { CLIENT_IP_HEADER: IP_HEADER, SECRET_HEADER } = HEADERS;

let visitor = 0;
const call = (method, url) =>
  request(h.app)
    [method](url)
    .set(IP_HEADER, `10.9.${Math.floor(++visitor / 250)}.${visitor % 250}`)
    .set(SECRET_HEADER, PROXY);

let sent = [];

beforeAll(h.connect);
beforeEach(() => {
  sent = [];
  setSenderForTests(async (message) => {
    sent.push(message);
  });
  process.env.BREVO_API_KEY = "test-key";
  process.env.MAIL_FROM = "accounts@bookflow.test";
});
afterEach(async () => {
  delete process.env.EMAIL_VERIFICATION;
  await h.clear();
});
afterAll(async () => {
  setSenderForTests(null);
  delete process.env.BREVO_API_KEY;
  delete process.env.MAIL_FROM;
  delete process.env.SITE_PROXY_SECRET;
  await h.disconnect();
});

async function waitForEmails(n = 1) {
  for (let i = 0; i < 50 && sent.length < n; i++) await new Promise((r) => setTimeout(r, 20));
  return sent[n - 1];
}
const codeFromEmail = (email) => email.subject.match(/\b(\d{6})\b/)[1];
const cookieOf = (res) => (res.headers["set-cookie"] || []).find((c) => c.startsWith("bookflow_token="));
const wrongCode = (code) => String((Number(code) + 1) % 1_000_000).padStart(6, "0");

const signUp = (email = "maya@customer.test") =>
  call("post", "/api/auth/register").send({ name: "Maya", email, password: "password123" });
const login = (email = "maya@customer.test", password = "password123") =>
  call("post", "/api/auth/login").send({ email, password });
const verify = (email, code) => call("post", "/api/auth/verify-email").send({ email, code });

describe("Customer sign-up with email verification", () => {
  test("no login until the emailed code is typed, then logged in", async () => {
    const res = await signUp().expect(201);
    expect(res.body).toEqual({ verificationRequired: true, email: "maya@customer.test" });
    expect(cookieOf(res)).toBeUndefined();

    const email = await waitForEmails();
    expect(email.to[0].email).toBe("maya@customer.test");
    const code = codeFromEmail(email);

    // Login with the right password still asks for the code (and doesn't send another one).
    const blocked = await login().expect(403);
    expect(blocked.body.verificationRequired).toBe(true);
    expect(cookieOf(blocked)).toBeUndefined();
    await new Promise((r) => setTimeout(r, 50));
    expect(sent).toHaveLength(1);

    await verify("maya@customer.test", wrongCode(code)).expect(400);
    const ok = await verify("Maya@Customer.test ", code).expect(200);
    expect(ok.body.user.role).toBe("customer");
    await call("get", "/api/auth/me").set("Cookie", cookieOf(ok)).expect(200);

    // Used once: the same code doesn't work again, and login now works normally.
    await verify("maya@customer.test", code).expect(400);
    await login().expect(200);
    const user = await User.findOne({ email: "maya@customer.test" });
    expect(user.emailVerified).toBe(true);
  });

  test("an unverified account's token is refused anyway", async () => {
    await signUp().expect(201);
    const user = await User.findOne({ email: "maya@customer.test" });
    await call("get", "/api/auth/me")
      .set("Authorization", `Bearer ${h.tokenFor(user)}`)
      .expect(403);
  });

  test("a code dies after 5 wrong tries", async () => {
    await signUp().expect(201);
    const code = codeFromEmail(await waitForEmails());
    for (let i = 0; i < 5; i++) await verify("maya@customer.test", wrongCode(code)).expect(400);
    await verify("maya@customer.test", code).expect(400);
  });

  test("a new code replaces the old one; same answer for an unknown email", async () => {
    await signUp().expect(201);
    const first = codeFromEmail(await waitForEmails(1));

    const again = await call("post", "/api/auth/resend-verification").send({ email: "maya@customer.test" }).expect(200);
    const second = codeFromEmail(await waitForEmails(2));
    const unknown = await call("post", "/api/auth/resend-verification").send({ email: "nobody@x.test" }).expect(200);
    expect(unknown.body.message).toBe(again.body.message);
    await new Promise((r) => setTimeout(r, 50));
    expect(sent).toHaveLength(2);

    if (first !== second) await verify("maya@customer.test", first).expect(400);
    await verify("maya@customer.test", second).expect(200);
  });

  test("an expired, never-confirmed sign-up doesn't keep the email from its real owner", async () => {
    await signUp().expect(201);
    // Still valid: the email is taken for now.
    await signUp().expect(409);

    await User.updateOne({ email: "maya@customer.test" }, { $set: { verifyExpiresAt: new Date(Date.now() - 1000) } });
    await signUp().expect(201);
    expect(await User.countDocuments({ email: "maya@customer.test" })).toBe(1);
  });

  test("a password-reset code also proves the email", async () => {
    await signUp().expect(201);
    await waitForEmails(1);
    await call("post", "/api/auth/forgot-password").send({ email: "maya@customer.test" }).expect(200);
    const resetCode = codeFromEmail(await waitForEmails(2));
    await call("post", "/api/auth/reset-password")
      .send({ email: "maya@customer.test", code: resetCode, password: "newpass456" })
      .expect(200);
    await login("maya@customer.test", "newpass456").expect(200);
  });

  test("off without email (nothing could deliver a code) or with EMAIL_VERIFICATION=off", async () => {
    process.env.EMAIL_VERIFICATION = "off";
    const res = await signUp().expect(201);
    expect(cookieOf(res)).toBeDefined();
    expect(res.body.verificationRequired).toBeUndefined();

    delete process.env.EMAIL_VERIFICATION;
    delete process.env.BREVO_API_KEY;
    const res2 = await signUp("other@customer.test").expect(201);
    expect(cookieOf(res2)).toBeDefined();
  });

  test("an account left unverified is let in once email is turned off", async () => {
    await signUp().expect(201);
    delete process.env.BREVO_API_KEY;
    await login().expect(200);
  });
});

describe("Business sign-up with email verification", () => {
  const registerBusiness = (slug = "rose-salon", email = "owner@rose.test") =>
    call("post", "/api/auth/register-business").send({
      businessName: "Rose Salon",
      slug,
      ownerName: "Rana",
      email,
      password: "password123",
    });

  test("the business stays hidden until the owner confirms their email", async () => {
    const res = await registerBusiness().expect(201);
    expect(res.body.verificationRequired).toBe(true);
    expect(cookieOf(res)).toBeUndefined();

    await call("get", "/api/public/businesses/rose-salon").expect(404);
    const listed = await call("get", "/api/public/businesses").expect(200);
    expect(listed.body.businesses.map((b) => b.slug)).not.toContain("rose-salon");

    const code = codeFromEmail(await waitForEmails());
    const ok = await verify("owner@rose.test", code).expect(200);
    expect(ok.body.user.role).toBe("owner");

    await call("get", "/api/public/businesses/rose-salon").expect(200);
    await call("get", "/api/tenants/me").set("Cookie", cookieOf(ok)).expect(200);
    const tenant = await Tenant.findOne({ slug: "rose-salon" });
    expect(tenant.isActive).toBe(true);
    expect(tenant.pendingVerification).toBeUndefined();
  });

  test("an expired, never-confirmed business doesn't keep its link", async () => {
    await registerBusiness().expect(201);
    await registerBusiness("rose-salon", "someone@else.test").expect(409);

    await User.updateOne({ email: "owner@rose.test" }, { $set: { verifyExpiresAt: new Date(Date.now() - 1000) } });
    await registerBusiness("rose-salon", "someone@else.test").expect(201);
    expect(await Tenant.countDocuments({ slug: "rose-salon" })).toBe(1);
    expect(await User.exists({ email: "owner@rose.test" })).toBeNull();
  });

  test("sign-ups never confirmed are cleaned up after a week", async () => {
    await registerBusiness().expect(201);
    await signUp().expect(201);
    expect(await removeStaleUnverified()).toBe(0);

    const later = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    expect(await removeStaleUnverified({ now: later })).toBe(2);
    expect(await Tenant.countDocuments({})).toBe(0);
    expect(await User.countDocuments({})).toBe(0);
  });
});

describe("Safe settings when NODE_ENV is missing (security review M-02)", () => {
  test("no token in the answer and an HTTPS-only cookie", async () => {
    process.env.EMAIL_VERIFICATION = "off";
    await h.makeCustomer("sara");
    const saved = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    try {
      const res = await login("sara@customer.test").expect(200);
      expect(res.body.token).toBeUndefined();
      expect(cookieOf(res)).toMatch(/;\s*Secure/i);
    } finally {
      process.env.NODE_ENV = saved;
    }
  });
});
