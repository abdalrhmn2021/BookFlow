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

module.exports = { normalizePhone, PHONE_REGEX };
