// No database needed: how a staff member's day is worked out.
const { staffDayHours, offersService } = require("../src/utils/staffSchedule");

const week = (open, close, closedDay = "friday") =>
  ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].map((day) =>
    day === closedDay ? { day, isOpen: false } : { day, isOpen: true, open, close },
  );
const tenant = { workingHours: week("09:00", "17:00") };
const MONDAY = "2026-11-02";
const FRIDAY = "2026-11-06";

describe("staffDayHours", () => {
  test("no own hours = the business's hours", () => {
    expect(staffDayHours(tenant, {}, MONDAY)).toMatchObject({ isOpen: true, open: "09:00", close: "17:00" });
  });

  test("own hours are narrowed to the business's, never widened", () => {
    const staff = { workingHours: week("12:00", "20:00") };
    expect(staffDayHours(tenant, staff, MONDAY)).toMatchObject({ isOpen: true, open: "12:00", close: "17:00" });
  });

  test("closed when the business is, on the staff member's day off, or their own closed day", () => {
    expect(staffDayHours(tenant, {}, FRIDAY).isOpen).toBe(false);
    expect(staffDayHours(tenant, { daysOff: [MONDAY] }, MONDAY).isOpen).toBe(false);
    expect(staffDayHours(tenant, { workingHours: week("09:00", "17:00", "monday") }, MONDAY).isOpen).toBe(false);
    // Own hours that don't overlap the business's at all.
    expect(staffDayHours(tenant, { workingHours: week("18:00", "22:00") }, MONDAY).isOpen).toBe(false);
  });
});

describe("offersService", () => {
  test("no list = every service; a list = only those", () => {
    expect(offersService({}, "a")).toBe(true);
    expect(offersService({ services: [] }, "a")).toBe(true);
    expect(offersService({ services: ["a"] }, "a")).toBe(true);
    expect(offersService({ services: ["a"] }, "b")).toBe(false);
  });
});
