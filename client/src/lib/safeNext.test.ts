import { describe, expect, it } from "vitest";
import { safeNext } from "./safeNext";

// Security review A-02: ?next= after login must never send the visitor to another site.
describe("safeNext", () => {
  it("keeps a page of this site, with its query and hash", () => {
    expect(safeNext("/dashboard")).toBe("/dashboard");
    expect(safeNext("/book/demo-salon?service=1#time")).toBe("/book/demo-salon?service=1#time");
  });

  it("refuses nothing, other sites and things that only look like a path", () => {
    for (const bad of [
      null,
      "",
      "dashboard",
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "/\t/evil.com",
      "/\n/evil.com",
      "javascript:alert(1)",
    ]) {
      expect(safeNext(bad)).toBeNull();
    }
  });
});
