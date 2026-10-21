// End-to-end trial: ONE shared server, TWO clients, each with its own branded site.
// Run by .github/workflows/e2e-shared-server.yml (real MongoDB, real server, production builds).
// Usage: node e2e/shared-server.mjs <lailaOwnerPassword> <reemOwnerPassword>
import fs from "node:fs";
import puppeteer from "puppeteer-core";

// Different host names = separate cookies, like two different domains.
const LAILA = "http://localhost:3000";
const REEM = "http://127.0.0.1:3001";
const LAILA_OWNER = { email: "laila@test.com", password: process.argv[2] };
const REEM_OWNER = { email: "reem@test.com", password: process.argv[3] };
const OUT = "e2e-out";
const results = [];
let failed = 0;
fs.mkdirSync(OUT, { recursive: true });

const check = async (name, fn) => {
  try {
    const detail = await fn();
    results.push(`PASS  ${name}${typeof detail === "string" ? `  (${detail})` : ""}`);
  } catch (err) {
    failed++;
    results.push(`FAIL  ${name}  (${err.message.split("\n")[0]})`);
  }
  console.log(results.at(-1));
};
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

// ---- API helpers (with a tiny cookie jar) ----
async function api(base, method, path, { body, cookie } = {}) {
  const res = await fetch(base + "/api" + path, {
    method,
    headers: { ...(body && { "Content-Type": "application/json" }), ...(cookie && { Cookie: cookie }) },
    body: body && JSON.stringify(body),
  });
  const setCookie = res.headers.get("set-cookie");
  return {
    status: res.status,
    data: await res.json().catch(() => ({})),
    cookie: setCookie ? setCookie.split(";")[0] : cookie,
  };
}
const apiLogin = async (base, who) => (await api(base, "POST", "/auth/login", { body: who })).cookie;

// A date 2-5 days ahead in Asia/Hebron that is not a Friday (the default day off).
function futureDate(daysAhead) {
  const d = new Date(Date.now() + daysAhead * 86400000);
  const local = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hebron" }).format(d);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Hebron", weekday: "long" }).format(d);
  return weekday === "Friday" ? futureDate(daysAhead + 1) : local;
}

