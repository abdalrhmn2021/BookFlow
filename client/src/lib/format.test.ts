import { describe, expect, it } from "vitest";
import { addDays, dayNameOf, formatDuration, formatPrice } from "./format";

describe("calendar days", () => {
  it("adds days across months, years and leap days", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("names the weekday of a date, whatever the computer's timezone", () => {
    expect(dayNameOf("2026-11-20")).toBe("friday");
    expect(dayNameOf("2026-11-22")).toBe("sunday");
  });
});

describe("formatting", () => {
  it("splits minutes into hours and minutes for the wording", () => {
    expect(formatDuration(90, (h, m) => `${h}h ${m}m`)).toBe("1h 30m");
    expect(formatDuration(15, (h, m) => `${h}h ${m}m`)).toBe("0h 15m");
  });

  it("shows the price with the currency", () => {
    expect(formatPrice(50)).toBe("50 ₪");
  });
});
