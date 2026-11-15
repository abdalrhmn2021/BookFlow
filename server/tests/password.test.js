// Set before the app loads: the site middleware reads it once at start-up.
const PROXY = "p".repeat(64);
process.env.SITE_PROXY_SECRET = PROXY;

const request = require("supertest");
const h = require("./helpers");
const User = require("../src/models/User");
const { setSenderForTests } = require("../src/services/notify.service");
const { HEADERS } = require("../src/middlewares/site.middleware");
const { CLIENT_IP_HEADER: IP_HEADER, SECRET_HEADER } = HEADERS;

// Each request comes from a different visitor (see middlewares/site.middleware.js), so the
// failed attempts these tests make on purpose don't add up against the login rate limit.
let visitor = 0;
const call = (method, url) =>
  request(h.app)
    [method](url)
    .set(IP_HEADER, `10.0.${Math.floor(++visitor / 250)}.${visitor % 250}`)
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
  process.env.CLIENT_URL = "https://laila.example";
});
afterEach(h.clear);
afterAll(async () => {
  setSenderForTests(null);
  delete process.env.BREVO_API_KEY;
  delete process.env.MAIL_FROM;
  delete process.env.SITE_PROXY_SECRET;
  await h.disconnect();
});

const login = (email, password) => call("post", "/api/auth/login").send({ email, password });
const cookieOf = (res) => res.headers["set-cookie"].find((c) => c.startsWith("bookflow_token="));

async function waitForEmail() {
  for (let i = 0; i < 50 && !sent.length; i++) await new Promise((r) => setTimeout(r, 20));
  return sent[0];
}

// The 6-digit code is in the subject (and big in the body).
const codeFromEmail = (email) => email.subject.match(/\b(\d{6})\b/)[1];
const reset = (email, code, password) => call("post", "/api/auth/reset-password").send({ email, code, password });

describe("Change password (logged in)", () => {
  test("needs the right current password, then signs out other devices", async () => {
    const user = await h.makeCustomer("lina");
    const otherDevice = await login(user.email, "password123").expect(200);

    // JWTs count in seconds: make sure the change happens in a later second than the old login.
    await new Promise((r) => setTimeout(r, 1100));

    const thisDevice = cookieOf(otherDevice);
    await call("patch", "/api/auth/password")
      .set("Cookie", thisDevice)
      .send({ currentPassword: "wrong-password", newPassword: "newpass456" })
      .expect(400);

    const changed = await call("patch", "/api/auth/password")
      .set("Cookie", thisDevice)
      .send({ currentPassword: "password123", newPassword: "newpass456" })
      .expect(200);

    // The old session is over, the fresh cookie works.
    await call("get", "/api/auth/me").set("Cookie", thisDevice).expect(401);
    await call("get", "/api/auth/me").set("Cookie", cookieOf(changed)).expect(200);

    await login(user.email, "password123").expect(401);
    await login(user.email, "newpass456").expect(200);
  });

  test("rejects a short or unchanged new password", async () => {
    const user = await h.makeCustomer("omar");
    const auth = `Bearer ${h.tokenFor(user)}`;
    await call("patch", "/api/auth/password")
      .set("Authorization", auth)
      .send({ currentPassword: "password123", newPassword: "short" })
      .expect(400);
    await call("patch", "/api/auth/password")
      .set("Authorization", auth)
      .send({ currentPassword: "password123", newPassword: "password123" })
      .expect(400);
  });

  test("demo accounts can't change their password", async () => {
    const demo = await User.create({
      name: "Demo",
      email: "customer@demo.com",
      password: "password123",
      role: "customer",
    });
    await call("patch", "/api/auth/password")
      .set("Authorization", `Bearer ${h.tokenFor(demo)}`)
      .send({ currentPassword: "password123", newPassword: "hacked123" })
      .expect(403);
  });
});