// ---- browser helpers ----
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ["--no-sandbox"] });
async function newPage(base, lang = "en", width = 1280) {
  const page = await (await browser.createBrowserContext()).newPage();
  await page.setViewport({ width, height: 900 });
  await page.setCookie({ name: "bookflow_lang", value: lang, url: base });
  page.setDefaultTimeout(30000);
  return page;
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });
const text = (page) => page.evaluate(() => document.body.innerText);
const waitText = (page, t) => page.waitForFunction((x) => document.body.innerText.includes(x), {}, t);
const path = (page) => new URL(page.url()).pathname;
async function clickText(page, selector, t) {
  await page.waitForFunction(
    (s, x) => [...document.querySelectorAll(s)].some((el) => el.innerText.trim().includes(x)),
    {},
    selector,
    t,
  );
  await page.evaluate(
    (s, x) => [...document.querySelectorAll(s)].find((el) => el.innerText.trim().includes(x)).click(),
    selector,
    t,
  );
}
async function fillLogin(page, base, who) {
  await page.goto(`${base}/login`, { waitUntil: "networkidle0" });
  await page.type('input[type="email"]', who.email);
  await page.type('input[type="password"]', who.password);
  await page.$eval('button[type="submit"]', (b) => b.click());
}
const cssVar = (page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--color-brand-500").trim());

// ================= 1. Each site is its own brand =================
const lailaGuest = await newPage(LAILA, "ar");
await check("Laila site: / opens Laila's booking page with her name and color", async () => {
  await lailaGuest.goto(LAILA, { waitUntil: "networkidle0" });
  assert(path(lailaGuest) === "/book/laila-salon", lailaGuest.url());
  assert((await lailaGuest.title()).includes("صالون ليلى"), await lailaGuest.title());
  assert((await cssVar(lailaGuest)) === "#7c3aed", await cssVar(lailaGuest));
  return await lailaGuest.title();
});
await check("Laila site: exactly one tab icon = her logo", async () => {
  const icons = await lailaGuest.$$eval('link[rel="icon"]', (els) => els.map((e) => e.getAttribute("href")));
  assert(JSON.stringify(icons) === '["/clients/laila-salon/logo.svg"]', JSON.stringify(icons));
});
await shot(lailaGuest, "1-laila-booking-ar");

const reemGuest = await newPage(REEM, "ar");
await check("Reem site: / opens Reem's booking page with her name and color", async () => {
  await reemGuest.goto(REEM, { waitUntil: "networkidle0" });
  assert(path(reemGuest) === "/book/reem-clinic", reemGuest.url());
  assert((await reemGuest.title()).includes("عيادة ريم"), await reemGuest.title());
  assert((await cssVar(reemGuest)) === "#0ea5e9", await cssVar(reemGuest));
  return await reemGuest.title();
});
await shot(reemGuest, "2-reem-booking-ar");

// ================= 2. Clients can't see or reach each other =================
await check("Laila site: /book/reem-clinic redirects back to Laila", async () => {
  await lailaGuest.goto(`${LAILA}/book/reem-clinic`, { waitUntil: "networkidle0" });
  assert(path(lailaGuest) === "/book/laila-salon", lailaGuest.url());
});
await check("Laila site: /businesses and /register-business are closed", async () => {
  await lailaGuest.goto(`${LAILA}/businesses`, { waitUntil: "networkidle0" });
  assert(path(lailaGuest) === "/book/laila-salon", lailaGuest.url());
  await lailaGuest.goto(`${LAILA}/register-business`, { waitUntil: "networkidle0" });
  assert(path(lailaGuest) === "/login", lailaGuest.url());
});
await check("API: list of businesses is hidden (404)", async () => {
  const r = await api(LAILA, "GET", "/public/businesses");
  assert(r.status === 404, `status ${r.status} ${JSON.stringify(r.data)}`);
});
await check("API: nobody can register a business (403)", async () => {
  const r = await api(LAILA, "POST", "/auth/register-business", {
    body: { businessName: "X", slug: "x-salon", ownerName: "X", email: "x@test.com", password: "password123" },
  });
  assert(r.status === 403, `status ${r.status}`);
});
await check("Reem's owner can't log in on Laila's site (clear message, logged out)", async () => {
  const page = await newPage(LAILA, "en");
  await fillLogin(page, LAILA, REEM_OWNER);
  await waitText(page, "This account belongs to another business");
  assert(path(page) === "/login", page.url());
  const me = await page.evaluate(() => fetch("/api/auth/me").then((r) => r.status));
  assert(me === 401, `/auth/me after refusal: ${me}`);
  await shot(page, "3-reem-owner-on-laila-site");
  await page.browserContext().close();
});

// ================= 3. Each owner works on their own site =================
const lailaOwner = await newPage(LAILA, "en");
await check("Laila's owner logs in on her site (password from setup-client)", async () => {
  await fillLogin(lailaOwner, LAILA, LAILA_OWNER);
  await lailaOwner.waitForFunction(() => location.pathname.startsWith("/dashboard"));
});
await check("Laila's owner adds a service and a staff member from the dashboard", async () => {
  await lailaOwner.goto(`${LAILA}/dashboard?tab=services`, { waitUntil: "networkidle0" });
  await clickText(lailaOwner, "button", "+ Add service");
  await lailaOwner.type('input[name="name"]', "Haircut");
  await lailaOwner.type('input[name="price"]', "50");
  await lailaOwner.$eval('input[name="duration"]', (el) => (el.value = ""));
  await lailaOwner.type('input[name="duration"]', "30");
  await clickText(lailaOwner, 'button[type="submit"]', "Save");
  await lailaOwner.waitForFunction(() => !document.querySelector("form"));
  await lailaOwner.goto(`${LAILA}/dashboard?tab=staff`, { waitUntil: "networkidle0" });
  await clickText(lailaOwner, "button", "+ Add staff member");
  await lailaOwner.type('form input[name="name"]', "Sara");
  await lailaOwner.type('form input[name="email"]', "sara@test.com");
  await lailaOwner.type('form input[name="password"]', "password123");
  await clickText(lailaOwner, 'button[type="submit"]', "Save");
  await lailaOwner.waitForFunction(() => !document.querySelector("form"));
  await waitText(lailaOwner, "Sara");
});

const reemOwner = await newPage(REEM, "ar");
await check("Reem's owner logs in on her site and sees her clinic", async () => {
  await fillLogin(reemOwner, REEM, REEM_OWNER);
  await reemOwner.waitForFunction(() => location.pathname.startsWith("/dashboard"));
  await waitText(reemOwner, "عيادة ريم");
});
await check("Reem's owner sets up her clinic (API) - and sees none of Laila's data", async () => {
  const cookie = await apiLogin(REEM, REEM_OWNER);
  const s = await api(REEM, "POST", "/services", { cookie, body: { name: "Checkup", price: 80, duration: 20 } });
  assert(s.status === 201, `service ${s.status}`);
  const st = await api(REEM, "POST", "/staff", {
    cookie,
    body: { name: "Dr. Huda", email: "huda@test.com", password: "password123" },
  });
  assert(st.status === 201, `staff ${st.status} ${JSON.stringify(st.data)}`);
  const services = await api(REEM, "GET", "/services", { cookie });
  const names = JSON.stringify(services.data);
  assert(names.includes("Checkup") && !names.includes("Haircut"), names.slice(0, 200));
});

// ================= 4. A guest books at Laila's (Arabic, phone) =================
await check("guest books at Laila's from a phone, and the slot disappears", async () => {
  const page = await newPage(LAILA, "ar", 390);
  await page.goto(LAILA, { waitUntil: "networkidle0" });
  await clickText(page, "button", "Haircut");
  await clickText(page, "button", "Sara");
  await page.waitForSelector("button.w-16:not([disabled])");
  await page.$$eval("button.w-16:not([disabled])", (els) => els[1].click());
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some((b) => b.innerText.trim() === "10:00"),
  );
  await page.evaluate(() =>
    [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "10:00").click(),
  );
  await page.waitForSelector('input[autocomplete="name"]');
  await page.type('input[autocomplete="name"]', "Ahmad Ali");
  await page.type('input[type="tel"]', "0599123456");
  await clickText(page, "button", "احجز ب");
  await waitText(page, "تم الحجز");
  await shot(page, "4-laila-guest-booked-phone");
  await page.browserContext().close();
});
await check("Laila's dashboard shows the guest booking", async () => {
  await lailaOwner.goto(`${LAILA}/dashboard?tab=overview`, { waitUntil: "networkidle0" });
  await waitText(lailaOwner, "Ahmad Ali");
  await shot(lailaOwner, "5-laila-dashboard");
});
await check("Reem's dashboard does NOT show Laila's booking", async () => {
  await reemOwner.goto(`${REEM}/dashboard?tab=overview`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 1500));
  assert(!(await text(reemOwner)).includes("Ahmad Ali"), "Laila's guest visible at Reem's");
  await shot(reemOwner, "6-reem-dashboard-ar");
});

