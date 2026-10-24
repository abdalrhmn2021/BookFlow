import type { Metadata } from "next";

// The token in the URL is a key to the account: keep the page out of search engines and
// don't send the URL to other sites as a referrer.
export const metadata: Metadata = {
  title: "Reset password",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
