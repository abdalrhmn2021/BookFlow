import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { contentSecurityPolicy, isCrossSite, proxy } from "./proxy";

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

// Content-Security-Policy on pages: a new nonce per answer, scripts without it don't run.
describe("page Content-Security-Policy", () => {
  const page = (path = "/login") =>
    new NextRequest(`https://salon.example.com${path}`, { headers: { host: "salon.example.com" } });

  afterEach(() => {
    delete process.env.CSP;
  });

  it("allows only nonced scripts (and what they load), never eval in production", () => {
    const csp = contentSecurityPolicy("abc123", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("frame-src https://challenges.cloudflare.com");
  });

  it("sends a different nonce on each page, and passes it to Next.js", () => {
    const a = proxy(page()).headers.get("content-security-policy") || "";
    const b = proxy(page()).headers.get("content-security-policy") || "";
    const nonceOf = (csp: string) => csp.match(/'nonce-([^']+)'/)?.[1];
    expect(nonceOf(a)).toBeTruthy();
    expect(nonceOf(a)).not.toBe(nonceOf(b));
  });

  it("CSP=report-only only reports, CSP=off keeps the basic rules", () => {
    process.env.CSP = "report-only";
    const r = proxy(page());
    expect(r.headers.get("content-security-policy-report-only")).toContain("'strict-dynamic'");
    expect(r.headers.get("content-security-policy")).not.toContain("script-src");

    process.env.CSP = "off";
    const o = proxy(page());
    expect(o.headers.get("content-security-policy")).toBe(
      "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
    );
  });
});
