// Security review M-2: someone typing wrong passwords with your email must not lock YOU out.
// The per-email limits (10 wrong logins / 3 reset codes per hour, from any IP) still stop a
// password-guessing botnet - but a browser that already logged in to the account (the
// "known device" cookie, utils/deviceCookie.js) isn't blocked by them.
// Each request comes from its own IP (through the site proxy headers), like an attacker with
// many proxies, so the per-IP limits don't hide what is tested here.
const SECRET = "known-device-proxy-secret-".padEnd(48, "k");
process.env.SITE_PROXY_SECRET = SECRET;

const request = require("supertest");
const h = require("./helpers");
const { setSenderForTests } = require("../src/services/notify.service");
const { DEVICE_COOKIE_NAME } = require("../src/utils/deviceCookie");

beforeAll(h.connect);
afterEach(async () => {
  setSenderForTests(null);
  delete process.env.BREVO_API_KEY;
  delete process.env.MAIL_FROM;
  await h.clear();
});
afterAll(async () => {
  delete process.env.SITE_PROXY_SECRET;
  await h.disconnect();
});

let ipCounter = 0;
const nextIp = () => `203.0.113.${(ipCounter++ % 250) + 1}`;
const post = (url, body, cookie) => {
  const req = request(h.app).post(url).set({ "x-bookflow-proxy-secret": SECRET, "x-bookflow-client-ip": nextIp() });
  if (cookie) req.set("Cookie", cookie);
  return req.send(body);
};
const login = (body, cookie) => post("/api/auth/login", body, cookie);
const deviceCookieOf = (res) => (res.headers["set-cookie"] || []).find((c) => c.startsWith(`${DEVICE_COOKIE_NAME}=`));
const cookiePair = (setCookie) => setCookie.split(";")[0];

async function lockOut(email) {
  for (let i = 0; i < 10; i++) await login({ email, password: `wrong-${i}-pass` }).expect(401);
}

describe("Known device", () => {
  test("a successful login sets the device cookie: httpOnly, SameSite=Lax, only for /api/auth", async () => {
    const customer = await h.makeCustomer("lina");
    const res = await login({ email: customer.email, password: "password123" }).expect(200);
    const cookie = deviceCookieOf(res);
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/api\/auth/i);
    // It doesn't show the email.
    expect(cookie).not.toContain("lina");
  });

  test("a wrong password sets no device cookie", async () => {
    const customer = await h.makeCustomer("omar");
    const res = await login({ email: customer.email, password: "wrong-password" }).expect(401);
    expect(deviceCookieOf(res)).toBeUndefined();
  });

  test("while someone locks the account, its owner still logs in from their own browser", async () => {
    const customer = await h.makeCustomer("sara");
    const device = cookiePair(deviceCookieOf(await login({ email: customer.email, password: "password123" })));

    await lockOut(customer.email);

    // A new browser (the attacker's, or a new phone): still locked, even with the right password.
    await login({ email: customer.email, password: "password123" }).expect(429);
    // The owner's browser: in.
    const res = await login({ email: customer.email, password: "password123" }, device).expect(200);
    expect(res.body.user.email).toBe(customer.email);
  });

  test("the cookie never logs anyone in: a wrong password from a known device is still refused", async () => {
    const customer = await h.makeCustomer("noor");
    const device = cookiePair(deviceCookieOf(await login({ email: customer.email, password: "password123" })));
    await lockOut(customer.email);
    await login({ email: customer.email, password: "not-the-password" }, device).expect(401);
  });

  test("a made-up or edited cookie, or one from another account, doesn't help", async () => {
    const victim = await h.makeCustomer("maya");
    const other = await h.makeCustomer("attacker");
    const otherDevice = cookiePair(deviceCookieOf(await login({ email: other.email, password: "password123" })));
    const real = cookiePair(deviceCookieOf(await login({ email: victim.email, password: "password123" })));
    const edited = real.slice(0, -1) + (real.endsWith("A") ? "B" : "A");

    await lockOut(victim.email);

    for (const cookie of [`${DEVICE_COOKIE_NAME}=abc.9999999999.def`, edited, otherDevice]) {
      await login({ email: victim.email, password: "password123" }, cookie).expect(429);
    }
  });

  test("one browser remembers several accounts", async () => {
    const [a, b] = [await h.makeCustomer("first"), await h.makeCustomer("second")];
    const afterA = cookiePair(deviceCookieOf(await login({ email: a.email, password: "password123" })));
    const both = cookiePair(deviceCookieOf(await login({ email: b.email, password: "password123" }, afterA)));

    await lockOut(a.email);
    await lockOut(b.email);
    await login({ email: a.email, password: "password123" }, both).expect(200);
    await login({ email: b.email, password: "password123" }, both).expect(200);
  });

  test("'forgot password': 3 codes an hour per email, but not for the account's own browser", async () => {
    const sent = [];
    setSenderForTests(async (message) => sent.push(message));
    process.env.BREVO_API_KEY = "test-key";
    process.env.MAIL_FROM = "accounts@bookflow.test";

    const customer = await h.makeCustomer("rami");
    const device = cookiePair(deviceCookieOf(await login({ email: customer.email, password: "password123" })));

    for (let i = 0; i < 3; i++) await post("/api/auth/forgot-password", { email: customer.email }).expect(200);
    await post("/api/auth/forgot-password", { email: customer.email }).expect(429);
    await post("/api/auth/forgot-password", { email: customer.email }, device).expect(200);
  });
});
