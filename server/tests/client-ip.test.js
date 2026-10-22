const express = require("express");
const request = require("supertest");
const { clientIp, IP_HEADER, SECRET_HEADER } = require("../src/utils/clientIp");
const { loginLimiter } = require("../src/middlewares/rateLimit.middleware");

const SECRET = "s".repeat(64);

// A tiny app: no database needed, only the IP logic and a real limiter.
const app = express();
app.get("/ip", (req, res) => res.json({ ip: clientIp(req) }));
app.post("/login", loginLimiter, (req, res) => res.status(401).json({ message: "Invalid credentials" }));

const viaSite = (req, ip) => req.set(IP_HEADER, ip).set(SECRET_HEADER, SECRET);

beforeEach(() => {
  process.env.PROXY_SECRET = SECRET;
});
afterAll(() => {
  delete process.env.PROXY_SECRET;
});

describe("clientIp", () => {
  test("uses the visitor's IP sent by the site with the right secret", async () => {
    const res = await viaSite(request(app).get("/ip"), "203.0.113.7").expect(200);
    expect(res.body.ip).toBe("203.0.113.7");
  });

  test("ignores the header when the secret is wrong or missing", async () => {
    const wrong = await request(app).get("/ip").set(IP_HEADER, "203.0.113.7").set(SECRET_HEADER, "guess");
    const missing = await request(app).get("/ip").set(IP_HEADER, "203.0.113.7");
    expect(wrong.body.ip).not.toBe("203.0.113.7");
    expect(missing.body.ip).not.toBe("203.0.113.7");
  });

  test("ignores the header when the server has no PROXY_SECRET", async () => {
    delete process.env.PROXY_SECRET;
    const res = await viaSite(request(app).get("/ip"), "203.0.113.7");
    expect(res.body.ip).not.toBe("203.0.113.7");
  });

  test("ignores a value that is not an IP address", async () => {
    const res = await viaSite(request(app).get("/ip"), "not-an-ip");
    expect(res.body.ip).not.toBe("not-an-ip");
  });
});

describe("rate limits count each visitor separately", () => {
  test("5 failed logins block that visitor only", async () => {
    for (let i = 0; i < 5; i++) {
      await viaSite(request(app).post("/login"), "198.51.100.1").expect(401);
    }
    await viaSite(request(app).post("/login"), "198.51.100.1").expect(429);

    // Another visitor behind the same Vercel server can still try.
    await viaSite(request(app).post("/login"), "198.51.100.2").expect(401);
  });

  test("a direct caller can't dodge the limit by changing the header", async () => {
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/login")
        .set(IP_HEADER, `192.0.2.${i + 1}`)
        .expect(401);
    }
    // No secret -> every request counted on the caller's real address -> blocked.
    await request(app).post("/login").set(IP_HEADER, "192.0.2.99").expect(429);
  });
});
