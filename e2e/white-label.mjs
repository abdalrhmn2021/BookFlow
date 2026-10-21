// End-to-end trial of a sold copy, run by .github/workflows/e2e-white-label.yml
// against a real MongoDB, the real server and a production build of the client.
// Usage: node e2e/white-label.mjs <ownerPassword>
import fs from "node:fs";
import puppeteer from "puppeteer-core";

const BASE = "http://localhost:3000";
const OUT = "e2e-out";
const OWNER = { email: "laila@test.com", password: process.argv[2] };
const results = [];
let failed = 0;

fs.mkdirSync(OUT, { recursive: true });
const log = (ok, name, detail = "") => {
  if (!ok) failed++;
  const line = `${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`;
  results.push(line);
  console.log(line);
};
const check = async (name, fn) => {
  try {
    const detail = await fn();
    log(true, name, typeof detail === "string" ? detail : "");
  } catch (err) {
    log(false, name, err.message.split("\n")[0]);
  }
};
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ["--no-sandbox"] });

// Each person gets their own browser context (separate cookies), like a separate device.
async function newPage(lang = "en", width = 1280) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width, height: 900 });
  await page.setCookie({ name: "bookflow_lang", value: lang, url: BASE });
  page.setDefaultTimeout(30000);
  return page;
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
const bodyText = (page) => page.evaluate(() => document.body.innerText);

// Is the page wider than the screen? If so, name the elements that stick out.
const overflowReport = (page) =>
  page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const sw = document.documentElement.scrollWidth;
    const out = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width && (r.left < -1 || r.right > vw + 1)) {
        const name = `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 6).join(".")}`;
        out.push(`${name} [${Math.round(r.left)}..${Math.round(r.right)}] "${el.innerText?.slice(0, 30) ?? ""}"`);
      }
    }
    return { vw, sw, out: out.slice(0, 8) };
  });
const overflowLog = [];
async function checkOverflow(page, label) {
  const r = await overflowReport(page);
  overflowLog.push(`== ${label}: viewport ${r.vw}, page ${r.sw}${r.sw > r.vw ? "  <-- WIDER" : ""}`, ...r.out);
  await page.screenshot({ path: `${OUT}/view-${label}.png` });
}
const waitText = (page, text) =>
  page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: 30000 }, text);
async function clickText(page, selector, text) {
  await page.waitForFunction(
    (s, t) => [...document.querySelectorAll(s)].some((el) => el.innerText.trim().includes(t)),
    {},
    selector,
    text,
  );
  await page.evaluate(
    (s, t) => [...document.querySelectorAll(s)].find((el) => el.innerText.trim().includes(t)).click(),
    selector,
    text,
  );
}
async function login(page, { email, password }) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await page.type('input[type="email"]', email);
  await page.type('input[type="password"]', password);
  await clickText(page, 'button[type="submit"]', "Log in");
  await page.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 30000 });
}

// ---------- 1. The copy looks like the client's site ----------
const guest = await newPage("ar");

await check("/ opens the booking page directly", async () => {
  await guest.goto(BASE, { waitUntil: "networkidle0" });
  assert(new URL(guest.url()).pathname === "/book/laila-salon", `ended at ${guest.url()}`);
  return guest.url();
});
await check("Arabic brand name in the header and browser tab", async () => {
  const title = await guest.title();
  assert(title.includes("صالون ليلى"), `title is "${title}"`);
  assert((await bodyText(guest)).includes("صالون ليلى"), "name missing on the page");
  return title;
});
await check("brand color applied (BRAND_COLOR=#7c3aed)", async () => {
  const c = await guest.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--color-brand-500"),
  );
  assert(c.trim() === "#7c3aed", `--color-brand-500 is "${c}"`);
  return c.trim();
});
await check("exactly one tab icon, and it is the client logo", async () => {
  const icons = await guest.$$eval('link[rel="icon"]', (els) => els.map((e) => e.getAttribute("href")));
  assert(icons.length === 1 && icons[0] === "/clients/laila-salon/logo.svg", JSON.stringify(icons));
  const res = await fetch(BASE + icons[0]);
  assert(res.ok, `logo returns ${res.status}`);
  return icons[0];
});
await check("logo shown in the header", async () => {
  const src = await guest.$eval("header img, nav img", (img) => img.getAttribute("src"));
  assert(src === "/clients/laila-salon/logo.svg", `img src ${src}`);
});
await check("before setup: page says there are no services yet", async () => {
  await waitText(guest, "خدمات بعد");
});
await shot(guest, "1-booking-page-empty-ar");

