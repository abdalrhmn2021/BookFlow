import type { Metadata } from "next";
import { BRAND_NAME } from "@/lib/edition";

export const metadata: Metadata = {
  title: `Your booking - ${BRAND_NAME}`,
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function BookingLinkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
