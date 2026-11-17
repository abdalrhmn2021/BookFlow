import { expect, test } from "@playwright/test";

// The protections from the security review, checked on the running site.

test("pages can't be put in another site's frame (F-01)", async ({ request }) => {
  for (const path of ["/", "/login", "/dashboard", "/book/demo-salon"]) {
    const res = await request.get(path);
    expect(res.headers()["x-frame-options"], path).toBe("DENY");
    expect(res.headers()["content-security-policy"], path).toContain("frame-ancestors 'none'");
    expect(res.headers()["x-content-type-options"], path).toBe("nosniff");
    expect(res.headers()["x-powered-by"], path).toBeUndefined();
  }
});

test("a change sent from another website is refused (C-04)", async ({ request }) => {
  const res = await request.post("/api/auth/login", {
    headers: { origin: "https://evil.example" },
    data: { email: "owner@demo.com", password: "password123" },
  });
  expect(res.status()).toBe(403);
  expect((await res.json()).message).toBe("Forbidden origin");
});

test("the API answers its health check (ops)", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ status: "ok" });
});
