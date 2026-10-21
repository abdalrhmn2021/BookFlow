const request = require("supertest");
const h = require("./helpers");
const Tenant = require("../src/models/Tenant");
const User = require("../src/models/User");
const { createBusinessWithOwner } = require("../src/services/business.service");
const { parseArgs, prepare, generatePassword } = require("../scripts/setup-client");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(h.disconnect);

const CLIENT = {
  businessName: "Laila Salon",
  slug: "laila-salon",
  ownerName: "Laila",
  email: "laila@test.com",
  password: "password123",
};

describe("setup-client: reading the command line", () => {
  test("parses --flag value pairs, including quoted values with spaces", () => {
    const args = parseArgs(["--name", "Laila Salon", "--slug", "laila-salon", "--phone"]);
    expect(args).toEqual({ name: "Laila Salon", slug: "laila-salon", phone: "" });
  });

  test("fills defaults and generates a strong password when none is given", () => {
    const values = prepare({ name: "Laila Salon", slug: "Laila-Salon", owner: "Laila", email: "laila@test.com" });
    expect(values.slug).toBe("laila-salon");
    expect(values.passwordGenerated).toBe(true);
    expect(values.password).toHaveLength(16);
    expect(generatePassword()).not.toBe(generatePassword());
  });

  test("rejects bad input with a readable message", () => {
    const base = { name: "Salon", slug: "laila-salon", owner: "Laila", email: "laila@test.com" };
    expect(() => prepare({ ...base, email: "" })).toThrow("--email is required");
    expect(() => prepare({ ...base, slug: "laila salon" })).toThrow("--slug");
    expect(() => prepare({ ...base, password: "short" })).toThrow("at least 8");
    expect(() => prepare({ ...base, timezone: "Mars/Olympus" })).toThrow("not a valid time zone");
  });
});

describe("createBusinessWithOwner (used by the script and by the sign-up endpoint)", () => {
  test("creates the business and an owner who can log in", async () => {
    const { tenant, owner } = await createBusinessWithOwner({ ...CLIENT, timezone: "Asia/Riyadh" });

    expect(tenant.slug).toBe("laila-salon");
    expect(tenant.timezone).toBe("Asia/Riyadh");
    expect(owner.role).toBe("owner");
    expect(String(owner.tenantId)).toBe(String(tenant._id));

    const res = await request(h.app)
      .post("/api/auth/login")
      .send({ email: CLIENT.email, password: CLIENT.password })
      .expect(200);
    expect(res.body.user.role).toBe("owner");
  });

  test("refuses a slug or email that is already used", async () => {
    await createBusinessWithOwner(CLIENT);

    await expect(createBusinessWithOwner({ ...CLIENT, email: "other@test.com" })).rejects.toMatchObject({
      statusCode: 409,
      message: "This business URL is already taken",
    });
    await expect(createBusinessWithOwner({ ...CLIENT, slug: "other-salon" })).rejects.toMatchObject({
      statusCode: 409,
      message: "Email already exists",
    });
  });

  test("an invalid owner rolls the business back too (no business without an owner)", async () => {
    await expect(createBusinessWithOwner({ ...CLIENT, password: "short" })).rejects.toThrow();

    expect(await Tenant.countDocuments()).toBe(0);
    expect(await User.countDocuments()).toBe(0);
  });
});