describe("Forgot password (6-digit code by email)", () => {
  test("the same answer for a known and an unknown email, and only the known one gets an email", async () => {
    const user = await h.makeCustomer("sara");

    const unknown = await call("post", "/api/auth/forgot-password").send({ email: "nobody@nowhere.test" }).expect(200);
    await new Promise((r) => setTimeout(r, 100));
    expect(sent).toHaveLength(0);

    const known = await call("post", "/api/auth/forgot-password").send({ email: user.email }).expect(200);
    expect(known.body).toEqual(unknown.body);

    const email = await waitForEmail();
    expect(email.to[0].email).toBe(user.email);
    const code = codeFromEmail(email);
    expect(email.htmlContent).toContain(code);
    expect(email.htmlContent).not.toContain("reset-password/"); // no link any more

    const saved = await User.findById(user._id).select("+resetTokenHash +resetAttempts");
    expect(saved.resetTokenHash).toHaveLength(64); // only an HMAC is stored, never the code
    expect(saved.resetTokenHash).not.toContain(code);
    expect(saved.resetAttempts).toBe(0);
  });

  test("the code sets a new password once, logs the user in, and signs out old sessions", async () => {
    const user = await h.makeCustomer("maya");
    const oldSession = cookieOf(await login(user.email, "password123").expect(200));
    await new Promise((r) => setTimeout(r, 1100));

    await call("post", "/api/auth/forgot-password").send({ email: user.email }).expect(200);
    const code = codeFromEmail(await waitForEmail());

    const res = await reset(` ${user.email.toUpperCase()} `, code, "brandnew789").expect(200);
    expect(res.body.user.email).toBe(user.email);
    await call("get", "/api/auth/me").set("Cookie", cookieOf(res)).expect(200);
    await call("get", "/api/auth/me").set("Cookie", oldSession).expect(401);

    await login(user.email, "brandnew789").expect(200);
    // Used once -> dead.
    await reset(user.email, code, "another123").expect(400);
  });

  test("5 wrong codes kill the code - even the right one is refused after that", async () => {
    const user = await h.makeCustomer("nour");
    await call("post", "/api/auth/forgot-password").send({ email: user.email }).expect(200);
    const code = codeFromEmail(await waitForEmail());
    const wrong = code === "000000" ? "111111" : "000000";

    for (let i = 0; i < 5; i++) {
      const res = await reset(user.email, wrong, "brandnew789").expect(400);
      expect(res.body.message).toBe("This code is wrong or has expired");
    }
    await reset(user.email, code, "brandnew789").expect(400);
    await login(user.email, "password123").expect(200); // nothing changed
  });

  test("parallel guesses can't get more than 5 tries", async () => {
    const user = await h.makeCustomer("hala");
    await call("post", "/api/auth/forgot-password").send({ email: user.email }).expect(200);
    const code = codeFromEmail(await waitForEmail());
    const wrong = code === "000000" ? "111111" : "000000";

    await Promise.all(Array.from({ length: 12 }, () => reset(user.email, wrong, "brandnew789")));
    const saved = await User.findById(user._id).select("+resetAttempts");
    expect(saved.resetAttempts).toBe(5);
    await reset(user.email, code, "brandnew789").expect(400);
  });

  test("a too-short new password doesn't use up a try", async () => {
    const user = await h.makeCustomer("rami");
    await call("post", "/api/auth/forgot-password").send({ email: user.email }).expect(200);
    const code = codeFromEmail(await waitForEmail());

    await reset(user.email, code, "short").expect(400);
    const saved = await User.findById(user._id).select("+resetAttempts");
    expect(saved.resetAttempts).toBe(0);
    await reset(user.email, code, "long-enough-1").expect(200);
  });

  test("an expired, made-up or malformed code is rejected", async () => {
    const user = await h.makeCustomer("khaled");
    await call("post", "/api/auth/forgot-password").send({ email: user.email }).expect(200);
    const code = codeFromEmail(await waitForEmail());

    await User.updateOne({ _id: user._id }, { resetTokenExpiresAt: new Date(Date.now() - 1000) });
    await reset(user.email, code, "brandnew789").expect(400);

    await reset(user.email, "12345", "brandnew789").expect(400);
    await reset(user.email, "abcdef", "brandnew789").expect(400);
    await call("post", "/api/auth/reset-password")
      .send({ email: user.email, code: { $ne: null }, password: "brandnew789" })
      .expect(400);
    // The right code for another email does nothing.
    const other = await h.makeCustomer("lina");
    await reset(other.email, code, "brandnew789").expect(400);
  });

  test("changing the password while logged in kills a waiting code", async () => {
    const user = await h.makeCustomer("omar");
    await call("post", "/api/auth/forgot-password").send({ email: user.email }).expect(200);
    const code = codeFromEmail(await waitForEmail());

    await call("patch", "/api/auth/password")
      .set("Authorization", `Bearer ${h.tokenFor(user)}`)
      .send({ currentPassword: "password123", newPassword: "changed-123" })
      .expect(200);
    await reset(user.email, code, "brandnew789").expect(400);
  });

  test("no more than 3 codes an hour for one email, from any IP", async () => {
    const user = await h.makeCustomer("dana");
    for (let i = 0; i < 3; i++) {
      await call("post", "/api/auth/forgot-password").send({ email: user.email }).expect(200);
    }
    const res = await call("post", "/api/auth/forgot-password").send({ email: user.email }).expect(429);
    expect(res.body.message).toBe("Too many codes requested for this email, please try again in an hour");
  });

  test("no email for demo accounts, and a clear 503 when email isn't set up", async () => {
    await User.create({ name: "Demo", email: "owner@demo.com", password: "password123", role: "customer" });
    await call("post", "/api/auth/forgot-password").send({ email: "owner@demo.com" }).expect(200);
    await new Promise((r) => setTimeout(r, 100));
    expect(sent).toHaveLength(0);

    delete process.env.BREVO_API_KEY;
    await call("post", "/api/auth/forgot-password").send({ email: "anyone@test.com" }).expect(503);
  });
});
