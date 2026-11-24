// protect (auth.middleware.js) tells "you are not logged in" apart from "the server broke":
// a bad, expired or unknown token is 401, a disabled account 403, but a database failure is a
// server error (500, through the error handler and its alert) - and in no case does the route run.
const express = require("express");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const h = require("./helpers");
const User = require("../src/models/User");
const RevokedToken = require("../src/models/RevokedToken");
const { protect } = require("../src/middlewares/auth.middleware");
const { errorHandler } = require("../src/middlewares/error.middleware");

beforeAll(h.connect);
afterEach(async () => {
  jest.restoreAllMocks();
  await h.clear();
});
afterAll(h.disconnect);

// A tiny app with protect in front of a handler we can watch, and the real error handler behind it.
function guardedApp() {
  const handler = jest.fn((req, res) => res.json({ ok: true }));
  const app = express();
  app.get("/guarded", protect, handler);
  app.use(errorHandler);
  return { app, handler };
}

const sign = (payload, options = {}) => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h", ...options });

async function customerToken() {
  const user = await h.makeCustomer("maya");
  return { user, token: h.tokenFor(user) };
}

test("a valid token reaches the route", async () => {
  const { app, handler } = guardedApp();
  const { token } = await customerToken();
  await request(app).get("/guarded").set("Authorization", `Bearer ${token}`).expect(200);
  expect(handler).toHaveBeenCalledTimes(1);
});

describe("401 - not logged in", () => {
  test("no token", async () => {
    const { app, handler } = guardedApp();
    const res = await request(app).get("/guarded").expect(401);
    expect(res.body.message).toBe("Not authorized, no token");
    expect(handler).not.toHaveBeenCalled();
  });

  test("a token signed with another secret", async () => {
    const { app, handler } = guardedApp();
    const { user } = await customerToken();
    const forged = jwt.sign({ id: user._id }, "some-other-secret-".padEnd(64, "y"));
    const res = await request(app).get("/guarded").set("Authorization", `Bearer ${forged}`).expect(401);
    expect(res.body.message).toBe("Not authorized, invalid token");
    expect(handler).not.toHaveBeenCalled();
  });

  test("an expired token", async () => {
    const { app, handler } = guardedApp();
    const { user } = await customerToken();
    const expired = sign({ id: user._id }, { expiresIn: -10 });
    const res = await request(app).get("/guarded").set("Authorization", `Bearer ${expired}`).expect(401);
    expect(res.body.message).toBe("Not authorized, invalid token");
    expect(handler).not.toHaveBeenCalled();
  });

  test("garbage instead of a token, and a malformed cookie", async () => {
    const { app, handler } = guardedApp();
    await request(app).get("/guarded").set("Authorization", "Bearer not.a.jwt").expect(401);
    await request(app).get("/guarded").set("Cookie", "bookflow_token=%E0%A4%A").expect(401);
    expect(handler).not.toHaveBeenCalled();
  });

  test("a validly signed token without a proper user id", async () => {
    const { app, handler } = guardedApp();
    const odd = sign({ id: { $ne: null } });
    const res = await request(app).get("/guarded").set("Authorization", `Bearer ${odd}`).expect(401);
    expect(res.body.message).toBe("Not authorized, invalid token");
    expect(handler).not.toHaveBeenCalled();
  });

  test("a user who no longer exists", async () => {
    const { app, handler } = guardedApp();
    const { user, token } = await customerToken();
    await User.deleteOne({ _id: user._id });
    const res = await request(app).get("/guarded").set("Authorization", `Bearer ${token}`).expect(401);
    expect(res.body.message).toBe("User no longer exists");
    expect(handler).not.toHaveBeenCalled();
  });
});

test("a disabled account is 403", async () => {
  const { app, handler } = guardedApp();
  const { user, token } = await customerToken();
  await User.updateOne({ _id: user._id }, { isActive: false });
  const res = await request(app).get("/guarded").set("Authorization", `Bearer ${token}`).expect(403);
  expect(res.body.message).toBe("Account is disabled");
  expect(handler).not.toHaveBeenCalled();
});

describe("500 - the server failed, not the login", () => {
  // The error handler logs every 500; keep the test output clean.
  beforeEach(() => jest.spyOn(console, "error").mockImplementation(() => {}));

  test("the user lookup fails", async () => {
    const { app, handler } = guardedApp();
    const { token } = await customerToken();
    jest.spyOn(User, "findById").mockRejectedValueOnce(new Error("connection pool closed: secret-host:27017"));

    const res = await request(app).get("/guarded").set("Authorization", `Bearer ${token}`).expect(500);
    // The generic answer only: nothing about the database leaks to the visitor.
    expect(res.body).toEqual({ message: "Something went wrong" });
    expect(handler).not.toHaveBeenCalled();
  });

  test("the revoked-token check fails", async () => {
    const { app, handler } = guardedApp();
    const { user } = await customerToken();
    const token = sign({ id: user._id }, { jwtid: "a-token-id" });
    jest.spyOn(RevokedToken, "exists").mockRejectedValueOnce(new Error("server selection timed out"));

    const res = await request(app).get("/guarded").set("Authorization", `Bearer ${token}`).expect(500);
    expect(res.body).toEqual({ message: "Something went wrong" });
    expect(handler).not.toHaveBeenCalled();
  });

  test("on the real app too: /api/auth/me answers 500, not 401", async () => {
    const { token } = await customerToken();
    jest.spyOn(User, "findById").mockRejectedValueOnce(new Error("db down"));
    const res = await request(h.app).get("/api/auth/me").set("Authorization", `Bearer ${token}`).expect(500);
    expect(res.body).toEqual({ message: "Something went wrong" });
  });
});
