// Local time -> UTC on the days the clocks change (no database needed).
const { localToDate } = require("../src/utils/time");

// What a wall clock in `timeZone` shows at this moment, as "YYYY-MM-DD HH:mm".
const wallClock = (date, timeZone) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
};

// Every quarter hour of the day, except the hour skipped when clocks go forward.
const quarterHours = (skip = []) =>
  Array.from(
    { length: 96 },
    (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`,
  ).filter((hhmm) => !skip.includes(hhmm.slice(0, 2)));

describe("localToDate across daylight-saving changes", () => {
  test.each([
    ["Asia/Hebron", "2026-10-24"], // clocks go back
    ["Asia/Hebron", "2026-03-28", ["02"]], // clocks go forward: 02:00-02:59 doesn't exist
    ["Europe/London", "2026-10-25"],
    ["Europe/London", "2026-03-29", ["01"]],
    ["America/New_York", "2026-11-01"],
    ["America/New_York", "2026-03-08", ["02"]],
    ["Asia/Hebron", "2026-07-01"], // an ordinary day
    ["Asia/Riyadh", "2026-03-28"], // no DST at all
  ])("%s on %s: every time maps back to the same wall-clock time", (timeZone, day, skip = []) => {
    for (const hhmm of quarterHours(skip)) {
      expect(wallClock(localToDate(day, hhmm, timeZone), timeZone)).toBe(`${day} ${hhmm}`);
    }
  });

  test("midnight on the day clocks go back is the real start of the day", () => {
    // Palestine, 24 Oct 2026: 00:00 is still summer time (UTC+3) -> 21:00 UTC the day before.
    expect(localToDate("2026-10-24", "00:00", "Asia/Hebron").toISOString()).toBe("2026-10-23T21:00:00.000Z");
    // and on the day clocks go forward, 00:00 is still winter time (UTC+2).
    expect(localToDate("2026-03-28", "00:00", "Asia/Hebron").toISOString()).toBe("2026-03-27T22:00:00.000Z");
  });

  test("a skipped time moves to just after the jump", () => {
    expect(wallClock(localToDate("2026-03-28", "02:30", "Asia/Hebron"), "Asia/Hebron")).toBe("2026-03-28 03:30");
  });
});
