import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { isCrossSite } from "./proxy";

// Security review C-04: changes sent from another website's page are refused.
const req = (method: string, headers: Record<string, string> = {}) =>
  new NextRequest("https://salon.example.com/api/auth/login", {
    method,
    headers: { host: "salon.example.com", ...headers },
  });

describe("isCrossSite (CSRF guard)", () => {
  afterEach(() => {
    delete process.env.CSRF_CHECK;
  });

  it("lets reads through, and changes from our own pages or from no page at all", () => {
    expect(isCrossSite(req("GET", { origin: "https://evil.example" }))).toBe(false);
    expect(isCrossSite(req("POST", { origin: "https://salon.example.com" }))).toBe(false);
    expect(isCrossSite(req("POST"))).toBe(false); // curl, apps: no Origin header
  });

  it("refuses changes from another site, a sandboxed page, or a cross-site fetch", () => {
    expect(isCrossSite(req("POST", { origin: "https://evil.example" }))).toBe(true);
    expect(isCrossSite(req("DELETE", { origin: "https://salon.example.com.evil.example" }))).toBe(true);
    expect(isCrossSite(req("PATCH", { origin: "null" }))).toBe(true);
    expect(isCrossSite(req("POST", { "sec-fetch-site": "cross-site" }))).toBe(true);
  });

  it("CSRF_CHECK=off turns it off", () => {
    process.env.CSRF_CHECK = "off";
    expect(isCrossSite(req("POST", { origin: "https://evil.example" }))).toBe(false);
  });
});
