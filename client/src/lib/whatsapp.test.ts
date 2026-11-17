import { describe, expect, it } from "vitest";
import { toWhatsAppNumber, whatsAppLink } from "./whatsapp";

describe("toWhatsAppNumber", () => {
  it("turns local, +, 00 and Arabic-digit numbers into one international number", () => {
    expect(toWhatsAppNumber("0599 123 456")).toBe("970599123456");
    expect(toWhatsAppNumber("+970599123456")).toBe("970599123456");
    expect(toWhatsAppNumber("00970-599-123-456")).toBe("970599123456");
    expect(toWhatsAppNumber("٠٥٩٩١٢٣٤٥٦")).toBe("970599123456");
    expect(toWhatsAppNumber("0599123456", "20")).toBe("20599123456");
  });

  it("gives null for missing, unknown or impossible numbers", () => {
    expect(toWhatsAppNumber(undefined)).toBeNull();
    expect(toWhatsAppNumber("")).toBeNull();
    expect(toWhatsAppNumber("599123456")).toBeNull(); // no 0, +, or 00 in front
    expect(toWhatsAppNumber("+12")).toBeNull();
  });
});

describe("whatsAppLink", () => {
  // The dashboard puts this straight into href, so it must always be a wa.me link.
  it("is always https://wa.me/<digits> with the message encoded", () => {
    const link = whatsAppLink("970599123456", 'Hi & "bye" <script>');
    expect(link.startsWith("https://wa.me/970599123456?text=")).toBe(true);
    expect(link).not.toMatch(/[<>"\s]/);
    expect(decodeURIComponent(link.split("?text=")[1])).toBe('Hi & "bye" <script>');
  });
});
