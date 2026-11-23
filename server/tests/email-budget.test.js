// Security review H-2: one IP must not be able to use up the server's emails for the day.
//   - a daily email budget for the whole server (EMAIL_DAILY_BUDGET), with the last part
//     (EMAIL_ACCOUNT_RESERVE) kept for sign-up / password codes: "new booking" emails stop first;
//   - the routes that exist to send an email answer 503 when the budget is used up;
//   - with TURNSTILE_SECRET_KEY set, those routes need a Turnstile token.
// Each request comes from its own visitor IP (through the site proxy headers), so the per-IP
// rate limits don't get in the way of what is tested here.
const PROXY = "e".repeat(64);
process.env.SITE_PROXY_SECRET = PROXY;

const request = require("supertest");
const h = require("./helpers");
const User = require("../src/models/User");
const Tenant = require("../src/models/Tenant");
const { setSenderForTests, takeEmailSlot } = require("../src/services/notify.service");
const { setTurnstileVerifierForTests } = require("../src/utils/turnstile");
const { HEADERS } = require("../src/middlewares/site.middleware");
const { CLIENT_IP_HEADER: IP_HEADER, SECRET_HEADER } = HEADERS;

let visitor = 0;
const call = (method, url) =>
  request(h.app)
    [method](url)
    .set(IP_HEADER, `10.7.${Math.floor(++visitor / 250)}.${visitor % 250}`)
    .set(SECRET_HEADER, PROXY);

let sent = [];

beforeAll(h.connect);
beforeEach(() => {
  sent = [];
  setSenderForTests(async (message) => {
    sent.push(message);
  });
  // Email on = email verification on (services/emailVerification.service.js).
  process.env.BREVO_API_KEY = "test-key";
  process.env.MAIL_FROM = "accounts@bookflow.test";
});
afterEach(async () => {
  for (const key of ["EMAIL_DAILY_BUDGET", "EMAIL_ACCOUNT_RESERVE", "TURNSTILE_SECRET_KEY"]) delete process.env[key];
  setTurnstileVerifierForTests(null);
  await h.clear();
});
afterAll(async () => {
  setSenderForTests(null);
  delete process.env.BREVO_API_KEY;
  delete process.env.MAIL_FROM;
  delete process.env.SITE_PROXY_SECRET;
  await h.disconnect();
});

// The emails go out in the background: wait until n arrived (or give up after ~1 s).
async function waitForEmails(n) {
  for (let i = 0; i < 50 && sent.length < n; i++) await new Promise((r) => setTimeout(r, 20));
}
const settle = () => new Promise((r) => setTimeout(r, 100));

const signUp = (email, extra = {}) =>
  call("post", "/api/auth/register").send({ name: "Maya", email, password: "password123", ...extra });
const BUDGET_USED = "We can't send emails right now, please try again tomorrow";
const NOT_A_ROBOT = "Please confirm you're not a robot";

