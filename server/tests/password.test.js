const request = require("supertest");
const h = require("./helpers");
const User = require("../src/models/User");
const { setSenderForTests } = require("../src/services/notify.service");
const { IP_HEADER, SECRET_HEADER } = require("../src/utils/clientIp");

// Each request comes from a different visitor (see utils/clientIp), so the failed attempts
// these tests make on purpose don't add up against the login rate limit.
const PROXY = "p".repeat(64);
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
  process.env.PROXY_SECRET = PROXY;
});
afterEach(h.clear);
afterAll(async () => {
  setSenderForTests(null);
  delete process.env.BREVO_API_KEY;
  delete process.env.MAIL_FROM;
  delete process.env.PROXY_SECRET;
  await h.disconnect();
});

const login = (email, password) => call("post", "/api/auth/login").send({ email, password });
const cookieOf = (res) => res.headers["set-cookie"].find((c) => c.startsWith("bookflow_token="));

async function waitForEmail() {
  for (let i = 0; i < 50 && !sent.length; i++) await new Promise((r) => setTimeout(r, 20));
  return sent[0];
}

const tokenFromEmail = (email) => email.htmlContent.match(/reset-password\/([A-Za-z0-9_-]{43})/)[1];

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

describe("Forgot password", () => {
  test("the same answer for a known and an unknown email, and only the known one gets an email", async () => {
    const user = await h.makeCustomer("sara");

    const unknown = await call("post", "/api/auth/forgot-password").send({ email: "nobody@nowhere.test" }).expect(200);
    await new Promise((r) => setTimeout(r, 100));
    expect(sent).toHaveLength(0);

    const known = await call("post", "/api/auth/forgot-password").send({ email: user.email }).expect(200);
    expect(known.body).toEqual(unknown.body);

    const email = await waitForEmail();
    expect(email.to[0].email).toBe(user.email);
    expect(email.htmlContent).toContain("https://laila.example/reset-password/");

    const saved = await User.findById(user._id).select("+resetTokenHash");
    expect(saved.resetTokenHash).toHaveLength(64); // only the hash is stored
    expect(email.htmlContent).not.toContain(saved.resetTokenHash);
  });

  test("the link sets a new password once, logs the user in, and signs out old sessions", async () => {
    const user = await h.makeCustomer("maya");
    const oldSession = cookieOf(await login(user.email, "password123").expect(200));
    await new Promise((r) => setTimeout(r, 1100));

    await call("post", "/api/auth/forgot-password").send({ email: user.email }).expect(200);
    const token = tokenFromEmail(await waitForEmail());

    const reset = await call("post", "/api/auth/reset-password").send({ token, password: "brandnew789" }).expect(200);
    expect(reset.body.user.email).toBe(user.email);
    await call("get", "/api/auth/me").set("Cookie", cookieOf(reset)).expect(200);
    await call("get", "/api/auth/me").set("Cookie", oldSession).expect(401);

    await login(user.email, "brandnew789").expect(200);
    // Used once -> dead.
    await call("post", "/api/auth/reset-password").send({ token, password: "another123" }).expect(400);
  });

  test("an expired or made-up link is rejected", async () => {
    const user = await h.makeCustomer("khaled");
    await call("post", "/api/auth/forgot-password").send({ email: user.email }).expect(200);
    const token = tokenFromEmail(await waitForEmail());

    await User.updateOne({ _id: user._id }, { resetTokenExpiresAt: new Date(Date.now() - 1000) });
    await call("post", "/api/auth/reset-password").send({ token, password: "brandnew789" }).expect(400);

    await call("post", "/api/auth/reset-password")
      .send({ token: "x".repeat(43), password: "brandnew789" })
      .expect(400);
    await call("post", "/api/auth/reset-password")
      .send({ token: { $ne: null }, password: "brandnew789" })
      .expect(400);
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