await check("/businesses redirects to the booking page", async () => {
  await guest.goto(`${BASE}/businesses`, { waitUntil: "networkidle0" });
  assert(new URL(guest.url()).pathname === "/book/laila-salon", guest.url());
});
await check("/register-business redirects to login", async () => {
  await guest.goto(`${BASE}/register-business`, { waitUntil: "networkidle0" });
  assert(new URL(guest.url()).pathname === "/login", guest.url());
});
await check("login page: no demo buttons", async () => {
  const text = await bodyText(guest);
  assert(!text.includes("تجريبي") && !text.includes("demo"), "demo text found");
});
await shot(guest, "2-login-ar");
await check("register page: no 'register your business' link", async () => {
  await guest.goto(`${BASE}/register`, { waitUntil: "networkidle0" });
  assert((await guest.$('a[href="/register-business"]')) === null, "link present");
});

// ---------- 2. The API only serves this business ----------
await check("API directory lists only laila-salon", async () => {
  const data = await (await fetch(`${BASE}/api/public/businesses`)).json();
  const slugs = data.businesses.map((b) => b.slug);
  assert(JSON.stringify(slugs) === '["laila-salon"]', JSON.stringify(slugs));
});
await check("API refuses registering another business (403)", async () => {
  const res = await fetch(`${BASE}/api/auth/register-business`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      businessName: "Other",
      slug: "other-salon",
      ownerName: "X",
      email: "x@test.com",
      password: "password123",
    }),
  });
  assert(res.status === 403, `status ${res.status}`);
});

// ---------- 3. The owner sets up the business from the dashboard ----------
const owner = await newPage("en");
await check("owner logs in with the password the script generated", async () => {
  await login(owner, OWNER);
  return owner.url();
});
await shot(owner, "3-owner-overview-en");

await check("owner adds a service", async () => {
  await owner.goto(`${BASE}/dashboard?tab=services`, { waitUntil: "networkidle0" });
  await clickText(owner, "button", "+ Add service");
  await owner.type('input[name="name"]', "Haircut");
  await owner.type('input[name="price"]', "50");
  await owner.$eval('input[name="duration"]', (el) => (el.value = ""));
  await owner.type('input[name="duration"]', "30");
  await clickText(owner, 'button[type="submit"]', "Save");
  await owner.waitForFunction(() => !document.querySelector("form"), { timeout: 30000 });
  await waitText(owner, "Haircut");
});
await check("owner adds a staff member", async () => {
  await owner.goto(`${BASE}/dashboard?tab=staff`, { waitUntil: "networkidle0" });
  await clickText(owner, "button", "+ Add staff member");
  await owner.type('form input[name="name"]', "Reem");
  await owner.type('form input[name="email"]', "reem@test.com");
  await owner.type('form input[name="password"]', "password123");
  await clickText(owner, 'button[type="submit"]', "Save");
  await owner.waitForFunction(() => !document.querySelector("form"), { timeout: 30000 });
  await waitText(owner, "Reem");
});
await shot(owner, "4-owner-staff-en");