describe("Daily email budget", () => {
  test("sign-ups stop at the budget: the next one gets 503 and no account is made", async () => {
    process.env.EMAIL_DAILY_BUDGET = "3";

    for (const n of [1, 2, 3]) await signUp(`user${n}@customer.test`).expect(201);
    await waitForEmails(3);
    expect(sent).toHaveLength(3);

    const fourth = await signUp("user4@customer.test").expect(503);
    expect(fourth.body.message).toBe(BUDGET_USED);
    expect(await User.exists({ email: "user4@customer.test" })).toBeNull();
    await settle();
    expect(sent).toHaveLength(3);
  });

  test("'forgot password' and 'send a new code' answer 503 when the budget is used up", async () => {
    process.env.EMAIL_DAILY_BUDGET = "1";
    await signUp("maya@customer.test").expect(201);
    await waitForEmails(1);

    const forgot = await call("post", "/api/auth/forgot-password").send({ email: "maya@customer.test" }).expect(503);
    expect(forgot.body.message).toBe(BUDGET_USED);
    // The same answer for an email with no account: the 503 says nothing about who is registered.
    await call("post", "/api/auth/forgot-password").send({ email: "nobody@customer.test" }).expect(503);
    await call("post", "/api/auth/resend-verification").send({ email: "maya@customer.test" }).expect(503);
    await settle();
    expect(sent).toHaveLength(1);
  });

  test("business sign-up also stops at the budget", async () => {
    process.env.EMAIL_DAILY_BUDGET = "1";
    await signUp("maya@customer.test").expect(201);

    const res = await call("post", "/api/auth/register-business")
      .send({
        businessName: "Late Salon",
        slug: "late-salon",
        ownerName: "Owner",
        email: "owner@late.test",
        password: "password123",
      })
      .expect(503);
    expect(res.body.message).toBe(BUDGET_USED);
    expect(await Tenant.exists({ slug: "late-salon" })).toBeNull();
  });

  test("'new booking' emails stop before the reserve; account emails can still use it", async () => {
    process.env.EMAIL_DAILY_BUDGET = "3";
    process.env.EMAIL_ACCOUNT_RESERVE = "2"; // notifications may use only 3 - 2 = 1

    expect(await takeEmailSlot("notification")).toBe(true);
    expect(await takeEmailSlot("notification")).toBe(false);
    expect(await takeEmailSlot("account")).toBe(true);
    expect(await takeEmailSlot("account")).toBe(true);
    expect(await takeEmailSlot("account")).toBe(false);
  });

  test("parallel requests can't take more than the budget", async () => {
    process.env.EMAIL_DAILY_BUDGET = "5";
    const results = await Promise.all(Array.from({ length: 12 }, () => takeEmailSlot("account")));
    expect(results.filter(Boolean)).toHaveLength(5);
  });

  test("a guest booking past the notification budget is still saved, only its email is skipped", async () => {
    process.env.EMAIL_DAILY_BUDGET = "1";
    process.env.EMAIL_ACCOUNT_RESERVE = "1"; // no room for "new booking" emails at all
    const biz = await h.makeBusiness("quiet-salon");

    await call("post", `/api/public/businesses/${biz.tenant.slug}/appointments`)
      .send({
        serviceId: biz.service._id,
        staffId: biz.staff[0]._id,
        date: h.nextOpenDate(),
        time: "10:00",
        name: "Guest",
        phone: "0599111222",
      })
      .expect(201);
    await settle();
    expect(sent).toHaveLength(0);
  });
});

describe("Turnstile on the routes that send an email (when TURNSTILE_SECRET_KEY is set)", () => {
  beforeEach(() => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    setTurnstileVerifierForTests(async (token) => token === "good-token");
  });

  test("sign-up: no token or a wrong one is refused (no email); a good one goes through", async () => {
    expect((await signUp("maya@customer.test").expect(400)).body.message).toBe(NOT_A_ROBOT);
    await signUp("maya@customer.test", { captchaToken: "bad-token" }).expect(400);
    await settle();
    expect(sent).toHaveLength(0);
    expect(await User.exists({ email: "maya@customer.test" })).toBeNull();

    await signUp("maya@customer.test", { captchaToken: "good-token" }).expect(201);
    await waitForEmails(1);
    expect(sent).toHaveLength(1);
  });

  test("business sign-up, 'forgot password' and 'send a new code' need a token too", async () => {
    await call("post", "/api/auth/register-business")
      .send({
        businessName: "Bot Salon",
        slug: "bot-salon",
        ownerName: "Bot",
        email: "bot@x.test",
        password: "password123",
      })
      .expect(400);
    await call("post", "/api/auth/forgot-password").send({ email: "maya@customer.test" }).expect(400);
    await call("post", "/api/auth/resend-verification").send({ email: "maya@customer.test" }).expect(400);

    await call("post", "/api/auth/forgot-password")
      .send({ email: "maya@customer.test", captchaToken: "good-token" })
      .expect(200);
    await call("post", "/api/auth/resend-verification")
      .send({ email: "maya@customer.test", captchaToken: "good-token" })
      .expect(200);
  });

  test("off by default: no token needed", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    await signUp("maya@customer.test").expect(201);
  });
});
