const { toMinutes, toHHMM, dayNameOf } = require("./time");

// A staff member's working hours on one date = the business's hours for that day,
// narrowed by the staff member's own week (if they have one) and their days off.
//   business 09:00-17:00 + staff 12:00-20:00  ->  12:00-17:00
// Returns { isOpen: false } or { isOpen: true, open: "HH:mm", close: "HH:mm" }.
function staffDayHours(tenant, staff, date) {
  const dayName = dayNameOf(date);
  const business = tenant.workingHours.find((d) => d.day === dayName);
  if (!business || !business.isOpen) return { isOpen: false, why: "business" };

  if (staff?.daysOff?.includes(date)) return { isOpen: false, why: "staff" };

  const own = staff?.workingHours?.length ? staff.workingHours.find((d) => d.day === dayName) : null;
  if (!own) return { isOpen: true, open: business.open, close: business.close };
  if (!own.isOpen) return { isOpen: false, why: "staff" };

  const open = Math.max(toMinutes(business.open), toMinutes(own.open));
  const close = Math.min(toMinutes(business.close), toMinutes(own.close));
  if (close <= open) return { isOpen: false, why: "staff" };
  return { isOpen: true, open: toHHMM(open), close: toHHMM(close) };
}

// No list = does every service (the default, and how every staff member started).
function offersService(staff, serviceId) {
  if (!staff?.services?.length) return true;
  return staff.services.some((id) => String(id) === String(serviceId));
}

module.exports = { staffDayHours, offersService };
