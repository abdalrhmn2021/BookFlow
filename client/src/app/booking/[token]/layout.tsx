import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your booking - BookFlow",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function BookingLinkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
