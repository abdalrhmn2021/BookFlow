// Security review M-3: the dashboard's WhatsApp buttons must use the business's own country code
// for local numbers (0599...), the same one as the automatic reminders - otherwise the message,
// with its manage link, goes to a stranger's number. GET /api/tenants/me hands it to the dashboard.
const request = require("supertest");
const h = require("./helpers");
const Tenant = require("../src/models/Tenant");

beforeAll(h.connect);
afterEach(async () => {
  delete process.env.WHATSAPP_DEFAULT_COUNTRY_CODE;
  await h.clear();
});
afterAll(h.disconnect);

const myTenant = (user) =>
  request(h.app)
    .get("/api/tenants/me")
    .set("Authorization", `Bearer ${h.tokenFor(user)}`)
    .expect(200);

test("a business with its own country code gets it (owner and staff)", async () => {
  const biz = await h.makeBusiness("amman-salon");
  await Tenant.updateOne({ _id: biz.tenant._id }, { $set: { phoneCountryCode: "962" } });

  expect((await myTenant(biz.owner)).body.tenant.phoneCountryCode).toBe("962");
  expect((await myTenant(biz.staff[0])).body.tenant.phoneCountryCode).toBe("962");
});

test("without one: the server's WHATSAPP_DEFAULT_COUNTRY_CODE, else 970", async () => {
  const biz = await h.makeBusiness("gaza-salon");
  expect((await myTenant(biz.owner)).body.tenant.phoneCountryCode).toBe("970");

  process.env.WHATSAPP_DEFAULT_COUNTRY_CODE = "+20";
  expect((await myTenant(biz.owner)).body.tenant.phoneCountryCode).toBe("20");
});
