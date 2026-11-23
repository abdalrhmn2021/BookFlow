// Arabic/Persian digits -> 0-9, spaces/dashes/brackets removed, 00 -> +.
function normalizePhone(raw) {
  if (typeof raw !== "string") return "";
  let phone = raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\s\-().]/g, "");
  if (phone.startsWith("00")) phone = "+" + phone.slice(2);
  return phone;
}

const PHONE_REGEX = /^\+?\d{7,15}$/;

// One key per real phone number, however it was typed: "0599 123 456", "+970599123456",
// "00970599123456" and "970599123456" are all "970599123456". Used to count a guest's bookings,
// so typing the same number differently doesn't get around the limit.
// The country code used for local numbers (0599...) at a business: its own, else the server's
// WHATSAPP_DEFAULT_COUNTRY_CODE, else 970. The dashboard gets the same value (tenant.controller),
// so its WhatsApp buttons and the automatic reminders agree on the number (security review M-3).
const countryCodeFor = (countryCode) =>
  String(countryCode || process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || "970").replace(/\D/g, "");

function phoneKey(raw, countryCode) {
  const phone = normalizePhone(raw);
  if (!phone) return "";
  const code = countryCodeFor(countryCode);
  if (phone.startsWith("+")) return phone.slice(1);
  if (phone.startsWith("0")) return code + phone.slice(1);
  return phone;
}

module.exports = { normalizePhone, phoneKey, countryCodeFor, PHONE_REGEX };
