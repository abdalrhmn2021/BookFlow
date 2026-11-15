// A-01 (security review): password guessing from many IPs, and two-step login for the superadmin.
// Runs as a shared server, because there the site's proxy tells us the visitor's IP - so each
// request can come "from" a different IP, like an attacker with many proxies.
const SECRET = "test-proxy-secret-".padEnd(48, "s");
process.env.SHARED_SERVER = "true";
process.env.SITE_PROXY_SECRET = SECRET;

const crypto = require("crypto");
const request = require("supertest");
const h = require("./helpers");
const User = require("../src/models/User");
const { generateSecret, codeAt, currentStep, base32Encode } = require("../src/utils/totp");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(async () => {
  delete process.env.SHARED_SERVER;
  delete process.env.SITE_PROXY_SECRET;
  await h.disconnect();
});

const fromSite = (slug, ip) => ({
  "x-bookflow-proxy-secret": SECRET,
  "x-bookflow-site": slug,
  "x-bookflow-client-ip": ip,
});
// A different IP for every call (TEST-NET-2 range).
let ipCounter = 0;
const nextIp = () => `198.51.100.${(ipCounter++ % 250) + 1}`;

const login = (slug, body) => request(h.app).post("/api/auth/login").set(fromSite(slug, nextIp())).send(body);

describe("Wrong passwords are also counted per account, not only per IP", () => {
  test("10 wrong passwords from 10 IPs lock that email for a while; other emails are not affected", async () => {
    const A = await h.makeBusiness("salon-a");

    for (let i = 0; i < 10; i++) {
      await login("salon-a", { email: A.owner.email, password: `wrong-${i}-pass` }).expect(401);
    }
    // An 11th try, from yet another fresh IP: refused, even with the RIGHT password.
    const locked = await login("salon-a", { email: A.owner.email, password: "password123" }).expect(429);
    expect(locked.body.message).toBe("Too many failed attempts on this account, please try again in 15 minutes");

    // Another account on the same site still works normally.
    await login("salon-a", { email: A.staff[0].email, password: "password123" }).expect(200);
  });

  test("the email is counted however it is written (case, spaces)", async () => {
    const A = await h.makeBusiness("salon-b");
    const variants = [A.owner.email.toUpperCase(), ` ${A.owner.email} `];
    for (let i = 0; i < 10; i++) {
      await login("salon-b", { email: variants[i % 2], password: `wrong-${i}-pass` }).expect(401);
    }
    await login("salon-b", { email: A.owner.email, password: "password123" }).expect(429);
  });

  test("an unknown email is limited the same way, so a 429 doesn't reveal who has an account", async () => {
    await h.makeBusiness("salon-c");
    for (let i = 0; i < 10; i++) {
      await login("salon-c", { email: "nobody@nowhere.test", password: `wrong-${i}-pass` }).expect(401);
    }
    await login("salon-c", { email: "nobody@nowhere.test", password: "whatever-1" }).expect(429);
  });

  test("demo accounts are not locked (their password is public; a stranger must not lock the demo)", async () => {
    await h.makeBusiness("salon-d");
    for (let i = 0; i < 12; i++) {
      await login("salon-d", { email: "owner@demo.com", password: `wrong-${i}-pass` }).expect(401);
    }
  });

  test("change password: 10 wrong current passwords (any IPs) lock that account's form", async () => {
    const A = await h.makeBusiness("salon-e");
    const token = h.tokenFor(A.owner);
    const change = (currentPassword) =>
      request(h.app)
        .patch("/api/auth/password")
        .set({ ...fromSite("salon-e", nextIp()), Authorization: `Bearer ${token}` })
        .send({ currentPassword, newPassword: "a-brand-new-pass" });

    for (let i = 0; i < 10; i++) await change(`wrong-${i}-pass`).expect(400);
    await change("password123").expect(429);
  });
});

describe("Two-step login (superadmin)", () => {
  async function makeAdminWithTwoFactor() {
    const secret = generateSecret();
    const admin = await User.create({
      name: "Admin",
      email: "admin@seller.test",
      password: "admin-password-1",
      role: "superadmin",
      twoFactorSecret: secret,
    });
    return { admin, secret };
  }
  const cookieOf = (res) => (res.headers["set-cookie"] || []).find((c) => c.startsWith("bookflow_token="));

  test("the right password alone is not enough: the code is asked for, and no cookie is given", async () => {
    await h.makeBusiness("salon-f");
    await makeAdminWithTwoFactor();

    const res = await login("salon-f", { email: "admin@seller.test", password: "admin-password-1" }).expect(401);
    expect(res.body).toEqual({ message: "Two-factor code required", twoFactorRequired: true });
    expect(cookieOf(res)).toBeUndefined();
  });

  test("a wrong code is refused; the right one logs in; the same code can't be used twice", async () => {
    await h.makeBusiness("salon-g");
    const { secret } = await makeAdminWithTwoFactor();
    const body = { email: "admin@seller.test", password: "admin-password-1" };

    const valid = [-1, 0, 1].map((d) => codeAt(secret, currentStep() + d));
    const wrongCode = ["000000", "111111", "222222", "333333"].find((c) => !valid.includes(c));
    const wrong = await login("salon-g", { ...body, code: wrongCode });
    expect(wrong.status).toBe(401);
    expect(wrong.body.message).toBe("Invalid two-factor code");

    const code = codeAt(secret, currentStep());
    const ok = await login("salon-g", { ...body, code }).expect(200);
    expect(cookieOf(ok)).toBeDefined();
    expect(ok.body.user.role).toBe("superadmin");

    const again = await login("salon-g", { ...body, code }).expect(401);
    expect(again.body.message).toBe("Invalid two-factor code");
  });

  test("a wrong password with a right code is still just 'Invalid credentials'", async () => {
    await h.makeBusiness("salon-h");
    const { secret } = await makeAdminWithTwoFactor();
    const res = await login("salon-h", {
      email: "admin@seller.test",
      password: "not-the-password",
      code: codeAt(secret, currentStep()),
    }).expect(401);
    expect(res.body).toEqual({ message: "Invalid credentials" });
  });

  test("accounts without two-step login are unchanged (no code asked)", async () => {
    const A = await h.makeBusiness("salon-i");
    await login("salon-i", { email: A.owner.email, password: "password123" }).expect(200);
  });

  test("the reset-password link changes the password but does NOT log in past the code", async () => {
    await h.makeBusiness("salon-j");
    const { admin } = await makeAdminWithTwoFactor();
    const token = crypto.randomBytes(32).toString("base64url");
    await User.updateOne(
      { _id: admin._id },
      {
        $set: {
          resetTokenHash: crypto.createHash("sha256").update(token).digest("hex"),
          resetTokenExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
      },
    );

    const res = await request(h.app)
      .post("/api/auth/reset-password")
      .set(fromSite("salon-j", nextIp()))
      .send({ token, password: "a-new-admin-pass" })
      .expect(200);
    expect(res.body).toEqual({ message: "Password changed", twoFactorRequired: true });
    expect(cookieOf(res)).toBeUndefined();

    // The new password works - with the code.
    await login("salon-j", { email: "admin@seller.test", password: "a-new-admin-pass" }).expect(401);
  });
});

describe("TOTP codes (utils/totp.js)", () => {
  test("match the RFC 6238 test vectors (last 6 digits)", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(codeAt(secret, Math.floor(59 / 30))).toBe("287082");
    expect(codeAt(secret, Math.floor(1111111109 / 30))).toBe("081804");
    expect(codeAt(secret, Math.floor(1234567890 / 30))).toBe("005924");
  });
});
