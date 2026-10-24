// No database needed: phone formatting, the template message and the jobs endpoint guard.
process.env.JOBS_SECRET = "j".repeat(40);
process.env.WHATSAPP_TEMPLATE = "booking_reminder";

const request = require("supertest");
const { toWhatsAppNumber, buildTemplateMessage } = require("../src/services/whatsapp.service");
const app = require("../src/app");

afterAll(() => {
  delete process.env.JOBS_SECRET;
  delete process.env.WHATSAPP_TEMPLATE;
});

describe("toWhatsAppNumber", () => {
  test("local numbers get the country code, international ones keep theirs", () => {
    expect(toWhatsAppNumber("0599 123-456")).toBe("970599123456");
    expect(toWhatsAppNumber("0599123456", "972")).toBe("972599123456");
    expect(toWhatsAppNumber("+966501234567")).toBe("966501234567");
    expect(toWhatsAppNumber("00966501234567")).toBe("966501234567");
    expect(toWhatsAppNumber("٠٥٩٩١٢٣٤٥٦")).toBe("970599123456");
  });

  test("nothing usable -> null", () => {
    expect(toWhatsAppNumber("")).toBeNull();
    expect(toWhatsAppNumber(undefined)).toBeNull();
    expect(toWhatsAppNumber("599123456")).toBeNull(); // no 0, no + : we can't tell the country
    expect(toWhatsAppNumber("012")).toBeNull();
  });
});

describe("buildTemplateMessage", () => {
  test("a template with the 4 body variables, cleaned the way WhatsApp requires", () => {
    const msg = buildTemplateMessage({ to: "970599123456", params: ["Sara\nAli", "Salon", "Cut", "Tue 10:00"] });
    expect(msg).toMatchObject({
      messaging_product: "whatsapp",
      to: "970599123456",
      type: "template",
      template: { name: "booking_reminder", language: { code: "ar" } },
    });
    expect(msg.template.components[0].parameters.map((p) => p.text)).toEqual(["Sara Ali", "Salon", "Cut", "Tue 10:00"]);
  });
});

describe("POST /api/jobs/reminders", () => {
  test("refuses without the right secret", async () => {
    await request(app).post("/api/jobs/reminders").expect(401);
    await request(app).post("/api/jobs/reminders").set("x-jobs-secret", "guess").expect(401);
  });
});
