const { buildNewBookingEmail, buildPasswordResetEmail, isEmailConfigured } = require("../src/services/notify.service");

// No database: only how the email is built.
const base = {
  businessName: "Laila Salon",
  timezone: "Asia/Hebron",
  serviceName: "Haircut",
  staffName: "Sara",
  startTime: new Date("2026-11-03T08:30:00Z"), // 10:30 in Hebron
  customerName: "Ahmad",
  customerPhone: "0599123456",
  link: "https://laila.example/dashboard?tab=schedule&date=2026-11-03",
};

describe("new booking email", () => {
  test("has the booking details in Arabic and English, in the business's time", () => {
    const { subject, html } = buildNewBookingEmail(base);
    expect(subject).toContain("Haircut");
    expect(subject).toContain("10:30");
    expect(html).toContain("حجز جديد في Laila Salon");
    expect(html).toContain("New booking at Laila Salon");
    for (const value of ["Sara", "Ahmad", "0599123456", "10:30"]) expect(html).toContain(value);
    expect(html).toContain(base.link.replace(/&/g, "&amp;"));
  });

  test("escapes what the customer typed, so a name can't inject HTML into the owner's inbox", () => {
    const { html } = buildNewBookingEmail({
      ...base,
      customerName: '<img src=x onerror="alert(1)">',
      notes: "<script>bad()</script>",
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  test("leaves out empty rows and the button when there is no link", () => {
    const { html } = buildNewBookingEmail({ ...base, notes: undefined, link: null });
    expect(html).not.toContain("ملاحظات");
    expect(html).not.toContain("Notes");
    expect(html).not.toContain("<a ");
  });

  test("is off until both BREVO_API_KEY and MAIL_FROM are set", () => {
    const saved = { key: process.env.BREVO_API_KEY, from: process.env.MAIL_FROM };
    delete process.env.BREVO_API_KEY;
    process.env.MAIL_FROM = "bookings@example.com";
    expect(isEmailConfigured()).toBe(false);
    process.env.BREVO_API_KEY = "key";
    expect(isEmailConfigured()).toBe(true);
    process.env.BREVO_API_KEY = saved.key;
    process.env.MAIL_FROM = saved.from;
    if (saved.key === undefined) delete process.env.BREVO_API_KEY;
    if (saved.from === undefined) delete process.env.MAIL_FROM;
  });
});

describe("password reset email", () => {
  test("has the link and the time limit in both languages, and escapes the name", () => {
    const link = "https://laila.example/reset-password/abc";
    const { subject, html } = buildPasswordResetEmail({ name: "<b>Lina</b>", link, minutes: 30 });
    expect(subject).toContain("Reset your password");
    expect(html).toContain(link);
    expect(html).toContain("30 دقيقة");
    expect(html).toContain("30 minutes");
    expect(html).not.toContain("<b>Lina</b>");
    expect(html).toContain("&lt;b&gt;Lina&lt;/b&gt;");
  });
});
