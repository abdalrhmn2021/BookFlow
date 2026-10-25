// Who can be booked at a business: every active staff member, plus an owner who switched on
// "I take bookings too" (User.bookable). Used by booking, rescheduling, free slots and the
// public business page, so they all agree on the same list.
const BOOKABLE_ROLE = { $or: [{ role: "staff" }, { role: "owner", bookable: true }] };

const bookableFilter = (tenantId, extra = {}) => ({ tenantId, isActive: true, ...BOOKABLE_ROLE, ...extra });

module.exports = { bookableFilter };
