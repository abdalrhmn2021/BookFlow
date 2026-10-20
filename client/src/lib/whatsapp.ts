const DEFAULT_COUNTRY_CODE = "970";

export function toWhatsAppNumber(phone: string | undefined | null, countryCode = DEFAULT_COUNTRY_CODE): string | null {
  if (!phone) return null;
  let n = phone.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[^\d+]/g, "");

  if (n.startsWith("+")) n = n.slice(1);
  else if (n.startsWith("00")) n = n.slice(2);
  else if (n.startsWith("0")) n = countryCode + n.slice(1);
  else return null;

  return /^\d{8,15}$/.test(n) ? n : null;
}

export function whatsAppLink(number: string, message: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
