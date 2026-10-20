import type { Metadata } from "next";

// The page itself is a client component, so its <head> settings live here.
// A private link must never show up in Google - and must not leak to other sites
// through the Referer header if the guest clicks an outside link.
export const metadata: Metadata = {
  title: "Your booking - BookFlow",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function BookingLinkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
