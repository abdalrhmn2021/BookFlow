import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// The main path of the product, in a real browser against a real server (server/scripts/e2e-server.js,
// a throwaway database with the demo business): a guest books without an account, the owner
// sees the booking in the dashboard, and the guest cancels it from their private link.

const GUEST = { name: "E2E Guest", phone: "0599 000 222" };
const OWNER = { email: "owner@demo.com", password: "password123" }; // the public demo account

async function inEnglish(context: BrowserContext, baseURL: string) {
  await context.addCookies([{ name: "bookflow_lang", value: "en", url: baseURL }]);
}

const step = (page: Page, title: string | RegExp) =>
  page.locator("section", { has: page.getByRole("heading", { name: title }) });

test("a guest books, the owner sees it, the guest cancels it", async ({ browser, baseURL }) => {
  // --- the guest books -------------------------------------------------------------------
  const guestContext = await browser.newContext();
  await inEnglish(guestContext, baseURL!);
  const guest = await guestContext.newPage();
  await guest.goto("/book/demo-salon");

  await step(guest, "Choose a service")
    .getByRole("button", { name: /Haircut/ })
    .click();
  await step(guest, "Choose a staff member").getByRole("button", { name: "Any staff member" }).click();

  // A day at least 2 days ahead (online cancelling closes 2 hours before), and not a closed day.
  const days = step(guest, "Pick a day").getByRole("button");
  await expect(days.first()).toBeVisible();
  let picked = false;
  for (let i = 2; i < (await days.count()); i++) {
    if (await days.nth(i).isEnabled()) {
      await days.nth(i).click();
      picked = true;
      break;
    }
  }
  expect(picked).toBe(true);

  const times = step(guest, /Free times/).getByRole("button", { name: /^\d{2}:\d{2}$/ });
  await expect(times.first()).toBeVisible();
  const time = (await times.first().textContent())!.trim();
  await times.first().click();

  await guest.getByLabel("Your name").fill(GUEST.name);
  await guest.getByLabel("Phone number").fill(GUEST.phone);
  await guest.getByRole("button", { name: /^Book for/ }).click();

  await expect(guest.getByRole("heading", { name: "You're booked!" })).toBeVisible();
  const manageLink = await guest.locator("#manage-link").inputValue();
  expect(manageLink).toMatch(/\/booking\/[A-Za-z0-9_-]{20,}$/);

  // --- the owner sees it in the dashboard -------------------------------------------------
  const ownerContext = await browser.newContext();
  await inEnglish(ownerContext, baseURL!);
  const owner = await ownerContext.newPage();
  await owner.goto("/login");
  await owner.locator('input[type="email"]').fill(OWNER.email);
  await owner.locator('input[type="password"]').fill(OWNER.password);
  await owner.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(owner).toHaveURL(/\/dashboard/);

  const res = await owner.request.get(
    "/api/appointments/business/new?since=" + encodeURIComponent(new Date(Date.now() - 60 * 60 * 1000).toISOString()),
  );
  expect(res.ok()).toBe(true);
  const { appointments } = await res.json();
  const mine = appointments.find((a: { guest?: { name: string } }) => a.guest?.name === GUEST.name);
  expect(mine, "the owner's dashboard API lists the guest's booking").toBeTruthy();

  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hebron" }).format(new Date(mine.startTime));
  await owner.goto(`/dashboard?tab=schedule&date=${day}`);
  await expect(owner.getByText(GUEST.name).first()).toBeVisible();
  await expect(owner.getByText(time).first()).toBeVisible();

  // --- the guest cancels from the private link --------------------------------------------
  await guest.goto(new URL(manageLink).pathname);
  await expect(guest.getByRole("heading", { name: "Your booking" })).toBeVisible();
  await expect(guest.getByText(`Hi ${GUEST.name}`)).toBeVisible();
  await guest.getByRole("button", { name: "Cancel appointment" }).click();
  await guest.getByRole("textbox").fill("Plans changed, sorry about that");
  await guest.getByRole("button", { name: "Yes, cancel" }).click();
  await expect(guest.getByText("Your booking was cancelled")).toBeVisible();

  await guestContext.close();
  await ownerContext.close();
});

test("a wrong booking link says so", async ({ page, context, baseURL }) => {
  await inEnglish(context, baseURL!);
  await page.goto("/booking/this-is-not-a-real-token-at-all-123");
  await expect(page.getByRole("heading", { name: "Booking not found" })).toBeVisible();
});