// ================= 5. One customer account, two clients =================
await check("a customer with bookings at both clients sees only that client's on each site", async () => {
  const reg = await api(LAILA, "POST", "/auth/register", {
    body: { name: "Mona", email: "mona@test.com", password: "password123" },
  });
  assert(reg.status === 201, `register ${reg.status}`);
  const date = futureDate(3);
  for (const [base, slug] of [
    [LAILA, "laila-salon"],
    [REEM, "reem-clinic"],
  ]) {
    const cookie = await apiLogin(base, { email: "mona@test.com", password: "password123" });
    const page = await api(base, "GET", `/public/businesses/${slug}`);
    const b = await api(base, "POST", "/appointments", {
      cookie,
      body: { slug, serviceId: page.data.services[0].id, staffId: page.data.staff[0].id, date, time: "11:00" },
    });
    assert(b.status === 201, `${slug} booking ${b.status} ${JSON.stringify(b.data)}`);
  }
  for (const [base, mine, other] of [
    [LAILA, "Haircut", "Checkup"],
    [REEM, "Checkup", "Haircut"],
  ]) {
    const page = await newPage(base, "en");
    await fillLogin(page, base, { email: "mona@test.com", password: "password123" });
    await page.waitForFunction(() => location.pathname === "/my-appointments");
    await waitText(page, mine);
    assert(!(await text(page)).includes(other), `${base} shows the other client's booking`);
    await page.browserContext().close();
  }
  return date;
});

await browser.close();
results.push("", `${results.length - failed} passed, ${failed} failed`);
fs.writeFileSync(`${OUT}/results.txt`, results.join("\n") + "\n");
console.log(results.at(-1));
process.exit(failed ? 1 : 0);
