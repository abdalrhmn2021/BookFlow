// Small fixes after the full review (Q-01 is in demo-staff-data.test.js):
//   A-08  only HS256 tokens are accepted
//   E-05  a short JOBS_SECRET stops the server from starting
//   ops   GET /api/health for an uptime monitor, and error emails to ALERT_EMAIL
const express = require("express");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const h = require("./helpers");
const { setSenderForTests } = require("../src/services/notify.service");
const { reportError, whereOf, resetAlertsForTests } = require("../src/services/alert.service");
const { errorHandler } = require("../src/middlewares/error.middleware");

beforeAll(h.connect);
afterEach(h.clear);
afterAll(h.disconnect);

describe("A-08: the token's algorithm is fixed", () => {
  test("a token signed with HS256 works; the same secret with HS512 or 'none' is refused", async () => {
    const { owner } = await h.makeBusiness("algo-salon");
    await request(h.app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${h.tokenFor(owner)}`)
      .expect(200);

    const hs512 = jwt.sign({ id: owner._id, role: owner.role }, process.env.JWT_SECRET, { algorithm: "HS512" });
    await request(h.app).get("/api/auth/me").set("Authorization", `Bearer ${hs512}`).expect(401);

    // An unsigned token ("alg": "none") that claims to be the super admin.
    const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const none = `${b64({ alg: "none", typ: "JWT" })}.${b64({ id: owner._id, role: "superadmin", iat: now })}.`;
    await request(h.app).get("/api/auth/me").set("Authorization", `Bearer ${none}`).expect(401);
  });
});

describe("E-05: JOBS_SECRET must be long", () => {
  const { checkModeConfig } = require("../src/config/mode");
  afterEach(() => delete process.env.JOBS_SECRET);

  test("empty is fine (the jobs route is off), short is refused, 32+ is fine", () => {
    delete process.env.JOBS_SECRET;
    expect(checkModeConfig()).toEqual([]);
    process.env.JOBS_SECRET = "secret123";
    expect(checkModeConfig().join(" ")).toMatch(/JOBS_SECRET is too short/);
    process.env.JOBS_SECRET = "k".repeat(32);
    expect(checkModeConfig()).toEqual([]);
  });
});

describe("GET /api/health", () => {
  test("200 and nothing but the status when the database answers", async () => {
    const res = await request(h.app).get("/api/health").expect(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

describe("error emails to ALERT_EMAIL", () => {
  let sent;
  beforeEach(() => {
    sent = [];
    setSenderForTests(async (message) => sent.push(message));
    resetAlertsForTests();
    Object.assign(process.env, {
      ALERT_EMAIL: "me@example.com",
      BREVO_API_KEY: "test-key",
      MAIL_FROM: "noreply@example.com",
    });
  });
  afterEach(() => {
    setSenderForTests(null);
    for (const k of ["ALERT_EMAIL", "BREVO_API_KEY", "MAIL_FROM", "ALERT_EVERY_MINUTES"]) delete process.env[k];
  });

  // A tiny app with the real error handler and a route that breaks.
  function brokenApp() {
    const app = express();
    app.get("/api/public/bookings/:token", () => {
      throw new Error("database exploded");
    });
    app.get("/api/fine", (req, res) => res.status(400).json({ message: "bad input" }));
    app.use(errorHandler);
    return app;
  }
  // The alert goes out in the background (after a database step: the daily email budget, H-2).
  // Waits until an email arrived, or ~0.5 s - long enough to be sure none is coming.
  const flush = async () => {
    for (let i = 0; i < 25 && !sent.length; i++) await new Promise((resolve) => setTimeout(resolve, 20));
  };
  const quietConsole = () => jest.spyOn(console, "error").mockImplementation(() => {});

  test("a 500 sends one email with the route pattern, never the real address (it holds a token)", async () => {
    const spy = quietConsole();
    const res = await request(brokenApp()).get("/api/public/bookings/SECRET-TOKEN-123").expect(500);
    await flush();
    spy.mockRestore();

    expect(res.body.message).toBe("Something went wrong");
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual([{ email: "me@example.com" }]);
    expect(sent[0].subject).toContain("GET /api/public/bookings/:token");
    expect(sent[0].htmlContent).toContain("database exploded");
    expect(JSON.stringify(sent[0])).not.toContain("SECRET-TOKEN-123");
  });

  test("client mistakes (4xx) send nothing", async () => {
    await request(brokenApp()).get("/api/fine").expect(400);
    await flush();
    expect(sent).toHaveLength(0);
  });

  test("at most one email per ALERT_EVERY_MINUTES; the next one counts the skipped ones", async () => {
    const err = new Error("again");
    const start = Date.now();
    const clock = jest.spyOn(Date, "now").mockReturnValue(start);
    try {
      expect(await reportError(err, "job")).toBe(true);
      expect(await reportError(err, "job")).toBe(false);
      expect(await reportError(err, "job")).toBe(false);
      expect(sent).toHaveLength(1);

      clock.mockReturnValue(start + 16 * 60 * 1000); // default is 15 minutes
      expect(await reportError(err, "job")).toBe(true);
      expect(sent).toHaveLength(2);
      expect(sent[1].htmlContent).toContain("2 more error(s)");

      process.env.ALERT_EVERY_MINUTES = "60";
      clock.mockReturnValue(start + 40 * 60 * 1000);
      expect(await reportError(err, "job")).toBe(false);
    } finally {
      clock.mockRestore();
    }
  });

  test("off without ALERT_EMAIL or without Brevo; a failing send never throws", async () => {
    delete process.env.ALERT_EMAIL;
    expect(await reportError(new Error("x"), "job")).toBe(false);
    process.env.ALERT_EMAIL = "me@example.com";
    delete process.env.BREVO_API_KEY;
    expect(await reportError(new Error("x"), "job")).toBe(false);

    process.env.BREVO_API_KEY = "test-key";
    setSenderForTests(async () => {
      throw new Error("Brevo is down");
    });
    const spy = quietConsole();
    await expect(reportError(new Error("x"), "job")).resolves.toBe(false);
    spy.mockRestore();
  });

  test("whereOf names the route pattern, or says it broke before any route", () => {
    expect(whereOf({ method: "PATCH", baseUrl: "/api/appointments", route: { path: "/:id/status" } })).toBe(
      "PATCH /api/appointments/:id/status",
    );
    expect(whereOf({ method: "GET", baseUrl: "" })).toBe("GET (before the route)");
    expect(whereOf({ method: "POST", baseUrl: "/api/auth" })).toBe("POST /api/auth (before the route)");
    expect(whereOf(undefined)).toBe("unknown");
  });
});
