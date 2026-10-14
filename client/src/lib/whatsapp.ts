// WhatsApp "click to chat" links: https://wa.me/<number>?text=<message>
// Opens WhatsApp (app on a phone, WhatsApp Web on a computer) with the message ready -
// the business just presses Send. No API, no account, no cost.

// wa.me needs the FULL international number: digits only, no "+", no leading 0.
// Local numbers like "0599123456" are missing the country code, so we add this one.
// Selling to a business in another country? Change it here, in ONE place
// (Palestine 970, Jordan 962, Saudi Arabia 966, UK 44, ...).
export const DEFAULT_COUNTRY_CODE = "970";

// "0599 123-456" -> "970599123456"
// "+970599123456" / "00970599123456" -> "970599123456"
// Returns null when it can't be a real phone number (then we hide the button).
export function toWhatsAppNumber(phone: string | undefined | null, countryCode = DEFAULT_COUNTRY_CODE): string | null {
  if (!phone) return null;
  // Arabic-Indic digits (٠-٩) -> 0-9, then drop everything that isn't a digit or "+"
  let n = phone.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[^\d+]/g, "");

  if (n.startsWith("+")) n = n.slice(1); // +970... -> 970...
  else if (n.startsWith("00")) n = n.slice(2); // 00970... -> 970...
  else if (n.startsWith("0")) n = countryCode + n.slice(1); // 0599... -> 970599...
  else return null; // no country code and no leading 0 - we can't know the country

  // E.164: at most 15 digits; shorter than 8 is not a real mobile number
  return /^\d{8,15}$/.test(n) ? n : null;
}

// The full link. encodeURIComponent keeps Arabic text, spaces and new lines safe inside a URL.
export function whatsAppLink(number: string, message: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