// ---------- 4. A customer books as a guest (Arabic UI, phone width) ----------
const customer = await newPage("ar", 390);
let bookedDate;
await check("guest picks service, staff, day and time", async () => {
  await customer.goto(BASE, { waitUntil: "networkidle0" });
  await clickText(customer, "button", "Haircut");
  await clickText(customer, "button", "Reem");
  await customer.waitForSelector("button.w-16:not([disabled])");
  // The second open day, so it always has free times (today may already be over).
  bookedDate = await customer.$$eval("button.w-16:not([disabled])", (els) => {
    els[1].click();
    return els[1].innerText.replace(/\s+/g, " ");
  });
  await customer.waitForFunction(() =>
    [...document.querySelectorAll("button")].some((b) => /^\d{2}:\d{2}$/.test(b.innerText.trim())),
  );
  await customer.evaluate(() =>
    [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "10:00").click(),
  );
  return `${bookedDate} 10:00`;
});
await check("guest fills name + phone and confirms", async () => {
  await customer.waitForSelector('input[autocomplete="name"]');
  await customer.type('input[autocomplete="name"]', "Ahmad Ali");
  await customer.type('input[type="tel"]', "0599123456");
  await shot(customer, "5-guest-confirm-ar-mobile");
  await checkOverflow(customer, "booking-ar-390");
  await clickText(customer, "button", "احجز ب");
  await waitText(customer, "تم الحجز");
});
await shot(customer, "6-guest-booked-ar-mobile");
await checkOverflow(customer, "booked-ar-390");

await check("the same time is no longer offered (no double booking)", async () => {
  const page = await newPage("en");
  await page.goto(BASE, { waitUntil: "networkidle0" });
  await clickText(page, "button", "Haircut");
  await clickText(page, "button", "Reem");
  await page.waitForSelector("button.w-16:not([disabled])");
  await page.$$eval("button.w-16:not([disabled])", (els) => els[1].click());
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some((b) => /^\d{2}:\d{2}$/.test(b.innerText.trim())),
  );
  const times = await page.$$eval("button", (bs) =>
    bs.map((b) => b.innerText.trim()).filter((t) => /^\d{2}:\d{2}$/.test(t)),
  );
  assert(!times.includes("10:00"), "10:00 still offered");
  assert(times.includes("09:00") && times.includes("10:30"), `times: ${times.join(" ")}`);
  await page.close();
});

// ---------- 5. The owner sees the booking ----------
await check("booking appears in the owner's schedule", async () => {
  // Overview shows the next appointment; the schedule for that day lists the guest.
  await owner.goto(`${BASE}/dashboard?tab=overview`, { waitUntil: "networkidle0" });
  await waitText(owner, "Ahmad Ali");
});
await shot(owner, "7-owner-overview-with-booking-en");
await checkOverflow(owner, "dashboard-en-1280");
await owner.setViewport({ width: 390, height: 900 });
await checkOverflow(owner, "dashboard-en-390");
await owner.setViewport({ width: 1280, height: 900 });

// ---------- 6. Owner dashboard in Arabic ----------
await check("dashboard in Arabic shows the brand", async () => {
  const ar = await newPage("ar");
  await ar.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
  await ar.type('input[type="email"]', OWNER.email);
  await ar.type('input[type="password"]', OWNER.password);
  await ar.$eval('button[type="submit"]', (b) => b.click());
  await ar.waitForFunction(() => location.pathname.startsWith("/dashboard"), { timeout: 30000 });
  await waitText(ar, "صالون ليلى");
  await shot(ar, "8-owner-dashboard-ar");
  await checkOverflow(ar, "dashboard-ar-1280");
  await ar.setViewport({ width: 390, height: 900 });
  await checkOverflow(ar, "dashboard-ar-390");
  for (const tab of ["schedule", "services", "staff", "hours"]) {
    await ar.goto(`${BASE}/dashboard?tab=${tab}`, { waitUntil: "networkidle0" });
    await checkOverflow(ar, `dashboard-${tab}-ar-390`);
  }
  await ar.close();
});

for (const [path, lang] of [
  ["/login", "ar"],
  ["/register", "ar"],
  ["/my-appointments", "ar"],
]) {
  const p = await newPage(lang, 390);
  await p.goto(BASE + path, { waitUntil: "networkidle0" });
  await checkOverflow(p, `${path.slice(1)}-${lang}-390`);
}
fs.writeFileSync(`${OUT}/overflow.txt`, overflowLog.join("\n") + "\n");

await browser.close();
results.push("", `${results.length - failed} passed, ${failed} failed`);
fs.writeFileSync(`${OUT}/results.txt`, results.join("\n") + "\n");
console.log(`\n${failed ? "FAILED" : "ALL PASSED"}: ${failed} failed`);
process.exit(failed ? 1 : 0);
